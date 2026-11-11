import pathlib,sys,json,gzip,random,copy
sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
course=[json.loads(s) for s in gzip.open(r/'training/effective_courses.jsonl.gz','rt',encoding='utf8') if s.strip()];keys={s['inputHash']:s for s in course};conflicts=[];shared=[]
for line in gzip.open(old/'data/base_locked/train.jsonl.gz','rt',encoding='utf8'):
 s=json.loads(line)
 if s['inputHash'] in keys:
  row={'inputHash':s['inputHash'],'replayTarget':s['targetActionIndex'],'courseTarget':keys[s['inputHash']]['targetActionIndex']};shared.append(row)
  if row['replayTarget']!=row['courseTarget']:conflicts.append(row)
rows=[]
for arm in ['replay_control','safety_course']:
 p=r/'training'/arm;ck=torch.load(p/'last.pt',map_location='cpu',weights_only=False);m=SpatialResNetPolicyValueNet();api.load_json_model(m,p/'last.json');assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items());assert ck['update']==1000
 m.eval()
 with torch.no_grad():
  ls,_=api.forward(m,[api.tensors(s) for s in course]);metrics=[{'inputHash':s['inputHash'],'argmax':int(l.argmax()),'desired':s['targetActionIndex'],'original':s['originalActionIndex'],'margin':float(l[s['targetActionIndex']]-l[s['originalActionIndex']])} for s,l in zip(course,ls)]
 def resumed():
  mm=SpatialResNetPolicyValueNet();mm.load_state_dict(ck['model_state_dict']);oo=torch.optim.AdamW(mm.parameters(),lr=ck['config']['lr'],weight_decay=1e-4);oo.load_state_dict(ck['optimizer_state_dict']);sc=torch.optim.lr_scheduler.CosineAnnealingLR(oo,T_max=1000,eta_min=1e-5);sc.load_state_dict(ck['scheduler_state_dict']);api.restore_rng(ck['rng'])
  for _ in range(2):
   batch=[api.tensors(s) for s in random.choices(course,k=4)];mm.train();oo.zero_grad();loss=api.objective(mm,batch,ck['config']);loss.backward();torch.nn.utils.clip_grad_norm_(mm.parameters(),1.);oo.step();sc.step()
  return mm.state_dict(),api.rng_state()
 a,ar=resumed();b,br=resumed();assert all(torch.equal(v,b[k]) for k,v in a.items());assert torch.equal(ar['torch'],br['torch']);rows.append({'arm':arm,'jsonPtExact':True,'update':1000,'twoFreshRestoresPlus2UpdatesBitwiseEqual':True,'diagnosticCourseDesiredArgmax':sum(s['argmax']==s['desired'] for s in metrics),'courseInputs':len(course),'metrics':metrics})
result={'passed':True,'courseBaseSharedInputs':len(shared),'courseBaseConflictingTargets':len(conflicts),'conflicts':conflicts,'rows':rows,'resumeScope':'Two fresh restores reproducibly advance two updates; not an uninterrupted-vs-interrupted full-run proof'};(r/'training/checkpoint_course_audit.json').write_text(json.dumps(result,indent=2),encoding='utf8');print({k:v for k,v in result.items() if k not in ['rows','conflicts']});print([(x['arm'],x['diagnosticCourseDesiredArgmax'],x['courseInputs']) for x in rows])
