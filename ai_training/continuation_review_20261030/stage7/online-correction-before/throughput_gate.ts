import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { WorkerPool } from './worker_pool';
const here = import.meta.dirname, data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
const gate = JSON.parse(fs.readFileSync(path.join(here, 'B_G2.json'), 'utf8')); assert(gate.passed, 'B-G2尚未通过');
const inference = JSON.parse(fs.readFileSync(path.join(here, 'B_G1_G5.json'), 'utf8')); assert(inference.passed);
const manifest = JSON.parse(fs.readFileSync(path.join(here, '../stage3/DEV_INITIAL_MANIFEST.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(here, 'TEACHER_CONFIG.json'), 'utf8'));
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const sourceIdentity = sha(fs.readFileSync(path.join(here, 'game_worker.bundle.mjs')));
const phase = process.argv[2] ?? 'P1'; assert(['P1', 'P2'].includes(phase));
const profile = process.argv[3] ? JSON.parse(process.argv[3]) : { tag: '', workers: 4, games: 2, services: gate.chosen.services, window: gate.chosen.coalesceMs };
assert(/^[a-z0-9_-]*$/.test(profile.tag) && [1, 4, 6, 8].includes(profile.workers)
    && [1, 2, 3].includes(profile.games) && [1, 2].includes(profile.services) && [.5, 1, 2].includes(profile.window));
if (profile.legacyV6) assert(profile.tag === 'stage6-ref' && profile.workers === 1 && profile.games === 2 && profile.services === 1);
const label = phase + (profile.tag ? '-' + profile.tag : '');
const count = phase === 'P1' ? 4 : 6, fraction = phase === 'P1' ? 1 : .25;
const slots = [2, 3, 4].flatMap(players => {
    const pool = manifest.slots.filter((s: any) => s.players === players);
    return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
});
const jobs = slots.map((slot: any, i: number) => {
    assert.equal(slot.split, 'dev');
    const file = path.join(here, '../stage3', slot.file), bytes = fs.readFileSync(file);
    assert.equal(sha(bytes), slot.sha256);
    return { kind: 'game', gameId: `${phase}-${i}`, state: JSON.parse(bytes.toString()), players: slot.players,
        config, sourceIdentity, maxRounds: 80, fullRootFraction: fraction, seed: 2026110800 + i,
        database: path.join(data, `throughput-${label}`, `game-${i}.sqlite`) };
});
const pool = new WorkerPool(profile.workers, profile.games, profile.window, profile.services, inference.selected, 'game_worker.bundle.mjs', undefined, false, !!profile.legacyV6);
const output = path.join(here, `B_${label}_PROGRESS.json`), resultFile = path.join(here, `B_${label}.json`);
const receiptFile = path.join(data, `throughput-${label}-receipts.jsonl`);
const games: any[] = [];
let failure: string | null = null, elapsedMs = 0;
let wireStart: { requests: number; wireMs: number }[] = [];
const startedAt = new Date().toISOString();
const clockFile = path.join(here, `B_${label}_CLOCK.json`);
let benchmarkStartedMs = 0;
let warmBatches = 0, warmWaits = 0;
try {
    await pool.run(jobs.map(j => ({ kind: 'forward', state: j.state })));
    wireStart = pool.mux.clients.map(c => ({ requests: c.transport.diagnostics.requests, wireMs: c.transport.diagnostics.wireMs }));
    warmBatches = pool.mux.batches.length; warmWaits = pool.mux.waits.length;
    if (fs.existsSync(clockFile)) {
        const clock = JSON.parse(fs.readFileSync(clockFile, 'utf8')); assert.equal(clock.sourceIdentity, sourceIdentity);
        benchmarkStartedMs = clock.startedMs;
    } else {
        benchmarkStartedMs = Date.now();
        fs.writeFileSync(clockFile, JSON.stringify({ sourceIdentity, startedMs: benchmarkStartedMs }));
    }
    try {
        await pool.run(jobs, (row, index) => {
            const game = { index, players: jobs[index].players, ...row.result }; games.push(game);
            fs.appendFileSync(receiptFile, JSON.stringify(game) + '\n');
            fs.writeFileSync(output, JSON.stringify({ phase, completed: games.length, total: jobs.length,
                natural: games.filter(g => g.natural).length, sealedAccess: 0 }));
            console.log(JSON.stringify({ phase, completed: games.length, natural: game.natural, steps: game.steps, teachers: game.teachers }));
        });
    } finally { elapsedMs = Date.now() - benchmarkStartedMs; }
} catch (error) { failure = String(error); }
finally { await pool.close(); }
const health = pool.mux.clients.map(c => ({ ...c.transport.diagnostics, exitCode: c.exitCode, closeMs: c.closeMs, forcedTermination: c.transport.forcedTermination }));
const sum = (key: string) => games.reduce((n, g) => n + g[key], 0);
const naturalGames = games.filter(g => g.natural).length;
function distribution(values: number[]) {
    const sorted = values.sort((a, b) => a - b);
    return { count: sorted.length, mean: sorted.length ? sorted.reduce((n, x) => n + x, 0) / sorted.length : null,
        p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null };
}
const physical = pool.mux.batches.slice(warmBatches);
const metrics = { elapsedMs, stepsPerSecond: sum('steps') / (elapsedMs / 1000),
    fullRootsPerHour: sum('fullRoots') / (elapsedMs / 3600000), teacherSamplesPerHour: sum('teachers') / (elapsedMs / 3600000),
    naturalGamesPerHour: naturalGames / (elapsedMs / 3600000), logicalRequestMs: sum('wireMs') / Math.max(1, sum('inferenceCalls')),
    meanWireMs: health.reduce((s, h, i) => s + h.wireMs - (wireStart[i]?.wireMs ?? 0), 0)
        / Math.max(1, health.reduce((s, h, i) => s + h.requests - (wireStart[i]?.requests ?? 0), 0)),
    realBatch: distribution(physical), bucketBatch: distribution(physical.map(n => 2 ** Math.ceil(Math.log2(n)))),
    logicalQueueMs: distribution(pool.mux.waits.slice(warmWaits)),
    wireDefinition: '与Stage6 InferenceTransport同口径：物理请求发出至响应解码的均值，排除预热；另报包含合批排队的逻辑请求耗时' };
const split = [2, 3, 4].map(players => {
    const group = games.filter(g => g.players === players);
    return { players, games: group.length, natural: group.filter(g => g.natural).length,
        naturalGamesPerHour: group.filter(g => g.natural).length / (elapsedMs / 3600000),
        teacherSamplesPerHour: group.reduce((s, g) => s + g.teachers, 0) / (elapsedMs / 3600000) };
});
const report = { phase, profile, complete: !failure && games.length === jobs.length, failure, startedAt, jobs: jobs.length, games,
    wallAccounting: '首次预热后开始，若恢复则计入停机间隔及后续预热，避免把旧完成样本除以仅本次耗时',
    metrics, split, health, sourceIdentity, inferenceMode: profile.legacyV6 ? 'Stage6-accurate-G0' : inference.selected, chosen: gate.chosen,
    referenceRatios: { fullRootsVsInheritedS0: metrics.fullRootsPerHour / 1200, stepsVsInheritedP0: metrics.stepsPerSecond / .95,
        note: '最初任务继承的S0约1200根/小时及P0约0.95步/秒，仅作诊断；不伪称同规则同工作负载Stage6自然局吞吐比' },
    sealedAccess: 0 };
fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
if (failure) process.exitCode = 1;
