"""保留已运行的A局，补齐指定局号；总预算不延长。"""
import ctypes,json,os,subprocess,time,datetime
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
DATA=Path('D:/AncientEmpiresData/speed_bench_20261107_v1')
deadline=(HERE/'git-status-before.txt').stat().st_ctime+56*60
status={'status':'waiting_for_A','completed':[]};child=None
def save(): (HERE/'CORRECTED_PROGRESS.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
try:
    save()
    while not (DATA/'Tactical-A-result.json').exists():
        if time.time()>=deadline:raise TimeoutError('A组未在预算内完成；指定补充局未启动')
        time.sleep(1)
    prior=json.loads((HERE/'REMAINING_PROGRESS.json').read_text('utf-8'));pid=int(prior['activePid'])
    command=subprocess.check_output(['powershell','-NoProfile','-Command',f"(Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}').CommandLine"],text=True).lower()
    if 'speed_bench_20261107' not in command or 'game_bench.ts' not in command:raise RuntimeError('旧控制器子进程身份不匹配，拒绝终止')
    subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
    status['retiredOldPanelPid']=pid
    for mode in ['tactical-corrected','selfplay-rest']:
        with (DATA/f'{mode}-final.log').open('x',encoding='utf-8') as log:
            child=subprocess.Popen(['node','--import','tsx',str(HERE/'game_bench.ts'),mode],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
            status.update(status='running',activePid=child.pid,activeMode=mode);save()
            code=child.wait(timeout=max(1,deadline-time.time()))
            if code:raise RuntimeError(f'{mode}退出码{code}')
            status['completed'].append(mode);child=None
    status['status']='complete'
except Exception as e:status.update(status='incomplete',error=repr(e))
finally:
    if child and child.poll() is None:
        subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW);child.wait(timeout=20)
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
    status.update(activePid=None,sleepLockReleased=True,finished=datetime.datetime.now().isoformat());save()
