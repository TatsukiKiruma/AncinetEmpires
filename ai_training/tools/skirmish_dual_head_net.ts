// 训练更新复用应用的同一前向实现，避免两套数值逻辑。
import { DualHeadSpec, resolveTrunkHidden, resolvePolicyHidden, resolveValueHidden, getParameterCount, Act, DenseLayer, DualHeadNet, mulberry32, zeros, initDense, createDualHeadNet, argmax, DualHeadModel, Decision, forwardDenseInference, foldInputStandardization, predictDecision, saveDualHeadModel, loadDualHeadModelFromJson } from '../src/game/ai/runtime/skirmish_dual_head_net';
export * from '../src/game/ai/runtime/skirmish_dual_head_net';


export interface DualHeadSample {
    state: number[];
    candidates: number[][];
    labelIndex: number;
    /** null = 无可靠价值目标（截断/未核验），屏蔽 value loss */
    valueTarget: number | null;
    rootFamilyId?: string;
    sampleId?: string;
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

        // —— 反向 value head（仅当有可靠目标且 valueWeight > 0 时）——
        if (sample.valueTarget !== null && sample.valueTarget !== undefined) {
            if (!Number.isFinite(sample.valueTarget)) {
                throw new Error(`trainStep: sample.valueTarget must be a finite number or null/undefined, got ${sample.valueTarget}`);
            }
            if ((opts.valueWeight ?? 1) > 0) {
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
        }

        // —— 反向 trunk（共享，包含 policy 与 value 对 e 的合成梯度）——
        let dTrunk = dE;
        for (let l = trunk.length - 1; l >= 0; l -= 1) {
            dTrunk = backward(trunk[l], dTrunk, trunkCaches[l].z, trunkCaches[l].inp, 'relu');
        }
    }

    // —— 梯度更新与动量 ——
    applyMomentum(net, { trunk, policy, value }, opts, N);

    const rep: TrainReport = {
        policyLoss: policyLossSum / Math.max(1, N),
        valueLoss: valueCount ? valueLossSum / valueCount : 0,
        policyAccuracy: correct / Math.max(1, N),
        valueCount,
        totalSamples: N
    };

    if (!Number.isFinite(rep.policyLoss)) {
        throw new Error(`trainStep: non-finite policyLoss: ${rep.policyLoss}`);
    }
    if (!Number.isFinite(rep.valueLoss)) {
        throw new Error(`trainStep: non-finite valueLoss: ${rep.valueLoss}`);
    }

    return rep;
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