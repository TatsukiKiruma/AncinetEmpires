import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SkirmishFeatureSample } from './skirmish_bc_train';

export type DatasetSplit = 'train' | 'validation';

export interface DatasetSourceMetadata {
    path: string;
    sha256: string;
    bytes: number;
}

export interface FeatureShardMetadata {
    split: DatasetSplit;
    index: number;
    path: string;
    sha256: string;
    bytes: number;
    samples: number;
}

export interface FeatureShardWriterOptions {
    artifactDir: string;
    shardSamples: number;
    validationRatio: number;
    splitSeed: number;
}

export interface ImmutableDatasetManifest {
    kind: 'skirmish_feature_dataset_manifest';
    schemaVersion: 1;
    datasetVersion: string;
    datasetId: string;
    createdAt: string;
    generator: {
        tool: string;
        version: number;
        gitCommit: string | null;
        options: Record<string, unknown>;
    };
    sources: DatasetSourceMetadata[];
    split: {
        strategy: 'episode-hash-v1';
        validationRatio: number;
        seed: number;
    };
    shards: FeatureShardMetadata[];
    summary: Record<string, unknown>;
}

interface OpenShard {
    split: DatasetSplit;
    index: number;
    relativePath: string;
    finalPath: string;
    partialPath: string;
    stream: ReturnType<typeof createWriteStream>;
    hash: ReturnType<typeof createHash>;
    bytes: number;
    samples: number;
}

const execFileAsync = promisify(execFile);

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stableValue(item)])
        );
    }
    return value;
}

export function stableJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

export function sha256Text(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export async function hashDatasetSource(filePath: string): Promise<DatasetSourceMetadata> {
    const resolvedPath = path.resolve(filePath);
    const hash = createHash('sha256');
    const input = createReadStream(resolvedPath);
    input.on('data', chunk => hash.update(chunk));
    await once(input, 'end');
    const fileStat = await stat(resolvedPath);
    return {
        path: resolvedPath,
        sha256: hash.digest('hex'),
        bytes: fileStat.size
    };
}

export async function resolveGitCommit(cwd = process.cwd()): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
            cwd,
            windowsHide: true
        });
        const commit = stdout.trim();
        return /^[0-9a-f]{40}$/i.test(commit) ? commit : null;
    } catch {
        return null;
    }
}

export function buildDatasetId(input: {
    datasetVersion: string;
    generatorOptions: Record<string, unknown>;
    sources: readonly DatasetSourceMetadata[];
}): string {
    return sha256Text(stableJson({
        schemaVersion: 1,
        datasetVersion: input.datasetVersion,
        generatorOptions: input.generatorOptions,
        sources: input.sources.map(source => ({
            path: source.path,
            sha256: source.sha256,
            bytes: source.bytes
        }))
    }));
}

export function assignDatasetSplit(
    episodeKey: string,
    validationRatio: number,
    splitSeed: number
): DatasetSplit {
    const ratio = Math.min(1, Math.max(0, validationRatio));
    const digest = createHash('sha256')
        .update(`${splitSeed}\0${episodeKey}`)
        .digest();
    const value = digest.readUInt32BE(0) / 0x1_0000_0000;
    return value < ratio ? 'validation' : 'train';
}

export async function createImmutableArtifactDirectory(
    artifactRoot: string,
    datasetVersion: string,
    datasetId: string
): Promise<string> {
    const safeVersion = datasetVersion.replace(/[^a-zA-Z0-9._-]+/g, '-');
    await mkdir(path.resolve(artifactRoot), { recursive: true });
    const artifactDir = path.resolve(artifactRoot, `${safeVersion}-${datasetId.slice(0, 16)}`);
    await mkdir(artifactDir);
    return artifactDir;
}

export async function writeImmutableManifest(
    artifactDir: string,
    manifest: ImmutableDatasetManifest
): Promise<string> {
    const manifestPath = path.join(artifactDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx'
    });
    return manifestPath;
}

export class FeatureShardWriter {
    private readonly current: Record<DatasetSplit, OpenShard | null> = {
        train: null,
        validation: null
    };
    private readonly nextIndex: Record<DatasetSplit, number> = {
        train: 0,
        validation: 0
    };
    private readonly shards: FeatureShardMetadata[] = [];

    constructor(private readonly options: FeatureShardWriterOptions) {
        if (!Number.isInteger(options.shardSamples) || options.shardSamples <= 0) {
            throw new Error('shardSamples 必须是正整数');
        }
        if (!Number.isFinite(options.validationRatio) || options.validationRatio < 0 || options.validationRatio > 1) {
            throw new Error('validationRatio 必须在 0 到 1 之间');
        }
    }

    async write(sample: SkirmishFeatureSample, episodeKey: string): Promise<DatasetSplit> {
        const split = assignDatasetSplit(
            episodeKey,
            this.options.validationRatio,
            this.options.splitSeed
        );
        let shard = this.current[split];
        if (!shard) {
            shard = this.openShard(split);
            this.current[split] = shard;
        }

        const line = `${JSON.stringify(sample)}\n`;
        const bytes = Buffer.byteLength(line);
        shard.hash.update(line);
        shard.bytes += bytes;
        shard.samples += 1;
        if (!shard.stream.write(line)) await once(shard.stream, 'drain');

        if (shard.samples >= this.options.shardSamples) {
            await this.closeShard(split);
        }
        return split;
    }

    async close(): Promise<FeatureShardMetadata[]> {
        await this.closeShard('train');
        await this.closeShard('validation');
        return [...this.shards].sort((left, right) => (
            left.split.localeCompare(right.split) || left.index - right.index
        ));
    }

    private openShard(split: DatasetSplit): OpenShard {
        const index = this.nextIndex[split]++;
        const relativePath = `${split}-${String(index).padStart(5, '0')}.jsonl`;
        const finalPath = path.join(this.options.artifactDir, relativePath);
        const partialPath = `${finalPath}.partial`;
        return {
            split,
            index,
            relativePath,
            finalPath,
            partialPath,
            stream: createWriteStream(partialPath, {
                encoding: 'utf8',
                flags: 'wx'
            }),
            hash: createHash('sha256'),
            bytes: 0,
            samples: 0
        };
    }

    private async closeShard(split: DatasetSplit): Promise<void> {
        const shard = this.current[split];
        if (!shard) return;
        shard.stream.end();
        await once(shard.stream, 'finish');
        await rename(shard.partialPath, shard.finalPath);
        this.shards.push({
            split: shard.split,
            index: shard.index,
            path: shard.relativePath,
            sha256: shard.hash.digest('hex'),
            bytes: shard.bytes,
            samples: shard.samples
        });
        this.current[split] = null;
    }
}
