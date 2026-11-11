/**
 * 确定性、可序列化、无副作用的伪随机数生成器 (Mulberry32)
 */
export class DeterministicPRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /**
     * 生成 [0, 1) 的伪随机浮点数
     */
    public next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * 生成 [min, max] 的整数
     */
    public nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * 导出当前内部状态，用于精确重放与状态恢复
     */
    public getState(): number {
        return this.state;
    }

    /**
     * 恢复内部状态
     */
    public setState(state: number): void {
        this.state = state >>> 0;
    }

    /**
     * 克隆当前 PRNG
     */
    public clone(): DeterministicPRNG {
        const prng = new DeterministicPRNG(0);
        prng.setState(this.state);
        return prng;
    }
}

/**
 * 派生子流随机种子
 */
export function deriveSeed(baseSeed: number, streamName: string, salt: number = 0): number {
    let hash = (baseSeed ^ salt) >>> 0;
    for (let i = 0; i < streamName.length; i++) {
        hash = Math.imul(hash ^ streamName.charCodeAt(i), 1597334677);
    }
    return hash >>> 0;
}
