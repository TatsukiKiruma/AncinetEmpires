import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WorkerPool } from './worker_pool';
const here = import.meta.dirname, data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
const prior = JSON.parse(fs.readFileSync(path.join(here, 'attempt3/B_G2.json'), 'utf8'));
const latency = JSON.parse(fs.readFileSync(path.join(here, 'B_G1_G5.json'), 'utf8'));
assert(latency.passed);
const roots = JSON.parse(fs.readFileSync(path.join(data, 'attempt3-roots72.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(here, 'TEACHER_CONFIG.json'), 'utf8'));
const identity = crypto.createHash('sha256').update(JSON.stringify({ config, roots, mode: latency.selected, chosen: prior.chosen,
    worker: crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'search_worker.bundle.mjs'))).digest('hex') })).digest('hex');
const file = path.join(data, 'attempt4-determinism.jsonl');
const saved = new Map<string, any>();
if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line); assert.equal(row.identity, identity); saved.set(`${row.mode}/${row.index}`, row.result);
}
let failure: string | null = null;
const health: any[] = [];
const comparisons: any[] = [];
const score = (r: any, action: string) => Math.max(...r.telemetry.candidates.filter((c: any) => c.rootAction === action && !c.vetoed && c.responseComplete).map((c: any) => c.score));
try {
    for (const mode of ['solo', 'load8']) {
        const pool = new WorkerPool(mode === 'solo' ? 1 : 4, mode === 'solo' ? 1 : 2, prior.chosen.coalesceMs, prior.chosen.services, latency.selected);
        try {
            await pool.run(roots.map((r: any) => ({ kind: 'forward', state: r.state })));
            const indexes = roots.map((_: any, i: number) => i).filter((i: number) => !saved.has(`${mode}/${i}`));
            let completed = roots.length - indexes.length;
            await pool.run(indexes.map((i: number) => ({ kind: 'search', state: roots[i].state, config, plies: 1 })), (result, local) => {
                const index = indexes[local]; saved.set(`${mode}/${index}`, result);
                fs.appendFileSync(file, JSON.stringify({ identity, mode, index, result }) + '\n');
                fs.writeFileSync(path.join(here, 'B_G2_PROGRESS.json'), JSON.stringify({ mode, completed: ++completed, total: 72, sealedAccess: 0 }));
                console.log(JSON.stringify({ mode, completed, index }));
                if (mode === 'load8') {
                    const a = saved.get(`solo/${index}`).trace[0], b = result.trace[0];
                    const same = a.action === b.action;
                    const gap = same ? 0 : Math.max(Math.abs(score(a, a.action) - score(a, b.action)), Math.abs(score(b, a.action) - score(b, b.action)));
                    if (!same) assert(gap < 1e-4, `非近似平局选招差异：${index}/${gap}`);
                }
            });
        } finally {
            await pool.close();
            health.push({ mode, services: pool.mux.clients.map(c => ({ ...c.transport.diagnostics, exitCode: c.exitCode, closeMs: c.closeMs, forcedTermination: c.transport.forcedTermination })) });
            fs.writeFileSync(path.join(here, 'B_G2_HEALTH_attempt4.json'), JSON.stringify(health, null, 2));
        }
        assert(health.at(-1).services.every((c: any) => c.exitCode === 0 && !c.forcedTermination && c.hardTimeouts === 0 && c.lateResponses === 0), '推理健康门未通过');
    }
    for (let i = 0; i < 72; i++) {
        const a = saved.get(`solo/${i}`).trace[0], b = saved.get(`load8/${i}`).trace[0];
        assert.deepEqual(a.telemetry.teacher.actionCodes, b.telemetry.teacher.actionCodes);
        const maxProbabilityDiff = Math.max(...a.telemetry.teacher.probabilities.map((v: number, j: number) => Math.abs(v - b.telemetry.teacher.probabilities[j])));
        comparisons.push({ index: i, sameAction: a.action === b.action, soloAction: a.action, loadAction: b.action,
            maxProbabilityDiff, soloNodes: a.telemetry.nodes, loadNodes: b.telemetry.nodes,
            soloTeacherAvailable: a.telemetry.teacher.available, loadTeacherAvailable: b.telemetry.teacher.available });
    }
} catch (error) { failure = String(error); }
const sorted = comparisons.map(r => r.maxProbabilityDiff).sort((a, b) => a - b);
const medianProbabilityDiff = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
const agreement = comparisons.length ? comparisons.filter(r => r.sameAction).length / comparisons.length : 0;
const passed = !failure && comparisons.length === 72 && agreement >= .99 && medianProbabilityDiff! <= 1e-4;
const report = { passed, failure, identity, comparisons, agreement, medianProbabilityDiff, health, chosen: prior.chosen,
    thresholds: { minimumAgreement: .99, mismatchNearTieGap: 1e-4, medianTeacherProbabilityDiff: 1e-4 },
    basis: '最初任务B-G2明确数值门槛；替代上一轮额外添加的逐字段完全相等判据', sealedAccess: 0 };
fs.writeFileSync(path.join(here, 'B_G2.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed, failure, agreement, medianProbabilityDiff }));
if (!passed) process.exitCode = 1;
