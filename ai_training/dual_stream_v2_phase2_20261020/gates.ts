import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { getLegalActions } from '../../src/game/rules';
import { architectureFixtures } from './fixtures';
import { DIR, loadObservations, read, save, sha } from './io';

function identity(prefix = 'initial') {
    const runtimeDir = path.resolve(DIR, '../../src/ai_runtime/dual_v2');
    return { weightsSha256: sha(fs.readFileSync(path.join(DIR, prefix + '.bin'))), samplesSha256: sha(fs.readFileSync(path.join(DIR, 'samples.bin'))), runtimeIdentity: Object.fromEntries(fs.readdirSync(runtimeDir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort().map(name => [name, sha(fs.readFileSync(path.join(runtimeDir, name)))])) };
}

export function model(prefix = 'initial') {
    const bytes = fs.readFileSync(path.join(DIR, prefix + '.bin'));
    return new DualStreamModel(read(prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
export const argmax = (values: ArrayLike<number>) => { let best = 0; for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i; return best; };

function sanity() {
    const m = model(), { observations, meta } = loadObservations();
    const receipts = observations.map((x, i) => {
        const out = m.forward(x);
        for (const values of Object.values(out)) assert.ok([...values].every(Number.isFinite));
        const sum = [...out.valueProbs].reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 1e-6);
        for (let s = 0; s < 6; s++) if (!x.playerOrder.active[s]) assert.equal(out.valueProbs[s], 0);
        assert.equal(out.logits.length, x.actions.pointers.length / 5);
        assert.ok(Math.abs([...out.actorPrior].reduce((a, b) => a + b, 0) - 1) < 1e-6);
        for (let a = 0; a < out.logits.length; a++) assert.ok(Number.isFinite(out.conditionalPrior[a]));
        return { ...meta.sources[i], activePlayers: [...x.playerOrder.active].reduce((a, b) => a + b, 0), candidates: out.logits.length, entities: out.actorPrior.length - 1, finite: true, valueSum: sum };
    });
    // 空实体、最小图及奇偶混合矩形也必须可以前向。
    const edgeSizes = [[6, 6], [7, 6], [6, 7], [15, 12], [20, 13], [63, 64]];
    const source = architectureFixtures()[0].state;
    for (const [w, h] of edgeSizes) {
        const state = structuredClone(source); state.units = []; state.graves = []; state.map = { width: w, height: h, tiles: Array.from({ length: h }, () => Array.from({ length: w }, () => ({ terrainId: 1, ownerId: null }))) };
        const x = encodeDualObservation(state, [{ type: 'end_turn' }]), out = m.forward(x);
        assert.equal(out.logits.length, 1); assert.equal(out.actorPrior[0], 1);
    }
    const parameters = read('initial.json').parameters;
    save('architecture-sanity-gate.json', { passed: parameters >= 350000 && parameters <= 750000, ...identity(), parameters, fixtures: receipts, emptyEntityAndOddRectangles: edgeSizes, layout: '训练端CHW，独立TS内部HWC；最近邻整数复制并截片' });
    console.log(JSON.stringify({ sanity: true, parameters, samples: receipts.length }));
}
function parity(prefix = 'initial') {
    const m = model(prefix), { observations, meta } = loadObservations(), reference = read(prefix + '-torch-reference.json');
    let maxLogit = 0, maxValue = 0, maxActor = 0;
    const outputs: any[] = [], receipts: any[] = [];
    observations.forEach((x, i) => {
        const out = m.forward(x); let logitError = 0, valueError = 0, actorError = 0;
        for (let a = 0; a < out.logits.length; a++) logitError = Math.max(logitError, Math.abs(out.logits[a] - reference[i].logits[a]));
        for (let s = 0; s < 6; s++) valueError = Math.max(valueError, Math.abs(out.valueProbs[s] - reference[i].valueProbs[s]));
        for (let a = 0; a < out.actorPrior.length; a++) actorError = Math.max(actorError, Math.abs(out.actorPrior[a] - reference[i].actorPrior[a]));
        maxLogit = Math.max(maxLogit, logitError); maxValue = Math.max(maxValue, valueError); maxActor = Math.max(maxActor, actorError);
        const actionMatch = argmax(out.logits) === argmax(reference[i].logits), actorMatch = argmax(out.actorPrior) === argmax(reference[i].actorPrior);
        receipts.push({ ...meta.sources[i], logitError, valueError, actorError, actionMatch, actorMatch });
        outputs.push({ logits: [...out.logits], actorPrior: [...out.actorPrior], valueProbs: [...out.valueProbs] });
    });
    const passed = maxLogit < 1e-5 && maxValue < 1e-5 && receipts.every(r => r.actionMatch && r.actorMatch);
    save(prefix + '-node-parity.json', { passed, ...identity(prefix), maxLogit, maxValue, maxActor, receipts }); save(prefix + '-node-output.json', outputs);
    console.log(JSON.stringify({ passed, maxLogit, maxValue, maxActor, mismatches: receipts.filter(r => !r.actionMatch || !r.actorMatch).length }));
}
function speed() {
    const m = model(), fixtures = architectureFixtures();
    const results = [fixtures[0], fixtures[8], fixtures[6]].map(({ name, state }) => {
        const legal = getLegalActions(state, state.currentPlayer), times: number[] = [], encoding: number[] = [], network: number[] = [];
        for (let i = 0; i < 60; i++) m.forward(encodeDualObservation(state, legal));
        for (let i = 0; i < 100; i++) {
            const start = performance.now(), x = encodeDualObservation(state, legal), middle = performance.now(); m.forward(x); const end = performance.now();
            times.push(end - start); encoding.push(middle - start); network.push(end - middle);
        }
        const sorted = [...times].sort((a, b) => a - b), limit = name.includes('100units') ? 45 : 15;
        return { name, units: state.units.length, legalActions: legal.length, candidates: legal.filter(a => a.type !== 'surrender').length, width: state.map.width, height: state.map.height, warmup: 60, iterations: 100, milliseconds: times, encoding, network, p50: sorted[49], p95: sorted[94], max: sorted[99], limit, passed: sorted[94] <= limit };
    });
    save('inference-speed-gate.json', { passed: results.every(r => r.passed), ...identity(), scope: '单进程完整阶段1编码与阶段2Policy+Value；不缓存观测或网络输出；权威合法集合预先给定，与阶段1口径相同', node: process.version, cpu: os.cpus()[0]?.model, results });
    console.log(JSON.stringify(results.map(({ name, p50, p95, passed }) => ({ name, p50, p95, passed }))));
}
const command = process.argv[2];
if (command === 'sanity') sanity();
if (command === 'parity') parity(process.argv[3]);
if (command === 'speed') speed();
