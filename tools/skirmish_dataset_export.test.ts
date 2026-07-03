import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import {
    exportSkirmishDataset,
    parseDatasetExportArgs,
    replayEpisodeToDatasetSamples
} from './skirmish_dataset_export';
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
            id: 'TEST:dataset-demo',
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

describe('skirmish dataset export', () => {
    it('解析导出参数', () => {
        const options = parseDatasetExportArgs([
            '--input',
            'training_runs/skirmish-sd-e10.jsonl',
            '--out',
            'training_runs/datasets/skirmish-sd-bc-v1.jsonl',
            '--exclude-scenario',
            'SD:(2) Liberty Port.aem',
            '--scenario',
            'SD:(2) Duel.aem',
            '--include-timeout',
            '--observation',
            'none',
            '--limit-episodes',
            '2',
            '--limit-samples',
            '5',
            '--json'
        ]);

        expect(options.inputFiles[0]).toContain('skirmish-sd-e10.jsonl');
        expect(options.outFile).toContain('skirmish-sd-bc-v1.jsonl');
        expect(options.excludeScenarioIds).toEqual(['SD:(2) Liberty Port.aem']);
        expect(options.includeScenarioIds).toEqual(['SD:(2) Duel.aem']);
        expect(options.excludeTimeout).toBe(false);
        expect(options.observationMode).toBe('none');
        expect(options.limitEpisodes).toBe(2);
        expect(options.limitSamples).toBe(5);
        expect(options.json).toBe(true);
    });

    it('按固定动作索引重放 episode 并导出监督样本', () => {
        const episode = createDemoEpisode(23, 3);
        const samples = replayEpisodeToDatasetSamples(episode, createDemoEnv(23), {
            observationMode: 'full',
            inputFile: 'episode.jsonl',
            episodeIndex: 0
        });

        expect(samples).toHaveLength(episode.summary.stepCount);
        expect(samples[0]).toEqual(expect.objectContaining({
            kind: 'skirmish_dataset_sample',
            seed: 23,
            step: 1,
            playerId: episode.steps[0].playerId,
            observation: expect.objectContaining({
                currentPlayer: episode.steps[0].playerId
            })
        }));
        expect(samples[0].fixedLegalActionIndexes).toContain(samples[0].label.fixedActionIndex);
        expect(samples[0].label.actionCode).toBe(episode.steps[0].actionCode);
        expect(samples[0].outcome.reward).toBe(episode.steps[0].reward);
    });

    it('导出时默认跳过超时局，并支持不写 observation 的轻量样本', async () => {
        const episode = createDemoEpisode(31, 2);
        const baseTimeoutEpisode = createDemoEpisode(32, 2);
        const timeoutEpisode: SkirmishEpisodeRecord = {
            ...baseTimeoutEpisode,
            summary: {
                ...baseTimeoutEpisode.summary,
                timeout: true
            }
        };
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-dataset-'));
        const inputFile = path.join(tempDir, 'episodes.jsonl');
        const outFile = path.join(tempDir, 'dataset.jsonl');
        await writeFile(inputFile, `${JSON.stringify(episode)}\n${JSON.stringify(timeoutEpisode)}\n`, 'utf8');

        const summary = await exportSkirmishDataset({
            inputFiles: [inputFile],
            outFile,
            unpackDir: 'unused',
            excludeTimeout: true,
            excludeStoppedByMaxSteps: false,
            excludeIllegal: true,
            includeScenarioIds: [],
            excludeScenarioIds: [],
            limitEpisodes: null,
            limitSamples: null,
            observationMode: 'none',
            json: false,
            envFactory: {
                createEnv(targetEpisode) {
                    return createDemoEnv(targetEpisode.seed, targetEpisode.maxPlies);
                }
            }
        });
        const outputLines = (await readFile(outFile, 'utf8')).trim().split('\n');
        const firstSample = JSON.parse(outputLines[0]) as Record<string, unknown>;

        expect(summary.inputEpisodes).toBe(2);
        expect(summary.exportedEpisodes).toBe(1);
        expect(summary.skippedByReason.timeout).toBe(1);
        expect(summary.exportedSamples).toBe(episode.summary.stepCount);
        expect(firstSample.kind).toBe('skirmish_dataset_sample');
        expect(firstSample).not.toHaveProperty('observation');
    });
});
