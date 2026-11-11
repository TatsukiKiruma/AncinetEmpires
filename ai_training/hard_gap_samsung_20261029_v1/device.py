"""三星缺口批次专属路由与留痕，不复用旧队列写入口。"""
from pathlib import Path
import datetime as dt
import hashlib
import json
import shlex
import subprocess

OUT=Path(__file__).resolve().parent
ROOT=OUT.parent.parent
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE='ce071717887a94940b7e'
REMOTE='/data/local/tmp/aeii-hard-production-parallel-gap-samsung-20261029-v1'
TEST_REMOTE='/data/local/tmp/aeii-hard-production-parallel-gap-samsung-20261029-preflight-v1'
SOURCE=ROOT/'ai_training/hard_curriculum3000_execution_20261027/samsung-v1'

def read(file):return json.loads(Path(file).read_text(encoding='utf-8'))
def sha(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def write(file,value):
    with Path(file).open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def text(file,value):Path(file).write_text(value,encoding='utf-8',newline='\n')
def call(*args,check=True,timeout=90):
    p=subprocess.run([ADB,'-s',DEVICE,*map(str,args)],capture_output=True,timeout=timeout)
    value={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'args':list(map(str,args)),'returncode':p.returncode,'stdout':p.stdout.decode('utf-8','replace'),'stderr':p.stderr.decode('utf-8','replace')}
    with (OUT/'ADB_COMMANDS.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(value,ensure_ascii=False)+'\n')
    if check and p.returncode:raise RuntimeError(value)
    return value['stdout'].strip()
def shell(command,**kwargs):return call('shell',command,**kwargs)
def app(package,command,**kwargs):
    assert package in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12']
    return shell('run-as '+package+' sh -c '+shlex.quote(command),**kwargs)
def identity():
    assert call('get-serialno')==DEVICE and shell('getprop ro.product.model')=='SM-N9500'
    assert shell('getprop ro.build.version.sdk')=='28'
    installed=read(ROOT/'ai_training/hard_native_second_20261023/INSTALLED.json')
    for w in installed['workers'][:2]:
        package=w['package'];apk=shell('pm path '+package).removeprefix('package:')
        assert shell('sha256sum '+apk).split()[0]==w['sha256']
        assert not shell('pidof '+package,check=False),'独立采集包已在运行，禁止重叠调度'
        assert app(package,'id').startswith('uid='+str(w['uid']))
    original=shell('pm path net.toyknight.aeii.android').removeprefix('package:')
    assert shell('sha256sum '+original).split()[0]==installed['originalInstalledSha256']
    processes=shell('ps -A -o PID,PPID,NAME,ARGS')
    assert not any('controller.sh' in line or 'master.sh /data/local/tmp/aeii-hard-' in line for line in processes.splitlines()),'发现既有采集调度进程，先核对而不重启'
    return {'device':DEVICE,'model':'SM-N9500','sdk':28,'installed':installed,'resources':shell('df -k /data\ndumpsys battery'),'processes':processes,'captured':dt.datetime.now(dt.timezone.utc).isoformat()}
