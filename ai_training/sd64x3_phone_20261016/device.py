import pathlib, subprocess, json, re, time, threading, hashlib, sys, shutil

ROOT=pathlib.Path(__file__).resolve().parent
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
REMOTE='/data/local/tmp/ae_sd64x3_900_20261016'
TOOL='/data/local/tmp/ae_sd32_900_20261016'


def adb(*args, check=True, timeout=30):
    p=subprocess.run([ADB,'-s','c2357770',*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
    if check and p.returncode: raise RuntimeError(p.stdout+p.stderr)
    return p.stdout.strip()


def snapshot():
    battery=adb('shell','dumpsys','battery')
    memory=adb('shell','cat','/proc/meminfo')
    disk=adb('shell','df','-k','/data')
    capture=adb('shell','pidof','net.toyknight.aeii.android',check=False)
    # 原子检查点会短暂创建并重命名临时文件；只对这一明确竞争重试，不吞掉其他存储错误。
    for attempt in range(5):
        measured=subprocess.run([ADB,'-s','c2357770','shell','du','-sk',REMOTE],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
        if measured.returncode==0:break
        errors=[line for line in measured.stderr.splitlines() if line.strip()]
        if not errors or not all(REMOTE+'/resume.json.tmp' in line and 'No such file or directory' in line for line in errors):raise RuntimeError(measured.stdout+measured.stderr)
        time.sleep(.05)
    else:raise RuntimeError('检查点临时文件竞争持续，无法确认存储水位')
    size=int(measured.stdout.split()[0])*1024
    return dict(at=time.time(),temperature=int(re.search(r'temperature:\s*(\d+)',battery)[1])/10,memAvailableBytes=int(re.search(r'MemAvailable:\s*(\d+)',memory)[1])*1024,freeBytes=int(disk.splitlines()[-1].split()[3])*1024,capturePids=capture.split(),remoteBytes=size)


def suitable(s):
    return s['temperature']<38 and s['memAvailableBytes']>=1024**3 and s['freeBytes']>=2*1024**3 and not s['capturePids'] and s['remoteBytes']<512*1024**2


def transfer(names):
    for name in names:
        target=REMOTE+'/'+name
        adb('shell','mkdir','-p',target.rsplit('/',1)[0])
        adb('push',str(ROOT/name),target,timeout=120)
        expected=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
        assert adb('shell','sha256sum',target).split()[0]==expected,name


def owned_signal(pid,signal):
    # 编译器子进程也只沿本任务父链查找，逐一核对本阶段绝对路径后发送信号。
    lines=adb('shell','ps','-A','-o','PID,PPID,NAME').splitlines()[1:]
    owned={pid}; changed=True
    while changed:
        changed=False
        for line in lines:
            fields=line.split()
            if len(fields)>=2 and fields[0].isdigit() and fields[1].isdigit() and int(fields[1]) in owned and int(fields[0]) not in owned:
                owned.add(int(fields[0]));changed=True
    for target in sorted(owned,reverse=True):
        cmdline=adb('shell','cat',f'/proc/{target}/cmdline',check=False)
        if REMOTE in cmdline: adb('shell','kill','-'+signal,str(target),check=False)


def run(command,tag):
    original_tag=tag;attempt=1
    while (ROOT/(tag+'.stdout.jsonl')).exists():
        attempt+=1;tag=original_tag+f'.attempt{attempt}'
    before=snapshot()
    assert suitable(before),before
    started=time.monotonic()
    shell=f'cd {REMOTE} && echo OWN_PID:$$ && exec taskset 1 nice -n 19 {command}'
    p=subprocess.Popen([ADB,'-s','c2357770','shell',shell],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',errors='replace')
    first=p.stdout.readline().strip();assert first.startswith('OWN_PID:') and first[8:].isdigit(),first
    pid=int(first[8:]); outputs=[];errors=[]
    def collect(stream,values,filename):
        with (ROOT/filename).open('w',encoding='utf-8') as out:
            for line in stream: values.append(line);out.write(line);out.flush()
    threads=[threading.Thread(target=collect,args=(p.stdout,outputs,tag+'.stdout.jsonl')),threading.Thread(target=collect,args=(p.stderr,errors,tag+'.stderr.log'))]
    for t in threads:t.start()
    samples=[];paused=False
    try:
        while p.poll() is None:
            s=snapshot();samples.append(s)
            if not suitable(s):
                if not paused: owned_signal(pid,'STOP');paused=True
            elif paused and s['temperature']<33:
                owned_signal(pid,'CONT');paused=False
            own_bytes=sum(f.stat().st_size for f in ROOT.rglob('*') if f.is_file())
            prior_bytes=0
            if own_bytes+prior_bytes>=512*1024**2 or shutil.disk_usage(ROOT).free<12*1024**3:
                raise RuntimeError('本会话PC存储水位触发')
            (ROOT/(tag+'.live.json')).write_text(json.dumps(dict(pid=pid,paused=paused,snapshot=s,elapsedSeconds=time.monotonic()-started)),encoding='utf-8')
            time.sleep(3)
    except BaseException as error:
        (ROOT/(tag+'.failure-process.json')).write_text(json.dumps(dict(pid=pid,wallSeconds=time.monotonic()-started,command=command,before=before,samples=samples,error=str(error),phoneOnly=True),ensure_ascii=False,indent=2),encoding='utf-8')
        owned_signal(pid,'CONT');owned_signal(pid,'TERM')
        try:p.wait(timeout=30)
        except subprocess.TimeoutExpired:p.terminate()
        raise
    finally:
        for t in threads:t.join(timeout=10)
    result=dict(exitCode=p.returncode,pid=pid,wallSeconds=time.monotonic()-started,command=command,cpuMask='1',nice=19,phoneOnly=True,before=before,after=snapshot(),samples=samples)
    (ROOT/(tag+'.process.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(tag=tag,exitCode=p.returncode,wallSeconds=result['wallSeconds'])),flush=True)
    if p.returncode not in [0,75]: raise RuntimeError(''.join(errors))
    return result


def main():
    mode=sys.argv[1]
    adb('shell','mkdir','-p',REMOTE)
    if mode in ['build','build-host']:
        transfer([p.name for p in ROOT.glob('*.go')]+['schema.json','initial.json'])
        adb('shell','mkdir','-p',REMOTE+'/cache',REMOTE+'/tmp')
        files=' '.join(p.name for p in sorted(ROOT.glob('*.go')))
        env=f'env GOROOT={TOOL}/go GOCACHE={REMOTE}/cache GOTMPDIR={REMOTE}/tmp GOMAXPROCS=1 GOTOOLCHAIN=local CGO_ENABLED=0'
        target='trainer' if mode=='build' else 'evaluate-windows.exe'
        if mode=='build-host':env+=' GOOS=windows GOARCH=amd64'
        run(f'{env} {TOOL}/go/bin/go build -p=1 -trimpath -ldflags="-s -w" -o {REMOTE}/{target} {files}','compile' if mode=='build' else 'compile-host-evaluator')
        adb('pull',REMOTE+'/'+target,str(ROOT/('trainer-arm64' if mode=='build' else target)),timeout=120)
        print(adb('shell','sha256sum',REMOTE+'/trainer'),flush=True)
    elif mode in ['verify','bench','bench-dict']:
        transfer(['schema.json','initial.json','probe-base.jsonl.gz','format-fixture.dict.gz','format-batch.dict.gz','format-fixture.tac.gz','format-batch.tac.gz'] + (['tactics/s0004.tac.gz'] if mode=='bench-dict' else []))
        run(f'env GOMAXPROCS=1 GOMEMLIMIT=384MiB {REMOTE}/trainer -root {REMOTE} -mode {mode}',mode)
        if mode=='verify':
            for name in ['phone-reference.jsonl.gz','phone-gradient.json','phone-verify-metrics.json','phone-format-check.json','phone-batch-gradient.json']: adb('pull',REMOTE+'/'+name,str(ROOT/name),timeout=120)
    else: raise ValueError(mode)


if __name__=='__main__':main()
