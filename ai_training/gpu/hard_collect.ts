/** 七类困难复刻采集：原脚本决策＋GPU评分＋权威引擎结算，不运行历史重放。 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, mulberry32 } from '../../src/game/env';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { HardGpuBridge } from './hard_bridge';
import { ROOT, JOBS, readJobs, createJobState, hash, fileSha } from './hard_jobs';

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('hard_collect.ts --out 独立目录 [--limit 1000] [--validate-decisions] [--max-actions 冒烟上限]；支持同目录继续，保留全部尝试，成功局不重采。'); process.exit(0); }
function arg(key: string, fallback?: string) { const i = args.indexOf(key); const value = i < 0 ? fallback : args[i + 1]; if (!value) throw Error(`缺少参数${key}`); return value; }
const out = path.resolve(arg('--out')), limit = Number(arg('--limit', '1000')), verify = args.includes('--validate-decisions');
const override = args.includes('--max-actions') ? Number(arg('--max-actions')) : null;
if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || override !== null && (!Number.isInteger(override) || override < 1)) throw Error('局数/冒烟上限无效');
const jobs = readJobs();
fs.mkdirSync(out, { recursive: true });
const save = (file: string, value: unknown) => { const p = path.join(out, file), tmp = p + '.pending'; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, p); };
const sourceNames = ['src/game/ai/original_apk_like_hard_ai.ts', 'src/game/ai/original_apk_like_hard_snapshot.ts',
    'src/game/ai/original_apk_like_hard_native_ai.ts', 'src/game/ai/original_apk_like_hard_native_scoring.ts',
    'src/game/ai/runtime/apk_hard_runtime.ts', 'src/game/ai/runtime/apk_hard_policy.generated.js',
    'src/game/engine.ts', 'src/game/rules.ts', 'src/game/map.ts', 'src/game/rule_config.ts',
    'ai_training/gpu/hard_jobs.ts', 'ai_training/gpu/hard_collect.ts', 'ai_training/gpu/hard_bridge.ts',
    'ai_training/gpu/hard_bridge_worker.cjs', 'ai_training/gpu/hard_kernel.py', 'ai_training/gpu/hard_hip.py', 'ai_training/gpu/hard_score.hip'];
const identity = { jobsSha256: fileSha(JOBS), sources: Object.fromEntries(sourceNames.map(n => [n, fileSha(path.join(ROOT, n))])) };
const runFile = path.join(out, 'RUN.json');
if (fs.existsSync(runFile)) {
    const prior = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    if (hash(prior.identity) !== hash(identity) || prior.override !== override) throw Error('恢复源码、输入身份或动作预算变化；保留现场并使用新目录');
} else save('RUN.json', { schema: 'hard-project-replica-gpu-v1', identity, override, created: new Date().toISOString(),
    source: 'project-apk-hard-replica-gpu', nativeApkEquivalent: false, neuralModelUsed: false,
    authorization: '用户2026-10-29明确要求基于项目困难AI复刻修改代码使用GPU采集',
    range: [2001, 3000], initialization: '保留冻结job，普通开局一次收益，派生快照不重复结算',
    replay: 'disabled_by_user', tensorGeneration: false, training: false, maximumAttempts: 3,
    pilotGate: '前42观察父局每格至少一自然结束，否则暂停同格后续任务' });
const lock = path.join(out, 'RUNNING.lock');
try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' }); }
catch { throw Error('采集目录已有运行锁；先核实进程，禁止同时重复启动'); }
const started = performance.now(), results = new Map<number, any>();
const resultPath = (seq: number) => path.join(out, `parent-${seq}/result.json`);
for (const job of jobs) if (fs.existsSync(resultPath(job.executionSequence))) results.set(job.executionSequence, JSON.parse(fs.readFileSync(resultPath(job.executionSequence), 'utf8')));
const cell = (job: any) => `${job.category}:${job.actualPlayerCount}`;
let bridge: HardGpuBridge | null = null, active: any = null;
const summarize = (phase: string) => {
    const values = [...results.values()];
    const blockedCells = [...new Set(jobs.slice(0, 42).map(cell))].filter(key => {
        const pair = jobs.slice(0, 42).filter(j => cell(j) === key);
        return pair.every(j => results.has(j.executionSequence)) && !pair.some(j => results.get(j.executionSequence)?.natural);
    });
    const value = { phase, pid: process.pid, requestedLimit: limit, natural: values.filter(r => r.natural).length,
        truncated: values.filter(r => r.stop === 'action_truncation' || r.stop === 'wall_truncation').length,
        errors: values.filter(r => r.stop === 'error').length, endedParents: results.size,
        unattempted: jobs.filter(j => !results.has(j.executionSequence)).length, blockedCells, active,
        gpu: bridge?.stats, wallSeconds: (performance.now() - started) / 1000, updated: new Date().toISOString() };
    save('PROGRESS.json', value); return value;
};
try {
    bridge = new HardGpuBridge(path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe'));
    save(`DEVICE-${Date.now()}.json`, bridge.identity);
    for (let index = 0; index < limit; index++) {
        const job = jobs[index], seq = job.executionSequence, prior = results.get(seq);
        if (prior && (prior.stop !== 'error' && prior.stop !== 'stopped' || prior.attempt >= 3)) continue;
        if (index >= 42 && summarize('collecting').blockedCells.includes(cell(job))) continue;
        if (fs.existsSync(path.join(out, 'STOP'))) { summarize('stopped'); break; }
        const parent = path.join(out, `parent-${seq}`); fs.mkdirSync(parent, { recursive: true });
        const previousAttempts = fs.readdirSync(parent).filter(n => /^attempt-\d+$/.test(n));
        const attempt = previousAttempts.length + 1;
        if (attempt > 3) continue;
        const directory = path.join(parent, `attempt-${attempt}`); fs.mkdirSync(directory);
        // 创建尝试目录即计实际启动；崩溃后恢复不会覆盖旧尝试或重置预算。
        fs.writeFileSync(path.join(directory, 'job.json'), JSON.stringify(job));
        const beforeGpu = { ...bridge.stats }, begin = performance.now();
        let steps = 0, stop = 'error', error: string | null = null, engine: GameEngine | null = null;
        let cpuMs = 0, gpuMs = 0;
        const ais = new Map<number, OriginalApkLikeHardAI>(), shadows = new Map<number, OriginalApkLikeHardAI>();
        try {
            const initial = createJobState(job);
            fs.writeFileSync(path.join(directory, 'initial.json'), JSON.stringify({ requestedInitialStateSha256: job.initialStateSha256, projectStateSha256: hash(initial), projectState: initial, replay: 'disabled_by_user' }));
            engine = new GameEngine(initial, { applyInitialTurnStart: false });
            for (const player of initial.players.filter(p => p.isAlive)) {
                const seed = (job.seed ^ Math.imul(player.id + 1, 0x9e3779b9)) >>> 0;
                ais.set(player.id, new OriginalApkLikeHardAI({ rng: mulberry32(seed), compute: {
                    populationLimit: job.setup.unitLimit, movementBatch: bridge.compute, verifyMovementBatch: verify,
                } }));
                if (verify) shadows.set(player.id, new OriginalApkLikeHardAI({ rng: mulberry32(seed), compute: { populationLimit: job.setup.unitLimit } }));
            }
            stop = 'action_truncation';
            const maxActions = override ?? job.maxActions;
            for (; steps < maxActions; steps++) {
                const state = engine.getState();
                if (state.winner !== null) { stop = 'natural'; break; }
                if ((performance.now() - begin) / 1000 > job.maxEffectiveSeconds) { stop = 'wall_truncation'; break; }
                if (fs.existsSync(path.join(out, 'STOP'))) { stop = 'stopped'; break; }
                if (steps % 20 === 0) {
                    const disk = fs.statfsSync(out); if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw Error('空间低于2GiB，保留现场并停止');
                    active = { executionSequence: seq, category: job.category, players: job.actualPlayerCount, attempt, steps, turn: state.turn };
                    summarize('collecting');
                }
                const ai = ais.get(state.currentPlayer)!;
                const shadow = shadows.get(state.currentPlayer);
                let expected: ReturnType<OriginalApkLikeHardAI['getAction']> | null = null;
                const cpu = () => { const t = performance.now(); expected = shadow!.getAction(engine!, state.currentPlayer); cpuMs += performance.now() - t; };
                if (shadow && steps % 2 === 0) cpu();
                const t = performance.now(), action = ai.getAction(engine, state.currentPlayer); gpuMs += performance.now() - t;
                bridge.assertHealthy();
                if (shadow && steps % 2 !== 0) cpu();
                if (shadow && (encodeAction(action) !== encodeAction(expected!) || hash(ai.telemetry) !== hash(shadow.telemetry))) throw Error('当前状态CPU/GPU决策或回退行为不一致');
                if (!engine.hasLegalAction(state.currentPlayer, action)) throw Error('困难复刻返回非法动作');
                const result = engine.step(action);
                if (result.info.includes('非法动作')) throw Error('权威引擎拒绝动作');
                fs.appendFileSync(path.join(directory, 'decisions.jsonl.gz'), gzipSync(JSON.stringify({ step: steps, before: state, action, afterSha256: hash(result.state), telemetry: ai.telemetry }) + '\n', { level: 1 }));
            }
            if (engine.getState().winner !== null) stop = 'natural';
        } catch (failure) { error = String(failure); stop = 'error'; }
        const final = engine?.getState(), natural = stop === 'natural';
        const result = { executionSequence: seq, parentId: job.parentId, category: job.category, players: job.actualPlayerCount,
            attempt, steps, stop, natural, winner: natural ? final?.winner : null, error,
            source: 'project-apk-hard-replica-gpu', verifyCurrentDecisions: verify, historicalReplay: 'disabled_by_user',
            wallSeconds: (performance.now() - begin) / 1000, cpuDecisionMs: shadowTotal(cpuMs, verify), gpuDecisionMs: gpuMs,
            gpuRequests: bridge.stats.requests - beforeGpu.requests, gpuCandidates: bridge.stats.candidates - beforeGpu.candidates,
            cachedGpuResults: bridge.stats.cacheHits - beforeGpu.cacheHits, cachedGpuCandidates: bridge.stats.cachedCandidates - beforeGpu.cachedCandidates,
            gpuKernelAndTransferSeconds: bridge.stats.kernelAndTransferSeconds - beforeGpu.kernelAndTransferSeconds,
            gpuBridgeMs: bridge.stats.bridgeMs - beforeGpu.bridgeMs,
            telemetry: Object.fromEntries([...ais].map(([id, ai]) => [id, ai.telemetry])) };
        fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
        if (final) fs.writeFileSync(path.join(directory, 'final.json'), JSON.stringify(final));
        save(`parent-${seq}/result.json`, result); results.set(seq, result); active = null;
        console.log(JSON.stringify(result)); summarize('collecting');
        if (error) throw Error(`执行局${seq}失败：${error}`);
        if (stop === 'stopped') break;
    }
    summarize(fs.existsSync(path.join(out, 'STOP')) ? 'stopped' : 'segment_complete');
} catch (error) { save(`ERROR-${Date.now()}.json`, { error: String(error), active }); summarize('error'); throw error; }
finally { await bridge?.close(); fs.unlinkSync(lock); }

function shadowTotal(value: number, enabled: boolean) { return enabled ? value : null; }
