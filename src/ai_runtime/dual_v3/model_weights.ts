import { ARCHITECTURE } from './architecture';
import { SCHEMA_ID } from '../dual_v2/contract';
import type { TensorWeights } from '../dual_v2/tensor_ops';

export const MODEL_ID = 'dual-stream-v3-2m-v1';
export interface WeightTensor { name: string; shape: number[]; offset: number; length: number; values?: number[] }
export interface WeightManifest { model: string; schema: string; dtype: 'float32-le'; parameters: number; architecture?: typeof ARCHITECTURE; tensors: WeightTensor[] }

export function expectedWeightShapes(): Record<string, number[]> {
    const shapes: Record<string, number[]> = {};
    const dense = (name: string, input: number, output: number, kernel = 0, bias = true) => { shapes[name + '.weight'] = kernel ? [output, input, kernel, kernel] : [output, input]; if (bias) shapes[name + '.bias'] = [output]; };
    const normalization = (name: string, channels: number) => { shapes[name + '.weight'] = [channels]; shapes[name + '.bias'] = [channels]; };
    const block = (name: string, c: number) => { const r = c === 128 ? 32 : 24; dense(name + '.reduce', c, r, 1); normalization(name + '.norm1', r); shapes[name + '.depth.weight'] = [r, 1, 3, 3]; shapes[name + '.depth.bias'] = [r]; normalization(name + '.norm2', r); dense(name + '.expand', r, c, 1); normalization(name + '.norm3', c); };
    dense('map.stem', 34, 64, 3); normalization('map.stem_norm', 64);
    for (const [stage, c] of [64, 96, 128].entries()) for (let i = 0; i < 2; i++) block(`map.stage${stage}.${i}`, c);
    dense('map.down1', 64, 96, 1); dense('map.down2', 96, 128, 1); dense('map.context', 66, 128);
    dense('map.up1', 128, 96, 1); block('map.decode1', 96); dense('map.up0', 96, 64, 1); block('map.decode0', 64); dense('map.out', 64, 96, 1);
    dense('entity_proj', 162, 192); normalization('entity_norm', 192); dense('global_proj', 162, 192); normalization('global_norm', 192);
    dense('rel1', 16, 16); dense('rel2', 16, 8);
    for (let i = 0; i < 4; i++) { const b = `blocks.${i}`; normalization(b + '.ln1', 192); dense(b + '.qkv', 192, 576); dense(b + '.proj', 192, 192); normalization(b + '.ln2', 192); dense(b + '.ff1', 192, 576); dense(b + '.ff2', 576, 192); }
    dense('who', 192, 1); dense('tile_q', 192, 64); dense('tile_k', 96, 64, 1); dense('what_entity', 192, 36); dense('what_tile', 64, 36, 0, false);
    dense('target_q', 192, 256); dense('target_k', 192, 256); shapes.target_rel = [4, 16]; shapes.headBias = [15];
    dense('value1', 683, 256); normalization('value_norm', 256); dense('value2', 256, 1); shapes.army_scale = [1];
    return shapes;
}

/** 二进制为连续小端float32；JSON也可内嵌values，形状和所有权重均严格校验。 */
export function loadModelWeights(manifest: WeightManifest, binary?: ArrayBuffer): TensorWeights {
    if (manifest.model !== MODEL_ID || manifest.schema !== SCHEMA_ID || manifest.dtype !== 'float32-le') throw Error('模型或输入契约版本不匹配');
    if (JSON.stringify(manifest.architecture) !== JSON.stringify(ARCHITECTURE)) throw Error('缺少或不匹配的大容量架构配置');
    const expected = expectedWeightShapes(), weights: Record<string, Float32Array> = {}; let offset = 0;
    if (binary && binary.byteLength !== manifest.parameters * 4) throw Error('二进制权重长度错误');
    const view = binary ? new DataView(binary) : undefined;
    for (const tensor of manifest.tensors) {
        const shape = expected[tensor.name];
        if (!shape || weights[tensor.name] || JSON.stringify(shape) !== JSON.stringify(tensor.shape) || tensor.offset !== offset || tensor.length !== shape.reduce((a, b) => a * b, 1)) throw Error(`权重形状或偏移错误：${tensor.name}`);
        if (!view && tensor.values?.length !== tensor.length) throw Error('JSON内嵌权重缺失');
        const data = new Float32Array(tensor.length);
        for (let i = 0; i < data.length; i++) { data[i] = view ? view.getFloat32((offset + i) * 4, true) : tensor.values![i]; if (!Number.isFinite(data[i])) throw Error('模型包含非有限权重'); }
        weights[tensor.name] = data; offset += tensor.length;
    }
    if (offset !== manifest.parameters || Object.keys(weights).length !== Object.keys(expected).length) throw Error('模型权重不完整');
    return weights;
}
