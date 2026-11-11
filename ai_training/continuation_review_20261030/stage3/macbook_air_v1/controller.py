"""Mac用户级离线控制器：互斥、防休眠、同一完整安全点限次恢复。"""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import uuid

ROOT=Path(__file__).resolve().parent
WORK=ROOT/'work'
OUT=WORK/'training'
LOGS=ROOT/'logs'

def read(path):return json.loads(path.read_text('utf-8'))
def atomic(path,value):
    temporary=path.with_name('.'+path.name+'.'+uuid.uuid4().hex)
    with temporary.open('w',encoding='utf-8') as stream:
        json.dump(value,stream,ensure_ascii=False,indent=2);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)

def fingerprint(pid):
    result=subprocess.run(['/bin/ps','-p',str(pid),'-o','lstart=,command='],capture_output=True,text=True)
    return result.stdout.strip() if result.returncode==0 else None

def stop(_number,_frame):
    WORK.joinpath('STOP').touch()

def blocked():
    return any(path.exists() for path in [WORK/'STOP',OUT/'COMPLETE.json',OUT/'BLOCKED.json',OUT/'CONTROLLER_BLOCKED.json'])

def main():
    LOGS.mkdir(exist_ok=True)
    lock=(ROOT/'controller.lock').open('a')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        print('控制器已运行，本次启动退出。',flush=True);return
    if blocked():return
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    atomic(ROOT/'CONTROLLER_IDENTITY.json',dict(pid=os.getpid(),ppid=os.getppid(),sid=os.getsid(0),
        fingerprint=fingerprint(os.getpid()),epoch=time.time(),windowsRequired=False,networkRequired=False))
    # 控制器异常重启时，仍存活且身份完全匹配的原训练进程只接管等待。
    if (ROOT/'TRAINER_IDENTITY.json').exists():
        old=read(ROOT/'TRAINER_IDENTITY.json')
        if old.get('fingerprint') and fingerprint(old['pid'])==old['fingerprint'] and str(ROOT) in old['fingerprint']:
            while fingerprint(old['pid'])==old['fingerprint']:time.sleep(10)
    attempts=[]
    for attempt in range(1,4):
        if blocked():break
        stamp=str(time.time_ns());log=(LOGS/('train-'+stamp+'.log')).open('ab',buffering=0)
        environment=dict(os.environ,OMNI_WORK=str(WORK),OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='4',
            PYTORCH_MPS_FAST_MATH='0',PYTORCH_ENABLE_MPS_FALLBACK='0',PYTHONUNBUFFERED='1')
        process=subprocess.Popen([str(ROOT/'runtime/venv/bin/python'),'-u',str(WORK/'train_mac.py')],cwd=ROOT,
            stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=environment,start_new_session=True,close_fds=True)
        identity=dict(pid=process.pid,fingerprint=fingerprint(process.pid),attempt=attempt,epoch=time.time())
        atomic(ROOT/'TRAINER_IDENTITY.json',identity)
        caffeinate=subprocess.Popen(['/usr/bin/caffeinate','-i','-s','-w',str(process.pid)],stdin=subprocess.DEVNULL,
            stdout=log,stderr=log,start_new_session=True,close_fds=True)
        code=process.wait()
        if caffeinate.poll() is None:
            caffeinate.terminate()
            try:caffeinate.wait(timeout=10)
            except subprocess.TimeoutExpired:caffeinate.kill();caffeinate.wait()
        log.close()
        result=dict(identity,returncode=code,endedEpoch=time.time());attempts.append(result)
        with (ROOT/'CONTROLLER_ATTEMPTS.jsonl').open('a',encoding='utf-8') as stream:
            stream.write(json.dumps(result)+'\n');stream.flush();os.fsync(stream.fileno())
        if blocked() or code==0:break
        if attempt==3:
            atomic(OUT/'CONTROLLER_BLOCKED.json',dict(error='连续三次进程中断，等待检查',attempts=attempts));break
        time.sleep(20)
    phase='complete' if (OUT/'COMPLETE.json').exists() else 'paused' if (WORK/'STOP').exists() else 'blocked'
    atomic(ROOT/'CONTROLLER_EXIT.json',dict(phase=phase,epoch=time.time(),attempts=attempts,automaticBeyond100k=False))

if __name__=='__main__':
    try:main()
    except BaseException as error:
        import traceback
        atomic(ROOT/'CONTROLLER_FATAL.json',dict(error=repr(error),traceback=traceback.format_exc(),epoch=time.time()))
