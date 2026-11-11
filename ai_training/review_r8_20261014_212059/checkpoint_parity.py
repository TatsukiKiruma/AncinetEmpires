"""只读载入现存恢复状态并重新运行最终候选Python前向。"""
import pathlib,sys,json,hashlib
O=pathlib.Path(__file__).resolve().parent;S=O.parent/'r8_pure_policy_stage_20261014_125300'
sys.path.insert(0,str(S/'research'))
import torch
from train import forward,tensors
from model import SpatialResNetPolicyValueNet
keys={'stem':'stem','res1_1':'res1.conv1','res1_2':'res1.conv2','res2_1':'res2.conv1','res2_2':'res2.conv2','valDense1':'val_dense1','valDense2':'val_dense2','polDense1':'pol_dense1','polDense2':'pol_dense2'}
rows=[];candidate=None
for name in ['r1_warm','r1_scratch','r2_dagger','r3_balanced','r1_warm_s2026']:
 D=S/'checkpoints'/name;cfg=json.loads((D/'config.json').read_text(encoding='utf8'))
 for kind in ['best','last']:
  ck=torch.load(D/f'{kind}.pt',map_location='cpu',weights_only=False);j=json.loads((D/f'{kind}.json').read_text(encoding='utf8'));assert ck['config']==cfg
  for k,pt in keys.items():
   for jf,pf in [('weights','weight'),('biases','bias')]:assert ck['model_state_dict'][pt+'.'+pf].flatten().tolist()==j[k][jf]
  steps=[int(v['step']) for v in ck['optimizer_state_dict']['state'].values() if 'step' in v];assert min(steps)==max(steps)==ck['update'];assert ck['scheduler_state_dict']['last_epoch']==ck['update'];assert set(ck['rng'])=={'python','numpy','torch'}
  rows.append({'name':name,'kind':kind,'update':ck['update'],'jsonPtEqual':True,'updatedTensors':len(steps),'configEqual':True,'rng':['python','numpy','torch']})
  if name=='r1_warm' and kind=='best':candidate=ck['model_state_dict']
(O/'checkpoint_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
model=SpatialResNetPolicyValueNet();model.load_state_dict(candidate);model.eval()
samples=json.loads((S/'data/parity_fixture.json').read_text(encoding='utf8'));out=[]
with torch.no_grad():
 for s in samples:
  ls,v=forward(model,[tensors(s)]);out.append({'sampleId':s['sampleId'],'logits':ls[0].tolist(),'value':float(v[0]),'argmax':int(ls[0].argmax())})
(O/'fresh_python_predictions.json').write_text(json.dumps(out),encoding='utf8')
print(json.dumps({'checkpointsVerified':len(rows),'candidateParityStates':len(out),'torch':torch.__version__}))
