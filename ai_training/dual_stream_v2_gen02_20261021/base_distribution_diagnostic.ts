import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { corpus, DIR, STAGE3, read, save, sha } from './common';
import { gzipRows, SOURCE } from '../dual_stream_v2_phase1_20261020/io';
import { replayEntries } from '../dual_stream_v2_phase3_20261020/source_loader';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { getAllianceId } from '../../src/game/rule_config';

const old = path.resolve(DIR, '../dual_stream_v2_phase5_20261020');
const identity = read(path.join(old, 'generations/gen_01/training-input-identity.json'));
const packed = fs.readFileSync(path.join(old, 'evaluation-exclusions.txt.gz'));
assert.equal(sha(packed), identity.dataIdentity['evaluation-exclusions.txt.gz']);
const excluded = new Set(gunzipSync(packed).toString().trim().split('\n'));
const manifest = read(path.join(STAGE3, 'split-manifest-v2-stage3.json'));
const controllers = new Map<string, number[]>();
for (const entry of [...replayEntries(), ...manifest.newReplayEntries]) {
    const root = entry.root ?? path.join(SOURCE, 'replay');
    for await (const row of gzipRows(fs.readFileSync(path.join(root, entry.packet.path)))) if (row.kind === 'game') { controllers.set(entry.responseSha256, row.playerTypes); break; }
}
const counts: Record<string, number> = {}, weighted: Record<string, number> = {}, actions: Record<string, number> = {}, origins: Record<string, number> = {};
let emitted = 0, totalWeight = 0;
for await (const row of corpus('train')) {
    if (Number.parseInt(sha(row.label.currentBeforeHash).slice(0, 8), 16) / 4294967296 >= 20000 / 141381) continue;
    if (excluded.has(ruleStateHash(row.state)) || excluded.has(row.label.sourceBeforeHash) || excluded.has(row.label.currentBeforeHash)) continue;
    const label = row.label, controller = label.source === 'replay' ? controllers.get(label.parentId)?.[row.state.currentPlayer] : null;
    if (label.source === 'replay') assert.ok(controller === 1 || controller === 2);
    const quality = label.source === 'replay' ? controller === 1 ? 2 : 1 : label.valueMask ? getAllianceId(row.state, row.state.currentPlayer) === label.winner ? 1.5 : .75 : 1;
    const weight = label.weight * quality;
    const phase = row.state.turn <= 5 ? 'opening' : row.state.turn <= 15 ? 'middle' : 'late', key = `${row.configuredPlayers}p/${phase}`, type = label.targetCode.split(':')[0];
    counts[key] = (counts[key] ?? 0) + 1; weighted[key] = (weighted[key] ?? 0) + weight;
    actions[type] = (actions[type] ?? 0) + 1; origins[label.source] = (origins[label.source] ?? 0) + weight;
    emitted++; totalWeight += weight;
}
assert.equal(emitted, 19127);
save('base-distribution-exact.json', { emitted, totalWeight, counts, weighted, actions, origins, evaluationIndexSha256: sha(packed), reproducesGen01BaseCount: true, denseFeatureFiles: 0, diagnosticSourceSha256: sha(fs.readFileSync(import.meta.filename)) });
console.log(JSON.stringify({ emitted, totalWeight, denseFeatureFiles: 0 }));
