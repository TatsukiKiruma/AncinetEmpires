import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ClientV2 } from './client_v2';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { schedule } from './scenarios';
import { data, here, K1, guard, read, save } from './io';
guard(); fs.mkdirSync(data, {recursive: true});
const bytes = fs.readFileSync(K1.prefix + '.bin');
const model = new DualStreamModel(read(K1.prefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const client = new ClientV2('default', 2, K1);
const errors = {logits: 0, valueLogits: 0, valueProbs: 0};
const started = Date.now();
try {
    for (const job of schedule(1, 0).filter((_, i) => i % 4 === 0)) {
        const engine = new GameEngine(job.state, {applyInitialTurnStart: false});
        const obs = encodeDualObservation(job.state, engine.getLegalActions(job.state.currentPlayer).filter(a => a.type !== 'surrender'));
        const [gpu] = await client.forwardBatch([obs]); const ts = model.forward(obs);
        for (const field of ['logits', 'valueLogits', 'valueProbs'] as const) {
            assert.equal(gpu[field].length, ts[field].length);
            for (let i = 0; i < ts[field].length; i++) errors[field] = Math.max(errors[field], Math.abs(gpu[field][i] - ts[field][i]));
        }
    }
} finally { await client.close(); }
const result = {passed: Object.values(errors).every(e => Number.isFinite(e) && e < .001), errors, tolerance: .001,
    note: '正式 FP32 GPU 服务烟测；导出模型另执行高精度 2e-5 双端对拍', model: K1, elapsedMs: Date.now() - started, sealedAccess: 0};
save(path.join(here, 'GPU_SMOKE.json'), result); console.log(result); assert(result.passed);
