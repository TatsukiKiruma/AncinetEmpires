/** 逐字段比较隔离快照，不构造数组、字符串，也不暴露引擎内部状态。 */
export function stateSnapshotEquals(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left)) {
        if (!Array.isArray(right) || left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) if (!stateSnapshotEquals(left[i], right[i])) return false;
        return true;
    }
    if (Array.isArray(right)) return false;
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
    for (const key in a) if (Object.hasOwn(a, key) && (!Object.hasOwn(b, key) || !stateSnapshotEquals(a[key], b[key]))) return false;
    for (const key in b) if (Object.hasOwn(b, key) && !Object.hasOwn(a, key)) return false;
    return true;
}
