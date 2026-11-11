import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { DeploymentAgent } from './deployment_agent';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import type { GameState } from '../../../src/game/types';
import type { WorkerModel } from '../stage7/worker_model';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** 复用正式面板策略；逐步原子提交状态、轨迹和对手随机计数。 */
export async function arenaGame(job: any, model: WorkerModel) {
    fs.mkdirSync(path.dirname(job.database), { recursive: true });
    const db = new DatabaseSync(job.database);
    try {
        db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, identity TEXT, value TEXT); CREATE TABLE IF NOT EXISTS steps (step INTEGER PRIMARY KEY, value TEXT);');
        const { initial, match, limits, config, sourceIdentity } = job;
        const identity = digest({ initial, match, limits, config, sourceIdentity, split: job.split });
        const prior = db.prepare('SELECT identity,value FROM progress WHERE id=1').get();
        if (prior && prior.identity !== identity) throw Error('评测断点身份不一致');
        const store = db.prepare('INSERT OR REPLACE INTO progress VALUES(1,?,?)');
        const insert = db.prepare('INSERT INTO steps VALUES(?,?)');
        const p = prior ? JSON.parse(String(prior.value)) : { state: initial, steps: 0, modelSteps: 0, nodes: 0, timeForfeits: 0,
            fallbacks: 0, policyTop1Selections: 0, rank: {}, eliminations: [], activeMs: 0, stop: null, error: null, complete: false };
        const engine = new GameEngine(p.state, { ...limits.engineOptions, applyInitialTurnStart: false });
        const ids = (initial as GameState).players.filter(x => x.isAlive).map(x => x.id).sort((a, b) => a - b);
        if (ids.length !== job.players || new Set(ids.map(id => getAllianceId(initial, id))).size !== ids.length) throw Error('评测不是所声明人数的自由混战');
        const seat = ids[match.seat];
        if (seat === undefined) throw Error('评测座位不存在');
        const hard = new Map(ids.filter(id => id !== seat).map(id => [id, new OriginalApkLikeHardAI({
            rng: mulberry32(match.seed + 31 + (job.split === 'historical' ? 0 : id * 10007)),
        })]));
        const simple = new HeuristicAI(mulberry32(match.seed + 31));
        const anchorAI = match.opponent === 'K1' ? new DeploymentAgent(job.anchorModel) : undefined;
        const opponentAction = (game: GameEngine, id: number) => match.opponent === 'K1' ? anchorAI!.getAction(game, id) : match.opponent === 'simple'
            ? simple.getAction(game, id, game.getLegalActions(id).filter(a => a.type !== 'surrender')) : hard.get(id)!.getAction(game, id);
        if (prior && !p.complete && p.steps) {
            // 只在恢复时按主键顺序回放该局，重建 HardAI 的复合动作队列和随机流；不重新搜索模型动作。
            const replay = new GameEngine(initial, { ...limits.engineOptions, applyInitialTurnStart: false });
            let steps = 0;
            for (const row of db.prepare('SELECT value FROM steps ORDER BY step').iterate()) {
                const t = JSON.parse(String(row.value)), state = replay.getState();
                if (t.step !== ++steps || t.player !== state.currentPlayer || t.before !== digest(state)) throw Error('评测断点轨迹前态不一致');
                if (t.player !== seat && match.opponent !== 'K1' && encodeAction(opponentAction(replay, t.player)) !== t.code) throw Error('评测断点对手动作不一致');
                if (!replay.hasLegalAction(t.player, t.action) || digest(replay.step(t.action).state) !== t.after) throw Error('评测断点动作或后态不一致');
            }
            if (steps !== p.steps || digest(replay.getState()) !== digest(p.state)) throw Error('评测断点与轨迹终态不一致');
        }
        const ai = new DeploymentAgent(job.candidateModel);
        // 正式配置不跨根保留行动队列，因此断点不需要恢复 AI 内部缓存。
        if (!config.ownTurnRollout) throw Error('评测配置必须启用完整回合搜索');
        store.run(identity, JSON.stringify(p));
        while (!p.complete && !engine.isTerminal()) {
            const before = engine.getState(), turn = before.turn;
            const started = performance.now();
            if (Date.now() >= (job.deadlineMs ?? Infinity)) { p.stop = 'wall_limit'; break; }
            if (p.steps >= limits.maxActions || turn - initial.turn >= limits.maxRounds || p.activeMs > limits.maxWallMs) {
                p.stop = p.steps >= limits.maxActions ? 'action_truncation' : turn - initial.turn >= limits.maxRounds ? 'round_truncation' : 'wall_truncation'; break;
            }
            try {
                const current = before.currentPlayer, isModel = current === seat;
                const legal = engine.getLegalActions(current).filter(a => a.type !== 'surrender');
                if (!legal.length) throw Error('未终局却没有合法非投降动作');
                const action = isModel ? ai.getAction(engine, current) : opponentAction(engine, current);
                const ms = performance.now() - started;
                if (ms > limits.maxDecisionMs) { p.stop = 'time_forfeit'; p.timeForfeits++; break; }
                if (action.type === 'surrender' || !engine.hasLegalAction(current, action)) throw Error('策略返回非法动作或投降');
                const after = engine.step(action).state;
                const alive = before.players.filter(x => x.isAlive), newly = alive.filter(x => !after.players.find(y => y.id === x.id)?.isAlive);
                if (newly.length) {
                    const place = alive.length - (newly.length - 1) / 2;
                    for (const unit of newly) p.rank[unit.id] = (ids.length - place) / (ids.length - 1);
                    p.eliminations.push({ step: p.steps, ids: newly.map(x => x.id), place });
                }
                const telemetry = isModel ? ai.telemetry : null;
                if (telemetry) {
                    p.modelSteps++; p.nodes += telemetry.nodes;
                    if (telemetry.stopReason === 'policy_top1_fallback') p.policyTop1Selections++;
                    if (telemetry.stopReason.endsWith('_fallback') || telemetry.stopReason === 'time' && !telemetry.candidates.length) p.fallbacks++;
                }
                p.steps++; p.state = after; p.activeMs += performance.now() - started;
                const trace = { step: p.steps, player: current, action, code: encodeAction(action), ms, before: digest(before), after: digest(after), telemetry };
                db.exec('BEGIN');
                try { insert.run(p.steps, JSON.stringify(trace)); store.run(identity, JSON.stringify(p)); db.exec('COMMIT'); }
                catch (error) { db.exec('ROLLBACK'); throw error; }
            } catch (error) { p.error = String(error); p.stop = 'runtime_error'; break; }
            // 原子决策计时结束后才让出线程，使每worker的两局公平交替且不把排队时间计为该步搜索。
            await yieldTurn();
        }
        p.complete = true;
        store.run(identity, JSON.stringify(p));
        const final = engine.getState(), natural = !p.stop && engine.isTerminal() && final.winner !== null;
        const won = natural && final.winner !== -1 && final.winner === getAllianceId(final, seat);
        const place = (final.players.filter(x => x.isAlive).length + 1) / 2;
        return { ...match, players: ids.length, modelPlayer: seat, natural, won, winner: natural ? final.winner : null,
            normalizedRank: natural ? won ? 1 : p.rank[seat] ?? (ids.length - place) / (ids.length - 1) : null,
            classification: natural ? won ? 'natural_win' : final.winner === -1 ? 'natural_draw' : 'natural_loss' : p.stop,
            steps: p.steps, rounds: final.turn - initial.turn, modelSteps: p.modelSteps, nodes: p.nodes, timeForfeits: p.timeForfeits,
            error: p.error, fallbacks: p.fallbacks, policyTop1Selections: p.policyTop1Selections, activeMs: p.activeMs, database: job.database };
    } finally { db.close(); }
}
