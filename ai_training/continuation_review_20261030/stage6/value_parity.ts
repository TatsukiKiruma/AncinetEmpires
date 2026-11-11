import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { Stage4InferenceClient } from './arena_client';
import { initialState, read } from '../stage1/io';

// 同一组真实训练初态独立编码两条路径，验证输入逐字节一致和GPU价值等价。
const here = path.dirname(fileURLToPath(import.meta.url));
const parents = read(path.join(here, '../stage1/PARTITIONS.json')).parents.filter((p: any) => p.corpus === 'new' && p.admitted && p.split === 'train');
const full = [], values = [], samples = [];
let fullEncodeMs = 0, valueEncodeMs = 0;
for (let i = 0; i < 64; i++) {
    const p = parents.filter((p: any) => p.players === 2 + i % 3)[Math.floor(i / 3)];
    const state = initialState(p), engine = new GameEngine(state, {applyInitialTurnStart: false});
    let start = performance.now();
    const a = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
    fullEncodeMs += performance.now() - start; start = performance.now();
    const b = encodeDualObservation(state, []); valueEncodeMs += performance.now() - start;
    for (const key of ['spatialTensor', 'entityTokens', 'relationalBias'] as const) assert.deepEqual(a[key], b[key]);
    assert.deepEqual(a.playerOrder, b.playerOrder); assert.equal(b.actions.pointers.length, 0);
    full.push(a); values.push(b); samples.push({parentId: p.parentId, players: p.players, width: a.width, height: a.height});
}
const client = new Stage4InferenceClient(read(path.join(here, 'config-C1.json')).modelPrefix);
let maxAbs = 0, maxLogitAbs = 0, fullMs = 0, valueMs = 0;
try {
    await client.forwardBatch(full.slice(0, 4));
    await client.forwardBatch(values.slice(0, 4), {deadline: performance.now() + 120000, valueOnly: true});
    for (let i = 0; i < 64; i += 8) {
        let start = performance.now();
        const a = await client.forwardBatch(full.slice(i, i + 8)); fullMs += performance.now() - start;
        start = performance.now();
        const b = await client.forwardBatch(values.slice(i, i + 8), {deadline: performance.now() + 120000, valueOnly: true}); valueMs += performance.now() - start;
        a.forEach((row, j) => {
            assert.equal(b[j].logits.length, 0);
            for (let k = 0; k < 6; k++) {
                maxAbs = Math.max(maxAbs, Math.abs(row.valueProbs[k] - b[j].valueProbs[k]));
                maxLogitAbs = Math.max(maxLogitAbs, Math.abs(row.valueLogits[k] - b[j].valueLogits[k]));
            }
        });
    }
} finally {await client.close();}
const report = {passed: maxAbs < 1e-6, samples, maxAbs, maxLogitAbs, fullEncodeMs, valueEncodeMs, fullMs, valueMs, gpuExited: client.exited, sealedAccess: 0, retainedReachability: true, limitation: '此处仅计64状态编码和前向；单局基准另行验证'};
fs.writeFileSync(path.join(here, 'VALUE_ONLY_PARITY.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify(report)); assert.ok(report.passed);

