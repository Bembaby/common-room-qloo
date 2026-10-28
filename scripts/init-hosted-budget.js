import { put } from '@vercel/blob';
import { emptyQuota, QUOTA_PATH } from '../src/blob-budget.js';

// Run once against this project's dedicated private store. Existing state is
// deliberately never overwritten, reset or silently recreated by the app.
try {
  await put(QUOTA_PATH, JSON.stringify(emptyQuota()), { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
  console.log('Initialized the private shared quota ledger. No Qloo request was sent.');
} catch {
  console.error('Quota initialization refused. The ledger may already exist or storage may be unavailable. Existing state was not overwritten.');
  process.exitCode = 1;
}
