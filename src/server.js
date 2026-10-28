import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AppError, publicError } from './errors.js';
import { runPlan } from './agent.js';
import { FixtureAdapter, fixture } from './fixtures.js';
import { QlooHarnessAdapter, HARNESS_VERSION } from './harness.js';
import { WorkflowBudget } from './budget.js';
import { validateInput } from './input.js';
import { liveSample, resolvedAnchors } from './live-sample.js';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

files.set("/finish.css", ["finish.css", "text/css; charset=utf-8"]);
files.set("/assets/paper-grain.png", ["assets/paper-grain.png", "image/png"]);
files.set("/assets/Manrope.ttf", ["assets/Manrope.ttf", "font/ttf"]);
files.set("/assets/Newsreader.ttf", ["assets/Newsreader.ttf", "font/ttf"]);
files.set("/assets/collection-art.jpg", ["assets/collection-art.jpg", "image/jpeg"]);

async function bodyJSON(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('CONTENT_TYPE', 'Send application/json.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new AppError('BODY_LIMIT', 'The request is larger than 16 KB.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('INVALID_JSON', 'The request must contain valid JSON.'); }
}

function sameCode(received, expected) {
  if (!expected) return true;
  if (typeof received !== 'string') return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApp({ env = process.env, adapterFactory, budgetFactory } = {}) {
  const mode = env.APP_MODE || 'fixture';
  if (!['fixture', 'live'].includes(mode)) throw new Error('APP_MODE must be fixture or live.');
  if (env.PUBLIC_DEMO === 'true' && env.APP_ACCESS_CODE) throw new Error('PUBLIC_DEMO=true requires an empty APP_ACCESS_CODE.');
  let liveBusy = false;
  if (mode === 'live' && env.VERCEL === '1' && !budgetFactory) throw new Error('Vercel live mode requires a durable shared quota coordinator.');
  const globalBudget = mode === 'live' ? (budgetFactory ? budgetFactory(env) : new WorkflowBudget({ path: env.QLOO_BUDGET_FILE, limit: env.QLOO_MAX_WORKFLOWS_PER_HOUR })) : null;
  const recentRequests = new Map();
  const app = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store');
    const sendJSON = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    const path = new URL(request.url, 'http://localhost').pathname;
    let acquired = false;
    let planBudget;
    const releaseBudget = async () => {
      if (planBudget?.release) await planBudget.release().catch(() => {});
      planBudget = undefined;
    };
    try {
      if (request.method === 'GET' && path === '/api/health') {
        return sendJSON(200, { ok: true, project: 'common-room', mode, liveVerified: false, note: 'Health checks server availability, not Qloo credentials or live evidence.' });
      }
      if (request.method === 'GET' && path === '/api/config') {
        return sendJSON(200, { project: 'common-room', mode, accessCodeRequired: Boolean(env.APP_ACCESS_CODE), harnessVersion: HARNESS_VERSION, sample: mode === 'live' ? liveSample : fixture.input, resolvedAnchors: mode === 'live' ? resolvedAnchors : [] });
      }
      if (request.method === 'GET' && files.has(path)) {
        const [name, type] = files.get(path);
        response.writeHead(200, { 'Content-Type': type });
        return response.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
      }
      if (request.method !== 'POST' || !['/api/plan', '/api/plan/stream'].includes(path)) {
        return sendJSON(404, { error: { code: 'NOT_FOUND', message: 'This route does not exist.' } });
      }
      if (request.headers.origin) {
        let origin;
        try { origin = new URL(request.headers.origin); }
        catch { throw new AppError('ORIGIN', 'The request origin is invalid.', 403); }
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host) throw new AppError('ORIGIN', 'Use this app from its own origin.', 403);
      }
      if (!sameCode(request.headers['x-common-room-code'], env.APP_ACCESS_CODE)) throw new AppError('ACCESS_CODE', 'Enter the venue or judge access code to run the agent.', 401);
      if (mode === 'live') {
        if (liveBusy) throw new AppError('BUSY', 'Another live plan is running. Try again after it completes.', 429);
        const key = request.socket.remoteAddress ?? 'unknown';
        const now = Date.now();
        for (const [address, times] of recentRequests) if (times.every(time => now - time >= 600_000)) recentRequests.delete(address);
        const times = (recentRequests.get(key) ?? []).filter(time => now - time < 600_000);
        if (times.length >= 10) throw new AppError('LOCAL_RATE_LIMIT', 'The local limit is ten live plans per ten minutes. This protects the event quota.', 429);
        times.push(now);
        recentRequests.set(key, times);
        liveBusy = true;
        acquired = true;
      }
      const input = validateInput(await bodyJSON(request));
      if (mode === 'live' && !adapterFactory && !env.QLOO_API_KEY?.trim()) {
        throw new AppError('QLOO_CREDENTIAL_REQUIRED', 'Live planning is awaiting the organizer-issued Qloo credential. No query was sent. The venue brief is preserved; try again once access is available.', 503);
      }
      // Keep the complete maximum plan available before spending sponsor quota.
      // Per-request limits may deliberately be lower, in which case the planner
      // will fail visibly rather than silently run a partial plan.
      const perPlanLimit = Math.max(1, Math.min(22, Number(env.QLOO_MAX_WORKFLOWS) || 22));
      if (globalBudget?.beginPlan) planBudget = await globalBudget.beginPlan(perPlanLimit);
      else if (globalBudget) await globalBudget.ensureAvailable(perPlanLimit);
      const adapter = adapterFactory ? adapterFactory(input) : mode === 'live' ? new QlooHarnessAdapter({ env }) : new FixtureAdapter(input);
      const streaming = path.endsWith('/stream');
      if (streaming) response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
      const result = await runPlan(input, adapter, {
        maxWorkflows: env.QLOO_MAX_WORKFLOWS,
        beforeWorkflow: () => (planBudget ?? globalBudget)?.consume(),
        onEvent: event => { if (streaming && !response.destroyed) response.write(`${JSON.stringify({ type: 'trace', data: event })}\n`); }
      });
      // Functions may freeze as soon as the response ends. Complete the shared
      // lease release first; failed releases remain locked until safe expiry.
      await releaseBudget();
      if (streaming) return response.end(`${JSON.stringify({ type: 'result', data: result })}\n`);
      return sendJSON(200, result);
    } catch (error) {
      await releaseBudget();
      const safe = publicError(error);
      if (response.headersSent) response.end(`${JSON.stringify({ type: 'error', error: safe })}\n`);
      else sendJSON(error instanceof AppError ? error.status : 500, { error: safe });
    } finally {
      // A failed release keeps the shared lease until expiry. Never erase reservations.
      await releaseBudget();
      if (acquired) liveBusy = false;
    }
  });
  app.requestTimeout = 30_000;
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4312);
  const host = process.env.HOST || '127.0.0.1';
  if (process.env.PUBLIC_DEMO === 'true' && process.env.APP_ACCESS_CODE) {
    console.error('PUBLIC_DEMO=true requires an empty APP_ACCESS_CODE so the submission is publicly usable.');
    process.exitCode = 1;
  } else if (process.env.APP_MODE === 'live' && !['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_ACCESS_CODE && process.env.PUBLIC_DEMO !== 'true') {
    console.error('Live public binding requires PUBLIC_DEMO=true with the shared quota ledger, or APP_ACCESS_CODE for private development only.');
    process.exitCode = 1;
  } else {
    const app = createApp();
    app.listen(port, host, () => console.log(`Common Room: http://${host}:${port} | mode=${process.env.APP_MODE || 'fixture'}`));
  }
}
