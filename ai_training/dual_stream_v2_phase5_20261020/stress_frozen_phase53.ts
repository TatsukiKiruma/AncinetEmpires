import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './common';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { loadParentValueModel } from './value_parent';
import { warmedPolicy } from './warmup';

const original = read('phase53-audit/retaliation-stress-v4-attempt02.json'), probes: any[] = [];
const bytes = fs.readFileSync(path.join(DIR, 'generations/gen_03/model.bin'));
const model = new DualStreamModel(read('generations/gen_03/model.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
for (const source of original.probes) {
    const engine = new GameEngine(source.initial), self = source.initial.currentPlayer, witnesses: any[] = [], actions: any[] = [];
    const ai = warmedPolicy(engine, warmup => new DualStreamTurnSearchAI(model, { defaultQueue: source.defaultQueue, headBias: read('generations/gen_03/head-calibration.json').headBias, valueCalibration: read('generations/gen_03/value-config.json'), parentValueModel: loadParentValueModel('generations/gen_03'), onWitness: warmup ? undefined : w => witnesses.push(w) }));
    const start = performance.now(), action = ai.getAction(engine, self), ms = performance.now() - start;
    assert.ok(engine.getLegalActions(self).some(a => encodeAction(a) === encodeAction(action)));
    const telemetry = structuredClone(ai.telemetry); engine.step(action); actions.push(action);
    const queues: number[] = [];
    while (ai.memory.queue.length && !engine.isTerminal() && engine.getState().currentPlayer === self) {
        const t0 = performance.now(), queued = ai.getAction(engine, self); queues.push(performance.now() - t0);
        assert.ok(engine.getLegalActions(self).some(a => encodeAction(a) === encodeAction(queued))); engine.step(queued); actions.push(queued);
    }
    let witnessActions = 0;
    for (const w of witnesses) {
        const counter = new GameEngine(w.initial);
        for (const a of w.actions) { assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(v => encodeAction(v) === encodeAction(a))); counter.step(a); witnessActions++; }
        assert.equal(JSON.stringify(counter.getState()), w.finalHash);
    }
    probes.push({ ...source, ms, queues, telemetry, actions, witnesses, witnessActions, strict: true });
}
const attempts = probes.reduce((s, p) => s + p.telemetry.retaliationAttempts, 0), complete = probes.reduce((s, p) => s + p.telemetry.retaliationComplete, 0);
const result = { probes, attempts, complete, allComplete: attempts > 0 && attempts === complete, queueMax: Math.max(0, ...probes.flatMap(p => p.queues)), rootMax: Math.max(0, ...probes.map(p => p.ms)), runtimeSha256: sha(fs.readFileSync(path.resolve(DIR, '../../src/ai_runtime/dual_v2/turn_search_ai.ts'))), executionArgs: process.execArgv };
save(process.env.LEAGUE_STRESS_OUTPUT ?? 'phase53-audit/retaliation-stress-v4r2.json', result);
console.log(JSON.stringify({ probes: probes.length, attempts, complete, queueMax: result.queueMax, rootMax: result.rootMax }));
assert.ok(result.allComplete);
