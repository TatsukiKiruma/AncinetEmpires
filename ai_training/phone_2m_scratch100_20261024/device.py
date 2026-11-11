"""本轮完整2M模型试训的小米8专属通道，不操作旧重放与旧训练标记。"""
import datetime as dt
import json
from pathlib import Path
import shlex
import subprocess
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ADB = r'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
SERIAL = 'c2357770'
PHONE = '/data/local/tmp/aeii-2m-scratch100-20261024'


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def call(*args, timeout=60, check=True):
    command = [ADB, '-s', SERIAL, *map(str, args)]
    started=dt.datetime.now(dt.timezone.utc).isoformat();clock=time.monotonic()
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    output = result.stdout.decode('utf-8', 'replace').strip()
    error = result.stderr.decode('utf-8', 'replace')
    with (HERE / 'ADB_COMMANDS.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps({'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'startedUtc':started,'durationSeconds':time.monotonic()-clock,'command': command,
                                'returncode': result.returncode, 'stdout': output, 'stderr': error}, ensure_ascii=False) + '\n')
    if check and result.returncode:
        raise RuntimeError(output + error)
    return output


def root(command, **kwargs):
    wrapped='id >/dev/null\n'+command+'\naeii_status=$?\nsleep 0.05\nexit $aeii_status'
    return call('shell', 'su -c ' + shlex.quote(wrapped), **kwargs)


if __name__ == '__main__':
    command = '''id; getprop ro.product.model; getprop ro.product.cpu.abi; uname -a
df -k /data; cat /proc/meminfo | head -6; dumpsys battery
ls -la /data/local/tmp
for D in /data/local/ubuntu /data/local/debian /data/local/linux /data/local/chroot /data/user/0/com.termux/files/usr; do
test ! -d "$D" || ls -ld "$D" "$D/bin/python" "$D/bin/python3"
done
pm list packages | grep -E 'termux|linux|debian|ubuntu' '''
    value=root(command, check=False)
    write(HERE/'DEVICE_PREFLIGHT.json', {'serial':SERIAL, 'raw':value})
    print(value)
