/**
 * 空间网格多通道张量编码器 (Path B - Spatial Tensor Encoder)
 *
 * 核心升级：
 * 1. 彻底摒弃 4×4 粗粒度分箱，采用 24 通道精确 2D 空间张量 (C x H x W，支持最大 20x20 并零填充)；
 * 2. 保留完整的局部几何拓扑、地形加成、ZOC 与单位攻击射程威胁分布；
 * 3. 提取动作在网格上的精确空间三元组坐标 (actorPos, landingPos, targetPos)；
 * 4. 提取 24 维精确动作语义特征 (伤害/反击/斩杀/自保/占领/距离/兵种)。
 *
 * V14/T14-03 变更（张量形状不变，语义变化，用 ENCODER_SCHEMA_ID 区分）：
 * - 攻击语义槽 15「预计反击」改用 rules.canCounterAttack + rules.estimateCounterDamage，
 *   与 engine.step 的 attack 分支共用同一实现。历史实现只要目标预计不死就无条件反算，
 *   把 3 格外投石车攻击也标成会反击（v13 复核反例 estCounter=50 / 引擎实际 0）。
 * - 行动者字段沿用 tools/skirmish_action_semantics.ts（heal=healerId、support=supporterId），
 *   该文件在 v13 已修正，本编码器不重复实现。
 */

import type { Action, GameState, Position, Unit, UnitClass } from '../types';
import { areEnemyPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../rule_config';
import { getEffectiveStats } from '../abilities';
import { getTileTerrainConfig, getTileTerrainKey } from '../terrain_rules';
import { getDistance } from '../map';
import { calculateArmyValue } from '../env';
import { calculateDamage, estimateCounterDamage, estimateCounterDamageWithoutExpProjection } from '../rules';
import { getActionSemantics } from './runtime/skirmish_action_semantics';
import { encodePathRelations } from './path_relations';

/**
 * V14/T14-03：通道数由 24 扩展到 26。
 *
 * 新增通道（由 state_aliasing_cases.json 的实测别名驱动）：
 * - Ch 24（己方单位）：本回合是否已移动。历史编码只有 Ch13「未行动」，
 *   因此“还没移动的士兵”与“已经移动过的士兵”在输入上不可区分，
 *   而两者的合法动作集完全不同。
 * - Ch 25（己方单位）：有效攻击力 / 200。历史编码完全没有战斗数值通道，
 *   实测同一兵种 level 1 与 level 9（攻击 65 vs 145、防御 10 vs 50）产生完全相同的
 *   24 通道空间张量与全局特征（spatial diff = 0）。候选动作虽然带伤害语义，
 *   但“两个同名目标谁的等级更高”这类状态差异在策略输入上不可见。
 *
 * 通道编号是编码器语义的一部分：24 通道检查点不得被 26 通道编码器加载，反之亦然
 * （见 spatial_conv_net.loadSpatialResNetFromJson 的 channels 校验）。
 */
export const SPATIAL_TENSOR_CHANNELS = 26;
/**
 * V19/T19-01：新增 8 个通道，总 34。
 *
 * 为什么必须加（不是「加大容量」，而是修已复现的信息缺失，见 `V18_REVIEW_AND_RULES.md` §2.4）：
 * - 26 通道下，棋盘上的敌军只有粗兵种类别（`categorizeUnitClass/7`），
 *   slime 与 water_elemental 同属「1/7」，交换两者位置后**空间张量、全局特征与全部 39 个
 *   候选输入完全相同**，但引擎实际伤害是 20 对 45。
 * - 26 通道的 Ch21 威胁用 `u.hasMoved ? 0 : move` 计算。我方行动期间敌军常保留上一回合
 *   已经移动的标记，编码认为威胁为 0；交出回合后同一敌军恢复行动，威胁变成 1。
 *   因此该通道不能当作「下一敌方行动阶段的危险图」。
 *
 * 新通道（编号 26..33）只承载**可核验的规则派生量**，不复用也不改写旧通道语义：
 * | 通道 | 含义 | 归一化 |
 * |---|---|---|
 * | 26 | 敌方单位兵种身份索引 | / 21 |
 * | 27 | 己方单位兵种身份索引 | / 21 |
 * | 28 | 敌方有效物理防御 | / 60 |
 * | 29 | 敌方有效魔法防御 | / 60 |
 * | 30 | 敌方有效攻击 | / 200 |
 * | 31 | **下一敌方行动阶段**威胁半径（按回合开始状态重置行动标记后重算） | 0/1 |
 * | 32 | 己方剩余移动力（未移动则为有效移动力，已移动则为 0） | / 8 |
 * | 33 | 己方有效物理防御 | / 60 |
 *
 * 明确不声称的东西：Ch31 是按曼哈顿半径与射程上界涂布的**上界**，不含地形路径、
 * 最小射程空洞与多敌军相互作用的精确必杀概率；它只修正「时间语义」这一项已证实的缺陷。
 */
export const SPATIAL_TENSOR_CHANNELS_V19 = 34;
/** 历史 24 通道语义，仅用于识别旧权重并给出明确拒绝信息。 */
export const SPATIAL_TENSOR_CHANNELS_LEGACY = 24;
export const SPATIAL_TENSOR_MAX_H = 20;
export const SPATIAL_TENSOR_MAX_W = 20;
export const GLOBAL_FEATURE_DIM_V1 = 16;
export const GLOBAL_FEATURE_DIM_V2 = 20;
export const GLOBAL_FEATURE_DIM = GLOBAL_FEATURE_DIM_V2;

export const ACTION_SEMANTIC_DIM_V1 = 24;
export const ACTION_SEMANTIC_DIM_V2 = 32;
/**
 * V14：53 = 32 维基础语义 + 槽 32..52 的 21 维兵种 one-hot。
 * one-hot 放在 32 维基础语义之后，因此 v2 原有槽位（含语义槽 15 的预计反击）含义不变。
 */
export const ACTION_SEMANTIC_DIM_V3 = 53;
/** Path-3 在冻结的 53 维语义末尾追加三个纯规则路径事实。 */
export const ACTION_SEMANTIC_DIM_PATH3 = 56;
export const ACTION_SEMANTIC_DIM = ACTION_SEMANTIC_DIM_V3;

/**
 * V14/T14-03：编码器输入语义版本。
 *
 * 权重必须声明它所解释的输入语义；旧权重不得静默加载到新语义上。
 * - `spatial24_global20_actionSemantics32_v13`：历史语义。24 通道；攻击语义槽 15
 *   在原状态上无条件反算反击，把 3 格外远程攻击也标成会反击（v13 复核反例）。
 * - `spatial26_global20_actionSemantics32_v14`：本版本。26 通道（+hasMoved、+有效攻击力）；
 *   反击判定改用 rules.canCounterAttack / estimateCounterDamage，与 engine.step 共用实现。
 */
export const ENCODER_SCHEMA_ID_V13 = 'spatial24_global20_actionSemantics32_v13';
export const ENCODER_SCHEMA_ID_V14 = 'spatial26_global20_actionSemantics53_v14';
/**
 * V15/T15-02：本轮正式 schema。
 *
 * 与 V14 的**形状完全相同**（26 空间通道 / 20 全局 / 53 动作语义），差别只在语义：
 * 攻击语义槽 15「预计反击」与槽 17「自杀风险」改用**完整引擎结算顺序**的投影，
 * 即包含攻击者本次攻击获得的经验与跨阈值升级。因此 V14 与 V15 是同一维度下的
 * 两个语义版本，**不能靠维度判断兼容**（任务书 §4.2 明确要求）。
 *
 * 本轮不为无关目的增加维度：新名称表达的是语义修订，不是形状变化。
 */
export const ENCODER_SCHEMA_ID_V15 = 'spatial26_global20_actionSemantics53_v15';
/**
 * V19/T19-01：本轮新增 schema。
 *
 * 与 v15 的差别只在**空间通道数**（34 vs 26）：动作语义仍是 53 维、攻击语义仍用
 * `v15_current`（引擎完整结算顺序）。新增的 8 个通道承载兵种身份、物/魔防、有效攻击、
 * 「下一敌方行动阶段」威胁与己方剩余移动力，用于修复 V18 复核 §2.4 已复现的信息缺失。
 */
export const ENCODER_SCHEMA_ID_V19 = 'spatial34_global20_actionSemantics53_v19';
/** V19 Path-3：34 通道状态、20 维全局特征、56 维候选语义。 */
export const ENCODER_SCHEMA_ID_V19_PATH3 = 'spatial34_global20_actionSemantics56_v19_path3';
export const ENCODER_SCHEMA_ID = ENCODER_SCHEMA_ID_V15;
/** 训练/推理共同接受的 schema 列表；缺省（历史权重无该字段）按 v13 语义处理。 */
export const ENCODER_SCHEMA_ID_V1 = 'spatial24_global16_actionSemantics24_v1';
export const SUPPORTED_ENCODER_SCHEMA_IDS = [
    ENCODER_SCHEMA_ID_V1, ENCODER_SCHEMA_ID_V13, ENCODER_SCHEMA_ID_V14,
    ENCODER_SCHEMA_ID_V15, ENCODER_SCHEMA_ID_V19, ENCODER_SCHEMA_ID_V19_PATH3,
] as const;
export type EncoderSchemaId = (typeof SUPPORTED_ENCODER_SCHEMA_IDS)[number];
/** schema → 空间通道数。加载检查点与 predict 都必须按它校验张量长度。 */
export const ENCODER_SCHEMA_CHANNELS: Record<EncoderSchemaId, number> = {
    [ENCODER_SCHEMA_ID_V1]: SPATIAL_TENSOR_CHANNELS_LEGACY,
    [ENCODER_SCHEMA_ID_V13]: SPATIAL_TENSOR_CHANNELS_LEGACY,
    [ENCODER_SCHEMA_ID_V14]: SPATIAL_TENSOR_CHANNELS,
    [ENCODER_SCHEMA_ID_V15]: SPATIAL_TENSOR_CHANNELS,
    [ENCODER_SCHEMA_ID_V19]: SPATIAL_TENSOR_CHANNELS_V19,
    [ENCODER_SCHEMA_ID_V19_PATH3]: SPATIAL_TENSOR_CHANNELS_V19,
};
/** schema → 动作语义维度。维度相同并不代表语义相同（v14/v15/v19 就是这种情形）。 */
export const ENCODER_SCHEMA_SEMANTIC_DIM: Record<EncoderSchemaId, number> = {
    [ENCODER_SCHEMA_ID_V1]: ACTION_SEMANTIC_DIM_V1,
    [ENCODER_SCHEMA_ID_V13]: ACTION_SEMANTIC_DIM_V2,
    [ENCODER_SCHEMA_ID_V14]: ACTION_SEMANTIC_DIM_V3,
    [ENCODER_SCHEMA_ID_V15]: ACTION_SEMANTIC_DIM_V3,
    [ENCODER_SCHEMA_ID_V19]: ACTION_SEMANTIC_DIM_V3,
    [ENCODER_SCHEMA_ID_V19_PATH3]: ACTION_SEMANTIC_DIM_PATH3,
};

/**
 * V15/T15-02：攻击语义的计算变体。
 *
 * 这是「维度相同、语义不同」的显式分派点。历史语义中的缺陷（原状态无条件反算反击）
 * 必须留在 `v13_legacy` 分支里，供历史模型复核使用；当前规则正确性一律以 `v15_current` 为准。
 * 不允许用「通道数 24/26」或「语义维度 32/53」替代这个判断。
 */
export type ActionSemanticsVariant = 'v1_legacy' | 'v13_legacy' | 'v14_no_exp_projection' | 'v15_current';

/** schema → 攻击语义变体。新增 schema 必须在这里显式登记，未登记即报错。 */
export const ENCODER_SCHEMA_SEMANTICS_VARIANT: Record<EncoderSchemaId, ActionSemanticsVariant> = {
    [ENCODER_SCHEMA_ID_V1]: 'v1_legacy',
    [ENCODER_SCHEMA_ID_V13]: 'v13_legacy',
    [ENCODER_SCHEMA_ID_V14]: 'v14_no_exp_projection',
    [ENCODER_SCHEMA_ID_V15]: 'v15_current',
    // V19 不修改攻击语义：反击/自杀风险仍按引擎完整结算顺序，与 v15 逐位相同。
    [ENCODER_SCHEMA_ID_V19]: 'v15_current',
    // Path-3 只追加路径事实，原有 53 维仍使用 v15 的完整引擎结算语义。
    [ENCODER_SCHEMA_ID_V19_PATH3]: 'v15_current',
};

/** 由 schema 解析攻击语义变体；未知 schema 直接抛错，不做维度猜测。 */
export function actionSemanticsVariantForSchema(schemaId: string): ActionSemanticsVariant {
    const variant = (ENCODER_SCHEMA_SEMANTICS_VARIANT as Record<string, ActionSemanticsVariant>)[schemaId];
    if (!variant) {
        throw new Error(
            `未知的 encoder schema：${schemaId}。V15/T15-02 要求显式分派，`
            + `不接受按维度猜测兼容；已知 schema 为 ${SUPPORTED_ENCODER_SCHEMA_IDS.join(' / ')}。`
        );
    }
    return variant;
}

/**
 * 由「空间通道数 + 动作语义维度」反推 schema，用于历史权重缺少 encoderSchemaId 的场景。
 *
 * 关键约束：v14 与 v15 形状相同（26/53），无法从形状区分。因此本函数**只用于
 * 已确认没有 encoderSchemaId 的历史权重**，此时按 `v14_no_exp_projection` 语义处理
 * （即历史实际行为），绝不能把新语义静默套到旧权重上。
 */
export function inferEncoderSchemaFromShapes(channels: number, semanticDim: number, modelVersion?: string): EncoderSchemaId {
    if (modelVersion === 'spatial-resnet-v1') return ENCODER_SCHEMA_ID_V1;
    if (channels === SPATIAL_TENSOR_CHANNELS_LEGACY) {
        return semanticDim === ACTION_SEMANTIC_DIM_V1 ? ENCODER_SCHEMA_ID_V1 : ENCODER_SCHEMA_ID_V13;
    }
    if (channels === SPATIAL_TENSOR_CHANNELS) {
        if (semanticDim === ACTION_SEMANTIC_DIM_V3) return ENCODER_SCHEMA_ID_V14;
        throw new Error(`无法从形状推断 schema：channels=${channels}, semanticDim=${semanticDim}。`);
    }
    if (channels === SPATIAL_TENSOR_CHANNELS_V19) {
        if (semanticDim === ACTION_SEMANTIC_DIM_V3) return ENCODER_SCHEMA_ID_V19;
        if (semanticDim === ACTION_SEMANTIC_DIM_PATH3) return ENCODER_SCHEMA_ID_V19_PATH3;
        throw new Error(`无法从形状推断 schema：channels=${channels}, semanticDim=${semanticDim}。`);
    }
    throw new Error(`未知的空间通道数 ${channels}；拒绝按维度猜测兼容。`);
}

export interface SpatialEncodedState {
    /** 形状为 [C, 20, 20] 的扁平化 Float32Array；C 为 26（v14）或 24（v13） */
    spatialTensor: Float32Array;
    /** 实际使用的通道数；必须与权重声明的通道数一致 */
    channels?: number;
    /** 全局经济与战局标量 (20 维 in v2, 16 维 in v1) */
    globalFeatures: Float32Array;
    mapWidth: number;
    mapHeight: number;
    subjectPlayerId: number;
    version?: 'v1' | 'v2';
}

export interface SpatialActionFeatures {
    /** 动作在网格上的起点 (行动者) 坐标，范围 [0..19]，若无则置 -1 */
    actorCoord: Position | null;
    /** 动作在网格上的落点 (移动/部署) 坐标，范围 [0..19]，若无则置 -1 */
    landingCoord: Position | null;
    /** 动作在网格上的目标 (攻击/治疗/破坏) 坐标，范围 [0..19]，若无则置 -1 */
    targetCoord: Position | null;
    /** 动作的战术语义特征向量 (24 维 in v1, 32 维 in v2) */
    semantics: Float32Array | number[];
}

export const ACTION_TYPE_LIST = [
    'move', 'attack', 'capture', 'repair', 'wait',
    'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon',
    'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn'
] as const;

/**
 * V14/T14-03：兵种 one-hot 的维度与顺序（与 UNIT_CONFIGS 的键顺序一致）。
 *
 * 为什么必须存在：历史语义只给出 `categorizeUnitClass(unitClass)/7.0` 这一个粗分类
 * （步兵/远程/飞行/骑兵/施法/重装/指挥官）。同一分类里的不同兵种因此在策略输入上完全
 * 不可区分 —— 例如 archer 与 wolf_archer 都是 2/7、slime 与 water_elemental 都是 1/7。
 * T14-04 的 128 状态记忆诊断实测：8 个未拟合状态全部是 recruit 兵种混淆
 * （target archer → 预测 water_elemental / paladin，target slime → 预测 water_elemental 等），
 * 说明这是输入不可区分，而不是优化不足。
 */
export const ACTION_UNIT_CLASS_LIST = [
    'soldier', 'ghost', 'mermaid', 'archer', 'slime', 'water_elemental', 'dark_mage', 'witch',
    'paladin', 'elf', 'berserker', 'wolf', 'golem', 'ice_elemental', 'druid', 'catapult',
    'wolf_archer', 'dragon', 'commander', 'skeleton', 'crystal',
] as const;
export const ACTION_UNIT_CLASS_DIM = ACTION_UNIT_CLASS_LIST.length;
/** one-hot 在语义向量里的起始槽位（14..19 是攻击专用槽，20..23 是通用槽）。 */
export const ACTION_UNIT_CLASS_SLOT_START = 32;
export const ACTION_UNIT_CLASS_SLOT_END = ACTION_UNIT_CLASS_SLOT_START + ACTION_UNIT_CLASS_DIM;

function encodeUnitClassOneHot(semantics: Float32Array | number[], unitClass: UnitClass): void {
    const index = ACTION_UNIT_CLASS_LIST.indexOf(unitClass as never);
    if (index < 0) return;
    semantics[ACTION_UNIT_CLASS_SLOT_START + index] = 1.0;
}

/**
 * V19/T19-01：兵种身份索引（0 起；未知兵种返回 0）。
 *
 * 中文：V19 空间通道 26/27 用它把「粗分类」升级为「完整兵种身份」。
 * 这是一个有序标量而不是 one-hot —— 对 CNN 而言不如 one-hot 直观，但它把
 * 「同一粗分类里的不同兵种」在同一张量上区分开，同时避免一次增加 42 个通道。
 * 与之配套的物/魔防通道提供了连续的强度信息，两者互补。
 */
export function unitClassIndex(unitClass: UnitClass): number {
    const index = ACTION_UNIT_CLASS_LIST.indexOf(unitClass as never);
    return index < 0 ? 0 : index;
}

export function categorizeUnitClass(cls: UnitClass): number {
    switch (cls) {
        case 'soldier':
        case 'skeleton':
            return 1; // 步兵
        case 'archer':
        case 'wolf_archer':
            return 2; // 弓手/远程
        case 'ghost':
        case 'dragon':
            return 3; // 飞行
        case 'wolf':
        case 'berserker':
            return 4; // 骑兵/野兽
        case 'dark_mage':
        case 'witch':
        case 'druid':
            return 5; // 施法者
        case 'catapult':
        case 'golem':
            return 6; // 重装/攻城
        case 'commander':
            return 7; // 指挥官
        default:
            return 1;
    }
}

/**
 * V15/T15-02：按语义变体计算「预计反击」。这是历史上唯一会随版本改变口径的攻击语义槽，
 * 因此单独成函数并把历史缺陷固定在 `v13_legacy` 分支里。
 *
 * | 变体 | 行为 |
 * |---|---|
 * | `v1_legacy` / `v13_legacy` | 历史实现：只要目标预计不死就**在原状态上无条件反算**反击。3 格外投石车被标成会反击（estCounter=50 / 引擎实际 0）。 |
 * | `v14_no_exp_projection` | V14 语义：用 canCounterAttack/estimateCounterDamage（引擎反击资格），但**漏掉攻击者 addExp 升级**。经验 90 的 0 级士兵预测 25 / 引擎实际 22。 |
 * | `v15_current` | 当前语义：完整引擎结算顺序，含升级投影，与引擎逐位一致。 |
 *
 * 历史语义只用于复核历史模型，不构成当前规则正确性的 oracle。
 */
export function estimateCounterDamageForVariant(
    variant: ActionSemanticsVariant,
    state: GameState,
    attackerId: string,
    defenderId: string,
    estDmg: number,
): number {
    if (variant === 'v1_legacy' || variant === 'v13_legacy') {
        const attacker = state.units.find(u => u.id === attackerId);
        if (!attacker) return 0;
        // 历史公式原文（v13 编码器，见 v14/tools/audit_counter_semantics.ts 的内联复现）：
        //   estDmg = calculateDamage(state, attacker, defender);
        //   estCounter = (defender.hp - estDmg > 0) ? calculateDamage(state, defender, attacker) : 0;
        // 注意历史实现的原状态估算：致盲与升级都没有投影，因此升级边界下得到 25 而不是 22；
        // 3 格外投石车得到 50 而不是引擎的 0。这里的 `estDmg` 参数保留是为了让签名统一，
        // 历史分支自行重算，避免调用方传入纠正后的伤害值而改变历史读数。
        void estDmg;
        const defender = state.units.find(u => u.id === defenderId);
        if (!defender) return 0;
        const legacyEstDmg = calculateDamage(state, attackerId, defenderId);
        return (defender.hp - legacyEstDmg > 0) ? calculateDamage(state, defenderId, attackerId) : 0;
    }
    if (variant === 'v14_no_exp_projection') {
        // V14 语义：反击资格正确，但伤害投影缺少「攻击者本次攻击获得的经验/升级」这一步。
        // 这里显式复现该口径，供历史 V14 权重复核；新 schema 不得使用。
        return estimateCounterDamageWithoutExpProjection(state, attackerId, defenderId);
    }
    return estimateCounterDamage(state, attackerId, defenderId);
}

/**
 * 将 GameState 编码为 [24, 20, 20] 空间网格张量与全局标量 (V2: 20维, V1: 16维)。
 */export function encodeGameStateSpatial(
    state: GameState,
    playerId: number,
    version: 'v1' | 'v2' = 'v2',
    options?: { channels?: number }
): SpatialEncodedState {
    const H = SPATIAL_TENSOR_MAX_H;
    const W = SPATIAL_TENSOR_MAX_W;
    // 通道数由调用方（编码器 schema / 已加载权重）决定：v13=24，v14=26。
    // 未提供时使用当前默认 schema 的通道数。
    const C = options?.channels ?? SPATIAL_TENSOR_CHANNELS;
    if (C !== SPATIAL_TENSOR_CHANNELS && C !== SPATIAL_TENSOR_CHANNELS_LEGACY
        && C !== SPATIAL_TENSOR_CHANNELS_V19) {
        throw new Error(
            `encodeGameStateSpatial: 不支持的通道数 ${C}`
            + `（仅支持 ${SPATIAL_TENSOR_CHANNELS_LEGACY} / ${SPATIAL_TENSOR_CHANNELS} / `
            + `${SPATIAL_TENSOR_CHANNELS_V19}）`,
        );
    }
    /** 是否写入 V19 新增通道（26..33）。旧 schema 一律不写，保证历史张量逐位不变。 */
    const writeV19Channels = C >= SPATIAL_TENSOR_CHANNELS_V19;
    const tensor = new Float32Array(C * H * W);
    const mapW = state.map.width;
    const mapH = state.map.height;
    const alliance = getAllianceId(state, playerId);

    // 辅助函数：在 (ch, y, x) 写入标量
    const setChannel = (ch: number, y: number, x: number, val: number) => {
        if (y < 0 || y >= H || x < 0 || x >= W) return;
        tensor[ch * (H * W) + y * W + x] = val;
    };

    // 1. 地形与建筑通道
    for (let y = 0; y < mapH && y < H; y += 1) {
        for (let x = 0; x < mapW && x < W; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            if (!tile) continue;

            // Ch 23: 有效地图格标记
            setChannel(23, y, x, 1.0);

            const cfg = getTileTerrainConfig(tile);
            const key = getTileTerrainKey(tile);
            const defBonus = (cfg?.defenseBonus ?? 0) / 40.0;
            // Ch 7: 地形防御加成
            setChannel(7, y, x, defBonus);

            // 地形分类
            if (key === 'road' || key === 'bridge' || key === 'snow') {
                setChannel(0, y, x, 1.0);
            } else if (key === 'forest') {
                setChannel(1, y, x, 1.0);
            } else if (key === 'mountain' || key === 'hill') {
                setChannel(2, y, x, 1.0);
            } else if (key === 'deep_water' || key === 'water_temple') {
                setChannel(3, y, x, 1.0);
            } else if (key === 'castle') {
                setChannel(4, y, x, 1.0);
            } else if (key === 'town' || key === 'damaged_town') {
                setChannel(5, y, x, 1.0);
            } else {
                setChannel(6, y, x, 1.0);
            }

            // 归属判断
            if (tile.ownerId !== null) {
                if (getAllianceId(state, tile.ownerId) === alliance) {
                    setChannel(8, y, x, 1.0); // 己方领地
                } else if (areEnemyPlayers(state, playerId, tile.ownerId)) {
                    setChannel(9, y, x, 1.0); // 敌方领地
                }
            } else if (key === 'town' || key === 'castle' || key === 'damaged_town') {
                setChannel(10, y, x, 1.0); // 中立建筑
            }
        }
    }

    // 2. 单位通道
    const aliveUnits = state.units.filter(u => u.hp > 0);
    const ownUnits = aliveUnits.filter(u => getAllianceId(state, u.ownerId) === alliance);
    const enemyUnits = aliveUnits.filter(u => areEnemyPlayers(state, playerId, u.ownerId));

    // 己方单位: Ch 11..17
    for (const u of ownUnits) {
        const x = u.pos.x;
        const y = u.pos.y;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;

        setChannel(11, y, x, 1.0); // 己方存在
        setChannel(12, y, x, Math.max(0, Math.min(1.0, u.hp / Math.max(1, u.maxHp)))); // HP
        setChannel(13, y, x, (!u.hasActed) ? 1.0 : 0.0); // 未行动
        setChannel(14, y, x, categorizeUnitClass(u.unitClass) / 7.0); // 兵种类别

        const stats = getEffectiveStats(u);
        setChannel(15, y, x, (stats.minRange ?? 1) / 5.0);
        setChannel(16, y, x, (stats.maxRange ?? 1) / 5.0);
        setChannel(17, y, x, isCommanderUnit(state, u) ? 1.0 : 0.0);
        // V14 新增通道：本回合是否已移动 + 有效攻击力归一化。
        // 24 通道（v13 语义）时这些通道不存在，保持历史张量逐位不变。
        if (C > SPATIAL_TENSOR_CHANNELS_LEGACY) {
            setChannel(24, y, x, u.hasMoved ? 1.0 : 0.0);
            setChannel(25, y, x, Math.max(0, Math.min(1.0, stats.attack / 200.0)));
        }
        // V19 新增通道：己方兵种身份、剩余移动力、有效物防。
        if (writeV19Channels) {
            setChannel(27, y, x, unitClassIndex(u.unitClass) / ACTION_UNIT_CLASS_DIM);
            // 剩余移动力：本回合已经移动过就是 0，否则是当前有效移动力。
            setChannel(32, y, x, u.hasMoved ? 0.0 : Math.max(0, Math.min(1.0, (stats.move ?? 0) / 8.0)));
            setChannel(33, y, x, (stats.physicalDefense ?? 0) / 60.0);
        }
    }

    // 敌方单位: Ch 18..22
    for (const u of enemyUnits) {
        const x = u.pos.x;
        const y = u.pos.y;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;

        setChannel(18, y, x, 1.0); // 敌方存在
        setChannel(19, y, x, Math.max(0, Math.min(1.0, u.hp / Math.max(1, u.maxHp)))); // HP
        setChannel(20, y, x, categorizeUnitClass(u.unitClass) / 7.0); // 兵种类别
        setChannel(22, y, x, isCommanderUnit(state, u) ? 1.0 : 0.0);

        // 简易攻击射程覆盖 (Threat Zone) -> 标记在 Ch 21
        const stats = getEffectiveStats(u);
        const maxR = stats.maxRange ?? 1;
        const minR = stats.minRange ?? 1;
        const move = u.hasMoved ? 0 : (stats.move ?? 4);
        const threatDist = move + maxR;

        // 在威胁半径内的格子涂布威胁信号
        for (let dy = -threatDist; dy <= threatDist; dy += 1) {
            for (let dx = -threatDist; dx <= threatDist; dx += 1) {
                const tx = x + dx;
                const ty = y + dy;
                const dist = Math.abs(dx) + Math.abs(dy);
                if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && dist <= threatDist) {
                    setChannel(21, ty, tx, 1.0);
                }
            }
        }

        if (writeV19Channels) {
            // V19：敌军身份与战斗数值。这一组是「史莱姆/水元素交换位置后输入完全相同」的修复：
            // slime 物防 40 / 魔防 −10，water_elemental 的物魔防不同，因此两者不再碰撞。
            setChannel(26, y, x, unitClassIndex(u.unitClass) / ACTION_UNIT_CLASS_DIM);
            setChannel(28, y, x, (stats.physicalDefense ?? 0) / 60.0);
            setChannel(29, y, x, (stats.magicDefense ?? 0) / 60.0);
            setChannel(30, y, x, Math.max(0, Math.min(1.0, (stats.attack ?? 0) / 200.0)));

            // V19：**下一敌方行动阶段**威胁。这里显式忽略当前的 hasMoved/hasActed：
            // 敌军下一次开始回合时这些标记会被重置，因此「现在能不能动」不能用来代表
            // 「下回合会不会打到我」。这是 V18 复核 §2.4 第二个反例的直接修复。
            // 仍然只是半径上界：不含地形路径、最小射程空洞与多单位相互作用。
            const nextTurnThreatDist = (stats.move ?? 4) + maxR;
            for (let dy = -nextTurnThreatDist; dy <= nextTurnThreatDist; dy += 1) {
                for (let dx = -nextTurnThreatDist; dx <= nextTurnThreatDist; dx += 1) {
                    const tx = x + dx;
                    const ty = y + dy;
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && dist <= nextTurnThreatDist) {
                        setChannel(31, ty, tx, 1.0);
                    }
                }
            }
        }
    }

    // 3. 全局标量特征 (V2: 20 维, V1: 16 维)
    const dim = version === 'v1' ? GLOBAL_FEATURE_DIM_V1 : GLOBAL_FEATURE_DIM_V2;
    const globals = new Float32Array(dim);
    const enemies = state.players.filter(p => p.id !== playerId && areEnemyPlayers(state, playerId, p.id));
    const ownPlayer = state.players.find(p => p.id === playerId);
    const ownGold = ownPlayer?.gold ?? 0;
    const bestEnemyGold = enemies.length ? Math.max(...enemies.map(p => p.gold)) : 0;
    const ownArmy = calculateArmyValue(state, playerId);
    const enemyArmy = enemies.length ? Math.max(...enemies.map(p => calculateArmyValue(state, p.id))) : 0;

    const allTiles = state.map.tiles.flat();
    const townCount = (filterFn: (t: import('../terrain').Tile) => boolean) =>
        allTiles.filter(t => {
            const k = getTileTerrainKey(t);
            return (k === 'town' || k === 'castle') && filterFn(t);
        }).length;

    const ownTowns = townCount(t => t.ownerId !== null && getAllianceId(state, t.ownerId) === alliance);
    const enemyTowns = townCount(t => t.ownerId !== null && areEnemyPlayers(state, playerId, t.ownerId));
    const neutralTowns = townCount(t => t.ownerId === null);

    globals[0] = state.turn / 50.0;
    globals[1] = ownGold / 1000.0;
    globals[2] = bestEnemyGold / 1000.0;
    globals[3] = (ownGold - bestEnemyGold) / 1000.0;
    globals[4] = ownUnits.length / 10.0;
    globals[5] = enemyUnits.length / 10.0;
    globals[6] = ownArmy / 1000.0;
    globals[7] = enemyArmy / 1000.0;
    globals[8] = ownTowns / 10.0;
    globals[9] = enemyTowns / 10.0;
    globals[10] = neutralTowns / 10.0;
    globals[11] = ownUnits.some(u => isCommanderUnit(state, u)) ? 1.0 : 0.0;
    globals[12] = enemyUnits.some(u => isCommanderUnit(state, u)) ? 1.0 : 0.0;
    globals[13] = state.pendingUnitId ? 1.0 : 0.0;
    globals[14] = mapW / 20.0;
    globals[15] = mapH / 20.0;

    if (version === 'v2') {
        const commCost = getUnitCost(state, playerId, 'commander');
        const deathCount = ownPlayer?.commanderDeathCount ?? 0;
        globals[16] = Math.min(1.0, deathCount / 5.0);
        globals[17] = commCost !== null ? Math.min(1.0, commCost / 1000.0) : 0.0;
        globals[18] = commCost !== null ? Math.min(1.0, Math.max(0, commCost - ownGold) / 1000.0) : 0.0;

        let unoccupiedCastles = 0;
        for (let y = 0; y < mapH; y += 1) {
            for (let x = 0; x < mapW; x += 1) {
                const tile = state.map.tiles[y]?.[x];
                if (tile && getTileTerrainKey(tile) === 'castle') {
                    if (tile.ownerId !== null && getAllianceId(state, tile.ownerId) === alliance) {
                        const isOccupied = state.units.some(u => u.hp > 0 && u.pos.x === x && u.pos.y === y);
                        if (!isOccupied) {
                            unoccupiedCastles += 1;
                        }
                    }
                }
            }
        }
        globals[19] = Math.min(1.0, unoccupiedCastles / 5.0);
    }

    return {
        spatialTensor: tensor,
        globalFeatures: globals,
        mapWidth: mapW,
        mapHeight: mapH,
        subjectPlayerId: playerId,
        version,
        channels: C,
    };
}

/**
 * 提取候选动作的空间落点坐标与战术语义向量 (V2: 32 维, V1: 24 维)。
 *
 * V15/T15-02：`variant` 决定攻击语义槽 14..23 的计算口径，必须由权重声明的
 * `encoderSchemaId` 显式分派（见 actionSemanticsVariantForSchema），
 * 不允许因为「维度是 53」就默认使用当前语义。
 */
export function encodeCandidateActionSpatial(
    state: GameState,
    playerId: number,
    action: Action,
    version: 'v1' | 'v2' = 'v2',
    variant: ActionSemanticsVariant = 'v15_current'
): SpatialActionFeatures {
    const unitsMap = new Map(state.units.map(u => [u.id, { id: u.id, x: u.pos.x, y: u.pos.y }]));
    const sem = getActionSemantics(action, unitsMap);

    const semDim = version === 'v1' ? ACTION_SEMANTIC_DIM_V1 : ACTION_SEMANTIC_DIM_V3;
    const semantics = new Float32Array(semDim);

    // 0..13: ActionType One-hot
    const typeIdx = ACTION_TYPE_LIST.indexOf(action.type as any);
    if (typeIdx !== -1) semantics[typeIdx] = 1.0;

    let actorCoord: Position | null = sem.actorPos;
    let landingCoord: Position | null = sem.landingPos;
    let targetCoord: Position | null = sem.targetPos;

    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        actorCoord = action.castlePos;
        landingCoord = (action.type === 'recruit_and_deploy') ? action.to : action.castlePos;
        // V14/T14-03：招募候选用 one-hot 区分兵种。历史实现只给 7 类粗分类，
        // 同一分类内的兵种在输入上不可区分（T14-04 记忆诊断的 8 个失败状态全部属于此类）。
        encodeUnitClassOneHot(semantics, action.unitClass);
    }

    // 战术攻防预测计算 (若为攻击动作)
    if (action.type === 'attack') {
        const attacker = state.units.find(u => u.id === action.attackerId);
        const defender = state.units.find(u => u.id === action.targetId);
        if (attacker && defender) {
            const estDmg = calculateDamage(state, attacker.id, defender.id);
            const estCounter = estimateCounterDamageForVariant(
                variant, state, attacker.id, defender.id, estDmg,
            );

            semantics[14] = Math.min(1.0, estDmg / 100.0);
            semantics[15] = Math.min(1.0, estCounter / 100.0);
            semantics[16] = estDmg >= defender.hp ? 1.0 : 0.0; // 斩杀
            semantics[17] = estCounter >= attacker.hp ? 1.0 : 0.0; // 自杀风险
            semantics[18] = isCommanderUnit(state, defender) ? 1.0 : 0.0; // 目标为指挥官
            semantics[22] = isCommanderUnit(state, attacker) ? 1.0 : 0.0;
            semantics[23] = attacker.hp / Math.max(1, attacker.maxHp);
        }
    } else if (action.type === 'capture') {
        semantics[19] = 1.0; // 占领城镇
    } else if (action.type === 'destroy_town') {
        semantics[19] = 0.5;
    }

    // 目标地形防御加成
    if (targetCoord && targetCoord.y >= 0 && targetCoord.y < state.map.height &&
        targetCoord.x >= 0 && targetCoord.x < state.map.width) {
        const tile = state.map.tiles[targetCoord.y]?.[targetCoord.x];
        if (tile) {
            const cfg = getTileTerrainConfig(tile);
            semantics[20] = (cfg?.defenseBonus ?? 0) / 40.0;
        }
    }

    // 移动距离
    if (actorCoord && landingCoord) {
        const dist = Math.abs(actorCoord.x - landingCoord.x) + Math.abs(actorCoord.y - landingCoord.y);
        semantics[21] = Math.min(1.0, dist / 10.0);
    }

    // V2 候选动作语义扩展 (24..31 维)
    if (version === 'v2') {
        const ownPlayer = state.players.find(p => p.id === playerId);
        const ownGold = ownPlayer?.gold ?? 0;
        const isRecruit = action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy';
        const isCommRecruit = isRecruit && action.unitClass === 'commander';
        const cost = isRecruit ? (getUnitCost(state, playerId, action.unitClass) ?? 0) : 0;
        const commAlive = state.units.some(u => u.hp > 0 && u.ownerId === playerId && isCommanderUnit(state, u));

        // 24: 招募兵种类别 (1..7 / 7.0)
        semantics[24] = isRecruit ? categorizeUnitClass(action.unitClass) / 7.0 : 0.0;
        // 25: 是否为指挥官招募
        semantics[25] = isCommRecruit ? 1.0 : 0.0;
        // 26: 动作花费 / 1000
        semantics[26] = Math.min(1.0, cost / 1000.0);
        // 27: 动作后剩余金币 / 1000
        semantics[27] = Math.max(0.0, (ownGold - cost) / 1000.0);
        // 28: 己方指挥官当前是否存活
        semantics[28] = commAlive ? 1.0 : 0.0;
        // 29: 指挥官保留等级
        semantics[29] = isCommRecruit ? (ownPlayer?.commanderReserveLevel ?? 0) / 3.0 : 0.0;
        // 30: 指挥官保留经验
        semantics[30] = isCommRecruit ? (ownPlayer?.commanderReserveExp ?? 0) / 100.0 : 0.0;
        // 31: 是否处于部署阶段或 pending 处理
        semantics[31] = (action.type === 'recruit_and_deploy' || Boolean(state.pendingUnitId)) ? 1.0 : 0.0;
    }

    return {
        actorCoord,
        landingCoord,
        targetCoord,
        semantics
    };
}

/**
 * 按 schema 批量编码一个状态的全部候选。
 *
 * 旧 schema 仅投影既有语义维度，53 维路径逐位不变。Path-3 才构造一次共享路径器，
 * 将三个规则事实追加到槽 53..55；这里不读取教师分数、搜索结果或 H0 输出。
 */
export function encodeCandidateActionsSpatialForSchema(
    state: GameState,
    playerId: number,
    actions: readonly Action[],
    version: 'v1' | 'v2',
    schemaId: EncoderSchemaId,
): SpatialActionFeatures[] {
    const variant = actionSemanticsVariantForSchema(schemaId);
    const semanticDim = ENCODER_SCHEMA_SEMANTIC_DIM[schemaId];
    const base = actions.map((action) => encodeCandidateActionSpatial(state, playerId, action, version, variant));
    if (schemaId !== ENCODER_SCHEMA_ID_V19_PATH3) {
        return base.map((features) => ({
            ...features,
            semantics: features.semantics.length === semanticDim
                ? features.semantics
                : Float32Array.from(features.semantics).slice(0, semanticDim),
        }));
    }
    if (version !== 'v2') throw new Error('Path-3 schema 只支持 v2 编码');
    const relations = encodePathRelations(state, playerId, actions);
    return base.map((features, index) => {
        const semantics = new Float32Array(ACTION_SEMANTIC_DIM_PATH3);
        semantics.set(features.semantics);
        const relation = relations[index];
        semantics[53] = relation.reachableCapturableBuilding;
        semantics[54] = relation.normalizedNearestCapturableCost;
        semantics[55] = relation.normalizedCapturableCostReduction;
        return { ...features, semantics };
    });
}
