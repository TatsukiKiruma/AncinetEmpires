import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadExclusions } from './source_loader';
import { sha } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(fs.readFileSync(path.resolve(dir, name), 'utf8'));
const old = read('../dual_stream_v2_phase1_20261020/split-manifest-v2.json'), current = read('split-manifest-v2-stage3.json');
assert.deepEqual(current.parents.slice(0, old.parents.length), old.parents);
assert.equal(current.parents.length, 3296);
assert.equal(new Set(current.parents.map((p: any) => `${p.source}:${p.id}`)).size, 3296);
const groups = new Map<string, Set<string>>();
for (const p of current.parents) {
    const key = `${p.source}:${p.group}`;
    if (!groups.has(key)) groups.set(key, new Set()); groups.get(key)!.add(p.split);
}
assert.ok([...groups.values()].every(s => s.size === 1));
const hashes = loadExclusions(current); assert.equal(hashes.size, 511076);
assert.equal(current.counts.nativeParents, 3000); assert.equal(current.counts.replayResponses, 296);
fs.writeFileSync(path.join(dir, 'manifest-validation.json'), JSON.stringify({ passed: true, inheritedExact: old.parents.length, total: current.parents.length, noCrossSplitFamilies: true, exclusionStates: hashes.size, nativeParents: 3000, replayResponses: 296, manifestSha256: sha(fs.readFileSync(path.join(dir, 'split-manifest-v2-stage3.json'))) }, null, 2));
