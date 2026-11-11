"""抽查已保存张量，量化预热 value 与 PPO 实际读取的旧 baseline 的差异。"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'v19/training'))
import torch
from ppo import build_model, compute_gae, load_model_from_ts_json

torch.set_num_threads(4)
run = ROOT / 'v19/out/run_20260928_v19_01'
base = run / 'data/wave2'
games = {r['gameId']: r for r in [json.loads(x) for x in (base / 'wave2.games.jsonl').read_text().splitlines()]}
selected = []
with (base / 'wave2.transitions.jsonl').open(encoding='utf-8') as f:
    for line in f:
        r = json.loads(line)
        if games[r['gameId']]['naturalTerminal'] and r['subjectDecisionIndex'] in [0, 50, 200, 1000, 1999]:
            selected.append(r)
spatials, globals_list = [], []
with (base / 'wave2.tensors.f32').open('rb') as blob:
    for r in selected:
        blob.seek(r['tensorOffset'])
        count = r['channels'] * 400
        spatials.append(torch.tensor(struct.unpack(f'<{count}f', blob.read(count * 4))).view(r['channels'],20,20))
        blob.seek(r['globalOffset'])
        globals_list.append(torch.tensor(struct.unpack('<20f', blob.read(80))))
model = build_model(34)
load_model_from_ts_json(model, str(run / 'experiments/value_warmup/wave2/vw_wave2.json'))
model.eval()
with torch.no_grad():
    preds = []
    for start in range(0,len(selected),32):
        z = model.forward_trunk(torch.stack(spatials[start:start+32]))
        preds.extend(model.forward_value(z,torch.stack(globals_list[start:start+32])).flatten().tolist())
details = []
for r, predicted in zip(selected,preds):
    outcome = games[r['gameId']]['terminalReturn']
    # 实际配置 gamma=lambda=1，因此完整自然结局的 A_t=R-V_t。
    actual, _ = compute_gae([outcome], [r['value']], [True], [False],gamma=1,lam=1)
    details.append({'gameId':r['gameId'],'index':r['subjectDecisionIndex'],'outcome':outcome,
                    'recordedOldValue':r['value'],'warmedValue':predicted,
                    'actualPpoBaselineAdvantage':actual[0],
                    'hypotheticalWarmedBaselineAdvantage':outcome-predicted})
delta = [abs(r['recordedOldValue']-r['warmedValue']) for r in details]
result = {'samples':len(details),'meanAbsValueDifference':sum(delta)/len(delta),
          'maxAbsValueDifference':max(delta),
          'note':'这些样本来自训练批次，仅验证数据流差异，不是独立校准验证；不建议把同批回报拟合后的 critic 直接回填同批优势。',
          'details':details}
Path(__file__).with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='details'},ensure_ascii=False,indent=2))
