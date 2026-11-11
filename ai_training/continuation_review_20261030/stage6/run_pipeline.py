"""本轮端到端控制器：等待固定教师完成，依序训练、开发门控和唯一条件封存。"""
import ctypes
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from write_budget import reserve

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
PYTHON=ROOT/'ai_training/.venv-rocm/Scripts/python.exe'

def progress(stage, **extra):
    payload=json.dumps({'stage':stage,'updated':datetime.datetime.now(datetime.timezone.utc).isoformat(),**extra},ensure_ascii=False,indent=2).encode('utf-8')
    reserve(65536)
    (HERE/'PIPELINE_PROGRESS.json').write_bytes(payload)
    print(payload.decode('utf-8'),flush=True)

def run(name, command):
    progress(name)
    reserve(1048576)
    with (HERE/(name+'.log')).open('xb') as log:
        result=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    if result.returncode:
        raise RuntimeError(f'{name}失败，退出码{result.returncode}')

def node(script):
    return ['node','ai_training/run.mjs','node','--import','tsx',str(HERE/script)]

def main():
    if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000001):raise RuntimeError('防休眠锁获取失败')
    print(f'端到端控制器防休眠锁已获取，PID={os.getpid()}',flush=True)
    try:
        progress('等待固定教师采集完成',collectorPid=int(sys.argv[1]),sealedAccess=0)
        while not (HERE/'DISTILL_DATA_MANIFEST.json').exists():
            if (HERE/'STOP').exists(): raise RuntimeError('用户停止标志')
            time.sleep(30)
        run('single-game-value-benchmark',node('game_value_benchmark.ts'))
        run('train-policy',[str(PYTHON),'-B','-X','utf8',str(HERE/'train_policy.py')])
        run('development',node('development.ts'))
        gate=json.loads((HERE/'GATE_DECISION.json').read_text(encoding='utf-8'))
        if gate['passed']:
            run('sealed-matches',node('sealed.ts'))
            run('sealed-offline',[str(PYTHON),'-B','-X','utf8',str(HERE/'sealed_offline.py')])
            run('final-statistics',node('final_statistics.ts'))
        progress('评测分支完成，准备公共检查',sealedAccess=int(gate['passed']))
        checks={}
        for label,command in [('lint',['npm.cmd','run','lint']),('test',['npm.cmd','test']),('build',['npm.cmd','run','build'])]:
            reserve(1048576)
            with (HERE/f'final-{label}.log').open('xb') as log:
                checks[label]=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
        with (HERE/'FINAL_PUBLIC_CHECKS.json').open('x',encoding='utf-8') as stream:json.dump(checks,stream,indent=2)
        if any(checks.values()):raise RuntimeError('公共检查未全部通过')
        progress('执行完成，等待独立进程审计与报告',sealedAccess=int(gate['passed']),publicChecks=checks)
    except BaseException as error:
        progress('执行异常',error=str(error),sealedAccess=int((HERE/'FINAL_TEST_ATTEMPT.json').exists()))
        raise
    finally:
        if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000000):raise RuntimeError('防休眠锁释放失败')
        print(f'端到端控制器防休眠锁已释放，PID={os.getpid()}',flush=True)

if __name__=='__main__':main()
