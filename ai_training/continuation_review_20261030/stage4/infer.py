"""第四阶段常驻异尺寸推理；复用第三阶段已校验的掩码地图前向，不改动旧服务。"""
import argparse
import json
from pathlib import Path
import struct
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'ai_training/gpu'))
sys.path.insert(0, str(HERE.parent / 'stage3'))
import torch
from common import device_for, identity, load_model, move
from data import decode, exact
from accurate_batch import collate, forward_batch


def infer(model, rows, device, chunk=32):
    if not 1 <= len(rows) <= 128:
        raise ValueError('单次请求必须包含1至128个观测')
    outputs = []
    offset = 0
    while offset < len(rows):
        # 实体关系与注意力为平方开销，大盘面主动缩小物理微批，避免显存峰值。
        count = min(chunk, len(rows) - offset)
        while count > 1:
            batch = rows[offset:offset + count]
            n = max(len(r['entities']) for r in batch)
            area = max(r['spatial'].shape[-1] for r in batch) * max(r['spatial'].shape[-2] for r in batch)
            if count * (n * n * 320 + area * 4096) < 1_500_000_000:
                break
            count = max(1, count // 2)
        batch = rows[offset:offset + count]
        out = forward_batch(model, move(collate(batch), device))
        fields = {key: out[key].cpu() for key in ('logits', 'valueLogits', 'valueProbs', 'actorPrior')}
        for i, row in enumerate(batch):
            values = {key: value[i, :len(row['pointers'])] if key == 'logits' else value[i] for key, value in fields.items()}
            # 物理填充的全局行动者槽映射回单个观测末槽。
            values['actorPrior'] = torch.cat([fields['actorPrior'][i, :len(row['entities'])], fields['actorPrior'][i, -1:]])
            if not all(torch.isfinite(v).all().item() for v in values.values()):
                raise ValueError('推理输出含NaN或Inf')
            outputs.append({key: value.tolist() for key, value in values.items()})
        offset += count
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--model', required=True)
    parser.add_argument('--chunk', type=int, default=32)
    args = parser.parse_args()
    if not 1 <= args.chunk <= 64:
        raise ValueError('物理微批必须在1至64内')
    torch.set_num_threads(2)
    device = device_for(args.device)
    model = load_model(args.model).accurate_reductions(True).to(device).eval()
    print(json.dumps(identity(device)), file=sys.stderr, flush=True)
    source, sink = sys.stdin.buffer, sys.stdout.buffer
    with torch.inference_mode():
        while first := source.read(1):
            ms, bs = struct.unpack('<II', first + exact(source, 7))
            if not 0 < ms < 2**24 or not 0 < bs < 2**29:
                raise ValueError('推理请求长度无效')
            rows = decode(json.loads(exact(source, ms)), exact(source, bs))
            payload = json.dumps(infer(model, rows, device, args.chunk), allow_nan=False).encode()
            sink.write(struct.pack('<I', len(payload)) + payload)
            sink.flush()


if __name__ == '__main__':
    main()
