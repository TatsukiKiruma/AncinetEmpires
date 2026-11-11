/** 中文：验证根状态恢复、随机流连续性、边界及预算结果，不启动长对局。 */
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../../src/game/demo_map';
import type { SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { streamFor } from '../../v13/tools/eval_v3_core';
import { simulateFromRoot, continueToNaturalEnd } from './rollout_simulation';
import { hashState, selectBranch, type BranchResult } from './search_window';
import type { Action } from '../../src/game/types';

const unusedPredictor = null as unknown as SpatialResNetPredictor;
const endTurn = (_engine: unknown, _seat: number, legal: readonly Action[]) =>
    legal.find(action => action.type === 'end_turn') ?? legal[0];

describe('独立根状态续弈', () => {
    it('相同根和随机流重放一致，且不改变根或重复收入', () => {
        const root = createDemoState();
        const before = JSON.stringify(root);
        const run = () => simulateFromRoot(root, 0, unusedPredictor, streamFor(20261003, 1), 200,
            { stopAtOwnBoundary: true, ownPolicy: endTurn });
        const first = run();
        const second = run();
        expect(first.error).toBeNull();
        expect(first.reachedBoundary).toBe(true);
        expect(first.fullSequence[0]).toBe('P0:end_turn');
        expect(first.fullSequence.some(code => code.startsWith('P1:'))).toBe(true);
        expect(first.finalState.currentPlayer).toBe(0);
        expect(first.fullSequence).toEqual(second.fullSequence);
        expect(hashState(first.finalState)).toBe(hashState(second.finalState));
        expect(JSON.stringify(root)).toBe(before);
        const noSteps = simulateFromRoot(root, 0, unusedPredictor, () => 0, 0);
        expect(JSON.stringify(noSteps.finalState)).toBe(before);
    });
    it('复核从根执行冻结前缀，保留动作记录而不是复用已终局叶', () => {
        const root = createDemoState();
        const result = continueToNaturalEnd(root, 0, unusedPredictor, streamFor(20261003, 1), 1,
            { ownPrefix: ['end_turn'], ownPolicy: endTurn });
        expect(result.steps).toBe(1);
        expect(result.fullSequence).toEqual(['P0:end_turn']);
        expect(result.appliedPrefix).toEqual(['end_turn']);
        expect(result.outcomeKind).toBe('STEP_LIMIT');
        expect(result.terminal).toBe(false);
    });
    it('非法冻结动作返回错误，不伪造结果变化', () => {
        const result = continueToNaturalEnd(createDemoState(), 0, unusedPredictor, () => 0, 5,
            { ownPrefix: ['attack:missing:missing'] });
        expect(result.outcomeKind).toBe('POLICY_ERROR');
        expect(result.steps).toBe(0);
    });
    it('到达截止时间返回WALL_TIMEOUT，不执行额外动作', () => {
        const result = simulateFromRoot(createDemoState(), 0, unusedPredictor, () => 0, 500,
            { deadlineMs: 9, now: () => 10 });
        expect(result.outcomeKind).toBe('WALL_TIMEOUT');
        expect(result.steps).toBe(0);
        expect(result.truncated).toBe(true);
        expect(result.error).toBeNull();
    });
    it('自然终局不因预算耗尽被误记截断', () => {
        const root = createDemoState(); root.winner = 0;
        const result = continueToNaturalEnd(root, 0, unusedPredictor, () => 0, 0, { deadlineMs: 0 });
        expect(result.outcomeKind).toBe('NATURAL_WIN');
        expect(result.truncated).toBe(false);
    });
    it('冻结动作序列不能越过己方初始回合', () => {
        const result = continueToNaturalEnd(createDemoState(), 0, unusedPredictor, () => 0, 5,
            { ownPrefix: ['end_turn', 'end_turn'], ownPolicy: endTurn });
        expect(result.outcomeKind).toBe('POLICY_ERROR');
        expect(result.appliedPrefix).toEqual(['end_turn']);
    });
});

function branch(outcome: BranchResult['leaf']['outcomeKind'], scoreHp: number, prefix: string[]): BranchResult {
    return {
        ownActions: prefix, fullSequence: [], legal: true,
        leaf: { terminal: outcome !== null, outcomeKind: outcome, truncated: false,
            tactical: { ownCommanderHp: scoreHp, enemyCommanderHp: 50, ownCommanderHpDelta: 0, enemyCommanderHpDelta: 0,
                ownUnitCount: 3, enemyUnitCount: 3, ownGold: 0, enemyGold: 0, turn: 1 } },
        leafStateJson: '{}', nodes: 0, ms: 0, error: null, wallTimeout: false, reachedBoundary: outcome === null, prefixStates: [],
    };
}
describe('分支选择的结果保护', () => {
    it('自然胜基线不会被高战术分未知叶替换', () => {
        expect(selectBranch(branch('NATURAL_WIN', 1, []), [branch(null, 100, ['move:a:1,1'])]).selected).toBeNull();
    });
    it('被预算中断的高分分支不参与选择', () => {
        const invalid = branch(null, 100, ['move:a:1,1']); invalid.leaf.truncated = true;
        expect(selectBranch(branch(null, 50, []), [invalid]).selected).toBeNull();
    });
    it('完整回合后己方血量增加可以被选择', () => {
        expect(selectBranch(branch(null, 27, []), [branch(null, 50, ['move:a:1,1'])]).selected?.ownActions)
            .toEqual(['move:a:1,1']);
    });
});
