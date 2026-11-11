"""继承 speed_bench G1 的 FP32 前向，只在本进程生成，不改写历史文件。"""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path[:0] = [str(HERE.parent / 'stage6'), str(HERE.parent / 'stage3'), str(ROOT / 'ai_training/gpu'),
               str(ROOT / 'ai_training/dual_stream_v2_phase2_20261020')]
import torch
import ragged_map
native_norm, native_pool = ragged_map.norm, ragged_map.pool
import accurate_batch
ragged_map.norm, ragged_map.pool = native_norm, native_pool
source = (HERE.parent / 'stage6/accurate_batch.py').read_text(encoding='utf-8')
source = source[source.index('def forward_batch'):].replace('.double()', '.float()').replace('torch.float64', 'torch.float32').replace(', True)', ', False)')
def relation_mlp(model, relation):
    # 窄矩阵展平行数限制在2^18，避免特定ROCm内核的大行数寻址问题。
    shape = relation.shape
    flat = relation.reshape(-1, shape[-1])
    chunks = [model.rel2(torch.nn.functional.relu(model.rel1(chunk)))
              for chunk in flat.split(262144, dim=0)]
    return torch.cat(chunks, dim=0).reshape(*shape[:-1], -1)

assert source.count('m.rel2(F.relu(m.rel1(rel)))') == 1
source = source.replace('m.rel2(F.relu(m.rel1(rel)))', 'relation_mlp(m, rel)')
scope = {'torch': torch, 'F': torch.nn.functional, 'ragged_map': ragged_map, 'ops': accurate_batch.ops,
         'relation_mlp': relation_mlp}
exec(compile(source, str(HERE / 'fp32_forward.py'), 'exec'), scope)
forward = scope['forward_batch']
