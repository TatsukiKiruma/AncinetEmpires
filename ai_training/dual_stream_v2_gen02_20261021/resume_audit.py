"""只读核对最终检查点与导出模型，实际恢复优化器和随机状态但不写回模型。"""
import hashlib
import json
import os
import random
from pathlib import Path
import numpy as np
import torch
from data import DIR, load_model

folder = DIR / 'generations/gen_01'
checkpoint = torch.load(folder / 'checkpoint.pt', weights_only=False)
root = DIR.parents[1]
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
sources = {p: sha(root / p) == digest for p, digest in checkpoint['sourceIdentity'].items()}
inputs = {p: sha(DIR / p) == digest for p, digest in checkpoint['dataIdentity'].items()}
assert all(sources.values()) and all(inputs.values())
assert sha(DIR / (checkpoint['parentModel'] + '.bin')) == checkpoint['parentSha256']
os.environ['LEAGUE_MODEL'] = str(folder / 'model')
model = load_model('model')
assert all(torch.equal(model.state_dict()[name], value) for name, value in checkpoint['model'].items())
optimizer = torch.optim.AdamW(model.parameters(), lr=.0001, weight_decay=.0001)
optimizer.load_state_dict(checkpoint['optimizer'])
steps = [int(state['step']) for state in optimizer.state.values() if 'step' in state]
assert steps and min(steps) == max(steps) == checkpoint['cursor']['updates']
def restore_rng():
    torch.set_rng_state(checkpoint['torchRng']); np.random.set_state(checkpoint['numpyRng']); random.setstate(checkpoint['pythonRng'])
restore_rng(); first = (torch.rand(4).tolist(), np.random.rand(4).tolist(), [random.random() for _ in range(4)])
restore_rng(); second = (torch.rand(4).tolist(), np.random.rand(4).tolist(), [random.random() for _ in range(4)])
assert first == second
result = dict(passed=True, checkpointSha256=sha(folder / 'checkpoint.pt'), modelSha256=sha(folder / 'model.bin'), checkedSourceFiles=len(sources), checkedInputFiles=len(inputs), parentModelMatched=True, exportedWeightsMatchCheckpoint=True, optimizerRestored=True, optimizerStep=min(steps), cursor=checkpoint['cursor'], rngReplayEqual=True, modelWritten=False, auditScope='最终检查点恢复组件核对；未将其冒称中断前后整段训练逐位复现试验')
(DIR / 'checkpoint-resume-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
