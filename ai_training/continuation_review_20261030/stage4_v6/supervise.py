"""监督单局心跳及墙钟；共享读取异常不刷新进度也不直接终止评测。"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

from io_guard import HeartbeatMonitor

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def main():
    config, output, split, subset = sys.argv[1:]
    folder = Path(output)
    if shutil.disk_usage(folder.parent).free < 4 * 1024**3:
        raise RuntimeError('新局启动前可用空间不足4GiB')
    command = ['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import', 'tsx',
               str(HERE / 'arena.ts'), config, output, split, subset]
    child = subprocess.Popen(command, cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW)
    started = time.time()
    monitor = HeartbeatMonitor(started)
    try:
        while child.poll() is None:
            now = time.time()
            last = monitor.poll(folder / 'HEARTBEAT.json', now)
            if now - last > 180:
                raise RuntimeError('180秒无有效心跳')
            if now - started > 7200:
                raise RuntimeError('单局7200秒墙钟保护')
            if shutil.disk_usage(folder.parent).free < 1024**3:
                raise RuntimeError('运行中磁盘余量不足1GiB')
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
        return child.returncode
    finally:
        if child.poll() is None:
            subprocess.run(['taskkill.exe', '/PID', str(child.pid), '/T', '/F'], capture_output=True,
                           timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
            child.wait(timeout=30)
        print(json.dumps({'supervisedPid': child.pid, 'exited': child.poll() is not None,
                          'heartbeatReadFailures': monitor.read_failures, 'wallSeconds': 7200}), flush=True)


if __name__ == '__main__':
    sys.exit(main())
