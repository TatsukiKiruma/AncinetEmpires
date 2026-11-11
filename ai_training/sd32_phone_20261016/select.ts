import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const out = path.resolve('ai_training/sd32_phone_20261016');
const base = path.resolve('ai_training/data_acceptance_20261016');
const release = 'phone/release-2026-10-15T21-05-00-859Z/';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const seed = 'sd32-phone-900-20261016-v1';
const index = fs.readFileSync(path.join(base, release, 'release-index.jsonl'));
const all = index.toString().trim().split('\n').map(x => JSON.parse(x));
const eligible = all.filter(e => e.policyLabelEligible && e.admittedAtoms > 0 && e.actualBucket.configuredPlayerCount === 2 && e.actualBucket.configMode === 'SD');
const parents = new Map<string, any>();
for (const e of eligible) if (!parents.has(e.parentId)) parents.set(e.parentId, { parentId: e.parentId, map: e.map, planId: e.planId, planKind: e.planKind, stratum: JSON.stringify([e.map, e.planId, e.planKind]) });
if (parents.size !== 1922 || eligible.reduce((a, e) => a + e.admittedAtoms, 0) !== 666578) throw Error('来源桶身份变化');
function quotas(groups: any[][], n: number) {
  const total = groups.reduce((a, g) => a + g.length, 0);
  const rows = groups.map(g => ({ g, n: Math.floor(g.length * n / total), r: (g.length * n) % total }));
  let left = n - rows.reduce((a, r) => a + r.n, 0);
  for (const row of [...rows].sort((a, b) => b.r - a.r || a.g[0].stratum.localeCompare(b.g[0].stratum))) if (left-- > 0) row.n++;
  return rows;
}
const grouped = new Map<string, any[]>();
for (const p of parents.values()) grouped.set(p.stratum, [...grouped.get(p.stratum) ?? [], p]);
const selectedGroups = quotas([...grouped.values()], 900).filter(r => r.n).map(({ g, n }) => [...g].sort((a, b) => sha(seed + ':select:' + a.parentId).localeCompare(sha(seed + ':select:' + b.parentId))).slice(0, n));
// 验证配额按计划大类和地图分配，避免细计划单父局配额使整类验证缺席。
const kindGroups = new Map<string, any[]>();
for (const p of selectedGroups.flat()) kindGroups.set(p.planKind, [...kindGroups.get(p.planKind) ?? [], p]);
const chosen = quotas([...kindGroups.values()], 180).flatMap(({ g, n }) => {
  const maps = new Map<string, any[]>();
  for (const p of g) maps.set(p.map, [...maps.get(p.map) ?? [], p]);
  return quotas([...maps.values()], n).flatMap(({ g: local, n: count }) => [...local].sort((a,b) => randomRank(a).localeCompare(randomRank(b))).map((p,i) => ({ ...p, split: i < count ? 'validation' : 'train', segments: all.filter(e => e.parentId === p.parentId).sort((a,b) => a.globalOffset-b.globalOffset || a.segmentId.localeCompare(b.segmentId)) })));
});
function randomRank(p: any) { return sha(seed + ':split:' + p.parentId); }
chosen.sort((a, b) => a.parentId.localeCompare(b.parentId));
const sourceBindings = ['release-index.jsonl', 'parent-acceptance.jsonl', 'summary.json'].map(name => ({ path: release + name, sha256: sha(fs.readFileSync(path.join(base, release, name))) }));
const sealed = JSON.parse(fs.readFileSync(path.join(base, 'DELIVERY_MANIFEST.json'), 'utf8'));
for (const b of sourceBindings) if (sealed.artifacts.find((a: any) => a.path.replaceAll('\\', '/') === b.path)?.sha256 !== b.sha256) throw Error('封存入口SHA不符');
const selection = { seed, sourceBindings, sealedManifestSha256: sha(fs.readFileSync(path.join(base, 'DELIVERY_MANIFEST.json'))), eligibleParents: parents.size, selectionMethod: '900父局按地图+细计划分层抽样；180验证按计划大类+地图分层，SHA固定排序', parents: chosen, weights: '每个已闭合宏步的k原子各1/k；无父局等权重重采样', splits: Object.fromEntries(['train', 'validation'].map(split => [split, { parents: chosen.filter(p => p.split === split).length, segments: chosen.filter(p => p.split === split).flatMap(p => p.segments).length, atoms: chosen.filter(p => p.split === split).flatMap(p => p.segments).reduce((a, e) => a + e.admittedAtoms, 0), macros: chosen.filter(p => p.split === split).flatMap(p => p.segments).reduce((a, e) => a + e.admittedMacros, 0) }])) };
fs.writeFileSync(path.join(out, 'selection.json'), JSON.stringify(selection, null, 2));
fs.writeFileSync(path.join(out, 'selection.sha256'), sha(fs.readFileSync(path.join(out, 'selection.json'))) + '\n');
console.log(JSON.stringify(selection.splits));

for (const kind of kindGroups.keys()) if (!chosen.some(p => p.planKind === kind && p.split === 'validation')) throw Error('验证计划类型缺席');
