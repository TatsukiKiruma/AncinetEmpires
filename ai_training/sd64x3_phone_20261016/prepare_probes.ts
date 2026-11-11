import fs from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { decodeAction } from '../../src/game/env';
import { tacticalFeatures } from './tactics';
import { encode, encodeBase } from './model';
import { segmentWriter } from './stream_format';
const root = 'ai_training/sd64x3_phone_20261016/';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const json = (n: string) => JSON.parse(fs.readFileSync(root + n, 'utf8'));
const selection = json('selection.json'), schema = json('schema.json');
const train = new Map(selection.parents.filter((p: any) => p.split === 'train').map((p: any) => [p.parentId, p]));
const oldManifest = JSON.parse(fs.readFileSync('ai_training/sd32_phone_20261016/probe-manifest.json', 'utf8'));
const sources = new Map<string, any[]>();
for (const [name, hash] of Object.entries(oldManifest.sourceBindings)) {
  const bytes = fs.readFileSync(name); if (sha(bytes) !== hash) throw Error('训练探针来源SHA错误');
  sources.set(name, gunzipSync(bytes).toString().trim().split('\n').map(v => JSON.parse(v)));
}
const pool = oldManifest.rowsManifest.map((p: any) => ({ ...sources.get(p.sourceFile)![p.sourceLine], locator: p })).filter((r: any) => train.has(r.provenance.parentId));
pool.sort((a: any, b: any) => sha('64x3:' + a.locator.key).localeCompare(sha('64x3:' + b.locator.key)));
const chosen: any[] = [], seen = new Set();
for (const row of pool) { const kind = (train.get(row.provenance.parentId) as any).planKind; if (!seen.has(kind)) { chosen.push(row); seen.add(kind); } }
for (const row of pool) if (!chosen.includes(row) && chosen.length < 128) chosen.push(row);
if (seen.size !== 7 || chosen.length !== 128) throw Error('探针计划覆盖不足');
const base: any[] = [], encoded: any[] = [], witnesses: any[] = [];
for (const [i, row] of chosen.entries()) {
  const engine = new GameEngine(row.state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
  const packet = observe(row.state, engine.getLegalActions(row.state.currentPlayer));
  if (JSON.stringify(packet) !== JSON.stringify(row.packet)) throw Error('完整候选语义改变');
  const ordered = packet.codes.map(code => { const a = decodeAction(code); if (!a) throw Error('动作码错误'); return a; });
  const tactics = tacticalFeatures(engine, ordered);
  base.push({ ...encodeBase(packet, schema), tactics, target: row.target, weight: row.weight });
  encoded.push({ ...encode(packet, schema, tactics), target: row.target, weight: row.weight });
  witnesses.push({ ...row, tactics });
  if ((i + 1) % 16 === 0) console.log(JSON.stringify({ rows: i + 1, candidates: encoded.reduce((n, r) => n + r.candidates.length, 0) }));
}
for (const [name, rows] of [['probe-base', base], ['probe-encoded', encoded], ['witnesses', witnesses]] as const) fs.writeFileSync(root + name + '.jsonl.gz', gzipSync(rows.map(r => JSON.stringify(r)).join('\n') + '\n'));
for (const [name, indices] of [['format-fixture', [0, 1, 0]], ['format-batch', [0, 1, 0, 1, 0, 1, 0, 1]]] as const) {
  const writer = await segmentWriter(root + name + '.dict.gz', indices.length), parts: Buffer[] = [];
  const header = Buffer.alloc(8); header.writeInt32BE(0x54414333); header.writeInt32BE(indices.length, 4); parts.push(header);
  for (const i of indices) {
    const r = base[i]; await writer.row(r, r.target, r.weight);
    const buffer = Buffer.alloc(68 + r.tactics.length * 40); buffer.writeInt32BE(r.tactics.length);
    Buffer.from(sha(JSON.stringify(witnesses[i].state)), 'hex').copy(buffer, 4); Buffer.from(sha(JSON.stringify(r.codes)), 'hex').copy(buffer, 36);
    r.tactics.forEach((v: number[], a: number) => v.forEach((z, j) => buffer.writeFloatBE(z, 68 + (a * 10 + j) * 4))); parts.push(buffer);
  }
  await writer.close(); fs.writeFileSync(root + name + '.tac.gz', gzipSync(Buffer.concat(parts)));
}
fs.writeFileSync(root + 'probe-manifest.json', JSON.stringify({ rows: 128, planKinds: [...seen], trainOnly: true, sourceBindings: oldManifest.sourceBindings, rowsManifest: chosen.map(r => r.locator), baseSha256: sha(fs.readFileSync(root + 'probe-base.jsonl.gz')), encodedSha256: sha(fs.readFileSync(root + 'probe-encoded.jsonl.gz')) }, null, 2));
