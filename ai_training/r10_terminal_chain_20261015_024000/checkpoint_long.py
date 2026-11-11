import os,sys,pathlib,json,gzip,random,copy,hashlib
os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4';sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';b=r.parent/'r9b_commander_stage_20261014_231000';prior=r.parent/'r9_decision_chain_stage_20261014_225400';sys.path.insert(0,str(old/'research'))
import train as api
import torch,numpy as np
import torch.nn.functional as F
from model import SpatialResNetPolicyValueNet
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));course=[json.loads(s) for s in gzip.open(r/'course.jsonl.gz','rt',encoding='utf8') if s.strip()];p=load(r/'protocol.json');split=load(r/'training/split_audit.json');rng=random.Random(91871);base=[]
for i,line in enumerate(gzip.open(old/'data/base_locked/train.jsonl.gz','rt',encoding='utf8')):
 s=json.loads(line)
 if len(base)<1024:base.append(s)
 else:
  k=rng.randrange(i+1)
  if k<1024:base[k]=s
base += [json.loads(s) for s in gzip.open(b/'joint/training/effective_courses.jsonl.gz','rt',encoding='utf8') if s.strip()]+load(prior/'tiny_samples.json');keys={s['inputHash'] for s in course};base=list({s['inputHash']:s for s in base if s['inputHash'] not in keys}.values());assert len(base)==split['baseRows']
for home,relative in [(b,'joint/training/effective_courses.jsonl.gz'),(prior,'tiny_samples.json')]:
 expected=next(x['sha256'] for x in load(home/'DELIVERY_SHA256.json')['files'] if x['path'].replace('\\','/')==relative);assert api.sha(home/relative)==expected
assert api.sha(r/'course.jsonl.gz')==split['courseSha256'];assert api.sha(old/'data/base_locked/train.jsonl.gz')==split['baseSourceSha256'];assert api.sha(r/'train_long.py')==split['trainerSha256']
parent=SpatialResNetPolicyValueNet();manifest=load(r/'course_manifest.json');api.load_json_model(parent,manifest['parent']['path']);parent.eval();bt=[api.tensors(s) for s in base];ct=[api.tensors(s) for s in course]
with torch.no_grad():
 teacher=[]
 for i in range(0,len(bt),16):
  ls,_=api.forward(parent,bt[i:i+16]);teacher += [F.softmax(x,dim=0).detach().clone() for x in ls]
schedule=random.Random(p['seed']);h=hashlib.sha256()
for u in range(1500):
 ids=[schedule.randrange(len(bt)) for _ in range(12)]+[schedule.randrange(len(ct)) for _ in range(4)]
 for x in ids:h.update(x.to_bytes(4,'little'))
rows=[]
for arm in ['single_correction','terminal_chain']:
 ck=torch.load(r/'training'/arm/'last.pt',map_location='cpu',weights_only=False);assert ck['update']==1500;assert ck['rng']['python']==schedule.getstate();m=SpatialResNetPolicyValueNet();api.load_json_model(m,r/'training'/arm/'last.json');assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items())
 def advance():
  m=SpatialResNetPolicyValueNet();m.load_state_dict(ck['model_state_dict']);opt=torch.optim.AdamW(m.parameters(),lr=.0001,weight_decay=1e-4);opt.load_state_dict(copy.deepcopy(ck['optimizer_state_dict']));sc=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=1500,eta_min=1e-5);sc.load_state_dict(copy.deepcopy(ck['scheduler_state_dict']));api.restore_rng(ck['rng'])
  for _ in range(2):
   bi=[random.randrange(len(bt)) for _ in range(12)];ci=[random.randrange(len(ct)) for _ in range(4)];items=[bt[i] for i in bi]+[ct[i] for i in ci];m.train();opt.zero_grad();ls,_=api.forward(m,items);terms=[F.kl_div(F.log_softmax(ls[k],dim=0),teacher[i],reduction='sum') for k,i in enumerate(bi)]
   for k,i in enumerate(ci):
    s=course[i];target=s['targetActionIndices'] if arm=='terminal_chain' or s['isRoot'] else [s['parentTargetIndex']];terms.append(-torch.logsumexp(F.log_softmax(ls[12+k],dim=0)[target],dim=0))
   for k,item in enumerate(items):
    mask=item['candidateSemantics'][:,12]>.5
    if mask.any() and (~mask).any():terms[k]=terms[k]+.1*F.relu(ls[k][mask].max()-ls[k][~mask].max()+8.)
   loss=torch.stack(terms).mean();loss.backward();torch.nn.utils.clip_grad_norm_(m.parameters(),1.);opt.step();sc.step()
  return {k:v.clone() for k,v in m.state_dict().items()},api.rng_state(),copy.deepcopy(opt.state_dict()),sc.state_dict()
 a,ar,ao,asc=advance();z,zr,zo,zsc=advance();assert all(torch.equal(v,z[k]) for k,v in a.items());assert ar['python']==zr['python'];assert torch.equal(ar['torch'],zr['torch']);assert asc==zsc
 for k,state in ao['state'].items():
  for key,value in state.items():assert torch.equal(value,zo['state'][k][key]) if torch.is_tensor(value) else value==zo['state'][k][key]
 rows.append({'arm':arm,'update':1500,'jsonPtExact':True,'pythonSamplerStateMatchesReconstructedSchedule':True,'twoReloadsPlusTwoActualObjectiveUpdatesBitwiseEqual':True,'scope':'Deterministic reload advancement, not uninterrupted full1500 replay'})
(r/'checkpoint_pairing_audit.json').write_text(json.dumps({'passed':True,'replayRowsReconstructed':len(base),'courseRows':len(course),'archivedReplaySourceHashesMatched':True,'batchScheduleSha256':h.hexdigest(),'sameSamplerScheduleBothArms':True,'rows':rows},indent=2),encoding='utf8');(r/'replay_input_manifest.json').write_text(json.dumps({'rows':[{'inputHash':s['inputHash'],'familyId':s.get('familyId'),'sourceGame':s.get('gameId',s.get('game'))} for s in base]},indent=2),encoding='utf8');print(rows)
