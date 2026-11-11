import pathlib,sys,json,hashlib,datetime
sys.dont_write_bytecode=True
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch
from model import SpatialResNetPolicyValueNet
rows=[]
for arm in ['control_original','production_target']:
 ck=torch.load(r/'tiny_fit'/arm/'last.pt',map_location='cpu',weights_only=False);m=SpatialResNetPolicyValueNet();api.load_json_model(m,r/'tiny_fit'/arm/'last.json');assert all(torch.equal(v,ck['model_state_dict'][k]) for k,v in m.state_dict().items());assert ck['update']==200;assert all(k in ck for k in ['optimizer_state_dict','scheduler_state_dict','rng']);rows.append({'arm':arm,'update':200,'jsonPtExact':True,'optimizerSchedulerRngPresent':True,'resumeReplayTested':False})
(r/'tiny_fit/checkpoint_check.json').write_text(json.dumps({'passed':True,'rows':rows},indent=2),encoding='utf8')
for p in json.loads((r/'protection_before.json').read_text(encoding='utf-8-sig')):assert api.sha(p['path'])==p['sha256']
(r/'completion.json').write_text(json.dumps({'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protectedFiles':69,'protectedHashesPass':True,'modelsPromoted':0,'trainingActive':False,'independentFinalExecuted':False,'nextTask':'诊断纠正组生产后指挥官的危险路径，采集独立父局多步课程。'},ensure_ascii=False,indent=2),encoding='utf8')
files=[{'path':str(f.relative_to(r)),'bytes':f.stat().st_size,'sha256':api.sha(f)} for f in r.rglob('*') if f.is_file() and f.name!='DELIVERY_SHA256.json'];(r/'DELIVERY_SHA256.json').write_text(json.dumps({'files':files,'totalBytes':sum(x['bytes'] for x in files)},ensure_ascii=False,indent=2),encoding='utf8');print({'checkpointPairs':2,'protected':69,'files':len(files),'bytes':sum(x['bytes'] for x in files)})
