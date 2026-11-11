"""三星私有PRoot根文件系统；依赖在交付前装齐，训练不再联网。"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import tarfile
from device import HERE,call,shell,save
from runtime_setup import termux,PREFIX,HOME
ROOT=HERE.parents[3]
PHONE=HOME+'/aeii-omni-stage3-20261030-v1'
ROOTFS=PHONE+'/rootfs'
WORK=PHONE+'/work'
ASSETS=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/phone_samsung_v1/assets')

def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def guest(command,**kwargs):
    cmd='unset LD_PRELOAD LD_LIBRARY_PATH; '+PREFIX+'/bin/proot --link2symlink --kill-on-exit -0 -r '+ROOTFS+' -b /dev -b /proc -b /sys -b '+WORK+':/work -b '+PHONE+':/phone -b '+PHONE+'/tmp:/tmp -w /work /usr/bin/env HOME=/root TMPDIR=/tmp LANG=C.UTF-8 PATH=/opt/torch-env/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -c '+shlex.quote(command)
    return termux(cmd,**kwargs)

def prepare():
    source=ROOT/'ai_training/phone_2m_scratch100_20261024/runtime-assets'
    base=source/'ubuntu-base-24.04.5-base-arm64.tar.gz'
    expected=read(source/'ROOTFS_SOURCE.json')['sha256'];assert sha(base)==expected
    termux('test ! -e '+PHONE+' && mkdir -p '+ROOTFS+' '+WORK+' '+PHONE+'/logs '+PHONE+'/tmp')
    remote='/data/local/tmp/aeii-omni-samsung-linux-base-20261030-v1.tar.gz'
    call('push',base,remote,timeout=180);assert shell('sha256sum '+remote).split()[0]==expected
    unpack=PREFIX+'/bin/tar --no-same-owner -xzf - -C '+ROOTFS
    shell('cat '+remote+' | run-as com.termux '+unpack,timeout=180)
    termux("printf 'nameserver 223.5.5.5\\nnameserver 1.1.1.1\\n' > "+ROOTFS+'/etc/resolv.conf')
    output=guest('uname -m; /lib/ld-linux-aarch64.so.1 --version | head -1; command -v apt-get; df -k /work',timeout=60)
    print(output,flush=True)
    save(HERE/'LINUX_BASE_VERIFIED.json',dict(rootfs=ROOTFS,work=WORK,baseSha256=expected,raw=output,rootPermission=False))

def install():
    command='export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates libgomp1 libstdc++6 && python3 -m venv /opt/torch-env'
    output=guest(command,timeout=1200)
    save(HERE/'LINUX_PYTHON_INSTALL.json',dict(passed=True,raw=output))
    print(output[-6000:],flush=True)

def finish_prepare():
    # Android应用域不允许初次tar创建这两个硬链接，使用相同字节的独立副本。
    termux('cp -p '+ROOTFS+'/usr/bin/perl '+ROOTFS+'/usr/bin/perl5.38.2; cp -p '+ROOTFS+'/usr/bin/gunzip '+ROOTFS+'/usr/bin/uncompress')
    termux("printf 'nameserver 223.5.5.5\\nnameserver 1.1.1.1\\n' > "+ROOTFS+'/etc/resolv.conf')
    output=guest('uname -m; /lib/ld-linux-aarch64.so.1 --version | head -1; command -v apt-get; df -k /work',timeout=60)
    save(HERE/'LINUX_BASE_VERIFIED.json',dict(rootfs=ROOTFS,work=WORK,baseSha256='a91d5a93010193712d346d761372b7c9db6dfcf093893161c64ca107f05914f2',
        raw=output,rootPermission=False,hardlinksRepresentedByExactCopies=['usr/bin/perl5.38.2','usr/bin/uncompress']))
    print(output,flush=True)

def wheels():
    source=ROOT/'ai_training/phone_2m_scratch100_20261024/runtime-assets'
    archive=ASSETS/'linux-wheels-node.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for name,record in read(source/'WHEELS_MANIFEST.json').items():
            file=source/'wheels'/name;assert sha(file)==record['sha256']
            tar.add(file,arcname='opt/wheels/'+name)
    remote='/data/local/tmp/aeii-omni-samsung-wheels-20261030-v1.tar'
    call('push',archive,remote,timeout=180);assert shell('sha256sum '+remote).split()[0]==sha(archive)
    shell('cat '+remote+' | run-as com.termux '+PREFIX+'/bin/tar --no-same-owner -xf - -C '+ROOTFS,timeout=180)
    output=guest('/opt/torch-env/bin/python -m pip install --no-index --find-links /opt/wheels torch==2.14.0+cpu numpy && /opt/torch-env/bin/python -c "import torch,numpy,platform; print(torch.__version__,numpy.__version__,platform.machine()); print(torch.backends.mkldnn.is_available())"',timeout=900)
    save(HERE/'TORCH_INSTALLED.json',dict(passed=True,raw=output,offlineWheels=True))
    print(output[-5000:],flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','finish_prepare','install','wheels']);args=parser.parse_args();globals()[args.action]()
