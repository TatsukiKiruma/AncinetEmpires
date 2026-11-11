/**
 * V15/T15-09A：评测核心（owner A）——冻结配置装载、严格配对、V15 统计口径。
 *
 * 三层职责，全部是纯函数或纯读文件，不跑对局：
 *
 * 1. **冻结配置装载**（`loadFrozenProtocolV15`/`loadRootBlocksV15`）：直接读
 *    `T15-00/protocol.json` 与 `T15-00/root_manifests/*.json`，把 caps、统计设置、
 *    面板权重、root blocks 取出来，**不在本文件重写任何数值**。找不到/格式不符即抛错。
 *
 * 2. **严格配对**（`strictBuildPairsV15`）：协议 §5.2 要求「无法配对、重复 pairId、
 *    身份错配必须报错；不能用 Map 覆盖重复行后悄悄少算对局」。v14 的 `buildPairs` 把
 *    重复行与落单行丢进 orphans（历史行为，保留不动），本函数在其之上做**显式报错**：
 *    重复 gameId、重复臂、缺臂、身份错配逐条进 `issues`，并给出期望 vs 实际的差集。
 *
 * 3. **V15 聚合**（`aggregateV15`）：按协议 §6 的加权顺序
 *    「root 内等权平均座位 → 每种人数/地图内等权平均 roots → 冻结面板权重」
 *    计算完整配对点估计与全计划上下界，并按「初始 root 家族整块、地图内分层、
 *    bootstrapSeed、10,000 次」给出 95% 区间。截断的上下界**单列**，不当置信区间。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    isError,
    isNatural,
    isUndecided,
    mulberry,
    type OutcomeKind,
} from '../../v13/tools/eval_v3_core';
import { viewOutcomeForSeat, scoreOfViewedOutcome } from '../../v14/tools/eval_v14_aggregate';

/* ------------------------------------------------------------------ *
 * 冻结配置（值全部来自 T15-00 的产物）
 * ------------------------------------------------------------------ */

/** root 家族 ID → 该家族的 root block 元数据（来自 root_manifests）。 */
export interface RootBlockV15 {
    blockId: string;
    purpose: string;
    mapName: string;
    scenarioId: string;
    playerCount: number;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    candidateSeats: number[];
    seatAlliances: Record<string, number>;
    maxPlies: number | null;
}

/** 从 T15-00 冻结产物读出的评测配置。 */
export interface FrozenEvalConfigV15 {
    runRoot: string;
    runId: string;
    masterSeed: number;
    namespaceStride: number;
    caps: { maxStepsAtomicActions: number; wallTimeoutMs: number; maxPlies: number | null };
    statistics: {
        bootstrapIterations: number;
        bootstrapSeed: number;
        bootstrapUnit: string;
        bootstrapStratifiedBy: string;
        aggregationOrder: string[];
        naturalScore: { win: number; draw: number; loss: number };
        mandatoryBreakdowns: string[];
    };
    panel: {
        maps: string[];
        panelWeightsByMap: Record<string, number>;
        rootBlocks: number;
        candidateSeatsPerModel: number;
        models: { c2: number; dagger: number; total: number };
        candidateArms: number;
        mirrorEntities: number;
        totalMatches: number;
        serialWallClockCeilingHours: number;
    };
    gameIds: { format: string; modelIdFormat: string; armValues: string[]; panelIds: string[] };
    cacheKeyFields: Array<{ name: string; meaning: string }>;
    devPanel: RootBlockV15[];
    costPreflight: RootBlockV15[];
}

function readJson<T>(absPath: string): T {
    if (!fs.existsSync(absPath)) {
        throw new Error(`[T15-09A] 冻结配置缺失：${absPath}（不得用默认值代替）。`);
    }
    return JSON.parse(fs.readFileSync(absPath, 'utf8')) as T;
}

/** 读 manifest 里的 roots → RootBlockV15（字段缺失即抛错）。 */
function blocksFromManifest(manifestPath: string, purpose: string): RootBlockV15[] {
    const manifest = readJson<{ roots?: unknown[]; manifestId?: string }>(manifestPath);
    if (!Array.isArray(manifest.roots)) {
        throw new Error(`[T15-09A] ${manifestPath} 缺少 roots 数组。`);
    }
    return manifest.roots.map((raw) => {
        const r = raw as Record<string, unknown>;
        const need = (name: string): unknown => {
            if (r[name] === undefined || r[name] === null) {
                throw new Error(`[T15-09A] ${manifestPath} 的 root 缺少字段 ${name}。`);
            }
            return r[name];
        };
        return {
            blockId: String(need('blockId')),
            purpose: String(r.purpose ?? purpose),
            mapName: String(need('mapName')),
            scenarioId: String(need('scenarioId')),
            playerCount: Number(need('playerCount')),
            rootSeed: Number(need('rootSeed')),
            episodeIndex: Number(need('episodeIndex')),
            rootFamilyId: String(need('rootFamilyId')),
            candidateSeats: (need('candidateSeats') as number[]).slice().sort((a, b) => a - b),
            seatAlliances: (r.seatAlliances ?? {}) as Record<string, number>,
            maxPlies: r.maxPlies === undefined ? null : (r.maxPlies as number | null),
        } satisfies RootBlockV15;
    });
}

/** 浏览器化/路径无关的面板权重：协议只规定「两种人数各占 1/2」，这里从 manifest 读并校验。 */
function panelWeightsFromManifest(manifestPath: string): { maps: string[]; weights: Record<string, number> } {
    const manifest = readJson<{ weights?: Record<string, number>; roots?: Array<{ mapName: string }> }>(manifestPath);
    if (!manifest.weights) {
        throw new Error(`[T15-09A] ${manifestPath} 缺少 weights（面板权重不得由本文件发明）。`);
    }
    const maps = [...new Set((manifest.roots ?? []).map((r) => r.mapName))].sort();
    const weights: Record<string, number> = {};
    for (const m of maps) {
        if (manifest.weights[m] === undefined) {
            throw new Error(`[T15-09A] ${manifestPath} 的 weights 缺少地图 ${m}。`);
        }
        weights[m] = manifest.weights[m];
    }
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) {
        throw new Error(`[T15-09A] 面板权重之和 ${sum} != 1，拒绝继续。`);
    }
    return { maps, weights };
}

/** 装载 T15-00 全部冻结评测配置。 */
export function loadFrozenEvalConfigV15(runRoot: string): FrozenEvalConfigV15 {
    const t00 = path.join(runRoot, 'T15-00');
    const protocol = readJson<Record<string, any>>(path.join(t00, 'protocol.json'));
    const devManifestPath = path.join(t00, 'root_manifests', 'dev_panel_roots.json');
    const preManifestPath = path.join(t00, 'root_manifests', 'cost_preflight_roots.json');
    const devPanel = blocksFromManifest(devManifestPath, 'devPanel');
    const costPreflight = blocksFromManifest(preManifestPath, 'costPreflight');
    const { maps, weights } = panelWeightsFromManifest(devManifestPath);

    const cfg: FrozenEvalConfigV15 = {
        runRoot: runRoot.replace(/\\/g, '/'),
        runId: String(protocol.runId),
        masterSeed: Number(protocol.masterSeeds.masterSeed),
        namespaceStride: Number(protocol.derivation.namespaceStride),
        caps: {
            maxStepsAtomicActions: Number(protocol.caps.match.maxStepsAtomicActions),
            wallTimeoutMs: Number(protocol.caps.match.wallTimeoutMs),
            maxPlies: protocol.caps.match.maxPlies === undefined ? null : protocol.caps.match.maxPlies,
        },
        statistics: {
            bootstrapIterations: Number(protocol.statistics.bootstrap.iterations),
            bootstrapSeed: Number(protocol.statistics.bootstrap.seedValue),
            bootstrapUnit: String(protocol.statistics.bootstrap.unit),
            bootstrapStratifiedBy: String(protocol.statistics.bootstrap.stratifiedBy),
            aggregationOrder: protocol.statistics.aggregationOrder as string[],
            naturalScore: protocol.statistics.naturalOutcomeScore as { win: number; draw: number; loss: number },
            mandatoryBreakdowns: protocol.statistics.mandatoryBreakdowns as string[],
        },
        panel: {
            maps,
            panelWeightsByMap: weights,
            rootBlocks: Number(protocol.panel.rootBlocks),
            candidateSeatsPerModel: Number(protocol.panel.candidateSeatsPerModel),
            models: protocol.panel.models as { c2: number; dagger: number; total: number },
            candidateArms: Number(protocol.panel.candidateArms),
            mirrorEntities: Number(protocol.panel.mirrorEntities),
            totalMatches: Number(protocol.panel.totalMatches),
            serialWallClockCeilingHours: Number(protocol.panel.serialWallClockCeilingHours),
        },
        gameIds: protocol.gameIds as FrozenEvalConfigV15['gameIds'],
        cacheKeyFields: protocol.cacheKey.fields as FrozenEvalConfigV15['cacheKeyFields'],
        devPanel,
        costPreflight,
    };

    // 中文：配置自检——冻结清单必须自洽，否则后面的 248 场计划就是错的。
    const seatPairings = cfg.devPanel.reduce((acc, b) => acc + b.candidateSeats.length, 0);
    if (seatPairings !== cfg.panel.candidateSeatsPerModel) {
        throw new Error(`[T15-09A] 开发面板座位配对数 ${seatPairings} != protocol.panel.candidateSeatsPerModel ${cfg.panel.candidateSeatsPerModel}。`);
    }
    if (cfg.devPanel.length !== cfg.panel.rootBlocks) {
        throw new Error(`[T15-09A] 开发面板 block 数 ${cfg.devPanel.length} != ${cfg.panel.rootBlocks}。`);
    }
    if (cfg.panel.candidateArms !== seatPairings * cfg.panel.models.total) {
        throw new Error(`[T15-09A] 候选臂数 ${cfg.panel.candidateArms} != 座位配对 ${seatPairings} × 模型 ${cfg.panel.models.total}。`);
    }
    if (cfg.panel.totalMatches !== cfg.panel.candidateArms + cfg.panel.mirrorEntities) {
        throw new Error(`[T15-09A] 总场次 ${cfg.panel.totalMatches} != 候选臂 ${cfg.panel.candidateArms} + 镜像实体 ${cfg.panel.mirrorEntities}。`);
    }
    return cfg;
}

/* ------------------------------------------------------------------ *
 * 对局 ID 计划
 * ------------------------------------------------------------------ */

/** 模型槽位（训练完成前只有身份模板，SHA 在运行时解析）。 */
export interface ModelSlotV15 {
    modelKey: string;
    policyId: string;
    tag: string;
    group: 'c2' | 'dagger';
    initSeed: number;
    /** 检查点路径模板；`{runRoot}` 在运行时替换。 */
    checkpointPathTemplate: string;
}

/** protocol.json#budgets 的三 C2 槽位（modelInitSeeds 顺序）。 */
export function modelSlotsV15(cfg: FrozenEvalConfigV15): ModelSlotV15[] {
    const slots: ModelSlotV15[] = [];
    const seeds = [42, 1337, 2026];
    for (const s of seeds) {
        slots.push({
            modelKey: `c2:${s}`,
            policyId: 'spatial_candidate',
            tag: `c2_s${s}`,
            group: 'c2',
            initSeed: s,
            checkpointPathTemplate: '{runRoot}/T15-06/c2_s' + s + '/c2_s' + s + '_best.json',
        });
    }
    for (const group of ['d0', 'd1', 'd2']) {
        for (const s of seeds) {
            slots.push({
                modelKey: `${group}:${s}`,
                policyId: 'spatial_candidate',
                tag: `${group}_s${s}`,
                group: 'dagger',
                initSeed: s,
                checkpointPathTemplate: `{runRoot}/T15-08/${group}_s${s}/${group}_s${s}_best.json`,
            });
        }
    }
    if (slots.length !== cfg.panel.models.total) {
        throw new Error(`[T15-09A] 模型槽位数 ${slots.length} != protocol.panel.models.total ${cfg.panel.models.total}。`);
    }
    return slots;
}

/** 计划中的一场对局。 */
export interface PlannedGameV15 {
    gameIdTemplate: string;
    panelId: string;
    blockId: string;
    scenarioId: string;
    mapName: string;
    playerCount: number;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    modelKey: string | null;
    arm: 'CANDIDATE' | 'MIRROR';
    candidateSeat: number | null;
    viewedSeat: number | null;
    cacheFieldsRequired: string[];
}

/**
 * 生成 248 场计划（240 候选臂 + 8 镜像实体）。
 *
 * 中文：对局 ID 命名规则直接取自 `protocol.json#gameIds.format`：
 * `<runId>|<panelId>|<blockId>|<modelId>|<arm>|seat=<candidateSeat>|view=<viewedSeat>`，
 * 其中 modelId = `<policyId>:<tag>:<sha12>`。训练未完成时 SHA 未知，模板里写 `{sha12}`，
 * 运行时由 arena runner 用**实际权重文件字节摘要**替换（文件名/seed 不能替代摘要）。
 */
export function plannedGamesV15(cfg: FrozenEvalConfigV15, slots: ModelSlotV15[]): PlannedGameV15[] {
    const games: PlannedGameV15[] = [];
    const required = cfg.cacheKeyFields.map((f) => f.name);
    for (const block of cfg.devPanel) {
        for (const slot of slots) {
            for (const seat of block.candidateSeats) {
                games.push({
                    gameIdTemplate:
                        `${cfg.runId}|dev|${block.blockId}|${slot.policyId}:${slot.tag}:{sha12}` +
                        `|CANDIDATE|seat=${seat}|view=${seat}`,
                    panelId: 'dev',
                    blockId: block.blockId,
                    scenarioId: block.scenarioId,
                    mapName: block.mapName,
                    playerCount: block.playerCount,
                    rootSeed: block.rootSeed,
                    episodeIndex: block.episodeIndex,
                    rootFamilyId: block.rootFamilyId,
                    modelKey: slot.modelKey,
                    arm: 'CANDIDATE',
                    candidateSeat: seat,
                    viewedSeat: seat,
                    cacheFieldsRequired: required,
                });
            }
        }
        games.push({
            gameIdTemplate:
                `${cfg.runId}|dev|${block.blockId}|heuristic:mirror:v1|MIRROR|seat=null|view=null`,
            panelId: 'dev',
            blockId: block.blockId,
            scenarioId: block.scenarioId,
            mapName: block.mapName,
            playerCount: block.playerCount,
            rootSeed: block.rootSeed,
            episodeIndex: block.episodeIndex,
            rootFamilyId: block.rootFamilyId,
            modelKey: null,
            arm: 'MIRROR',
            candidateSeat: null,
            viewedSeat: null,
            cacheFieldsRequired: required,
        });
    }
    if (games.length !== cfg.panel.totalMatches) {
        throw new Error(`[T15-09A] 计划场次 ${games.length} != protocol.panel.totalMatches ${cfg.panel.totalMatches}。`);
    }
    return games;
}

/* ------------------------------------------------------------------ *
 * 严格配对
 * ------------------------------------------------------------------ */

/** runner 行（含 V15 可选身份字段）。 */
export interface EvalRowV15 {
    arm?: string;
    scenarioId?: string;
    seed?: number;
    mapName?: string | null;
    playerCount?: number | null;
    candidateSeat?: number | null;
    viewedSeat?: number | null;
    seat?: number | null;
    outcomeKind?: OutcomeKind;
    winnerAllianceId?: number | null;
    candidateAllianceId?: number | null;
    steps?: number;
    error?: string | null;
    fallbackUsed?: boolean;
    gameId?: string;
    blockId?: string;
    rootSeed?: number;
    rootFamilyId?: string;
    modelTag?: string;
    cacheIdentity?: { key?: string; gameId?: string; fields?: Record<string, string | number | null> };
    [key: string]: unknown;
}

/** 配对身份的必须一致字段（候选臂与镜像臂共享同一次对局的这些身份）。 */
export const PAIR_IDENTITY_MUST_MATCH_V15: readonly string[] = [
    'runId', 'runMode', 'panelId', 'blockId', 'scenarioId',
    'rootSeed', 'episodeIndex', 'rootFamilyId',
    'initialStateHash', 'mapHash', 'mapLayoutHash', 'rulesHash',
    'engineSourceDigest', 'policySourceDigest', 'rngContract', 'actionFilter',
    'maxStepsAtomicActions', 'maxPliesAtomicActions', 'wallTimeoutMs',
];

/** 同一 root 家族内可不同的身份字段（不同臂/座位/模型本来就不同）。 */
export const PAIR_IDENTITY_MAY_DIFFER_V15: readonly string[] = [
    'arm', 'candidateSeat', 'viewedSeat', 'modelId', 'checkpointSha256', 'encoderSchemaId',
];

export interface StrictPairV15 {
    pairKey: string;
    scenarioId: string;
    seed: number;
    seat: number | null;
    mapName: string | null;
    playerCount: number | null;
    blockId: string | null;
    candidate: EvalRowV15;
    mirror: EvalRowV15;
    /** 双侧身份不一致的字段（应为空；非空即身份错配）。 */
    identityDiff: string[];
}

export interface StrictIssueV15 {
    kind:
        | 'DUPLICATE_GAME_ID'
        | 'DUPLICATE_ARM_ROW'
        | 'DUPLICATE_PAIR'
        | 'MISSING_ARM'
        | 'MISSING_ROW_FIELD'
        | 'IDENTITY_MISMATCH'
        | 'UNPAIRABLE_ROW';
    detail: string;
    gameIds: string[];
    pairKey?: string;
}

export interface StrictBuildResultV15 {
    pairs: StrictPairV15[];
    issues: StrictIssueV15[];
    /** 行数统计：输入行、可识别臂行、候选行、镜像行。 */
    rowCounts: { input: number; arms: number; candidate: number; mirror: number };
}

function seatOf(row: EvalRowV15): number | null {
    if (row.viewedSeat !== undefined && row.viewedSeat !== null) return row.viewedSeat;
    if (row.candidateSeat !== undefined && row.candidateSeat !== null) return row.candidateSeat;
    if (row.seat !== undefined && row.seat !== null) return row.seat;
    return null;
}

/** pair 键：优先 gameId 里的 block 信息，否则 (scenarioId, seed, seat)。 */
export function pairKeyOfV15(row: EvalRowV15): string {
    const seat = seatOf(row);
    return `${row.scenarioId}#seed=${row.seed}#seat=${seat === null ? 'none' : seat}`;
}

/**
 * 严格配对（协议 §5.2）。
 *
 * 中文：与 v14 `buildPairs` 的差别是**行为而不是口径**——v14 把重复行/落单行放进 orphans
 * 等调用方自己看；这里把它们变成显式 issue，并且：
 * - 同一个 gameId 出现两次 → `DUPLICATE_GAME_ID`（不允许 Map 覆盖后少算）；
 * - 同一 (arm, pairKey) 出现两次 → `DUPLICATE_ARM_ROW`；
 * - 候选或镜像缺一侧 → `MISSING_ARM`；
 * - 两侧身份必须一致的字段不一致 → `IDENTITY_MISMATCH`（缓存身份变化），且**不配成对**。
 */
export function strictBuildPairsV15(
    rows: EvalRowV15[],
    opts?: { requireGameId?: boolean; requireIdentity?: boolean },
): StrictBuildResultV15 {
    // 中文：requireIdentity 默认 true（V15 面板必须带身份）；历史文件（v14b）没有身份字段，
    // 重算时必须显式传 false，并在报告里标注“无身份可比”，而不是让身份检查静默通过。
    const requireIdentity = opts?.requireIdentity !== false;
    const issues: StrictIssueV15[] = [];
    const seenGameIds = new Map<string, number>();
    const byKey = new Map<string, { candidate?: EvalRowV15; mirror?: EvalRowV15 }>();
    const pairs: StrictPairV15[] = [];
    let armRows = 0;
    let candidateRows = 0;
    let mirrorRows = 0;

    rows.forEach((row, index) => {
        if (row.arm !== 'CANDIDATE' && row.arm !== 'MIRROR') return;
        armRows++;
        const gameId = typeof row.gameId === 'string' && row.gameId.length > 0
            ? row.gameId
            : (row.cacheIdentity && typeof row.cacheIdentity.gameId === 'string' ? row.cacheIdentity.gameId : null);
        if (opts?.requireGameId === true && gameId === null) {
            issues.push({
                kind: 'MISSING_ROW_FIELD',
                detail: `第 ${index + 1} 行缺少 gameId（requireGameId=true）。`,
                gameIds: [],
            });
            return;
        }
        if (gameId !== null) {
            if (seenGameIds.has(gameId)) {
                issues.push({
                    kind: 'DUPLICATE_GAME_ID',
                    detail: `gameId 在第 ${seenGameIds.get(gameId)! + 1} 行与第 ${index + 1} 行重复。`,
                    gameIds: [gameId],
                });
                return;
            }
            seenGameIds.set(gameId, index);
        }
        if (row.scenarioId === undefined || row.seed === undefined || row.outcomeKind === undefined) {
            issues.push({
                kind: 'MISSING_ROW_FIELD',
                detail: `第 ${index + 1} 行缺少 scenarioId/seed/outcomeKind，无法定位或分类。`,
                gameIds: gameId === null ? [] : [gameId],
            });
            return;
        }
        const key = pairKeyOfV15(row);
        const bucket = byKey.get(key) ?? {};
        if (row.arm === 'CANDIDATE') {
            candidateRows++;
            if (bucket.candidate) {
                issues.push({
                    kind: 'DUPLICATE_ARM_ROW',
                    detail: `候选臂重复：${key} 已有候选行，无法确定采用哪一行。`,
                    gameIds: [gameId ?? '(无 gameId)'],
                    pairKey: key,
                });
                return;
            }
            bucket.candidate = row;
        } else {
            mirrorRows++;
            if (bucket.mirror) {
                issues.push({
                    kind: 'DUPLICATE_ARM_ROW',
                    detail: `镜像臂重复：${key} 已有镜像行，无法确定采用哪一行。`,
                    gameIds: [gameId ?? '(无 gameId)'],
                    pairKey: key,
                });
                return;
            }
            bucket.mirror = row;
        }
        byKey.set(key, bucket);
    });

    for (const [key, bucket] of [...byKey.entries()].sort()) {
        if (!bucket.candidate || !bucket.mirror) {
            issues.push({
                kind: 'MISSING_ARM',
                detail: `${key} 缺少${bucket.candidate ? '镜像' : '候选'}臂，未配成对。`,
                gameIds: [
                    (bucket.candidate?.gameId ?? '(候选缺失)'),
                    (bucket.mirror?.gameId ?? '(镜像缺失)'),
                ],
                pairKey: key,
            });
            continue;
        }
        const identityDiff = pairIdentityDiffV15(bucket.candidate, bucket.mirror, { requireIdentity });
        if (identityDiff.length > 0) {
            issues.push({
                kind: 'IDENTITY_MISMATCH',
                detail: `${key} 双侧缓存身份不一致：${identityDiff.join(', ')}。`,
                gameIds: [bucket.candidate.gameId ?? '(候选无 gameId)', bucket.mirror.gameId ?? '(镜像无 gameId)'],
                pairKey: key,
            });
            continue;
        }
        pairs.push({
            pairKey: key,
            scenarioId: bucket.candidate.scenarioId as string,
            seed: bucket.candidate.seed as number,
            seat: seatOf(bucket.candidate),
            mapName: bucket.candidate.mapName ?? bucket.mirror.mapName ?? null,
            playerCount: bucket.candidate.playerCount ?? bucket.mirror.playerCount ?? null,
            blockId: (bucket.candidate.blockId ?? bucket.mirror.blockId ?? null) as string | null,
            candidate: bucket.candidate,
            mirror: bucket.mirror,
            identityDiff,
        });
    }

    const pairKeys = new Set<string>();
    for (const p of pairs) {
        if (pairKeys.has(p.pairKey)) {
            issues.push({ kind: 'DUPLICATE_PAIR', detail: `配对键重复：${p.pairKey}`, gameIds: [], pairKey: p.pairKey });
        }
        pairKeys.add(p.pairKey);
    }

    return { pairs, issues, rowCounts: { input: rows.length, arms: armRows, candidate: candidateRows, mirror: mirrorRows } };
}

/** 双侧身份差异：只比较必须一致的字段；任一侧缺身份时返回 ['(身份缺失)']-style 标记。 */
export function pairIdentityDiffV15(
    candidate: EvalRowV15,
    mirror: EvalRowV15,
    opts?: { requireIdentity?: boolean },
): string[] {
    const requireIdentity = opts?.requireIdentity !== false;
    const cf = candidate.cacheIdentity?.fields;
    const mf = mirror.cacheIdentity?.fields;
    if (!cf || !mf) {
        // 中文：没有身份字段时无法证明两侧同源——这在 V15 面板里视为身份缺失（报错），
        // 历史文件（v14b）没有身份字段，调用方需显式声明 legacy 模式。
        return requireIdentity ? ['(cacheIdentity.fields 缺失)'] : [];
    }
    const diff: string[] = [];
    for (const field of PAIR_IDENTITY_MUST_MATCH_V15) {
        const a = cf[field] === undefined ? null : cf[field];
        const b = mf[field] === undefined ? null : mf[field];
        if (a !== b) diff.push(`${field}(${String(a)} != ${String(b)})`);
    }
    return diff;
}

/* ------------------------------------------------------------------ *
 * V15 聚合
 * ------------------------------------------------------------------ */

/** 单臂视角读数。 */
export interface ArmReadingV15 {
    /** 行里字面写的分类（重算前）。 */
    rowOutcome: OutcomeKind;
    /**
     * 臂的**原始声明分类**：镜像行若带 `mirrorDeclaredOutcomeKind`（runner 开启重算时写入），
     * 取该原始值；否则等于 `rowOutcome`。完成率统计用声明值，视角统计用重算值。
     */
    declaredOutcome: OutcomeKind;
    /** 按被测座位联盟从 winner 重算后的分类。 */
    viewedOutcome: OutcomeKind;
    /** 自然终局点得分；截断/错误为 null。 */
    score: number | null;
    /** 分数区间：自然 [s,s]；截断 [0,1]；错误 null。 */
    low: number | null;
    high: number | null;
    undecided: boolean;
    error: boolean;
    /** true 表示行里写的分类与按被测联盟重算的结果不同（镜像行视角写错）。 */
    viewpointCorrected: boolean;
}

/** 按被测座位联盟从 winner 重算视角（等价于聚合器 viewOutcomeForSeat）。 */
export function readArmV15(row: EvalRowV15): ArmReadingV15 {
    const rowOutcome = row.outcomeKind as OutcomeKind;
    const declared = (row.mirrorDeclaredOutcomeKind as OutcomeKind | undefined) ?? rowOutcome;
    const winner = row.winnerAllianceId === undefined ? null : row.winnerAllianceId;
    const viewed = viewOutcomeForSeat(rowOutcome, winner, row.candidateAllianceId ?? null);
    const score = scoreOfViewedOutcome(viewed);
    return {
        rowOutcome,
        declaredOutcome: declared,
        viewedOutcome: viewed,
        score,
        low: score !== null ? score : (isUndecided(rowOutcome) ? 0 : null),
        high: score !== null ? score : (isUndecided(rowOutcome) ? 1 : null),
        undecided: isUndecided(rowOutcome),
        error: isError(rowOutcome),
        viewpointCorrected: viewed !== rowOutcome,
    };
}

/** 一对局明细。 */
export interface PairDetailV15 {
    pairKey: string;
    scenarioId: string;
    mapName: string;
    playerCount: number | null;
    blockId: string | null;
    rootKey: string;
    seat: number | null;
    candidate: ArmReadingV15;
    mirror: ArmReadingV15;
    kind: 'COMPLETE' | 'TRUNCATED' | 'ERROR';
    d: number | null;
    dLow: number | null;
    dHigh: number | null;
    /** 行级 gameId（镜像行按座位展开时每行一个）。 */
    candidateGameId: string | null;
    mirrorGameId: string | null;
    /**
     * 镜像**实体**键：同一次镜像计算按其全部座位展开的多行共享同一个实体键。
     * 完成率的分母按实体计，不按座位行计（协议 §5.1：不要把 20 个座位视角误记成 20 场镜像）。
     */
    mirrorEntityKey: string;
    candidateError: string | null;
    mirrorError: string | null;
    candidateFallback: boolean;
    mirrorFallback: boolean;
    /** 候选臂的模型标签（训练 seed family；历史重算来自文件名）。 */
    modelTag: string | null;
}

/** 一组（root / 地图 / 面板）的加权读数。 */
export interface WeightedStatV15 {
    key: string;
    roots: number;
    pairs: number;
    completePairs: number;
    errors: number;
    /** root 内先平均座位后的加权点估计（仅完整配对）。 */
    completePoint: number | null;
    /** 全计划上下界（含截断区间）。 */
    lowBound: number | null;
    highBound: number | null;
    /** 每 root 的下界数组（保守统计下界 bootstrap 的输入）。 */
    rootLowerBounds: number[];
    /** 每 root 的完整配对点值数组（聚类点估计 bootstrap 的输入）。 */
    rootPoints: number[];
}

export interface V15AggregateReport {
    schema: string;
    totals: {
        pairs: number;
        completePairs: number;
        truncatedPairs: number;
        errorPairs: number;
        roots: number;
        seatViews: number;
        models: number;
    };
    /** 候选视角 W/D/L（完整配对内的自然终局）。 */
    candidateWDL: { wins: number; draws: number; losses: number };
    panel: {
        panelWeightsByMap: Record<string, number>;
        aggregationOrder: string[];
        completePoint: number | null;
        lowBound: number | null;
        highBound: number | null;
        /** true 表示本报告只覆盖部分地图，读数已按可用地图相对权重归一化。 */
        renormalized: boolean;
        usedWeightSum: number;
        missingMaps: string[];
        byMap: WeightedStatV15[];
        byPlayerCount: WeightedStatV15[];
    };
    bootstrap: {
        iterations: number;
        seed: number;
        unit: string;
        stratifiedBy: string;
        completePointInterval: { low95: number | null; high95: number | null; blocks: Record<string, number> };
        /** 确认用：对每 root 的 lower 值整块 bootstrap，取 2.5% 分位作为保守下界。 */
        conservativeLowerBound: number | null;
    };
    perTrainingSeed: Array<{
        modelTag: string | null;
        pairs: number;
        completePairs: number;
        completePoint: number | null;
        lowBound: number | null;
        highBound: number | null;
    }>;
    breakdowns: {
        candidateNatural: number;
        plannedCandidateArms: number | null;
        mirrorEntityNatural: number;
        mirrorEntitiesObserved: number;
        plannedMirrorEntities: number | null;
        mirrorSeatViewNatural: number;
        mirrorSeatViews: number;
        completePairs: number;
        plannedPairs: number | null;
        truncationKinds: Record<string, number>;
        errorKinds: Record<string, number>;
        illegalActionOrCrash: number;
        fallbacks: number;
        identityMismatchPairs: number;
        /** 视角被重算纠正的行数（镜像行字面写 LOSS 但被测联盟实际获胜等）。 */
        viewpointCorrectedRows: number;
        viewpointCorrectedByArm: Record<string, number>;
        sampleSizes: {
            roots: number;
            seatViews: number;
            trainingSeeds: number;
            maps: number;
            models: number;
            playerCounts: Record<string, number>;
        };
    };
    pairDetails: PairDetailV15[];
}

function meanOf(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 把配对折叠成 per-root 的加权读数（root 内先等权平均座位）。 */
export function foldRootsV15(details: PairDetailV15[]): Map<string, WeightedStatV15> {
    const byRoot = new Map<string, PairDetailV15[]>();
    for (const d of details) {
        const list = byRoot.get(d.rootKey) ?? [];
        list.push(d);
        byRoot.set(d.rootKey, list);
    }
    const out = new Map<string, WeightedStatV15>();
    for (const [rootKey, list] of byRoot) {
        const nonError = list.filter((d) => d.kind !== 'ERROR');
        const complete = list.filter((d) => d.kind === 'COMPLETE');
        out.set(rootKey, {
            key: rootKey,
            roots: 1,
            pairs: list.length,
            completePairs: complete.length,
            errors: list.filter((d) => d.kind === 'ERROR').length,
            completePoint: meanOf(complete.map((d) => d.d as number)),
            lowBound: meanOf(nonError.map((d) => d.dLow as number)),
            highBound: meanOf(nonError.map((d) => d.dHigh as number)),
            rootLowerBounds: nonError.length ? [meanOf(nonError.map((d) => d.dLow as number)) as number] : [],
            rootPoints: complete.length ? [meanOf(complete.map((d) => d.d as number)) as number] : [],
        });
    }
    return out;
}

/** 把多个 root 合成一层（等权平均 root 级读数）。 */
export function combineRootsV15(key: string, roots: WeightedStatV15[]): WeightedStatV15 {
    const points = roots.map((r) => r.completePoint).filter((v): v is number => v !== null);
    const lowers = roots.map((r) => r.lowBound).filter((v): v is number => v !== null);
    const highs = roots.map((r) => r.highBound).filter((v): v is number => v !== null);
    return {
        key,
        roots: roots.length,
        pairs: roots.reduce((a, r) => a + r.pairs, 0),
        completePairs: roots.reduce((a, r) => a + r.completePairs, 0),
        errors: roots.reduce((a, r) => a + r.errors, 0),
        completePoint: meanOf(points),
        lowBound: meanOf(lowers),
        highBound: meanOf(highs),
        rootLowerBounds: roots.flatMap((r) => r.rootLowerBounds),
        rootPoints: roots.flatMap((r) => r.rootPoints),
    };
}

/**
 * 面板权重加权。
 *
 * 中文：某个地图在子集里没有 root 时**不发明数值**——只对它实际拥有的地图按权重求和，
 * 并显式报告 `usedWeightSum` 与 `renormalized`：`renormalized=true` 表示这份读数是
 * 「把已有地图按相对权重归一化」的结果（例如只跑了 duel 的子集），必须在报告里单列，
 * 不能与全面板加权值混为一谈。全面板（两图齐全）时 renormalized=false。
 */
export function panelWeightedV15(
    byMap: WeightedStatV15[],
    weights: Record<string, number>,
): {
    completePoint: number | null;
    lowBound: number | null;
    highBound: number | null;
    weights: Record<string, number>;
    usedWeightSum: number;
    renormalized: boolean;
    missingMaps: string[];
} {
    const present = Object.keys(weights).filter((m) => byMap.some((s) => s.key === m && s.roots > 0));
    const missingMaps = Object.keys(weights).filter((m) => !present.includes(m));
    const usedWeightSum = present.reduce((a, m) => a + weights[m], 0);
    const pick = (field: 'completePoint' | 'lowBound' | 'highBound'): number | null => {
        if (usedWeightSum === 0) return null;
        let sum = 0;
        for (const m of present) {
            const stat = byMap.find((s) => s.key === m);
            const value = stat ? stat[field] : null;
            if (value === null || value === undefined) continue;
            sum += (weights[m] / usedWeightSum) * value;
        }
        return sum === 0 && present.every((m) => byMap.find((s) => s.key === m)?.[field] === null) ? null : sum;
    };
    return {
        completePoint: pick('completePoint'),
        lowBound: pick('lowBound'),
        highBound: pick('highBound'),
        weights,
        usedWeightSum,
        renormalized: Math.abs(usedWeightSum - 1) > 1e-9,
        missingMaps,
    };
}

/** 分层 bootstrap：地图内整块重采样 root，再按面板权重合成。 */
export function stratifiedBootstrapV15(
    byMapRootValues: Record<string, number[]>,
    weights: Record<string, number>,
    iterations: number,
    seed: number,
): { low95: number | null; high95: number | null; blocks: Record<string, number> } {
    const maps = Object.keys(weights).filter((m) => (byMapRootValues[m] ?? []).length > 0);
    const blocks: Record<string, number> = {};
    for (const m of maps) blocks[m] = byMapRootValues[m].length;
    if (maps.length === 0) return { low95: null, high95: null, blocks };
    const rng = mulberry(seed);
    const stats: number[] = [];
    for (let i = 0; i < iterations; i++) {
        let sum = 0;
        for (const m of maps) {
            const values = byMapRootValues[m];
            let acc = 0;
            for (let j = 0; j < values.length; j++) acc += values[Math.floor(rng() * values.length)];
            sum += weights[m] * (acc / values.length);
        }
        stats.push(sum);
    }
    stats.sort((a, b) => a - b);
    const q = (p: number): number => stats[Math.min(stats.length - 1, Math.max(0, Math.floor(p * stats.length)))];
    return { low95: q(0.025), high95: q(0.975), blocks };
}

/** 2.5% 分位（保守统计下界）。 */
export function quantileOf(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

export interface AggregateOptionsV15 {
    panelWeightsByMap: Record<string, number>;
    bootstrapIterations: number;
    bootstrapSeed: number;
    aggregationOrder?: string[];
    /** 计划数（用于完成率分母）；缺省 null 表示不适用（历史重算）。 */
    plannedCandidateArms?: number | null;
    plannedMirrorEntities?: number | null;
    plannedPairs?: number | null;
    /** 身份错配配对数（由严格配对阶段给出）。 */
    identityMismatchPairs?: number;
}

/** 主聚合。 */
export function aggregateV15(details: PairDetailV15[], opts: AggregateOptionsV15): V15AggregateReport {
    const rootStats = foldRootsV15(details);
    // 中文：root → 地图/人数 的映射先建一次，避免在过滤里反复线性查找。
    const rootMeta = new Map<string, { mapName: string; playerCount: string }>();
    for (const d of details) {
        if (!rootMeta.has(d.rootKey)) {
            rootMeta.set(d.rootKey, {
                mapName: d.mapName,
                playerCount: d.playerCount === null ? 'null' : String(d.playerCount),
            });
        }
    }
    const mapNameOf = (rootKey: string): string => rootMeta.get(rootKey)?.mapName ?? '';
    const pcOf = (rootKey: string): string => rootMeta.get(rootKey)?.playerCount ?? 'null';
    const rootsOf = (predicate: (rootKey: string) => boolean): WeightedStatV15[] =>
        [...rootStats.entries()].filter(([k]) => predicate(k)).map(([, s]) => s);

    const byMapKeys = [...new Set(details.map((d) => d.mapName))].sort();
    const byMap = byMapKeys.map((map) => combineRootsV15(map, rootsOf((k) => mapNameOf(k) === map)));
    const pcKeys = [...new Set(details.map((d) => (d.playerCount === null ? 'null' : String(d.playerCount))))].sort();
    const byPlayerCount = pcKeys.map((pc) => combineRootsV15(pc, rootsOf((k) => pcOf(k) === pc)));

    const panel = panelWeightedV15(byMap, opts.panelWeightsByMap);

    const completeByMapRoots: Record<string, number[]> = {};
    const lowerByMapRoots: Record<string, number[]> = {};
    for (const map of byMapKeys) {
        const roots = rootsOf((k) => mapNameOf(k) === map);
        completeByMapRoots[map] = roots.flatMap((r) => r.rootPoints);
        lowerByMapRoots[map] = roots.flatMap((r) => r.rootLowerBounds);
    }
    const completeCI = stratifiedBootstrapV15(
        completeByMapRoots, opts.panelWeightsByMap, opts.bootstrapIterations, opts.bootstrapSeed,
    );

    const conservativeLowerBound = Object.values(lowerByMapRoots).some((v) => v.length > 0)
        ? stratifiedBootstrapV15(
            lowerByMapRoots, opts.panelWeightsByMap, opts.bootstrapIterations, opts.bootstrapSeed,
        ).low95
        : null;

    const complete = details.filter((d) => d.kind === 'COMPLETE');
    const truncated = details.filter((d) => d.kind === 'TRUNCATED');
    const errored = details.filter((d) => d.kind === 'ERROR');

    // 候选视角 W/D/L（完整配对内的自然终局）。
    let wins = 0;
    let draws = 0;
    let losses = 0;
    for (const d of complete) {
        if (d.candidate.viewedOutcome === 'NATURAL_WIN') wins++;
        else if (d.candidate.viewedOutcome === 'NATURAL_DRAW') draws++;
        else losses++;
    }

    // 完成率分子/分母：候选自然完成 = 候选臂自然终局数；镜像按**实体**计完成数，
    // 另列按座位展开的完成率（协议 §6 必列项 1/2）。
    const candidateNatural = details.filter((d) => isNatural(d.candidate.declaredOutcome)).length;
    const mirrorEntityKeys = [...new Set(details.map((d) => d.mirrorEntityKey))];
    const mirrorEntityNatural = mirrorEntityKeys.filter((key) =>
        details.filter((d) => d.mirrorEntityKey === key).every((d) => isNatural(d.mirror.declaredOutcome)),
    ).length;
    const mirrorSeatViewNatural = details.filter((d) => isNatural(d.mirror.viewedOutcome)).length;

    const truncationKinds: Record<string, number> = {};
    for (const d of truncated) {
        for (const arm of [d.candidate, d.mirror]) {
            if (isUndecided(arm.declaredOutcome)) {
                truncationKinds[arm.declaredOutcome] = (truncationKinds[arm.declaredOutcome] ?? 0) + 1;
            }
        }
    }
    const errorKinds: Record<string, number> = {};
    let illegalOrCrash = 0;
    let fallbacks = 0;
    for (const d of errored) {
        if (isError(d.candidate.declaredOutcome)) errorKinds[d.candidate.declaredOutcome] = (errorKinds[d.candidate.declaredOutcome] ?? 0) + 1;
        if (isError(d.mirror.declaredOutcome)) errorKinds[d.mirror.declaredOutcome] = (errorKinds[d.mirror.declaredOutcome] ?? 0) + 1;
    }
    for (const d of details) {
        if (d.candidateError !== null) illegalOrCrash++;
        if (d.mirrorError !== null) illegalOrCrash++;
        if (d.candidateFallback) fallbacks++;
        if (d.mirrorFallback) fallbacks++;
    }

    const modelTags = [...new Set(details.map((d) => d.modelTag))];
    const perTrainingSeed = modelTags.map((tag) => {
        const subset = details.filter((d) => d.modelTag === tag);
        const roots = foldRootsV15(subset);
        const maps = [...new Set(subset.map((d) => d.mapName))].sort();
        const mapStats = maps.map((map) => combineRootsV15(map, [...roots.entries()]
            .filter(([rootKey]) => subset.find((d) => d.rootKey === rootKey)?.mapName === map)
            .map(([, s]) => s)));
        const weighted = panelWeightedV15(mapStats, opts.panelWeightsByMap);
        return {
            modelTag: tag,
            pairs: subset.length,
            completePairs: subset.filter((d) => d.kind === 'COMPLETE').length,
            completePoint: weighted.completePoint,
            lowBound: weighted.lowBound,
            highBound: weighted.highBound,
        };
    }).sort((a, b) => String(a.modelTag).localeCompare(String(b.modelTag)));

    const playerCounts: Record<string, number> = {};
    for (const d of details) {
        const k = d.playerCount === null ? 'null' : String(d.playerCount);
        playerCounts[k] = (playerCounts[k] ?? 0) + 1;
    }

    return {
        schema: 'v15_aggregate_report_1',
        totals: {
            pairs: details.length,
            completePairs: complete.length,
            truncatedPairs: truncated.length,
            errorPairs: errored.length,
            roots: rootStats.size,
            seatViews: details.length,
            models: modelTags.length,
        },
        candidateWDL: { wins, draws, losses },
        panel: {
            panelWeightsByMap: opts.panelWeightsByMap,
            aggregationOrder: opts.aggregationOrder ?? [
                '每个 root 内等权平均座位',
                '每种人数/地图内等权平均 roots',
                '按冻结面板权重平均',
            ],
            completePoint: panel.completePoint,
            lowBound: panel.lowBound,
            highBound: panel.highBound,
            renormalized: panel.renormalized,
            usedWeightSum: panel.usedWeightSum,
            missingMaps: panel.missingMaps,
            byMap,
            byPlayerCount,
        },
        bootstrap: {
            iterations: opts.bootstrapIterations,
            seed: opts.bootstrapSeed,
            unit: 'initial root family（整块重采样其所有座位/候选/镜像）',
            stratifiedBy: '地图',
            completePointInterval: completeCI,
            conservativeLowerBound,
        },
        perTrainingSeed,
        breakdowns: {
            candidateNatural,
            plannedCandidateArms: opts.plannedCandidateArms ?? null,
            mirrorEntityNatural,
            mirrorEntitiesObserved: mirrorEntityKeys.length,
            plannedMirrorEntities: opts.plannedMirrorEntities ?? null,
            mirrorSeatViewNatural,
            mirrorSeatViews: details.length,
            completePairs: complete.length,
            plannedPairs: opts.plannedPairs ?? null,
            truncationKinds,
            errorKinds,
            illegalActionOrCrash: illegalOrCrash,
            fallbacks,
            identityMismatchPairs: opts.identityMismatchPairs ?? 0,
            viewpointCorrectedRows: details.filter((d) => d.candidate.viewpointCorrected || d.mirror.viewpointCorrected).length,
            viewpointCorrectedByArm: {
                candidate: details.filter((d) => d.candidate.viewpointCorrected).length,
                mirror: details.filter((d) => d.mirror.viewpointCorrected).length,
            },
            sampleSizes: {
                roots: rootStats.size,
                seatViews: details.length,
                trainingSeeds: modelTags.length,
                maps: byMapKeys.length,
                models: modelTags.length,
                playerCounts,
            },
        },
        pairDetails: details,
    };
}

/** 从严格配对结果构造明细（错误局同样保留，走错误门）。 */
export function detailsFromPairsV15(pairs: StrictPairV15[]): PairDetailV15[] {
    return pairs.map((p) => {
        const c = readArmV15(p.candidate);
        const m = readArmV15(p.mirror);
        const rootKey = `${p.scenarioId}#seed=${p.seed}`;
        const mirrorEntityKey = p.mirror.cacheIdentity?.key ?? `${p.scenarioId}#seed=${p.seed}`;
        const base = {
            pairKey: p.pairKey,
            scenarioId: p.scenarioId,
            mapName: p.mapName ?? p.scenarioId,
            playerCount: p.playerCount,
            blockId: p.blockId,
            rootKey,
            seat: p.seat,
            candidate: c,
            mirror: m,
            candidateGameId: p.candidate.gameId ?? p.candidate.cacheIdentity?.gameId ?? null,
            mirrorGameId: p.mirror.gameId ?? p.mirror.cacheIdentity?.gameId ?? null,
            mirrorEntityKey,
            candidateError: typeof p.candidate.error === 'string' && p.candidate.error.length > 0 ? p.candidate.error : null,
            mirrorError: typeof p.mirror.error === 'string' && p.mirror.error.length > 0 ? p.mirror.error : null,
            candidateFallback: p.candidate.fallbackUsed === true,
            mirrorFallback: p.mirror.fallbackUsed === true,
            modelTag: (p.candidate.modelTag ?? null) as string | null,
        };
        if (c.error || m.error) {
            return { ...base, kind: 'ERROR' as const, d: null, dLow: null, dHigh: null };
        }
        if (c.score !== null && m.score !== null) {
            const d = c.score - m.score;
            return { ...base, kind: 'COMPLETE' as const, d, dLow: d, dHigh: d };
        }
        return {
            ...base,
            kind: 'TRUNCATED' as const,
            d: null,
            dLow: (c.low as number) - (m.high as number),
            dHigh: (c.high as number) - (m.low as number),
        };
    });
}

/** 便捷入口：行 → 严格配对 → 明细 → 报告。 */
export function aggregateRowsV15(
    rows: EvalRowV15[],
    opts: AggregateOptionsV15 & { requireGameId?: boolean; requireIdentity?: boolean },
): { report: V15AggregateReport; issues: StrictIssueV15[]; pairs: StrictPairV15[] } {
    const { pairs, issues } = strictBuildPairsV15(rows, {
        requireGameId: opts.requireGameId,
        requireIdentity: opts.requireIdentity,
    });
    const details = detailsFromPairsV15(pairs);
    const report = aggregateV15(details, {
        ...opts,
        identityMismatchPairs: issues.filter((i) => i.kind === 'IDENTITY_MISMATCH').length,
    });
    return { report, issues, pairs };
}
