import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { GameEngine } from '../../../src/game/engine';
import type { Action } from '../../../src/game/types';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { tacticalPriorBundle } from '../../../src/ai_runtime/dual_v3/search_policy';
import { BatchedNeuralBeamSearchAI } from './teacher_search';

/** 每步状态和轨迹在同一SQLite事务提交，断点查询固定主键，不扫描历史目录。 */
export async function selfplayGame(job: any, upstream: any) {
    fs.mkdirSync(path.dirname(job.database), { recursive: true });
    const db = new DatabaseSync(job.database);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, identity TEXT, value TEXT); CREATE TABLE IF NOT EXISTS steps (step INTEGER PRIMARY KEY, value TEXT);');
    const identity = crypto.createHash('sha256').update(JSON.stringify({ state: job.state, seed: job.seed, config: job.config,
        fullRootFraction: job.fullRootFraction, maxRounds: job.maxRounds, sourceIdentity: job.sourceIdentity })).digest('hex');
    const prior: any = db.prepare('SELECT identity,value FROM progress WHERE id=1').get();
    if (prior && prior.identity !== identity) { db.close(); throw Error('断点任务身份不一致'); }
    let p = prior ? JSON.parse(prior.value) : { state: job.state, steps: 0, substantial: 0, fullRoots: 0, teachers: 0,
        rng: job.seed >>> 0 || 1, inferenceCalls: 0, wireMs: 0, computeMs: 0, complete: false, natural: false };
    const store = db.prepare('INSERT OR REPLACE INTO progress VALUES(1,?,?)');
    const insert = db.prepare('INSERT INTO steps VALUES(?,?)');
    const rng = () => { let x = p.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; p.rng = x >>> 0; return p.rng / 4294967296; };
    const model = { supportsValueOnly: true, async forwardBatch(observations: any[], context?: any) {
        const start = performance.now();
        try { return await upstream.forwardBatch(observations, context); }
        finally { p.inferenceCalls++; p.wireMs += performance.now() - start; }
    } };
    try {
        if (p.complete) return { ...p, state: undefined, database: job.database, resumed: true };
        const engine = new GameEngine(p.state, { applyInitialTurnStart: false });
        while (!engine.isTerminal()) {
            const state = engine.getState();
            if (state.turn - job.state.turn >= job.maxRounds) { p.stop = 'round_truncation'; break; }
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
            if (!legal.length) throw Error('未终局却无合法非投降动作');
            const start = performance.now();
            let action: Action = legal[0], teacher: any = null, nodes = 0;
            if (legal.length >= 2) {
                p.substantial++;
                if (rng() < job.fullRootFraction) {
                    const ai = new BatchedNeuralBeamSearchAI(model, job.config);
                    action = await ai.getAction(engine, state.currentPlayer);
                    if (ai.telemetry.overBudget || ai.telemetry.budgetExpirations) throw Error('完整教师触及安全时限，不接受部分标签');
                    p.fullRoots++; nodes = ai.telemetry.nodes; teacher = ai.telemetry.teacher;
                    if (teacher?.available) p.teachers++;
                } else {
                    const obs = encodeDualObservation(state, legal);
                    const [out] = await model.forwardBatch([obs]);
                    const { priors, forbidden } = tacticalPriorBundle(state, legal, new ReachabilityContext(state), true);
                    const temperature = state.turn - job.state.turn < 3 ? 1 : .5;
                    const scores = Array.from(obs.actions.sourceIndices, (source, row) => ({ source,
                        value: forbidden?.[source] ? -Infinity : (out.logits[row] + priors[source]) / temperature }));
                    const maximum = Math.max(...scores.map(s => s.value));
                    if (!Number.isFinite(maximum)) throw Error('快走全部候选被禁手过滤');
                    const weights = scores.map(s => Math.exp(s.value - maximum));
                    let target = rng() * weights.reduce((sum, value) => sum + value, 0);
                    let picked = weights.length - 1;
                    for (let i = 0; i < weights.length; i++) { target -= weights[i]; if (target <= 0) { picked = i; break; } }
                    action = legal[scores[picked].source];
                }
            }
            if (action.type === 'surrender' || !engine.hasLegalAction(state.currentPlayer, action)) throw Error('自对弈动作不合法或提前投降');
            const after = engine.step(action).state;
            p.steps++; p.computeMs += performance.now() - start; p.state = after;
            const row = { step: p.steps, player: state.currentPlayer, action, code: encodeAction(action), teacher, nodes };
            db.exec('BEGIN');
            try { insert.run(p.steps, JSON.stringify(row)); store.run(identity, JSON.stringify(p)); db.exec('COMMIT'); }
            catch (error) { db.exec('ROLLBACK'); throw error; }
            if (p.steps % 25 === 0) console.log(JSON.stringify({ game: job.gameId, steps: p.steps, turn: after.turn,
                fullRoots: p.fullRoots, teachers: p.teachers, meanWireMs: p.wireMs / Math.max(1, p.inferenceCalls) }));
        }
        p.complete = true; p.natural = engine.isTerminal(); p.winner = engine.getState().winner;
        p.stop ??= p.natural ? 'natural' : 'unknown';
        p.valueMask = p.natural;
        store.run(identity, JSON.stringify(p));
        return { ...p, state: undefined, database: job.database };
    } finally { db.close(); }
}
