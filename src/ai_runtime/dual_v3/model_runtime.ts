import { SCHEMA_ID, type DualObservation } from '../dual_v2/contract';
import { spatialForward } from './spatial_model';
import { entityForward } from './entity_model';
import { policyForward } from './policy_model';
import { valueForward } from './value_model';
import { loadModelWeights, type WeightManifest } from './model_weights';
import type { TensorWeights } from '../dual_v2/tensor_ops';
import { TensorWorkspace, withTensorWorkspace } from '../dual_v2/tensor_workspace';
export { computeScalarValue } from './value_model';
export { MODEL_ID, loadModelWeights, type WeightManifest } from './model_weights';

export interface DualModelOutput { logits: Float32Array; actorPrior: Float32Array; conditionalPrior: Float32Array; valueLogits: Float32Array; valueProbs: Float32Array }

export class DualStreamModel {
    private readonly weights: TensorWeights;
    private readonly workspace = new TensorWorkspace();
    constructor(manifest: WeightManifest, binary?: ArrayBuffer) { this.weights = loadModelWeights(manifest, binary); }

    forward(input: DualObservation): DualModelOutput {
        const n = input.entityIndexMap.globalActorIdx, area = input.width * input.height;
        if (input.schema !== SCHEMA_ID || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 6 || input.height < 6 || input.width > 64 || input.height > 64) throw Error('模型仅支持6至64的矩形地图与冻结输入契约');
        if (input.spatialTensor.length !== area * 34 || input.entityTokens.length !== n * 66 || input.relationalBias.length !== n * n * 16 || input.playerOrder.features.length !== 66 || input.playerOrder.active.length !== 6 || input.actions.actorMask.length !== n + 1 || !input.actions.pointers.length || input.actions.pointers.length % 5) throw Error('模型输入张量形状错误');
        for (const data of [input.spatialTensor, input.entityTokens, input.relationalBias, input.playerOrder.features]) for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) throw Error('模型输入包含非有限数值');
        for (let i = 0; i < n; i++) { const x = input.entityTokens[i * 66 + 33], y = input.entityTokens[i * 66 + 34]; if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= input.width || y >= input.height) throw Error('实体空间采样坐标越界'); }
        const p = input.actions.pointers;
        for (let a = 0; a < p.length; a += 5) if (p[a] < 0 || p[a] > n || !input.actions.actorMask[p[a]] || p[a + 1] < -1 || p[a + 1] >= area || p[a + 2] < 0 || p[a + 2] >= 15 || p[a + 3] < -1 || p[a + 3] >= 21 || p[a + 4] < -1 || p[a + 4] >= n || (p[a + 4] >= 0 && ![1, 7, 8, 9].includes(p[a + 2]))) throw Error('合法动作指针越界');
        return withTensorWorkspace(this.workspace, () => {
            const spatial = spatialForward(input, this.weights), entity = entityForward(input, spatial.map, spatial.pooled, this.weights);
            const out = { ...policyForward(input, entity.entities, spatial.map, entity.relations, this.weights), ...valueForward(input, entity.entities, spatial.pooled, this.weights) };
            return { logits: out.logits.slice(), actorPrior: out.actorPrior.slice(), conditionalPrior: out.conditionalPrior.slice(), valueLogits: out.valueLogits.slice(), valueProbs: out.valueProbs.slice() };
        });
    }
}
