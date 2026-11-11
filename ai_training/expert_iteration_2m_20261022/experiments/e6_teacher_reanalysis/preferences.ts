/** 两评估器、两对手均完成才生成偏好；每状态最多四对。 */
import type { Preference, Witness } from './contract';
export function candidateValues(codes: string[], witnesses: Witness[]) {
    const values = new Map<string, [number, number]>();
    for (const code of codes) {
        const pair = witnesses.filter(w => w.code === code);
        if (pair.length !== 2 || new Set(pair.map(w => w.variant)).size !== 2 || pair.some(w => !w.complete || !w.scores || w.error)) continue;
        values.set(code, [Math.min(...pair.map(w => w.scores![0])), Math.min(...pair.map(w => w.scores![1]))]);
    }
    return values;
}
export function preferences(codes: string[], witnesses: Witness[]): Preference[] {
    const values = candidateValues(codes, witnesses), pairs: Preference[] = [];
    for (const [a, av] of values) for (const [b, bv] of values) {
        const margin = Math.min(av[0] - bv[0], av[1] - bv[1]);
        if (a !== b && margin >= .10) pairs.push({ better: a, worse: b, margin });
    }
    return pairs.sort((a, b) => b.margin - a.margin || a.better.localeCompare(b.better) || a.worse.localeCompare(b.worse)).slice(0, 4);
}
