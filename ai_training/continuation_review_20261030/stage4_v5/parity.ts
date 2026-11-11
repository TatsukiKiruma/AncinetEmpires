import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { HERE, S3, DATA, read, save, fileSha, modelIdentity } from './io';
import { Stage4InferenceClient } from './inference_client';

const identity = modelIdentity(), panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), panel = read(panelFile);
const manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
assert.equal(manifest.panelSha256, fileSha(panelFile));
const slots = Array.from({ length: 16 }, (_, i) => manifest.slots[(i * 7) % manifest.slots.length]);
const observations = slots.map(slot => {
    const file = path.join(S3, slot.file); assert.equal(fileSha(file), slot.sha256);
    const engine = new GameEngine(read(file), panel.engineOptions), state = engine.getState();
    return encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
});
const bytes = fs.readFileSync(identity.prefix + '.bin');
const model = new DualStreamModel(read(identity.prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const client = new Stage4InferenceClient(identity.prefix);
const errors: Record<string, number> = {}, samples: any[] = [], timing: Record<string, number[]> = { serial16: [], same16: [], mixed16: [] };
const compare = (a: any, b: any, group: string) => {
    for (const field of ['logits', 'valueLogits', 'valueProbs']) {
        assert.equal(a[field].length, b[field].length);
        const error = Array.from(a[field] as ArrayLike<number>).reduce<number>((v, x, i) => Math.max(v, Math.abs(x - b[field][i])), 0);
        errors[group + '/' + field] = Math.max(errors[group + '/' + field] ?? 0, error);
    }
};
try {
    const singles = [];
    for (const o of observations) singles.push((await client.forwardBatch([o]))[0]);
    const same = await client.forwardBatch(Array(16).fill(observations[0])), mixed = await client.forwardBatch(observations);
    for (let i = 0; i < 16; i++) {
        compare(singles[0], same[i], 'single-vs-same16');
        compare(singles[i], mixed[i], 'single-vs-mixed16');
        const reference = model.forward(observations[i]);
        compare(reference, singles[i], 'typescript-vs-single');
        compare(reference, mixed[i], 'typescript-vs-mixed16');
        samples.push({ slot: slots[i].slot, width: observations[i].width, height: observations[i].height, entities: observations[i].entityIndexMap.globalActorIdx, actions: singles[i].logits.length });
    }
    // 首次编译及设备初始化不混入稳态吞吐；实测端到端包含编码后IPC打包与解包。
    for (let repeat = 0; repeat < 3; repeat++) for (const kind of Object.keys(timing)) {
        const t = performance.now();
        if (kind === 'serial16') for (const o of observations) await client.forwardBatch([o]);
        else await client.forwardBatch(kind === 'same16' ? Array(16).fill(observations[0]) : observations);
        timing[kind].push(performance.now() - t);
    }
    // 覆盖请求边界128，服务内部按显存安全微批执行。
    const large = await client.forwardBatch(Array(128).fill(observations[0]));
    large.forEach(o => compare(singles[0], o, 'single-vs-128'));
    assert(Object.values(errors).every(e => e < 2e-5), JSON.stringify(errors));
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    await save(path.join(HERE, process.argv[2] ?? 'GPU_BATCH_PARITY.json'), { passed: true, model: identity, panel: 'dev', sealedPanelAccess: 0,
        maxAbsoluteTolerance: 2e-5, errors, samples, timingMs: timing,
        observationsPerSecond: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, 16000 / mean(v)])),
        mixedSpeedupVsSerial: mean(timing.serial16) / mean(timing.mixed16), sameSpeedupVsSerial: mean(timing.serial16) / mean(timing.same16),
        maxRequest: 128, noOptimizerUpdates: true, raggedSources: Object.fromEntries(['ragged_batch.py', 'ragged_map.py'].map(f => [f, fileSha(path.join(S3, f))])),
        finished: new Date().toISOString(), cacheDirectory: DATA }, true);
    console.log(JSON.stringify({ passed: true, errors, timing }));
} catch (error) {
    await save(path.join(HERE, `GPU_BATCH_PARITY_FAILURE_${Date.now()}.json`), { passed: false, error: String(error), errors, finished: new Date().toISOString() }, true);
    throw error;
} finally { await client.close(); }
