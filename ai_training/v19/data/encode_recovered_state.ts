/**
 * 把可恢复的历史状态重新编码为 V19 空间模型监督行。
 *
 * 教师分数只保存在 `teacher` 中；`inputIdentity` 仅覆盖模型实际读取的数值输入与候选顺序。
 */
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { canonicalActionOrderV16, CANDIDATE_ORDERING_ID_V16 } from '../../src/game/ai/action_ordering';
import {
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState, Position } from '../../src/game/types';
import { canonicalStateJson, stateHashOf } from '../../v15/tools/labeler_l1_v15';
import { queryL1LabelV18 } from '../../v18/tools/labeler_l1_v18';

export const RECOVERED_STATE_INPUT_IDENTITY_ID = 'v19-recovered-json-f32-values-canonical-candidates-v1';
export const RECOVERED_STATE_LABEL_SEED_BASE = 2610300000;

export interface RecoveredCandidateAction {
    actionCode: string;
    action: Action;
    actorCoord: Position | null;
    landingCoord: Position | null;
    targetCoord: Position | null;
    semantics: number[];
}

export interface RecoveredStateRow {
    encoderSchemaId: typeof ENCODER_SCHEMA_ID_V19;
    candidateOrderingId: typeof CANDIDATE_ORDERING_ID_V16;
    inputIdentityId: typeof RECOVERED_STATE_INPUT_IDENTITY_ID;
    spatialTensor: number[];
    globalFeatures: number[];
    candidateActions: RecoveredCandidateAction[];
    orderedActionCodes: string[];
    targetActionIndex: number;
    policyLossMask: true;
    valueLossMask: false;
    valueTarget: null;
    stateHash: string;
    teacherStateHash: string;
    inputIdentity: string;
    teacher: {
        targetPolicyId: 'L1';
        targetVersion: string;
        selectionContractId: string;
        jitterContractId: string;
        labelSeedBase: typeof RECOVERED_STATE_LABEL_SEED_BASE;
        seed: number;
        targetActionCode: string;
        actionCodes: string[];
        rawScores: number[];
    };
}

function sha256Canonical(value: unknown): string {
    return createHash('sha256').update(canonicalStateJson(value), 'utf8').digest('hex');
}

function inputIdentityOf(input: {
    spatialTensor: readonly number[];
    globalFeatures: readonly number[];
    candidateActions: readonly RecoveredCandidateAction[];
}): string {
    const numericInput = {
        spatialTensor: input.spatialTensor,
        globalFeatures: input.globalFeatures,
        candidateActions: input.candidateActions.map((candidate) => ({
            actionCode: candidate.actionCode,
            actorCoord: candidate.actorCoord,
            landingCoord: candidate.landingCoord,
            targetCoord: candidate.targetCoord,
            semantics: candidate.semantics,
        })),
    };
    return sha256Canonical({ id: RECOVERED_STATE_INPUT_IDENTITY_ID, ...numericInput });
}

function assertFinite(values: readonly number[], name: string): void {
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`${name} 含非有限数`);
}

function cloneForTeacher(state: GameState): GameState {
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    if (copy.metadata) delete (copy.metadata as unknown as Record<string, unknown>).sdTrainingSeed;
    return copy;
}

/** 同步重编码单个可恢复状态；终局或空候选状态会显式失败。 */
export function encodeRecoveredState(state: GameState): RecoveredStateRow {
    const originalCanonical = canonicalStateJson(state);
    const stateHash = stateHashOf(state);
    const engine = new GameEngine(state);
    if (engine.isTerminal()) throw new Error('不能编码终局状态');

    const legal = engine.getLegalActions(state.currentPlayer).filter((action) => action.type !== 'surrender');
    const ordered = canonicalActionOrderV16(legal);
    if (ordered.length === 0) throw new Error('不能编码无可用候选动作的状态');

    const encoded = encodeGameStateSpatial(state, state.currentPlayer, 'v2', {
        channels: SPATIAL_TENSOR_CHANNELS_V19,
    });
    const spatialTensor = Array.from(encoded.spatialTensor);
    const globalFeatures = Array.from(encoded.globalFeatures);
    const candidateActions = ordered.map((item): RecoveredCandidateAction => {
        const candidate = encodeCandidateActionSpatial(state, state.currentPlayer, item.action, 'v2', 'v15_current');
        return {
            actionCode: item.code,
            action: item.action,
            actorCoord: candidate.actorCoord,
            landingCoord: candidate.landingCoord,
            targetCoord: candidate.targetCoord,
            semantics: Array.from(candidate.semantics),
        };
    });
    const orderedActionCodes = ordered.map((item) => item.code);

    const teacherState = cloneForTeacher(state);
    const teacherStateHash = stateHashOf(teacherState);
    const label = queryL1LabelV18(teacherState, {
        labelSeedBase: RECOVERED_STATE_LABEL_SEED_BASE,
        actingPlayerId: teacherState.currentPlayer,
        subjectPlayerId: teacherState.currentPlayer,
        filterSurrender: true,
    });
    if (!label.stateUnchanged || label.stateHashBefore !== label.stateHashAfter) {
        throw new Error('L1 查询修改了教师状态');
    }
    if (label.diagnostics.length > 0) throw new Error(`L1 查询产生诊断：${label.diagnostics.join(',')}`);
    if (label.emptyActionSet) throw new Error('L1 查询没有可用候选动作');
    if (label.stateHashBefore !== teacherStateHash) throw new Error('教师状态哈希不一致');

    const scoresByCode = new Map(label.scores.map((item) => [item.actionCode, item.score]));
    if (scoresByCode.size !== orderedActionCodes.length
        || orderedActionCodes.some((code) => !scoresByCode.has(code))) {
        throw new Error('L1 教师候选与权威候选不一致');
    }
    const targetActionIndex = orderedActionCodes.indexOf(label.selection.chosenActionCode);
    if (targetActionIndex < 0) throw new Error('L1 标签不在权威候选集中');
    const rawScores = orderedActionCodes.map((code) => scoresByCode.get(code) as number);

    const expectedSpatialLength = SPATIAL_TENSOR_CHANNELS_V19 * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
    if (spatialTensor.length !== expectedSpatialLength) {
        throw new Error(`空间张量维度错误：${spatialTensor.length}，预期 ${expectedSpatialLength}`);
    }
    if (globalFeatures.length !== 20) throw new Error(`全局特征维度错误：${globalFeatures.length}`);
    assertFinite(spatialTensor, '空间张量');
    assertFinite(globalFeatures, '全局特征');
    assertFinite(rawScores, '教师分数');
    for (const candidate of candidateActions) {
        if (candidate.semantics.length !== 53) throw new Error(`动作语义维度错误：${candidate.semantics.length}`);
        assertFinite(candidate.semantics, `动作 ${candidate.actionCode} 的语义`);
    }

    if (canonicalStateJson(state) !== originalCanonical || stateHashOf(state) !== stateHash) {
        throw new Error('重编码过程修改了输入状态');
    }
    const inputIdentity = inputIdentityOf({ spatialTensor, globalFeatures, candidateActions });

    return {
        encoderSchemaId: ENCODER_SCHEMA_ID_V19,
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        inputIdentityId: RECOVERED_STATE_INPUT_IDENTITY_ID,
        spatialTensor,
        globalFeatures,
        candidateActions,
        orderedActionCodes,
        targetActionIndex,
        policyLossMask: true,
        valueLossMask: false,
        valueTarget: null,
        stateHash,
        teacherStateHash,
        inputIdentity,
        teacher: {
            targetPolicyId: 'L1',
            targetVersion: label.labelerVersion,
            selectionContractId: label.selectionContractId,
            jitterContractId: label.jitterContractId,
            labelSeedBase: RECOVERED_STATE_LABEL_SEED_BASE,
            seed: label.seed,
            targetActionCode: label.selection.chosenActionCode,
            actionCodes: orderedActionCodes,
            rawScores,
        },
    };
}
