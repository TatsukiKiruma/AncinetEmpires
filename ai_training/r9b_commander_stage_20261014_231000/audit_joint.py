import pathlib,json,gzip,sys,hashlib,datetime
sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);j=r/'joint';old=r.parent/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
sets=[];families=[]
for p in [old/'data/base_locked/val.jsonl.gz',j/'validation_remaining.jsonl.gz',j/'retired_validation_consumed_for_training.jsonl.gz']:
 keys=set();fam=set()
 for line in gzip.open(p,'rt',encoding='utf8'):
  s=json.loads(line);keys.add(s['inputHash']);fam.add(s['familyId'])
 sets.append(keys);families.append(fam)
assert sets[0]==sets[1]|sets[2];assert not sets[1]&sets[2];assert not families[1]&families[2]
models=json.loads((j/'models_frozen.json').read_text())['models'];course=[json.loads(x) for x in gzip.open(j/'training/effective_courses.jsonl.gz','rt',encoding='utf8') if x.strip()];rows=[]
for arm in ['replay_control','safety_course']:
 p=j/('training' if arm=='replay_control' else 'training_recovered')/arm;ck=torch.load(p/'last.pt',weights_only=False,map_location='cpu');m=SpatialResNetPolicyValueNet();api.load_json_model(m,p/'last.json');assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items());assert ck['update']==1000;m.eval()
 with torch.no_grad():
  ls,_=api.forward(m,[api.tensors(s) for s in course]);roots=[(s,l) for s,l in zip(course,ls) if s['isRoot']];rows.append({'arm':arm,'update':1000,'jsonPtExact':True,'optimizerSchedulerRngPresent':all(x in ck for x in ['optimizer_state_dict','scheduler_state_dict','rng']),'rootInputs':len(roots),'rootDesiredArgmax':sum(int(l.argmax())==s['targetActionIndex'] for s,l in roots),'allCourseInputs':len(course),'allDesiredArgmax':sum(int(l.argmax())==s['targetActionIndex'] for s,l in zip(course,ls))})
(j/'split_retirement_checkpoint_audit.json').write_text(json.dumps({'passed':True,'originalRows':len(sets[0]),'remainingRows':len(sets[1]),'retiredRows':len(sets[2]),'originalFamilies':len(families[0]),'remainingFamilies':sorted(families[1]),'retiredFamilies':sorted(families[2]),'inputPartitionExact':True,'familyDisjoint':True,'originalValidationSha256':api.sha(old/'data/base_locked/val.jsonl.gz'),'remainingValidationSha256':api.sha(j/'validation_remaining.jsonl.gz'),'scope':'New protocol; retired families are consumed training support; no old/new metric comparison or unbiased claim','rows':rows},ensure_ascii=False,indent=2),encoding='utf8');print(rows)
