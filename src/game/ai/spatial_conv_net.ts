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
    ENCODER_SCHEMA_ID_V1,
    ENCODER_SCHEMA_ID_V13,
    ENCODER_SCHEMA_ID_V14,
    ENCODER_SCHEMA_ID_V15,
    ENCODER_SCHEMA_CHANNELS,
    ENCODER_SCHEMA_SEMANTIC_DIM,
    SPATIAL_TENSOR_CHANNELS_LEGACY,
    SUPPORTED_ENCODER_SCHEMA_IDS,
    actionSemanticsVariantForSchema,
    type ActionSemanticsVariant,
    type EncoderSchemaId,
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
    architectureId: 'spatial_resnet_32ch_2res' | 'spatial_resnet_32ch_4res' | 'spatial_resnet_32ch_2res_gappool' | 'spatial_resnet_32ch_4res_gappool';
    numBlocks?: number;
    /**
     * V14/T14-03：训练该权重时使用的编码器输入语义版本。
     * 缺省（历史 V12/V13 检查点）视为 v13 语义，按旧路径解释；
     * 新检查点必须显式声明，且必须与推理所用编码器一致，否则拒绝加载。
     */
    encoderSchemaId?: string;
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
    /** Arm 2: append GAP(Z) to each candidate's policy feature vector. */
    globalPolicyPool?: boolean;
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
 *
 * V19/T19-00：这里是「随机网络」的唯一来源，包括多个测试夹具与基准脚本。
 * 它过去**不声明 encoderSchemaId**，而 SpatialResNetPredictor 自 V15 起拒绝加载
 * 未声明输入语义身份的权重，于是这些夹具全部在构造推理器时抛错（V18 复核记录的
 * `tools/skirmish_spatial_conv_net.test.ts` 两个夹具即属此类，`v8_p0_defect_exposure`
 * 的若干用例同因失败）。正确做法不是放宽校验，而是让本函数产出**与声明 schema 形状自洽**
 * 的权重：空间通道数、全局维、动作语义维全部由 schema 推导。
 *
 * `version` 参数保持原义（历史 v1 头/ v2 头），默认 schema 为当前正式 schema（v15）。
 * 需要历史语义的夹具请显式传 `encoderSchemaId`。
 */
export function createInitializedSpatialResNet(
    seed: number = 42,
    version: 'spatial-resnet-v1' | 'spatial-resnet-v2' = 'spatial-resnet-v1',
    encoderSchemaId: EncoderSchemaId = ENCODER_SCHEMA_ID_V15
): SpatialResNetWeights {
    // 由 schema 推导形状：这三者构成「输入语义身份」，不能与 schema 声明不一致。
    const schemaSpatialChannels = ENCODER_SCHEMA_CHANNELS[encoderSchemaId];
    const schemaSemanticDim = ENCODER_SCHEMA_SEMANTIC_DIM[encoderSchemaId];
    const schemaGlobalDim = encoderSchemaId === ENCODER_SCHEMA_ID_V1
        ? GLOBAL_FEATURE_DIM_V1
        : GLOBAL_FEATURE_DIM_V2;

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
            encoderSchemaId,
            stem: initConv(schemaSpatialChannels, 32),
            res1_1: initConv(32, 32),
            res1_2: initConv(32, 32),
            res2_1: initConv(32, 32),
            res2_2: initConv(32, 32),
            valDense1: initDense(32 + schemaGlobalDim, 32),
            valDense2: initDense(32, 1),
            polDense1: initDense(32 * 3 + schemaSemanticDim + schemaGlobalDim, 48),
            polDense2: initDense(48, 1)
        };
    }

    return {
        version: 'spatial-resnet-v1',
        architectureId: 'spatial_resnet_32ch_2res',
        encoderSchemaId,
        stem: initConv(schemaSpatialChannels, 32),
        res1_1: initConv(32, 32),
        res1_2: initConv(32, 32),
        res2_1: initConv(32, 32),
        res2_2: initConv(32, 32),
        valDense1: initDense(32 + schemaGlobalDim, 32),
        valDense2: initDense(32, 1),
        polDense1: initDense(32 * 3 + schemaSemanticDim + schemaGlobalDim, 48),
        polDense2: initDense(48, 1)
    };
}

/**
 * 完整空间残差网络推理管线
 */
export class SpatialResNetPredictor {
    private weights: SpatialResNetWeights;
    public readonly isV2: boolean;
    /**
     * V14/T14-03：该权重期望的空间输入通道数（来自 stem.inChannels）。
     * 编码器必须按这个数字产出张量；不一致时 predict 会明确抛错，
     * 而不是把 26 通道张量喂给 24 通道权重。
     */
    public readonly spatialChannels: number;
    /**
     * V14/T14-03：该权重期望的动作语义维度（32 = 历史 v2，48 = v14 含兵种 one-hot）。
     * 由 polDense1 的输入维度反推，避免把 48 维语义静默截成 32 维。
     */
    public readonly semanticDim: number;
    /**
     * V15/T15-02：该权重声明的输入语义身份与对应的攻击语义变体。
     *
     * shared policy 必须按这两个字段分派状态/候选编码，而不能只看通道数或语义维度：
     * V14 与 V15 的形状完全相同（26/53），只有语义不同。历史权重（无 encoderSchemaId）
     * 在这里得到 v13 语义，因此仍按旧口径解释，不会被静默升级到新语义。
     */
    public readonly encoderSchemaId: EncoderSchemaId;
    public readonly semanticsVariant: ActionSemanticsVariant;

    // 预分配复用张量缓冲区，彻底杜绝每次推理的 GC 内存分配
    private bufStem: Float32Array;
    private bufRes1_1: Float32Array;
    private bufRes1_2: Float32Array;
    private bufRes2_1: Float32Array;
    private bufZ: Float32Array;
    private numBlocks: number;
    public readonly globalPolicyPool: boolean;
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
        this.globalPolicyPool = weights.globalPolicyPool === true;
        this.spatialChannels = weights.stem.inChannels;
        // V14/T14-03：语义维度由 polDense1 的输入维度反推
        // （32*3 坐标池化 + 语义 + 全局 + 可选 GAP），否则 53 维语义会被静默截成 32 维，
        // 与 Python 训练侧的特征构造不一致。
        {
            const trunkContribution = this.globalPolicyPool ? 96 + 32 : 96;
            const globalContribution = this.isV2 ? GLOBAL_FEATURE_DIM_V2 : GLOBAL_FEATURE_DIM_V1;
            const derived = weights.polDense1.inDim - trunkContribution - globalContribution;
            this.semanticDim = this.isV2
                ? (derived > 0 ? derived : ACTION_SEMANTIC_DIM_V2)
                : ACTION_SEMANTIC_DIM_V1;
        }
        if (this.globalPolicyPool && !this.isV2) {
            throw new Error('globalPolicyPool is only supported for spatial-resnet-v2 checkpoints');
        }
        // V15/T15-02：显式 schema 分派。未知 schema 在这里就失败，不做维度猜测。
        // 手工构造的权重若没有声明 schema，按 v13 历史语义处理（与 loadSpatialResNetFromJson 一致）。
        if (typeof weights.encoderSchemaId !== 'string' || weights.encoderSchemaId.length === 0) {
            throw new Error(
                'V15/T15-02 拒绝加载未声明 encoderSchemaId 的权重：形状相同的 v14/v15 无法靠维度区分，'
                + '必须显式声明输入语义身份（历史检查点请通过 loadSpatialResNetFromJson 加载，'
                + '它会为无声明权重补上 v13 身份）。'
            );
        }
        this.encoderSchemaId = weights.encoderSchemaId as EncoderSchemaId;
        this.semanticsVariant = actionSemanticsVariantForSchema(this.encoderSchemaId);
        // 形状与 schema 契约必须一致：24 通道 schema 不得被 26 通道编码器喂入，反之亦然。
        const schemaChannels = (ENCODER_SCHEMA_CHANNELS as Record<string, number>)[this.encoderSchemaId];
        if (typeof schemaChannels === 'number' && schemaChannels !== this.spatialChannels) {
            throw new Error(
                `V15/T15-02 schema/形状不一致：schema ${this.encoderSchemaId} 声明 `
                + `${schemaChannels} 个空间通道，但权重 stem 期望 ${this.spatialChannels}。拒绝加载。`
            );
        }
        const schemaSemanticDim = (ENCODER_SCHEMA_SEMANTIC_DIM as Record<string, number>)[this.encoderSchemaId];
        if (typeof schemaSemanticDim === 'number' && schemaSemanticDim !== this.semanticDim) {
            throw new Error(
                `V15/T15-02 schema/形状不一致：schema ${this.encoderSchemaId} 声明 `
                + `${schemaSemanticDim} 维动作语义，但权重 polDense1 反推为 ${this.semanticDim}。拒绝加载。`
            );
        }
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

        const expectedSpatialLen = this.spatialChannels * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
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

        // 按检查点实际 schema 校验完整语义，防止 56 维尾部 NaN 被旧的“只看前32维”漏过。
        const expectedSemLen = this.semanticDim;
        for (let c = 0; c < candidateActions.length; c++) {
            const act = candidateActions[c];
            if (!act || typeof act !== 'object') {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} must be an object`);
            }
            if (!act.semantics) {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} missing semantics`);
            }
            if (act.semantics.length !== expectedSemLen) {
                throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} semantics length ${act.semantics.length} != expected ${expectedSemLen}`);
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

        // Arm 2: board-wide GAP is state-level, so write it once after the
        // candidate-local 96/action/global slots for every candidate.
        let policyGapOffset = -1;
        if (this.globalPolicyPool) {
            policyGapOffset = this.isV2
                ? 96 + this.semanticDim + GLOBAL_FEATURE_DIM_V2
                : 96 + ACTION_SEMANTIC_DIM_V1;
            for (let i = 0; i < 32; i += 1) {
                this.bufPolIn[policyGapOffset + i] = this.bufGap[i];
            }
        }

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
                const semLen = Math.min(semArr.length, this.semanticDim);
                this.bufPolIn.set(semArr.subarray(0, semLen), 96);
                const globLen = Math.min(globalFeatures.length, GLOBAL_FEATURE_DIM_V2);
                this.bufPolIn.set(globalFeatures.subarray(0, globLen), 96 + this.semanticDim);
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
        polDense2: serializeLayer(weights.polDense2),
        globalPolicyPool: weights.globalPolicyPool === true,
        // V14/T14-03：写出的 schema 必须与权重形状一致，否则加载时会被自己的校验拒绝。
        // 显式声明优先；未声明时按 stem 输入通道数推断（24 ⇒ v13，26 ⇒ v14）。
        // V15/T15-02：未声明时**不得**推断成 v15——v14 与 v15 形状相同，
        // 只能由调用方/训练器显式声明，否则会把旧语义权重标成新 schema。
        encoderSchemaId: weights.encoderSchemaId
            ?? (weights.stem.inChannels === SPATIAL_TENSOR_CHANNELS_LEGACY
                ? ENCODER_SCHEMA_ID_V13
                : ENCODER_SCHEMA_ID_V14),
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
 * 从 JSON 加载权重。
 *
 * V14/T14-03：`encoderSchemaId` 是模型所解释的输入语义身份，不是可选注释。
 * - 新检查点自带该字段时，必须与调用方声明的 schema 一致，否则抛错（拒绝静默错配）。
 * - 历史检查点没有该字段时按 v13 语义处理；调用方只有声明
 *   ENCODER_SCHEMA_ID_V13 才能加载，声明 v14 会被拒绝，避免用旧权重解释新语义。
 */
export function loadSpatialResNetFromJson(jsonStr: string, options?: { expectedEncoderSchemaId?: string | null }): SpatialResNetWeights {
    const raw = JSON.parse(jsonStr);
    if (raw.version !== 'spatial-resnet-v1' && raw.version !== 'spatial-resnet-v2') {
        throw new Error(`Incompatible spatial model version: ${raw.version}`);
    }

    const declaredSchema: string | null = typeof raw.encoderSchemaId === 'string' ? raw.encoderSchemaId : null;
    // 历史权重没有 encoderSchemaId：v1 按 v1 语义，其余（含 v2）按 v13 语义。
    // v1 与 v13 的空间通道数相同，但全局维与动作语义维不同，因此身份保持可区分。
    const inferredSchema = raw.version === 'spatial-resnet-v1' ? ENCODER_SCHEMA_ID_V1 : ENCODER_SCHEMA_ID_V13;
    const effectiveSchema = declaredSchema ?? inferredSchema;
    const expected = options?.expectedEncoderSchemaId ?? null;
    if (expected !== null) {
        // 允许 v13 运行时读取「未声明 schema 的 v1 权重」（两者同为 24 通道空间编码）；
        // 反向不允许：v1/v13 权重都不得被当作 v14（26 通道）解释。
        const legacyFamilyAccepted = declaredSchema === null
            && expected === ENCODER_SCHEMA_ID_V13
            && inferredSchema === ENCODER_SCHEMA_ID_V1;
        if (effectiveSchema !== expected && !legacyFamilyAccepted) {
            throw new Error(
                `Spatial model encoder schema mismatch: checkpoint declares ${effectiveSchema}, `
                + `runtime expects ${expected}. 旧权重不得静默加载到新语义输入上；`
                + '请显式声明 expectedEncoderSchemaId 或重新导出匹配的检查点。'
            );
        }
    }
    if (declaredSchema !== null && !SUPPORTED_ENCODER_SCHEMA_IDS.includes(declaredSchema as any)) {
        throw new Error(`Unknown spatial encoder schema: ${declaredSchema}`);
    }
    // V14/T14-03：通道数是 schema 的一部分。权重携带的输入通道数必须与 schema 声明的
    // 通道数一致，否则 24 通道旧权重会被 26 通道编码器的输入静默喂错。
    const declaredChannels = raw.stem?.inChannels;
    const schemaChannels = (ENCODER_SCHEMA_CHANNELS as Record<string, number>)[effectiveSchema];
    if (typeof declaredChannels === 'number' && typeof schemaChannels === 'number'
        && declaredChannels !== schemaChannels) {
        throw new Error(
            `Spatial model channel count mismatch: checkpoint stem expects ${declaredChannels} channels, `
            + `but encoder schema ${effectiveSchema} produces ${schemaChannels}. `
            + '拒绝加载：请使用与编码器 schema 匹配的检查点（v13 为 24 通道，v14 为 26 通道）。'
        );
    }

    const deserializeConv = (l: any, name: string): ConvLayerWeights => {
        const weights = new Float32Array(l.weights);
        const biases = new Float32Array(l.biases);
        // V14/T14-03：形状自检。半截或错位的权重过去会被静默接受，
        // 直到推理时产生无意义输出；3x3 卷积核因此权重数为 out*in*9。
        const expectedWeights = l.outChannels * l.inChannels * 9;
        if (weights.length !== expectedWeights) {
            throw new Error(
                `Spatial model layer ${name}: weight length ${weights.length} does not match `
                + `outChannels*inChannels*9 = ${expectedWeights}. 检查点已损坏或形状声明错误。`
            );
        }
        if (biases.length !== l.outChannels) {
            throw new Error(
                `Spatial model layer ${name}: bias length ${biases.length} does not match outChannels ${l.outChannels}.`
            );
        }
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
        if (weights.length !== l.inDim * l.outDim) {
            throw new Error(
                `Spatial model layer ${name}: weight length ${weights.length} does not match `
                + `inDim*outDim = ${l.inDim * l.outDim}.`
            );
        }
        if (biases.length !== l.outDim) {
            throw new Error(
                `Spatial model layer ${name}: bias length ${biases.length} does not match outDim ${l.outDim}.`
            );
        }
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
        globalPolicyPool: raw.globalPolicyPool === true,
        stem: deserializeConv(raw.stem, 'stem'),
        res1_1: deserializeConv(raw.res1_1, 'res1_1'),
        res1_2: deserializeConv(raw.res1_2, 'res1_2'),
        res2_1: deserializeConv(raw.res2_1, 'res2_1'),
        res2_2: deserializeConv(raw.res2_2, 'res2_2'),
        valDense1: deserializeDense(raw.valDense1, 'valDense1'),
        valDense2: deserializeDense(raw.valDense2, 'valDense2'),
        polDense1: deserializeDense(raw.polDense1, 'polDense1'),
        polDense2: deserializeDense(raw.polDense2, 'polDense2'),
        encoderSchemaId: effectiveSchema,
    };

    if (numBlocks >= 4 && raw.res3_1 && raw.res3_2 && raw.res4_1 && raw.res4_2) {
        result.res3_1 = deserializeConv(raw.res3_1, 'res3_1');
        result.res3_2 = deserializeConv(raw.res3_2, 'res3_2');
        result.res4_1 = deserializeConv(raw.res4_1, 'res4_1');
        result.res4_2 = deserializeConv(raw.res4_2, 'res4_2');
    }

    return result;
}
