"""运行推进、独立会话、互斥启动及短时ADB断开验收。"""
import json
import subprocess
import time
from device import HERE,ADB,SERIAL,call,save
from runtime_setup import termux,HOME
from linux_setup import PHONE

def get(name):return json.loads(termux('cat '+PHONE+'/'+name))
def metric():
    text=termux('ls -t '+PHONE+'/work/training/METRICS-*.jsonl | head -1 | xargs tail -1')
    return json.loads(text)
def inspect():
    identity=get('CONTROLLER_IDENTITY.json');trainer=get('TRAINER_IDENTITY.json');progress=get('work/training/PROGRESS.json')
    ids=[identity['pid'],trainer['pid'],progress['phonePid']]
    values=[]
    for pid in ids:
        output=termux(f'cat /proc/{pid}/stat; tr "\\0" " " < /proc/{pid}/cmdline; echo; for f in 0 1 2; do readlink /proc/{pid}/fd/$f; done')
        values.append(dict(pid=pid,raw=output))
    stat=values[0]['raw'].splitlines()[0];fields=stat[stat.rfind(')')+2:].split()
    assert int(fields[1])==1 and int(fields[3])==identity['pid'] and int(fields[4])==0,(identity,stat)
    assert values[0]['raw'].splitlines()[-3]=='/dev/null'
    assert '/logs/' in values[0]['raw'].splitlines()[-2]
    assert values[2]['raw'].splitlines()[-3]=='/dev/null'
    assert '/logs/train-' in values[2]['raw'].splitlines()[-2]
    restore=termux('ls -t '+PHONE+'/work/training/RESTORE-*.json | head -1 | xargs cat')
    result=dict(passed=True,controller=identity,trainer=trainer,progress=progress,processes=values,
        restored=json.loads(restore),metric=metric(),stdioIsPhoneLocal=True,ttyAbsent=True,sessionIndependent=True,epoch=time.time())
    save(HERE/'INDEPENDENT_SESSION.json',result);print(json.dumps(result,ensure_ascii=False),flush=True)

def disconnect():
    devices=subprocess.run([ADB,'devices','-l'],capture_output=True,text=True,check=True).stdout
    attached=[line for line in devices.splitlines()[1:] if line.strip()]
    assert len(attached)==1 and attached[0].split()[0]==SERIAL,'还有其他ADB设备，避免打断其连接'
    before=metric();identity=get('CONTROLLER_IDENTITY.json');start=time.time()
    call('shell','input keyevent 223')
    subprocess.run([ADB,'kill-server'],capture_output=True,check=True)
    time.sleep(40)
    reconnect=subprocess.run([ADB,'devices','-l'],capture_output=True,text=True,check=True).stdout
    time.sleep(2)
    after=metric();current=get('CONTROLLER_IDENTITY.json')
    assert after['update']>before['update'],(before,after)
    assert identity==current,'断ADB期间本地控制器发生变化'
    wake=call('shell','dumpsys power')
    wake_lines=[s for s in wake.splitlines() if 'termux:service-wakelock' in s]
    assert wake_lines,'没有确认Termux唤醒锁'
    result=dict(passed=True,before=before,after=after,hostAdbServerAbsentSeconds=40,
        controllerUnchanged=True,screenOffCommand=True,physicalUsbUnplugTested=False,networkNeeded=False,
        wakeLock=wake_lines,devicesBefore=devices,devicesAfter=reconnect,startedEpoch=start,endedEpoch=time.time())
    save(HERE/'ADB_DISCONNECT_VERIFIED.json',result);print(json.dumps(result,ensure_ascii=False),flush=True)

def singleton():
    previous=get('CONTROLLER_IDENTITY.json');trainer=get('TRAINER_IDENTITY.json')
    termux('bash '+HOME+'/.termux/boot/aeii-omni-stage3-v1');time.sleep(2)
    assert get('CONTROLLER_IDENTITY.json')==previous
    assert get('TRAINER_IDENTITY.json')==trainer
    save(HERE/'SINGLETON_VERIFIED.json',dict(passed=True,controller=previous,trainer=trainer,duplicateBootInvocationDidNotSpawn=True))
    print('SINGLETON_PASSED',flush=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['inspect','disconnect','singleton']);args=parser.parse_args();globals()[args.action]()
