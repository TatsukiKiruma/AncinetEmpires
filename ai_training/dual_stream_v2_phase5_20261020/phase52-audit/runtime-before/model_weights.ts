import { SCHEMA_ID } from './contract';
import type { TensorWeights } from './tensor_ops';

export const MODEL_ID = 'dual-stream-v2-phase2-v1';
export interface WeightTensor { name: string; shape: number[]; offset: number; length: number; values?: number[] }
export interface WeightManifest { model: string; schema: string; dtype: 'float32-le'; parameters: number; tensors: WeightTensor[] }

export function expectedWeightShapes(): Record<string, number[]> {
    const shapes: Record<string, number[]> = {};
    const dense = (name: string, input: number, output: number, kernel = 0, bias = true) => { shapes[name + '.weight'] = kernel ? [output, input, kernel, kernel] : [output, input]; if (bias) shapes[name + '.bias'] = [output]; };
    const normalization = (name: string, channels: number) => { shapes[name + '.weight'] = [channels]; shapes[name + '.bias'] = [channels]; };
    const block = (name: string, c: number) => { const r = c === 96 ? 16 : 8; dense(name + '.reduce', c, r, 1); normalization(name + '.norm1', r); shapes[name + '.depth.weight'] = [r, 1, 3, 3]; shapes[name + '.depth.bias'] = [r]; normalization(name + '.norm2', r); dense(name + '.expand', r, c, 1); normalization(name + '.norm3', c); };
    dense('map.stem', 34, 48, 3); normalization('map.stem_norm', 48);
    for (const [stage, c] of [48, 64, 96].entries()) for (let i = 0; i < 2; i++) block(`map.stage${stage}.${i}`, c);
    dense('map.down1', 48, 64, 1); dense('map.down2', 64, 96, 1); dense('map.context', 66, 96);
    dense('map.up1', 96, 64, 1); block('map.decode1', 64); dense('map.up0', 64, 48, 1); block('map.decode0', 48); dense('map.out', 48, 64, 1);
    dense('entity_proj', 130, 128); normalization('entity_norm', 128); dense('global_proj', 130, 128); normalization('global_norm', 128);
    dense('rel1', 16, 16); dense('rel2', 16, 4);
    for (let i = 0; i < 2; i++) { const b = `blocks.${i}`; normalization(b + '.ln1', 128); dense(b + '.qkv', 128, 384); dense(b + '.proj', 128, 128); normalization(b + '.ln2', 128); dense(b + '.ff1', 128, 256); dense(b + '.ff2', 256, 128); }
    dense('who', 128, 1); dense('tile_q', 128, 64); dense('tile_k', 64, 64, 1); dense('what_entity', 128, 36); dense('what_tile', 64, 36, 0, false);
    dense('target_q', 128, 256); dense('target_k', 128, 256); shapes.target_rel = [4, 16]; shapes.headBias = [15];
    dense('value1', 459, 128); normalization('value_norm', 128); dense('value2', 128, 1); shapes.army_scale = [1];
    return shapes;
}

/** 二进制为连续小端float32；JSON也可内嵌values，形状和所有权重均严格校验。 */
export function loadModelWeights(manifest: WeightManifest, binary?: ArrayBuffer): TensorWeights {
    if (manifest.model !== MODEL_ID || manifest.schema !== SCHEMA_ID || manifest.dtype !== 'float32-le') throw Error('模型或输入契约版本不匹配');
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
