import os,sys,pathlib,json,gzip,random,time,hashlib,copy
os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4';sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';b=r.parent/'r9b_commander_stage_20261014_231000';sys.path.insert(0,str(old/'research'))
import train as api
import torch,numpy as np
import torch.nn.functional as F
from model import SpatialResNetPolicyValueNet,export_model_to_ts_json
p=json.loads((r/'protocol.json').read_text(encoding='utf-8-sig'));parent=json.loads((r/'course_manifest.json').read_text())['parent'];assert api.sha(parent['path'])==parent['sha256'];read=lambda f:[json.loads(s) for s in gzip.open(f,'rt',encoding='utf8') if s.strip()]
course=read(r/'course.jsonl.gz');valpath=b/'joint/validation_remaining.jsonl.gz';valkeys=set();valfamilies=set()
for line in gzip.open(valpath,'rt',encoding='utf8'):
 s=json.loads(line);valkeys.add(s['inputHash']);valfamilies.add(s['familyId'])
assert not {s['inputHash'] for s in course}&valkeys,'课程与验证重合，禁止训练'
base=[];basekeys=set();basefam=set();rnd=random.Random(91871)
for i,line in enumerate(gzip.open(old/'data/base_locked/train.jsonl.gz','rt',encoding='utf8')):
 s=json.loads(line);basekeys.add(s['inputHash']);basefam.add(s['familyId'])
 if len(base)<1024:base.append(s)
 else:
  k=rnd.randrange(i+1)
  if k<1024:base[k]=s
assert not basefam&valfamilies;assert not basekeys&valkeys
base+=read(b/'joint/training/effective_courses.jsonl.gz')+json.loads((r.parent/'r9_decision_chain_stage_20261014_225400/tiny_samples.json').read_text());coursekeys={s['inputHash'] for s in course};unique={s['inputHash']:s for s in base if s['inputHash'] not in coursekeys};base=list(unique.values());assert not set(unique)&valkeys
out=r/'training';out.mkdir(exist_ok=False);split={'courseRows':len(course),'courseFamilies':1,'baseRows':len(base),'remainingValRows':len(valkeys),'valSha256':api.sha(valpath),'courseSha256':api.sha(r/'course.jsonl.gz'),'baseSourceSha256':api.sha(old/'data/base_locked/train.jsonl.gz'),'inputOverlap':0,'baseFamilyOverlap':0,'courseFamily':'consumed_R9b_prefix_Duel_slot0','parentSha256':parent['sha256'],'trainerSha256':api.sha(__file__)};(out/'split_audit.json').write_text(json.dumps(split,indent=2),encoding='utf8')
parentModel=SpatialResNetPolicyValueNet();api.load_json_model(parentModel,parent['path']);parentModel.eval();baseT=[api.tensors(s) for s in base];courseT=[api.tensors(s) for s in course]
with torch.no_grad():
 teacher=[]
 for i in range(0,len(baseT),16):
  ls,_=api.forward(parentModel,baseT[i:i+16]);teacher += [F.softmax(l,dim=0).detach().clone() for l in ls]
assert all(torch.isfinite(x).all() for x in teacher)
def validation(m):
 n=correct=sur=0;ce=0.;batch=[]
 def add(batch):
  z=api.evaluate(m,batch);return len(batch),z['top1']*len(batch),z['surrenderChoices'],z['crossEntropy']*len(batch)
 for line in gzip.open(valpath,'rt',encoding='utf8'):
  batch.append(api.tensors(json.loads(line)))
  if len(batch)==32:
   a,c,s,l=add(batch);n+=a;correct+=c;sur+=s;ce+=l;batch=[]
 if batch:
  a,c,s,l=add(batch);n+=a;correct+=c;sur+=s;ce+=l
 return {'samples':n,'top1':correct/n,'surrenderChoices':sur,'crossEntropy':ce/n}
reports=[];deadline=time.monotonic()+max(0,p['trainingDeadlineUnix']-time.time())
for arm in ['single_correction','terminal_chain']:
 random.seed(p['seed']);np.random.seed(p['seed']);torch.manual_seed(p['seed']);m=SpatialResNetPolicyValueNet();api.load_json_model(m,parent['path']);opt=torch.optim.AdamW(m.parameters(),lr=.0001,weight_decay=1e-4);sched=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=1500,eta_min=1e-5);d=out/arm;d.mkdir();logs=[];t0=time.monotonic()
 for u in range(1,1501):
  if time.monotonic()>deadline:raise RuntimeError('Training deadline')
  bi=[random.randrange(len(baseT)) for _ in range(12)];ci=[random.randrange(len(courseT)) for _ in range(4)];items=[baseT[i] for i in bi]+[courseT[i] for i in ci];m.train();opt.zero_grad();ls,_=api.forward(m,items);terms=[]
  for k,i in enumerate(bi):terms.append(F.kl_div(F.log_softmax(ls[k],dim=0),teacher[i],reduction='sum'))
  for k,i in enumerate(ci):
   s=course[i];targets=s['targetActionIndices'] if arm=='terminal_chain' or s['isRoot'] else [s['parentTargetIndex']];terms.append(-torch.logsumexp(F.log_softmax(ls[12+k],dim=0)[targets],dim=0))
  for k,item in enumerate(items):
   mask=item['candidateSemantics'][:,12]>.5
   if mask.any() and (~mask).any():terms[k]=terms[k]+.1*F.relu(ls[k][mask].max()-ls[k][~mask].max()+8.)
  loss=torch.stack(terms).mean();loss.backward();torch.nn.utils.clip_grad_norm_(m.parameters(),1.);opt.step();sched.step()
  if u in [500,1000,1500]:
   ck={'model_state_dict':m.state_dict(),'optimizer_state_dict':opt.state_dict(),'scheduler_state_dict':sched.state_dict(),'rng':api.rng_state(),'update':u,'protocol':p,'split':split,'arm':arm};api.save_atomic(ck,d/'last.pt');export_model_to_ts_json(m,str(d/'last.json'));logs.append({'update':u,'loss':float(loss.detach()),'elapsedSeconds':time.monotonic()-t0});(d/'ledger.json').write_text(json.dumps(logs,indent=2),encoding='utf8');print(arm,u,float(loss.detach()),flush=True)
 metrics=validation(m);m.eval()
 with torch.no_grad():
  ls,_=api.forward(m,courseT);fit=sum(int(l.argmax()) in s['targetActionIndices'] for s,l in zip(course,ls))
 reports.append({'arm':arm,'updates':1500,'modelSha256':api.sha(d/'last.json'),'validation':metrics,'coursePositiveArgmax':fit,'courseRows':len(course),'elapsedSeconds':time.monotonic()-t0});(out/'progress.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
(out/'results.json').write_text(json.dumps({'split':split,'arms':reports},indent=2),encoding='utf8')
