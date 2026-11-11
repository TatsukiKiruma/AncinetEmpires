"""新Value教师重新采集并校准，严格核对冻结Policy；不采专家。"""
from pathlib import Path
import subprocess,sys,concurrent.futures,time,json,shutil
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
assert read('value-continuation-adoption.json')['passed'] and numeric_receipt_valid(HERE,'teacher')
def run(args,label):
    p=HERE/'revisions/r20'/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda i:run(ts('collect_search_scale.ts','teacher',str(i),'teacher-r20'),'collect-'+str(i)),range(4)))
run(py('compare_candidate_scalars.py','teacher-r19-cache','teacher-r20','r20','value'),'frozen-policy-and-leaf-changes')
run(py('fit_search_scale.py','teacher','teacher-r20','teacher-r20'),'fresh-calibration')
shutil.copy2(HERE/'search-scale/teacher-calibration.json',HERE/'revisions/r20/teacher-calibration.before.json');shutil.copy2(HERE/'search-scale/teacher-r20-calibration.json',HERE/'search-scale/teacher-calibration.json')
print('新Value重采与原规则校准完成，尚待所有前置复核和完整150槽',flush=True)
