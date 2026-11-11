"""最小复现 V15 B5 复制网络后仍复用原网络特征的梯度归属。"""
from pathlib import Path
import copy
import json
import sys
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
from spatial_resnet_model import SpatialResNet

torch.manual_seed(42)
torch.set_num_threads(1)
model = SpatialResNet(action_semantic_dim=53)
x = torch.randn(1, 26, 20, 20)

def features(net):
    z = net.forward_trunk(x)
    positions = [(2, 3), (5, 7), (9, 4)]
    local = torch.stack([z[0, :, y, x] for y, x in positions])
    return torch.cat([local, local, local, torch.zeros(3, 73)], dim=1).unsqueeze(0)

def probe(recompute_on_clone):
    clone = copy.deepcopy(model)
    feat = features(clone if recompute_on_clone else model)
    optimizer = torch.optim.AdamW(clone.parameters(), lr=1e-3, weight_decay=1e-4)
    before = clone.stem.weight.detach().clone()
    loss = torch.nn.functional.cross_entropy(clone.forward_action_logits(feat), torch.tensor([1]))
    loss.backward()
    optimizer.step()
    return {'cloneStemGradIsNone': clone.stem.weight.grad is None,
            'clonePolicyHeadGradIsNone': clone.pol_dense1.weight.grad is None,
            'cloneStemMaxUpdate': float((clone.stem.weight.detach()-before).abs().max())}

result = {'v15StyleOriginalFeatures': probe(False), 'correctCloneFeatures': probe(True),
          'scope': '合成输入最小复现梯度归属，不是完整 B5 重验，也不是棋力因果实验'}
Path(__file__).with_name('clone_graph.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True))
