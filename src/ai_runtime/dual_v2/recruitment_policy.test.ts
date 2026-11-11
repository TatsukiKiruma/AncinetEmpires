import { expect, it, vi } from 'vitest';
import type { Action, UnitClass } from '../../game/types';
import { RootRecruitmentPolicy } from './recruitment_policy';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import type { DualStreamModel } from './model_runtime';

const recruit = (unitClass: UnitClass, x = 1): { action: Action } => ({ action: { type: 'recruit_and_deploy', unitClass, castlePos: { x: 0, y: 0 }, to: { x, y: 1 } } });

it('挑战案保留全部合法兵种、部署点及其它动作', () => {
    const policy = new RootRecruitmentPolicy(), slime = recruit('slime'), archer = recruit('archer'), other = recruit('slime', 2), wait: { action: Action } = { action: { type: 'end_turn' } };
    policy.observe(0, [slime, archer, other]);
    expect(policy.constrain(0, [archer, slime, other, wait])).toEqual([archer, slime, other, wait]);
    expect(policy.constrain(0, [archer, wait])).toEqual([archer, wait]);
});

it('根内观察不得过滤其它兵种，也不改变当前排序', () => {
    const policy = new RootRecruitmentPolicy(), slime = recruit('slime'), archer = recruit('archer');
    policy.observe(0, [slime, archer]); policy.observe(0, [archer, slime]);
    expect(policy.constrain(0, [archer, slime])).toEqual([archer, slime]);
    expect(policy.constrain(1, [archer, slime])).toEqual([archer, slime]);
    policy.reset(); expect(policy.constrain(0, [archer, slime])).toEqual([archer, slime]);
});

it('根池同时覆盖多种兵种，后续状态允许改变招募选择', () => {
    const ai = new DualStreamTurnSearchAI({} as DualStreamModel) as any, engine = new GameEngine(createDefaultAppGameState());
    const slime = { ...recruit('slime'), score: 2, forbidden: false }, archer = { ...recruit('archer'), score: 1, forbidden: false };
    const rank = vi.spyOn(ai, 'ranked').mockReturnValue([slime, archer]);
    expect(ai.candidateRoots(engine, 12, true).map((r: any) => r.action)).toEqual([slime.action, archer.action]);
    rank.mockReturnValue([archer, slime]);
    expect(ai.candidateRoots(engine, 1, true)[0].action).toEqual(archer.action);
    expect(ai.candidateRoots(engine, 12, false).map((r: any) => r.action)).toEqual([archer.action, slime.action]);
});
