import pathlib,sys,json
sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';b=r.parent/'r9b_commander_stage_20261014_231000';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
assert json.loads((r/'course_alias_audit.json').read_text())['fullStateAliases']==0
paths={'r8_anchor':old/'checkpoints/r1_warm/best.json','frozen_parent':b/'joint/training/replay_control/last.json','single_correction':r/'training/single_correction/last.json','terminal_chain':r/'training/terminal_chain/last.json'};freeze={k:{'path':str(v.resolve()),'sha256':api.sha(v)} for k,v in paths.items()};(r/'models_frozen.json').write_text(json.dumps({'models':freeze,'selection':'last1500 only; no checkpoint sweep'},indent=2),encoding='utf8');fixtures=json.loads((old/'data/parity_fixture.json').read_text());rows=[]
for arm,path in paths.items():
 m=SpatialResNetPolicyValueNet();api.load_json_model(m,path);m.eval()
 if arm in ['single_correction','terminal_chain']:
  ck=torch.load(path.with_suffix('.pt'),map_location='cpu',weights_only=False);assert ck['update']==1500;assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items())
 pred=[]
 with torch.no_grad():
  for s in fixtures:
   ls,v=api.forward(m,[api.tensors(s)]);pred.append({'logits':ls[0].tolist(),'value':float(v[0])})
 rows.append({'arm':arm,'predictions':pred})
(r/'parity_python.json').write_text(json.dumps(rows),encoding='utf8');print('Four model weights frozen; JSON/PT exact; Python parity fixtures complete')
