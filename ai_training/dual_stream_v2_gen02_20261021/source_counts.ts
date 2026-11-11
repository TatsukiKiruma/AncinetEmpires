import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { DIR, corpus, read, restore, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

const generation = Number(process.env.LEAGUE_GENERATION), league = read('league-state.json');
const packed = fs.readFileSync(path.join(DIR, 'evaluation-exclusions.txt.gz'));
const excluded = new Set(gunzipSync(packed).toString().trim().split('\n'));
let base = 0, expert = 0;
for await (const row of corpus('train')) {
    if (Number.parseInt(sha(row.label.currentBeforeHash).slice(0, 8), 16) / 4294967296 >= 20000 / 141381) continue;
    if (!excluded.has(row.label.currentBeforeHash) && !excluded.has(row.label.sourceBeforeHash) && !excluded.has(ruleStateHash(row.state))) base++;
}
for (const entry of league.replayBufferManifest.filter((e: any) => e.generation <= generation)) {
    for (const slot of read(entry.manifest).slots) {
        const initial = read(slot.initialPath), prefix = `generations/gen_${String(entry.generation).padStart(2, '0')}/games/${slot.id}`;
        assert.ok(read(prefix + '/strict-replay.json').passed);
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))) {
            const state = restore(row.state, initial.map, row.patches, row.mapIndex);
            assert.equal(stateHash(state), row.beforeHash);
            if (!excluded.has(row.beforeHash) && !excluded.has(ruleStateHash(state))) expert++;
        }
    }
}
assert.ok(base > 0 && expert > 0);
save(`generations/gen_${String(generation).padStart(2, '0')}/source-counts.json`, { base, expert, inputIndexSha256: sha(packed), encodedFeatureFiles: 0, contract: 'sample-progress-interleave-v3' });
