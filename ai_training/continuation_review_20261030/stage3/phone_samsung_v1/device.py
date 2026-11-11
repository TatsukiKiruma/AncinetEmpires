"""本阶段三星手机专属ADB通道；不写旧任务日志或操作其他手机。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
HERE=Path(__file__).resolve().parent
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
SERIAL='ce071717887a94940b7e'
REMOTE='/data/local/tmp/aeii-omni-stage3-samsung-20261030-v1'

def save(path,value):
    path=Path(path);path.parent.mkdir(exist_ok=True,parents=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8')

def call(*args,timeout=60,check=True,input=None):
    result=subprocess.run([ADB,'-s',SERIAL,*map(str,args)],input=input,capture_output=True,timeout=timeout)
    record=dict(utc=dt.datetime.now(dt.timezone.utc).isoformat(),args=list(map(str,args)),
        returncode=result.returncode,stdout=result.stdout.decode('utf-8','replace'),stderr=result.stderr.decode('utf-8','replace'))
    with (HERE/'ADB_COMMANDS.jsonl').open('a',encoding='utf-8') as log:
        log.write(json.dumps(record,ensure_ascii=False)+'\n')
    if check and result.returncode:
        raise RuntimeError(dict(returncode=result.returncode,args=record['args'],stdout=record['stdout'][-1200:],stderr=record['stderr'][-2000:],fullLog=str(HERE/'ADB_COMMANDS.jsonl')))
    return record['stdout'].strip()

def shell(command,**kwargs):
    return call('shell',command,**kwargs)

if __name__=='__main__':
    output=shell('''id
getprop ro.product.model
getprop ro.product.cpu.abi
command -v su || true
df -k /data
head -5 /proc/meminfo
dumpsys battery
ls -la /data/local/tmp
pm list packages | grep -E 'termux|linux|debian|ubuntu|aeii' || true
ps -A -o PID,PPID,ARGS | grep -E 'python|aeii|ubuntu|chroot|proot' | head -40
''')
    save(HERE/'DEVICE_PREFLIGHT.json',dict(serial=SERIAL,raw=output))
    print(output)
