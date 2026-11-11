import { describe, expect, it } from 'vitest';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { createDemoState } from '../demo_map';
import { AncientEmpiresEnv, buildFixedActionMask, encodeFixedActionIndex } from '../env';
import { canRecruitUnitClass, getCurrentPopulation, getCurrentUnitCount, mergeRuleConfig } from '../rule_config';
import type { UnitClass } from '../types';

// APK C0600q.m4344b/m4285j/m4259s：上限比较人口之和，零人口招募单独放行。
function createBoundaryState(mode: 'SD' | 'SO' = 'SD') {
    const state = createDemoState(getApkSkirmishRuleConfig(mode));
    const kinds: UnitClass[] = [
        ...Array<UnitClass>(12).fill('skeleton'), 'dragon', ...Array<UnitClass>(5).fill('slime'),
        ...Array<UnitClass>(4).fill('mermaid'), ...Array<UnitClass>(3).fill('archer'),
        'commander', 'wolf', 'wolf', 'druid', 'paladin'
    ];
    state.units = kinds.map((unitClass, i) => ({
        id: `own_${i}`, ownerId: 0, unitClass, pos: { x: (i + 1) % 8, y: Math.floor((i + 1) / 8) },
        hp: 100, maxHp: 100, hasMoved: false, hasActed: false
    }));
    state.players[0].gold = 17850;
    return state;
}

describe('APK 招募按人口计算上限', () => {
    it.each(['SD', 'SO'] as const)('%s 的30个实体、28人口仍允许招募2人口女巫', mode => {
        const state = createBoundaryState(mode);
        expect(getCurrentUnitCount(state, 0)).toBe(30);
        expect(getCurrentPopulation(state, 0)).toBe(28);
        expect(canRecruitUnitClass(state, 0, 'witch')).toBe(true);
        const env = new AncientEmpiresEnv({ initialState: state }), clone = env.clone();
        const actions = env.getLegalActions();
        const index = actions.findIndex(a => a.type === 'recruit_to_castle' && a.unitClass === 'witch');
        expect(index).toBeGreaterThanOrEqual(0);
        const mask = buildFixedActionMask(env.getState(), actions);
        expect(mask.actionMask[encodeFixedActionIndex(actions[index], env.getState())]).toBe(true);
        const gold = env.getState().players[0].gold;
        env.step(index); clone.step(index);
        expect(clone.getState()).toEqual(env.getState());
        expect(getCurrentUnitCount(env.getState(), 0)).toBe(31);
        expect(getCurrentPopulation(env.getState(), 0)).toBe(30);
        expect(env.getState().players[0].gold).toBe(gold - 400);
        expect(canRecruitUnitClass(env.getState(), 0, 'soldier')).toBe(false);
    });

    it('实体数不足上限时也必须检查新单位占用，队伍上限可以覆盖全局', () => {
        const state = createBoundaryState();
        state.units = state.units.slice(0, 6).map(unit => ({ ...unit, unitClass: 'dragon' }));
        expect(getCurrentPopulation(state, 0)).toBe(30);
        expect(canRecruitUnitClass(state, 0, 'witch')).toBe(false);
        state.rules = mergeRuleConfig(state.rules, { teams: { 0: { unitLimit: 32 } } });
        expect(canRecruitUnitClass(state, 0, 'witch')).toBe(true);
        expect(canRecruitUnitClass(state, 0, 'wolf')).toBe(false);
    });

    it('人口已超限仍允许零人口指挥官，但金币与存活指挥官限制保持有效', () => {
        const state = createBoundaryState();
        state.units = state.units.slice(0, 7).map(unit => ({ ...unit, unitClass: 'dragon' }));
        expect(getCurrentPopulation(state, 0)).toBe(35);
        expect(canRecruitUnitClass(state, 0, 'commander')).toBe(true);
        state.players[0].gold = 399;
        expect(canRecruitUnitClass(state, 0, 'commander')).toBe(false);
    });

    it('未启用APK人口语义的自定义规则仍按实体数量限制', () => {
        const state = createBoundaryState();
        state.rules = mergeRuleConfig(state.rules, { unitLimitUsesPopulation: false });
        expect(canRecruitUnitClass(state, 0, 'witch')).toBe(false);
    });
});
