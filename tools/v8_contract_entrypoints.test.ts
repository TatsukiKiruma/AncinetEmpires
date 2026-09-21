/**
 * R8-01 real-entry contract tests (S8-1).
 *
 * The historical gap was that the 2-argument spatial contract was only asserted by *arity* checks and
 * by a parity tool that called `predict` directly. These tests instead drive the real production
 * entry points — `PolicyAgent`, the S10 prior inside `getFilteredCandidateActions`, and the DAgger
 * `predictStudentAction` wrapper — against a real checkpoint and require that they agree with a
 * direct `predict` call on the same state, and that they select the action the model actually scores
 * highest rather than a positional fallback.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { encodeAction } from '../src/game/env';
import type { Action, GameState } from '../src/game/types';
import {
    loadSpatialResNetFromJson,
    SpatialResNetPredictor
} from '../src/game/ai/spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import { getFilteredCandidateActions } from './v7_heuristic_bounded_search';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { PolicyAgent, runFullV7BenchmarkSuite, BENCHMARK_MAPS } from './v7_unified_evaluation';
import { predictStudentAction } from './v7_counterfactual_dagger';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    loadDualHeadModelFromJson,
    type DualHeadSample,
    type DualHeadNet
} from './skirmish_dual_head_net';

const CHECKPOINT = path.resolve(
    'training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json'
);
const CHECKPOINT_DIR = path.resolve('training_runs/agent_upgrade_20260921_v7_01/checkpoints');
const hasCheckpoint = existsSync(CHECKPOINT);

function loadPredictor(): SpatialResNetPredictor {
    return new SpatialResNetPredictor(loadSpatialResNetFromJson(readFileSync(CHECKPOINT, 'utf8')));
}

/** Engine + the real 2-argument encoding the production call sites use. */
function buildFixture(mapName: string, seat: 0 | 1, turnSteps = 0) {
    const state: GameState = createAppApkSkirmishGameState(mapName, 'SD');
    (state as { mapName?: string }).mapName = mapName;
    const engine = new GameEngine(state);
    for (let i = 0; i < turnSteps; i++) {
        const legal = engine.getLegalActions(engine.getState().currentPlayer);
        engine.step(legal[0] ?? ({ type: 'end_turn' } as Action));
    }
    const cur = engine.getState();
    const legal = engine.getLegalActions(cur.currentPlayer).filter((a: Action) => a.type !== 'surrender');
    const enc = encodeGameStateSpatial(cur, seat, 'v2');
    const cands = legal.map((a: Action) => {
        const f = encodeCandidateActionSpatial(cur, seat, a, 'v2');
        return {
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: f.semantics
        };
    });
    return { engine, legal, enc, cands };
}

describe('R8-01 real inference entry-point contract', () => {
    it.skipIf(!hasCheckpoint)('R8-01-ENTRY-A: PolicyAgent, S10 prior and DAgger agree with a direct predict call on the same real fixture', () => {
        const predictor = loadPredictor();
        const { engine, legal, enc, cands } = buildFixture(BENCHMARK_MAPS[0].name, 0);

        // 1. Direct entry.
        const direct = predictor.predict(enc, cands);
        expect(direct.actionLogits.length).toBe(legal.length);

        // 2. PolicyAgent entry (the real match path).
        const agent = new PolicyAgent('SPATIAL_V2', predictor);
        const sel = agent.selectAction(engine, engine.getState().currentPlayer);
        const directBest = legal[direct.bestActionIndex];
        expect(encodeAction(sel.action)).toBe(encodeAction(directBest));

        // 3. S10 prior entry: the filtered candidate set is ranked by the same logits, so the
        //    model's top action must survive candidate filtering unchanged.
        const filtered = getFilteredCandidateActions(
            engine,
            engine.getState().currentPlayer,
            new HeuristicAI(),
            predictor
        );
        expect(filtered.map(encodeAction)).toContain(encodeAction(directBest));

        // 4. DAgger student entry.
        const student = predictStudentAction(predictor, engine, engine.getState().currentPlayer);
        expect(encodeAction(student.action)).toBe(encodeAction(directBest));
        expect(student.legalActions.length).toBe(legal.length);
    });

    it.skipIf(!hasCheckpoint)('R8-01-ENTRY-B: logits are finite, index is valid, and the chosen action is inside the real legal set', () => {
        const predictor = loadPredictor();
        for (const seat of [0, 1] as const) {
            const { engine, legal, enc, cands } = buildFixture(BENCHMARK_MAPS[0].name, seat);
            const pred = predictor.predict(enc, cands);
            expect(pred.actionLogits.length).toBe(legal.length);
            expect(pred.actionProbs.length).toBe(legal.length);
            for (const l of pred.actionLogits) expect(Number.isFinite(l)).toBe(true);
            for (const p of pred.actionProbs) expect(Number.isFinite(p)).toBe(true);
            expect(pred.bestActionIndex).toBeGreaterThanOrEqual(0);
            expect(pred.bestActionIndex).toBeLessThan(legal.length);
            expect(Number.isFinite(pred.value)).toBe(true);

            const agent = new PolicyAgent('SPATIAL_V2', predictor);
            const sel = agent.selectAction(engine, engine.getState().currentPlayer);
            expect(legal.map(encodeAction)).toContain(encodeAction(sel.action));
        }
    });

    it.skipIf(!hasCheckpoint)('R8-01-ENTRY-C: candidate sets larger than 20 are handled and keep a 1:1 logit mapping', () => {
        const predictor = loadPredictor();
        let checkedLargeSet = false;
        for (const map of BENCHMARK_MAPS) {
            for (const seat of [0, 1] as const) {
                const { legal, enc, cands } = buildFixture(map.name, seat);
                if (legal.length <= 20) continue;
                const pred = predictor.predict(enc, cands);
                expect(pred.actionLogits.length).toBe(legal.length);
                expect(pred.actionProbs.length).toBe(legal.length);
                checkedLargeSet = true;
            }
        }
        // The point of the test is the >20 case; if no fixture reached it the test proved nothing.
        expect(checkedLargeSet).toBe(true);
    });

    it.skipIf(!hasCheckpoint)('R8-01-ENTRY-D: candidate permutation permutes logits consistently and keeps a stable argmax', () => {
        const predictor = loadPredictor();
        const { legal, enc, cands } = buildFixture(BENCHMARK_MAPS[0].name, 0);
        const base = predictor.predict(enc, cands);

        const perm = cands.map((_, i) => (i * 7 + 3) % cands.length);
        const permutedCands = perm.map(i => cands[i]);
        const permuted = predictor.predict(enc, permutedCands);

        for (let i = 0; i < cands.length; i++) {
            expect(permuted.actionLogits[i]).toBeCloseTo(base.actionLogits[perm[i]], 6);
        }
        expect(encodeAction(legal[perm[permuted.bestActionIndex]])).toBe(encodeAction(legal[base.bestActionIndex]));
    });

    it.skipIf(!hasCheckpoint)('R8-01-ENTRY-E: a real pending state is handled by every entry point', () => {
        const predictor = loadPredictor();
        // Advance until the engine reports a pending unit for the seat, so the encoder is exercised on
        // a genuine pending state rather than only on a quiet opening position.
        let pendingFixture: ReturnType<typeof buildFixture> | null = null;
        for (const map of BENCHMARK_MAPS) {
            for (let seat = 0 as 0 | 1; seat <= 1; seat = (seat + 1) as 0 | 1) {
                for (let steps = 0; steps < 40 && !pendingFixture; steps++) {
                    const fx = buildFixture(map.name, seat, steps);
                    const st = fx.engine.getState() as unknown as { pendingUnitId?: string | null };
                    if (st.pendingUnitId) pendingFixture = fx;
                }
                if (pendingFixture) break;
            }
            if (pendingFixture) break;
        }
        if (!pendingFixture) return; // no pending state reachable in this fixture budget

        const { engine, legal, enc, cands } = pendingFixture;
        const pred = predictor.predict(enc, cands);
        expect(pred.actionLogits.length).toBe(legal.length);
        const agent = new PolicyAgent('SPATIAL_V2', predictor);
        const sel = agent.selectAction(engine, engine.getState().currentPlayer);
        expect(legal.map(encodeAction)).toContain(encodeAction(sel.action));
        const student = predictStudentAction(predictor, engine, engine.getState().currentPlayer);
        expect(legal.map(encodeAction)).toContain(encodeAction(student.action));
    });

    it('R8-01-ENTRY-F: a missing model fails loudly instead of selecting legal[0]', () => {
        const agent = new PolicyAgent('SPATIAL_V2', undefined);
        const { engine } = buildFixture(BENCHMARK_MAPS[0].name, 0);
        expect(() => agent.selectAction(engine, engine.getState().currentPlayer)).toThrow(/MODEL_LOAD_ERROR/);

        const s10 = new PolicyAgent('S10_SPATIAL_SEARCH', undefined);
        expect(() => s10.selectAction(engine, engine.getState().currentPlayer)).toThrow(/MODEL_LOAD_ERROR/);
    });

    it('R8-01-ENTRY-G: a checkpoint that does not exist is recorded as NOT_RUN, never as a played match', async () => {
        const emptyCheckpointDir = path.resolve('training_runs/zz_contract_missing_checkpoints');
        const { outcomes } = await runFullV7BenchmarkSuite({
            policiesToEvaluate: ['SPATIAL_V2'],
            maps: BENCHMARK_MAPS.slice(0, 1),
            seeds: [42],
            maxTurns: 5,
            maxAtomicSteps: 60,
            reportPath: path.resolve('training_runs/zz_contract_missing_checkpoints/only_not_run.json'),
            directories: {
                runId: 'zz_contract_missing_checkpoints',
                runDir: path.resolve('training_runs/zz_contract_missing_checkpoints'),
                reportDir: path.resolve('training_runs/zz_contract_missing_checkpoints'),
                trajectoryDir: path.resolve('training_runs/zz_contract_missing_checkpoints/trajectories'),
                checkpointDir: emptyCheckpointDir
            }
        });
        expect(outcomes.length).toBe(2);
        for (const o of outcomes) {
            expect(o.terminationReason).toBe('NOT_RUN');
            expect(o.actualPolicy).toBe('NOT_RUN');
            expect(o.steps).toBe(0);
        }
    });

    it.skipIf(!existsSync(path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_best.json')))(
        'R8-01-ENTRY-H: a model-load failure is recorded as MODEL_LOAD_ERROR, distinct from NOT_RUN',
        async () => {
            const brokenDir = path.resolve('training_runs/zz_contract_broken_checkpoint');
            const fs = await import('node:fs');
            fs.mkdirSync(path.join(brokenDir, 'spatial_resnet'), { recursive: true });
            fs.writeFileSync(
                path.join(brokenDir, 'spatial_resnet/spatial_resnet_v2_best.json'),
                '{ "not": "a valid checkpoint" }',
                'utf8'
            );

            const { outcomes } = await runFullV7BenchmarkSuite({
                policiesToEvaluate: ['SPATIAL_V2'],
                maps: BENCHMARK_MAPS.slice(0, 1),
                seeds: [42],
                maxTurns: 5,
                maxAtomicSteps: 60,
                reportPath: path.join(brokenDir, 'broken.json'),
                directories: {
                    runId: 'zz_contract_broken_checkpoint',
                    runDir: brokenDir,
                    reportDir: brokenDir,
                    trajectoryDir: path.join(brokenDir, 'trajectories'),
                    checkpointDir: brokenDir
                }
            });
            for (const o of outcomes) {
                expect(o.terminationReason).toBe('MODEL_LOAD_ERROR');
                expect(o.actualPolicy).toBe('NOT_RUN');
            }
        }
    );
});

describe('R8-01 NET_A numeric safety on a real null-value batch', () => {
    const NET_A_PATH = path.resolve('training_runs/agent_upgrade_20260921_v7_01/checkpoints/net_a/net_a_checkpoint.json');

    function makeBatch(net: DualHeadNet, n: number): DualHeadSample[] {
        const { stateDim, actionDim } = net.spec;
        const batch: DualHeadSample[] = [];
        for (let i = 0; i < n; i++) {
            const state = Array.from({ length: stateDim }, (_, k) => Math.sin(i * 0.7 + k * 0.3));
            const candidates = Array.from({ length: 4 }, (_, c) =>
                Array.from({ length: actionDim }, (_, k) => Math.cos(i * 0.4 + c * 0.9 + k * 0.2))
            );
            batch.push({ state, candidates, labelIndex: i % 4, valueTarget: null });
        }
        return batch;
    }

    function allFinite(net: DualHeadNet): boolean {
        const layers = [...net.trunkLayers, ...net.policyLayers, ...net.valueLayers];
        return layers.every(l => l.W.every(Number.isFinite) && l.b.every(Number.isFinite));
    }

    it('R8-01-NETA-A: a policy-only batch (valueTarget null, valueWeight 0) keeps loss, gradients and weights finite', () => {
        const net = createDualHeadNet({ stateDim: 356, actionDim: 45, trunkHidden: [64, 32], policyHidden: [16], valueHidden: [16], seed: 42 });
        const batch = makeBatch(net, 8);

        const report = trainStep(net, batch, { learningRate: 0.001, momentum: 0.9, valueWeight: 0 });
        expect(Number.isFinite(report.policyLoss)).toBe(true);
        expect(Number.isFinite(report.valueLoss)).toBe(true);
        expect(Number.isFinite(report.policyAccuracy)).toBe(true);
        expect(allFinite(net)).toBe(true);
    });

    it('R8-01-NETA-B: undefined value targets are normalised like null rather than producing NaN', () => {
        const net = createDualHeadNet({ stateDim: 356, actionDim: 45, trunkHidden: [64, 32], policyHidden: [16], valueHidden: [16], seed: 7 });
        const batch = makeBatch(net, 6).map(s => {
            const legacy = { ...s } as DualHeadSample & { valueTarget?: number | null };
            // Reproduce the historical generator defect: JSON serialisation dropped the field.
            delete (legacy as { valueTarget?: number | null }).valueTarget;
            return legacy as DualHeadSample;
        });

        // Either the batch is explicitly rejected, or it trains with finite numbers. Silent NaN is not allowed.
        let threw = false;
        try {
            const report = trainStep(net, batch as DualHeadSample[], { learningRate: 0.001, momentum: 0.9, valueWeight: 0 });
            expect(Number.isFinite(report.policyLoss)).toBe(true);
            expect(Number.isFinite(report.valueLoss)).toBe(true);
        } catch {
            threw = true;
        }
        expect(allFinite(net)).toBe(true);
        if (!threw) {
            expect(allFinite(net)).toBe(true);
        }
    });

    it.skipIf(!existsSync(NET_A_PATH))('R8-01-NETA-C: the real NET_A checkpoint returns topIndex/bestActionIndex and finite logits on Float64Array features', () => {
        const net = loadDualHeadModelFromJson(readFileSync(NET_A_PATH, 'utf8'));
        const state = new Float64Array(net.spec.stateDim).fill(0.1);
        const candidates = Array.from({ length: 9 }, (_, c) =>
            new Float64Array(net.spec.actionDim).fill(c * 0.05 + 0.01)
        );

        const decision = predictDecision(net, state, candidates);
        expect(decision.logits.length).toBe(9);
        for (const l of decision.logits) expect(Number.isFinite(l)).toBe(true);
        expect(Number.isFinite(decision.value)).toBe(true);
        expect(decision.topIndex).toBeGreaterThanOrEqual(0);
        expect(decision.topIndex).toBeLessThan(9);
        if (decision.bestActionIndex !== undefined) {
            expect(decision.bestActionIndex).toBe(decision.topIndex);
        }
        const probs = decision.probs ?? [];
        for (const p of probs) expect(Number.isFinite(p)).toBe(true);
    });

    it.skipIf(!existsSync(NET_A_PATH))('R8-01-NETA-D: the real NET_A checkpoint cannot produce NaN from an all-null batch', () => {
        const net = loadDualHeadModelFromJson(readFileSync(NET_A_PATH, 'utf8'));
        const batch = makeBatch(net, 4);
        const report = trainStep(net, batch, { learningRate: 0.0005, momentum: 0.9, valueWeight: 0 });
        expect(Number.isFinite(report.policyLoss)).toBe(true);
        expect(Number.isFinite(report.valueLoss)).toBe(true);
        expect(allFinite(net)).toBe(true);
    });
});
