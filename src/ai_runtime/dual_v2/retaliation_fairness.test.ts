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
    it('物理终态相同，仅更换行动记录不能伪造普通单位风险改善', () => {
        const { ai, self, branch } = probe(), state = branch.engine.getState();
        state.units.find(u => u.id === 'victim')!.hp = 1;
        const sameBoard = { ...branch, engine: new GameEngine(state) };
        const monitored = ['victim', 'own-king'];
        const front = ai.retaliation(sameBoard, self, monitored);
        const rear = ai.retaliation({ ...sameBoard, actors: ['own-king'] }, self, monitored);
        expect(front.lethalActors).toBeGreaterThan(0);
        expect(rear.lethalActors).toBe(front.lethalActors);
    });
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

    it('己方席位被淘汰但盟友仍在时，只覆盖一圈敌方顺位', () => {
        const { ai, self, branch } = probe(), state = branch.engine.getState();
        const enemy = state.units.find(u => u.id === 'attacker')!.ownerId;
        state.units = state.units.filter(u => u.id !== 'own-king');
        Object.assign(state.units.find(u => u.id === 'victim')!, { unitClass: 'commander', hp: 1 });
        state.units.find(u => u.id === 'attacker')!.unitClass = 'dragon';
        state.players.push({ ...state.players[0], id: 2 });
        state.units.push({ ...structuredClone(state.units.find(u => u.id === 'enemy-king')!), id: 'allied-king', ownerId: 2, pos: { x: 0, y: 0 } });
        state.rules = { ...state.rules, alliances: { [self]: 0, [enemy]: 1, 2: 0 } };
        const result = ai.retaliation({ ...branch, engine: new GameEngine(state) }, self);
        expect(result.commanders.get('victim')).toBe(0);
        expect(result.complete).toBe(true);
        // 仍只覆盖一圈顺位，单个敌方现在允许最多五条真实单位链。
        expect(result.expandedChains).toBeLessThanOrEqual(5);
    });
});
