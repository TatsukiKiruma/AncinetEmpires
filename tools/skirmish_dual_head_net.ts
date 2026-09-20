/**
 * T10/N04 紧凑策略/价值双头网络（纯 TypeScript，CPU 可跑，无外部依赖）。
 *
 * 结构与可配置深度（任务书 N04 & N04-A）：
 *   NET_A: trunkHidden [256, 128], policyHidden [64, 64], valueHidden [64]
 *   NET_B: trunkHidden [256, 256, 128], policyHidden [64, 64], valueHidden [64]
 *
 * 训练为全批前向 + 手写反向 + 动量 SGD。
 * 价值损失【只】在带 valueTarget 的可靠样本上计算，屏蔽样本不产生任何价值梯度。
 * 推理路径（predictDecision）不分配训练用梯度数组 dW/db，共享 trunk 单次前向。
 * 严格加载器（loadDualHeadModelFromJson）强制检验全量张量形状与有限性，绝不静默随机初始化。
 */

export interface DualHeadSpec {
    stateDim: number;
    actionDim: number;
    /** v1 兼容字段 */
    hidden?: number;
    /** v1 兼容字段 */
    embed?: number;
    /** v2: 可配置 trunk 隐藏层序列，例如 NET_A 为 [256, 128]，NET_B 为 [256, 256, 128] */
    trunkHidden?: number[];
    /** policy 隐藏层，支持单数字或数组，例如 [64, 64] */
    policyHidden?: number | number[];
    /** value 隐藏层，支持单数字或数组，例如 [64] */
    valueHidden?: number | number[];
    activation?: 'relu';
    seed: number;
    isStandardizationFolded?: boolean;
    architectureId?: string;
    stateEncoderVersion?: string;
    actionEncoderVersion?: string;
}

export function resolveTrunkHidden(spec: DualHeadSpec): number[] {
    if (spec.trunkHidden && spec.trunkHidden.length > 0) {
        for (const dim of spec.trunkHidden) {
            if (!Number.isInteger(dim) || dim <= 0) {
                throw new Error(`Invalid trunkHidden dimension: ${dim}`);
            }
        }
        return [...spec.trunkHidden];
    }
    const h = spec.hidden ?? 256;
    const e = spec.embed ?? 128;
    if (!Number.isInteger(h) || h <= 0 || !Number.isInteger(e) || e <= 0) {
        throw new Error(`Invalid hidden/embed dimensions: hidden=${h}, embed=${e}`);
    }
    return [h, e];
}

export function resolvePolicyHidden(spec: DualHeadSpec): number[] {
    if (Array.isArray(spec.policyHidden)) {
        for (const dim of spec.policyHidden) {
            if (!Number.isInteger(dim) || dim <= 0) {
                throw new Error(`Invalid policyHidden dimension: ${dim}`);
            }
        }
        return [...spec.policyHidden];
    }
    const p = spec.policyHidden ?? 64;
    if (!Number.isInteger(p) || p <= 0) throw new Error(`Invalid policyHidden dimension: ${p}`);
    return [p, p];
}

export function resolveValueHidden(spec: DualHeadSpec): number[] {
    if (Array.isArray(spec.valueHidden)) {
        for (const dim of spec.valueHidden) {
            if (!Number.isInteger(dim) || dim <= 0) {
                throw new Error(`Invalid valueHidden dimension: ${dim}`);
            }
        }
        return [...spec.valueHidden];
    }
    const v = spec.valueHidden ?? 64;
    if (!Number.isInteger(v) || v <= 0) throw new Error(`Invalid valueHidden dimension: ${v}`);
    return [v];
}

export function getParameterCount(spec: DualHeadSpec): number {
    const trunk = resolveTrunkHidden(spec);
    const policy = resolvePolicyHidden(spec);
    const value = resolveValueHidden(spec);

    let count = 0;
    let prev = spec.stateDim;
    for (const h of trunk) {
        count += prev * h + h;
        prev = h;
    }
    const embedDim = trunk[trunk.length - 1];

    prev = embedDim + spec.actionDim;
    for (const p of policy) {
        count += prev * p + p;
        prev = p;
    }
    count += prev * 1 + 1;

    prev = embedDim;
    for (const v of value) {
        count += prev * v + v;
        prev = v;
    }
    count += prev * 1 + 1;

    return count;
}

export interface DualHeadSample {
    state: number[];
    candidates: number[][];
    labelIndex: number;
    /** null = 无可靠价值目标（截断/未核验），屏蔽 value loss */
    valueTarget: number | null;
}

type Act = 'relu' | 'tanh' | 'linear';

export interface DenseLayer {
    in: number;
    out: number;
    W: number[];
    b: number[];
}

interface DenseWithGrad extends DenseLayer {
    dW: number[];
    db: number[];
}

function activate(z: number[], act: Act): number[] {
    if (act === 'relu') return z.map(v => (v > 0 ? v : 0));
    if (act === 'tanh') return z.map(Math.tanh);
    return z.slice();
}

export interface DualHeadNet {
    spec: DualHeadSpec;
    trunkLayers: DenseLayer[];
    policyLayers: DenseLayer[];
    valueLayers: DenseLayer[];
    // legacy v1 backward compatibility aliases
    trunkW1: number[]; trunkB1: number[];
    trunkW2: number[]; trunkB2: number[];
    policyW1: number[]; policyB1: number[];
    policyW2: number[]; policyB2: number[];
    policyW3: number[]; policyB3: number[];
    valueW1: number[]; valueB1: number[];
    valueW2: number[]; valueB2: number[];
    vel: Record<string, number[]>;
    isStandardizationFolded?: boolean;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function zeros(n: number): number[] { return new Array(n).fill(0); }

function initDense(inDim: number, outDim: number, rand: () => number): DenseLayer {
    const limit = Math.sqrt(6 / (inDim + outDim));
    const W = new Array(inDim * outDim);
    for (let i = 0; i < W.length; i += 1) W[i] = rand() * 2 * limit - limit;
    return { in: inDim, out: outDim, W, b: zeros(outDim) };
}

export function createDualHeadNet(spec: DualHeadSpec): DualHeadNet {
    const rand = mulberry32(spec.seed);
    const trunkDims = resolveTrunkHidden(spec);
    const policyDims = resolvePolicyHidden(spec);
    const valueDims = resolveValueHidden(spec);

    const trunkLayers: DenseLayer[] = [];
    let prev = spec.stateDim;
    for (const h of trunkDims) {
        trunkLayers.push(initDense(prev, h, rand));
        prev = h;
    }
    const embedDim = trunkDims[trunkDims.length - 1];

    const policyLayers: DenseLayer[] = [];
    prev = embedDim + spec.actionDim;
    for (const p of policyDims) {
        policyLayers.push(initDense(prev, p, rand));
        prev = p;
    }
    policyLayers.push(initDense(prev, 1, rand));

    const valueLayers: DenseLayer[] = [];
    prev = embedDim;
    for (const v of valueDims) {
        valueLayers.push(initDense(prev, v, rand));
        prev = v;
    }
    valueLayers.push(initDense(prev, 1, rand));

    const net: DualHeadNet = {
        spec,
        trunkLayers,
        policyLayers,
        valueLayers,
        trunkW1: trunkLayers[0]?.W ?? [], trunkB1: trunkLayers[0]?.b ?? [],
        trunkW2: trunkLayers[1]?.W ?? [], trunkB2: trunkLayers[1]?.b ?? [],
        policyW1: policyLayers[0]?.W ?? [], policyB1: policyLayers[0]?.b ?? [],
        policyW2: policyLayers[1]?.W ?? [], policyB2: policyLayers[1]?.b ?? [],
        policyW3: policyLayers[2]?.W ?? [], policyB3: policyLayers[2]?.b ?? [],
        valueW1: valueLayers[0]?.W ?? [], valueB1: valueLayers[0]?.b ?? [],
        valueW2: valueLayers[1]?.W ?? [], valueB2: valueLayers[1]?.b ?? [],
        vel: {},
        isStandardizationFolded: spec.isStandardizationFolded ?? false
    };
    return net;
}

function forward(d: DenseWithGrad, x: number[], act: Act): { y: number[]; z: number[] } {
    const z = new Array(d.out);
    for (let o = 0; o < d.out; o += 1) {
        let s = d.b[o];
        const base = o * d.in;
        for (let i = 0; i < d.in; i += 1) s += d.W[base + i] * x[i];
        z[o] = s;
    }
    return { y: activate(z, act), z };
}

function backward(d: DenseWithGrad, dY: number[], z: number[], x: number[], act: Act): number[] {
    const dPre = new Array(d.out);
    for (let o = 0; o < d.out; o += 1) {
        let g = dY[o];
        if (act === 'relu') g = z[o] > 0 ? g : 0;
        else if (act === 'tanh') { const a = Math.tanh(z[o]); g = g * (1 - a * a); }
        dPre[o] = g;
    }
    const dX = new Array(d.in).fill(0);
    for (let o = 0; o < d.out; o += 1) {
        const g = dPre[o];
        if (g === 0) continue;
        const base = o * d.in;
        for (let i = 0; i < d.in; i += 1) {
            d.dW[base + i] += g * x[i];
            dX[i] += g * d.W[base + i];
        }
        d.db[o] += g;
    }
    return dX;
}

function toDenseWithGrad(layers: DenseLayer[]): DenseWithGrad[] {
    return layers.map(l => ({
        in: l.in,
        out: l.out,
        W: l.W,
        b: l.b,
        dW: zeros(l.W.length),
        db: zeros(l.b.length)
    }));
}

export interface TrainOptions {
    learningRate: number;
    momentum: number;
    valueWeight: number;
    valueNormalization?: 'valid_targets' | 'batch_size';
}

export interface TrainReport {
    policyLoss: number;
    valueLoss: number;
    policyAccuracy: number;
    valueCount: number;
    totalSamples: number;
}

/** 全批前向+反向+动量 SGD。valueTarget=null 的样本不进入价值损失/梯度。 */
export function trainStep(net: DualHeadNet, batch: DualHeadSample[], opts: TrainOptions): TrainReport {
    const trunk = toDenseWithGrad(net.trunkLayers);
    const policy = toDenseWithGrad(net.policyLayers);
    const value = toDenseWithGrad(net.valueLayers);

    const N = batch.length;
    let policyLossSum = 0;
    let valueLossSum = 0;
    let correct = 0;
    let valueCount = 0;

    const embedDim = trunk[trunk.length - 1].out;

    for (const sample of batch) {
        // —— 前向 trunk ——
        let cur = sample.state;
        const trunkCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
        for (let l = 0; l < trunk.length; l += 1) {
            const res = forward(trunk[l], cur, 'relu');
            trunkCaches.push({ inp: cur, y: res.y, z: res.z });
            cur = res.y;
        }
        const e = cur;

        // —— value 前向 ——
        let vCur = e;
        const valueCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
        for (let l = 0; l < value.length; l += 1) {
            const act = (l === value.length - 1) ? 'tanh' : 'relu';
            const res = forward(value[l], vCur, act);
            valueCaches.push({ inp: vCur, y: res.y, z: res.z });
            vCur = res.y;
        }
        const predictedValue = vCur[0];

        // —— policy 前向（为每个候选缓存中间值）——
        const logits: number[] = [];
        const policyCachesPerCand: { inp: number[]; y: number[]; z: number[] }[][] = [];
        for (const action of sample.candidates) {
            const inp = e.concat(action);
            let pCur = inp;
            const candCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
            for (let l = 0; l < policy.length; l += 1) {
                const act = (l === policy.length - 1) ? 'linear' : 'relu';
                const res = forward(policy[l], pCur, act);
                candCaches.push({ inp: pCur, y: res.y, z: res.z });
                pCur = res.y;
            }
            logits.push(pCur[0]);
            policyCachesPerCand.push(candCaches);
        }

        // softmax + CE
        const maxLogit = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExp = exps.reduce((a, b) => a + b, 0);
        const probs = exps.map(v => v / sumExp);
        const label = sample.labelIndex;
        policyLossSum += -Math.log(Math.max(1e-12, probs[label]));
        if (argmax(logits) === label) correct += 1;

        // —— 反向 policy head（累积各候选梯度，同时向 dE 贡献梯度）——
        const dE = new Array(embedDim).fill(0);
        for (let c = 0; c < sample.candidates.length; c += 1) {
            const dLogit = probs[c] - (c === label ? 1 : 0);
            let dGrad = [dLogit];
            const candCaches = policyCachesPerCand[c];
            for (let l = policy.length - 1; l >= 0; l -= 1) {
                const act = (l === policy.length - 1) ? 'linear' : 'relu';
                dGrad = backward(policy[l], dGrad, candCaches[l].z, candCaches[l].inp, act);
            }
            for (let i = 0; i < embedDim; i += 1) dE[i] += dGrad[i];
        }

        // —— 反向 value head（仅当有可靠目标时）——
        if (sample.valueTarget !== null) {
            const dValScalar = opts.valueWeight * 2 * (predictedValue - sample.valueTarget);
            let dGrad = [dValScalar];
            for (let l = value.length - 1; l >= 0; l -= 1) {
                const act = (l === value.length - 1) ? 'tanh' : 'relu';
                dGrad = backward(value[l], dGrad, valueCaches[l].z, valueCaches[l].inp, act);
            }
            for (let i = 0; i < embedDim; i += 1) dE[i] += dGrad[i];
            valueLossSum += (predictedValue - sample.valueTarget) ** 2;
            valueCount += 1;
        }

        // —— 反向 trunk（共享，包含 policy 与 value 对 e 的合成梯度）——
        let dTrunk = dE;
        for (let l = trunk.length - 1; l >= 0; l -= 1) {
            dTrunk = backward(trunk[l], dTrunk, trunkCaches[l].z, trunkCaches[l].inp, 'relu');
        }
    }

    // —— 梯度更新与动量 ——
    applyMomentum(net, { trunk, policy, value }, opts, N);

    return {
        policyLoss: policyLossSum / Math.max(1, N),
        valueLoss: valueCount ? valueLossSum / valueCount : 0,
        policyAccuracy: correct / Math.max(1, N),
        valueCount,
        totalSamples: N
    };
}

function argmax(a: number[]): number {
    let best = 0;
    for (let i = 1; i < a.length; i += 1) if (a[i] > a[best]) best = i;
    return best;
}

function applyMomentum(
    net: DualHeadNet,
    groups: { trunk: DenseWithGrad[]; policy: DenseWithGrad[]; value: DenseWithGrad[] },
    opts: TrainOptions,
    N: number
): void {
    const scale = 1 / Math.max(1, N);

    const updateLayerList = (layers: DenseWithGrad[], prefix: string) => {
        for (let l = 0; l < layers.length; l += 1) {
            const d = layers[l];
            const wKey = `${prefix}W${l + 1}`;
            const bKey = `${prefix}B${l + 1}`;
            const vW = net.vel[wKey] ?? (net.vel[wKey] = zeros(d.W.length));
            const vB = net.vel[bKey] ?? (net.vel[bKey] = zeros(d.b.length));

            for (let i = 0; i < d.W.length; i += 1) {
                const g = d.dW[i] * scale;
                vW[i] = opts.momentum * vW[i] + g;
                d.W[i] -= opts.learningRate * vW[i];
            }
            for (let i = 0; i < d.b.length; i += 1) {
                const g = d.db[i] * scale;
                vB[i] = opts.momentum * vB[i] + g;
                d.b[i] -= opts.learningRate * vB[i];
            }
        }
    };

    updateLayerList(groups.trunk, 'trunk');
    updateLayerList(groups.policy, 'policy');
    updateLayerList(groups.value, 'value');

    // Keep legacy aliases in sync
    if (net.trunkLayers.length === 2) {
        net.trunkW1 = net.trunkLayers[0].W; net.trunkB1 = net.trunkLayers[0].b;
        net.trunkW2 = net.trunkLayers[1].W; net.trunkB2 = net.trunkLayers[1].b;
    }
    if (net.policyLayers.length === 3) {
        net.policyW1 = net.policyLayers[0].W; net.policyB1 = net.policyLayers[0].b;
        net.policyW2 = net.policyLayers[1].W; net.policyB2 = net.policyLayers[1].b;
        net.policyW3 = net.policyLayers[2].W; net.policyB3 = net.policyLayers[2].b;
    }
    if (net.valueLayers.length === 2) {
        net.valueW1 = net.valueLayers[0].W; net.valueB1 = net.valueLayers[0].b;
        net.valueW2 = net.valueLayers[1].W; net.valueB2 = net.valueLayers[1].b;
    }
}

export interface Decision { logits: number[]; probs: number[]; topIndex: number; value: number; }

/**
 * 推理专用快速仿射变换：不分配任何 dW/db 梯度缓存数组，降低 GC 压力。
 */
function forwardDenseInference(W: number[], b: number[], inDim: number, outDim: number, x: number[], act: Act): number[] {
    const y = new Array(outDim);
    for (let o = 0; o < outDim; o += 1) {
        let s = b[o];
        const base = o * inDim;
        for (let i = 0; i < inDim; i += 1) s += W[base + i] * x[i];
        if (act === 'relu') y[o] = s > 0 ? s : 0;
        else if (act === 'tanh') y[o] = Math.tanh(s);
        else y[o] = s;
    }
    return y;
}

/**
 * 把输入标准化 (x-mu)/sigma 折叠进 trunk 第一层仿射，使网络直接吃原始特征（自包含可部署）。
 */
export function foldInputStandardization(net: DualHeadNet, mu: number[], sigma: number[]): DualHeadNet {
    if (net.isStandardizationFolded) {
        throw new Error('Input standardization has already been folded into this model');
    }
    const stateDim = net.spec.stateDim;
    if (mu.length !== stateDim || sigma.length !== stateDim) {
        throw new Error(`Standardization vector dimension (${mu.length}) does not match stateDim (${stateDim})`);
    }
    for (let i = 0; i < stateDim; i += 1) {
        if (!Number.isFinite(sigma[i]) || sigma[i] <= 0) {
            throw new Error(`Invalid sigma at index ${i}: ${sigma[i]} (must be finite positive)`);
        }
        if (!Number.isFinite(mu[i])) {
            throw new Error(`Invalid mu at index ${i}: ${mu[i]} (must be finite)`);
        }
    }
    const firstLayer = net.trunkLayers[0];
    const outDim = firstLayer.out;
    for (let h = 0; h < outDim; h += 1) {
        let shift = 0;
        const base = h * stateDim;
        for (let i = 0; i < stateDim; i += 1) {
            const w = firstLayer.W[base + i];
            firstLayer.W[base + i] = w / sigma[i];
            shift += (w * mu[i]) / sigma[i];
        }
        firstLayer.b[h] -= shift;
    }
    if (net.trunkW1) {
        net.trunkW1 = firstLayer.W;
        net.trunkB1 = firstLayer.b;
    }
    net.isStandardizationFolded = true;
    net.spec.isStandardizationFolded = true;
    net.vel = {};
    return net;
}

/** 一次编码状态、评全部候选并给出价值——推理接口（使用纯推理快速路径）。 */
export function predictDecision(net: DualHeadNet, state: number[], candidates: number[][]): Decision {
    let cur = state;
    for (let l = 0; l < net.trunkLayers.length; l += 1) {
        const layer = net.trunkLayers[l];
        cur = forwardDenseInference(layer.W, layer.b, layer.in, layer.out, cur, 'relu');
    }
    const e = cur;

    let vCur = e;
    for (let l = 0; l < net.valueLayers.length; l += 1) {
        const layer = net.valueLayers[l];
        const act = (l === net.valueLayers.length - 1) ? 'tanh' : 'relu';
        vCur = forwardDenseInference(layer.W, layer.b, layer.in, layer.out, vCur, act);
    }
    const value = vCur[0];

    const logits: number[] = [];
    for (const action of candidates) {
        const inp = e.concat(action);
        let pCur = inp;
        for (let l = 0; l < net.policyLayers.length; l += 1) {
            const layer = net.policyLayers[l];
            const act = (l === net.policyLayers.length - 1) ? 'linear' : 'relu';
            pCur = forwardDenseInference(layer.W, layer.b, layer.in, layer.out, pCur, act);
        }
        logits.push(pCur[0]);
    }

    const maxLogit = logits.length ? Math.max(...logits) : 0;
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map(v => v / sumExp);
    return { logits, probs, topIndex: argmax(logits), value };
}

export function saveDualHeadModel(net: DualHeadNet, meta: Record<string, unknown> = {}): string {
    const isV2 = Boolean(net.spec.trunkHidden && net.spec.trunkHidden.length > 0) || net.trunkLayers.length > 2;
    const kind = isV2 ? 'skirmish_dual_head_v2' : 'skirmish_dual_head_v1';
    const weights: Record<string, number[]> = {};

    for (let l = 0; l < net.trunkLayers.length; l += 1) {
        weights[`trunkW${l + 1}`] = net.trunkLayers[l].W;
        weights[`trunkB${l + 1}`] = net.trunkLayers[l].b;
    }
    for (let l = 0; l < net.policyLayers.length; l += 1) {
        weights[`policyW${l + 1}`] = net.policyLayers[l].W;
        weights[`policyB${l + 1}`] = net.policyLayers[l].b;
    }
    for (let l = 0; l < net.valueLayers.length; l += 1) {
        weights[`valueW${l + 1}`] = net.valueLayers[l].W;
        weights[`valueB${l + 1}`] = net.valueLayers[l].b;
    }

    const payload: Record<string, unknown> = {
        kind,
        schemaVersion: isV2 ? 2 : 1,
        architectureId: net.spec.architectureId ?? (net.trunkLayers.length === 3 ? 'NET_B' : 'NET_A'),
        stateEncoderVersion: net.spec.stateEncoderVersion ?? 'state-v2',
        actionEncoderVersion: net.spec.actionEncoderVersion ?? 'action-v2',
        spec: net.spec,
        parameterCount: getParameterCount(net.spec),
        weights,
        isStandardizationFolded: net.isStandardizationFolded ?? false,
        meta
    };

    return JSON.stringify(payload);
}

export function loadDualHeadModelFromJson(json: string): DualHeadNet {
    let obj: any;
    try {
        obj = JSON.parse(json);
    } catch (err: any) {
        throw new Error(`Failed to parse model JSON: ${err.message}`);
    }
    if (!obj || typeof obj !== 'object') throw new Error('Model JSON must be an object');
    if (obj.kind !== 'skirmish_dual_head_v1' && obj.kind !== 'skirmish_dual_head_v2') {
        throw new Error(`Unknown model kind: ${obj.kind}`);
    }
    if (!obj.spec || typeof obj.spec !== 'object') throw new Error('Missing or invalid spec in model');
    if (!obj.weights || typeof obj.weights !== 'object') throw new Error('Missing or invalid weights in model');

    const net = createDualHeadNet(obj.spec);

    const loadAndValidate = (layers: DenseLayer[], prefix: string) => {
        for (let l = 0; l < layers.length; l += 1) {
            const wKey = `${prefix}W${l + 1}`;
            const bKey = `${prefix}B${l + 1}`;
            const W = obj.weights[wKey];
            const b = obj.weights[bKey];

            if (!Array.isArray(W)) {
                throw new Error(`Missing or invalid weight tensor: ${wKey}`);
            }
            if (!Array.isArray(b)) {
                throw new Error(`Missing or invalid bias tensor: ${bKey}`);
            }
            if (W.length !== layers[l].in * layers[l].out) {
                throw new Error(`Shape mismatch in ${wKey}: expected ${layers[l].in * layers[l].out}, got ${W.length}`);
            }
            if (b.length !== layers[l].out) {
                throw new Error(`Shape mismatch in ${bKey}: expected ${layers[l].out}, got ${b.length}`);
            }
            for (let i = 0; i < W.length; i += 1) {
                if (!Number.isFinite(W[i])) {
                    throw new Error(`Non-finite value in ${wKey} at index ${i}: ${W[i]}`);
                }
            }
            for (let i = 0; i < b.length; i += 1) {
                if (!Number.isFinite(b[i])) {
                    throw new Error(`Non-finite value in ${bKey} at index ${i}: ${b[i]}`);
                }
            }

            layers[l].W = [...W];
            layers[l].b = [...b];
        }
    };

    loadAndValidate(net.trunkLayers, 'trunk');
    loadAndValidate(net.policyLayers, 'policy');
    loadAndValidate(net.valueLayers, 'value');

    // Keep legacy aliases in sync
    if (net.trunkLayers.length === 2) {
        net.trunkW1 = net.trunkLayers[0].W; net.trunkB1 = net.trunkLayers[0].b;
        net.trunkW2 = net.trunkLayers[1].W; net.trunkB2 = net.trunkLayers[1].b;
    }
    if (net.policyLayers.length === 3) {
        net.policyW1 = net.policyLayers[0].W; net.policyB1 = net.policyLayers[0].b;
        net.policyW2 = net.policyLayers[1].W; net.policyB2 = net.policyLayers[1].b;
        net.policyW3 = net.policyLayers[2].W; net.policyB3 = net.policyLayers[2].b;
    }
    if (net.valueLayers.length === 2) {
        net.valueW1 = net.valueLayers[0].W; net.valueB1 = net.valueLayers[0].b;
        net.valueW2 = net.valueLayers[1].W; net.valueB2 = net.valueLayers[1].b;
    }

    net.isStandardizationFolded = Boolean(obj.isStandardizationFolded || obj.spec.isStandardizationFolded);
    net.vel = {};
    return net;
}

export interface GradientCheckItem {
    layer: string;
    param: 'W' | 'b';
    index: number;
    analytical: number;
    numerical: number;
    relError: number;
}

export interface GradientCheckResult {
    passed: boolean;
    maxRelError: number;
    checks: GradientCheckItem[];
}

/**
 * 有限差分梯度校验器：验证反向传播解析梯度与数值梯度的逼近程度。
 */
export function checkGradients(
    net: DualHeadNet,
    sample: DualHeadSample,
    eps = 1e-5,
    tol = 1e-3
): GradientCheckResult {
    // 1. 计算解析梯度（单样本）
    const trunk = toDenseWithGrad(net.trunkLayers);
    const policy = toDenseWithGrad(net.policyLayers);
    const value = toDenseWithGrad(net.valueLayers);
    const embedDim = trunk[trunk.length - 1].out;

    // 前向 trunk
    let cur = sample.state;
    const trunkCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
    for (let l = 0; l < trunk.length; l += 1) {
        const res = forward(trunk[l], cur, 'relu');
        trunkCaches.push({ inp: cur, y: res.y, z: res.z });
        cur = res.y;
    }
    const e = cur;

    // 前向 value
    let vCur = e;
    const valueCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
    for (let l = 0; l < value.length; l += 1) {
        const act = (l === value.length - 1) ? 'tanh' : 'relu';
        const res = forward(value[l], vCur, act);
        valueCaches.push({ inp: vCur, y: res.y, z: res.z });
        vCur = res.y;
    }
    const predictedValue = vCur[0];

    // 前向 policy
    const logits: number[] = [];
    const policyCachesPerCand: { inp: number[]; y: number[]; z: number[] }[][] = [];
    for (const action of sample.candidates) {
        const inp = e.concat(action);
        let pCur = inp;
        const candCaches: { inp: number[]; y: number[]; z: number[] }[] = [];
        for (let l = 0; l < policy.length; l += 1) {
            const act = (l === policy.length - 1) ? 'linear' : 'relu';
            const res = forward(policy[l], pCur, act);
            candCaches.push({ inp: pCur, y: res.y, z: res.z });
            pCur = res.y;
        }
        logits.push(pCur[0]);
        policyCachesPerCand.push(candCaches);
    }

    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(v => v / sumExp);
    const label = sample.labelIndex;

    const dE = new Array(embedDim).fill(0);
    for (let c = 0; c < sample.candidates.length; c += 1) {
        const dLogit = probs[c] - (c === label ? 1 : 0);
        let dGrad = [dLogit];
        const candCaches = policyCachesPerCand[c];
        for (let l = policy.length - 1; l >= 0; l -= 1) {
            const act = (l === policy.length - 1) ? 'linear' : 'relu';
            dGrad = backward(policy[l], dGrad, candCaches[l].z, candCaches[l].inp, act);
        }
        for (let i = 0; i < embedDim; i += 1) dE[i] += dGrad[i];
    }

    if (sample.valueTarget !== null) {
        const dValScalar = 2 * (predictedValue - sample.valueTarget);
        let dGrad = [dValScalar];
        for (let l = value.length - 1; l >= 0; l -= 1) {
            const act = (l === value.length - 1) ? 'tanh' : 'relu';
            dGrad = backward(value[l], dGrad, valueCaches[l].z, valueCaches[l].inp, act);
        }
        for (let i = 0; i < embedDim; i += 1) dE[i] += dGrad[i];
    }

    let dTrunk = dE;
    for (let l = trunk.length - 1; l >= 0; l -= 1) {
        dTrunk = backward(trunk[l], dTrunk, trunkCaches[l].z, trunkCaches[l].inp, 'relu');
    }

    // 计算给定模型对 sample 的总损失
    const computeLoss = (m: DualHeadNet): number => {
        const dec = predictDecision(m, sample.state, sample.candidates);
        const lCE = -Math.log(Math.max(1e-12, dec.probs[label]));
        const lVal = sample.valueTarget !== null ? (dec.value - sample.valueTarget) ** 2 : 0;
        return lCE + lVal;
    };

    const checks: GradientCheckItem[] = [];
    let maxRelError = 0;

    const checkLayer = (layerName: string, actualLayer: DenseLayer, gradDense: DenseWithGrad) => {
        // 采样前几个权重和偏差做差分校验
        const checkCountW = Math.min(5, actualLayer.W.length);
        for (let i = 0; i < checkCountW; i += 1) {
            const orig = actualLayer.W[i];
            actualLayer.W[i] = orig + eps;
            const lossPlus = computeLoss(net);
            actualLayer.W[i] = orig - eps;
            const lossMinus = computeLoss(net);
            actualLayer.W[i] = orig;

            const numerical = (lossPlus - lossMinus) / (2 * eps);
            const analytical = gradDense.dW[i];
            const denom = Math.max(Math.abs(analytical), Math.abs(numerical), 1e-4);
            const relError = Math.abs(analytical - numerical) / denom;
            if (relError > maxRelError) maxRelError = relError;

            checks.push({ layer: layerName, param: 'W', index: i, analytical, numerical, relError });
        }

        const checkCountB = Math.min(3, actualLayer.b.length);
        for (let i = 0; i < checkCountB; i += 1) {
            const orig = actualLayer.b[i];
            actualLayer.b[i] = orig + eps;
            const lossPlus = computeLoss(net);
            actualLayer.b[i] = orig - eps;
            const lossMinus = computeLoss(net);
            actualLayer.b[i] = orig;

            const numerical = (lossPlus - lossMinus) / (2 * eps);
            const analytical = gradDense.db[i];
            const denom = Math.max(Math.abs(analytical), Math.abs(numerical), 1e-4);
            const relError = Math.abs(analytical - numerical) / denom;
            if (relError > maxRelError) maxRelError = relError;

            checks.push({ layer: layerName, param: 'b', index: i, analytical, numerical, relError });
        }
    };

    for (let l = 0; l < net.trunkLayers.length; l += 1) {
        checkLayer(`trunk[${l}]`, net.trunkLayers[l], trunk[l]);
    }
    for (let l = 0; l < net.policyLayers.length; l += 1) {
        checkLayer(`policy[${l}]`, net.policyLayers[l], policy[l]);
    }
    for (let l = 0; l < net.valueLayers.length; l += 1) {
        checkLayer(`value[${l}]`, net.valueLayers[l], value[l]);
    }

    return {
        passed: maxRelError <= tol,
        maxRelError,
        checks
    };
}
