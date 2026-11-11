/** 只从已经暴露的开发冒烟轨迹抽取复杂根前态，检查完成优先的响应调度。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { responseActionIndices } from '../../../src/ai_runtime/dual_v3/response_proposals';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { Stage4InferenceClient } from './inference_client';
import { HERE, S3, DATA, read, save, sha, modelIdentity } from './io';
import { lines } from './analysis';

const label = process.argv[2] ?? 'response-health-v2', out = path.join(DATA, label);
if (fs.existsSync(out)) throw Error('不可覆盖开发健康诊断'); fs.mkdirSync(out);
const smoke = path.join(DATA, 'dev-smoke-v1'), rootSteps: number[] = [];
for await (const t of lines(path.join(smoke, 'p3-12-s0/search.jsonl.gz'))) if (!t.queued && t.stopReason !== 'unique_action') rootSteps.push(t.step);
const selected = new Set([0, 20, 50, 90, 130, 170, 210, 250].map(i => rootSteps[Math.min(i, rootSteps.length - 1)]));
const manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json')), initial = read(path.join(S3, manifest.slots[12].file));
const engine = new GameEngine(initial, { applyInitialTurnStart: false }), states = [];
for await (const r of lines(path.join(smoke, 'p3-12-s0/steps.jsonl.gz'))) {
    if (selected.has(r.step)) states.push({ step: r.step, state: engine.getState() });
    assert.equal(sha(JSON.stringify(engine.getState())), r.before); assert(engine.hasLegalAction(engine.getState().currentPlayer, r.action)); engine.step(r.action);
    assert.equal(sha(JSON.stringify(engine.getState())), r.after);
}
const options = { ...read(path.join(HERE, 'config-maxn-prior1.json')), responseUnits: 128, responseActors: 2, responseCohortSize: 2, responseLightUnitThreshold: 8 };
const client = new Stage4InferenceClient(modelIdentity().prefix), results = [];
try {
    for (const row of states) {
        const engine = new GameEngine(row.state, { applyInitialTurnStart: false }), legal = engine.getLegalActions(row.state.currentPlayer).filter(a => a.type !== 'surrender');
        const indices = responseActionIndices(row.state, legal, new Float64Array(legal.length));
        const full = softPriors(row.state, legal, new ReachabilityContext(row.state));
        const partial = softPriors(row.state, indices.map(i => legal[i]), new ReachabilityContext(row.state));
        indices.forEach((source, i) => assert.equal(partial[i], full[source], `响应子菜单先验偏差/${row.step}/${source}`));
        const observation = encodeDualObservation(row.state, legal); await client.forwardBatch([observation]);
        const witnesses: any[] = [];
        const ai = new BatchedNeuralBeamSearchAI(client, { ...options, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, row.state.currentPlayer);
        assert.deepEqual(engine.getState(), row.state); assert(engine.hasLegalAction(row.state.currentPlayer, action));
        let replayedActions = 0;
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial, { applyInitialTurnStart: false });
            for (const a of w.actions) { assert(replay.hasLegalAction(replay.getState().currentPlayer, a)); replay.step(a); replayedActions++; }
            assert.deepEqual(replay.getState(), w.final);
        }
        const rootActions = new Set(ai.telemetry.candidates.filter(c => c.responseComplete).map(c => c.rootAction)).size;
        const result = { step: row.step, units: row.state.units.length, action, rootActions, telemetry: ai.telemetry, witnesses: witnesses.length, replayedActions, allWitnessesLegal: true, subsetPriorExact: true };
        results.push(result); await save(path.join(out, `step-${row.step}.json`), result, true);
        console.log(JSON.stringify({ step: row.step, units: row.state.units.length, rootActions, ms: ai.telemetry.rootMs, complete: ai.telemetry.responseComplete, truncated: ai.telemetry.responseTruncated, batches: ai.telemetry.batchSizes, priorMs: ai.telemetry.priorMs }));
    }
    await save(path.join(out, 'SUMMARY.json'), { options, results, substantiveRate: results.filter(r => r.rootActions >= 2).length / results.length, sealedAccess: 0 }, true);
} finally { await client.close(); }
