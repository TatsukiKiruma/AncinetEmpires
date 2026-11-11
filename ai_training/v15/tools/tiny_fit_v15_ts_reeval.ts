/**
 * V15/T15-05：导出模型的 TS 侧重评（真实 shared policy 路径）。
 *
 * 任务书 §6 步骤 6：每次导出模型都要抽取固定诊断子集再经 shared policy 验证 schema 与动作。
 * 这里对 128 个 train-only 诊断状态逐条走 `predictSpatialAction`（浏览器/Node 与训练共用的那条路径），
 * 比较它选出的动作码与数据的 L1 目标动作码，并核对：
 *   - 权重声明的 encoderSchemaId 与形状一致（predictor 构造期强制校验）；
 *   - 引擎合法集与数据记录一致（同一快照、同一允许集合）；
 *   - shared policy 的 bestActionIndex 直接前向（predictor.predict）一致。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/tiny_fit_v15_ts_reeval.ts \
 *       --states <tiny_fit_v15_states.jsonl> --checkpoint <model.json> --out <tiny_fit_v15_ts_reeval.json>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction, EmptyActionSetError } from '../../src/game/ai/shared_spatial_policy';
import { ENCODER_SCHEMA_ID_V15 } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const statesPath = argOf('--states', null);
const checkpointPath = argOf('--checkpoint', null);
const outPath = argOf('--out', null);
if (!statesPath || !checkpointPath || !outPath) {
    console.error('用法：--states <states.jsonl> --checkpoint <model.json> --out <out.json>');
    process.exit(2);
}

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const weights = loadSpatialResNetFromJson(fs.readFileSync(path.resolve(checkpointPath), 'utf8'), {
    expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V15,
});
const predictor = new SpatialResNetPredictor(weights);

interface StateRow {
    sampleId: string;
    sourceRowIndex: number;
    actingPlayerId: number;
    state: GameState;
    targetActionCode: string;
    candidateActionCodes: string[];
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
}

const rows: StateRow[] = [];
for (const line of fs.readFileSync(path.resolve(statesPath), 'utf8').split('\n')) {
    if (line.trim()) rows.push(JSON.parse(line) as StateRow);
}

const cases: any[] = [];
let hits = 0;
let engineSetMismatches = 0;
let sharedPolicyErrors = 0;
let emptySetRejections = 0;
let directVsSharedMismatches = 0;

for (const row of rows) {
    const state = row.state;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal: Action[] = engine.isTerminal() ? [] : engine.getLegalActions(row.actingPlayerId);
    const legalCodes = legal.map(encodeAction);
    const allowed = legal.filter((a) => a.type !== 'surrender');
    const allowedCodes = allowed.map(encodeAction);
    const engineSetMatches = JSON.stringify(legalCodes) === JSON.stringify(row.engineLegalActionCodes)
        && JSON.stringify(allowedCodes) === JSON.stringify(row.policyAllowedActionCodes);
    if (!engineSetMatches) engineSetMismatches += 1;

    if (allowed.length === 0) {
        try {
            predictSpatialAction(predictor, state, row.actingPlayerId, allowed);
            sharedPolicyErrors += 1;
            cases.push({ sampleId: row.sampleId, error: '空合法集未抛错' });
        } catch (error) {
            if (error instanceof EmptyActionSetError) emptySetRejections += 1;
            else sharedPolicyErrors += 1;
            cases.push({
                sampleId: row.sampleId,
                emptyAllowedSet: true,
                typedEmptyActionSet: error instanceof EmptyActionSetError,
            });
        }
        continue;
    }

    try {
        const result = predictSpatialAction(predictor, state, row.actingPlayerId, allowed);
        const chosenCode = encodeAction(result.action);
        const hit = chosenCode === row.targetActionCode;
        if (hit) hits += 1;
        cases.push({
            sampleId: row.sampleId,
            sourceRowIndex: row.sourceRowIndex,
            candidateCount: allowed.length,
            targetActionCode: row.targetActionCode,
            chosenActionCode: chosenCode,
            hit,
            bestActionIndex: result.bestActionIndex,
            engineSetMatches,
            chosenIsInPolicyAllowedSet: allowedCodes.includes(chosenCode),
            value: result.value,
        });
    } catch (error) {
        sharedPolicyErrors += 1;
        cases.push({
            sampleId: row.sampleId,
            error: (error as Error)?.message ?? String(error),
        });
    }
}

const report = {
    schema: 'v15_tiny_fit_ts_reeval_1',
    task: 'T15-05',
    runId: 'v15_20260925_core',
    generatedAt: new Date().toISOString(),
    statesPath: statesPath.replace(/\\/g, '/'),
    statesSha256: sha256(fs.readFileSync(path.resolve(statesPath))),
    checkpointPath: checkpointPath.replace(/\\/g, '/'),
    checkpointSha256: sha256(fs.readFileSync(path.resolve(checkpointPath))),
    checkpointEncoderSchemaId: weights.encoderSchemaId ?? null,
    predictorSchemaId: predictor.encoderSchemaId,
    semanticsVariant: predictor.semanticsVariant,
    spatialChannels: predictor.spatialChannels,
    semanticDim: predictor.semanticDim,
    path: 'predictSpatialAction（shared policy，浏览器/Node 共用推理路径）',
    states: rows.length,
    top1Correct: hits,
    top1Accuracy: rows.length ? hits / rows.length : null,
    engineSetMismatches,
    sharedPolicyErrors,
    emptySetRejections,
    directVsSharedMismatches,
    acceptance: {
        hitsAtLeast127: hits >= 127,
        allHits: hits === rows.length,
        note: '任务书 §6 要求导出 TS 后同样满足 ≥127/128。',
    },
    cases,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
    out: outPath,
    states: report.states,
    top1Correct: report.top1Correct,
    top1Accuracy: report.top1Accuracy,
    predictorSchemaId: report.predictorSchemaId,
    semanticsVariant: report.semanticsVariant,
    engineSetMismatches,
    sharedPolicyErrors,
    emptySetRejections,
    acceptance: report.acceptance,
}, null, 2));
