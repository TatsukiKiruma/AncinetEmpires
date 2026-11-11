import { describe, expect, it } from 'vitest';
import { createDemoState } from '../demo_map';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { AncientEmpiresEnv, buildFixedActionMask, encodeFixedActionIndex } from '../env';
import { canRecruitUnitClass, getRecruitableUnits, getUnitCost } from '../rule_config';

describe('APK SO 指挥官特殊招募', () => {
    function createReserveState() {
        const state = createDemoState(getApkSkirmishRuleConfig('SO'));
        state.units = state.units.filter(unit => unit.ownerId !== 0 || unit.unitClass !== 'commander');
        Object.assign(state.players[0], {
            gold: 1000,
            commanderDeathCount: 1,
            commanderReserveLevel: 2,
            commanderReserveExp: 350
        });
        return state;
    }

    it('普通列表外的指挥官重招募保持费用、等级、动作编码和克隆一致', () => {
        const state = createReserveState();
        expect(state.rules?.recruitableUnits).not.toContain('commander');
        expect(getRecruitableUnits(state, 0)).toContain('commander');
        expect(getRecruitableUnits(state, 0)).not.toContain('paladin');
        expect(getUnitCost(state, 0, 'commander')).toBe(500);
        const env = new AncientEmpiresEnv({ initialState: state });
        const clone = env.clone();
        expect(clone.getState()).toEqual(env.getState());
        const actions = env.getLegalActions();
        const index = actions.findIndex(action => action.type === 'recruit_to_castle' && action.unitClass === 'commander');
        expect(index).toBeGreaterThanOrEqual(0);
        const mask = buildFixedActionMask(env.getState(), actions);
        expect(mask.actionMask[encodeFixedActionIndex(actions[index], env.getState())]).toBe(true);
        const goldBefore = env.getState().players[0].gold;
        env.step(index);
        clone.step(index);
        expect(clone.getState()).toEqual(env.getState());
        const after = env.getState();
        expect(after.players[0].gold).toBe(goldBefore - 500);
        expect(after.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'commander')).toMatchObject({ level: 2, exp: 350 });
        expect(canRecruitUnitClass(after, 0, 'commander')).toBe(false);
    });

    it('特殊招募仍遵守存活指挥官、金币与显式价格禁用条件', () => {
        const alive = createDemoState(getApkSkirmishRuleConfig('SO'));
        alive.players[0].gold = 1000;
        expect(canRecruitUnitClass(alive, 0, 'commander')).toBe(false);
        const reserve = createReserveState();
        reserve.players[0].gold = 499;
        expect(canRecruitUnitClass(reserve, 0, 'commander')).toBe(false);
        reserve.players[0].gold = 1000;
        reserve.rules!.prices = { commander: null };
        expect(getRecruitableUnits(reserve, 0)).not.toContain('commander');
        expect(canRecruitUnitClass(reserve, 0, 'commander')).toBe(false);
    });
});
