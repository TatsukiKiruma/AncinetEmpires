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
    GLOBAL_FEATURE_DIM_V1,
    GLOBAL_FEATURE_DIM_V2,
    ACTION_SEMANTIC_DIM,
    ACTION_SEMANTIC_DIM_V1,
    ACTION_SEMANTIC_DIM_V2,
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
    version: 'spatial-resnet-v1' | 'spatial-resnet-v2';
    architectureId: 'spatial_resnet_32ch_2res' | 'spatial_resnet_32ch_4res';
    numBlocks?: number;
    stem: ConvLayerWeights;
    res1_1: ConvLayerWeights;
    res1_2: ConvLayerWeights;
    res2_1: ConvLayerWeights;
    res2_2: ConvLayerWeights;
    res3_1?: ConvLayerWeights;
    res3_2?: ConvLayerWeights;
    res4_1?: ConvLayerWeights;
    res4_2?: ConvLayerWeights;
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
export function createInitializedSpatialResNet(
    seed: number = 42,
    version: 'spatial-resnet-v1' | 'spatial-resnet-v2' = 'spatial-resnet-v1'
): SpatialResNetWeights {
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

    if (version === 'spatial-resnet-v2') {
        return {
            version: 'spatial-resnet-v2',
            architectureId: 'spatial_resnet_32ch_2res',
            stem: initConv(SPATIAL_TENSOR_CHANNELS, 32),
            res1_1: initConv(32, 32),
            res1_2: initConv(32, 32),
            res2_1: initConv(32, 32),
            res2_2: initConv(32, 32),
            valDense1: initDense(32 + GLOBAL_FEATURE_DIM_V2, 32),
            valDense2: initDense(32, 1),
            polDense1: initDense(32 * 3 + ACTION_SEMANTIC_DIM_V2 + GLOBAL_FEATURE_DIM_V2, 48),
            polDense2: initDense(48, 1)
        };
    }

    return {
        version: 'spatial-resnet-v1',
        architectureId: 'spatial_resnet_32ch_2res',
        stem: initConv(SPATIAL_TENSOR_CHANNELS, 32),
        res1_1: initConv(32, 32),
        res1_2: initConv(32, 32),
        res2_1: initConv(32, 32),
        res2_2: initConv(32, 32),
        valDense1: initDense(32 + GLOBAL_FEATURE_DIM_V1, 32),
        valDense2: initDense(32, 1),
        polDense1: initDense(32 * 3 + ACTION_SEMANTIC_DIM_V1, 48),
        polDense2: initDense(48, 1)
    };
}

/**
 * 完整空间残差网络推理管线
 */
export class SpatialResNetPredictor {
    private weights: SpatialResNetWeights;
    public readonly isV2: boolean;

    // 预分配复用张量缓冲区，彻底杜绝每次推理的 GC 内存分配
    private bufStem: Float32Array;
    private bufRes1_1: Float32Array;
    private bufRes1_2: Float32Array;
    private bufRes2_1: Float32Array;
    private bufZ: Float32Array;
    private numBlocks: number;
    private bufRes2_2: Float32Array;
    private bufRes3_1?: Float32Array;
    private bufRes3_2?: Float32Array;
    private bufRes4_1?: Float32Array;
    private bufGap: Float32Array;
    private bufValIn: Float32Array;
    private bufValH: Float32Array;
    private bufValOut: Float32Array;
    private bufPolIn: Float32Array;
    private bufPolH: Float32Array;
    private bufPolOut: Float32Array;

    constructor(weights: SpatialResNetWeights) {
        this.weights = weights;
        this.isV2 = weights.version === 'spatial-resnet-v2' || weights.polDense1.inDim > 120;
        this.numBlocks = weights.numBlocks ?? (weights.res3_1 ? 4 : 2);
        const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
        this.bufStem = new Float32Array(32 * HW);
        this.bufRes1_1 = new Float32Array(32 * HW);
        this.bufRes1_2 = new Float32Array(32 * HW);
        this.bufRes2_1 = new Float32Array(32 * HW);
        this.bufRes2_2 = new Float32Array(32 * HW);
        if (this.numBlocks >= 4) {
            this.bufRes3_1 = new Float32Array(32 * HW);
            this.bufRes3_2 = new Float32Array(32 * HW);
            this.bufRes4_1 = new Float32Array(32 * HW);
        }
        this.bufZ = new Float32Array(32 * HW);
        this.bufGap = new Float32Array(32);
        this.bufValIn = new Float32Array(this.weights.valDense1.inDim);
        this.bufValH = new Float32Array(32);
        this.bufValOut = new Float32Array(1);
        this.bufPolIn = new Float32Array(this.weights.polDense1.inDim);
        this.bufPolH = new Float32Array(48);
        this.bufPolOut = new Float32Array(1);
    }

    public predict(
        encodedState: SpatialEncodedState,
        candidateActions: SpatialActionFeatures[]
    ): SpatialInferenceResult {
        if (!encodedState || typeof encodedState !== 'object') {
            throw new Error('SpatialResNetPredictor.predict: encodedState must be an object with spatialTensor and globalFeatures');
        }
        if (!encodedState.spatialTensor || !(encodedState.spatialTensor instanceof Float32Array || Array.isArray(encodedState.spatialTensor))) {
            throw new Error('SpatialResNetPredictor.predict: encodedState.spatialTensor is required and must be Float32Array or array');
        }
        if (!encodedState.globalFeatures || !(encodedState.globalFeatures instanceof Float32Array || Array.isArray(encodedState.globalFeatures))) {
            throw new Error('SpatialResNetPredictor.predict: encodedState.globalFeatures is required and must be Float32Array or array');
        }
        if (!Array.isArray(candidateActions)) {
            throw new Error('SpatialResNetPredictor.predict: candidateActions must be an array');
        }

        const expectedSpatialLen = SPATIAL_TENSOR_CHANNELS * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
        if (encodedState.spatialTensor.length !== expectedSpatialLen) {
            throw new Error(`SpatialResNetPredictor.predict: invalid spatialTensor length ${encodedState.spatialTensor.length}, expected ${expectedSpatialLen}`);
        }
        const minGlobalLen = this.isV2 ? GLOBAL_FEATURE_DIM_V2 : GLOBAL_FEATURE_DIM_V1;
        if (encodedState.globalFeatures.length < minGlobalLen) {
            throw new Error(`SpatialResNetPredictor.predict: invalid globalFeatures length ${encodedState.globalFeatures.length}, expected at least ${minGlobalLen}`);
        }

        const spatialTensor = encodedState.spatialTensor instanceof Float32Array
            ? encodedState.spatialTensor
            : new Float32Array(encodedState.spatialTensor);
        const globalFeatures = encodedState.globalFeatures instanceof Float32Array
            ? encodedState.globalFeatures
            : new Float32Array(encodedState.globalFeatures);

        for (let i = 0; i < spatialTensor.length; i++) {
            if (!Number.isFinite(spatialTensor[i])) {
                throw new Error(`SpatialResNetPredictor.predict: spatialTensor contains non-finite value at index ${i}: ${spatialTensor[i]}`);
            }
        }
        for (let i = 0; i < globalFeatures.length; i++) {
            if (!Number.isFinite(globalFeatures[i])) {
                throw new Error(`SpatialResNetPredictor.predict: globalFeatures contains non-finite value at index ${i}: ${globalFeatures[i]}`);
            }
        }

        const expectedSemLen = this.isV2 ? ACTION_SEMANTIC_DIM_V2 : ACTION_SEMANTIC_DIM_V1;
        for (let c = 0; c < candidateActions.length; c++) {
            const act = candidateActions[c];
            if (!act || typeof act !== 'object') {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} must be an object`);
            }
            if (!act.semantics) {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} missing semantics`);
            }
            if (act.semantics.length < expectedSemLen) {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} semantics length ${act.semantics.length} < expected ${expectedSemLen}`);
            }
            for (let s = 0; s < expectedSemLen; s++) {
                if (!Number.isFinite(act.semantics[s])) {
                    throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} semantics contains non-finite value at index ${s}: ${act.semantics[s]}`);
                }
            }
        }

        const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;

        // 1. Stem: Conv(24 -> 32) + ReLU
        conv2dForward(this.bufStem, spatialTensor, this.weights.stem, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);

        // 2. ResBlock 1: Conv + ReLU + Conv + 残差相加 + ReLU
        conv2dForward(this.bufRes1_1, this.bufStem, this.weights.res1_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
        conv2dForward(this.bufRes1_2, this.bufRes1_1, this.weights.res1_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
        // 残差叠加到 bufRes1_2
        for (let i = 0; i < 32 * HW; i += 1) {
            const sum = this.bufRes1_2[i] + this.bufStem[i];
            this.bufRes1_2[i] = sum > 0 ? sum : 0;
        }

        // 3. ResBlock 2..N:
        if (this.numBlocks >= 4 && this.weights.res3_1 && this.weights.res3_2 && this.weights.res4_1 && this.weights.res4_2) {
            // Block 2: into bufRes2_2
            conv2dForward(this.bufRes2_1, this.bufRes1_2, this.weights.res2_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
            conv2dForward(this.bufRes2_2, this.bufRes2_1, this.weights.res2_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
            for (let i = 0; i < 32 * HW; i += 1) {
                const sum = this.bufRes2_2[i] + this.bufRes1_2[i];
                this.bufRes2_2[i] = sum > 0 ? sum : 0;
            }

            // Block 3: into bufRes3_2
            conv2dForward(this.bufRes3_1!, this.bufRes2_2, this.weights.res3_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
            conv2dForward(this.bufRes3_2!, this.bufRes3_1!, this.weights.res3_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
            for (let i = 0; i < 32 * HW; i += 1) {
                const sum = this.bufRes3_2![i] + this.bufRes2_2[i];
                this.bufRes3_2![i] = sum > 0 ? sum : 0;
            }

            // Block 4: into bufZ
            conv2dForward(this.bufRes4_1!, this.bufRes3_2!, this.weights.res4_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
            conv2dForward(this.bufZ, this.bufRes4_1!, this.weights.res4_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
            for (let i = 0; i < 32 * HW; i += 1) {
                const sum = this.bufZ[i] + this.bufRes3_2![i];
                this.bufZ[i] = sum > 0 ? sum : 0;
            }
        } else {
            // 2-block: Block 2 directly into bufZ
            conv2dForward(this.bufRes2_1, this.bufRes1_2, this.weights.res2_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
            conv2dForward(this.bufZ, this.bufRes2_1, this.weights.res2_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
            for (let i = 0; i < 32 * HW; i += 1) {
                const sum = this.bufZ[i] + this.bufRes1_2[i];
                this.bufZ[i] = sum > 0 ? sum : 0;
            }
        }

        // 4. Value Head 前向
        globalAvgPool2D(this.bufGap, this.bufZ, 32, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W);
        this.bufValIn.set(this.bufGap, 0);
        const valGlobDim = this.weights.valDense1.inDim - 32;
        this.bufValIn.set(globalFeatures.subarray(0, valGlobDim), 32);
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

            const semArr = act.semantics instanceof Float32Array
                ? act.semantics
                : new Float32Array(act.semantics);

            if (this.isV2) {
                const semLen = Math.min(semArr.length, ACTION_SEMANTIC_DIM_V2);
                this.bufPolIn.set(semArr.subarray(0, semLen), 96);
                const globLen = Math.min(globalFeatures.length, GLOBAL_FEATURE_DIM_V2);
                this.bufPolIn.set(globalFeatures.subarray(0, globLen), 96 + ACTION_SEMANTIC_DIM_V2);
            } else {
                const semLen = Math.min(semArr.length, ACTION_SEMANTIC_DIM_V1);
                this.bufPolIn.set(semArr.subarray(0, semLen), 96);
            }

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

        for (let i = 0; i < logits.length; i++) {
            if (!Number.isFinite(logits[i])) {
                throw new Error(`SpatialResNetPredictor.predict: output logit at index ${i} is non-finite: ${logits[i]}`);
            }
        }
        if (!Number.isFinite(value)) {
            throw new Error(`SpatialResNetPredictor.predict: output value is non-finite: ${value}`);
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

function assertWeightsFinite(arr: Float32Array, name: string): void {
    for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) {
            throw new Error(`SpatialResNetWeights: ${name} contains non-finite value at index ${i}: ${arr[i]}`);
        }
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

    const obj: any = {
        version: weights.version,
        numBlocks: weights.numBlocks ?? (weights.res3_1 ? 4 : 2),
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
    if (weights.res3_1 && weights.res3_2 && weights.res4_1 && weights.res4_2) {
        obj.res3_1 = serializeLayer(weights.res3_1);
        obj.res3_2 = serializeLayer(weights.res3_2);
        obj.res4_1 = serializeLayer(weights.res4_1);
        obj.res4_2 = serializeLayer(weights.res4_2);
    }
    return JSON.stringify(obj, null, 2);
}

/**
 * 从 JSON 加载权重
 */
export function loadSpatialResNetFromJson(jsonStr: string): SpatialResNetWeights {
    const raw = JSON.parse(jsonStr);
    if (raw.version !== 'spatial-resnet-v1' && raw.version !== 'spatial-resnet-v2') {
        throw new Error(`Incompatible spatial model version: ${raw.version}`);
    }

    const deserializeConv = (l: any, name: string): ConvLayerWeights => {
        const weights = new Float32Array(l.weights);
        const biases = new Float32Array(l.biases);
        assertWeightsFinite(weights, `${name}.weights`);
        assertWeightsFinite(biases, `${name}.biases`);
        return {
            inChannels: l.inChannels,
            outChannels: l.outChannels,
            kernelSize: 3,
            padding: 1,
            weights,
            biases
        };
    };

    const deserializeDense = (l: any, name: string): DenseLayerWeights => {
        const weights = new Float32Array(l.weights);
        const biases = new Float32Array(l.biases);
        assertWeightsFinite(weights, `${name}.weights`);
        assertWeightsFinite(biases, `${name}.biases`);
        return {
            inDim: l.inDim,
            outDim: l.outDim,
            weights,
            biases
        };
    };

    const numBlocks = raw.numBlocks ?? (raw.res3_1 ? 4 : 2);
    const architectureId = raw.architectureId ?? (numBlocks === 4 ? 'spatial_resnet_32ch_4res' : 'spatial_resnet_32ch_2res');

    const result: SpatialResNetWeights = {
        version: raw.version,
        numBlocks,
        architectureId,
        stem: deserializeConv(raw.stem, 'stem'),
        res1_1: deserializeConv(raw.res1_1, 'res1_1'),
        res1_2: deserializeConv(raw.res1_2, 'res1_2'),
        res2_1: deserializeConv(raw.res2_1, 'res2_1'),
        res2_2: deserializeConv(raw.res2_2, 'res2_2'),
        valDense1: deserializeDense(raw.valDense1, 'valDense1'),
        valDense2: deserializeDense(raw.valDense2, 'valDense2'),
        polDense1: deserializeDense(raw.polDense1, 'polDense1'),
        polDense2: deserializeDense(raw.polDense2, 'polDense2')
    };

    if (numBlocks >= 4 && raw.res3_1 && raw.res3_2 && raw.res4_1 && raw.res4_2) {
        result.res3_1 = deserializeConv(raw.res3_1, 'res3_1');
        result.res3_2 = deserializeConv(raw.res3_2, 'res3_2');
        result.res4_1 = deserializeConv(raw.res4_1, 'res4_1');
        result.res4_2 = deserializeConv(raw.res4_2, 'res4_2');
    }

    return result;
}
