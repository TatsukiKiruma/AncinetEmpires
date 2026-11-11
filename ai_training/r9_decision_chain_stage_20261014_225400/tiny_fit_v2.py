import os,sys,json,pathlib,time,random,hashlib
os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4';sys.dont_write_bytecode=True
root=pathlib.Path(sys.argv[1]); old=root.parent/'r8_pure_policy_stage_20261014_125300';sys.path.insert(0,str(old/'research'))
import train as api
import torch,numpy as np
from model import SpatialResNetPolicyValueNet,export_model_to_ts_json
out=root/'tiny_fit';out.mkdir(exist_ok=False)
samples=json.loads((root/'tiny_samples.json').read_text(encoding='utf-8-sig'));assert len(samples)>=2;assert all(0<=s['targetActionIndex']<len(s['actionCodes']) and 0<=s['originalActionIndex']<len(s['actionCodes']) for s in samples)
cfg={'diagnosticOnly':True,'noHoldout':True,'updates':200,'seed':77421,'lr':.0001,'surrenderMargin':8.,'surrenderWeight':1.,'dataSha256':api.sha(root/'tiny_samples.json'),'parentSha256':api.sha(old/'checkpoints/r1_warm/best.json'),'arms':['control_original','production_target'],'stoppingRule':'200 updates per arm; stop expansion if correction does not improve historical diagnostic games; no promotion'}
(out/'protocol.json').write_text(json.dumps(cfg,indent=2),encoding='utf8');report=[]
for arm in cfg['arms']:
 random.seed(cfg['seed']);np.random.seed(cfg['seed']);torch.manual_seed(cfg['seed']);m=SpatialResNetPolicyValueNet();api.load_json_model(m,old/'checkpoints/r1_warm/best.json');opt=torch.optim.AdamW(m.parameters(),lr=cfg['lr'],weight_decay=1e-4);sc=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=cfg['updates'],eta_min=1e-5)
 items=[api.tensors(s|{'targetActionIndex':s['originalActionIndex'] if arm=='control_original' else s['targetActionIndex']}) for s in samples];t0=time.monotonic();logs=[]
 for step in range(201):
  if step in [0,50,200]:
   m.eval()
   with torch.no_grad():
    ls,_=api.forward(m,items);rows=[{'inputHash':s['inputHash'],'argmax':int(l.argmax()),'desired':s['targetActionIndex'],'original':s['originalActionIndex'],'marginDesiredMinusOriginal':float(l[s['targetActionIndex']]-l[s['originalActionIndex']]),'surrender':bool(items[i]['candidateSemantics'][int(l.argmax()),12]>.5)} for i,(s,l) in enumerate(zip(samples,ls))]
   logs.append({'update':step,'rows':rows})
  if step==200:break
  m.train();opt.zero_grad();loss=api.objective(m,items,cfg);loss.backward();torch.nn.utils.clip_grad_norm_(m.parameters(),1.);opt.step();sc.step()
 d=out/arm;d.mkdir();export_model_to_ts_json(m,str(d/'last.json'));torch.save({'model_state_dict':m.state_dict(),'optimizer_state_dict':opt.state_dict(),'scheduler_state_dict':sc.state_dict(),'rng':api.rng_state(),'update':200,'config':cfg,'arm':arm},d/'last.pt');report.append({'arm':arm,'updates':200,'elapsedSeconds':time.monotonic()-t0,'modelSha256':api.sha(d/'last.json'),'logs':logs});(out/'progress.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(arm,logs[-1],flush=True)
(out/'results.json').write_text(json.dumps({'protocol':cfg,'arms':report},indent=2),encoding='utf8')

