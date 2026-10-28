import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppError } from './errors.js';

// A single-process ledger. Persist the directory and run exactly one replica.
// Reserve each workflow before invoking the subprocess. A crash may waste a
// reservation but must never make a used reservation disappear.
export class WorkflowBudget {
  constructor({ path = '.data/qloo-workflow-budget.json', limit = 88, now = Date.now } = {}) {
    this.path = resolve(path);
    this.limit = Math.max(1, Math.min(10_000, Number(limit) || 88));
    this.now = now;
  }

  read() {
    try {
      const record = JSON.parse(readFileSync(this.path, 'utf8'));
      if (record.version !== 1 || !Array.isArray(record.reservations) || record.reservations.some(time => !Number.isFinite(time) || time < 0)) throw new Error('Invalid budget ledger');
      return record.reservations.filter(time => this.now() - time < 3_600_000);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new AppError('BUDGET_STORAGE', 'The quota ledger cannot be read. Live queries are paused until its storage is repaired.', 503);
    }
  }

  ensureAvailable(count) {
    if (this.limit - this.read().length < count) throw new AppError('GLOBAL_WORKFLOW_LIMIT', 'The public demo has reached its shared hourly workflow budget. Please return after the window resets. No Qloo request was started for this plan.', 429);
  }

  consume() {
    const reservations = this.read();
    if (reservations.length >= this.limit) throw new AppError('GLOBAL_WORKFLOW_LIMIT', 'The shared workflow budget is exhausted. The agent stopped before another Qloo workflow.', 429);
    reservations.push(this.now());
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, reservations }), { mode: 0o600 });
      renameSync(temporary, this.path);
    } catch {
      throw new AppError('BUDGET_STORAGE', 'The quota reservation could not be saved. Live queries are paused.', 503);
    }
  }
}
