/**
 * V17/T17-01：新数据采集的共享常量与身份定义。
 *
 * 中文：这些常量原先放在 `collect_v17_rollouts.ts` 顶层。但那个文件是**可执行工具**
 * （顶层会真的跑对局），被 `build_v17_dataset.ts` import 时会连带执行采集。
 * 因此把纯常量拆到本文件，两个工具都从这里取，避免 import 触发副作用。
 */

import { V16_INITIALIZATION_POLICY_ID } from '../../v16/tools/eval_v16_protocol';

/** 新 train root 命名空间（任务书 §3.2）。 */
export const V17_TRAIN_ROOT_BASE_SEED = 2610010000;
/** 新 val root 命名空间（任务书 §3.2）。 */
export const V17_VAL_ROOT_BASE_SEED = 2610020000;

/** seed 公式的规范字符串，直接写进输出元数据与报告。 */
export const V17_SEED_FORMULA =
    'seed = baseSeed + 1000*mapIndex + 10*rootIndex（baseSeed: train=2610010000, val=2610020000；'
    + 'rootIndex 0..99；无源相关偏移 —— 同行 V16 的 +(source===h0?0:1) 已删除）';

/** 学生行为源 id（只标行为源，不进 seed / family）。 */
export const V17_STUDENT_SOURCE_POLICY = 'P1:s2026';
/** H0 行为源 id。 */
export const V17_H0_SOURCE_POLICY = 'h0';
/** 冠军检查点（只读引用）。 */
export const V17_CHAMPION_CHECKPOINT = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json';
/** 冠军检查点 SHA256（任务书 §0 冻结值）。 */
export const V17_CHAMPION_CHECKPOINT_SHA256 =
    'b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899';

/** 真实 family：map + 初始化/规则版本 + 基础 root seed。不含 split / source / seat。 */
export function trueFamilyIdV17(mapName: string, seed: number): string {
    return `${mapName}#${V16_INITIALIZATION_POLICY_ID}#${seed}`;
}
