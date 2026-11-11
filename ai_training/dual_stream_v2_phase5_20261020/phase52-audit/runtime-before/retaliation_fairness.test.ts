import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import type { DualStreamModel } from './model_runtime';
import { DualStreamTurnSearchAI } from './turn_search_ai';

function probe() {
    const state = createDefaultAppGameState();
    const self = state.currentPlayer, enemy = state.players.find(p => p.id !== self)!.id;
    state.units = [
        { ...structuredClone(state.units[0]), id: 'victim', ownerId: self, unitClass: 'soldier', pos: { x: 4, y: 4 }, hp: 35, hasActed: true, hasMoved: true },
        { ...structuredClone(state.units[0]), id: 'own-king', ownerId: self, pos: { x: 1, y: 1 } },
        { ...structuredClone(state.units[0]), id: 'attacker', ownerId: enemy, unitClass: 'soldier', pos: { x: 5, y: 4 }, hasActed: false, hasMoved: false },
        { ...structuredClone(state.units[0]), id: 'enemy-king', ownerId: enemy, pos: { x: 9, y: 9 } },
    ];
    const forward = vi.fn(() => { throw Error('反扑禁止网络'); });
    const ai = new DualStreamTurnSearchAI({ forward } as unknown as DualStreamModel) as any;
    ai.deadline = performance.now() + 10000;
    return { ai, forward, self, branch: { engine: new GameEngine(state), queue: [], actors: ['victim'], prior: 0, score: 0 } };
}

describe('候选反扑公平性', () => {
    it('同一冻结普通单位受击局面不因候选排在真实展开额度之外而获得低惩罚', () => {
        const { ai, self, branch, forward } = probe();
        const first = ai.retaliation(branch, self, true);
        const later = ai.retaliation(branch, self, false);
        expect(first.penalty).toBeGreaterThan(0);
        expect(later.penalty).toBe(first.penalty);
        expect(forward).not.toHaveBeenCalled();
    });

    it('交换候选顺序后，同一候选的真实展开和风险分数保持一致', () => {
        const { ai, self, branch } = probe();
        const a = ai.retaliation(branch, self, true);
        const safeState = branch.engine.getState();
        safeState.units.find(u => u.id === 'victim')!.pos = { x: 0, y: 0 };
        const safe = { ...branch, engine: new GameEngine(safeState) };
        const b = ai.retaliation(safe, self, true);
        const reversedB = ai.retaliation(safe, self, true);
        const reversedA = ai.retaliation(branch, self, true);
        expect([a.penalty, b.penalty]).toEqual([reversedA.penalty, reversedB.penalty]);
        expect(a.penalty).not.toBe(b.penalty);
        expect(a.complete).toBe(true);
    });

    it('预算耗尽的静态换手完成不能冒称真实反扑完成', () => {
        const { ai, self, branch } = probe();
        ai.deadline = performance.now() - 1;
        const result = ai.retaliation(branch, self, true);
        expect(result.complete).toBe(false);
    });
});
