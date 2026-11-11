import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { Stage4InferenceClient } from './inference_client';
import { HERE, S3, DATA, read, save, fileSha, modelIdentity } from './io';

const label = process.argv[2] ?? 'calibration-v1', out = path.join(DATA, label);
if (fs.existsSync(out)) throw Error('不可覆盖校准记录'); fs.mkdirSync(out);
const options = { modelVersion: modelIdentity().binSha256, budgetMs: 2800, maxNodes: 1800, rootCandidates: 28,
    innerCandidates: 14, beamWidth: 16, maxUnits: 5, finalists: 16, responseVariants: 2, responseUnits: 24,
    ownFraction: .45, priorScale: 1, valueMode: 'maxn_ffa' as const, antiLeaderBeta: .25, leafMode: 'post_response' as const,
    ...(process.argv[3] ? read(path.resolve(process.argv[3])) : {}) };
const panel = read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')), manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const client = new Stage4InferenceClient(modelIdentity().prefix), results = [];
try {
    for (const n of [2, 3, 4]) {
        const slot = manifest.slots.find((s: any) => s.players === n), file = path.join(S3, slot.file);
        assert.equal(fileSha(file), slot.sha256);
        const engine = new GameEngine(read(file), panel.engineOptions), before = engine.getState();
        const o = encodeDualObservation(before, engine.getLegalActions(before.currentPlayer).filter(a => a.type !== 'surrender'));
        await client.forwardBatch([o]); await client.forwardBatch(Array(32).fill(o));
        const witnesses: any[] = [];
        const ai = new BatchedNeuralBeamSearchAI(client, { ...options, onWitness: w => witnesses.push(w) });
        const action = await ai.getAction(engine, before.currentPlayer);
        assert.deepEqual(engine.getState(), before); assert(engine.hasLegalAction(before.currentPlayer, action));
        let replayedActions = 0;
        for (const w of witnesses) {
            const replay = new GameEngine(w.initial, panel.engineOptions);
            for (const a of w.actions) { assert(replay.hasLegalAction(replay.getState().currentPlayer, a)); replay.step(a); replayedActions++; }
            assert.deepEqual(replay.getState(), w.final);
        }
        const result = { n, slot: slot.slot, action, telemetry: ai.telemetry, witnesses: witnesses.length, replayedActions, allWitnessesLegal: true };
        results.push(result); await save(path.join(out, `p${n}.json`), result, true);
        await save(path.join(out, `p${n}-witnesses.json`), witnesses, true);
        console.log(JSON.stringify({ n, ms: ai.telemetry.rootMs, own: ai.telemetry.ownNodes, response: ai.telemetry.responseNodes, batch: ai.telemetry.batchSizes, completed: ai.telemetry.responseComplete, truncated: ai.telemetry.responseTruncated, candidates: ai.telemetry.candidates.length, witnesses: witnesses.length, replayedActions }));
    }
    await save(path.join(out, 'RESULT.json'), { options, results, sealedPanelAccess: 0 }, true);
} finally { await client.close(); }
