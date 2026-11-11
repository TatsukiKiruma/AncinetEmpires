"""仅验证生产前向、损失和反向链，不导出候选模型，不消费训练/Dev/Sealed 数据。"""
import sys
import json
import struct
from pathlib import Path
import os
HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage8_20261110_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-fp32-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'cache')
sys.path.insert(0, str(HERE.parent / 'stage7'))
from fp32_forward import forward, torch
from common import load_model, move
from ragged_batch import collate
from data import decode, exact
from train_metrics import brier_ce

torch.set_num_threads(2)
rows = []
with Path(sys.argv[2]).open('rb') as stream:
    index = 0
    while first := stream.read(1):
        ms, bs = struct.unpack('<II', first + exact(stream, 7))
        meta, body = json.loads(exact(stream, ms)), exact(stream, bs)
        if index in (0, 4, 8, 12, 16):
            row, = decode(meta, body)
            row['valueTarget'].zero_(); row['valueTarget'][0] = 1
            row['valueMask'].fill_(True)
            rows.append(row)
        index += 1
assert len(rows) == 5
model = load_model(sys.argv[1]).accurate_reductions(False).cuda().eval()
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-6)
x = move(collate(rows), 'cuda')
out = forward(model, x)
brier, ce = brier_ce(out, x)
loss = (brier + ce).mean() + torch.stack([-out['logits'][i, :len(r['pointers'])].log_softmax(-1)[0] for i, r in enumerate(rows)]).mean()
assert torch.isfinite(loss).item()
loss.backward()
norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
optimizer.step()
assert all(torch.isfinite(p).all().item() for p in model.parameters())
(HERE / 'TRAIN_SMOKE.json').write_text(json.dumps(dict(passed=True, syntheticSamples=5, loss=float(loss.detach()), gradientNorm=float(norm), exportedModels=0, sealedAccess=0)), encoding='utf-8')
