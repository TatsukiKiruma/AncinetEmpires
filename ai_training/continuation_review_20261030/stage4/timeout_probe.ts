/** 只诊断失败根前态，不继续或重跑失败的整局，也不产生替代对局成绩。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { withinSearchBudget, SearchBudgetExpiredError } from '../../../src/ai_runtime/dual_v3/search_budget';
import { Stage4InferenceClient } from './inference_client';
import { HERE, DATA, read, save, fileSha, modelIdentity } from './io';

const out = path.join(DATA, 'gpu-timeout-repair-probe-v3');
if (fs.existsSync(out)) throw Error('诊断记录已存在，禁止覆盖'); fs.mkdirSync(out);
const source = path.join(DATA, 'dev-v2-screen-maxn-prior1/p3-12-s0/final.json'), state = read(source);
const config = read(path.join(HERE, 'config-v2-maxn-prior1.json')), client = new Stage4InferenceClient(modelIdentity().prefix);
const results = [];
try {
    const engine = new GameEngine(state, { applyInitialTurnStart: false }), observation = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
    await client.forwardBatch([observation]);
    // 真实GPU单次回复之后故意延迟消费者，确定触发软截止；服务连接必须仍可复用。
    const delayed = client.forwardBatch([observation]).then(async rows => { await new Promise(r => setTimeout(r, 60)); return rows; });
    await assert.rejects(withinSearchBudget(() => delayed, performance.now() + 10), SearchBudgetExpiredError);
    await client.forwardBatch([observation]); assert.equal(client.exited, false);
    for (let i = 0; i < 3; i++) {
        const witnesses: any[] = [], ai = new BatchedNeuralBeamSearchAI(client, { ...config, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, state.currentPlayer);
        assert(engine.hasLegalAction(state.currentPlayer, action)); assert.deepEqual(engine.getState(), state);
        let actions = 0;
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial, { applyInitialTurnStart: false });
            for (const a of w.actions) { assert(replay.hasLegalAction(replay.getState().currentPlayer, a)); replay.step(a); actions++; }
            assert.deepEqual(replay.getState(), w.final);
        }
        const result = { repetition: i, action, telemetry: ai.telemetry, witnessCount: witnesses.length, witnessActions: actions, witnessesLegal: true };
        results.push(result); await save(path.join(out, `root-${i}.json`), result, true);
        console.log(JSON.stringify({ i, ms: ai.telemetry.rootMs, budgetExpirations: ai.telemetry.budgetExpirations, candidates: ai.telemetry.candidates.filter(c => c.responseComplete).length, witnessActions: actions }));
    }
} finally { await client.close(); }
await save(path.join(HERE, 'GPU_TIMEOUT_REPAIR_CHECK.json'), { passed: true, sourceState: source, sourceSha256: fileSha(source), results, realGpuReconnectPassed: true, diagnostics: client.diagnostics,
    gpuExited: client.exited, scoredGamesAdded: 0, sealedPanelAccess: 0, limitation: '旧故障没有保存最后一请求的batch和耗时，不能反推出该请求究竟慢了多少；已确定并修复软预算被当作杀死服务及整局判负的控制流错误' }, true);
