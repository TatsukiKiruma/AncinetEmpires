import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { loadParentValueModel } from './value_parent';

// 从上一运行时的真实失败前态取压力样本，不以新对战胜负选参数。
const arenas = ['champion-search-arena', 'generations/gen_03/arena'];
const probes: any[] = [];
for (const arena of arenas) {
    const plan = read(arena + '/plan.json'), bytes = fs.readFileSync(path.join(DIR, plan.modelPrefix + '.bin'));
    const model = new DualStreamModel(read(plan.modelPrefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    for (const slot of plan.slots.filter((s: any) => s.mode === 'turn_search')) {
        const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, arena, 'battles', slot.id, 'actions.jsonl.gz')))) {
            const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
            if (!row.telemetry?.queued && row.telemetry?.risks?.some((r: any) => !r.complete)) {
                for (const defaultQueue of ['first_unit', 'full'] as const) {
                    const witnesses: any[] = [], test = engine.clone();
                    const ai = new DualStreamTurnSearchAI(model, { defaultQueue, headBias: read(plan.calibrationPrefix + '/head-calibration.json').headBias, valueCalibration: read(plan.calibrationPrefix + '/value-config.json'), parentValueModel: loadParentValueModel(plan.calibrationPrefix), onWitness: w => witnesses.push(w) });
                    const start = performance.now(), action = ai.getAction(test, state.currentPlayer), ms = performance.now() - start;
                    assert.ok(test.getLegalActions(state.currentPlayer).some(a => encodeAction(a) === encodeAction(action)));
                    const telemetry = structuredClone(ai.telemetry); test.step(action);
                    const queues: number[] = [];
                    while (ai.memory.queue.length && !test.isTerminal() && test.getState().currentPlayer === state.currentPlayer) {
                        const t0 = performance.now(), queued = ai.getAction(test, state.currentPlayer); queues.push(performance.now() - t0);
                        assert.ok(test.getLegalActions(state.currentPlayer).some(a => encodeAction(a) === encodeAction(queued))); test.step(queued);
                    }
                    let witnessActions = 0;
                    for (const w of witnesses) {
                        const counter = new GameEngine(w.initial);
                        for (const a of w.actions) { assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(v => encodeAction(v) === encodeAction(a))); counter.step(a); witnessActions++; }
                        assert.equal(JSON.stringify(counter.getState()), w.finalHash);
                    }
                    probes.push({ arena, slot: slot.id, step: row.i, initial: state, beforeHash: row.beforeHash, defaultQueue, ms, queues, telemetry, witnessActions, strict: true });
                }
            }
            const action = engine.getLegalActions(state.currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action); engine.step(action);
        }
    }
}
const attempts = probes.reduce((s, p) => s + p.telemetry.retaliationAttempts, 0), complete = probes.reduce((s, p) => s + p.telemetry.retaliationComplete, 0);
const result = { probes, attempts, complete, allComplete: attempts > 0 && attempts === complete, queueMax: Math.max(0, ...probes.flatMap(p => p.queues)), rootMax: Math.max(0, ...probes.map(p => p.ms)), runtimeSha256: sha(fs.readFileSync(path.resolve(DIR, '../../src/ai_runtime/dual_v2/turn_search_ai.ts'))) };
save(process.env.LEAGUE_STRESS_OUTPUT ?? 'phase53-audit/retaliation-stress-v4.json', result);
console.log(JSON.stringify({ probes: probes.length, attempts, complete, queueMax: result.queueMax, rootMax: result.rootMax }));
assert.ok(result.allComplete);
