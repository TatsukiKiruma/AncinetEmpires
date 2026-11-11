"""只安装本任务隔离副本，记录新设备UID与安装SHA，不替换原用户应用。"""
import json
import re
from device import TASK, call, shell, DEVICE


def main():
    record = json.loads((TASK/'gadget-workers-01/WORKERS.json').read_text(encoding='utf-8'))
    before = shell('pm path net.toyknight.aeii.android')
    original_path = before.removeprefix('package:')
    original_sha = shell('sha256sum '+original_path).split()[0]
    inspection = shell('getprop ro.product.model; getprop ro.build.fingerprint; getprop ro.build.version.release; getprop ro.build.version.sdk; getprop ro.product.cpu.abilist; id; getenforce; cat /proc/meminfo; dumpsys battery; df -k /data; dumpsys webviewupdate; dumpsys package com.android.shell; dumpsys package net.toyknight.aeii.android')
    (TASK/'DEVICE_INSPECTION.txt').write_text(inspection,encoding='utf-8')
    installed = []
    for worker in record['workers']:
        pkg = worker['package']
        path = shell('pm path '+pkg,check=False)
        if not path:
            call('install',worker['apk'],timeout=90)
            path = shell('pm path '+pkg)
        assert path.startswith('package:') and '\n' not in path
        path = path.removeprefix('package:')
        actual = shell('sha256sum '+path).split()[0]
        assert actual == worker['sha256']
        package = shell('dumpsys package '+pkg)
        assert 'DEBUGGABLE' in package
        uid = int(re.search(r'userId=(\d+)',package)[1])
        installed.append({**worker,'uid':uid,'installedPath':path,'installedSha256':actual})
    assert shell('sha256sum '+original_path).split()[0] == original_sha
    value = {'device':DEVICE,'originalPackage':'net.toyknight.aeii.android','originalInstalledSha256':original_sha,'originalUserDataTouched':False,'workers':installed}
    (TASK/'INSTALLED.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # worker11此前只运行了只读启动探针，收尾仅终止本任务自建副本。
    shell('am force-stop net.toyknight.aeii.worker11')
    print(json.dumps({'device':DEVICE,'workers':[{k:w[k] for k in ('package','uid','installedSha256')} for w in installed]},ensure_ascii=False))


if __name__ == '__main__':
    main()
