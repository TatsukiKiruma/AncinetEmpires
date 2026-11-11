import { describe, expect, it } from 'vitest';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, decodeAction, encodeAction, encodeFixedActionIndex } from '../env';
import { getActionReadyUnitCount, getLegalActions } from '../rules';
import type { Action, GameState, Unit, UnitClass } from '../types';
import type { Tile, TerrainId } from '../terrain';
import { ACTION_HEADS } from '../../ai_runtime/dual_v2/contract';

const tile = (terrainId: TerrainId = 6, ownerId: number | null = null): Tile => ({ terrainId, ownerId });
const unit = (id: string, unitClass: UnitClass, ownerId: number, x: number, y = 0): Unit => ({
    id, unitClass, ownerId, pos: { x, y }, hp: 100, maxHp: 100,
    hasMoved: false, hasActed: false, level: 0, exp: 0,
});
function state(tiles: Tile[][], units: Unit[], gold = 0): GameState {
    return { turn: 1, currentPlayer: 0, winner: null,
        map: { width: tiles[0].length, height: tiles.length, tiles }, units,
        players: [0, 1].map(id => ({ id, gold, isAlive: true, commanderDeathCount: 0 })),
        rules: getApkSkirmishRuleConfig('SD') };
}
function verify(snapshot: GameState, action: Action, allowed: boolean) {
    const engine = new GameEngine(snapshot, { applyInitialTurnStart: false });
    const env = new AncientEmpiresEnv({ initialState: snapshot });
    const legal = getLegalActions(snapshot, snapshot.currentPlayer);
    expect(legal.some(a => encodeAction(a) === encodeAction(action))).toBe(allowed);
    expect(engine.hasLegalAction(snapshot.currentPlayer, action)).toBe(allowed);
    expect(env.getLegalActions()).toEqual(legal);
    const index = encodeFixedActionIndex(action, snapshot);
    expect(index === null ? false : env.getFixedActionMask().actionMask[index]).toBe(allowed);
    expect(engine.clone().getState()).toEqual(snapshot);
    expect(env.clone().getState()).toEqual(snapshot);
    expect(env.reset().reward).toBe(0);
    expect(env.getState().players).toEqual(snapshot.players);
    if (!allowed) {
        expect(engine.step(action).info).toContain('非法动作');
        expect(engine.getState()).toEqual(snapshot);
        // 同时覆盖完整菜单已缓存的校验分支。
        engine.getLegalActions(snapshot.currentPlayer);
        expect(engine.step(action).info).toContain('非法动作');
        expect(env.stepAction(action).reward).toBe(-0.01);
    }
}
function siege() {
    return state(Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) =>
        x === 1 && y === 1 ? tile(10, 0) : tile())), [unit('c', 'commander', 0, 1, 1),
        ...[[0, 1], [1, 0], [1, 2], [2, 1]].map(([x, y], i) => unit(`e${i}`, 'soldier', 1, x, y))], 5000);
}
describe('APK 阶段七规则收紧', () => {
    it('指挥官被围时拒绝陆军招募且不扣费，开放落点后允许', () => {
        const s = siege();
        const recruit: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 1, y: 1 } };
        verify(s, recruit, false);
        s.units = s.units.filter(u => u.id !== 'e3');
        verify(s, recruit, true);
    });
    it('飞行兵种仍能越过围城陆军招募并移出', () => {
        const s = siege();
        const recruit: Action = { type: 'recruit_to_castle', unitClass: 'dragon', castlePos: { x: 1, y: 1 } };
        verify(s, recruit, true);
        const engine = new GameEngine(s);
        const after = engine.step(recruit).state;
        expect(after.pendingUnitId).toBeTruthy();
        expect(engine.getLegalActions(0).some(a => a.type === 'move')).toBe(true);
    });
    it('原地毁村被拒绝，远程空村允许，占用村庄拒绝，动作头原位保留', () => {
        const s = state([[tile(), tile(9, 0), tile(), tile(), tile(9), tile(9, 1), tile()]],
            [unit('cat', 'catapult', 0, 1), unit('e', 'soldier', 1, 5)]);
        verify(s, { type: 'destroy_town', unitId: 'cat' }, false);
        expect(decodeAction('destroy_town:cat')).toBeNull();
        verify(s, { type: 'destroy_town', unitId: 'cat', target: { x: 4, y: 0 } }, true);
        verify(s, { type: 'destroy_town', unitId: 'cat', target: { x: 5, y: 0 } }, false);
        expect(ACTION_HEADS[10]).toBe('destroy_town');
        expect(ACTION_HEADS[11]).toBe('post_attack_move');
        expect(ACTION_HEADS[14]).toBe('destroy_town_target');
    });
    it('突击攻击后所有查询只允许本单位二次移动，原地收尾结算墓碑', () => {
        const s = state([Array.from({ length: 7 }, () => tile())],
            [unit('s', 'soldier', 0, 0), unit('d', 'dragon', 0, 1), unit('e', 'soldier', 1, 3)]);
        s.graves = [{ id: 'g', pos: { x: 2, y: 0 }, ownerId: 0, remainingTurns: 1 }];
        const engine = new GameEngine(s);
        engine.step({ type: 'move', unitId: 'd', to: { x: 2, y: 0 } });
        const locked = engine.step({ type: 'attack', attackerId: 'd', targetId: 'e' }).state;
        const legal = getLegalActions(locked, 0);
        expect(legal.length).toBeGreaterThan(0);
        expect(legal.every(a => a.type === 'post_attack_move' && a.unitId === 'd')).toBe(true);
        for (const query of [{ onlyOrdinaryMoves: true }, { onlyAttacks: true }, { skipMovement: true }, { unitId: 's' }]) {
            expect(getLegalActions(locked, 0, query)).toEqual([]);
        }
        expect(getLegalActions(locked, 0, { skipRecruitment: true })).toEqual(legal);
        expect(getActionReadyUnitCount(locked, 0)).toBe(0);
        for (const action of [{ type: 'wait', unitId: 's' }, { type: 'end_turn' }, { type: 'surrender' }] as Action[]) verify(locked, action, false);
        const finish: Action = { type: 'post_attack_move', unitId: 'd', to: { x: 2, y: 0 } };
        verify(locked, finish, true);
        const after = engine.step(finish).state;
        expect(after.units.find(u => u.id === 'd')!.hp).toBe(locked.units.find(u => u.id === 'd')!.hp - 10);
        expect(after.graves).toEqual([]);
    });
    it('突击单位被反击致死后不锁定其他单位和回合', () => {
        const s = state([Array.from({ length: 7 }, () => tile())],
            [unit('s', 'soldier', 0, 0), { ...unit('w', 'wolf', 0, 2), hp: 1 }, unit('e', 'commander', 1, 3)]);
        const after = new GameEngine(s).step({ type: 'attack', attackerId: 'w', targetId: 'e' }).state;
        expect(after.units.find(u => u.id === 'w')).toBeUndefined();
        verify(after, { type: 'wait', unitId: 's' }, true);
        verify(after, { type: 'end_turn' }, true);
        expect(getLegalActions(after, 0).some(a => a.type === 'post_attack_move')).toBe(false);
    });
});
