"""只读检查小米真机，不启动对局、不更改手机配置或历史文件。"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
DEFAULT_ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'


def inspect(adb_path, serial):
    def adb(*args):
        process = subprocess.run([adb_path, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if process.returncode:
            raise RuntimeError(process.stdout + process.stderr)
        return process.stdout.strip()

    listing = adb('devices', '-l')
    device = next((line for line in listing.splitlines() if line.split()[:2] == [serial, 'device']), None)
    result = dict(checkedAt=datetime.datetime.now().isoformat(timespec='seconds'), serial=serial, adbSha256=hashlib.sha256(Path(adb_path).read_bytes()).hexdigest(), connected=bool(device), deviceListing=listing, gamesStarted=0, configurationChanged=False)
    if not device:
        return dict(result, passed=False, reason='未检测到指定小米真机处于device状态；请连接USB并允许调试。')
    shell = lambda *args: adb('-s', serial, 'shell', *args)
    manufacturer = shell('getprop', 'ro.product.manufacturer')
    model = shell('getprop', 'ro.product.model')
    battery = shell('dumpsys', 'battery')
    memory = shell('cat', '/proc/meminfo')
    disk = shell('df', '-k', '/data')
    chrome = shell('dumpsys', 'package', 'com.android.chrome')
    temperature = re.search(r'temperature:\s*(\d+)', battery)
    available = re.search(r'MemAvailable:\s*(\d+)', memory)
    version = re.search(r'versionName=([^\s]+)', chrome)
    result.update(manufacturer=manufacturer, model=model, android=shell('getprop', 'ro.build.version.release'), emulator=shell('getprop', 'ro.kernel.qemu'), chromeVersion=version[1] if version else None, temperatureC=int(temperature[1]) / 10 if temperature else None, memoryAvailableBytes=int(available[1]) * 1024 if available else None, disk=disk, devtoolsSockets=[line for line in shell('cat', '/proc/net/unix').splitlines() if 'devtools_remote' in line])
    result['passed'] = manufacturer.lower() == 'xiaomi' and result['emulator'] != '1' and result['chromeVersion'] is not None
    result['scope'] = '只确认物理小米及可用Chrome；不代表模型、速度或对局门禁通过。'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', default=DEFAULT_ADB)
    parser.add_argument('--serial', default='c2357770')
    args = parser.parse_args()
    stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')
    target = HERE / 'revisions/xiaomi_20261020' / f'device-preflight-{stamp}.json'
    try:
        report = inspect(args.adb, args.serial)
    except Exception as error:
        report = dict(passed=False, error=str(error), gamesStarted=0)
    with target.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(dict(report, receipt=target.relative_to(HERE).as_posix()), ensure_ascii=False))
