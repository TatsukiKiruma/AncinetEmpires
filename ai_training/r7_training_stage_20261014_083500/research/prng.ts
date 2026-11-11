/**
 * 确定性 Mulberry32 伪随机数生成器
 * 用于完全可复现的游戏推进、策略选择与数据采样
 */
export class Mulberry32PRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /**
     * 生成 [0, 1) 区间的 32 位浮点伪随机数
     */
    public next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * 生成 [min, max] 闭区间的整数
     */
    public nextInt(min: number, max: number): number {
        const r = this.next();
        return Math.floor(r * (max - min + 1)) + min;
    }

    /**
     * 获取当前内部状态
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
     * 派生子生成器
     */
    public fork(): Mulberry32PRNG {
        return new Mulberry32PRNG(this.nextInt(0, 0x7fffffff));
    }
}
