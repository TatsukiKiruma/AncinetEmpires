import { createHash } from 'node:crypto';
import { canonical, ruleStateHash } from '../data_acceptance_20261016/replay/core';
export const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function semanticHash(state: any) {
  const s = structuredClone(state); delete s.metadata;
  // 保留规则字段，去除生成计数器及实体ID的拼写；引用按实体语义顺序重命名。
  delete s.nextUnitId; delete s.nextGraveId;
  const units = [...s.units].sort((a, b) => { const { id: _a, ...x } = a, { id: _b, ...y } = b; return canonical(x).localeCompare(canonical(y)); });
  const ids = new Map(units.map((u, i) => [u.id, `u${i}`]));
  s.units = units.map((u, i) => ({ ...u, id: `u${i}` }));
  if (s.pendingUnitId) s.pendingUnitId = ids.get(s.pendingUnitId);
  if (s.rules?.commanderUnitIds) s.rules.commanderUnitIds = Object.fromEntries(Object.entries(s.rules.commanderUnitIds).map(([k, v]) => [k, ids.get(v)]));
  s.graves = [...s.graves ?? []].sort((a, b) => { const { id: _a, ...x } = a, { id: _b, ...y } = b; return canonical(x).localeCompare(canonical(y)); }).map((g, i) => ({ ...g, id: `g${i}` }));
  return sha(canonical(s));
}
export function digests(state: any, x: any) {
  const { codes: _codes, ...input } = x;
  return { rule: ruleStateHash(state), semantic: semanticHash(state), input: sha(JSON.stringify(input)) };
}
