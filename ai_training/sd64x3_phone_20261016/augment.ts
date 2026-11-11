import { augment as geometry } from './spatial';
import type { Encoded, Schema } from './model';

/** 数值实现共享已绑定的权威引擎战术侧车，禁止缺失时静默补零。 */
export function augment(base: Encoded & { tactics: number[][] }, schema: Schema): Encoded {
  if (base.tactics.length !== base.candidates.length || base.tactics.some(v => v.length !== 10 || v.some(z => !Number.isFinite(z)))) throw Error('战术侧车不完整');
  const x = geometry(base, schema), { tactics, ...rest } = x as typeof base;
  return { ...rest, candidates: x.candidates.map((v, i) => [...v, ...tactics[i].map((z, k) => [schema.baseCandidateCount + 32 + k, Math.fround(z)] as [number, number])]) };
}
