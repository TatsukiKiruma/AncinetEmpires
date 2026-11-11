import sys, pathlib, subprocess, time, json, re, hashlib, threading, os

ROOT = pathlib.Path(__file__).resolve().parent
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
JAVA = 'C:/Program Files/Java/jre1.8.0_491/bin/java.exe'
SERIAL = 'c2357770'
REMOTE = '/data/local/tmp/ae_sd_trial_20261016'


def adb(*args, check=True):
    p = subprocess.run([ADB, '-s', SERIAL, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=45)
    if check and p.returncode:
        raise RuntimeError(p.stdout + p.stderr)
    return p.stdout.strip()


def snapshot():
    raw = adb('shell', 'dumpsys battery; cat /proc/meminfo; df -k /data; cat /proc/loadavg; echo CAPTURE_APK; pidof net.toyknight.aeii.android; echo CAPTURE_END; ps -A -o PID,NAME')
    temp = int(re.search(r'temperature:\s*(\d+)', raw)[1]) / 10
    memory = int(re.search(r'MemAvailable:\s*(\d+)', raw)[1]) * 1024
    disk = int(next(line for line in raw.splitlines() if line.startswith('/dev/block/')).split()[3]) * 1024
    capture = [line.strip() for line in raw.splitlines() if any(s in line.lower() for s in ['aeii', 'frida', 'portabletrainer'])]
    capture_pids = re.search(r'CAPTURE_APK\s*([\d\s]*)CAPTURE_END', raw)[1].split()
    return dict(at=time.time(), batteryCelsius=temp, memAvailableBytes=memory, dataAvailableBytes=disk, captureApkPids=capture_pids, relevantProcesses=capture, raw=raw)


def guard(s):
    if s['batteryCelsius'] >= 38 or s['memAvailableBytes'] < 1024**3 or s['dataAvailableBytes'] < 2*1024**3:
        raise RuntimeError('手机资源保护阈值触发')
    if s['captureApkPids']:
        raise RuntimeError('观察到采集相关进程，暂停本轮手机负载以保护采集')


def phase_guard():
    size = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
    import shutil
    free = shutil.disk_usage(ROOT).free
    assert size < 512 * 1024**2 and free > 12 * 1024**3, (size, free)
    return dict(phaseBytes=size, pcFreeBytes=free)


def phone(mode, repeat):
    before = snapshot(); guard(before); phase_guard()
    artifact = f'phone-{mode}-{repeat}.bin'
    command = f'cd {REMOTE} && echo OWN_PID:$$ && exec taskset 1 nice -n 19 dalvikvm -Xmx384m -Xusejit:true -cp {REMOTE}/trainer.dex PortableTrainer {mode} {REMOTE}/trial.bin.gz {REMOTE}/{artifact}'
    if mode == 'train':
        command += f' {REMOTE}/GATE.json'
    begin = time.perf_counter()
    process = subprocess.Popen([ADB, '-s', SERIAL, 'shell', command], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    first = process.stdout.readline().strip()
    assert first.startswith('OWN_PID:') and first[8:].isdigit(), first
    pid = int(first[8:]); outputs = []; errors = []
    def consume(stream, target):
        for line in stream:
            target.append(line)
    readers = [threading.Thread(target=consume, args=(process.stdout, outputs)), threading.Thread(target=consume, args=(process.stderr, errors))]
    for reader in readers:
        reader.start()
    samples = []
    try:
        while process.poll() is None:
            if time.perf_counter() - begin > 240:
                raise RuntimeError('本轮手机任务超过240秒上限')
            current = snapshot(); samples.append(current); guard(current)
            time.sleep(3)
    except BaseException:
        # 仅在cmdline仍绑定本轮路径和训练类时停止这个PID，绝不按包名清理。
        cmdline = adb('shell', f'cat /proc/{pid}/cmdline', check=False)
        if REMOTE in cmdline and 'PortableTrainer' in cmdline:
            adb('shell', f'kill -TERM {pid}', check=False)
        process.terminate()
        raise
    for reader in readers:
        reader.join()
    stdout, stderr = ''.join(outputs), ''.join(errors)
    after = snapshot()
    result = dict(mode=mode, repeat=repeat, hostWallSeconds=time.perf_counter()-begin, exitCode=process.returncode, stdout=stdout, stderr=stderr, before=before, after=after, samples=samples, cpuAffinityMask='1', nice=19, maxHeapMiB=384, serial=SERIAL, phoneModel=adb('shell', 'getprop ro.product.model'))
    (ROOT / f'phone-{mode}-{repeat}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    if process.returncode:
        raise RuntimeError(stdout+stderr)
    adb('pull', f'{REMOTE}/{artifact}', str(ROOT/artifact))
    result['metrics'] = json.loads(next(line for line in stdout.splitlines() if line.startswith('{')))
    (ROOT / f'phone-{mode}-{repeat}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(device='phone', repeat=repeat, **result['metrics'])), flush=True)
    return result


def pc(mode, repeat):
    phase_guard()
    output = ROOT / f'pc-{mode}-{repeat}.bin'
    args = [JAVA, '-Xmx384m', '-XX:+UseSerialGC', '-XX:CICompilerCount=2', '-cp', str(ROOT/'classes'), 'PortableTrainer', mode, str(ROOT/'trial.bin.gz'), str(output)]
    if mode == 'train':
        args += [str(ROOT/'GATE.json')]
    begin = time.perf_counter()
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    # Windows仅调整本轮子进程，单核且后台优先级；不触碰采集进程。
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.windll.kernel32
        handle = kernel.OpenProcess(0x0200 | 0x0400, False, process.pid)
        assert handle
        assert kernel.SetPriorityClass(handle, 0x00004000)
        assert kernel.SetProcessAffinityMask(handle, 1)
        kernel.CloseHandle(handle)
    stdout, stderr = process.communicate(timeout=240)
    result = dict(mode=mode, repeat=repeat, exitCode=process.returncode, stdout=stdout, stderr=stderr, hostWallSeconds=time.perf_counter()-begin, cpuAffinityMask='1', priority='BELOW_NORMAL', java=JAVA)
    if process.returncode:
        raise RuntimeError(stdout+stderr)
    result['metrics'] = json.loads(next(line for line in stdout.splitlines() if line.startswith('{')))
    (ROOT / f'pc-{mode}-{repeat}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(device='pc', repeat=repeat, **result['metrics'])), flush=True)
    return result


def main():
    mode = sys.argv[1]
    assert mode in ['verify', 'train']
    phase_guard(); before = snapshot(); guard(before)
    (ROOT/'phone-before.json').write_text(json.dumps(before, ensure_ascii=False, indent=2), encoding='utf-8')
    if mode == 'train':
        gate = json.loads((ROOT/'GATE.json').read_text(encoding='utf-8'))
        assert gate['passed'] and gate['trialGzipSha256'] == hashlib.sha256((ROOT/'trial.bin.gz').read_bytes()).hexdigest()
        for name, expected in gate['artifactBindings'].items():
            assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, name
        for name, expected in gate['sourceBindings'].items():
            assert hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() == expected, name
    adb('shell', f'mkdir -p {REMOTE}')
    transfer = time.perf_counter()
    for file in ['trainer.dex', 'trial.bin.gz'] + (['GATE.json'] if mode == 'train' else []):
        adb('push', str(ROOT/file), REMOTE+'/'+file)
        assert adb('shell', f'sha256sum {REMOTE}/{file}').split()[0] == hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
    total = int(adb('shell', f'du -sk {REMOTE}').split()[0]) * 1024
    assert total < 128*1024**2
    (ROOT/f'{mode}-transfer.json').write_text(json.dumps(dict(seconds=time.perf_counter()-transfer, remoteAllocatedBytes=total, remote=REMOTE)))
    for i in range(3 if mode == 'train' else 1):
        pc(mode, i)
        phone(mode, i)


if __name__ == '__main__':
    main()
