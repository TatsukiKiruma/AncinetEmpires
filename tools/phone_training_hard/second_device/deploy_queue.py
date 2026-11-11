"""一次上传三星本地完整分片并启动；不保留电脑调度循环。"""
import datetime as dt
import json
from device import TASK, DEVICE, call, shell
from prepare_queue import sha


def main():
    out = TASK/'production-03'
    assert not (out/'DEPLOYED.json').exists()
    plan = json.loads((out/'PLAN.json').read_text(encoding='utf-8'))
    assert plan['device'] == DEVICE
    remote = plan['remoteRoot']
    hashes = json.loads((out/'SOURCE_SHA256.json').read_text(encoding='utf-8'))
    for relative, digest in hashes.items():
        assert sha(out/relative) == digest, relative
    for worker in plan['workers']:
        assert shell('sha256sum '+worker['installedPath']).split()[0] == worker['sha256']
        assert not shell('pidof '+worker['package'],check=False), '存在未知进程，拒绝重复部署'
    destinations = [(out/'master',remote)]+[(out/w['workerId'],w['remoteRoot']) for w in plan['workers']]
    for local, phone in destinations:
        shell('test ! -e '+phone)
        call('push',local,phone)
        actual = dict(line.split(None,1)[::-1] for line in shell('find '+phone+' -type f -exec sha256sum {} +').splitlines())
        expected = {phone+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
        assert actual == expected
        shell('chmod -R go-w '+phone)
        shell('chmod 755 '+phone)
    shell('sh -n '+remote+'/master.sh')
    for worker in plan['workers']:
        shell('sh -n '+worker['remoteRoot']+'/controller.sh; sh -n '+worker['remoteRoot']+'/process_thaw.sh')
        shell('run-as '+worker['package']+' mkdir -p files')
    probe = shell('CLASSPATH='+remote+'/process-importance.jar app_process /system/bin ProcessImportance --probe')
    assert 'probe_passed' in probe
    (out/'IMPORTANCE_PROBE.txt').write_text(probe,encoding='utf-8')
    command = 'setsid sh '+remote+'/master.sh '+remote+' </dev/null >'+remote+'/launch.log 2>&1 &'
    shell(command)
    record = {'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'remoteRoot':remote,'total':1000,'globalZeroBasedRange':[1000,2000],
              'command':command,'initialLimit':1,'computerRequired':False,'planSha256':sha(out/'PLAN.json'),'importanceProbePassed':True}
    (out/'DEPLOYED.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(record,ensure_ascii=False))


if __name__ == '__main__':
    main()
