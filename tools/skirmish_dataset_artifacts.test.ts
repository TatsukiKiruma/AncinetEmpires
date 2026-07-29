import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SkirmishFeatureSample } from './skirmish_bc_train';
import {
    assignDatasetSplit,
    createImmutableArtifactDirectory,
    FeatureShardWriter,
    writeImmutableManifest,
    type ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';

function createSample(seed: number): SkirmishFeatureSample {
    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: 'hashed-action-v3',
        featureDim: 128,
        source: { stepIndex: 0 },
        scenario: {
            id: 'SD:test',
            mode: 'SD',
            mapName: 'test',
            resourcePath: 'test'
        },
        seed,
        step: 1,
        turn: 1,
        playerId: 0,
        policy: 'heuristic',
        label: {
            fixedActionIndex: 1,
            actionCode: 'end_turn'
        },
        candidates: [{
            actionCode: 'end_turn',
            features: [[1, 1]]
        }]
    };
}

describe('skirmish dataset artifacts', () => {
    it('同一 episode 的所有 step 稳定进入同一 split', () => {
        const split = assignDatasetSplit('SD:test:seed=1', 0.2, 20260730);

        expect(assignDatasetSplit('SD:test:seed=1', 0.2, 20260730)).toBe(split);
        expect(assignDatasetSplit('SD:test:seed=1', 0, 20260730)).toBe('train');
        expect(assignDatasetSplit('SD:test:seed=1', 1, 20260730)).toBe('validation');
    });

    it('按 split 和样本上限滚动分片，并记录校验元数据', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'feature-shards-'));
        const artifactDir = await createImmutableArtifactDirectory(root, 'v2', 'a'.repeat(64));
        const writer = new FeatureShardWriter({
            artifactDir,
            shardSamples: 2,
            validationRatio: 1,
            splitSeed: 7
        });
        for (let index = 0; index < 5; index += 1) {
            await writer.write(createSample(index), `episode-${index}`);
        }
        const shards = await writer.close();

        expect(shards.map(shard => shard.samples)).toEqual([2, 2, 1]);
        expect(shards.every(shard => shard.split === 'validation')).toBe(true);
        expect(shards.every(shard => shard.sha256.length === 64)).toBe(true);
        expect((await readFile(path.join(artifactDir, shards[0].path), 'utf8')).trim().split('\n')).toHaveLength(2);
    });

    it('manifest 使用排他创建，不能覆盖已有版本', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'feature-manifest-'));
        const artifactDir = await createImmutableArtifactDirectory(root, 'v2', 'b'.repeat(64));
        const manifest: ImmutableDatasetManifest = {
            kind: 'skirmish_feature_dataset_manifest',
            schemaVersion: 1,
            datasetVersion: 'v2',
            datasetId: 'b'.repeat(64),
            createdAt: '2026-07-30T00:00:00.000Z',
            generator: {
                tool: 'test',
                version: 1,
                gitCommit: null,
                options: {}
            },
            sources: [],
            split: {
                strategy: 'episode-hash-v1',
                validationRatio: 0.1,
                seed: 7
            },
            shards: [],
            summary: {}
        };

        await writeImmutableManifest(artifactDir, manifest);
        await expect(writeImmutableManifest(artifactDir, manifest)).rejects.toMatchObject({
            code: 'EEXIST'
        });
    });
});
