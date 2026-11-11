"""为本次导出生成跨语言参考，夹具来自独立保存前态。"""
import argparse
import hashlib
import json
import struct
from pathlib import Path
import torch
from runtime import HERE, Encoder, load_model

parser = argparse.ArgumentParser()
parser.add_argument('prefix', type=Path)
args = parser.parse_args()
torch.set_num_threads(2)
checks = json.loads((HERE / 'GPU_RUNTIME_VERIFIED.json').read_text('utf-8'))
requests = [dict(parentId=r['parentId'], macro=r['macro'], sub=r['subAction'], choice=0, split='train') for r in checks['sourceSamples']]
encoder = Encoder(HERE / 'parity-encoder.stderr.log')
try:
    rows = encoder.rows(requests)
finally:
    encoder.close()
model = load_model(args.prefix).accurate_reductions().eval()
references = []
with (HERE / 'parity.frames').open('wb') as stream, torch.no_grad():
    for i, row in enumerate(rows):
        parts, arrays, offset = [], [], 0
        for name, value in row.items():
            if name == 'source':
                continue
            array = value.numpy()
            raw = array.tobytes()
            arrays.append(dict(name=name, dtype=array.dtype.str, shape=list(array.shape), offset=offset, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
            parts.append(raw)
            offset += len(raw)
        raw = b''.join(parts)
        meta = json.dumps(dict(arrays=arrays, sha256=hashlib.sha256(raw).hexdigest())).encode()
        stream.write(struct.pack('<II', len(meta), len(raw)) + meta + raw)
        out = model(row)
        references.append(dict(id=i, outputs={k: out[k].tolist() for k in ['logits', 'valueLogits', 'valueProbs']}))
(HERE / 'parity-reference.json').write_text(json.dumps(references), 'utf-8')
