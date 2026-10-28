import { mkdir, writeFile } from 'node:fs/promises';
import { QlooHarnessAdapter } from '../src/harness.js';
import { WorkflowBudget } from '../src/budget.js';
import { UUID } from '../src/input.js';
import { AppError, publicError } from '../src/errors.js';

let record;
try {
  if (process.env.APP_MODE !== 'live') throw new AppError('LIVE_MODE_REQUIRED', 'Set APP_MODE=live before collecting live evidence.');
  const anchor = process.env.QLOO_SMOKE_ENTITY_ID;
  if (!UUID.test(anchor ?? '') || anchor.startsWith('00000000-0000-4000-8000-00000000')) throw new AppError('LIVE_ENTITY_REQUIRED', 'Set QLOO_SMOKE_ENTITY_ID to a real, verified Qloo entity UUID. Synthetic fixture IDs are not accepted.');
  const adapter = new QlooHarnessAdapter();
  await adapter.check();
  const ledger = new WorkflowBudget({ path: process.env.QLOO_BUDGET_FILE, limit: process.env.QLOO_MAX_WORKFLOWS_PER_HOUR });
  ledger.consume();
  const result = await adapter.recommend({ anchors: [anchor] }, 'book', 1);
  if (!result.entities.length) throw new AppError('LIVE_EMPTY', 'The live API returned no book candidate. This is not a successful end-to-end smoke result.');
  record = { category: 'live_api_success', generatedAt: new Date().toISOString(), anchorId: anchor, operation: 'recommend', result, scope: 'One real Qloo recommendation workflow only. Full-plan, public-host, and entity-resolution verification are still separate gates.' };
  console.log('PASS: one real Qloo recommendation workflow. Saved artifacts/live-smoke.json.');
} catch (error) {
  record = { category: 'live_blocked', generatedAt: new Date().toISOString(), error: publicError(error), note: 'No successful live result was substituted.' };
  console.error(`${record.error.code}: ${record.error.message}`);
  process.exitCode = 1;
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/live-smoke.json', import.meta.url), JSON.stringify(record, null, 2), { mode: 0o600 });
