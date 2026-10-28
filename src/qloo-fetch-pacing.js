import { setTimeout as sleep } from 'node:timers/promises';

// The event reports 10 requests/second. Native rank resolution can otherwise
// dispatch ten option lookups and an anchor lookup at once. Pace every fetch,
// including upstream retries, before the official CLI module is loaded.
export function pacedFetch(fetchImpl, intervalMs = 250) {
  let queue = Promise.resolve();
  let lastStart = 0;
  return (input, init) => {
    const task = queue.then(async () => {
      const signal = init?.signal ?? input?.signal;
      signal?.throwIfAborted();
      const delay = Math.max(0, intervalMs - (Date.now() - lastStart));
      if (delay) await sleep(delay, undefined, { signal });
      signal?.throwIfAborted();
      lastStart = Date.now();
      return fetchImpl(input, init);
    });
    queue = task.catch(() => {});
    return task;
  };
}

globalThis.fetch = pacedFetch(globalThis.fetch.bind(globalThis));
