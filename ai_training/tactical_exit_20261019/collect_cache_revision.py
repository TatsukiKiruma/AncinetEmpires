"""独立重采R18固定根池，先证明全部候选完全相同，再运行原校准与全部前置门禁。"""
from pathlib import Path
import subprocess,sys,concurrent.futures,time,json,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def run(args,label):
    p=HERE/'revisions/r18'/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(lambda lane:None if (HERE/f'search-scale/teacher-r18-{lane}.receipt.json').exists() else run(ts('collect_search_scale.ts','teacher',str(lane),'teacher-r18'),'collect-'+str(lane)),range(4)))
run(py('compare_candidate_scalars.py','teacher-r17','teacher-r18','r18','cache'),'candidate-exact')
if not (HERE/'search-scale/teacher-r18-calibration.json').exists():run(py('fit_search_scale.py','teacher','teacher-r18','teacher-r18'),'calibration')
if not (HERE/'revisions/r18/teacher-calibration.before.json').exists():shutil.copy2(HERE/'search-scale/teacher-calibration.json',HERE/'revisions/r18/teacher-calibration.before.json')
shutil.copy2(HERE/'search-scale/teacher-r18-calibration.json',HERE/'search-scale/teacher-calibration.json')
run(py('validate_guard_revision.py','r18','r17'),'all-preflight')
run(['node','ai_training/run.mjs','node','tactical_exit_20261019/prepare_revision.mjs','r18','r17'],'publish-ready')
print('R18前置复核全部通过，允许完整150槽',flush=True)
