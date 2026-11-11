import { describe, expect, it } from 'vitest';
import { cloneGameState } from '../clone_state';
import { createDefaultAppGameState } from '../default_state';
import { GameEngine } from '../engine';

describe('结构化状态拷贝', () => {
    it('快照字节与 JSON 副本相同，所有可变嵌套结构隔离', () => {
        const state = createDefaultAppGameState();
        state.units[0].status = { type: 'poisoned', remainingTicks: 3 };
        state.units[0].apkMoveOverrides = { 1: 2 };
        state.graves = [{ id: '墓碑', pos: { x: 1, y: 1 }, remainingTurns: 2 }];
        state.apkScriptState = { booleans: { 开关: true }, integers: { 计数: 1 } };
        state.rules = { ...state.rules, campaignEvents: [{ id: '事件', trigger: { type: 'turn_start' }, effects: [{ type: 'move_unit', to: { x: 2, y: 2 } }] }] };
        const original = JSON.stringify(state), cloned = cloneGameState(state);
        expect(JSON.stringify(cloned)).toBe(original);
        cloned.units[0].pos.x++;
        cloned.units[0].status!.remainingTicks++;
        cloned.units[0].apkMoveOverrides![1]++;
        cloned.players[0].gold++;
        cloned.map.tiles[0][0].ownerId = 99;
        cloned.graves![0].pos.x++;
        cloned.apkScriptState!.integers!.计数++;
        cloned.rules!.campaignEvents![0].effects.push({ type: 'set_boolean', key: '新', value: true });
        expect(JSON.stringify(state)).toBe(original);
    });

    it('getState 与 clone 不共享内部状态', () => {
        const engine = new GameEngine(createDefaultAppGameState());
        const original = JSON.stringify(engine.getState());
        const snapshot = engine.getState();
        snapshot.units[0].pos.x = 99;
        const branch = engine.clone();
        branch.step({ type: 'end_turn' });
        expect(JSON.stringify(engine.getState())).toBe(original);
    });

    it('脚本字典的特殊键按JSON数据保留并隔离', () => {
        const state = createDefaultAppGameState();
        state.apkScriptState = JSON.parse('{"booleans":{"__proto__":true},"integers":{"__proto__":2}}');
        const original = JSON.stringify(state), copy = cloneGameState(state);
        expect(JSON.stringify(copy)).toBe(original);
        copy.apkScriptState!.integers!.__proto__ = 3;
        expect(state.apkScriptState!.integers!.__proto__).toBe(2);
        const engine = new GameEngine(state);
        expect(JSON.stringify(engine.getState())).toBe(original);
        expect(JSON.stringify(engine.clone().getState())).toBe(original);
    });
});
