/**
 * T10 紧凑策略/价值双头网络（纯 TypeScript，CPU 可跑，无外部依赖）。
 *
 * 结构（首版刻意小，符合任务书「~小网络 + 保留 MLP 对照，不预设越大越强」）：
 *   trunk:  state → FC(hidden,ReLU) → FC(embed,ReLU) = e
 *   policy: 每个候选 [e ; action] → FC(ph,ReLU) → FC(ph,ReLU) → FC(1) = logit；候选间 softmax
 *   value:  e → FC(vh,ReLU) → FC(1, tanh)
 * 训练为全批前向 + 手写反向 + 动量 SGD。价值损失【只】在带 valueTarget 的样本上计算，
 * 屏蔽样本（截断/未核验终局）不产生任何价值梯度（任务书：截断样本不得随意赋 0 或按材料赋胜）。
 *
 * 与 T06 MLP 的区别：本模块是【可部署双头】——策略头给出候选分布（T11 作推演剪枝先验），
 * 价值头给出局面标量（T11 作叶节点评估），共享 trunk 一次编码即可评全部候选 + 局面。
 */

export interface DualHeadSpec {
    stateDim: number;
    actionDim: number;
    hidden: number;
    embed: number;
    policyHidden: number;
    valueHidden: number;
    seed: number;
}

export interface DualHeadSample {
    state: number[];
    candidates: number[][];
    labelIndex: number;
    /** null = 无可靠价值目标（截断/未核验），屏蔽 value loss */
    valueTarget: number | null;
}

type Act = 'relu' | 'tanh' | 'linear';

interface Dense { in: number; out: number; W: number[]; b: number[]; dW: number[]; db: number[]; }

// ReLU：正恒等、负置零。不采用 leaky——标准化后的近常数列离群值经 leaky 直通会爆炸出 NaN，
// 纯 ReLU 天然截断负侧异常输入，手写全批 SGD 更稳。
function activate(z: number[], act: Act): number[] {
    if (act === 'relu') return z.map(v => (v > 0 ? v : 0));
    if (act === 'tanh') return z.map(Math.tanh);
    return z.slice();
}

export interface DualHeadNet {
    spec: DualHeadSpec;
    // trunk
    trunkW1: number[]; trunkB1: number[];
    trunkW2: number[]; trunkB2: number[];
    // policy head (over [embed;action])
    policyW1: number[]; policyB1: number[];
    policyW2: number[]; policyB2: number[];
    policyW3: number[]; policyB3: number[];
    // value head (over embed)
    valueW1: number[]; valueB1: number[];
    valueW2: number[]; valueB2: number[];
    // momentum buffers
    vel: Record<string, number[]>;
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

function initDense(inDim: number, outDim: number, rand: () => number): Dense {
    const limit = Math.sqrt(6 / (inDim + outDim));
    const W = new Array(inDim * outDim);
    for (let i = 0; i < W.length; i += 1) W[i] = rand() * 2 * limit - limit;
    return { in: inDim, out: outDim, W, b: zeros(outDim), dW: zeros(W.length), db: zeros(outDim) };
}

export function createDualHeadNet(spec: DualHeadSpec): DualHeadNet {
    const rand = mulberry32(spec.seed);
    const t1 = initDense(spec.stateDim, spec.hidden, rand);
    const t2 = initDense(spec.hidden, spec.embed, rand);
    const p1 = initDense(spec.embed + spec.actionDim, spec.policyHidden, rand);
    const p2 = initDense(spec.policyHidden, spec.policyHidden, rand);
    const p3 = initDense(spec.policyHidden, 1, rand);
    const v1 = initDense(spec.embed, spec.valueHidden, rand);
    const v2 = initDense(spec.valueHidden, 1, rand);
    const net: DualHeadNet = {
        spec,
        trunkW1: t1.W, trunkB1: t1.b, trunkW2: t2.W, trunkB2: t2.b,
        policyW1: p1.W, policyB1: p1.b, policyW2: p2.W, policyB2: p2.b, policyW3: p3.W, policyB3: p3.b,
        valueW1: v1.W, valueB1: v1.b, valueW2: v2.W, valueB2: v2.b,
        vel: {}
    };
    return net;
}

function forward(d: Dense, x: number[], act: Act): { y: number[]; z: number[] } {
    const z = new Array(d.out);
    for (let o = 0; o < d.out; o += 1) {
        let s = d.b[o];
        const base = o * d.in;
        for (let i = 0; i < d.in; i += 1) s += d.W[base + i] * x[i];
        z[o] = s;
    }
    return { y: activate(z, act), z };
}

function backward(d: Dense, dY: number[], z: number[], x: number[], act: Act): number[] {
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

function toDense(net: DualHeadNet): { trunk: [Dense, Dense]; policy: [Dense, Dense, Dense]; value: [Dense, Dense] } {
    const s = net.spec;
    const mk = (inD: number, outD: number, W: number[], b: number[]): Dense => ({ in: inD, out: outD, W, b, dW: zeros(W.length), db: zeros(outD) });
    return {
        trunk: [
            mk(s.stateDim, s.hidden, net.trunkW1, net.trunkB1),
            mk(s.hidden, s.embed, net.trunkW2, net.trunkB2)
        ],
        policy: [
            mk(s.embed + s.actionDim, s.policyHidden, net.policyW1, net.policyB1),
            mk(s.policyHidden, s.policyHidden, net.policyW2, net.policyB2),
            mk(s.policyHidden, 1, net.policyW3, net.policyB3)
        ],
        value: [
            mk(s.embed, s.valueHidden, net.valueW1, net.valueB1),
            mk(s.valueHidden, 1, net.valueW2, net.valueB2)
        ]
    };
}

export interface TrainOptions { learningRate: number; momentum: number; valueWeight: number; }
export interface TrainReport { policyLoss: number; valueLoss: number; policyAccuracy: number; }

/** 全批前向+反向+动量 SGD。valueTarget=null 的样本不进入价值损失/梯度。 */
export function trainStep(net: DualHeadNet, batch: DualHeadSample[], opts: TrainOptions): TrainReport {
    const { trunk, policy, value } = toDense(net);
    const s = net.spec;
    const N = batch.length;
    let policyLossSum = 0, valueLossSum = 0, correct = 0, valueCount = 0;

    for (const sample of batch) {
        // —— 前向 trunk ——
        const t1 = forward(trunk[0], sample.state, 'relu');
        const t2 = forward(trunk[1], t1.y, 'relu');
        const e = t2.y;

        // —— value 前向 ——
        const v1 = forward(value[0], e, 'relu');
        const v2 = forward(value[1], v1.y, 'tanh');
        const predictedValue = v2.y[0];

        // —— policy 前向（缓存每候选中间值）——
        const logits: number[] = [];
        const caches: { inp: number[]; p1: { y: number[]; z: number[] }; p2: { y: number[]; z: number[] }; p3: { y: number[]; z: number[] } }[] = [];
        for (const action of sample.candidates) {
            const inp = e.concat(action);
            const fp1 = forward(policy[0], inp, 'relu');
            const fp2 = forward(policy[1], fp1.y, 'relu');
            const fp3 = forward(policy[2], fp2.y, 'linear');
            logits.push(fp3.y[0]);
            caches.push({ inp, p1: fp1, p2: fp2, p3: fp3 });
        }
        // softmax + CE
        const maxLogit = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExp = exps.reduce((a, b) => a + b, 0);
        const probs = exps.map(v => v / sumExp);
        const label = sample.labelIndex;
        policyLossSum += -Math.log(Math.max(1e-12, probs[label]));
        if (argmax(logits) === label) correct += 1;

        // —— 反向 policy head（累加各候选梯度，同时累积 dE）——
        const dE = new Array(s.embed).fill(0);
        for (let c = 0; c < sample.candidates.length; c += 1) {
            const dLogit = probs[c] - (c === label ? 1 : 0);
            const dP3 = backward(policy[2], [dLogit], caches[c].p3.z, caches[c].p2.y, 'linear');
            const dP2 = backward(policy[1], dP3, caches[c].p2.z, caches[c].p1.y, 'relu');
            const dP1 = backward(policy[0], dP2, caches[c].p1.z, caches[c].inp, 'relu');
            for (let i = 0; i < s.embed; i += 1) dE[i] += dP1[i];
        }

        // —— 反向 value head（仅当有目标）——
        if (sample.valueTarget !== null) {
            const dValue = opts.valueWeight * 2 * (predictedValue - sample.valueTarget);
            const dV2 = backward(value[1], [dValue], v2.z, v1.y, 'tanh');
            const dV1 = backward(value[0], dV2, v1.z, e, 'relu');
            for (let i = 0; i < s.embed; i += 1) dE[i] += dV1[i];
            valueLossSum += (predictedValue - sample.valueTarget) ** 2;
            valueCount += 1;
        }

        // —— 反向 trunk（共享，policy+value 的 dE 合并）——
        const dH = backward(trunk[1], dE, t2.z, t1.y, 'relu');
        backward(trunk[0], dH, t1.z, sample.state, 'relu');
    }

    // —— 平均梯度并按动量更新 ——
    applyMomentum(net, { trunk, policy, value }, opts, N);

    return {
        policyLoss: policyLossSum / Math.max(1, N),
        valueLoss: valueCount ? valueLossSum / valueCount : 0,
        policyAccuracy: correct / Math.max(1, N)
    };
}

function argmax(a: number[]): number {
    let best = 0;
    for (let i = 1; i < a.length; i += 1) if (a[i] > a[best]) best = i;
    return best;
}

function layerList(groups: { trunk: Dense[]; policy: Dense[]; value: Dense[] }, net: DualHeadNet): { key: string; d: Dense }[] {
    return [
        { key: 'trunkW1', d: groups.trunk[0] }, { key: 'trunkW2', d: groups.trunk[1] },
        { key: 'policyW1', d: groups.policy[0] }, { key: 'policyW2', d: groups.policy[1] }, { key: 'policyW3', d: groups.policy[2] },
        { key: 'valueW1', d: groups.value[0] }, { key: 'valueW2', d: groups.value[1] }
    ];
}

function applyMomentum(net: DualHeadNet, groups: { trunk: Dense[]; policy: Dense[]; value: Dense[] }, opts: TrainOptions, N: number): void {
    const map = layerList(groups, net);
    const scale = 1 / Math.max(1, N);
    const entries: { W: number[]; b: number[]; dW: number[]; db: number[] }[] = [
        ...groups.trunk, ...groups.policy, ...groups.value
    ];
    for (let idx = 0; idx < entries.length; idx += 1) {
        const d = entries[idx];
        const vW = net.vel[map[idx].key] ?? (net.vel[map[idx].key] = zeros(d.W.length));
        const vB = net.vel[`${map[idx].key}_b`] ?? (net.vel[`${map[idx].key}_b`] = zeros(d.b.length));
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
}

export interface Decision { logits: number[]; probs: number[]; topIndex: number; value: number; }

/**
 * 把输入标准化 (x-mu)/sigma 折叠进 trunk 第一层仿射，使网络直接吃原始特征（自包含可部署）。
 * z_h = Σ W[h][i]·(x_i-mu_i)/sigma_i + b_h = Σ (W[h][i]/sigma_i)·x_i + (b_h − Σ W[h][i]·mu_i/sigma_i)。
 * 折叠后 predictDecision(原始 x) 与折叠前 predictDecision(标准化 x) 逐位等价（见测试）。
 * 仅用于部署产物；训练仍在标准化特征上进行。
 */
export function foldInputStandardization(net: DualHeadNet, mu: number[], sigma: number[]): DualHeadNet {
    const { stateDim, hidden } = net.spec;
    if (mu.length !== stateDim || sigma.length !== stateDim) throw new Error('标准化向量维度与 stateDim 不匹配');
    for (let h = 0; h < hidden; h += 1) {
        let shift = 0;
        const base = h * stateDim;
        for (let i = 0; i < stateDim; i += 1) {
            const w = net.trunkW1[base + i];
            net.trunkW1[base + i] = w / sigma[i];
            shift += w * mu[i] / sigma[i];
        }
        net.trunkB1[h] -= shift;
    }
    net.vel = {};
    return net;
}

/** 一次编码状态、评全部候选并给出价值——推理接口。 */
export function predictDecision(net: DualHeadNet, state: number[], candidates: number[][]): Decision {
    const { trunk, policy, value } = toDense(net);
    const t1 = forward(trunk[0], state, 'relu');
    const t2 = forward(trunk[1], t1.y, 'relu');
    const e = t2.y;
    const v1 = forward(value[0], e, 'relu');
    const v2 = forward(value[1], v1.y, 'tanh');
    const logits = candidates.map(action => {
        const inp = e.concat(action);
        const fp1 = forward(policy[0], inp, 'relu');
        const fp2 = forward(policy[1], fp1.y, 'relu');
        const fp3 = forward(policy[2], fp2.y, 'linear');
        return fp3.y[0];
    });
    const maxLogit = logits.length ? Math.max(...logits) : 0;
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map(v => v / sumExp);
    return { logits, probs, topIndex: argmax(logits), value: v2.y[0] };
}

export function saveDualHeadModel(net: DualHeadNet, meta: Record<string, unknown> = {}): string {
    return JSON.stringify({
        kind: 'skirmish_dual_head_v1',
        spec: net.spec,
        weights: {
            trunkW1: net.trunkW1, trunkB1: net.trunkB1, trunkW2: net.trunkW2, trunkB2: net.trunkB2,
            policyW1: net.policyW1, policyB1: net.policyB1, policyW2: net.policyW2, policyB2: net.policyB2, policyW3: net.policyW3, policyB3: net.policyB3,
            valueW1: net.valueW1, valueB1: net.valueB1, valueW2: net.valueW2, valueB2: net.valueB2
        },
        meta
    });
}

export function loadDualHeadModelFromJson(json: string): DualHeadNet {
    const obj = JSON.parse(json);
    if (obj.kind !== 'skirmish_dual_head_v1') throw new Error(`未知模型 kind: ${obj.kind}`);
    const net = createDualHeadNet(obj.spec);
    Object.assign(net, obj.weights);
    net.vel = {};
    return net;
}
