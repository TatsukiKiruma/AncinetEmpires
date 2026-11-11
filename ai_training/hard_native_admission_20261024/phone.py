"""本轮小米8设备通道；只记录本轮命令，不读取进程cmdline。"""
import datetime as dt
import json
from pathlib import Path
import shlex
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ADB = r'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
SERIAL = 'c2357770'


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def call(*args, timeout=60, check=True):
    command = [ADB, '-s', SERIAL, *map(str, args)]
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    output = result.stdout.decode('utf-8', 'replace').strip()
    error = result.stderr.decode('utf-8', 'replace')
    with (HERE / 'ADB_COMMANDS.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps({'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'command': command,
                                'returncode': result.returncode, 'stdout': output, 'stderr': error}, ensure_ascii=False) + '\n')
    if check and result.returncode:
        raise RuntimeError(output + error)
    return output


def root(command, **kwargs):
    return call('shell', 'su -c ' + shlex.quote(command), **kwargs)


def snapshot(label):
    sections = {
        'identity': 'id; getprop ro.product.model; date +%s; cat /proc/uptime',
        'memory': 'cat /proc/meminfo',
        'disk': 'df -k /data',
        'battery': 'dumpsys battery',
        'processes': 'ps -A -o USER,PID,PPID,NAME',
        'packages': 'pm list packages -3 -U',
        'activities': 'dumpsys activity activities',
        'original': 'cat /data/local/tmp/aeii-hard-production-parallel-20261022-01/STATE.json',
        'additional': 'cat /data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02/STATE.json',
        'task_processes': '''for R in /data/local/tmp/aeii-hard-production-parallel-20261022-01 /data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02; do
echo "$R"
find "$R" -maxdepth 2 -type f \\( -name identity -o -name '*pid*' -o -name '*identity*' -o -name 'CHAIN_STATE.json' \\) -exec sh -c 'echo "$1"; cat "$1"' sh {} \\;
done''',
    }
    result = {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'serial': SERIAL,
              **{name: root(cmd, check=False) for name, cmd in sections.items()}}
    write(HERE / 'device' / (label + '.json'), result)
    return result


if __name__ == '__main__':
    import sys
    result = snapshot(sys.argv[1])
    print(json.dumps({k: v for k, v in result.items() if k not in {'activities', 'processes', 'memory', 'packages'}}, ensure_ascii=False, indent=2))
