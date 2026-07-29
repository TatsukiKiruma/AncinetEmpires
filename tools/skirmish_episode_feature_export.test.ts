import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import type { SkirmishFeatureSample } from './skirmish_bc_train';
import {
    exportEpisodeFeatures,
    parseEpisodeFeatureExportArgs
} from './skirmish_episode_feature_export';
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

function createEpisode(seed: number, maxSteps = 5): SkirmishEpisodeRecord {
    return runSkirmishEpisode({
        env: createDemoEnv(seed),
        scenario: {
            id: 'TEST:episode-feature',
            mode: 'SD',
            mapName: 'demo',
            resourcePath: 'demo'
        },
        seed,
        maxPlies: 30,
        maxSteps,
        policyFactory: createPresetPolicyFactory('heuristic-vs-random')
    });
}

describe('episode feature export', () => {
    it('解析 timeout 前缀、候选采样和样本配额参数', () => {
        const options = parseEpisodeFeatureExportArgs([
            '--input',
            'episodes.jsonl',
            '--max-candidates',
            '32',
            '--hard-negative-ratio',
            '0.75',
            '--timeout-prefix-turns',
            '60',
            '--timeout-tail-turns',
            '10',
            '--max-samples-per-episode',
            '20',
            '--action-type-limit',
            'move=100'
        ]);

        expect(options.maxCandidates).toBe(32);
        expect(options.hardNegativeRatio).toBe(0.75);
        expect(options.timeoutPrefixTurns).toBe(60);
        expect(options.timeoutTailTurns).toBe(10);
        expect(options.maxSamplesPerEpisode).toBe(20);
        expect(options.quota.maxByActionType).toEqual({ move: 100 });
    });

    it('不落 full dataset，直接从 episode 流式写 compact feature', async () => {
        const episode = createEpisode(41, 5);
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'episode-features-'));
        const inputFile = path.join(tempDir, 'episodes.jsonl');
        const outFile = path.join(tempDir, 'features.jsonl');
        await writeFile(inputFile, `${JSON.stringify(episode)}\n`, 'utf8');

        const summary = await exportEpisodeFeatures({
            inputFiles: [inputFile],
            outFile,
            unpackDir: 'unused',
            sdTrainingPlanFile: null,
            featureDim: 1024,
            featureExtractor: 'hashed-action-v3',
            maxCandidates: 4,
            hardNegativeRatio: 0.5,
            timeoutPrefixTurns: 80,
            timeoutTailTurns: 20,
            retainTimeoutPrefix: true,
            retainMaxStepPrefix: true,
            retainStagnationPrefix: true,
            maxSamplesPerEpisode: 2,
            quota: {},
            excludeIllegal: true,
            includeScenarioIds: [],
            excludeScenarioIds: [],
            limitEpisodes: null,
            json: false,
            envFactory: {
                createEnv(targetEpisode) {
                    return createDemoEnv(targetEpisode.seed, targetEpisode.maxPlies);
                }
            }
        });
        const samples = (await readFile(outFile, 'utf8'))
            .trim()
            .split('\n')
            .map(line => JSON.parse(line) as SkirmishFeatureSample);

        expect(summary.replayedEpisodes).toBe(1);
        expect(summary.exportedSamples).toBe(2);
        expect(summary.droppedByEpisodeQuota).toBe(3);
        expect(samples).toHaveLength(2);
        expect(samples.every(sample => sample.kind === 'skirmish_feature_sample')).toBe(true);
        expect(samples.every(sample => sample.candidates.length <= 4)).toBe(true);
        expect(samples.every(sample => sample.candidates.some(candidate => (
            candidate.actionCode === sample.label.actionCode
        )))).toBe(true);
        expect(samples[0].candidates.every(candidate => (
            typeof candidate.teacherScore === 'number'
            && typeof candidate.teacherRank === 'number'
        ))).toBe(true);
    });
});
