"""常驻批量推理进程：stdin/stdout长度前缀协议，游戏规则由Node权威引擎执行。"""
import argparse
import json
import struct
import sys
import torch
from common import device_for, identity, load_model, move
from batch_model import collate, forward_batch
from data import decode, exact, groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='auto')
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    torch.set_num_threads(2)
    device = device_for(args.device)
    model = load_model(args.model).to(device).eval()
    print(json.dumps(identity(device)), file=sys.stderr, flush=True)
    source, sink = sys.stdin.buffer, sys.stdout.buffer
    with torch.inference_mode():
        while first := source.read(1):
            ms, bs = struct.unpack('<II', first + exact(source, 7))
            if not 0 < ms < 2**24 or not 0 < bs < 2**29:
                raise ValueError('推理请求长度无效')
            rows = decode(json.loads(exact(source, ms)), exact(source, bs))
            outputs = []
            for batch in groups(rows, 32):
                x = move(collate(batch), device)
                out = forward_batch(model, x)
                logits, values = out['logits'].cpu(), out['valueProbs'].cpu()
                for i, row in enumerate(batch):
                    outputs.append(dict(logits=logits[i, :len(row['pointers'])].tolist(), valueProbs=values[i].tolist()))
            payload = json.dumps(outputs, allow_nan=False).encode()
            sink.write(struct.pack('<I', len(payload)) + payload)
            sink.flush()


if __name__ == '__main__':
    main()
