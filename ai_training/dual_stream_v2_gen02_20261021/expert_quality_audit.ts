import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { DIR, read, restore, save, sha } from './common';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';

const old = path.resolve(DIR, '../dual_stream_v2_phase5_20261020');
const load = (file: string) => JSON.parse(fs.readFileSync(path.join(old, file), 'utf8'));
const plan = load('generations/gen_01/league-plan.json');
const bytes = fs.readFileSync(path.join(old, plan.teacherModel + '.bin'));
assert.equal(sha(bytes), plan.teacherSha256);
const model = new DualStreamModel(load(plan.teacherModel + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const pure = new DualStreamPureAI(model, { tactical: true, headBias: load(plan.teacherCalibration + '/head-calibration.json').headBias });
let checked = 0, corrections = 0, queuedCorrections = 0, invalidQueuedRoots = 0, badWeights = 0, rootMismatch = 0;
const sources: Record<string, string> = {};
for (const slot of plan.slots) {
    const base = `generations/gen_01/games/${slot.id}`, initial = load(slot.initialPath), samples = new Map<string, any>();
    const packed = fs.readFileSync(path.join(old, base, 'samples.jsonl.gz'));
    sources[base] = sha(packed);
    let probes = 0;
    for await (const row of gzipRows(packed)) {
        samples.set(row.id, row);
        if (row.correction && probes < 2) {
            const state = restore(row.state, initial.map, row.patches, row.mapIndex);
            const code = encodeAction(pure.getAction(new GameEngine(state), state.currentPlayer));
            assert.equal(code, row.purePreferredCode);
            assert.notEqual(code, row.targetCode);
            checked++; probes++;
        }
    }
    for await (const action of gzipRows(fs.readFileSync(path.join(old, base, 'actions.jsonl.gz')))) {
        const sample = samples.get(`${slot.id}:${action.i}`);
        if (!sample) continue;
        corrections += Number(sample.correction);
        queuedCorrections += Number(sample.correction && action.telemetry?.queued);
        invalidQueuedRoots += Number(sample.rootMask && action.telemetry?.queued);
        badWeights += Number(sample.quality !== (sample.correction ? 2.5 : 1.25));
        rootMismatch += Number(sample.rootMask && sample.rootValue !== action.telemetry.rootValue);
    }
}
assert.equal(invalidQueuedRoots + badWeights + rootMismatch, 0);
save('expert-quality-audit.json', { passed: true, corrections, queuedCorrections, independentlyRecomputedCorrections: checked, invalidQueuedRoots, badWeights, rootMismatch, teacherSha256: plan.teacherSha256, sources, policyContract: 'atomic-takeover-v2', usesOldPoolForNewTraining: false, rootScalarIsNaturalOutcome: false, auditSourceSha256: sha(fs.readFileSync(import.meta.filename)) });
console.log(JSON.stringify({ checked, corrections, queuedCorrections, invalidQueuedRoots, badWeights, rootMismatch }));
