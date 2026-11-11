/**
 * V16/T16-00：运行身份与源码摘要（owner：T16-00）。
 *
 * 与 V15 的关系：**新增文件**。复用 `v15/tools/eval_v15_identity.ts` 的三个纯函数
 * （`fileListDigestV15` / `mapArtifactsV15` / `initialStateHashOfV15`），保证规范化口径
 * 与 V15 完全一致；本文件只做 V16 的**文件清单定义**与分组（引擎 / 共享推理策略 / H0 对手）。
 *
 * 为什么 V16 要拆成三组而不是 V15 的两组：
 * 任务书 §2.3 要求「冻结 H0 实际代码依赖；规则修复不允许顺带修改对手的战术强度」。
 * V15 的 POLICY 清单只含 4 个文件，而 `heuristic_ai.ts` 实际还依赖
 * `tactical_evaluation.ts` 与 `tactical_pathfinding.ts`。V16 把 H0 依赖闭合进
 * `h0` 组，并单独记录，这样 S1/S2 教师改动 `planning.ts` 不会污染 H0 身份。
 */

import * as path from 'node:path';
import {
    fileListDigestV15,
    mapArtifactsV15,
    initialStateHashOfV15,
    mapLayoutHashOfV15,
    checkpointSha256V15,
    modelIdV15,
    type SourceDigestV15,
} from '../../v15/tools/eval_v15_identity';
import type { GameState } from '../../src/game/types';

export { mapArtifactsV15, initialStateHashOfV15, mapLayoutHashOfV15, checkpointSha256V15, modelIdV15 };
export type { SourceDigestV15 };

/**
 * 引擎/规则源码清单。
 *
 * 中文：任何改变终局判定、淘汰、合法性、伤害顺序、收入结算的文件都属于这里。
 * 增加文件会改变摘要 —— 这正是想要的效果（换代码即换身份）。
 */
export const ENGINE_SOURCE_FILES_V16: readonly string[] = [
    'src/game/abilities.ts',
    'src/game/apk_compat.ts',
    'src/game/apk_map.ts',
    'src/game/apk_skirmish.ts',
    'src/game/apk_skirmish_map_assets.ts',
    'src/game/apk_terrain.ts',
    'src/game/campaign_events.ts',
    'src/game/constants.ts',
    'src/game/engine.ts',
    'src/game/env.ts',
    'src/game/map.ts',
    'src/game/rule_config.ts',
    'src/game/rules.ts',
    'src/game/terrain.ts',
    'src/game/terrain_rules.ts',
    'src/game/types.ts',
];

/**
 * 共享推理策略清单（模型臂实际执行的代码路径）。
 *
 * 中文：T16-02 的稳定 tie-break 会改 `shared_spatial_policy.ts`；
 * 因此**必须先做 T16-02，再跑正式基线**（任务书 §2 明确要求）。
 */
export const POLICY_SOURCE_FILES_V16: readonly string[] = [
    'src/game/ai/shared_spatial_policy.ts',
    'src/game/ai/spatial_conv_net.ts',
    'src/game/ai/spatial_tensor_encoder.ts',
];

/** H0 对手的完整依赖闭包（评审发现 V15 清单漏了后两个文件）。 */
export const H0_SOURCE_FILES_V16: readonly string[] = [
    'src/game/ai/heuristic_ai.ts',
    'src/game/ai/tactical_evaluation.ts',
    'src/game/ai/tactical_pathfinding.ts',
];

/** 对局执行器自身的清单（runner + 协议 + 身份工具 + playOne 实现）。 */
export const RUNNER_SOURCE_FILES_V16: readonly string[] = [
    'v14/tools/eval_v14_match.ts',
    'v14/tools/eval_v14_protocol.ts',
    'v14/tools/eval_v14_aggregate.ts',
    'v15/tools/eval_v15_identity.ts',
    'v13/tools/eval_v3_core.ts',
    'v16/tools/eval_v16_protocol.ts',
    'v16/tools/eval_v16_identity.ts',
    'v16/tools/arena_run_v16.ts',
    'tools/skirmish_dataset_export.ts',
    'tools/sd_training_state_generator.ts',
];

export interface SourceDigestsV16 {
    repoRoot: string;
    engine: SourceDigestV15;
    policy: SourceDigestV15;
    h0: SourceDigestV15;
    runner: SourceDigestV15;
}

/** 一次性算好四组摘要（runner 每次启动算一次，逐局复用）。 */
export function sourceDigestsV16(repoRoot: string): SourceDigestsV16 {
    return {
        repoRoot: repoRoot.replace(/\\/g, '/'),
        engine: fileListDigestV15(repoRoot, ENGINE_SOURCE_FILES_V16),
        policy: fileListDigestV15(repoRoot, POLICY_SOURCE_FILES_V16),
        h0: fileListDigestV15(repoRoot, H0_SOURCE_FILES_V16),
        runner: fileListDigestV15(repoRoot, RUNNER_SOURCE_FILES_V16),
    };
}

/** 把某组摘要摊平成 `path → sha256` 表，便于写进冻结 manifest。 */
export function digestFileTableV16(digest: SourceDigestV15): Record<string, string> {
    const table: Record<string, string> = {};
    for (const f of digest.files) table[f.path] = f.sha256;
    return table;
}

/** 五图初态的实测读数（T16-00 产物）。 */
export interface MapOpeningV16 {
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    mapHash: string;
    mapBytes: number;
    mapLayoutHash: string;
    initialStateHash: string;
    initialGold: number[];
    initialLegalActionCount: number;
    initialRecruitCodes: string[];
    seatAlliances: Record<string, number>;
    /** 快照往返后（`new GameEngine(state)` 语义）的金币，用于证明没有重复首次结算。 */
    snapshotRoundTripGold: number[];
    snapshotRoundTripHash: string;
    /** 与 `v16/review/openings.json` 的审核表逐项核对结果。 */
    matchesAuditTable: boolean;
}

export function repoPath(...parts: string[]): string {
    return path.join(...parts);
}
