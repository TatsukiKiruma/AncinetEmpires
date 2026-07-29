import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { EnvStepResult } from '../src/game/env';
import {
    buildCandidateFeatures,
    sparseFeaturesToEntries,
    type SkirmishFeatureCandidate,
    type SkirmishFeatureExtractor,
    type SkirmishFeatureSample
} from './skirmish_bc_train';
import {
    createDefaultEnvFactory,
    replayEpisodeDatasetItems,
    type SkirmishDatasetEnvFactory,
    type SkirmishDatasetSample
} from './skirmish_dataset_export';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';
import {
    buildDatasetId,
    createImmutableArtifactDirectory,
    FeatureShardWriter,
    hashDatasetSource,
    resolveGitCommit,
    writeImmutableManifest,
    type FeatureShardMetadata,
    type ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';
import {
    chooseHeuristicTrainingLabel,
    type HeuristicRelabelMode,
    type HeuristicRelabelOptions
} from './skirmish_heuristic_relabel';
import type { SkirmishEpisodeRecord } from './skirmish_training_runner';
import {
    selectEpisodeStepIndexes,
    StreamingSampleQuota,
    type StreamingSampleQuotaOptions
} from './skirmish_training_sampling';

export interface SkirmishEpisodeFeatureExportOptions {
    inputFiles: string[];
    outFile: string;
    unpackDir: string;
    sdTrainingPlanFile?: string | null;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number | null;
    hardNegativeRatio: number;
    timeoutPrefixTurns: number | null;
    timeoutTailTurns: number;
    retainTimeoutPrefix: boolean;
    retainMaxStepPrefix: boolean;
    retainStagnationPrefix: boolean;
    maxSamplesPerEpisode: number | null;
    quota: StreamingSampleQuotaOptions;
    excludeIllegal: boolean;
    includeScenarioIds: string[];
    excludeScenarioIds: string[];
    limitEpisodes: number | null;
    relabel: HeuristicRelabelOptions;
    artifact?: {
        rootDir: string;
        datasetVersion: string;
        shardSamples: number;
        validationRatio: number;
        splitSeed: number;
    } | null;
    json: boolean;
    envFactory?: SkirmishDatasetEnvFactory;
}

export interface SkirmishEpisodeFeatureExportSummary {
    inputFiles: string[];
    outFile: string;
    inputEpisodes: number;
    replayedEpisodes: number;
    skippedEpisodes: number;
    replayedSteps: number;
    exportedSamples: number;
    relabeledSamples: number;
    skippedIllegalSamples: number;
    droppedByTruncation: number;
    droppedByEpisodeQuota: number;
    droppedByGlobalQuota: number;
    averageCandidates: number;
    averageFeaturesPerCandidate: number;
    byScenario: Record<string, {
        episodes: number;
        samples: number;
        candidates: number;
    }>;
    quota: ReturnType<StreamingSampleQuota['snapshot']>;
    datasetId?: string;
    artifactDir?: string;
    manifestFile?: string;
    shards?: FeatureShardMetadata[];
}

const DEFAULT_FEATURE_DIR = path.resolve(process.cwd(), 'training_runs', 'features');
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_FEATURE_DIR, `skirmish-episode-features-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run export:skirmish:episode-features -- --input <episode.jsonl> [选项]

直接逐行重放 episode 并写 compact feature，不生成 full dataset 中间文件。

选项:
  --input <file>                 episode JSONL，可重复
  --out <file>                   feature JSONL 输出
  --artifact-root <dir>          内容寻址分片根目录；CLI 默认 training_runs/feature_datasets
  --dataset-version <name>       数据集版本名，默认 skirmish-feature-v2
  --shard-samples <n>            每分片样本数，默认 50000
  --validation-ratio <0..1>      episode 级验证集比例，默认 0.1
  --split-seed <n>               train/validation 稳定切分种子
  --single-file                  使用 --out 单文件兼容模式
  --unpack <dir>                 APK 解包目录
  --sd-training-plan <file>      SD 派生局面计划
  --feature-dim <n>              哈希特征维度，默认 16384
  --feature-extractor <name>     hashed-action-v1/v2/v3，默认 v3
  --max-candidates <n>           每样本候选上限，默认 64
  --all-candidates               保留全部合法候选
  --hard-negative-ratio <0..1>   候选中 hard negative 比例，默认 0.5
  --timeout-prefix-turns <n>     timeout 最多保留前 n 回合，默认 80
  --timeout-tail-turns <n>       timeout 丢弃末尾 n 回合，默认 20
  --drop-timeout                 整局丢弃 timeout
  --drop-max-steps               丢弃 max-steps 截断局
  --drop-stagnation              丢弃停滞早停局
  --max-samples-per-episode <n>  单局样本配额
  --max-samples <n>              全局样本配额
  --max-per-scenario <n>         每场景样本配额
  --max-per-policy <n>           每策略样本配额
  --max-per-action-type <n>      每动作类型默认配额
  --action-type-limit <type=n>   指定动作类型配额，可重复
  --scenario <id>                只导出指定场景，可重复
  --exclude-scenario <id>        排除场景，可重复
  --limit-episodes <n>           最多重放 episode 数
  --include-illegal              允许非法动作样本
  --relabel-mode <mode>          none/heuristic/fast-rollout，默认 fast-rollout
  --relabel-policy <name>        需要重标注的源策略，可重复；默认 random
  --relabel-min-margin <n>       替换标签所需最小分差，默认 25
  --rollout-depth <n>            快速 rollout 深度，默认 2
  --rollout-candidates <n>       rollout 的高分候选数，默认 4
  --rollout-weight <n>           rollout 局面价值权重，默认 0.05
  --json                         摘要输出 JSON
  --help                         显示帮助
`);
}

function parseInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
    return parsed;
}

function parseNonNegativeInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed < 0) throw new Error(`${label} 不能为负数`);
    return parsed;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

function parseRatio(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`${label} 必须在 0 到 1 之间`);
    }
    return parsed;
}

function parseFiniteNumber(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} 必须是有限数值`);
    return parsed;
}

function parseRelabelMode(value: string | undefined): HeuristicRelabelMode {
    if (value === 'none' || value === 'heuristic' || value === 'fast-rollout') return value;
    throw new Error('--relabel-mode 只能是 none、heuristic 或 fast-rollout');
}

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3') {
        return value;
    }
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2 或 hashed-action-v3');
}

function parseActionTypeLimit(value: string | undefined): [string, number] {
    if (!value) throw new Error('--action-type-limit 缺少 type=n 参数');
    const separator = value.lastIndexOf('=');
    const actionType = value.slice(0, separator).trim();
    const limit = Number(value.slice(separator + 1));
    if (separator <= 0 || !actionType || !Number.isInteger(limit) || limit < 0) {
        throw new Error('--action-type-limit 必须使用 type=n，且 n 为非负整数');
    }
    return [actionType, limit];
}

export function parseEpisodeFeatureExportArgs(
    argv: readonly string[]
): SkirmishEpisodeFeatureExportOptions {
    const options: SkirmishEpisodeFeatureExportOptions = {
        inputFiles: [],
        outFile: defaultOutFile(),
        unpackDir: path.resolve(process.cwd(), 'APK', '_analysis', 'unpack'),
        sdTrainingPlanFile: null,
        featureDim: 16384,
        featureExtractor: 'hashed-action-v3',
        maxCandidates: 64,
        hardNegativeRatio: 0.5,
        timeoutPrefixTurns: 80,
        timeoutTailTurns: 20,
        retainTimeoutPrefix: true,
        retainMaxStepPrefix: true,
        retainStagnationPrefix: true,
        maxSamplesPerEpisode: null,
        quota: {},
        excludeIllegal: true,
        includeScenarioIds: [],
        excludeScenarioIds: [],
        limitEpisodes: null,
        relabel: {
            mode: 'fast-rollout',
            policies: ['random'],
            minScoreMargin: 25,
            rolloutDepth: 2,
            rolloutCandidates: 4,
            rolloutWeight: 0.05
        },
        artifact: {
            rootDir: path.resolve(process.cwd(), 'training_runs', 'feature_datasets'),
            datasetVersion: 'skirmish-feature-v2',
            shardSamples: 50_000,
            validationRatio: 0.1,
            splitSeed: 20260730
        },
        json: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--input') {
            const value = argv[++index];
            if (!value) throw new Error('--input 缺少文件参数');
            options.inputFiles.push(path.resolve(value));
        } else if (arg === '--out') {
            const value = argv[++index];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--artifact-root') {
            const value = argv[++index];
            if (!value) throw new Error('--artifact-root 缺少目录参数');
            options.artifact ??= {
                rootDir: path.resolve(value),
                datasetVersion: 'skirmish-feature-v2',
                shardSamples: 50_000,
                validationRatio: 0.1,
                splitSeed: 20260730
            };
            options.artifact.rootDir = path.resolve(value);
        } else if (arg === '--dataset-version') {
            const value = argv[++index];
            if (!value) throw new Error('--dataset-version 缺少版本名');
            if (!options.artifact) throw new Error('--dataset-version 不能与 --single-file 同时使用');
            options.artifact.datasetVersion = value;
        } else if (arg === '--shard-samples') {
            if (!options.artifact) throw new Error('--shard-samples 不能与 --single-file 同时使用');
            options.artifact.shardSamples = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--validation-ratio') {
            if (!options.artifact) throw new Error('--validation-ratio 不能与 --single-file 同时使用');
            options.artifact.validationRatio = parseRatio(argv[++index], arg);
        } else if (arg === '--split-seed') {
            if (!options.artifact) throw new Error('--split-seed 不能与 --single-file 同时使用');
            options.artifact.splitSeed = parseInteger(argv[++index], arg);
        } else if (arg === '--single-file') {
            options.artifact = null;
        } else if (arg === '--unpack') {
            const value = argv[++index];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--sd-training-plan') {
            const value = argv[++index];
            if (!value) throw new Error('--sd-training-plan 缺少文件参数');
            options.sdTrainingPlanFile = path.resolve(value);
        } else if (arg === '--feature-dim') {
            options.featureDim = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++index]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--all-candidates') {
            options.maxCandidates = null;
        } else if (arg === '--hard-negative-ratio') {
            options.hardNegativeRatio = parseRatio(argv[++index], arg);
        } else if (arg === '--timeout-prefix-turns') {
            options.timeoutPrefixTurns = parseNonNegativeInteger(argv[++index], arg);
        } else if (arg === '--timeout-tail-turns') {
            options.timeoutTailTurns = parseNonNegativeInteger(argv[++index], arg);
        } else if (arg === '--drop-timeout') {
            options.retainTimeoutPrefix = false;
        } else if (arg === '--drop-max-steps') {
            options.retainMaxStepPrefix = false;
        } else if (arg === '--drop-stagnation') {
            options.retainStagnationPrefix = false;
        } else if (arg === '--max-samples-per-episode') {
            options.maxSamplesPerEpisode = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--max-samples') {
            options.quota.maxSamples = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--max-per-scenario') {
            options.quota.maxPerScenario = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--max-per-policy') {
            options.quota.maxPerPolicy = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--max-per-action-type') {
            options.quota.maxPerActionType = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--action-type-limit') {
            const [actionType, limit] = parseActionTypeLimit(argv[++index]);
            options.quota.maxByActionType = {
                ...options.quota.maxByActionType,
                [actionType]: limit
            };
        } else if (arg === '--scenario') {
            const value = argv[++index];
            if (!value) throw new Error('--scenario 缺少场景 ID');
            options.includeScenarioIds.push(value);
        } else if (arg === '--exclude-scenario') {
            const value = argv[++index];
            if (!value) throw new Error('--exclude-scenario 缺少场景 ID');
            options.excludeScenarioIds.push(value);
        } else if (arg === '--limit-episodes') {
            options.limitEpisodes = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--include-illegal') {
            options.excludeIllegal = false;
        } else if (arg === '--relabel-mode') {
            options.relabel.mode = parseRelabelMode(argv[++index]);
        } else if (arg === '--no-relabel') {
            options.relabel.mode = 'none';
        } else if (arg === '--relabel-policy') {
            const value = argv[++index];
            if (!value) throw new Error('--relabel-policy 缺少策略名');
            options.relabel.policies = [...new Set([...options.relabel.policies, value])];
        } else if (arg === '--relabel-min-margin') {
            options.relabel.minScoreMargin = parseFiniteNumber(argv[++index], arg);
        } else if (arg === '--rollout-depth') {
            options.relabel.rolloutDepth = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--rollout-candidates') {
            options.relabel.rolloutCandidates = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--rollout-weight') {
            options.relabel.rolloutWeight = parseFiniteNumber(argv[++index], arg);
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.inputFiles.length === 0) throw new Error('至少需要一个 --input episode JSONL');
    return options;
}

async function writeLine(stream: NodeJS.WritableStream, line: string) {
    if (!stream.write(line)) await once(stream, 'drain');
}

function shouldIncludeScenario(
    episode: SkirmishEpisodeRecord,
    options: SkirmishEpisodeFeatureExportOptions
): boolean {
    return (
        (options.includeScenarioIds.length === 0 || options.includeScenarioIds.includes(episode.scenario.id))
        && !options.excludeScenarioIds.includes(episode.scenario.id)
    );
}

function ensureScenario(
    summary: SkirmishEpisodeFeatureExportSummary,
    scenarioId: string
) {
    summary.byScenario[scenarioId] ??= { episodes: 0, samples: 0, candidates: 0 };
    return summary.byScenario[scenarioId];
}

function buildFeatureSample(
    episode: SkirmishEpisodeRecord,
    sample: SkirmishDatasetSample,
    result: EnvStepResult,
    options: SkirmishEpisodeFeatureExportOptions
): { sample: SkirmishFeatureSample; relabeled: boolean } | null {
    const relabelDecision = chooseHeuristicTrainingLabel(
        result,
        sample.label.actionCode,
        sample.policy,
        options.relabel
    );
    if (!relabelDecision || relabelDecision.entry.fixedActionIndex === null) return null;
    const effectiveLabel = relabelDecision.entry;
    const scoredCodes = relabelDecision.candidates.map(candidate => ({
        actionCode: candidate.entry.code,
        teacherScore: candidate.teacherScore
    }));
    const selected = selectStratifiedHardNegativeCandidates(
        scoredCodes,
        effectiveLabel.code,
        {
            maxCandidates: options.maxCandidates,
            hardNegativeRatio: options.hardNegativeRatio,
            deterministicKey: `${episode.scenario.id}\0${episode.seed}\0${sample.step}`
        }
    );
    if (selected.length === 0) return null;

    const candidates: SkirmishFeatureCandidate[] = [];
    for (const candidate of selected) {
        const features = buildCandidateFeatures(
            sample,
            candidate.actionCode,
            options.featureDim,
            options.featureExtractor
        );
        if (!features) continue;
        candidates.push({
            actionCode: candidate.actionCode,
            features: sparseFeaturesToEntries(features),
            teacherScore: candidate.teacherScore,
            teacherRank: candidate.teacherRank
        });
    }
    if (!candidates.some(candidate => candidate.actionCode === effectiveLabel.code)) return null;

    return {
        relabeled: relabelDecision.relabeled,
        sample: {
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
            policy: sample.policy,
            label: {
                fixedActionIndex: effectiveLabel.fixedActionIndex,
                actionCode: effectiveLabel.code,
                ...(relabelDecision.relabeled ? {
                    originalActionCode: relabelDecision.originalEntry.code,
                    relabel: {
                        method: relabelDecision.method as 'heuristic' | 'fast-rollout',
                        scoreMargin: relabelDecision.scoreMargin,
                        rolloutDepth: options.relabel.rolloutDepth
                    }
                } : {})
            },
            candidates
        }
    };
}

function buildArtifactGeneratorOptions(
    options: SkirmishEpisodeFeatureExportOptions
): Record<string, unknown> {
    return {
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        hardNegativeRatio: options.hardNegativeRatio,
        timeoutPrefixTurns: options.timeoutPrefixTurns,
        timeoutTailTurns: options.timeoutTailTurns,
        retainTimeoutPrefix: options.retainTimeoutPrefix,
        retainMaxStepPrefix: options.retainMaxStepPrefix,
        retainStagnationPrefix: options.retainStagnationPrefix,
        maxSamplesPerEpisode: options.maxSamplesPerEpisode,
        quota: options.quota,
        excludeIllegal: options.excludeIllegal,
        includeScenarioIds: options.includeScenarioIds,
        excludeScenarioIds: options.excludeScenarioIds,
        limitEpisodes: options.limitEpisodes,
        relabel: options.relabel,
        shardSamples: options.artifact?.shardSamples,
        validationRatio: options.artifact?.validationRatio,
        splitSeed: options.artifact?.splitSeed,
        customEnvFactory: options.envFactory !== undefined
    };
}

export async function exportEpisodeFeatures(
    options: SkirmishEpisodeFeatureExportOptions
): Promise<SkirmishEpisodeFeatureExportSummary> {
    const generatorOptions = buildArtifactGeneratorOptions(options);
    const sourceFiles = [
        ...options.inputFiles,
        ...(options.sdTrainingPlanFile ? [options.sdTrainingPlanFile] : [])
    ];
    const sources = options.artifact
        ? await Promise.all(sourceFiles.map(hashDatasetSource))
        : [];
    const datasetId = options.artifact
        ? buildDatasetId({
            datasetVersion: options.artifact.datasetVersion,
            generatorOptions,
            sources
        })
        : undefined;
    const artifactDir = options.artifact && datasetId
        ? await createImmutableArtifactDirectory(
            options.artifact.rootDir,
            options.artifact.datasetVersion,
            datasetId
        )
        : undefined;
    const shardWriter = options.artifact && artifactDir
        ? new FeatureShardWriter({
            artifactDir,
            shardSamples: options.artifact.shardSamples,
            validationRatio: options.artifact.validationRatio,
            splitSeed: options.artifact.splitSeed
        })
        : null;
    if (!shardWriter) await mkdir(path.dirname(options.outFile), { recursive: true });
    const output = shardWriter
        ? null
        : createWriteStream(options.outFile, { encoding: 'utf8' });
    const envFactory = options.envFactory
        ?? await createDefaultEnvFactory(options.unpackDir, options.sdTrainingPlanFile ?? null);
    const quota = new StreamingSampleQuota(options.quota);
    const summary: SkirmishEpisodeFeatureExportSummary = {
        inputFiles: options.inputFiles,
        outFile: artifactDir ?? options.outFile,
        inputEpisodes: 0,
        replayedEpisodes: 0,
        skippedEpisodes: 0,
        replayedSteps: 0,
        exportedSamples: 0,
        relabeledSamples: 0,
        skippedIllegalSamples: 0,
        droppedByTruncation: 0,
        droppedByEpisodeQuota: 0,
        droppedByGlobalQuota: 0,
        averageCandidates: 0,
        averageFeaturesPerCandidate: 0,
        byScenario: {},
        quota: quota.snapshot(),
        datasetId,
        artifactDir
    };
    let totalCandidates = 0;
    let totalFeatureEntries = 0;

    try {
        for (const inputFile of options.inputFiles) {
            const lines = createInterface({
                input: createReadStream(inputFile, { encoding: 'utf8' }),
                crlfDelay: Infinity
            });
            let episodeIndex = 0;
            for await (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const currentEpisodeIndex = episodeIndex++;
                summary.inputEpisodes += 1;
                const episode = JSON.parse(trimmed) as SkirmishEpisodeRecord;
                if (episode.kind !== 'skirmish_episode' || !shouldIncludeScenario(episode, options)) {
                    summary.skippedEpisodes += 1;
                    continue;
                }
                if (
                    options.limitEpisodes !== null
                    && summary.replayedEpisodes >= options.limitEpisodes
                ) {
                    summary.skippedEpisodes += 1;
                    continue;
                }

                const selection = selectEpisodeStepIndexes(episode, {
                    retainTimeoutPrefix: options.retainTimeoutPrefix,
                    timeoutPrefixTurns: options.timeoutPrefixTurns,
                    timeoutTailTurns: options.timeoutTailTurns,
                    retainMaxStepPrefix: options.retainMaxStepPrefix,
                    retainStagnationPrefix: options.retainStagnationPrefix,
                    maxSamplesPerEpisode: options.maxSamplesPerEpisode
                });
                summary.droppedByTruncation += selection.droppedByTruncation;
                summary.droppedByEpisodeQuota += selection.droppedByEpisodeQuota;
                if (selection.indexes.length === 0) {
                    summary.skippedEpisodes += 1;
                    continue;
                }

                const selectedIndexes = new Set(selection.indexes);
                const env = await envFactory.createEnv(episode);
                const scenarioSummary = ensureScenario(summary, episode.scenario.id);
                scenarioSummary.episodes += 1;
                summary.replayedEpisodes += 1;

                for (const { sample, result } of replayEpisodeDatasetItems(episode, env, {
                    observationMode: 'none',
                    inputFile,
                    episodeIndex: currentEpisodeIndex
                })) {
                    summary.replayedSteps += 1;
                    if (!selectedIndexes.has(sample.source.stepIndex)) continue;
                    if (options.excludeIllegal && sample.outcome.illegal) {
                        summary.skippedIllegalSamples += 1;
                        continue;
                    }
                    if (!quota.accept({
                        scenarioId: sample.scenario.id,
                        policy: sample.policy,
                        actionCode: sample.label.actionCode
                    })) {
                        summary.droppedByGlobalQuota += 1;
                        continue;
                    }

                    const builtFeature = buildFeatureSample(
                        episode,
                        {
                            ...sample,
                            observation: result.observation
                        },
                        result,
                        options
                    );
                    if (!builtFeature) {
                        throw new Error(
                            `${episode.scenario.id} seed=${episode.seed} step=${sample.step} 无法保留标签候选`
                        );
                    }
                    const featureSample = builtFeature.sample;
                    if (shardWriter) {
                        await shardWriter.write(
                            featureSample,
                            `${episode.scenario.id}\0${episode.seed}`
                        );
                    } else if (output) {
                        await writeLine(output, `${JSON.stringify(featureSample)}\n`);
                    }
                    summary.exportedSamples += 1;
                    summary.relabeledSamples += builtFeature.relabeled ? 1 : 0;
                    scenarioSummary.samples += 1;
                    scenarioSummary.candidates += featureSample.candidates.length;
                    totalCandidates += featureSample.candidates.length;
                    totalFeatureEntries += featureSample.candidates.reduce(
                        (sum, candidate) => sum + candidate.features.length,
                        0
                    );
                }
            }
        }
    } finally {
        if (output) {
            output.end();
            await once(output, 'finish');
        }
        if (shardWriter) {
            summary.shards = await shardWriter.close();
        }
    }

    summary.averageCandidates = summary.exportedSamples > 0
        ? totalCandidates / summary.exportedSamples
        : 0;
    summary.averageFeaturesPerCandidate = totalCandidates > 0
        ? totalFeatureEntries / totalCandidates
        : 0;
    summary.quota = quota.snapshot();
    if (options.artifact && artifactDir && datasetId && summary.shards) {
        const manifest: ImmutableDatasetManifest = {
            kind: 'skirmish_feature_dataset_manifest',
            schemaVersion: 1,
            datasetVersion: options.artifact.datasetVersion,
            datasetId,
            createdAt: new Date().toISOString(),
            generator: {
                tool: 'tools/skirmish_episode_feature_export.ts',
                version: 2,
                gitCommit: await resolveGitCommit(),
                options: generatorOptions
            },
            sources,
            split: {
                strategy: 'episode-hash-v1',
                validationRatio: options.artifact.validationRatio,
                seed: options.artifact.splitSeed
            },
            shards: summary.shards,
            summary: {
                inputEpisodes: summary.inputEpisodes,
                replayedEpisodes: summary.replayedEpisodes,
                exportedSamples: summary.exportedSamples,
                relabeledSamples: summary.relabeledSamples,
                droppedByTruncation: summary.droppedByTruncation,
                droppedByEpisodeQuota: summary.droppedByEpisodeQuota,
                droppedByGlobalQuota: summary.droppedByGlobalQuota,
                averageCandidates: summary.averageCandidates,
                averageFeaturesPerCandidate: summary.averageFeaturesPerCandidate,
                byScenario: summary.byScenario,
                quota: summary.quota
            }
        };
        summary.manifestFile = await writeImmutableManifest(artifactDir, manifest);
    }
    return summary;
}

export function formatEpisodeFeatureExportSummary(
    summary: SkirmishEpisodeFeatureExportSummary
): string {
    return [
        '# Episode → feature 流式导出摘要',
        '',
        `- 输入 episode：${summary.inputEpisodes}`,
        `- 重放 episode：${summary.replayedEpisodes}`,
        `- 导出样本：${summary.exportedSamples}`,
        `- heuristic/rollout 重标注：${summary.relabeledSamples}`,
        `- timeout/截断剔除 step：${summary.droppedByTruncation}`,
        `- 局内配额剔除 step：${summary.droppedByEpisodeQuota}`,
        `- 全局配额剔除样本：${summary.droppedByGlobalQuota}`,
        `- 平均候选数：${summary.averageCandidates.toFixed(2)}`,
        `- 每候选平均特征数：${summary.averageFeaturesPerCandidate.toFixed(2)}`,
        summary.datasetId ? `- 数据集 ID：\`${summary.datasetId}\`` : null,
        summary.manifestFile ? `- 不可变 manifest：\`${summary.manifestFile}\`` : null,
        summary.shards ? `- 分片：${summary.shards.length}` : null,
        `- 输出文件：\`${summary.outFile}\``
    ].filter((line): line is string => line !== null).join('\n') + '\n';
}

async function main() {
    const options = parseEpisodeFeatureExportArgs(process.argv.slice(2));
    const summary = await exportEpisodeFeatures(options);
    console.log(options.json
        ? JSON.stringify({ summary }, null, 2)
        : formatEpisodeFeatureExportSummary(summary));
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
