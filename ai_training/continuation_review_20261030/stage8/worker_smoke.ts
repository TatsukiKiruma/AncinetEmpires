import assert from 'node:assert/strict';
import path from 'node:path';
import { WorkerPool } from './worker_pool';
import { schedule } from './scenarios';
import { K1, here, read, save } from './io';
const pool = new WorkerPool(4, 2, 2, 2, 'default', 'arena_worker.bundle.mjs', K1);
const jobs = schedule(1, 0).filter((_, i) => i % 4 === 0);
const config = {...read(path.join(here, '../stage5/config-C1.json')), modelVersion: K1.sha256, budgetMs: 3000, maxNodes: 100};
let rows: any[] = [];
try {
    await pool.run(jobs.map(j => ({kind: 'warm', state: j.state})));
    rows = await pool.run(Array.from({length: 8}, (_, i) => ({kind: 'audit', state: jobs[i % jobs.length].state, config, maxDecisionMs: 10000})));
} finally {await pool.close();}
const services = pool.mux.clients.map(c => ({...c.transport.diagnostics, exitCode: c.exitCode, forcedTermination: c.transport.forcedTermination}));
const result = {passed: rows.length === 8 && rows.every(r => !r.result.timeForfeit) && services.every(s => !s.failure && !s.hardTimeouts && s.exitCode === 0 && !s.forcedTermination),
    workers: 4, gamesPerWorker: 2, coalesceMs: 2, services, rows: rows.map(r => r.result), sealedAccess: 0};
save(path.join(here, 'GPU_WORKER_SMOKE.json'), result); assert(result.passed);
