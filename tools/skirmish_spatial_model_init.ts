/**
 * 空间残差网络初始化与检查点生成器 (Path B - Spatial Model Initializer)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
    createInitializedSpatialResNet,
    exportSpatialResNetToJson,
    loadSpatialResNetFromJson,
    SpatialResNetPredictor
} from '../src/game/ai/spatial_conv_net';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';

export function initializeAndSaveSpatialModel(outputPath: string): {
    sha256: string;
    parameterCount: number;
    outputPath: string;
} {
    const weights = createInitializedSpatialResNet(20260920);
    const jsonStr = exportSpatialResNetToJson(weights);

    const outDir = path.dirname(outputPath);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outputPath, jsonStr, 'utf8');

    const sha256 = createHash('sha256').update(jsonStr).digest('hex').toUpperCase();

    // 重新加载并自检前向
    const reloaded = loadSpatialResNetFromJson(jsonStr);
    const predictor = new SpatialResNetPredictor(reloaded);

    const state = createDemoState();
    const engine = new GameEngine(state);
    const legalActions = engine.getLegalActions(0);
    const encoded = encodeGameStateSpatial(state, 0);
    const candFeatures = legalActions.map(a => encodeCandidateActionSpatial(state, 0, a));
    const pred = predictor.predict(encoded, candFeatures);

    console.log(`[Path B Spatial Model] Initialized and verified:`);
    console.log(`  Path: ${outputPath}`);
    console.log(`  SHA256: ${sha256}`);
    console.log(`  Value: ${pred.value.toFixed(4)}, BestActionIndex: ${pred.bestActionIndex}/${legalActions.length}`);

    let totalParams = 0;
    const countL = (l: { weights: Float32Array; biases: Float32Array }) => {
        totalParams += l.weights.length + l.biases.length;
    };
    countL(weights.stem);
    countL(weights.res1_1);
    countL(weights.res1_2);
    countL(weights.res2_1);
    countL(weights.res2_2);
    countL(weights.valDense1);
    countL(weights.valDense2);
    countL(weights.polDense1);
    countL(weights.polDense2);

    return {
        sha256,
        parameterCount: totalParams,
        outputPath
    };
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_spatial_model_init.ts')) {
    const defaultOut = 'training_runs/models/spatial_resnet_checkpoint.json';
    initializeAndSaveSpatialModel(defaultOut);
}
