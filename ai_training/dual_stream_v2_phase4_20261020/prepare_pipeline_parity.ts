import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import type { GameState } from '../../src/game/types';
import { getLegalActions } from '../../src/game/rules';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { valueCalibrationFeatures } from '../../src/ai_runtime/dual_v2/value_calibration';
import { architectureFixtures } from '../dual_stream_v2_phase2_20261020/fixture_states';
import { streamReplay, createLoaderStats, loadExclusions } from '../dual_stream_v2_phase3_20261020/source_loader';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
const dir = import.meta.dirname, read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(dir, p), 'utf8'));
const meta = read('samples.json'), bytes = fs.readFileSync(path.join(dir, 'samples.bin'));
const states: GameState[] = [...JSON.parse(gunzipSync(fs.readFileSync(path.resolve(dir, '../dual_stream_v2_phase2_20261020/real-states.json.gz'))).toString()), ...architectureFixtures().map(x => x.state)];
const found = new Map<string, GameState>(), wanted = new Set<string>(meta.sources.slice(73).map((x: any) => x.beforeHash));
const manifest = read('../dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json'), exclusions = loadExclusions(manifest), stats = createLoaderStats();
for (const entry of manifest.newReplayEntries.filter((x: any) => x.configuredPlayers === 2 && x.mode === 'SD')) {
    for await (const sample of streamReplay(entry, exclusions, stats)) if (wanted.has(sample.currentBeforeHash)) found.set(sample.currentBeforeHash, sample.state);
}
for (const source of meta.sources.slice(73)) { const state = found.get(source.beforeHash); assert.ok(state); states.push(state); }
assert.equal(states.length, 89);
const inputs = states.map((state, i) => {
    if (meta.sources[i].beforeHash) assert.equal(stateHash(state), meta.sources[i].beforeHash);
    const legal = getLegalActions(state, state.currentPlayer), observation = encodeDualObservation(state, legal), priors = tacticalActionPriors(state, legal);
    const arrays: Record<string, Float32Array | Int32Array | Uint8Array> = { spatial: observation.spatialTensor, entities: observation.entityTokens, relations: observation.relationalBias, players: observation.playerOrder.features, active: observation.playerOrder.active, pointers: observation.actions.pointers, actorMask: observation.actions.actorMask, sourceIndices: observation.actions.sourceIndices };
    for (const e of meta.arrays.filter((e: any) => e.batch === i && arrays[e.name])) {
        const a = arrays[e.name]; assert.deepEqual(Buffer.from(a.buffer, a.byteOffset, a.byteLength), bytes.subarray(e.offset, e.offset + e.bytes), `第${i}帧${e.name}漂移`);
    }
    return { state, sourceIndices: [...observation.actions.sourceIndices], prior: Array.from(observation.actions.sourceIndices, j => priors[j].prior), heads: Array.from(observation.actions.sourceIndices, (_, j) => observation.actions.pointers[j * 5 + 2]), features: valueCalibrationFeatures(state, observation.playerOrder), beforeHash: stateHash(state) };
});
fs.writeFileSync(path.join(dir, 'pipeline-inputs.json'), JSON.stringify(inputs));
fs.writeFileSync(path.join(dir, 'pipeline-state-recovery.json'), JSON.stringify({ passed: true, states: states.length, allFrozenObservationArraysByteIdentical: true, stats }, null, 2));
console.log(JSON.stringify({ passed: true, states: states.length }));
