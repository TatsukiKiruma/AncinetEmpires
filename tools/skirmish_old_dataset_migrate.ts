import { createReadStream } from 'node:fs';
import {
    mkdir,
    readFile,
    readdir,
    rename,
    stat,
    writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { SkirmishFeatureExtractor } from './skirmish_bc_train';
import type { SkirmishDatasetEnvFactory } from './skirmish_dataset_export';
import {
    buildDatasetId,
    hashDatasetSource,
    resolveGitCommit,
    writeImmutableManifest,
    type DatasetSourceMetadata,
    type FeatureShardMetadata,
    type ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';
import { validateFeatureDatasetManifest } from './skirmish_dataset_validate';
import {
    exportEpisodeFeatures,
    type SkirmishEpisodeFeatureExportOptions
} from './skirmish_episode_feature_export';
import type { HeuristicRelabelMode } from './skirmish_heuristic_relabel';

export interface OldDatasetMigrationOptions {
    sourceDir: string;
    outRoot: string;
    planFile: string | null;
    unpackDir: string;
    datasetVersion: string;
    batchEpisodes: number;
    maxSamplesPerEpisode: number;
    shardSamples: number;
    validationRatio: number;
    splitSeed: number;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number;
    hardNegativeRatio: number;
    timeoutPrefixTurns: number;
    timeoutTailTurns: number;
    relabelMode: HeuristicRelabelMode;
    relabelPolicies: string[];
    relabelMinMargin: number;
    rolloutDepth: number;
    rolloutCandidates: number;
    rolloutWeight: number;
    stopAfterBatches: number | null;
    json: boolean;
    envFactory?: SkirmishDatasetEnvFactory;
}

export interface MigrationBatch {
    id: string;
    inputFile: string;
    source: DatasetSourceMetadata;
    startEpisode: number;
    episodeCount: number;
}

export interface OldDatasetMigrationStatus {
    kind: 'skirmish_old_dataset_migration_status';
    version: 1;
    migrationId: string;
    state: 'running' | 'paused' | 'complete' | 'failed';
    runDir: string;
    totalBatches: number;
    completedBatches: number;
    currentBatch: string | null;
    updatedAt: string;
    finalManifest: string | null;
    message?: string;
}

export interface OldDatasetMigrationResult {
    runDir: string;
    statusFile: string;
    finalManifest: string | null;
    completedBatches: number;
    totalBatches: number;
    paused: boolean;
}

const DEFAULT_SOURCE_DIR = path.resolve(
    process.cwd(),
    'training_runs',
    'episodes',
    'sd_training_plan_20260705_heuristic-apk-like-balanced'
);
const DEFAULT_OUT_ROOT = path.resolve(
    process.cwd(),
    'training_runs',
    'feature_migrations',
    'old_episode_v3'
);
const DEFAULT_PLAN_FILE = path.resolve(
    process.cwd(),
    'training_configs',
    'sd_training_plan_20260705.json'
);
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function printHelp() {
    console.log(`用法: npm run migrate:skirmish:old-data -- [选项]

旧 episode 会按小批建立 checkpoint。按 Ctrl+C 停止后，重新执行完全相同的命令即可续跑。

选项:
  --source-dir <dir>             旧 episode JSONL 目录
  --out-root <dir>               迁移输出根目录
  --plan <file>                  SD 训练计划；自定义 env 测试可省略
  --dataset-version <name>       数据集版本名
  --batch-episodes <n>           每个 checkpoint 的 episode 数，默认 10
  --max-samples-per-episode <n>  每局样本上限，默认 300
  --shard-samples <n>            每个分片样本上限，默认 5000
  --validation-ratio <0..1>      验证集比例，默认 0.1
  --feature-dim <n>              特征维度，默认 4096
  --feature-extractor <name>     hashed-action-v1/v2/v3，默认 v3
  --max-candidates <n>           候选上限，默认 64
  --relabel-mode <mode>          none/heuristic/fast-rollout，默认 fast-rollout
  --fast-rollout                 等价于 --relabel-mode fast-rollout
  --relabel-policy <name>        重标注源策略，可重复，默认 apk-like
  --no-relabel                   关闭标签替换，但仍保留 hard-negative
  --stop-after-batches <n>       本次完成 n 个新批次后主动暂停，用于测试断点
  --json                         最终摘要输出 JSON
  --help                         显示帮助
`);
}

function parseInteger(value: string | undefined, label: string, allowZero = false): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
        throw new Error(`${label} 必须是${allowZero ? '非负' : '正'}整数`);
    }
    return parsed;
}

function parseNumber(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} 必须是有限数值`);
    return parsed;
}

function parseRatio(value: string | undefined, label: string): number {
    const parsed = parseNumber(value, label);
    if (parsed < 0 || parsed > 1) throw new Error(`${label} 必须在 0 到 1 之间`);
    return parsed;
}

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3') {
        return value;
    }
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2 或 hashed-action-v3');
}

function parseRelabelMode(value: string | undefined): HeuristicRelabelMode {
    if (value === 'none' || value === 'heuristic' || value === 'fast-rollout') return value;
    throw new Error('--relabel-mode 只能是 none、heuristic 或 fast-rollout');
}

export function parseOldDatasetMigrationArgs(argv: readonly string[]): OldDatasetMigrationOptions {
    const options: OldDatasetMigrationOptions = {
        sourceDir: DEFAULT_SOURCE_DIR,
        outRoot: DEFAULT_OUT_ROOT,
        planFile: DEFAULT_PLAN_FILE,
        unpackDir: path.resolve(process.cwd(), 'APK', '_analysis', 'unpack'),
        datasetVersion: 'old-episodes-v3-f4096-c64-q300',
        batchEpisodes: 10,
        maxSamplesPerEpisode: 300,
        shardSamples: 5000,
        validationRatio: 0.1,
        splitSeed: 20260730,
        featureDim: 4096,
        featureExtractor: 'hashed-action-v3',
        maxCandidates: 64,
        hardNegativeRatio: 0.5,
        timeoutPrefixTurns: 80,
        timeoutTailTurns: 20,
        relabelMode: 'fast-rollout',
        relabelPolicies: ['apk-like'],
        relabelMinMargin: 25,
        rolloutDepth: 2,
        rolloutCandidates: 4,
        rolloutWeight: 0.05,
        stopAfterBatches: null,
        json: false
    };
    let customRelabelPolicies = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--source-dir') {
            const value = argv[++index];
            if (!value) throw new Error('--source-dir 缺少目录参数');
            options.sourceDir = path.resolve(value);
        } else if (arg === '--out-root') {
            const value = argv[++index];
            if (!value) throw new Error('--out-root 缺少目录参数');
            options.outRoot = path.resolve(value);
        } else if (arg === '--plan') {
            const value = argv[++index];
            if (!value) throw new Error('--plan 缺少文件参数');
            options.planFile = path.resolve(value);
        } else if (arg === '--unpack') {
            const value = argv[++index];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--dataset-version') {
            const value = argv[++index];
            if (!value) throw new Error('--dataset-version 缺少版本名');
            options.datasetVersion = value;
        } else if (arg === '--batch-episodes') {
            options.batchEpisodes = parseInteger(argv[++index], arg);
        } else if (arg === '--max-samples-per-episode') {
            options.maxSamplesPerEpisode = parseInteger(argv[++index], arg);
        } else if (arg === '--shard-samples') {
            options.shardSamples = parseInteger(argv[++index], arg);
        } else if (arg === '--validation-ratio') {
            options.validationRatio = parseRatio(argv[++index], arg);
        } else if (arg === '--split-seed') {
            options.splitSeed = parseInteger(argv[++index], arg, true);
        } else if (arg === '--feature-dim') {
            options.featureDim = parseInteger(argv[++index], arg);
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++index]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parseInteger(argv[++index], arg);
        } else if (arg === '--hard-negative-ratio') {
            options.hardNegativeRatio = parseRatio(argv[++index], arg);
        } else if (arg === '--timeout-prefix-turns') {
            options.timeoutPrefixTurns = parseInteger(argv[++index], arg, true);
        } else if (arg === '--timeout-tail-turns') {
            options.timeoutTailTurns = parseInteger(argv[++index], arg, true);
        } else if (arg === '--relabel-mode') {
            options.relabelMode = parseRelabelMode(argv[++index]);
        } else if (arg === '--fast-rollout') {
            options.relabelMode = 'fast-rollout';
        } else if (arg === '--no-relabel') {
            options.relabelMode = 'none';
        } else if (arg === '--relabel-policy') {
            const value = argv[++index];
            if (!value) throw new Error('--relabel-policy 缺少策略名');
            if (!customRelabelPolicies) {
                options.relabelPolicies = [];
                customRelabelPolicies = true;
            }
            options.relabelPolicies.push(value);
        } else if (arg === '--relabel-min-margin') {
            options.relabelMinMargin = parseNumber(argv[++index], arg);
        } else if (arg === '--rollout-depth') {
            options.rolloutDepth = parseInteger(argv[++index], arg);
        } else if (arg === '--rollout-candidates') {
            options.rolloutCandidates = parseInteger(argv[++index], arg);
        } else if (arg === '--rollout-weight') {
            options.rolloutWeight = parseNumber(argv[++index], arg);
        } else if (arg === '--stop-after-batches') {
            options.stopAfterBatches = parseInteger(argv[++index], arg);
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }
    return options;
}

async function listEpisodeFiles(sourceDir: string): Promise<string[]> {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map(entry => path.join(sourceDir, entry.name))
        .sort((left, right) => left.localeCompare(right));
}

async function countEpisodes(file: string): Promise<number> {
    const lines = createInterface({
        input: createReadStream(file),
        crlfDelay: Infinity
    });
    let count = 0;
    for await (const line of lines) {
        if (line.trim()) count += 1;
    }
    return count;
}

function safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

async function buildBatches(
    inputSources: readonly DatasetSourceMetadata[],
    batchEpisodes: number
): Promise<MigrationBatch[]> {
    const batches: MigrationBatch[] = [];
    for (const source of inputSources) {
        const episodeCount = await countEpisodes(source.path);
        const fileId = safeSegment(path.basename(source.path, path.extname(source.path)));
        for (let startEpisode = 0; startEpisode < episodeCount; startEpisode += batchEpisodes) {
            const count = Math.min(batchEpisodes, episodeCount - startEpisode);
            batches.push({
                id: `${fileId}-e${String(startEpisode).padStart(5, '0')}-${String(startEpisode + count - 1).padStart(5, '0')}`,
                inputFile: source.path,
                source,
                startEpisode,
                episodeCount: count
            });
        }
    }
    return batches;
}

function buildMigrationGeneratorOptions(options: OldDatasetMigrationOptions): Record<string, unknown> {
    return {
        tool: 'tools/skirmish_old_dataset_migrate.ts',
        version: 1,
        batchEpisodes: options.batchEpisodes,
        maxSamplesPerEpisode: options.maxSamplesPerEpisode,
        shardSamples: options.shardSamples,
        validationRatio: options.validationRatio,
        splitSeed: options.splitSeed,
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        hardNegativeRatio: options.hardNegativeRatio,
        timeoutPrefixTurns: options.timeoutPrefixTurns,
        timeoutTailTurns: options.timeoutTailTurns,
        relabelMode: options.relabelMode,
        relabelPolicies: options.relabelPolicies,
        relabelMinMargin: options.relabelMinMargin,
        rolloutDepth: options.rolloutDepth,
        rolloutCandidates: options.rolloutCandidates,
        rolloutWeight: options.rolloutWeight,
        customEnvFactory: options.envFactory !== undefined
    };
}

async function writeStatus(statusFile: string, status: OldDatasetMigrationStatus) {
    const temporaryFile = `${statusFile}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, statusFile);
}

async function findManifestBelow(directory: string): Promise<string | null> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const manifestFile = path.join(directory, entry.name, 'manifest.json');
            try {
                if ((await stat(manifestFile)).isFile()) return manifestFile;
            } catch {
                // 没有 manifest 的目录由恢复逻辑处理。
            }
        }
        return null;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
}

function assertInside(parent: string, target: string) {
    const relative = path.relative(path.resolve(parent), path.resolve(target));
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`恢复目录越界：${target}`);
    }
}

async function archiveIncompleteBatch(batchRoot: string, interruptedDir: string, batchId: string) {
    let entries;
    try {
        entries = await readdir(batchRoot, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sourceDir = path.join(batchRoot, entry.name);
        const manifestFile = path.join(sourceDir, 'manifest.json');
        try {
            await stat(manifestFile);
            continue;
        } catch {
            // 中断目录没有 manifest，移动后重试同一批。
        }
        assertInside(batchRoot, sourceDir);
        await mkdir(interruptedDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const targetDir = path.join(interruptedDir, `${stamp}-${safeSegment(batchId)}-${entry.name}`);
        assertInside(interruptedDir, targetDir);
        await rename(sourceDir, targetDir);
    }
}

function createBatchExportOptions(
    options: OldDatasetMigrationOptions,
    batch: MigrationBatch,
    batchRoot: string,
    sourceMetadata: DatasetSourceMetadata[]
): SkirmishEpisodeFeatureExportOptions {
    return {
        inputFiles: [batch.inputFile],
        outFile: path.join(batchRoot, 'unused.jsonl'),
        unpackDir: options.unpackDir,
        sdTrainingPlanFile: options.planFile,
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        hardNegativeRatio: options.hardNegativeRatio,
        timeoutPrefixTurns: options.timeoutPrefixTurns,
        timeoutTailTurns: options.timeoutTailTurns,
        retainTimeoutPrefix: true,
        retainMaxStepPrefix: true,
        retainStagnationPrefix: true,
        maxSamplesPerEpisode: options.maxSamplesPerEpisode,
        quota: {},
        excludeIllegal: true,
        includeScenarioIds: [],
        excludeScenarioIds: [],
        startEpisode: batch.startEpisode,
        limitEpisodes: batch.episodeCount,
        relabel: {
            mode: options.relabelMode,
            policies: options.relabelPolicies,
            minScoreMargin: options.relabelMinMargin,
            rolloutDepth: options.rolloutDepth,
            rolloutCandidates: options.rolloutCandidates,
            rolloutWeight: options.rolloutWeight
        },
        artifact: {
            rootDir: batchRoot,
            datasetVersion: `checkpoint-${batch.id}`,
            shardSamples: options.shardSamples,
            validationRatio: options.validationRatio,
            splitSeed: options.splitSeed
        },
        sourceMetadata,
        json: true,
        envFactory: options.envFactory
    };
}

async function combineBatchManifests(
    runDir: string,
    migrationId: string,
    options: OldDatasetMigrationOptions,
    sources: DatasetSourceMetadata[],
    batchManifestFiles: readonly string[]
): Promise<string> {
    const shards: FeatureShardMetadata[] = [];
    const nextIndex = { train: 0, validation: 0 };
    let exportedSamples = 0;
    let relabeledSamples = 0;
    let replayedEpisodes = 0;

    for (const batchManifestFile of batchManifestFiles) {
        const batchManifest = JSON.parse(
            await readFile(batchManifestFile, 'utf8')
        ) as ImmutableDatasetManifest;
        const batchDir = path.dirname(batchManifestFile);
        for (const shard of batchManifest.shards) {
            const absoluteShard = path.resolve(batchDir, shard.path);
            const relativeShard = path.relative(runDir, absoluteShard).replace(/\\/g, '/');
            assertInside(runDir, absoluteShard);
            shards.push({
                ...shard,
                index: nextIndex[shard.split]++,
                path: relativeShard
            });
        }
        exportedSamples += Number(batchManifest.summary.exportedSamples ?? 0);
        relabeledSamples += Number(batchManifest.summary.relabeledSamples ?? 0);
        replayedEpisodes += Number(batchManifest.summary.replayedEpisodes ?? 0);
    }

    const manifest: ImmutableDatasetManifest = {
        kind: 'skirmish_feature_dataset_manifest',
        schemaVersion: 1,
        datasetVersion: options.datasetVersion,
        datasetId: migrationId,
        createdAt: new Date().toISOString(),
        generator: {
            tool: 'tools/skirmish_old_dataset_migrate.ts',
            version: 1,
            gitCommit: await resolveGitCommit(),
            options: buildMigrationGeneratorOptions(options)
        },
        sources,
        split: {
            strategy: 'episode-hash-v1',
            validationRatio: options.validationRatio,
            seed: options.splitSeed
        },
        shards,
        summary: {
            batches: batchManifestFiles.length,
            replayedEpisodes,
            exportedSamples,
            relabeledSamples
        }
    };
    return writeImmutableManifest(runDir, manifest);
}

export async function migrateOldDataset(
    options: OldDatasetMigrationOptions
): Promise<OldDatasetMigrationResult> {
    const inputFiles = await listEpisodeFiles(options.sourceDir);
    if (inputFiles.length === 0) throw new Error(`没有找到旧 episode JSONL：${options.sourceDir}`);

    const inputSources: DatasetSourceMetadata[] = [];
    for (const inputFile of inputFiles) inputSources.push(await hashDatasetSource(inputFile));
    const planSource = options.planFile ? await hashDatasetSource(options.planFile) : null;
    const sources = [...inputSources, ...(planSource ? [planSource] : [])];
    const generatorOptions = buildMigrationGeneratorOptions(options);
    const migrationId = buildDatasetId({
        datasetVersion: options.datasetVersion,
        generatorOptions,
        sources
    });
    const runDir = path.join(
        options.outRoot,
        `${safeSegment(options.datasetVersion)}-${migrationId.slice(0, 16)}`
    );
    const statusFile = path.join(runDir, 'migration-status.json');
    const finalManifest = path.join(runDir, 'manifest.json');
    await mkdir(runDir, { recursive: true });

    try {
        const finalStat = await stat(finalManifest);
        if (finalStat.isFile()) {
            const validation = await validateFeatureDatasetManifest(finalManifest);
            if (!validation.valid) throw new Error(`最终 manifest 已存在但校验失败：${validation.errors.join('；')}`);
            return {
                runDir,
                statusFile,
                finalManifest,
                completedBatches: Number(
                    (JSON.parse(await readFile(finalManifest, 'utf8')) as ImmutableDatasetManifest)
                        .summary.batches ?? 0
                ),
                totalBatches: Number(
                    (JSON.parse(await readFile(finalManifest, 'utf8')) as ImmutableDatasetManifest)
                        .summary.batches ?? 0
                ),
                paused: false
            };
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const batches = await buildBatches(inputSources, options.batchEpisodes);
    const checkpointsDir = path.join(runDir, 'checkpoints');
    const interruptedDir = path.join(runDir, 'interrupted');
    const batchManifestFiles: string[] = [];
    let newlyCompleted = 0;
    let completedBatches = 0;

    const update = async (
        state: OldDatasetMigrationStatus['state'],
        currentBatch: string | null,
        message?: string,
        manifest: string | null = null
    ) => writeStatus(statusFile, {
        kind: 'skirmish_old_dataset_migration_status',
        version: 1,
        migrationId,
        state,
        runDir,
        totalBatches: batches.length,
        completedBatches,
        currentBatch,
        updatedAt: new Date().toISOString(),
        finalManifest: manifest,
        ...(message ? { message } : {})
    });

    try {
        await update('running', null);
        for (const batch of batches) {
            const batchRoot = path.join(checkpointsDir, safeSegment(batch.id));
            let batchManifest = await findManifestBelow(batchRoot);
            if (batchManifest) {
                const validation = await validateFeatureDatasetManifest(batchManifest);
                if (!validation.valid) {
                    throw new Error(`checkpoint 校验失败 ${batch.id}：${validation.errors.join('；')}`);
                }
            } else {
                await archiveIncompleteBatch(batchRoot, interruptedDir, batch.id);
                await update('running', batch.id);
                await mkdir(batchRoot, { recursive: true });
                const sourceMetadata = [
                    batch.source,
                    ...(planSource ? [planSource] : [])
                ];
                const summary = await exportEpisodeFeatures(
                    createBatchExportOptions(options, batch, batchRoot, sourceMetadata)
                );
                if (!summary.manifestFile) throw new Error(`checkpoint ${batch.id} 未生成 manifest`);
                batchManifest = summary.manifestFile;
                const validation = await validateFeatureDatasetManifest(batchManifest);
                if (!validation.valid) {
                    throw new Error(`checkpoint 新生成后校验失败 ${batch.id}：${validation.errors.join('；')}`);
                }
                newlyCompleted += 1;
            }

            batchManifestFiles.push(batchManifest);
            completedBatches += 1;
            await update('running', null);
            console.log(`[迁移] ${completedBatches}/${batches.length} ${batch.id}`);

            if (
                options.stopAfterBatches !== null
                && newlyCompleted >= options.stopAfterBatches
                && completedBatches < batches.length
            ) {
                await update('paused', null, '达到 --stop-after-batches，重新执行相同命令可继续');
                return {
                    runDir,
                    statusFile,
                    finalManifest: null,
                    completedBatches,
                    totalBatches: batches.length,
                    paused: true
                };
            }
        }

        const manifestFile = await combineBatchManifests(
            runDir,
            migrationId,
            options,
            sources,
            batchManifestFiles
        );
        const validation = await validateFeatureDatasetManifest(manifestFile);
        if (!validation.valid) {
            throw new Error(`最终数据集校验失败：${validation.errors.join('；')}`);
        }
        await update('complete', null, undefined, manifestFile);
        return {
            runDir,
            statusFile,
            finalManifest: manifestFile,
            completedBatches,
            totalBatches: batches.length,
            paused: false
        };
    } catch (error) {
        await update('failed', null, error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function main() {
    const options = parseOldDatasetMigrationArgs(process.argv.slice(2));
    const result = await migrateOldDataset(options);
    console.log(options.json
        ? JSON.stringify({ result }, null, 2)
        : [
            `迁移状态：${result.paused ? '已暂停，可续跑' : '已完成'}`,
            `进度：${result.completedBatches}/${result.totalBatches}`,
            `状态文件：${result.statusFile}`,
            result.finalManifest ? `最终 manifest：${result.finalManifest}` : null
        ].filter(Boolean).join('\n'));
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
