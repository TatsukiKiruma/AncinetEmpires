"""对已冻结配置完成训练、跨语言前向、行为回归与统一DEV，不触碰FINAL。"""
import os,sys,pathlib,subprocess,json,time,hashlib
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1];PY=S/'tmp/venv/Scripts/python.exe';name=sys.argv[1]
env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1',OMP_NUM_THREADS='4',MKL_NUM_THREADS='4')
deadline=time.monotonic()+json.loads((S/'identity/budget.json').read_text())['trainDeadlineUnix']-time.time()
model=S/f'checkpoints/{name}/best.json'
cfg=json.loads((S/f'configs/train_{name}.json').read_text(encoding='utf8'));dataset=pathlib.Path(cfg['val']).parent.name
trainer=S/'research'/cfg.get('trainer','train.py')
jobs=[('train',[PY,trainer,'train',S/f'configs/train_{name}.json']),('parity_py',[PY,S/'research/train.py','parity',model]),('parity_ts',['node',S/'runs/parity.cjs',model]),('behavior',[PY,S/'research/behavior_check.py',model]),('offline',[PY,S/'research/offline_metrics.py',model,dataset]),('dev',['node',S/'research/evaluate.mjs',name,model])]
for kind,cmd in jobs:
    print('开始',name,kind,flush=True)
    with (S/f'runs/{kind}_{name}.log').open('a',encoding='utf8') as log:
        p=subprocess.run([str(x) for x in cmd],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=max(1,deadline-time.monotonic()))
    if p.returncode:raise RuntimeError(f'{name}/{kind} 失败，见日志')
complete={'name':name,'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'configSha256':hashlib.sha256((S/f'configs/train_{name}.json').read_bytes()).hexdigest(),'completedUnix':time.time(),'devGames':20}
(S/f'evidence/candidate_completed_{name}.json').write_text(json.dumps(complete),encoding='utf8')
print('完成',name,flush=True)
