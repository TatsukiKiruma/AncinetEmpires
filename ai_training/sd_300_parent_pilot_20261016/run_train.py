import pathlib, json, hashlib, subprocess, time, shutil, ctypes
from ctypes import wintypes

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent.parent
JAVA = 'C:/Program Files/Java/jre1.8.0_491/bin/java.exe'


class Memory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [(n, ctypes.c_size_t) for n in ['PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage']]


def main():
    gate = json.loads((ROOT/'GATE.json').read_text(encoding='utf-8'))
    assert gate['passed'] and gate['fullTrainingAuthorized'] is False
    for name, expected in gate['bindings'].items():
        assert hashlib.sha256((REPO/name).read_bytes()).hexdigest() == expected, name
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.SetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.c_size_t]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)]*4
    psapi = ctypes.WinDLL('psapi')
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
    start = time.perf_counter()
    command = [JAVA, '-Xmx384m', '-XX:+UseSerialGC', '-XX:CICompilerCount=2', '-cp', str(ROOT/'classes'), 'PilotTrainer', str(ROOT)]
    samples = []
    with (ROOT/'training.jsonl').open('w', encoding='utf-8') as out, (ROOT/'training-stderr.log').open('w', encoding='utf-8') as err:
        process = subprocess.Popen(command, stdout=out, stderr=err, creationflags=0x00004000)
        handle = kernel.OpenProcess(0x0200 | 0x0400 | 0x0010, False, process.pid)
        assert handle and kernel.SetPriorityClass(handle, 0x4000) and kernel.SetProcessAffinityMask(handle, 1)
        try:
            while process.poll() is None:
                size = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
                free = shutil.disk_usage(ROOT).free
                memory = Memory(); memory.cb = ctypes.sizeof(memory)
                assert psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory))
                samples.append(dict(elapsedSeconds=time.perf_counter()-start, phaseBytes=size, freeBytes=free, workingSetBytes=memory.WorkingSetSize, peakWorkingSetBytes=memory.PeakWorkingSetSize))
                if size > 512*1024**2 or free < 12*1024**3:
                    raise RuntimeError('本阶段磁盘水位触发')
                time.sleep(3)
            times = [wintypes.FILETIME() for _ in range(4)]
            assert kernel.GetProcessTimes(handle, *[ctypes.byref(t) for t in times])
            cpu = sum((t.dwHighDateTime << 32) + t.dwLowDateTime for t in times[2:]) / 1e7
        except BaseException:
            process.terminate(); process.wait(timeout=10)
            raise
        finally:
            kernel.CloseHandle(handle)
    result = dict(exitCode=process.returncode, wallSeconds=time.perf_counter()-start, cpuSeconds=cpu, pid=process.pid, cpuAffinityMask=1, priority='BELOW_NORMAL', heapMiB=384, java=JAVA, command=command, gateSha256=hashlib.sha256((ROOT/'GATE.json').read_bytes()).hexdigest(), resourceSamples=samples)
    (ROOT/'training-process.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    assert process.returncode == 0, (ROOT/'training-stderr.log').read_text(encoding='utf-8-sig')
    rows = [json.loads(line) for line in (ROOT/'training.jsonl').read_text(encoding='utf-8-sig').splitlines()]
    assert rows[0]['epoch'] == 0 and 1 <= rows[-1]['epoch'] <= 10
    for epoch in rows[1:]:
        assert epoch['rowsConsumed'] == 88998 and epoch['updates'] == 11125 and epoch['lastBatchSize'] == 6
    print(json.dumps(dict(epochs=rows[-1]['epoch'], bestEpoch=rows[-1]['bestEpoch'], wallSeconds=result['wallSeconds'], cpuSeconds=cpu)))


if __name__ == '__main__':
    main()
