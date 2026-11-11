"""第二台专属路由；拒绝省略序列号和任何小米设备操作。"""
from pathlib import Path
import datetime as dt
import json
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[3]
TASK = ROOT / 'ai_training/hard_native_second_20261023'
ADB = r'C:\Users\SHIINA\OneDrive\Documents\闲聊\手机投屏\scrcpy-win64-v5.0.1\adb.exe'
DEVICE = 'ce071717887a94940b7e'


def collection_paths():
    """优先路由当前追加段；旧段计划与证据保留原位。"""
    pointer = TASK / 'ACTIVE_COLLECTION.json'
    if pointer.is_file():
        active = json.loads(pointer.read_text(encoding='utf-8'))
        plan, segment = Path(active['plan']), Path(active['segmentPlan'])
        assert plan.resolve().is_relative_to(TASK.resolve())
        assert segment.resolve().is_relative_to(TASK.resolve())
        return plan, segment, active
    return TASK / 'production-03/PLAN.json', TASK / 'SEGMENT_PLAN.json', {}


def call(*args, timeout=60, check=True):
    command = [ADB, '-s', DEVICE, *map(str, args)]
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    text = result.stdout.decode('utf-8', 'replace')
    error = result.stderr.decode('utf-8', 'replace')
    TASK.mkdir(parents=True, exist_ok=True)
    with (TASK / 'ADB_COMMANDS.jsonl').open('a', encoding='utf-8') as output:
        output.write(json.dumps({'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'command': command, 'returncode': result.returncode, 'stdout': text, 'stderr': error}, ensure_ascii=False) + '\n')
    if check and result.returncode:
        raise RuntimeError(text + error)
    return text.strip()


def shell(command, **kwargs):
    return call('shell', command, **kwargs)


def app(package, command):
    assert package in {f'net.toyknight.aeii.worker{i}' for i in (11, 12, 13)}
    return shell('run-as ' + package + ' sh -c ' + shlex.quote(command))


if __name__ == '__main__':
    import sys
    print(shell(sys.argv[1]))
