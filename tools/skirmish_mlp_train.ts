/**
 * T06 小型结构化特征 MLP 排序器（对照线性 hashed-action 基线的容量效应）。
 *
 * 设计约束（任务书 T06 执行详情 2/3/4）：
 *   - 候选层变长批处理 + listwise softmax 交叉熵，不设置巨大固定动作分类表；
 *   - 输入沿用 hashed-action 稀疏特征（与线性基线同一表示，只比容量不比表示）；
 *   - 分片洗牌按种子驱动，训练/初始化完全确定；平分裁决与线性一致（同分取 actionCode 字典序最小），
 *     预测不依赖候选数组顺序；
 *   - 离线评估始终跑全量候选（--max-candidates 只影响训练时比较的候选数）。
 *
 * 用法：node --import tsx tools/skirmish_mlp_train.ts --train <features.jsonl> --val <features.jsonl>
 *       --out <model.json> [--epochs 3] [--learning-rate 0.05] [--momentum 0.9]
 *       [--hidden 64] [--feature-dim 16384] [--seed 20260919] [--max-candidates n]
 *       [--limit-train-samples n] [--limit-val-samples n] [--json] [--no-progress]
 */
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SparseFeatureEntries, SkirmishFeatureExtractor, SkirmishFeatureSample } from './skirmish_bc_train';

export interface SkirmishMlpParams {
    featureDim: number;
    hidden: number;
    /** 输入→隐层，行主序：w1[i * hidden + j] */
    w1: Float64Array;
    b1: Float64Array;
    w2: Float64Array;
    b2: number;
}

export interface SkirmishMlpModel {
    kind: 'skirmish_mlp_ranker';
    version: 1;
    objective: 'label-listwise-softmax-ce';
    featureExtractor: SkirmishFeatureExtractor;
    featureDim: number;
    hidden: number;
    activation: 'tanh';
    seed: number;
    learningRate: number;
    momentum: number;
    epochs: number;
    maxCandidates: number | null;
    trainedSamples: number;
    skippedSamples: number;
    trainFile: string;
    valFile: string | null;
    createdAt: string;
    weights: {
        w1: number[];
        b1: number[];
        w2: number[];
        b2: number;
    };
}

export interface SkirmishMlpTrainOptions {
    trainFile: string;
    valFile: string | null;
    outFile: string;
    epochs: number;
    learningRate: number;
    momentum: number;
    hidden: number;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    seed: number;
    maxCandidates: number | null;
    limitTrainSamples: number | null;
    limitValSamples: number | null;
    json: boolean;
    progress: boolean;
}

export interface SkirmishMlpMetrics {
    samples: number;
    correct: number;
    accuracy: number;
    tieRate: number;
    averageCandidates: number;
    averageLoss: number;
}

export interface SkirmishMlpEpochSummary {
    epoch: number;
    train: SkirmishMlpMetrics;
    val: SkirmishMlpMetrics | null;
}

export interface SkirmishMlpTrainSummary {
    trainFile: string;
    valFile: string | null;
    outFile: string;
    objective: SkirmishMlpModel['objective'];
    featureExtractor: SkirmishFeatureExtractor;
    featureDim: number;
    hidden: number;
    seed: number;
    learningRate: number;
    momentum: number;
    maxCandidates: number | null;
    trainedSamples: number;
    skippedSamples: number;
    epochs: SkirmishMlpEpochSummary[];
    trainFinal: SkirmishMlpMetrics;
    valFinal: SkirmishMlpMetrics | null;
}

const DEFAULT_FEATURE_EXTRACTOR: SkirmishFeatureExtractor = 'hashed-action-v5';

function parsePositiveInteger(value: string | undefined, flag: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} 需要正整数`);
    return parsed;
}

function parseNonNegativeNumber(value: string | undefined, flag: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} 需要非负数`);
    return parsed;
}

export function parseMlpTrainArgs(argv: readonly string[]): SkirmishMlpTrainOptions {
    const options: SkirmishMlpTrainOptions = {
        trainFile: '',
        valFile: null,
        outFile: 'training_runs/models/skirmish-mlp-ranker.json',
        epochs: 3,
        learningRate: 0.05,
        momentum: 0.9,
        hidden: 64,
        featureDim: 16384,
        featureExtractor: DEFAULT_FEATURE_EXTRACTOR,
        seed: 20260919,
        maxCandidates: null,
        limitTrainSamples: null,
        limitValSamples: null,
        json: false,
        progress: true
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--train') options.trainFile = path.resolve(argv[++i] ?? '');
        else if (arg === '--val') options.valFile = path.resolve(argv[++i] ?? '');
        else if (arg === '--out') options.outFile = path.resolve(argv[++i] ?? '');
        else if (arg === '--epochs') options.epochs = parsePositiveInteger(argv[++i], '--epochs');
        else if (arg === '--learning-rate') options.learningRate = parsePositiveNumberOrThrow(argv[++i], '--learning-rate');
        else if (arg === '--momentum') options.momentum = parseNonNegativeNumber(argv[++i], '--momentum');
        else if (arg === '--hidden') options.hidden = parsePositiveInteger(argv[++i], '--hidden');
        else if (arg === '--feature-dim') options.featureDim = parsePositiveInteger(argv[++i], '--feature-dim');
        else if (arg === '--feature-extractor') {
            const value = argv[++i];
            if (!['hashed-action-v1', 'hashed-action-v2', 'hashed-action-v3', 'hashed-action-v4', 'hashed-action-v5'].includes(value ?? '')) {
                throw new Error('--feature-extractor 只能是 hashed-action-v1..v5');
            }
            options.featureExtractor = value as SkirmishFeatureExtractor;
        } else if (arg === '--seed') options.seed = parsePositiveInteger(argv[++i], '--seed');
        else if (arg === '--max-candidates') options.maxCandidates = parsePositiveInteger(argv[++i], '--max-candidates');
        else if (arg === '--limit-train-samples') options.limitTrainSamples = parsePositiveInteger(argv[++i], '--limit-train-samples');
        else if (arg === '--limit-val-samples') options.limitValSamples = parsePositiveInteger(argv[++i], '--limit-val-samples');
        else if (arg === '--json') options.json = true;
        else if (arg === '--no-progress') options.progress = false;
        else throw new Error(`未知参数: ${arg}`);
    }
    if (!options.trainFile) throw new Error('请用 --train 指定特征 JSONL');
    return options;
}

function parsePositiveNumberOrThrow(value: string | undefined, flag: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} 需要正数`);
    return parsed;
}

/** mulberry32：小型确定性 PRNG（初始化与洗牌共用，记录种子即可完全复现）。 */
export function createMlpRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createMlpParams(spec: { featureDim: number; hidden: number; seed: number }): SkirmishMlpParams {
    const { featureDim, hidden, seed } = spec;
    const rng = createMlpRng(seed);
    const params: SkirmishMlpParams = {
        featureDim,
        hidden,
        w1: new Float64Array(featureDim * hidden),
        b1: new Float64Array(hidden),
        w2: new Float64Array(hidden),
        b2: 0
    };
    // Xavier 均匀初始化；哈希稀疏特征每候选约几十个非零，尺度足够稳定
    const limitIn = Math.sqrt(6 / (featureDim + hidden));
    for (let i = 0; i < params.w1.length; i += 1) params.w1[i] = (rng() * 2 - 1) * limitIn;
    const limitOut = Math.sqrt(6 / (hidden + 1));
    for (let j = 0; j < hidden; j += 1) params.w2[j] = (rng() * 2 - 1) * limitOut;
    return params;
}

export function scoreMlpParams(
    params: SkirmishMlpParams,
    featureIdx: ArrayLike<number>,
    featureVals: ArrayLike<number>
): number {
    const { featureDim, hidden, w1, b1, w2 } = params;
    let score = params.b2;
    // 稀疏前向：只访问非零特征对应的 w1 行（dim×hidden 稠密乘在 16384 维不可接受）
    for (let j = 0; j < hidden; j += 1) {
        let pre = b1[j];
        for (let k = 0; k < featureIdx.length; k += 1) {
            const idx = featureIdx[k];
            if (idx < 0 || idx >= featureDim) continue;
            pre += w1[idx * hidden + j] * featureVals[k];
        }
        const act = Math.tanh(pre);
        score += act * w2[j];
    }
    return score;
}

export interface MlpScorableCandidate {
    actionCode: string;
    featureIdx: ArrayLike<number>;
    featureVals: ArrayLike<number>;
}

/** 全候选 argmax；平分取 actionCode 字典序最小——与线性 predictCandidate 语义一致，与数组顺序无关。 */
export function predictMlpAction(
    params: SkirmishMlpParams,
    candidates: readonly MlpScorableCandidate[]
): string | null {
    let bestCode: string | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
        const score = scoreMlpParams(params, candidate.featureIdx, candidate.featureVals);
        if (score > bestScore
            || (score === bestScore && bestCode !== null && candidate.actionCode < bestCode)) {
            bestScore = score;
            bestCode = candidate.actionCode;
        }
    }
    return bestCode;
}

// —— 紧凑数据集：JSONL → 扁平 typed-array 池（19k 样本 × ~70 候选 × ~60 特征，
//    保留 JSON 对象会让堆爆；解析后即丢弃原始行）——

interface CompactDataset {
    sampleCount: number;
    /** 样本 → 候选区间 [candidateStart[s], candidateStart[s+1]) */
    candidateStart: Int32Array;
    candidateCodes: string[];
    /** 候选 → 特征区间 [featureStart[c], featureStart[c+1]) */
    featureStart: Int32Array;
    featureIdx: Int32Array;
    featureVal: Float32Array;
    /** 样本 label 在其候选区间内的相对下标 */
    labelIndex: Int32Array;
    skippedSamples: number;
}

async function loadFeatureSamples(file: string, limit: number | null, maxCandidates: number | null): Promise<CompactDataset> {
    const candidateStart: number[] = [0];
    const candidateCodes: string[] = [];
    const featureStart: number[] = [0];
    const featureIdx: number[] = [];
    const featureVal: number[] = [];
    const labelIndex: number[] = [];
    let skipped = 0;
    let samples = 0;

    const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        if (limit !== null && samples >= limit) break;
        const parsed = JSON.parse(line) as SkirmishFeatureSample;
        if (parsed.candidates.findIndex(candidate => candidate.actionCode === parsed.label.actionCode) < 0) {
            skipped += 1;
            continue;
        }
        let candidates = parsed.candidates;
        if (maxCandidates !== null && candidates.length > maxCandidates) {
            // 与线性基线 selectCandidateCodes 相同：截断后强制保留 label
            const kept = candidates.slice(0, Math.max(1, maxCandidates));
            if (!kept.some(candidate => candidate.actionCode === parsed.label.actionCode)) {
                kept[kept.length - 1] = candidates.find(candidate => candidate.actionCode === parsed.label.actionCode)!;
            }
            candidates = kept;
        }
        const labelPos = candidates.findIndex(candidate => candidate.actionCode === parsed.label.actionCode);
        if (labelPos < 0) {
            skipped += 1;
            continue;
        }
        for (const candidate of candidates) {
            candidateCodes.push(candidate.actionCode);
            for (const [idx, val] of candidate.features as SparseFeatureEntries) {
                featureIdx.push(idx);
                featureVal.push(val);
            }
            featureStart.push(featureIdx.length);
        }
        labelIndex.push(labelPos);
        samples += 1;
        candidateStart.push(candidateCodes.length);
    }
    rl.close();

    return {
        sampleCount: samples,
        candidateStart: Int32Array.from(candidateStart),
        candidateCodes,
        featureStart: Int32Array.from(featureStart),
        featureIdx: Int32Array.from(featureIdx),
        featureVal: Float32Array.from(featureVal),
        labelIndex: Int32Array.from(labelIndex),
        skippedSamples: skipped
    };
}

function candidateFeatureView(data: CompactDataset, candidate: number): { featureIdx: ArrayLike<number>; featureVals: ArrayLike<number> } {
    return {
        featureIdx: data.featureIdx.subarray(data.featureStart[candidate], data.featureStart[candidate + 1]),
        featureVals: data.featureVal.subarray(data.featureStart[candidate], data.featureStart[candidate + 1])
    };
}

interface Scratch {
    pre: Float64Array;
    act: Float64Array;
    /** 每候选隐层激活缓存（反向要用）：actCache[candidate * hidden + j] */
    actCache: Float64Array;
    softmax: Float64Array;
}

function ensureScratch(scratch: Scratch, maxCandidates: number, hidden: number): Scratch {
    const needed = maxCandidates * hidden;
    if (scratch.actCache.length >= needed) return scratch;
    return {
        pre: new Float64Array(hidden),
        act: new Float64Array(hidden),
        actCache: new Float64Array(needed * 2),
        softmax: new Float64Array(maxCandidates * 2)
    };
}

/** 对一个样本做 listwise softmax CE 前向+反向（异步动量更新），返回损失与预测。 */
function trainOneSample(
    params: SkirmishMlpParams,
    momentumW1: Float64Array,
    momentumB1: Float64Array,
    momentumW2: Float64Array,
    scratch: Scratch,
    data: CompactDataset,
    sample: number,
    learningRate: number,
    momentum: number
): { loss: number; predicted: string; correct: boolean; tie: boolean } {
    const { hidden, featureDim, w1, b1, w2 } = params;
    const c0 = data.candidateStart[sample];
    const c1 = data.candidateStart[sample + 1];
    const count = c1 - c0;
    scratch = ensureScratch(scratch, count, hidden);
    const scores = new Array<number>(count);
    // 前向：缓存每候选的隐层激活
    for (let c = 0; c < count; c += 1) {
        const view = candidateFeatureView(data, c0 + c);
        const idx = view.featureIdx;
        const vals = view.featureVals;
        let score = params.b2;
        const cacheBase = c * hidden;
        for (let j = 0; j < hidden; j += 1) {
            let pre = b1[j];
            for (let k = 0; k < idx.length; k += 1) {
                const fi = idx[k];
                if (fi < 0 || fi >= featureDim) continue;
                pre += w1[fi * hidden + j] * vals[k];
            }
            const act = Math.tanh(pre);
            scratch.actCache[cacheBase + j] = act;
            score += act * w2[j];
        }
        scores[c] = score;
    }
    // softmax + 梯度 ds_k = p_k - y_k
    let maxScore = -Infinity;
    for (const score of scores) if (score > maxScore) maxScore = score;
    let sumExp = 0;
    for (let c = 0; c < count; c += 1) {
        scratch.softmax[c] = Math.exp(scores[c] - maxScore);
        sumExp += scratch.softmax[c];
    }
    const labelPos = data.labelIndex[sample];
    let loss = 0;
    for (let c = 0; c < count; c += 1) {
        const p = scratch.softmax[c] / sumExp;
        if (c === labelPos) loss = -Math.log(Math.max(p, 1e-12));
        const ds = p - (c === labelPos ? 1 : 0);
        if (Math.abs(ds) < 1e-15) continue;
        const cacheBase = c * hidden;
        for (let j = 0; j < hidden; j += 1) {
            const act = scratch.actCache[cacheBase + j];
            momentumW2[j] = momentum * momentumW2[j] + ds * act;
            w2[j] -= learningRate * momentumW2[j];
            scratch.pre[j] = ds * w2[j] * (1 - act * act);
        }
        const view = candidateFeatureView(data, c0 + c);
        const idx = view.featureIdx;
        const vals = view.featureVals;
        for (let k = 0; k < idx.length; k += 1) {
            const fi = idx[k];
            if (fi < 0 || fi >= featureDim) continue;
            const row = fi * hidden;
            const x = vals[k];
            for (let j = 0; j < hidden; j += 1) {
                momentumW1[row + j] = momentum * momentumW1[row + j] + scratch.pre[j] * x;
                w1[row + j] -= learningRate * momentumW1[row + j];
            }
        }
        for (let j = 0; j < hidden; j += 1) {
            momentumB1[j] = momentum * momentumB1[j] + scratch.pre[j];
            b1[j] -= learningRate * momentumB1[j];
        }
    }
    // b2 无梯度更新：softmax 对全体分数平移不变，Σ ds_k ≡ 0，b2 恒为初始化值 0
    const predictedPos = argmaxWithTie(scores, data, c0, count);
    const predicted = data.candidateCodes[c0 + predictedPos];
    return {
        loss,
        predicted,
        correct: predicted === data.candidateCodes[c0 + labelPos],
        tie: countTopTies(scores, count)
    };
}

function argmaxWithTie(scores: number[], data: CompactDataset, c0: number, count: number): number {
    let best = 0;
    for (let c = 1; c < count; c += 1) {
        if (scores[c] > scores[best]
            || (scores[c] === scores[best] && data.candidateCodes[c0 + c] < data.candidateCodes[c0 + best])) {
            best = c;
        }
    }
    return best;
}

function countTopTies(scores: number[], count: number): boolean {
    let best = -Infinity;
    let ties = 0;
    for (let c = 0; c < count; c += 1) {
        if (scores[c] > best) { best = scores[c]; ties = 1; }
        else if (scores[c] === best) ties += 1;
    }
    return ties >= 2;
}

function evaluateDataset(params: SkirmishMlpParams, data: CompactDataset): SkirmishMlpMetrics {
    let correct = 0;
    let ties = 0;
    let candidateTotal = 0;
    let lossTotal = 0;
    for (let s = 0; s < data.sampleCount; s += 1) {
        const c0 = data.candidateStart[s];
        const c1 = data.candidateStart[s + 1];
        const count = c1 - c0;
        const scores: number[] = [];
        for (let c = c0; c < c1; c += 1) {
            const view = candidateFeatureView(data, c);
            scores.push(scoreMlpParams(params, view.featureIdx, view.featureVals));
        }
        const bestPos = argmaxWithTie(scores, data, c0, count);
        if (data.candidateCodes[c0 + bestPos] === data.candidateCodes[c0 + data.labelIndex[s]]) correct += 1;
        if (countTopTies(scores, count)) ties += 1;
        candidateTotal += count;
        let maxScore = -Infinity;
        for (const score of scores) if (score > maxScore) maxScore = score;
        let sumExp = 0;
        for (const score of scores) sumExp += Math.exp(score - maxScore);
        lossTotal += -Math.log(Math.max(Math.exp(scores[data.labelIndex[s]] - maxScore) / sumExp, 1e-12));
    }
    return {
        samples: data.sampleCount,
        correct,
        accuracy: data.sampleCount > 0 ? correct / data.sampleCount : 0,
        tieRate: data.sampleCount > 0 ? ties / data.sampleCount : 0,
        averageCandidates: data.sampleCount > 0 ? candidateTotal / data.sampleCount : 0,
        averageLoss: data.sampleCount > 0 ? lossTotal / data.sampleCount : 0
    };
}

export async function trainSkirmishMlpModel(options: SkirmishMlpTrainOptions): Promise<{ model: SkirmishMlpModel; summary: SkirmishMlpTrainSummary }> {
    const data = await loadFeatureSamples(options.trainFile, options.limitTrainSamples, options.maxCandidates);
    const valData = options.valFile ? await loadFeatureSamples(options.valFile, options.limitValSamples, null) : null;
    const params = createMlpParams({ featureDim: options.featureDim, hidden: options.hidden, seed: options.seed });
    const momentumW1 = new Float64Array(params.w1.length);
    const momentumB1 = new Float64Array(params.hidden);
    const momentumW2 = new Float64Array(params.hidden);
    let scratch: Scratch = { pre: new Float64Array(0), act: new Float64Array(0), actCache: new Float64Array(0), softmax: new Float64Array(0) };
    scratch = ensureScratch(scratch, 1024, options.hidden);

    const epochs: SkirmishMlpEpochSummary[] = [];
    for (let epoch = 1; epoch <= options.epochs; epoch += 1) {
        // 分片洗牌：每 epoch 用 seed+epoch 驱动确定性乱序；逐样本异步动量更新
        const rng = createMlpRng(options.seed + epoch * 100003);
        const order = Array.from({ length: data.sampleCount }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }
        let correct = 0;
        let lossTotal = 0;
        let seen = 0;
        for (const sample of order) {
            const result = trainOneSample(params, momentumW1, momentumB1, momentumW2, scratch, data, sample, options.learningRate, options.momentum);
            if (result.correct) correct += 1;
            lossTotal += result.loss;
            seen += 1;
            if (options.progress && seen % 2000 === 0) {
                process.stderr.write(`[mlp] epoch ${epoch} 样本 ${seen}/${data.sampleCount} 损失 ${(lossTotal / seen).toFixed(4)}\n`);
            }
        }
        const trainMetrics: SkirmishMlpMetrics = {
            samples: seen,
            correct,
            accuracy: seen > 0 ? correct / seen : 0,
            tieRate: 0,
            averageCandidates: seen > 0 ? data.candidateStart[data.sampleCount] / data.sampleCount : 0,
            averageLoss: seen > 0 ? lossTotal / seen : 0
        };
        const valMetrics = valData ? evaluateDataset(params, valData) : null;
        epochs.push({ epoch, train: trainMetrics, val: valMetrics });
    }

    const trainFinal = evaluateDataset(params, data);
    const valFinal = valData ? evaluateDataset(params, valData) : null;
    const model: SkirmishMlpModel = {
        kind: 'skirmish_mlp_ranker',
        version: 1,
        objective: 'label-listwise-softmax-ce',
        featureExtractor: options.featureExtractor,
        featureDim: options.featureDim,
        hidden: options.hidden,
        activation: 'tanh',
        seed: options.seed,
        learningRate: options.learningRate,
        momentum: options.momentum,
        epochs: options.epochs,
        maxCandidates: options.maxCandidates,
        trainedSamples: data.sampleCount,
        skippedSamples: data.skippedSamples,
        trainFile: options.trainFile,
        valFile: options.valFile,
        createdAt: new Date().toISOString(),
        weights: {
            w1: Array.from(params.w1),
            b1: Array.from(params.b1),
            w2: Array.from(params.w2),
            b2: params.b2
        }
    };
    await writeFile(options.outFile, JSON.stringify(model), 'utf8');
    const summary: SkirmishMlpTrainSummary = {
        trainFile: options.trainFile,
        valFile: options.valFile,
        outFile: options.outFile,
        objective: model.objective,
        featureExtractor: options.featureExtractor,
        featureDim: options.featureDim,
        hidden: options.hidden,
        seed: options.seed,
        learningRate: options.learningRate,
        momentum: options.momentum,
        maxCandidates: options.maxCandidates,
        trainedSamples: data.sampleCount,
        skippedSamples: data.skippedSamples,
        epochs,
        trainFinal,
        valFinal
    };
    return { model, summary };
}

export async function loadMlpModel(file: string): Promise<SkirmishMlpModel> {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as SkirmishMlpModel;
    if (parsed.kind !== 'skirmish_mlp_ranker' || parsed.version !== 1) {
        throw new Error(`不是合法的 skirmish_mlp_ranker v1 模型: ${file}`);
    }
    return parsed;
}

export function mlpModelToParams(model: SkirmishMlpModel): SkirmishMlpParams {
    return {
        featureDim: model.featureDim,
        hidden: model.hidden,
        w1: Float64Array.from(model.weights.w1),
        b1: Float64Array.from(model.weights.b1),
        w2: Float64Array.from(model.weights.w2),
        b2: model.weights.b2
    };
}

/** 评估/对战侧便捷入口：模型 + 稀疏特征条目 → 分数。 */
export function scoreMlpCandidate(model: SkirmishMlpModel, features: SparseFeatureEntries): number {
    const params = mlpModelToParams(model);
    const idx = features.map(pair => pair[0]);
    const vals = features.map(pair => pair[1]);
    return scoreMlpParams(params, idx, vals);
}

function printHelp(): void {
    console.log([
        '用法: node --import tsx tools/skirmish_mlp_train.ts --train <features.jsonl> [选项]',
        '  --val <file>              验证集（评估始终使用全量候选）',
        '  --out <file>              模型输出',
        '  --epochs <n>              默认 3',
        '  --learning-rate <n>       默认 0.05',
        '  --momentum <n>            默认 0.9',
        '  --hidden <n>              默认 64',
        '  --feature-dim <n>         默认 16384',
        '  --feature-extractor <n>   hashed-action-v1..v5，默认 v5',
        '  --seed <n>                初始化与洗牌种子，默认 20260919',
        '  --max-candidates <n>      训练时比较的候选上限（保留 label），默认全量',
        '  --limit-train-samples <n> / --limit-val-samples <n>  smoke 限流',
        '  --json                    输出 JSON 摘要'
    ].join('\n'));
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    if (argv.includes('--help')) {
        printHelp();
        return;
    }
    const options = parseMlpTrainArgs(argv);
    const result = await trainSkirmishMlpModel(options);
    if (options.json) {
        console.log(JSON.stringify(result.summary, null, 2));
    } else {
        for (const epoch of result.summary.epochs) {
            const val = epoch.val ? ` val top1=${epoch.val.accuracy.toFixed(4)}` : '';
            console.log(`epoch ${epoch.epoch}: train top1=${epoch.train.accuracy.toFixed(4)} loss=${epoch.train.averageLoss.toFixed(4)}${val}`);
        }
        console.log(`模型已写入 ${result.summary.outFile}`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('[mlp-train] 失败:', error);
        process.exitCode = 1;
    });
}
