import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv } from '../env';
import { createDemoState } from '../demo_map';
import { createAppApkSkirmishGameState, parseAppApkSkirmishMap } from '../apk_skirmish_map_assets';
import { createApkSkirmishGameState, createApkSkirmishTrainingGameState } from '../apk_skirmish';

describe('开局回合收益', () => {
    it('蓝方先手时立即获得两座城镇、一座城堡和指挥官的收益', () => {
        const state = createDemoState({ initialGold: 300 });
        state.currentPlayer = 1;
        state.map.tiles[6][6] = { terrainId: 9, ownerId: 1 };
        state.map.tiles[6][5] = { terrainId: 9, ownerId: 1 };

        const engine = new GameEngine(state, { applyInitialTurnStart: true });
        expect(engine.getState().players.map(player => player.gold)).toEqual([300, 550]);
        expect(engine.getState().currentPlayer).toBe(1);

        engine.step({ type: 'end_turn' });
        expect(engine.getState().players.map(player => player.gold)).toEqual([450, 550]);
        engine.step({ type: 'end_turn' });
        expect(engine.getState().players.map(player => player.gold)).toEqual([450, 800]);
    });

    it('新遭遇战与训练环境首回合只结算一次，后续快照不会重复入账', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem');
        expect(state.players.map(player => player.gold)).toEqual([450, 300]);
        expect(new GameEngine(state).getState().players.map(player => player.gold)).toEqual([450, 300]);

        const map = parseAppApkSkirmishMap('(2) Duel.aem');
        const trainingState = createApkSkirmishTrainingGameState(map, 'SD:(2) Duel.aem', {
            setup: { initialGold: 700 }
        });
        expect(trainingState.players.map(player => player.gold)).toEqual([850, 700]);

        const blueFirst = createApkSkirmishGameState(map, { currentPlayer: 1 });
        expect(blueFirst.players.map(player => player.gold)).toEqual([300, 500]);

        const rawState = createApkSkirmishGameState(map, { applyInitialTurnStart: false });
        expect(rawState.players.map(player => player.gold)).toEqual([300, 300]);

        const env = new AncientEmpiresEnv({ initialState: state });
        expect(env.getState().players.map(player => player.gold)).toEqual([450, 300]);
        env.reset();
        expect(env.getState().players.map(player => player.gold)).toEqual([450, 300]);
    });
});
