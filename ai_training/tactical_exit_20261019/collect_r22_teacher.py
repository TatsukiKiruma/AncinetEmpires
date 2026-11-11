"""冻结R22并完整重采1557根，使用已含停止前缀的评测输入隔离索引。"""
from pathlib import Path
import subprocess,concurrent.futures,time,sys,shutil,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r22'
def run(args,label):
    p=REV/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p;print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
run(['node','ai_training/run.mjs','node','tactical_exit_20261019/freeze_sources.mjs','search-scale-teacher-r22','collect_search_scale.ts'],'freeze-collector-runtime')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda i:run(ts('collect_search_scale.ts','teacher',str(i),'teacher-r22'),'collect-'+str(i)),range(4)))
run(py('compare_r22_completion.py'),'physical-leaf-improvements')
assert json.loads((HERE/'search-scale/evaluation-index-teacher-r21-resume1.json').read_text())['interruptedPrefixes']==4
run(py('fit_search_scale.py','teacher','teacher-r22','teacher-r21-resume1'),'fresh-search-calibration')
shutil.copy2(HERE/'search-scale/teacher-calibration.json',REV/'teacher-calibration.before.snapshot');shutil.copy2(HERE/'search-scale/teacher-r22-calibration.json',HERE/'search-scale/teacher-calibration.json')
print('R22完整重采/隔离/校准完成，教师尚未合格',flush=True)
