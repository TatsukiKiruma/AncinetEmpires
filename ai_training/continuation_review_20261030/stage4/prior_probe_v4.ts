/** 既有开发轨迹的根级工程诊断，不生成或替换整局成绩。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { Stage4InferenceClient } from './inference_client';
import { DATA, HERE, S3, read, save, sha, modelIdentity } from './io';
import { lines } from './analysis';
import { runtimeIdentity } from './runtime_identity';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';

const out = path.join(DATA, process.argv[2] ?? 'prior-distance-diagnostic-v4');
if (fs.existsSync(out)) throw Error('禁止覆盖诊断证据');
fs.mkdirSync(out);
const summary = read(path.join(DATA, 'resume-v3-screen-maxn-prior035-aggregate/SUMMARY.json'));
const panel = read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')), initial = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const options = read(path.join(HERE, 'config-v2-maxn-prior035.json'));
await save(path.join(out, 'RUN.json'), { options, runtime: runtimeIdentity(), sealedAccess: 0, newGames: 0 }, true);
const client = new Stage4InferenceClient(modelIdentity().prefix), rows: any[] = [];
try {
    for (const players of [2, 3, 4]) {
        const game = summary.games.find((g: any) => g.players === players), roots: any[] = [];
        for await (const t of lines(path.join(game.artifactDirectory, 'search.jsonl.gz'))) if (!t.queued && t.stopReason !== 'unique_action') roots.push(t);
        const picked = new Map([0, .25, .5, .75].map(q => { const t = roots[Math.floor((roots.length - 1) * q)]; return [t.step, t]; }));
        const state = read(path.join(S3, initial.slots[game.slot].file));
        const engine = new GameEngine(state, { ...panel.engineOptions, applyInitialTurnStart: false });
        for await (const step of lines(path.join(game.artifactDirectory, 'steps.jsonl.gz'))) {
            assert.equal(sha(JSON.stringify(engine.getState())), step.before);
            if (picked.has(step.step)) {
                const before = engine.getState(), legal = engine.getLegalActions(before.currentPlayer).filter(a => a.type !== 'surrender');
                const oldContext = new ReachabilityContext(before);
                oldContext.paths.costToTarget = oldContext.paths.cost.bind(oldContext.paths);
                let tick = performance.now(); const oldPrior = softPriors(before, legal, oldContext), oldMs = performance.now() - tick;
                const context = new ReachabilityContext(before);
                tick = performance.now(); const newPrior = softPriors(before, legal, context), newMs = performance.now() - tick;
                assert.deepEqual(newPrior, oldPrior);
                const witnesses: any[] = [], ai = new BatchedNeuralBeamSearchAI(client, { ...options, onWitness: w => witnesses.push(w) });
                // 常驻服务冷启动不计入根搜索预算，正式arena也执行相同预热。
                await client.forwardBatch([encodeDualObservation(before, legal)]);
                const action = await ai.getAction(engine, before.currentPlayer);
                assert.deepEqual(engine.getState(), before); assert(engine.hasLegalAction(before.currentPlayer, action));
                let witnessActions = 0;
                for (const w of witnesses) {
                    const replay = new GameEngine(w.initial, { ...panel.engineOptions, applyInitialTurnStart: false });
                    for (const a of w.actions) { assert(replay.hasLegalAction(replay.getState().currentPlayer, a)); replay.step(a); witnessActions++; }
                    assert.deepEqual(replay.getState(), w.final);
                }
                const row = { id: game.id, players, step: step.step, stateSha256: step.before, priorExact: true, oldPriorMs: oldMs, newPriorMs: newMs,
                    oldSubstantive: picked.get(step.step).candidates.filter((c: any) => c.responseComplete).length >= 2,
                    substantive: ai.telemetry.candidates.filter(c => c.responseComplete).length >= 2, action, telemetry: ai.telemetry, witnesses: witnesses.length, witnessActions, witnessesLegal: true };
                rows.push(row); await save(path.join(out, `${game.id}-${step.step}.json`), row, true);
                console.log(JSON.stringify({ id: row.id, step: row.step, oldMs, newMs, substantive: row.substantive, rootMs: row.telemetry.rootMs }));
            }
            assert(engine.hasLegalAction(engine.getState().currentPlayer, step.action)); engine.step(step.action);
            assert.equal(sha(JSON.stringify(engine.getState())), step.after);
            if (step.step >= Math.max(...picked.keys())) break;
        }
    }
    await save(path.join(out, 'SUMMARY.json'), { rows, sealedAccess: 0, newGames: 0, passed: rows.every(r => r.priorExact && r.witnessesLegal), substantiveRate: rows.filter(r => r.substantive).length / rows.length }, true);
} finally { await client.close(); }
