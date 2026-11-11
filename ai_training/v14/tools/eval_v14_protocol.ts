/**
 * V14/T14-05：评测协议常量与纯辅助函数，供 runner 与自测共用。
 *
 * 本文件只放“与引擎无耦合”的纯逻辑，不跑对局、不读棋盘：
 * - buildMirrorId：镜像缓存键。V13 缺口 (a)：旧键只有 scenarioId#seed#maxSteps，
 *   同一种子换 wall 超时/对手版本/规则后会命中同一镜像，把不同实验的结果混在一起。
 *   缓存键必须包含所有会影响结果的配置，缺一不可。
 * - canonicalActionKey：动作规范键。V13 缺口 (b)：旧 actionKey 只拼 6 个字段
 *   （type/unitId/attackerId/targetId/to/target），heal 的 healerId、
 *   support 的 supporterId、summon 的 graveId/spawnPos、招募的兵种与城堡坐标等
 *   字段缺失会导致不同动作 digest 碰撞。这里优先使用 src/game/env.ts 的正式
 *   encodeAction（已用 grep 确认其存在：env.ts:1071，覆盖 Action 联合全部 14 种
 *   类型），与线上动作编解码同一实现，不另起一套。
 * - resolveEncoderSchema：编码器 schema 解析。V13 缺口 (c)：旧 GameRecord 把
 *   encoderSchema 硬编码为 'spatial-v2/24x20x20+g20'。这里从 checkpoint 读取
 *   真实 encoderSchemaId 并用 SUPPORTED_ENCODER_SCHEMA_IDS 校验。
 * - earlyEliminationAux：FFA 辅助结局判定。候选座位玩家已淘汰但整局未结束时
 *   只记辅助结局，主协议继续到自然终局或截断，不伪造整局 winner。
 */

import { encodeAction } from '../../src/game/env';
import {
    ENCODER_SCHEMA_ID_V13,
    SUPPORTED_ENCODER_SCHEMA_IDS,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

/** 当前镜像臂启发式策略版本。启发式实现/RNG 语义变化时必须升级本常量，否则旧镜像会被复用。 */
export const MIRROR_POLICY_VERSION_V14 = 'heuristic-seatstream-v1';

/** 启发式臂没有神经编码器，schema 记为该常量，不与任何权重 schema 混淆。 */
export const HEURISTIC_SCHEMA_ID = 'heuristic/na';

/** 镜像缓存键版本号。键格式变化时升级，防止新旧键互相污染。 */
export const MIRROR_ID_VERSION = 'v1';

/** 镜像缓存键的全部输入。任一字段缺失（undefined/空串/非有限数）都抛错，不许缺省。 */
export interface MirrorIdParts {
    /** 场景稳定 ID（含地图与模式，如 'SD:(2) Duel.aem'）。 */
    scenarioId: string;
    /** 随机种子。 */
    seed: number;
    /** 步数上限（原子动作步）。 */
    maxSteps: number;
    /** 玩家回合上限；无上限时传显式 null（null 是合法值，undefined 才算缺失）。 */
    maxPlies: number | null;
    /** 墙钟超时毫秒数。 */
    wallTimeoutMs: number;
    /** 镜像臂对手策略版本（如 MIRROR_POLICY_VERSION_V14）。 */
    mirrorPolicyVersion: string;
    /** 规则摘要（规则配置哈希，终局/淘汰语义变化即变）。 */
    rulesHash: string;
}

/**
 * 构造镜像缓存键。
 *
 * 中文：一个 (初始状态摘要, 规则摘要, 场景, seed, 对手版本, 预算) 只运行一个镜像，
 * 多个座位引用它。键必须含所有影响结果的配置：scenarioId、seed、maxSteps、
 * maxPlies、wallTimeoutMs、mirrorPolicyVersion、rulesHash，缺一不可，缺失抛错。
 */
export function buildMirrorId(parts: MirrorIdParts): string {
    if (parts === null || parts === undefined || typeof parts !== 'object') {
        throw new Error('[T14-05] buildMirrorId: parts 缺失，缓存键的 7 个字段缺一不可。');
    }
    const { scenarioId, seed, maxSteps, maxPlies, wallTimeoutMs, mirrorPolicyVersion, rulesHash } = parts;
    if (typeof scenarioId !== 'string' || scenarioId.length === 0) {
        throw new Error('[T14-05] buildMirrorId: scenarioId 缺失或为空。');
    }
    if (typeof seed !== 'number' || !Number.isFinite(seed)) {
        throw new Error('[T14-05] buildMirrorId: seed 缺失或非有限数。');
    }
    if (typeof maxSteps !== 'number' || !Number.isFinite(maxSteps)) {
        throw new Error('[T14-05] buildMirrorId: maxSteps 缺失或非有限数。');
    }
    // 中文：maxPlies 允许显式 null（不限回合）；undefined 会落到此分支抛错，正好满足“缺一不可”。
    if (maxPlies !== null && (typeof maxPlies !== 'number' || !Number.isFinite(maxPlies))) {
        throw new Error('[T14-05] buildMirrorId: maxPlies 缺失（允许显式 null，不允许 undefined）。');
    }
    if (typeof wallTimeoutMs !== 'number' || !Number.isFinite(wallTimeoutMs)) {
        throw new Error('[T14-05] buildMirrorId: wallTimeoutMs 缺失或非有限数。');
    }
    if (typeof mirrorPolicyVersion !== 'string' || mirrorPolicyVersion.length === 0) {
        throw new Error('[T14-05] buildMirrorId: mirrorPolicyVersion 缺失或为空。');
    }
    if (typeof rulesHash !== 'string' || rulesHash.length === 0) {
        throw new Error('[T14-05] buildMirrorId: rulesHash 缺失或为空。');
    }
    const enc = encodeURIComponent;
    const pliesPart = maxPlies === null ? 'none' : String(maxPlies);
    return (
        `mirror:${MIRROR_ID_VERSION}` +
        `:scenario=${enc(scenarioId)}` +
        `:seed=${seed}` +
        `:maxSteps=${maxSteps}` +
        `:maxPlies=${pliesPart}` +
        `:wallMs=${wallTimeoutMs}` +
        `:policy=${enc(mirrorPolicyVersion)}` +
        `:rules=${enc(rulesHash)}`
    );
}

/**
 * 动作规范键（trajectory/action digest 用）。
 *
 * 中文：直接使用 src/game/env.ts 的正式 encodeAction（grep 确认导出于 env.ts:1071），
 * 它按类型拼接全部关键字段，满足以下区分要求：
 * - heal 含 healerId（env.ts:1076 `heal:<healerId>:<targetId>`）；
 * - support 含 supporterId（env.ts:1077 `support:<supporterId>:<targetId>`）；
 * - summon 含 graveId 与 spawnPos（env.ts:1078）；
 * - 招募含兵种 unitClass 与城堡坐标 castlePos（及部署落点，env.ts:1079-1080）；
 * - destroy_town 含摧毁目标坐标（env.ts:1083-1085）；
 * - post_attack_move 含落点（env.ts:1074）；
 * - end_turn / surrender 为常量码（env.ts:1087-1088）。
 * 若将来正式 encodeAction 不存在，调用方应回落到“全字段拼接”（把 Action 联合每种
 * 类型的全部字段按固定顺序拼接）并在此注释说明；当前分支已确认存在，直接使用。
 */
export function canonicalActionKey(action: Action): string {
    return encodeAction(action);
}

/** resolveEncoderSchema 的返回：解析出的 schema 与是否为历史兼容。 */
export interface ResolvedEncoderSchema {
    /** 生效的编码器 schema（或启发式臂的 'heuristic/na'）。 */
    schemaId: string;
    /** true 表示历史无字段检查点，按 ENCODER_SCHEMA_ID_V13 解释，需在报告中单列。 */
    legacy: boolean;
}

/**
 * 解析某臂的编码器 schema。
 *
 * 中文：
 * - 启发式臂（opts.isHeuristicArm=true）返回 'heuristic/na'，不读 checkpoint；
 * - 有 checkpoint 时读其 encoderSchemaId，必须在 SUPPORTED_ENCODER_SCHEMA_IDS 内，否则抛错
 *   （静默回退禁止，任何回退都要单列）；
 * - 历史无字段检查点（encoderSchemaId 缺失）按 ENCODER_SCHEMA_ID_V13 处理并标 legacy=true；
 * - 非启发式臂连 checkpoint 对象都没有时抛错，不许默认成某一 schema 蒙混过关。
 */
export function resolveEncoderSchema(
    checkpointObj: { encoderSchemaId?: string | null } | null | undefined,
    opts?: { isHeuristicArm?: boolean },
): ResolvedEncoderSchema {
    if (opts !== undefined && opts.isHeuristicArm === true) {
        return { schemaId: HEURISTIC_SCHEMA_ID, legacy: false };
    }
    if (checkpointObj === null || checkpointObj === undefined) {
        throw new Error(
            '[T14-05] resolveEncoderSchema: 非启发式臂必须提供 checkpoint 对象（含 encoderSchemaId），缺失不得静默回退。',
        );
    }
    const id: string | null | undefined = checkpointObj.encoderSchemaId;
    if (id === undefined || id === null) {
        // 中文：历史检查点没有该字段，按 V13 语义解释，并标 legacy 以便报告单列。
        return { schemaId: ENCODER_SCHEMA_ID_V13, legacy: true };
    }
    const supported: readonly string[] = SUPPORTED_ENCODER_SCHEMA_IDS;
    if (!supported.includes(id)) {
        throw new Error(
            `[T14-05] resolveEncoderSchema: 不支持的 encoderSchemaId '${id}'，` +
                `仅接受 [${supported.join(', ')}]。旧权重不得静默解释新语义。`,
        );
    }
    return { schemaId: id, legacy: false };
}

/**
 * FFA 辅助结局判定：候选座位玩家是否“已淘汰、但整局尚未结束”。
 *
 * 中文：条件为该座位玩家 isAlive=false 且 state.winner===null（null=未结束，
 * -1=规则平局，其余=获胜联盟）。返回 true 时调用方只记辅助结局，主协议继续跑到
 * 自然终局或截断；联盟中队友仍能获胜时更不能按个人淘汰算联盟失败。
 * 座位在 players 中找不到属于数据错误，直接抛错（fail-fast，不猜）。
 */
export function earlyEliminationAux(
    state: Pick<GameState, 'players' | 'winner'>,
    candidateSeat: number,
): boolean {
    const player = state.players.find((p) => p.id === candidateSeat);
    if (!player) {
        throw new Error(`[T14-05] earlyEliminationAux: 座位 ${candidateSeat} 不在 state.players 中。`);
    }
    return player.isAlive === false && state.winner === null;
}

/* ============================================================================
 * V15/T15-09A 追加：缓存身份（cache identity）合同
 *
 * 为什么必须追加：V14 的 `buildMirrorId` 只覆盖 scenarioId/seed/maxSteps/maxPlies/
 * wallTimeoutMs/mirrorPolicyVersion/rulesHash 七个字段，“同一份引擎 + 同一初始状态 +
 * 同一随机流”这三点全靠调用方口头声明。任务书 §10.1 要求补「初始状态 / 引擎 / 地图 /
 * 随机流」等缓存身份，不能用声称的版本字符串代替。
 *
 * 兼容性：以下全部为**新增**导出，`buildMirrorId`、`MIRROR_ID_VERSION`、
 * `resolveEncoderSchema`、`canonicalActionKey`、`earlyEliminationAux` 的行为一个字都没改，
 * 历史报告的键与分类口径可原样复算。V15 面板必须使用 `buildCacheIdentityV15`。
 * ==========================================================================*/

/** V15 缓存身份键的版本号。字段集合变化时升级，防止新旧身份互相污染。 */
export const CACHE_IDENTITY_VERSION_V15 = 'v15-cache-identity-v1';

/** 动作过滤合同 id：主实验统一过滤 surrender（协议 §5.2 / §6 第 4 项）。 */
export const ACTION_FILTER_ID_V15 = 'filter-surrender-v1';

/**
 * 启发式 H0 的 RNG 合同 id。
 *
 * 中文：派生方式与 V14 完全相同（`streamFor(rootSeed, seat)` 的 splitmix 混合 +
 * mulberry32），因此沿用同一字符串；**实验身份不靠这个字符串区分**，而靠
 * `engineSourceDigest` / `policySourceDigest`。任何改变启发式实现或逐座位流派生的
 * 修改都会改摘要，从而换键。
 */
export const RNG_CONTRACT_ID_V15 = 'heuristic-seatstream-v1';

/** 对局身份的三个运行模式；不同模式不共用缓存（protocol.json#cacheKey）。 */
export type RunModeV15 = 'dev' | 'preflight' | 'confirm';

/** 对局身份里允许显式为 null 的字段（null 是合法值，undefined 一律视为缺失）。 */
const NULLABLE_IDENTITY_FIELDS: ReadonlySet<string> = new Set<string>([
    'candidateSeat',
    'viewedSeat',
    'modelId',
    'checkpointSha256',
    'maxPliesAtomicActions',
]);

/** V15 缓存身份/对局 ID 的全部输入。任一项缺失（undefined/空串/非有限数）即抛错。 */
export interface CacheIdentityPartsV15 {
    /** 运行 ID（如 v15_20260925_core）。 */
    runId: string;
    /** 运行模式；不同模式不共用缓存。 */
    runMode: RunModeV15;
    /** 面板 ID：dev | preflight | confirm。 */
    panelId: string;
    /** block ID，如 dev:duel:b0。 */
    blockId: string;
    /** 场景 ID，含地图与模式。 */
    scenarioId: string;
    /** root seed（由 T15-00 的 master seed/命名空间/序号派生）。 */
    rootSeed: number;
    /** 该 seed 在命名空间内的序号。 */
    episodeIndex: number;
    /** root 家族 ID = scenarioId#rootSeed#episodeIndex。 */
    rootFamilyId: string;
    /** 候选座位；镜像实体显式传 null。 */
    candidateSeat: number | null;
    /** 结果视角座位；未被比较时为 null。 */
    viewedSeat: number | null;
    /** 臂类型。 */
    arm: 'CANDIDATE' | 'MIRROR';
    /** 模型 ID = `<policyId>:<tag>:<checkpointSha256 前 12 位>`；启发式镜像用固定 ID。 */
    modelId: string | null;
    /** 实际权重文件字节摘要；启发式臂为 null。 */
    checkpointSha256: string | null;
    /** 输入 schema id；启发式臂为 'heuristic/na'。 */
    encoderSchemaId: string;
    /** RNG 合同 id（如 RNG_CONTRACT_ID_V15）。 */
    rngContract: string;
    /** 动作过滤合同 id（如 ACTION_FILTER_ID_V15）。 */
    actionFilter: string;
    /** 初始状态摘要（状态规范化序列化的 SHA-256）。 */
    initialStateHash: string;
    /** 地图资源字节摘要。 */
    mapHash: string;
    /** 规范化布局摘要。 */
    mapLayoutHash: string;
    /** 生效规则集摘要。 */
    rulesHash: string;
    /** 引擎/规则源码字节摘要。 */
    engineSourceDigest: string;
    /** 策略实现源码字节摘要。 */
    policySourceDigest: string;
    /** 原子动作上限。 */
    maxStepsAtomicActions: number;
    /** 玩家阶段上限；显式 null 表示不设该上限。 */
    maxPliesAtomicActions: number | null;
    /** 墙钟上限毫秒。 */
    wallTimeoutMs: number;
}

/** `buildCacheIdentityV15` 的返回：完整字段表 + 稳定键 + 对局 ID。 */
export interface CacheIdentityV15 {
    version: string;
    /** 全部身份字段（原样保留，便于写入 JSONL 逐行复核）。 */
    fields: Record<string, string | number | null>;
    /** 身份键：字段按键名排序拼接，任一字段变化必定换键。 */
    key: string;
    /** 对局 ID：`<runId>|<panelId>|<blockId>|<modelId>|<arm>|seat=<candidateSeat>|view=<viewedSeat>`。 */
    gameId: string;
}

/**
 * 构造 V15 缓存身份。
 *
 * 中文：**先校验再构造**。任一必需字段缺失/为空串/非有限数立即抛错，不允许“先用默认值
 * 跑起来再补身份”——那正是 V13/V14 缓存键互相污染的原因。可空字段必须显式传 null，
 * 传 undefined 视为缺失并抛错。
 *
 * 键的构造方式：把 `fields` 的键按字典序排序后拼成 `k=v` 并用 `&` 连接，前面带版本号。
 * 前后端可逐字段复算：`JSON.parse(rows[i].cacheIdentity.fields)` 重算即得同一 key。
 */
export function buildCacheIdentityV15(parts: CacheIdentityPartsV15): CacheIdentityV15 {
    if (parts === null || parts === undefined || typeof parts !== 'object') {
        throw new Error('[T15-09A] buildCacheIdentityV15: parts 缺失。');
    }
    const record = parts as unknown as Record<string, unknown>;
    const requiredStrings: string[] = [
        'runId', 'runMode', 'panelId', 'blockId', 'scenarioId', 'rootFamilyId',
        'arm', 'encoderSchemaId', 'rngContract', 'actionFilter',
        'initialStateHash', 'mapHash', 'mapLayoutHash', 'rulesHash',
        'engineSourceDigest', 'policySourceDigest',
    ];
    const requiredNumbers: string[] = [
        'rootSeed', 'episodeIndex', 'maxStepsAtomicActions', 'wallTimeoutMs',
    ];
    for (const name of requiredStrings) {
        const value = record[name];
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 缺失或为空串。`);
        }
    }
    for (const name of requiredNumbers) {
        const value = record[name];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 缺失或非有限数。`);
        }
    }
    // 中文：可空字段允许显式 null；undefined 与“键不存在”一律当作缺失。
    for (const name of NULLABLE_IDENTITY_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(record, name)) {
            throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 缺失（允许显式 null，不允许 undefined）。`);
        }
        const value = record[name];
        if (value === null) continue;
        if (typeof value === 'string') {
            if (value.length === 0) {
                throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 为空串（应为 null 或非空值）。`);
            }
            continue;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 非有限数。`);
            }
            continue;
        }
        throw new Error(`[T15-09A] buildCacheIdentityV15: 字段 ${name} 类型非法（只接受 null/字符串/有限数）。`);
    }
    if (parts.runMode !== 'dev' && parts.runMode !== 'preflight' && parts.runMode !== 'confirm') {
        throw new Error(`[T15-09A] buildCacheIdentityV15: runMode '${parts.runMode}' 非法，只接受 dev|preflight|confirm。`);
    }
    if (parts.arm !== 'CANDIDATE' && parts.arm !== 'MIRROR') {
        throw new Error(`[T15-09A] buildCacheIdentityV15: arm '${parts.arm}' 非法，只接受 CANDIDATE|MIRROR。`);
    }

    const fields: Record<string, string | number | null> = {};
    for (const name of requiredStrings) fields[name] = record[name] as string;
    for (const name of requiredNumbers) fields[name] = record[name] as number;
    for (const name of NULLABLE_IDENTITY_FIELDS) fields[name] = record[name] as string | number | null;
    // 中文：caps 以展开字段进入身份（协议 §5.2 要求 caps 进键）。
    const key = `${CACHE_IDENTITY_VERSION_V15}:` + Object.keys(fields).sort()
        .map((k) => `${k}=${fields[k] === null ? 'null' : String(fields[k])}`)
        .join('&');

    const seatPart = parts.candidateSeat === null ? 'null' : String(parts.candidateSeat);
    const viewPart = parts.viewedSeat === null ? 'null' : String(parts.viewedSeat);
    const gameId =
        `${parts.runId}|${parts.panelId}|${parts.blockId}|${parts.modelId ?? 'heuristic:mirror:v1'}` +
        `|${parts.arm}|seat=${seatPart}|view=${viewPart}`;

    return { version: CACHE_IDENTITY_VERSION_V15, fields, key, gameId };
}

/**
 * 比较两条缓存身份是否可直接复用（同一次计算可被共享）。
 *
 * 中文：只比较会影响对局结果的字段——身份键里除 viewedSeat/arm/modelId 之外的字段。
 * 镜像实体按座位展开时 viewedSeat 与 arm 会不同，但它们共享同一份计算，因此这两项
 * 不参与复用判定；`modelId`/`checkpointSha256` 参与判定（不同权重复用同一结果就是错误）。
 * 返回差异字段列表，空数组表示可以复用。
 */
export function cacheReuseDiffV15(
    a: Record<string, string | number | null>,
    b: Record<string, string | number | null>,
): string[] {
    const ignore = new Set<string>(['viewedSeat', 'arm']);
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    const diff: string[] = [];
    for (const k of [...keys].sort()) {
        if (ignore.has(k)) continue;
        const va = a[k] === undefined ? null : a[k];
        const vb = b[k] === undefined ? null : b[k];
        if (va !== vb) diff.push(k);
    }
    return diff;
}
