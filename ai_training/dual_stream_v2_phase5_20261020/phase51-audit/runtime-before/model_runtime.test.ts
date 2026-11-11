import { describe, expect, it } from 'vitest';
import { createDemoState } from '../../game/demo_map';
import { getLegalActions } from '../../game/rules';
import { encodeDualObservation } from './encoder';
import { encodePlayerOrder } from './player_order';
import { DualStreamModel, computeScalarValue } from './model_runtime';
import { expectedWeightShapes, loadModelWeights, MODEL_ID, type WeightManifest } from './model_weights';
import { depthwise, linear, pool, upsample } from './tensor_ops';
import { TensorWorkspace, withTensorWorkspace } from './tensor_workspace';

function randomWeights() {
    let seed = 12345, offset = 0;
    const values: number[] = [], tensors: WeightManifest['tensors'] = [];
    for (const [name, shape] of Object.entries(expectedWeightShapes())) {
        const length = shape.reduce((a, b) => a * b, 1);
        tensors.push({ name, shape, offset, length }); offset += length;
        const normalization = name.includes('norm') || name.includes('.ln');
        for (let i = 0; i < length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            values.push(name === 'headBias' || name.endsWith('.bias') ? 0 : normalization || name === 'army_scale' ? 1 : ((seed / 4294967296) * 2 - 1) * .06);
        }
    }
    return { manifest: { model: MODEL_ID, schema: 'dual-stream-v2-phase1-v1', dtype: 'float32-le', parameters: offset, tensors } as WeightManifest, binary: Float32Array.from(values).buffer };
}

describe('双流v2阶段2数值内核', () => {
    it('非方阵与奇数行矩阵投影和独立标量实现一致', () => {
        for (const [rows, ci, co] of [[3, 128, 64], [5, 16, 4], [3, 13, 11], [4, 48, 8]]) {
            const x = Float32Array.from({ length: rows * ci }, (_, i) => Math.sin(i)), w = Float32Array.from({ length: ci * co }, (_, i) => Math.cos(i) / 10), bias = new Float32Array(co).fill(.25);
            const actual = linear(x, rows, ci, w, co, bias);
            for (let r = 0; r < rows; r++) for (let o = 0; o < co; o++) {
                let expected = 0; for (let k = 0; k < ci; k++) expected += x[r * ci + k] * w[o * ci + k];
                expect(actual[r * co + o]).toBe(Math.fround(expected + bias[o]));
            }
        }
    });
    it('动态注意力矩阵在复用缓冲后重新打包，不能复用上次的激活值', () => {
        const workspace = new TensorWorkspace(), weight = new Float32Array(32 * 9).fill(1), x = new Float32Array(32).fill(1);
        const a = withTensorWorkspace(workspace, () => linear(x, 1, 32, weight, 9, undefined, false).slice());
        weight.fill(2);
        const b = withTensorWorkspace(workspace, () => linear(x, 1, 32, weight, 9, undefined, false).slice());
        expect([...a]).toEqual(Array(9).fill(32)); expect([...b]).toEqual(Array(9).fill(64));
    });
    it('ceil平均池化排除填充，最近邻复制裁剪保持奇数边界', () => {
        const p = pool(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), 3, 5, 1);
        expect([...p]).toEqual([4, 6, 7.5, 11.5, 13.5, 15]);
        expect([...upsample(p, 3, 3, 5, 1)]).toEqual([4, 4, 6, 6, 7.5, 4, 4, 6, 6, 7.5, 11.5, 11.5, 13.5, 13.5, 15]);
        expect([...depthwise(new Float32Array(6).fill(1), 2, 3, 1, new Float32Array(9).fill(1), Float32Array.of(0))]).toEqual([4, 6, 4, 4, 6, 4]);
    });
});

describe('双流v2阶段2网络与价值', () => {
    it('校验权重版本、形状、完整性及非有限值', () => {
        const { manifest, binary } = randomWeights();
        expect(Object.keys(loadModelWeights(manifest, binary))).toHaveLength(manifest.tensors.length);
        expect(() => loadModelWeights({ ...manifest, schema: '错误版本' }, binary)).toThrow();
        expect(() => loadModelWeights({ ...manifest, tensors: manifest.tensors.slice(1) }, binary)).toThrow();
        const bad = binary.slice(0); new Float32Array(bad)[0] = NaN;
        expect(() => loadModelWeights(manifest, bad)).toThrow();
        expect(() => loadModelWeights(manifest, binary.slice(4))).toThrow();
    });
    it('完整前向保持输入字节、非活跃槽为零，边际与条件分布归一，变图复用不污染历史输出', () => {
        const { manifest, binary } = randomWeights(), model = new DualStreamModel(manifest, binary), state = createDemoState();
        const a = encodeDualObservation(state, getLegalActions(state, state.currentPlayer));
        const before = [a.entityTokens.slice(), a.relationalBias.slice(), a.spatialTensor.slice()];
        const out = model.forward(a), originalLogits = out.logits.slice();
        expect(out.valueProbs.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
        for (let i = 0; i < 6; i++) if (!a.playerOrder.active[i]) expect(out.valueProbs[i]).toBe(0);
        expect(out.actorPrior.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
        for (let actor = 0; actor < a.actions.actorMask.length; actor++) if (a.actions.actorMask[actor]) {
            let sum = 0; for (let i = 0; i < out.logits.length; i++) if (a.actions.pointers[i * 5] === actor) sum += out.conditionalPrior[i];
            expect(sum).toBeCloseTo(1, 5);
        }
        const other = structuredClone(a); other.relationalBias.fill(3); other.playerOrder.features[5] += 1;
        model.forward(other);
        const repeated = model.forward(a), fresh = new DualStreamModel(manifest, binary).forward(a);
        expect([...repeated.logits]).toEqual([...fresh.logits]); expect([...out.logits]).toEqual([...originalLogits]);
        expect([...repeated.valueProbs]).toEqual([...fresh.valueProbs]); expect([...repeated.valueProbs].every(Number.isFinite)).toBe(true);
        expect([...a.entityTokens]).toEqual([...before[0]]); expect([...a.relationalBias]).toEqual([...before[1]]); expect([...a.spatialTensor]).toEqual([...before[2]]);
        const invalid = structuredClone(a); invalid.entityTokens[33] = -1; expect(() => model.forward(invalid)).toThrow();
        invalid.entityTokens[33] = 0; invalid.relationalBias[0] = Infinity; expect(() => model.forward(invalid)).toThrow();
    });
    it('1v1、FFA和多联盟标量价值以己方质量减最强敌联盟质量计算', () => {
        const state = createDemoState();
        state.players = Array.from({ length: 4 }, (_, id) => ({ id, isAlive: true, gold: 0, commanderDeathCount: 0 })); state.currentPlayer = 0;
        state.rules = { ...state.rules, alliances: { 0: 10, 1: 20, 2: 10, 3: 30 } };
        const order = encodePlayerOrder(state);
        expect(computeScalarValue([.3, .25, .2, .25, 0, 0], state, order)).toBeCloseTo(.25);
        state.rules.alliances = { 0: 10, 1: 20, 2: 10, 3: 20 };
        expect(computeScalarValue([.3, .25, .2, .25, 0, 0], state, order)).toBeCloseTo(0);
        state.players = state.players.slice(0, 2); state.units = state.units.filter(u => u.ownerId < 2); state.rules.alliances = {};
        expect(computeScalarValue([.7, .3, 0, 0, 0, 0], state, encodePlayerOrder(state))).toBeCloseTo(.4);
    });
});
