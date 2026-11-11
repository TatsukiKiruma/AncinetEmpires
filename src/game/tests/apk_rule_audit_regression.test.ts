import { describe, expect, it } from 'vitest';
import { addExp } from '../abilities';
import { syncDestroyTeam, syncSetCommander } from '../apk_stage';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, decodeAction, encodeAction, encodeFixedActionIndex } from '../env';
import { getLegalActions } from '../rules';
import { Action, GameState } from '../types';

function expectForbiddenEverywhere(state: GameState, action: Action) {
    const engine = new GameEngine(state);
    const env = new AncientEmpiresEnv({ initialState: state });
    expect(getLegalActions(state, state.currentPlayer)).not.toContainEqual(action);
    expect(engine.getLegalActions(state.currentPlayer)).toEqual(env.getLegalActions());
    expect(env.getFixedActionMask().actionMask[encodeFixedActionIndex(action, state)]).toBe(false);
    expect(engine.step(action).info).toContain('非法动作');
    expect(engine.getState()).toEqual(state);
    expect(env.clone().getState()).toEqual(env.getState());
    expect(env.clone().getFixedActionMask()).toEqual(env.getFixedActionMask());
    for (const legal of env.getLegalActions()) {
        expect(decodeAction(encodeAction(legal))).toEqual(legal);
        expect(env.getFixedActionMask().actionMask[encodeFixedActionIndex(legal, state)]).toBe(true);
    }
    const gold = state.players.map(player => player.gold);
    env.reset();
    expect(env.getState().players.map(player => player.gold)).toEqual(gold);
}

describe('APK 20261013 动作与淘汰审计回归', () => {
    it('致盲治疗师不能治疗邻接非亡灵，但仍可治疗自身', () => {
        const state = createDemoState();
        Object.assign(state.units[2], { unitClass: 'paladin', status: { type: 'blinded', remainingTurns: 3 } });
        state.units[0].hp = 50;
        expectForbiddenEverywhere(state, { type: 'heal', healerId: 'u3', targetId: 'u1' });
        expect(getLegalActions(state, 0)).toContainEqual({ type: 'heal', healerId: 'u3', targetId: 'u3' });
        delete state.units[2].status;
        expect(getLegalActions(state, 0)).toContainEqual({ type: 'heal', healerId: 'u3', targetId: 'u1' });
    });

    it('致盲女巫不能召唤，恢复射程后能召唤', () => {
        const state = createDemoState();
        Object.assign(state.units[2], { unitClass: 'witch', status: { type: 'blinded', remainingTurns: 3 } });
        state.graves = [{ id: 'g1', pos: { x: 2, y: 0 }, remainingTurns: 3, ownerId: 1 }];
        const action: Action = { type: 'summon', summonerId: 'u3', graveId: 'g1', spawnPos: { x: 2, y: 0 } };
        expectForbiddenEverywhere(state, action);
        delete state.units[2].status;
        expect(getLegalActions(state, 0)).toContainEqual(action);
    });

    it('致盲治疗师不能以邻格亡灵绕过射程，恢复后可治疗敌方亡灵', () => {
        const state = createDemoState();
        Object.assign(state.units[2], { unitClass: 'paladin', status: { type: 'blinded', remainingTurns: 3 } });
        Object.assign(state.units[3], { unitClass: 'skeleton', pos: { x: 2, y: 0 } });
        const action: Action = { type: 'heal', healerId: 'u3', targetId: 'u4' };
        expectForbiddenEverywhere(state, action);
        delete state.units[2].status;
        expect(getLegalActions(state, 0)).toContainEqual(action);
        const engine = new GameEngine(state);
        engine.step(action);
        expect(engine.getState().units.find(unit => unit.id === 'u4')!.hp).toBeLessThan(100);
    });

    it.each([[0, 0], [1, 100], [2, 300], [3, 600]])('等级 %i 的召唤物从累计经验 %i 开始', (level, exp) => {
        const state = createDemoState();
        Object.assign(state.units[2], { unitClass: 'witch', level, exp });
        state.graves = [{ id: 'g1', pos: { x: 2, y: 0 }, remainingTurns: 3, ownerId: 1 }];
        const action: Action = { type: 'summon', summonerId: 'u3', graveId: 'g1', spawnPos: { x: 2, y: 0 } };
        const engine = new GameEngine(state);
        const env = new AncientEmpiresEnv({ initialState: state });
        engine.step(action);
        env.stepAction(action);
        expect(env.getState()).toEqual(engine.getState());
        expect(env.clone().getState()).toEqual(engine.clone().getState());
        const skeleton = engine.getState().units.find(unit => unit.unitClass === 'skeleton')!;
        expect(skeleton).toMatchObject({ level, exp, hasMoved: false, hasActed: false });
        if (level === 1) {
            addExp(skeleton, 200);
            expect(skeleton.level).toBe(2);
        }
    });

    it('禁止占领盟友建筑，允许敌方和中立建筑', () => {
        const state = createDemoState({ alliances: { 0: 0, 1: 0, 2: 2 } });
        state.players.push({ id: 2, gold: 500, isAlive: true, commanderDeathCount: 0 });
        state.units.push({ ...state.units[1], id: 'enemy', ownerId: 2, pos: { x: 6, y: 6 } });
        state.units[2].pos = { x: 3, y: 1 };
        state.map.tiles[1][3].ownerId = 1;
        expectForbiddenEverywhere(state, { type: 'capture', unitId: 'u3' });
        for (const owner of [2, null]) {
            state.map.tiles[1][3].ownerId = owner;
            expect(getLegalActions(state, 0)).toContainEqual({ type: 'capture', unitId: 'u3' });
        }
    });

    it('自然淘汰会中立化残存村庄，多方对局继续', () => {
        const state = createDemoState();
        state.players.push({ id: 2, gold: 500, isAlive: true, commanderDeathCount: 0 });
        state.units = state.units.filter(unit => unit.ownerId !== 0);
        state.units.push({ ...state.units[0], id: 'third', ownerId: 2, pos: { x: 6, y: 6 } });
        state.map.tiles[0][0].ownerId = null;
        state.map.tiles[1][3].ownerId = 0;
        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' });
        const after = engine.getState();
        expect(after.players[0].isAlive).toBe(false);
        expect(after.map.tiles[1][3].ownerId).toBeNull();
        expect(after.winner).toBeNull();
    });

    it('致命攻击先记录指挥官死亡，再清理败者其余单位', () => {
        const state = createDemoState({ defeatOnCommanderDeath: true });
        state.currentPlayer = 1;
        Object.assign(state.units[3], { unitClass: 'dragon', pos: { x: 1, y: 1 } });
        state.units[2].hp = 5;
        expect(syncSetCommander(state, 0, state.units[2].pos)).toBe(true);
        const engine = new GameEngine(state);
        engine.step({ type: 'attack', attackerId: 'u4', targetId: 'u3' });
        const after = engine.getState();
        expect(after.players[0].commanderDeathCount).toBe(1);
        expect(after.units.every(unit => unit.ownerId !== 0)).toBe(true);
        expect(after.graves ?? []).toEqual([]);
        expect(after.winner).toBe(1);
    });

    it('脚本与投降共同清除领地、静态单位和待处理引用，不生成墓碑', () => {
        const state = createDemoState();
        state.units[2].apkStatic = true;
        state.pendingUnitId = 'u3';
        state.map.tiles[1][3].ownerId = 0;
        expect(syncDestroyTeam(state, 0)).toBe(true);
        expect(state.players[0].isAlive).toBe(false);
        expect(state.units.every(unit => unit.ownerId !== 0)).toBe(true);
        expect(state.map.tiles.flat().every(tile => tile.ownerId !== 0)).toBe(true);
        expect(state.pendingUnitId).toBeUndefined();
        expect(state.graves ?? []).toEqual([]);
        expect(state.currentPlayer).toBe(1);
        expect(syncDestroyTeam(state, 99)).toBe(false);
        const engine = new GameEngine(createDemoState({ allowSurrender: true }));
        engine.step({ type: 'surrender' });
        expect(engine.getState().units.every(unit => unit.ownerId !== 0)).toBe(true);
        expect(engine.getState().map.tiles.flat().every(tile => tile.ownerId !== 0)).toBe(true);
    });
});
