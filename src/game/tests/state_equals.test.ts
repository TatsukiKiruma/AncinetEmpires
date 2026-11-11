import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../engine';
import { createDefaultAppGameState } from '../default_state';

describe('只读快照比较', () => {
    it('单步合法验证复用权威菜单，拒绝篡改动作且不改变状态', () => {
        const engine = new GameEngine(createDefaultAppGameState()), before = engine.getState();
        const legal = engine.getLegalActions(before.currentPlayer);
        for (const action of legal) expect(engine.hasLegalAction(before.currentPlayer, action)).toBe(true);
        expect(engine.hasLegalAction(before.currentPlayer, { type: 'move', unitId: before.units[0].id, to: { x: -1, y: -1 } })).toBe(false);
        expect(engine.getState()).toEqual(before);
    });
    it('不调用快照复制，逐字段发现规则、地图、队伍、实体、墓碑与脚本变化', () => {
        const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState();
        const getter = vi.spyOn(engine, 'getState').mockImplementation(() => { throw Error('只读比较禁止复制'); });
        expect(engine.matchesState(state)).toBe(true);
        const mutations = [
            (s: typeof state) => { s.players[0].gold++; },
            (s: typeof state) => { s.units[0].hp--; },
            (s: typeof state) => { s.map.tiles[0][0].apkMoveCost = 999; },
            (s: typeof state) => { s.rules = { ...s.rules, unitLimit: 999 }; },
            (s: typeof state) => { s.pendingUnitId = '其它'; },
            (s: typeof state) => { s.graves = [{ id: '墓碑', pos: { x: 0, y: 0 }, remainingTurns: 2 }]; },
            (s: typeof state) => { s.apkScriptState = { integers: { value: 1 } }; },
        ];
        for (const mutate of mutations) { const changed = structuredClone(state); mutate(changed); expect(engine.matchesState(changed)).toBe(false); }
        expect(getter).not.toHaveBeenCalled();
        getter.mockRestore();
        expect(engine.getState()).toEqual(state);
    });
});
