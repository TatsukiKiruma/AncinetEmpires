import type { SearchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';

/** 同时校验未评估掩码、纯Q、锚定分数和温度分布，零向量只用于不可用标签。 */
export function teacherContract(t: SearchTeacher | null): boolean {
    if (!t) return false;
    const n = t.actionCodes.length;
    if ([t.qValues, t.anchoredScores, t.evaluatedMask, t.vetoMask, t.probabilities].some(a => a.length !== n)) return false;
    const allowed: number[] = [];
    for (let i = 0; i < n; i++) {
        const q = t.qValues[i], score = t.anchoredScores[i], p = t.probabilities[i];
        if (t.evaluatedMask[i] !== (q !== null) || t.evaluatedMask[i] !== (score !== null) || !Number.isFinite(p) || p < 0) return false;
        if (q !== null && (!Number.isFinite(q) || !Number.isFinite(score))) return false;
        if (!t.evaluatedMask[i] || t.vetoMask[i]) { if (p !== 0) return false; } else allowed.push(i);
    }
    if (t.available !== !!allowed.length) return false;
    if (!allowed.length) return t.probabilities.every(p => p === 0);
    if (!(t.temperature > 0) || !Number.isFinite(t.temperature)) return false;
    const max = Math.max(...allowed.map(i => t.anchoredScores[i]!));
    const weights = allowed.map(i => Math.exp((t.anchoredScores[i]! - max) / t.temperature)), sum = weights.reduce((a, b) => a + b, 0);
    return allowed.every((index, i) => Math.abs(t.probabilities[index] - weights[i] / sum) < 1e-10);
}
