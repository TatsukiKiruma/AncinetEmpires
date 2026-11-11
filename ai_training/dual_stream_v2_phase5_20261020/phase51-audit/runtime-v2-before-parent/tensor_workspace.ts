/** 每个模型独立复用临时缓冲；同步前向结束后复制公开输出，历史结果不被下一次前向改写。 */
export class TensorWorkspace {
    private blocks: Float32Array[] = [];
    private cursor = 0;
    reset() { this.cursor = 0; }
    allocate(length: number, clear: boolean): Float32Array {
        const index = this.cursor++;
        let block = this.blocks[index];
        if (!block || block.length < length) this.blocks[index] = block = new Float32Array(length);
        const result = block.length === length ? block : block.subarray(0, length);
        if (clear) result.fill(0);
        return result;
    }
}
let active: TensorWorkspace | undefined;
export function tensor(length: number, clear = true): Float32Array { return active ? active.allocate(length, clear) : new Float32Array(length); }
export function withTensorWorkspace<T>(workspace: TensorWorkspace, run: () => T): T {
    const previous = active; active = workspace; workspace.reset();
    try { return run(); } finally { active = previous; }
}
