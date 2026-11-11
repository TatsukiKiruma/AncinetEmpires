"""使用已约定的高精度归约核验导出合同；正式训练和推理仍为 G1。"""
import json
from pathlib import Path
import struct
import sys

from fp32_forward import torch
from common import load_model
from data import decode, exact


def main():
    prefix, path, target = sys.argv[1:]
    torch.set_num_threads(2)
    model = load_model(prefix).accurate_reductions(True).eval()
    tmp = Path(target).with_suffix('.tmp')
    with torch.inference_mode(), Path(path).open('rb') as stream, tmp.open('w', encoding='utf-8') as out:
        while first := stream.read(1):
            ms, bs = struct.unpack('<II', first + exact(stream, 7))
            meta = json.loads(exact(stream, ms))
            row, = decode(meta, exact(stream, bs))
            values = model(row)
            out.write(json.dumps({k: values[k].tolist() for k in ('logits', 'valueLogits', 'valueProbs')}, allow_nan=False) + '\n')
    tmp.replace(target)


if __name__ == '__main__':
    main()
