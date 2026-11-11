import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, encodeAction } from '../env';

describe('训练与实战自动换手合同', () => {
    it('最后单位待机后的自动状态等于来源轨迹显式end_turn，环境不多发收益', () => {
        const state = createDemoState();
        state.players[0].gold = 0;
        Object.assign(state.units[0], { hasActed: true, hasMoved: true });
        const automatic = new GameEngine(state);
        const source = new GameEngine(state, { disableAutoAdvanceWhenNoMeaningfulAction: true });
        const env = new AncientEmpiresEnv({ initialState: state });
        const wait = { type: 'wait', unitId: 'u3' } as const;
        automatic.step(wait);
        const result = env.stepAction(wait);
        source.step(wait);
        expect(automatic.getState().currentPlayer).toBe(1);
        expect(source.getState().currentPlayer).toBe(0);
        expect(source.getLegalActions(0).map(encodeAction)).toEqual(['end_turn']);
        source.step({ type: 'end_turn' });
        expect(automatic.getState()).toEqual(source.getState());
        expect(env.getState()).toEqual(automatic.getState());
        expect(result.reward).toBe(0);
        expect(result.legalActionCodes).toEqual(env.getLegalActions().map(encodeAction));
        expect(result.actionMask).toEqual(env.getActionMask());
        expect(result.fixedLegalActionIndexes).toEqual(env.getFixedLegalActionIndexes());
        expect(env.clone().getState()).toEqual(env.getState());
        expect(env.clone().getFixedActionMask()).toEqual(env.getFixedActionMask());
        expect(automatic.clone().getState().players).toEqual(automatic.getState().players);
    });
});
