import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import type { GameState, Action } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { getAllianceId, getRuleConfig, getTileIncome, isCommanderUnit } from '../../src/game/rule_config';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';
import { sha, stateHash, gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { GzipLines } from './replay_io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
const save = (n: string, x: unknown) => { fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), JSON.stringify(x, null, 2)); };
const plan = read('battle-plan.json');
function rngStream(seed: number) {
    let state = seed >>> 0, calls = 0;
    return { next() { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); calls++; return ((t ^ t >>> 14) >>> 0) / 4294967296; }, snapshot: () => ({ state, calls }) };
}
function income(state: GameState, ids: number[]) {
    const rules = getRuleConfig(state); let value = 0;
    for (const row of state.map.tiles) for (const tile of row) if (tile.ownerId !== null && ids.includes(tile.ownerId)) value += getTileIncome(state, tile);
    for (const u of state.units) if (ids.includes(u.ownerId) && isCommanderUnit(state, u)) value += rules.incomeCommanderBase + (u.level ?? 0) * rules.incomeCommanderGrowth;
    return value;
}
const counters = () => ({ actions: 0, endTurns: 0, recruitOpportunitySteps: 0, endWithRecruit: 0, unmovedWaits: 0, wastedTacticalWaits: 0, attackOpportunity: 0, attackTaken: 0, moves: 0, actualIncome: 0, attacksReceived: 0, damageReceived: 0, focusVictims: 0, focusDamage: 0, focusDeaths: 0 });
const quantiles = (samples: number[]) => { const sorted = [...samples].sort((a, b) => a - b); return { count: sorted.length, p50: sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)] ?? null, p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null, p99: sorted[Math.max(0, Math.ceil(sorted.length * .99) - 1)] ?? null, max: sorted.at(-1) ?? null }; };
function metricsTracker(modelSeats: number[]) {
    const metrics = { model: counters(), opponent: counters() };
    const hits = new Map<string, { attackers: Set<string>; damage: number; focused: boolean }>();
    function apply(before: GameState, legal: Action[], action: Action, after: GameState) {
        const side = modelSeats.includes(before.currentPlayer) ? 'model' : 'opponent', m = metrics[side];
        m.actions++; m.endTurns += Number(action.type === 'end_turn');
        const recruit = legal.some(a => a.type.startsWith('recruit_'));
        m.recruitOpportunitySteps += Number(recruit); m.endWithRecruit += Number(recruit && action.type === 'end_turn');
        m.attackOpportunity += Number(legal.some(a => a.type === 'attack')); m.attackTaken += Number(action.type === 'attack');
        m.moves += Number(action.type === 'move' || action.type === 'post_attack_move');
        if (action.type === 'wait') {
            const u = before.units.find(u => u.id === action.unitId)!;
            m.unmovedWaits += Number(!u.hasMoved);
            m.wastedTacticalWaits += Number(!u.hasMoved && legal.some(a => a.type === 'attack' && a.attackerId === u.id || a.type === 'capture' && a.unitId === u.id));
        }
        for (const p of after.players) {
            const prior = before.players.find(b => b.id === p.id)!;
            if (p.gold > prior.gold) metrics[modelSeats.includes(p.id) ? 'model' : 'opponent'].actualIncome += p.gold - prior.gold;
        }
        if (action.type === 'attack') {
            const u = before.units.find(u => u.id === action.targetId)!;
            const hp = after.units.find(v => v.id === u.id)?.hp ?? 0, damage = Math.max(0, u.hp - hp);
            const targetSide = modelSeats.includes(u.ownerId) ? 'model' : 'opponent', tm = metrics[targetSide];
            tm.attacksReceived++; tm.damageReceived += damage;
            const hit = hits.get(u.id) ?? { attackers: new Set<string>(), damage: 0, focused: false };
            hit.attackers.add(action.attackerId); hit.damage += damage;
            if (hit.attackers.size >= 2) {
                tm.focusDamage += hit.focused ? damage : hit.damage;
                tm.focusVictims += Number(!hit.focused); tm.focusDeaths += Number(hp <= 0); hit.focused = true;
            }
            hits.set(u.id, hit);
        }
        // 按受击玩家自己的下一回合重置，跨敌方席位累计实际集火。
        if (after.currentPlayer !== before.currentPlayer) for (const u of after.units) if (u.ownerId === after.currentPlayer) hits.delete(u.id);
    }
    return { metrics, apply };
}
async function replay(slot: any) {
    const prefix = `battles/${slot.id}`, result = read(prefix + '/result.json'), initial = read(plan.maps[slot.mapIndex].path);
    const engine = new GameEngine(initial), tracker = metricsTracker(slot.modelSeats); let count = 0;
    for await (const row of gzipRows(fs.readFileSync(path.join(dir, prefix, 'actions.jsonl.gz')))) {
        const before = engine.getState(); assert.equal(stateHash(before), row.beforeHash);
        const legal = engine.getLegalActions(before.currentPlayer);
        const action = legal.find(a => encodeAction(a) === row.code); assert.ok(action && action.type !== 'surrender');
        const after = engine.step(action); assert.ok(!after.info.includes('非法动作') && after.info !== 'Game already ended');
        assert.equal(stateHash(after.state), row.afterHash); tracker.apply(before, legal, action, after.state); count++;
    }
    assert.equal(count, result.actions); assert.equal(stateHash(engine.getState()), result.finalHash); assert.deepEqual(tracker.metrics, result.metrics);
    save(prefix + '/strict-replay.json', { passed: true, actions: count, finalHash: result.finalHash, metricsRecomputed: true, logSha256: sha(fs.readFileSync(path.join(dir, prefix, 'actions.jsonl.gz'))) });
}
async function play(slot: any) {
    const prefix = `battles/${slot.id}`;
    if (fs.existsSync(path.join(dir, prefix, 'result.json'))) { await replay(slot); return; }
    fs.mkdirSync(path.join(dir, prefix), { recursive: true });
    const initial = read(plan.maps[slot.mapIndex].path); assert.equal(stateHash(initial), plan.maps[slot.mapIndex].sha256);
    const engine = new GameEngine(initial), bytes = fs.readFileSync(path.join(dir, 'dual-v2-stage3-pure.bin'));
    const policy = new DualStreamPureAI(new DualStreamModel(read('dual-v2-stage3-pure.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
    const rng = rngStream(slot.opponentSeed), opponent = slot.opponent === 'apk_like' ? new ApkLikeAI(rng.next) : new HeuristicAI(rng.next);
    const writer = new GzipLines(path.join(dir, prefix, 'actions.jsonl.gz'), 5_000_000), tracker = metricsTracker(slot.modelSeats);
    const times = { model: [] as number[], opponent: [] as number[] }, start = performance.now();
    let classification = 'error', error: any = null, round10: any = null, actions = 0;
    save(prefix + '/started.json', { slot, startedAt: new Date().toISOString(), modelSha256: sha(bytes), initialHash: stateHash(initial), budgets: plan.budgets });
    try {
        while (true) {
            const state = engine.getState();
            if (!round10 && state.turn >= 10) {
                const enemies = state.players.filter(p => !slot.modelSeats.includes(p.id)).map(p => p.id);
                round10 = { reached: true, turn: state.turn, recurringIncomeModel: income(state, slot.modelSeats), recurringIncomeOpponent: income(state, enemies), recurringIncomeDifference: income(state, slot.modelSeats) - income(state, enemies), actualIncomeDifference: tracker.metrics.model.actualIncome - tracker.metrics.opponent.actualIncome };
            }
            if (engine.isTerminal()) { classification = state.winner === -1 ? 'natural_draw' : state.winner === getAllianceId(state, slot.seat) ? 'natural_win' : 'natural_loss'; break; }
            if (actions >= plan.budgets.maxActions) { classification = 'action_truncation'; break; }
            if (performance.now() - start >= plan.budgets.maxWallMs) { classification = 'wall_truncation'; break; }
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'); assert.ok(legal.length);
            const side = slot.modelSeats.includes(state.currentPlayer) ? 'model' : 'opponent', rngBefore = rng.snapshot(), t0 = performance.now();
            const action = side === 'model' ? policy.getAction(engine, state.currentPlayer) : opponent.getAction(engine, state.currentPlayer, [...legal].sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0));
            const ms = performance.now() - t0; times[side].push(ms);
            if (ms > plan.budgets.maxDecisionMs) { classification = 'decision_timeout'; break; }
            if (performance.now() - start >= plan.budgets.maxWallMs) { classification = 'wall_truncation'; break; }
            assert.ok(legal.some(a => encodeAction(a) === encodeAction(action)));
            const after = engine.step(action); assert.ok(!after.info.includes('非法动作') && after.info !== 'Game already ended');
            tracker.apply(state, legal, action, after.state);
            await writer.line({ i: actions, player: state.currentPlayer, side, code: encodeAction(action), beforeHash: stateHash(state), afterHash: stateHash(after.state), ms, rngBefore, rngAfter: rng.snapshot() });
            actions++;
            if (actions % 100 === 0) save(prefix + '/progress.json', { actions, turn: after.state.turn, seconds: (performance.now() - start) / 1000 });
        }
    } catch (e) { error = { message: String(e), stack: e instanceof Error ? e.stack : null }; }
    finally { await writer.close(); }
    const final = engine.getState();
    save(prefix + '/result.json', { slot, classification, error, actions, winner: final.winner, finalTurn: final.turn, wallSeconds: (performance.now() - start) / 1000, round10: round10 ?? { reached: false }, finalHash: stateHash(final), metrics: tracker.metrics, latency: { model: quantiles(times.model), opponent: quantiles(times.opponent) }, latencySamples: times, modelSha256: sha(bytes) });
    await replay(slot); console.log(JSON.stringify({ id: slot.id, classification, actions, seconds: Math.round((performance.now() - start) / 1000) }));
}
const lane = Number(process.argv[3] ?? 0), lanes = Number(process.argv[4] ?? 1);
for (const [i, slot] of plan.slots.entries()) if (i % lanes === lane) {
    if (process.argv[2] === 'replay') await replay(slot); else await play(slot);
}
