import test from 'node:test';
import assert from 'node:assert/strict';
import { pacedFetch } from '../src/qloo-fetch-pacing.js';

test('parallel native lookups are paced and a failed lookup does not break the queue', async () => {
  const starts = [];
  const fetch = pacedFetch(async value => {
    starts.push(Date.now());
    if (value === 'failed') throw new Error('Injected transport failure');
    return value;
  }, 40);
  const results = await Promise.allSettled(['first', 'failed', 'last'].map(value => fetch(value)));
  assert.equal(results[0].value, 'first');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].value, 'last');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 30);
});

test('a queued lookup cancelled before dispatch never calls the provider', async () => {
  const sent = [];
  const fetch = pacedFetch(async value => { sent.push(value); return value; }, 50);
  const controller = new AbortController();
  const first = fetch('first');
  const second = fetch('cancelled', { signal: controller.signal });
  controller.abort();
  await first;
  await assert.rejects(second);
  assert.deepEqual(sent, ['first']);
});
