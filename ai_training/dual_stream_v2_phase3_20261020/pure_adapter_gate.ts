import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { decodeFactoredAction } from '../../src/ai_runtime/dual_v2/factored_actions';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';
import { gzipRows, sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const plan = read('battle-plan.json'), bytes = fs.readFileSync(path.join(dir, 'dual-v2-stage3-pure.bin'));
assert.equal(sha(bytes), read('FINAL_MODEL_FROZEN.json').weightsSha256);
const receipts: any[] = [];
// 只读复算已提交动作，核实适配器确实执行原始argmax，不以战绩改变权重或动作规则。
for (const slot of plan.slots.filter((s: any) => fs.existsSync(path.join(dir, `battles/${s.id}/result.json`))).filter((_: any, i: number) => i % 4 === 0)) {
    const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
    const model = new DualStreamModel(read('dual-v2-stage3-pure.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const ai = new DualStreamPureAI(model); let checked = 0;
    for await (const row of gzipRows(fs.readFileSync(path.join(dir, `battles/${slot.id}/actions.jsonl.gz`)))) {
        const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        if (row.side === 'model' && (row.i % 29 === 0 || checked === 0) && checked < 6) {
            const observation = encodeDualObservation(state, legal), out = model.forward(observation);
            let best = 0; for (let i = 1; i < out.logits.length; i++) if (out.logits[i] > out.logits[best]) best = i;
            const bySourceIndex = encodeAction(legal[observation.actions.sourceIndices[best]]);
            const decoded = encodeAction(decodeFactoredAction(state, observation.entityIndexMap, observation.actions.pointers.subarray(best * 5, best * 5 + 5)));
            const actual = encodeAction(ai.getAction(engine, state.currentPlayer));
            assert.equal(actual, bySourceIndex); assert.equal(actual, decoded); assert.equal(actual, row.code);
            assert.equal(stateHash(engine.getState()), row.beforeHash);
            receipts.push({ slot: slot.id, i: row.i, action: row.code, rawArgmaxSource: bySourceIndex, decoded, adapter: actual, unchangedState: true }); checked++;
        }
        const action = legal.find(a => encodeAction(a) === row.code); assert.ok(action);
        const after = engine.step(action); assert.equal(stateHash(after.state), row.afterHash);
        if (checked >= 6) break;
    }
}
assert.ok(receipts.length >= 30);
fs.writeFileSync(path.join(dir, 'pure-adapter-actual-argmax-gate.json'), JSON.stringify({ passed: true, weightsSha256: sha(bytes), checked: receipts.length, policyRecomputed: true, receipts }, null, 2));
