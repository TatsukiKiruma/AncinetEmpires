"""一次部署手机多进程队列；上传结束后不保留电脑驱动循环。"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE = 'c2357770'


def call(*args: str) -> str:
    result = subprocess.run([ADB, '-s', DEVICE, *args], capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stdout.decode('utf-8', 'replace') + result.stderr.decode('utf-8', 'replace'))
    return result.stdout.decode('utf-8', 'replace').strip()


def root(command: str) -> str:
    assert "'" not in command
    return call('shell', 'su', '-c', "'" + command + "'")


def main() -> None:
    out = Path(sys.argv[1]).resolve()
    plan = json.loads((out / 'PLAN.json').read_text(encoding='utf-8'))
    assert not (out / 'DEPLOYED.json').exists()
    remote = plan['remoteRoot']
    assert re.fullmatch(r'/data/local/tmp/aeii-hard-(?:concurrency|production-parallel)-[A-Za-z0-9_-]+', remote)
    source_hashes = json.loads((out / 'SOURCE_SHA256.json').read_text(encoding='utf-8'))
    for relative, expected in source_hashes.items():
        assert hashlib.sha256((out / relative).read_bytes()).hexdigest() == expected, relative
    destinations = [(out / 'master', remote)]
    for worker in plan['workers']:
        package = worker['package']
        paths = root('pm path ' + package).splitlines()
        assert len(paths) == 1 and paths[0].startswith('package:')
        path = paths[0][8:]
        assert re.fullmatch(r'/data/app/[A-Za-z0-9_./=+\-]+/base\.apk', path)
        assert root('sha256sum ' + path).split()[0] == worker['installedSha256']
        # 不附加未知或其他采集会话的进程。
        existing = subprocess.run([ADB, '-s', DEVICE, 'shell', 'pidof', package], capture_output=True, timeout=15)
        assert not existing.stdout.strip(), package + '已有进程，不能重复启动'
        destinations.append((out / worker['workerId'], worker['remoteRoot']))
    for local, phone in destinations:
        root('test ! -e ' + phone)
        call('push', str(local), phone)
        # 对每个上传文件核对，配置身份不能仅凭目录存在推断。
        expected_files = {phone + '/' + str(path.relative_to(local)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest() for path in local.rglob('*') if path.is_file()}
        actual_files = {}
        for row in root('find ' + phone + ' -type f -exec sha256sum {} +').splitlines():
            value, path = row.split(None, 1)
            actual_files[path.strip()] = value
        assert actual_files == expected_files, phone + '文件摘要不符'
        # 目录由root独占写入；应用仍需读取本局配置和暂停标记。
        root('chown -R 0:0 ' + phone)
        root('chmod -R go-w ' + phone)
        root('chmod 755 ' + phone)
    root('sh -n ' + remote + '/master.sh')
    for worker in plan['workers']:
        root('sh -n ' + worker['remoteRoot'] + '/controller.sh')
        root('sh -n ' + worker['remoteRoot'] + '/process_thaw.sh')
    command = 'setsid sh ' + remote + '/master.sh ' + remote + ' </dev/null >' + remote + '/launch.log 2>&1 &'
    root(command)
    record = {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'remoteRoot': remote, 'workers': len(plan['workers']), 'initialLimit': plan['limit'], 'computerRequired': False, 'command': command, 'planSha256': hashlib.sha256((out / 'PLAN.json').read_bytes()).hexdigest(), 'sourceApkSha256': plan['sourceApkSha256']}
    (out / 'DEPLOYED.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(record, ensure_ascii=False))


if __name__ == '__main__':
    main()
