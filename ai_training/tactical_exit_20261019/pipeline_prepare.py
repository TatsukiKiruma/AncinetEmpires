"""数据完成后执行审计和教师Value训练；不得提前启动未验证教师。"""
from pathlib import Path
import json,sys,subprocess,time,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def run(script,log,*args):
    with (HERE/log).open('x',encoding='utf-8') as out:r=subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/'+script,*args],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT)
    if r.returncode:raise RuntimeError(log+' 失败 '+str(r.returncode))
try:
    while not (HERE/'contract.json').exists():
        if (HERE/'prepare-exit.json').exists() and not json.loads((HERE/'prepare-exit.json').read_text())['passed']:raise RuntimeError('预处理失败')
        time.sleep(2)
    save('TASK_STATE.json',dict(status='running',complete=False,phase='900父局审计与教师Value训练'))
    run('audit_data.py','data-audit.log')
    # 两个独立优化器各用4线程；实战计时只在它们均结束后进行。
    policyLog=(HERE/'base-policy-training.log').open('x',encoding='utf-8')
    policy=subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/train_policy.py','base'],cwd=ROOT,stdout=policyLog,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    save('base-training-process.json',dict(pid=policy.pid))
    run('train_value.py','teacher-value-training.log','teacher')
    if policy.wait():raise RuntimeError('base-policy-training.log 失败')
    save('prepare-pipeline-exit.json',dict(passed=True))
except BaseException as e:
    save('prepare-pipeline-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()));raise
