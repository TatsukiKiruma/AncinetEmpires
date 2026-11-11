import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WorkerPool } from './worker_pool';
const here = import.meta.dirname, data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
const latency = JSON.parse(fs.readFileSync(path.join(here, 'B_G1_G5.json'), 'utf8'));
assert(latency.passed, '必须先通过B-G1/B-G5');
const bytes = fs.readFileSync(path.join(data, 'attempt3-roots72.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'ROOTS72_MANIFEST.json'), 'utf8'));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
const roots = JSON.parse(bytes.toString()), config = JSON.parse(fs.readFileSync(path.join(here, 'TEACHER_CONFIG.json'), 'utf8'));
const statusFile = path.join(here, 'B_G2_PROGRESS.json');
const resultsFile = path.join(data, 'attempt3-mux-results.jsonl');
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2; };
const average = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const scan: any[] = [];
let failure: string | null = null, detail: any = null, chosen: any = null;
function saveProgress(phase: string, completed: number, total: number) {
    fs.writeFileSync(statusFile, JSON.stringify({ phase, completed, total, sealedAccess: 0 }));
}
function diagnostics(pool: WorkerPool) {
    return pool.mux.clients.map(c => ({ ...c.transport.diagnostics, exitCode: c.exitCode, closeMs: c.closeMs, forcedTermination: c.transport.forcedTermination }));
}
function health(rows: any[]) {
    for (const r of rows) assert(r.hardTimeouts === 0 && r.lateResponses === 0 && r.exitCode === 0 && !r.forcedTermination && r.closeMs <= 5000, '跨局服务健康门失败');
}
try {
    for (const services of [1, 2]) for (const coalesceMs of [.5, 1, 2]) {
        const pool = new WorkerPool(4, 2, coalesceMs, services, latency.selected);
        const tasks = Array.from({ length: 288 }, (_, i) => ({ kind: 'forward', state: roots[i % 72].state, valueOnly: i % 2 === 0 }));
        let elapsedMs = 0;
        try {
            await pool.run(tasks.slice(0, 72));
            const started = performance.now();
            await pool.run(tasks, (_, i) => saveProgress(`scan-${services}-${coalesceMs}`, i + 1, tasks.length));
            elapsedMs = performance.now() - started;
        } finally { await pool.close(); }
        const ds = diagnostics(pool); health(ds);
        const row = { services, coalesceMs, workerCount: 4, gamesPerWorker: 2, requests: 288, elapsedMs,
            requestsPerSecond: 288000 / elapsedMs, meanPhysicalBatch: average(pool.mux.batches),
            medianPhysicalBatch: median(pool.mux.batches), meanQueueMs: average(pool.mux.waits), diagnostics: ds };
        scan.push(row); fs.appendFileSync(resultsFile, JSON.stringify({ type: 'scan', ...row }) + '\n');
        console.log(JSON.stringify(row));
    }
    chosen = [...scan].sort((a, b) => b.requestsPerSecond - a.requestsPerSecond)[0];
    const repeats: any[][] = [];
    for (let repeat = 0; repeat < 2; repeat++) {
        const pool = new WorkerPool(4, 2, chosen.coalesceMs, chosen.services, latency.selected);
        try {
            await pool.run(roots.map((r: any) => ({ kind: 'forward', state: r.state })));
            let count = 0;
            const rows = await pool.run(roots.map((r: any) => ({ kind: 'search', state: r.state, config, plies: 3 })), (result, index) => {
                fs.appendFileSync(resultsFile, JSON.stringify({ type: 'trace', repeat, index, result }) + '\n');
                saveProgress(`search-repeat-${repeat}`, ++count, roots.length);
                console.log(JSON.stringify({ repeat, completed: count, index, steps: result.trace.length }));
                if (repeat === 1) {
                    const reference = repeats[0][index];
                    const signature = (x: any) => x.trace.map((step: any) => ({ action: step.action, after: step.after,
                        teacher: step.telemetry.teacher, candidates: step.telemetry.candidates }));
                    if (JSON.stringify(signature(reference)) !== JSON.stringify(signature(result))) {
                        detail = { root: index, reference: signature(reference), actual: signature(result) };
                        fs.writeFileSync(path.join(here, 'B_G2_FIRST_MISMATCH.json'), JSON.stringify(detail, null, 2));
                        assert.fail('同输入重跑的轨迹或估值不完全一致，立即停机');
                    }
                }
            });
            repeats.push(rows);
        } finally { await pool.close(); }
        health(diagnostics(pool));
    }
} catch (error) { failure = String(error); }
const result = { passed: failure === null, failure, mismatchRoot: detail?.root, scan, chosen, sealedAccess: 0,
    roots: 72, pliesPerRoot: 3, comparison: '两次8局负载，同输入，动作/后态SHA/教师分布/候选估值逐字段完全一致，不放宽误差阈值' };
fs.writeFileSync(path.join(here, 'B_G2.json'), JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
