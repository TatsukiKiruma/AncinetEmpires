import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AncientEmpiresEnv } from '../src/game/env';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createEvaluationState, type EvaluationCase } from './skirmish_evaluation_state';
import { loadBcModel } from './skirmish_bc_train';
import { createEndgamePolicy } from './skirmish_endgame_policy';
import { createBcRankerPolicy, createBcHybridPolicy, createBcBlendPolicy, createHeuristicBaselinePolicy, runSkirmishEpisode } from './skirmish_training_runner';

interface Variant { model?: string | null; policy: 'bc' | 'hybrid' | 'blend' | 'blend-progress' | 'finish' | 'tactical-only' | 'teacher-finish' | 'teacher-tactical-only' | 'heuristic' }
interface Job extends EvaluationCase { caseId: number; referenceCaseId?: number | null; snapshotFile?: string; variant: string }
interface Config { variants: Record<string, Variant>; jobs: Job[] }

async function run(job: Job, config: Config, out: string) {
    let prepared = await createEvaluationState(job);
    if (job.snapshotFile) {
        const snapshot = JSON.parse(await readFile(job.snapshotFile, 'utf8'));
        prepared = { ...prepared, state: snapshot.state, subjectId: snapshot.subjectId,
            players: snapshot.state.players.filter((p: { isAlive: boolean }) => p.isAlive).map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b),
            env: new AncientEmpiresEnv({ initialState: snapshot.state, seed: job.seed, maxPlies: 400 }) };
    }
    const { env, state, scenario, players, subjectId } = prepared;
    const variant = config.variants[job.variant];
    // 教师基线变体不带模型权重；需要模型的变体缺权重时明确报错
    const needsModel = variant.policy !== 'heuristic' && !variant.policy.startsWith('teacher');
    if (needsModel && !variant.model) throw new Error(`变体 ${job.variant}（${variant.policy}）缺少模型权重`);
    const model = variant.model ? await loadBcModel(variant.model) : undefined;
    const timings: Record<string, { calls: number; totalMs: number; maxMs: number }> = {};
    const policyDiagnostics: Record<string, unknown> = {};
    const start = performance.now();
    const episode = runSkirmishEpisode({ env, scenario, seed: job.seed, maxPlies: 400, maxSteps: 25600,
        progressIntervalSteps: 100000, progressIntervalTurns: 20,
        onProgress: p => parentPort!.postMessage({ kind: 'progress', id: job.id, turn: p.turn, step: p.step }),
        policyFactory: id => {
            const seed = job.seed + id * 1009 + players.indexOf(id) * 9173;
            const name = id === subjectId ? job.variant : 'heuristic';
            const policy = id !== subjectId || variant.policy === 'heuristic' ? createHeuristicBaselinePolicy(seed)
                : variant.policy === 'finish' || variant.policy === 'teacher-finish' || variant.policy === 'tactical-only' || variant.policy === 'teacher-tactical-only' ? createEndgamePolicy(variant.policy.startsWith('teacher') ? undefined : model,{useMemory:variant.policy==='finish'||variant.policy==='teacher-finish'})
                : variant.policy === 'hybrid' ? createBcHybridPolicy(model!, seed)
                : variant.policy === 'blend' || variant.policy === 'blend-progress' ? createBcBlendPolicy(model!, seed, { preserveProductiveLateMoves: variant.policy === 'blend-progress' }) : createBcRankerPolicy(model!);
            if ('diagnostics' in policy) policyDiagnostics[name] = policy.diagnostics;
            return { name, selectFixedActionIndex(context) {
                const started = performance.now();
                try { return policy.selectFixedActionIndex(context); }
                finally { const ms = performance.now() - started; const t = timings[name] ??= { calls: 0, totalMs: 0, maxMs: 0 }; t.calls++; t.totalMs += ms; t.maxMs = Math.max(t.maxMs, ms); }
            } };
        }
    });
    // 用原评估记录核对初始局面，确保只改变受测策略。
    const reference = job.referenceCaseId === null ? null : job.referenceCaseId ?? job.caseId;
    if (reference !== null) {
        const old = JSON.parse(await readFile(`training_runs/evaluation_20260918/episodes/${reference}.json`, 'utf8'));
        if (old.episode.initialObservationHash !== episode.initialObservationHash) throw new Error(`初始局面不一致：${job.caseId}`);
    }
    await writeFile(`${out}/episodes/${job.id}.json`, JSON.stringify({ job, episode }));
    const alliance = episode.players.find(p => p.id === subjectId)!.allianceId;
    return { ...job, initialObservationHash: episode.initialObservationHash, subjectId, subjectAlliance: alliance, subjectFirst: state.currentPlayer === subjectId, durationMs: performance.now() - start, timings, policyDiagnostics,
        ...episode.summary, naturalWin: episode.summary.winnerAlliance === alliance,
        naturalLoss: episode.summary.winnerAlliance !== null && episode.summary.winnerAlliance !== -1 && episode.summary.winnerAlliance !== alliance,
        adjudicatedWin: episode.summary.winnerAlliance === null && episode.summary.adjudicatedWinnerAlliance === alliance };
}

async function main() {
    const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
    const out = arg('--out-dir', 'training_runs/iteration_20260918/screen');
    const workers = Number(arg('--workers', '8'));
    if (!Number.isInteger(workers) || workers < 1 || workers > 16) throw new Error('worker 数须为 1—16');
    const config: Config = JSON.parse(await readFile(arg('--config', 'training_runs/iteration_20260918/screen-config.json'), 'utf8'));
    await mkdir(out, { recursive: true });
    await mkdir(`${out}/episodes`, { recursive: true });
    const models = Object.fromEntries(await Promise.all(Object.entries(config.variants).map(async ([name, v]) => [name, {
        ...v,
        sha256: v.model ? createHash('sha256').update(await readFile(v.model)).digest('hex') : null
    }])));
    await writeFile(`${out}/manifest.json`, JSON.stringify({ ...config, models, workers, maxPlies: 400, maxSteps: 25600 }, null, 2));
    const rows: Awaited<ReturnType<typeof run>>[] = [];
    const pool: Worker[] = [];
    let next = 0;
    try {
        await Promise.all(Array.from({ length: Math.min(workers, config.jobs.length) }, (_, workerId) => new Promise<void>((resolve, reject) => {
            const bridge = `(async () => { const { register } = await import('tsx/esm/api'); register(); await import(${JSON.stringify(import.meta.url)}); })().catch(e => { console.error(e); process.exit(1); });`;
            const worker = new Worker(bridge, { eval: true, workerData: { config, out, workerId, kind: 'iteration_eval' } });
            pool.push(worker);
            const dispatch = () => worker.postMessage(config.jobs[next++] ?? null);
            worker.on('message', message => {
                if (message.kind === 'ready') { dispatch(); return; }
                if (message.kind === 'progress') { console.log(`#${message.id} 第${message.turn}回合 ${message.step}步`); return; }
                rows.push(message);
                console.log(`完成 ${rows.length}/${config.jobs.length}：${message.variant} #${message.caseId} 胜=${message.naturalWin} 超时=${message.timeout}`);
                dispatch();
            });
            worker.on('error', reject);
            worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker ${workerId} 异常退出 ${code}`)));
        })));
        await writeFile(`${out}/results.json`, JSON.stringify(rows.sort((a, b) => a.id - b.id), null, 2));
    } finally { await Promise.all(pool.map(worker => worker.terminate())); }
}

if (isMainThread) main().catch(e => { console.error(e); process.exitCode = 1; });
else if (workerData.kind === 'iteration_eval') {
    parentPort!.on('message', async (job: Job | null) => {
        if (!job) { parentPort!.close(); return; }
        try {
            const row = await run(job, workerData.config, workerData.out);
            await appendFile(`${workerData.out}/worker-${workerData.workerId}.jsonl`, JSON.stringify(row) + '\n');
            parentPort!.postMessage(row);
        } catch (error) { console.error(error); process.exit(1); }
    });
    parentPort!.postMessage({ kind: 'ready' });
}
