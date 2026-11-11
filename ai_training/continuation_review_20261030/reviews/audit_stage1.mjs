/** 协调者独立只读审核：核对清单字节、分区与实战，不训练或重放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stage = path.resolve(here, '../stage1');
const root = path.resolve(here, '../../..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
async function hash(p) {
  const h = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(p)) h.update(b);
  return h.digest('hex');
}
const failures = [], counts = {}, checks = {};
const check = (name, passed) => { checks[name] = Boolean(passed); if (!passed) failures.push(name); };
for (const [name, base, key] of [['SOURCE_MANIFEST.json', root, 'sources'], ['EVIDENCE_MANIFEST.json', stage, 'files']]) {
  const items = read(path.join(stage, name))[key];
  let matched = 0;
  for (const item of items) {
    const p = path.resolve(base, item.path);
    if (!fs.existsSync(p) || await hash(p) !== item.sha256) failures.push(name + ':' + item.path);
    else matched++;
  }
  counts[name] = { registered: items.length, matched };
  check(name, matched === items.length);
}
const request = read(path.join(stage, 'REVIEW_REQUEST.json'));
const critical = { partitions: 'PARTITIONS.json', offlinePanel: 'OFFLINE_PANEL.json', arenaPanel: 'ARENA_PANEL.json', sealedFinalPanel: 'SEALED_FINAL_PANEL.json', sourceManifest: 'SOURCE_MANIFEST.json' };
for (const [key, file] of Object.entries(critical)) check('critical/' + key, await hash(path.join(stage, file)) === request.criticalHashes[key]);
const plan = read(path.join(stage, '../PLAN.json'));
for (const [key, file] of [['checkpoint', path.resolve(root, plan.inputs.checkpoint)], ['newIndex', plan.inputs.newIndex]]) check('input/' + key, await hash(file) === request.criticalHashes[key]);
const parts = read(path.join(stage, 'PARTITIONS.json')).parents;
const old = read(path.join(root, 'ai_training/phone_2m_scratch100_20261024/SPLIT.json'));
check('oldSplitHash', await hash(path.join(root, 'ai_training/phone_2m_scratch100_20261024/SPLIT.json')) === request.criticalHashes.oldSplit);
for (const split of ['train', 'dev']) check('oldIds/' + split, JSON.stringify(parts.filter(p => p.corpus === 'old' && p.split === split).map(p => p.parentId)) === JSON.stringify(old[split].map(p => p.parentId)));
const groups = new Map();
for (const p of parts) { const a = groups.get(p.isolationGroupId) ?? []; a.push(p); groups.set(p.isolationGroupId, a); }
let cross = 0;
for (const rows of groups.values()) {
  const newSides = new Set(rows.filter(p => p.corpus === 'new' && p.split !== 'quarantine').map(p => p.split));
  const oldSides = new Set(rows.filter(p => p.corpus === 'old').map(p => p.split));
  if (newSides.size > 1 || newSides.size && oldSides.size > 1 || newSides.size && oldSides.size === 1 && [...newSides][0] !== [...oldSides][0]) cross++;
}
check('newGroupLeakage', cross === 0);
counts.partitions = Object.fromEntries(['train','dev','test','quarantine'].map(s => [s, parts.filter(p => p.corpus === 'new' && p.split === s).length]));
check('all3000', Object.values(counts.partitions).reduce((a,b) => a+b,0) === 3000);
const summary = read(path.join(stage, 'arena-baseline-r2/SUMMARY.json'));
const panel = read(path.join(stage, 'ARENA_PANEL.json'));
const byid = new Map(panel.matches.map(g => [g.id,g]));
let savedSteps = 0, chainErrors = 0;
for (const game of summary.games) {
  const slot = byid.get(game.id), initial = panel.slots[slot.slot];
  if (game.seed !== slot.seed || game.initialSha256 !== initial.sha256) chainErrors++;
  const rows = fs.readFileSync(path.join(stage,'arena-baseline-r2',game.id,'steps.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const final = read(path.join(stage,'arena-baseline-r2',game.id,'final.json'));
  if (rows.length !== game.steps || final.winner !== game.winner || !game.natural || game.error || game.timeForfeit !== null) chainErrors++;
  rows.forEach((r,i) => { if (r.step !== i || i > 0 && rows[i-1].after !== r.before) chainErrors++; });
  savedSteps += rows.length;
}
check('arena40', summary.games.length === 40 && ['hard','simple'].every(o => summary.games.filter(g => g.opponent === o).length === 20));
check('arenaChainsAndResults', chainErrors === 0);
counts.savedArenaSteps = savedSteps;
counts.outcomes = Object.fromEntries(['hard','simple'].map(o => [o, summary.games.filter(g => g.opponent === o).reduce((a,g) => { a[g.classification]=(a[g.classification]??0)+1;return a; },{})]));
const predictions = fs.readFileSync(path.join(stage,'offline-baseline/samples.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
check('offlineNoTest', predictions.length === 1299 && predictions.every(p => ['train','dev'].includes(p.split)));
const result = { date: new Date().toISOString(), passed: failures.length === 0, scope: '独立字节/分区/实战静态审核，不证明全量标签或数值计算，源码问题另列审核单', counts, checks, failures };
const destination = process.argv[2];
if (!destination || fs.existsSync(destination)) throw Error('必须指定新的审核证据路径');
fs.writeFileSync(destination, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
