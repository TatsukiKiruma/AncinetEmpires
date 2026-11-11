"""保留已完成训练及开发初筛，从中断的C3继续后续门控流程。"""
import ctypes
import json
import os
import subprocess
from run_pipeline import HERE, ROOT, PYTHON, run, node, progress, reserve

def main():
    if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000001):raise RuntimeError('防休眠锁获取失败')
    print(f'恢复控制器已获取防休眠锁，PID={os.getpid()}',flush=True)
    try:
        run('development-resume-01',node('resume_development.ts'))
        gate=json.loads((HERE/'GATE_DECISION.json').read_text(encoding='utf-8'))
        if gate['passed']:
            run('sealed-matches',node('sealed.ts'))
            run('sealed-offline',[str(PYTHON),'-B','-X','utf8',str(HERE/'sealed_offline.py')])
            run('final-statistics',node('final_statistics.ts'))
        checks={}
        for label,command in [('lint',['npm.cmd','run','lint']),('test',['npm.cmd','test']),('build',['npm.cmd','run','build'])]:
            reserve(1048576)
            with (HERE/f'final-{label}.log').open('xb') as log:checks[label]=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
        with (HERE/'FINAL_PUBLIC_CHECKS.json').open('x',encoding='utf-8') as f:json.dump(checks,f,indent=2)
        if any(checks.values()):raise RuntimeError('公共检查未全部通过')
        progress('执行完成，等待独立进程审计与报告',sealedAccess=int(gate['passed']),publicChecks=checks)
    except BaseException as error:
        progress('执行异常',error=str(error),sealedAccess=int((HERE/'FINAL_TEST_ATTEMPT.json').exists()))
        raise
    finally:
        if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000000):raise RuntimeError('防休眠锁释放失败')
        print('恢复控制器防休眠锁已释放',flush=True)

if __name__=='__main__':main()
