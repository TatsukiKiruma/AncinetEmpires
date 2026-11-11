"""等待已授权采集/对照交付后自动完成轮1，不覆盖失败记录。"""
import os,time,pathlib,json,subprocess,sys
S=pathlib.Path(__file__).resolve().parents[1];ROOT=S.parents[1];PY=S/'tmp/venv/Scripts/python.exe';env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1',OMP_NUM_THREADS='4',MKL_NUM_THREADS='4')
deadline=json.loads((S/'identity/budget.json').read_text())['trainDeadlineUnix'];mono_deadline=time.monotonic()+deadline-time.time()
def ready():
    counts={}
    for p in (S/'data/raw').glob('base_*.json'):
        try:r=json.loads(p.read_text(encoding='utf8'))
        except (ValueError,OSError):continue
        counts[r['mapName']]=counts.get(r['mapName'],0)+1
    return len(counts)==7 and min(counts.values())>=16
while not ready():
    if time.monotonic()>mono_deadline:raise RuntimeError('正式训练截止，未启动轮1')
    time.sleep(10)
def run(args,name):
    print('运行',name,flush=True)
    with (S/f'runs/{name}.log').open('a',encoding='utf8') as log:
        p=subprocess.run([str(a) for a in args],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=max(1,mono_deadline-time.monotonic()))
    if p.returncode:raise RuntimeError(f'{name} 失败，保留日志')
    print('完成',name,flush=True)
if not (S/'data/base_locked/manifest.json').exists():run([PY,S/'research/curate.py','base_locked','base_*.jsonl.gz'],'curate_base_locked')
run(['node',S/'research/build.mjs','verify_dataset'],'build_verify_dataset')
run(['node',S/'runs/verify_dataset.cjs','base_locked'],'verify_base_locked')
while not (S/'runs/dev_b100_r/summary.json').exists():
    if time.monotonic()>mono_deadline:raise RuntimeError('训练截止，历史对照未完成')
    time.sleep(10)
for name,init in [('r1_warm','ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json'),('r1_scratch','scratch')]:
    if not (S/f'configs/train_{name}.json').exists():run([PY,S/'research/make_train_config.py',name,'base_locked',init,'42'],'config_'+name)
    run([PY,S/'research/train.py','train',S/f'configs/train_{name}.json'],'train_'+name)
    model=S/f'checkpoints/{name}/best.json'
    run([PY,S/'research/train.py','parity',model],'parity_py_'+name)
    run(['node',S/'runs/parity.cjs',model],'parity_ts_'+name)
    run([PY,S/'research/behavior_check.py',model],'behavior_'+name)
    run(['node',S/'research/evaluate.mjs',name,model],'dev_'+name)
(S/'evidence/round1_completed.json').write_text(json.dumps({'completed':True,'candidates':['r1_warm','r1_scratch']}))
