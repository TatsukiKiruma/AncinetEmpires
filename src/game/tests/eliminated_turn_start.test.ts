import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, decodeAction, encodeAction } from '../env';
import { createDemoState } from '../demo_map';
import type { GameState } from '../types';

function createEliminationState(currentPlayer = 0, doomed = [1, 2]): GameState {
    const state = createDemoState({ defeatOnNoUnitsAndNoCastles: true });
    state.currentPlayer = currentPlayer;
    state.turn = 7;
    state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
    state.players = Array.from({ length: 4 }, (_, id) => ({ id, gold: 300, isAlive: true, commanderDeathCount: 0 }));
    state.units = state.players.map(player => ({
        id: `team_${player.id}`, ownerId: player.id, unitClass: 'soldier',
        pos: { x: player.id * 2, y: 0 }, hp: doomed.includes(player.id) ? 1 : 60, maxHp: 100,
        hasMoved: true, hasActed: true, movementRemaining: 0,
        ...(doomed.includes(player.id) ? { status: { type: 'poisoned' as const, remainingTicks: 2 } } : {})
    }));
    return state;
}

describe('当前队伍在回合开始被淘汰后的原生换人生命周期', () => {
    it('连续毒死两队后为下一队结算收益、恢复和行动权限，快照不重复结算', () => {
        const state = createEliminationState();
        state.map.tiles[0][6] = { terrainId: 9, ownerId: 3 };
        const engine = new GameEngine(state, { disableAutoAdvanceWhenNoMeaningfulAction: true });
        engine.step({ type: 'end_turn' });
        const after = engine.getState();
        expect(after.currentPlayer).toBe(3);
        expect(after.turn).toBe(7);
        expect(after.players.map(player => player.isAlive)).toEqual([true, false, false, true]);
        expect(after.players[3].gold).toBe(350);
        expect(after.units.find(unit => unit.ownerId === 3)).toMatchObject({ hp: 80, hasMoved: false, hasActed: false, movementRemaining: 4 });
        expect(engine.getLegalActions(3).some(action => action.type === 'move')).toBe(true);
        expect(engine.clone().getState()).toEqual(after);
        expect(new GameEngine(after).getState()).toEqual(after);
        expect(engine.reset(after)).toEqual(after);
    });

    it('跨越末队和零队的连续淘汰只增加一轮，并让环境合法动作编码与 mask 对齐', () => {
        const state = createEliminationState(2, [3, 0]);
        const env = new AncientEmpiresEnv({ initialState: state });
        env.stepAction({ type: 'end_turn' });
        expect(env.getCurrentPlayer()).toBe(1);
        expect(env.getState().turn).toBe(8);
        expect(env.getState().players.map(player => player.isAlive)).toEqual([false, true, true, false]);
        const actions = env.getLegalActions();
        expect(actions.some(action => action.type === 'move')).toBe(true);
        expect(env.getActionMask()).toEqual(actions.map(() => true));
        for (const action of actions) expect(decodeAction(encodeAction(action))).toEqual(action);
        expect(env.getEngine().clone().getLegalActions(1)).toEqual(actions);
    });

    it('显式开局回合毒死当前队后自动开始下一队，收益只结算一次', () => {
        const state = createEliminationState(1, [1]);
        state.map.tiles[0][4] = { terrainId: 9, ownerId: 2 };
        const engine = new GameEngine(state, { applyInitialTurnStart: true });
        expect(engine.getState().currentPlayer).toBe(2);
        expect(engine.getState().players[2].gold).toBe(350);
        expect(engine.clone().getState().players[2].gold).toBe(350);
    });
});
