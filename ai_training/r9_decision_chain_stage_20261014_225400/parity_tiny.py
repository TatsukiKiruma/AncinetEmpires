import sys,pathlib,json
sys.dont_write_bytecode=True
root=pathlib.Path(sys.argv[1]);old=root.parent/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
samples=json.loads((old/'data/parity_fixture.json').read_text(encoding='utf8'));out=[]
for arm in ['control_original','production_target']:
 m=SpatialResNetPolicyValueNet();api.load_json_model(m,root/'tiny_fit'/arm/'last.json');m.eval();pred=[]
 with torch.no_grad():
  for s in samples:
   ls,v=api.forward(m,[api.tensors(s)]);pred.append({'logits':ls[0].tolist(),'value':float(v[0])})
 out.append({'arm':arm,'predictions':pred})
(root/'tiny_fit/parity_python.json').write_text(json.dumps(out),encoding='utf8')
