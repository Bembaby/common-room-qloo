import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { FixtureAdapter, fixture } from '../src/fixtures.js';
import { WorkflowBudget } from '../src/budget.js';
import { AppError } from '../src/errors.js';

async function serve(options, action) {
  const app = createApp(options);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try { await action(`http://127.0.0.1:${app.address().port}`); }
  finally { await new Promise(resolve => app.close(resolve)); }
}
const post = (base, body, extra = {}) => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('an asynchronous hosted quota failure stops before any provider adapter is constructed', async () => {
  let adapters = 0;
  await serve({ env: { APP_MODE: 'live', VERCEL: '1' }, adapterFactory: () => { adapters++; }, budgetFactory: () => ({ beginPlan: async () => { await Promise.resolve(); throw new AppError('BUDGET_STORAGE', 'Storage is unavailable.', 503); } }) }, async base => {
    const response = await post(base, fixture.input);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'BUDGET_STORAGE');
    assert.equal(adapters, 0);
  });
});

test('two-circle planning reserves its complete 15-workflow maximum when only 16 slots remain', async () => {
  const input = structuredClone(fixture.input);
  input.circles = input.circles.slice(0, 2);
  input.minimumCoverage = 95;
  let reserved, used = 0;
  await serve({ env: { APP_MODE: 'live' }, adapterFactory: brief => new FixtureAdapter(brief), budgetFactory: () => ({
    beginPlan: async count => {
      assert.ok(count <= 16);
      reserved = count;
      return { consume: async () => { assert.ok(++used <= reserved); }, release: async () => {} };
    }
  }) }, async base => {
    const response = await post(base, input);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(reserved, 15);
    assert.equal(result.budget.workflowLimit, 15);
    assert.equal(result.decision.refined, true);
    assert.equal(used, result.budget.workflowCount);
    assert.ok(used <= 15);
    assert.equal(result.mode, 'fixture');
  });
});

test('three-circle reservations remain 22 and a lower configured ceiling still stops visibly', async () => {
  for (const configured of [undefined, '10']) {
    let reserved, used = 0;
    await serve({ env: { APP_MODE: 'live', QLOO_MAX_WORKFLOWS: configured }, adapterFactory: brief => new FixtureAdapter(brief), budgetFactory: () => ({
      beginPlan: async count => { reserved = count; return { consume: async () => { used++; }, release: async () => {} }; }
    }) }, async base => {
      const response = await post(base, fixture.input);
      const result = await response.json();
      assert.equal(reserved, configured ? 10 : 22);
      assert.ok(used <= reserved);
      if (configured) {
        assert.equal(response.status, 429);
        assert.equal(result.error.code, 'WORKFLOW_BUDGET');
        assert.equal(result.program, undefined);
      } else assert.equal(response.status, 200);
    });
  }
});

test('HTTP app returns a complete plan and exposes no credential in config or health', async () => {
  await serve({ env: { APP_MODE: 'fixture', QLOO_API_KEY: 'do-not-emit-this-secret' } }, async base => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.project, 'common-room');
    assert.equal(health.mode, 'fixture');
    const config = await (await fetch(`${base}/api/config`)).text();
    assert.ok(!config.includes('do-not-emit-this-secret'));
    const response = await post(base, fixture.input);
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.status, 'ready');
    assert.equal(value.mode, 'fixture');
    const page = await fetch(base);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  });
});

test('public mode rejects an access code in both local and function entrypoints', () => {
  assert.throws(() => createApp({ env: { APP_MODE: 'fixture', PUBLIC_DEMO: 'true', APP_ACCESS_CODE: 'private' } }), /empty APP_ACCESS_CODE/);
});

test('the local walkthrough supports video seeking and rejects invalid byte ranges without exposing private files', async () => {
  await serve({ env: { APP_MODE: 'fixture' } }, async base => {
    assert.equal((await fetch(base + '/demo.html')).status, 200);
    const head = await fetch(base + '/media/common-room-demo.mp4', { method: 'HEAD' });
    assert.equal(head.status, 200);
    const size = Number(head.headers.get('content-length'));
    assert.ok(size > 1000);
    const partial = await fetch(base + '/media/common-room-demo.mp4', { headers: { Range: 'bytes=0-31' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 0-31/${size}`);
    const bytes = Buffer.from(await partial.arrayBuffer());
    assert.equal(bytes.length, 32);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    const suffix = await fetch(base + '/media/common-room-demo.mp4', { headers: { Range: 'bytes=-16' } });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 16);
    for (const range of ['bytes=-0', 'bytes=9-2', `bytes=${size}-`, 'bytes=0-2,4-6', 'bytes=bad']) {
      assert.equal((await fetch(base + '/media/common-room-demo.mp4', { headers: { Range: range } })).status, 416);
    }
    assert.equal((await fetch(base + '/media/owner-authorization-private.json')).status, 404);
    assert.equal((await fetch(base + '/.data/media/credit-ledger.json')).status, 404);
  });
});

test('missing event credential never spends a hosted quota reservation', async () => {
  let reservations = 0;
  await serve({ env: { APP_MODE: 'live' }, budgetFactory: () => ({ beginPlan: async () => { reservations++; } }) }, async base => {
    const response = await post(base, fixture.input);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'QLOO_CREDENTIAL_REQUIRED');
    assert.equal(reservations, 0);
  });
});

test('hosted lease is released before either terminal response is sent', async () => {
  for (const fail of [false, true]) {
    let released = false;
    const adapter = new FixtureAdapter(fixture.input);
    if (fail) adapter.recommend = async () => { throw new AppError('QLOO_TIMEOUT', 'Injected timeout.', 504); };
    await serve({ env: { APP_MODE: 'live' }, adapterFactory: () => adapter, budgetFactory: () => ({ beginPlan: async () => ({ consume: async () => {}, release: async () => { await new Promise(resolve => setTimeout(resolve, 20)); released = true; } }) }) }, async base => {
      const response = await post(base, fixture.input);
      await response.json();
      assert.equal(released, true);
    });
  }
});

test('streaming endpoint emits actual trace events followed by exactly one result', async () => {
  await serve({ env: { APP_MODE: 'fixture' } }, async base => {
    const response = await fetch(`${base}/api/plan/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture.input) });
    const records = (await response.text()).trim().split('\n').map(JSON.parse);
    assert.equal(records.at(-1).type, 'result');
    assert.equal(records.filter(record => record.type === 'result').length, 1);
    assert.ok(records.filter(record => record.type === 'trace').length > 30);
  });
});

test('HTTP rejects hostile origins, malformed content, oversize requests, and missing private development code', async () => {
  await serve({ env: { APP_MODE: 'fixture', APP_ACCESS_CODE: 'test-code' } }, async base => {
    assert.equal((await post(base, fixture.input)).status, 401);
    assert.equal((await post(base, fixture.input, { 'X-Common-Room-Code': 'test-code', Origin: 'https://wrong.example' })).status, 403);
    assert.equal((await post(base, {}, { 'X-Common-Room-Code': 'test-code' })).status, 400);
    assert.equal((await post(base, { venue: 'x'.repeat(17_000) }, { 'X-Common-Room-Code': 'test-code' })).status, 413);
    const response = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'X-Common-Room-Code': 'test-code', 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(response.status, 415);
  });
});

test('a live credential failure remains a visible error with no fixture result', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'common-room-auth-'));
  try {
    await serve({ env: { APP_MODE: 'live', QLOO_BUDGET_FILE: join(temp, 'budget.json') } }, async base => {
      const response = await post(base, fixture.input);
      const value = await response.json();
      assert.equal(response.status, 503);
      assert.equal(value.error.code, 'QLOO_CREDENTIAL_REQUIRED');
      assert.equal(value.program, undefined);
      assert.equal(value.mode, undefined);
    });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('persistent shared budget refuses excess workflows and survives constructing a new ledger', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'common-room-budget-'));
  const path = join(temp, 'budget.json');
  let now = 4_000_000;
  try {
    const ledger = new WorkflowBudget({ path, limit: 2, now: () => now });
    ledger.ensureAvailable(2);
    ledger.consume();
    new WorkflowBudget({ path, limit: 2, now: () => now }).consume();
    assert.throws(() => ledger.consume(), { code: 'GLOBAL_WORKFLOW_LIMIT' });
    now += 3_600_001;
    ledger.ensureAvailable(2);
    ledger.consume();
    await writeFile(path, 'corrupt');
    assert.throws(() => ledger.ensureAvailable(1), { code: 'BUDGET_STORAGE' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('public live path needs no access code and applies its global workflow cap before a new plan', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'common-room-public-'));
  // This is an injected test double. It never calls Qloo or supplies live evidence.
  const factory = input => {
    const adapter = new FixtureAdapter(input);
    const original = adapter.run.bind(adapter);
    adapter.mode = 'live';
    adapter.run = async (...args) => { const value = await original(...args); value.provenance.mode = 'live'; return value; };
    return adapter;
  };
  try {
    await serve({ env: { APP_MODE: 'live', PUBLIC_DEMO: 'true', QLOO_MAX_WORKFLOWS_PER_HOUR: '22', QLOO_BUDGET_FILE: join(temp, 'budget.json') }, adapterFactory: factory }, async base => {
      const config = await (await fetch(`${base}/api/config`)).json();
      assert.equal(config.accessCodeRequired, false);
      assert.equal((await post(base, fixture.input)).status, 200);
      const second = await post(base, fixture.input);
      assert.equal(second.status, 429);
      assert.equal((await second.json()).error.code, 'GLOBAL_WORKFLOW_LIMIT');
    });
  } finally { await rm(temp, { recursive: true, force: true }); }
});
