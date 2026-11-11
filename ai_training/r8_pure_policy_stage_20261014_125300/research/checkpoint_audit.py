"""真实checkpoint、导出JSON、父权重及数据/源码身份逐项核对。"""
import pathlib,json,hashlib,sys,torch
S=pathlib.Path(__file__).resolve().parents[1];tag=sys.argv[1];names=sys.argv[2:];cache={}
def sha(p):
    p=pathlib.Path(p)
    if str(p) not in cache:
        h=hashlib.sha256()
        with p.open('rb') as f:
            for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
        cache[str(p)]=h.hexdigest()
    return cache[str(p)]
keys={'stem':'stem','res1_1':'res1.conv1','res1_2':'res1.conv2','res2_1':'res2.conv1','res2_2':'res2.conv2','valDense1':'val_dense1','valDense2':'val_dense2','polDense1':'pol_dense1','polDense2':'pol_dense2'}
rows=[]
for name in names:
    D=S/'checkpoints'/name;cfg=json.loads((D/'config.json').read_text(encoding='utf8'))
    assert sha(cfg['train'])==cfg['trainSha256'] and sha(cfg['val'])==cfg['valSha256']
    assert sha(S/'research'/cfg.get('trainer','train.py'))==cfg['sourceSha256']['train'];assert sha(S/'research/model.py')==cfg['sourceSha256']['model']
    if 'sampler' in cfg['sourceSha256']:assert sha(S/'research/balanced_sampling.py')==cfg['sourceSha256']['sampler']
    if cfg.get('init'):
        assert sha(cfg['init'])==cfg['initSha256'];initial=json.loads((D/'initial.json').read_text(encoding='utf8'));parent=json.loads(pathlib.Path(cfg['init']).read_text(encoding='utf8'))
        assert all(initial[k][f]==parent[k][f] for k in keys for f in ['weights','biases'])
    artifacts=[]
    for kind in ['best','last']:
        ck=torch.load(D/f'{kind}.pt',map_location='cpu',weights_only=False);j=json.loads((D/f'{kind}.json').read_text(encoding='utf8'));assert ck['config']==cfg
        for k,pt in keys.items():
            for jf,pf in [('weights','weight'),('biases','bias')]:assert ck['model_state_dict'][pt+'.'+pf].flatten().tolist()==j[k][jf]
        steps=[int(v['step']) for v in ck['optimizer_state_dict']['state'].values() if 'step' in v];assert steps and min(steps)==max(steps)==ck['update'];assert ck['scheduler_state_dict']['last_epoch']==ck['update'];assert set(ck['rng'])=={'python','numpy','torch'}
        artifacts.append({'kind':kind,'update':ck['update'],'jsonSha256':sha(D/f'{kind}.json'),'checkpointSha256':sha(D/f'{kind}.pt'),'numericExportEqual':True,'optimizerStep':steps[0],'updatedParameterTensors':len(steps)})
    assert artifacts[1]['update']==cfg['updates']
    rows.append({'name':name,'initSha256':cfg['initSha256'],'dataAndSourceIdentityVerified':True,'parentNumericallyEqual':bool(cfg.get('init')),'artifacts':artifacts})
out={'passed':True,'runs':rows,'scope':'实际恢复文件可加载且参数与交付JSON相等；优化器、调度、更新数、三类RNG齐全。逐位连续恢复另见resume合同。'}
(S/f'evidence/checkpoint_audit_{tag}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out,ensure_ascii=False))
