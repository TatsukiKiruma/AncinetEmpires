"""在DAgger固定采集计划完成后连续核验、续训和评测；不消费FINAL。"""
import pathlib,json,time,subprocess,os
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1];PY=S/'tmp/venv/Scripts/python.exe';env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
deadline=time.monotonic()+json.loads((S/'identity/budget.json').read_text())['trainDeadlineUnix']-time.time()
while not all((S/f'data/collection_dagger_r2_{a}_{b}_complete.json').exists() for a,b in [(2,6),(6,10)]):
    if time.monotonic()>deadline:raise RuntimeError('轮2截止，采集不完整')
    time.sleep(10)
def run(args,name):
    print('开始',name,flush=True)
    with (S/f'runs/{name}.log').open('a',encoding='utf8') as log:
        p=subprocess.run([str(x) for x in args],cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=max(1,deadline-time.monotonic()))
    if p.returncode:raise RuntimeError(name+'失败')
if not (S/'data/dagger_locked/manifest.json').exists():run([PY,S/'research/mix_dagger.py','dagger_locked','base_locked','dagger_r2_*.jsonl.gz'],'mix_dagger_locked')
m=json.loads((S/'data/dagger_locked/manifest.json').read_text(encoding='utf8'));assert m['newUniqueDaggerRows']>=1500,'DAgger新独特输入不足，需扩展采集或明确缩规模分支'
run(['node',S/'runs/verify_dataset.cjs','dagger_locked'],'verify_dagger_locked')
run([PY,S/'research/dataset_supplement.py','dagger_locked'],'supplement_dagger_locked')
if not (S/'configs/train_r2_dagger.json').exists():run([PY,S/'research/make_train_config.py','r2_dagger','dagger_locked',S/'checkpoints/r1_warm/best.json','42'],'config_r2_dagger')
run([PY,S/'research/run_candidate.py','r2_dagger'],'pipeline_r2_dagger')
(S/'evidence/round2_completed.json').write_text(json.dumps({'completed':True,'parent':'r1_warm','candidate':'r2_dagger'}),encoding='utf8')
