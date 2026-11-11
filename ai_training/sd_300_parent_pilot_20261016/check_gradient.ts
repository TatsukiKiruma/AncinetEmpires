import { forward, type Schema } from './model';
export function gradientCheck(row: any, schema: Schema, weights: number[], gradient: number[]) {
  const indices = [...new Set([...gradient.map((g, i) => ({ g: Math.abs(g), i })).sort((a, b) => b.g - a.g).slice(0, 20).map(v => v.i), ...Array.from({ length: 20 }, (_, i) => Math.floor(i * (weights.length - 1) / 19))])];
  const loss = (w: number[]) => { const z = forward(row, schema, w).logits, m = Math.max(...z); return (Math.log(z.reduce((a, v) => a + Math.exp(v - m), 0)) + m - z[row.target]) * row.weight; };
  let maxError = 0;
  for (const i of indices) { const w = [...weights]; w[i] += 1e-6; const plus = loss(w); w[i] -= 2e-6; const minus = loss(w); maxError = Math.max(maxError, Math.abs((plus - minus) / 2e-6 - gradient[i])); }
  if (maxError > 1e-7) throw Error('TS有限差分梯度不一致');
  return { parameters: indices.length, maxError, tolerance: 1e-7 };
}
