/** 新40局开发实战；记录自然结果、截断、错误与时间判负，禁止加载封存面板。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { InferenceClient } from '../../gpu/inference_client';
import { HERE, ROOT, read, save, fileSha, sha, tally } from './io';
import { arenaPreflight, playerIdentity, naturalCoverage } from './arena_contract';
import { modelAction } from './arena_policy';

const configIndex = process.argv.indexOf('--config');
const positional = process.argv.filter((v, i) => i !== configIndex && (configIndex < 0 || i !== configIndex + 1) && v !== '--preflight-only').slice(2);
const python = positional[2] ?? path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe');
const executionIdentity = arenaPreflight(configIndex < 0 ? undefined : path.resolve(process.argv[configIndex + 1]), python);
const runnerContractSha256 = fileSha(path.join(HERE, 'RUNNER_CONTRACT.json'));
if (process.argv.includes('--preflight-only')) { console.log(JSON.stringify(executionIdentity)); process.exit(0); }
if (positional.length < 2) throw Error('需要模型前缀与新输出目录');
const model = path.resolve(positional[0]), out = path.resolve(positional[1]);
if (fs.existsSync(out)) throw Error('对战输出目录已存在'); fs.mkdirSync(out, { recursive: true });
const plan = read(path.join(HERE, 'ARENA_PANEL.json'));
if (plan.total !== 40 || plan.finalTest || plan.matches.filter((m: any) => m.opponent === 'hard').length !== 20 || plan.matches.filter((m: any) => m.opponent === 'simple').length !== 20) throw Error('实战面板合同不符');
const stat = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return { count: a.length, meanMs: a.reduce((n, v) => n + v, 0) / Math.max(1, a.length), p50Ms: s[Math.floor(s.length * .5)] ?? null, p95Ms: s[Math.floor(s.length * .95)] ?? null, maxMs: s.at(-1) ?? null, over1000ms: a.filter(t => t > 1000).length }; };
save(path.join(out, 'RUN.json'), { model, modelBinarySha256: fileSha(model + '.bin'), modelMetadataSha256: fileSha(model + '.json'), panelSha256: fileSha(path.join(HERE, 'ARENA_PANEL.json')), executionIdentity, runnerContractSha256, runnerSourceSha256: fileSha(path.join(HERE, 'arena.ts')), device: 'cuda:0', source: '新项目引擎对局；不是APK原生人机实战', initialIncome: '保存后开局前态，不再次结算', createdAt: new Date().toISOString() });
const client = new InferenceClient(python, path.join(ROOT, 'ai_training/gpu/infer.py'), 'cuda:0', model), outputs: any[] = [];
try {
    const warm = read(path.join(HERE, plan.slots[0].file)), warmEngine = new GameEngine(warm, { applyInitialTurnStart: false });
    const warmLegal = warmEngine.getLegalActions(warm.currentPlayer).filter(a => a.type !== 'surrender');
    await client.forward([encodeDualObservation(warm, warmLegal, new ReachabilityContext(warm))]);
    for (const slot of plan.matches) {
        const map = plan.slots[slot.slot]; if (fileSha(path.join(HERE, map.file)) !== map.sha256) throw Error('冻结初态摘要变化');
        const initial = read(path.join(HERE, map.file)), engine = new GameEngine(initial, plan.engineOptions);
        const hand = playerIdentity(initial, slot.seat), modelPlayer = hand.modelPlayer;
        const hard = new OriginalApkLikeHardAI({ rng: mulberry32(slot.seed + 31) }), simple = new HeuristicAI(mulberry32(slot.seed + 31));
        const time: any = { model: [], opponent: [] }; let steps = 0, stop: string | null = null, error: string | null = null, timeForfeit: string | null = null;
        const folder = path.join(out, slot.id); fs.mkdirSync(folder); const log = fs.openSync(path.join(folder, 'steps.jsonl'), 'wx'), started = performance.now();
        try {
            while (!engine.isTerminal()) {
                const state = engine.getState();
                if (steps >= plan.maxActions) { stop = 'action_truncation'; break; }
                if (state.turn - initial.turn >= plan.maxRounds) { stop = 'round_truncation'; break; }
                if (performance.now() - started > plan.maxWallMs) { stop = 'wall_truncation'; break; }
                const side = state.currentPlayer === modelPlayer ? 'model' : 'opponent', tick = performance.now(), before = sha(JSON.stringify(state));
                const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'); if (!legal.length) throw Error('合法候选为空');
                let action;
                if (side === 'model') {
                    action = await modelAction(state, legal, client);
                } else action = slot.opponent === 'hard' ? hard.getAction(engine, state.currentPlayer) : simple.getAction(engine, state.currentPlayer, legal);
                const ms = performance.now() - tick; time[side].push(ms);
                if (ms > plan.maxDecisionMs) { timeForfeit = side; stop = 'time_forfeit'; break; }
                if (sha(JSON.stringify(engine.getState())) !== before || !engine.hasLegalAction(state.currentPlayer, action)) throw Error('策略改写前态或返回非法动作');
                const result = engine.step(action); if (result.info.includes('非法动作')) throw Error('权威引擎拒绝动作');
                fs.writeSync(log, JSON.stringify({ step: steps, player: state.currentPlayer, side, action, code: encodeAction(action), candidates: legal.length, ms, turn: state.turn, before, after: sha(JSON.stringify(result.state)), telemetry: side === 'opponent' && slot.opponent === 'hard' ? { ...hard.telemetry } : null }) + '\n'); steps++;
                if (steps % 100 === 0) save(path.join(out, 'PROGRESS.json'), { completed: outputs.length, total: 40, slot, steps, turn: state.turn });
            }
        } catch (e) { error = String(e); stop = error.includes('推理超时') ? 'time_forfeit' : 'runtime_error'; if (stop === 'time_forfeit') timeForfeit = 'model'; } finally { fs.closeSync(log); }
        const final = engine.getState(), natural = !stop && final.winner !== null;
        const classification = natural ? final.winner === -1 ? 'natural_draw' : final.winner === getAllianceId(final, modelPlayer) ? 'natural_win' : 'natural_loss' : stop;
        const result = { ...slot, ...hand, executionIdentity, map: map.map, category: map.category, initialSha256: map.sha256, classification, natural, winner: natural ? final.winner : null, steps, rounds: final.turn - initial.turn, error, timeForfeit, wallMs: performance.now() - started, latency: { model: stat(time.model), opponent: stat(time.opponent) }, hardTelemetry: slot.opponent === 'hard' ? hard.telemetry : null };
        save(path.join(folder, 'result.json'), result); save(path.join(folder, 'final.json'), final); outputs.push(result); save(path.join(out, 'RESULTS.json'), outputs);
        console.log(JSON.stringify(result));
    }
} finally { await client.close(); }
save(path.join(out, 'SUMMARY.json'), { attempted: outputs.length, executionIdentity, eligibleForPromotionComparison: naturalCoverage(outputs) === 40, naturalGames: naturalCoverage(outputs), opponents: Object.fromEntries(['hard', 'simple'].map(o => { const rs = outputs.filter(r => r.opponent === o); return [o, { attempted: rs.length, outcomes: tally(rs, r => r.classification), byMap: Object.fromEntries([...new Set(rs.map(r => r.map))].map(m => [m, tally(rs.filter(r => r.map === m), r => r.classification)])), byColorSeat: { seat0: tally(rs.filter(r => r.seat === 0), r => r.classification), seat1: tally(rs.filter(r => r.seat === 1), r => r.classification) }, byActualHand: { first: tally(rs.filter(r => r.actualHand === 'first'), r => r.classification), second: tally(rs.filter(r => r.actualHand === 'second'), r => r.classification) } }]; })), games: outputs, finalTestEvaluated: false, caveat: '40局仅筛选；多人和未知地图泛化不能据此认定，缺失自然结果不可直接晋升' });
