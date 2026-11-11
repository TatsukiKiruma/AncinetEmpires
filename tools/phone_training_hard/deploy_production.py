"""只做一次上传与本机后台启动，后续998局无需电脑或网络。"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess

from prepare_production import OUT, REMOTE, sha

ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE = 'c2357770'
PACKAGE = 'net.toyknight.aeii.android'
INJECT = '/data/local/tmp/aeii-hard-inject-17.2.5'
INJECT_SHA = '5566391c8b1741cf66c1ab82d80bfb024b5d9291c6f819b3a9c5162b4c78ea1f'


def adb(*parts: str, missing: bool = False, timeout: int = 120) -> str:
    result = subprocess.run([ADB, '-s', DEVICE, *parts], capture_output=True, timeout=timeout)
    output = result.stdout.decode('utf-8', 'replace').strip()
    error = result.stderr.decode('utf-8', 'replace').strip()
    if result.returncode and not (missing and result.returncode == 1 and not output and not error):
        raise RuntimeError(error + '\n' + output)
    return output


def root(command: str, **kwargs) -> str:
    if "'" in command:
        raise ValueError('不接受嵌套单引号的手机命令')
    return adb('shell', 'su', '-c', "'" + command + "'", **kwargs)


def main() -> None:
    if (OUT / 'DEPLOYED.json').exists():
        raise ValueError('该任务已经启动，不重复下发')
    if root('pidof ' + PACKAGE, missing=True):
        raise ValueError('有既有应用进程；先按保存的归属信息安全收尾，不能直接覆盖')
    plan = json.loads((OUT / 'PRODUCTION_PLAN.json').read_text(encoding='utf-8'))
    installed = root('pm path ' + PACKAGE).splitlines()
    if len(installed) != 1 or not installed[0].startswith('package:'):
        raise ValueError('目标应用不是已确认的单APK安装')
    installed_path = installed[0][len('package:'):]
    if not re.fullmatch(r'/data/app/[A-Za-z0-9_./=+\-]+/base\.apk', installed_path):
        raise ValueError('安装路径不符合本任务已确认的格式')
    installed_sha = root('sha256sum ' + installed_path).split()[0]
    assert installed_sha == plan['apkSha256'], '手机APK不是用户指定文件'
    assert root('sha256sum ' + INJECT).split()[0] == INJECT_SHA
    root('test ! -e ' + REMOTE + '/controller.lock && test ! -e ' + REMOTE + '/STATE.json')
    root('mkdir -p ' + REMOTE)
    root('chmod 777 ' + REMOTE)
    files = ['collector.bundle.js', 'controller.sh', 'production_thaw.sh', 'index.txt', 'base-config.zip', 'inject-path.txt',
             'attempt-prefix.txt', 'PRODUCTION_PLAN.json', 'SOURCE_SHA256.json']
    for name in files:
        adb('push', str(OUT / name), REMOTE + '/' + name)
        assert root('sha256sum ' + REMOTE + '/' + name).split()[0] == sha(OUT / name)
    adb('push', str(OUT / 'configs'), REMOTE + '/configs')
    expected = {REMOTE + '/configs/' + path.name: sha(path) for path in (OUT / 'configs').iterdir()}
    actual = {}
    for line in root('sha256sum ' + REMOTE + '/configs/*.json').splitlines():
        digest, path = line.split(None, 1)
        actual[path.strip()] = digest
    assert actual == expected and len(actual) == 998
    root('chmod 755 ' + REMOTE + ' ' + REMOTE + '/configs')
    root('chmod 644 ' + REMOTE + '/base-config.zip ' + REMOTE + '/configs/*.json')
    root('sh -n ' + REMOTE + '/controller.sh')
    root('sh -n ' + REMOTE + '/production_thaw.sh')
    command = 'setsid sh ' + REMOTE + '/controller.sh ' + REMOTE + ' </dev/null >' + REMOTE + '/launch.log 2>&1 &'
    root(command)
    record = {'schema': 'phone-hard-production-deployed-v2', 'utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'device': DEVICE, 'remoteRoot': REMOTE, 'alreadyCompleted': 2, 'remaining': 998,
              'computerRequired': False, 'injectBinarySha256': INJECT_SHA, 'startCommand': command,
              'userSpecifiedApk': plan['userSpecifiedApk'], 'installedApk': installed_path, 'installedApkSha256': installed_sha,
              'planSha256': sha(OUT / 'PRODUCTION_PLAN.json'), 'bundleSha256': sha(OUT / 'collector.bundle.js')}
    with (OUT / 'DEPLOYED.json').open('x', encoding='utf-8') as output:
        json.dump(record, output, ensure_ascii=False, indent=2)
    print(json.dumps(record, ensure_ascii=False))


if __name__ == '__main__':
    main()
