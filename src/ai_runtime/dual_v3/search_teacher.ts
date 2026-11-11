export interface TeacherScore { rootAction: string; value: number; score?: number; responseComplete: boolean; vetoed?: boolean }
export interface SearchTeacher {
    available: boolean;
    actionCodes: string[]; qValues: (number | null)[]; anchoredScores: (number | null)[]; evaluatedMask: boolean[]; vetoMask: boolean[];
    probabilities: number[]; temperature: number; value: number | null; valueMode: 'post_response';
}

/** 同一首动作的多个完整计划取最佳保守价值；未完成动作明确留空。 */
export function searchTeacher(codes: string[], candidates: TeacherScore[], temperature = .15): SearchTeacher {
    if (!Number.isFinite(temperature) || temperature <= 0) throw Error('搜索教师温度必须为正数');
    const qValues = codes.map(code => {
        const values = candidates.filter(c => c.rootAction === code && c.responseComplete).map(c => c.value);
        if (values.some(v => !Number.isFinite(v))) throw Error('搜索教师价值包含非有限数');
        return values.length ? Math.max(...values) : null;
    });
    const vetoMask = codes.map(code => {
        const rows = candidates.filter(c => c.rootAction === code && c.responseComplete);
        return rows.length > 0 && rows.every(c => c.vetoed);
    });
    // 同一首动作若另有未否决计划，分布必须使用该计划，不能使用已否决计划的高分。
    codes.forEach((code, i) => {
        const allowed = candidates.filter(c => c.rootAction === code && c.responseComplete && !c.vetoed);
        if (allowed.length) qValues[i] = Math.max(...allowed.map(c => c.value));
    });
    const anchoredScores = codes.map(code => {
        const rows = candidates.filter(c => c.rootAction === code && c.responseComplete);
        const allowed = rows.filter(c => !c.vetoed), pool = allowed.length ? allowed : rows;
        if (pool.some(c => !Number.isFinite(c.score ?? c.value))) throw Error('锚定分数非有限');
        return pool.length ? Math.max(...pool.map(c => c.score ?? c.value)) : null;
    });
    const evaluatedMask = qValues.map(v => v !== null), allowed = anchoredScores.filter((v, i) => v !== null && !vetoMask[i]) as number[];
    const maximum = allowed.length ? Math.max(...allowed) : null;
    const probabilities = anchoredScores.map((v, i) => v === null || vetoMask[i] || maximum === null ? 0 : Math.exp((v - maximum) / temperature));
    const total = probabilities.reduce((a, b) => a + b, 0);
    if (total) probabilities.forEach((v, i) => { probabilities[i] = v / total; });
    // 没有任何完成反扑时，零向量表示无教师标签；不能伪造均匀分布。
    return { available: maximum !== null, actionCodes: codes, qValues, anchoredScores, evaluatedMask, vetoMask, probabilities, temperature, value: qValues.filter((v, i) => v !== null && !vetoMask[i]).reduce<number | null>((m, v) => m === null ? v : Math.max(m, v!), null), valueMode: 'post_response' };
}
