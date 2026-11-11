import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { getApkSkirmishTrainingScenarios } from '../src/game/apk_skirmish';
import { AncientEmpiresEnv } from '../src/game/env';
import { loadBcModel } from './skirmish_bc_train';
import { createBcRankerPolicy, createHeuristicBaselinePolicy, getArmyValueByAlliance, readApkSkirmishTrainingMap, runSkirmishEpisode } from './skirmish_training_runner';
import { createSdTrainingGameState, getSdTrainingPlanEntry, loadSdTrainingPlanConfig } from './sd_training_state_generator';

// 固定成对种子；常规局交换模型席位，残局保持优势方不变并交换行动顺序。
const outArg = process.argv.indexOf('--out-dir');
const out: string = isMainThread ? (outArg >= 0 ? process.argv[outArg + 1] : 'training_runs/evaluation_20260918') : workerData.out;
const workerArg = process.argv.indexOf('--workers');
const workerCount: number = isMainThread ? (workerArg >= 0 ? Number(process.argv[workerArg + 1]) : 8) : workerData.workerCount;
const modelPaths = { new: 'training_runs/models/sd-bc-v3-20260918-011742.json', old: 'training_runs/preflight_20260918/smoke-bc.json' };
type Policy = 'new' | 'old' | 'heuristic';
type Job = { id: number; map: string; plan: string; seed: number; subject: Policy; opponent: Policy; seat: number };
const maps = ['(2) Swamplands.aem', '(2) Duel.aem', '(2) The Crossing.aem', '(2) Crossed swords.aem'];
const jobs: Job[] = [];
for (const map of maps) for (const seed of [9101801, 9101802, 9101803]) for (const opponent of ['heuristic', 'old'] as Policy[]) for (const seat of [0, 1]) jobs.push({ id: jobs.length, map, plan: 'sd-normal', seed, subject: 'new', opponent, seat });
for (const map of [maps[0], maps[2]]) for (const plan of ['sd-small-advantage-endgame', 'sd-medium-advantage-endgame', 'sd-large-advantage-endgame']) for (const seed of [9101801, 9101802]) for (const subject of ['new', 'old', 'heuristic'] as Policy[]) for (const seat of [0, 1]) jobs.push({ id: jobs.length, map, plan, seed, subject, opponent: 'heuristic', seat });
const jobsArg = process.argv.indexOf('--job-ids');
if (isMainThread && jobsArg >= 0) {
    const ids = (process.argv[jobsArg + 1] ?? '').split(',').map(Number);
    if (!ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id >= jobs.length)) throw new Error('--job-ids 必须为有效对局编号，以逗号分隔');
    const selected = jobs.filter(job => ids.includes(job.id));
    jobs.splice(0, jobs.length, ...selected);
}

async function run(job: Job) {
    const scenario = getApkSkirmishTrainingScenarios().find(s => s.mode === 'SD' && s.mapName === job.map)!;
    const config = await loadSdTrainingPlanConfig('training_configs/sd_training_plan_20260705.json');
    const map = await readApkSkirmishTrainingMap('APK/_analysis/unpack', scenario);
    const state = createSdTrainingGameState(map, scenario, config, getSdTrainingPlanEntry(config, job.plan), job.seed);
    const players = state.players.filter(p => p.isAlive).map(p => p.id).sort((a, b) => a - b);
    const endgame = job.plan !== 'sd-normal';
    const subjectId = endgame ? state.currentPlayer : players[job.seat];
    if (endgame && job.seat === 1) state.currentPlayer = players.find(p => p !== subjectId)!;
    const models = { new: await loadBcModel(modelPaths.new), old: await loadBcModel(modelPaths.old) };
    const timings: Record<string, { calls: number; totalMs: number; maxMs: number; over2000ms: number }> = {};
    const started = performance.now();
    const episode = runSkirmishEpisode({ env: new AncientEmpiresEnv({ initialState: state, seed: job.seed, maxPlies: 400 }), scenario, seed: job.seed, maxPlies: 400, maxSteps: 25600,
        progressIntervalSteps: 100000,
        progressIntervalTurns: 10,
        onProgress: progress => parentPort?.postMessage({ kind: 'progress', id: job.id, turn: progress.turn, step: progress.step }),
        policyFactory: (id) => {
            const name = id === subjectId ? job.subject : job.opponent;
            const policy = name === 'heuristic' ? createHeuristicBaselinePolicy(job.seed + id * 1009 + players.indexOf(id) * 9173) : createBcRankerPolicy(models[name]);
            return { name, selectFixedActionIndex(context) {
                const start = performance.now();
                try { return policy.selectFixedActionIndex(context); }
                finally { const ms = performance.now() - start; const t = timings[name] ??= { calls: 0, totalMs: 0, maxMs: 0, over2000ms: 0 }; t.calls++; t.totalMs += ms; t.maxMs = Math.max(t.maxMs, ms); t.over2000ms += Number(ms > 2000); }
            } };
        }
    });
    await writeFile(`${out}/episodes/${job.id}.json`, JSON.stringify({ job, episode }));
    const alliance = episode.players.find(p => p.id === subjectId)!.allianceId;
    return { ...job, subjectId, subjectAlliance: alliance, initialArmy: getArmyValueByAlliance(state), initialTurn: state.turn, subjectFirst: state.currentPlayer === subjectId, durationMs: performance.now() - started, timings, ...episode.summary, naturalWin: episode.summary.winnerAlliance === alliance, adjudicatedWin: episode.summary.winnerAlliance === null && episode.summary.adjudicatedWinnerAlliance === alliance };
}

async function main() {
    if (!out) throw new Error('--out-dir 缺少目录参数');
    if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 16) throw new Error('--workers 必须为 1 到 16 的整数');
    await mkdir(out, { recursive: true });
    // 独占创建证据目录，避免复跑时覆盖已有评估。
    await mkdir(`${out}/episodes`);
    const hashes = Object.fromEntries(await Promise.all(Object.entries(modelPaths).map(async ([name, file]) => [name, { file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') }])));
    await writeFile(`${out}/manifest.json`, JSON.stringify({ models: hashes, workerCount, maxPlies: 400, maxSteps: 25600, jobs, note: '旧模型为5000样本试训模型；自然胜利与裁定分开；绝对上限400 ply；残局从第35回合开始，剩余约166回合。' }, null, 2));
    const rows: Awaited<ReturnType<typeof run>>[] = [];
    // 每局独立保存，便于故障追溯；只启动有限数量的计算工作线程。
    await Promise.all(Array.from({ length: workerCount }, (_, shard) => new Promise<void>((resolve, reject) => {
        const bridge = `(async () => { const { register } = await import('tsx/esm/api'); register(); await import(${JSON.stringify(import.meta.url)}); })().catch(e => { console.error(e); process.exit(1); });`;
        const worker = new Worker(bridge, { eval: true, workerData: { out, workerCount, jobs: jobs.filter(j => j.id % workerCount === shard) } });
        worker.on('message', row => {
            if (row.kind === 'progress') { console.log(`对局 #${row.id}：第 ${row.turn} 回合，${row.step} 步`); return; }
            rows.push(row);
            console.log(`${rows.length}/${jobs.length} #${row.id} ${row.subject} ${row.plan} 自然胜=${row.naturalWin} 超时=${row.timeout}`);
        });
        worker.on('error', reject);
        worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`工作线程退出 ${code}`)));
    })));
    rows.sort((a, b) => a.id - b.id);
    await writeFile(`${out}/results.json`, JSON.stringify(rows, null, 2));
    console.log(`评估完成：${out}/results.json`);
}

if (isMainThread) main().catch(error => { console.error(error); process.exitCode = 1; });
else {
    for (const job of workerData.jobs as Job[]) {
        const row = await run(job);
        await appendFile(`${out}/shard-${job.id % workerCount}.jsonl`, JSON.stringify(row) + '\n');
        parentPort!.postMessage(row);
    }
}
