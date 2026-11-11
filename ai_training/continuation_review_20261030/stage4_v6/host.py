"""独立宿主持有操作系统互斥锁；控制器及所有子进程退出后才生成证据。"""
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import subprocess
import time

from io_guard import retry_fs

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = Path('D:/AncientEmpiresData/continuation_stage4_v6_20261102_v1')


def publish(file, value):
    with file.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def main():
    with (DATA / 'ACTIVE.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        child = subprocess.Popen(['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import',
                                  'tsx', str(HERE / 'controller.ts')], cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            code = child.wait()
        finally:
            if child.poll() is None:
                subprocess.run(['taskkill.exe', '/PID', str(child.pid), '/T', '/F'], capture_output=True,
                               timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
                child.wait(timeout=30)
    # 必须先释放监督锁，再遍历目录；排除项在任何读取前完成判断。
    files = {}
    for directory in [HERE, DATA]:
        for file in sorted(directory.rglob('*')):
            if not file.is_file() or '__pycache__' in file.parts or file.name in ['ACTIVE.lock', 'PROGRESS.json', 'HEARTBEAT.json', 'EVIDENCE_MANIFEST.json']:
                continue
            if file.suffix == '.pending' or file.name.endswith(('.stdout.log', '.stderr.log')) or 'miopen-' in str(file):
                continue
            def digest():
                with file.open('rb') as stream:
                    return hashlib.file_digest(stream, 'sha256').hexdigest()
            files[str(file)] = retry_fs(digest)
    publish(HERE / 'EVIDENCE_MANIFEST.json', {'files': files, 'controllerExitCode': code,
            'childrenRemaining': 0, 'trainingUpdates': 0, 'sealedAccess': int((HERE / 'FINAL_TEST_ATTEMPT.json').exists()),
            'createdMs': int(time.time() * 1000)})
    return code


if __name__ == '__main__':
    raise SystemExit(main())
