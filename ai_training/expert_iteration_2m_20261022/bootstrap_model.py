"""从冻结双流实现构建独立大容量版本；不改写旧模型或旧运行时。"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OLD = ROOT / 'src/ai_runtime/dual_v2'
NEW = ROOT / 'src/ai_runtime/dual_v3'


def numbers(text, mapping):
    return re.sub(r'\b(?:' + '|'.join(map(str, mapping)) + r')\b', lambda m: str(mapping[int(m[0])]), text)


def main():
    NEW.mkdir(exist_ok=True)
    for name in ['spatial_model', 'entity_model', 'attention', 'policy_model', 'value_model', 'model_runtime', 'model_weights']:
        target = NEW / (name + '.ts')
        assert not target.exists(), f'拒绝覆盖：{target}'
        s = (OLD / target.name).read_text('utf-8')
        if name == 'spatial_model':
            s = s.replace('c === 96 ? 16 : 8', 'c === 96 ? 16 : 8')
            s = numbers(s, {48: 64, 64: 96, 96: 128})
            s = s.replace('c === 128 ? 16 : 8', 'c === 128 ? 32 : 24')
            # 输出通道独立于编码器中间通道。
            s = s.replace("64, 96, 'map.out'", "64, 96, 'map.out'")
        elif name == 'entity_model':
            s = numbers(s, {130: 162, 128: 192, 384: 576, 256: 576, 64: 96})
            s = s.replace('1 / 96 : 1', '1 / 64 : 1')
            s = s.replace('16, 4,', '16, 8,').replace('layer < 2', 'layer < 4')
        elif name == 'attention':
            s = numbers(s, {128: 192, 384: 576, 256: 384, 32: 24})
            s = s.replace('head < 4', 'head < 8').replace('* 4 + head', '* 8 + head')
        elif name == 'policy_model':
            s = numbers(s, {128: 192})
            s = s.replace('usedTiles.length * 64', 'usedTiles.length * 96')
            s = s.replace('usedTiles[i] * 64, (usedTiles[i] + 1) * 64), i * 64', 'usedTiles[i] * 96, (usedTiles[i] + 1) * 96), i * 96')
            s = s.replace('tileFeatures, usedTiles.length, 64, 64', 'tileFeatures, usedTiles.length, 96, 64')
        elif name == 'value_model':
            s = numbers(s, {459: 683, 128: 192, 139: 203, 267: 395, 395: 587})
            s = s.replace("weights['value1.weight'], 192", "weights['value1.weight'], 256")
            s = s.replace("norm(hidden, 6, 192", "norm(hidden, 6, 256")
            s = s.replace("linear(normalized, 6, 192", "linear(normalized, 6, 256")
        elif name == 'model_weights':
            s = s.replace('dual-stream-v2-phase2-v1', 'dual-stream-v3-2m-v1')
            start = s.index('export function expectedWeightShapes')
            end = s.index('/** 二进制')
            s = s[:start] + SHAPES + '\n' + s[end:]
            s = s.replace("parameters: number; tensors", "parameters: number; architecture?: typeof ARCHITECTURE; tensors")
            s = s.replace("const expected = expectedWeightShapes()", "if (JSON.stringify(manifest.architecture) !== JSON.stringify(ARCHITECTURE)) throw Error('缺少或不匹配的大容量架构配置');\n    const expected = expectedWeightShapes()")
            s = "import { ARCHITECTURE } from './architecture';\n" + s
        # 算子、工作区与观测合同仍复用公共可靠实现；维度相关前向独立。
        for shared in ['tensor_workspace', 'tensor_ops', 'contract']:
            s = s.replace("'./" + shared + "'", "'../dual_v2/" + shared + "'")
        target.write_text(s, 'utf-8')
    source = (HERE.parent / 'dual_stream_v2_phase2_20261020/model_torch.py').read_text('utf-8')
    source = source.replace('import accurate_ops as ops', "import sys\nsys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'dual_stream_v2_phase2_20261020'))\nimport accurate_ops as ops\nARCHITECTURE = dict(spatialChannels=[64,96,128], residualRanks=[24,24,32], spatialOutput=96, transformerLayers=4, entityWidth=192, attentionHeads=8, feedForward=576, valueHidden=256, pointerWidth=64, playerSlots=6)")
    source = source.replace('dual-stream-v2-phase2-v1', 'dual-stream-v3-2m-v1')
    a, b = source.index('class ResBlock2D'), source.index('class RelationBlock')
    source = source[:a] + numbers(source[a:b], {48:64,64:96,96:128}).replace('{64: 8, 96: 8, 128: 16}', '{64: 24, 96: 24, 128: 32}') + source[b:]
    a, b = source.index('class RelationBlock'), source.index('class DualStreamModel')
    source = source[:a] + numbers(source[a:b], {128:192,384:576,256:576,32:24}).replace('3, 4, 24', '3, 8, 24') + source[b:]
    a = source.index('class DualStreamModel')
    tail = numbers(source[a:], {130:162,128:192,459:683})
    tail = tail.replace('self.rel2 = ops.Linear(16, 4)', 'self.rel2 = ops.Linear(16, 8)')
    tail = tail.replace('[RelationBlock(), RelationBlock()]', '[RelationBlock() for _ in range(4)]')
    tail = tail.replace('self.tile_k = ops.Conv2d(64, 64', 'self.tile_k = ops.Conv2d(96, 64')
    tail = tail.replace('self.value1 = ops.Linear(683, 192)', 'self.value1 = ops.Linear(683, 256)')
    tail = tail.replace('self.value_norm = ops.LayerNorm(192)', 'self.value_norm = ops.LayerNorm(256)')
    tail = tail.replace('self.value2 = ops.Linear(192, 1)', 'self.value2 = ops.Linear(256, 1)')
    tail = tail.replace('parameters=offset, tensors=entries', 'parameters=offset, architecture=ARCHITECTURE, tensors=entries')
    target = HERE / 'model.py'
    assert not target.exists(), f'拒绝覆盖：{target}'
    target.write_text(source[:a] + tail, 'utf-8')
    batch = (HERE.parent / 'dual_stream_v2_phase3_20261020/batch_model.py').read_text('utf-8')
    batch = batch.replace('3, 4, 32', '3, 8, 24').replace('(32 ** .5)', '(24 ** .5)').replace('n + 1, 128', 'n + 1, 192')
    target = HERE / 'batch_model.py'
    assert not target.exists(), f'拒绝覆盖：{target}'
    target.write_text(batch, 'utf-8')


SHAPES = '''export function expectedWeightShapes(): Record<string, number[]> {
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
'''

if __name__ == '__main__':
    main()
