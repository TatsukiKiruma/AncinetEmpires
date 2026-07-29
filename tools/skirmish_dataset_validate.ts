import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { SkirmishFeatureSample } from './skirmish_bc_train';
import type {
    DatasetSplit,
    ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';

export interface DatasetValidationSummary {
    manifestFile: string;
    datasetId: string;
    valid: boolean;
    shards: number;
    samples: number;
    trainSamples: number;
    validationSamples: number;
    episodeLeakageCount: number;
    errors: string[];
}

const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function resolveShardPath(artifactDir: string, relativePath: string): string {
    const resolved = path.resolve(artifactDir, relativePath);
    const relative = path.relative(artifactDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`分片路径越界: ${relativePath}`);
    }
    return resolved;
}

function validateSample(
    sample: SkirmishFeatureSample,
    shardLabel: string,
    lineNumber: number,
    errors: string[]
) {
    const prefix = `${shardLabel}:${lineNumber}`;
    if (sample.kind !== 'skirmish_feature_sample') {
        errors.push(`${prefix} kind 非法`);
        return;
    }
    if (!sample.candidates.some(candidate => candidate.actionCode === sample.label.actionCode)) {
        errors.push(`${prefix} 标签动作不在候选中`);
    }
    if (new Set(sample.candidates.map(candidate => candidate.actionCode)).size !== sample.candidates.length) {
        errors.push(`${prefix} 存在重复候选动作`);
    }
    if (sample.candidates.some(candidate => candidate.features.some(([index, value]) => (
        !Number.isInteger(index)
        || index < 0
        || index >= sample.featureDim
        || !Number.isFinite(value)
    )))) {
        errors.push(`${prefix} 稀疏特征索引或数值非法`);
    }
}

async function validateShard(
    artifactDir: string,
    shard: ImmutableDatasetManifest['shards'][number],
    episodeSplits: Map<string, DatasetSplit>,
    errors: string[]
): Promise<number> {
    const shardPath = resolveShardPath(artifactDir, shard.path);
    const input = createReadStream(shardPath);
    const hash = createHash('sha256');
    let bytes = 0;
    input.on('data', chunk => {
        hash.update(chunk);
        bytes += chunk.length;
    });
    const lines = createInterface({ input, crlfDelay: Infinity });
    let samples = 0;
    for await (const line of lines) {
        if (!line.trim()) continue;
        samples += 1;
        let sample: SkirmishFeatureSample;
        try {
            sample = JSON.parse(line) as SkirmishFeatureSample;
        } catch {
            errors.push(`${shard.path}:${samples} JSON 非法`);
            continue;
        }
        validateSample(sample, shard.path, samples, errors);
        const episodeKey = `${sample.scenario.id}\0${sample.seed}`;
        const previousSplit = episodeSplits.get(episodeKey);
        if (previousSplit && previousSplit !== shard.split) {
            errors.push(`${shard.path}:${samples} episode 同时出现在 ${previousSplit} 与 ${shard.split}`);
        } else {
            episodeSplits.set(episodeKey, shard.split);
        }
    }
    const actualSha256 = hash.digest('hex');
    if (actualSha256 !== shard.sha256) errors.push(`${shard.path} SHA-256 不一致`);
    if (bytes !== shard.bytes) errors.push(`${shard.path} 字节数不一致：${bytes} != ${shard.bytes}`);
    if (samples !== shard.samples) errors.push(`${shard.path} 样本数不一致：${samples} != ${shard.samples}`);
    return samples;
}

export async function validateFeatureDatasetManifest(
    manifestFile: string
): Promise<DatasetValidationSummary> {
    const resolvedManifest = path.resolve(manifestFile);
    const artifactDir = path.dirname(resolvedManifest);
    const manifest = JSON.parse(
        await readFile(resolvedManifest, 'utf8')
    ) as ImmutableDatasetManifest;
    const errors: string[] = [];
    if (manifest.kind !== 'skirmish_feature_dataset_manifest' || manifest.schemaVersion !== 1) {
        errors.push('manifest kind 或 schemaVersion 不支持');
    }

    const files = await readdir(artifactDir);
    for (const file of files.filter(name => name.endsWith('.partial'))) {
        errors.push(`发现未完成分片: ${file}`);
    }
    const episodeSplits = new Map<string, DatasetSplit>();
    let samples = 0;
    let trainSamples = 0;
    let validationSamples = 0;
    for (const shard of manifest.shards) {
        try {
            const shardStat = await stat(resolveShardPath(artifactDir, shard.path));
            if (!shardStat.isFile()) {
                errors.push(`${shard.path} 不是文件`);
                continue;
            }
            const shardSamples = await validateShard(artifactDir, shard, episodeSplits, errors);
            samples += shardSamples;
            if (shard.split === 'train') trainSamples += shardSamples;
            else validationSamples += shardSamples;
        } catch (error) {
            errors.push(`${shard.path} 无法验证：${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const episodeLeakageCount = errors.filter(error => error.includes('episode 同时出现在')).length;
    return {
        manifestFile: resolvedManifest,
        datasetId: manifest.datasetId,
        valid: errors.length === 0,
        shards: manifest.shards.length,
        samples,
        trainSamples,
        validationSamples,
        episodeLeakageCount,
        errors
    };
}

async function main() {
    const manifestIndex = process.argv.indexOf('--manifest');
    const manifestFile = manifestIndex >= 0 ? process.argv[manifestIndex + 1] : undefined;
    if (!manifestFile) throw new Error('请用 --manifest 指定数据集 manifest.json');
    const summary = await validateFeatureDatasetManifest(manifestFile);
    console.log(JSON.stringify({ summary }, null, 2));
    if (!summary.valid) process.exitCode = 2;
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
