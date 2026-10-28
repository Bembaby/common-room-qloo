import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { runPlan } from '../src/agent.js';
import { QlooHarnessAdapter } from '../src/harness.js';
import { WorkflowBudget } from '../src/budget.js';
import { AppError, publicError } from '../src/errors.js';

let record;
try {
  if (process.env.APP_MODE !== 'live') throw new AppError('LIVE_MODE_REQUIRED', 'Set APP_MODE=live.');
  if (!process.argv[2]) throw new AppError('INPUT_FILE_REQUIRED', 'Usage: npm run live:plan -- /path/to/your-live-input.json. Copy fixtures/live-input.example.json and choose public cultural anchors.');
  const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
  if (input.circles?.some(circle => circle.anchors?.some(anchor => anchor.startsWith('00000000-0000-4000-8000-00000000')))) throw new AppError('SYNTHETIC_ENTITY', 'Do not send synthetic fixture IDs to Qloo.');
  const ledger = new WorkflowBudget({ path: process.env.QLOO_BUDGET_FILE, limit: process.env.QLOO_MAX_WORKFLOWS_PER_HOUR });
  const cap = Math.max(1, Math.min(22, Number(process.env.QLOO_MAX_WORKFLOWS) || 22));
  ledger.ensureAvailable(cap);
  const result = await runPlan(input, new QlooHarnessAdapter(), { maxWorkflows: cap, beforeWorkflow: () => ledger.consume(), onEvent: event => console.log(`${event.sequence}. ${event.phase}: ${event.message}`) });
  record = { category: result.status === 'ready' ? 'live_plan_success' : 'live_constraints_blocked', generatedAt: new Date().toISOString(), result };
  if (result.status !== 'ready') process.exitCode = 1;
} catch (error) {
  record = { category: 'live_blocked', generatedAt: new Date().toISOString(), error: publicError(error) };
  console.error(`${record.error.code}: ${record.error.message}`);
  process.exitCode = 1;
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/live-plan.json', import.meta.url), JSON.stringify(record, null, 2), { mode: 0o600 });
console.log(`Saved artifacts/live-plan.json with category ${record.category}.`);
