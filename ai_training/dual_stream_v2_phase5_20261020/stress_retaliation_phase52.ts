import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';

const freeze = read('phase52-audit/runtime-freeze.json'), arena = freeze.archive, plan = read(arena + '/plan.json');
const bytes = fs.readFileSync(path.join(DIR, plan.modelPrefix + '.bin'));
const model = new DualStreamModel(read(plan.modelPrefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const probes: any[] = [];
for (const slot of plan.slots) {
    const prefix = `${arena}/battles/${slot.id}`;
    if (!fs.existsSync(path.join(DIR, prefix, 'result.json'))) continue;
    const engine = new GameEngine(read(plan.maps[slot.mapIndex].path)); let selected = 0;
    for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz')))) {
        const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
        if (selected < 4 && !row.telemetry?.queued && row.telemetry?.risks?.some((r: any) => !r.complete)) {
            const test = engine.clone(), witnesses: any[] = [];
            const ai = new DualStreamTurnSearchAI(model, { headBias: read(plan.calibrationPrefix + '/head-calibration.json').headBias, valueCalibration: read(plan.calibrationPrefix + '/value-config.json'), onWitness: w => witnesses.push(w) });
            const legal = test.getLegalActions(state.currentPlayer), started = performance.now();
            const action = ai.getAction(test, state.currentPlayer), ms = performance.now() - started;
            assert.ok(legal.some(a => encodeAction(a) === encodeAction(action)));
            const telemetry = structuredClone(ai.telemetry); test.step(action);
            const queues: number[] = [];
            while (ai.memory.queue.length && test.getState().currentPlayer === state.currentPlayer) {
                const valid = test.getLegalActions(state.currentPlayer), start = performance.now(), queued = ai.getAction(test, state.currentPlayer);
                queues.push(performance.now() - start); assert.ok(valid.some(a => encodeAction(a) === encodeAction(queued))); test.step(queued);
            }
            let witnessActions = 0;
            for (const w of witnesses) {
                const counter = new GameEngine(w.initial);
                for (const a of w.actions) { assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(v => encodeAction(v) === encodeAction(a))); counter.step(a); witnessActions++; }
                assert.equal(JSON.stringify(counter.getState()), w.finalHash);
            }
            probes.push({ slot: slot.id, step: row.i, beforeHash: row.beforeHash, ms, queues, telemetry, witnessActions, strict: true }); selected++;
        }
        const legal = engine.getLegalActions(engine.getState().currentPlayer), action = legal.find(a => encodeAction(a) === row.code); assert.ok(action); engine.step(action);
        if (probes.length >= 16) break;
    }
    if (probes.length >= 16) break;
}
const attempts = probes.reduce((s, p) => s + p.telemetry.retaliationAttempts, 0), complete = probes.reduce((s, p) => s + p.telemetry.retaliationComplete, 0);
save('phase52-audit/retaliation-stress-v3.json', { probes, attempts, complete, allComplete: attempts === complete && attempts > 0, modelSha256: sha(bytes), runtime: freeze.runtime });
console.log(JSON.stringify({ probes: probes.length, attempts, complete, queueMax: Math.max(...probes.flatMap(p => p.queues)), maxRoot: Math.max(...probes.map(p => p.ms)) }));
assert.equal(attempts, complete, '扩大窗口仍未完成全部真实反扑，保留失败证据');
