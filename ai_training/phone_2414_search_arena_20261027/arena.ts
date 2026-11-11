/** 手机新对局评测：只推理与执行新动作，不训练、不加载历史动作重放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { APK_HARD_RUNTIME_SCRIPT_SHA256 } from '../../src/game/ai/runtime/apk_hard_runtime';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../src/ai_runtime/dual_v3/search_policy';
import { SyncInference } from './sync_inference';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';

const WORK = process.env.AEII_ARENA_WORK ?? path.dirname(new URL(import.meta.url).pathname);
const sha = (x: string | Uint8Array) => crypto.createHash('sha256').update(x).digest('hex');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(WORK, name), 'utf8'));
function save(name: string, value: unknown) {
    const file = path.join(WORK, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.tmp', file);
}
function rng(seed: number) {
    let value = seed >>> 0;
    return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function stats(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const q = (x: number) => sorted[Math.max(0, Math.ceil(sorted.length * x) - 1)] ?? null;
    return { count: values.length, meanMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99), maxMs: q(1), over1000ms: values.filter(x => x > 1000).length };
}
async function pauseResources() {
    const start = performance.now(); let paused = false;
    for (;;) {
        const r = read('RESOURCE.json');
        const fresh = r.valid && Date.now() / 1000 - r.epoch < 30;
        const okay = fresh && r.temperatureC <= (paused ? 42 : 44.99)
            && r.batteryPercent >= (paused ? 25 : 20) && r.freeKiB * 1024 >= (paused ? 2.25 : 2) * 1024 ** 3;
        if (okay) return paused ? performance.now() - start : 0;
        paused = true;
        save('WAITING_RESOURCES.json', { at: new Date().toISOString(), resource: r });
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}


function preparation() {
    const maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Mourningstar.aem', '(2) Liberty Port.aem', '(2) The Crossing.aem'];
    const initials = maps.map((mapName, mapIndex) => {
        const state = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup: { initialGold: 300, unitLimit: 30, levelCap: 3 } });
        assert.equal(state.players.length, 2);
        const file = `initial/map-${mapIndex}.json`; save(file, state);
        return { mapName, mapIndex, file, sha256: sha(fs.readFileSync(path.join(WORK, file))) };
    });
    const matches: any[] = [];
    for (const opponent of ['hard', 'simple']) for (const map of initials) for (const seat of [0, 1]) {
        matches.push({ id: `${opponent}-m${map.mapIndex}-s${seat}`, opponent, mapIndex: map.mapIndex, seat,
            seed: 20261027 + map.mapIndex * 101 + seat * 1009 });
    }
    save('PLAN.json', { schema: 'phone-2414-arena-v1', matches, maps: initials, serial: 'c2357770', totalGames: 20,
        opponents: { hard: 'OriginalApkLikeHardAI：APK内嵌困难脚本桥接，记录Java源码移植回退次数', simple: 'HeuristicAI：项目默认简单启发式AI' },
        hardScriptSha256: APK_HARD_RUNTIME_SCRIPT_SHA256, modelPolicy: '冻结2M模型接v6回合搜索；未套用0.5M模型外置校准',
        searchOptions: { budgetMs: 780, maxNodes: 220, beamWidth: 6, maxUnits: 3, defaultQueue: 'full' },
        maxActions: 10000, maxRounds: 200, maxActiveWallMs: 1800000, modelThreads: 2,
        maxDecisionWaitMs: 120000, train: false, replayValidation: false,
        sourceCheckpointSha256: '338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b' });
}

async function run() {
    assert.equal(process.arch, 'arm64', '正式对战必须运行在手机ARM64');
    const plan = read('PLAN.json');
    const outputs: any[] = [];
    const identity = read('IDENTITY.json');
    for (const [file, digest] of Object.entries(identity.runtimeFiles)) assert.equal(sha(fs.readFileSync(path.join(WORK, file))), digest);
    assert.ok(!fs.existsSync(path.join(WORK, 'STARTED.json')), '已有评测记录，拒绝重复启动');
    save('STARTED.json', { at: new Date().toISOString(), pid: process.pid, arch: process.arch, identity, planSha256: sha(fs.readFileSync(path.join(WORK, 'PLAN.json'))) });
    const inference = new SyncInference(WORK);
    const ready = await inference.ready; assert.equal(ready.parameters, 1966910); assert.equal(ready.training, false);
    save('INFERENCE_READY.json', ready);
    // 在真实初始局面上仅做重复前向预热，不执行额外动作或生成额外对局。
    const warm = new GameEngine(read(plan.maps[0].file));
    const warmState = warm.getState();
    const warmLegal = warm.getLegalActions(warmState.currentPlayer).filter(a => a.type !== 'surrender');
    const warmObservation = encodeDualObservation(warmState, warmLegal, new ReachabilityContext(warmState));
    const warmResult = await inference.forward(warmObservation, true);
    save('WARMUP.json', warmResult);
    try {
        for (const slot of plan.matches) {
            const map = plan.maps[slot.mapIndex]; assert.equal(sha(fs.readFileSync(path.join(WORK, map.file))), map.sha256);
            const initial = read(map.file), engine = new GameEngine(initial);
            const ids = initial.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
            const modelPlayer = ids[slot.seat], opposite = ids[1 - slot.seat];
            const random = Math.random; Math.random = rng(slot.seed + 17);
            const hard = new OriginalApkLikeHardAI({ rng: rng(slot.seed + 31) }), simple = new HeuristicAI(rng(slot.seed + 31));
            const searchPolicy = new DualStreamTurnSearchAI({ forward: (observation: any) => inference.forwardSync(observation) } as any, plan.searchOptions);
            const prefix = `matches/${slot.id}`;
            save(`${prefix}/initial.json`, initial);
            const log = fs.openSync(path.join(WORK, prefix, 'steps.jsonl'), 'wx');
            const started = performance.now(); let resourceWaitMs = 0, steps = 0, cutoff: string | null = null, error: string | null = null, surrendered: number | null = null;
            const rootTimes: number[] = [], queueTimes: number[] = [];
            const times: { model: number[]; opponent: number[]; forward: number[]; encode: number[]; nontrivial: number[] } = { model: [], opponent: [], forward: [], encode: [], nontrivial: [] };
            save('PROGRESS.json', { phase: 'playing', completed: outputs.length, total: 20, slot, steps: 0 });
            try {
                while (!engine.isTerminal()) {
                    resourceWaitMs += await pauseResources();
                    const state = engine.getState();
                    if (steps >= plan.maxActions) { cutoff = 'action_truncation'; break; }
                    if (state.turn - initial.turn >= plan.maxRounds) { cutoff = 'round_truncation'; break; }
                    if (performance.now() - started - resourceWaitMs >= plan.maxActiveWallMs) { cutoff = 'wall_truncation'; break; }
                    const beforeSha256 = sha(JSON.stringify(state));
                    const side = state.currentPlayer === modelPlayer ? 'model' : 'opponent';
                    const t0 = performance.now(), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                    assert.ok(legal.length);
                    let action: any, encodeMs = 0, forwardMs = 0, collateMs = 0, rpcMs = 0;
                    inference.resetCounters();
                    let searchTelemetry: any = null;
                    if (side === 'model') {
                        action = searchPolicy.getAction(engine, modelPlayer);
                        searchTelemetry = { ...searchPolicy.telemetry };
                        forwardMs = inference.counters.forwardMs;
                        collateMs = inference.counters.collateMs;
                        rpcMs = inference.counters.rpcMs;
                    } else action = slot.opponent === 'hard' ? hard.getAction(engine, opposite) : simple.getAction(engine, opposite, legal);
                    const code = encodeAction(action);
                    assert.ok(legal.some(a => encodeAction(a) === code), `对战策略返回非法动作：${code}`);
                    assert.equal(sha(JSON.stringify(engine.getState())), beforeSha256, '推理修改了真实局面');
                    const totalMs = performance.now() - t0;
                    times[side].push(totalMs);
                    if (side === 'model') (searchTelemetry.queued ? queueTimes : rootTimes).push(totalMs);
                    if (side === 'model') { times.forward.push(forwardMs); times.encode.push(encodeMs); if (legal.length > 1) times.nontrivial.push(totalMs); }
                    const result = engine.step(action); assert.ok(!result.info.includes('非法动作'), result.info);
                    fs.writeSync(log, JSON.stringify({ step: steps, player: state.currentPlayer, side, action, code,
                        candidates: legal.length, forced: legal.length === 1, totalMs, encodeMs, forwardMs, collateMs, rpcMs,
                        beforeSha256, afterSha256: sha(JSON.stringify(result.state)), turn: state.turn, searchTelemetry, networkCalls: inference.counters.calls,
                        done: result.done, winner: result.state.winner, hardTelemetry: side === 'opponent' && slot.opponent === 'hard' ? { ...hard.telemetry } : null }) + '\n');
                    steps++;
                    if (action.type === 'surrender') surrendered = state.currentPlayer;
                    if (steps % 20 === 0 || engine.isTerminal()) save('PROGRESS.json', { phase: 'playing', completed: outputs.length, total: 20, slot, steps, turn: result.state.turn,
                        modelLatency: stats(times.model), resourceWaitMs, resource: read('RESOURCE.json') });
                    if (steps % 100 === 0) console.log(JSON.stringify({ event: 'progress', id: slot.id, steps, turn: result.state.turn }));
                }
            } catch (cause) { error = cause instanceof Error ? cause.stack ?? cause.message : String(cause); }
            finally { fs.closeSync(log); Math.random = random; }
            const final = engine.getState();
            const classification = error ? 'error' : cutoff ?? (surrendered !== null ? (surrendered === modelPlayer ? 'surrender_loss' : 'surrender_win')
                : final.winner === -1 ? 'natural_draw' : final.winner === getAllianceId(final, modelPlayer) ? 'model_win' : 'model_loss');
            const result = { slot, mapName: map.mapName, modelPlayer, opponentPlayer: opposite, classification,
                terminal: engine.isTerminal(), winner: final.winner, steps, rounds: final.turn - initial.turn, error,
                wallMs: performance.now() - started, resourceWaitMs, latency: { model: stats(times.model), modelNontrivial: stats(times.nontrivial),
                    searchRoot: stats(rootTimes), searchQueue: stats(queueTimes), networkForwardTotalPerDecision: stats(times.forward.filter(x => x > 0)), encoding: stats(times.encode.filter(x => x > 0)), opponent: stats(times.opponent) },
                hardTelemetry: slot.opponent === 'hard' ? hard.telemetry : null };
            save(`${prefix}/final.json`, final); save(`${prefix}/result.json`, result); outputs.push(result);
            save('RESULTS.json', outputs); console.log(JSON.stringify({ event: 'match_complete', ...result }));
        }
    } finally { await inference.close(); }
    save('COMPLETE.json', { at: new Date().toISOString(), games: outputs.length, results: outputs, modelSha256: identity.modelBinarySha256,
        optimizerUpdates: 0, trainingStarted: false, replayValidationExecuted: false });
    save('PROGRESS.json', { phase: 'complete', completed: outputs.length, total: 20 });
}

if (process.argv.includes('--prepare')) preparation();
else run().catch(error => { save('ERROR.json', { at: new Date().toISOString(), error: String(error), stack: error.stack }); console.error(error); process.exitCode = 1; });
