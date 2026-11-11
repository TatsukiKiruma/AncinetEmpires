import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { arenaStats, devPanel, launchArena, runPanel, serviceHealth } from './arena_panel';
import { checkH1, checkSourceLock, data, fileSha, h1Sha, here, positiveProgressStop, readJson, readLocal, saveJson, saveLocal, sha } from './phase7_io';

const median = (values: number[]) => { const a = [...values].sort((x, y) => x - y); return (a[Math.floor(a.length / 2)] + a[Math.floor((a.length - 1) / 2)]) / 2; };
const b = readLocal('PHASE_B_DECISION.json');
assert(b.passed && b.sealedAccess === 0, 'B 未通过，禁止启动 C');
const frozen = checkSourceLock();
checkH1();
const config = readJson(path.join(here, '../stage5/config-C1.json'));
assert(config.budgetMs === 3000 && config.maxNodes === 5000 && config.priorAnchor === .1 && config.modelVersion === h1Sha);
const launch = { workers: 1, services: b.chosen.services, window: b.chosen.window, mode: b.inferenceMode };
const { jobs, panelSha, subsetIds, limits } = devPanel();
const auditRoot = path.join(data, 'phase-c-audit');
fs.mkdirSync(auditRoot, { recursive: true });
const rootsPath = 'D:/AncientEmpiresData/speed_bench_20261107_v1/roots.json';
const rootsSha = 'ce3246bb25978e78758da7c1d99dd1e0986f4481cb27aea5374a968aa26393f0';
const roots = readJson(rootsPath, rootsSha);
assert.equal(roots.length, 36);
const identity = sha(JSON.stringify({ launch, rootsSha, config, engine: frozen.sha256,
    worker: fileSha(path.join(here, 'arena_worker.bundle.mjs')) }));
const reports: any[] = [];

for (let w = 1; w <= 8; w++) {
    positiveProgressStop();
    const file = path.join(auditRoot, `w${w}.json`);
    if (fs.existsSync(file)) {
        const previous = readJson(file); assert.equal(previous.identity, identity);
        reports.push(previous); continue;
    }
    const pool = launchArena({ ...launch, workers: w });
    const rootRows = Array<any>(36).fill(null);
    let error: string | null = null;
    try {
        await pool.run(roots.map((r: any) => ({ kind: 'warm', state: r.state })));
        const pending = roots.flatMap((r: any, i: number) => {
            const file = path.join(auditRoot, `w${w}-r${i}.json`);
            if (fs.existsSync(file)) { const p = readJson(file); assert.equal(p.identity, identity); rootRows[i] = p.row; return []; }
            return [{ kind: 'audit', state: r.state, config, maxDecisionMs: limits.maxDecisionMs, file, i }];
        });
        await pool.run(pending, (out, j) => {
            const item = pending[j];
            rootRows[item.i] = out.result; saveJson(item.file, { identity, row: out.result });
            positiveProgressStop();
        });
    } catch (e) { error = String(e); }
    finally { await pool.close(); }
    const health = serviceHealth(pool);
    const nodes = rootRows.every(Boolean) ? median(rootRows.map(r => r.nodes)) : null;
    const baselineNodes = reports[0]?.nodes ?? nodes;
    const nodeRatio = nodes !== null && baselineNodes > 0 ? nodes / baselineNodes : null;
    const timeForfeits = rootRows.filter(r => r?.timeForfeit).length;
    const result = { identity, workers: w, nodes, nodeRatio, timeForfeits, health, rootRows, error, sealedAccess: 0,
        passed: !error && health.passed && nodeRatio !== null && nodeRatio >= .9 && timeForfeits === 0 };
    saveJson(file, result); reports.push(result);
    saveLocal('PHASE_C_PROGRESS.json', { phase: 'competition_audit', configurations: reports.length, total: 8, sealedAccess: 0 });
    // W=1 是正式基准；基础组不健康时，没有可解释的并发比较。
    if (w === 1) assert(result.passed, '单 Worker 并发对照失败');
}
assert(reports[0].passed, '单 Worker 并发对照失败');
const chosen = reports.filter(r => r.passed).at(-1);
assert(chosen);
saveLocal('PHASE_C_CONCURRENCY.json', { passed: true, roots: 36, budgetMs: 3000, rootsSha, workers: chosen.workers, reports, sealedAccess: 0 });

const args = { label: 'C1-dev', config, launch: { ...launch, workers: chosen.workers }, panelSha, limits, strictFallbacks: false, sealedAccess: 0 };
saveLocal('PHASE_C_PROGRESS.json', { phase: 'baseline18', workers: chosen.workers, sealedAccess: 0 });
// 完成正式全量后断点重入时，不用全量时延覆盖已锁定的 18 局时延。
const b18File = path.join(here, 'STAGE7_BASELINE_DEV18.json');
const screen = fs.existsSync(b18File) ? readJson(b18File) : await runPanel({ ...args, jobs: jobs.filter((j: any) => subsetIds.has(j.match.id)) });
const pass18 = screen.passed && screen.natural === 18 && screen.timeForfeits === 0 && screen.meanWireMs !== null && screen.meanWireMs <= 12;
if (!fs.existsSync(b18File)) saveLocal('STAGE7_BASELINE_DEV18.json', { ...screen, passed: pass18, engineSha256: frozen.sha256, inferenceMode: launch.mode });
assert(pass18 && screen.panelSha === panelSha, 'C1 新引擎 Dev-18 健康门禁失败');
saveLocal('PHASE_C_PROGRESS.json', { phase: 'baseline54', workers: chosen.workers, sealedAccess: 0 });
const full = await runPanel({ ...args, jobs });
const b18 = arenaStats(full.games.filter(g => subsetIds.has(g.id)));
const pass54 = full.passed && full.natural === 54 && full.timeForfeits === 0 && b18.wins === screen.wins;
saveLocal('STAGE7_BASELINE_DEV54.json', { ...full, passed: pass54, B: full.wins, B18: b18, workers: chosen.workers, config,
    engineSha256: frozen.sha256, inferenceMode: launch.mode, oldEngineC1Wins: 36, comparison: '仅描述不同引擎下的独胜计数' });
assert(pass54, 'C1 新引擎 Dev-54 健康门禁失败');
saveLocal('PHASE_C_PROGRESS.json', { phase: 'complete', passed: true, B: full.wins, B18: b18.wins, sealedAccess: 0 });
