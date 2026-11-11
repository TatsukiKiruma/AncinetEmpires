/**
 * V17/T17-03：B100 查询用的**网络输入身份**辅助（唯一实现，采集与资格查询共用）。
 *
 * 中文：`queryKey` 必须是 T17-01 冻结的网络输入身份，而不是「看起来像 key 的字符串」。
 * 这里把口径固定成与数据集构建完全一致的一步：
 *   spatialTensor = encodeGameStateSpatial(state, playerId, 'v2', { channels: 26 })
 *   globalFeatures = 同上
 *   candidates    = 引擎原生合法集（去 surrender）逐个
 *                   encodeCandidateActionSpatial(state, playerId, a, 'v2', 'v15_current')
 *   最后 policyInputKeyHexV17(spatial, global, candidates)   // v17-netinput-v1
 *
 * 失败时**不**编造 key：provider 返回 null，调用方走已文档化的 `state-fallback` 并如实标注。
 */

import type { Action, GameState } from '../../src/game/types';
import {
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
    ENCODER_SCHEMA_ID_V15,
} from '../../src/game/ai/spatial_tensor_encoder';
import { policyInputKeyHexV17, V17_INPUT_IDENTITY_ID } from '../tools/v17_input_identity';

/** 本工具使用的 schema / 通道数（与 V16 冠军权重声明一致）。 */
export const B100_INPUT_SCHEMA_ID = ENCODER_SCHEMA_ID_V15;
export const B100_INPUT_CHANNELS = 26;
export const B100_INPUT_SEMANTICS_VARIANT = 'v15_current';
export const B100_INPUT_IDENTITY_ID = V17_INPUT_IDENTITY_ID;

export interface B100InputKeyResult {
    key: string | null;
    error: string | null;
}

export function b100PolicyInputKeySafe(
    state: GameState,
    playerId: number,
    allowed: readonly Action[],
): B100InputKeyResult {
    try {
        const spatial = encodeGameStateSpatial(state, playerId, 'v2', { channels: B100_INPUT_CHANNELS });
        const candidates = allowed.map((a) => {
            const f = encodeCandidateActionSpatial(state, playerId, a, 'v2', B100_INPUT_SEMANTICS_VARIANT);
            return {
                actorCoord: f.actorCoord ?? null,
                landingCoord: f.landingCoord ?? null,
                targetCoord: f.targetCoord ?? null,
                semantics: Array.from(f.semantics) as number[],
            };
        });
        return {
            key: policyInputKeyHexV17(spatial.spatialTensor, spatial.globalFeatures, candidates),
            error: null,
        };
    } catch (error) {
        return { key: null, error: error instanceof Error ? error.message : String(error) };
    }
}

export function b100PolicyInputKey(
    state: GameState,
    playerId: number,
    allowed: readonly Action[],
): string {
    const result = b100PolicyInputKeySafe(state, playerId, allowed);
    if (result.key === null) throw new Error(`[B100-input] 网络输入身份计算失败：${result.error}`);
    return result.key;
}

/** 供 `createB100Policy({ inputKeyProvider })` 使用的 provider（失败返回 null）。 */
export function b100InputKeyProvider(): (state: any, playerId: number, allowed: readonly any[]) => string | null {
    return (state: any, playerId: number, allowed: readonly any[]) =>
        b100PolicyInputKeySafe(state as GameState, playerId, allowed as readonly Action[]).key;
}
