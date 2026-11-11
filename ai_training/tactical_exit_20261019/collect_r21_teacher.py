"""重采完整根池、排除全部已消费面板前态，再按原开发条件校准。"""
from pathlib import Path
import subprocess,concurrent.futures,time,sys,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21'
def run(args,label):
    p=REV/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda i:run(ts('collect_search_scale.ts','teacher',str(i),'teacher-r21'),'collect-'+str(i)),range(4)))
run(ts('search_scale_sources.ts','index','teacher-r21'),'evaluation-input-index')
run(py('compare_safe_completion.py'),'physical-leaf-improvements')
run(py('fit_search_scale.py','teacher','teacher-r21','teacher-r21'),'fresh-search-calibration')
shutil.copy2(HERE/'search-scale/teacher-calibration.json',REV/'teacher-calibration.before.json');shutil.copy2(HERE/'search-scale/teacher-r21-calibration.json',HERE/'search-scale/teacher-calibration.json')
print('R21重采/排重/校准完成，尚未宣称教师资格',flush=True)
