import { randomUUID } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { AppError } from './errors.js';

export const QUOTA_PATH = 'quota/shared-v1.json';
export const emptyQuota = () => ({ version: 1, reservations: [], lease: null });

// All deployments share one private object. Reads bypass caches and writes use
// its ETag. Reserve the whole bounded plan before spending any sponsor quota.
export class BlobWorkflowBudget {
  constructor({ env = process.env, client = { get, put }, now = Date.now, leaseMs = 900_000 } = {}) {
    this.client = client;
    this.now = now;
    this.leaseMs = leaseMs;
    this.limit = Math.max(1, Math.min(10_000, Number(env.QLOO_MAX_WORKFLOWS_PER_HOUR) || 88));
    this.totalLimit = Math.max(1, Math.min(1000, Number(env.QLOO_MAX_TOTAL_WORKFLOWS) || 1000));
    this.auth = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  }

  async mutate(change) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const object = await this.client.get(QUOTA_PATH, { ...this.auth, access: 'private', useCache: false, abortSignal: AbortSignal.timeout(5000) });
        if (!object || object.statusCode !== 200 || !object.stream || !object.blob?.etag || object.blob.size > 65_536) throw new Error('Missing or oversized quota state');
        const text = await new Response(object.stream).text();
        if (text.length > 65_536) throw new Error('Oversized quota state');
        const state = JSON.parse(text);
        if (state.version !== 1 || !Array.isArray(state.reservations) || state.reservations.length > 10_000 || state.reservations.some(r => !Number.isFinite(r.at) || r.at < 0 || !Number.isInteger(r.count) || r.count < 1 || r.count > 22)) throw new Error('Invalid quota state');
        if (state.lease !== null && (!state.lease || typeof state.lease.id !== 'string' || !Number.isFinite(state.lease.until))) throw new Error('Invalid quota lease');
        if (state.totalReserved === undefined) state.totalReserved = state.reservations.reduce((sum, row) => sum + row.count, 0);
        if (!Number.isInteger(state.totalReserved) || state.totalReserved < 0 || state.totalReserved > 100_000) throw new Error('Invalid lifetime quota state');
        state.reservations = state.reservations.filter(r => this.now() - r.at < 3_600_000);
        const value = change(state);
        try {
          await this.client.put(QUOTA_PATH, JSON.stringify(state), { ...this.auth, access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: object.blob.etag, contentType: 'application/json', cacheControlMaxAge: 60, abortSignal: AbortSignal.timeout(5000) });
          return value;
        } catch (error) {
          if (!(error instanceof BlobPreconditionFailedError)) throw error;
        }
      }
      throw new AppError('BUSY', 'Another plan updated the shared quota. Try again shortly.', 429);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('BUDGET_STORAGE', 'The shared quota store is unavailable or invalid. Live queries are paused; no fixture result was substituted.', 503);
    }
  }

  async beginPlan(count) {
    if (!Number.isInteger(count) || count < 1 || count > 22) throw new AppError('WORKFLOW_BUDGET', 'Invalid plan reservation.', 503);
    const id = randomUUID();
    const until = await this.mutate(state => {
      if (state.lease && state.lease.until > this.now()) throw new AppError('BUSY', 'Another live plan is running. Try again after it completes.', 429);
      if (state.reservations.reduce((sum, r) => sum + r.count, 0) + count > this.limit) throw new AppError('GLOBAL_WORKFLOW_LIMIT', 'The shared hourly workflow allowance is reserved. Return after the window resets.', 429);
      if (state.totalReserved + count > this.totalLimit) throw new AppError('TOTAL_WORKFLOW_LIMIT', 'The judging-period workflow allowance is reserved. Live queries are paused to protect the event key. No fixture result was substituted.', 429);
      const until = this.now() + this.leaseMs;
      state.reservations.push({ id, at: this.now(), count });
      state.totalReserved += count;
      state.lease = { id, until };
      return until;
    });
    let used = 0;
    let released = false;
    return {
      consume: async () => {
        if (released || this.now() >= until || used >= count) throw new AppError('WORKFLOW_BUDGET', 'This plan reservation expired or was exhausted. No further Qloo workflow was started.', 429);
        used++;
      },
      release: async ({ completed = false } = {}) => {
        if (released) return;
        released = true;
        await this.mutate(state => {
          if (state.lease?.id !== id) return;
          // Only a fully returned planner outcome can reconcile unused slots.
          // Interrupted or failed runs keep their entire conservative reservation.
          const reservation = state.reservations.find(row => row.id === id);
          if (completed && reservation && used > 0) {
            state.totalReserved -= reservation.count - used;
            reservation.count = used;
          }
          state.lease = null;
        });
      }
    };
  }
}
