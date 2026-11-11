import { describe, expect, it, vi } from 'vitest';
import { createDemoState } from '../../game/demo_map';
import { GameEngine } from '../../game/engine';
import { encodeAction } from '../../game/env';
import { getReachablePositions } from '../../game/map';
import { getEffectiveStats } from '../../game/abilities';
import { calculateDamage, getLegalActions, inRange } from '../../game/rules';
import { encodeDualObservation } from './encoder';
import { decodeFactoredAction } from './factored_actions';
import { aggregateAllianceValue, encodeOutcomeTarget, encodePlayerOrder } from './player_order';
import { ENTITY_DIM, MAP_CHANNELS, PLAYER_SLOTS } from './contract';

describe('双流v2公共契约', () => {
    it('按权威轮转排序，淘汰和禁用不占行动顺位，联盟目标保持前态视角', () => {
        const state = createDemoState();
        state.players = [5, 2, 0, 3, 1, 4].map(id => ({ id, gold: 100, isAlive: id !== 2, commanderDeathCount: 0 }));
        state.rules = { disabledTeams: [4], alliances: { 1: 10, 5: 10, 0: 20, 3: 20, 2: 30 } }; state.currentPlayer = 3;
        const order = encodePlayerOrder(state);
        expect(order.playerIds).toEqual([3, 5, 0, 1, 2, null]); expect([...order.active]).toEqual([1, 1, 1, 1, 0, 0]);
        const outcome = encodeOutcomeTarget(state, order, true, 20);
        expect([...outcome.target]).toEqual([.5, 0, .5, 0, 0, 0]); expect(aggregateAllianceValue(state, order, outcome.target)).toBe(1);
        expect(encodeOutcomeTarget(state, order, false, 20).valueMask).toBe(false);
    });

    it('候选顺序改变不改变语义指针，编码不调用引擎clone或step', () => {
        const state = createDemoState(), legal = getLegalActions(state, state.currentPlayer), before = structuredClone(state);
        const clone = vi.spyOn(GameEngine.prototype, 'clone').mockImplementation(() => { throw Error('禁止逐候选克隆'); });
        const step = vi.spyOn(GameEngine.prototype, 'step').mockImplementation(() => { throw Error('禁止逐候选模拟'); });
        try {
            const a = encodeDualObservation(state, legal), b = encodeDualObservation(state, [...legal].reverse());
            const map = (x: typeof a, actions: typeof legal) => Object.fromEntries([...x.actions.sourceIndices].map((source, i) => [encodeAction(actions[source]), [...x.actions.pointers.subarray(i * 5, i * 5 + 5)]]));
            expect(map(a, legal)).toEqual(map(b, [...legal].reverse()));
            for (let i = 0; i < a.actions.sourceIndices.length; i++) expect(decodeFactoredAction(state, a.entityIndexMap, a.actions.pointers.subarray(i * 5, i * 5 + 5))).toEqual(legal[a.actions.sourceIndices[i]]);
            expect(a.spatialTensor.length).toBe(MAP_CHANNELS * state.map.width * state.map.height);
            expect(a.entityTokens.length).toBe(a.entityIndexMap.entities.length * ENTITY_DIM);
            expect(a.playerOrder.active.length).toBe(PLAYER_SLOTS); expect(state).toEqual(before);
        } finally { clone.mockRestore(); step.mockRestore(); }
    });

    it('下家威胁与逐落点权威伤害穷举完全一致，每个攻击者只计一次', () => {
        const state = createDemoState();
        state.map = { width: 7, height: 5, tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({ terrainId: (x + y) % 3 === 0 ? 7 : 1, ownerId: null }))) };
        state.units = [
            { ...state.units[0], id: 'mine', ownerId: 0, unitClass: 'soldier', pos: { x: 1, y: 2 } },
            { ...state.units[1], id: 'enemy', ownerId: 1, unitClass: 'dragon', pos: { x: 5, y: 2 }, hasActed: true, hasMoved: true },
        ];
        const attacker = state.units[1], range = getEffectiveStats(attacker), positions = getReachablePositions(state, attacker.id);
        const x = encodeDualObservation(state, getLegalActions(state, state.currentPlayer)), area = state.map.width * state.map.height;
        for (let y = 0; y < state.map.height; y++) for (let tx = 0; tx < state.map.width; tx++) {
            const target = { ...state.units[0], id: 'reference', pos: { x: tx, y }, hp: 100, maxHp: 100, unitClass: 'soldier' as const, level: 0 as const, status: undefined };
            let best = 0, count = 0;
            for (const pos of positions) if (inRange(pos, target.pos, range.minRange, range.maxRange)) { count = 1; const u = { ...attacker, pos }; best = Math.max(best, calculateDamage({ ...state, units: [u, target] }, u.id, target.id) / 100); }
            const idx = y * state.map.width + tx;
            expect(x.spatialTensor[22 * area + idx]).toBe(Math.fround(best)); expect(x.spatialTensor[23 * area + idx]).toBe(count);
        }
    });
});
