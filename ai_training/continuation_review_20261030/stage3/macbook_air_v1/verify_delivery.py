"""核验Mac用户级独立会话、互斥、防休眠和无SSH期间持续推进。"""
import json
import shlex
import time
from device import HERE,REMOTE,ssh,save

def capture():
    code='''import json,pathlib,os,subprocess
r=pathlib.Path(ROOT)
def read(p):return json.loads(p.read_text())
c=read(r/'CONTROLLER_IDENTITY.json');t=read(r/'TRAINER_IDENTITY.json')
files=['PROGRESS.json','RESOURCE.json','LATEST.json','BLOCKED.json','COMPLETE.json','CONTROLLER_BLOCKED.json']
v={name:read(r/'work/training'/name) for name in files if (r/'work/training'/name).exists()}
restores=sorted((r/'work/training').glob('RESTORE-*.json'),key=lambda p:p.stat().st_mtime)
metrics=sorted((r/'work/training').glob('METRICS-*.jsonl'),key=lambda p:p.stat().st_mtime)[-1]
rows=[json.loads(s) for s in metrics.read_text().splitlines() if s.strip()][-30:]
ids=str(c['pid'])+','+str(t['pid'])
ps=subprocess.run(['/bin/ps','-p',ids,'-o','pid=,ppid=,pgid=,tty=,command='],capture_output=True,text=True).stdout
fd=subprocess.run(['/usr/sbin/lsof','-a','-p',ids,'-d','0,1,2'],capture_output=True,text=True).stdout
children=subprocess.run(['/usr/bin/pgrep','-P',str(c['pid']),'-x','caffeinate'],capture_output=True,text=True).stdout.split()
assert children,'没有找到本控制器的caffeinate子进程'
assert int(subprocess.run(['/bin/ps','-p',str(c['pid']),'-o','ppid='],capture_output=True,text=True).stdout.strip())==1
assert os.getsid(t['pid'])==t['pid']
assert '/dev/null' in fd and str(r/'logs') in fd
print(json.dumps(dict(controller=c,trainer=t,files=v,restore=read(restores[-1]),metrics=rows,processes=ps,stdio=fd,caffeinatePids=children,trainerIndependentSession=True,epoch=__import__('time').time()),ensure_ascii=False))
'''.replace('ROOT',repr(REMOTE))
    return json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=60))

def inspect():
    value=capture();pilot=json.loads((HERE/'FORMAL_PILOT.json').read_text('utf-8'))
    assert value['restore']['update']==4501 and value['restore']['sourceSha256']==pilot['lastCheckpoint']['sha256']
    assert value['restore']['modelExact'] and value['restore']['adamWMomentsAndStepsExact']
    assert value['restore']['samplerCursorExact'] and value['restore']['dropoutRngExact']
    assert value['metrics'][-1]['update']>4501
    assert not any(k in value['files'] for k in ['BLOCKED.json','COMPLETE.json','CONTROLLER_BLOCKED.json'])
    save(HERE/'INDEPENDENT_SESSION.json',dict(passed=True,**value))
    print(json.dumps(dict(passed=True,update=value['metrics'][-1]['update'],controller=value['controller']['pid'],trainer=value['trainer']['pid'],caffeinate=value['caffeinatePids'])))

def singleton():
    before=capture();output=ssh('cd '+REMOTE+' && runtime/venv/bin/python controller.py');after=capture()
    assert before['controller']==after['controller'] and before['trainer']==after['trainer']
    save(HERE/'SINGLETON_VERIFIED.json',dict(passed=True,output=output,controller=after['controller'],trainer=after['trainer']))
    print('MAC_SINGLETON_PASSED')

def disconnect():
    before=capture();started=time.time()
    # 每次SSH均禁用连接复用；这里SSH进程已退出，40秒内不再连接Mac。
    time.sleep(40)
    after=capture()
    assert before['controller']==after['controller'] and before['trainer']==after['trainer']
    assert after['metrics'][-1]['update']>before['metrics'][-1]['update']
    result=dict(passed=True,sshAbsentSeconds=40,controllerUnchanged=True,trainerUnchanged=True,
        beforeUpdate=before['metrics'][-1]['update'],afterUpdate=after['metrics'][-1]['update'],startedEpoch=started,endedEpoch=time.time(),
        before=before,after=after,networkDisconnectedPhysically=False,lidClosureTested=False)
    save(HERE/'SSH_DISCONNECT_VERIFIED.json',result)
    print(json.dumps({k:result[k] for k in ['passed','sshAbsentSeconds','beforeUpdate','afterUpdate','controllerUnchanged']}))

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['inspect','singleton','disconnect']);args=parser.parse_args();globals()[args.action]()
