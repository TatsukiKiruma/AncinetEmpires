import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { decodeAction, type Observation } from '../src/game/env';
import type { Action, Position } from '../src/game/types';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import type { ImmutableDatasetManifest } from './skirmish_dataset_artifacts';
import { validateFeatureDatasetManifest } from './skirmish_dataset_validate';
import { TrainingProgress } from './skirmish_training_progress';
import { AveragedWeights } from './skirmish_averaged_weights';
import { navigationFeatureTokens } from './skirmish_navigation_features';

export type SparseFeatures = Map<number, number>;
type UnitSnapshot = Observation['units'][number];
type TileSnapshot = Observation['tiles'][number];

export type SparseFeatureEntries = Array<[number, number]>;
export type SkirmishFeatureExtractor = 'hashed-action-v1' | 'hashed-action-v2' | 'hashed-action-v3' | 'hashed-action-v4';

export interface SkirmishFeatureCandidate {
    actionCode: string;
    features: SparseFeatureEntries;
    teacherScore?: number;
    teacherRank?: number;
}

export interface SkirmishFeatureSample {
    kind: 'skirmish_feature_sample';
    version: 1;
    featureExtractor: SkirmishFeatureExtractor;
    featureDim: number;
    source: SkirmishDatasetSample['source'];
    scenario: SkirmishDatasetSample['scenario'];
    seed: number;
    step: number;
    turn: number;
    playerId: number;
    policy: string;
    label: {
        fixedActionIndex: number;
        actionCode: string;
        originalActionCode?: string;
        relabel?: {
            method: 'heuristic' | 'fast-rollout';
            scoreMargin: number;
            rolloutDepth: number;
        };
    };
    candidates: SkirmishFeatureCandidate[];
}

export type SkirmishBcInputSample = SkirmishDatasetSample | SkirmishFeatureSample;
export type SkirmishBcObjective = 'label' | 'teacher-rank' | 'mixed';

interface TrainingCandidate {
    actionCode: string;
    features: SparseFeatures;
    teacherScore: number | null;
}

export interface SkirmishBcTrainOptions {
    initialModel?: string;
    averageWeights?: boolean;
    saveEpochs?: boolean;
    selectBest?: boolean;
    trainFile: string;
    datasetManifest?: string | null;
    extraTrainFiles: string[];
    extraTrainRepeat: number;
    valFile: string | null;
    outFile: string;
    epochs: number;
    learningRate: number;
    teacherWeight: number;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    objective: SkirmishBcObjective;
    maxCandidates: number | null;
    limitTrainSamples: number | null;
    limitValSamples: number | null;
    json: boolean;
    progress?: boolean;
    progressIntervalMs?: number;
}

export interface SkirmishBcModel {
    initialModelSha256?: string;
    averagedWeights?: boolean;
    kind: 'skirmish_bc_ranker';
    version: 1;
    featureExtractor: SkirmishFeatureExtractor;
    featureDim: number;
    weights: number[];
    epochs: number;
    learningRate: number;
    teacherWeight?: number;
    maxCandidates: number | null;
    trainedSamples: number;
    createdAt: string;
    objective?: SkirmishBcObjective;
    datasetId?: string;
}

export interface SkirmishBcMetrics {
    samples: number;
    correct: number;
    accuracy: number;
    skipped: number;
    averageCandidates: number;
}

export interface SkirmishBcEpochSummary {
    epoch: number;
    train: SkirmishBcMetrics;
    val: SkirmishBcMetrics | null;
}

export interface SkirmishBcTrainSummary {
    trainFile: string;
    datasetManifest?: string | null;
    trainFiles?: string[];
    validationFiles?: string[];
    extraTrainFiles: string[];
    extraTrainRepeat: number;
    valFile: string | null;
    outFile: string;
    epochs: SkirmishBcEpochSummary[];
    model: Omit<SkirmishBcModel, 'weights'> & { nonZeroWeights: number };
}

const DEFAULT_MODEL_DIR = path.resolve(process.cwd(), 'training_runs', 'models');
const DEFAULT_FEATURE_EXTRACTOR: SkirmishFeatureExtractor = 'hashed-action-v2';
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_MODEL_DIR, `skirmish-bc-${nowFileStamp()}.json`);
}

function printHelp() {
    console.log(`用法: npm run train:skirmish:bc -- (--train <file> | --dataset-manifest <file>) [选项]

选项:
  --train <file>             训练集 JSONL
  --dataset-manifest <file>  内容寻址分片数据集 manifest；自动加载 train/validation
  --extra-train <file>       追加训练集 JSONL，可重复；用于小批 curated 数据
  --extra-train-repeat <n>   每个 epoch 重复追加训练集次数，默认 1
  --val <file>               验证集 JSONL
  --out <file>               模型输出文件，默认 training_runs/models/skirmish-bc-时间戳.json
  --epochs <n>               训练轮数，默认 3
  --average-weights          对逐样本更新后的权重求平均
  --save-epochs              逐轮保存模型到 <out>.epoch-<n>.json
  --select-best              输出验证命中率最高的轮次；平分保留较早轮次
  --initial-model <file>     从兼容模型继续训练；记录来源哈希，重新累计平均权重
  --learning-rate <n>        学习率，默认 0.1
  --feature-dim <n>          哈希特征维度，默认 16384
  --feature-extractor <name> 特征版本，默认 hashed-action-v2；可选 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4
  --objective <name>         训练目标，默认 label；可选 label、teacher-rank、mixed
  --teacher-weight <n>       mixed 目标中 teacher-rank 更新权重，默认 0.25
  --max-candidates <n>       每步最多比较多少个合法动作，默认全量
  --limit-train-samples <n>  最多读取多少条训练样本，用于 smoke test
  --limit-val-samples <n>    最多读取多少条验证样本
  --json                     摘要输出 JSON
  --no-progress              关闭实时进度；默认输出到 stderr，不影响 JSON
  --progress-interval-ms <n>  进度刷新间隔，默认 2000 毫秒
  --help                     显示帮助
`);
}

function parseInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
    return parsed;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

function parsePositiveNumber(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} 必须是正数`);
    return parsed;
}

function parseNonNegativeNumber(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} 必须是非负数`);
    return parsed;
}

export function parseBcTrainArgs(argv: readonly string[]): SkirmishBcTrainOptions {
    const options: SkirmishBcTrainOptions = {
        trainFile: '',
        datasetManifest: null,
        extraTrainFiles: [],
        extraTrainRepeat: 1,
        valFile: null,
        outFile: defaultOutFile(),
        epochs: 3,
        learningRate: 0.1,
        teacherWeight: 0.25,
        featureDim: 16384,
        featureExtractor: DEFAULT_FEATURE_EXTRACTOR,
        objective: 'label',
        maxCandidates: null,
        limitTrainSamples: null,
        limitValSamples: null,
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--train') {
            const value = argv[++i];
            if (!value) throw new Error('--train 缺少文件参数');
            options.trainFile = path.resolve(value);
        } else if (arg === '--dataset-manifest') {
            const value = argv[++i];
            if (!value) throw new Error('--dataset-manifest 缺少文件参数');
            options.datasetManifest = path.resolve(value);
        } else if (arg === '--extra-train') {
            const value = argv[++i];
            if (!value) throw new Error('--extra-train 缺少文件参数');
            options.extraTrainFiles.push(path.resolve(value));
        } else if (arg === '--extra-train-repeat') {
            options.extraTrainRepeat = parsePositiveInteger(argv[++i], '--extra-train-repeat');
        } else if (arg === '--val') {
            const value = argv[++i];
            if (!value) throw new Error('--val 缺少文件参数');
            options.valFile = path.resolve(value);
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--initial-model') {
            const value = argv[++i];
            if (!value) throw new Error('--initial-model 缺少模型文件参数');
            options.initialModel = path.resolve(value);
        } else if (arg === '--average-weights') {
            options.averageWeights = true;
        } else if (arg === '--save-epochs') {
            options.saveEpochs = true;
        } else if (arg === '--select-best') {
            options.selectBest = true;
        } else if (arg === '--epochs') {
            options.epochs = parsePositiveInteger(argv[++i], '--epochs');
        } else if (arg === '--learning-rate') {
            options.learningRate = parsePositiveNumber(argv[++i], '--learning-rate');
        } else if (arg === '--teacher-weight') {
            options.teacherWeight = parseNonNegativeNumber(argv[++i], '--teacher-weight');
        } else if (arg === '--feature-dim') {
            options.featureDim = parsePositiveInteger(argv[++i], '--feature-dim');
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++i]);
        } else if (arg === '--objective') {
            options.objective = parseObjective(argv[++i]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parsePositiveInteger(argv[++i], '--max-candidates');
        } else if (arg === '--limit-train-samples') {
            options.limitTrainSamples = parsePositiveInteger(argv[++i], '--limit-train-samples');
        } else if (arg === '--limit-val-samples') {
            options.limitValSamples = parsePositiveInteger(argv[++i], '--limit-val-samples');
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--no-progress') {
            options.progress = false;
        } else if (arg === '--progress-interval-ms') {
            options.progressIntervalMs = parsePositiveInteger(argv[++i], '--progress-interval-ms');
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!options.trainFile && !options.datasetManifest) {
        throw new Error('请用 --train 指定训练集 JSONL，或用 --dataset-manifest 指定分片数据集');
    }
    if (options.trainFile && options.datasetManifest) {
        throw new Error('--train 与 --dataset-manifest 不能同时使用');
    }
    return options;
}

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3' || value === 'hashed-action-v4') return value;
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2、hashed-action-v3 或 hashed-action-v4');
}

function parseObjective(value: string | undefined): SkirmishBcObjective {
    if (value === 'label' || value === 'teacher-rank' || value === 'mixed') return value;
    throw new Error('--objective 只能是 label、teacher-rank 或 mixed');
}

function hashFeature(name: string, featureDim: number): number {
    let hash = 2166136261;
    for (let i = 0; i < name.length; i += 1) {
        hash ^= name.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % featureDim;
}

function addFeature(features: SparseFeatures, featureDim: number, name: string, value = 1) {
    if (!Number.isFinite(value) || value === 0) return;
    const index = hashFeature(name, featureDim);
    features.set(index, (features.get(index) ?? 0) + value);
}

function bucket(value: number, cuts: readonly number[]): string {
    for (const cut of cuts) {
        if (value <= cut) return `<=${cut}`;
    }
    return `>${cuts.at(-1) ?? 0}`;
}

function hpBucket(unit: UnitSnapshot): string {
    const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
    if (ratio <= 0.25) return '<=25%';
    if (ratio <= 0.5) return '<=50%';
    if (ratio <= 0.75) return '<=75%';
    return '>75%';
}

function unitById(observation: Observation | undefined): Map<string, UnitSnapshot> {
    return new Map((observation?.units ?? []).map(unit => [unit.id, unit]));
}

function tileKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

function tileByPos(observation: Observation | undefined): Map<string, TileSnapshot> {
    return new Map((observation?.tiles ?? []).map(tile => [tileKey(tile), tile]));
}

function relationToPlayer(observation: Observation | undefined, playerId: number, ownerId: number | null | undefined): string {
    if (ownerId === null || ownerId === undefined) return 'neutral';
    if (ownerId === playerId) return 'self';
    const self = observation?.players.find(player => player.id === playerId);
    const other = observation?.players.find(player => player.id === ownerId);
    if (self && other && self.allianceId === other.allianceId) return 'ally';
    return 'enemy';
}

function getActorId(action: Action): string | null {
    switch (action.type) {
        case 'move':
        case 'post_attack_move':
        case 'capture':
        case 'repair':
        case 'destroy_town':
        case 'wait':
            return action.unitId;
        case 'attack':
            return action.attackerId;
        case 'heal':
            return action.healerId;
        case 'support':
            return action.supporterId;
        case 'summon':
            return action.summonerId;
        default:
            return null;
    }
}

function getTargetUnitId(action: Action): string | null {
    switch (action.type) {
        case 'attack':
        case 'heal':
        case 'support':
            return action.targetId;
        default:
            return null;
    }
}

function getTargetPosition(action: Action, units: Map<string, UnitSnapshot>): Position | null {
    switch (action.type) {
        case 'move':
        case 'post_attack_move':
        case 'recruit_and_deploy':
            return action.to;
        case 'recruit_to_castle':
            return action.castlePos;
        case 'summon':
            return action.spawnPos;
        case 'capture':
        case 'repair':
        case 'destroy_town':
        case 'wait': {
            const unit = units.get(action.unitId);
            return unit ? { x: unit.x, y: unit.y } : null;
        }
        case 'attack':
        case 'heal':
        case 'support': {
            const unit = units.get(action.targetId);
            return unit ? { x: unit.x, y: unit.y } : null;
        }
        default:
            return null;
    }
}

function distanceBucket(from: UnitSnapshot | undefined, to: Position | null): string {
    if (!from || !to) return 'unknown';
    const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    return bucket(distance, [0, 1, 2, 3, 5, 8, 13]);
}

function manhattan(left: Position, right: Position): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function signedBucket(value: number, cuts: readonly number[]): string {
    if (value === 0) return '0';
    const sign = value > 0 ? '+' : '-';
    return `${sign}${bucket(Math.abs(value), cuts)}`;
}

function unitPosition(unit: UnitSnapshot): Position {
    return { x: unit.x, y: unit.y };
}

function normalizedCoordBucket(value: number, size: number): string {
    if (size <= 1) return 'single';
    const ratio = value / Math.max(1, size - 1);
    if (ratio <= 0.25) return 'q1';
    if (ratio <= 0.5) return 'q2';
    if (ratio <= 0.75) return 'q3';
    return 'q4';
}

function edgeDistanceBucket(pos: Position, observation: Observation | undefined): string {
    if (!observation) return 'unknown';
    const distance = Math.min(
        pos.x,
        pos.y,
        Math.max(0, observation.mapWidth - 1 - pos.x),
        Math.max(0, observation.mapHeight - 1 - pos.y)
    );
    return bucket(distance, [0, 1, 2, 4, 8]);
}

function isAliveUnit(unit: UnitSnapshot): boolean {
    return unit.hp > 0;
}

function isEnemyUnit(observation: Observation | undefined, playerId: number, unit: UnitSnapshot): boolean {
    return relationToPlayer(observation, playerId, unit.ownerId) === 'enemy';
}

function nearestUnitDistance(
    observation: Observation | undefined,
    playerId: number,
    pos: Position,
    predicate: (unit: UnitSnapshot) => boolean
): number | null {
    let best: number | null = null;
    for (const unit of observation?.units ?? []) {
        if (!isAliveUnit(unit) || !predicate(unit)) continue;
        const distance = manhattan(pos, unitPosition(unit));
        if (best === null || distance < best) best = distance;
    }
    return best;
}

function isObjectiveTile(observation: Observation | undefined, playerId: number, tile: TileSnapshot): boolean {
    const relation = relationToPlayer(observation, playerId, tile.ownerId);
    if (relation === 'self' || relation === 'ally') return false;
    return tile.terrainKey === 'castle'
        || tile.terrainKey === 'town'
        || tile.terrainKey === 'damaged_town'
        || tile.terrainTags.includes('building');
}

function objectiveTileKind(observation: Observation | undefined, playerId: number, tile: TileSnapshot | undefined): string {
    if (!tile) return 'none';
    const relation = relationToPlayer(observation, playerId, tile.ownerId);
    if (tile.terrainKey === 'castle') return `${relation}-castle`;
    if (tile.terrainKey === 'town' || tile.terrainKey === 'damaged_town') return `${relation}-town`;
    if (tile.terrainTags.includes('building')) return `${relation}-building`;
    return 'none';
}

function nearestObjectiveDistance(
    observation: Observation | undefined,
    playerId: number,
    pos: Position
): number | null {
    let best: number | null = null;
    for (const tile of observation?.tiles ?? []) {
        if (!isObjectiveTile(observation, playerId, tile)) continue;
        const distance = manhattan(pos, tile);
        if (best === null || distance < best) best = distance;
    }
    return best;
}

function nearestTileDistance(
    observation: Observation | undefined,
    pos: Position,
    predicate: (tile: TileSnapshot) => boolean
): number | null {
    let best: number | null = null;
    for (const tile of observation?.tiles ?? []) {
        if (!predicate(tile)) continue;
        const distance = manhattan(pos, tile);
        if (best === null || distance < best) best = distance;
    }
    return best;
}

function isEnemyCastleTile(observation: Observation | undefined, playerId: number, tile: TileSnapshot): boolean {
    return tile.terrainKey === 'castle'
        && relationToPlayer(observation, playerId, tile.ownerId) === 'enemy';
}

function nearestEnemyCastleDistance(
    observation: Observation | undefined,
    playerId: number,
    pos: Position
): number | null {
    return nearestTileDistance(observation, pos, tile => isEnemyCastleTile(observation, playerId, tile));
}

function addDistanceChangeFeatures(
    features: SparseFeatures,
    featureDim: number,
    prefix: string,
    before: number | null,
    after: number | null,
    actionType: string
) {
    if (after !== null) {
        addFeature(features, featureDim, `${prefix}After:${bucket(after, [0, 1, 2, 3, 5, 8, 13, 21])}:action:${actionType}`);
    }
    if (before !== null && after !== null) {
        addFeature(features, featureDim, `${prefix}Delta:${signedBucket(before - after, [0, 1, 2, 3, 5, 8])}:action:${actionType}`);
        addFeature(features, featureDim, `${prefix}Closer:${after < before}:action:${actionType}`);
    }
}

function snapshotUnitValue(unit: UnitSnapshot | undefined): number {
    if (!unit) return 0;
    if (unit.isCommander) return 1200;
    return unit.cost ?? 100;
}

function actionPressureKind(action: Action): 'attack' | 'capture' | 'destroy_town' | 'summon' | 'none' {
    if (
        action.type === 'attack'
        || action.type === 'capture'
        || action.type === 'destroy_town'
        || action.type === 'summon'
    ) {
        return action.type;
    }
    return 'none';
}

function isDirectPressureAction(action: Action): boolean {
    return actionPressureKind(action) !== 'none';
}

interface LegalActionIntentSummary {
    attack: boolean;
    capture: boolean;
    destroyTown: boolean;
    summon: boolean;
    recruit: boolean;
    pressure: boolean;
}

function summarizeLegalActionIntents(actionCodes: readonly string[]): LegalActionIntentSummary {
    const summary: LegalActionIntentSummary = {
        attack: false,
        capture: false,
        destroyTown: false,
        summon: false,
        recruit: false,
        pressure: false
    };

    for (const actionCode of actionCodes) {
        const legalAction = decodeAction(actionCode);
        if (!legalAction) continue;
        if (legalAction.type === 'attack') summary.attack = true;
        if (legalAction.type === 'capture') summary.capture = true;
        if (legalAction.type === 'destroy_town') summary.destroyTown = true;
        if (legalAction.type === 'summon') summary.summon = true;
        if (legalAction.type === 'recruit_to_castle' || legalAction.type === 'recruit_and_deploy') {
            summary.recruit = true;
        }
        if (isDirectPressureAction(legalAction)) summary.pressure = true;
    }

    return summary;
}

const legalActionIntentCache = new WeakMap<SkirmishDatasetSample, LegalActionIntentSummary>();
const warStateCache = new WeakMap<SkirmishDatasetSample, WarStateSummary>();

function getLegalActionIntentsForSample(sample: SkirmishDatasetSample): LegalActionIntentSummary {
    const cached = legalActionIntentCache.get(sample);
    if (cached) return cached;
    const summary = summarizeLegalActionIntents(sample.legalActionCodes);
    legalActionIntentCache.set(sample, summary);
    return summary;
}

function turnPhase(turn: number): string {
    if (turn >= 130) return 'decisive';
    if (turn >= 100) return 'late';
    if (turn >= 60) return 'midlate';
    if (turn >= 25) return 'mid';
    return 'opening';
}

function allianceIdForPlayer(observation: Observation | undefined, playerId: number): number | null {
    return observation?.players.find(player => player.id === playerId)?.allianceId ?? null;
}

function observationArmyValue(observation: Observation | undefined, ownerIds: readonly number[]): number {
    const ownerSet = new Set(ownerIds);
    const goldValue = (observation?.players ?? [])
        .filter(player => ownerSet.has(player.id))
        .reduce((sum, player) => sum + player.gold, 0);
    const unitValue = (observation?.units ?? [])
        .filter(unit => ownerSet.has(unit.ownerId) && isAliveUnit(unit))
        .reduce((sum, unit) => sum + Math.floor(snapshotUnitValue(unit) * unit.hp / Math.max(1, unit.maxHp)), 0);
    return goldValue + unitValue;
}

interface WarStateSummary {
    selfValue: number;
    strongestEnemyValue: number;
    valueDiff: number;
    selfUnits: number;
    enemyUnits: number;
    enemyCommanders: number;
    enemyOnlyLowValueUnits: boolean;
    clearlyAhead: boolean;
}

function summarizeWarState(observation: Observation | undefined, playerId: number): WarStateSummary {
    const selfAlliance = allianceIdForPlayer(observation, playerId);
    const alliancePlayers = new Map<number, number[]>();
    for (const player of observation?.players ?? []) {
        if (!player.isEnabled) continue;
        const players = alliancePlayers.get(player.allianceId) ?? [];
        players.push(player.id);
        alliancePlayers.set(player.allianceId, players);
    }

    const selfOwnerIds = selfAlliance === null ? [playerId] : (alliancePlayers.get(selfAlliance) ?? [playerId]);
    const enemyOwnerIds = [...alliancePlayers.entries()]
        .filter(([allianceId]) => allianceId !== selfAlliance)
        .flatMap(([, ownerIds]) => ownerIds);
    const selfUnits = (observation?.units ?? []).filter(unit => (
        selfOwnerIds.includes(unit.ownerId) && isAliveUnit(unit)
    ));
    const enemyUnits = (observation?.units ?? []).filter(unit => (
        enemyOwnerIds.includes(unit.ownerId) && isAliveUnit(unit)
    ));
    const selfValue = observationArmyValue(observation, selfOwnerIds);
    const strongestEnemyValue = Math.max(
        0,
        ...[...alliancePlayers.entries()]
            .filter(([allianceId]) => allianceId !== selfAlliance)
            .map(([, ownerIds]) => observationArmyValue(observation, ownerIds))
    );
    const valueDiff = selfValue - strongestEnemyValue;
    const enemyCommanders = enemyUnits.filter(unit => unit.isCommander).length;
    const enemyOnlyLowValueUnits = enemyUnits.length > 0
        && enemyUnits.every(unit => !unit.isCommander && snapshotUnitValue(unit) <= 250);
    const clearlyAhead = valueDiff >= 1500
        || (selfValue >= strongestEnemyValue * 1.35 && selfUnits.length >= enemyUnits.length + 2)
        || (enemyUnits.length <= 2 && selfUnits.length >= enemyUnits.length + 3);

    return {
        selfValue,
        strongestEnemyValue,
        valueDiff,
        selfUnits: selfUnits.length,
        enemyUnits: enemyUnits.length,
        enemyCommanders,
        enemyOnlyLowValueUnits,
        clearlyAhead
    };
}

function getWarStateForSample(sample: SkirmishDatasetSample): WarStateSummary {
    const cached = warStateCache.get(sample);
    if (cached) return cached;
    const summary = summarizeWarState(sample.observation, sample.playerId);
    warStateCache.set(sample, summary);
    return summary;
}

function advantageBucket(summary: WarStateSummary): string {
    if (summary.valueDiff <= -1500) return 'far-behind';
    if (summary.valueDiff < -500) return 'behind';
    if (summary.valueDiff <= 500) return 'close';
    if (summary.valueDiff < 1500) return 'ahead';
    return 'dominant';
}

function isLowTempoAction(action: Action): boolean {
    return action.type === 'wait'
        || action.type === 'end_turn'
        || action.type === 'heal'
        || action.type === 'support'
        || action.type === 'repair';
}

function addBooleanActionFeature(
    features: SparseFeatures,
    featureDim: number,
    name: string,
    value: boolean,
    actionType: string
) {
    addFeature(features, featureDim, `${name}:${value}:action:${actionType}`);
}

function estimateDamage(attacker: UnitSnapshot | undefined, defender: UnitSnapshot | undefined): number {
    if (!attacker || !defender) return 0;
    const defenderDefense = attacker.attackType === 'magic'
        ? defender.magicDefense
        : defender.physicalDefense;
    const terrainDefense = defender.abilities.includes('flying') ? 0 : (defender.tileDefenseBonus ?? 0);
    const hpRatio = attacker.abilities.includes('fighting_spirit')
        ? 1
        : attacker.hp / Math.max(1, attacker.maxHp);
    return Math.max(0, Math.floor((attacker.attack - defenderDefense - terrainDefense) * hpRatio));
}

function canLikelyCounter(attacker: UnitSnapshot | undefined, defender: UnitSnapshot | undefined): boolean {
    if (!attacker || !defender) return false;
    const distance = manhattan(unitPosition(attacker), unitPosition(defender));
    return distance >= defender.minRange && distance <= defender.maxRange;
}

function readyUnitCount(observation: Observation | undefined, playerId: number): number {
    return (observation?.units ?? []).filter(unit => (
        unit.ownerId === playerId
        && isAliveUnit(unit)
        && !unit.hasActed
        && !unit.isPending
    )).length;
}

function canCaptureTile(actor: UnitSnapshot | undefined, tile: TileSnapshot | undefined): boolean {
    if (!actor || !tile) return false;
    if (tile.terrainKey === 'castle') return actor.abilities.includes('castle_capturer');
    if (tile.terrainKey === 'town' || tile.terrainKey === 'damaged_town' || tile.terrainTags.includes('building')) {
        return actor.abilities.includes('village_capturer') || actor.abilities.includes('castle_capturer');
    }
    return false;
}

function addV2CandidateFeatures(
    features: SparseFeatures,
    featureDim: number,
    sample: SkirmishDatasetSample,
    action: Action,
    context: {
        actor: UnitSnapshot | undefined;
        targetUnit: UnitSnapshot | undefined;
        targetPos: Position | null;
        targetTile: TileSnapshot | undefined;
    }
) {
    const observation = sample.observation;
    const actionType = action.type;
    const { actor, targetUnit, targetPos, targetTile } = context;

    addFeature(features, featureDim, `readyUnits:${bucket(readyUnitCount(observation, sample.playerId), [0, 1, 2, 3, 5, 8, 13, 21])}:action:${actionType}`);
    addFeature(features, featureDim, `enemyUnits:${bucket((observation?.units ?? []).filter(unit => isEnemyUnit(observation, sample.playerId, unit)).length, [0, 1, 3, 5, 8, 13, 21])}:action:${actionType}`);

    if (targetPos) {
        addFeature(features, featureDim, `targetX:${normalizedCoordBucket(targetPos.x, observation?.mapWidth ?? 1)}:action:${actionType}`);
        addFeature(features, featureDim, `targetY:${normalizedCoordBucket(targetPos.y, observation?.mapHeight ?? 1)}:action:${actionType}`);
        addFeature(features, featureDim, `targetEdge:${edgeDistanceBucket(targetPos, observation)}:action:${actionType}`);

        const beforePos = actor ? unitPosition(actor) : targetPos;
        addDistanceChangeFeatures(
            features,
            featureDim,
            'enemyDistance',
            nearestUnitDistance(observation, sample.playerId, beforePos, unit => isEnemyUnit(observation, sample.playerId, unit)),
            nearestUnitDistance(observation, sample.playerId, targetPos, unit => isEnemyUnit(observation, sample.playerId, unit)),
            actionType
        );
        addDistanceChangeFeatures(
            features,
            featureDim,
            'objectiveDistance',
            nearestObjectiveDistance(observation, sample.playerId, beforePos),
            nearestObjectiveDistance(observation, sample.playerId, targetPos),
            actionType
        );
        addDistanceChangeFeatures(
            features,
            featureDim,
            'commanderDistance',
            nearestUnitDistance(observation, sample.playerId, beforePos, unit => (
                unit.isCommander && isEnemyUnit(observation, sample.playerId, unit)
            )),
            nearestUnitDistance(observation, sample.playerId, targetPos, unit => (
                unit.isCommander && isEnemyUnit(observation, sample.playerId, unit)
            )),
            actionType
        );
    }

    if (targetTile) {
        addFeature(features, featureDim, `targetCapturable:${canCaptureTile(actor, targetTile)}:action:${actionType}`);
        addFeature(features, featureDim, `targetObjective:${isObjectiveTile(observation, sample.playerId, targetTile)}:action:${actionType}`);
    }

    if (action.type === 'attack' && actor && targetUnit) {
        const damage = Math.min(targetUnit.hp, estimateDamage(actor, targetUnit));
        const killsTarget = damage >= targetUnit.hp;
        const counterDamage = killsTarget || !canLikelyCounter(actor, targetUnit)
            ? 0
            : Math.min(actor.hp, estimateDamage(targetUnit, actor));
        const targetValue = snapshotUnitValue(targetUnit);
        const actorValue = snapshotUnitValue(actor);
        const tradeValue = (killsTarget ? targetValue : Math.floor(targetValue * damage / Math.max(1, targetUnit.hp)))
            - Math.floor(actorValue * counterDamage / Math.max(1, actor.hp));

        addFeature(features, featureDim, `attackDamage:${bucket(damage, [0, 1, 10, 25, 50, 75, 100])}`);
        addFeature(features, featureDim, `attackDamageRatio:${bucket(Math.floor(damage * 100 / Math.max(1, targetUnit.hp)), [0, 25, 50, 75, 99, 100])}`);
        addFeature(features, featureDim, `attackKills:${killsTarget}`);
        addFeature(features, featureDim, `attackKillsCommander:${killsTarget && targetUnit.isCommander}`);
        addFeature(features, featureDim, `attackCounterDamage:${bucket(counterDamage, [0, 1, 10, 25, 50, 75, 100])}`);
        addFeature(features, featureDim, `attackTrade:${signedBucket(tradeValue, [0, 100, 250, 500, 1000, 2000])}`);
        addFeature(features, featureDim, `attackTargetValue:${bucket(targetValue, [0, 100, 150, 250, 400, 600, 800, 1200])}`);
    }

    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        const player = observation?.players.find(item => item.id === sample.playerId);
        const cost = player?.recruitCosts[action.unitClass] ?? 0;
        addFeature(features, featureDim, `recruitCost:${bucket(cost, [0, 150, 250, 400, 600, 800, 1000])}`);
        addFeature(features, featureDim, `goldAfterRecruit:${bucket((player?.gold ?? 0) - cost, [-1000, -1, 0, 100, 250, 500, 1000, 2000])}`);
    }

    if (action.type === 'wait' || action.type === 'end_turn' || action.type === 'surrender') {
        addFeature(features, featureDim, `finishAction:${actionType}`);
    }
}

function addV3CandidateFeatures(
    features: SparseFeatures,
    featureDim: number,
    sample: SkirmishDatasetSample,
    action: Action,
    context: {
        actor: UnitSnapshot | undefined;
        targetUnit: UnitSnapshot | undefined;
        targetPos: Position | null;
        targetTile: TileSnapshot | undefined;
    }
) {
    const observation = sample.observation;
    const actionType = action.type;
    const { actor, targetUnit, targetPos, targetTile } = context;
    const legalIntents = getLegalActionIntentsForSample(sample);
    const warState = getWarStateForSample(sample);
    const phase = turnPhase(sample.turn);
    const pressureKind = actionPressureKind(action);

    addFeature(features, featureDim, `turnPhase:${phase}:action:${actionType}`);
    addFeature(features, featureDim, `warAdvantage:${advantageBucket(warState)}:action:${actionType}`);
    addFeature(features, featureDim, `armyValueDiff:${signedBucket(warState.valueDiff, [0, 250, 750, 1500, 3000, 6000])}:action:${actionType}`);
    addFeature(features, featureDim, `selfArmyValue:${bucket(warState.selfValue, [0, 500, 1000, 2000, 4000, 8000, 12000])}:action:${actionType}`);
    addFeature(features, featureDim, `enemyArmyValue:${bucket(warState.strongestEnemyValue, [0, 500, 1000, 2000, 4000, 8000, 12000])}:action:${actionType}`);
    addFeature(features, featureDim, `selfAliveUnits:${bucket(warState.selfUnits, [0, 1, 2, 3, 5, 8, 13, 21, 30])}:action:${actionType}`);
    addFeature(features, featureDim, `enemyAliveUnitsV3:${bucket(warState.enemyUnits, [0, 1, 2, 3, 5, 8, 13, 21, 30])}:action:${actionType}`);
    addFeature(features, featureDim, `enemyCommanders:${bucket(warState.enemyCommanders, [0, 1, 2, 3])}:action:${actionType}`);
    addBooleanActionFeature(features, featureDim, 'enemyOnlyLowValueUnits', warState.enemyOnlyLowValueUnits, actionType);
    addBooleanActionFeature(features, featureDim, 'clearlyAhead', warState.clearlyAhead, actionType);

    addBooleanActionFeature(features, featureDim, 'legalCanAttack', legalIntents.attack, actionType);
    addBooleanActionFeature(features, featureDim, 'legalCanCapture', legalIntents.capture, actionType);
    addBooleanActionFeature(features, featureDim, 'legalCanDestroyTown', legalIntents.destroyTown, actionType);
    addBooleanActionFeature(features, featureDim, 'legalCanSummon', legalIntents.summon, actionType);
    addBooleanActionFeature(features, featureDim, 'legalCanRecruit', legalIntents.recruit, actionType);
    addBooleanActionFeature(features, featureDim, 'legalCanPressure', legalIntents.pressure, actionType);
    addFeature(features, featureDim, `chosenPressure:${pressureKind}:phase:${phase}`);

    if (targetUnit) {
        const targetRelation = relationToPlayer(observation, sample.playerId, targetUnit.ownerId);
        addFeature(features, featureDim, `targetPriority:${targetRelation}:${targetUnit.isCommander ? 'commander' : 'unit'}:action:${actionType}`);
        addFeature(features, featureDim, `targetUnitValueV3:${bucket(snapshotUnitValue(targetUnit), [0, 100, 150, 250, 400, 600, 800, 1200])}:action:${actionType}`);
    }

    if (targetTile) {
        addFeature(features, featureDim, `targetObjectiveKind:${objectiveTileKind(observation, sample.playerId, targetTile)}:action:${actionType}`);
    }

    let moveCloserToEnemy = false;
    let moveCloserToObjective = false;
    let moveCloserToEnemyCastle = false;
    let moveCloserToCommander = false;

    if (targetPos) {
        const beforePos = actor ? unitPosition(actor) : targetPos;
        const enemyBefore = nearestUnitDistance(observation, sample.playerId, beforePos, unit => (
            isEnemyUnit(observation, sample.playerId, unit)
        ));
        const enemyAfter = nearestUnitDistance(observation, sample.playerId, targetPos, unit => (
            isEnemyUnit(observation, sample.playerId, unit)
        ));
        const objectiveBefore = nearestObjectiveDistance(observation, sample.playerId, beforePos);
        const objectiveAfter = nearestObjectiveDistance(observation, sample.playerId, targetPos);
        const castleBefore = nearestEnemyCastleDistance(observation, sample.playerId, beforePos);
        const castleAfter = nearestEnemyCastleDistance(observation, sample.playerId, targetPos);
        const commanderBefore = nearestUnitDistance(observation, sample.playerId, beforePos, unit => (
            unit.isCommander && isEnemyUnit(observation, sample.playerId, unit)
        ));
        const commanderAfter = nearestUnitDistance(observation, sample.playerId, targetPos, unit => (
            unit.isCommander && isEnemyUnit(observation, sample.playerId, unit)
        ));

        moveCloserToEnemy = enemyBefore !== null && enemyAfter !== null && enemyAfter < enemyBefore;
        moveCloserToObjective = objectiveBefore !== null && objectiveAfter !== null && objectiveAfter < objectiveBefore;
        moveCloserToEnemyCastle = castleBefore !== null && castleAfter !== null && castleAfter < castleBefore;
        moveCloserToCommander = commanderBefore !== null && commanderAfter !== null && commanderAfter < commanderBefore;

        addDistanceChangeFeatures(features, featureDim, 'enemyCastleDistance', castleBefore, castleAfter, actionType);
        addBooleanActionFeature(features, featureDim, 'moveCloserToEnemy', moveCloserToEnemy, actionType);
        addBooleanActionFeature(features, featureDim, 'moveCloserToObjective', moveCloserToObjective, actionType);
        addBooleanActionFeature(features, featureDim, 'moveCloserToEnemyCastle', moveCloserToEnemyCastle, actionType);
        addBooleanActionFeature(features, featureDim, 'moveCloserToCommander', moveCloserToCommander, actionType);
    }

    const isMoveAction = action.type === 'move' || action.type === 'post_attack_move';
    const lowProgressMove = isMoveAction
        && !moveCloserToEnemy
        && !moveCloserToObjective
        && !moveCloserToEnemyCastle
        && !moveCloserToCommander;
    const missedPressure = legalIntents.pressure && !isDirectPressureAction(action);
    const lowTempo = isLowTempoAction(action)
        || lowProgressMove
        || (sample.turn >= 100 && missedPressure)
        || (warState.clearlyAhead && warState.enemyOnlyLowValueUnits && !isDirectPressureAction(action));

    addBooleanActionFeature(features, featureDim, 'lowProgressMove', lowProgressMove, actionType);
    addBooleanActionFeature(features, featureDim, 'missedDirectPressure', missedPressure, actionType);
    addBooleanActionFeature(features, featureDim, 'lowTempoAction', lowTempo, actionType);
    addBooleanActionFeature(features, featureDim, 'lateLowTempoAction', sample.turn >= 100 && lowTempo, actionType);
}

export function buildCandidateFeatures(
    sample: SkirmishDatasetSample,
    actionCode: string,
    featureDim: number,
    featureExtractor: SkirmishFeatureExtractor = DEFAULT_FEATURE_EXTRACTOR
): SparseFeatures | null {
    const action = decodeAction(actionCode);
    if (!action) return null;

    const features: SparseFeatures = new Map();
    const observation = sample.observation;
    if (featureExtractor === 'hashed-action-v4' && !observation) throw new Error('v4 特征需要完整 observation，不能从旧哈希特征转换');
    const units = unitById(observation);
    const tiles = tileByPos(observation);
    const player = observation?.players.find(item => item.id === sample.playerId);
    const actionType = action.type;
    const actorId = getActorId(action);
    const actor = actorId ? units.get(actorId) : undefined;
    const targetUnitId = getTargetUnitId(action);
    const targetUnit = targetUnitId ? units.get(targetUnitId) : undefined;
    const targetPos = getTargetPosition(action, units);
    const targetTile = targetPos ? tiles.get(tileKey(targetPos)) : undefined;

    addFeature(features, featureDim, 'bias');
    addFeature(features, featureDim, `action:${actionType}`);
    addFeature(features, featureDim, `player:${sample.playerId}:action:${actionType}`);
    addFeature(features, featureDim, `turn:${bucket(sample.turn, [1, 2, 3, 5, 10, 20, 50, 100, 150])}:action:${actionType}`);
    addFeature(features, featureDim, `legal:${bucket(sample.fixedLegalActionCount, [1, 3, 5, 10, 25, 50, 100, 250, 500])}:action:${actionType}`);

    if (player) {
        addFeature(features, featureDim, `gold:${bucket(player.gold, [0, 100, 250, 500, 1000, 2000])}:action:${actionType}`);
        addFeature(features, featureDim, `unitCount:${bucket(player.unitCount, [0, 1, 3, 5, 10, 20, 30])}:action:${actionType}`);
        addFeature(features, featureDim, `population:${bucket(player.population, [0, 5, 10, 20, 30, 50])}:action:${actionType}`);
    }

    if (actor) {
        addFeature(features, featureDim, `actorClass:${actor.unitClass}:action:${actionType}`);
        addFeature(features, featureDim, `actorHp:${hpBucket(actor)}:action:${actionType}`);
        addFeature(features, featureDim, `actorLevel:${actor.level}:action:${actionType}`);
        addFeature(features, featureDim, `actorCommander:${actor.isCommander}:action:${actionType}`);
        addFeature(features, featureDim, `actorStatus:${actor.status ?? 'none'}:action:${actionType}`);
        addFeature(features, featureDim, `actorActed:${actor.hasActed}:action:${actionType}`);
    }

    if (targetUnit) {
        const relation = relationToPlayer(observation, sample.playerId, targetUnit.ownerId);
        addFeature(features, featureDim, `targetRelation:${relation}:action:${actionType}`);
        addFeature(features, featureDim, `targetClass:${targetUnit.unitClass}:action:${actionType}`);
        addFeature(features, featureDim, `targetHp:${hpBucket(targetUnit)}:action:${actionType}`);
        addFeature(features, featureDim, `targetCommander:${targetUnit.isCommander}:action:${actionType}`);
        addFeature(features, featureDim, `targetStatus:${targetUnit.status ?? 'none'}:action:${actionType}`);
    }

    if (targetTile) {
        const relation = relationToPlayer(observation, sample.playerId, targetTile.ownerId);
        addFeature(features, featureDim, `tileOwner:${relation}:action:${actionType}`);
        addFeature(features, featureDim, `terrain:${targetTile.terrainKey}:action:${actionType}`);
        addFeature(features, featureDim, `tileDefense:${bucket(targetTile.defenseBonus, [0, 5, 10, 20, 30])}:action:${actionType}`);
    }

    if (targetPos) {
        addFeature(features, featureDim, `distance:${distanceBucket(actor, targetPos)}:action:${actionType}`);
    }

    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        addFeature(features, featureDim, `recruit:${action.unitClass}`);
        addFeature(features, featureDim, `recruit:${action.unitClass}:gold:${bucket(player?.gold ?? 0, [0, 100, 250, 500, 1000, 2000])}`);
    }

    if (featureExtractor !== 'hashed-action-v1') {
        addV2CandidateFeatures(features, featureDim, sample, action, {
            actor,
            targetUnit,
            targetPos,
            targetTile
        });
    }
    if (featureExtractor === 'hashed-action-v3' || featureExtractor === 'hashed-action-v4') {
        addV3CandidateFeatures(features, featureDim, sample, action, {
            actor,
            targetUnit,
            targetPos,
            targetTile
        });
    }

    if (featureExtractor === 'hashed-action-v4' && observation) {
        for (const [token, value] of navigationFeatureTokens(observation, action)) addFeature(features, featureDim, token, value);
    }
    return features;
}

export function sparseFeaturesToEntries(features: SparseFeatures): SparseFeatureEntries {
    return [...features.entries()].sort(([left], [right]) => left - right);
}

function entriesToSparseFeatures(entries: SparseFeatureEntries): SparseFeatures {
    return new Map(entries);
}

function score(weights: number[], features: SparseFeatures): number {
    let total = 0;
    for (const [index, value] of features) {
        total += weights[index] * value;
    }
    return total;
}

function update(weights: number[], features: SparseFeatures, scale: number, averaging?: AveragedWeights) {
    for (const [index, value] of features) {
        averaging?.beforeUpdate(index, weights[index]);
        weights[index] += scale * value;
    }
}

export function selectCandidateCodes(sample: SkirmishDatasetSample, maxCandidates: number | null): string[] {
    if (maxCandidates === null || sample.legalActionCodes.length <= maxCandidates) {
        return sample.legalActionCodes;
    }
    const selected = sample.legalActionCodes.slice(0, Math.max(1, maxCandidates));
    if (!selected.includes(sample.label.actionCode)) {
        selected[selected.length - 1] = sample.label.actionCode;
    }
    return selected;
}

function selectFeatureCandidates(sample: SkirmishFeatureSample, maxCandidates: number | null): SkirmishFeatureCandidate[] {
    if (maxCandidates === null || sample.candidates.length <= maxCandidates) {
        return sample.candidates;
    }
    const selected = sample.candidates.slice(0, Math.max(1, maxCandidates));
    if (!selected.some(candidate => candidate.actionCode === sample.label.actionCode)) {
        const labelCandidate = sample.candidates.find(candidate => candidate.actionCode === sample.label.actionCode);
        if (labelCandidate) selected[selected.length - 1] = labelCandidate;
    }
    return selected;
}

function isFeatureSample(sample: SkirmishBcInputSample): sample is SkirmishFeatureSample {
    return sample.kind === 'skirmish_feature_sample';
}

function getLabelActionCode(sample: SkirmishBcInputSample): string {
    return sample.label.actionCode;
}

function getTrainingCandidates(
    sample: SkirmishBcInputSample,
    options: Pick<SkirmishBcTrainOptions, 'featureDim' | 'featureExtractor' | 'maxCandidates'>
): TrainingCandidate[] {
    if (isFeatureSample(sample)) {
        if (sample.featureDim !== options.featureDim) {
            throw new Error(`featureDim 不一致：样本 ${sample.featureDim}，训练器 ${options.featureDim}`);
        }
        if (sample.featureExtractor !== options.featureExtractor) {
            throw new Error(`featureExtractor 不一致：样本 ${sample.featureExtractor}，训练器 ${options.featureExtractor}`);
        }
        return selectFeatureCandidates(sample, options.maxCandidates).map(candidate => ({
            actionCode: candidate.actionCode,
            features: entriesToSparseFeatures(candidate.features),
            teacherScore: candidate.teacherScore ?? null
        }));
    }

    return selectCandidateCodes(sample, options.maxCandidates)
        .map(actionCode => {
            const features = buildCandidateFeatures(sample, actionCode, options.featureDim, options.featureExtractor);
            return features ? { actionCode, features, teacherScore: null } : null;
        })
        .filter((candidate): candidate is TrainingCandidate => candidate !== null);
}

function getExpectedCandidate(
    candidates: readonly TrainingCandidate[],
    sample: SkirmishBcInputSample,
    objective: SkirmishBcObjective
): TrainingCandidate | undefined {
    if (objective === 'teacher-rank') {
        const bestTeacherCandidate = getTeacherCandidate(candidates);
        if (bestTeacherCandidate) return bestTeacherCandidate;
    }
    const expectedActionCode = getLabelActionCode(sample);
    return candidates.find(candidate => candidate.actionCode === expectedActionCode);
}

function getTeacherCandidate(candidates: readonly TrainingCandidate[]): TrainingCandidate | undefined {
    let bestTeacherCandidate: TrainingCandidate | undefined;
    let bestTeacherScore = -Infinity;
    for (const candidate of candidates) {
        if (candidate.teacherScore === null) continue;
        if (candidate.teacherScore > bestTeacherScore) {
            bestTeacherScore = candidate.teacherScore;
            bestTeacherCandidate = candidate;
        }
    }
    return bestTeacherCandidate;
}

function predictCandidate(candidates: readonly TrainingCandidate[], weights: number[]): TrainingCandidate | null {
    let bestCandidate: TrainingCandidate | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
        const currentScore = score(weights, candidate.features);
        if (currentScore > bestScore) {
            bestScore = currentScore;
            bestCandidate = candidate;
        }
    }
    return bestCandidate;
}

async function iterateSamples(
    file: string,
    limit: number | null,
    onSample: (sample: SkirmishBcInputSample) => void | Promise<void>,
    progress?: TrainingProgress
) {
    const lines = createInterface({
        input: createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });
    let count = 0;

    for await (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        await onSample(JSON.parse(trimmed) as SkirmishBcInputSample);
        count += 1;
        progress?.advance();
        if (limit !== null && count >= limit) break;
    }
}

function emptyMetrics(): SkirmishBcMetrics {
    return {
        samples: 0,
        correct: 0,
        accuracy: 0,
        skipped: 0,
        averageCandidates: 0
    };
}

async function trainEpochOnFile(
    file: string,
    weights: number[],
    options: SkirmishBcTrainOptions,
    limitTrainSamples: number | null,
    progress?: TrainingProgress,
    averaging?: AveragedWeights
): Promise<SkirmishBcMetrics> {
    const metrics = emptyMetrics();
    let candidateTotal = 0;

    await iterateSamples(file, limitTrainSamples, sample => {
        const candidates = getTrainingCandidates(sample, options);
        const expectedCandidate = getExpectedCandidate(candidates, sample, options.objective);
        const predictedCandidate = predictCandidate(candidates, weights);

        if (!expectedCandidate || !predictedCandidate) {
            metrics.skipped += 1;
            return;
        }

        const correct = predictedCandidate.actionCode === expectedCandidate.actionCode;
        averaging?.advance();
        metrics.samples += 1;
        candidateTotal += candidates.length;
        if (correct) {
            metrics.correct += 1;
        } else {
            update(weights, expectedCandidate.features, options.learningRate, averaging);
            update(weights, predictedCandidate.features, -options.learningRate, averaging);
        }

        if (options.objective === 'mixed' && options.teacherWeight > 0) {
            const teacherCandidate = getTeacherCandidate(candidates);
            if (teacherCandidate && teacherCandidate.actionCode !== predictedCandidate.actionCode) {
                const teacherScale = options.learningRate * options.teacherWeight;
                update(weights, teacherCandidate.features, teacherScale, averaging);
                update(weights, predictedCandidate.features, -teacherScale, averaging);
            }
        }
    }, progress);

    metrics.accuracy = metrics.samples > 0 ? metrics.correct / metrics.samples : 0;
    metrics.averageCandidates = metrics.samples > 0 ? candidateTotal / metrics.samples : 0;
    return metrics;
}

function mergeMetrics(left: SkirmishBcMetrics, right: SkirmishBcMetrics): SkirmishBcMetrics {
    const samples = left.samples + right.samples;
    const correct = left.correct + right.correct;
    const leftCandidates = left.averageCandidates * left.samples;
    const rightCandidates = right.averageCandidates * right.samples;

    return {
        samples,
        correct,
        accuracy: samples > 0 ? correct / samples : 0,
        skipped: left.skipped + right.skipped,
        averageCandidates: samples > 0 ? (leftCandidates + rightCandidates) / samples : 0
    };
}

interface ResolvedTrainingInput {
    trainSamples: number | null;
    validationSamples: number | null;
    primaryTrainFiles: string[];
    extraTrainFiles: string[];
    validationFiles: string[];
    datasetManifest: string | null;
    datasetId: string | null;
}

async function resolveTrainingInput(
    options: SkirmishBcTrainOptions,
    progress?: TrainingProgress
): Promise<ResolvedTrainingInput> {
    if (!options.datasetManifest) {
        return {
            trainSamples: null,
            validationSamples: null,
            primaryTrainFiles: [options.trainFile],
            extraTrainFiles: options.extraTrainFiles,
            validationFiles: options.valFile ? [options.valFile] : [],
            datasetManifest: null,
            datasetId: null
        };
    }

    const manifest = JSON.parse(await readFile(options.datasetManifest, 'utf8')) as ImmutableDatasetManifest;
    progress?.start('数据完整性校验', manifest.shards.reduce((sum, shard) => sum + shard.samples, 0));
    const validation = await validateFeatureDatasetManifest(options.datasetManifest, count => progress?.set(count));
    if (!validation.valid) {
        throw new Error(`数据集 manifest 验证失败：${validation.errors.join('；')}`);
    }
    progress?.finish('校验通过');
    const artifactDir = path.dirname(options.datasetManifest);
    const resolveShards = (split: 'train' | 'validation') => manifest.shards
        .filter(shard => shard.split === split)
        .sort((left, right) => left.index - right.index)
        .map(shard => path.resolve(artifactDir, shard.path));
    const primaryTrainFiles = resolveShards('train');
    if (primaryTrainFiles.length === 0) {
        throw new Error('数据集 manifest 没有 train 分片');
    }
    return {
        trainSamples: Math.min(validation.trainSamples, options.limitTrainSamples ?? Infinity),
        validationSamples: Math.min(validation.validationSamples, options.limitValSamples ?? Infinity),
        primaryTrainFiles,
        extraTrainFiles: [],
        validationFiles: resolveShards('validation'),
        datasetManifest: options.datasetManifest,
        datasetId: manifest.datasetId
    };
}

async function trainEpochOnFiles(
    files: readonly string[],
    weights: number[],
    options: SkirmishBcTrainOptions,
    limit: number | null,
    progress?: TrainingProgress,
    averaging?: AveragedWeights
): Promise<SkirmishBcMetrics> {
    let metrics = emptyMetrics();
    let remaining = limit;
    for (const file of files) {
        if (remaining !== null && remaining <= 0) break;
        const fileMetrics = await trainEpochOnFile(file, weights, options, remaining, progress, averaging);
        metrics = mergeMetrics(metrics, fileMetrics);
        if (remaining !== null) {
            remaining -= fileMetrics.samples + fileMetrics.skipped;
        }
    }
    return metrics;
}

async function trainEpoch(
    weights: number[],
    options: SkirmishBcTrainOptions,
    input: ResolvedTrainingInput,
    progress?: TrainingProgress,
    averaging?: AveragedWeights
): Promise<SkirmishBcMetrics> {
    let metrics = await trainEpochOnFiles(
        input.primaryTrainFiles,
        weights,
        options,
        options.limitTrainSamples,
        progress,
        averaging
    );

    for (let repeat = 0; repeat < options.extraTrainRepeat; repeat += 1) {
        for (const extraFile of input.extraTrainFiles) {
            const extraMetrics = await trainEpochOnFile(extraFile, weights, options, null, progress, averaging);
            metrics = mergeMetrics(metrics, extraMetrics);
        }
    }

    return metrics;
}

async function evaluateBcModelFiles(
    files: readonly string[],
    model: SkirmishBcModel,
    limit: number | null,
    progress?: TrainingProgress
): Promise<SkirmishBcMetrics> {
    let metrics = emptyMetrics();
    let remaining = limit;
    for (const file of files) {
        if (remaining !== null && remaining <= 0) break;
        const fileMetrics = await evaluateBcModel(file, model, remaining, progress);
        metrics = mergeMetrics(metrics, fileMetrics);
        if (remaining !== null) {
            remaining -= fileMetrics.samples + fileMetrics.skipped;
        }
    }
    return metrics;
}

export async function evaluateBcModel(
    file: string,
    model: SkirmishBcModel,
    limit: number | null = null,
    progress?: TrainingProgress
): Promise<SkirmishBcMetrics> {
    const metrics = emptyMetrics();
    let candidateTotal = 0;

    await iterateSamples(file, limit, sample => {
        const candidates = getTrainingCandidates(sample, {
            featureDim: model.featureDim,
            featureExtractor: model.featureExtractor,
            maxCandidates: model.maxCandidates
        });
        const predictedCandidate = predictCandidate(candidates, model.weights);
        if (!predictedCandidate) {
            metrics.skipped += 1;
            return;
        }
        metrics.samples += 1;
        candidateTotal += candidates.length;
        const expectedCandidate = getExpectedCandidate(candidates, sample, model.objective ?? 'label');
        if (expectedCandidate && predictedCandidate.actionCode === expectedCandidate.actionCode) {
            metrics.correct += 1;
        }
    }, progress);

    metrics.accuracy = metrics.samples > 0 ? metrics.correct / metrics.samples : 0;
    metrics.averageCandidates = metrics.samples > 0 ? candidateTotal / metrics.samples : 0;
    return metrics;
}

export async function trainSkirmishBcModel(options: SkirmishBcTrainOptions, progress?: TrainingProgress): Promise<SkirmishBcTrainSummary> {
    const input = await resolveTrainingInput(options, progress);
    if (options.selectBest && input.validationFiles.length === 0) throw new Error('--select-best 需要验证集');
    await mkdir(path.dirname(options.outFile), { recursive: true });
    let weights: number[] = new Array(options.featureDim).fill(0);
    let initialModelSha256: string | undefined;
    if (options.initialModel) {
        const bytes = await readFile(options.initialModel);
        const initial: SkirmishBcModel = JSON.parse(bytes.toString('utf8'));
        if (initial.kind !== 'skirmish_bc_ranker' || initial.version !== 1 || initial.featureDim !== options.featureDim
            || initial.featureExtractor !== options.featureExtractor || !Array.isArray(initial.weights) || initial.weights.length !== options.featureDim
            || !initial.weights.every(Number.isFinite)) throw new Error('初始模型类型、特征版本、维度或权重不兼容');
        weights = [...initial.weights];
        initialModelSha256 = createHash('sha256').update(bytes).digest('hex');
    }
    const averaging = options.averageWeights ? new AveragedWeights(options.featureDim) : undefined;
    let bestModel: SkirmishBcModel | null = null;
    let bestAccuracy = -Infinity;
    let lastModel: SkirmishBcModel | null = null;
    const epochs: SkirmishBcEpochSummary[] = [];
    let trainedSamples = 0;

    for (let epoch = 1; epoch <= options.epochs; epoch += 1) {
        progress?.start(`第 ${epoch}/${options.epochs} 轮训练`, input.trainSamples);
        const train = await trainEpoch(weights, options, input, progress, averaging);
        progress?.finish(`命中率 ${(train.accuracy * 100).toFixed(2)}%，跳过 ${train.skipped}`);
        trainedSamples += train.samples;
        const modelSnapshot: SkirmishBcModel = {
            ...(initialModelSha256 ? { initialModelSha256 } : {}),
            kind: 'skirmish_bc_ranker',
            version: 1,
            featureExtractor: options.featureExtractor,
            featureDim: options.featureDim,
            weights: averaging ? averaging.snapshot(weights) : [...weights],
            ...(averaging ? { averagedWeights: true } : {}),
            epochs: epoch,
            learningRate: options.learningRate,
            teacherWeight: options.teacherWeight,
            maxCandidates: options.maxCandidates,
            trainedSamples,
            createdAt: new Date().toISOString(),
            objective: options.objective,
            ...(input.datasetId ? { datasetId: input.datasetId } : {})
        };
        if (input.validationFiles.length > 0) progress?.start(`第 ${epoch}/${options.epochs} 轮验证`, input.validationSamples);
        const val = input.validationFiles.length > 0
            ? await evaluateBcModelFiles(input.validationFiles, modelSnapshot, options.limitValSamples, progress)
            : null;
        if (options.selectBest && (!val || val.samples === 0)) throw new Error('--select-best 需要非空验证集');
        if (val) progress?.finish(`命中率 ${(val.accuracy * 100).toFixed(2)}%，跳过 ${val.skipped}`);
        epochs.push({ epoch, train, val });
        lastModel = modelSnapshot;
        if (val && val.accuracy > bestAccuracy) {
            bestAccuracy = val.accuracy;
            bestModel = modelSnapshot;
        }
        if (options.saveEpochs) await writeFile(`${options.outFile}.epoch-${epoch}.json`, `${JSON.stringify(modelSnapshot)}\n`, 'utf8');
    }

    const model: SkirmishBcModel = {
        kind: 'skirmish_bc_ranker',
        version: 1,
        featureExtractor: options.featureExtractor,
        featureDim: options.featureDim,
        weights,
        epochs: options.epochs,
        learningRate: options.learningRate,
        teacherWeight: options.teacherWeight,
        maxCandidates: options.maxCandidates,
        trainedSamples,
        createdAt: new Date().toISOString(),
        objective: options.objective,
        ...(input.datasetId ? { datasetId: input.datasetId } : {})
    };

    const selectedModel = options.selectBest ? bestModel! : lastModel ?? model;
    await writeFile(options.outFile, `${JSON.stringify(selectedModel)}\n`, 'utf8');
    progress?.message(`训练完成，模型已保存：${options.outFile}`);

    const { weights: _weights, ...modelMetadata } = selectedModel;

    return {
        trainFile: input.primaryTrainFiles[0],
        datasetManifest: input.datasetManifest,
        trainFiles: input.primaryTrainFiles,
        validationFiles: input.validationFiles,
        extraTrainFiles: input.extraTrainFiles,
        extraTrainRepeat: options.extraTrainRepeat,
        valFile: input.validationFiles[0] ?? null,
        outFile: options.outFile,
        epochs,
        model: {
            ...modelMetadata,
            nonZeroWeights: selectedModel.weights.filter(value => value !== 0).length
        }
    };
}

export async function loadBcModel(modelFile: string): Promise<SkirmishBcModel> {
    return JSON.parse(await readFile(modelFile, 'utf8')) as SkirmishBcModel;
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}

export function formatSkirmishBcTrainSummary(summary: SkirmishBcTrainSummary): string {
    const lines = [
        '# Skirmish BC 训练摘要',
        '',
        summary.datasetManifest ? `- 数据集 manifest：\`${summary.datasetManifest}\`` : null,
        `- 训练集：\`${summary.trainFile}\``,
        summary.trainFiles && summary.trainFiles.length > 1
            ? `- 训练分片：${summary.trainFiles.length}`
            : null,
        `- 追加训练集：${summary.extraTrainFiles.length > 0 ? summary.extraTrainFiles.map(file => `\`${file}\``).join(', ') : '无'}`,
        `- 追加训练集重复：${summary.extraTrainRepeat}`,
        `- 验证集：${summary.valFile ? `\`${summary.valFile}\`` : '无'}`,
        `- 模型文件：\`${summary.outFile}\``,
        `- 特征维度：${summary.model.featureDim}`,
        `- 特征版本：${summary.model.featureExtractor}`,
        `- 训练目标：${summary.model.objective ?? 'label'}`,
        `- teacher 权重：${summary.model.teacherWeight ?? 0}`,
        `- 非零权重：${summary.model.nonZeroWeights}`,
        '',
        '| Epoch | 训练样本 | 训练命中率 | 验证样本 | 验证命中率 | 平均候选动作 |',
        '| ---: | ---: | ---: | ---: | ---: | ---: |'
    ].filter((line): line is string => line !== null);

    for (const epoch of summary.epochs) {
        lines.push(
            `| ${epoch.epoch} | ${epoch.train.samples} | ${formatPercent(epoch.train.accuracy)} | `
            + `${epoch.val?.samples ?? 0} | ${epoch.val ? formatPercent(epoch.val.accuracy) : '-'} | `
            + `${epoch.train.averageCandidates.toFixed(2)} |`
        );
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseBcTrainArgs(process.argv.slice(2));
    const progress = options.progress === false ? undefined : new TrainingProgress(options.progressIntervalMs);
    const summary = await trainSkirmishBcModel(options, progress);

    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishBcTrainSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
