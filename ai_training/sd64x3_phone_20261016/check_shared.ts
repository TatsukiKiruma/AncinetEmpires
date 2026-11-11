import { augment } from './augment';
import { forward, type Schema } from './model';
export function check(base: any[], encoded: any[], reference: any[], schema: Schema, initial: number[], gradient: number[]) {
  let logitsMaxError = 0, valueMaxError = 0, candidates = 0;
  if (base.length !== 128 || reference.length !== base.length) throw Error('探针数量不符');
  for (let i = 0; i < base.length; i++) {
    const x = augment(base[i], schema); if (JSON.stringify(x) !== JSON.stringify(encoded[i])) throw Error('空间编码不一致');
    const r = forward(x, schema, initial), e = reference[i]; if (r.best !== e.best || r.logits.length !== e.logits.length) throw Error('稳定argmax或候选数不一致');
    r.logits.forEach((z, j) => { logitsMaxError = Math.max(logitsMaxError, Math.abs(z - e.logits[j])); });
    valueMaxError = Math.max(valueMaxError, Math.abs(r.value - e.value)); candidates += r.logits.length;
  }
  if (logitsMaxError > 1e-8 || valueMaxError > 1e-8) throw Error('前向误差越界');
  const row = encoded[0], top = gradient.map((g, i) => ({ a: Math.abs(g), i })).sort((a, b) => b.a - a.a).slice(0, 24).map(v => v.i);
  const indices = [...new Set([...top, ...Array.from({ length: 24 }, (_, i) => Math.floor(i * (initial.length - 1) / 23))])];
  const loss = (weights: number[]) => { const z = forward(row, schema, weights).logits, m = Math.max(...z); return (Math.log(z.reduce((n, v) => n + Math.exp(v - m), 0)) + m - z[row.target]) * row.weight; };
  let gradientMaxError = 0;
  for (const i of indices) { const w = [...initial]; w[i] += 1e-6; const a = loss(w); w[i] -= 2e-6; const b = loss(w); gradientMaxError = Math.max(gradientMaxError, Math.abs((a - b) / 2e-6 - gradient[i])); }
  if (gradientMaxError > 1e-7) throw Error('有限差分梯度越界');
  const unknown = structuredClone(base[0]); unknown.candidates[0].push([schema.baseCandidateCount, 1]);
  let rejected = false; try { augment(unknown, schema); } catch { rejected = true; } if (!rejected) throw Error('空间特征重复添加未拒绝');
  return { passed: true, rows: base.length, candidates, logitsMaxError, valueMaxError, stableArgmaxAllEqual: true, gradientFiniteDifferenceParameters: indices.length, gradientMaxError, optimizerUpdates: 0 };
}
