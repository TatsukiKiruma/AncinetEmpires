import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    buildCandidateFeatures,
    loadBcModel,
    parseBcTrainArgs,
    trainSkirmishBcModel
} from './skirmish_bc_train';
import { convertDatasetSampleToFeatureSample } from './skirmish_feature_export';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';

function makeRankingSample(step: number): SkirmishDatasetSample {
    return {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source: { stepIndex: step - 1 },
        scenario: {
            id: 'TEST:bc',
            mode: 'SD',
            mapName: 'bc',
            resourcePath: 'demo'
        },
        seed: 100,
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

describe('skirmish bc train', () => {
    it('解析训练参数', () => {
        const options = parseBcTrainArgs([
            '--train',
            'train.jsonl',
            '--extra-train',
            'curated.jsonl',
            '--extra-train-repeat',
            '3',
            '--val',
            'val.jsonl',
            '--out',
            'model.json',
            '--epochs',
            '2',
            '--learning-rate',
            '0.05',
            '--feature-dim',
            '512',
            '--feature-extractor',
            'hashed-action-v2',
            '--objective',
            'teacher-rank',
            '--teacher-weight',
            '0.4',
            '--max-candidates',
            '8',
            '--limit-train-samples',
            '10',
            '--limit-val-samples',
            '5',
            '--json'
        ]);

        expect(options.trainFile).toContain('train.jsonl');
        expect(options.extraTrainFiles[0]).toContain('curated.jsonl');
        expect(options.extraTrainRepeat).toBe(3);
        expect(options.valFile).toContain('val.jsonl');
        expect(options.outFile).toContain('model.json');
        expect(options.epochs).toBe(2);
        expect(options.learningRate).toBe(0.05);
        expect(options.featureDim).toBe(512);
        expect(options.featureExtractor).toBe('hashed-action-v2');
        expect(options.objective).toBe('teacher-rank');
        expect(options.teacherWeight).toBe(0.4);
        expect(options.maxCandidates).toBe(8);
        expect(options.limitTrainSamples).toBe(10);
        expect(options.limitValSamples).toBe(5);
        expect(options.json).toBe(true);
    });

    it('解析 v3 特征版本并生成残局/目标导向特征', () => {
        const options = parseBcTrainArgs([
            '--train',
            'train.jsonl',
            '--feature-extractor',
            'hashed-action-v3'
        ]);
        const sample = {
            ...makeRankingSample(120),
            turn: 120,
            legalActionCodes: ['attack:u1:e1', 'wait:u1', 'end_turn']
        };
        const v2Features = buildCandidateFeatures(sample, 'wait:u1', 65536, 'hashed-action-v2');
        const v3Features = buildCandidateFeatures(sample, 'wait:u1', 65536, 'hashed-action-v3');

        expect(options.featureExtractor).toBe('hashed-action-v3');
        expect(v2Features).not.toBeNull();
        expect(v3Features).not.toBeNull();
        expect(v3Features!.size).toBeGreaterThan(v2Features!.size);
    });

    it('训练最小候选排序模型并保存模型文件', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-bc-'));
        const trainFile = path.join(tempDir, 'train.jsonl');
        const valFile = path.join(tempDir, 'val.jsonl');
        const outFile = path.join(tempDir, 'model.json');
        const lines = Array.from({ length: 6 }, (_, index) => JSON.stringify(makeRankingSample(index + 1))).join('\n');
        await writeFile(trainFile, `${lines}\n`, 'utf8');
        await writeFile(valFile, `${lines}\n`, 'utf8');

        const summary = await trainSkirmishBcModel({
            trainFile,
            extraTrainFiles: [],
            extraTrainRepeat: 1,
            valFile,
            outFile,
            epochs: 2,
            learningRate: 0.1,
            teacherWeight: 0.25,
            featureDim: 256,
            featureExtractor: 'hashed-action-v2',
            objective: 'label',
            maxCandidates: null,
            limitTrainSamples: null,
            limitValSamples: null,
            json: false
        });
        const saved = await loadBcModel(outFile);

        expect(summary.epochs).toHaveLength(2);
        expect(summary.epochs.at(-1)?.val?.samples).toBe(6);
        expect(summary.epochs.at(-1)?.val?.accuracy).toBe(1);
        expect(summary.model.featureExtractor).toBe('hashed-action-v2');
        expect(summary.model.nonZeroWeights).toBeGreaterThan(0);
        expect(saved.kind).toBe('skirmish_bc_ranker');
        expect(saved.featureExtractor).toBe('hashed-action-v2');
        expect((await readFile(outFile, 'utf8')).trim().length).toBeGreaterThan(0);
    });

    it('可以直接读取 compact feature 样本训练', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-bc-feature-'));
        const trainFile = path.join(tempDir, 'features-train.jsonl');
        const outFile = path.join(tempDir, 'model.json');
        const featureLines = Array.from({ length: 6 }, (_, index) => {
            const featureSample = convertDatasetSampleToFeatureSample(makeRankingSample(index + 1), {
                featureDim: 256,
                featureExtractor: 'hashed-action-v2',
                maxCandidates: null
            });
            return JSON.stringify(featureSample);
        }).join('\n');
        await writeFile(trainFile, `${featureLines}\n`, 'utf8');

        const summary = await trainSkirmishBcModel({
            trainFile,
            extraTrainFiles: [],
            extraTrainRepeat: 1,
            valFile: trainFile,
            outFile,
            epochs: 2,
            learningRate: 0.1,
            teacherWeight: 0.25,
            featureDim: 256,
            featureExtractor: 'hashed-action-v2',
            objective: 'label',
            maxCandidates: null,
            limitTrainSamples: null,
            limitValSamples: null,
            json: false
        });

        expect(summary.epochs.at(-1)?.val?.samples).toBe(6);
        expect(summary.epochs.at(-1)?.val?.accuracy).toBe(1);
    });

    it('可以按 heuristic teacher-rank 目标训练', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-bc-teacher-'));
        const trainFile = path.join(tempDir, 'teacher-features.jsonl');
        const outFile = path.join(tempDir, 'model.json');
        const featureSample = {
            kind: 'skirmish_feature_sample',
            version: 1,
            featureExtractor: 'hashed-action-v2',
            featureDim: 16,
            source: { stepIndex: 0 },
            scenario: {
                id: 'TEST:teacher',
                mode: 'SD',
                mapName: 'teacher',
                resourcePath: 'demo'
            },
            seed: 1,
            step: 1,
            turn: 1,
            playerId: 0,
            policy: 'heuristic',
            label: {
                fixedActionIndex: 1,
                actionCode: 'wait:u1'
            },
            candidates: [
                {
                    actionCode: 'wait:u1',
                    features: [[1, 1]],
                    teacherScore: 1,
                    teacherRank: 1
                },
                {
                    actionCode: 'end_turn',
                    features: [[2, 1]],
                    teacherScore: 10,
                    teacherRank: 0
                }
            ]
        };
        const lines = Array.from({ length: 4 }, () => JSON.stringify(featureSample)).join('\n');
        await writeFile(trainFile, `${lines}\n`, 'utf8');

        const summary = await trainSkirmishBcModel({
            trainFile,
            extraTrainFiles: [],
            extraTrainRepeat: 1,
            valFile: trainFile,
            outFile,
            epochs: 2,
            learningRate: 0.1,
            teacherWeight: 0.25,
            featureDim: 16,
            featureExtractor: 'hashed-action-v2',
            objective: 'teacher-rank',
            maxCandidates: null,
            limitTrainSamples: null,
            limitValSamples: null,
            json: false
        });
        const saved = await loadBcModel(outFile);

        expect(summary.model.objective).toBe('teacher-rank');
        expect(summary.epochs.at(-1)?.val?.accuracy).toBe(1);
        expect(saved.objective).toBe('teacher-rank');
    });

    it('可以按 mixed 目标训练并保存 teacher 权重', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-bc-mixed-'));
        const trainFile = path.join(tempDir, 'mixed-features.jsonl');
        const outFile = path.join(tempDir, 'model.json');
        const featureSample = {
            kind: 'skirmish_feature_sample',
            version: 1,
            featureExtractor: 'hashed-action-v2',
            featureDim: 16,
            source: { stepIndex: 0 },
            scenario: {
                id: 'TEST:mixed',
                mode: 'SD',
                mapName: 'mixed',
                resourcePath: 'demo'
            },
            seed: 1,
            step: 1,
            turn: 1,
            playerId: 0,
            policy: 'heuristic',
            label: {
                fixedActionIndex: 1,
                actionCode: 'wait:u1'
            },
            candidates: [
                {
                    actionCode: 'wait:u1',
                    features: [[1, 1]],
                    teacherScore: 1,
                    teacherRank: 1
                },
                {
                    actionCode: 'end_turn',
                    features: [[2, 1]],
                    teacherScore: 2,
                    teacherRank: 0
                }
            ]
        };
        const lines = Array.from({ length: 4 }, () => JSON.stringify(featureSample)).join('\n');
        await writeFile(trainFile, `${lines}\n`, 'utf8');

        const summary = await trainSkirmishBcModel({
            trainFile,
            extraTrainFiles: [],
            extraTrainRepeat: 1,
            valFile: trainFile,
            outFile,
            epochs: 2,
            learningRate: 0.1,
            teacherWeight: 0.25,
            featureDim: 16,
            featureExtractor: 'hashed-action-v2',
            objective: 'mixed',
            maxCandidates: null,
            limitTrainSamples: null,
            limitValSamples: null,
            json: false
        });
        const saved = await loadBcModel(outFile);

        expect(summary.model.objective).toBe('mixed');
        expect(summary.model.teacherWeight).toBe(0.25);
        expect(saved.objective).toBe('mixed');
        expect(saved.teacherWeight).toBe(0.25);
    });
});
