import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import type { Action, GameState } from '../../../src/game/types';
import type { SearchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { BatchedNeuralBeamSearchAI } from './teacher_search';
import { fastAction, validTeacher } from './league_policy';
import type { WorkerModel } from './worker_model';
import type { Cut, Role } from './league_schedule';

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
type LeagueJob = { gameId: string; generation: number; players: number; kind: string; map: string; seed: number;
    database: string; state: GameState; roles: Record<number, Role>; candidate: number; cut: Omit<Cut, 'state'> | null;
    sourceIdentity: string; config: any; deadlineMs: number; candidateModelSha256: string };

/** 每步原子保存选招、随机状态及教师掩码；自然终局才打开价值标签。 */
export async function leagueGame(job: LeagueJob, upstream: WorkerModel) {
    fs.mkdirSync(path.dirname(job.database), { recursive: true });
    const db = new DatabaseSync(job.database);
    try {
        db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, identity TEXT, value TEXT); CREATE TABLE IF NOT EXISTS steps (step INTEGER PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS cuts (turn INTEGER PRIMARY KEY, step INTEGER, state TEXT);');
        const identity = hash({ ...job, database: undefined, deadlineMs: undefined });
        const prior = db.prepare('SELECT identity,value FROM progress WHERE id=1').get();
        assert(!prior || prior.identity === identity, '训练断点身份不一致');
        const store = db.prepare('INSERT OR REPLACE INTO progress VALUES(1,?,?)');
        const insert = db.prepare('INSERT INTO steps VALUES(?,?)');
        const cutInsert = db.prepare('INSERT OR IGNORE INTO cuts VALUES(?,?,?)');
        const p = prior ? JSON.parse(String(prior.value)) : { state: job.state, step: 0, rng: job.seed >>> 0 || 1,
            substantial: 0, fullRoots: 0, validTeachers: 0, complete: false, natural: false, winner: null, classification: null };
        const result = () => ({ ...p, state: undefined, gameId: job.gameId, players: job.players, map: job.map, kind: job.kind,
            candidate: job.candidate, won: p.natural && p.winner !== -1 && p.winner === getAllianceId(job.state, job.candidate),
            database: job.database, cut: job.cut, valueMask: p.natural });
        if (p.complete) return result();
        const rng = () => { let x = p.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; p.rng = x >>> 0; return p.rng / 2 ** 32; };
        const hard = new Map(Object.entries(job.roles).filter(([, role]) => role === 'hard').map(([id]) => [Number(id),
            new OriginalApkLikeHardAI({ rng: mulberry32(job.seed + Number(id) * 10007 + 31) })]));
        if (p.step && hard.size) {
            const replay = new GameEngine(job.state, { applyInitialTurnStart: false });
            let step = 0;
            for (const row of db.prepare('SELECT value FROM steps ORDER BY step').iterate()) {
                const t = JSON.parse(String(row.value)), state = replay.getState();
                assert(t.step === ++step && t.player === state.currentPlayer);
                const ai = hard.get(t.player);
                if (ai) assert.equal(encodeAction(ai.getAction(replay, t.player)), t.code, '训练断点 HardAI 不一致');
                assert(replay.hasLegalAction(t.player, t.action), '训练断点动作非法');
                replay.step(t.action);
            }
            assert(step === p.step && hash(replay.getState()) === hash(p.state), '训练断点终态不一致');
        }
        const engine = new GameEngine(p.state, { applyInitialTurnStart: false });
        store.run(identity, JSON.stringify(p));
        while (!engine.isTerminal()) {
            if (Date.now() >= job.deadlineMs) return { ...result(), wallLimit: true };
            const state = engine.getState(), current = state.currentPlayer, round = state.turn - job.state.turn;
            if (round >= 80) { p.classification = 'round_truncation'; break; }
            const legal = engine.getLegalActions(current).filter(a => a.type !== 'surrender');
            assert(legal.length, '训练局没有非投降合法动作');
            const role = job.roles[current];
            assert(role, '联赛席位缺失');
            let action: Action = legal[0], teacher: SearchTeacher | null = null;
            let full = false, nodes = 0;
            if (role === 'hard') action = hard.get(current)!.getAction(engine, current);
            else if (legal.length >= 2) {
                p.substantial++;
                const model = { supportsValueOnly: true, forwardBatch: (obs: Parameters<WorkerModel['forwardBatch']>[0],
                    context?: { valueOnly?: boolean }) => upstream.forwardBatch(obs, { ...context, model: role === 'C1' ? 'C1' : undefined }) };
                full = rng() < .25;
                if (full) {
                    const ai = new BatchedNeuralBeamSearchAI(model, { ...job.config,
                        modelVersion: role === 'C1' ? job.config.modelVersion : job.candidateModelSha256 });
                    action = await ai.getAction(engine, current);
                    const t = ai.telemetry;
                    if (t.overBudget || t.budgetExpirations) throw Error(`完整教师触及安全时限：${job.gameId}/${p.step}`);
                    p.fullRoots++; nodes = t.nodes;
                    if (role === 'candidate') { teacher = t.teacher; if (validTeacher(teacher)) p.validTeachers++; }
                } else action = await fastAction(model, state, legal, rng, round);
            }
            assert(action.type !== 'surrender' && engine.hasLegalAction(current, action), '训练联赛动作非法或投降');
            const after = engine.step(action).state;
            p.step++; p.state = after;
            const trace = { step: p.step, player: current, action, code: encodeAction(action), role, full, teacher, nodes };
            db.exec('BEGIN');
            try {
                insert.run(p.step, JSON.stringify(trace));
                if (after.turn !== state.turn && round >= 7 && round < 40 && after.players.every(x => x.isAlive))
                    cutInsert.run(after.turn, p.step, JSON.stringify(after));
                store.run(identity, JSON.stringify(p)); db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        p.complete = true; p.natural = engine.isTerminal(); p.winner = p.natural ? engine.getState().winner : null;
        p.classification ??= p.natural ? 'natural' : 'unknown';
        store.run(identity, JSON.stringify(p));
        return result();
    } finally { db.close(); }
}
