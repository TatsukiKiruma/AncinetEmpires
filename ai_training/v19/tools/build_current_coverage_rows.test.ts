import { describe, expect, it } from 'vitest';
import { selectCoverageCandidates, type CoverageCandidate } from './build_current_coverage_rows';

function row(overrides: Partial<CoverageCandidate> & Pick<CoverageCandidate, 'stateHash'>): CoverageCandidate {
    return {
        trueFamilyId: 'family-a', phaseBucket: '0-2', behaviorActionCode: 'move:u:1,1',
        sourcePolicy: 'h0', sourceFile: 'a.jsonl', sourceLineIndex: 0, ...overrides,
    };
}

describe('selectCoverageCandidates', () => {
    it('输入顺序不影响分桶抽样结果', () => {
        const rows = [
            row({ stateHash: 's1', sourcePolicy: 'h0' }),
            row({ stateHash: 's2', sourcePolicy: 'student', phaseBucket: '3-5' }),
            row({ stateHash: 's3', behaviorActionCode: 'attack:u:v' }),
            row({ stateHash: 's4', sourcePolicy: 'b2', behaviorActionCode: 'recruit:soldier' }),
        ];
        const forward = selectCoverageCandidates(rows, 3).map((item) => item.stateHash);
        const reverse = selectCoverageCandidates([...rows].reverse(), 3).map((item) => item.stateHash);
        expect(reverse).toEqual(forward);
    });

    it('严格执行每家族上限', () => {
        const rows = Array.from({ length: 8 }, (_, index) => row({
            trueFamilyId: index < 5 ? 'family-a' : 'family-b', stateHash: `s${index}`,
            sourceLineIndex: index,
        }));
        const selected = selectCoverageCandidates(rows, 2);
        expect(selected.filter((item) => item.trueFamilyId === 'family-a')).toHaveLength(2);
        expect(selected.filter((item) => item.trueFamilyId === 'family-b')).toHaveLength(2);
    });

    it('按家族和 stateHash 去重并选取规范来源位置', () => {
        const selected = selectCoverageCandidates([
            row({ stateHash: 'same', sourceFile: 'z.jsonl', sourceLineIndex: 9 }),
            row({ stateHash: 'same', sourceFile: 'a.jsonl', sourceLineIndex: 2 }),
            row({ stateHash: 'other', sourceLineIndex: 3 }),
        ], 10);
        expect(selected).toHaveLength(2);
        expect(selected.find((item) => item.stateHash === 'same')?.sourceFile).toBe('a.jsonl');
    });
});
