import pathlib,sys,json,gzip,hashlib,datetime
sys.dont_write_bytecode=True
j=pathlib.Path(sys.argv[1]);old=j.parents[1]/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
paths={'frozen_anchor':old/'checkpoints/r1_warm/best.json','replay_control':j/'training/replay_control/last.json','safety_course':j/'training_recovered/safety_course/last.json'}
models={a:{'path':str(p),'sha256':api.sha(p)} for a,p in paths.items()};(j/'models_frozen.json').write_text(json.dumps({'frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selection':'Last1000 only; no sweep','models':models},indent=2),encoding='utf8')
cp=torch.load(j/'training/replay_control/last.pt',map_location='cpu',weights_only=False);sp=torch.load(j/'training_recovered/safety_course/last.pt',map_location='cpu',weights_only=False);assert cp['config']==sp['config'];assert cp['update']==sp['update']==1000
for k in cp['split']['sourceSha256']:
 if k!='trainer':assert cp['split']['sourceSha256'][k]==sp['split']['sourceSha256'][k],k
samples=json.loads((old/'data/parity_fixture.json').read_text(encoding='utf8'));valpath=j/'validation_remaining.jsonl.gz';allout=[];validation=[]
for arm,p in paths.items():
 m=SpatialResNetPolicyValueNet();api.load_json_model(m,p);m.eval();pred=[]
 if arm!='frozen_anchor':
  ck=cp if arm=='replay_control' else sp;assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items())
 with torch.no_grad():
  for s in samples:
   ls,v=api.forward(m,[api.tensors(s)]);pred.append({'logits':ls[0].tolist(),'value':float(v[0])})
 total=correct=surrender=0;ce=0.;batch=[]
 def add(batch):
  q=api.evaluate(m,batch);return len(batch),q['top1']*len(batch),q['surrenderChoices'],q['crossEntropy']*len(batch)
 for line in gzip.open(valpath,'rt',encoding='utf8'):
  batch.append(api.tensors(json.loads(line)))
  if len(batch)==32:
   a,b,c,d=add(batch);total+=a;correct+=b;surrender+=c;ce+=d;batch=[]
 if batch:
  a,b,c,d=add(batch);total+=a;correct+=b;surrender+=c;ce+=d
 validation.append({'arm':arm,'samples':total,'top1':correct/total,'surrenderChoices':surrender,'crossEntropy':ce/total});allout.append({'arm':arm,'predictions':pred});print(validation[-1],flush=True)
(j/'parity_python.json').write_text(json.dumps(allout),encoding='utf8');(j/'same_validation_results.json').write_text(json.dumps({'validationSha256':api.sha(valpath),'scope':'Same7617 remaining historical development validation; no unbiased generalization claim; not directly comparable to old8077','pairingConfigEqual':True,'dataSourceHashesEqualExcludingTrainerLauncher':True,'jsonPtExact':True,'rows':validation},indent=2),encoding='utf8')
