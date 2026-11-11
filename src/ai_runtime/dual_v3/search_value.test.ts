import { describe, it, expect } from 'vitest';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodePlayerOrder } from '../dual_v2/player_order';
import { GameEngine } from '../../game/engine';
import { createDemoState } from '../../game/demo_map';
import { maxnUtility, computeScalarValue, searchTerminal, applySurvivalVeto, survivalStatus } from './search_value';

describe('多人Max^n生存效用', () => {
    it('二联盟逐点还原零和效用，边界不依赖敌方分配', () => {
        for (let i = 0; i <= 1000; i++) {
            const p = i / 1000;
            expect(maxnUtility(p, 1 - p, 2)).toBe(2 * p - 1);
            expect(maxnUtility(p, 1 - p, 2)).toBeCloseTo(p - (1 - p), 14);
        }
        for (const k of [3, 4]) for (const enemy of [.01, .5, .99, 1]) {
            expect(maxnUtility(0, enemy, k)).toBe(-1);
            expect(maxnUtility(1, enemy, k)).toBe(1);
        }
        expect(maxnUtility(.15, .85, 3)).toBeGreaterThan(maxnUtility(0, .5, 3));
    });
    it('固定敌方相对分配时全区间严格递增，所有分配的存活值高于出局', () => {
        for (const k of [2, 3, 4]) for (const concentration of [1 / (k - 1), .75, 1]) {
            if (concentration < 1 / (k - 1)) continue;
            let last = -1;
            for (let i = 1; i <= 1000; i++) {
                const p = i / 1000, value = maxnUtility(p, (1 - p) * concentration, k);
                expect(value).toBeGreaterThan(last); last = value;
            }
        }
    });
    it('己方概率相同时偏好均衡敌人，支持旧效用受控对照', () => {
        for (const k of [3, 4]) expect(maxnUtility(.2, .8 / (k - 1), k)).toBeGreaterThan(maxnUtility(.2, .8, k));
        const state = createDefaultAppGameState();
        state.players.push({ ...state.players[1], id: 2, isAlive: true });
        state.rules = { ...state.rules, alliances: { 0: 0, 1: 1, 2: 2 } };
        const order = encodePlayerOrder(state), probs = [.15, .85, 0, 0, 0, 0];
        expect(computeScalarValue(probs, state, order, 0, { valueMode: 'zero_sum_margin' })).toBeCloseTo(-.7);
        state.players[0].isAlive = false;
        expect(state.winner).toBe(null); expect(searchTerminal(state, 0)).toBe(-1);
        expect(computeScalarValue([0, .5, .5, 0, 0, 0], state, order, 0)).toBe(-1);
        state.players[2].id = 3; state.rules.alliances![3] = 0;
        expect(searchTerminal(state, 0)).toBeUndefined();
    });
    it('末城否决只由已完成的安全替代方案触发，不把指挥官阵亡视为安全', () => {
        const unsafe = { responseComplete: true, unsafe: true, safe: false }, incomplete = { responseComplete: false, unsafe: false, safe: true };
        const rows = [unsafe, incomplete]; applySurvivalVeto(rows); expect((unsafe as any).vetoed).toBe(false);
        rows.push({ responseComplete: true, unsafe: false, safe: true }); applySurvivalVeto(rows); expect((unsafe as any).vetoed).toBe(true);
        const initial = createDefaultAppGameState(), final = structuredClone(initial);
        final.units = final.units.filter(u => u.ownerId !== 0);
        expect(survivalStatus(initial, final, 0).safe).toBe(false);
    });
    it('第三方仍存活时敌人占领己方空末城，整局未结束但己方已精确判负', () => {
        const state = createDemoState();
        state.players.push({ id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 });
        state.rules = { defeatOnNoUnitsAndNoCastles: true, alliances: { 0: 0, 1: 1, 2: 2 } };
        state.units = state.units.filter(u => u.ownerId === 1);
        state.units[0].pos = { x: 0, y: 0 };
        state.units.push({ ...state.units[1], id: '第三方', ownerId: 2, pos: { x: 4, y: 4 } });
        state.currentPlayer = 1;
        const engine = new GameEngine(state, { applyInitialTurnStart: false });
        const capture = engine.getLegalActions(1).find(a => a.type === 'capture')!;
        expect(capture).toBeDefined(); engine.step(capture);
        const after = engine.getState();
        expect(after.winner).toBe(null); expect(after.players[0].isAlive).toBe(false); expect(searchTerminal(after, 0)).toBe(-1);
    });
});
