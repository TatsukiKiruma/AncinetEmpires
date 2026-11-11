/** 将父局、相同初态、语义轨迹、前缀和近重复绑定为不可拆组。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, INDEX, OLD_SPLIT, CHECKPOINT, read, save, sha, fileSha, tally, stable } from './io';

const inputs = read(INDEX), original = read(OLD_SPLIT);
if (fileSha(INDEX) !== '99d41276c7683e043112e7bfb6a3f5673420e86e84cedbbf944baeeffa05e10d' || fileSha(CHECKPOINT) !== '338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b') throw Error('计划输入摘要变化');
const entries = [...inputs.map((p: any) => ({ ...p, corpus: 'new' })), ...original.train.map((p: any) => ({ ...p, corpus: 'old', originalSplit: 'train' })), ...original.dev.map((p: any) => ({ ...p, corpus: 'old', originalSplit: 'dev' }))];
const audits = entries.map(p => read(path.join(HERE, 'audit', p.parentId + '.json'))), ids = entries.map(p => p.parentId), root = ids.map((_, i) => i);
const find = (i: number): number => root[i] === i ? i : root[i] = find(root[i]);
const edges: any[] = [];
function join(a: number, b: number, kind: string) { const x = find(a), y = find(b); if (x !== y) { root[y] = x; edges.push({ a: ids[a], b: ids[b], kind }); } }
for (const field of ['parentId', 'initialHash', 'sourceInitialSemantic', 'sourceSemanticTrajectory', 'trajectoryTokensHash', 'nearKey']) {
    const seen = new Map<string, number>();
    audits.forEach((p, i) => { const value = p[field]; if (!value || (field === 'trajectoryTokensHash' && p.rawActions < 8)) return; const key = p.map + '/' + value; if (seen.has(key)) join(seen.get(key)!, i, field); else seen.set(key, i); });
}
for (const field of ['prefix8', 'prefix16']) {
    const seen = new Map<string, number>(); audits.forEach((p, i) => { if (!p[field]) return; const key = p.map + '/' + p[field]; if (seen.has(key)) join(seen.get(key)!, i, field); else seen.set(key, i); });
}
// 同地形归属和玩家资源桶内，单位位置集合Jaccard>=0.95且共同单位血量/经验仅小幅变化，视为近重复。
const nearBuckets = new Map<string, number[]>();
audits.forEach((p, i) => {
    if (!p.initial) return;
    const s = p.initial, key = sha(stable({ map: p.map, currentPlayer: s.currentPlayer, tiles: s.tiles, players: s.players.map((p: any) => ({ ...p, gold: Math.round(p.gold / 100) * 100 })), script: s.script }));
    const bucket = nearBuckets.get(key) ?? []; bucket.push(i); nearBuckets.set(key, bucket);
});
const unitSets = audits.map(p => new Map((p.initial?.units ?? []).map((u: any) => [stable([u.type, u.owner, u.x, u.y, u.pending]), u])));
let nearPairsChecked = 0, nearPairsMatched = 0;
for (const bucket of nearBuckets.values()) for (let a = 0; a < bucket.length; a++) for (let b = a + 1; b < bucket.length; b++) {
    const i = bucket[a], j = bucket[b]; if (find(i) === find(j)) continue;
    const x: Map<any, any> = unitSets[i], y: Map<any, any> = unitSets[j];
    if (Math.min(x.size, y.size) / Math.max(1, Math.max(x.size, y.size)) < .95) continue;
    nearPairsChecked++; let common = 0, close = true;
    for (const [key, u] of x) { const v = y.get(key); if (v) { common++; if (Math.abs(u.hp - v.hp) > 10 || Math.abs(u.exp - v.exp) > 25 || u.level !== v.level || stable(u.status) !== stable(v.status)) close = false; } }
    if (close && common / Math.max(1, x.size + y.size - common) >= .95) { nearPairsMatched++; join(i, j, 'near-initial-jaccard95'); }
}
// 前16个独立宏首态相同也视为前缀家族；不会用单个终局附近的共态连接所有比赛。
const shared = new Map<string, number>(); audits.forEach((p, i) => { for (const h of p.firstStates.slice(0, 8)) { const key = p.map + '/' + h; if (shared.has(key)) join(shared.get(key)!, i, 'prefix-state'); else shared.set(key, i); } });
const groups = new Map<number, number[]>(); entries.forEach((_, i) => { const k = find(i), g = groups.get(k) ?? []; g.push(i); groups.set(k, g); });
const assigned = new Map<number, { split: string; reason: string; groupId: string }>();
const counts: any = { train: {}, dev: {}, test: {} }, totals: any = { train: 0, dev: 0, test: 0 };
const unbound: [number, number[]][] = [];
for (const [k, members] of groups) {
    const oldSides = new Set(members.filter(i => entries[i].corpus === 'old').map(i => entries[i].originalSplit));
    const groupId = sha(stable(members.map(i => ids[i]).sort()));
    const newMembers = members.filter(i => entries[i].corpus === 'new');
    if (!newMembers.length) continue;
    if (oldSides.size > 1) assigned.set(k, { split: 'quarantine', reason: '关联旧训练和旧开发两侧，旧历史共同官方初态保留，新组隔离', groupId });
    else if (newMembers.some(i => !audits[i].admitted)) assigned.set(k, { split: 'quarantine', reason: '组内存在独立前态准入异常', groupId });
    else if (oldSides.size) assigned.set(k, { split: [...oldSides][0], reason: '绑定既有旧分区', groupId });
    else unbound.push([k, newMembers]);
}
const cell = (i: number) => `${entries[i].category}/${entries[i].players}/${entries[i].source}`;
const available: any = {}; unbound.forEach(([, ms]) => ms.forEach(i => { const c = cell(i); available[c] = (available[c] ?? 0) + 1; }));
unbound.sort((a, b) => b[1].length - a[1].length || sha('split-v1/' + ids[a[1][0]]).localeCompare(sha('split-v1/' + ids[b[1][0]])));
for (const [k, ms] of unbound) {
    const ratio: any = { train: .8, dev: .1, test: .1 };
    const score = (side: string) => ms.reduce((v, i) => { const c = cell(i), target = available[c] * ratio[side]; return v + ((counts[side][c] ?? 0) + .5) / Math.max(1, target); }, 0) / ms.length;
    const split = ['train', 'dev', 'test'].sort((a, b) => score(a) - score(b) || totals[a] / ratio[a] - totals[b] / ratio[b])[0];
    ms.forEach(i => { const c = cell(i); counts[split][c] = (counts[split][c] ?? 0) + 1; }); totals[split] += ms.length;
    assigned.set(k, { split, reason: '组级21格及来源分层约80/10/10', groupId: sha(stable([...groups.get(k)!].map(i => ids[i]).sort())) });
}
const rows = entries.map((p, i) => ({ ...p, ...audits[i], isolationGroupId: sha(stable(groups.get(find(i))!.map(i => ids[i]).sort())), positions: audits[i].positions, ...(p.corpus === 'new' ? assigned.get(find(i)) : { split: p.originalSplit, groupId: p.groupId, reason: '旧2414/268原样保持' }) }));
const summary = Object.fromEntries(['train', 'dev', 'test', 'quarantine'].map(side => { const a = rows.filter(r => r.corpus === 'new' && r.split === side); return [side, { parents: a.length, atomicPositions: a.reduce((n, p) => n + p.verifiedAtomicPositions, 0), cells: tally(a, r => `${r.category}/${r.players}`), sources: tally(a, r => r.source), maps: tally(a, r => r.map) }]; }));
const outputs = { schema: 'continuation-frozen-groups-v1', seed: 20261030, indexSha256: fileSha(INDEX), oldSplitSha256: fileSha(OLD_SPLIT), checkpointSha256: fileSha(CHECKPOINT), createdAt: new Date().toISOString(), oldPartitionCounts: { train: original.train.length, dev: original.dev.length }, summary, parents: rows.map(({ initial, firstStates, ...p }) => p) };
let unexplainedCrossSplits = 0;
for (const members of groups.values()) {
    const current = new Set(members.filter(i => rows[i].corpus === 'new' && rows[i].split !== 'quarantine').map(i => rows[i].split));
    const inherited = new Set(members.filter(i => rows[i].corpus === 'old').map(i => rows[i].split));
    if (current.size > 1 || inherited.size > 1 && current.size || inherited.size === 1 && current.size && [...current][0] !== [...inherited][0]) unexplainedCrossSplits++;
}
if (unexplainedCrossSplits) throw Error('存在未解释跨分区关联');
if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(summary)); process.exit(0); }
if (fs.existsSync(path.join(HERE, 'PARTITIONS.json'))) throw Error('分区已经冻结，拒绝覆盖');
save(path.join(HERE, 'PARTITIONS.json'), outputs);
save(path.join(HERE, 'GROUPING.json'), { edges, groups: [...groups.values()].map(ms => ({ parentIds: ms.map(i => ids[i]), oldSplits: [...new Set(ms.filter(i => entries[i].corpus === 'old').map(i => entries[i].originalSplit))], newAssignment: assigned.get(find(ms[0])) })), unexplainedCrossSplits, nearPairsChecked, nearPairsMatched, oldSharedInitialException: '旧分区原本共享官方初态；不声称它是严格初态隔离的未知地图测试，新关联组不进入训练或验证', nearDuplicateDefinition: '相同量化初态，以及单位集合Jaccard>=0.95/共同单位HP差<=10/经验差<=25；相同8/16实质动作前缀；前8独立宏首态', historicalReplay: false });
save(path.join(HERE, 'INPUT_IDENTITY.json'), { index: { path: INDEX, sha256: fileSha(INDEX) }, checkpoint: { path: CHECKPOINT, sha256: fileSha(CHECKPOINT) }, oldSplit: { path: OLD_SPLIT, sha256: fileSha(OLD_SPLIT) }, originalOldParentIds: { train: original.train.map((p: any) => p.parentId), dev: original.dev.map((p: any) => p.parentId) }, summary });
console.log(JSON.stringify(summary));
