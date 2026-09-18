import { describe, expect, it } from 'vitest';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';
import { predictCandidate } from './skirmish_bc_train';

function stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function canonicalCodes(codes: readonly string[], key: string): string[] {
    return [...codes].sort((left, right) =>
        stableHash(`${key}\0${left}`) - stableHash(`${key}\0${right}`));
}

function makeScoredActions(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        actionCode: `move:u1:${index % 7},${Math.floor(index / 7)}`,
        teacherScore: 100 - index
    }));
}

describe('候选数组顺序规范化（R04 顺序泄漏修复）', () => {
    it('截断路径输出按规范序排列，而不是标签固定首位', () => {
        const actions = makeScoredActions(20);
        const labelActionCode = actions[13].actionCode;
        const key = 'sample-key-1';
        const selected = selectStratifiedHardNegativeCandidates(actions, labelActionCode, {
            maxCandidates: 8, hardNegativeRatio: 0.5, deterministicKey: key
        });
        expect(selected).toHaveLength(8);
        expect(selected.map(candidate => candidate.actionCode))
            .toEqual(canonicalCodes(selected.map(candidate => candidate.actionCode), key));
    });
    it('全量路径输出与输入数组顺序无关', () => {
        const actions = makeScoredActions(6);
        const labelActionCode = actions[2].actionCode;
        const forward = selectStratifiedHardNegativeCandidates(actions, labelActionCode, {
            maxCandidates: null, deterministicKey: 'k'
        });
        const reversed = selectStratifiedHardNegativeCandidates([...actions].reverse(), labelActionCode, {
            maxCandidates: null, deterministicKey: 'k'
        });
        expect(forward.map(candidate => candidate.actionCode))
            .toEqual(reversed.map(candidate => candidate.actionCode));
    });
    it('顺序规范化保留标签与全部候选成员', () => {
        const actions = makeScoredActions(15);
        const labelActionCode = actions[9].actionCode;
        const selected = selectStratifiedHardNegativeCandidates(actions, labelActionCode, {
            maxCandidates: 5, hardNegativeRatio: 0.4, deterministicKey: 'keep'
        });
        expect(selected.some(candidate => candidate.actionCode === labelActionCode)).toBe(true);
        expect(selected.some(candidate => candidate.selectionReason === 'label')).toBe(true);
        expect(new Set(selected.map(candidate => candidate.actionCode)).size).toBe(selected.length);
    });
    it('截断时最高教师分负样本仍被选入（分层语义不因排序而丢失）', () => {
        const actions = makeScoredActions(30);
        const labelActionCode = actions[29].actionCode; // 教师分最低的标签
        const bestNegative = actions[0].actionCode;     // 教师分最高的负样本
        const selected = selectStratifiedHardNegativeCandidates(actions, labelActionCode, {
            maxCandidates: 6, hardNegativeRatio: 1, deterministicKey: 'hn'
        });
        expect(selected.map(candidate => candidate.actionCode)).toContain(bestNegative);
    });
});

describe('同分裁决稳定化（strict- 首位偏置修复）', () => {
    function candidatesIn(order: 'fwd' | 'rev') {
        const list = [
            { actionCode: 'attack:a:b', features: new Map([[0, 1]]), teacherScore: null },
            { actionCode: 'end_turn', features: new Map([[0, 1]]), teacherScore: null },
            { actionCode: 'wait:u1', features: new Map([[0, 1]]), teacherScore: null }
        ];
        return order === 'fwd' ? list : [...list].reverse();
    }
    const zeroWeights = new Array(4).fill(0);

    it('全零权重平分时预测结果不随候选数组顺序改变', () => {
        const forward = predictCandidate(candidatesIn('fwd'), zeroWeights);
        const reversed = predictCandidate(candidatesIn('rev'), zeroWeights);
        expect(forward).not.toBeNull();
        expect(forward!.actionCode).toBe(reversed!.actionCode);
    });
    it('平分时按 actionCode 字典序稳定裁决', () => {
        const picked = predictCandidate(candidatesIn('fwd'), zeroWeights);
        expect(picked!.actionCode).toBe('attack:a:b');
    });
    it('存在唯一最高分时仍选择最高分候选', () => {
        const list = [
            { actionCode: 'wait:u1', features: new Map([[1, 1]]), teacherScore: null },
            { actionCode: 'attack:a:b', features: new Map([[1, 5]]), teacherScore: null }
        ];
        const weights = [0, 1, 0, 0];
        expect(predictCandidate(list, weights)!.actionCode).toBe('attack:a:b');
        expect(predictCandidate([...list].reverse(), weights)!.actionCode).toBe('attack:a:b');
    });
});
