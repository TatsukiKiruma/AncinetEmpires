"""下发独立20局手机对战包，不改训练任务、模型或手机应用。"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import tarfile
from device import HERE, PHONE, call, root, write

ROOTFS = '/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def deploy():
    assert not (HERE / 'DEPLOYED.json').exists()
    assert not root('if test -e ' + PHONE + '/CONTROLLER_STARTED.json; then echo exists; fi')
    files = [p for p in HERE.rglob('*') if p.is_file() and '__pycache__' not in p.parts
             and p.name not in {'payload.tar', 'ADB_COMMANDS.jsonl', 'UPLOAD_SHA256SUMS'}]
    archive = HERE / 'payload.tar'
    with tarfile.open(archive, 'w') as tar:
        for file in files:
            tar.add(file, arcname=file.relative_to(HERE).as_posix(), recursive=False)
    checks = '\n'.join(sha(file) + '  ' + PHONE + '/' + file.relative_to(HERE).as_posix() for file in files)
    (HERE / 'UPLOAD_SHA256SUMS').write_text(checks + '\n', encoding='utf-8', newline='\n')
    remote = '/data/local/tmp/aeii-2414-arena-payload-20261027.tar'
    call('push', archive, remote, timeout=120)
    assert root('sha256sum ' + remote).split()[0] == sha(archive)
    root('set -e\nmkdir -p ' + PHONE + '/logs ' + ROOTFS + '/eval2414\ntar -xf ' + remote + ' -C ' + PHONE
         + '\nif ! grep -Fq " ' + ROOTFS + '/eval2414 " /proc/mounts; then mount -o bind ' + PHONE + ' ' + ROOTFS + '/eval2414; fi'
         + '\nsh -n ' + PHONE + '/controller.sh\nsh -n ' + PHONE + '/resource_monitor.sh', timeout=120)
    call('push', HERE / 'UPLOAD_SHA256SUMS', '/data/local/tmp/aeii-2414-arena-upload-shas')
    root('sha256sum -c /data/local/tmp/aeii-2414-arena-upload-shas > ' + PHONE + '/logs/upload-hashes.log', timeout=120)
    write(HERE / 'DEPLOYED.json', {'files': len(files), 'allFileHashesVerified': True, 'payloadSha256': sha(archive),
                                 'phoneRoot': PHONE, 'games': 20, 'trainingStarted': False, 'replayValidation': False})
    print(json.dumps({'deployed': True, 'files': len(files), 'payloadBytes': archive.stat().st_size}))


def launch():
    assert json.loads((HERE / 'DEPLOYED.json').read_text())['allFileHashesVerified']
    assert not (HERE / 'LAUNCHED.json').exists()
    command = 'test ! -e ' + PHONE + '/CONTROLLER_STARTED.json || exit 2\nsetsid sh ' + shlex.quote(PHONE + '/controller.sh') + ' </dev/null > ' + PHONE + '/logs/controller.log 2>&1 &\necho $!'
    pid = int(root(command))
    write(HERE / 'LAUNCHED.json', {'controllerPid': pid, 'games': 20, 'phoneRoot': PHONE, 'trainingStarted': False, 'replayValidation': False})
    print(json.dumps({'launched': True, 'controllerPid': pid}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['deploy', 'launch'])
    globals()[parser.parse_args().stage]()
