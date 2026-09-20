/**
 * 空间残差卷积网络 (Path B - Spatial Conv ResNet)
 *
 * 架构规格：
 * - 输入：24 通道 20x20 空间张量 + 16 维全局标量
 * - 主干 (Trunk)：
 *   - Stem: Conv2D(24 -> 32, k=3, pad=1) + ReLU
 *   - ResBlock 1: Conv2D(32 -> 32, k=3, pad=1) + ReLU + Conv2D(32 -> 32, k=3, pad=1) + 残差相加 + ReLU
 *   - ResBlock 2: Conv2D(32 -> 32, k=3, pad=1) + ReLU + Conv2D(32 -> 32, k=3, pad=1) + 残差相加 + ReLU
 *   - 产出局部拓扑潜层张量 Z: [32, 20, 20]
 * - 价值头 (Value Head)：
 *   - GlobalAvgPool(Z) (32维) + 全局特征 (16维) = 48维
 *   - Dense(48 -> 32, ReLU) -> Dense(32 -> 1, Tanh) -> 预测局势胜率 [-1, 1]
 * - 动作打分头 (Policy Scorer Head)：
 *   - 基于候选动作空间坐标 (actorCoord, landingCoord, targetCoord) 从 Z 中提取 3 个 32 维特征
 *   - 拼接 24 维动作战术语义 = 120 维动作向量
 *   - Dense(120 -> 48, ReLU) -> Dense(48 -> 1, Linear) -> 动作 Logit
 * - 保证 100% 规则合法动作选择，单次决策主干仅前向一次 (<15ms)，无外部依赖。
 */

import type { Position } from '../types';
import {
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
    GLOBAL_FEATURE_DIM,
    ACTION_SEMANTIC_DIM,
    SpatialEncodedState,
    SpatialActionFeatures
} from './spatial_tensor_encoder';

export interface ConvLayerWeights {
    inChannels: number;
    outChannels: number;
    kernelSize: 3;
    padding: 1;
    /** 形状 [outChannels, inChannels, 3, 3] */
    weights: Float32Array;
    /** 形状 [outChannels] */
    biases: Float32Array;
}

export interface DenseLayerWeights {
    inDim: number;
    outDim: number;
    /** 形状 [outDim, inDim] */
    weights: Float32Array;
    /** 形状 [outDim] */
    biases: Float32Array;
}

export interface SpatialResNetWeights {
    version: 'spatial-resnet-v1';
    architectureId: 'spatial_resnet_32ch_2res';
    stem: ConvLayerWeights;
    res1_1: ConvLayerWeights;
    res1_2: ConvLayerWeights;
    res2_1: ConvLayerWeights;
    res2_2: ConvLayerWeights;
    valDense1: DenseLayerWeights;
    valDense2: DenseLayerWeights;
    polDense1: DenseLayerWeights;
    polDense2: DenseLayerWeights;
}

export interface SpatialInferenceResult {
    /** 状态价值标量 [-1, 1] */
    value: number;
    /** 所有候选动作的未归一化得分 (Logits) */
    actionLogits: number[];
    /** 所有候选动作的概率分布 (Softmax) */
    actionProbs: number[];
    /** 最优候选动作索引 */
    bestActionIndex: number;
    /** 局势空间潜层特征 Z [32, 20, 20] */
    spatialFeaturesZ: Float32Array;
}

/**
 * 2D 卷积前向计算 (纯 TypedArray，CPU 缓存友好，无额外 GC 分配)
 */
export function conv2dForward(
    out: Float32Array,
    x: Float32Array,
    conv: ConvLayerWeights,
    H: number = SPATIAL_TENSOR_MAX_H,
    W_dim: number = SPATIAL_TENSOR_MAX_W,
    relu: boolean = false
): void {
    const C_in = conv.inChannels;
    const C_out = conv.outChannels;
    const HW = H * W_dim;
    const W = conv.weights;
    const B = conv.biases;

    for (let co = 0; co < C_out; co += 1) {
        const outBase = co * HW;
        const bias = B[co];
        out.fill(bias, outBase, outBase + HW);

        const wCoBase = co * C_in * 9;
        for (let ci = 0; ci < C_in; ci += 1) {
            const inBase = ci * HW;
            const wCiBase = wCoBase + ci * 9;

            for (let y = 0; y < H; y += 1) {
                for (let x_pos = 0; x_pos < W_dim; x_pos += 1) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky += 1) {
                        const iy = y + ky;
                        if (iy < 0 || iy >= H) continue;
                        const inRowBase = inBase + iy * W_dim;
                        const wRowBase = wCiBase + (ky + 1) * 3;

                        for (let kx = -1; kx <= 1; kx += 1) {
                            const ix = x_pos + kx;
                            if (ix < 0 || ix >= W_dim) continue;
                            sum += x[inRowBase + ix] * W[wRowBase + (kx + 1)];
                        }
                    }
                    out[outBase + y * W_dim + x_pos] += sum;
                }
            }
        }

        if (relu) {
            for (let i = 0; i < HW; i += 1) {
                const idx = outBase + i;
                if (out[idx] < 0) out[idx] = 0;
            }
        }
    }
}

/**
 * 全连接层前向计算
 */
export function denseForward(
    out: Float32Array,
    x: Float32Array,
    layer: DenseLayerWeights,
    activation: 'relu' | 'tanh' | 'linear' = 'linear'
): void {
    const inDim = layer.inDim;
    const outDim = layer.outDim;
    const W = layer.weights;
    const B = layer.biases;

    for (let o = 0; o < outDim; o += 1) {
        let sum = B[o];
        const wBase = o * inDim;
        for (let i = 0; i < inDim; i += 1) {
            sum += W[wBase + i] * x[i];
        }
        if (activation === 'relu') {
            out[o] = sum > 0 ? sum : 0;
        } else if (activation === 'tanh') {
            out[o] = Math.tanh(sum);
        } else {
            out[o] = sum;
        }
    }
}

/**
 * 全局平均池化 (Global Average Pooling)
 */
export function globalAvgPool2D(
    out: Float32Array,
    x: Float32Array,
    channels: number = 32,
    H: number = SPATIAL_TENSOR_MAX_H,
    W: number = SPATIAL_TENSOR_MAX_W
): void {
    const HW = H * W;
    const scale = 1.0 / HW;
    for (let c = 0; c < channels; c += 1) {
        let sum = 0;
        const base = c * HW;
        for (let i = 0; i < HW; i += 1) {
            sum += x[base + i];
        }
        out[c] = sum * scale;
    }
}

/**
 * 从潜层张量 Z 中池化指定网格坐标的 32 维特征向量
 */
export function poolSpatialCoord(
    out: Float32Array,
    outOffset: number,
    Z: Float32Array,
    coord: Position | null,
    channels: number = 32,
    H: number = SPATIAL_TENSOR_MAX_H,
    W: number = SPATIAL_TENSOR_MAX_W
): void {
    if (!coord || coord.x < 0 || coord.x >= W || coord.y < 0 || coord.y >= H) {
        out.fill(0, outOffset, outOffset + channels);
        return;
    }
    const HW = H * W;
    const tileOffset = coord.y * W + coord.x;
    for (let c = 0; c < channels; c += 1) {
        out[outOffset + c] = Z[c * HW + tileOffset];
    }
}

/**
 * 初始化随机网络权重 (Kaiming / He 正态分布初始化)
 */
export function createInitializedSpatialResNet(seed: number = 42): SpatialResNetWeights {
    // 伪随机生成器 (LCG)
    let s = seed;
    const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s / 4294967296.0) * 2 - 1; // [-1, 1]
    };

    const initConv = (inC: number, outC: number): ConvLayerWeights => {
        const std = Math.sqrt(2.0 / (inC * 9));
        const total = outC * inC * 9;
        const weights = new Float32Array(total);
        for (let i = 0; i < total; i += 1) weights[i] = rand() * std;
        const biases = new Float32Array(outC);
        return { inChannels: inC, outChannels: outC, kernelSize: 3, padding: 1, weights, biases };
    };

    const initDense = (inD: number, outD: number): DenseLayerWeights => {
        const std = Math.sqrt(2.0 / inD);
        const total = outD * inD;
        const weights = new Float32Array(total);
        for (let i = 0; i < total; i += 1) weights[i] = rand() * std;
        const biases = new Float32Array(outD);
        return { inDim: inD, outDim: outD, weights, biases };
    };

    return {
        version: 'spatial-resnet-v1',
        architectureId: 'spatial_resnet_32ch_2res',
        stem: initConv(SPATIAL_TENSOR_CHANNELS, 32),
        res1_1: initConv(32, 32),
        res1_2: initConv(32, 32),
        res2_1: initConv(32, 32),
        res2_2: initConv(32, 32),
        valDense1: initDense(32 + GLOBAL_FEATURE_DIM, 32),
        valDense2: initDense(32, 1),
        polDense1: initDense(32 * 3 + ACTION_SEMANTIC_DIM, 48),
        polDense2: initDense(48, 1)
    };
}

/**
 * 完整空间残差网络推理管线
 */
export class SpatialResNetPredictor {
    private weights: SpatialResNetWeights;

    // 预分配复用张量缓冲区，彻底杜绝每次推理的 GC 内存分配
    private bufStem: Float32Array;
    private bufRes1_1: Float32Array;
    private bufRes1_2: Float32Array;
    private bufRes2_1: Float32Array;
    private bufZ: Float32Array;
    private bufGap: Float32Array;
    private bufValIn: Float32Array;
    private bufValH: Float32Array;
    private bufValOut: Float32Array;
    private bufPolIn: Float32Array;
    private bufPolH: Float32Array;
    private bufPolOut: Float32Array;

    constructor(weights: SpatialResNetWeights) {
        this.weights = weights;
        const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
        this.bufStem = new Float32Array(32 * HW);
        this.bufRes1_1 = new Float32Array(32 * HW);
        this.bufRes1_2 = new Float32Array(32 * HW);
        this.bufRes2_1 = new Float32Array(32 * HW);
        this.bufZ = new Float32Array(32 * HW);
        this.bufGap = new Float32Array(32);
        this.bufValIn = new Float32Array(32 + GLOBAL_FEATURE_DIM);
        this.bufValH = new Float32Array(32);
        this.bufValOut = new Float32Array(1);
        this.bufPolIn = new Float32Array(32 * 3 + ACTION_SEMANTIC_DIM);
        this.bufPolH = new Float32Array(48);
        this.bufPolOut = new Float32Array(1);
    }

    public predict(
        encodedState: SpatialEncodedState,
        candidateActions: SpatialActionFeatures[]
    ): SpatialInferenceResult {
        const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;

        // 1. Stem: Conv(24 -> 32) + ReLU
        conv2dForward(this.bufStem, encodedState.spatialTensor, this.weights.stem, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);

        // 2. ResBlock 1: Conv + ReLU + Conv + 残差相加 + ReLU
        conv2dForward(this.bufRes1_1, this.bufStem, this.weights.res1_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
        conv2dForward(this.bufRes1_2, this.bufRes1_1, this.weights.res1_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
        // 残差叠加到 bufRes1_2
        for (let i = 0; i < 32 * HW; i += 1) {
            const sum = this.bufRes1_2[i] + this.bufStem[i];
            this.bufRes1_2[i] = sum > 0 ? sum : 0;
        }

        // 3. ResBlock 2: Conv + ReLU + Conv + 残差相加 + ReLU -> 输出 Z
        conv2dForward(this.bufRes2_1, this.bufRes1_2, this.weights.res2_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
        conv2dForward(this.bufZ, this.bufRes2_1, this.weights.res2_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
        for (let i = 0; i < 32 * HW; i += 1) {
            const sum = this.bufZ[i] + this.bufRes1_2[i];
            this.bufZ[i] = sum > 0 ? sum : 0;
        }

        // 4. Value Head 前向
        globalAvgPool2D(this.bufGap, this.bufZ, 32, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W);
        this.bufValIn.set(this.bufGap, 0);
        this.bufValIn.set(encodedState.globalFeatures, 32);
        denseForward(this.bufValH, this.bufValIn, this.weights.valDense1, 'relu');
        denseForward(this.bufValOut, this.bufValH, this.weights.valDense2, 'tanh');
        const value = this.bufValOut[0];

        // 5. Policy Scorer 前向 (评估全部合法候选动作)
        const logits: number[] = [];
        for (const act of candidateActions) {
            // 空间特征池化: [actorCoord, landingCoord, targetCoord] 各 32 维
            poolSpatialCoord(this.bufPolIn, 0, this.bufZ, act.actorCoord);
            poolSpatialCoord(this.bufPolIn, 32, this.bufZ, act.landingCoord);
            poolSpatialCoord(this.bufPolIn, 64, this.bufZ, act.targetCoord);
            // 动作语义: 24 维
            this.bufPolIn.set(act.semantics, 96);

            denseForward(this.bufPolH, this.bufPolIn, this.weights.polDense1, 'relu');
            denseForward(this.bufPolOut, this.bufPolH, this.weights.polDense2, 'linear');
            logits.push(this.bufPolOut[0]);
        }

        if (logits.length === 0) {
            return {
                value,
                actionLogits: [],
                actionProbs: [],
                bestActionIndex: -1,
                spatialFeaturesZ: this.bufZ
            };
        }

        const maxLogit = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExp = exps.reduce((a, b) => a + b, 0) || 1.0;
        const probs = exps.map(e => e / sumExp);

        let bestIndex = 0;
        let bestLogit = logits[0];
        for (let i = 1; i < logits.length; i += 1) {
            if (logits[i] > bestLogit) {
                bestLogit = logits[i];
                bestIndex = i;
            }
        }

        return {
            value,
            actionLogits: logits,
            actionProbs: probs,
            bestActionIndex: bestIndex,
            spatialFeaturesZ: this.bufZ
        };
    }
}

/**
 * 权重导出为 JSON 字符串
 */
export function exportSpatialResNetToJson(weights: SpatialResNetWeights): string {
    const serializeLayer = (l: ConvLayerWeights | DenseLayerWeights) => ({
        ...l,
        weights: Array.from(l.weights),
        biases: Array.from(l.biases)
    });

    const obj = {
        version: weights.version,
        architectureId: weights.architectureId,
        stem: serializeLayer(weights.stem),
        res1_1: serializeLayer(weights.res1_1),
        res1_2: serializeLayer(weights.res1_2),
        res2_1: serializeLayer(weights.res2_1),
        res2_2: serializeLayer(weights.res2_2),
        valDense1: serializeLayer(weights.valDense1),
        valDense2: serializeLayer(weights.valDense2),
        polDense1: serializeLayer(weights.polDense1),
        polDense2: serializeLayer(weights.polDense2)
    };
    return JSON.stringify(obj, null, 2);
}

/**
 * 从 JSON 加载权重
 */
export function loadSpatialResNetFromJson(jsonStr: string): SpatialResNetWeights {
    const raw = JSON.parse(jsonStr);
    if (raw.version !== 'spatial-resnet-v1') {
        throw new Error(`Incompatible spatial model version: ${raw.version}`);
    }

    const deserializeConv = (l: any): ConvLayerWeights => ({
        inChannels: l.inChannels,
        outChannels: l.outChannels,
        kernelSize: 3,
        padding: 1,
        weights: new Float32Array(l.weights),
        biases: new Float32Array(l.biases)
    });

    const deserializeDense = (l: any): DenseLayerWeights => ({
        inDim: l.inDim,
        outDim: l.outDim,
        weights: new Float32Array(l.weights),
        biases: new Float32Array(l.biases)
    });

    return {
        version: 'spatial-resnet-v1',
        architectureId: 'spatial_resnet_32ch_2res',
        stem: deserializeConv(raw.stem),
        res1_1: deserializeConv(raw.res1_1),
        res1_2: deserializeConv(raw.res1_2),
        res2_1: deserializeConv(raw.res2_1),
        res2_2: deserializeConv(raw.res2_2),
        valDense1: deserializeDense(raw.valDense1),
        valDense2: deserializeDense(raw.valDense2),
        polDense1: deserializeDense(raw.polDense1),
        polDense2: deserializeDense(raw.polDense2)
    };
}
