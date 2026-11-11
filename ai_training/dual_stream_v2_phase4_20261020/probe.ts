import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
const dir = import.meta.dirname, read = (s: string) => JSON.parse(fs.readFileSync(dir + '/' + s, 'utf8'));
const bytes = fs.readFileSync(dir + '/dual-v2-stage4-pure.bin'), model = new DualStreamModel(read('dual-v2-stage4-pure.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const options = fs.existsSync(dir + '/value-config.json') ? { headBias: read('head-calibration.json').headBias, valueCalibration: read('value-config.json') } : {};
const results = [];
for (const map of read('battle-plan.json').maps) {
    const engine = new GameEngine(read(map.path)), state = engine.getState(), ai = new DualStreamTurnSearchAI(model, options);
    const start = performance.now(), action = ai.getAction(engine, state.currentPlayer), ms = performance.now() - start;
    assert.ok(engine.getLegalActions(state.currentPlayer).some(a => encodeAction(a) === encodeAction(action))); assert.deepEqual(state, engine.getState());
    const telemetry = { ...ai.telemetry }; engine.step(action); const queue = [];
    while (ai.memory.queue.length && !engine.isTerminal() && engine.getState().currentPlayer === state.currentPlayer) {
        const t = performance.now(), a = ai.getAction(engine, state.currentPlayer); queue.push(performance.now() - t);
        assert.ok(ai.telemetry.queued); engine.step(a);
    }
    results.push({ name: map.name, ms, queue, telemetry });
}
fs.writeFileSync(dir + '/search-probe.json', JSON.stringify({ passed: results.every(r => r.ms <= 1000), finalCalibration: !!options.valueCalibration, results }, null, 2));
console.log(JSON.stringify(results));
