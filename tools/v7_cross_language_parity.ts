/**
 * AncientEmpires - V7 Cross-Language Inference Parity Auditor
 * 
 * Verifies that TypeScript forward pass (SpatialResNetPredictor)
 * produces outputs that match PyTorch forward pass (SpatialResNet)
 * to < 1e-4 tolerance on both 2-block and 4-block checkpoints.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveTorchPython } from './v8_python_env';

import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { GameEngine } from '../src/game/engine';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial
} from '../src/game/ai/spatial_tensor_encoder';
import {
    loadSpatialResNetFromJson,
    SpatialResNetPredictor
} from '../src/game/ai/spatial_conv_net';

export interface ParityAuditResult {
    modelPath: string;
    numBlocks: number;
    architectureId: string;
    testedCandidatesCount: number;
    maxTrunkZDiff: number;
    maxActionLogitsDiff: number;
    bestIndexMatch: boolean;
    passed: boolean;
    errorDetails?: string;
}

export function runParityCheckOnModel(
    modelPath: string,
    tmpDir: string = path.resolve('training_runs/_tmp_parity')
): ParityAuditResult {
    mkdirSync(tmpDir, { recursive: true });

    const modelJson = readFileSync(modelPath, 'utf8');
    const rawWeights = JSON.parse(modelJson);
    const numBlocks = rawWeights.numBlocks ?? (rawWeights.res3_1 ? 4 : 2);

    // 1. Create a realistic game state
    const sdRules = getApkSkirmishRuleConfig('SD');
    const state = createDemoState(sdRules);
    const engine = new GameEngine(state);
    const legalActions = engine.getLegalActions(0).filter(a => a.type !== 'surrender');

    // 2. Encode state and candidates
    const encState = encodeGameStateSpatial(state, 0, 'v2');
    const candSpatial = legalActions.map(a => {
        const feat = encodeCandidateActionSpatial(state, 0, a, 'v2');
        return {
            action: a,
            actorCoord: feat.actorCoord,
            landingCoord: feat.landingCoord,
            targetCoord: feat.targetCoord,
            semantics: Array.from(feat.semantics)
        };
    });

    const inputData = {
        spatialTensor: Array.from(encState.spatialTensor),
        globalFeatures: Array.from(encState.globalFeatures),
        candidateActions: candSpatial
    };

    const inputPath = path.join(tmpDir, 'parity_input.json');
    const pyOutputPath = path.join(tmpDir, 'py_parity_output.json');
    writeFileSync(inputPath, JSON.stringify(inputData), 'utf8');

    // 3. TypeScript forward
    const tsWeights = loadSpatialResNetFromJson(modelJson);
    const tsPredictor = new SpatialResNetPredictor(tsWeights);
    const tsResult = tsPredictor.predict(encState, candSpatial);

    // 4. Python forward
    // `python` on PATH is not guaranteed to be the interpreter that has torch (a bare conda base
    // install typically is not), so resolve one that can actually `import torch` instead of
    // assuming the PATH default. This does not change the comparison itself.
    const { pythonCommand } = resolveTorchPython();
    const pyCmd = `${pythonCommand} python/verify_parity.py "${modelPath}" "${inputPath}" "${pyOutputPath}"`;
    execSync(pyCmd, { stdio: 'pipe' });
    const pyResult = JSON.parse(readFileSync(pyOutputPath, 'utf8'));

    // 5. Compare Trunk Z
    const tsZ = Array.from(tsResult.spatialFeaturesZ);
    const pyZ: number[] = pyResult.spatialZ;
    let maxDiffZ = 0;
    for (let i = 0; i < tsZ.length; i++) {
        const diff = Math.abs(tsZ[i] - pyZ[i]);
        if (diff > maxDiffZ) maxDiffZ = diff;
    }

    // 6. Compare candidate logits
    const tsLogits = tsResult.actionLogits;
    const pyLogits: number[] = pyResult.actionLogits;
    let maxDiffLogits = 0;
    for (let i = 0; i < tsLogits.length; i++) {
        const diff = Math.abs(tsLogits[i] - pyLogits[i]);
        if (diff > maxDiffLogits) maxDiffLogits = diff;
    }

    const bestMatch = tsResult.bestActionIndex === pyResult.bestActionIndex;
    const passed = maxDiffZ < 1e-4 && maxDiffLogits < 1e-4 && bestMatch;

    return {
        modelPath,
        numBlocks,
        architectureId: tsWeights.architectureId,
        testedCandidatesCount: legalActions.length,
        maxTrunkZDiff: maxDiffZ,
        maxActionLogitsDiff: maxDiffLogits,
        bestIndexMatch: bestMatch,
        passed
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    console.log('[Parity Audit] Starting cross-language inference parity check...');
    const v6_2res = path.resolve('training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json');
    const v6_4res = path.resolve('training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_4block_checkpoint.json');

    const results: ParityAuditResult[] = [];
    if (existsSync(v6_2res)) {
        const res2 = runParityCheckOnModel(v6_2res);
        console.log(`2-block model: passed=${res2.passed}, maxZDiff=${res2.maxTrunkZDiff.toExponential(3)}, maxLogitDiff=${res2.maxActionLogitsDiff.toExponential(3)}, bestIndexMatch=${res2.bestIndexMatch}`);
        results.push(res2);
    }
    if (existsSync(v6_4res)) {
        const res4 = runParityCheckOnModel(v6_4res);
        console.log(`4-block model: passed=${res4.passed}, maxZDiff=${res4.maxTrunkZDiff.toExponential(3)}, maxLogitDiff=${res4.maxActionLogitsDiff.toExponential(3)}, bestIndexMatch=${res4.bestIndexMatch}`);
        results.push(res4);
    }

    const reportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v7_01');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'inference-parity.json');
    writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        parityThreshold: 1e-4,
        allPassed: results.every(r => r.passed),
        results
    }, null, 2), 'utf8');
    console.log(`[Parity Audit] Report saved to: ${reportPath}`);
}
