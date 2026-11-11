/**
 * V16/T16-00：五图验收协议的可执行实例化（owner：T16-00/T16-01）。
 *
 * 本文件把 `v16/V16_EVALUATION_PROTOCOL.md` 的**数值**写成代码常量，并派生
 * DEV20 / RECHECK40 / CONFIRM20 / PREFLIGHT 四个面板的 root block。
 *
 * 硬约束（协议 §1/§2/§3）：
 * - 五图固定顺序 m=0..4；每图 seed 公式 `base + 10*m + s`；每 seed 跑模型座位 0、1 各一次。
 * - **只交换策略座位**，不改地图拥有者与开局结算顺序。
 * - 普通 SD；初始金币 300、单位上限 30、等级上限 3；正常首次回合结算
 *   （`initializationPolicyId = sd-first-turn-start-v1`）。
 * - 学生 caps：12,000 原子动作 / 300 秒墙钟；成本预演（preflight）不得混进正式成绩。
 * - 训练 root 使用 2609300000 起、训练 val 使用 2609400000 起（协议 §2）；本文件只负责
 *   对局面板，训练命名空间在数据工具里单独冻结。
 *
 * 与 V15 的关系：本文件是**新增**文件。V15 的 `v15/tools/eval_v15_*` 一行未改，
 * 历史面板与报告的口径保持可复算。V16 面板使用本文件。
 */

/** 五张双人图，顺序即 m=0..4（协议 §1）。 */
export const V16_MAPS: readonly string[] = [
    '(2) Duel.aem',
    '(2) Icy Paths.aem',
    '(2) Liberty Port.aem',
    '(2) Mourningstar.aem',
    '(2) Crossed swords.aem',
];

/** 默认 runId；新 run 必须显式传 --run-id，本值只是缺省。 */
export const V16_RUN_ID_DEFAULT = 'v16_20260926_core';

/** 初始化策略 id：首次 startTurnForPlayer 已执行（协议 §4）。 */
export const V16_INITIALIZATION_POLICY_ID = 'sd-first-turn-start-v1';

/** 动作过滤合同 id（协议 §1：双方过滤 surrender，保留其他合法动作）。 */
export const V16_ACTION_FILTER_ID = 'filter-surrender-v1';

/** H0 的 RNG 合同 id（协议 §1，沿用 V14/V15 的逐座位随机流派生）。 */
export const V16_RNG_CONTRACT_ID = 'heuristic-seatstream-v1';

/** SD 训练计划文件与地图解包目录（与 V14/V15 相同，保证读的是同一份地图字节）。 */
export const V16_UNPACK_DIR = 'APK/_analysis/unpack';
export const V16_SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';

/** 学生 caps（协议 §3）。成本预演后若统一升到 900 秒，必须新协议版本并重跑当前冠军。 */
export interface V16Caps {
    maxStepsAtomicActions: number;
    wallTimeoutMs: number;
    maxPlies: number | null;
}

/**
 * caps v1（协议 §3 预设值，先按它跑了成本预演）。
 *
 * 中文：保留常量以便复算「预演读数是在哪一套 caps 下得到的」。
 */
export const V16_CAPS_V1_300S: V16Caps = {
    maxStepsAtomicActions: 12000,
    wallTimeoutMs: 300000,
    maxPlies: null,
};

/**
 * caps v2（正式基线起使用，900 秒墙钟）。
 *
 * 依据（协议 §3 允许的唯一调整路径）：
 * - 成本预演（panel=preflight，5 个 H0-vs-H0 实体）中 `preflight:m4:s0` 在 300 秒墙钟处
 *   **WALL_TIMEOUT**（3770 个原子动作仍未自然终局）；
 * - DEV20 的 10 个 H0 镜像虽然全部自然结束，但最长两个分别用了 182.0s / 162.7s，
 *   距 300 秒上限只剩不到 1.7 倍余量；
 * - 两批合计 14 个镜像实体中 1 个截断 → 自然完成率 93% < 95% 门槛。
 *
 * 原子动作上限仍是 12,000（未改），只放宽墙钟保险；因为墙钟只是保险，放宽它**不会改变**
 * 那些在 300 秒内已经自然结束的对局结果，只会把「被截断」变成「跑到自然终局」。
 */
export const V16_CAPS_V2_900S: V16Caps = {
    maxStepsAtomicActions: 12000,
    wallTimeoutMs: 900000,
    maxPlies: null,
};

export const V16_DEFAULT_CAPS: V16Caps = V16_CAPS_V2_900S;

/** 学生 caps 协议版本；数值变化时必须升版本，避免新旧截断口径混用。 */
export const V16_CAPS_ID = 'v16-student-caps-12k-900s-v2';

/** 成本预演使用的 caps id（T16-01 报告里要写清楚读数是哪一套）。 */
export const V16_CAPS_ID_PREFLIGHT = 'v16-student-caps-12k-300s-v1';

/** 教师离线搜索可用独立更高的 caps，报告必须写明（协议 §3）。 */
export const V16_TEACHER_CAPS_ID = 'v16-teacher-caps-12k-900s-v1';

/** 对局面板规格。preflight 只用于成本推算，不属于任何正式基线。 */
export interface V16PanelSpec {
    panelId: string;
    label: string;
    baseSeed: number;
    seedsPerMap: number;
    /** 是否计入正式成绩。preflight 明确为 false。 */
    official: boolean;
    purpose: string;
}

export const V16_PANELS: Record<string, V16PanelSpec> = {
    dev: {
        panelId: 'dev',
        label: 'DEV20',
        baseSeed: 2609260100,
        seedsPerMap: 2,
        official: true,
        purpose: '固定开发进度条，可用于错误分析和选 checkpoint',
    },
    recheck: {
        panelId: 'recheck',
        label: 'RECHECK40',
        baseSeed: 2609260200,
        seedsPerMap: 4,
        official: true,
        purpose: '仅用于开发复核，避免只针对 DEV20 进步',
    },
    confirm: {
        panelId: 'confirm',
        label: 'CONFIRM20',
        baseSeed: 2609260300,
        seedsPerMap: 2,
        official: true,
        purpose: '最终独立验收；冻结模型后才执行，选定 SHA 前不得运行',
    },
    preflight: {
        panelId: 'preflight',
        label: 'PREFLIGHT',
        baseSeed: 2609260900,
        seedsPerMap: 1,
        official: false,
        purpose: '成本预演（协议 §3 / 任务书 §11）。不得并入正式成绩。',
    },
};

/** 逐块 wave 复核面板命名空间（协议 §2 独立集纪律第 1 条）。 */
export function waveRecheckBaseSeedV16(wave: number): number {
    if (!Number.isInteger(wave) || wave < 1) {
        throw new Error(`[T16-00] waveRecheckBaseSeedV16: wave 必须是 >=1 的整数，实际 ${wave}。`);
    }
    return 2609270200 + 100 * wave;
}

/** 失败后新确认集的 seed 空间（协议 §2 独立集纪律第 3 条）。 */
export function nextConfirmBaseSeedV16(attempt: number): number {
    if (!Number.isInteger(attempt) || attempt < 1) {
        throw new Error(`[T16-00] nextConfirmBaseSeedV16: attempt 必须是 >=1 的整数，实际 ${attempt}。`);
    }
    return 2609500000 + 100 * attempt;
}

/** 训练普通 root 命名空间（协议 §2）；本文件只冻结常量，采集工具负责使用。 */
export const V16_TRAIN_ROOT_BASE_SEED = 2609300000;
export const V16_TRAIN_VAL_BASE_SEED = 2609400000;
/** 合成课程与派生 root 的独立命名空间。 */
export const V16_CURRICULUM_BASE_SEED = 2609600000;

/** 一个 root block（= 一个地图 + 一个 seed + 该 seed 下的两个候选座位）。 */
export interface V16Block {
    blockId: string;
    panelId: string;
    purpose: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    playerCount: number;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    candidateSeats: number[];
    seatAlliances: Record<string, number>;
}

/** SD 派生场景 id：与 `tools/skirmish_dataset_export.ts#parseSdPlanScenarioId` 同一格式。 */
export function scenarioIdOfMapV16(mapName: string): string {
    return `SDPLAN:sd-normal:${mapName}`;
}

/**
 * 生成某面板的全部 root block。
 *
 * 中文：seed = base + 10*m + s，so 同一地图的 seed 落在长度为 10 的窗口内，
 * 不同地图窗口互不重叠（s 最多 3，留足 4 个 seed 的 RECHECK40）。
 */
export function blocksForPanelV16(panelId: string): V16Block[] {
    const spec = V16_PANELS[panelId];
    if (!spec) {
        throw new Error(`[T16-00] 未知面板 '${panelId}'；可用：${Object.keys(V16_PANELS).join(', ')}。`);
    }
    const blocks: V16Block[] = [];
    for (let m = 0; m < V16_MAPS.length; m += 1) {
        const mapName = V16_MAPS[m];
        for (let s = 0; s < spec.seedsPerMap; s += 1) {
            const rootSeed = spec.baseSeed + 10 * m + s;
            const scenarioId = scenarioIdOfMapV16(mapName);
            blocks.push({
                blockId: `${panelId}:m${m}:s${s}`,
                panelId,
                purpose: spec.label,
                mapIndex: m,
                mapName,
                scenarioId,
                // 五图全部是双人图（用户在 V16 README 中确认）。
                playerCount: 2,
                rootSeed,
                episodeIndex: s,
                rootFamilyId: `${scenarioId}#${rootSeed}#${s}`,
                candidateSeats: [0, 1],
                // 中文：普通 SD 无联盟合并；真实取值由 playOne 从终局状态写入记录，
                // 这里只是缺省表，runner 优先使用记录里的 `seatAlliances`。
                seatAlliances: { '0': 0, '1': 1 },
            });
        }
    }
    return blocks;
}

/** 面板规模自检：DEV20 = 20 局候选；RECHECK40 = 40；CONFIRM20 = 20；PREFLIGHT = 10。 */
export function expectedCandidateGamesV16(panelId: string): number {
    const spec = V16_PANELS[panelId];
    if (!spec) throw new Error(`[T16-00] 未知面板 '${panelId}'。`);
    return V16_MAPS.length * spec.seedsPerMap * 2;
}

/** 面板的镜像实体数：每 (地图, seed) 只跑一次 H0 对 H0。 */
export function expectedMirrorEntitiesV16(panelId: string): number {
    const spec = V16_PANELS[panelId];
    if (!spec) throw new Error(`[T16-00] 未知面板 '${panelId}'。`);
    return V16_MAPS.length * spec.seedsPerMap;
}
