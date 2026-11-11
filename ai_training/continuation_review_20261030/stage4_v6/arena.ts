import { fileURLToPath } from 'node:url';
import { boundedWriter } from './bounded_writer';
/** 第四阶段实战；每个敌席独立实例，冻结预算、自然胜负、截断与运行错误分别落盘。 */
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { Stage4InferenceClient } from './inference_client';
import { InferenceTransportError } from './inference_transport';
import { runtimeIdentity } from './runtime_identity';
import { HERE, ROOT, S3, DATA, read, save, sha, fileSha, modelIdentity, allowSealed } from './io';

const [configArg, outputArg, split = 'dev', subsetArg] = process.argv.slice(2);
if (!configArg || !outputArg || !['dev', 'test', 'historical'].includes(split)) throw Error('需要配置、新输出目录及dev/test/historical');
const configFile = path.resolve(configArg), config = read(configFile), identity = modelIdentity();
if (config.modelVersion !== identity.binSha256) throw Error('搜索配置没有绑定Omni-Base');
if (split !== 'dev') {
    const lock = allowSealed();
    if (lock.configSha256 !== fileSha(configFile)) throw Error('封存配置与唯一锁定不符');
    if (!subsetArg) throw Error('封存必须由唯一令牌下的逐局控制器调度');
}
const panelRoot = split === 'historical' ? path.join(HERE, '../stage1') : S3;
const panelFile = path.join(panelRoot, split === 'historical' ? 'ARENA_PANEL.json' : `OMNI_ARENA_${split.toUpperCase()}_PANEL.json`);
const panel = { ...read(panelFile), maxWallMs: 7200000 }, initialManifest = split === 'historical' ? panel : read(path.join(S3, `${split.toUpperCase()}_INITIAL_MANIFEST.json`));
if (split !== 'historical' && initialManifest.panelSha256 !== fileSha(panelFile)) throw Error('冻结初态面板摘要不符');
if (panel.matches.length !== (split === 'historical' ? 40 : 54)) throw Error('面板局数不符');
const subset = subsetArg ? read(path.resolve(subsetArg)) : null;
if (subset && subset.panelSha256 !== fileSha(panelFile)) throw Error('子集只能引用同一冻结开发面板');
const matches = subset ? panel.matches.filter((m: any) => subset.ids.includes(m.id)) : panel.matches;
if (subset && matches.length !== subset.ids.length) throw Error('子集包含重复或未知局号');
const out = path.resolve(outputArg);
if (fs.existsSync(out)) throw Error('不可覆盖或重跑已有实战目录'); fs.mkdirSync(out, { recursive: true });
const baseRuntime = runtimeIdentity();
const recoverySources = Object.fromEntries([fileURLToPath(import.meta.url), path.join(path.dirname(fileURLToPath(import.meta.url)), 'bounded_writer.ts')].map(file => [file, fileSha(file)]));
const runtime = baseRuntime;
await save(path.join(out, 'RUN.json'), { split, config, configSha256: fileSha(configFile), model: identity, panelSha256: fileSha(panelFile), subsetSha256: subsetArg ? fileSha(path.resolve(subsetArg)) : null,
    runtimeSha256: runtime.sha256, runtimeVersion: runtime.version, baseRuntimeSha256: baseRuntime.sha256, recoverySources, transportWatchdogMs: 10000, softSearchDeadline: '只停止扩展；迟到响应排空后复用服务，时间判负只由面板maxDecisionMs触发',
    frozenPanelMaxWallMs: read(panelFile).maxWallMs, wallClockOverride: 'V6用户授权单局7200秒', engineOptions: panel.engineOptions, maxActions: panel.maxActions, maxRounds: panel.maxRounds, maxWallMs: panel.maxWallMs, maxDecisionMs: panel.maxDecisionMs, started: new Date().toISOString() }, true);
const stat = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return { count: a.length, meanMs: a.reduce((v, x) => v + x, 0) / Math.max(1, a.length), p95Ms: s[Math.min(s.length - 1, Math.floor(s.length * .95))] ?? null, maxMs: s.at(-1) ?? null }; };
let client = new Stage4InferenceClient(identity.prefix);
const outputs: any[] = [], retiredServices: any[] = [];
try {
    for (const match of matches) {
        if (fs.existsSync(path.join(HERE, 'STOP'))) throw Error('用户停止标志：不再启动新局');
        const slot = initialManifest.slots[match.slot], initialFile = path.join(panelRoot, slot.file);
        if (fileSha(initialFile) !== slot.sha256) throw Error('冻结初态变化');
        const initial = read(initialFile), ids = initial.players.filter((p: any) => p.isAlive).map((p: any) => p.id).sort((a: number, b: number) => a - b);
        const n = ids.length, modelPlayer = ids[match.seat];
        if (new Set(ids.map((id: number) => getAllianceId(initial, id))).size !== n) throw Error('自由混战要求各席独立联盟');
        const engine = new GameEngine(initial, panel.engineOptions);
        const hard = new Map<number, OriginalApkLikeHardAI>(ids.filter((id: number) => id !== modelPlayer).map((id: number) => [id, new OriginalApkLikeHardAI({ rng: mulberry32(match.seed + 31 + (split === 'historical' ? 0 : id * 10007)) })]));
        const simple = new HeuristicAI(mulberry32(match.seed + 31));
        // 预热失败时尚未打开轨迹流，确保异常路径没有未关闭写入句柄。
        const warm = encodeDualObservation(initial, engine.getLegalActions(initial.currentPlayer).filter(a => a.type !== 'surrender'));
        await client.forwardBatch([warm]); await client.forwardBatch(Array(32).fill(warm));
        const folder = path.join(out, match.id); fs.mkdirSync(folder);
        const stepsLog = boundedWriter(path.join(folder, 'steps.jsonl.gz')), searchLog = boundedWriter(path.join(folder, 'search.jsonl.gz')), witnessesLog = boundedWriter(path.join(folder, 'witnesses.jsonl.gz'));
        const times: Record<string, number[]> = { model: [], opponent: [] }, rank = new Map<number, number>(), eliminations: any[] = [];
        let steps = 0, roots = 0, witnessCount = 0, witnessActions = 0, collecting = false, witnesses: any[] = [], stop: string | null = null, error: string | null = null, transportFault = false;
        const ai = new BatchedNeuralBeamSearchAI(client, { ...config, responseVariants: config.responseVariants ?? 1, onWitness: w => { if (collecting) witnesses.push(w); } });
        const started = performance.now();
        try {
            while (!engine.isTerminal()) {
                const state = engine.getState();
                const heartbeat = (phase: string) => save(path.join(out, 'HEARTBEAT.json'), { match: match.id, step: steps, turn: state.turn, phase, pid: process.pid, updatedMs: Date.now() });
                await heartbeat('before_action');
                if (steps >= panel.maxActions) { stop = 'action_truncation'; break; }
                if (state.turn - initial.turn >= panel.maxRounds) { stop = 'round_truncation'; break; }
                if (performance.now() - started > panel.maxWallMs) { stop = 'wall_truncation'; break; }
                if (fs.existsSync(path.join(HERE, 'STOP'))) { stop = 'user_stop'; break; }
                const tick = performance.now(), side = state.currentPlayer === modelPlayer ? 'model' : 'opponent', before = sha(JSON.stringify(state));
                const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                if (!legal.length) throw Error('没有合法非投降候选');
                collecting = side === 'model' && roots % 128 === 0; witnesses = [];
                if (side === 'model') client.setLabel(`${match.id}:step-${steps}`);
                const action = side === 'model' ? await ai.getAction(engine, state.currentPlayer) : match.opponent === 'simple' ? simple.getAction(engine, state.currentPlayer, legal) : hard.get(state.currentPlayer)!.getAction(engine, state.currentPlayer);
                const ms = performance.now() - tick; await heartbeat('after_action'); times[side].push(ms);
                if (ms > panel.maxDecisionMs) { stop = 'time_forfeit'; break; }
                if (sha(JSON.stringify(engine.getState())) !== before || !engine.hasLegalAction(state.currentPlayer, action)) throw Error('策略改变前态或动作非法');
                const result = engine.step(action); if (result.info.includes('非法动作')) throw Error('权威引擎拒绝动作');
                const alive = state.players.filter(p => p.isAlive), newly = alive.filter(p => !result.state.players.find(q => q.id === p.id)?.isAlive);
                if (newly.length) {
                    const averagePlace = alive.length - (newly.length - 1) / 2, score = (n - averagePlace) / (n - 1);
                    for (const p of newly) rank.set(p.id, score);
                    eliminations.push({ step: steps, ids: newly.map(p => p.id), averagePlace, normalizedRank: score });
                }
                await heartbeat('writing_logs');
                await stepsLog.write({ step: steps, player: state.currentPlayer, side, action, code: encodeAction(action), candidates: legal.length, ms, before, after: sha(JSON.stringify(result.state)) });
                if (side === 'model') {
                    await searchLog.write({ step: steps, players: n, root: roots, ...ai.telemetry });
                    for (const w of witnesses) {
                        // 抽样保存的每条见证在独立权威引擎上逐动作重放；失败立即中止，不混入实战成绩。
                        const replay = new GameEngine(w.initial, panel.engineOptions);
                        for (const a of w.actions) { if (!replay.hasLegalAction(replay.getState().currentPlayer, a)) throw Error('搜索见证非法'); replay.step(a); witnessActions++; }
                        if (sha(JSON.stringify(replay.getState())) !== sha(JSON.stringify(w.final))) throw Error('搜索见证终态不一致');
                        await witnessesLog.write({ step: steps, root: roots, ...w }); witnessCount++;
                    }
                    if (!ai.telemetry.queued && ai.telemetry.stopReason !== 'unique_action') roots++;
                }
                await heartbeat('logs_written');
                steps++;
                if (steps % 100 === 0) await save(path.join(out, 'PROGRESS.json'), { completed: outputs.length, total: matches.length, match: match.id, steps, turn: state.turn, roots, updated: new Date().toISOString() });
            }
        } catch (e) {
            error = String(e); transportFault = e instanceof InferenceTransportError; stop = 'runtime_error';
            await save(path.join(folder, 'failure-root.json'), { step: steps, state: engine.getState(), search: ai.telemetry, inference: client.diagnostics, error, transportFault }, true);
        }
        finally {
            const closed = await Promise.allSettled([stepsLog.close(), searchLog.close(), witnessesLog.close()]);
            const failed = closed.find(r => r.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
        }
        const final = engine.getState(), natural = !stop && final.winner !== null, won = natural && final.winner !== -1 && final.winner === getAllianceId(final, modelPlayer);
        const alive = final.players.filter(p => p.isAlive);
        if (natural) {
            if (won) rank.set(modelPlayer, 1);
            else if (!rank.has(modelPlayer)) rank.set(modelPlayer, (n - (alive.length + 1) / 2) / (n - 1));
        }
        const result = { ...match, players: n, map: slot.map, category: slot.category, modelPlayer, initialSha256: slot.sha256,
            firstToActPlayer: initial.currentPlayer, actualHand: modelPlayer === initial.currentPlayer ? 'first' : 'later',
            natural, classification: natural ? won ? 'natural_win' : final.winner === -1 ? 'natural_draw' : 'natural_loss' : stop,
            winner: natural ? final.winner : null, firstPlace: natural ? Number(won) : null, normalizedRank: natural ? rank.get(modelPlayer) : null,
            eliminations, earlyEliminated: !final.players.find(p => p.id === modelPlayer)?.isAlive && final.winner === null,
            eliminatedBeforeFinalOpponent: eliminations.some(e => e.ids.includes(modelPlayer) && e.averagePlace > 2),
            steps, rounds: final.turn - initial.turn, roots, witnessCount, witnessActions, allSavedWitnessesLegal: true,
            error, transportFault, runtimeSha256: runtime.sha256, inferenceDiagnostics: client.diagnostics,
            wallMs: performance.now() - started, latency: { model: stat(times.model), opponent: stat(times.opponent) } };
        await save(path.join(folder, 'final.json'), final, true);
        await save(path.join(folder, 'result.json'), result, true); outputs.push(result);
        console.log(JSON.stringify({ id: result.id, classification: result.classification, rank: result.normalizedRank, steps, roots, minutes: result.wallMs / 60000 }));
        if (stop === 'user_stop' || error && !transportFault) throw Error('实战异常，停止后续调度：' + (error ?? stop));
        if (transportFault) {
            // 失败局永久保留为非自然结果，不重试；只为尚未启动的下一局新建服务。
            await client.close(); retiredServices.push({ pid: client.pid, exited: client.exited, diagnostics: client.diagnostics });
            if (outputs.length < matches.length) client = new Stage4InferenceClient(identity.prefix);
        }
    }
} finally { await client.close(); }
await save(path.join(out, 'SUMMARY.json'), { split, attempted: outputs.length, total: matches.length, complete: outputs.length === matches.length, allNatural: outputs.every(r => r.natural), gpuPid: client.pid, gpuExited: client.exited,
    retiredServices, inferenceDiagnostics: client.diagnostics, runtimeSha256: runtime.sha256,
    configSha256: fileSha(configFile), modelSha256: identity.binSha256, panelSha256: fileSha(panelFile), games: outputs, finished: new Date().toISOString() }, true);
