"""独立Linux ARM64运行时；不覆盖Termux，不运行模型或优化器。"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import time
import urllib.request

from device import HERE, PHONE, root, call, write

RUNTIME=PHONE+'/runtime'
CHROOT=RUNTIME+'/rootfs'
BASE='https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-24.04.5-base-arm64.tar.gz'
BASE_SHA='a91d5a93010193712d346d761372b7c9db6dfcf093893161c64ca107f05914f2'


def digest(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def download():
    assets=HERE/'runtime-assets';assets.mkdir(exist_ok=True)
    base=assets/'ubuntu-base-24.04.5-base-arm64.tar.gz'
    if not base.exists():
        with urllib.request.urlopen(BASE,timeout=60) as source,base.with_suffix('.pending').open('wb') as output:
            while block:=source.read(1024*1024):output.write(block)
        base.with_suffix('.pending').replace(base)
    assert digest(base)==BASE_SHA
    write(assets/'ROOTFS_SOURCE.json',{'url':BASE,'sha256':BASE_SHA,'bytes':base.stat().st_size,'officialChecksumUrl':'https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/SHA256SUMS'})
    print('rootfs_downloaded',base.stat().st_size,flush=True)


def prepare():
    base=HERE/'runtime-assets/ubuntu-base-24.04.5-base-arm64.tar.gz'
    assert digest(base)==BASE_SHA
    root('test ! -e '+PHONE+' && mkdir -p '+CHROOT+' '+PHONE+'/job '+PHONE+'/logs\nchmod 755 '+PHONE+' '+RUNTIME)
    remote='/data/local/tmp/aeii-2m-scratch100-ubuntu-base.tar.gz'
    call('push',base,remote)
    assert root('sha256sum '+remote).split()[0]==BASE_SHA
    root('tar -xzf '+remote+' -C '+CHROOT,timeout=60)
    # 挂载范围限定本次新建rootfs，Android原生服务和既有环境不变。
    root('mkdir -p '+CHROOT+'/proc '+CHROOT+'/dev '+CHROOT+'/work\nmount -o bind /proc '+CHROOT+'/proc\nmount -o bind /dev '+CHROOT+'/dev\nmount -o bind '+PHONE+'/job '+CHROOT+'/work')
    root('printf '+shlex.quote('nameserver 223.5.5.5\nnameserver 1.1.1.1\n')+' > '+CHROOT+'/etc/resolv.conf')
    print(root('chroot '+CHROOT+' /usr/bin/env PATH=/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -c '+shlex.quote('uname -m; /lib/ld-linux-aarch64.so.1 --version | head -1; command -v apt-get; df -k /work')))
    install()


def install():
    script='''#!/system/bin/sh
export PATH=/system/bin:/system/xbin
chroot ROOTFS /usr/bin/env PATH=/usr/sbin:/usr/bin:/sbin:/bin DEBIAN_FRONTEND=noninteractive /bin/bash -c 'apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates libgomp1 && python3 -m venv /opt/torch-env' > PHONE/logs/runtime-install.log 2>&1
CODE=$?
printf '{"returncode":%s}\n' "$CODE" > PHONE/logs/runtime-install-exit.json
exit "$CODE"
'''.replace('ROOTFS',CHROOT).replace('PHONE',PHONE)
    local=HERE/'install_runtime.sh';local.write_text(script,encoding='utf-8',newline='\n')
    call('push',local,'/data/local/tmp/aeii-2m-install-runtime.sh')
    root('cp /data/local/tmp/aeii-2m-install-runtime.sh '+PHONE+'/install_runtime.sh')
    print(root('setsid sh '+PHONE+'/install_runtime.sh </dev/null >'+PHONE+'/logs/runtime-launch.log 2>&1 & echo $!'),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['download','prepare','install']);args=parser.parse_args()
    globals()[args.stage]()
