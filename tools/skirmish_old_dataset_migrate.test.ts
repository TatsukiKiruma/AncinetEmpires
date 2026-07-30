import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    stat,
    writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import { validateFeatureDatasetManifest } from './skirmish_dataset_validate';
import {
    migrateOldDataset,
    parseOldDatasetMigrationArgs,
    type OldDatasetMigrationOptions
} from './skirmish_old_dataset_migrate';
import {
    createPresetPolicyFactory,
    runSkirmishEpisode,
    type SkirmishEpisodeRecord
} from './skirmish_training_runner';

function createDemoEnv(seed: number, maxPlies = 30): AncientEmpiresEnv {
    return new AncientEmpiresEnv({
        initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
        seed,
        maxPlies
    });
}

function createEpisode(seed: number): SkirmishEpisodeRecord {
    return runSkirmishEpisode({
        env: createDemoEnv(seed),
        scenario: {
            id: 'TEST:old-dataset-migration',
            mode: 'SD',
            mapName: 'demo',
            resourcePath: 'demo'
        },
        seed,
        maxPlies: 30,
        maxSteps: 3,
        policyFactory: createPresetPolicyFactory('heuristic-vs-random')
    });
}

function createOptions(
    sourceDir: string,
    outRoot: string,
    stopAfterBatches: number | null
): OldDatasetMigrationOptions {
    return {
        sourceDir,
        outRoot,
        planFile: null,
        unpackDir: 'unused',
        datasetVersion: 'test-old-episodes-v3',
        batchEpisodes: 1,
        maxSamplesPerEpisode: 2,
        shardSamples: 10,
        validationRatio: 0.5,
        splitSeed: 20260730,
        featureDim: 128,
        featureExtractor: 'hashed-action-v3',
        maxCandidates: 4,
        hardNegativeRatio: 0.5,
        timeoutPrefixTurns: 80,
        timeoutTailTurns: 20,
        relabelMode: 'none',
        relabelPolicies: ['apk-like'],
        relabelMinMargin: 25,
        rolloutDepth: 2,
        rolloutCandidates: 4,
        rolloutWeight: 0.05,
        stopAfterBatches,
        json: false,
        envFactory: {
            createEnv(episode) {
                return createDemoEnv(episode.seed, episode.maxPlies);
            }
        }
    };
}

describe('old dataset migration', () => {
    it('解析检查点与重标注选项', () => {
        const options = parseOldDatasetMigrationArgs([
            '--batch-episodes',
            '12',
            '--max-samples-per-episode',
            '80',
            '--fast-rollout',
            '--stop-after-batches',
            '2'
        ]);

        expect(options.batchEpisodes).toBe(12);
        expect(options.maxSamplesPerEpisode).toBe(80);
        expect(options.relabelMode).toBe('fast-rollout');
        expect(options.stopAfterBatches).toBe(2);
    });

    it('暂停后跳过已校验 checkpoint，并完成最终 manifest', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'old-dataset-migration-'));
        const sourceDir = path.join(tempDir, 'episodes');
        const outRoot = path.join(tempDir, 'output');
        await mkdir(sourceDir, { recursive: true });
        const inputFile = path.join(sourceDir, 'old.jsonl');
        await writeFile(
            inputFile,
            `${[createEpisode(101), createEpisode(102)]
                .map(episode => JSON.stringify(episode))
                .join('\n')}\n`,
            'utf8'
        );

        const first = await migrateOldDataset(createOptions(sourceDir, outRoot, 1));
        expect(first.paused).toBe(true);
        expect(first.completedBatches).toBe(1);
        expect(first.totalBatches).toBe(2);
        expect(first.finalManifest).toBeNull();

        const firstStatus = JSON.parse(await readFile(first.statusFile, 'utf8')) as {
            state: string;
        };
        expect(firstStatus.state).toBe('paused');
        const firstCheckpoint = path.join(first.runDir, 'checkpoints', 'old-e00000-00000');
        const firstCheckpointStat = await stat(firstCheckpoint);
        const interruptedCheckpoint = path.join(
            first.runDir,
            'checkpoints',
            'old-e00001-00001',
            'fake-interrupted-artifact'
        );
        await mkdir(interruptedCheckpoint, { recursive: true });
        await writeFile(
            path.join(interruptedCheckpoint, 'train-00000.jsonl.partial'),
            '未完成',
            'utf8'
        );

        const resumed = await migrateOldDataset(createOptions(sourceDir, outRoot, null));
        expect(resumed.paused).toBe(false);
        expect(resumed.completedBatches).toBe(2);
        expect(resumed.finalManifest).toBeTruthy();
        expect((await stat(firstCheckpoint)).mtimeMs).toBe(firstCheckpointStat.mtimeMs);
        const interruptedEntries = await readdir(path.join(first.runDir, 'interrupted'));
        expect(interruptedEntries.some(name => name.includes('old-e00001-00001'))).toBe(true);

        const validation = await validateFeatureDatasetManifest(resumed.finalManifest!);
        expect(validation.valid).toBe(true);
        expect(validation.samples).toBe(4);

        const finalManifest = JSON.parse(
            await readFile(resumed.finalManifest!, 'utf8')
        ) as {
            summary: { batches: number; replayedEpisodes: number; exportedSamples: number };
        };
        expect(finalManifest.summary).toEqual(expect.objectContaining({
            batches: 2,
            replayedEpisodes: 2,
            exportedSamples: 4
        }));

        const repeated = await migrateOldDataset(createOptions(sourceDir, outRoot, null));
        expect(repeated.finalManifest).toBe(resumed.finalManifest);
        expect(repeated.completedBatches).toBe(2);
    });
});
