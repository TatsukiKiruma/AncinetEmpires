"""最终模型在89个冻结输入上的逐归约精确参考。"""
import json
import torch
from data import DIR, decode, load_model, save
torch.set_num_threads(1)
torch.backends.mkldnn.enabled = False
torch.use_deterministic_algorithms(True)
model = load_model('dual-v2-stage4-pure').accurate_reductions().eval()
samples = decode(json.loads((DIR / 'samples.json').read_text('utf-8')), (DIR / 'samples.bin').read_bytes())
references = []
with torch.no_grad():
    for sample in samples:
        out = model(sample)
        references.append({k: out[k].tolist() for k in ['logits', 'actorPrior', 'valueProbs']})
assert len(references) == 89
save('dual-v2-stage4-pure-torch-reference.json', references)
print(json.dumps(dict(samples=len(references), accurateReductions=True)), flush=True)
