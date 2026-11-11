"""等待轮3训练退出后，执行所有可能领先链共有的第二seed基础臂。"""
import json,pathlib,time,subprocess,sys,os
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1]
deadline=time.monotonic()+json.loads((S/'identity/budget.json').read_text())['trainDeadlineUnix']-time.time()
while 'parity_py' not in (S/'runs/round3_pipeline.log').read_text(encoding='utf8'):
    if time.monotonic()>deadline:raise RuntimeError('第二seed前缀未启动，训练截止')
    time.sleep(10)
cfg=json.loads((S/'configs/train_r1_warm.json').read_text(encoding='utf8'));cfg.update(id='r1_warm_s2026',seed=2026)
with (S/'configs/train_r1_warm_s2026.json').open('x',encoding='utf8') as f:json.dump(cfg,f,ensure_ascii=False,indent=2)
(S/'identity/second_seed_prefix.json').write_text(json.dumps({'candidate':'r1_warm_s2026','scope':'轮1或轮3领先配方的共有基础训练前缀；完整链待轮3DEV结束确定，不预先称全链复核完成。'}),encoding='utf8')
env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
subprocess.run([sys.executable,str(S/'research/run_candidate.py'),'r1_warm_s2026'],cwd=R,env=env,check=True,timeout=max(1,deadline-time.monotonic()))
