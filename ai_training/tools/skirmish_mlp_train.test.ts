import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createMlpParams,
    loadMlpModel,
    parseMlpTrainArgs,
    predictMlpAction,
    scoreMlpCandidate,
    scoreMlpParams,
    trainSkirmishMlpModel
} from './skirmish_mlp_train';

/** 构造 skirmish_feature_sample 行（与 tools/skirmish_feature_export.ts 输出同构）。
 * stateFeature 随行变化：标签由“状态 token × 动作身份”交互决定，线性加性模型无法拟合，
 * 正好验证 MLP 隐层确实拿到了梯度（微型梯度检查）。 */
function featureSample(labelCode: string, candidateCodes: string[], stateFeature = 9, dim = 64) {
    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: 'hashed-action-v5',
        featureDim: dim,
        source: { file: 'test.jsonl', episodeIndex: 0, sampleIndex: 0 },
        scenario: { id: 'TEST:unit', mode: 'SD', mapName: 'test', resourcePath: '' },
        seed: 1,
        step: 0,
        turn: 1,
        playerId: 0,
        policy: 'test',
        label: { fixedActionIndex: 0, actionCode: labelCode },
        candidates: candidateCodes.map(code => ({
            actionCode: code,
            // 动作身份特征 + 全部候选共享的状态特征
            features: code === 'actA' ? [[1, 1], [stateFeature, 1]] : code === 'actB' ? [[2, 1], [stateFeature, 1]] : [[3, 1], [stateFeature, 1]]
        }))
    };
}

function candidateView(sample: ReturnType<typeof featureSample>) {
    return sample.candidates.map(candidate => ({
        actionCode: candidate.actionCode as string,
        featureIdx: candidate.features.map((pair: number[]) => pair[0]),
        featureVals: candidate.features.map((pair: number[]) => pair[1])
    }));
}

describe('skirmish_mlp_train 参数解析', () => {
    it('默认值与必填项', () => {
        const options = parseMlpTrainArgs(['--train', 'a.jsonl', '--val', 'b.jsonl', '--out', 'c.json']);
        expect(options.trainFile).toContain('a.jsonl');
        expect(options.epochs).toBe(3);
        expect(options.learningRate).toBe(0.05);
        expect(options.momentum).toBe(0.9);
        expect(options.hidden).toBe(64);
        expect(options.seed).toBeTypeOf('number');
        expect(options.maxCandidates).toBeNull();
    });
    it('拒绝未知参数与缺训练文件', () => {
        expect(() => parseMlpTrainArgs(['--train', 'a.jsonl', '--wat'])).toThrow(/未知参数/);
        expect(() => parseMlpTrainArgs(['--out', 'c.json'])).toThrow(/--train/);
    });
});

describe('MLP 前向与决策语义', () => {
    it('同种子初始化完全确定，异种子不同', () => {
        const left = createMlpParams({ featureDim: 256, hidden: 8, seed: 42 });
        const right = createMlpParams({ featureDim: 256, hidden: 8, seed: 42 });
        const other = createMlpParams({ featureDim: 256, hidden: 8, seed: 43 });
        expect(Array.from(left.w1)).toEqual(Array.from(right.w1));
        expect(Array.from(left.w1)).not.toEqual(Array.from(other.w1));
    });
    it('零参数下得分恒等，预测按 actionCode 字典序稳定裁决且与候选顺序无关', () => {
        const params = createMlpParams({ featureDim: 64, hidden: 4, seed: 1 });
        for (let i = 0; i < params.w1.length; i += 1) params.w1[i] = 0;
        for (let i = 0; i < params.w2.length; i += 1) params.w2[i] = 0;
        params.b2 = 0;
        const view = candidateView(featureSample('actB', ['actB', 'actA', 'actC']));
        const first = predictMlpAction(params, view);
        const shuffled = predictMlpAction(params, [...view].reverse());
        expect(first).toBe('actA');
        expect(shuffled).toBe(first);
    });
    it('scoreMlpParams 对同一输入恒定且有限', () => {
        const params = createMlpParams({ featureDim: 64, hidden: 8, seed: 7 });
        const score = scoreMlpParams(params, [1, 9], [1, 1]);
        expect(Number.isFinite(score)).toBe(true);
        expect(scoreMlpParams(params, [1, 9], [1, 1])).toBe(score);
    });
});

describe('微型可分数据过拟合与模型文件', () => {
    let dir: string;
    beforeAll(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'mlp-train-'));
    });
    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('16 条可分样本训练后 train top-1 ≥ 0.9；模型文件往返评分一致', async () => {
        const samples = [];
        for (let i = 0; i < 16; i += 1) {
            const even = i % 2 === 0;
            // 状态 token 20/21 决定标签：只有用到交互的模型才能拟合
            samples.push(featureSample(even ? 'actA' : 'actB', ['actA', 'actB'], even ? 20 : 21));
        }
        const trainFile = path.join(dir, 'micro_train.jsonl');
        await writeFile(trainFile, samples.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
        const outFile = path.join(dir, 'micro_model.json');
        const result = await trainSkirmishMlpModel(parseMlpTrainArgs([
            '--train', trainFile, '--out', outFile,
            '--epochs', '60', '--learning-rate', '0.5', '--hidden', '8',
            '--feature-dim', '64', '--seed', '99', '--no-progress'
        ]));
        expect(result.summary.trainFinal.accuracy).toBeGreaterThanOrEqual(0.9);
        expect(result.model.kind).toBe('skirmish_mlp_ranker');
        expect(result.model.seed).toBe(99);
        expect(result.model.trainedSamples).toBe(16);

        const reloaded = await loadMlpModel(outFile);
        const entries = samples[0].candidates.map((candidate: { actionCode: string; features: number[][] }) => ({
            actionCode: candidate.actionCode,
            features: candidate.features
        }));
        const original = entries.map(candidate => scoreMlpCandidate(result.model, candidate.features as [number, number][]));
        const roundTripped = entries.map(candidate => scoreMlpCandidate(reloaded, candidate.features as [number, number][]));
        expect(roundTripped).toEqual(original);
    });

    it('label 不在候选中的样本被跳过而非污染训练', async () => {
        const trainFile = path.join(dir, 'skip_train.jsonl');
        await writeFile(trainFile, JSON.stringify(featureSample('missing', ['actA', 'actB'])) + '\n', 'utf8');
        const result = await trainSkirmishMlpModel(parseMlpTrainArgs([
            '--train', trainFile, '--out', path.join(dir, 'skip_model.json'),
            '--epochs', '1', '--feature-dim', '64', '--hidden', '4', '--no-progress'
        ]));
        expect(result.summary.skippedSamples).toBe(1);
        expect(result.summary.trainFinal.samples).toBe(0);
    });
});
