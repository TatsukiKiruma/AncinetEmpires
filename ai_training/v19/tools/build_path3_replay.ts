/**
 * 构建 Path-3 的有界离线监督 pilot。
 *
 * 数据只来自 V17 原始可达状态与 V18 L1 单次评分标签。教师分数仅作为监督目标；新增的
 * 三个路径事实由规则状态与候选动作计算，绝不读取或混入 H0 分数。旧 53 维编码保持原样，
 * 路径事实追加到末尾形成 56 维语义。
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { canonicalActionOrderV16, CANDIDATE_ORDERING_ID_V16 } from '../../src/game/ai/action_ordering';
import {
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState, Position } from '../../src/game/types';
import { encodePathRelations, type PathRelationFeatures } from '../encoding/path_relations';

export const PATH3_SCHEMA_ID = 'spatial34_global20_actionSemantics56_v19_path3';
export const PATH3_INPUT_IDENTITY_ID = 'path3-json-f32-values-canonical-candidates-v1';
export const PATH3_SAMPLING_ID = 'sha256-map-source-phase-lowest-v1';
export const PATH3_SPLIT_ID = 'trueFamilyId-sha256-mod5-holdout0-v1';
export const PATH3_SOFT_TARGET_RULE = {
    kind: 'raw_teacher_scores_only',
    temperature: null,
    rule: '保留 V18 L1 原始 score；本工具不选温度、不归一化，训练前必须另行预登记变换。',
} as const;

const ROOT = process.cwd();
const ROLLOUT_ROOT = 'v17/out/v17_20260926_r2/data/new_train/rollouts';
const LABEL_ROOT = 'v18/out/run_20260927_v18_01/labels';
const PHASES = ['0-2', '3-7', '8+'] as const;
const MAX_PER_FAMILY_PHASE = 16;

export interface PilotCandidate {
    sourceId: string;
    sourcePolicy: string;
    mapIndex: number;
    mapName: string;
    phaseBucket: string;
    trueFamilyId: string;
    subjectPlayerId: number;
    subjectSeat: number;
    stateKey: string;
    priority: string;
}

export interface NumericDistribution {
    count: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    standardDeviation: number | null;
    p05: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p95: number | null;
}

interface RawRow extends PilotCandidate {
    schema: string;
    stateHash: string;
    stateJson: string;
    rootId: string;
    rootFamilyId: string;
    seed: number;
    stepIndex: number;
    turn: number;
    completedPlayerTurns: number;
    behaviorActionCode: string;
    subjectAllianceId: number | null;
    gameId: string;
}

interface ScoreRow { actionCode: string; score: number; actionIndex?: number }
interface LabelRow {
    schema: string;
    stateKey: string;
    stateHash: string;
    subjectPlayerId: number;
    subjectSeat: number;
    trueFamilyId: string;
    mapIndex: number;
    mapName: string;
    phaseBucket: string;
    sourcePolicy: string;
    candidateOrderingId: string;
    targetActionCode: string | null;
    scores: ScoreRow[];
    selectionContractId: string;
    jitterContractId: string;
    targetVersion: string;
    labelEvidenceKind: string;
}

interface SourcePair {
    id: string;
    rolloutPath: string;
    labelPath: string;
}

function sha256Text(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

async function* jsonLines(file: string): AsyncGenerator<{ line: number; value: Record<string, unknown> }> {
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const reader = readline.createInterface({ input, crlfDelay: Infinity });
    let line = 0;
    for await (const text of reader) {
        line += 1;
        if (!text.trim()) continue;
        try {
            yield { line, value: JSON.parse(text) as Record<string, unknown> };
        } catch (error) {
            throw new Error(`${file}:${line} 不是合法 JSON：${String(error)}`);
        }
    }
}

function stateKey(row: { stateHash: string; subjectPlayerId: number }): string {
    return `${row.stateHash}|${row.subjectPlayerId}`;
}

function phaseCell(candidate: PilotCandidate): string {
    return `${candidate.mapIndex}|${candidate.sourcePolicy}|${candidate.phaseBucket}`;
}

export function familySplit(trueFamilyId: string): 'train' | 'holdout' {
    const bucket = Number.parseInt(sha256Text(trueFamilyId).slice(0, 8), 16) % 5;
    return bucket === 0 ? 'holdout' : 'train';
}

export function candidatePriority(candidate: Omit<PilotCandidate, 'priority'>): string {
    return sha256Text([
        PATH3_SAMPLING_ID, candidate.mapIndex, candidate.sourcePolicy, candidate.phaseBucket,
        candidate.trueFamilyId, candidate.stateKey, candidate.subjectPlayerId,
    ].join('\0'));
}

/** 30 个 cell 轮转取样，并在全局执行 family×phase 上限。 */
export function selectPilotCandidates(
    candidates: readonly PilotCandidate[], maxPerCell: number,
    maxPerFamilyPhase = MAX_PER_FAMILY_PHASE,
): PilotCandidate[] {
    if (!Number.isInteger(maxPerCell) || maxPerCell < 1 || maxPerCell > 128) {
        throw new Error('--max-per-cell 必须是 1..128；本工具最多生成3840状态');
    }
    const byCell = new Map<string, PilotCandidate[]>();
    for (const candidate of candidates) {
        const bucket = byCell.get(phaseCell(candidate)) ?? [];
        bucket.push(candidate);
        byCell.set(phaseCell(candidate), bucket);
    }
    for (const bucket of byCell.values()) {
        bucket.sort((a, b) => a.priority.localeCompare(b.priority)
            || a.stateKey.localeCompare(b.stateKey)
            || a.subjectPlayerId - b.subjectPlayerId);
    }
    const selected: PilotCandidate[] = [];
    const selectedByCell = new Map<string, number>();
    const familyPhaseCounts = new Map<string, number>();
    const cursor = new Map<string, number>();
    const cells = [...byCell.keys()].sort();
    let progressed = true;
    while (progressed) {
        progressed = false;
        for (const cell of cells) {
            if ((selectedByCell.get(cell) ?? 0) >= maxPerCell) continue;
            const bucket = byCell.get(cell) as PilotCandidate[];
            let index = cursor.get(cell) ?? 0;
            while (index < bucket.length) {
                const item = bucket[index++];
                const familyPhase = `${item.trueFamilyId}|${item.phaseBucket}`;
                if ((familyPhaseCounts.get(familyPhase) ?? 0) >= maxPerFamilyPhase) continue;
                selected.push(item);
                selectedByCell.set(cell, (selectedByCell.get(cell) ?? 0) + 1);
                familyPhaseCounts.set(familyPhase, (familyPhaseCounts.get(familyPhase) ?? 0) + 1);
                progressed = true;
                break;
            }
            cursor.set(cell, index);
        }
    }
    return selected.sort((a, b) => phaseCell(a).localeCompare(phaseCell(b))
        || a.priority.localeCompare(b.priority));
}

function quantile(sorted: readonly number[], probability: number): number | null {
    if (sorted.length === 0) return null;
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** 清单只记录聚合分布，避免复制逐候选教师标签。 */
export function numericDistribution(values: readonly number[]): NumericDistribution {
    if (values.some((value) => !Number.isFinite(value))) throw new Error('统计值必须全部有限');
    const sorted = [...values].sort((left, right) => left - right);
    if (sorted.length === 0) {
        return { count: 0, min: null, max: null, mean: null, standardDeviation: null,
            p05: null, p25: null, p50: null, p75: null, p95: null };
    }
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
    return {
        count: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], mean,
        standardDeviation: Math.sqrt(variance),
        p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5),
        p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
    };
}

/** 只按 actionCode 对齐；旧 actionIndex 明确不进入新数据。 */
export function alignTeacherScores(canonicalCodes: readonly string[], label: Pick<LabelRow, 'scores' | 'targetActionCode'>): {
    scores: number[]; targetActionIndex: number | null;
} {
    const byCode = new Map<string, number>();
    for (const item of label.scores) {
        if (typeof item.actionCode !== 'string' || !Number.isFinite(item.score)) {
            throw new Error('教师 scores 含非法 actionCode 或非有限 score');
        }
        if (byCode.has(item.actionCode)) throw new Error(`教师 scores 含重复 actionCode：${item.actionCode}`);
        byCode.set(item.actionCode, item.score);
    }
    const canonicalSet = new Set(canonicalCodes);
    const missing = canonicalCodes.filter((code) => !byCode.has(code));
    const extra = [...byCode.keys()].filter((code) => !canonicalSet.has(code));
    if (missing.length > 0 || extra.length > 0 || byCode.size !== canonicalCodes.length) {
        throw new Error(`教师候选与权威候选不一致：missing=${missing.join(',')} extra=${extra.join(',')}`);
    }
    const targetActionIndex = label.targetActionCode === null
        ? null : canonicalCodes.indexOf(label.targetActionCode);
    if (label.targetActionCode !== null && targetActionIndex < 0) {
        throw new Error(`教师 targetActionCode 非法：${label.targetActionCode}`);
    }
    return { scores: canonicalCodes.map((code) => byCode.get(code) as number), targetActionIndex };
}

export function appendPathSemantics(base: readonly number[], pathFacts: PathRelationFeatures): number[] {
    if (base.length !== 53) throw new Error(`旧动作语义必须恰为53维，实际 ${base.length}`);
    const result = [...base, pathFacts.reachableCapturableBuilding,
        pathFacts.normalizedNearestCapturableCost, pathFacts.normalizedCapturableCostReduction];
    if (result.length !== 56 || result.some((value) => !Number.isFinite(value))) {
        throw new Error('Path-3 动作语义必须是56个有限数');
    }
    return result;
}

export function path3InputIdentity(input: {
    spatialTensor: readonly number[]; globalFeatures: readonly number[];
    candidateActions: Array<{ actionCode: string; actorCoord: Position | null; landingCoord: Position | null;
        targetCoord: Position | null; semantics: number[] }>;
}): string {
    // 身份只覆盖模型实际输入；动作对象、路径诊断和教师标签都不能进入哈希。
    const projected = {
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
    return sha256Text(canonical({ id: PATH3_INPUT_IDENTITY_ID, ...projected }));
}

function sourcePairs(): SourcePair[] {
    const result: SourcePair[] = [];
    for (const key of ['train_h0', 'train_student_P1s2026']) {
        for (let mapIndex = 0; mapIndex < 5; mapIndex += 1) {
            const stem = `${key}.m${mapIndex}`;
            result.push({
                id: stem,
                rolloutPath: path.join(ROLLOUT_ROOT, `${stem}.jsonl`).replaceAll('\\', '/'),
                labelPath: path.join(LABEL_ROOT, `l1_v18.train.${stem}.jsonl`).replaceAll('\\', '/'),
            });
        }
    }
    return result;
}

async function loadLabels(pair: SourcePair): Promise<Map<string, LabelRow>> {
    const labels = new Map<string, LabelRow>();
    for await (const { line, value } of jsonLines(pair.labelPath)) {
        const label = value as unknown as LabelRow;
        if (label.schema !== 'v18_l1_label_1') throw new Error(`${pair.labelPath}:${line} schema错误`);
        const key = stateKey(label);
        if (label.stateKey !== key) throw new Error(`${pair.labelPath}:${line} stateKey不一致`);
        const previous = labels.get(key);
        if (previous && canonical(previous) !== canonical(label)) {
            throw new Error(`${pair.labelPath}:${line} 同一stateKey出现不同标签：${key}`);
        }
        labels.set(key, label);
    }
    return labels;
}

function validateJoinMetadata(row: RawRow, label: LabelRow, where: string): void {
    const fields: Array<keyof Pick<RawRow, 'stateHash' | 'subjectPlayerId' | 'subjectSeat' | 'trueFamilyId'
        | 'mapIndex' | 'mapName' | 'phaseBucket' | 'sourcePolicy'>> = [
            'stateHash', 'subjectPlayerId', 'subjectSeat', 'trueFamilyId',
            'mapIndex', 'mapName', 'phaseBucket', 'sourcePolicy',
        ];
    for (const field of fields) {
        if (row[field] !== label[field]) throw new Error(`${where} 联接字段 ${field} 不一致`);
    }
    if (row.subjectSeat !== row.subjectPlayerId) throw new Error(`${where} 座位未绑定到subjectPlayerId`);
    if (label.candidateOrderingId !== CANDIDATE_ORDERING_ID_V16) {
        throw new Error(`${where} 标签候选顺序合同错误：${label.candidateOrderingId}`);
    }
}

async function scanCandidates(pairs: SourcePair[]): Promise<{
    candidates: PilotCandidate[];
    scan: Record<string, unknown>;
}> {
    const candidates: PilotCandidate[] = [];
    const exclusions = { missingLabel: 0, duplicateRolloutStateKey: 0 };
    let rolloutRows = 0;
    let joinedRows = 0;
    let unmatchedLabels = 0;
    for (const pair of pairs) {
        const labels = await loadLabels(pair);
        const matched = new Set<string>();
        const seenRows = new Set<string>();
        for await (const { line, value } of jsonLines(pair.rolloutPath)) {
            rolloutRows += 1;
            const raw = value as unknown as RawRow;
            if (raw.schema !== 'v17_rollout_row_1') throw new Error(`${pair.rolloutPath}:${line} schema错误`);
            if (!PHASES.includes(raw.phaseBucket as typeof PHASES[number])) {
                throw new Error(`${pair.rolloutPath}:${line} 未知phaseBucket=${raw.phaseBucket}`);
            }
            const key = stateKey(raw);
            const label = labels.get(key);
            if (!label) { exclusions.missingLabel += 1; continue; }
            validateJoinMetadata(raw, label, `${pair.id}:${line}`);
            matched.add(key);
            const unique = `${pair.id}|${key}`;
            if (seenRows.has(unique)) { exclusions.duplicateRolloutStateKey += 1; continue; }
            seenRows.add(unique);
            joinedRows += 1;
            const withoutPriority: Omit<PilotCandidate, 'priority'> = {
                sourceId: pair.id, sourcePolicy: raw.sourcePolicy,
                mapIndex: raw.mapIndex, mapName: raw.mapName, phaseBucket: raw.phaseBucket,
                trueFamilyId: raw.trueFamilyId, subjectPlayerId: raw.subjectPlayerId,
                subjectSeat: raw.subjectSeat, stateKey: key,
            };
            candidates.push({ ...withoutPriority, priority: candidatePriority(withoutPriority) });
        }
        unmatchedLabels += labels.size - matched.size;
    }
    return { candidates, scan: { rolloutRows, joinedRows, unmatchedLabels, exclusions } };
}

async function materializeSelected(selected: PilotCandidate[], pairs: SourcePair[]): Promise<Array<Record<string, unknown>>> {
    const wantedBySource = new Map<string, Set<string>>();
    for (const item of selected) {
        const set = wantedBySource.get(item.sourceId) ?? new Set<string>();
        set.add(item.stateKey);
        wantedBySource.set(item.sourceId, set);
    }
    const rows: Array<Record<string, unknown>> = [];
    for (const pair of pairs) {
        const wanted = wantedBySource.get(pair.id);
        if (!wanted || wanted.size === 0) continue;
        const labels = await loadLabels(pair);
        const found = new Set<string>();
        for await (const { line, value } of jsonLines(pair.rolloutPath)) {
            const raw = value as unknown as RawRow;
            const key = stateKey(raw);
            if (!wanted.has(key) || found.has(key)) continue;
            const label = labels.get(key);
            if (!label) throw new Error(`${pair.id}:${line} 选中状态缺少标签`);
            validateJoinMetadata(raw, label, `${pair.id}:${line}`);
            const state = JSON.parse(raw.stateJson) as GameState;
            if (state.currentPlayer !== raw.subjectPlayerId) {
                throw new Error(`${pair.id}:${line} state.currentPlayer与subjectPlayerId不一致`);
            }
            const engine = new GameEngine(state);
            const legal: Action[] = engine.isTerminal() ? []
                : engine.getLegalActions(raw.subjectPlayerId).filter((action) => action.type !== 'surrender');
            const ordered = canonicalActionOrderV16(legal);
            if (ordered.length === 0) throw new Error(`${pair.id}:${line} 权威候选集为空`);
            const codes = ordered.map((item) => item.code);
            const aligned = alignTeacherScores(codes, label);
            const pathFacts = encodePathRelations(state, raw.subjectPlayerId, ordered.map((item) => item.action));
            const encoded = encodeGameStateSpatial(state, raw.subjectPlayerId, 'v2', {
                channels: SPATIAL_TENSOR_CHANNELS_V19,
            });
            const candidateActions = ordered.map((item, index) => {
                const base = encodeCandidateActionSpatial(state, raw.subjectPlayerId, item.action, 'v2', 'v15_current');
                return {
                    actionCode: item.code, action: item.action,
                    actorCoord: base.actorCoord, landingCoord: base.landingCoord, targetCoord: base.targetCoord,
                    semantics: appendPathSemantics(Array.from(base.semantics), pathFacts[index]),
                    pathRelations: pathFacts[index], teacherScore: aligned.scores[index],
                };
            });
            const spatialTensor = Array.from(encoded.spatialTensor);
            const globalFeatures = Array.from(encoded.globalFeatures);
            const inputIdentity = path3InputIdentity({ spatialTensor, globalFeatures, candidateActions });
            rows.push({
                schema: 'v19_path3_replay_row_1',
                sampleId: `${pair.id}|${key}`,
                split: familySplit(raw.trueFamilyId), splitContractId: PATH3_SPLIT_ID,
                splitEvidenceLimitation: '训练源内部hash切分；可能已被历史预训练消费，不是独立棋力证据。',
                sourcePolicy: raw.sourcePolicy, sourceId: pair.id,
                mapIndex: raw.mapIndex, mapName: raw.mapName,
                trueFamilyId: raw.trueFamilyId, rootFamilyId: raw.rootFamilyId,
                subjectSeat: raw.subjectSeat, subjectPlayerId: raw.subjectPlayerId,
                subjectAllianceId: raw.subjectAllianceId,
                seed: raw.seed, rootId: raw.rootId, gameId: raw.gameId,
                stepIndex: raw.stepIndex, turn: raw.turn, completedPlayerTurns: raw.completedPlayerTurns,
                phaseBucket: raw.phaseBucket, stateHash: raw.stateHash,
                encoderSchemaId: PATH3_SCHEMA_ID,
                baseEncoderSchemaId: ENCODER_SCHEMA_ID_V19,
                spatialChannels: 34, globalFeatureDim: globalFeatures.length, actionSemanticDim: 56,
                candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
                inputIdentityId: PATH3_INPUT_IDENTITY_ID, inputIdentity,
                spatialTensor, globalFeatures, candidateActions,
                orderedActionCodes: codes,
                teacher: {
                    targetPolicyId: 'L1', targetVersion: label.targetVersion,
                    selectionContractId: label.selectionContractId, jitterContractId: label.jitterContractId,
                    labelEvidenceKind: label.labelEvidenceKind,
                    targetActionCode: label.targetActionCode,
                    targetActionIndex: aligned.targetActionIndex,
                    actionCodes: codes, rawScores: aligned.scores,
                    softTargetRule: PATH3_SOFT_TARGET_RULE,
                    note: '旧targetActionIndex与scores.actionIndex均未复用；只按actionCode对齐后重建。',
                },
                behaviorActionCode: raw.behaviorActionCode,
            });
            found.add(key);
        }
        const missing = [...wanted].filter((key) => !found.has(key));
        if (missing.length > 0) throw new Error(`${pair.id} 二次读取缺少选中状态：${missing.join(',')}`);
    }
    return rows.sort((a, b) => String(a.sampleId).localeCompare(String(b.sampleId)));
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function main(): Promise<void> {
    const outIndex = process.argv.indexOf('--out-dir');
    if (outIndex < 0 || !process.argv[outIndex + 1]) throw new Error('缺少 --out-dir');
    const maxIndex = process.argv.indexOf('--max-per-cell');
    const maxPerCell = Number(maxIndex >= 0 ? process.argv[maxIndex + 1] : '4');
    if (!Number.isInteger(maxPerCell) || maxPerCell < 1 || maxPerCell > 128) {
        throw new Error('--max-per-cell 必须是1..128');
    }
    const tagIndex = process.argv.indexOf('--tag');
    const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : 'pilot';
    if (!tag || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(tag)) {
        throw new Error('--tag 必须是1..32位小写字母、数字、下划线或连字符，且以字母或数字开头');
    }
    const outDir = path.resolve(process.argv[outIndex + 1]);
    if (fs.existsSync(outDir)) throw new Error(`输出目录已存在，拒绝覆盖：${outDir}`);
    const pairs = sourcePairs();
    for (const pair of pairs) {
        if (!fs.existsSync(pair.rolloutPath) || !fs.existsSync(pair.labelPath)) {
            throw new Error(`缺少源文件：${pair.rolloutPath} 或 ${pair.labelPath}`);
        }
    }
    const started = Date.now();
    const scanStarted = Date.now();
    const scan = await scanCandidates(pairs);
    const scanMs = Date.now() - scanStarted;
    const selected = selectPilotCandidates(scan.candidates, maxPerCell);
    if (selected.length > 3840) throw new Error(`数据集超过3840状态：${selected.length}`);
    const encodeStarted = Date.now();
    const rows = await materializeSelected(selected, pairs);
    const encodeMs = Date.now() - encodeStarted;
    if (rows.length !== selected.length) throw new Error(`物化行数 ${rows.length} != 选中数 ${selected.length}`);

    const trainFamilies = new Set(rows.filter((row) => row.split === 'train').map((row) => String(row.trueFamilyId)));
    const holdoutFamilies = new Set(rows.filter((row) => row.split === 'holdout').map((row) => String(row.trueFamilyId)));
    const familyIntersection = [...trainFamilies].filter((family) => holdoutFamilies.has(family)).sort();
    if (familyIntersection.length > 0) throw new Error(`train/holdout家族交集非空：${familyIntersection.join(',')}`);
    const sourcePolicies = [...new Set(scan.candidates.map((item) => item.sourcePolicy))].sort();
    if (sourcePolicies.length !== 2) {
        throw new Error(`必须恰有2个sourcePolicy以构成30格，实际=${sourcePolicies.join(',')}`);
    }
    const availableCells = countBy(scan.candidates, phaseCell);
    const selectedCells = countBy(selected, phaseCell);
    const expectedCells = [...Array(5).keys()].flatMap((mapIndex) =>
        sourcePolicies.flatMap((source) =>
            PHASES.map((phase) => `${mapIndex}|${source}|${phase}`)));
    if (expectedCells.length !== 30) throw new Error(`预期30格，实际=${expectedCells.length}`);
    const missingCells = expectedCells.filter((cell) => !(cell in availableCells));
    const familyPhaseCounts = countBy(selected, (item) => `${item.trueFamilyId}|${item.phaseBucket}`);
    const maxObservedFamilyPhase = Math.max(0, ...Object.values(familyPhaseCounts));
    if (maxObservedFamilyPhase > MAX_PER_FAMILY_PHASE) throw new Error('family×phase配额超过16');

    fs.mkdirSync(outDir, { recursive: false });
    const datasetPath = path.join(outDir, 'path3_replay.jsonl');
    fs.writeFileSync(datasetPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    const sourceFiles = pairs.flatMap((pair) => [pair.rolloutPath, pair.labelPath])
        .sort().map((file) => ({ path: file, sha256: sha256File(file), bytes: fs.statSync(file).size }));
    const toolFiles = ['v19/tools/build_path3_replay.ts', 'v19/encoding/path_relations.ts']
        .map((file) => ({ path: file, sha256: sha256File(file), bytes: fs.statSync(file).size }));
    const manifest = {
        schema: 'v19_path3_replay_manifest_1', generatedAt: new Date().toISOString(),
        tag, role: tag === 'full' ? 'bounded_full_replay' : 'bounded_replay',
        purpose: 'Path-3有界离线监督数据；只准备数据，不训练。',
        contracts: {
            encoderSchemaId: PATH3_SCHEMA_ID, baseEncoderSchemaId: ENCODER_SCHEMA_ID_V19,
            spatialChannels: 34, globalFeatureDim: 20, actionSemanticDim: 56,
            appendedSemanticOrder: ['reachableCapturableBuilding', 'normalizedNearestCapturableCost',
                'normalizedCapturableCostReduction'],
            candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
            joinKey: 'stateHash|subjectPlayerId', samplingId: PATH3_SAMPLING_ID,
            splitId: PATH3_SPLIT_ID, maxPerCell, maxPerFamilyPhase: MAX_PER_FAMILY_PHASE,
            cellDefinition: 'mapIndex×sourcePolicy×phaseBucket（5×2×3=30）',
            inputIdentityId: PATH3_INPUT_IDENTITY_ID,
            softTargetRule: PATH3_SOFT_TARGET_RULE,
            teacherIsolation: '三个路径事实只由state/action规则计算；teacher raw scores只作监督标签，不进入输入。',
            indexRule: '旧targetActionIndex与scores.actionIndex均丢弃，只按actionCode在权威规范候选顺序中重建。',
        },
        independenceLimit: 'trueFamilyId哈希train/holdout仅为训练源内部诊断切分；家族可能已被历史预训练消费，不能作为独立棋力证据。',
        sources: { files: sourceFiles, tools: toolFiles },
        output: { path: path.relative(ROOT, datasetPath).replaceAll('\\', '/'), sha256: sha256File(datasetPath), rows: rows.length },
        coverage: {
            expectedCells: expectedCells.length, availableCells: Object.keys(availableCells).length,
            missingCells, availableByCell: availableCells, selectedByCell: selectedCells,
            selectedByMap: countBy(selected, (item) => String(item.mapIndex)),
            selectedBySourcePolicy: countBy(selected, (item) => item.sourcePolicy),
            selectedByPhase: countBy(selected, (item) => item.phaseBucket),
            selectedBySeat: countBy(selected, (item) => String(item.subjectPlayerId)),
            selectedBySplit: countBy(rows, (item) => String(item.split)),
            selectedBySplitMapSourcePhase: countBy(rows, (item) => [item.split, item.mapIndex,
                item.sourcePolicy, item.phaseBucket].join('|')),
            maxObservedFamilyPhase, selectedFamilies: new Set(selected.map((item) => item.trueFamilyId)).size,
            underfilledCells: expectedCells.filter((cell) => (selectedCells[cell] ?? 0) < maxPerCell)
                .map((cell) => ({ cell, selected: selectedCells[cell] ?? 0, requested: maxPerCell })),
        },
        distributions: (() => {
            const legalActionCounts = rows.map((row) => (row.candidateActions as unknown[]).length);
            const allTeacherScores = rows.flatMap((row) => {
                const teacher = row.teacher as { rawScores: number[] };
                return teacher.rawScores;
            });
            const targetTeacherScores = rows.flatMap((row) => {
                const teacher = row.teacher as { rawScores: number[]; targetActionIndex: number | null };
                return teacher.targetActionIndex === null ? [] : [teacher.rawScores[teacher.targetActionIndex]];
            });
            return {
                legalActionCount: numericDistribution(legalActionCounts),
                legalActionCountHistogram: countBy(legalActionCounts, (value) => String(value)),
                teacherRawScore: numericDistribution(allTeacherScores),
                targetTeacherScore: numericDistribution(targetTeacherScores),
                note: '教师原分只作监督标签；上述统计不进入模型输入或inputIdentity。',
            };
        })(),
        familyIsolation: {
            trainFamilies: trainFamilies.size, holdoutFamilies: holdoutFamilies.size,
            intersectionCount: familyIntersection.length, intersection: familyIntersection,
        },
        scan: scan.scan,
        exclusions: {
            ...((scan.scan.exclusions ?? {}) as object),
            note: '候选/标签非法、actionCode集合不一致、座位或联接元数据不一致均直接失败，不计入静默排除。',
        },
        timingMs: { scan: scanMs, encode: encodeMs, total: Date.now() - started },
    };
    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        rows: rows.length, cells: Object.keys(selectedCells).length, missingCells,
        trainFamilies: trainFamilies.size, holdoutFamilies: holdoutFamilies.size,
        datasetSha256: manifest.output.sha256,
        manifest: manifestPath.replaceAll('\\', '/'), timingMs: manifest.timingMs,
    }, null, 2));
}

const entry = (process.argv[1] ?? '').replaceAll('\\', '/');
if (entry.endsWith('v19/tools/build_path3_replay.ts')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exitCode = 1;
    });
}

