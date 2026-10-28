import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { BlobWorkflowBudget, emptyQuota } from '../src/blob-budget.js';
import { createApp } from '../src/server.js';

// An injected conditional-write store, never live provider evidence.
function memoryStore(initial = emptyQuota()) {
  let text = initial === null ? null : JSON.stringify(initial);
  let revision = 1;
  let failAfterWrite = false;
  const client = {
    get: async (_path, options) => {
      assert.equal(options.useCache, false);
      if (text === null) return null;
      return { statusCode: 200, stream: new Response(text).body, blob: { etag: String(revision), size: text.length } };
    },
    put: async (_path, next, options) => {
      assert.equal(options.access, 'private');
      assert.equal(options.allowOverwrite, true);
      if (options.ifMatch !== String(revision)) throw new BlobPreconditionFailedError();
      text = next;
      revision++;
      if (failAfterWrite) { failAfterWrite = false; throw new Error('Lost acknowledgement'); }
    }
  };
  return { client, state: () => JSON.parse(text), failNextWrite: () => { failAfterWrite = true; } };
}

test('independent server instances cannot acquire the same plan slot concurrently', async () => {
  const store = memoryStore();
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => new BlobWorkflowBudget({ client: store.client }).beginPlan(22)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(outcomes.filter(r => r.status === 'rejected').every(r => r.reason.code === 'BUSY'));
  assert.equal(store.state().reservations.reduce((n, r) => n + r.count, 0), 22);
  await outcomes.find(r => r.status === 'fulfilled').value.release();
});

test('reservations survive release, cold starts and lost acknowledgements', async () => {
  const store = memoryStore();
  const options = { client: store.client, env: { QLOO_MAX_WORKFLOWS_PER_HOUR: '22' } };
  const plan = await new BlobWorkflowBudget(options).beginPlan(22);
  await plan.consume();
  await plan.release();
  await assert.rejects(new BlobWorkflowBudget(options).beginPlan(22), { code: 'GLOBAL_WORKFLOW_LIMIT' });
  const lost = memoryStore();
  lost.failNextWrite();
  await assert.rejects(new BlobWorkflowBudget({ client: lost.client }).beginPlan(22), { code: 'BUDGET_STORAGE' });
  assert.equal(lost.state().reservations[0].count, 22);
  await assert.rejects(new BlobWorkflowBudget({ client: lost.client }).beginPlan(22), { code: 'BUSY' });
});

test('expired lease stops work and an old release cannot unlock a newer owner', async () => {
  let now = 4_000_000;
  const store = memoryStore();
  const options = { client: store.client, now: () => now, leaseMs: 1000 };
  const old = await new BlobWorkflowBudget(options).beginPlan(2);
  now += 1001;
  await assert.rejects(old.consume(), { code: 'WORKFLOW_BUDGET' });
  const current = await new BlobWorkflowBudget(options).beginPlan(2);
  const owner = store.state().lease.id;
  await old.release();
  assert.equal(store.state().lease.id, owner);
  await current.consume();
  await current.consume();
  await assert.rejects(current.consume(), { code: 'WORKFLOW_BUDGET' });
  await current.release();
  await assert.rejects(current.consume(), { code: 'WORKFLOW_BUDGET' });
});

test('only a confirmed complete plan reconciles its unused reserved slots', async () => {
  const store = memoryStore();
  const budget = new BlobWorkflowBudget({ client: store.client, env: { QLOO_MAX_WORKFLOWS_PER_HOUR: '22' } });
  const complete = await budget.beginPlan(22);
  for (let i = 0; i < 18; i++) await complete.consume();
  await complete.release({ completed: true });
  assert.equal(store.state().reservations[0].count, 18);
  const failed = await budget.beginPlan(4);
  await failed.consume();
  await failed.release();
  assert.equal(store.state().reservations[1].count, 4);
  await assert.rejects(budget.beginPlan(1), { code: 'GLOBAL_WORKFLOW_LIMIT' });
});

test('missing, corrupt or unavailable storage never resets the allowance', async () => {
  for (const initial of [null, { ...emptyQuota(), version: 2 }, { ...emptyQuota(), reservations: [{ at: 0, count: -1 }] }, { ...emptyQuota(), lease: {} }]) {
    await assert.rejects(new BlobWorkflowBudget({ client: memoryStore(initial).client }).beginPlan(22), { code: 'BUDGET_STORAGE' });
  }
  const unavailable = { get: async () => { throw new Error('Unavailable'); } };
  await assert.rejects(new BlobWorkflowBudget({ client: unavailable }).beginPlan(22), { code: 'BUDGET_STORAGE' });
  assert.throws(() => createApp({ env: { APP_MODE: 'live', VERCEL: '1' } }), /durable shared quota/);
});

test('judging-period allowance survives hourly expiry and coordinator restarts', async () => {
  let now = 4_000_000;
  const store = memoryStore();
  const options = { client: store.client, now: () => now, env: { QLOO_MAX_TOTAL_WORKFLOWS: '22' } };
  const plan = await new BlobWorkflowBudget(options).beginPlan(22);
  await plan.release();
  now += 3_600_001;
  await assert.rejects(new BlobWorkflowBudget(options).beginPlan(1), { code: 'TOTAL_WORKFLOW_LIMIT' });
  assert.equal(store.state().totalReserved, 22);
});
