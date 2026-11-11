import { describe, expect, it } from 'vitest';
import {
    alignTeacherScores,
    appendPathSemantics,
    candidatePriority,
    familySplit,
    numericDistribution,
    path3InputIdentity,
    selectPilotCandidates,
    type PilotCandidate,
} from './build_path3_replay';

function candidate(overrides: Partial<PilotCandidate> = {}): PilotCandidate {
    const base = {
        sourceId: 'train_h0.m0', sourcePolicy: 'h0', mapIndex: 0, mapName: 'Duel',
        phaseBucket: '0-2', trueFamilyId: 'family-a', subjectPlayerId: 0, subjectSeat: 0,
        stateKey: 'state-a|0',
    };
    const value = { ...base, ...overrides };
    return { ...value, priority: overrides.priority ?? candidatePriority(value) };
}

describe('Path-3 replay builder', () => {
    it('只按actionCode重排教师分数，不复用旧索引', () => {
        const aligned = alignTeacherScores(['a', 'b'], {
            targetActionCode: 'b',
            scores: [{ actionCode: 'b', score: 9, actionIndex: 0 },
                { actionCode: 'a', score: 3, actionIndex: 1 }],
        });
        expect(aligned).toEqual({ scores: [3, 9], targetActionIndex: 1 });
        expect(() => alignTeacherScores(['a'], {
            targetActionCode: 'a', scores: [{ actionCode: 'illegal', score: 1 }],
        })).toThrow(/候选与权威候选不一致/);
    });

    it('保持旧53维前缀并追加三个路径事实', () => {
        const base = Array.from({ length: 53 }, (_, index) => index / 100);
        const result = appendPathSemantics(base, {
            reachableCapturableBuilding: 1,
            normalizedNearestCapturableCost: 0.25,
            normalizedCapturableCostReduction: 0.1,
        });
        expect(result.slice(0, 53)).toEqual(base);
        expect(result.slice(53)).toEqual([1, 0.25, 0.1]);
        expect(result).toHaveLength(56);
    });

    it('确定性按cell采样并执行family×phase上限', () => {
        const rows = Array.from({ length: 8 }, (_, index) => candidate({
            stateKey: `state-${index}|0`, priority: String(index).padStart(2, '0'),
            trueFamilyId: index < 6 ? 'same-family' : `family-${index}`,
        }));
        const first = selectPilotCandidates(rows, 4, 2);
        const second = selectPilotCandidates([...rows].reverse(), 4, 2);
        expect(first.map((item) => item.stateKey)).toEqual(second.map((item) => item.stateKey));
        expect(first.filter((item) => item.trueFamilyId === 'same-family')).toHaveLength(2);
        expect(first).toHaveLength(4);
        expect(selectPilotCandidates(rows, 128, 2)).toHaveLength(4);
        expect(() => selectPilotCandidates(rows, 129, 2)).toThrow(/1\.\.128/);
    });

    it('稳定汇总教师分数和合法动作数所需的数值分布', () => {
        expect(numericDistribution([4, 1, 3, 2])).toMatchObject({
            count: 4, min: 1, max: 4, mean: 2.5, p50: 2.5,
        });
        expect(numericDistribution([])).toMatchObject({ count: 0, min: null, mean: null, p50: null });
        expect(() => numericDistribution([Number.NaN])).toThrow(/必须全部有限/);
    });

    it('family切分与输入身份都稳定且对候选变化敏感', () => {
        expect(familySplit('same-family')).toBe(familySplit('same-family'));
        const input = {
            spatialTensor: [0, 1], globalFeatures: [2],
            candidateActions: [{ actionCode: 'a', actorCoord: null, landingCoord: null,
                targetCoord: null, semantics: Array(56).fill(0) }],
        };
        const first = path3InputIdentity(input);
        const second = path3InputIdentity({
            ...input,
            candidateActions: [{ ...input.candidateActions[0], semantics: [...Array(55).fill(0), 1] }],
        });
        expect(first).toMatch(/^[0-9a-f]{64}$/);
        expect(first).not.toBe(second);
    });

    it('输入身份忽略教师标签和动作诊断等非模型输入字段', () => {
        const modelInput = {
            spatialTensor: [0, 1], globalFeatures: [2],
            candidateActions: [{ actionCode: 'a', actorCoord: null, landingCoord: null,
                targetCoord: null, semantics: Array(56).fill(0), teacherScore: 1, diagnostic: 'x' }],
        };
        const first = path3InputIdentity(modelInput);
        const changedOnlyOutsideModelInput = {
            ...modelInput,
            candidateActions: [{ ...modelInput.candidateActions[0], teacherScore: 999, diagnostic: 'y' }],
        };
        const second = path3InputIdentity(changedOnlyOutsideModelInput);
        expect(first).toBe(second);
    });
});

