"""部署独立手机测速目录，复用已安装运行时并保留此前100局全部原件。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import sys
import tarfile

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / 'phone_2m_scratch100_20261024'
sys.path.insert(0, str(BASE))
from device import root, call, write

PHONE = '/data/local/tmp/aeii-2m-workers-20261024'
ROOTFS = '/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def sha(p):
    with p.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    dataset = json.loads((HERE / 'DATASET.json').read_text(encoding='utf-8'))
    assert dataset['parents'] == 20 and dataset['samples'] == 15288
    plan = json.loads((HERE / 'PLAN.json').read_text(encoding='utf-8'))
    assert sha(Path(plan['baseCheckpoint'])) == plan['baseCheckpointSha256']
    monitor = (BASE / 'resource_monitor.sh').read_text(encoding='utf-8').replace('/data/local/tmp/aeii-2m-scratch100-20261024', PHONE)
    (HERE / 'resource_monitor.sh').write_text(monitor, encoding='utf-8', newline='\n')
    names = ['PLAN.json', 'PROTOCOL.json', 'DATASET.json', 'model.py', 'batch_model.py', 'accurate_ops.py', 'train_phone.py', 'train_workers.py']
    auth = {'serial': 'c2357770', 'authorizedParents': 20, 'files': {name: sha(HERE / name) for name in names},
            'authorization': '用户明确要求小米8先2worker十局再3worker十局，完成对比耗时和性能占用', 'automaticFullTraining': False}
    write(HERE / 'PHONE_AUTHORIZED.json', auth)
    archive = HERE / 'payload.tar'
    with tarfile.open(archive, 'w') as stream:
        for name in names + ['PHONE_AUTHORIZED.json']:
            stream.add(HERE / name, arcname='job/' + name)
        for report in dataset['reports']:
            p = HERE / 'data' / (report['parentId'] + '.frames.gz')
            assert sha(p) == report['sha256']
            stream.add(p, arcname='job/data/' + p.name)
        stream.add(Path(plan['baseCheckpoint']), arcname='job/base-checkpoint.pt')
        for name in ['controller.sh', 'resource_monitor.sh']:
            stream.add(HERE / name, arcname=name)
    remote = '/data/local/tmp/aeii-2m-workers-payload-20261024.tar'
    before = root('date; dumpsys battery; df -k /data; cat /proc/meminfo | head -6; ps -A -o PID,PPID,NAME | grep -E "python|aeii|frida|node"', check=False)
    write(HERE / 'PHONE_BEFORE_DEPLOY.json', {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'raw': before})
    call('push', archive, remote, timeout=180)
    assert root('sha256sum ' + remote).split()[0] == sha(archive)
    root('test ! -e ' + PHONE + '/job/CONTROLLER_STARTED.json || exit 2\nmkdir -p ' + PHONE + '/job ' + PHONE + '/logs\ntar -xf ' + remote + ' -C ' + PHONE + '\nmkdir -p ' + ROOTFS + '/bench\nmount -o bind ' + PHONE + '/job ' + ROOTFS + '/bench\nsh -n ' + PHONE + '/controller.sh\nsh -n ' + PHONE + '/resource_monitor.sh', timeout=60)
    # 使用独立会话与手机本地标准流，电脑退出不会结束手机任务。
    command = 'test ! -e ' + PHONE + '/job/CONTROLLER_STARTED.json || exit 2\nsetsid sh ' + PHONE + '/controller.sh </dev/null >' + PHONE + '/logs/controller.log 2>&1 &\necho $!'
    launched = root(command, timeout=30)
    write(HERE / 'LAUNCHED.json', {'phoneRoot': PHONE, 'launchResult': launched, 'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'archiveSha256': sha(archive), 'computerRequired': False})
    print(json.dumps({'phoneRoot': PHONE, 'launched': launched, 'samples': dataset['samples'], 'automaticFullTraining': False}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
