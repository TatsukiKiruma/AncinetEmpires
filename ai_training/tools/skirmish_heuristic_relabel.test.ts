import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import { chooseHeuristicTrainingLabel } from './skirmish_heuristic_relabel';

function createResult() {
    return new AncientEmpiresEnv({
        initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
        seed: 29,
        maxPlies: 30
    }).reset(29);
}

describe('skirmish heuristic relabel', () => {
    it('可把 random 的低分标签替换为教师高分合法动作', () => {
        const result = createResult();
        const original = result.legalActionEntries.find(entry => entry.code === 'end_turn')
            ?? result.legalActionEntries.at(-1)!;
        const decision = chooseHeuristicTrainingLabel(
            result,
            original.code,
            'random',
            {
                mode: 'heuristic',
                policies: ['random'],
                minScoreMargin: 0,
                rolloutDepth: 2,
                rolloutCandidates: 4,
                rolloutWeight: 0.05
            }
        );

        expect(decision).not.toBeNull();
        expect(decision?.relabeled).toBe(true);
        expect(decision?.entry.code).not.toBe(original.code);
        expect(result.legalActionCodes).toContain(decision?.entry.code);
        expect(decision?.scoreMargin).toBeGreaterThan(0);
    });

    it('快速 rollout 仅评估高分候选并返回可审计分数', () => {
        const result = createResult();
        const original = result.legalActionEntries.find(entry => entry.code === 'end_turn')
            ?? result.legalActionEntries.at(-1)!;
        const decision = chooseHeuristicTrainingLabel(
            result,
            original.code,
            'random',
            {
                mode: 'fast-rollout',
                policies: ['random'],
                minScoreMargin: 0,
                rolloutDepth: 2,
                rolloutCandidates: 3,
                rolloutWeight: 0.05
            }
        );
        const rolloutScores = decision?.candidates.filter(candidate => (
            candidate.rolloutValue !== null
        )) ?? [];

        expect(decision).not.toBeNull();
        expect(rolloutScores.length).toBeGreaterThanOrEqual(3);
        expect(rolloutScores.length).toBeLessThanOrEqual(4);
        expect(rolloutScores.every(candidate => Number.isFinite(candidate.combinedScore))).toBe(true);
        expect(result.legalActionCodes).toContain(decision?.entry.code);
    });

    it('未列入重标注范围的策略保持原标签', () => {
        const result = createResult();
        const original = result.legalActionEntries[0];
        const decision = chooseHeuristicTrainingLabel(
            result,
            original.code,
            'apk-like',
            {
                mode: 'fast-rollout',
                policies: ['random'],
                minScoreMargin: 0,
                rolloutDepth: 2,
                rolloutCandidates: 3,
                rolloutWeight: 0.05
            }
        );

        expect(decision).toEqual(expect.objectContaining({
            relabeled: false,
            method: 'none'
        }));
        expect(decision?.entry.code).toBe(original.code);
    });
});
