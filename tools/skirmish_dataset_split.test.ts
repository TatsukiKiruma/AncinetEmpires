import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parseDatasetSplitArgs,
    splitSkirmishDataset
} from './skirmish_dataset_split';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';

function makeSample(scenarioId: string, seed: number, step: number): SkirmishDatasetSample {
    return {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source: { stepIndex: step - 1 },
        scenario: {
            id: scenarioId,
            mode: 'SD',
            mapName: scenarioId,
            resourcePath: 'demo'
        },
        seed,
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

describe('skirmish dataset split', () => {
    it('解析切分参数并生成默认输出路径', () => {
        const options = parseDatasetSplitArgs([
            '--input',
            'training_runs/datasets/skirmish-sd-bc-v1.jsonl',
            '--val-ratio',
            '0.25',
            '--seed',
            '9',
            '--json'
        ]);

        expect(options.inputFile).toContain('skirmish-sd-bc-v1.jsonl');
        expect(options.trainOutFile).toContain('skirmish-sd-bc-v1-train.jsonl');
        expect(options.valOutFile).toContain('skirmish-sd-bc-v1-val.jsonl');
        expect(options.valRatio).toBe(0.25);
        expect(options.seed).toBe(9);
        expect(options.json).toBe(true);
    });

    it('按 episode 稳定切分，避免同一局进入两个集合', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-split-'));
        const inputFile = path.join(tempDir, 'dataset.jsonl');
        const trainOutFile = path.join(tempDir, 'train.jsonl');
        const valOutFile = path.join(tempDir, 'val.jsonl');
        const samples = [
            makeSample('TEST:a', 1, 1),
            makeSample('TEST:a', 1, 2),
            makeSample('TEST:b', 2, 1),
            makeSample('TEST:b', 2, 2)
        ];
        await writeFile(inputFile, `${samples.map(sample => JSON.stringify(sample)).join('\n')}\n`, 'utf8');

        const summary = await splitSkirmishDataset({
            inputFile,
            trainOutFile,
            valOutFile,
            valRatio: 0.5,
            seed: 1,
            json: false
        });
        const trainLines = (await readFile(trainOutFile, 'utf8')).trim().split('\n').filter(Boolean);
        const valLines = (await readFile(valOutFile, 'utf8')).trim().split('\n').filter(Boolean);
        const trainKeys = new Set(trainLines.map(line => {
            const sample = JSON.parse(line) as SkirmishDatasetSample;
            return `${sample.scenario.id}|${sample.seed}`;
        }));
        const valKeys = new Set(valLines.map(line => {
            const sample = JSON.parse(line) as SkirmishDatasetSample;
            return `${sample.scenario.id}|${sample.seed}`;
        }));

        expect(summary.inputSamples).toBe(4);
        expect(summary.trainSamples + summary.valSamples).toBe(4);
        for (const key of trainKeys) {
            expect(valKeys.has(key)).toBe(false);
        }
    });
});
