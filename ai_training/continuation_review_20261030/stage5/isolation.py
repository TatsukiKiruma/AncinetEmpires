"""在真实训练初态上比较完整前向与缓存特征前向的价值及梯度。"""
import base64
import gzip
import json
from pathlib import Path
import sys
import torch
from torch.nn import functional as F

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'gpu'))
from common import load_model
from data import decode

PREFIX = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/final'
VALUE = {'value1', 'value_norm', 'value2', 'army_scale'}


def head(m, vectors, players, active):
    logits = m.value2(F.relu(m.value_norm(m.value1(vectors)))).flatten()
    army = players[:, 7].clamp_min(0).double() * active
    logits = (logits.double() + m.army_scale.double() * army / army.sum().clamp_min(1e-12)).float().masked_fill(~active.bool(), -1e9)
    import accurate_ops as ops
    return logits, ops.softmax(logits, -1, True)


def relative(a, b):
    return float(torch.linalg.vector_norm((a - b).double()) / torch.linalg.vector_norm(a.double()).clamp_min(1e-12))


def main():
    torch.set_num_threads(2)
    m = load_model(PREFIX).accurate_reductions(True).cuda().eval()
    for name, param in m.named_parameters():
        param.requires_grad_(name.split('.')[0] in VALUE)
    params = [p for p in m.parameters() if p.requires_grad]
    assert sum(p.numel() for p in params) == 175874
    capture = []
    hook = m.value1.register_forward_pre_hook(lambda module, args: capture.append(args[0].detach()))
    rows = []
    files = sorted(Path(sys.argv[1]).glob('*.json.gz'))
    assert len(files) >= 64
    for file in files:
        fixture = json.loads(gzip.decompress(file.read_bytes()))
        row = {k: v.cuda() if isinstance(v, torch.Tensor) else v for k, v in decode(fixture['metadata'], base64.b64decode(fixture['bytes']))[0].items()}
        capture.clear()
        out = m(row)
        vectors = capture[0]
        probe = torch.arange(1, 7, device='cuda')
        grad = torch.autograd.grad((out['valueProbs'] * probe).sum(), params)
        logits, probs = head(m, vectors, row['players'], row['active'])
        cached_grad = torch.autograd.grad((probs * probe).sum(), params)
        errors = [relative(out['valueLogits'], logits), relative(out['valueProbs'], probs), relative(torch.cat([g.flatten() for g in grad]), torch.cat([g.flatten() for g in cached_grad]))]
        rows.append({'file': file.name, 'errors': errors, 'shape': list(row['spatial'].shape)})
        print(json.dumps(rows[-1]), flush=True)
    hook.remove()
    report = {'samples': len(rows), 'passed': all(max(r['errors']) < 1e-6 for r in rows), 'rows': rows,
              'exportPolicyParity': '尚未执行，不代表完整隔离门禁通过', 'sealedAccess': 0}
    (HERE / 'VALUE_HEAD_FORWARD_GRADIENT_CHECK.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
