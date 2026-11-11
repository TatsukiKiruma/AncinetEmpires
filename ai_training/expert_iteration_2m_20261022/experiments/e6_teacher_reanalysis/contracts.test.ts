import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../../src/game/engine';
import { createDemoState } from '../../../../src/game/demo_map';
import { encodePlayerOrder } from '../../../../src/ai_runtime/dual_v2/player_order';
import { computeScalarValue } from '../../../../src/ai_runtime/dual_v2/value_model';
import { trainingValueTarget } from '../../../../src/ai_runtime/dual_v3/value_target';
import { terminalValue } from './inference';
import { reachedBoundary } from './teacher';
import { preferences } from './preferences';
import { stratified, developmentMap } from './sampler';
import { tacticalCases, exhaustive } from './tactics';
import type { StateRow, Witness } from './contract';

describe('E6老师及数据合同', () => {
    it('同方连续操作不翻转根视角，换边后按玩家槽显式转换', () => {
        const e = new GameEngine(createDemoState(), { applyInitialTurnStart: false }), s = e.getState();
        const order = encodePlayerOrder(s);
        const expected = computeScalarValue([.8, .2, 0, 0, 0, 0], s, order, 0);
        e.step({ type: 'wait', unitId: 'u3' }); const same = e.getState();
        expect(same.currentPlayer).toBe(0);
        expect(computeScalarValue([.8, .2, 0, 0, 0, 0], same, encodePlayerOrder(same), 0)).toBeCloseTo(expected);
        e.step({ type: 'end_turn' }); const opposite = e.getState();
        expect(computeScalarValue([.2, .8, 0, 0, 0, 0], opposite, encodePlayerOrder(opposite), 0)).toBeCloseTo(expected);
        expect(reachedBoundary(opposite, 0, false)).toBe(false);
        expect(reachedBoundary(same, 0, true)).toBe(true);
    });
    it('终局、平局、截断标签与根视角严格区分', () => {
        const s = createDemoState(), order = encodePlayerOrder(s);
        expect(trainingValueTarget(s, order, false, null).valueMask).toBe(false);
        expect(Array.from(trainingValueTarget(s, order, true, -1).target).slice(0, 2)).toEqual([.5, .5]);
        s.winner = 1; expect(terminalValue(s, 0)).toBe(-1); expect(terminalValue(s, 1)).toBe(1);
        s.winner = -1; expect(terminalValue(s, 0)).toBe(0);
    });
    const witnesses = (scores: [number, number][]): Witness[] => scores.flatMap((score, i) => ['hard', 'champion'].map(variant => ({
        variant, code: String(i), seed: 1, actions: [], actors: [], hashes: [], final: createDemoState(), complete: true, reason: 'next_root_turn', scores: score,
    } as Witness)));
    it('不完整续弈不入偏好，近分和评估器分歧不锐化', () => {
        const rows = witnesses([[.8, .7], [.1, .1]]); rows[0].complete = false;
        expect(preferences(['0', '1'], rows)).toEqual([]);
        expect(preferences(['0', '1'], witnesses([[.1, .1], [.05, .05]]))).toEqual([]);
        expect(preferences(['0', '1'], witnesses([[.8, -.8], [.1, .1]]))).toEqual([]);
        expect(preferences(['0', '1', '2', '3'], witnesses([[1, 1], [.5, .5], [0, 0], [-1, -1]]))).toHaveLength(4);
    });
    it('canonical跨集去重、每父局上限和不足配额不复制', () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), canonical: String(i % 90), parent: 'p', map: '(2) Duel.aem', phase: 'late', state: { currentPlayer: i % 2 } } as StateRow));
        const used = new Set<string>(['1']); const parents = new Map<string, number>();
        const first = stratified(rows, 100, used, parents); expect(first).toHaveLength(64);
        expect(first.every(r => r.canonical !== '1')).toBe(true);
        expect(stratified(rows, 100, used, parents)).toEqual([]);
        expect(developmentMap('(2) Icy Paths.aem')).toBe(true); expect(developmentMap('(2) The Crossing.aem')).toBe(true);
        expect(developmentMap('(2) Duel.aem')).toBe(false);
    });
    it('24个穷举题均有可复核自然终局见证和有区分度的根答案', () => {
        const cases = tacticalCases(); expect(cases).toHaveLength(24);
        for (const row of cases) {
            const proof = exhaustive(row.state, row.depth);
            expect(proof.terminalWitness, row.id).toBe(true); expect(proof.discriminative || proof.nodes[0].edges.length === 1, row.id).toBe(true);
            const replay = new GameEngine(row.state, { applyInitialTurnStart: false });
            for (const action of proof.witness) { expect(replay.hasLegalAction(replay.getState().currentPlayer, action)).toBe(true); replay.step(action); }
            expect(terminalValue(replay.getState(), row.state.currentPlayer)).toBe(proof.value);
        }
    });
});
