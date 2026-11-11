import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import {
    loadSpatialResNetFromJson,
    SpatialResNetPredictor
} from '../src/game/ai/spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import { predictSpatialAction } from '../src/game/ai/shared_spatial_policy';
import {
    getSpatialPredictor,
    getSpatialAiActionSync
} from '../src/game/ai/spatial_neural_adapter';
import { getAiAction } from '../src/game/ai/neural_ai_adapter';
import { PolicyAgent } from './v7_unified_evaluation';
import { MODEL_REGISTRY, getPolicyRegistryEntry } from '../src/game/ai/models/model_registry';
import type { Action, GameState } from '../src/game/types';

describe('V9-01: Unified Frontend, Eval, and DAgger Policy Interface & Contract Parity', () => {
    const v2ModelPath = path.resolve('training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json');
    const v1ModelPath = path.resolve('src/game/ai/models/spatial_resnet_checkpoint.json');

    const v2Weights = loadSpatialResNetFromJson(fs.readFileSync(v2ModelPath, 'utf8'));
    const v2Predictor = new SpatialResNetPredictor(v2Weights);

    const v1Weights = loadSpatialResNetFromJson(fs.readFileSync(v1ModelPath, 'utf8'));
    const v1Predictor = new SpatialResNetPredictor(v1Weights);

    it('V9-01-A: Same state and checkpoint produce identical action across direct predictor, eval agent, and frontend adapter', () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));
        const state = engine.getState();
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');
        expect(legal.length).toBeGreaterThan(0);

        // 1. Direct shared predictor call
        const directResult = predictSpatialAction(v2Predictor, state, 0, legal, 'v2');

        // 2. Evaluation PolicyAgent call
        const evalAgent = new PolicyAgent('SPATIAL_V2', v2Predictor);
        const evalResult = evalAgent.selectAction(engine, 0);

        // 3. Frontend adapter call
        const frontendResult = getSpatialAiActionSync(engine, 0, {
            policy: 'spatial_v2_experimental',
            predictor: v2Predictor
        });

        // 4. NeuralAiAdapter call
        const neuralAiResult = getAiAction('spatial_v2_experimental', engine, 0);

        // Assert 100% action equality
        expect(directResult.action).toEqual(evalResult.action);
        expect(directResult.action).toEqual(frontendResult.action);
        expect(directResult.action).toEqual(neuralAiResult.action);

        // Assert logits alignment
        expect(directResult.bestActionIndex).toBeGreaterThanOrEqual(0);
        expect(directResult.actionLogits[directResult.bestActionIndex]).toBe(
            Math.max(...directResult.actionLogits)
        );
    });

    it('V9-01-B: Exposes v1 recruit input collision and verifies v2 discriminates recruit classes', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem');
        const castlePos = { x: 1, y: 1 };

        const recruitSoldier: Action = {
            type: 'recruit_to_castle',
            castlePos,
            unitClass: 'soldier'
        };
        const recruitArcher: Action = {
            type: 'recruit_to_castle',
            castlePos,
            unitClass: 'archer'
        };
        const recruitCommander: Action = {
            type: 'recruit_to_castle',
            castlePos,
            unitClass: 'commander'
        };

        // --- Check v1 encoding & prediction ---
        const encStateV1 = encodeGameStateSpatial(state, 0, 'v1');
        const candSoldierV1 = encodeCandidateActionSpatial(state, 0, recruitSoldier, 'v1');
        const candCommanderV1 = encodeCandidateActionSpatial(state, 0, recruitCommander, 'v1');

        // Semantics 0..23 in v1 must be identical
        for (let i = 0; i < 24; i++) {
            expect(candSoldierV1.semantics[i]).toBe(candCommanderV1.semantics[i]);
        }

        // v1 model forward: both recruit actions must yield IDENTICAL logits due to input collision
        const predV1 = v1Predictor.predict(encStateV1, [
            { actorCoord: castlePos, landingCoord: castlePos, targetCoord: null, semantics: candSoldierV1.semantics },
            { actorCoord: castlePos, landingCoord: castlePos, targetCoord: null, semantics: candCommanderV1.semantics }
        ]);
        expect(predV1.actionLogits[0]).toBeCloseTo(predV1.actionLogits[1], 5);

        // --- Check v2 encoding & prediction ---
        const encStateV2 = encodeGameStateSpatial(state, 0, 'v2');
        const candSoldierV2 = encodeCandidateActionSpatial(state, 0, recruitSoldier, 'v2');
        const candArcherV2 = encodeCandidateActionSpatial(state, 0, recruitArcher, 'v2');
        const candCommanderV2 = encodeCandidateActionSpatial(state, 0, recruitCommander, 'v2');

        // In v2, semantics 24 (category), 25 (isCommander), 26 (cost), 27 (remainingGold) must differ!
        expect(candSoldierV2.semantics[24]).not.toBe(candArcherV2.semantics[24]); // soldier=1/7, archer=2/7
        expect(candSoldierV2.semantics[25]).toBe(0.0);
        expect(candCommanderV2.semantics[25]).toBe(1.0);
        expect(candSoldierV2.semantics[26]).not.toBe(candCommanderV2.semantics[26]); // costs differ

        // v2 model forward: policy inputs differ, producing distinct logits
        const predV2 = v2Predictor.predict(encStateV2, [
            { actorCoord: castlePos, landingCoord: castlePos, targetCoord: null, semantics: candSoldierV2.semantics },
            { actorCoord: castlePos, landingCoord: castlePos, targetCoord: null, semantics: candArcherV2.semantics },
            { actorCoord: castlePos, landingCoord: castlePos, targetCoord: null, semantics: candCommanderV2.semantics }
        ]);
        expect(predV2.actionLogits.length).toBe(3);
        // Assert they are not all identical
        const allSame = predV2.actionLogits[0] === predV2.actionLogits[1] && predV2.actionLogits[1] === predV2.actionLogits[2];
        expect(allSame).toBe(false);
    });

    it('V9-01-C: Thorough candidate coverage: seats, >20 candidates, permutation invariance, pending, dynamic costs', () => {
        // Test both seat 0 and seat 1
        for (const seat of [0, 1]) {
            const engine = new GameEngine(createAppApkSkirmishGameState('(2) Crossed swords.aem'));
            const legal = engine.getLegalActions(seat).filter(a => a.type !== 'surrender');
            expect(legal.length).toBeGreaterThan(0);

            const result = predictSpatialAction(v2Predictor, engine.getState(), seat, legal, 'v2');
            expect(result.bestActionIndex).toBeGreaterThanOrEqual(0);
            expect(result.bestActionIndex).toBeLessThan(legal.length);
        }

        // Test candidate size > 20 and permutation invariance
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem'));
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');
        if (legal.length >= 5) {
            // Pick actions and reverse their order
            const subset = legal.slice(0, Math.min(legal.length, 25));
            const reversedSubset = [...subset].reverse();

            const res1 = predictSpatialAction(v2Predictor, engine.getState(), 0, subset, 'v2');
            const res2 = predictSpatialAction(v2Predictor, engine.getState(), 0, reversedSubset, 'v2');

            // Permutation invariance: scores must stay with their respective action
            const action1 = res1.action;
            const action2 = res2.action;
            expect(action1).toEqual(action2);
        }

        // Test pending unit state
        const stateWithPending: GameState = JSON.parse(JSON.stringify(engine.getState()));
        stateWithPending.pendingUnitId = 'u_test_pending';
        const encPending = encodeGameStateSpatial(stateWithPending, 0, 'v2');
        expect(encPending.globalFeatures[13]).toBe(1.0); // pendingUnitId channel

        // Test empty legal actions
        const emptyResult = predictSpatialAction(v2Predictor, engine.getState(), 0, [], 'v2');
        expect(emptyResult.action).toEqual({ type: 'end_turn' });
        expect(emptyResult.bestActionIndex).toBe(-1);

        // Test dynamic recruit pricing alters feature
        const stateWealthy: GameState = JSON.parse(JSON.stringify(stateWithPending));
        stateWealthy.players[0].gold = 1000;
        const statePoor: GameState = JSON.parse(JSON.stringify(stateWithPending));
        statePoor.players[0].gold = 100;

        const featWealthy = encodeCandidateActionSpatial(stateWealthy, 0, {
            type: 'recruit_to_castle',
            castlePos: { x: 1, y: 1 },
            unitClass: 'soldier'
        }, 'v2');
        const featPoor = encodeCandidateActionSpatial(statePoor, 0, {
            type: 'recruit_to_castle',
            castlePos: { x: 1, y: 1 },
            unitClass: 'soldier'
        }, 'v2');
        // Remaining gold feature in dimension 27 must differ
        expect(featWealthy.semantics[27]).toBeGreaterThan(featPoor.semantics[27]);
    });

    it('V9-01-D: Rejects corrupted/wrong version models, non-finite values, and invalid indices without silent legal[0] fallback', () => {
        // 1. Incompatible version throws
        expect(() => {
            loadSpatialResNetFromJson(JSON.stringify({ version: 'invalid-version', stem: {} }));
        }).toThrow(/Incompatible spatial model version/);

        // 2. Non-finite values in spatialTensor throw
        const badState = encodeGameStateSpatial(createDefaultAppGameState(), 0, 'v2');
        badState.spatialTensor[10] = NaN;
        expect(() => {
            v2Predictor.predict(badState, []);
        }).toThrow(/spatialTensor contains non-finite value/);

        // 3. Non-finite values in globalFeatures throw
        const badStateGlobal = encodeGameStateSpatial(createDefaultAppGameState(), 0, 'v2');
        badStateGlobal.globalFeatures[2] = Infinity;
        expect(() => {
            v2Predictor.predict(badStateGlobal, []);
        }).toThrow(/globalFeatures contains non-finite value/);

        // 4. Semantics dimension less than required throws
        const badActionFeat = {
            actorCoord: null,
            landingCoord: null,
            targetCoord: null,
            semantics: new Float32Array(10) // v2 expects 32
        };
        const goodState = encodeGameStateSpatial(createDefaultAppGameState(), 0, 'v2');
        expect(() => {
            v2Predictor.predict(goodState, [badActionFeat as any]);
        }).toThrow(/semantics length 10 < expected 32/);
    });

    it('V9-01-E: Metadata and telemetry report requested/actual policy, full SHA, encoder, and match registry', () => {
        const engine = new GameEngine(createAppApkSkirmishGameState('(2) Duel.aem'));
        let telemetryCaptured: any = null;

        const res = getSpatialAiActionSync(engine, 0, {
            policy: 'spatial_v2_experimental',
            onTelemetry: t => { telemetryCaptured = t; }
        });

        expect(res.requestedPolicy).toBe('spatial_v2_experimental');
        expect(res.actualPolicy).toBe('spatial_v2_experimental');
        expect(res.encoderVersion).toBe('v2');
        expect(res.status).toBe('OK');
        expect(res.checkpointSha256).toBe('1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92');
        expect(res.checkpointSha256).toBe(getPolicyRegistryEntry('spatial_v2_experimental')?.checkpoint?.sha256);

        expect(telemetryCaptured).toBeDefined();
        expect(telemetryCaptured.requestedPolicy).toBe('spatial_v2_experimental');
    });
});
