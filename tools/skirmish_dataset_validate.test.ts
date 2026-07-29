import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SkirmishFeatureSample } from './skirmish_bc_train';
import {
    createImmutableArtifactDirectory,
    FeatureShardWriter,
    writeImmutableManifest,
    type ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';
import { validateFeatureDatasetManifest } from './skirmish_dataset_validate';

function createSample(seed: number): SkirmishFeatureSample {
    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: 'hashed-action-v3',
        featureDim: 16,
        source: { stepIndex: 0 },
        scenario: { id: 'SD:test', mode: 'SD', mapName: 'test', resourcePath: 'test' },
        seed,
        step: 1,
        turn: 1,
        playerId: 0,
        policy: 'heuristic',
        label: { fixedActionIndex: 1, actionCode: 'end_turn' },
        candidates: [{ actionCode: 'end_turn', features: [[1, 1]] }]
    };
}

describe('skirmish dataset validate', () => {
    it('校验分片哈希、计数、标签与 episode split 隔离', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'dataset-validate-'));
        const artifactDir = await createImmutableArtifactDirectory(root, 'v2', 'c'.repeat(64));
        const writer = new FeatureShardWriter({
            artifactDir,
            shardSamples: 2,
            validationRatio: 0,
            splitSeed: 1
        });
        await writer.write(createSample(1), 'episode-1');
        await writer.write(createSample(2), 'episode-2');
        const shards = await writer.close();
        const manifest: ImmutableDatasetManifest = {
            kind: 'skirmish_feature_dataset_manifest',
            schemaVersion: 1,
            datasetVersion: 'v2',
            datasetId: 'c'.repeat(64),
            createdAt: '2026-07-30T00:00:00.000Z',
            generator: { tool: 'test', version: 1, gitCommit: null, options: {} },
            sources: [],
            split: { strategy: 'episode-hash-v1', validationRatio: 0, seed: 1 },
            shards,
            summary: {}
        };
        const manifestFile = await writeImmutableManifest(artifactDir, manifest);

        const valid = await validateFeatureDatasetManifest(manifestFile);
        expect(valid).toEqual(expect.objectContaining({
            valid: true,
            samples: 2,
            trainSamples: 2,
            validationSamples: 0,
            episodeLeakageCount: 0
        }));

        await writeFile(path.join(artifactDir, shards[0].path), 'broken\n', 'utf8');
        const invalid = await validateFeatureDatasetManifest(manifestFile);
        expect(invalid.valid).toBe(false);
        expect(invalid.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('SHA-256 不一致')
        ]));
    });
});
