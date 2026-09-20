import { describe, expect, it } from 'vitest';
import {
    createDualHeadNet,
    trainStep,
    predictDecision,
    saveDualHeadModel,
    loadDualHeadModelFromJson,
    foldInputStandardization,
    checkGradients,
    getParameterCount,
    type DualHeadSample,
    type DualHeadSpec,
    type DualHeadNet
} from './skirmish_dual_head_net';
import { createNetworkLeafEvaluator } from './skirmish_neural_search';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';

const STATE_DIM = 12;
const ACTION_DIM = 6;

function sample(valueTarget: number | null = 1.0): DualHeadSample {
    return {
        state: [0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8, 0.9, -0.1, 0.2, -0.3],
        candidates: [
            [0.2, 0.1, -0.1, 0.3, -0.2, 0.4],
            [-0.3, 0.4, 0.2, -0.1, 0.5, -0.2]
        ],
        labelIndex: 0,
        valueTarget
    };
}

describe('N04 & N04-A: 模型契约、可配置深度与数值梯度验证 (F06)', () => {
    it('F06反例：loadDualHeadModelFromJson 必须拒绝缺失权重、非有限权重，绝不能随机初始化伪造完整', () => {
        const spec: DualHeadSpec = {
            stateDim: STATE_DIM,
            actionDim: ACTION_DIM,
            trunkHidden: [24, 16],
            policyHidden: [16, 16],
            valueHidden: [8],
            seed: 42
        };
        const net = createDualHeadNet(spec);
        const jsonStr = saveDualHeadModel(net);
        const obj = JSON.parse(jsonStr);

        // 1. 缺失 trunkW1 权重
        const brokenMissing = JSON.parse(JSON.stringify(obj));
        delete brokenMissing.weights.trunkW1;
        expect(() => loadDualHeadModelFromJson(JSON.stringify(brokenMissing))).toThrow();

        // 2. 存在 NaN / Infinity 权重
        const brokenNaN = JSON.parse(JSON.stringify(obj));
        brokenNaN.weights.policyW1[0] = NaN;
        expect(() => loadDualHeadModelFromJson(JSON.stringify(brokenNaN))).toThrow();

        const brokenInf = JSON.parse(JSON.stringify(obj));
        brokenInf.weights.valueW1[0] = Infinity;
        expect(() => loadDualHeadModelFromJson(JSON.stringify(brokenInf))).toThrow();

        // 3. 权重长度不匹配
        const brokenLen = JSON.parse(JSON.stringify(obj));
        brokenLen.weights.trunkB1 = [0.1]; // 长度应为 24
        expect(() => loadDualHeadModelFromJson(JSON.stringify(brokenLen))).toThrow();
    });

    it('F06反例：foldInputStandardization 必须校验 sigma 为有限正数且不可重复折叠', () => {
        const net = createDualHeadNet({
            stateDim: STATE_DIM,
            actionDim: ACTION_DIM,
            trunkHidden: [16, 8],
            policyHidden: [8],
            valueHidden: [4],
            seed: 123
        });
        const mu = new Array(STATE_DIM).fill(0);

        // 非正 sigma
        const zeroSigma = new Array(STATE_DIM).fill(1);
        zeroSigma[2] = 0;
        expect(() => foldInputStandardization(net, mu, zeroSigma)).toThrow();

        const negSigma = new Array(STATE_DIM).fill(1);
        negSigma[3] = -0.5;
        expect(() => foldInputStandardization(net, mu, negSigma)).toThrow();

        // 重复折叠
        const validSigma = new Array(STATE_DIM).fill(1.2);
        foldInputStandardization(net, mu, validSigma);
        expect(() => foldInputStandardization(net, mu, validSigma)).toThrow(/already.*folded|cannot fold/i);
    });

    it('N04-A 可配置深度：支持 NET_A [256, 128] 与 NET_B [256, 256, 128] 深度配置与参数统计', () => {
        const specA: DualHeadSpec = {
            stateDim: 184,
            actionDim: 45,
            trunkHidden: [256, 128],
            policyHidden: [64, 64],
            valueHidden: [64],
            seed: 1
        };
        const netA = createDualHeadNet(specA);
        const paramsA = getParameterCount(specA);
        expect(paramsA).toBeGreaterThan(0);
        expect(netA.trunkLayers).toHaveLength(2);

        const specB: DualHeadSpec = {
            stateDim: 184,
            actionDim: 45,
            trunkHidden: [256, 256, 128],
            policyHidden: [64, 64],
            valueHidden: [64],
            seed: 1
        };
        const netB = createDualHeadNet(specB);
        const paramsB = getParameterCount(specB);
        expect(netB.trunkLayers).toHaveLength(3);
        // NET_B 比 NET_A 多一个 256x256 + 256 bias 隐藏层 (65792 参数)
        expect(paramsB - paramsA).toBe(256 * 256 + 256);
    });

    it('N04 有限差分梯度校验：同时覆盖 2 层 trunk (NET_A) 与 3 层 trunk (NET_B) 的策略与价值路径', () => {
        const netA = createDualHeadNet({
            stateDim: 8,
            actionDim: 4,
            trunkHidden: [12, 8],
            policyHidden: [8],
            valueHidden: [6],
            seed: 7
        });
        const sam = {
            state: [0.2, -0.3, 0.1, 0.5, -0.4, 0.2, -0.1, 0.3],
            candidates: [
                [0.1, -0.2, 0.3, 0.4],
                [-0.2, 0.5, -0.1, 0.2]
            ],
            labelIndex: 1,
            valueTarget: 0.5
        };
        const checkResultA = checkGradients(netA, sam);
        expect(checkResultA.passed).toBe(true);
        expect(checkResultA.maxRelError).toBeLessThan(1e-3);

        const netB = createDualHeadNet({
            stateDim: 8,
            actionDim: 4,
            trunkHidden: [12, 10, 8],
            policyHidden: [8],
            valueHidden: [6],
            seed: 7
        });
        const checkResultB = checkGradients(netB, sam);
        expect(checkResultB.passed).toBe(true);
        expect(checkResultB.maxRelError).toBeLessThan(1e-3);
    });

    it('F06/N04 价值掩码与归一化契约：M=0 时 valueCount=0 且价值头参数不受价值梯度影响', () => {
        const net = createDualHeadNet({
            stateDim: STATE_DIM,
            actionDim: ACTION_DIM,
            trunkHidden: [16, 8],
            policyHidden: [8],
            valueHidden: [4],
            seed: 99
        });
        const maskedBatch = [sample(null), sample(null)];
        const initialValW1 = [...net.valueLayers[0].W];
        const report = trainStep(net, maskedBatch, { learningRate: 0.05, momentum: 0, valueWeight: 1.0 });

        expect(report.valueLoss).toBe(0);
        expect(report.valueCount).toBe(0);
        // 价值头权重由于无价值目标且 momentum=0，应当完全不变
        expect(net.valueLayers[0].W).toEqual(initialValW1);
    });

    it('F06反例：createNetworkLeafEvaluator 在网络输出非有限值时必须抛出异常而非隐蔽归零', () => {
        const net = createDualHeadNet({
            stateDim: 184,
            actionDim: 45,
            trunkHidden: [16, 8],
            policyHidden: [8],
            valueHidden: [4],
            seed: 42
        });
        // 蓄意注入非有限权重
        net.valueLayers[net.valueLayers.length - 1].W[0] = NaN;
        const state = createDemoState(getApkSkirmishRuleConfig('SD') as never);
        const evalLeaf = createNetworkLeafEvaluator(net);

        expect(() => evalLeaf(state, 0)).toThrow(/NonFinite|invalid/i);
    });
});
