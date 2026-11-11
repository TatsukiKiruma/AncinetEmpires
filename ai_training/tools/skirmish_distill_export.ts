import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AncientEmpiresEnv,
    type EnvStepResult,
    type FixedActionSpaceDescriptor,
    type FixedActionSpaceOptions
} from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import {
    createApkSkirmishTrainingEnv,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import type { ApkAemMap } from '../src/game/apk_map';
import type { Action } from '../src/game/types';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import { parseEpisodeJsonl } from './skirmish_training_eval';
import {
    readApkSkirmishTrainingMap,
    type SkirmishEpisodeRecord,
    type SkirmishEpisodeStep
} from './skirmish_training_runner';
import {
    buildCandidateFeatures,
    sparseFeaturesToEntries,
    type SkirmishFeatureCandidate,
    type SkirmishFeatureExtractor,
    type SkirmishFeatureSample
} from './skirmish_bc_train';

export interface SkirmishDistillExportOptions {
    inputFiles: string[];
    outFile: string;
    unpackDir: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number | null;
    excludeTimeout: boolean;
    excludeStoppedByMaxSteps: boolean;
    excludeIllegal: boolean;
    includeScenarioIds: string[];
    excludeScenarioIds: string[];
    limitEpisodes: number | null;
    limitSamples: number | null;
    json: boolean;
    envFactory?: SkirmishDistillEnvFactory;
}

export interface SkirmishDistillEnvFactory {
    createEnv(episode: SkirmishEpisodeRecord): Promise<AncientEmpiresEnv> | AncientEmpiresEnv;
}

export interface SkirmishDistillExportSummary {
    inputFiles: string[];
    outFile: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number | null;
    inputEpisodes: number;
    exportedEpisodes: number;
    skippedEpisodes: number;
    exportedSamples: number;
    skippedSamples: number;
    averageCandidates: number;
    teacherLabelAgreement: number;
    skippedByReason: Record<string, number>;
    byScenario: Record<string, {
        episodes: number;
        samples: number;
        candidates: number;
    }>;
    sampleLimitReached: boolean;
}

interface LoadedEpisode {
    episode: SkirmishEpisodeRecord;
    inputFile: string;
    inputIndex: number;
}

interface ScoredEntry {
    actionCode: string;
    fixedActionIndex: number;
    action: Action;
    teacherScore: number;
    teacherRank: number;
}

type LegalActionEntry = EnvStepResult['legalActionEntries'][number];

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_FEATURE_DIR = path.resolve(process.cwd(), 'training_runs', 'features');
const DEFAULT_FEATURE_EXTRACTOR: SkirmishFeatureExtractor = 'hashed-action-v2';
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_FEATURE_DIR, `skirmish-distill-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run export:skirmish:distill -- --input <file> [选项]

选项:
  --input <file>            skirmish baseline episode JSONL，可重复
  --out <file>              蒸馏 feature JSONL 输出文件，默认 training_runs/features/skirmish-distill-时间戳.jsonl
  --unpack <dir>            APK 解包目录，默认 APK/_analysis/unpack
  --feature-dim <n>         哈希特征维度，默认 4096
  --feature-extractor <n>   特征版本，默认 hashed-action-v2；可选 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4、hashed-action-v5
  --max-candidates <n>      每步最多导出多少个候选动作，默认全量；会保留原标签和 heuristic 第一名
  --scenario <id>           只导出指定场景，可重复
  --exclude-scenario <id>   排除指定场景，可重复
  --exclude-timeout         跳过超时裁定 episode，默认开启
  --include-timeout         保留超时裁定 episode
  --exclude-stopped         跳过 runner 步数保护停止 episode，默认开启
  --include-stopped         保留 runner 步数保护停止 episode
  --limit-episodes <n>      最多导出 n 个通过过滤的 episode
  --limit-samples <n>       最多导出 n 条 step 样本
  --json                    摘要输出 JSON
  --help                    显示帮助
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

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3' || value === 'hashed-action-v4' || value === 'hashed-action-v5') return value;
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4 或 hashed-action-v5');
}

export function parseDistillExportArgs(argv: readonly string[]): SkirmishDistillExportOptions {
    const options: SkirmishDistillExportOptions = {
        inputFiles: [],
        outFile: defaultOutFile(),
        unpackDir: DEFAULT_UNPACK_DIR,
        featureDim: 4096,
        featureExtractor: DEFAULT_FEATURE_EXTRACTOR,
        maxCandidates: null,
        excludeTimeout: true,
        excludeStoppedByMaxSteps: true,
        excludeIllegal: true,
        includeScenarioIds: [],
        excludeScenarioIds: [],
        limitEpisodes: null,
        limitSamples: null,
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
        } else if (arg === '--unpack') {
            const value = argv[++i];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--feature-dim') {
            options.featureDim = parsePositiveInteger(argv[++i], '--feature-dim');
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++i]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parsePositiveInteger(argv[++i], '--max-candidates');
        } else if (arg === '--scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--scenario 缺少场景 ID');
            options.includeScenarioIds.push(value);
        } else if (arg === '--exclude-scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--exclude-scenario 缺少场景 ID');
            options.excludeScenarioIds.push(value);
        } else if (arg === '--exclude-timeout') {
            options.excludeTimeout = true;
        } else if (arg === '--include-timeout') {
            options.excludeTimeout = false;
        } else if (arg === '--exclude-stopped') {
            options.excludeStoppedByMaxSteps = true;
        } else if (arg === '--include-stopped') {
            options.excludeStoppedByMaxSteps = false;
        } else if (arg === '--limit-episodes') {
            options.limitEpisodes = parsePositiveInteger(argv[++i], '--limit-episodes');
        } else if (arg === '--limit-samples') {
            options.limitSamples = parsePositiveInteger(argv[++i], '--limit-samples');
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.inputFiles.length === 0) {
        throw new Error('请用 --input 指定至少一个 episode JSONL 文件');
    }
    return options;
}

function hashJson(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fixedOptionsFromDescriptor(descriptor: FixedActionSpaceDescriptor): FixedActionSpaceOptions {
    const blockTypes = new Set(descriptor.blocks.map(block => block.type));
    return {
        width: descriptor.width,
        height: descriptor.height,
        unitClasses: descriptor.unitClasses,
        includeSurrender: blockTypes.has('surrender'),
        includeEndTurn: blockTypes.has('end_turn')
    };
}

function assertReplayState(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    result: EnvStepResult,
    stepIndex: number
) {
    if (result.done) throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步前环境已终局`);
    if (step.illegal) throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步是非法动作`);
    if (result.observation.currentPlayer !== step.playerId) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步玩家错位`);
    }
    if (result.observation.turn !== step.turnBefore) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步回合错位`);
    }
    if (stepIndex + 1 !== step.step) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} step 序号不连续`);
    }
}

function assertNextResult(episode: SkirmishEpisodeRecord, step: SkirmishEpisodeStep, nextResult: EnvStepResult) {
    if (nextResult.reward !== step.reward) throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 reward 错位`);
    if (nextResult.done !== step.done) throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 done 错位`);
    if (nextResult.state.winner !== step.winnerAfter) throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 winner 错位`);
}

function rankScoredEntries(entries: ScoredEntry[]) {
    [...entries]
        .sort((left, right) => right.teacherScore - left.teacherScore)
        .forEach((entry, index) => {
            entry.teacherRank = index;
        });
}

function selectScoredEntries(
    entries: readonly ScoredEntry[],
    labelActionCode: string,
    maxCandidates: number | null
): ScoredEntry[] {
    if (maxCandidates === null || entries.length <= maxCandidates) return [...entries];
    const selected = entries.slice(0, Math.max(1, maxCandidates));
    const required = [
        entries.find(entry => entry.actionCode === labelActionCode),
        entries.find(entry => entry.teacherRank === 0)
    ].filter((entry): entry is ScoredEntry => entry !== undefined);

    for (const entry of required) {
        if (selected.some(item => item.actionCode === entry.actionCode)) continue;
        selected[Math.max(0, selected.length - 1)] = entry;
    }
    return selected;
}

function selectLegalEntriesForScoring(
    entries: readonly LegalActionEntry[],
    labelActionCode: string,
    maxCandidates: number | null
): LegalActionEntry[] {
    const fixedEntries = entries.filter(entry => entry.fixedActionIndex !== null);
    if (maxCandidates === null || fixedEntries.length <= maxCandidates) return fixedEntries;
    const selected = fixedEntries.slice(0, Math.max(1, maxCandidates));
    if (!selected.some(entry => entry.code === labelActionCode)) {
        const labelEntry = fixedEntries.find(entry => entry.code === labelActionCode);
        if (labelEntry) selected[selected.length - 1] = labelEntry;
    }
    return selected;
}

function buildDatasetSample(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    result: EnvStepResult,
    source: { inputFile?: string; episodeIndex?: number; stepIndex: number }
): SkirmishDatasetSample {
    const selectedEntry = result.legalActionEntries.find(entry => entry.fixedActionIndex === step.fixedActionIndex);
    if (!selectedEntry || selectedEntry.fixedActionIndex === null) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步固定动作索引不合法`);
    }
    if (selectedEntry.code !== step.actionCode) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步动作编码错位`);
    }

    return {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source,
        scenario: episode.scenario,
        seed: episode.seed,
        maxPlies: episode.maxPlies,
        maxSteps: episode.maxSteps,
        initialObservationHash: episode.initialObservationHash,
        fixedActionSpaceSize: episode.fixedActionSpaceSize,
        step: step.step,
        turn: step.turnBefore,
        playerId: step.playerId,
        policy: step.policy,
        legalActionCount: step.legalActionCount,
        fixedLegalActionCount: step.fixedLegalActionCount,
        fixedActionSpaceDescriptor: result.fixedActionSpaceDescriptor,
        fixedLegalActionIndexes: result.fixedLegalActionIndexes,
        legalActionCodes: result.legalActionCodes,
        observation: result.observation,
        label: {
            fixedActionIndex: selectedEntry.fixedActionIndex,
            actionCode: selectedEntry.code,
            action: selectedEntry.action
        },
        outcome: {
            reward: step.reward,
            done: step.done,
            winnerAfter: step.winnerAfter,
            illegal: step.illegal
        }
    };
}

export function replayEpisodeToDistillFeatureSamples(
    episode: SkirmishEpisodeRecord,
    env: AncientEmpiresEnv,
    options: Pick<SkirmishDistillExportOptions, 'featureDim' | 'featureExtractor' | 'maxCandidates'> & {
        inputFile?: string;
        episodeIndex?: number;
    }
): { samples: SkirmishFeatureSample[]; teacherTopMatchesLabel: number; candidateCount: number } {
    let result = env.reset(episode.seed);
    const initialObservationHash = hashJson(result.observation);
    if (initialObservationHash !== episode.initialObservationHash) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 初始 observation hash 不一致`);
    }

    const teacher = new HeuristicAI(() => 0);
    const samples: SkirmishFeatureSample[] = [];
    let teacherTopMatchesLabel = 0;
    let candidateCount = 0;

    for (let index = 0; index < episode.steps.length; index += 1) {
        const step = episode.steps[index];
        assertReplayState(episode, step, result, index);

        const datasetSample = buildDatasetSample(episode, step, result, {
            inputFile: options.inputFile,
            episodeIndex: options.episodeIndex,
            stepIndex: index
        });
        const engine = new GameEngine(result.state);
        const entriesForScoring = selectLegalEntriesForScoring(
            result.legalActionEntries,
            datasetSample.label.actionCode,
            options.maxCandidates
        );
        const scoredEntries: ScoredEntry[] = entriesForScoring
            .map(entry => ({
                actionCode: entry.code,
                fixedActionIndex: entry.fixedActionIndex ?? -1,
                action: entry.action,
                teacherScore: teacher.scoreCandidateAction(engine, step.playerId, entry.action),
                teacherRank: Number.MAX_SAFE_INTEGER
            }));
        rankScoredEntries(scoredEntries);
        const topTeacher = scoredEntries.find(entry => entry.teacherRank === 0);
        if (topTeacher?.actionCode === datasetSample.label.actionCode) {
            teacherTopMatchesLabel += 1;
        }

        const selectedEntries = selectScoredEntries(scoredEntries, datasetSample.label.actionCode, options.maxCandidates);
        const candidates: SkirmishFeatureCandidate[] = [];
        for (const entry of selectedEntries) {
            const features = buildCandidateFeatures(datasetSample, entry.actionCode, options.featureDim, options.featureExtractor);
            if (!features) continue;
            candidates.push({
                actionCode: entry.actionCode,
                features: sparseFeaturesToEntries(features),
                teacherScore: entry.teacherScore,
                teacherRank: entry.teacherRank
            });
        }

        if (candidates.some(candidate => candidate.actionCode === datasetSample.label.actionCode)) {
            samples.push({
                kind: 'skirmish_feature_sample',
                version: 1,
                featureExtractor: options.featureExtractor,
                featureDim: options.featureDim,
                source: datasetSample.source,
                scenario: datasetSample.scenario,
                seed: datasetSample.seed,
                step: datasetSample.step,
                turn: datasetSample.turn,
                playerId: datasetSample.playerId,
                policy: datasetSample.policy,
                label: {
                    fixedActionIndex: datasetSample.label.fixedActionIndex,
                    actionCode: datasetSample.label.actionCode
                },
                candidates
            });
            candidateCount += candidates.length;
        }

        const nextResult = env.stepFixedAction(step.fixedActionIndex, fixedOptionsFromDescriptor(result.fixedActionSpaceDescriptor));
        assertNextResult(episode, step, nextResult);
        result = nextResult;
    }

    return { samples, teacherTopMatchesLabel, candidateCount };
}

function incrementCounter(counters: Record<string, number>, key: string) {
    counters[key] = (counters[key] ?? 0) + 1;
}

function getSkipReason(episode: SkirmishEpisodeRecord, options: SkirmishDistillExportOptions): string | null {
    const includeScenarios = new Set(options.includeScenarioIds);
    const excludeScenarios = new Set(options.excludeScenarioIds);
    if (includeScenarios.size > 0 && !includeScenarios.has(episode.scenario.id)) return 'scenario-not-included';
    if (excludeScenarios.has(episode.scenario.id)) return 'scenario-excluded';
    if (options.excludeTimeout && episode.summary.timeout) return 'timeout';
    if (options.excludeStoppedByMaxSteps && episode.summary.stoppedByMaxSteps) return 'stopped-by-max-steps';
    if (options.excludeIllegal && (episode.summary.illegalActionCount > 0 || episode.steps.some(step => step.illegal))) return 'illegal-action';
    return null;
}

async function readEpisodes(inputFiles: readonly string[]): Promise<LoadedEpisode[]> {
    const groups = await Promise.all(inputFiles.map(async inputFile => {
        const episodes = parseEpisodeJsonl(await readFile(inputFile, 'utf8'), inputFile);
        return episodes.map((episode, inputIndex) => ({ episode, inputFile, inputIndex }));
    }));
    return groups.flat();
}

function createDefaultEnvFactory(unpackDir: string): SkirmishDistillEnvFactory {
    const scenarioById = new Map<string, ApkSkirmishTrainingScenario>(
        getApkSkirmishTrainingScenarios().map(scenario => [scenario.id, scenario])
    );
    const mapCache = new Map<string, ApkAemMap>();
    return {
        async createEnv(episode) {
            const scenario = scenarioById.get(episode.scenario.id);
            if (!scenario) throw new Error(`未知 APK skirmish 训练场景，无法重放: ${episode.scenario.id}`);
            const cachedMap = mapCache.get(scenario.resourcePath);
            const map = cachedMap ?? await readApkSkirmishTrainingMap(unpackDir, scenario);
            mapCache.set(scenario.resourcePath, map);
            return createApkSkirmishTrainingEnv(map, scenario, {
                seed: episode.seed,
                maxPlies: episode.maxPlies
            });
        }
    };
}

function ensureScenario(summary: SkirmishDistillExportSummary, scenarioId: string) {
    summary.byScenario[scenarioId] ??= { episodes: 0, samples: 0, candidates: 0 };
    return summary.byScenario[scenarioId];
}

export async function exportSkirmishDistillFeatures(options: SkirmishDistillExportOptions): Promise<SkirmishDistillExportSummary> {
    const loadedEpisodes = await readEpisodes(options.inputFiles);
    const envFactory = options.envFactory ?? createDefaultEnvFactory(options.unpackDir);
    const skippedByReason: Record<string, number> = {};
    const summary: SkirmishDistillExportSummary = {
        inputFiles: options.inputFiles,
        outFile: options.outFile,
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        inputEpisodes: loadedEpisodes.length,
        exportedEpisodes: 0,
        skippedEpisodes: 0,
        exportedSamples: 0,
        skippedSamples: 0,
        averageCandidates: 0,
        teacherLabelAgreement: 0,
        skippedByReason,
        byScenario: {},
        sampleLimitReached: false
    };
    let totalCandidates = 0;
    let teacherTopMatchesLabel = 0;

    await mkdir(path.dirname(options.outFile), { recursive: true });
    const output = await open(options.outFile, 'w');
    try {
        for (const loaded of loadedEpisodes) {
            const skipReason = getSkipReason(loaded.episode, options);
            if (skipReason) {
                summary.skippedEpisodes += 1;
                incrementCounter(skippedByReason, skipReason);
                continue;
            }
            if (options.limitEpisodes !== null && summary.exportedEpisodes >= options.limitEpisodes) {
                summary.skippedEpisodes += 1;
                incrementCounter(skippedByReason, 'episode-limit');
                continue;
            }
            if (summary.sampleLimitReached) {
                summary.skippedEpisodes += 1;
                incrementCounter(skippedByReason, 'sample-limit');
                continue;
            }

            const env = await envFactory.createEnv(loaded.episode);
            const replay = replayEpisodeToDistillFeatureSamples(loaded.episode, env, {
                featureDim: options.featureDim,
                featureExtractor: options.featureExtractor,
                maxCandidates: options.maxCandidates,
                inputFile: loaded.inputFile,
                episodeIndex: loaded.inputIndex
            });
            const scenario = ensureScenario(summary, loaded.episode.scenario.id);
            scenario.episodes += 1;
            summary.exportedEpisodes += 1;
            teacherTopMatchesLabel += replay.teacherTopMatchesLabel;

            for (const sample of replay.samples) {
                if (options.limitSamples !== null && summary.exportedSamples >= options.limitSamples) {
                    summary.sampleLimitReached = true;
                    break;
                }
                await output.write(`${JSON.stringify(sample)}\n`, undefined, 'utf8');
                summary.exportedSamples += 1;
                scenario.samples += 1;
                scenario.candidates += sample.candidates.length;
                totalCandidates += sample.candidates.length;
            }
            summary.skippedSamples += loaded.episode.steps.length - replay.samples.length;
        }
    } finally {
        await output.close();
    }

    summary.averageCandidates = summary.exportedSamples > 0 ? totalCandidates / summary.exportedSamples : 0;
    summary.teacherLabelAgreement = summary.exportedSamples > 0 ? teacherTopMatchesLabel / summary.exportedSamples : 0;
    return summary;
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}

export function formatSkirmishDistillExportSummary(summary: SkirmishDistillExportSummary): string {
    const lines = [
        '# Skirmish distill feature 导出摘要',
        '',
        `- 输出文件：\`${summary.outFile}\``,
        `- 特征维度：${summary.featureDim}`,
        `- 特征版本：${summary.featureExtractor}`,
        `- 候选动作上限：${summary.maxCandidates ?? '全量'}`,
        `- 输入 episode：${summary.inputEpisodes}`,
        `- 导出 episode：${summary.exportedEpisodes}`,
        `- 跳过 episode：${summary.skippedEpisodes}`,
        `- 导出样本：${summary.exportedSamples}`,
        `- 跳过样本：${summary.skippedSamples}`,
        `- 平均候选动作：${summary.averageCandidates.toFixed(2)}`,
        `- heuristic 第一名与原标签一致率：${formatPercent(summary.teacherLabelAgreement)}`,
        `- 样本上限触发：${summary.sampleLimitReached ? '是' : '否'}`
    ];

    if (Object.keys(summary.skippedByReason).length > 0) {
        lines.push('', '| 跳过原因 | Episode |', '| --- | ---: |');
        for (const [reason, count] of Object.entries(summary.skippedByReason).sort()) {
            lines.push(`| ${reason} | ${count} |`);
        }
    }

    lines.push('', '| 场景 | Episode | 样本 | 候选动作 |', '| --- | ---: | ---: | ---: |');
    for (const [scenarioId, item] of Object.entries(summary.byScenario).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| \`${scenarioId}\` | ${item.episodes} | ${item.samples} | ${item.candidates} |`);
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseDistillExportArgs(process.argv.slice(2));
    const summary = await exportSkirmishDistillFeatures(options);
    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishDistillExportSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
