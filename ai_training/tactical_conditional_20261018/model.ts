import type { Encoded } from '../sd64x3_phone_20261016/model';

export interface ModelSchema {
    version: string; hidden: number; token: { keys: string[] }; candidate: { keys: string[] };
    oldCandidateCount: number; featureMode?: 'legacy' | 'new';
}
export interface Model { schema: ModelSchema; weights: number[]; arm: string; epoch: number; }
export function offsets(s: ModelSchema) {
    const h = s.hidden, f = s.token.keys.length, c = s.candidate.keys.length, k = 4 * h + 4, d = k + 3 * h + c;
    const eb = f * h, pw = eb + h, pb = pw + d * h, w2 = pb + h, b2 = w2 + h * h,
        w3 = b2 + h, b3 = w3 + h * h, ow = b3 + h, ob = ow + h, vw = ob + 1;
    return { h, f, c, k, d, eb, pw, pb, w2, b2, w3, b3, ow, ob, vw, count: vw + k + 1 };
}
export function stableBest(z: readonly number[]) {
    if (!z.length || z.some(v => !Number.isFinite(v))) throw Error('空候选或非有限logit');
    let best = 0;
    for (let i = 1; i < z.length; i++) if (z[i] > z[best] + 1e-10) best = i;
    return best;
}
export type Decoder = 'direct' | 'group_mass' | 'group_max';
export function decode(logits: number[], groups: string[], decoder: Decoder) {
    const best = stableBest(logits);
    // 组最大logit两段选择与直接argmax数学等价，使用相同候选级平局规则。
    if (decoder === 'direct' || decoder === 'group_max') return best;
    const max = logits[best], masses = new Map<string, number>();
    logits.forEach((v, i) => masses.set(groups[i], (masses.get(groups[i]) ?? 0) + Math.exp(v - max)));
    let selected = '', mass = -1;
    for (const [group, value] of masses) if (value > mass + 1e-10) { selected = group; mass = value; }
    let chosen = -1;
    logits.forEach((v, i) => { if (groups[i] === selected && (chosen < 0 || v > logits[chosen] + 1e-10)) chosen = i; });
    return chosen;
}

/** 独立TS/浏览器float64前向；共享上下文及实体角色投影批量复用。 */
export function forward(x: Encoded, model: Model) {
    const s = model.schema, w = model.weights, o = offsets(s), h = o.h;
    if (s.version !== 'sd-tactical-conditional-pc-v3' || h !== 64 || w.length !== o.count) throw Error('模型schema或权重形状不符');
    const ctx = new Float64Array(o.k), counts = [0, 0, 0, 0];
    const embedding = x.tokens.map((token, i) => {
        const e = Float64Array.from(w.slice(o.eb, o.pw));
        for (const [index, value] of token) for (let j = 0; j < h; j++) e[j] += value * w[index * h + j];
        for (let j = 0; j < h; j++) { e[j] = Math.max(0, e[j]); ctx[x.groups[i] * h + j] += e[j]; }
        counts[x.groups[i]]++; return e;
    });
    for (let g = 0; g < 4; g++) { for (let j = 0; j < h; j++) ctx[g * h + j] /= Math.max(1, counts[g]); ctx[4 * h + g] = counts[g] / 1024; }
    const common = Float64Array.from(w.slice(o.pb, o.w2));
    for (let i = 0; i < ctx.length; i++) for (let j = 0; j < h; j++) common[j] += ctx[i] * w[o.pw + i * h + j];
    const roleCache = new Map<string, Float64Array>();
    const logits = x.candidates.map((candidate, a) => {
        const first = new Float64Array(common);
        for (let role = 0; role < 3; role++) {
            const ref = x.refs[a][role]; if (ref < 0) continue;
            const key = `${role}:${ref}`;
            let projection = roleCache.get(key);
            if (!projection) {
                projection = new Float64Array(h);
                for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) projection[j] += embedding[ref][i] * w[o.pw + (o.k + role * h + i) * h + j];
                roleCache.set(key, projection);
            }
            for (let j = 0; j < h; j++) first[j] += projection[j];
        }
        for (const [i, v] of candidate) {
            if (s.featureMode === 'legacy' && i >= s.oldCandidateCount) continue;
            if (s.featureMode === 'legacy' && x.codes[a].startsWith('recruit_') && [s.oldCandidateCount - 4, s.oldCandidateCount - 3, s.oldCandidateCount - 1].includes(i)) continue;
            for (let j = 0; j < h; j++) first[j] += v * w[o.pw + (o.k + 3 * h + i) * h + j];
        }
        for (let j = 0; j < h; j++) first[j] = Math.max(0, first[j]);
        let hidden = first;
        for (const [matrix, bias] of [[o.w2, o.b2], [o.w3, o.b3]]) {
            const next = new Float64Array(h);
            for (let j = 0; j < h; j++) { let z = w[bias + j]; for (let i = 0; i < h; i++) z += hidden[i] * w[matrix + i * h + j]; next[j] = Math.max(0, z); }
            hidden = next;
        }
        let score = w[o.ob]; for (let j = 0; j < h; j++) score += hidden[j] * w[o.ow + j];
        return score;
    });
    let value = w[o.vw + o.k]; for (let i = 0; i < o.k; i++) value += ctx[i] * w[o.vw + i];
    return { logits, value: Math.tanh(value), best: stableBest(logits) };
}
