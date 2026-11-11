"""可恢复、配置锁定的纯策略训练及数值前向；不含运行时动作兜底。"""
import os,sys,json,pathlib,hashlib,random,time,gzip,copy,collections
os.environ.setdefault('OMP_NUM_THREADS','4')
os.environ.setdefault('MKL_NUM_THREADS','4')
import numpy as np
import torch
import torch.nn.functional as F
from model import SpatialResNetPolicyValueNet,export_model_to_ts_json
from balanced_sampling import build_pools,sample_ids
STAGE=pathlib.Path(__file__).resolve().parents[1]
torch.set_num_threads(4)
torch.use_deterministic_algorithms(True)
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def peak_memory_bytes():
    # Windows进程自查无需读取其他应用命令行；失败时保留空值而非伪造零。
    try:
        import ctypes
        class Counters(ctypes.Structure):
            _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(k,ctypes.c_size_t) for k in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
        c=Counters();c.cb=ctypes.sizeof(c);ctypes.windll.kernel32.GetCurrentProcess.restype=ctypes.c_void_p
        ok=ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.c_void_p(ctypes.windll.kernel32.GetCurrentProcess()),ctypes.byref(c),c.cb)
        return int(c.PeakWorkingSetSize) if ok else None
    except (AttributeError,OSError):return None
def load_json_model(model,p):
    d=json.load(open(p,encoding='utf8'))
    conv={'stem':model.stem,'res1_1':model.res1.conv1,'res1_2':model.res1.conv2,'res2_1':model.res2.conv1,'res2_2':model.res2.conv2}
    dense={'valDense1':model.val_dense1,'valDense2':model.val_dense2,'polDense1':model.pol_dense1,'polDense2':model.pol_dense2}
    with torch.no_grad():
        for k,m in (conv|dense).items():
            m.weight.copy_(torch.tensor(d[k]['weights']).reshape(m.weight.shape));m.bias.copy_(torch.tensor(d[k]['biases']))
def tensors(s):
    return {k:torch.tensor(s[k],dtype=torch.float32) for k in ['spatial','global','candidateActorCoords','candidateLandingCoords','candidateTargetCoords','candidateSemantics']}|{'target':int(s.get('targetActionIndex',0)), 'sampleMap':s.get('mapName',''), 'samplePlayer':s.get('playerId',s.get('stateJson',{}).get('currentPlayer',0)), 'sampleFamily':s.get('familyId','')}
def forward(model,items):
    spatial=torch.stack([s['spatial'].reshape(34,20,20) for s in items]); glob=torch.stack([s['global'] for s in items]);z=model.forward_trunk(spatial)
    counts=[len(s['candidateSemantics']) for s in items]; ids=torch.repeat_interleave(torch.arange(len(items)),torch.tensor(counts));flat=z.permute(0,2,3,1)
    vectors=[]
    for key in ['candidateActorCoords','candidateLandingCoords','candidateTargetCoords']:
        coords=torch.cat([s[key] for s in items]).long();x,y=coords[:,0],coords[:,1];valid=(x>=0)&(x<20)&(y>=0)&(y<20)
        vectors.append(flat[ids,y.clamp(0,19),x.clamp(0,19)]*valid.unsqueeze(1))
    sem=torch.cat([s['candidateSemantics'] for s in items]); inp=torch.cat(vectors+[sem,glob[ids]],dim=1)
    logits=model.pol_dense2(F.relu(model.pol_dense1(inp))).squeeze(1)
    return list(torch.split(logits,counts)),model.forward_value(z,glob).flatten()
def objective(model,items,cfg):
    logits,_=forward(model,items);terms=[]
    for s,l in zip(items,logits):
        target=s['target'];ce=F.cross_entropy(l.unsqueeze(0),torch.tensor([target]));sem=s['candidateSemantics'];mask=sem[:,12]>.5
        if mask.any() and (~mask).any():
            # 比较相对分数，避免依赖没有意义的绝对logit零点。
            margin=F.relu(l[mask].max()-l[~mask].max()+cfg.get('surrenderMargin',8.0))
            ce=ce+cfg.get('surrenderWeight',1.0)*margin
        terms.append(ce)
    return torch.stack(terms).mean()
def rng_state():return {'python':random.getstate(),'numpy':np.random.get_state(),'torch':torch.get_rng_state()}
def restore_rng(s):random.setstate(s['python']);np.random.set_state(s['numpy']);torch.set_rng_state(s['torch'])
def checkpoint(model,opt,scheduler,update,cfg,best):
    return {'model_state_dict':model.state_dict(),'optimizer_state_dict':opt.state_dict(),'scheduler_state_dict':scheduler.state_dict(),'update':update,'rng':rng_state(),'config':cfg,'best':best}
def save_atomic(value,path):
    temporary=path.with_suffix(path.suffix+'.tmp');torch.save(value,temporary);os.replace(temporary,path)
def evaluate(model,data):
    model.eval();correct=0;surrender=0;loss=0.;types={}
    with torch.no_grad():
        for j in range(0,len(data),32):
            batch=data[j:j+32];ls,_=forward(model,batch)
            for s,l in zip(batch,ls):
                pred=int(l.argmax());target=s['target'];t=int(s['candidateSemantics'][target,:14].argmax());row=types.setdefault(str(t),[0,0]);row[0]+=int(pred==target);row[1]+=1
                correct+=int(pred==target);surrender+=int(s['candidateSemantics'][pred,12]>.5);loss+=float(F.cross_entropy(l.unsqueeze(0),torch.tensor([target])))
    return {'samples':len(data),'top1':correct/max(1,len(data)),'surrenderChoices':surrender,'crossEntropy':loss/max(1,len(data)),'actionSlices':types}
def read_data(p):
    opener=gzip.open if str(p).endswith('.gz') else open
    with opener(p,'rt',encoding='utf8') as f:return [tensors(json.loads(line)) for line in f if line.strip()]
def run(cfgpath):
    cfg=json.load(open(cfgpath,encoding='utf8'));run=STAGE/'checkpoints'/cfg['id'];run.mkdir(exist_ok=True)
    effective=copy.deepcopy(cfg);effective['trainSha256']=sha(cfg['train']);effective['valSha256']=sha(cfg['val']);effective['sourceSha256']={'train':sha(__file__),'model':sha(STAGE/'research/model.py'),'sampler':sha(STAGE/'research/balanced_sampling.py')};effective['initSha256']=sha(cfg['init']) if cfg.get('init') else None
    config_path=run/'config.json'
    if config_path.exists():assert json.load(open(config_path))==effective,'恢复身份不一致'
    else:config_path.write_text(json.dumps(effective,indent=2),encoding='utf8')
    random.seed(cfg['seed']);np.random.seed(cfg['seed']);torch.manual_seed(cfg['seed']);model=SpatialResNetPolicyValueNet()
    if cfg.get('init'):load_json_model(model,cfg['init'])
    opt=torch.optim.AdamW(model.parameters(),lr=cfg['lr'],weight_decay=1e-4);scheduler=torch.optim.lr_scheduler.CosineAnnealingLR(opt,T_max=cfg['updates'],eta_min=1e-5)
    start=0;best={'score':[-1,-1.]};last=run/'last.pt'
    if last.exists():
        ck=torch.load(last,map_location='cpu',weights_only=False);assert ck['config']==effective;model.load_state_dict(ck['model_state_dict']);opt.load_state_dict(ck['optimizer_state_dict']);scheduler.load_state_dict(ck['scheduler_state_dict']);restore_rng(ck['rng']);start=ck['update'];best=ck['best']
    else:
        export_model_to_ts_json(model,str(run/'initial.json'))
    train=read_data(cfg['train']);val=read_data(cfg['val']);groups={}
    for i,s in enumerate(train):groups.setdefault(int(s['candidateSemantics'][s['target'],:14].argmax()),[]).append(i)
    balanced_pools=build_pools(train)
    assert len(balanced_pools[0])==14,'七图双座位必须都有样本'
    t0=time.monotonic();cpu0=time.process_time();budget=json.load(open(STAGE/'identity/budget.json'));train_deadline=time.monotonic()+budget['trainDeadlineUnix']-time.time()
    log=open(run/'ledger.jsonl','a',encoding='utf8')
    exposure=collections.Counter()
    for u in range(start+1,cfg['updates']+1):
        if time.monotonic()>train_deadline:break
        ids=sample_ids(balanced_pools,cfg)
        for i in ids:
            s=train[i];exposure[f"mapSeat:{s['sampleMap']}|{s['samplePlayer']}"]+=1
            exposure['source:dagger' if s['sampleFamily'].startswith('dagger_') else 'source:base']+=1
            exposure[f"targetType:{int(s['candidateSemantics'][s['target'],:14].argmax())}"]+=1
        model.train();opt.zero_grad();loss=objective(model,[train[i] for i in ids],cfg);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);opt.step();scheduler.step()
        if u%cfg.get('evalEvery',500)==0 or u==cfg['updates']:
            metrics=evaluate(model,val);score=[-metrics['surrenderChoices'],metrics['top1']]
            row={'update':u,'trainLoss':float(loss.detach()),'validation':metrics,'elapsedSeconds':time.monotonic()-t0,'cpuSeconds':time.process_time()-cpu0,'gpuSeconds':0,'peakWorkingSetBytes':peak_memory_bytes(),'sampleExposureSincePreviousCheckpoint':dict(exposure)};log.write(json.dumps(row)+'\n');log.flush();exposure.clear()
            if score>best['score']:
                best={'score':score,'update':u,'metrics':metrics};save_atomic(checkpoint(model,opt,scheduler,u,effective,best),run/'best.pt');export_model_to_ts_json(model,str(run/'best.json'))
            save_atomic(checkpoint(model,opt,scheduler,u,effective,best),last);export_model_to_ts_json(model,str(run/'last.json'))
            print(cfg['id'],u,metrics,flush=True)
    log.close()
def parity(modelpath):
    from curate import ih
    model=SpatialResNetPolicyValueNet();load_json_model(model,modelpath);model.eval();samples=json.load(open(STAGE/'data/parity_fixture.json'));out=[]
    with torch.no_grad():
        for s in samples:
            ls,value=forward(model,[tensors(s)]);l=ls[0];out.append({'sampleId':s['sampleId'],'inputHash':ih(s),'actionCodes':s['actionCodes'],'logits':l.tolist(),'value':float(value[0]),'argmax':int(l.argmax())})
    name=hashlib.sha256(pathlib.Path(modelpath).read_bytes()).hexdigest();(STAGE/f'evidence/parity_py_{name}.json').write_text(json.dumps(out),encoding='utf8');print(name)
def resume_test():
    samples=[tensors(s) for s in json.load(open(STAGE/'data/parity_fixture.json'))[:8]];cfg={'surrenderWeight':1.,'surrenderMargin':8.}
    torch.manual_seed(20261014);random.seed(42);np.random.seed(42);m=SpatialResNetPolicyValueNet();o=torch.optim.AdamW(m.parameters(),lr=.0003);sc=torch.optim.lr_scheduler.CosineAnnealingLR(o,T_max=8)
    def steps(a,b):
        for _ in range(a,b):o.zero_grad();loss=objective(m,random.sample(samples,4),cfg);loss.backward();o.step();sc.step()
    steps(0,3);p=STAGE/'evidence/resume_test.pt';torch.save(checkpoint(m,o,sc,3,cfg,{}),p);steps(3,8);expected={k:v.clone() for k,v in m.state_dict().items()};rng_expected=torch.get_rng_state()
    ck=torch.load(p,weights_only=False);m.load_state_dict(ck['model_state_dict']);o.load_state_dict(ck['optimizer_state_dict']);sc.load_state_dict(ck['scheduler_state_dict']);restore_rng(ck['rng']);steps(3,8)
    assert all(torch.equal(v,m.state_dict()[k]) for k,v in expected.items());assert torch.equal(rng_expected,torch.get_rng_state());(STAGE/'evidence/resume_contract.json').write_text(json.dumps({'passed':True,'steps':8,'interruptedAfter':3,'parameterEquality':'bitwise','optimizerAndSchedulerRestored':True}),encoding='utf8');print('恢复合同通过')
if __name__=='__main__':
    if sys.argv[1]=='train':run(sys.argv[2])
    elif sys.argv[1]=='parity':parity(sys.argv[2])
    elif sys.argv[1]=='resume':resume_test()

