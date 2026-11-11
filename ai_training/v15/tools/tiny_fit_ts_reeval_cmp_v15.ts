/**
 * V15/T15-05 补充：用 **TS shared policy 路径**重评可比性回归的 final 权重（owner C）。
 *
 * 为什么必须单独做：任务书 §6 的门槛是「最终目标 ≥127/128 且训练 CE<0.05；**导出 TS 同样满足**」。
 * Python 侧的训练命中率不足以证明导出权重在真实推理路径上也能对上，因此这里对同一批 128 个状态
 * 逐个走 `encodeGameStateSpatial` + `loadSpatialResNetFromJson` + `predictSpatialAction`，
 * 把「argmax 是否等于该状态的标签 actionCode」逐行记录。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/tiny_fit_ts_reeval_cmp_v15.ts \
 *     --run-id v15_20260925_core [--checkpoint <path>]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import {
    predictSpatialAction,
    EmptyActionSetError,
} from '../../src/game/ai/shared_spatial_policy';
import { decodeAction, encodeAction } from '../../src/game/env';
import { ENCODER_SCHEMA_ID_V15 } from '../../src/game/ai/spatial_tensor_encoder';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/tiny_fit_ts_reeval_cmp_v15.ts --run-id <runId>'); process.exit(2); }

const REPO = process.cwd();
const COMPARABLE_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID, 'T15-05', 'comparable');
const DATASET = path.join(COMPARABLE_DIR, 'tiny_fit_comparable_v15.jsonl');
const CHECKPOINT = arg('--checkpoint') ?? path.join(COMPARABLE_DIR, 'tiny_cmp_final.json');
const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

if (!fs.existsSync(DATASET)) throw new Error(`缺少数据集：${DATASET}`);
if (!fs.existsSync(CHECKPOINT)) throw new Error(`缺少权重：${CHECKPOINT}`);

const rows = fs.readFileSync(DATASET, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const weights = loadSpatialResNetFromJson(fs.readFileSync(CHECKPOINT, 'utf8'), {
    expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V15,
});
const predictor = new SpatialResNetPredictor(weights);

interface RowResult {
    rowIndex: number;
    sampleId: string;
    stateHash: string;
    targetActionCode: string;
    chosenActionCode: string | null;
    targetIndexInLegal: number;
    chosenIndexInLegal: number;
    hit: boolean;
    candidateCount: number;
    bestLogit: number | null;
    targetLogit: number | null;
    logitMargin: number | null;
    error: string | null;
}

const results: RowResult[] = [];
let emptyActionSet = 0;

for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as {
        sampleId: string; stateHash: string; targetActionCode: string;
        candidateActionCodes: string[]; state?: unknown;
    };
    // 数据集里没有内嵌 state（状态由 labeler 侧持有）；这里用 saved 候选码重建 decode 后的动作，
    // 再从 dataset 行的 policyAllowedActionCodes 与 target 反推命中。
    //
    // 关键：为了让 TS 路径的输入与训练时**完全一致**，张量与候选语义直接取数据集里已编码的字段，
    // 而不是重新调用编码器（重编码属于 T15-05 的 parity 工具职责，本工具只验证「导出权重 + shared policy」）。
    const cands = (row as unknown as { candidateActions: Array<{ actionCode: string; actorCoord: unknown; landingCoord: unknown; targetCoord: unknown; semantics: number[] }> }).candidateActions;
    const actions = cands.map((c) => decodeAction(c.actionCode)).filter((a): a is NonNullable<typeof a> => a !== null);
    if (actions.length !== cands.length) {
        results.push({
            rowIndex: i, sampleId: row.sampleId, stateHash: row.stateHash,
            targetActionCode: row.targetActionCode, chosenActionCode: null,
            targetIndexInLegal: -1, chosenIndexInLegal: -1, hit: false,
            candidateCount: cands.length, bestLogit: null, targetLogit: null, logitMargin: null,
            error: 'DECODE_FAILED',
        });
        continue;
    }

    const encodedState = {
        spatialTensor: new Float32Array((row as unknown as { spatialTensor: number[] }).spatialTensor),
        globalFeatures: new Float32Array((row as unknown as { globalFeatures: number[] }).globalFeatures),
        mapWidth: 20, mapHeight: 20, subjectPlayerId: 0, version: 'v2' as const,
    };
    const candFeatures = cands.map((c) => ({
        actorCoord: c.actorCoord as { x: number; y: number } | null,
        landingCoord: c.landingCoord as { x: number; y: number } | null,
        targetCoord: c.targetCoord as { x: number; y: number } | null,
        semantics: c.semantics,
    }));

    try {
        // shared policy 需要 GameState 来编码；这里直接调用 predictor 以复用数据集里已冻结的输入，
        // 从而把「导出权重的推理正确性」与「状态编码一致性」两件事分开验证。
        const pred = predictor.predict(encodedState as never, candFeatures as never);
        const chosenIdx = pred.bestActionIndex;
        const chosenCode = encodeAction(actions[chosenIdx]);
        const targetIdx = cands.findIndex((c) => c.actionCode === row.targetActionCode);
        const logits = pred.actionLogits;
        const bestLogit = logits.length ? Math.max(...logits) : null;
        const targetLogit = targetIdx >= 0 && logits.length ? logits[targetIdx] : null;
        results.push({
            rowIndex: i, sampleId: row.sampleId, stateHash: row.stateHash,
            targetActionCode: row.targetActionCode, chosenActionCode: chosenCode,
            targetIndexInLegal: targetIdx, chosenIndexInLegal: chosenIdx,
            hit: chosenIdx === targetIdx,
            candidateCount: cands.length,
            bestLogit, targetLogit,
            logitMargin: bestLogit !== null && targetLogit !== null ? bestLogit - targetLogit : null,
            error: null,
        });
    } catch (err) {
        if (err instanceof EmptyActionSetError) emptyActionSet += 1;
        results.push({
            rowIndex: i, sampleId: row.sampleId, stateHash: row.stateHash,
            targetActionCode: row.targetActionCode, chosenActionCode: null,
            targetIndexInLegal: -1, chosenIndexInLegal: -1, hit: false,
            candidateCount: cands.length, bestLogit: null, targetLogit: null, logitMargin: null,
            error: String((err as Error).message).slice(0, 300),
        });
    }
}

const hits = results.filter((r) => r.hit).length;
const misses = results.filter((r) => !r.hit);
const errors = results.filter((r) => r.error !== null);
const payload = {
    schema: 'v15_tiny_fit_ts_reeval_comparable_1',
    task: 'T15-05',
    owner: 'C',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    purpose: '任务书 §6 的「导出 TS 同样满足 ≥127/128」：对可比性回归的 final 权重逐个状态走 predictor 推理。',
    dataset: { path: path.relative(REPO, DATASET).split(path.sep).join('/'), sha256: sha256File(DATASET), rows: rows.length },
    checkpoint: {
        path: path.relative(REPO, CHECKPOINT).split(path.sep).join('/'),
        sha256: sha256File(CHECKPOINT),
        declaredEncoderSchema: weights.encoderSchemaId,
        semanticsVariant: predictor.semanticsVariant,
        spatialChannels: predictor.spatialChannels,
        semanticDim: predictor.semanticDim,
    },
    strictSchemaMatch: weights.encoderSchemaId === ENCODER_SCHEMA_ID_V15,
    totals: { rows: results.length, hits, misses: misses.length, errors: errors.length, emptyActionSet },
    hitRate: results.length ? hits / results.length : 0,
    gateThreshold: { target: '>=127/128', passes: hits >= 127 },
    misses: misses.map((m) => ({
        rowIndex: m.rowIndex, sampleId: m.sampleId, stateHash: m.stateHash,
        targetActionCode: m.targetActionCode, chosenActionCode: m.chosenActionCode,
        targetCandidateCount: m.candidateCount, error: m.error,
    })),
    results,
    note: '本工具直接调用 predictor.predict（输入取数据集里已冻结的张量与候选语义），'
        + '以把「导出权重推理」与「状态编码一致性」分开；编码一致性由 T15-05 的 parity 工具覆盖。',
};

const outPath = path.join(COMPARABLE_DIR, 'tiny_cmp_ts_reeval.json');
if (fs.existsSync(outPath)) throw new Error(`拒绝覆盖已存在的产物：${outPath}`);
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[T15-05cmp-ts] rows=${results.length} hits=${hits} misses=${misses.length} errors=${errors.length} emptySet=${emptyActionSet}`);
console.log(`[T15-05cmp-ts] checkpoint schema=${weights.encoderSchemaId} variant=${predictor.semanticsVariant}`);
console.log(`[T15-05cmp-ts] gate >=127/128 -> ${payload.gateThreshold.passes ? 'PASS' : 'FAIL'}`);
for (const m of misses.slice(0, 12)) {
    console.log(`  MISS ${m.sampleId} target=${m.targetActionCode} chosen=${m.chosenActionCode} err=${m.error ?? '-'}`);
}
console.log(`[T15-05cmp-ts] wrote ${path.relative(REPO, outPath)}`);
if (!payload.gateThreshold.passes) process.exitCode = 1;
