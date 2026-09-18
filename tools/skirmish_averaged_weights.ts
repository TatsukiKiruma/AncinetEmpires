/** 对每条有效样本更新后的权重做稀疏累计平均，避免最后一批样本主导模型。 */
export class AveragedWeights {
    private steps = 0;
    private totals: number[];
    private timestamps: number[];

    constructor(size: number) {
        this.totals = new Array(size).fill(0);
        this.timestamps = new Array(size).fill(0);
    }

    advance(): void { this.steps += 1; }

    beforeUpdate(index: number, previous: number): void {
        const time = this.steps - 1;
        this.totals[index] += (time - this.timestamps[index]) * previous;
        this.timestamps[index] = time;
    }

    snapshot(weights: readonly number[]): number[] {
        if (this.steps === 0) return [...weights];
        return weights.map((value, index) => (
            this.totals[index] + (this.steps - this.timestamps[index]) * value
        ) / this.steps);
    }
}
