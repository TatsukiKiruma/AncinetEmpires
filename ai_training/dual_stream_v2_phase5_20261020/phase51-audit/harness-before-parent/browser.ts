import { calibrateValue } from '../../src/ai_runtime/dual_v2/value_calibration';
import { pipelineOutput } from '../dual_stream_v2_phase4_20261020/pipeline_eval';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import type { DualObservation } from '../../src/ai_runtime/dual_v2/contract';

const argmax = (x: number[] | Float32Array) => { let best = 0; for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i; return best; };
async function main() {
    const prefix = new URL(location.href).searchParams.get('prefix') ?? 'model';
    const [manifest, weights, meta, bytes, reference, node] = await Promise.all([
        fetch(`/${prefix}.json`).then(r => r.json()), fetch(`/${prefix}.bin`).then(r => r.arrayBuffer()), fetch('/samples.json').then(r => r.json()), fetch('/samples.bin').then(r => r.arrayBuffer()),
        fetch(`/${prefix}-torch-reference.json`).then(r => r.json()), fetch(`/${prefix}-node-output.json`).then(r => r.json())
    ]);
    const model = new DualStreamModel(manifest, weights), arrays: Record<string, Float32Array | Int32Array | Uint8Array>[] = Array.from({ length: meta.batches }, () => ({}));
    for (const e of meta.arrays) {
        const raw = bytes.slice(e.offset, e.offset + e.bytes);
        arrays[e.batch][e.name] = e.dtype === '<f4' ? new Float32Array(raw) : e.dtype === '<i4' ? new Int32Array(raw) : new Uint8Array(raw);
    }
    let maxLogit = 0, maxActor = 0, maxValue = 0, maxNode = 0;
    const [pipelineInputs, pipelineReference, finalBias, finalConfig] = await Promise.all([fetch('/pipeline-inputs.json').then(r => r.json()), fetch('/pipeline-reference.json').then(r => r.json()), fetch('/head-calibration.json').then(r => r.json()), fetch('/value-config.json').then(r => r.json())]);
    let pipelineError = 0, pipelineArgmax = true;
    const receipts = arrays.map((a, i) => {
        const source = meta.sources[i], n = a.entities.length / 66;
        const observation: DualObservation = { schema: 'dual-stream-v2-phase1-v1', width: source.width, height: source.height, spatialTensor: a.spatial as Float32Array, entityTokens: a.entities as Float32Array, relationalBias: a.relations as Float32Array,
            playerOrder: { features: a.players as Float32Array, active: a.active as Uint8Array, playerIds: [], slotByPlayer: new Map() }, entityIndexMap: { globalActorIdx: n, entities: [], units: new Map(), castles: new Map(), graves: new Map() },
            actions: { pointers: a.pointers as Int32Array, actorMask: a.actorMask as Uint8Array, sourceIndices: new Int32Array(a.pointers.length / 5), tilesByActor: new Map(), rowsByActorTile: new Map() } };
        const out = model.forward(observation); let logitError = 0, actorError = 0, valueError = 0, nodeError = 0;
        const final = pipelineOutput(pipelineInputs[i], out, finalBias.headBias, finalConfig);
        for (const key of ['scores', 'valueProbs'] as const) for (let j = 0; j < final[key].length; j++) pipelineError = Math.max(pipelineError, Math.abs(final[key][j] - pipelineReference[i][key][j]));
        pipelineArgmax &&= argmax([...final.scores]) === argmax(pipelineReference[i].scores) && argmax(final.valueProbs) === argmax(pipelineReference[i].valueProbs);
        for (let j = 0; j < out.logits.length; j++) logitError = Math.max(logitError, Math.abs(out.logits[j] - reference[i].logits[j]));
        for (let j = 0; j < out.actorPrior.length; j++) actorError = Math.max(actorError, Math.abs(out.actorPrior[j] - reference[i].actorPrior[j]));
        for (let j = 0; j < 6; j++) valueError = Math.max(valueError, Math.abs(out.valueProbs[j] - reference[i].valueProbs[j]));
        for (const key of ['logits', 'actorPrior', 'valueProbs'] as const) for (let j = 0; j < out[key].length; j++) nodeError = Math.max(nodeError, Math.abs(out[key][j] - node[i][key][j]));
        maxLogit = Math.max(maxLogit, logitError); maxActor = Math.max(maxActor, actorError); maxValue = Math.max(maxValue, valueError); maxNode = Math.max(maxNode, nodeError);
        return { ...source, logitError, actorError, valueError, nodeError, actionMatch: argmax(out.logits) === argmax(reference[i].logits) && argmax(out.logits) === argmax(node[i].logits), actorMatch: argmax(out.actorPrior) === argmax(reference[i].actorPrior) && argmax(out.actorPrior) === argmax(node[i].actorPrior) };
    });
    let calibratedError = 0;
    const valueInputs = await fetch('/value-parity-inputs.json').then(r => r.json());
    const config = await fetch('/value-config.json').then(r => r.json());
    for (const row of valueInputs) {
        const result = calibrateValue(row.logits, row.active, row.features, config);
        for (let s = 0; s < 6; s++) calibratedError = Math.max(calibratedError, Math.abs(result[s] - row.expected[s]));
    }
    return { pipelineError, pipelineArgmax, finalPipelineOriginalStates: 89, calibratedError, calibratedSamples: valueInputs.length, passed: pipelineError < 1e-5 && pipelineArgmax && calibratedError < 1e-5 && maxLogit < 1e-6 && maxActor < 1e-6 && maxValue < 1e-6 && maxNode < 1e-6 && receipts.every(r => r.actionMatch && r.actorMatch), prefix, userAgent: navigator.userAgent, maxLogit, maxActor, maxValue, maxNode, receipts };
}
main().catch(error => ({ passed: false, error: String(error), stack: error.stack })).then(result => fetch('/complete', { method: 'POST', body: JSON.stringify(result) }));
