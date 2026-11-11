/**
 * V14/T14-04：导出后的 TS 侧复验（G2 的「导出后仍达标」判据）。
 *
 * 为什么需要：tiny-fit 的达标是在 **Python 训练侧**用 `*_last.json` 权重算出来的。
 * 任务书要求「导出后仍达标」—— 也就是把同一份检查点交给浏览器/Node 实际使用的
 * TS 推理路径（`SpatialResNetPredictor`）再算一遍 top-1，并且逐状态比较 Python 侧
 * 记录的预测下标。若两侧不一致，说明训练达标的模型在部署路径上并不达标。
 *
 * 数据来源：
 * - 数据集：tiny_fit_input.jsonl（含 spatialTensor / globalFeatures / candidateActions）
 * - Python 侧读数：各 seed 目录下的 tiny_fit_forward_eval.json（failures 列表给预测下标）
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/tiny_fit_ts_verify.ts \
 *     --dataset <tiny_fit_input.jsonl> --runs <dir1> <dir2> ... --out <report.json>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    SpatialResNetPredictor,
    loadSpatialResNetFromJson,
} from '../../src/game/ai/spatial_conv_net';
import { ENCODER_SCHEMA_ID_V14 } from '../../src/game/ai/spatial_tensor_encoder';
import type { SpatialActionFeatures } from '../../src/game/ai/spatial_tensor_encoder';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const datasetPath = argOf('--dataset', 'v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl')!;
const outPath = argOf('--out', 'v14/out/v14_20260925_t14b/T14-04/tiny_fit_ts_verify.json')!;
// 中文：--runs 后面跟若干 run 目录（可连续多个参数，直到下一个 --xxx 为止）。
const runsArgIndex = process.argv.indexOf('--runs');
const runDirs: string[] = [];
if (runsArgIndex >= 0) {
    for (let i = runsArgIndex + 1; i < process.argv.length; i += 1) {
        if (process.argv[i].startsWith('--')) break;
        runDirs.push(process.argv[i]);
    }
}
if (runDirs.length === 0) {
    runDirs.push('v14/out/v14_20260925_t14b/T14-04/accept_stageB_s42',
        'v14/out/v14_20260925_t14b/T14-04/accept_stageB_s1337',
        'v14/out/v14_20260925_t14b/T14-04/accept_stageB_s2026');
}

const rows = fs.readFileSync(datasetPath, 'utf8').split('\n').filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const results: any[] = [];
for (const runDir of runDirs) {
    const checkpointPath = path.join(runDir, fs.readdirSync(runDir).find((f) => f.endsWith('_last.json')) ?? '');
    const pythonEvalPath = path.join(runDir, 'tiny_fit_forward_eval.json');
    if (!fs.existsSync(checkpointPath)) {
        results.push({ runDir, error: `未找到 *_last.json：${checkpointPath}` });
        continue;
    }
    if (!fs.existsSync(pythonEvalPath)) {
        results.push({ runDir, error: `未找到 tiny_fit_forward_eval.json：${pythonEvalPath}` });
        continue;
    }
    const pythonEval = JSON.parse(fs.readFileSync(pythonEvalPath, 'utf8'));
    const pythonPredictions = new Map<string, number>();
    for (const failure of pythonEval.failures ?? []) {
        pythonPredictions.set(failure.sampleId, failure.predictedIndex);
    }

    const weights = loadSpatialResNetFromJson(fs.readFileSync(checkpointPath, 'utf8'), {
        expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V14,
    });
    const predictor = new SpatialResNetPredictor(weights);
    let correct = 0;
    const mismatches: any[] = [];
    for (const row of rows) {
        const encoded = {
            spatialTensor: new Float32Array(row.spatialTensor),
            globalFeatures: new Float32Array(row.globalFeatures),
            mapWidth: 20,
            mapHeight: 20,
            subjectPlayerId: row.subjectPlayer ?? 0,
        };
        const candidates: SpatialActionFeatures[] = row.candidateActions.map((c: any) => ({
            actorCoord: c.actorCoord ?? null,
            landingCoord: c.landingCoord ?? null,
            targetCoord: c.targetCoord ?? null,
            semantics: c.semantics,
        }));
        const prediction = predictor.predict(encoded, candidates);
        const target = Number(row.targetActionIndex);
        // 中文：Python 侧「未出现在 failures 里」等价于「预测正确」，
        // 因此只有失败行才需要比较具体下标。
        const pythonIndex = pythonPredictions.has(row.sampleId) ? pythonPredictions.get(row.sampleId)! : target;
        if (prediction.bestActionIndex === target) correct += 1;
        if (prediction.bestActionIndex !== pythonIndex) {
            mismatches.push({
                sampleId: row.sampleId,
                targetActionIndex: target,
                tsIndex: prediction.bestActionIndex,
                pythonIndex,
                targetActionCode: row.targetActionCode,
                tsCode: row.candidateActionCodes[prediction.bestActionIndex],
                pythonCode: row.candidateActionCodes[pythonIndex],
            });
        }
    }
    results.push({
        runDir: runDir.replace(/\\/g, '/'),
        checkpoint: checkpointPath.replace(/\\/g, '/'),
        states: rows.length,
        tsTop1Correct: correct,
        tsTop1: correct / rows.length,
        pythonTop1: pythonEval.top1,
        pythonTop1Correct: pythonEval.top1Correct,
        predictionMismatches: mismatches,
        predictionMismatchCount: mismatches.length,
        agreeWithPython: mismatches.length === 0,
        encoderSchemaIdInCheckpoint: (weights as any).encoderSchemaId ?? null,
    });
    console.log(`[T14-04] ${runDir}: TS top1=${(correct / rows.length).toFixed(4)} `
        + `Python top1=${pythonEval.top1} mismatches=${mismatches.length}`);
}

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify({
    schema: 'v14_tiny_fit_ts_export_verify_1',
    task: 'T14-04',
    generatedAt: new Date().toISOString(),
    note: '中文：用浏览器/Node 同一条 TS 推理路径复验 Python 侧达标的最终检查点。',
    dataset: datasetPath,
    results,
}, null, 2) + '\n');
console.log('[T14-04] -> ' + outPath);
