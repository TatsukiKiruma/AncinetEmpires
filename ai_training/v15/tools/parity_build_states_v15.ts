/**
 * V15/T15-05：构建新诊断状态集（≥128 个新状态）与 `parity_inputs_manifest.json`。
 *
 * 覆盖要求（任务书 §6 步骤 2）：
 *   升级边界（反击 22 那类）、历史兼容、pending、联盟（allianceId≠playerId）、地图边缘、
 *   null 坐标、单候选、大量候选，候选覆盖全部 14 个动作类型
 *   （策略过滤的 surrender 只出现在引擎合法集里，单列编码读数）。
 *
 * 数据来源（两类，均在产物里写清）：
 *   1. 真实快照：`v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl`（9547 条 14 层真实
 *      state 快照）。**不重新生成对局**，只按桶取样。
 *   2. T15-02 规则夹具：`v15/out/v15_20260925_core/T15-02/golden_inputs.jsonl`（18 个受控
 *      战斗状态，含跨升级阈值、levelCap、击杀、致盲、counter_storm、射程正反例）。
 *
 * 每个状态记录：
 *   - 完整 state 快照（供 Python 独立重编码与 TS shared policy 重评）；
 *   - TS 端 V15 编码结果（26 通道空间张量 / 20 维全局 / 逐候选 53 维语义）；
 *   - 攻击候选在 v13 / v14 / v15 三个语义变体下的「预计反击」原值（历史兼容证据）；
 *   - 候选特征的重复分组（精确并列的可控来源）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_build_states_v15.ts \
 *       --out-dir v15/out/v15_20260925_core/T15-05
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { TERRAIN_CONFIG } from '../../src/game/terrain';
import { UNIT_CONFIGS } from '../../src/game/units';
import { APK_TERRAIN_CONFIGS, SKIRMISH_APK_TERRAIN_TO_PROJECT } from '../../src/game/apk_terrain';
import { getAllianceId } from '../../src/game/rule_config';
import {
    ENCODER_SCHEMA_ID_V15,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
    GLOBAL_FEATURE_DIM_V2,
    ACTION_SEMANTIC_DIM_V3,
    ACTION_TYPE_LIST,
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    estimateCounterDamageForVariant,
} from '../../src/game/ai/spatial_tensor_encoder';
import { calculateDamage } from '../../src/game/rules';
import { stateHashOf } from './labeler_l1_v15';
import { makeState, type StateSpec } from '../../v14/tools/rule_fixtures';
import type { Action, GameState } from '../../src/game/types';
import { CASTLE_TERRAIN, TOWN_TERRAIN } from '../../v14/tools/rule_fixtures';

const DECISIONS_PATH = 'v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl';
const GOLDEN_INPUTS_PATH = 'v15/out/v15_20260925_core/T15-02/golden_inputs.jsonl';
const GOLDEN_OUTPUTS_PATH = 'v15/out/v15_20260925_core/T15-02/golden_outputs.jsonl';

const REAL_TARGET = 136;
const BUCKET_KEEP_CAP = 12;
/** 取样步长：归档按 root 家族成块排列，逐条取会让同一家族占满桶。 */
const BUCKET_STRIDE = 23;

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const OUT_DIR = argOf('--out-dir', 'v15/out/v15_20260925_core/T15-05')!;
const STATES_DIR = path.join(OUT_DIR, 'states');

function sha256Bytes(buffer: Buffer | string): string {
    return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(abs: string): string {
    return sha256Bytes(fs.readFileSync(abs));
}

// ------------------------------------------------------------------ 类型

interface ArchiveRow {
    rootFamilyId: string;
    partition: string;
    stepIndex: number;
    turn: number;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCodes: string[];
    policyAllowedActionCodes: string[];
    filteredActionCodes?: string[];
    labelActionCode?: string;
    stateHash: string;
    state: GameState;
}

interface BucketMatch {
    buckets: string[];
    actionTypes: string[];
    candidateCount: number;
    /** 候选（策略允许集）里出现 null 落点/目标的数量。 */
    nullCoordCandidates: number;
    /** actorCoord 落在 t 字形/含 0 或地图边界的候选数量。 */
    edgeCandidates: number;
    allianceMismatch: boolean;
    pending: boolean;
    stateHash: string;
}

interface BucketState {
    archiveRowIndex: number;
    row: ArchiveRow;
    match: BucketMatch;
}

const bucketKeep: Map<string, BucketState[]> = new Map();
const bucketSeen: Map<string, number> = new Map();

function offerToBucket(bucket: string, entry: BucketState): void {
    const seen = (bucketSeen.get(bucket) ?? 0) + 1;
    bucketSeen.set(bucket, seen);
    const list = bucketKeep.get(bucket) ?? [];
    if (list.length >= BUCKET_KEEP_CAP) return;
    if ((seen - 1) % BUCKET_STRIDE !== 0) return;
    list.push(entry);
    bucketKeep.set(bucket, list);
}

function coordOf(code: string): { x: number; y: number } | null {
    const parts = code.split(':');
    const last = parts[parts.length - 1];
    const m = /^(-?\d+),(-?\d+)$/.exec(last);
    if (!m) return null;
    return { x: Number(m[1]), y: Number(m[2]) };
}

function actionTypeOf(code: string): string {
    return code.split(':')[0];
}

/**
 * 该动作码是否可能带 null 坐标。
 *
 * 编码器里：move/post_attack_move 同时有 actor+landing，attack/heal/summon 有 actor+target，
 * recruit_* 的 actor=landing=城堡；wait/capture/repair 只有 actor，end_turn 三个坐标全 null。
 * 扫描阶段用它做近似筛选，真实读数由编码结果统计（见 DiagState.nullCoordCandidateCount）。
 */
const NULL_COORD_PRONE_TYPES = new Set(['wait', 'end_turn', 'capture', 'repair']);

// ------------------------------------------------------------------ 主流程

const outDirAbs = path.resolve(OUT_DIR);
fs.mkdirSync(path.join(outDirAbs, 'states'), { recursive: true });

const decisionsAbs = path.resolve(DECISIONS_PATH);
if (!fs.existsSync(decisionsAbs)) throw new Error(`缺少真实状态归档：${decisionsAbs}`);

const typeCoverageAll = new Map<string, number>();
let archiveRowsScanned = 0;
const archiveTypeHistogram: Record<string, number> = {};

const rl = readline.createInterface({
    input: fs.createReadStream(decisionsAbs, { encoding: 'utf8' }),
    crlfDelay: Infinity,
});

const realKept: BucketState[] = [];
const emptyAllowedCandidates: BucketState[] = [];

for await (const line of rl) {
    if (!line.trim()) continue;
    const archiveRowIndex = archiveRowsScanned;
    archiveRowsScanned += 1;
    let row: ArchiveRow;
    try {
        row = JSON.parse(line) as ArchiveRow;
    } catch {
        continue;
    }
    if (!row || !row.state) continue;

    const state = row.state;
    const actingPlayerId = state.currentPlayer;
    let engineLegalActionCodes: string[];
    try {
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
        engineLegalActionCodes = engine.isTerminal() ? [] : engine.getLegalActions(actingPlayerId).map(encodeAction);
    } catch {
        continue;
    }
    const policyAllowedActionCodes = engineLegalActionCodes.filter((c) => !c.startsWith('surrender'));

    const match: BucketMatch = {
        buckets: [],
        actionTypes: [...new Set(policyAllowedActionCodes.map(actionTypeOf))].sort(),
        candidateCount: policyAllowedActionCodes.length,
        nullCoordCandidates: 0,
        edgeCandidates: 0,
        allianceMismatch: getAllianceId(state, actingPlayerId) !== actingPlayerId,
        pending: Boolean((state as unknown as { pendingUnitId?: string }).pendingUnitId),
        stateHash: row.stateHash,
    };
    for (const code of policyAllowedActionCodes) {
        const type = actionTypeOf(code);
        archiveTypeHistogram[type] = (archiveTypeHistogram[type] ?? 0) + 1;
        if (NULL_COORD_PRONE_TYPES.has(type)) match.nullCoordCandidates += 1;
        const coord = coordOf(code);
        if (coord) {
            const w = state.map.width;
            const h = state.map.height;
            if (coord.x <= 0 || coord.y <= 0 || coord.x >= w - 1 || coord.y >= h - 1) match.edgeCandidates += 1;
        }
    }
    for (const t of match.actionTypes) typeCoverageAll.set(t, (typeCoverageAll.get(t) ?? 0) + 1);

    const buckets: string[] = [];
    if (policyAllowedActionCodes.length === 0) buckets.push('empty_allowed_set');
    else if (policyAllowedActionCodes.length === 1) buckets.push('single_candidate');
    if (policyAllowedActionCodes.length >= 60) buckets.push('many_candidates');
    if (match.pending) buckets.push('pending');
    if (match.allianceMismatch) buckets.push('alliance_mismatch');
    if (match.edgeCandidates > 0) buckets.push('map_edge');
    if (match.nullCoordCandidates >= 2) buckets.push('null_coords');
    // 逐动作类型桶：稀有权类型（heal/summon/destroy_town/post_attack_move 等）
    // 在均匀取样下几乎不可能被选中，必须显式按类型取样，否则"14 类型覆盖"只是声称。
    for (const t of match.actionTypes) buckets.push(`type_${t}`);
    buckets.push('baseline');

    if (buckets.includes('empty_allowed_set')) {
        if (emptyAllowedCandidates.length < 2) {
            emptyAllowedCandidates.push({ archiveRowIndex, row, match });
        }
        continue;
    }
    const entry: BucketState = { archiveRowIndex, row, match };
    match.buckets = buckets;
    // 桶候选始终登记：归档按 root 家族成块排列，稀有动作类型（destroy_town 等）
    // 可能只在文件后段出现；若在这里按总数提前截断，覆盖矩阵会静默漏掉它们。
    // 每个桶最多保留 BUCKET_KEEP_CAP 条，内存有界。
    for (const bucket of buckets) offerToBucket(bucket, entry);
    if (realKept.length < REAL_TARGET * 6) realKept.push(entry);
}

// ------------------------------------------------------------------ 真实状态选取

const BUCKET_QUOTA: Array<[string, number]> = [
    ['single_candidate', 12],
    ['many_candidates', 12],
    ['pending', 12],
    ['alliance_mismatch', 12],
    ['map_edge', 12],
    ['null_coords', 10],
    // 逐动作类型：保证 14 类型里每一个都有真实状态的候选覆盖。
    ['type_heal', 4],
    ['type_summon', 4],
    ['type_destroy_town', 4],
    ['type_post_attack_move', 4],
    ['type_capture', 4],
    ['type_repair', 3],
    ['type_recruit_and_deploy', 2],
    ['type_support', 2],
    ['type_attack', 4],
    ['type_wait', 2],
    ['type_end_turn', 2],
    ['type_recruit_to_castle', 2],
    ['baseline', 12],
];

const selected: BucketState[] = [];
const selectedHashes = new Set<string>();
const selectedIndexes = new Set<number>();

function trySelect(entry: BucketState): boolean {
    if (selectedIndexes.has(entry.archiveRowIndex)) return false;
    if (selectedHashes.has(entry.match.stateHash)) return false;
    selected.push(entry);
    selectedIndexes.add(entry.archiveRowIndex);
    selectedHashes.add(entry.match.stateHash);
    return true;
}

for (const [bucket, quota] of BUCKET_QUOTA) {
    const list = bucketKeep.get(bucket) ?? [];
    let taken = 0;
    for (const entry of list) {
        if (taken >= quota) break;
        if (trySelect(entry)) taken += 1;
    }
}
// 用 baseline 桶补足到 REAL_TARGET。
for (const entry of bucketKeep.get('baseline') ?? []) {
    if (selected.length >= REAL_TARGET) break;
    trySelect(entry);
}
// 仍不足时按归档顺序补 —— 保证总数达标而不是静默少给。
if (selected.length < REAL_TARGET) {
    for (const entry of realKept) {
        if (selected.length >= REAL_TARGET) break;
        trySelect(entry);
    }
}

// ------------------------------------------------------------------ T15-02 规则夹具

interface GoldenCase { caseId: string; actionCode: string; state: GameState }

const goldenCases: GoldenCase[] = [];
if (fs.existsSync(path.resolve(GOLDEN_INPUTS_PATH))) {
    for (const line of fs.readFileSync(path.resolve(GOLDEN_INPUTS_PATH), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        goldenCases.push(JSON.parse(line) as GoldenCase);
    }
}
const goldenExpect: Record<string, unknown> = {};
if (fs.existsSync(path.resolve(GOLDEN_OUTPUTS_PATH))) {
    for (const line of fs.readFileSync(path.resolve(GOLDEN_OUTPUTS_PATH), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as { caseId: string };
        goldenExpect[parsed.caseId] = parsed;
    }
}

// ------------------------------------------------------------------ 逐状态编码

interface DiagState {
    diagId: string;
    sourceKind: 'archived_decisions' | 't15_02_golden' | 'synthetic_fixture';
    sourcePath: string;
    archiveRowIndex: number | null;
    goldenCaseId: string | null;
    buckets: string[];
    rootFamilyId: string | null;
    mapName: string | null;
    playerCount: number | null;
    turn: number;
    stepIndex: number | null;
    actingPlayerId: number;
    subjectAllianceId: number;
    allianceMismatch: boolean;
    pending: boolean;
    stateHash: string;
    stateHashCanonical: string;
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    filteredActionCodes: string[];
    /** 被策略过滤掉的 surrender 候选编码读数（单列，不进策略输入）。 */
    filteredEncoding: Array<{
        actionCode: string;
        actorCoord: { x: number; y: number } | null;
        landingCoord: { x: number; y: number } | null;
        targetCoord: { x: number; y: number } | null;
        semantics: number[];
    }>;
    candidateCount: number;
    actionTypes: string[];
    encoding: {
        encoderSchemaId: string;
        spatialChannels: number;
        globalDim: number;
        semanticDim: number;
        spatialTensor: number[];
        globalFeatures: number[];
        candidates: Array<{
            actionCode: string;
            actorCoord: { x: number; y: number } | null;
            landingCoord: { x: number; y: number } | null;
            targetCoord: { x: number; y: number } | null;
            semantics: number[];
        }>;
    };
    attackSemanticsByVariant: Array<{
        actionCode: string;
        engineCounter: number | null;
        v13: number;
        v14: number;
        v15: number;
        slot15: { v13: number; v14: number; v15: number };
    }>;
    /** 候选特征完全相同（坐标+语义）的分组：精确并列的可控来源。 */
    exactTieGroups: number[][];
    /** 真实编码读数：带 null 坐标的候选数量（end_turn 三个坐标全 null）。 */
    nullCoordCandidateCount: number;
    /** 真实编码读数：三个坐标全为 null 的候选数量。 */
    allNullCoordCandidateCount: number;
    /** 合成控制项：候选列表被追加的重复下标（用于构造受控精确并列）。 */
    duplicatedCandidateIndex: number | null;
    goldenExpect: unknown;
    state: GameState;
}

const diagStates: DiagState[] = [];
let encodingFailures = 0;

function buildDiagState(params: {
    diagId: string;
    sourceKind: 'archived_decisions' | 't15_02_golden' | 'synthetic_fixture';
    sourcePath: string;
    archiveRowIndex: number | null;
    goldenCaseId: string | null;
    buckets: string[];
    state: GameState;
    stateHash: string;
    stepIndex: number | null;
    rootFamilyId: string | null;
    mapName: string | null;
    playerCount: number | null;
    goldenExpect: unknown;
    /** 可选：把某个候选的特征复制一份追加到末尾，构造受控精确并列。 */
    duplicateCandidateIndex?: number | null;
}): DiagState | null {
    const state = params.state;
    const actingPlayerId = state.currentPlayer;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const engineLegalActionCodes = engine.isTerminal() ? [] : engine.getLegalActions(actingPlayerId).map(encodeAction);
    const allowedActions: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(actingPlayerId).filter((a) => a.type !== 'surrender');
    const policyAllowedActionCodes = allowedActions.map(encodeAction);

    const encoded = encodeGameStateSpatial(state, actingPlayerId, 'v2', { channels: SPATIAL_TENSOR_CHANNELS });
    // 策略过滤动作（surrender）也单独编码一份：任务书 §6 要求它「可在编码单测单列」。
    const filteredActions: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(actingPlayerId).filter((a) => a.type === 'surrender');
    const filteredEncoding = filteredActions.map((a) => {
        const f = encodeCandidateActionSpatial(state, actingPlayerId, a, 'v2', 'v15_current');
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });
    const candidates = allowedActions.map((a) => {
        const f = encodeCandidateActionSpatial(state, actingPlayerId, a, 'v2', 'v15_current');
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });

    // 受控精确并列：追加一个与既有候选**逐位相同**的候选（坐标+语义完全一样），
    // 因此在任何权重下两个 logit 必然逐位相同。这是端到端（真实前向）唯一的精确并列来源。
    let duplicatedCandidateIndex: number | null = null;
    if (params.duplicateCandidateIndex !== null && params.duplicateCandidateIndex !== undefined
        && candidates[params.duplicateCandidateIndex]) {
        const source = candidates[params.duplicateCandidateIndex];
        duplicatedCandidateIndex = candidates.length;
        candidates.push({
            actionCode: source.actionCode,
            actorCoord: source.actorCoord ? { ...source.actorCoord } : null,
            landingCoord: source.landingCoord ? { ...source.landingCoord } : null,
            targetCoord: source.targetCoord ? { ...source.targetCoord } : null,
            semantics: [...source.semantics],
        });
        policyAllowedActionCodes.push(source.actionCode);
    }

    // 攻击候选的三变体反击读数（历史兼容证据）。
    const attackSemanticsByVariant: DiagState['attackSemanticsByVariant'] = [];
    for (const action of allowedActions) {
        if (action.type !== 'attack') continue;
        const attackerId = (action as unknown as { attackerId: string }).attackerId;
        const targetId = (action as unknown as { targetId: string }).targetId;
        const estDmg = calculateDamage(state, attackerId, targetId);
        const v13 = estimateCounterDamageForVariant('v13_legacy', state, attackerId, targetId, estDmg);
        const v14 = estimateCounterDamageForVariant('v14_no_exp_projection', state, attackerId, targetId, estDmg);
        const v15 = estimateCounterDamageForVariant('v15_current', state, attackerId, targetId, estDmg);
        attackSemanticsByVariant.push({
            actionCode: encodeAction(action),
            engineCounter: null,
            v13,
            v14,
            v15,
            slot15: {
                v13: Math.min(1.0, v13 / 100.0),
                v14: Math.min(1.0, v14 / 100.0),
                v15: Math.min(1.0, v15 / 100.0),
            },
        });
    }

    // 候选特征重复分组（坐标 + 语义完全相同 ⇒ 同一权重下 logit 必然逐位相同）。
    const tieMap = new Map<string, number[]>();
    candidates.forEach((c, index) => {
        const key = JSON.stringify([c.actorCoord, c.landingCoord, c.targetCoord, c.semantics]);
        const list = tieMap.get(key) ?? [];
        list.push(index);
        tieMap.set(key, list);
    });
    const exactTieGroups = [...tieMap.values()].filter((group) => group.length > 1);

    const nullCoordCandidateCount = candidates.filter(
        (c) => !c.actorCoord || !c.landingCoord || !c.targetCoord,
    ).length;
    const allNullCoordCandidateCount = candidates.filter(
        (c) => !c.actorCoord && !c.landingCoord && !c.targetCoord,
    ).length;

    return {
        diagId: params.diagId,
        sourceKind: params.sourceKind,
        sourcePath: params.sourcePath,
        archiveRowIndex: params.archiveRowIndex,
        goldenCaseId: params.goldenCaseId,
        buckets: params.buckets,
        rootFamilyId: params.rootFamilyId,
        mapName: params.mapName,
        playerCount: params.playerCount,
        turn: state.turn,
        stepIndex: params.stepIndex,
        actingPlayerId,
        subjectAllianceId: getAllianceId(state, actingPlayerId),
        allianceMismatch: getAllianceId(state, actingPlayerId) !== actingPlayerId,
        pending: Boolean((state as unknown as { pendingUnitId?: string }).pendingUnitId),
        stateHash: params.stateHash,
        stateHashCanonical: stateHashOf(state),
        engineLegalActionCodes,
        policyAllowedActionCodes,
        filteredActionCodes: engineLegalActionCodes.filter((c) => c.startsWith('surrender')),
        filteredEncoding,
        candidateCount: policyAllowedActionCodes.length,
        actionTypes: [...new Set(policyAllowedActionCodes.map(actionTypeOf))].sort(),
        encoding: {
            encoderSchemaId: ENCODER_SCHEMA_ID_V15,
            spatialChannels: SPATIAL_TENSOR_CHANNELS,
            globalDim: GLOBAL_FEATURE_DIM_V2,
            semanticDim: ACTION_SEMANTIC_DIM_V3,
            spatialTensor: Array.from(encoded.spatialTensor),
            globalFeatures: Array.from(encoded.globalFeatures),
            candidates,
        },
        attackSemanticsByVariant,
        exactTieGroups,
        nullCoordCandidateCount,
        allNullCoordCandidateCount,
        duplicatedCandidateIndex,
        goldenExpect: params.goldenExpect,
        state,
    };
}

for (const entry of selected) {
    const built = buildDiagState({
        diagId: `real_${entry.archiveRowIndex}`,
        sourceKind: 'archived_decisions',
        sourcePath: DECISIONS_PATH,
        archiveRowIndex: entry.archiveRowIndex,
        goldenCaseId: null,
        buckets: entry.match.buckets,
        state: entry.row.state,
        stateHash: entry.row.stateHash,
        stepIndex: entry.row.stepIndex ?? null,
        rootFamilyId: entry.row.rootFamilyId ?? null,
        mapName: null,
        playerCount: entry.row.turnPlayerIds?.length ?? null,
        goldenExpect: null,
    });
    if (built) diagStates.push(built);
    else encodingFailures += 1;
}

for (const golden of goldenCases) {
    const built = buildDiagState({
        diagId: `golden_${golden.caseId}`,
        sourceKind: 't15_02_golden',
        sourcePath: GOLDEN_INPUTS_PATH,
        archiveRowIndex: null,
        goldenCaseId: golden.caseId,
        buckets: ['upgrade_boundary', 'historical_compat'],
        state: golden.state,
        stateHash: stateHashOf(golden.state),
        stepIndex: null,
        rootFamilyId: `t15_02_fixture:${golden.caseId}`,
        mapName: null,
        playerCount: golden.state.players?.length ?? null,
        goldenExpect: goldenExpect[golden.caseId] ?? null,
    });
    if (built) diagStates.push(built);
    else encodingFailures += 1;
}

// ------------------------------------------------------------------ 合成夹具（补齐归档里不存在的覆盖）

/**
 * 归档（9547 条真实快照）里**缺失**的覆盖项（首版扫描实测）：
 *   - `support`、`recruit_and_deploy` 两个动作类型从未出现；
 *   - `allianceId != playerId` 从未出现（归档全是 FFA）；
 *   - `single_candidate`（策略允许集只有 1 个）从未出现；
 *   - 只有 `surrender` 合法（策略允许集为空）的状态从未出现。
 * 这些必须用受控夹具补，不能靠"统计上没出现"当作覆盖。
 */
interface SyntheticSpec {
    diagId: string;
    buckets: string[];
    note: string;
    spec: StateSpec;
    /** 构造后强制设置的字段（例如 winner 用于空允许集）。 */
    mutate?: (state: GameState) => void;
    duplicateCandidateIndex?: number | null;
}

const syntheticSpecs: SyntheticSpec[] = [
    {
        diagId: 'syn_support_druid',
        buckets: ['synthetic_support', 'synthetic_action_type'],
        note: '德鲁伊(supporter) 2 格内有一个已行动、等级不高于自己的友军 ⇒ 生成 support 候选。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'druid', ownerId: 0, unitClass: 'druid', x: 2, y: 2, level: 1 },
                { id: 'friend', ownerId: 0, unitClass: 'soldier', x: 4, y: 2, level: 0, hasActed: true, hasMoved: true },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 6, y: 6, level: 0 },
            ],
        },
    },
    {
        diagId: 'syn_support_and_attack',
        buckets: ['synthetic_support', 'synthetic_action_type'],
        note: 'supporter 同时有可攻击敌人：support/attack/move/wait 混合候选，便于梯度对齐。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'druid', ownerId: 0, unitClass: 'druid', x: 2, y: 2, level: 2 },
                { id: 'friend', ownerId: 0, unitClass: 'archer', x: 3, y: 3, level: 1, hasActed: true, hasMoved: true },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
    },
    {
        diagId: 'syn_recruit_and_deploy',
        buckets: ['synthetic_recruit_and_deploy', 'synthetic_action_type'],
        note: '己方城堡上有己方指挥官 + 足够金币 + commanderCastleRecruitUsesPending=false ⇒ recruit_and_deploy。',
        spec: {
            players: [{ id: 0, gold: 3000, isAlive: true, commanderDeathCount: 0 }, 1],
            tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
            units: [
                { id: 'cmd', ownerId: 0, unitClass: 'commander', x: 2, y: 2, level: 0 },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 6, y: 6, level: 0 },
            ],
            rules: { commanderCastleRecruitUsesPending: false, unitLimit: 40, populationLimit: 40 },
        },
    },
    {
        diagId: 'syn_alliance_3p',
        buckets: ['synthetic_alliance', 'synthetic_action_type'],
        note: '3 人局 + alliances {0:0,1:0,2:1}：actingPlayer=1 的 allianceId=0 ≠ 1，联盟视角与玩家 ID 分离。',
        spec: {
            players: [0, 1, 2],
            currentPlayer: 1,
            rules: { alliances: { 0: 0, 1: 0, 2: 1 } },
            units: [
                { id: 'ally1', ownerId: 1, unitClass: 'soldier', x: 2, y: 2, level: 0 },
                { id: 'ally0', ownerId: 0, unitClass: 'archer', x: 2, y: 3, level: 0 },
                { id: 'enemy2', ownerId: 2, unitClass: 'soldier', x: 4, y: 2, level: 0 },
            ],
        },
    },
    {
        diagId: 'syn_single_candidate_end_turn',
        buckets: ['synthetic_single_candidate', 'synthetic_null_coords'],
        note: '玩家 0 的唯一单位已移动且已行动、无城堡可招募：策略允许集只有 end_turn（单候选 + 三坐标全 null）。',
        spec: {
            players: [0, 1],
            currentPlayer: 0,
            units: [
                { id: 'spent', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0, hasMoved: true, hasActed: true },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 6, y: 6, level: 0 },
            ],
            rules: { allowSurrender: false },
        },
    },
    {
        diagId: 'syn_map_corner_edge',
        buckets: ['synthetic_map_edge'],
        note: '单位在 (0,0)，移动候选沿地图边缘展开（坐标 0 与 width-1）。',
        spec: {
            width: 8,
            height: 8,
            players: [0, 1],
            units: [
                { id: 'edge', ownerId: 0, unitClass: 'soldier', x: 0, y: 0, level: 0 },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, level: 0 },
            ],
            tiles: [{ x: 3, y: 3, terrainId: TOWN_TERRAIN, ownerId: null }],
        },
    },
    {
        diagId: 'syn_pending_blocks_end_turn',
        buckets: ['synthetic_pending', 'synthetic_empty_allowed'],
        note: 'pendingUnitId 指向一个已耗尽行动的单位且城堡被占：引擎合法集为空'
            + '（pending 阻塞 end_turn）。这是第二个空允许集诊断，shared policy 必须类型化拒绝。',
        spec: {
            players: [{ id: 0, gold: 500, isAlive: true, commanderDeathCount: 0 }, 1],
            tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
            units: [
                { id: 'pending_u', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0, hasMoved: true, hasActed: true },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 6, y: 6, level: 0 },
            ],
            pendingUnitId: 'pending_u',
            rules: { allowSurrender: true, allowPendingRecruitEndTurn: true, allowPendingRecruitSurrender: true },
        },
    },
    {
        diagId: 'syn_exact_tie_duplicate_candidate',
        buckets: ['synthetic_exact_tie'],
        note: '在真实候选后追加一个逐位相同的候选 ⇒ 端到端精确并列（logit 必然逐位相等）。',
        spec: {
            players: [0, 1],
            units: [
                { id: 'a', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 },
                { id: 'b', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, level: 0 },
            ],
        },
        duplicateCandidateIndex: 0,
    },
];

const syntheticStates: DiagState[] = [];
for (const synthetic of syntheticSpecs) {
    const state = makeState(synthetic.spec);
    if (synthetic.mutate) synthetic.mutate(state);
    const built = buildDiagState({
        diagId: synthetic.diagId,
        sourceKind: 'synthetic_fixture',
        sourcePath: 'v14/tools/rule_fixtures.ts:makeState（合成夹具）',
        archiveRowIndex: null,
        goldenCaseId: null,
        buckets: synthetic.buckets,
        state,
        stateHash: stateHashOf(state),
        stepIndex: null,
        rootFamilyId: `synthetic:${synthetic.diagId}`,
        mapName: `synthetic:${synthetic.diagId}`,
        playerCount: state.players.length,
        goldenExpect: { note: synthetic.note },
        duplicateCandidateIndex: synthetic.duplicateCandidateIndex ?? null,
    });
    if (built) syntheticStates.push(built);
    else encodingFailures += 1;
}

// 空允许集状态（shared policy 必须类型化拒绝）：
//   1) 归档里没有「只有 surrender 合法」的真实状态（扫描 9547 行，0 命中）；
//   2) 用终局状态（winner != null ⇒ engine.isTerminal() ⇒ 合法集为空）做受控构造。
const emptySetStates: DiagState[] = [];
for (const entry of emptyAllowedCandidates) {
    const built = buildDiagState({
        diagId: `empty_allowed_${entry.archiveRowIndex}`,
        sourceKind: 'archived_decisions',
        sourcePath: DECISIONS_PATH,
        archiveRowIndex: entry.archiveRowIndex,
        goldenCaseId: null,
        buckets: ['empty_allowed_set'],
        state: entry.row.state,
        stateHash: entry.row.stateHash,
        stepIndex: entry.row.stepIndex ?? null,
        rootFamilyId: entry.row.rootFamilyId ?? null,
        mapName: null,
        playerCount: entry.row.turnPlayerIds?.length ?? null,
        goldenExpect: null,
    });
    if (built) emptySetStates.push(built);
}
{
    const terminalState = makeState({
        players: [0, 1],
        units: [{ id: 'u', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, level: 0 }],
    });
    terminalState.winner = 0;
    const built = buildDiagState({
        diagId: 'syn_terminal_empty_allowed_set',
        sourceKind: 'synthetic_fixture',
        sourcePath: 'v14/tools/rule_fixtures.ts:makeState（合成终局夹具）',
        archiveRowIndex: null,
        goldenCaseId: null,
        buckets: ['empty_allowed_set'],
        state: terminalState,
        stateHash: stateHashOf(terminalState),
        stepIndex: null,
        rootFamilyId: 'synthetic:terminal',
        mapName: 'synthetic:terminal',
        playerCount: terminalState.players.length,
        goldenExpect: { note: '终局状态：engine.isTerminal() 为真，合法集为空，shared policy 必须类型化拒绝。' },
    });
    if (built) emptySetStates.push(built);
}

diagStates.push(...syntheticStates);

// ------------------------------------------------------------------ 写产物

const statesFile = path.join(STATES_DIR, 'diag_states.jsonl');
const emptyStatesFile = path.join(STATES_DIR, 'empty_allowed_states.jsonl');
if (fs.existsSync(statesFile)) throw new Error(`拒绝覆盖已存在的产物：${statesFile}`);
fs.writeFileSync(statesFile, diagStates.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');
fs.writeFileSync(emptyStatesFile, emptySetStates.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');

const terrainFile = path.join(STATES_DIR, 'terrain_tables_v15.json');
fs.writeFileSync(terrainFile, JSON.stringify({
    schema: 'v15_terrain_tables_1',
    note: 'V15 编码器使用的地形/兵种常量表；Python 端独立编码用它保证两侧数字一致。',
    terrainConfig: TERRAIN_CONFIG,
    unitConfigs: UNIT_CONFIGS,
    unitClasses: Object.keys(UNIT_CONFIGS),
    apkTerrainConfigs: Object.fromEntries(APK_TERRAIN_CONFIGS.map((c: any) => [String(c.id), c])),
    skirmishApkToProject: SKIRMISH_APK_TERRAIN_TO_PROJECT,
}, null, 2) + '\n', 'utf8');

// ------------------------------------------------------------------ 覆盖矩阵

const coveredTypes = new Set<string>();
for (const s of diagStates) for (const t of s.actionTypes) coveredTypes.add(t);
const engineOnlyTypes = new Set<string>();
for (const s of diagStates) {
    for (const code of s.engineLegalActionCodes) engineOnlyTypes.add(actionTypeOf(code));
}
const missingTypes = ACTION_TYPE_LIST.filter((t) => !coveredTypes.has(t) && !engineOnlyTypes.has(t));
const engineOnly = ACTION_TYPE_LIST.filter((t) => !coveredTypes.has(t) && engineOnlyTypes.has(t));

const bucketHistogram: Record<string, number> = {};
for (const s of diagStates) for (const b of s.buckets) bucketHistogram[b] = (bucketHistogram[b] ?? 0) + 1;

const candidateCounts = diagStates.map((s) => s.candidateCount).sort((a, b) => a - b);
const aliasStates = diagStates.filter((s) => s.exactTieGroups.length > 0);
const changedCounterStates = diagStates.filter((s) => s.attackSemanticsByVariant.some((a) => a.v14 !== a.v15));
const goldChangedCounterStates = diagStates.filter((s) => s.goldenExpect
    && s.attackSemanticsByVariant.some((a) => a.v14 !== a.v15));

const targetActionTypes = new Set<string>();
for (const t of ACTION_TYPE_LIST) targetActionTypes.add(t);

const manifest = {
    schema: 'v15_parity_inputs_manifest_1',
    task: 'T15-05',
    runId: 'v15_20260925_core',
    generatedAt: new Date().toISOString(),
    generationAttempt: 2,
    generationNote: '首版（attempt 1）扫描后实测：null 坐标桶的判定把动作码整串与 "wait" 比较（应为动作类型），'
        + '且归档里根本不存在 support / recruit_and_deploy / allianceId≠playerId / 单候选 四类状态，'
        + '导致覆盖矩阵不达标。attempt 2 修正判定并补受控合成夹具；attempt 1 的中间产物在同一次运行内被替换，'
        + '未被任何下游引用。',
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    purpose: '任务书 §6 步骤 2：≥128 个新诊断状态，覆盖升级边界/历史兼容/pending/联盟/地图边缘/null 坐标/单候选/大量候选与全部 14 类型。',
    sources: {
        archivedDecisions: {
            path: DECISIONS_PATH,
            sha256: sha256File(decisionsAbs),
            rowsScanned: archiveRowsScanned,
            note: '真实 14 层 state 快照归档；按桶取样，不重新生成对局。',
        },
        t15_02GoldenInputs: {
            path: GOLDEN_INPUTS_PATH,
            sha256: fs.existsSync(path.resolve(GOLDEN_INPUTS_PATH)) ? sha256File(path.resolve(GOLDEN_INPUTS_PATH)) : null,
            cases: goldenCases.length,
            note: 'T15-02 受控战斗夹具（升级边界、levelCap、击杀、致盲、counter_storm、射程正反例）。',
        },
        t15_02GoldenOutputs: {
            path: GOLDEN_OUTPUTS_PATH,
            sha256: fs.existsSync(path.resolve(GOLDEN_OUTPUTS_PATH)) ? sha256File(path.resolve(GOLDEN_OUTPUTS_PATH)) : null,
        },
        syntheticFixtures: {
            path: 'v14/tools/rule_fixtures.ts:makeState',
            note: '归档缺失覆盖项的受控夹具（support / recruit_and_deploy / 联盟 / 单候选 / 地图边缘 / pending / 精确并列 / 终局空集）。',
            specs: syntheticSpecs.map((s) => ({ diagId: s.diagId, buckets: s.buckets, note: s.note })),
        },
    },
    artifacts: {
        diagStatesPath: path.relative(process.cwd(), statesFile).replace(/\\/g, '/'),
        diagStatesSha256: sha256File(statesFile),
        diagStatesCount: diagStates.length,
        emptyAllowedStatesPath: path.relative(process.cwd(), emptyStatesFile).replace(/\\/g, '/'),
        emptyAllowedStatesSha256: sha256File(emptyStatesFile),
        emptyAllowedStatesCount: emptySetStates.length,
        terrainTablesPath: path.relative(process.cwd(), terrainFile).replace(/\\/g, '/'),
        terrainTablesSha256: sha256File(terrainFile),
    },
    coverage: {
        totalNewStates: diagStates.length + emptySetStates.length,
        realStates: diagStates.filter((s) => s.sourceKind === 'archived_decisions' && s.archiveRowIndex !== null).length,
        goldenStates: diagStates.filter((s) => s.sourceKind === 't15_02_golden').length,
        syntheticStates: syntheticStates.length,
        emptyAllowedSetStates: emptySetStates.length,
        bucketHistogram,
        candidateCountMin: candidateCounts[0] ?? 0,
        candidateCountMax: candidateCounts[candidateCounts.length - 1] ?? 0,
        singleCandidateStates: diagStates.filter((s) => s.candidateCount === 1).length,
        manyCandidateStates: diagStates.filter((s) => s.candidateCount >= 60).length,
        pendingStates: diagStates.filter((s) => s.pending).length,
        allianceMismatchStates: diagStates.filter((s) => s.allianceMismatch).length,
        mapEdgeStates: diagStates.filter((s) => s.buckets.includes('map_edge') || s.buckets.includes('synthetic_map_edge')).length,
        nullCoordStates: diagStates.filter((s) => s.nullCoordCandidateCount > 0).length,
        statesWithAllNullCoordCandidates: diagStates.filter(
            (s) => s.candidateCount > 0 && s.allNullCoordCandidateCount === s.candidateCount,
        ).length,
        statesWithZeroCandidates: diagStates.filter((s) => s.candidateCount === 0).length,
        statesWithExactTieCandidates: aliasStates.length,
        exactTieGroupCount: aliasStates.reduce((sum, s) => sum + s.exactTieGroups.length, 0),
        statesWithControlledDuplicateCandidate: diagStates.filter((s) => s.duplicatedCandidateIndex !== null).length,
        statesWhereV14AndV15CounterDiffer: changedCounterStates.length,
        goldenCasesWhereV14AndV15CounterDiffer: goldChangedCounterStates.length,
        actionTypesCoveredByCandidates: ACTION_TYPE_LIST.filter((t) => coveredTypes.has(t)),
        actionTypesOnlyInEngineLegalSet: engineOnly,
        actionTypesMissingEverywhere: missingTypes,
        allFourteenTypesRepresented: missingTypes.length === 0 && targetActionTypes.size === 14,
        fourteenTypeEvidence: Object.fromEntries(ACTION_TYPE_LIST.map((t) => [t, {
            inPolicyAllowedCandidates: coveredTypes.has(t),
            inEngineLegalSet: engineOnlyTypes.has(t),
            statesWithType: diagStates.filter((s) => s.actionTypes.includes(t) || s.engineLegalActionCodes.some((c) => actionTypeOf(c) === t)).length,
        }])),
        actionTypeHistogramAcrossArchive: archiveTypeHistogram,
        distinctDiagStateHashes: new Set(diagStates.map((s) => s.stateHashCanonical)).size,
        distinctRootFamilies: new Set(diagStates.map((s) => s.rootFamilyId)).size,
        emptyAllowedSetDiagnostics: [
            ...emptySetStates.map((s) => ({
                diagId: s.diagId,
                artifact: 'states/empty_allowed_states.jsonl',
                engineLegalActionCount: s.engineLegalActionCodes.length,
                policyAllowedActionCount: s.policyAllowedActionCodes.length,
            })),
            ...diagStates.filter((s) => s.candidateCount === 0).map((s) => ({
                diagId: s.diagId,
                artifact: 'states/diag_states.jsonl',
                engineLegalActionCount: s.engineLegalActionCodes.length,
                policyAllowedActionCount: s.policyAllowedActionCodes.length,
                note: '主诊断集里也出现了空策略允许集（pending 阻塞 end_turn 的合成夹具）；'
                    + 'shared policy 对它必须同样抛出类型化拒绝。',
            })),
        ],
        encodingFailures,
    },
    preRegisteredTolerance: {
        inputFloat32MaxAbsDiff: 1e-6,
        forwardAtol: 1e-4,
        forwardRtol: 1e-4,
        gradientAtol: 1e-5,
        gradientRtol: 1e-5,
        note: '任务书 §6 预登记；不随结果放宽。非有限数直接失败。',
    },
};

const manifestPath = path.join(outDirAbs, 'parity_inputs_manifest.json');
if (fs.existsSync(manifestPath)) throw new Error(`拒绝覆盖已存在的产物：${manifestPath}`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
    manifestPath,
    statesFile,
    count: diagStates.length,
    emptySetStates: emptySetStates.length,
    buckets: bucketHistogram,
    candidateRange: [manifest.coverage.candidateCountMin, manifest.coverage.candidateCountMax],
    actionTypesCovered: manifest.coverage.actionTypesCoveredByCandidates.length,
    engineOnly,
    missingTypes,
    exactTieStates: aliasStates.length,
    v14v15CounterDiffer: changedCounterStates.length,
    encodingFailures,
}, null, 2));
