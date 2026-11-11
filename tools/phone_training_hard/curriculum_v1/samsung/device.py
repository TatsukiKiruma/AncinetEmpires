"""本轮三星专属设备路由；不访问小米或旧任务的写入口。"""
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import shlex
import subprocess
ROOT=Path(__file__).resolve().parents[4]
TASK=ROOT/'ai_training/hard_curriculum3000_execution_20261027'
OUT=TASK/'samsung-v1'
SOURCE=TASK/'collector-v5'
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE='ce071717887a94940b7e'
REMOTE='/data/local/tmp/aeii-hard-production-parallel-curriculum7-samsung-20261028-v1'
TEST_REMOTE='/data/local/tmp/aeii-hard-production-parallel-curriculum7-samsung-20261028-preflight'
PREVIOUS='/data/local/tmp/aeii-hard-production-parallel-samsung-20261024-04'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def text(p,v):Path(p).write_text(v,encoding='utf-8',newline='\n')
def call(*args,check=True,timeout=90):
    p=subprocess.run([ADB,'-s',DEVICE,*map(str,args)],capture_output=True,timeout=timeout)
    result={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'args':list(map(str,args)),'returncode':p.returncode,'stdout':p.stdout.decode('utf-8','replace'),'stderr':p.stderr.decode('utf-8','replace')}
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/'ADB_COMMANDS.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(result,ensure_ascii=False)+'\n')
    if check and p.returncode:raise RuntimeError(result)
    return result['stdout'].strip()
def shell(cmd,**kw):return call('shell',cmd,**kw)
def app(pkg,cmd,**kw):
    assert pkg in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12']
    return shell('run-as '+pkg+' sh -c '+shlex.quote(cmd),**kw)
def identity():
    assert call('get-serialno')==DEVICE and shell('getprop ro.product.model')=='SM-N9500'
    assert shell('getprop ro.build.version.sdk')=='28'
    original=json.loads((ROOT/'ai_training/hard_native_second_20261023/INSTALLED.json').read_text(encoding='utf-8'))
    state=json.loads(shell('cat '+PREVIOUS+'/STATE.json'))
    assert state['phase']=='complete' and state['doneParents']==500 and all(not w['controllerAlive'] for w in state['workers'])
    for w in original['workers'][:2]:
        path=shell('pm path '+w['package']).removeprefix('package:')
        assert path==w['installedPath'] and shell('sha256sum '+path).split()[0]==w['sha256']
        assert not shell('pidof '+w['package'],check=False)
        assert app(w['package'],'id').startswith('uid='+str(w['uid']))
    path=shell('pm path net.toyknight.aeii.android').removeprefix('package:')
    assert shell('sha256sum '+path).split()[0]==original['originalInstalledSha256']
    return {'device':DEVICE,'model':'SM-N9500','sdk':28,'oldQueue':state,'installed':original,'resources':shell('df -k /data\ndumpsys battery')}
