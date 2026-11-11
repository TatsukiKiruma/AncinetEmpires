import os,sys,pathlib,json,gzip,random,time,hashlib,copy
os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4';sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parents[1]/'r8_pure_policy_stage_20261014_125300';prior=r.parents[1]/'r9_decision_chain_stage_20261014_225400';sys.path.insert(0,str(old/'research'))
import train as api
import torch,numpy as np
from model import SpatialResNetPolicyValueNet,export_model_to_ts_json
protocol=json.loads((r/'batch_protocol.json').read_text(encoding='utf-8-sig'));out=r/'training_recovered';out.mkdir(exist_ok=False);cfg={'updates':protocol['updatesPerArm'],'batchSize':16,'seed':protocol['seed'],'lr':protocol['lr'],'surrenderMargin':8.,'surrenderWeight':1.}
start=time.monotonic();deadline=start+900
read=lambda p:[json.loads(x) for x in gzip.open(p,'rt',encoding='utf8') if x.strip()]
course=read(r/'courses.jsonl.gz')+read(r/'earlier/courses.jsonl.gz');dedup={s['inputHash']:s for s in course};course=list(dedup.values());production=json.loads((prior/'tiny_samples.json').read_text(encoding='utf8'))
valpath=r/'validation_remaining.jsonl.gz';trainpath=old/'data/base_locked/train.jsonl.gz';valhash=set();valfamilies=set()
for line in gzip.open(valpath,'rt',encoding='utf8'):
 s=json.loads(line);valhash.add(s['inputHash']);valfamilies.add(s.get('familyId'))
quarantine=[s for s in course if s['inputHash'] in valhash];course=[s for s in course if s['inputHash'] not in valhash];production=[s for s in production if s['inputHash'] not in valhash];assert len(course)>=2
rng=random.Random(67125);base=[];trainhash=set();trainfamilies=set()
for i,line in enumerate(gzip.open(trainpath,'rt',encoding='utf8')):
 s=json.loads(line);trainhash.add(s['inputHash']);trainfamilies.add(s.get('familyId'))
 if len(base)<2048:base.append(s)
 else:
  j=rng.randrange(i+1)
  if j<2048:base[j]=s
assert not trainhash&valhash;assert not ({x for x in trainfamilies if x} & {x for x in valfamilies if x})
for s in course+production:assert 0<=s['targetActionIndex']<len(s['actionCodes']);assert s['inputHash'] not in valhash
split={'baseReservoirRows':len(base),'baseTotalInputs':len(trainhash),'valTotalInputs':len(valhash),'trainValInputOverlap':0,'trainValBaseFamilyOverlap':0,'courseRows':len(course),'courseUniqueInputs':len(course),'quarantined':len(quarantine),'productionRows':len(production),'newCourseParents':'consumed historical diagnostic slots, not independent validation','sourceSha256':{'train':api.sha(trainpath),'val':api.sha(valpath),'course1':api.sha(r/'courses.jsonl.gz'),'course2':api.sha(r/'earlier/courses.jsonl.gz'),'parent':api.sha(old/'checkpoints/r1_warm/best.json'),'trainer':api.sha(__file__),'model':api.sha(old/'research/model.py')}}
(out/'split_audit.json').write_text(json.dumps(split,indent=2),encoding='utf8');gzip.open(out/'effective_courses.jsonl.gz','wt',encoding='utf8').write('\n'.join(json.dumps(s) for s in course)+'\n')
baseT=[api.tensors(s) for s in base];prodT=[api.tensors(s) for s in production]
def validate(m):
 total=0;correct=0;surrender=0;loss=0.;batch=[]
 def consume(batch):
  z=api.evaluate(m,batch);return len(batch),z['top1']*len(batch),z['surrenderChoices'],z['crossEntropy']*len(batch)
 for line in gzip.open(valpath,'rt',encoding='utf8'):
  batch.append(api.tensors(json.loads(line)))
  if len(batch)==32:
   a,b,c,d=consume(batch);total+=a;correct+=b;surrender+=c;loss+=d;batch=[]
 if batch:
  a,b,c,d=consume(batch);total+=a;correct+=b;surrender+=c;loss+=d
 return {'samples':total,'top1':correct/total,'surrenderChoices':surrender,'crossEntropy':loss/total}
reports=[]
for arm in ['safety_course']:
 random.seed(cfg['seed']);np.random.seed(cfg['seed']);torch.manual_seed(cfg['seed']);m=SpatialResNetPolicyValueNet();api.load_json_model(m,old/'checkpoints/r1_warm/best.json');opt=torch.optim.AdamW(m.parameters(),lr=cfg['lr'],weight_decay=1e-4);sched=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=cfg['updates'],eta_min=1e-5);courseT=[api.tensors(s|{'targetActionIndex':s['originalActionIndex'] if arm=='replay_control' else s['targetActionIndex']}) for s in course];rootT=[courseT[i] for i,s in enumerate(course) if s.get('isRoot')];fragmentT=[courseT[i] for i,s in enumerate(course) if not s.get('isRoot')];assert rootT and fragmentT;d=out/arm;d.mkdir();logs=[];t0=time.monotonic()
 for u in range(1,cfg['updates']+1):
  if time.monotonic()>deadline:raise RuntimeError('training wall budget exceeded')
  items=random.choices(baseT,k=10)+random.choices(prodT if prodT else baseT,k=2)+random.choices(rootT,k=2)+random.choices(fragmentT,k=2);m.train();opt.zero_grad();loss=api.objective(m,items,cfg);loss.backward();torch.nn.utils.clip_grad_norm_(m.parameters(),1.);opt.step();sched.step()
  if u in [500,1000]:
   metrics=validate(m);logs.append({'update':u,'loss':float(loss.detach()),'validation':metrics,'elapsedSeconds':time.monotonic()-t0});print(arm,u,metrics,flush=True)
 ck={'model_state_dict':m.state_dict(),'optimizer_state_dict':opt.state_dict(),'scheduler_state_dict':sched.state_dict(),'rng':api.rng_state(),'update':cfg['updates'],'config':cfg,'arm':arm,'split':split};torch.save(ck,d/'last.pt');export_model_to_ts_json(m,str(d/'last.json'));reports.append({'arm':arm,'updates':cfg['updates'],'elapsedSeconds':time.monotonic()-t0,'modelSha256':api.sha(d/'last.json'),'logs':logs});(out/'progress.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
(out/'results.json').write_text(json.dumps({'config':cfg,'split':split,'arms':reports},indent=2),encoding='utf8')


