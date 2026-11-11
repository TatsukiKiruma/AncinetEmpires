"""重新采集固定1557根，核验纯性能变更，不进入专家自走。"""
from pathlib import Path
import subprocess,sys,time,concurrent.futures,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def run(args,label):
    log=HERE/'revisions/r19'/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda i:run(ts('collect_search_scale.ts','teacher',str(i),'teacher-r19-cache'),'collect-'+str(i)),range(4)))
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/compare_candidate_scalars.py','teacher-r18','teacher-r19-cache','r19','cache'],'all-candidates-exact')
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/compare_cache_witness.py','teacher-r18','teacher-r19-cache','r19'],'all-witnesses-exact')
print('全部固定根候选与NN输入一致，尚未宣称教师资格',flush=True)
