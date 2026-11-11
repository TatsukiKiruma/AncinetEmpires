/** 全人数无搜索评测；独立困难AI实例、自然名次与非自然结果分别记录。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { InferenceClient } from '../../gpu/inference_client';
import { HERE, ROOT, read, save, fileSha, sha } from '../stage1/io';
import { S3, preflight, sealedAllowed } from './identity';

const [modelArg, outArg, split = 'dev', scaleArg = '1.0'] = process.argv.slice(2);
if (!modelArg || !outArg || !['dev', 'test', 'historical'].includes(split)) throw Error('需要模型、新输出目录、dev/test/historical和先验系数');
const scale = Number(scaleArg); if (![0, .3, 1].includes(scale)) throw Error('推理先验系数不在冻结集合');
const contractSha256 = preflight(); if (split === 'test') sealedAllowed();
const model = path.resolve(modelArg), out = path.resolve(outArg);
if (fs.existsSync(out)) throw Error('不可覆盖已有实战'); fs.mkdirSync(out, { recursive: true });
const panelFile = split === 'historical' ? path.join(HERE, 'ARENA_PANEL.json') : path.join(S3, `OMNI_ARENA_${split.toUpperCase()}_PANEL.json`);
const panel = read(panelFile), initialManifest = split === 'historical' ? panel : read(path.join(S3, `${split.toUpperCase()}_INITIAL_MANIFEST.json`));
if (panel.matches.length !== (split === 'historical' ? 40 : 54)) throw Error('面板局数不符');
if (split !== 'historical' && initialManifest.panelSha256 !== fileSha(panelFile)) throw Error('初态物化面板身份不符');
const python = path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe');
process.env.MIOPEN_USER_DB_PATH = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/miopen-db';
process.env.MIOPEN_CUSTOM_CACHE_DIR = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/miopen-cache';
save(path.join(out, 'RUN.json'), { model, modelSha256: fileSha(model + '.bin'), metadataSha256: fileSha(model + '.json'), panelSha256: fileSha(panelFile), contractSha256, priorScale: scale, split, search: false, device: 'cuda:0' });
const client = new InferenceClient(python, path.join(ROOT, 'ai_training/gpu/infer.py'), 'cuda:0', model);
const outputs: any[] = [];
const stat = (a: number[]) => { const s = [...a].sort((a, b) => a - b); return { count: a.length, meanMs: a.reduce((v, x) => v + x, 0) / Math.max(1, a.length), p95Ms: s[Math.min(s.length - 1, Math.floor(s.length * .95))] ?? null, maxMs: s.at(-1) ?? null }; };
try {
    for (const match of panel.matches) {
        const slot = initialManifest.slots[match.slot], initialFile = path.join(split === 'historical' ? HERE : S3, slot.file);
        if (fileSha(initialFile) !== slot.sha256) throw Error('冻结初态变化');
        const initial = read(initialFile), ids = initial.players.filter((p: any) => p.isAlive).map((p: any) => p.id).sort((a: number, b: number) => a - b);
        const n = ids.length, modelPlayer = ids[match.seat];
        if (new Set(ids.map((id: number) => getAllianceId(initial, id))).size !== n) throw Error('自由混战要求每席独立联盟');
        const engine = new GameEngine(initial, panel.engineOptions);
        const hard = new Map<number, OriginalApkLikeHardAI>(ids.filter((id: number) => id !== modelPlayer).map((id: number) => [id, new OriginalApkLikeHardAI({ rng: mulberry32(match.seed + 31 + (split === 'historical' ? 0 : id * 10007)) })]));
        const simple = new HeuristicAI(mulberry32(match.seed + 31));
        const times: Record<string, number[]> = { model: [], opponent: [] }, rank = new Map<number, number>(), eliminations: any[] = [];
        const folder = path.join(out, match.id); fs.mkdirSync(folder);
        const fd = fs.openSync(path.join(folder, 'steps.jsonl'), 'wx');
        let steps = 0, stop: string | null = null, error: string | null = null;
        const started = performance.now();
        try {
            while (!engine.isTerminal()) {
                const state = engine.getState();
                if (steps >= panel.maxActions) { stop = 'action_truncation'; break; }
                if (state.turn - initial.turn >= panel.maxRounds) { stop = 'round_truncation'; break; }
                if (performance.now() - started > panel.maxWallMs) { stop = 'wall_truncation'; break; }
                const side = state.currentPlayer === modelPlayer ? 'model' : 'opponent', tick = performance.now(), before = sha(JSON.stringify(state));
                const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                if (!legal.length) throw Error('没有合法非投降候选');
                let action;
                if (side === 'model') {
                    if (legal.length === 1) action = legal[0];
                    else {
                        const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context), prior = softPriors(state, legal, context);
                        const response = (await client.forward([observation]))[0];
                        if (response.logits.length !== observation.actions.sourceIndices.length || !response.logits.every(Number.isFinite)) throw Error('推理响应无效');
                        let best = 0, value = -Infinity;
                        response.logits.forEach((v: number, i: number) => { const score = v + scale * prior[observation.actions.sourceIndices[i]]; if (score > value) { value = score; best = i; } });
                        action = legal[observation.actions.sourceIndices[best]];
                    }
                } else action = match.opponent === 'simple' ? simple.getAction(engine, state.currentPlayer, legal) : hard.get(state.currentPlayer)!.getAction(engine, state.currentPlayer);
                const ms = performance.now() - tick; times[side].push(ms);
                if (ms > panel.maxDecisionMs) { stop = 'time_forfeit'; break; }
                if (sha(JSON.stringify(engine.getState())) !== before || !engine.hasLegalAction(state.currentPlayer, action)) throw Error('策略改变前态或动作非法');
                const result = engine.step(action); if (result.info.includes('非法动作')) throw Error('引擎拒绝动作');
                const alive = state.players.filter(p => p.isAlive), newly = alive.filter(p => !result.state.players.find(q => q.id === p.id)?.isAlive);
                if (newly.length) {
                    const averagePlace = alive.length - (newly.length - 1) / 2;
                    const score = (n - averagePlace) / (n - 1);
                    for (const p of newly) rank.set(p.id, score);
                    eliminations.push({ step: steps, ids: newly.map(p => p.id), averagePlace, normalizedRank: score });
                }
                fs.writeSync(fd, JSON.stringify({ step: steps, player: state.currentPlayer, side, action, code: encodeAction(action), candidates: legal.length, ms, before, after: sha(JSON.stringify(result.state)) }) + '\n');
                steps++;
                if (steps % 100 === 0) save(path.join(out, 'PROGRESS.json'), { completed: outputs.length, total: panel.matches.length, match: match.id, steps, turn: state.turn });
            }
        } catch (e) { error = String(e); stop = error.includes('推理超时') ? 'time_forfeit' : 'runtime_error'; }
        finally { fs.closeSync(fd); }
        const final = engine.getState(), natural = !stop && final.winner !== null, won = natural && final.winner !== -1 && final.winner === getAllianceId(final, modelPlayer);
        const alive = final.players.filter((p: any) => p.isAlive);
        if (natural) {
            if (won) rank.set(modelPlayer, 1);
            else if (!rank.has(modelPlayer)) rank.set(modelPlayer, (n - (alive.length + 1) / 2) / (n - 1));
        }
        const result = { ...match, players: n, map: slot.map, category: slot.category, priorScale: scale, modelPlayer,
            firstToActPlayer: initial.currentPlayer, actualHand: modelPlayer === initial.currentPlayer ? 'first' : 'later',
            initialSha256: slot.sha256, natural, classification: natural ? won ? 'natural_win' : final.winner === -1 ? 'natural_draw' : 'natural_loss' : stop,
            winner: natural ? final.winner : null, firstPlace: natural ? Number(won) : null, normalizedRank: natural ? rank.get(modelPlayer) : null,
            eliminations, steps, rounds: final.turn - initial.turn, error, wallMs: performance.now() - started,
            latency: { model: stat(times.model), opponent: stat(times.opponent) },
            hardTelemetry: [...hard.entries()].map(([id, ai]) => ({ id, ...ai.telemetry })) };
        save(path.join(folder, 'result.json'), result); save(path.join(folder, 'final.json'), final);
        outputs.push(result); save(path.join(out, 'RESULTS.json'), outputs);
        console.log(JSON.stringify({ id: result.id, classification: result.classification, normalizedRank: result.normalizedRank, steps: result.steps }));
    }
} finally { await client.close(); }
const byPlayers = Object.fromEntries([2, 3, 4].map(n => {
    const rows = outputs.filter(r => r.players === n), natural = rows.filter(r => r.natural);
    return [n, { attempted: rows.length, natural: natural.length, wins: natural.filter(r => r.firstPlace).length,
        winRate: natural.length ? natural.reduce((a, r) => a + r.firstPlace, 0) / natural.length : null,
        normalizedRank: natural.length ? natural.reduce((a, r) => a + r.normalizedRank, 0) / natural.length : null,
        truncations: rows.filter(r => String(r.classification).includes('truncation')).length,
        errors: rows.filter(r => r.classification === 'runtime_error').length,
        timeForfeits: rows.filter(r => r.classification === 'time_forfeit').length }];
}));
save(path.join(out, 'SUMMARY.json'), { attempted: outputs.length, total: panel.matches.length, complete: outputs.length === panel.matches.length,
    allNatural: outputs.every(r => r.natural), byPlayers, contractSha256, priorScale: scale, modelSha256: fileSha(model + '.bin'),
    panelSha256: fileSha(panelFile), split, source: '项目权威引擎与困难脚本复刻，不是APK原生实战', games: outputs });
