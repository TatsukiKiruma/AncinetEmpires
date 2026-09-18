import { describe, expect, it } from 'vitest';
import { AveragedWeights } from './skirmish_averaged_weights';

describe('稀疏平均权重', () => {
    it('包含正确样本的停留时间，并按更新后的权重求平均', () => {
        const average = new AveragedWeights(2);
        const weights = [0, 0];
        average.advance(); average.beforeUpdate(0, weights[0]); weights[0] = 2;
        average.advance();
        average.advance(); average.beforeUpdate(0, weights[0]); weights[0] = -1;
        average.beforeUpdate(1, weights[1]); weights[1] = 3;
        expect(average.snapshot(weights)).toEqual([1, 1]);
        expect(average.snapshot(weights)).toEqual([1, 1]);
        average.advance();
        expect(average.snapshot(weights)).toEqual([0.5, 1.5]);
    });
    it('同一步多次更新不重复计算停留时间', () => {
        const average = new AveragedWeights(1);
        const weights = [0];
        average.advance(); average.beforeUpdate(0, 0); weights[0] += 4;
        average.beforeUpdate(0, 4); weights[0] -= 1;
        expect(average.snapshot(weights)).toEqual([3]);
    });
});
