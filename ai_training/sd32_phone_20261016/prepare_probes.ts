import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { encode, encodeBase } from './model';
import { segmentWriter } from './stream_format';
const root = 'ai_training/sd32_phone_20261016/';
const json = (n: string) => JSON.parse(fs.readFileSync(root + n, 'utf8'));
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const selection = json('selection.json'), schema = json('schema.json');
const train = new Set(selection.parents.filter((p: any) => p.split === 'train').map((p: any) => p.parentId));
const pool = new Map<string, any>();
const sourceBindings: Record<string, string> = {};
for (const sourceFile of ['ai_training/sd_adapter_trial_20261016/witnesses.jsonl.gz', 'ai_training/sd_300_parent_pilot_20261016/witnesses.jsonl.gz']) {
  const bytes = fs.readFileSync(sourceFile); sourceBindings[sourceFile] = sha(bytes);
  for (const [sourceLine, line] of gunzipSync(bytes).toString().trim().split('\n').entries()) {
    const row = JSON.parse(line), p = row.provenance;
    if (p.source !== 'native' || !train.has(p.parentId)) continue;
    const key = `${p.segmentId}:${p.ordinal}`;
    if (!pool.has(key)) pool.set(key, { ...row, key, sourceFile, sourceLine });
  }
}
const sorted = [...pool.values()].sort((a, b) => sha('sd32-probe:' + a.key).localeCompare(sha('sd32-probe:' + b.key)));
const byParent = new Map<string, any>(); for (const r of sorted) if (!byParent.has(r.provenance.parentId)) byParent.set(r.provenance.parentId, r);
if (byParent.size !== 720) throw Error('训练探针父局覆盖不完整');
const mandatory = new Set([...byParent.values()].map(r => r.key));
const chosen = [...byParent.values(), ...sorted.filter(r => !mandatory.has(r.key))].slice(0, 1024);
const base = chosen.map(r => ({ ...encodeBase(r.packet, schema), target: r.target, weight: r.weight }));
const encoded = chosen.map(r => ({ ...encode(r.packet, schema), target: r.target, weight: r.weight }));
fs.writeFileSync(root + 'probe-base.jsonl.gz', gzipSync(base.map(r => JSON.stringify(r)).join('\n') + '\n'));
fs.writeFileSync(root + 'probe-encoded.jsonl.gz', gzipSync(encoded.map(r => JSON.stringify(r)).join('\n') + '\n'));
fs.writeFileSync(root + 'probe-manifest.json', JSON.stringify({ rows: chosen.length, parents: byParent.size, trainOnly: true, seed: 'sd32-probe', previousDevelopmentConsumed: true, sourceBindings,
  rowsManifest: chosen.map(r => ({ key: r.key, sourceFile: r.sourceFile, sourceLine: r.sourceLine, provenance: r.provenance })), baseSha256: sha(fs.readFileSync(root + 'probe-base.jsonl.gz')), encodedSha256: sha(fs.readFileSync(root + 'probe-encoded.jsonl.gz')) }, null, 2));
const fixture = await segmentWriter(path.resolve(root, 'format-fixture.dict.gz'), 3);
for (const i of [0, 1, 0]) await fixture.row(base[i], base[i].target, base[i].weight);
await fixture.close();
console.log(JSON.stringify({ rows: chosen.length, parents: byParent.size, candidates: encoded.reduce((n, r) => n + r.candidates.length, 0) }));
