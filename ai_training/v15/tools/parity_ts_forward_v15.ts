/**
 * V15/T15-05：TS 侧前向与 shared policy 原始读数（不 spawn Python）。
 *
 * 为什么不能沿用 `v14/tools/forward_parity_probe.ts`：
 * 那个脚本在 TS 里 `execFileSync('py', …)` 直接调 Python。本机沙箱拒绝 Node 的
 * `child_process.spawn*`（EPERM），所以这里的职责被显式切开：
 *   - 本脚本（TS）：独立重新编码 + 真实 `SpatialResNetPredictor` 前向 + 真实 shared policy 决策，
 *     把原始数值写成 JSON；
 *   - `v15/tools/parity_compare_v15.py`（Python，可 spawn）：跑 Python 验证路径并逐数值比较。
 *
 * 同时验证任务书 §6 第 6 条：每次导出模型都要经 **真实 shared policy** 检查 schema 与动作，
 * 而不是只调用编码器单函数。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_ts_forward_v15.ts \
 *       --states <diag_states.jsonl> --checkpoint <model.json> --out <raw.json> [--limit N]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import {
    SpatialResNetPredictor,
    loadSpatialResNetFromJson,
} from '../../src/game/ai/spatial_conv_net';
import {
    ENCODER_SCHEMA_ID_V15,
    SPATIAL_TENSOR_CHANNELS,
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import { predictSpatialAction, EmptyActionSetError } from '../../src/game/ai/shared_spatial_policy';
import type { Action, GameState } from '../../src/game/types';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const statesPath = argOf('--states', 'v15/out/v15_20260925_core/T15-05/states/diag_states.jsonl')!;
const checkpointPath = argOf('--checkpoint', null);
const outPath = argOf('--out', null);
const limit = Number(argOf('--limit', '0')) || 0;
const expectedSchema = argOf('--expect-schema', ENCODER_SCHEMA_ID_V15)!;

if (!checkpointPath || !outPath) {
    console.error('用法：--states <diag_states.jsonl> --checkpoint <model.json> --out <raw.json> [--limit N] [--expect-schema S]');
    process.exit(2);
}

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const float32Hex = (values: ArrayLike<number>): string => {
    const buffer = Buffer.allocUnsafe(values.length * 4);
    for (let i = 0; i < values.length; i += 1) buffer.writeFloatLE(values[i], i * 4);
    return sha256(buffer);
};

interface DiagState {
    diagId: string;
    buckets: string[];
    sourceKind: string;
    actingPlayerId: number;
    candidateCount: number;
    state: GameState;
    encoding: {
        spatialTensor: number[];
        globalFeatures: number[];
        candidates: Array<{
            actionCode: string;
            actorCoord: { x: number; y: number } | null;
            landingCoord: { x: number; y: number } | null;
            targetCoord: { x: number; y: number } | null;
            semantics: number[];
        }>;
    };
    duplicatedCandidateIndex: number | null;
    exactTieGroups: number[][];
}

const lines = fs.readFileSync(path.resolve(statesPath), 'utf8').split('\n').filter((l) => l.trim());
const states: DiagState[] = [];
for (const line of lines) {
    states.push(JSON.parse(line) as DiagState);
    if (limit > 0 && states.length >= limit) break;
}

const weights = loadSpatialResNetFromJson(fs.readFileSync(path.resolve(checkpointPath), 'utf8'), {
    expectedEncoderSchemaId: expectedSchema,
});
const predictor = new SpatialResNetPredictor(weights);

const perCase: any[] = [];
let nonFinite = 0;
let encodingDigestMismatches = 0;
let sharedPolicyMismatches = 0;
let sharedPolicyErrors = 0;
let emptySetRejections = 0;
let emptySetRejectionsExpected = 0;

for (const item of states) {
    const state = item.state;
    const playerId = state.currentPlayer;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legalActions: Action[] = engine.isTerminal() ? [] : engine.getLegalActions(playerId);
    const allowedActions = legalActions.filter((a) => a.type !== 'surrender');

    // TS 侧**独立重编码**（不读 diag_states 里已存的张量）。
    const encoded = encodeGameStateSpatial(state, playerId, 'v2', { channels: SPATIAL_TENSOR_CHANNELS });
    const candidateFeatures = allowedActions.map((a) => {
        const f = encodeCandidateActionSpatial(state, playerId, a, 'v2', predictor.semanticsVariant);
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });

    // 与构建器写入的张量对比（自洽性检查，不是跨语言证据）。
    const builderSpatial = Float32Array.from(item.encoding.spatialTensor);
    const builderGlobal = Float32Array.from(item.encoding.globalFeatures);
    const spatialMatchesBuilder = encoded.spatialTensor.length === builderSpatial.length
        && float32Hex(encoded.spatialTensor) === float32Hex(builderSpatial);
    if (!spatialMatchesBuilder) encodingDigestMismatches += 1;

    // 注意：即使候选集为空也要调用 predict —— release 路径会照常算 trunk 与 value，
    // 只是返回空 logits 与 bestActionIndex=-1。跳过这一步会让 trunk 比较失去输入。
    const pred = predictor.predict(encoded, candidateFeatures as never);

    // 真实 shared policy 路径（引擎合法集 + 策略过滤，与生产调用一致）。
    let shared: Record<string, unknown>;
    if (allowedActions.length === 0) {
        emptySetRejectionsExpected += 1;
        try {
            predictSpatialAction(predictor, state, playerId, allowedActions);
            shared = { rejected: false, error: '应当抛出 EmptyActionSetError 但没有' };
            sharedPolicyMismatches += 1;
        } catch (error) {
            const typed = error instanceof EmptyActionSetError;
            if (typed) emptySetRejections += 1;
            else sharedPolicyErrors += 1;
            shared = {
                rejected: true,
                typedEmptyActionSet: typed,
                errorName: (error as Error)?.name ?? null,
                errorCode: (error as { code?: string })?.code ?? null,
                message: (error as Error)?.message ?? String(error),
            };
        }
    } else {
        try {
            const result = predictSpatialAction(predictor, state, playerId, allowedActions);
            const directIndex = pred.bestActionIndex;
            const matchesDirect = result.bestActionIndex === directIndex;
            if (!matchesDirect) sharedPolicyMismatches += 1;
            shared = {
                rejected: false,
                bestActionIndex: result.bestActionIndex,
                actionCode: encodeAction(result.action),
                matchesDirectPredictor: matchesDirect,
                legalActionCodes: legalActions.map(encodeAction),
                policyAllowedActionCodes: allowedActions.map(encodeAction),
            };
        } catch (error) {
            sharedPolicyErrors += 1;
            shared = {
                rejected: false,
                errorName: (error as Error)?.name ?? null,
                message: (error as Error)?.message ?? String(error),
            };
        }
    }

    const logits = pred.actionLogits;
    for (const value of logits) if (!Number.isFinite(value)) nonFinite += 1;
    if (!Number.isFinite(pred.value)) nonFinite += 1;

    const z = Array.from(pred.spatialFeaturesZ);

    perCase.push({
        diagId: item.diagId,
        buckets: item.buckets,
        sourceKind: item.sourceKind,
        actingPlayerId: playerId,
        candidateCount: candidateFeatures.length,
        actionCodes: candidateFeatures.map((c) => c.actionCode),
        // 原始 Action 对象：Python 侧用它独立重算候选特征，而不是复用这里的编码结果。
        actions: allowedActions as unknown as unknown[],
        engineLegalActionCodes: legalActions.map(encodeAction),
        policyAllowedActionCodes: allowedActions.map(encodeAction),
        spatialTensor: Array.from(encoded.spatialTensor),
        globalFeatures: Array.from(encoded.globalFeatures),
        spatialTensorSha256: float32Hex(encoded.spatialTensor),
        globalFeaturesSha256: float32Hex(encoded.globalFeatures),
        builderSpatialTensorSha256: float32Hex(builderSpatial),
        builderGlobalFeaturesSha256: float32Hex(builderGlobal),
        spatialMatchesBuilder,
        candidates: candidateFeatures.map((c) => ({
            actionCode: c.actionCode,
            actorCoord: c.actorCoord,
            landingCoord: c.landingCoord,
            targetCoord: c.targetCoord,
            semanticsSha256: float32Hex(Float32Array.from(c.semantics)),
            semantics: c.semantics,
        })),
        logits,
        value: pred.value,
        bestActionIndex: pred.bestActionIndex,
        bestActionCode: candidateFeatures.length > 0
            ? candidateFeatures[pred.bestActionIndex]?.actionCode ?? null
            : null,
        z,
        zSha256: float32Hex(Float32Array.from(z)),
        duplicatedCandidateIndex: item.duplicatedCandidateIndex,
        exactTieGroups: item.exactTieGroups,
        sharedPolicy: shared,
    });
}

const report = {
    schema: 'v15_ts_forward_raw_1',
    task: 'T15-05',
    side: 'typescript',
    generatedAt: new Date().toISOString(),
    statesPath: statesPath.replace(/\\/g, '/'),
    checkpointPath: checkpointPath.replace(/\\/g, '/'),
    checkpointSha256: sha256(fs.readFileSync(path.resolve(checkpointPath))),
    checkpointEncoderSchemaId: weights.encoderSchemaId ?? null,
    predictorSchemaId: predictor.encoderSchemaId,
    predictorSemanticsVariant: predictor.semanticsVariant,
    predictorSpatialChannels: predictor.spatialChannels,
    predictorSemanticDim: predictor.semanticDim,
    cases: perCase.length,
    summary: {
        nonFiniteReadouts: nonFinite,
        encodingDigestMismatches,
        sharedPolicyMismatches,
        sharedPolicyErrors,
        emptySetRejections,
        emptySetRejectionsExpected,
    },
    readouts: perCase,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(report), 'utf8');

console.log(JSON.stringify({
    out: outPath,
    cases: perCase.length,
    predictorSchemaId: predictor.encoderSchemaId,
    semanticsVariant: predictor.semanticsVariant,
    ...report.summary,
}, null, 2));
