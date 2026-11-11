import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
const here = import.meta.dirname;
const data = 'D:/AncientEmpiresData/continuation_stage7_20261108_v1';
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const reads: any[] = [];
function read(file: string) {
    assert(!/sealed|historical|offline-329/i.test(file));
    const b = fs.readFileSync(file); reads.push({ path: file, sha256: sha(b) }); return b;
}
const roots = JSON.parse(read('D:/AncientEmpiresData/speed_bench_20261107_v1/roots.json').toString());
assert.equal(roots.length, 36);
const tasks = JSON.parse(read(path.join(here, '../stage6/DISTILL_SELECTION.json')).toString()).tasks;
const cache = new Map<string, any>();
function state(task: any) {
    assert.equal(task.split, 'dev');
    if (!cache.has(task.source)) {
        const bytes = read(task.source); assert.equal(sha(bytes), task.sourceSha256);
        const row = JSON.parse(gunzipSync(bytes).toString()); assert.equal(row.split, 'dev'); cache.set(task.source, row);
    }
    return cache.get(task.source).samples[task.index].state;
}
for (const root of roots) assert.deepEqual(root.state, state(root.task));
const used = new Set(roots.map((r: any) => r.task.key));
for (const players of [3, 4]) for (const phase of [0, 1, 2]) {
    const fresh = tasks.filter((t: any) => t.split === 'dev' && t.players === players && t.phase === phase && !used.has(t.key)).slice(0, 6);
    assert.equal(fresh.length, 6);
    for (const task of fresh) { roots.push({ task, state: state(task) }); used.add(task.key); }
}
assert.equal(roots.length, 72);
fs.writeFileSync(path.join(data, 'attempt3-roots72.json'), JSON.stringify(roots), { flag: 'wx' });
fs.writeFileSync(path.join(here, 'ROOTS72_MANIFEST.json'), JSON.stringify({ count: 72, reads, sealedAccess: 0,
    sha256: sha(fs.readFileSync(path.join(data, 'attempt3-roots72.json'))) }, null, 2));
