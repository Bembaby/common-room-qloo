import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BlobWorkflowBudget } from '../src/blob-budget.js';

let lease;
try {
  const first = new BlobWorkflowBudget();
  const second = new BlobWorkflowBudget();
  lease = await first.beginPlan(1);
  await assert.rejects(second.beginPlan(1), { code: 'BUSY' });
  await lease.consume();
  await assert.rejects(lease.consume(), { code: 'WORKFLOW_BUDGET' });
  await lease.release();
  lease = await second.beginPlan(1);
  await lease.release();
  const record = { category: 'hosted_storage_verified', testedAt: new Date().toISOString(), provider: 'Vercel private Blob', checks: ['Real conditional write accepted', 'Independent coordinator blocked during lease', 'Reservation overrun refused', 'Release allowed a new coordinator'], qlooRequests: 0, workflowReservationsConservativelyRetained: 2, disclosure: 'Actual hosted storage check only. This does not establish live Qloo, public app or contest submission success.' };
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/live-host-storage.json', import.meta.url), JSON.stringify(record, null, 2));
  console.log('PASS: actual private hosted quota storage and lease checks; 0 Qloo requests.');
} catch {
  console.error('Hosted quota storage check failed. No Qloo success was substituted.');
  process.exitCode = 1;
} finally {
  if (lease) await lease.release().catch(() => {});
}
