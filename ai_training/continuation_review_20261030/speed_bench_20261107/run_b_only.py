"""总预算内保留B组实战证据；A未完局不作裁定。"""
import ctypes,json,os,subprocess,time,datetime
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
DATA=Path('D:/AncientEmpiresData/speed_bench_20261107_v1')
deadline=(HERE/'git-status-before.txt').stat().st_ctime+56*60
status={'status':'running','completed':[]};child=None
ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
try:
    for mode in ['tactical-B-only','selfplay-rest']:
        with (DATA/f'{mode}-budget2.log').open('x',encoding='utf-8') as log:
            child=subprocess.Popen(['node','--import','tsx',str(HERE/'game_bench.ts'),mode],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
            status.update(activePid=child.pid,activeMode=mode)
            (HERE/'B_PROGRESS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
            code=child.wait(timeout=max(1,deadline-time.time()))
            if code:raise RuntimeError(f'{mode}退出码{code}')
            status['completed'].append(mode);child=None
    status['status']='complete'
except Exception as e:status.update(status='incomplete',error=repr(e))
finally:
    if child and child.poll() is None:
        subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW);child.wait(timeout=20)
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
    status.update(activePid=None,sleepLockReleased=True,finished=datetime.datetime.now().isoformat())
    (HERE/'B_PROGRESS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
