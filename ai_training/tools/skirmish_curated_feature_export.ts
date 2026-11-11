import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { decodeAction, type Observation } from '../src/game/env';
import type { Action, Position, UnitClass } from '../src/game/types';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import {
    buildCandidateFeatures,
    sparseFeaturesToEntries,
    type SkirmishFeatureCandidate,
    type SkirmishFeatureExtractor,
    type SkirmishFeatureSample
} from './skirmish_bc_train';

type UnitSnapshot = Observation['units'][number];
type TileSnapshot = Observation['tiles'][number];
type CuratedCategory = 'endgame' | 'high-tier' | 'summon';

export interface SkirmishCuratedFeatureExportOptions {
    inputFiles: string[];
    outFile: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number;
    maxEndgameSamples: number;
    maxHighTierSamples: number;
    maxSummonSamples: number;
    maxReadSamples: number | null;
    minEndgameTurn: number;
    json: boolean;
}

export interface SkirmishCuratedFeatureExportSummary {
    inputFiles: string[];
    outFile: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number;
    readSamples: number;
    exportedSamples: number;
    endgameSamples: number;
    highTierSamples: number;
    summonSamples: number;
    skippedSamples: number;
    averageCandidates: number;
    byScenario: Record<string, {
        samples: number;
        endgame: number;
        highTier: number;
        summon: number;
    }>;
}

interface CandidateScore {
    actionCode: string;
    action: Action;
    score: number;
}

interface WarState {
    selfValue: number;
    enemyValue: number;
    selfUnits: number;
    enemyUnits: number;
    clearlyAhead: boolean;
}

const DEFAULT_FEATURE_DIR = path.resolve(process.cwd(), 'training_runs', 'features');
const DEFAULT_FEATURE_EXTRACTOR: SkirmishFeatureExtractor = 'hashed-action-v3';
const HIGH_TIER_PRIORITY: Partial<Record<UnitClass, number>> = {
    paladin: 300,
    witch: 320,
    berserker: 450,
    elf: 440,
    wolf: 520,
    ice_elemental: 560,
    golem: 580,
    druid: 600,
    catapult: 760,
    wolf_archer: 780,
    dragon: 1000
};
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_FEATURE_DIR, `skirmish-curated-v3-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run export:skirmish:curated -- --input <file> [选项]

选项:
  --input <file>             full observation dataset JSONL，可重复
  --out <file>               compact feature JSONL 输出文件，默认 training_runs/features/skirmish-curated-v3-时间戳.jsonl
  --feature-dim <n>          哈希特征维度，默认 4096
  --feature-extractor <name> 特征版本，默认 hashed-action-v3
  --max-candidates <n>       每条样本最多保留多少候选动作，默认 64
  --endgame-samples <n>      最多导出多少条残局样本，默认 3000
  --high-tier-samples <n>    最多导出多少条高阶招募样本，默认 3000
  --summon-samples <n>       最多导出多少条召唤样本，默认 1000
  --max-read-samples <n>     最多读取多少条输入样本，默认不限
  --min-endgame-turn <n>     残局样本最低回合，默认 80
  --json                     摘要输出 JSON
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

function parseNonNegativeInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed < 0) throw new Error(`${label} 必须是非负整数`);
    return parsed;
}

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3' || value === 'hashed-action-v4' || value === 'hashed-action-v5') return value;
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4 或 hashed-action-v5');
}

export function parseCuratedFeatureExportArgs(argv: readonly string[]): SkirmishCuratedFeatureExportOptions {
    const options: SkirmishCuratedFeatureExportOptions = {
        inputFiles: [],
        outFile: defaultOutFile(),
        featureDim: 4096,
        featureExtractor: DEFAULT_FEATURE_EXTRACTOR,
        maxCandidates: 64,
        maxEndgameSamples: 3000,
        maxHighTierSamples: 3000,
        maxSummonSamples: 1000,
        maxReadSamples: null,
        minEndgameTurn: 80,
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--input') {
            const value = argv[++i];
            if (!value) throw new Error('--input 缺少文件参数');
            options.inputFiles.push(path.resolve(value));
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--feature-dim') {
            options.featureDim = parsePositiveInteger(argv[++i], '--feature-dim');
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++i]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parsePositiveInteger(argv[++i], '--max-candidates');
        } else if (arg === '--endgame-samples') {
            options.maxEndgameSamples = parseNonNegativeInteger(argv[++i], '--endgame-samples');
        } else if (arg === '--high-tier-samples') {
            options.maxHighTierSamples = parseNonNegativeInteger(argv[++i], '--high-tier-samples');
        } else if (arg === '--summon-samples') {
            options.maxSummonSamples = parseNonNegativeInteger(argv[++i], '--summon-samples');
        } else if (arg === '--max-read-samples') {
            options.maxReadSamples = parsePositiveInteger(argv[++i], '--max-read-samples');
        } else if (arg === '--min-endgame-turn') {
            options.minEndgameTurn = parsePositiveInteger(argv[++i], '--min-endgame-turn');
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.inputFiles.length === 0) throw new Error('请用 --input 指定至少一个 dataset JSONL 文件');
    return options;
}

function tileKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

function manhattan(left: Position, right: Position): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function unitPosition(unit: UnitSnapshot): Position {
    return { x: unit.x, y: unit.y };
}

function unitValue(unit: UnitSnapshot | undefined): number {
    if (!unit) return 0;
    if (unit.isCommander) return 1200;
    return unit.cost ?? 100;
}

function isAliveUnit(unit: UnitSnapshot): boolean {
    return unit.hp > 0;
}

function relationToPlayer(observation: Observation | undefined, playerId: number, ownerId: number | null | undefined): 'self' | 'ally' | 'enemy' | 'neutral' {
    if (ownerId === null || ownerId === undefined) return 'neutral';
    if (ownerId === playerId) return 'self';
    const self = observation?.players.find(player => player.id === playerId);
    const other = observation?.players.find(player => player.id === ownerId);
    if (self && other && self.allianceId === other.allianceId) return 'ally';
    return 'enemy';
}

function isEnemyUnit(observation: Observation | undefined, playerId: number, unit: UnitSnapshot): boolean {
    return relationToPlayer(observation, playerId, unit.ownerId) === 'enemy';
}

function isObjectiveTile(observation: Observation | undefined, playerId: number, tile: TileSnapshot): boolean {
    const relation = relationToPlayer(observation, playerId, tile.ownerId);
    if (relation === 'self' || relation === 'ally') return false;
    return tile.terrainKey === 'castle'
        || tile.terrainKey === 'town'
        || tile.terrainKey === 'damaged_town'
        || tile.terrainTags.includes('building');
}

function nearestDistance<T extends Position>(
    items: readonly T[],
    pos: Position,
    predicate: (item: T) => boolean
): number | null {
    let best: number | null = null;
    for (const item of items) {
        if (!predicate(item)) continue;
        const distance = manhattan(pos, item);
        if (best === null || distance < best) best = distance;
    }
    return best;
}

function actionActorId(action: Action): string | null {
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

function actionTargetPosition(action: Action, units: Map<string, UnitSnapshot>): Position | null {
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
            return unit ? unitPosition(unit) : null;
        }
        case 'attack':
        case 'heal':
        case 'support': {
            const unit = units.get(action.targetId);
            return unit ? unitPosition(unit) : null;
        }
        default:
            return null;
    }
}

function summarizeWarState(sample: SkirmishDatasetSample): WarState {
    const observation = sample.observation;
    const self = observation?.players.find(player => player.id === sample.playerId);
    const selfAlliance = self?.allianceId ?? sample.playerId;
    const selfOwnerIds = new Set((observation?.players ?? [])
        .filter(player => player.allianceId === selfAlliance)
        .map(player => player.id));
    const enemyOwnerIds = new Set((observation?.players ?? [])
        .filter(player => player.allianceId !== selfAlliance)
        .map(player => player.id));
    const selfUnits = (observation?.units ?? []).filter(unit => selfOwnerIds.has(unit.ownerId) && isAliveUnit(unit));
    const enemyUnits = (observation?.units ?? []).filter(unit => enemyOwnerIds.has(unit.ownerId) && isAliveUnit(unit));
    const selfGold = (observation?.players ?? [])
        .filter(player => selfOwnerIds.has(player.id))
        .reduce((sum, player) => sum + player.gold, 0);
    const enemyGold = (observation?.players ?? [])
        .filter(player => enemyOwnerIds.has(player.id))
        .reduce((sum, player) => sum + player.gold, 0);
    const selfValue = selfGold + selfUnits.reduce((sum, unit) => sum + Math.floor(unitValue(unit) * unit.hp / Math.max(1, unit.maxHp)), 0);
    const enemyValue = enemyGold + enemyUnits.reduce((sum, unit) => sum + Math.floor(unitValue(unit) * unit.hp / Math.max(1, unit.maxHp)), 0);
    const clearlyAhead = selfValue - enemyValue >= 1500
        || enemyUnits.length <= 2
        || (selfUnits.length >= enemyUnits.length + 3 && selfValue >= enemyValue * 1.3);

    return {
        selfValue,
        enemyValue,
        selfUnits: selfUnits.length,
        enemyUnits: enemyUnits.length,
        clearlyAhead
    };
}

function hasUnresolvedObjective(sample: SkirmishDatasetSample): boolean {
    return (sample.observation?.tiles ?? []).some(tile => isObjectiveTile(sample.observation, sample.playerId, tile));
}

function hasHighTierRecruit(action: Action): boolean {
    return (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
        && (HIGH_TIER_PRIORITY[action.unitClass] ?? 0) > 0;
}

function getCategories(sample: SkirmishDatasetSample, options: SkirmishCuratedFeatureExportOptions): CuratedCategory[] {
    if (!sample.observation) return [];
    const actions = sample.legalActionCodes
        .map(code => decodeAction(code))
        .filter((action): action is Action => action !== null);
    const warState = summarizeWarState(sample);
    const categories: CuratedCategory[] = [];

    if (
        sample.turn >= options.minEndgameTurn
        && hasUnresolvedObjective(sample)
        && (warState.clearlyAhead || warState.enemyUnits <= 3)
    ) {
        categories.push('endgame');
    }
    if (actions.some(hasHighTierRecruit)) {
        categories.push('high-tier');
    }
    if (actions.some(action => action.type === 'summon')) {
        categories.push('summon');
    }

    return categories;
}

function scoreEndgameAction(sample: SkirmishDatasetSample, action: Action, units: Map<string, UnitSnapshot>, tiles: Map<string, TileSnapshot>): number {
    const observation = sample.observation;
    const actorId = actionActorId(action);
    const actor = actorId ? units.get(actorId) : undefined;
    const targetPos = actionTargetPosition(action, units);
    const targetTile = targetPos ? tiles.get(tileKey(targetPos)) : undefined;
    const beforePos = actor ? unitPosition(actor) : targetPos;
    const beforeObjective = beforePos
        ? nearestDistance(observation?.tiles ?? [], beforePos, tile => isObjectiveTile(observation, sample.playerId, tile))
        : null;
    const afterObjective = targetPos
        ? nearestDistance(observation?.tiles ?? [], targetPos, tile => isObjectiveTile(observation, sample.playerId, tile))
        : null;
    const movesCloser = beforeObjective !== null && afterObjective !== null && afterObjective < beforeObjective;

    switch (action.type) {
        case 'capture':
            return targetTile && isObjectiveTile(observation, sample.playerId, targetTile) ? 9000 : 5500;
        case 'destroy_town':
            return 8500;
        case 'attack': {
            const target = units.get(action.targetId);
            return 5200 + unitValue(target) + (target?.isCommander ? 2500 : 0);
        }
        case 'summon':
            return 4200;
        case 'move':
        case 'post_attack_move':
            return movesCloser
                ? 3200 + Math.max(0, (beforeObjective ?? 0) - (afterObjective ?? 0)) * 250
                : -600;
        case 'recruit_to_castle':
        case 'recruit_and_deploy':
            return -200;
        case 'wait':
            return -3000;
        case 'end_turn':
            return -3500;
        case 'surrender':
            return -20000;
        case 'heal':
        case 'support':
        case 'repair':
            return -1200;
        default:
            return 0;
    }
}

function scoreHighTierAction(sample: SkirmishDatasetSample, action: Action): number {
    const player = sample.observation?.players.find(item => item.id === sample.playerId);
    switch (action.type) {
        case 'recruit_to_castle':
        case 'recruit_and_deploy': {
            const priority = HIGH_TIER_PRIORITY[action.unitClass] ?? 0;
            const cost = player?.recruitCosts[action.unitClass] ?? 0;
            const goldAfter = (player?.gold ?? 0) - cost;
            return priority > 0 ? 4000 + priority + Math.min(1000, Math.max(0, goldAfter)) : 100 + cost / 10;
        }
        case 'summon':
            return 6200;
        case 'attack':
        case 'capture':
        case 'destroy_town':
            return 3000;
        case 'wait':
        case 'end_turn':
            return -2000;
        case 'surrender':
            return -20000;
        default:
            return 0;
    }
}

function scoreAction(sample: SkirmishDatasetSample, action: Action, categories: readonly CuratedCategory[], units: Map<string, UnitSnapshot>, tiles: Map<string, TileSnapshot>): number {
    let score = 0;
    if (categories.includes('endgame')) {
        score += scoreEndgameAction(sample, action, units, tiles);
    }
    if (categories.includes('high-tier') || categories.includes('summon')) {
        score += scoreHighTierAction(sample, action);
    }
    return score;
}

function selectCandidateScores(
    sample: SkirmishDatasetSample,
    categories: readonly CuratedCategory[],
    maxCandidates: number
): CandidateScore[] {
    const units = new Map((sample.observation?.units ?? []).map(unit => [unit.id, unit]));
    const tiles = new Map((sample.observation?.tiles ?? []).map(tile => [tileKey(tile), tile]));
    const scored = sample.legalActionCodes
        .map(actionCode => {
            const action = decodeAction(actionCode);
            return action ? { actionCode, action, score: scoreAction(sample, action, categories, units, tiles) } : null;
        })
        .filter((item): item is CandidateScore => item !== null)
        .sort((left, right) => right.score - left.score);
    const selected = scored.slice(0, maxCandidates);
    const labelCandidate = scored.find(item => item.actionCode === sample.label.actionCode);
    if (labelCandidate && !selected.some(item => item.actionCode === labelCandidate.actionCode)) {
        selected[selected.length - 1] = labelCandidate;
    }
    const topCandidate = scored[0];
    if (topCandidate && !selected.some(item => item.actionCode === topCandidate.actionCode)) {
        selected[0] = topCandidate;
    }
    return [...new Map(selected.map(item => [item.actionCode, item])).values()]
        .sort((left, right) => right.score - left.score)
        .map((item, index) => ({ ...item, score: item.score - index * 0.001 }));
}

function convertToFeatureSample(
    sample: SkirmishDatasetSample,
    categories: readonly CuratedCategory[],
    options: Pick<SkirmishCuratedFeatureExportOptions, 'featureDim' | 'featureExtractor' | 'maxCandidates'>
): SkirmishFeatureSample | null {
    const selected = selectCandidateScores(sample, categories, options.maxCandidates);
    if (selected.length === 0) return null;
    const ranked = [...selected].sort((left, right) => right.score - left.score);
    const rankByCode = new Map(ranked.map((item, index) => [item.actionCode, index]));
    const candidates: SkirmishFeatureCandidate[] = [];

    for (const item of selected) {
        const features = buildCandidateFeatures(sample, item.actionCode, options.featureDim, options.featureExtractor);
        if (!features) continue;
        candidates.push({
            actionCode: item.actionCode,
            features: sparseFeaturesToEntries(features),
            teacherScore: item.score,
            teacherRank: rankByCode.get(item.actionCode) ?? Number.MAX_SAFE_INTEGER
        });
    }

    if (!candidates.some(candidate => candidate.teacherRank === 0)) return null;

    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: options.featureExtractor,
        featureDim: options.featureDim,
        source: sample.source,
        scenario: sample.scenario,
        seed: sample.seed,
        step: sample.step,
        turn: sample.turn,
        playerId: sample.playerId,
        policy: `curated:${categories.join('+')}`,
        label: {
            fixedActionIndex: sample.label.fixedActionIndex,
            actionCode: sample.label.actionCode
        },
        candidates
    };
}

function shouldTakeCategory(category: CuratedCategory, summary: SkirmishCuratedFeatureExportSummary, options: SkirmishCuratedFeatureExportOptions): boolean {
    if (category === 'endgame') return summary.endgameSamples < options.maxEndgameSamples;
    if (category === 'high-tier') return summary.highTierSamples < options.maxHighTierSamples;
    return summary.summonSamples < options.maxSummonSamples;
}

function markCategories(categories: readonly CuratedCategory[], summary: SkirmishCuratedFeatureExportSummary) {
    if (categories.includes('endgame')) summary.endgameSamples += 1;
    if (categories.includes('high-tier')) summary.highTierSamples += 1;
    if (categories.includes('summon')) summary.summonSamples += 1;
}

function quotasFilled(summary: SkirmishCuratedFeatureExportSummary, options: SkirmishCuratedFeatureExportOptions): boolean {
    return summary.endgameSamples >= options.maxEndgameSamples
        && summary.highTierSamples >= options.maxHighTierSamples
        && summary.summonSamples >= options.maxSummonSamples;
}

function ensureScenario(summary: SkirmishCuratedFeatureExportSummary, scenarioId: string) {
    summary.byScenario[scenarioId] ??= {
        samples: 0,
        endgame: 0,
        highTier: 0,
        summon: 0
    };
    return summary.byScenario[scenarioId];
}

async function writeLine(stream: NodeJS.WritableStream, line: string) {
    if (!stream.write(line)) {
        await once(stream, 'drain');
    }
}

export async function exportSkirmishCuratedFeatures(options: SkirmishCuratedFeatureExportOptions): Promise<SkirmishCuratedFeatureExportSummary> {
    await mkdir(path.dirname(options.outFile), { recursive: true });
    const output = createWriteStream(options.outFile, { encoding: 'utf8' });
    const summary: SkirmishCuratedFeatureExportSummary = {
        inputFiles: options.inputFiles,
        outFile: options.outFile,
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        readSamples: 0,
        exportedSamples: 0,
        endgameSamples: 0,
        highTierSamples: 0,
        summonSamples: 0,
        skippedSamples: 0,
        averageCandidates: 0,
        byScenario: {}
    };
    let totalCandidates = 0;

    try {
        for (const inputFile of options.inputFiles) {
            const lines = createInterface({
                input: createReadStream(inputFile, { encoding: 'utf8' }),
                crlfDelay: Infinity
            });
            for await (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (options.maxReadSamples !== null && summary.readSamples >= options.maxReadSamples) break;
                if (quotasFilled(summary, options)) break;

                summary.readSamples += 1;
                const sample = JSON.parse(trimmed) as SkirmishDatasetSample;
                if (sample.kind !== 'skirmish_dataset_sample' || !sample.observation) {
                    summary.skippedSamples += 1;
                    continue;
                }
                const categories = getCategories(sample, options).filter(category => shouldTakeCategory(category, summary, options));
                if (categories.length === 0) {
                    summary.skippedSamples += 1;
                    continue;
                }
                const featureSample = convertToFeatureSample(sample, categories, options);
                if (!featureSample) {
                    summary.skippedSamples += 1;
                    continue;
                }

                await writeLine(output, `${JSON.stringify(featureSample)}\n`);
                summary.exportedSamples += 1;
                totalCandidates += featureSample.candidates.length;
                markCategories(categories, summary);
                const scenario = ensureScenario(summary, featureSample.scenario.id);
                scenario.samples += 1;
                if (categories.includes('endgame')) scenario.endgame += 1;
                if (categories.includes('high-tier')) scenario.highTier += 1;
                if (categories.includes('summon')) scenario.summon += 1;
            }
            if (options.maxReadSamples !== null && summary.readSamples >= options.maxReadSamples) break;
            if (quotasFilled(summary, options)) break;
        }
    } finally {
        output.end();
        await once(output, 'finish');
    }

    summary.averageCandidates = summary.exportedSamples > 0 ? totalCandidates / summary.exportedSamples : 0;
    return summary;
}

export function formatSkirmishCuratedFeatureExportSummary(summary: SkirmishCuratedFeatureExportSummary): string {
    const lines = [
        '# Skirmish curated feature 导出摘要',
        '',
        `- 输入文件：${summary.inputFiles.map(file => `\`${file}\``).join(', ')}`,
        `- 输出文件：\`${summary.outFile}\``,
        `- 特征版本：${summary.featureExtractor}`,
        `- 特征维度：${summary.featureDim}`,
        `- 候选动作上限：${summary.maxCandidates}`,
        `- 读取样本：${summary.readSamples}`,
        `- 导出样本：${summary.exportedSamples}`,
        `- 残局样本：${summary.endgameSamples}`,
        `- 高阶招募样本：${summary.highTierSamples}`,
        `- 召唤样本：${summary.summonSamples}`,
        `- 跳过样本：${summary.skippedSamples}`,
        `- 平均候选动作：${summary.averageCandidates.toFixed(2)}`,
        '',
        '| 场景 | 样本 | 残局 | 高阶 | 召唤 |',
        '| --- | ---: | ---: | ---: | ---: |'
    ];

    for (const [scenarioId, item] of Object.entries(summary.byScenario).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| \`${scenarioId}\` | ${item.samples} | ${item.endgame} | ${item.highTier} | ${item.summon} |`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseCuratedFeatureExportArgs(process.argv.slice(2));
    const summary = await exportSkirmishCuratedFeatures(options);
    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishCuratedFeatureExportSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
