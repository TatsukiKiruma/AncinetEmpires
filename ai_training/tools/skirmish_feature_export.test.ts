import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import {
    convertDatasetSampleToFeatureSample,
    exportSkirmishFeatures,
    parseFeatureExportArgs
} from './skirmish_feature_export';

function makeDatasetSample(step = 1): SkirmishDatasetSample {
    return {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source: { stepIndex: step - 1 },
        scenario: {
            id: 'TEST:features',
            mode: 'SD',
            mapName: 'features',
            resourcePath: 'demo'
        },
        seed: 7,
        maxPlies: 20,
        maxSteps: 100,
        initialObservationHash: 'hash',
        fixedActionSpaceSize: 2,
        step,
        turn: 1,
        playerId: 0,
        policy: 'heuristic',
        legalActionCount: 2,
        fixedLegalActionCount: 2,
        fixedActionSpaceDescriptor: {
            width: 1,
            height: 1,
            tileCount: 1,
            unitClasses: [],
            blocks: [],
            size: 2
        },
        fixedLegalActionIndexes: [0, 1],
        legalActionCodes: ['end_turn', 'wait:u1'],
        label: {
            fixedActionIndex: 1,
            actionCode: 'wait:u1',
            action: { type: 'wait', unitId: 'u1' }
        },
        outcome: {
            reward: 0,
            done: false,
            winnerAfter: null,
            illegal: false
        }
    };
}

describe('skirmish feature export', () => {
    it('解析 feature 导出参数', () => {
        const options = parseFeatureExportArgs([
            '--input',
            'train.jsonl',
            '--out',
            'features.jsonl',
            '--feature-dim',
            '512',
            '--feature-extractor',
            'hashed-action-v2',
            '--max-candidates',
            '8',
            '--limit-samples',
            '20',
            '--json'
        ]);

        expect(options.inputFile).toContain('train.jsonl');
        expect(options.outFile).toContain('features.jsonl');
        expect(options.featureDim).toBe(512);
        expect(options.featureExtractor).toBe('hashed-action-v2');
        expect(options.maxCandidates).toBe(8);
        expect(options.limitSamples).toBe(20);
        expect(options.json).toBe(true);
    });

    it('解析 v3 feature 导出参数', () => {
        const options = parseFeatureExportArgs([
            '--input',
            'train.jsonl',
            '--feature-extractor',
            'hashed-action-v3'
        ]);

        expect(options.featureExtractor).toBe('hashed-action-v3');
    });

    it('把完整 dataset 样本转换成 compact feature 样本', () => {
        const featureSample = convertDatasetSampleToFeatureSample(makeDatasetSample(), {
            featureDim: 128,
            featureExtractor: 'hashed-action-v2',
            maxCandidates: null
        });

        expect(featureSample).not.toBeNull();
        expect(featureSample?.kind).toBe('skirmish_feature_sample');
        expect(featureSample?.featureDim).toBe(128);
        expect(featureSample?.featureExtractor).toBe('hashed-action-v2');
        expect(featureSample?.label.actionCode).toBe('wait:u1');
        expect(featureSample?.candidates.map(candidate => candidate.actionCode)).toContain('wait:u1');
        expect(featureSample?.candidates[0].features.length).toBeGreaterThan(0);
    });

    it('可以导出 v3 compact feature 样本', () => {
        const featureSample = convertDatasetSampleToFeatureSample({
            ...makeDatasetSample(),
            turn: 120,
            legalActionCodes: ['attack:u1:e1', 'wait:u1', 'end_turn']
        }, {
            featureDim: 65536,
            featureExtractor: 'hashed-action-v3',
            maxCandidates: null
        });

        expect(featureSample).not.toBeNull();
        expect(featureSample?.featureExtractor).toBe('hashed-action-v3');
        expect(featureSample?.candidates[0].features.length).toBeGreaterThan(0);
    });

    it('导出 feature JSONL 文件', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-features-'));
        const inputFile = path.join(tempDir, 'dataset.jsonl');
        const outFile = path.join(tempDir, 'features.jsonl');
        const lines = [
            JSON.stringify(makeDatasetSample(1)),
            JSON.stringify(makeDatasetSample(2))
        ].join('\n');
        await writeFile(inputFile, `${lines}\n`, 'utf8');

        const summary = await exportSkirmishFeatures({
            inputFile,
            outFile,
            featureDim: 128,
            featureExtractor: 'hashed-action-v2',
            maxCandidates: null,
            limitSamples: null,
            json: false
        });
        const outputLines = (await readFile(outFile, 'utf8')).trim().split('\n');
        const first = JSON.parse(outputLines[0]) as Record<string, unknown>;

        expect(summary.inputSamples).toBe(2);
        expect(summary.featureExtractor).toBe('hashed-action-v2');
        expect(summary.exportedSamples).toBe(2);
        expect(summary.averageCandidates).toBe(2);
        expect(first.kind).toBe('skirmish_feature_sample');
    });
});
