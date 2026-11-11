import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import {
    exportSkirmishDistillFeatures,
    parseDistillExportArgs,
    replayEpisodeToDistillFeatureSamples
} from './skirmish_distill_export';
import {
    createPresetPolicyFactory,
    runSkirmishEpisode,
    type SkirmishEpisodeRecord
} from './skirmish_training_runner';

function createDemoEnv(seed: number, maxPlies = 20): AncientEmpiresEnv {
    return new AncientEmpiresEnv({
        initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
        seed,
        maxPlies
    });
}

function createDemoEpisode(seed: number, maxSteps = 3): SkirmishEpisodeRecord {
    return runSkirmishEpisode({
        env: createDemoEnv(seed),
        scenario: {
            id: 'TEST:distill-demo',
            mode: 'SD',
            mapName: 'demo',
            resourcePath: 'demo'
        },
        seed,
        maxPlies: 20,
        maxSteps,
        policyFactory: createPresetPolicyFactory('heuristic-vs-random')
    });
}

describe('skirmish distill export', () => {
    it('解析蒸馏导出参数', () => {
        const options = parseDistillExportArgs([
            '--input',
            'training_runs/skirmish-sd-e10.jsonl',
            '--out',
            'training_runs/features/skirmish-distill.jsonl',
            '--feature-dim',
            '512',
            '--feature-extractor',
            'hashed-action-v3',
            '--max-candidates',
            '16',
            '--scenario',
            'SD:(2) Duel.aem',
            '--include-timeout',
            '--limit-episodes',
            '2',
            '--limit-samples',
            '5',
            '--json'
        ]);

        expect(options.inputFiles[0]).toContain('skirmish-sd-e10.jsonl');
        expect(options.outFile).toContain('skirmish-distill.jsonl');
        expect(options.featureDim).toBe(512);
        expect(options.featureExtractor).toBe('hashed-action-v3');
        expect(options.maxCandidates).toBe(16);
        expect(options.includeScenarioIds).toEqual(['SD:(2) Duel.aem']);
        expect(options.excludeTimeout).toBe(false);
        expect(options.limitEpisodes).toBe(2);
        expect(options.limitSamples).toBe(5);
        expect(options.json).toBe(true);
    });

    it('重放 episode 并导出带 heuristic 分数的 feature 样本', () => {
        const episode = createDemoEpisode(41, 3);
        const replay = replayEpisodeToDistillFeatureSamples(episode, createDemoEnv(41), {
            featureDim: 128,
            featureExtractor: 'hashed-action-v2',
            maxCandidates: 8,
            inputFile: 'episode.jsonl',
            episodeIndex: 0
        });

        expect(replay.samples).toHaveLength(episode.summary.stepCount);
        expect(replay.candidateCount).toBeGreaterThan(0);
        expect(replay.samples[0].candidates[0]).toEqual(expect.objectContaining({
            teacherScore: expect.any(Number),
            teacherRank: expect.any(Number)
        }));
        expect(replay.samples[0].candidates.some(candidate => candidate.teacherRank === 0)).toBe(true);
    });

    it('导出蒸馏 feature JSONL 文件', async () => {
        const episode = createDemoEpisode(43, 2);
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-distill-'));
        const inputFile = path.join(tempDir, 'episodes.jsonl');
        const outFile = path.join(tempDir, 'distill.jsonl');
        await writeFile(inputFile, `${JSON.stringify(episode)}\n`, 'utf8');

        const summary = await exportSkirmishDistillFeatures({
            inputFiles: [inputFile],
            outFile,
            unpackDir: 'unused',
            featureDim: 128,
            featureExtractor: 'hashed-action-v2',
            maxCandidates: 8,
            excludeTimeout: true,
            excludeStoppedByMaxSteps: false,
            excludeIllegal: true,
            includeScenarioIds: [],
            excludeScenarioIds: [],
            limitEpisodes: null,
            limitSamples: null,
            json: false,
            envFactory: {
                createEnv(targetEpisode) {
                    return createDemoEnv(targetEpisode.seed, targetEpisode.maxPlies);
                }
            }
        });
        const outputLines = (await readFile(outFile, 'utf8')).trim().split('\n');
        const firstSample = JSON.parse(outputLines[0]) as Record<string, unknown>;

        expect(summary.exportedEpisodes).toBe(1);
        expect(summary.exportedSamples).toBe(episode.summary.stepCount);
        expect(summary.averageCandidates).toBeGreaterThan(0);
        expect(summary.teacherLabelAgreement).toBeGreaterThanOrEqual(0);
        expect(firstSample.kind).toBe('skirmish_feature_sample');
    });
});
