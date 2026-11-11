"""顺序单批性能测量：保存进程累计CPU、整机负载、RSS及逐秒GPU样本。"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'parallel'))
import gpu_monitor

kernel = c.WinDLL('kernel32', use_last_error=True)
psapi = c.WinDLL('psapi')
class Entry(c.Structure):
    _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('pid', w.DWORD), ('heap', c.c_size_t),
                ('module', w.DWORD), ('threads', w.DWORD), ('parent', w.DWORD), ('priority', w.LONG),
                ('flags', w.DWORD), ('exe', w.WCHAR * 260)]
class Memory(c.Structure):
    _fields_ = [('size', w.DWORD), ('faults', w.DWORD), ('peak', c.c_size_t), ('rss', c.c_size_t),
                ('poolPeak', c.c_size_t), ('pool', c.c_size_t), ('nonPeak', c.c_size_t),
                ('non', c.c_size_t), ('page', c.c_size_t), ('pagePeak', c.c_size_t), ('private', c.c_size_t)]
class Io(c.Structure):
    _fields_=[(key,c.c_uint64) for key in ['readOperations','writeOperations','otherOperations','readBytes','writeBytes','otherBytes']]
kernel.CreateToolhelp32Snapshot.restype = w.HANDLE
kernel.OpenProcess.restype = w.HANDLE
kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
kernel.CloseHandle.argtypes = [w.HANDLE]
kernel.Process32FirstW.argtypes = [w.HANDLE, c.POINTER(Entry)]
kernel.Process32NextW.argtypes = [w.HANDLE, c.POINTER(Entry)]
kernel.GetProcessTimes.argtypes = [w.HANDLE, *([c.POINTER(c.c_uint64)] * 4)]
kernel.GetProcessIoCounters.argtypes = [w.HANDLE,c.POINTER(Io)]
psapi.GetProcessMemoryInfo.argtypes = [w.HANDLE, c.POINTER(Memory), w.DWORD]

def processes():
    handle = kernel.CreateToolhelp32Snapshot(2, 0)
    entry = Entry(); entry.size = c.sizeof(entry)
    rows = []
    if kernel.Process32FirstW(handle, c.byref(entry)):
        while True:
            rows.append((entry.pid, entry.parent, entry.exe))
            if not kernel.Process32NextW(handle, c.byref(entry)): break
    kernel.CloseHandle(handle)
    return rows

def system_times():
    idle, kern, user = c.c_uint64(), c.c_uint64(), c.c_uint64()
    if not kernel.GetSystemTimes(c.byref(idle), c.byref(kern), c.byref(user)): raise c.WinError()
    return idle.value, kern.value + user.value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    directory = Path(args.out).resolve(); directory.mkdir(parents=True, exist_ok=True)
    if (directory / 'CPU_GPU_MEASUREMENT.json').exists(): raise RuntimeError('拒绝覆盖既有性能结果')
    tracked = {}; logical = os.cpu_count(); gpu_pid = [-1]
    gpu_monitor.os = types.SimpleNamespace(getpid=lambda: gpu_pid[0])
    monitor = gpu_monitor.GpuMonitor()
    started = time.perf_counter(); wall_start = time.time(); prior_system = system_times(); prior_t = started
    with (directory / 'console.log').open('w', encoding='utf-8') as log:
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, creationflags=0x08000000)
        known = {child.pid}; samples = []; previous = {}; gpu_samples = []; gpu_epoch = None
        while True:
            rows = processes()
            for _ in range(4):
                for pid, parent, name in rows:
                    if parent in known: known.add(pid)
            for pid, parent, name in rows:
                if pid in known and pid not in tracked:
                    handle = kernel.OpenProcess(0x410, False, pid)
                    if handle: tracked[pid] = dict(handle=handle, name=name, parent=parent, cpu=0., peakRss=0., io={})
            device = directory / 'DEVICE.json'
            if device.exists() and gpu_pid[0] < 0: gpu_pid[0] = json.loads(device.read_text('utf-8'))['pid']
            now = time.perf_counter(); dt = now - prior_t; current_system = system_times()
            system = 100 * (1 - (current_system[0]-prior_system[0]) / max(1, current_system[1]-prior_system[1]))
            values = []
            for pid, item in tracked.items():
                ts = [c.c_uint64() for _ in range(4)]
                if kernel.GetProcessTimes(item['handle'], *(c.byref(t) for t in ts)):
                    item['cpu'] = (ts[2].value + ts[3].value) / 1e7
                mem = Memory(); mem.size = c.sizeof(mem)
                rss = 0
                if psapi.GetProcessMemoryInfo(item['handle'], c.byref(mem), mem.size): rss = mem.rss; item['peakRss'] = max(item['peakRss'], mem.peak)
                cores = max(0., item['cpu']-previous.get(pid, 0.)) / max(dt, 1e-6)
                previous[pid] = item['cpu']
                io=Io()
                if kernel.GetProcessIoCounters(item['handle'],c.byref(io)):item['io']={key:getattr(io,key) for key,_ in Io._fields_}
                values.append(dict(pid=pid, name=item['name'], role='gpu' if pid == gpu_pid[0] else 'node' if item['name'].lower() == 'node.exe' else 'other', cpuSeconds=item['cpu'], cores=cores, normalizedPercent=cores/logical*100, rss=rss,io=item['io']))
            sample = dict(epoch=time.time(), elapsed=now-started, systemCpuPercent=system, processes=values)
            samples.append(sample)
            with (directory / 'CPU_TIMESERIES.jsonl').open('a', encoding='utf-8') as stream: stream.write(json.dumps(sample)+'\n')
            gpu = dict(monitor.latest)
            if gpu.get('epoch') != gpu_epoch:
                gpu_epoch = gpu.get('epoch'); gpu_samples.append(gpu)
                with (directory / 'EXTERNAL_GPU.jsonl').open('a', encoding='utf-8') as stream: stream.write(json.dumps(gpu)+'\n')
            prior_t = now; prior_system = current_system
            if child.poll() is not None: break
            time.sleep(1.)
        elapsed = time.perf_counter()-started
    monitor.close()
    result = dict(command=command, rootPid=child.pid, gpuPid=gpu_pid[0], startedEpoch=wall_start, finishedEpoch=time.time(), totalWallSeconds=elapsed, exitCode=child.returncode, logicalProcessors=logical, samples=len(samples), processes=[])
    for pid, item in tracked.items():
        result['processes'].append(dict(pid=pid, name=item['name'], parent=item['parent'], cpuSeconds=item['cpu'], averageCores=item['cpu']/elapsed, averageNormalizedPercent=item['cpu']/elapsed/logical*100, peakNormalizedPercent=max((p['normalizedPercent'] for s in samples for p in s['processes'] if p['pid']==pid), default=None), peakRss=item['peakRss'],io=item['io']))
        kernel.CloseHandle(item['handle'])
    result['systemCpuAveragePercent'] = sum(s['systemCpuPercent'] for s in samples[1:])/max(1,len(samples)-1)
    result['systemCpuPeakPercent'] = max(s['systemCpuPercent'] for s in samples[1:])
    (directory / 'CPU_GPU_MEASUREMENT.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    return child.returncode

if __name__ == '__main__': sys.exit(main())
