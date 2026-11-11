"""有界总控、防休眠和异常进程树回收；未完赛不得计作自然结果。"""
import ctypes,json,os,subprocess,time,datetime
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DATA=Path('D:/AncientEmpiresData/speed_bench_20261107_v1')
start=(HERE/'git-status-before.txt').stat().st_ctime
deadline=start+56*60
child=None
status={'started':datetime.datetime.now().isoformat(),'completed':[],'activeCount':None}
ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
try:
    while time.time()<deadline:
        f=HERE/'SEARCH_ABLATION_BENCH.json'
        try:
            if f.exists() and json.loads(f.read_text('utf-8'))['status']=='complete':break
        except (ValueError,KeyError):pass
        time.sleep(2)
    else:raise TimeoutError('搜索消融未在总预算内完成')
    # 依次运行两种端到端负载，避免相互污染GPU计时。
    for mode in ['selfplay','tactical']:
        with (DATA/f'{mode}.log').open('x',encoding='utf-8') as log:
            child=subprocess.Popen(['node','--import','tsx',str(HERE/'game_bench.ts'),mode],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
            status['activePid']=child.pid
            (HERE/'RUN_PROGRESS.json').write_text(json.dumps(status,indent=2),encoding='utf-8')
            code=child.wait(timeout=max(1,deadline-time.time()))
            if code:raise RuntimeError(f'{mode}退出码{code}')
            status['completed'].append(mode);child=None
    status['status']='complete'
except Exception as error:
    status['status']='incomplete';status['error']=repr(error)
finally:
    if child and child.poll() is None:
        subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
        child.wait(timeout=20)
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
    status['sleepLockReleased']=True;status['finished']=datetime.datetime.now().isoformat();status['activePid']=None
    (HERE/'RUN_PROGRESS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
