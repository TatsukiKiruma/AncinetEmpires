import { augment } from './spatial';
import type { RecordToken, SemanticPacket } from '../../src/ai_runtime/sd_v1/observation';

export interface FeatureSpec { keys: string[]; }
export interface Schema { baseCandidateCount: number; terrainMap: Record<string, number>; castleTerrain: number[]; townTerrain: number[]; version: 'sd-tactic64x3-phone-v1'; token: FeatureSpec; candidate: FeatureSpec; hidden: number; }
export type Sparse = Array<[number, number]>;
export interface Encoded { tokens: Sparse[]; groups: number[]; candidates: Sparse[]; refs: number[][]; codes: string[]; }
export function fields(record: RecordToken): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    out.push([`${key}:present`, 1]);
    if (v === null) out.push([`${key}:null`, 1]);
    else if (typeof v === 'number') out.push([`${key}:number`, v / (/gold|income|Cost|prices|exp/i.test(key) ? 1024 : /(?:^|\.)[xy]$|width|height/.test(key) ? 32 : 128)]);
    else out.push([`${key}=${String(v)}`, 1]);
  }
  return out;
}
export function encodeBase(packet: SemanticPacket, schema: Schema): Encoded {
  const part = (records: RecordToken[], spec: FeatureSpec): Sparse[] => {
    const lookup = new Map(spec.keys.map((key, i) => [key, i]));
    return records.map(record => fields(record).map(([key, value]) => {
      const index = lookup.get(key); if (index === undefined) throw Error(`schema拒绝未知特征:${key}`);
      return [index, Math.fround(value)] as [number, number];
    }).sort((a, b) => a[0] - b[0]));
  };
  return { tokens: part(packet.tokens, schema.token), groups: packet.groups, candidates: part(packet.candidates, { keys: schema.candidate.keys.slice(0, schema.baseCandidateCount) }), refs: packet.refs, codes: packet.codes };
}
export function parameterCount(s: Schema): number {
  const h = s.hidden, input = 4 * h + 4 + 3 * h + s.candidate.keys.length;
  return s.token.keys.length * h + h + input * h + h + 2 * (h * h + h) + h + 1 + (4 * h + 4) + 1;
}
/** 与训练器共用的无依赖前向；所有候选都返回分数，数值计算使用float64。 */
export function forward(x: Encoded, s: Schema, w: readonly number[]) {
  if (w.length !== parameterCount(s)) throw Error('权重长度不符');
  const h = s.hidden, f = s.token.keys.length, c = s.candidate.keys.length, ctxN = 4 * h + 4;
  const embedBias = f * h, policyW = embedBias + h, inputN = ctxN + 3 * h + c;
  const policyBias = policyW + inputN * h, w2 = policyBias + h, b2 = w2 + h * h, w3 = b2 + h, b3 = w3 + h * h, outW = b3 + h, outBias = outW + h, valueW = outBias + 1;
  const emb = x.tokens.map(token => Array.from({ length: h }, (_, j) => {
    let z = w[embedBias + j]; for (const [i, v] of token) z += v * w[i * h + j]; return Math.max(0, z);
  }));
  const counts = [0, 0, 0, 0], ctx = Array<number>(ctxN).fill(0);
  for (let i = 0; i < emb.length; i++) { const g = x.groups[i]; counts[g]++; for (let j = 0; j < h; j++) ctx[g * h + j] += emb[i][j]; }
  for (let g = 0; g < 4; g++) { for (let j = 0; j < h; j++) ctx[g * h + j] /= Math.max(1, counts[g]); ctx[4 * h + g] = counts[g] / 1024; }
  const logits = x.candidates.map((candidate, k) => {
    const input = [...ctx, ...x.refs[k].flatMap(ref => ref < 0 ? Array<number>(h).fill(0) : emb[ref]), ...Array<number>(c).fill(0)];
    for (const [i, v] of candidate) input[ctxN + 3 * h + i] = v;
    let z = Array.from({ length: h }, (_, j) => { let v = w[policyBias + j]; for (let i = 0; i < inputN; i++) v += input[i] * w[policyW + i * h + j]; return Math.max(0, v); });
    for (const [offset, bias] of [[w2, b2], [w3, b3]]) z = Array.from({ length: h }, (_, j) => { let v = w[bias + j]; for (let i = 0; i < h; i++) v += z[i] * w[offset + i * h + j]; return Math.max(0, v); });
    let score = w[outBias]; for (let j = 0; j < h; j++) score += z[j] * w[outW + j];
    return score;
  });
  let value = w[valueW + ctxN]; for (let i = 0; i < ctxN; i++) value += ctx[i] * w[valueW + i];
  const best = logits.reduce((b, z, i) => z > logits[b] + 1e-10 ? i : b, 0);
  return { logits, value: Math.tanh(value), best };
}


export function encode(packet: SemanticPacket, schema: Schema, tactics: number[][]): Encoded {
  const x = augment(encodeBase(packet, schema), schema);
  if (tactics.length !== x.candidates.length || tactics.some(v => v.length !== 10 || v.some(z => !Number.isFinite(z)))) throw Error('战术候选合同错误');
  return { ...x, candidates: x.candidates.map((v, i) => [...v, ...tactics[i].map((z, k) => [schema.baseCandidateCount + 32 + k, Math.fround(z)] as [number, number])]) };
}
