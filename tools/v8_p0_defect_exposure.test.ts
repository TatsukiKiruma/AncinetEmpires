import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import {
    SpatialResNetPredictor,
    createInitializedSpatialResNet
} from '../src/game/ai/spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    DualHeadSample
} from './skirmish_dual_head_net';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import {
    PolicyAgent,
    runBenchmarkMatch,
    createPrng
} from './v7_unified_evaluation';
import { getFilteredCandidateActions } from './v7_heuristic_bounded_search';
import { predictStudentAction } from './v7_counterfactual_dagger';

describe('R8-01: Wrapper Predict Parameters & Contract Assertions', () => {
    it('Defect R8-01-A: PolicyAgent SPATIAL_V2 must call predict with (encodedState, candidates) two arguments', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');
        expect(legal.length).toBeGreaterThan(0);
        // On demo map, legal actions count is around 37 (not 20)
        expect(legal.length).not.toBe(20);

        const weights = createInitializedSpatialResNet(42, 'spatial-resnet-v2');
        let callArgCount = 0;
        let callArg0HasSpatial = false;
        let candidateCountReceived = 0;

        const predictor = new SpatialResNetPredictor(weights);
        const origPredict = predictor.predict.bind(predictor);

        // Spy on predict to check arguments received
        predictor.predict = ((...args: any[]) => {
            callArgCount = args.length;
            callArg0HasSpatial = args[0] && ('spatialTensor' in args[0]) && ('globalFeatures' in args[0]);
            candidateCountReceived = Array.isArray(args[1]) ? args[1].length : 0;
            return (origPredict as any)(...args);
        }) as any;

        const agent = new PolicyAgent('SPATIAL_V2', predictor);
        const decision = agent.selectAction(engine, 0);

        expect(decision.action).toBeDefined();
        // The contract requires strictly 2 arguments: (encodedState, candidateActions)
        expect(callArgCount).toBe(2);
        expect(callArg0HasSpatial).toBe(true);
        expect(candidateCountReceived).toBe(legal.length);
    });

    it('Defect R8-01-B: getFilteredCandidateActions must pass 2 arguments to spatialPredictor.predict', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');

        const weights = createInitializedSpatialResNet(42, 'spatial-resnet-v2');
        let callArgCount = 0;
        let callArg0HasSpatial = false;

        const predictor = new SpatialResNetPredictor(weights);
        const origPredict = predictor.predict.bind(predictor);
        predictor.predict = ((...args: any[]) => {
            callArgCount = args.length;
            callArg0HasSpatial = args[0] && ('spatialTensor' in args[0]);
            return (origPredict as any)(...args);
        }) as any;

        getFilteredCandidateActions(engine, 0, new HeuristicAI(), predictor);

        expect(callArgCount).toBe(2);
        expect(callArg0HasSpatial).toBe(true);
    });

    it('Defect R8-01-C: predictStudentAction in DAgger must pass 2 arguments to spatialPredictor.predict', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);

        const weights = createInitializedSpatialResNet(42, 'spatial-resnet-v2');
        let callArgCount = 0;
        let callArg0HasSpatial = false;

        const predictor = new SpatialResNetPredictor(weights);
        const origPredict = predictor.predict.bind(predictor);
        predictor.predict = ((...args: any[]) => {
            callArgCount = args.length;
            callArg0HasSpatial = args[0] && ('spatialTensor' in args[0]);
            return (origPredict as any)(...args);
        }) as any;

        predictStudentAction(predictor, engine, 0);

        expect(callArgCount).toBe(2);
        expect(callArg0HasSpatial).toBe(true);
    });

    it('Defect R8-01-D: Missing model must throw and NOT silently return legal[0]', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);

        // SPATIAL_V2 without predictor must throw
        const spatialAgent = new PolicyAgent('SPATIAL_V2');
        expect(() => spatialAgent.selectAction(engine, 0)).toThrow();

        // NET_A without model must throw
        const netAAgent = new PolicyAgent('NET_A');
        expect(() => netAAgent.selectAction(engine, 0)).toThrow();

        // S10_SPATIAL_SEARCH without predictor must throw (must not silently degrade to S00)
        const s10Agent = new PolicyAgent('S10_SPATIAL_SEARCH');
        expect(() => s10Agent.selectAction(engine, 0)).toThrow();
    });

    it('Defect R8-01-E: NET_A undefined/null valueTarget must not produce NaN under valueWeight=0', () => {
        const net = createDualHeadNet({
            seed: 42,
            stateDim: 16,
            actionDim: 8,
            trunkHidden: [32],
            policyHidden: [16],
            valueHidden: [16]
        });

        const sampleWithUndefined: DualHeadSample = {
            state: new Array(16).fill(0.1),
            candidates: [new Array(8).fill(0.2), new Array(8).fill(-0.1)],
            labelIndex: 0,
            valueTarget: undefined as any // Unsafe undefined from v7 generator
        };

        const report = trainStep(net, [sampleWithUndefined], {
            learningRate: 0.01,
            momentum: 0.9,
            valueWeight: 0.0
        });

        expect(Number.isFinite(report.policyLoss)).toBe(true);
        expect(Number.isNaN(report.policyLoss)).toBe(false);
        expect(Number.isNaN(report.valueLoss)).toBe(false);

        // Verify trunk weights are not corrupted by NaN
        for (const w of net.trunkLayers[0].W) {
            expect(Number.isFinite(w)).toBe(true);
        }
    });

    it('Defect R8-01-F: PolicyAgent NET_A must read topIndex/bestActionIndex and accept Float64Array features', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');

        const net = createDualHeadNet({
            seed: 42,
            stateDim: 356,
            actionDim: 45,
            trunkHidden: [256, 128],
            policyHidden: [64],
            valueHidden: [64]
        });

        const agent = new PolicyAgent('NET_A', undefined, net);
        const decision = agent.selectAction(engine, 0);

        expect(decision.action).toBeDefined();
        expect(decision.action.type).toBeDefined();
        // Chosen action must be one of legal actions
        const found = legal.some(l => JSON.stringify(l) === JSON.stringify(decision.action));
        expect(found).toBe(true);
    });

    it('Defect R8-01-G: SpatialResNetPredictor must reject non-finite inputs, invalid tensor shapes, and support candidate sets of size 1, 7, 20, 37', () => {
        const weights = createInitializedSpatialResNet(42, 'spatial-resnet-v2');
        const predictor = new SpatialResNetPredictor(weights);

        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const encSpatial = encodeGameStateSpatial(state, 0, 'v2');
        const candFeat = encodeCandidateActionSpatial(state, 0, { type: 'end_turn' }, 'v2');

        // Test invalid spatialTensor shape (not 9600)
        const badSpatial = {
            ...encSpatial,
            spatialTensor: new Float32Array(100)
        };
        expect(() => predictor.predict(badSpatial, [candFeat])).toThrow(/invalid spatialTensor length/);

        // Test NaN in globalFeatures
        const badGlobal = {
            ...encSpatial,
            globalFeatures: new Float32Array(encSpatial.globalFeatures)
        };
        badGlobal.globalFeatures[0] = NaN;
        expect(() => predictor.predict(badGlobal, [candFeat])).toThrow(/non-finite/);

        // Test candidate set sizes: 1, 7, 20, 37
        for (const count of [1, 7, 20, 37]) {
            const candList = Array.from({ length: count }, () => candFeat);
            const res = predictor.predict(encSpatial, candList);
            expect(res.actionLogits.length).toBe(count);
            expect(res.actionProbs.length).toBe(count);
            expect(res.bestActionIndex).toBeGreaterThanOrEqual(0);
            expect(res.bestActionIndex).toBeLessThan(count);
            for (let i = 0; i < count; i++) {
                expect(Number.isFinite(res.actionLogits[i])).toBe(true);
                expect(Number.isFinite(res.actionProbs[i])).toBe(true);
            }
        }
    });

    it('Defect R8-01-H: Spatial candidate evaluation is permutation equivariant', () => {
        const weights = createInitializedSpatialResNet(42, 'spatial-resnet-v2');
        const predictor = new SpatialResNetPredictor(weights);

        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const encSpatial = encodeGameStateSpatial(state, 0, 'v2');

        const candA = encodeCandidateActionSpatial(state, 0, { type: 'end_turn' }, 'v2');
        const candB = encodeCandidateActionSpatial(state, 0, { type: 'wait', unitId: 'u_1' }, 'v2');

        const resAB = predictor.predict(encSpatial, [candA, candB]);
        const resBA = predictor.predict(encSpatial, [candB, candA]);

        expect(Math.abs(resAB.actionLogits[0] - resBA.actionLogits[1])).toBeLessThan(1e-4);
        expect(Math.abs(resAB.actionLogits[1] - resBA.actionLogits[0])).toBeLessThan(1e-4);
    });
});

describe('R8-02: Evaluation Protocol & Termination Fixes', () => {
    const path = require('node:path');
    const fs = require('node:fs');
    const testDir = path.resolve('training_runs/test_r8_02');
    const testDirs = { runDir: testDir };

    it('Defect R8-02-A: 25 steps with unchanged unit count must NOT trigger premature stagnation truncation', () => {
        const outcome = runBenchmarkMatch('(2) Duel.aem', new PolicyAgent('HEURISTIC'), 0, 42, 25, 1000, testDirs);
        // On 2-player duel, units move toward each other for the first ~20 steps without dying
        // The old code had: if (stagnationCounter >= 25) break; which cut off before combat even started!
        expect(outcome.terminationReason).not.toBe('TRUNCATION_STAGNATION');
        expect(outcome.terminationReason).not.toBe('ENGINE_ERROR');
        expect(outcome.latencyP50).toBeGreaterThanOrEqual(0);
        expect(outcome.rulesHash).toBeDefined();
        expect(outcome.initialStateHash).toBeDefined();
    }, 60000);

    it('Defect R8-02-B: Match step limit must not be implicitly hardcoded to maxTurns * 10', () => {
        // Run a match with maxTurns=15, maxAtomicSteps=300
        const outcome = runBenchmarkMatch('(2) Crossed swords.aem', new PolicyAgent('HEURISTIC'), 0, 42, 15, 300, testDirs);
        expect(outcome.terminationReason).not.toBe('ENGINE_ERROR');
    }, 30000);

    it('Defect R8-02-C: Commander re-recruit opportunities and successes must be consistent and use engine legal actions', () => {
        const outcome = runBenchmarkMatch('(2) Duel.aem', new PolicyAgent('HEURISTIC'), 0, 42, 20, 1000, testDirs);
        // It is mathematically impossible to have 0 opportunities but > 0 successes
        if (outcome.rehireOpportunities === 0) {
            expect(outcome.rehireSuccesses).toBe(0);
            expect(outcome.rehireRate).toBeNull();
        } else {
            expect(outcome.rehireSuccesses).toBeLessThanOrEqual(outcome.rehireOpportunities);
            expect(typeof outcome.rehireRate).toBe('number');
        }
    }, 30000);

    it('Defect R8-02-D: ENGINE_ERROR must fail tests, not be treated as acceptable outcome', () => {
        const outcome = runBenchmarkMatch('(2) Duel.aem', new PolicyAgent('HEURISTIC'), 0, 42, 10, 1000, testDirs);
        expect(outcome.terminationReason).not.toBe('ENGINE_ERROR');
        // Trajectory log file must exist in testDir on disk!
        expect(outcome.trajectoryLogPath).toContain('test_r8_02');
        expect(fs.existsSync(outcome.trajectoryLogPath)).toBe(true);
    }, 30000);

    it('Defect R8-02-E: Independent PRNG streams must provide deterministic reproducibility', () => {
        const match1 = runBenchmarkMatch('(2) Duel.aem', new PolicyAgent('HEURISTIC'), 0, 999, 10, 1000, testDirs);
        const match2 = runBenchmarkMatch('(2) Duel.aem', new PolicyAgent('HEURISTIC'), 0, 999, 10, 1000, testDirs);

        expect(match1.steps).toBe(match2.steps);
        expect(match1.turns).toBe(match2.turns);
        expect(match1.terminationReason).toBe(match2.terminationReason);
        expect(match1.candidateFinalUnits).toBe(match2.candidateFinalUnits);
        expect(match1.opponentFinalUnits).toBe(match2.opponentFinalUnits);
    }, 30000);

    it('Defect R8-02-F: Illegal action (including illegal end_turn) must produce ENGINE_ERROR', () => {
        // Create an agent that always proposes an illegal move
        const illegalAgent = new PolicyAgent('HEURISTIC');
        illegalAgent.selectAction = () => ({
            action: { type: 'move', unitId: 'non_existent_unit_id', to: { x: 99, y: 99 } } as any,
            ms: 1
        });

        const outcome = runBenchmarkMatch('(2) Duel.aem', illegalAgent, 0, 42, 5, 1000, testDirs);
        expect(outcome.terminationReason).toBe('ENGINE_ERROR');
        expect(outcome.errorDetails).toContain('Illegal action produced');
        expect(fs.existsSync(outcome.trajectoryLogPath)).toBe(true);
    }, 30000);
});
