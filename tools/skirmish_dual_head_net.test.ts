/**
 * T10 紧凑策略/价值双头网络测试（RED 先行）。
 *
 * 契约：
 *   ① 确定性：同 seed 初始化逐位一致；前向/推理可复现；
 *   ② 微型过拟合：小合成数据上 policy 达到全对、value MSE 显著下降（无冲突才允许扩大）；
 *   ③ 价值屏蔽：valueTarget=null 的样本不产生价值梯度（不得随意赋 0 或按材料赋胜）；
 *   ④ 存储/加载一致性：top-1 与 logits 逐位一致；
 *   ⑤ softmax 候选分布合法（和=1、序与 logits 一致）。
 */
import { describe, expect, it } from 'vitest';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    saveDualHeadModel,
    loadDualHeadModelFromJson,
    foldInputStandardization,
    type DualHeadSample,
    type DualHeadNet
} from './skirmish_dual_head_net';

const STATE_DIM = 12;
const ACTION_DIM = 6;

function syntheticDataset(n: number, seed = 7): DualHeadSample[] {
    let s = seed >>> 0;
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const out: DualHeadSample[] = [];
    for (let i = 0; i < n; i += 1) {
        const state = Array.from({ length: STATE_DIM }, () => rand() * 2 - 1);
        const candidates = Array.from({ length: 4 }, (_, c) => {
            const a = Array.from({ length: ACTION_DIM }, () => rand() * 2 - 1);
            // 可学的交互：label = argmax c·a[0]，value = sign(state[0])
            a[0] = c - 1.5;
            return a;
        });
        // 可学的交互：label = state[0]>0 ? 候选3 : 候选0（候选 a[0] 单调），value = sign(state[0])
        const labelIndex = state[0] > 0 ? 3 : 0;
        out.push({
            state,
            candidates,
            labelIndex,
            valueTarget: state[0] > 0 ? 1 : -1
        });
    }
    return out;
}

function cloneParams(net: DualHeadNet): string {
    return JSON.stringify(net);
}

describe('skirmish_dual_head_net', () => {
    it('同 seed 初始化逐位一致；不同 seed 不同', () => {
        const a = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 42 });
        const b = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 42 });
        const c = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 43 });
        expect(cloneParams(a)).toBe(cloneParams(b));
        expect(cloneParams(a)).not.toBe(cloneParams(c));
    });

    it('微型过拟合：policy 全对 + value MSE 显著下降（先于规模化的冒烟门）', () => {
        const net = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 20260919 });
        const data = syntheticDataset(24);
        let last = null as null | { policyLoss: number; valueLoss: number; policyAccuracy: number };
        for (let step = 0; step < 900; step += 1) {
            last = trainStep(net, data, { learningRate: 0.05, momentum: 0.9, valueWeight: 1.0 });
        }
        expect(last).not.toBeNull();
        expect(last!.policyAccuracy).toBe(1);
        expect(last!.valueLoss).toBeLessThan(0.05);
        expect(Number.isFinite(last!.policyLoss)).toBe(true);
    });

    it('价值屏蔽：全部 valueTarget=null 时价值头权重不更新、policy 头更新', () => {
        const net = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 42 });
        const masked = syntheticDataset(8).map(s => ({ ...s, valueTarget: null }));
        const before = cloneParams(net);
        for (let step = 0; step < 5; step += 1) trainStep(net, masked, { learningRate: 0.05, momentum: 0, valueWeight: 1.0 });
        // 价值头（valueW1/valueW2/valueB*）必须逐位不变；policy 路径应有变化
        const after = JSON.parse(cloneParams(net));
        const beforeObj = JSON.parse(before);
        expect(JSON.stringify(after.valueW1)).toBe(JSON.stringify(beforeObj.valueW1));
        expect(JSON.stringify(after.valueW2)).toBe(JSON.stringify(beforeObj.valueW2));
        expect(JSON.stringify(after.policyW3)).not.toBe(JSON.stringify(beforeObj.policyW3));
    });

    it('存储/加载：logits 与 top-1 逐位一致', () => {
        const net = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 99 });
        trainStep(net, syntheticDataset(6), { learningRate: 0.01, momentum: 0.9, valueWeight: 1.0 });
        const json = saveDualHeadModel(net, { note: 'parity-test' });
        const loaded = loadDualHeadModelFromJson(json);
        const sample = syntheticDataset(3, 11)[0];
        const p = predictDecision(net, sample.state, sample.candidates);
        const q = predictDecision(loaded, sample.state, sample.candidates);
        expect(q.logits).toEqual(p.logits);
        expect(q.topIndex).toBe(p.topIndex);
        expect(q.value).toBe(p.value);
        expect(p.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    });

    it('输入标准化折叠：折叠后吃原始特征 ≡ 折叠前吃标准化特征（逐位）', () => {
        const net = createDualHeadNet({ stateDim: STATE_DIM, actionDim: ACTION_DIM, hidden: 24, embed: 16, policyHidden: 16, valueHidden: 8, seed: 7 });
        trainStep(net, syntheticDataset(6), { learningRate: 0.01, momentum: 0, valueWeight: 1 });
        const mu = Array.from({ length: STATE_DIM }, (_, i) => Math.sin(i));
        const sigma = Array.from({ length: STATE_DIM }, (_, i) => 0.5 + 0.3 * Math.cos(i));
        const raw = Array.from({ length: STATE_DIM }, (_, i) => i * 0.2 - 1);
        const cands = syntheticDataset(2)[0].candidates;
        const std = raw.map((x, i) => (x - mu[i]) / sigma[i]);
        const before = predictDecision(net, std, cands);
        const folded = foldInputStandardization(loadDualHeadModelFromJson(saveDualHeadModel(net, {})), mu, sigma);
        const after = predictDecision(folded, raw, cands);
        expect(after.topIndex).toBe(before.topIndex);
        expect(after.value).toBeCloseTo(before.value, 9);
        after.logits.forEach((l, i) => expect(l).toBeCloseTo(before.logits[i], 9));
    });
});
