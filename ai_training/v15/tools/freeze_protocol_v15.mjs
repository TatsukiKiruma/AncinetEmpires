/**
 * V15/T15-00：把 `v15/V15_EXPERIMENT_PROTOCOL.md` 实例化为可复算的冻结配置。
 *
 * 职责（owner A：协调与评测）：
 *   1. 生成 `T15-00/protocol.json`：master seeds、命名空间派生、训练预算、全部 caps、
 *      离线选择/确认门槛、对局 ID 与缓存键字段表、统计定义、产物路径；
 *   2. 生成 `T15-00/root_manifests/*.json`：开发面板 / 成本预检 / 数据采集 / 学生确认 /
 *      教师确认五份确定性 root 清单，每份含逐 block 派生值；
 *   3. 生成 `T15-00/prior_evidence.json`：引用审核原始 JSON 与真实字节 SHA，
 *      区分「可复用的测量」与「必须重跑的受影响接口」。
 *
 * 硬约束：
 *   - 纯 Node 实现，**不 spawn 任何子进程**（本机沙箱拒绝 Node 的 child_process.spawn*）；
 *     SHA 一律用 `node:crypto` 对原始字节计算；读文件只用 `node:fs`。
 *   - 本工具不改写任何仓库源码、`v14/**`、`src/**`、`python/**`，只写 `v15/out/<runId>/T15-00/`。
 *   - 已存在的同名输出文件默认拒绝覆盖（任务书 §0：输出存在时拒绝覆盖）。
 *
 * 用法：
 *   node v15/tools/freeze_protocol_v15.mjs --run-id v15_20260925_core --repo-root .
 *   （可选 --allow-overwrite 仅在显式恢复同一身份运行时使用）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ============================================================ CLI

function parseArgs(argv) {
    const out = { runId: null, repoRoot: '.', allowOverwrite: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--run-id') out.runId = argv[++i];
        else if (a === '--repo-root') out.repoRoot = argv[++i];
        else if (a === '--allow-overwrite') out.allowOverwrite = true;
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!out.runId) {
        throw new Error('usage: node v15/tools/freeze_protocol_v15.mjs --run-id <runId> [--repo-root <dir>] [--allow-overwrite]');
    }
    return out;
}

const args = parseArgs(process.argv.slice(2));
const REPO_ROOT = path.resolve(args.repoRoot);
const RUN_ID = args.runId;
const TASK_DIR = path.join(REPO_ROOT, 'v15', 'out', RUN_ID, 'T15-00');
const MANIFEST_DIR = path.join(TASK_DIR, 'root_manifests');
const GENERATED_AT = new Date().toISOString();

// ============================================================ 文件工具（不 spawn）

function sha256Bytes(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 对大文件走流式读取，避免把 GB 级 JSONL 读进内存；仍是对原始字节求 SHA。 */
function sha256File(abs) {
    let st;
    try {
        st = fs.statSync(abs);
    } catch {
        return { exists: false, bytes: null, sha256: null };
    }
    if (!st.isFile()) return { exists: false, bytes: null, sha256: null };
    if (st.size <= 8 * 1024 * 1024) {
        return { exists: true, bytes: st.size, sha256: sha256Bytes(fs.readFileSync(abs)) };
    }
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(abs, 'r');
    const buf = Buffer.allocUnsafe(1 << 22);
    try {
        let n = 0;
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
    } finally {
        fs.closeSync(fd);
    }
    return { exists: true, bytes: st.size, sha256: hash.digest('hex') };
}

/** 统一的「引用文件」描述块：路径 + 存在性 + 字节数 + 真实字节 SHA。 */
function describe(relPath, note) {
    const rel = relPath.split(path.sep).join('/');
    const info = sha256File(path.join(REPO_ROOT, rel));
    const out = { path: rel, exists: info.exists, bytes: info.bytes, sha256: info.sha256 };
    if (note) out.note = note;
    return out;
}

function readJsonIfExists(abs) {
    try {
        return JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
        return null;
    }
}

function readJsonlIfExists(abs, maxBytes = 64 * 1024 * 1024) {
    let st;
    try {
        st = fs.statSync(abs);
    } catch {
        return null;
    }
    if (!st.isFile() || st.size > maxBytes) return null;
    const rows = [];
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
            rows.push(JSON.parse(line));
        } catch {
            /* 解析失败的行直接跳过，由 exists/sha 字段负责说明文件真实存在 */
        }
    }
    return rows;
}

function writeJsonNoClobber(abs, value) {
    if (fs.existsSync(abs) && !args.allowOverwrite) {
        throw new Error(`refuse to overwrite existing file: ${path.relative(REPO_ROOT, abs)}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ============================================================ 协议常量（全部来自协议/任务书原文）

const PROTOCOL_DOC = 'v15/V15_EXPERIMENT_PROTOCOL.md';
const TASKBOOK_DOC = 'v15/V15_AGENT_TASKBOOK.md';
const CONTRACT_DOC = 'v15/V15_DATA_CONTRACT.md';
const AUDIT_DOC = 'v14/V14B_AUDIT_REVIEW.md';

/** 协议 §5.1：开发面板固定两张已有地图。 */
const DEV_MAPS = [
    { mapName: '(2) Duel.aem', scenarioId: 'SDPLAN:sd-normal:(2) Duel.aem', playerCount: 2 },
    { mapName: '(3) Frozen fields.aem', scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem', playerCount: 3 },
];

/** 地图 → 玩家数。仅使用 V14 采集/对战已实证可加载的 assets/maps 地图。 */
const MAP_PLAYER_COUNT = {
    '(2) Duel.aem': 2,
    '(2) Icy Paths.aem': 2,
    '(2) Crossed swords.aem': 2,
    '(3) Frozen fields.aem': 3,
    '(3) Midway.aem': 3,
    '(3) Glu.aem': 3,
    '(3) classic 2.aem': 3,
    '(4) Crossroads.aem': 4,
    '(4) Shadowlands.aem': 4,
};

function scenarioIdOf(mapName) {
    return `SDPLAN:sd-normal:${mapName}`;
}

/** 标准 sd-normal 场景下座位与联盟一一对应；非 playerId=allianceId 的夹具由 T15-01 单独覆盖。 */
function seatAlliancesFor(playerCount) {
    const out = {};
    for (let i = 0; i < playerCount; i += 1) out[String(i)] = i;
    return out;
}

// ---- 协议 §3.1 C2 基线 ----
const C2 = {
    model: 'spatial-resnet-v2（2 blocks，global policy pool 关闭）',
    initSeeds: [42, 1337, 2026],
    dataOrderSeed: 314159,
    batchSize: 32,
    totalUpdatesPerSeed: 3000,
    exposuresPerSeed: 3000 * 32, // 96,000
    loss: 'hard CE；valueWeight=0；无类别加权',
    optimizer: 'AdamW；weightDecay=1e-4',
    lr: { lrMin: 1e-5, lrMax: 1e-3, scheduleUnit: 'update', formula: 'lr_u = lrMin + (lrMax - lrMin) * (1 + cos(pi * u / (U - 1))) / 2，u = 0..U-1；U=1 时取 lrMax' },
    validateEveryUpdates: 250,
    extraCheckpointsAtUpdates: [500, 1500, 3000],
    bestRule: '干净 val top-1 最大；并列取 CE 更小；再并列取更早 update',
    mainEndpoint: 'final@3000',
};

// ---- 协议 §3.2 D0/D1/D2 ----
const D_GROUP = {
    groups: ['D0', 'D1', 'D2'],
    batchSize: 32,
    extraUpdatesPerRun: 1500,
    exposuresPerRun: 1500 * 32, // 48,000
    lr: { lrMin: 1e-5, lrMax: 1e-4, scheduleUnit: 'update' },
    weightDecay: 1e-4,
    batchComposition: {
        D0: '位置 1-16 共同旧池序列 + 位置 17-32 旧池控制序列（旧池曝光 48000 / 新池曝光 0）',
        D1: '位置 1-16 共同旧池序列 + 位置 17-32 D1 新池序列（旧池 24000 / 新池 24000）',
        D2: '位置 1-16 共同旧池序列 + 位置 17-32 D2 新池序列（旧池 24000 / 新池 24000）',
    },
    sharedOldPoolInvariant: '共同旧池前 16 个位置在三组相同 update 的 sampleId 必须一致',
    validateEveryUpdates: 250,
    mainEndpoint: 'final@1500',
    initializationRule: '同 seed 的三组初始化文件字节 SHA 完全相同，来自对应 C2 final；加载权重后统一重建 optimizer/scheduler',
    exposureFrequencyRule: '各组每个唯一 key 的循环曝光次数相差不超过 1；sampler 序列先生成并冻结',
};

const D_GROUP_RUN_COUNT = C2.initSeeds.length * D_GROUP.groups.length; // 9
const TOTAL_UPDATES = C2.initSeeds.length * C2.totalUpdatesPerSeed + D_GROUP_RUN_COUNT * D_GROUP.extraUpdatesPerRun;
const TOTAL_EXPOSURES = C2.initSeeds.length * C2.exposuresPerSeed + D_GROUP_RUN_COUNT * D_GROUP.exposuresPerRun;

// ---- 协议 §2.1 / §5.1 / §4.2 caps ----
const CAPS = {
    baseCollection: {
        source: '协议 §2.1',
        stepCapAtomicActions: 12000,
        wallMsPerRoot: 150000,
        decisionsPerRootCap: 220,
        exhaustedTrajectoryRule: '截断轨迹中的精确状态可用于 policy 标签，终局/value 标签为空',
    },
    daggerCollection: {
        source: '协议 §2.2（「墙钟/原子步上限与基础采集相同」）',
        stepCapAtomicActions: 12000,
        wallMsPerRoot: 150000,
        subjectSeatOnly: true,
    },
    match: {
        source: '协议 §5.1',
        maxStepsAtomicActions: 12000,
        wallTimeoutMs: 300000,
        maxPlies: null,
        maxPliesNote: '不沿用含义不明的 maxPlies；若启用「真实玩家阶段上限」必须先实现计数并在成本预检后冻结',
        eliminationRule: '候选已被淘汰但整局未结束时继续主协议；个人淘汰只作辅助结果',
    },
    counterfactual: {
        source: '协议 §4.2',
        maxEngineTransitionsPerBranchPerReplicate: 256,
        wallMsPerBranch: 30000,
        continuationSeeds: 3,
        horizonIncompleteLabel: 'HORIZON_INCOMPLETE',
        plannedTransitionCeiling: 32 * 8 * 3 * 256, // 196,608
    },
};

// ---- 协议 §7.1 选择门槛（全部数值条件） ----
const SELECTION_RULE = {
    source: '协议 §7.1',
    maxSelectedFinals: 1,
    correctnessGates: { errors: 0, illegalActions: 0, undeclaredFallback: 0 },
    groupLevelConditions: {
        daggerCandidateOverD0: { appliesTo: ['D1', 'D2'], metric: '开发差值点估计', requiredPositiveOver: 'D0', minInitializations: '2/3' },
        d0OverC2: { appliesTo: ['D0'], metric: '开发差值点估计', requiredPositiveOver: 'C2', minInitializations: '2/3' },
        allGroups: { metric: '三 seed 平均相对 C2 的全计划差值下界', requirement: '> 0' },
        completionRates: { candidateNaturalCompletion: 0.9, completePairing: 0.9 },
        fixtureRegression: '规则关键夹具无已证明退步',
    },
    groupRanking: [
        '三 seed 平均相对 C2 全计划下界降序',
        '三 seed 平均干净 val CE 升序',
        '固定组顺序 D0、D1、D2',
    ],
    seedSelectionWithinGroup: {
        order: ['相对 C2 的完整配对差值降序', 'val CE 升序', 'seed 数值升序'],
        pick: '中间一名',
        extraRequirement: '该 seed 自身的相对 C2 全计划差值下界也必须为正',
    },
    failureOutcome: ['NO_PROMOTION', 'INCONCLUSIVE'],
    forbidden: ['临时换 best', '组合启发式接管', '调整筛选阈值以触发确认'],
};

// ---- 协议 §7.2 确认门槛 ----
const CONFIRMATION_RULE = {
    source: '协议 §7.2',
    perMapBlocks: 16,
    mapCount: 2,
    totalBlocks: 32,
    candidateSeatsPerBlock: DEV_MAPS.map((m) => m.playerCount),
    totalCandidateSeats: 16 * 2 + 16 * 3, // 80
    overC2: {
        conservativeLowerBound: '> 0（95% 下界）',
        naturalCompletePointEstimate: '同向',
        ciMethod: '对每 root 的 lower 值聚类 bootstrap，报告其 2.5% 分位作为保守统计下界',
    },
    overH0Qualification: {
        requiresSamePassOverH0: true,
        candidateNaturalCompletionBySeat: 0.95,
        mirrorNaturalCompletionBySeat: 0.95,
        completePairingRate: 0.95,
        errors: 0,
        illegalActions: 0,
        undeclaredFallback: 0,
        fixtureRegression: '关键规则夹具无已证实退步',
    },
    partialResultRule: '只改善 C2、仍弱于 H0：研究有效，NO_PROMOTION',
    expansionRule: '不根据中间胜负选择追加到显著；扩展确认需另行预登记新批次，旧批次完整保留',
};

// ---- 协议 §6 统计定义 ----
const STATISTICS = {
    source: '协议 §6',
    naturalOutcomeScore: { win: 1, draw: 0.5, loss: 0 },
    errorNotLoss: '对局错误不变成负局，截断不变成平局',
    intervalPerArm: { natural: '[score, score]', budgetTruncated: '[0, 1]' },
    pairedDifference: {
        formula: { lower: 'C.lower - H.upper', upper: 'C.upper - H.lower' },
        note: 'H 为同 root/座位的镜像臂',
    },
    aggregationOrder: [
        '每个 root 内等权平均座位',
        '每种人数/地图内等权平均 roots',
        '按冻结面板权重平均（主开发面板两种人数各占 1/2）',
    ],
    bootstrap: {
        iterations: 10000,
        unit: 'initial root family（整块重采样其所有座位/候选/镜像）',
        stratifiedBy: '地图',
        seedSource: 'derived:statistics',
        report: '95% 区间',
        trainingSeedRule: '训练 seeds 先分别报告，再给等权描述，不能当新增对局 roots',
    },
    mandatoryBreakdowns: [
        '候选自然完成数 / 计划候选臂数',
        '镜像实体自然完成数 / 计划镜像实体数，另列按座位展开的完成率',
        '双臂完整配对数 / 计划配对数',
        '各类截断、错误、非法动作、fallback',
        'roots、座位视角、训练 seeds、地图的各自样本量',
    ],
    truncationBounds: '对截断的全计划上下界不是置信区间：单列上下界',
};

// ---- 协议 §5.1 对局面板规模 ----
const PANEL = {
    source: '协议 §5.1',
    maps: DEV_MAPS.map((m) => m.scenarioId),
    rootBlocks: 8,
    candidateSeatsPerModel: 20,
    models: { c2: 3, dagger: 9, total: 12 },
    candidateArms: 240,
    mirrorEntities: 8,
    totalMatches: 248,
    serialWallClockCeilingHours: 20.7,
    independenceWarning: [
        '20 个座位视角不是 20 场独立镜像',
        '12 个模型对同一 root 的结果不构成新增独立 root',
        '复用镜像只复用计算，不增加统计独立样本量',
    ],
};

// ============================================================ master seed 与命名空间派生

/**
 * 派生规则（写进 protocol.json 的 derivation 字段，第三方可按此复算）：
 *   rootSeed(namespace, index) = masterSeed + namespaceOrdinal[namespace] * namespaceStride + index
 *   episodeIndex               = index
 *   rootFamilyId               = scenarioId + '#' + rootSeed + '#' + episodeIndex
 *
 * masterSeed 采用与 V14 相同的「YYYYMMDD + 2 位序号」习惯取 2026092500（V15 核心 run 日期 2026-09-25）。
 * namespaceStride = 1000，使各命名空间的种子区间互不重叠；结果形如 202609x500，
 * 后四位为 3500/4500/.../9500，不构成合法日历日，避免被误读为日期。
 */
const MASTER_SEED = 2026092500;
const NAMESPACE_STRIDE = 1000;
const NAMESPACE_ORDINAL = {
    rootGeneration: 1,
    devPanel: 2,
    costPreflight: 3,
    dataCollection: 4,
    studentConfirmation: 5,
    teacherConfirmation: 6,
    statistics: 7,
};

function namespaceBase(namespace) {
    const ordinal = NAMESPACE_ORDINAL[namespace];
    if (ordinal === undefined) throw new Error(`unknown namespace: ${namespace}`);
    return MASTER_SEED + ordinal * NAMESPACE_STRIDE;
}

function rootSeedOf(namespace, index) {
    return namespaceBase(namespace) + index;
}

/** §4.2 三个固定 continuation seeds，从 statistics 命名空间派生（避开 root 命名空间）。 */
const CONTINUATION_SEEDS = [1, 2, 3].map((i) => namespaceBase('statistics') + i);
const BOOTSTRAP_SEED = namespaceBase('statistics');

const DERIVATION = {
    masterSeed: MASTER_SEED,
    namespaceStride: NAMESPACE_STRIDE,
    formula: {
        rootSeed: 'masterSeed + namespaceOrdinal[namespace] * namespaceStride + index',
        episodeIndex: 'index',
        rootFamilyId: "scenarioId + '#' + rootSeed + '#' + episodeIndex",
        scenarioId: "mapName 前加 'SDPLAN:sd-normal:'",
    },
    namespaceOrdinal: NAMESPACE_ORDINAL,
    namespaceBaseSeed: Object.fromEntries(Object.keys(NAMESPACE_ORDINAL).map((ns) => [ns, namespaceBase(ns)])),
    indexAssignment: {
        devPanel: 'duel block b0..b3 = index 0..3；frozen block b0..b3 = index 4..7',
        costPreflight: 'duel = index 0..1；frozen = index 2..3',
        dataCollection: 'index 0..15 D1/D2 初始 16 对；16..31 D1/D2 扩容预留（最多到 32 对）；32..47 补充 train roots；48..55 补充 val roots',
        studentConfirmation: 'index 0..15 duel blocks；16..31 frozen blocks',
        teacherConfirmation: 'index 0..15 duel blocks；16..31 frozen blocks（条件分支，T15-10 未启用前不采集）',
    },
    rationale: 'masterSeed 沿用 V14 的 YYYYMMDD+序号 习惯；stride=1000 保证七个命名空间区间互不重叠；派生值不是合法日历日，避免与日期混淆。',
    verification: '第三方可按 formula 逐 block 复算 rootSeed 与 rootFamilyId，并与 root_manifests/*.json 的 roots 列表逐项比对。',
};

const MASTER_SEEDS_BLOCK = {
    masterSeed: MASTER_SEED,
    modelInitSeeds: C2.initSeeds,
    dataOrderSeed: C2.dataOrderSeed,
    bootstrapSeed: BOOTSTRAP_SEED,
    counterfactualContinuationSeeds: CONTINUATION_SEEDS,
    namespaces: Object.fromEntries(
        Object.keys(NAMESPACE_ORDINAL)
            .filter((ns) => ns !== 'statistics')
            .map((ns) => [ns, { ordinal: NAMESPACE_ORDINAL[ns], baseSeed: namespaceBase(ns) }]),
    ),
    statisticsNamespace: { ordinal: NAMESPACE_ORDINAL.statistics, baseSeed: namespaceBase('statistics') },
    independenceRule: '五个 root 命名空间 + 补充清单命名空间互不重叠；students/teacher 确认集与开发/成本/采集清单互不相交，冻结后不得用于调参（任务书 §1.6）。',
};

// ============================================================ root block 构造

function makeBlock({ blockId, purpose, namespace, index, mapName, note }) {
    const playerCount = MAP_PLAYER_COUNT[mapName];
    if (!playerCount) throw new Error(`unknown mapName: ${mapName}`);
    const scenarioId = scenarioIdOf(mapName);
    const rootSeed = rootSeedOf(namespace, index);
    const episodeIndex = index;
    const seats = [];
    for (let s = 0; s < playerCount; s += 1) seats.push(s);
    const block = {
        blockId,
        purpose,
        namespace,
        index,
        mapName,
        scenarioId,
        planId: 'sd-normal',
        playerCount,
        rootSeed,
        episodeIndex,
        rootFamilyId: `${scenarioId}#${rootSeed}#${episodeIndex}`,
        candidateSeats: seats,
        seatAlliances: seatAlliancesFor(playerCount),
        maxPlies: 1200,
    };
    if (note) block.note = note;
    return block;
}

function buildDevPanel() {
    const roots = [];
    DEV_MAPS.forEach((m, mi) => {
        for (let b = 0; b < 4; b += 1) {
            const mapKey = mi === 0 ? 'duel' : 'frozen';
            roots.push(makeBlock({
                blockId: `dev:${mapKey}:b${b}`,
                purpose: 'devPanel',
                namespace: 'devPanel',
                index: mi * 4 + b,
                mapName: m.mapName,
                note: `协议 §5.1：每图 4 个预登记新 root seed，轮换全部 ${m.playerCount} 个候选座位`,
            }));
        }
    });
    const seatPairings = roots.reduce((acc, r) => acc + r.candidateSeats.length, 0);
    return {
        roots,
        seatPairings,
        candidateArmsPerModel: seatPairings,
        plannedCandidateArms: seatPairings * PANEL.models.total,
        mirrorEntities: roots.length,
    };
}

function buildCostPreflight() {
    const roots = [];
    DEV_MAPS.forEach((m, mi) => {
        for (let b = 0; b < 2; b += 1) {
            const mapKey = mi === 0 ? 'duel' : 'frozen';
            roots.push(makeBlock({
                blockId: `pre:${mapKey}:b${b}`,
                purpose: 'costPreflight',
                namespace: 'costPreflight',
                index: mi * 2 + b,
                mapName: m.mapName,
                note: '协议 §5.1：与训练/开发/确认不相交的成本校准 roots（每图 2 个），只看自然完成与耗时',
            }));
        }
    });
    return { roots };
}

function buildDataCollection() {
    const roots = [];
    // D1/D2 初始 16 对：2p 8 对（duel 4 + icy 4），3p 8 对（frozen 4 + midway 4）
    const pairPlan = [
        { mapName: '(2) Duel.aem', count: 4, subjectSeatRotation: [0, 1] },
        { mapName: '(2) Icy Paths.aem', count: 4, subjectSeatRotation: [0, 1] },
        { mapName: '(3) Frozen fields.aem', count: 4, subjectSeatRotation: [0, 1, 2] },
        { mapName: '(3) Midway.aem', count: 4, subjectSeatRotation: [0, 1, 2] },
    ];
    let index = 0;
    const daggerPairs = [];
    for (const plan of pairPlan) {
        const key = plan.mapName.replace(/^\((\d)\) /, '').replace('.aem', '').toLowerCase().replace(/\s+/g, '');
        for (let i = 0; i < plan.count; i += 1) {
            const subjectSeat = plan.subjectSeatRotation[i % plan.subjectSeatRotation.length];
            const block = makeBlock({
                blockId: `dc:pair:${key}:${i}`,
                purpose: 'dataCollection.daggerPair',
                namespace: 'dataCollection',
                index,
                mapName: plan.mapName,
                note: '协议 §2.2：同一初始 root 采 D1（行为 H0）与 D2（行为冻结 C2-42 final）两臂，按配对 cluster 统计',
            });
            block.daggerPairId = `pair:${block.blockId}`;
            block.subjectSeat = subjectSeat;
            block.armBehaviorPolicy = { D1: 'H0', D2: 'C2-42 final@3000' };
            block.otherSeatsBehaviorPolicy = 'H0';
            daggerPairs.push(block);
            roots.push(block);
            index += 1;
        }
    }
    const expansionPlan = [
        { mapName: '(2) Duel.aem', count: 4, subjectSeatRotation: [0, 1] },
        { mapName: '(2) Icy Paths.aem', count: 4, subjectSeatRotation: [0, 1] },
        { mapName: '(3) Frozen fields.aem', count: 4, subjectSeatRotation: [0, 1, 2] },
        { mapName: '(3) Midway.aem', count: 4, subjectSeatRotation: [0, 1, 2] },
    ];
    const daggerPairsExpansion = [];
    for (const plan of expansionPlan) {
        const key = plan.mapName.replace(/^\((\d)\) /, '').replace('.aem', '').toLowerCase().replace(/\s+/g, '');
        for (let i = 0; i < plan.count; i += 1) {
            const subjectSeat = plan.subjectSeatRotation[i % plan.subjectSeatRotation.length];
            const block = makeBlock({
                blockId: `dc:pairx:${key}:${i}`,
                purpose: 'dataCollection.daggerPairExpansion',
                namespace: 'dataCollection',
                index,
                mapName: plan.mapName,
                note: '协议 §2.2：初始 16 对最多扩至 32 对的预留清单，只有初始规模不足时才启用',
            });
            block.daggerPairId = `pair:${block.blockId}`;
            block.subjectSeat = subjectSeat;
            block.armBehaviorPolicy = { D1: 'H0', D2: 'C2-42 final@3000' };
            block.otherSeatsBehaviorPolicy = 'H0';
            daggerPairsExpansion.push(block);
            roots.push(block);
            index += 1;
        }
    }
    const supplementaryTrain = [];
    const trainMaps = ['(2) Icy Paths.aem', '(3) Midway.aem', '(3) Glu.aem', '(4) Crossroads.aem'];
    for (let i = 0; i < 16; i += 1) {
        const block = makeBlock({
            blockId: `dc:sup:train:${i}`,
            purpose: 'dataCollection.supplementaryTrain',
            namespace: 'dataCollection',
            index,
            mapName: trainMaps[i % trainMaps.length],
            note: '协议 §2.1：去重/恢复后不足时按 T15-00 预排补充清单追加，最多 16 个 train roots',
        });
        supplementaryTrain.push(block);
        roots.push(block);
        index += 1;
    }
    const supplementaryVal = [];
    const valMaps = ['(2) Crossed swords.aem', '(3) classic 2.aem'];
    for (let i = 0; i < 8; i += 1) {
        const block = makeBlock({
            blockId: `dc:sup:val:${i}`,
            purpose: 'dataCollection.supplementaryVal',
            namespace: 'dataCollection',
            index,
            mapName: valMaps[i % valMaps.length],
            note: '协议 §2.1：最多 8 个 val roots；不能把 val 家族搬进 train',
        });
        supplementaryVal.push(block);
        roots.push(block);
        index += 1;
    }
    return {
        roots,
        daggerPairs,
        daggerPairsExpansion,
        supplementaryTrain,
        supplementaryVal,
        maxPairs: (daggerPairs.length + daggerPairsExpansion.length),
    };
}

function buildConfirmation(namespace, purpose) {
    const roots = [];
    DEV_MAPS.forEach((m, mi) => {
        for (let b = 0; b < 16; b += 1) {
            const mapKey = mi === 0 ? 'duel' : 'frozen';
            roots.push(makeBlock({
                blockId: `cf:${mapKey}:b${String(b).padStart(2, '0')}`,
                purpose,
                namespace,
                index: mi * 16 + b,
                mapName: m.mapName,
                note: '协议 §7.2：每图预留 16 个新初始 root blocks，全部座位轮换',
            }));
        }
    });
    const seats = roots.reduce((acc, r) => acc + r.candidateSeats.length, 0);
    return { roots, candidateSeats: seats };
}

// ============================================================ 已用 root 收集（读文件，不 spawn）

const ROOT_FAMILY_RE = /^(?:V14DAGGER:)?(SDPLAN:[^#]+)#(\d+)(?:#(-?\d+))?$/;
const WINDOW_ID_RE = /^(SDPLAN:[^#]+)#seed(\d+)#step(\d+)$/;

function createUsedRootCollector() {
    const families = new Map(); // familyId -> { sources:Set }
    const scenarioSeeds = new Map(); // `${scenarioId}#${seed}` -> { sources:Set, seeds:Set }
    const sources = [];
    const addScenarioSeed = (scenario, seed, src) => {
        if (typeof scenario !== 'string' || !Number.isFinite(seed)) return;
        const key = `${scenario}#${seed}`;
        if (!scenarioSeeds.has(key)) scenarioSeeds.set(key, new Set());
        scenarioSeeds.get(key).add(src);
    };
    /** 记录 rootFamilyId 的同时登记其 (scenarioId, seed) 组合：两种口径都要做碰撞检查。 */
    const addFamily = (id, src) => {
        if (typeof id !== 'string') return;
        const m = ROOT_FAMILY_RE.exec(id);
        if (!m) return;
        if (!families.has(id)) families.set(id, new Set());
        families.get(id).add(src);
        addScenarioSeed(m[1], Number(m[2]), src);
    };
    return { families, scenarioSeeds, sources, addFamily, addScenarioSeed };
}

/** 递归扫描 JSON 值：抓 rootFamilyId 字段、scenarioId+seed 组合、形如 family/window id 的字符串。 */
function scanJsonValue(value, jsonPath, src, collector) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
        value.forEach((v, i) => scanJsonValue(v, `${jsonPath}[${i}]`, src, collector));
        return;
    }
    if (typeof value === 'object') {
        if (typeof value.rootFamilyId === 'string') collector.addFamily(value.rootFamilyId, src);
        if (typeof value.scenarioId === 'string' && value.seed !== undefined) {
            const seed = typeof value.seed === 'number' ? value.seed : Number(value.seed);
            collector.addScenarioSeed(value.scenarioId, seed, src);
        }
        // dev_matches_manifest：{"scenarioId": "...", "seeds": "1,2,3,4"}
        if (typeof value.scenarioId === 'string' && typeof value.seeds === 'string') {
            for (const part of value.seeds.split(',')) {
                const seed = Number(part.trim());
                collector.addScenarioSeed(value.scenarioId, seed, src);
            }
        }
        for (const [k, v] of Object.entries(value)) scanJsonValue(v, `${jsonPath}.${k}`, src, collector);
        return;
    }
    if (typeof value === 'string') {
        if (ROOT_FAMILY_RE.test(value)) collector.addFamily(value, src);
        const w = WINDOW_ID_RE.exec(value);
        if (w) collector.addScenarioSeed(w[1], Number(w[2]), src);
    }
}

function collectUsedRoots() {
    const collector = createUsedRootCollector();
    const files = [];

    const scanJsonFile = (rel) => {
        const abs = path.join(REPO_ROOT, rel);
        const info = sha256File(abs);
        const entry = { path: rel, exists: info.exists, bytes: info.bytes, sha256: info.sha256, kind: 'json' };
        if (info.exists) {
            const v = readJsonIfExists(abs);
            if (v !== null) scanJsonValue(v, '$', rel, collector);
        }
        files.push(entry);
    };
    const scanJsonlFile = (rel) => {
        const abs = path.join(REPO_ROOT, rel);
        const info = sha256File(abs);
        const entry = { path: rel, exists: info.exists, bytes: info.bytes, sha256: info.sha256, kind: 'jsonl' };
        if (info.exists) {
            const rows = readJsonlIfExists(abs);
            if (rows) {
                entry.rows = rows.length;
                rows.forEach((r, i) => scanJsonValue(r, `$[${i}]`, rel, collector));
            } else {
                entry.rows = null;
                entry.note = '文件超出扫描上限或无法解析，仅记录字节 SHA';
            }
        }
        files.push(entry);
    };

    // ---- v14/out 下的 roots.jsonl / split_manifest / 清单 ----
    scanJsonlFile('v14/out/v14_20260924_t14/T14-02/raw/roots.jsonl');
    scanJsonlFile('v14/out/v14_20260924_t14/T14-02/smoke/roots.jsonl');
    scanJsonlFile('v14/out/v14_20260924_t14/T14-08/teacher_states/raw/roots.jsonl');
    scanJsonFile('v14/out/v14_20260924_t14/T14-02/split_manifest.json');
    scanJsonFile('v14/out/v14_20260924_t14/T14-08/dagger_groups_summary.json');
    scanJsonFile('v14/out/v14_20260924_t14/T14-08/group_D0_split_manifest.json');
    scanJsonFile('v14/out/v14_20260924_t14/T14-08/group_D1_split_manifest.json');
    scanJsonFile('v14/out/v14_20260924_t14/T14-08/group_D2_split_manifest.json');
    scanJsonFile('v14/out/v14_20260925_t14b/T14-04/tiny_fit_split_manifest.json');
    scanJsonFile('v14/out/v14_20260925_t14b/T14-06/matches/dev_matches_manifest.json');
    scanJsonFile('v14/out/v14_20260924_t14/T14-08/matches/dagger_matches_manifest.json');
    // ---- 开发对局与反事实窗口 ----
    for (const name of ['duel2p_c1s42', 'duel2p_c1s1337', 'duel2p_c1s2026', 'frozen3p_c1s42', 'frozen3p_c1s1337', 'frozen3p_c1s2026']) {
        scanJsonlFile(`v14/out/v14_20260925_t14b/T14-06/matches/${name}.games.jsonl`);
    }
    for (const name of ['duel2p_D0', 'duel2p_D1', 'duel2p_D2']) {
        scanJsonlFile(`v14/out/v14_20260924_t14/T14-08/matches/${name}.games.jsonl`);
    }
    scanJsonlFile('v14/out/v14_20260925_t14b/T14-06/failure_windows_duel2p.jsonl');

    // ---- 采集配置：seed 由 seedBase + 分区偏移 + episodeIndex 计算，显式展开并入已用集合 ----
    const expandConfig = (rel) => {
        const abs = path.join(REPO_ROOT, rel);
        const info = sha256File(abs);
        const entry = { path: rel, exists: info.exists, bytes: info.bytes, sha256: info.sha256, kind: 'collectionConfig' };
        const cfg = readJsonIfExists(abs);
        if (cfg) {
            const base = cfg.seedBase;
            const offsets = cfg.partitionSeedOffset || {};
            const perPartition = {};
            for (const [partition, items] of Object.entries(cfg.partitions || {})) {
                const off = Number(offsets[partition] || 0);
                perPartition[partition] = [];
                for (const it of items) {
                    const seed = base + off + Number(it.episodeIndex);
                    const scenario = scenarioIdOf(it.mapName);
                    collector.addScenarioSeed(scenario, seed, rel);
                    collector.addFamily(`${scenario}#${seed}#${it.episodeIndex}`, rel);
                    perPartition[partition].push({ mapName: it.mapName, episodeIndex: it.episodeIndex, seed });
                }
            }
            entry.expanded = perPartition;
        }
        files.push(entry);
    };
    expandConfig('v14/configs/collect_v14_roots.json');
    expandConfig('v14/configs/collect_dagger_eval_roots.json');

    return {
        sources: files,
        families: [...collector.families.keys()].sort(),
        familySourceCount: collector.families.size,
        scenarioSeedPairs: [...collector.scenarioSeeds.keys()].sort(),
        scenarioSeedCount: collector.scenarioSeeds.size,
    };
}

// ============================================================ 交集检查

function intersectionCheck(roots, used) {
    const usedFamilies = new Set(used.families);
    const usedPairs = new Set(used.scenarioSeedPairs);
    const familyHits = [];
    const pairHits = [];
    for (const r of roots) {
        if (usedFamilies.has(r.rootFamilyId)) familyHits.push(r.rootFamilyId);
        const key = `${r.scenarioId}#${r.rootSeed}`;
        if (usedPairs.has(key)) pairHits.push(key);
    }
    return {
        checked: true,
        usedRootFamilyCount: used.familySourceCount,
        usedScenarioSeedPairCount: used.scenarioSeedCount,
        candidateRootCount: roots.length,
        intersectionRootFamilyIds: [...new Set(familyHits)].sort(),
        intersectionScenarioSeedPairs: [...new Set(pairHits)].sort(),
        intersectionSize: new Set([...familyHits, ...pairHits]).size,
        method: '同时比较 (a) rootFamilyId 全等 与 (b) scenarioId+rootSeed 组合；后者即使 episodeIndex 不同也算碰撞。',
        pass: familyHits.length === 0 && pairHits.length === 0,
        sources: used.sources.filter((s) => s.exists).map((s) => ({ path: s.path, sha256: s.sha256 })),
    };
}

// ============================================================ 主流程

const usedRoots = collectUsedRoots();

const devPanel = buildDevPanel();
const costPreflight = buildCostPreflight();
const dataCollection = buildDataCollection();
const studentConfirmation = buildConfirmation('studentConfirmation', 'studentConfirmation');
const teacherConfirmation = buildConfirmation('teacherConfirmation', 'teacherConfirmation');

const MANIFEST_SPECS = [
    {
        manifestId: 'dev_panel',
        fileName: 'dev_panel_roots.json',
        purpose: '三级开发面板：三 C2 + 九 D 模型共用同一开发清单（协议 §5.1、§6）',
        protocolRef: '协议 §5.1、§7.1；任务书 §1.6',
        blocks: devPanel.roots,
        extra: {
            seatPairings: devPanel.seatPairings,
            candidateArmsPerModel: devPanel.candidateArmsPerModel,
            plannedCandidateArms: devPanel.plannedCandidateArms,
            mirrorEntities: devPanel.mirrorEntities,
            weights: { '(2) Duel.aem': 0.5, '(3) Frozen fields.aem': 0.5 },
            tuningPolicy: '冻结后不用于调参（任务书 §1.6）',
        },
    },
    {
        manifestId: 'cost_preflight',
        fileName: 'cost_preflight_roots.json',
        purpose: '成本预检：每图 2 个与训练/开发/确认不相交的 root，只测自然完成与耗时',
        protocolRef: '协议 §5.1',
        blocks: costPreflight.roots,
        extra: { capRevisionPolicy: '成本预检后允许在正式运行前统一冻结 cap 修订；保留修订理由与旧配置（任务书 §1.5）' },
    },
    {
        manifestId: 'data_collection',
        fileName: 'data_collection_roots.json',
        purpose: '正式数据采集：D1/D2 配对初始 16 对 + 扩容预留 16 对 + 基础池补充 16 train / 8 val',
        protocolRef: '协议 §2.1、§2.2',
        blocks: dataCollection.roots,
        extra: {
            daggerPairInitialCount: dataCollection.daggerPairs.length,
            daggerPairExpansionCount: dataCollection.daggerPairsExpansion.length,
            maxDaggerPairs: dataCollection.maxPairs,
            supplementaryTrainCount: dataCollection.supplementaryTrain.length,
            supplementaryValCount: dataCollection.supplementaryVal.length,
            basePoolReuse: '基础池优先复用 V14 可信原始快照/完整轨迹，按新 schema 重编码、按 L1 重标；补充清单只在去重/恢复不足时启用',
        },
    },
    {
        manifestId: 'student_confirmation',
        fileName: 'student_confirmation_roots.json',
        purpose: '学生独立确认：每图 16 个新 root blocks，共 32 blocks / 80 个候选座位',
        protocolRef: '协议 §7.2',
        blocks: studentConfirmation.roots,
        extra: {
            totalBlocks: studentConfirmation.roots.length,
            totalCandidateSeats: studentConfirmation.candidateSeats,
            preViewRule: '确认前不能查看这些 roots 的候选结果',
            trigger: '只有满足 §7.1 选择条件才消耗本清单；否则 DEFERRED 并保存机器可读判断',
        },
    },
    {
        manifestId: 'teacher_confirmation',
        fileName: 'teacher_confirmation_roots.json',
        purpose: '搜索教师专属确认（条件分支 T15-10）：与学生确认集完全分开',
        protocolRef: '协议 §5.1、§8；任务书 §11',
        blocks: teacherConfirmation.roots,
        extra: {
            totalBlocks: teacherConfirmation.roots.length,
            totalCandidateSeats: teacherConfirmation.candidateSeats,
            status: 'DEFERRED_UNTIL_T15_10',
            note: '未取得 T-label 之前不得启用；无教师强度证据时写 T-strong NOT_MEASURED/INCONCLUSIVE',
        },
    },
];

const manifestOutputs = [];
for (const spec of MANIFEST_SPECS) {
    const intersection = intersectionCheck(spec.blocks, usedRoots);
    const doc = {
        schema: 'v15_root_manifest_1',
        manifestId: spec.manifestId,
        task: 'T15-00',
        runId: RUN_ID,
        generatedAt: GENERATED_AT,
        purpose: spec.purpose,
        protocolRef: spec.protocolRef,
        derivationRef: 'protocol.json#masterSeeds.derivation',
        derivation: DERIVATION,
        rootCount: spec.blocks.length,
        roots: spec.blocks,
        usedRootIntersection: intersection,
        blockers: intersection.pass ? [] : ['与已用 root 交集非空：必须重新派生 seed 后再冻结'],
        ...spec.extra,
    };
    const abs = path.join(MANIFEST_DIR, spec.fileName);
    writeJsonNoClobber(abs, doc);
    const info = sha256File(abs);
    manifestOutputs.push({ manifestId: spec.manifestId, path: `v15/out/${RUN_ID}/T15-00/root_manifests/${spec.fileName}`, sha256: info.sha256, bytes: info.bytes, rootCount: spec.blocks.length, intersectionSize: intersection.intersectionSize });
}

const allCandidateRoots = MANIFEST_SPECS.flatMap((s) => s.blocks);
const allIntersection = intersectionCheck(allCandidateRoots, usedRoots);
const intraNamespaceCollision = (() => {
    const seen = new Map();
    const dup = [];
    for (const r of allCandidateRoots) {
        if (seen.has(r.rootFamilyId)) dup.push(r.rootFamilyId);
        seen.set(r.rootFamilyId, true);
    }
    const seedSeen = new Map();
    const seedDup = [];
    for (const r of allCandidateRoots) {
        const key = `${r.scenarioId}#${r.rootSeed}`;
        if (seedSeen.has(key)) seedDup.push(key);
        seedSeen.set(key, true);
    }
    return { duplicateRootFamilyIds: dup, duplicateScenarioSeedPairs: seedDup, pass: dup.length === 0 && seedDup.length === 0 };
})();

// ============================================================ protocol.json

const startIdentity = {
    sourceStart: describe(`v15/out/${RUN_ID}/T15-00/source_start.json`),
    environmentStart: describe(`v15/out/${RUN_ID}/T15-00/environment_start.json`),
    gitIdentityStart: describe(`v15/out/${RUN_ID}/T15-00/git_identity_start.json`),
    pythonEnvStart: describe(`v15/out/${RUN_ID}/T15-00/python_env_start.json`),
    sourceBundleDir: `v15/out/${RUN_ID}/T15-00/source_bundle`,
};

const envStartRaw = readJsonIfExists(path.join(TASK_DIR, 'environment_start.json'));
const pyEnvRaw = readJsonIfExists(path.join(TASK_DIR, 'python_env_start.json'));
const srcStartRaw = readJsonIfExists(path.join(TASK_DIR, 'source_start.json'));

const runtimeEnvironment = {
    measuredFrom: ['environment_start.json', 'python_env_start.json'],
    node: envStartRaw?.node || null,
    python: pyEnvRaw?.python || null,
    machine: pyEnvRaw?.machine || null,
    device: { torch: pyEnvRaw?.python?.torch ?? null, cuda: pyEnvRaw?.python?.cuda ?? null, cudaDeviceCount: pyEnvRaw?.python?.cudaDeviceCount ?? null, torchThreads: pyEnvRaw?.python?.torchThreads ?? null },
    dependencyHashes: envStartRaw?.tools || null,
    pythonExecutable: pyEnvRaw?.python?.executable || null,
    pythonExecutableNote: 'Anaconda 的 `python` 没有 torch；本轮统一用该绝对路径解释器。',
    runtimeSnapshotRequirement: '每次实际训练/评测启动时另存 runtime snapshot（任务书 §1、数据契约 §1）；HEAD 不能替代工作区身份。',
};

const gitIdentity = {
    head: srcStartRaw?.git?.head || null,
    branch: 'main',
    branchNote: 'source_start.json 的 branch 字段为 null（采集脚本未取到）；本轮实测 `git rev-parse --abbrev-ref HEAD` = main、HEAD 与任务书声明基线一致。',
    docDeclaredBaseline: 'c1b9ac038fad98ed97bfd72a801fd564747acd07',
    trackedChangesAtStart: srcStartRaw?.git?.trackedChanges || [],
    trackedChangeCountAtStart: srcStartRaw?.git?.trackedChangeCount ?? null,
    untrackedAtStart: srcStartRaw?.git?.untracked || [],
    liveDriftNote: 'T15-00 冻结期间实测工作区 tracked 修改由起始快照的 13 项变为 18 项（新增 src/game/abilities.ts、src/game/apk_skirmish.ts、src/game/tests/engine.test.ts、tools/apk_replay_report.ts、tsconfig.json），说明有并发执行者正在修改共享文件。按任务书 §0.1：不撤回他人修改、先协调、按实际变更适配；受影响模块的冻结在 T15-00 完成后由各自 owner 用 runtime snapshot 重新绑定，不得用本文件的起始 SHA 追认后续运行。',
};

const dataSources = {
    protocolDoc: describe(PROTOCOL_DOC),
    taskbookDoc: describe(TASKBOOK_DOC),
    dataContractDoc: describe(CONTRACT_DOC),
    auditDoc: describe(AUDIT_DOC),
    reusableBasePool: [
        describe('v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl', '9547 行；26 通道 / 20 全局 / 53 语义（历史 V14 schema）；按新 schema 重编码 + L1 重标后作为基础池候选'),
        describe('v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl', '9547 条含完整 state 快照的原始决策记录；用于精确窗口恢复（T15-01）'),
        describe('v14/out/v14_20260924_t14/T14-02/raw/roots.jsonl', '48 个已用 root（32 train + 8 val + 8 test）'),
        describe('v14/out/v14_20260924_t14/T14-02/split_manifest.json', 'train 6400 / val 1600 / test 1547；按 root 家族分组'),
        describe('v14/out/v14_20260924_t14/T14-02/raw/collection_report.json'),
        describe('v14/out/v14_20260924_t14/T14-02/dataset_contract.json'),
        describe('v14/out/v14_20260924_t14/T14-02/candidate_coverage.json'),
    ],
    collectionConfigs: [
        describe('v14/configs/collect_v14_roots.json', 'seedBase 2026092401；train 偏移 0、val 偏移 100000+500、test 偏移 200000+900'),
        describe('v14/configs/collect_dagger_eval_roots.json', 'seedBase 2026092501；D1 fresh-offline 采集（6 个 root）'),
    ],
    baselineReadings: [
        describe('v14/out/v15_rule_precheck_20260925/T14-01/rule_suite_results.json', '规则套件：54 夹具 / 145 谓词 / 0 失败（本轮基线读数，不重跑）'),
        describe('v14/out/v15_rule_precheck_20260925/T14-02/codec_roundtrip.json', 'codec 往返 74/74；非法输入拒绝 19/19'),
    ],
    trainingDataTargets: {
        maxUniqueTrainInputs: 6400,
        maxCleanValInputs: 1600,
        maxStatesPerRoot: 220,
        minUniqueTrainInputs: 2000,
        minTrainFamilies: 16,
        minCleanValInputs: 800,
        minValFamilies: 8,
        supplementaryCap: { trainRoots: 16, valRoots: 8 },
        testUsage: '旧 test 已参与历史分析，只作历史诊断集；最终确认来自单独预留的新 root 家族（协议 §2.1）',
    },
};

const gameIdRule = {
    source: '协议 §5.1、§5.2',
    format: '<runId>|<panelId>|<blockId>|<modelId>|<arm>|seat=<candidateSeat>|view=<viewedSeat>',
    modelIdFormat: '<policyId>:<tag>:<checkpointSha256 前 12 位>',
    armValues: ['CANDIDATE', 'MIRROR'],
    panelIds: ['dev', 'preflight', 'confirm'],
    examples: [
        'v15_20260925_core|dev|dev:duel:b0|c2:42:dcd648622263|CANDIDATE|seat=0|view=0',
        'v15_20260925_core|dev|dev:frozen:b2|heuristic:mirror:v1|MIRROR|seat=1|view=1',
    ],
    uniquenessRule: '无法配对、重复 gameId、身份错配必须报错；不能用 Map 覆盖重复行后少算对局。',
    listingRule: '完整 gameId 逐行写增量 JSONL；恢复时跳过身份匹配的完成项；失败项不伪造结果、不重复计数。',
};

const cacheKey = {
    source: '协议 §5.2（缓存键至少含下列字段）',
    fields: [
        { name: 'initialStateHash', meaning: '初始规则状态规范序列化摘要（含地图布局、单位、金币、规则开关）' },
        { name: 'mapHash', meaning: '地图资源字节摘要' },
        { name: 'mapLayoutHash', meaning: '规范化布局摘要' },
        { name: 'rulesHash', meaning: '生效规则集摘要（rule_config + 覆盖）' },
        { name: 'engineSourceDigest', meaning: '引擎/规则源码字节 SHA（含 src/game/engine.ts、rules.ts、env.ts）' },
        { name: 'policySourceDigest', meaning: '策略实现源码字节 SHA（heuristic_ai / shared_spatial_policy / spatial_conv_net / spatial_tensor_encoder）' },
        { name: 'rngContract', meaning: 'RNG 合同 id（如 heuristic-seatstream-v1）与逐座位流派生方式' },
        { name: 'actionFilter', meaning: '动作过滤版本（主实验统一过滤 surrender，记录过滤版本 id）' },
        { name: 'caps', meaning: '{ maxStepsAtomicActions, maxPlies, wallTimeoutMs } 实际值' },
        { name: 'runMode', meaning: 'dev | preflight | confirm（不同运行模式不共用缓存）' },
        { name: 'candidateSeat', meaning: '候选座位（对该座位应用候选策略）' },
        { name: 'viewedSeat', meaning: '结果视角座位；镜像按被测联盟从同一 winner 重算' },
        { name: 'checkpointSha256', meaning: '实际权重文件字节摘要（文件名/模型 seed 不能替代）' },
        { name: 'encoderSchemaId', meaning: '输入 schema id（如 spatial26_global20_actionSemantics53_v15）' },
    ],
    structuralRequirements: [
        '对手独立座位流、初始状态、规则和 cap 相同；学生多走几步不应推进其他座位 RNG。',
        '协议相同但受墙钟负载影响时，报告环境与截断限制。',
        '运行身份不同的缓存不复用（T15-05 验收）。',
    ],
    mirrorReuseRule: '复用镜像只复用计算，不增加统计独立样本量。',
};

const samplerAndSchedule = {
    c2: {
        dataOrderSeed: C2.dataOrderSeed,
        batchSize: C2.batchSize,
        sampler: '冻结的确定性循环 sampler：基础池不一定是 32 的倍数，最后 batch 按循环补齐并记录重复曝光；不能静默少算消费',
        coverageRule: '所有计划训练 key 在预算内至少消费一次',
        ledger: '每次真实 optimizer step 记录 updateIndex、实际 LR、batch 实际 sampleId、来源（旧/新）、policy/value mask、loss 有效分母、batchSize',
    },
    daggerSharedPlan: {
        batchSize: D_GROUP.batchSize,
        positions: { sharedOldPool: '1-16', groupSpecific: '17-32' },
        invariant: D_GROUP.sharedOldPoolInvariant,
        exposureFrequencyRule: D_GROUP.exposureFrequencyRule,
        planFrozenBeforeRun: true,
        note: '仅拼接不同大小的 JSONL 并跑相同 epoch 不满足协议 §3.2。',
    },
    lrSchedule: {
        implementationStatus: '待实现（T15-03）',
        scheduleUnit: 'update',
        c2: C2.lr,
        dagger: D_GROUP.lr,
        legacy: '保留旧 epoch 调度含义可复现，新方式显式配置（例如 scheduleUnit=update）',
        perStepLrLogging: '每次更新记录实际 LR，避免 scheduler 调用先后产生一位偏差',
    },
    stopRule: '用完总预算立即正常退出，stopReason=GLOBAL_UPDATE_LIMIT；零消费 epoch 不更新训练指标、不推进 scheduler、不触发退化保护（数据契约 §7）',
};

const artifactPaths = {
    root: `v15/out/${RUN_ID}`,
    perTask: `v15/out/${RUN_ID}/T15-00 ... T15-11`,
    runtimeSnapshots: `v15/out/${RUN_ID}/runtime_snapshots/`,
    finalReport: `v15/out/${RUN_ID}/final_report.md`,
    claimLedger: `v15/out/${RUN_ID}/claim_ledger.json`,
    packageManifest: `v15/out/${RUN_ID}/package_manifest.json`,
    nextAgentHandoff: `v15/out/${RUN_ID}/next_agent_handoff.md`,
    protocol: `v15/out/${RUN_ID}/protocol.json`,
    taskStatus: `v15/out/${RUN_ID}/task_status.json`,
    rulePrecheck: 'v14/out/v15_rule_precheck_20260925/（现有规则/codec 复跑读数，SHA 见 dataSources.baselineReadings）',
    overwritePolicy: '输出目录已存在时拒绝覆盖；只有显式恢复同一身份运行才允许续写（任务书 §0）。',
};

const statusBlock = {
    status: 'FROZEN',
    frozenScope: [
        'masterSeeds 与五个用途命名空间（含确定性派生函数与逐 block 值）',
        '五份 root 清单及其与全部已知已用 root 的交集检查（结果 0）',
        'C2/D 训练预算、全部 caps、对局面板规模与 ID/缓存键字段表',
        '协议 §7.1 选择门槛与 §7.2 确认门槛的全部数值条件',
        '统计定义（root 家族聚类 bootstrap、bootstrapSeed、10000 次、地图内分层）',
        '产物路径与运行身份（HEAD、起始源码/环境快照 SHA）',
    ],
    notFrozen: [
        {
            item: '部署资格目标（浏览器/硬件/端到端延迟/内存/取消与过期状态标准）',
            status: 'NOT_MEASURED',
            reason: '协议 §7.2 与任务书均未给出实际产品约束；协议明确「没有明确目标时部署资格为 NOT_MEASURED，不能用测完后的读数倒定通过阈值」。需要用户提供目标浏览器/硬件与阈值后才可冻结。',
        },
        {
            item: '对局 caps 的最终修订值',
            status: 'PENDING_COST_PREFLIGHT',
            reason: '协议 §5.1 允许成本预检后统一确定 caps 再冻结整个面板；本文件记录的是预设值，修订时必须保留理由与旧配置。',
        },
        {
            item: 'C2/D 权重与数据 SHA、L1 标签合同 SHA',
            status: 'NOT_YET_PRODUCED',
            reason: '依赖 GL/GR/GD/GO 下游任务（T15-01/02/04/03），本轮不可能预先冻结。',
        },
    ],
    inconclusiveItems: [],
};

const protocol = {
    schema: 'v15_experiment_protocol_instance_1',
    task: 'T15-00',
    runId: RUN_ID,
    generatedAt: GENERATED_AT,
    statusBlock,
    note: '中文：本文件是 `v15/V15_EXPERIMENT_PROTOCOL.md` 的可执行实例化。数值全部来自协议/任务书原文或由此确定性派生；派生值可按 derivation 字段复算。文件生成不等于任务 DONE：依赖 gate 的实际产物 SHA 在各自任务完成时补写 runtime snapshot。',
    protocolIdentity: {
        protocol: describe(PROTOCOL_DOC),
        taskbook: describe(TASKBOOK_DOC),
        dataContract: describe(CONTRACT_DOC),
        declaredHead: 'c1b9ac038fad98ed97bfd72a801fd564747acd07',
        protocolVersion: '1.0',
    },
    gitIdentity,
    startIdentity,
    runtimeEnvironment,
    masterSeeds: MASTER_SEEDS_BLOCK,
    derivation: DERIVATION,
    /** 协议 §5.1 的开发面板清单直接内联，使 protocol.json 自身即可复核 8 个 block 的派生值。 */
    devPanelRootList: {
        source: '协议 §5.1',
        mapCount: DEV_MAPS.length,
        blocksPerMap: 4,
        blockCount: devPanel.roots.length,
        candidateSeatsPerModel: devPanel.seatPairings,
        plannedCandidateArms: devPanel.plannedCandidateArms,
        mirrorEntities: devPanel.mirrorEntities,
        blocks: devPanel.roots.map((r) => ({
            blockId: r.blockId,
            mapName: r.mapName,
            scenarioId: r.scenarioId,
            playerCount: r.playerCount,
            rootSeed: r.rootSeed,
            episodeIndex: r.episodeIndex,
            rootFamilyId: r.rootFamilyId,
            candidateSeats: r.candidateSeats,
            seatAlliances: r.seatAlliances,
        })),
        fullManifest: `v15/out/${RUN_ID}/T15-00/root_manifests/dev_panel_roots.json`,
        tuningPolicy: '冻结后不得用于调参（任务书 §1.6）',
    },
    manifests: manifestOutputs,
    rootNamespaceCheck: {
        ...allIntersection,
        intraCandidateCollision: intraNamespaceCollision,
        perManifest: manifestOutputs.map((m) => ({ manifestId: m.manifestId, rootCount: m.rootCount, intersectionSize: m.intersectionSize, sha256: m.sha256 })),
        conclusion: allIntersection.pass && intraNamespaceCollision.pass
            ? '五个清单的全部候选 root 与所有已知已用 root（含 rootFamilyId 与 scenarioId+seed 两种口径）交集为 0，且候选清单内部无重复。'
            : '交集检查未通过：禁止冻结，必须重新派生 seed。',
        frozenPolicy: '清单冻结后不得用于调参（任务书 §1.6）。',
    },
    experimentIdentities: {
        H0: { definition: '冻结的生产启发式行为实现 + 每座位 RNG 合同', role: '对手与镜像参照', sourceFile: 'src/game/ai/heuristic_ai.ts', sourceSha256: describe('src/game/ai/heuristic_ai.ts').sha256 },
        L1: { definition: '相同启发式内核的独立逐状态 RNG 标签器', role: '本轮所有基础/纠错数据的共同标签来源', status: '待 T15-01 实现并冻结 labelerVersion' },
        C1: { definition: 'V14b 历史三 seed 模型', role: '历史重评；不直接作为新 schema 正式初始化', checkpointShas: { 42: 'dcd6486222633961d39a74b6960323df14bccae2a4448968e6acd82ad452b27e', 1337: '2508ba72a4a0ee0ae9117ed1381ece03021f0cec9c62da3defef50657f26fe21', 2026: 'c3aecc1dc6a33f706ce5f112c533af015b40f54f036d8b8a4379c5b73999669e' }, shaSource: 'v14/review/v14b_audit_20260925/artifact_summary.json' },
        C2: { definition: '新 schema、干净 split、L1 标签训练的基础模型', role: '主线共同新基线' },
        D0: { definition: 'C2-s final 初始化，只重复旧训练池', role: '额外优化预算控制' },
        D1: { definition: '同一 C2-s final 初始化，旧池 + 新 H0 访问状态', role: '新独立数据控制' },
        D2: { definition: '同一 C2-s final 初始化，旧池 + 冻结学生访问状态（L1 重标）', role: '学生访问分布纠错' },
        S1: { definition: '按真实回合/联盟展开的新搜索教师', role: '条件研究；不阻塞主线' },
        forbiddenFactorChanges: ['网络结构', 'loss', 'schema', '标签器', '过滤规则', '优化器', '总预算', 'GAP', 'value loss', '搜索软标签', 'end_turn 权重', '动作裁剪'],
    },
    dataSources,
    trainingDataTargets: dataSources.trainingDataTargets,
    budgets: {
        c2: {
            ...C2,
            runCount: C2.initSeeds.length,
            totalUpdates: C2.initSeeds.length * C2.totalUpdatesPerSeed,
            totalExposures: C2.initSeeds.length * C2.exposuresPerSeed,
            perSeedExposuresFormula: '3000 updates × batch 32 = 96,000 有效曝光/seed',
        },
        dagger: {
            ...D_GROUP,
            runCount: D_GROUP_RUN_COUNT,
            seeds: C2.initSeeds,
            perRunFormula: '1500 updates × batch 32 = 48,000 曝光（旧池/新池按组别拆分）',
            totalUpdates: D_GROUP_RUN_COUNT * D_GROUP.extraUpdatesPerRun,
            totalExposures: D_GROUP_RUN_COUNT * D_GROUP.exposuresPerRun,
            legacyConfoundsToFix: [
                'V14b D0 实际只执行 1000 次额外更新（D1/D2 为 1500），本轮三组统一 1500',
                'V14b D1/D2 唯一新状态数 1070 / 4787（4.47 倍），本轮必须匹配唯一新状态规模与分层',
                'V14b `collect_student_states.ts` 用同一实例先选动作再重标，第二次查询推进 RNG 改变后续行为流；本轮标签实例与行为实例必须隔离',
            ],
        },
        total: {
            updates: TOTAL_UPDATES,
            exposures: TOTAL_EXPOSURES,
            formula: '3×3000 + 3×3×1500 = 22,500 次更新；3×96,000 + 9×48,000 = 720,000 次有效曝光',
        },
        tinyFitDiagnostic: {
            source: '任务书 §6「小样本诊断的复用与触发」',
            trigger: '新 schema/训练器已变更，做一次 seed 42、真正 128 个训练状态的 train-only 回归',
            firstBudgetUpdates: 8000,
            extensionCeilingUpdates: 16000,
            singleSeedOnly: true,
            target: '≥127/128 且训练 CE<0.05，导出 TS 同样满足',
            countsAs: '独立诊断预算；不自动跑三 seed 阶梯，不移植 tiny 设置到正式训练',
        },
        calibration: {
            source: '协议 §3.3',
            firstUpdates: 100,
            purpose: '校准速度/内存并输出总预算预计墙钟',
            forbidden: '不根据准确率修改主预算',
        },
        hardFailures: ['非有限数', '非法动作', '数据身份错配', '消费预算不符'],
        budgetExhaustedRule: '外部资源不足时保存 state/进度，标 BUDGET_EXHAUSTED 与准确恢复命令；epoch 用尽而未达总更新不能填 3000/1500。',
    },
    caps: CAPS,
    panel: PANEL,
    selectionAndConfirmation: {
        selection: SELECTION_RULE,
        confirmation: CONFIRMATION_RULE,
        deploymentQualification: {
            source: '协议 §7.2',
            status: 'NOT_MEASURED',
            requiredChecks: ['实际浏览器 shared policy 路径', '同一权重/schema', '端到端延迟与内存', '加载', '取消/过期状态验证'],
            rule: 'T15-00 必须从实际产品约束冻结目标浏览器/硬件和延迟、内存、取消标准；没有明确目标时部署资格为 NOT_MEASURED，不能用测完后的读数倒定通过阈值。Node 速度不能代替浏览器结果。',
            missingInput: '用户/产品尚未给出目标浏览器、硬件与延迟/内存/取消阈值。',
        },
        scopeLimit: '仅评测 2p/3p 上述地图不能声称四人或所有联盟模式变强；生产默认保持 H0，本轮不执行替换。',
    },
    statistics: { ...STATISTICS, bootstrap: { ...STATISTICS.bootstrap, seedValue: BOOTSTRAP_SEED } },
    gameIds: gameIdRule,
    cacheKey,
    samplerAndSchedule,
    artifactPaths,
    gates: {
        source: '任务书 §0.2',
        order: ['G0', 'GL', 'GR', 'GO', 'GD', 'GP', 'GE', 'GC', 'GI', 'GT'],
        G0: 'T15-00 完成初始身份、预算、root 命名空间和所有权冻结',
        note: 'T15-05 可先用夹具/小池验证，不等正式全量采集；T15-09A 是 T15-09 的独立前置验收。',
    },
    pauseResume: '评测执行周期可恢复；训练保存可恢复 state；教师调度器支持取消/恢复并记录截断原因；恢复检查数据、split、schema、预算与调度身份。',
    forbiddenCliFlags: ['--deploy-to-src', '--legacy-bug-repro', '--allow-legacy-grouping'],
    unknownOrUnmeasured: [
        '部署资格目标（浏览器/硬件/延迟/内存/取消）：NOT_MEASURED，缺用户侧产品约束。',
        'V15b 审核第 37 步精确历史复现：旧完整轨迹不可恢复，一律记 UNKNOWN，不伪造「新的精确历史复现」。',
        '历史工作区内容差异无法逐字节恢复时写 UNKNOWN，不以 mtime 推断「仅换行差异」。',
    ],
};

writeJsonNoClobber(path.join(TASK_DIR, 'protocol.json'), protocol);
const protocolInfo = sha256File(path.join(TASK_DIR, 'protocol.json'));

// ============================================================ prior_evidence.json

function ev(rel, category, extra) {
    return { ...describe(rel), category, ...extra };
}

const reusableMeasurements = [
    ev('v14/review/v14b_audit_20260925/window_probe.json', 'MEASURED', {
        role: '审核独立重放读数（可复用为历史证据，不作为 V15 结论）',
        keyReadings: {
            comparedWindows: 40,
            replayedStudentActionMismatches: 0,
            studentVsMirrorStateMismatches: 37,
            step37MirrorSameSeedRuns: ['move:u_7:3,8', 'move:u_7:3,8', 'move:u_7:3,8'],
            step37MirrorVariedSeedRuns: ['move:u_7:3,8', 'move:u_7:4,9', 'move:u_7:3,8'],
            step37StudentStateSameSeedRuns: ['attack:u_8:apk_u0', 'attack:u_8:apk_u0', 'attack:u_8:apk_u0'],
            endTurnStep114: { turn: 6, currentPlayer: 0, gold: 100, unit: 'u_10', unitClass: 'soldier', hp: 2, legalActionCodesCount: 6, hasRecruitAction: false },
        },
        v15Use: 'T15-01 用新恢复接口重测同一现象并取代其结论口径；T15-07 用第 114 步窗口做有限反事实。',
    }),
    ev('v14/review/v14b_audit_20260925/combat_probe.json', 'MEASURED', {
        role: '反击升级与旧 schema 反例（真实引擎 + shared policy 路径实测）',
        keyReadings: { exp0: { predicted: 25, actual: 25 }, exp90: { levelAfter: 1, predicted: 25, actual: 22 }, legacyV13Formula: 50, legacyActualReceived: 0 },
        v15Use: 'T15-02 新增升级正反例 golden；旧 schema 必须显式分派或明确拒绝。',
    }),
    ev('v14/review/v14b_audit_20260925/artifact_summary.json', 'MEASURED', {
        role: '模型与对战只读核对（best SHA / tiny 台账 / 假空 epoch / D1-D2 唯一状态比例 / 三 seed 开发面板口径）',
        keyReadings: {
            modelBestShas: { 42: 'dcd6486222633961d39a74b6960323df14bccae2a4448968e6acd82ad452b27e', 1337: '2508ba72a4a0ee0ae9117ed1381ece03021f0cec9c62da3defef50657f26fe21', 2026: 'c3aecc1dc6a33f706ce5f112c533af015b40f54f036d8b8a4379c5b73999669e' },
            tiny: { train: 127, valPlaceholder: 1, uniqueOptimized: 127, updates: 16000, totalExposures: 254000 },
            fakeEmptyEpochs: { epoch2000UpdatesUsed: 16000, epoch2001to2003TrainLossAccZero: true, earlyStop: 'train_accuracy_degradation' },
            frozen3p: { candidateNatural: [12, 12, 10], completePairs: [9, 9, 8] },
            daggerNewUniqueRatio: 4.473831775700934,
        },
        v15Use: 'T15-03/04/08/09 的对照基线；所有口径更正写入 v14b_errata.md。',
    }),
    ev('v14/review/v14b_audit_20260925/parity_review.json', 'MEASURED', {
        role: '48 案例 TS/Python 前向核对（可复用为历史数值证据）',
        keyReadings: { cases: 48, maxLogitDiff: 3.814697265625e-6, maxZDiff: 1.1920928955078125e-6, bestMismatches: 0 },
        v15Use: 'T15-05 的新 schema 数值/输入验证沿用同一比较方法，但需换新输入集与容差预登记。',
    }),
    ev('v14/review/v14b_audit_20260925/tiny_fit_ts_verify.json', 'MEASURED', {
        role: '3 个 stageB 检查点在 TS 上的 128/128 复验',
        keyReadings: { runs: 3, states: 128, tsTop1Correct: 128, encoderSchemaIdInCheckpoint: 'spatial26_global20_actionSemantics53_v14' },
        v15Use: '新 schema 的 train-only 诊断以本读数为「未明显可拟合性退步」的对照，不重做 M0~M5。',
    }),
    ev('v14/review/v14b_audit_20260925/parity_case_248_0.python.json', 'MEASURED', {
        role: '单案例（629 候选）Python 重跑原始数组',
        v15Use: 'T15-05 数值复核保留的历史原始数组。',
    }),
];

const v14bArtifacts = [
    ev('v14/out/v14_20260925_t14b/task_status.json', 'HISTORICAL', { role: 'V14b 各任务真实状态（T14-07/08/09 INCONCLUSIVE、T14-10 DEFERRED）' }),
    ev('v14/out/v14_20260925_t14b/claim_ledger.json', 'HISTORICAL', { role: 'V14b 结论→读数台账（含 1070/4787 与 3.5 倍表述）' }),
    ev('v14/out/v14_20260925_t14b/package_manifest.json', 'HISTORICAL', { role: 'V14b 产物 SHA 清单' }),
    ev('v14/out/v14_20260925_t14b/final_report.md', 'HISTORICAL', { role: 'V14b 执行者报告（被更正对象）' }),
    ev('v14/out/v14_20260925_t14b/promotion_decision.json', 'HISTORICAL', { role: 'NO_PROMOTION 判断' }),
    ev('v14/out/v14_20260925_t14b/commands.ps1', 'HISTORICAL', { role: 'V14b 实际命令记录' }),
    ev('v14/out/v14_20260925_t14b/T14-01/rule_suite_results.json', 'HISTORICAL', { role: '54 夹具 / 145 谓词' }),
    ev('v14/out/v14_20260925_t14b/T14-02/codec_roundtrip.json', 'HISTORICAL', { role: '74/74 与 19/19 拒绝' }),
    ev('v14/out/v14_20260925_t14b/T14-02/dataset_duplicate_impact.json', 'HISTORICAL', { role: '去重前后准确率变化（含 150 组旧 key 重复）' }),
    ev('v14/out/v14_20260925_t14b/T14-03/ts_python_forward_parity.json', 'HISTORICAL', { role: '48 案例前向对齐原始读数' }),
    ev('v14/out/v14_20260925_t14b/T14-03/forward_parity_work/case_248_0.input.json', 'HISTORICAL', { role: '复核案例输入' }),
    ev('v14/out/v14_20260925_t14b/T14-03/forward_parity_work/case_248_0.python.json', 'HISTORICAL', { role: '复核案例 Python 输出' }),
    ev('v14/out/v14_20260925_t14b/T14-04/tiny_fit_split_manifest.json', 'HISTORICAL', { role: 'tiny split：128 行 / 42 家族 / val 占位 1 行' }),
    ev('v14/out/v14_20260925_t14b/T14-04/tiny_fit_inputs_report.json', 'HISTORICAL', { role: 'tiny 输入报告：trainRootFamilies 41、valPlaceholderRows 1' }),
    ev('v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl', 'HISTORICAL', { role: '128 状态诊断输入' }),
    ev('v14/out/v14_20260925_t14b/T14-04/tiny_fit_ts_verify.json', 'HISTORICAL', { role: 'tiny TS 复验（任务产物副本）' }),
    ev('v14/out/v14_20260925_t14b/T14-04/tiny_fit_budget_ladder.json', 'HISTORICAL', { role: '预登记预算阶梯' }),
    ev('v14/out/v14_20260925_t14b/T14-04/train_collapse_diagnosis.json', 'HISTORICAL', { role: '「崩塌」定位证据（权重范数正常、无退化状态，支持控制流解释）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/c1_s42/c1_s42_best.json', 'HISTORICAL', { role: 'C1 seed42 best 权重' }),
    ev('v14/out/v14_20260925_t14b/T14-06/c1_s1337/c1_s1337_best.json', 'HISTORICAL', { role: 'C1 seed1337 best 权重' }),
    ev('v14/out/v14_20260925_t14b/T14-06/c1_s2026/c1_s2026_best.json', 'HISTORICAL', { role: 'C1 seed2026 best 权重' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/dev_matches_manifest.json', 'HISTORICAL', { role: 'V14b 开发面板：seeds 1,2,3,4；maxSteps 20000；wall 300000ms' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/dev_matches_summary.json', 'HISTORICAL', { role: 'V14b 开发面板汇总' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/duel2p_c1s42.games.jsonl', 'HISTORICAL', { role: '2p 原始对局行（8 候选 + 8 镜像）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/duel2p_c1s1337.games.jsonl', 'HISTORICAL', { role: '2p 原始对局行' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/duel2p_c1s2026.games.jsonl', 'HISTORICAL', { role: '2p 原始对局行' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/frozen3p_c1s42.games.jsonl', 'HISTORICAL', { role: '3p 原始对局行（候选 12/12、配对 9/12）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/frozen3p_c1s1337.games.jsonl', 'HISTORICAL', { role: '3p 原始对局行（候选 12/12、配对 9/12）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/matches/frozen3p_c1s2026.games.jsonl', 'HISTORICAL', { role: '3p 原始对局行（候选 10/12、配对 8/12）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/failure_windows_duel2p.jsonl', 'HISTORICAL', { role: '40 个失败窗口（含第 114 步 end_turn 窗口），T15-07 反事实输入' }),
    ev('v14/out/v14_20260925_t14b/T14-06/failure_attribution_summary.json', 'HISTORICAL', { role: 'end_turn「过早」判定的原始来源（需降级为诊断提示）' }),
    ev('v14/out/v14_20260925_t14b/T14-06/failure_taxonomy.json', 'HISTORICAL', { role: '失败分类（含 237 窗口无一步胜利的窄结论）' }),
    ev('v14/out/v14_20260925_t14b/T14-07/teacher_qualification_probe.json', 'HISTORICAL', { role: '错误教师探针原始输出（含 step37 三次动作不一致）' }),
    ev('v14/out/v14_20260925_t14b/T14-07/teacher_qualification_report.md', 'HISTORICAL', { role: '错误结论原始表述' }),
];

const upstreamDataAndDagger = [
    ev('v14/out/v14_20260924_t14/T14-02/raw/roots.jsonl', 'HISTORICAL', { role: '48 个已用 root 的完整初始状态（32 train + 8 val + 8 test）' }),
    ev('v14/out/v14_20260924_t14/T14-02/split_manifest.json', 'HISTORICAL', { role: 'train 6400 / val 1600 / test 1547 的 root 家族分割' }),
    ev('v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl', 'HISTORICAL', { role: '9547 行基础池（26/20/53 历史 schema）；T15-04 去污染与重编码输入' }),
    ev('v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl', 'HISTORICAL', { role: '9547 条含完整 state 快照的原始决策；T15-01 精确恢复输入' }),
    ev('v14/out/v14_20260924_t14/T14-02/raw/collection_report.json', 'HISTORICAL', { role: '基础采集实际消费（wallMs/stopReason）' }),
    ev('v14/out/v14_20260924_t14/T14-02/dataset_contract.json', 'HISTORICAL', { role: '数据集契约与候选覆盖' }),
    ev('v14/out/v14_20260924_t14/T14-02/candidate_coverage.json', 'HISTORICAL', { role: '候选覆盖统计' }),
    ev('v14/out/v14_20260924_t14/T14-08/dagger_groups_summary.json', 'HISTORICAL', { role: 'D0/D1/D2 分组：D1 1070 唯一状态 / D2 4787；受控因素与未受控因素' }),
    ev('v14/out/v14_20260924_t14/T14-08/group_D0_split_manifest.json', 'HISTORICAL', { role: 'D0 组 split' }),
    ev('v14/out/v14_20260924_t14/T14-08/group_D1_split_manifest.json', 'HISTORICAL', { role: 'D1 组 split（newRootFamilies 6 个）' }),
    ev('v14/out/v14_20260924_t14/T14-08/group_D2_split_manifest.json', 'HISTORICAL', { role: 'D2 组 split（V14DAGGER 12 个新家族）' }),
    ev('v14/out/v14_20260924_t14/T14-08/dagger_D1_report.json', 'HISTORICAL', { role: 'D1 采集报告' }),
    ev('v14/out/v14_20260924_t14/T14-08/dagger_D2_report.json', 'HISTORICAL', { role: 'D2 采集报告（same 3409 / different 1378）' }),
    ev('v14/out/v14_20260924_t14/T14-08/matches/dagger_matches_manifest.json', 'HISTORICAL', { role: 'D 组开发对战：seeds 1,2,3,4；wall 60000ms' }),
    ev('v14/out/v14_20260924_t14/claim_ledger.json', 'HISTORICAL', { role: 'D0 实际 1000 次更新 / 32000 曝光的原始台账；D1 重复 5.981 倍' }),
    ev('v14/out/v14_20260924_t14/T14-07/teacher_qualification.json', 'HISTORICAL', { role: 'V14 T14-07 教师四层资格（T-strong NOT_QUALIFIED）' }),
    ev('v14/configs/collect_v14_roots.json', 'HISTORICAL', { role: '基础采集 seed 规则（seedBase 2026092401 + 分区偏移）' }),
    ev('v14/configs/collect_dagger_eval_roots.json', 'HISTORICAL', { role: 'D1 采集 seed 规则（seedBase 2026092501）' }),
];

const v15BaselineReadings = [
    ev('v14/out/v15_rule_precheck_20260925/T14-01/rule_suite_results.json', 'MEASURED', {
        role: '本轮已有规则套件复跑（不重跑，直接引用）',
        keyReadings: { fixtures: 54, verifiedFixtures: 54, predicates: 145, failedPredicates: 0 },
    }),
    ev('v14/out/v15_rule_precheck_20260925/T14-02/codec_roundtrip.json', 'MEASURED', {
        role: '本轮已有 codec 复跑（不重跑，直接引用）',
        keyReadings: { cases: 74, passed: 74, failed: 0, negatives: 19, negativesPassed: 19 },
    }),
    ev(`v15/out/${RUN_ID}/T15-00/source_start.json`, 'MEASURED', { role: '40 个受管文件的字节 SHA + git 身份（起始身份）' }),
    ev(`v15/out/${RUN_ID}/T15-00/environment_start.json`, 'MEASURED', { role: 'Node/Python/依赖实测环境（起始身份）' }),
    ev(`v15/out/${RUN_ID}/T15-00/python_env_start.json`, 'MEASURED', { role: 'Python 3.12.10 + torch 2.14.0+cpu + numpy 2.2.6（CPU only）' }),
    ev(`v15/out/${RUN_ID}/T15-00/git_identity_start.json`, 'MEASURED', { role: '完整 git status/HEAD/diff 统计（起始身份）' }),
];

const affectedInterfaces = [
    {
        interface: 'v14/tools/teacher_qualification_probe.ts',
        problem: '每 replicate 使用 streamFor(seed + replicate * 7919, replay.ally)，且用全启发式重放冒充学生窗口',
        mustRerun: true,
        owner: 'D',
        v15Task: 'T15-01 / T15-10',
        replacementRequirement: '精确快照或完整 action trace 恢复；同 seed 复现与跨 seed 多样性分开报告；视角用 getAllianceId；标签实例与行为实例隔离',
        reusableFrom: ['window_probe.json 的 40 窗口对照读数作为现象记录，不作为结论'],
    },
    {
        interface: 'v14/tools/failure_attribution.ts',
        problem: '把「存在非 end_turn 合法动作却选 end_turn」直接当作错误证据',
        mustRerun: true,
        owner: 'D',
        v15Task: 'T15-07',
        replacementRequirement: '同状态多分支有限反事实，到本方玩家阶段结束 + 敌方一个完整阶段的真实边界；区分 PROVEN_LOCAL / ROLLOUT_SUPPORTED / UNKNOWN',
        reusableFrom: ['第 114 步窗口与合法动作集读数'],
    },
    {
        interface: 'src/game/rules.ts::estimateCounterDamage',
        problem: '投影漏掉本次攻击带来的升级，经验 90 的 0 级士兵预测反击 25、引擎实际 22',
        mustRerun: true,
        owner: 'B',
        v15Task: 'T15-02',
        replacementRequirement: '以真实引擎 attack 顺序为权威，共享完整结算顺序；增加跨升级阈值正反例',
        reusableFrom: ['combat_probe.json 的 25/22 与 0-30/1-120 读数作为 golden 输入'],
    },
    {
        interface: 'src/game/ai/shared_spatial_policy.ts + spatial_tensor_encoder.ts（schema 分派）',
        problem: '旧 V13 schema 权重按 24/26 通道选择后仍收到新语义反击预测（应为 50，实收 0）',
        mustRerun: true,
        owner: 'B',
        v15Task: 'T15-02 / T15-05',
        replacementRequirement: '状态与动作编码都显式 schema 分派；未知 schema fail-fast；旧路径兼容或明确拒绝并有影响清单',
        reusableFrom: ['combat_probe.json legacyInput 读数'],
    },
    {
        interface: 'python/train_spatial_resnet.py（epoch/update 控制流与 final 保存）',
        problem: '达到 global update limit 后外层继续空 epoch，产生零消费 epoch 并误标 train_accuracy_degradation',
        mustRerun: true,
        owner: 'C',
        v15Task: 'T15-03',
        replacementRequirement: 'stopReason=GLOBAL_UPDATE_LIMIT 正常退出；零消费 epoch 不更新指标/不推进 scheduler；真正 final 与 resumable state',
        reusableFrom: ['artifact_summary.json 的 epoch 2000/2001-2003 读数', 'train_collapse_diagnosis.json'],
    },
    {
        interface: 'v14/tools/collect_student_states.ts',
        problem: '对手行动时先用 seatAi 选动作、再用同一实例做教师重标，第二次查询推进 RNG 改变后续行为流；且采集全部当前玩家状态混称学生决策',
        mustRerun: true,
        owner: 'D',
        v15Task: 'T15-01 / T15-08',
        replacementRequirement: '独立标签 RNG/教师实例；有无标签查询的行为轨迹应相同；分别记录主体学生与其他座位比例',
        reusableFrom: ['D2 same/different 统计口径可复用为方法对照'],
    },
    {
        interface: 'D0/D1/D2 对照（T14-08）',
        problem: 'D0 只 1000 次额外更新；D1/D2 唯一新状态 1070 / 4787（4.47 倍）；D1 behaviorAgreement 全 unknown',
        mustRerun: true,
        owner: 'C/E',
        v15Task: 'T15-08',
        replacementRequirement: '三组 1500 次额外更新、唯一新状态/分层/曝光匹配、每 key 循环曝光差 ≤1、共同旧池前 16 位置 sampleId 一致',
        reusableFrom: ['dagger_groups_summary.json 的混淆清单作为修复验收项'],
    },
    {
        interface: '去重统计 sample_key（含目标动作与候选次序）',
        problem: '同一模型输入因教师选了另一动作或候选重排即不被计为同一任务',
        mustRerun: true,
        owner: 'E',
        v15Task: 'T15-04',
        replacementRequirement: '不含标签、候选按稳定语义对齐的 policyInputKey 查交集；标签冲突单独分析',
        reusableFrom: ['dataset_duplicate_impact.json 作为旧 key 读数，不预设新 key 得到同一个数'],
    },
    {
        interface: 'v14/tools/eval_v14_aggregate.ts（完成率口径）',
        problem: '把候选自然完成与双臂完整配对混为一个「完成率 75%」；且「10 对截断全是候选已输、镜像超时」不成立',
        mustRerun: true,
        owner: 'A',
        v15Task: 'T15-09',
        replacementRequirement: '分别列出候选自然完成/计划候选臂、镜像实体自然完成/计划镜像、双臂完整配对/计划配对；从原始 games 重算',
        reusableFrom: ['六份 games JSONL 与 artifact_summary.json 的逐 seed 读数'],
    },
    {
        interface: 'G0 源码身份工具（compare_source_snapshots.mjs 的 mtime 判等方法）',
        problem: '用 mtime 判断差异只是换行；字节 SHA 不同不能未经验证归因于换行',
        mustRerun: true,
        owner: 'A',
        v15Task: 'T15-00 / T15-11',
        replacementRequirement: '保存原始内容/patch 或双方规范化摘要；无法证明写 UNKNOWN',
        reusableFrom: ['source_start.json 的 sha256 + sha256NormalizedLf 双列读法'],
    },
];

const priorEvidence = {
    schema: 'v15_prior_evidence_1',
    task: 'T15-00',
    runId: RUN_ID,
    generatedAt: GENERATED_AT,
    note: '中文：本文件只**引用**审核与历史产物，不重新运行旧实验（任务书 §1.3）。每条给真实字节 SHA256（node:crypto 对原始字节计算）。类别分为 MEASURED（已实测读数）/ HISTORICAL（历史产物）/ CODE_CONFIRMED / HYPOTHESIS。',
    auditSourceDoc: describe(AUDIT_DOC),
    reviewArtifactDir: 'v14/review/v14b_audit_20260925/',
    counts: {
        reusableMeasurements: reusableMeasurements.length,
        v14bArtifacts: v14bArtifacts.length,
        upstreamDataAndDagger: upstreamDataAndDagger.length,
        v15BaselineReadings: v15BaselineReadings.length,
        affectedInterfaces: affectedInterfaces.length,
    },
    reusableMeasurements,
    v14bArtifacts,
    upstreamDataAndDagger,
    v15BaselineReadings,
    affectedInterfaces,
    notRerun: [
        'M0~M5 tiny-fit 阶梯（任务书 §6 明确不重做）',
        'V14b 完整训练、完整开发对战、全量重复数据神经网络评估',
        '本轮规则套件与 codec 复跑（T15-00 完成部分已给读数，见 v15BaselineReadings）',
    ],
    mustRerunSummary: affectedInterfaces.map((a) => ({ interface: a.interface, owner: a.owner, v15Task: a.v15Task })),
};

writeJsonNoClobber(path.join(TASK_DIR, 'prior_evidence.json'), priorEvidence);
const priorInfo = sha256File(path.join(TASK_DIR, 'prior_evidence.json'));

// ============================================================ stdout 摘要（无 spawn）

const report = {
    runId: RUN_ID,
    taskDir: path.relative(REPO_ROOT, TASK_DIR).split(path.sep).join('/'),
    protocol: { path: `v15/out/${RUN_ID}/T15-00/protocol.json`, sha256: protocolInfo.sha256, bytes: protocolInfo.bytes },
    priorEvidence: { path: `v15/out/${RUN_ID}/T15-00/prior_evidence.json`, sha256: priorInfo.sha256, bytes: priorInfo.bytes },
    manifests: manifestOutputs,
    rootNamespaceCheck: {
        pass: allIntersection.pass && intraNamespaceCollision.pass,
        usedRootFamilies: allIntersection.usedRootFamilyCount,
        usedScenarioSeeds: allIntersection.usedScenarioSeedPairCount,
        candidateRoots: allIntersection.candidateRootCount,
        intersectionSize: allIntersection.intersectionSize,
        intraCollisionPass: intraNamespaceCollision.pass,
    },
    masterSeeds: MASTER_SEEDS_BLOCK,
    devPanelBlocks: devPanel.roots.map((r) => ({ blockId: r.blockId, mapName: r.mapName, rootSeed: r.rootSeed, candidateSeats: r.candidateSeats })),
    budgets: { c2Updates: C2.initSeeds.length * C2.totalUpdatesPerSeed, c2Exposures: C2.initSeeds.length * C2.exposuresPerSeed, daggerUpdates: D_GROUP_RUN_COUNT * D_GROUP.extraUpdatesPerRun, daggerExposures: D_GROUP_RUN_COUNT * D_GROUP.exposuresPerRun, totalUpdates: TOTAL_UPDATES, totalExposures: TOTAL_EXPOSURES },
    status: statusBlock.status,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
