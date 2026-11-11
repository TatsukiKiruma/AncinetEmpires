"""等待当前局自然退出后关闭已挂起的旧派发器，再以双并发续接。"""
import ctypes
import json
import os
from pathlib import Path
import subprocess
from write_budget import reserve

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def main():
    with (HERE / 'TWO_WORKER_HANDOFF_STARTED.json').open('x', encoding='utf-8') as handle:
        json.dump({'pid': os.getpid(), 'schedulerPid': 16328, 'arenaParentPid': 33256}, handle)
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_bool, ctypes.c_uint32]
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    if not kernel.SetThreadExecutionState(0x80000001):
        raise OSError('防休眠失败')
    try:
        # 启动时已从系统进程树核验两个PID；只终止挂起的派发器，不终止对局树。
        arena = kernel.OpenProcess(0x100000, False, 33256)
        scheduler = kernel.OpenProcess(0x100001, False, 16328)
        if not arena or not scheduler:
            raise OSError('原进程身份已退出，需重新核实，不自动启动')
        try:
            print('等待 p3-14-s1 自然完成；旧调度器已暂停派发', flush=True)
            while kernel.WaitForSingleObject(arena, 5000) == 258:
                reserve(0)
            summary = DATA / 'sealed-v1/test/p3-14-s1/SUMMARY.json'
            result = json.loads(summary.read_text(encoding='utf-8'))
            if not result['complete'] or not result['gpuExited'] or not result['games'][0]['natural']:
                raise RuntimeError('当前局非自然完成，禁止续接')
            if not kernel.TerminateProcess(scheduler, 0):
                raise OSError('旧调度器未关闭')
            kernel.WaitForSingleObject(scheduler, 10000)
        finally:
            kernel.CloseHandle(arena)
            kernel.CloseHandle(scheduler)
        print('当前局自然完成；旧派发器退出；开始双worker续接', flush=True)
        code = subprocess.call(['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'sealed_two_workers.ts')], cwd=ROOT, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, creationflags=subprocess.CREATE_NO_WINDOW)
        return code
    finally:
        kernel.SetThreadExecutionState(0x80000000)
        print('双worker守护结束，防休眠锁已释放', flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
