import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TrainingProgress } from './skirmish_training_progress';
import {
    buildCandidateFeatures,
    loadBcModel,
    parseBcTrainArgs,
    trainSkirmishBcModel
} from './skirmish_bc_train';
import { convertDatasetSampleToFeatureSample } from './skirmish_feature_export';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import {
    assignDatasetSplit,
    createImmutableArtifactDirectory,
    FeatureShardWriter,
    writeImmutableManifest,
    type ImmutableDatasetManifest
} from './skirmish_dataset_artifacts';

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
    it('v4 禁止从缺少完整局面的旧样本伪造路径特征', () => {
        const sample=makeRankingSample(1);
        expect(()=>buildCandidateFeatures(sample,'end_turn',4096,'hashed-action-v4')).toThrow('完整 observation');
        expect(buildCandidateFeatures(sample,'end_turn',4096,'hashed-action-v3')).not.toBeNull();
    });
    it('续训保留初始模型来源，并拒绝跨特征版本或无效权重', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'bc-resume-'));
        const input = path.join(dir, 'train.jsonl');
        const initial = path.join(dir, 'initial.json');
        const output = path.join(dir, 'resumed.json');
        await writeFile(input, JSON.stringify(makeRankingSample(1)) + '\n');
        const args = ['--train', input, '--out', initial, '--epochs', '1', '--feature-dim', '4096', '--feature-extractor', 'hashed-action-v3'];
        await trainSkirmishBcModel(parseBcTrainArgs(args));
        const base = await loadBcModel(initial);
        const options = { ...parseBcTrainArgs(args), outFile: output, initialModel: initial };
        await trainSkirmishBcModel(options);
        const resumed = await loadBcModel(output);
        expect(resumed.weights).toEqual(base.weights);
        expect(resumed.initialModelSha256).toMatch(/^[0-9a-f]{64}$/);
        await expect(trainSkirmishBcModel({...options, featureExtractor:'hashed-action-v4'})).rejects.toThrow('不兼容');
        await writeFile(initial, JSON.stringify({...base, weights:[null]}));
        await expect(trainSkirmishBcModel(options)).rejects.toThrow('不兼容');
    });
    it('逐轮保存独立模型并在验证平分时选择较早轮次', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'bc-checkpoints-'));
        const input = path.join(dir, 'train.jsonl');
        const output = path.join(dir, 'model.json');
        await writeFile(input, JSON.stringify(makeRankingSample(1)) + '\n');
        const options = parseBcTrainArgs(['--train', input, '--val', input, '--out', output,
            '--epochs', '3', '--average-weights', '--save-epochs', '--select-best']);
        await trainSkirmishBcModel(options);
        const best = await loadBcModel(output);
        const first = await loadBcModel(output + '.epoch-1.json');
        const last = await loadBcModel(output + '.epoch-3.json');
        expect(best.epochs).toBe(1);
        expect(best.weights).toEqual(first.weights);
        expect(last.epochs).toBe(3);
        expect(last.averagedWeights).toBe(true);
        await expect(trainSkirmishBcModel({ ...options, valFile: null })).rejects.toThrow('需要验证集');
    });
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

    it('可以从 manifest 自动读取全部训练与验证分片', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-bc-manifest-'));
        const artifactDir = await createImmutableArtifactDirectory(
            tempDir,
            'test-v2',
            'd'.repeat(64)
        );
        const splitSeed = 11;
        let trainKey = 'episode-1';
        while (assignDatasetSplit(trainKey, 0.5, splitSeed) !== 'train') {
            trainKey += 'x';
        }
        let validationKey = 'episode-2';
        while (assignDatasetSplit(validationKey, 0.5, splitSeed) !== 'validation') {
            validationKey += 'x';
        }
        const writer = new FeatureShardWriter({
            artifactDir,
            shardSamples: 1,
            validationRatio: 0.5,
            splitSeed
        });
        const trainSample = convertDatasetSampleToFeatureSample(makeRankingSample(1), {
            featureDim: 256,
            featureExtractor: 'hashed-action-v2',
            maxCandidates: null
        })!;
        const validationSample = {
            ...convertDatasetSampleToFeatureSample(makeRankingSample(2), {
                featureDim: 256,
                featureExtractor: 'hashed-action-v2',
                maxCandidates: null
            })!,
            seed: 101
        };
        await writer.write(trainSample, trainKey);
        await writer.write(validationSample, validationKey);
        const shards = await writer.close();
        const manifest: ImmutableDatasetManifest = {
            kind: 'skirmish_feature_dataset_manifest',
            schemaVersion: 1,
            datasetVersion: 'test-v2',
            datasetId: 'd'.repeat(64),
            createdAt: '2026-07-30T00:00:00.000Z',
            generator: { tool: 'test', version: 1, gitCommit: null, options: {} },
            sources: [],
            split: { strategy: 'episode-hash-v1', validationRatio: 0.5, seed: splitSeed },
            shards,
            summary: {}
        };
        const manifestFile = await writeImmutableManifest(artifactDir, manifest);
        const outFile = path.join(tempDir, 'model.json');

        const summary = await trainSkirmishBcModel({
            trainFile: '',
            datasetManifest: manifestFile,
            extraTrainFiles: [],
            extraTrainRepeat: 1,
            valFile: null,
            outFile,
            epochs: 1,
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
        const model = await loadBcModel(outFile);

        expect(summary.trainFiles).toHaveLength(1);
        expect(summary.validationFiles).toHaveLength(1);
        expect(summary.epochs[0].train.samples).toBe(1);
        expect(summary.epochs[0].val?.samples).toBe(1);
        expect(model.datasetId).toBe(manifest.datasetId);
        const output: string[] = [];
        const progressOptions = parseBcTrainArgs([
            '--dataset-manifest', manifestFile, '--out', path.join(tempDir, 'progress-model.json'),
            '--epochs', '1', '--feature-dim', '256', '--feature-extractor', 'hashed-action-v2',
            '--progress-interval-ms', '1'
        ]);
        const withProgress = await trainSkirmishBcModel(progressOptions, new TrainingProgress(1, line => output.push(line)));
        expect(withProgress.epochs).toEqual(summary.epochs);
        expect((await loadBcModel(progressOptions.outFile)).weights).toEqual(model.weights);
        expect(output.some(line => line.includes('数据完整性校验') && line.includes('2/2 条 (100.0%)'))).toBe(true);
        expect(output.some(line => line.includes('轮训练') && line.includes('1/1 条 (100.0%)'))).toBe(true);
        expect(output.some(line => line.includes('轮验证') && line.includes('1/1 条 (100.0%)'))).toBe(true);
        expect(output.at(-1)).toContain('模型已保存');
        expect(parseBcTrainArgs(['--train', 'a.jsonl', '--no-progress']).progress).toBe(false);
        expect(() => parseBcTrainArgs(['--train', 'a.jsonl', '--progress-interval-ms', '0'])).toThrow();
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
