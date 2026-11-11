import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import type { DualObservation } from '../../src/ai_runtime/dual_v2/contract';
import { calibrateValue } from '../../src/ai_runtime/dual_v2/value_calibration';
import { pipelineOutput } from '../dual_stream_v2_phase4_20261020/pipeline_eval';
import { streamReplay, createLoaderStats, loadExclusions, encodeSample, type SourceSample } from '../dual_stream_v2_phase3_20261020/source_loader';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import { sha } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.resolve(process.env.LEAGUE_FOLDER!);
const read = (n: string) => JSON.parse(fs.readFileSync(path.resolve(dir, n), 'utf8'));
const save = (n: string, x: any) => fs.writeFileSync(path.join(dir, n), JSON.stringify(x, null, 2));
const argmax = (x: ArrayLike<number>) => { let best = 0; for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i; return best; };
async function prepare() {
    const manifest = read('split-manifest-v2-stage3.json'), excluded = loadExclusions(manifest), stats = createLoaderStats();
    const pool: Array<{ priority: string; sample: SourceSample }> = [];
    for (const e of manifest.newReplayEntries.filter((e: any) => e.configuredPlayers === 2 && e.mode === 'SD')) {
        for await (const sample of streamReplay(e, excluded, stats)) {
            pool.push({ priority: sha(sample.currentBeforeHash), sample }); pool.sort((a, b) => a.priority.localeCompare(b.priority));
            if (pool.length > 16) pool.pop();
        }
    }
    assert.equal(pool.length, 16);
    const encoded = pool.map(p => encodeSample(p.sample));
    const pack = packTensorBatch(encoded.map(e => e.observation), encoded.map(e => ({ target: e.target, policyMask: true, weight: e.weight, valueTarget: e.outcome.target, valueMask: false })));
    const previous = read('../dual_stream_v2_phase2_20261020/samples.json');
    const previousBytes = fs.readFileSync(path.resolve(dir, '../dual_stream_v2_phase2_20261020/samples.bin'));
    const bytes = Buffer.concat([previousBytes, pack.bytes]);
    const meta = { ...previous, batches: 89, totalBytes: bytes.length, sha256: sha(bytes),
        arrays: [...previous.arrays, ...pack.metadata.arrays.map(e => ({ ...e, batch: e.batch + 73, offset: e.offset + previousBytes.length }))],
        sources: [...previous.sources, ...pool.map(p => ({ name: 'new-human-1v1', parentId: p.sample.parentId, beforeHash: p.sample.currentBeforeHash, width: p.sample.state.map.width, height: p.sample.state.map.height, macro: p.sample.macro, subAction: p.sample.subAction }))] };
    fs.writeFileSync(path.join(dir, 'samples.bin'), bytes); save('samples.json', meta);
    save('parity-sample-admission.json', { passed: true, inherited: 73, newHuman1v1: 16, unique: new Set(pool.map(p => p.sample.currentBeforeHash)).size, stats });
}
function nodeParity() {
    const prefix = 'model', manifest = read(prefix + '.json'), weight = fs.readFileSync(path.join(dir, prefix + '.bin'));
    const model = new DualStreamModel(manifest, weight.buffer.slice(weight.byteOffset, weight.byteOffset + weight.byteLength));
    const meta = read('samples.json'), bytes = fs.readFileSync(path.join(dir, 'samples.bin')), reference = read(prefix + '-torch-reference.json');
    assert.equal(sha(bytes), meta.sha256);
    const arrays: Record<string, any>[] = Array.from({ length: meta.batches }, () => ({}));
    for (const e of meta.arrays) {
        const raw = Uint8Array.from(bytes.subarray(e.offset, e.offset + e.bytes)).buffer;
        arrays[e.batch][e.name] = e.dtype === '<f4' ? new Float32Array(raw) : e.dtype === '<i4' ? new Int32Array(raw) : new Uint8Array(raw);
    }
    let maxLogit = 0, maxActor = 0, maxValue = 0;
    const pipelineInputs = read('pipeline-inputs.json'), pipelineReference = read('pipeline-reference.json'), finalBias = read('head-calibration.json').headBias, finalConfig = read('value-config.json');
    let pipelineError = 0, pipelineArgmax = true;
    const outputs: any[] = [], receipts: any[] = [];
    arrays.forEach((a, i) => {
        const n = a.entities.length / 66, source = meta.sources[i];
        const observation: DualObservation = { schema: 'dual-stream-v2-phase1-v1', width: source.width, height: source.height, spatialTensor: a.spatial, entityTokens: a.entities, relationalBias: a.relations,
            playerOrder: { features: a.players, active: a.active, playerIds: [], slotByPlayer: new Map() }, entityIndexMap: { globalActorIdx: n, entities: [], units: new Map(), castles: new Map(), graves: new Map() },
            actions: { pointers: a.pointers, actorMask: a.actorMask, sourceIndices: a.sourceIndices, tilesByActor: new Map(), rowsByActorTile: new Map() } };
        const out = model.forward(observation), errors: any = {};
        const final = pipelineOutput(pipelineInputs[i], out, finalBias, finalConfig);
        for (const key of ['scores', 'valueProbs'] as const) for (let j = 0; j < final[key].length; j++) pipelineError = Math.max(pipelineError, Math.abs(final[key][j] - pipelineReference[i][key][j]));
        pipelineArgmax &&= argmax(final.scores) === argmax(pipelineReference[i].scores) && argmax(final.valueProbs) === argmax(pipelineReference[i].valueProbs);
        for (const key of ['logits', 'actorPrior', 'valueProbs'] as const) {
            errors[key] = 0; assert.equal(out[key].length, reference[i][key].length);
            for (let j = 0; j < out[key].length; j++) errors[key] = Math.max(errors[key], Math.abs(out[key][j] - reference[i][key][j]));
        }
        maxLogit = Math.max(maxLogit, errors.logits); maxActor = Math.max(maxActor, errors.actorPrior); maxValue = Math.max(maxValue, errors.valueProbs);
        receipts.push({ ...source, errors, actionMatch: argmax(out.logits) === argmax(reference[i].logits), actorMatch: argmax(out.actorPrior) === argmax(reference[i].actorPrior) });
        outputs.push({ logits: [...out.logits], actorPrior: [...out.actorPrior], valueProbs: [...out.valueProbs] });
    });
    let calibratedError = 0, calibratedArgmax = true;
    const valueInputs = read('value-parity-inputs.json'), config = read('value-config.json');
    for (const row of valueInputs) {
        const p = calibrateValue(row.logits, row.active, row.features, config);
        for (let i = 0; i < 6; i++) calibratedError = Math.max(calibratedError, Math.abs(p[i] - row.expected[i]));
        calibratedArgmax &&= argmax(p) === argmax(row.expected);
    }
    const passed = pipelineError < 1e-5 && pipelineArgmax && calibratedError < 1e-5 && calibratedArgmax && Math.max(maxLogit, maxActor, maxValue) < 1e-6 && receipts.every(r => r.actionMatch && r.actorMatch);
    save(prefix + '-node-output.json', outputs); save(prefix + '-node-parity.json', { passed, maxLogit, maxActor, maxValue, pipelineError, pipelineArgmax, finalPipelineOriginalStates: 89, calibratedError, calibratedArgmax, calibratedSamples: valueInputs.length, receipts, modelSha256: sha(weight), samplesSha256: sha(bytes) });
    console.log(JSON.stringify({ passed, maxLogit, maxActor, maxValue })); assert.ok(passed);
}
if (process.argv[2] === 'prepare') await prepare();
if (process.argv[2] === 'node') nodeParity();
