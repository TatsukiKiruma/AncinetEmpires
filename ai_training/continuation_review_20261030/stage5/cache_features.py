"""只读已准入张量，缓存冻结主干价值特征，不执行梯度更新。"""
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sys
import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'gpu'))
from common import load_model
from data import decode
from isolation import PREFIX
from write_budget import reserve


def main():
    source, output = map(Path, sys.argv[1:3])
    output.mkdir(exist_ok=False)
    torch.set_num_threads(2)
    model = load_model(PREFIX).accurate_reductions(True).cuda().eval()
    model.requires_grad_(False)
    captured = []
    hook = model.value1.register_forward_pre_hook(lambda module, args: captured.append(args[0].detach()))
    total = 0
    root = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
    with torch.inference_mode():
        for file in sorted(source.glob('*.json.gz')):
            fixture = json.loads(gzip.decompress(file.read_bytes()))
            rows = decode(fixture['metadata'], base64.b64decode(fixture['bytes']))
            cached = []
            for row in rows:
                captured.clear()
                gpu = {k: v.cuda() if isinstance(v, torch.Tensor) else v for k, v in row.items()}
                result = model(gpu)
                cached.append(dict(slot_vectors=captured[0].cpu().numpy(), players=row['players'].numpy(),
                                   active=row['active'].numpy(), valueTarget=row['valueTarget'].numpy(),
                                   valueMask=row['valueMask'].numpy(), omniBaseValueLogits=result['valueLogits'].cpu().numpy()))
            buffer = io.BytesIO()
            np.savez_compressed(buffer, **{key: np.stack([r[key] for r in cached]) for key in cached[0]},
                                sources=np.array(json.dumps(fixture['metadata']['sources'])),
                                inputSha256=np.array(hashlib.sha256(file.read_bytes()).hexdigest()))
            payload = buffer.getvalue()
            reserve(len(payload))
            size = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
            if shutil.disk_usage(root).free < 15_000_000_000 or 2 * (size + len(payload)) > 3_000_000_000:
                raise RuntimeError('磁盘预算保护停止')
            with (output / (file.name + '.npz')).open('xb') as stream:
                stream.write(payload)
            total += len(rows)
    hook.remove()
    report = json.dumps({'samples': total, 'trainingUpdates': 0, 'sealedAccess': 0})
    reserve(len(report.encode('utf-8')))
    with (output / 'CACHE_REPORT.json').open('x', encoding='utf-8') as stream:
        stream.write(report)
    print(json.dumps({'samples': total}))


if __name__ == '__main__':
    main()
