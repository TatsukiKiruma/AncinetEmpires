import fs from 'fs';
import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../../src/game/ai/shared_spatial_policy';
import { encodeAction } from '../../../src/game/env';

async function testModels() {
    console.log("=== Testing P1 and theta1 on r4 Rules ===");

    // 1. 加载 P1 权重
    const p1JsonPath = 'ai_training/v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json';
    const p1Text = fs.readFileSync(p1JsonPath, 'utf8');
    const p1Weights = loadSpatialResNetFromJson(p1Text);
    const p1Predictor = new SpatialResNetPredictor(p1Weights);
    console.log("P1 loaded successfully. Schema:", p1Weights.encoderSchemaId);

    // 2. 加载 theta1 权重
    const theta1JsonPath = 'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json';
    const theta1Text = fs.readFileSync(theta1JsonPath, 'utf8');
    const theta1Weights = loadSpatialResNetFromJson(theta1Text);
    const theta1Predictor = new SpatialResNetPredictor(theta1Weights);
    console.log("theta1 loaded successfully. Schema:", theta1Weights.encoderSchemaId);

    const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
    const engine = new GameEngine(state);
    const legalActions = engine.getLegalActions(0);
    console.log("Legal actions count:", legalActions.length);

    // P1 决策
    const t0 = performance.now();
    const p1Result = predictSpatialAction(
        p1Predictor,
        engine.getState(),
        0,
        legalActions
    );
    const timeP1 = performance.now() - t0;
    console.log("P1 chose:", encodeAction(p1Result.action), "in", timeP1.toFixed(2), "ms, value:", p1Result.value.toFixed(4));

    // theta1 决策
    const t1 = performance.now();
    const theta1Result = predictSpatialAction(
        theta1Predictor,
        engine.getState(),
        0,
        legalActions
    );
    const timeTheta1 = performance.now() - t1;
    console.log("theta1 chose:", encodeAction(theta1Result.action), "in", timeTheta1.toFixed(2), "ms, value:", theta1Result.value.toFixed(4));
}

testModels().catch(console.error);
