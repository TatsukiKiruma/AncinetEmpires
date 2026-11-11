"""为未root的三星准备独立Termux/PRoot运行环境，保留所有旧任务。"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import time
import urllib.request
import io
import tarfile
import zipfile
from device import HERE,call,shell,save

ASSETS=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/phone_samsung_v1/assets')
PREFIX='/data/data/com.termux/files/usr'
HOME='/data/data/com.termux/files/home'

def sha(p):
    with Path(p).open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()

def termux(command,**kwargs):
    text=f'export HOME={HOME} PREFIX={PREFIX} TMPDIR={PREFIX}/tmp PATH={PREFIX}/bin:/system/bin; '+command
    return shell('run-as com.termux /system/bin/sh -c '+shlex.quote(text),**kwargs)

def download():
    ASSETS.mkdir(parents=True,exist_ok=True)
    records=[]
    for repo,release,match in [('termux-app','tags/v0.118.3',lambda n:n.endswith('arm64-v8a.apk')),
                               ('termux-boot','latest',lambda n:n.endswith('.apk') and 'debug' in n)]:
        api=f'https://api.github.com/repos/termux/{repo}/releases/{release}'
        req=urllib.request.Request(api,headers={'User-Agent':'AncientEmpires-offline-training'})
        with urllib.request.urlopen(req,timeout=60) as response:
            data=json.load(response)
        save(ASSETS/(repo+'-release.json'),data)
        assets=[a for a in data['assets'] if match(a['name'])]
        if len(assets)!=1:
            raise ValueError((repo,[a['name'] for a in data['assets']]))
        asset=assets[0];target=ASSETS/asset['name']
        if not target.exists():
            with urllib.request.urlopen(asset['browser_download_url'],timeout=60) as source,target.with_suffix('.pending').open('wb') as out:
                while block:=source.read(2**20):out.write(block)
            target.with_suffix('.pending').replace(target)
        digest=sha(target)
        if asset.get('digest') and asset['digest']!='sha256:'+digest:
            raise ValueError('官方发布摘要不符')
        records.append(dict(repo=repo,path=str(target),url=asset['browser_download_url'],sha256=digest,bytes=target.stat().st_size,
                            officialDigest=asset.get('digest'),tag=data['tag_name']))
    save(HERE/'RUNTIME_DOWNLOAD.json',dict(assets=records))
    print(json.dumps(records))

def install():
    records=json.loads((HERE/'RUNTIME_DOWNLOAD.json').read_text('utf-8'))['assets']
    for record in records:
        package='com.termux.boot' if record['repo']=='termux-boot' else 'com.termux'
        if shell('pm path '+package,check=False):
            raise ValueError('目标已安装，须核对身份后再继续，禁止覆盖')
        assert sha(record['path'])==record['sha256']
        print(call('install','--no-streaming','-t',record['path'],timeout=180),flush=True)
    print(shell('am start -n com.termux/.app.TermuxActivity'),flush=True)
    for _ in range(60):
        result=termux(f'test -x {PREFIX}/bin/bash && echo READY',check=False)
        if result=='READY':
            break
        time.sleep(.5)
    else:
        raise RuntimeError('Termux初次运行时未就绪')
    print(termux('id; bash --version | head -1; df -k "$HOME"'),flush=True)
    save(HERE/'TERMUX_INSTALLED.json',dict(packages=[r['repo'] for r in records],runAsVerified=True,systemRootRequired=False))

def inspect():
    print(shell('pidof com.termux; dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp"; run-as com.termux ls -la files; run-as com.termux ls -la files/usr/bin; logcat -d -t 1500 | grep -i -E "com.termux|termux|Fatal signal" | tail -70',check=False),flush=True)

def start():
    print(shell('input keyevent 224; wm dismiss-keyguard; am start -W -n com.termux/.app.TermuxActivity; dumpsys window policy | grep -i -E "keyguard|showing" | head -12',check=False),flush=True)

def crash():
    print(shell('run-as com.termux ls -la files/home; run-as com.termux cat files/home/crash_log.md; logcat -d -t 3000 -s AndroidRuntime:E Termux:E | head -130',check=False),flush=True)

def packages():
    print(termux('export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y proot',timeout=240),flush=True)
    print(termux('proot --version | head -3; termux-wake-lock'),flush=True)

def background():
    previous=shell('cmd appops get com.termux RUN_IN_BACKGROUND; cmd appops get com.termux RUN_ANY_IN_BACKGROUND; dumpsys deviceidle whitelist | grep com.termux',check=False)
    save(HERE/'BACKGROUND_BEFORE.json',dict(raw=previous))
    print(shell('cmd appops set com.termux RUN_IN_BACKGROUND allow; cmd appops set com.termux RUN_ANY_IN_BACKGROUND allow; dumpsys deviceidle whitelist +com.termux; dumpsys deviceidle whitelist +com.termux.boot; am start -n com.termux/.app.TermuxActivity',check=False),flush=True)
    time.sleep(3)
    print(termux(f'ls -ld {PREFIX}; test -x {PREFIX}/bin/bash && echo READY',check=False),flush=True)

def bootstrap():
    records=json.loads((HERE/'RUNTIME_DOWNLOAD.json').read_text('utf-8'))['assets']
    apk=next(r for r in records if r['repo']=='termux-app')
    assert sha(apk['path'])==apk['sha256']
    binary=zipfile.ZipFile(apk['path']).read('lib/arm64-v8a/libtermux-bootstrap.so')
    start=binary.index(b'PK\x03\x04');end=binary.index(b'PK\x05\x06',start)+22
    payload=zipfile.ZipFile(io.BytesIO(binary[start:end]))
    target=ASSETS/'bootstrap-private.tar'
    with tarfile.open(target,'w',format=tarfile.GNU_FORMAT) as tar:
        for item in payload.infolist():
            if item.filename=='SYMLINKS.txt':continue
            p=Path(item.filename)
            if p.is_absolute() or '..' in p.parts:raise ValueError('引导包路径不在专用前缀内')
            info=tarfile.TarInfo('usr-staging/'+item.filename)
            info.mode=0o700 if item.is_dir() or item.filename.startswith(('bin/','libexec','lib/apt/apt-helper','lib/apt/methods')) or item.filename=='etc/termux/bootstrap/termux-bootstrap-second-stage.sh' else 0o600
            if item.is_dir():info.type=tarfile.DIRTYPE;tar.addfile(info)
            else:
                data=payload.read(item);info.size=len(data);tar.addfile(info,io.BytesIO(data))
        for line in payload.read('SYMLINKS.txt').decode().splitlines():
            old,new=line.split('←')
            assert '..' not in Path(new).parts and not Path(new).is_absolute()
            info=tarfile.TarInfo('usr-staging/'+new.removeprefix('./'));info.type=tarfile.SYMTYPE;info.linkname=old
            info.mode=0o700;tar.addfile(info)
    shell('am force-stop com.termux')
    termux('test ! -e '+PREFIX+' && test ! -e /data/data/com.termux/files/usr-staging')
    print(call('exec-in','run-as','com.termux','/system/bin/tar','-xf','-','-C','/data/data/com.termux/files',input=target.read_bytes(),timeout=180),flush=True)
    termux('mv /data/data/com.termux/files/usr-staging '+PREFIX)
    result=termux('bash '+PREFIX+'/etc/termux/bootstrap/termux-bootstrap-second-stage.sh; bash --version | head -1; command -v apt',timeout=120)
    print(result,flush=True)
    save(HERE/'BOOTSTRAP_VERIFIED.json',dict(ready=True,sourceApkSha256=apk['sha256'],privateArchiveSha256=sha(target),
        method='按官方TermuxInstaller提取包内原始bootstrap与SYMLINKS并执行第二阶段，不修改手机安全锁或其他应用',raw=result))

def finish_bootstrap():
    records=json.loads((HERE/'RUNTIME_DOWNLOAD.json').read_text('utf-8'))['assets']
    apk=next(r for r in records if r['repo']=='termux-app')
    binary=zipfile.ZipFile(apk['path']).read('lib/arm64-v8a/libtermux-bootstrap.so')
    start=binary.index(b'PK\x03\x04');end=binary.index(b'PK\x05\x06',start)+22
    payload=zipfile.ZipFile(io.BytesIO(binary[start:end]))
    sums=[]
    for item in payload.infolist():
        if not item.is_dir() and item.filename!='SYMLINKS.txt':
            sums.append(hashlib.sha256(payload.read(item)).hexdigest()+'  '+item.filename)
    sumfile=ASSETS/'BOOTSTRAP_SHA256SUMS';sumfile.write_text('\n'.join(sums)+'\n','utf-8',newline='\n')
    remote='/data/local/tmp/aeii-omni-stage3-bootstrap-sums-20261030-v1'
    call('push',sumfile,remote)
    command='cd files/usr-staging && sha256sum -c - > ../bootstrap-hashes.log && echo HASHES_PASSED'
    print(shell('cat '+remote+' | run-as com.termux /system/bin/sh -c '+shlex.quote(command),timeout=120),flush=True)
    lines=['set -e','cd /data/data/com.termux/files/usr-staging']
    for line in payload.read('SYMLINKS.txt').decode().splitlines():
        old,new=line.split('←')
        lines.append('test "$(readlink '+shlex.quote(new)+')" = '+shlex.quote(old))
    lines.append('echo SYMLINKS_PASSED')
    verify=ASSETS/'bootstrap-links.sh';verify.write_text('\n'.join(lines)+'\n','utf-8',newline='\n')
    call('push',verify,remote+'-links')
    print(shell('cat '+remote+'-links | run-as com.termux /system/bin/sh',timeout=120),flush=True)
    termux('test ! -e '+PREFIX+' && mv /data/data/com.termux/files/usr-staging '+PREFIX)
    result=termux('bash '+PREFIX+'/etc/termux/bootstrap/termux-bootstrap-second-stage.sh && bash --version | head -1',timeout=120)
    save(HERE/'BOOTSTRAP_VERIFIED.json',dict(ready=True,sourceApkSha256=apk['sha256'],filesHashed=len(sums),symlinksVerified=True,
        execInEofIssuePreserved=True,method='完整逐文件SHA与链接核验后完成官方第二阶段',raw=result))
    print(result,flush=True)

def bootstrap_file():
    archive=ASSETS/'bootstrap-private.tar'
    remote='/data/local/tmp/aeii-omni-stage3-bootstrap-20261030-v1.tar'
    print(call('push',archive,remote,timeout=180),flush=True)
    assert shell('sha256sum '+remote).split()[0]==sha(archive)
    termux('test ! -e '+PREFIX+'; test ! -e /data/data/com.termux/files/usr-staging-incomplete-v1; mv /data/data/com.termux/files/usr-staging /data/data/com.termux/files/usr-staging-incomplete-v1; cp /data/data/com.termux/files/bootstrap-hashes.log /data/data/com.termux/files/bootstrap-hashes-incomplete-v1.log')
    print(shell('cat '+remote+' | run-as com.termux /system/bin/tar -xf - -C /data/data/com.termux/files',timeout=180),flush=True)
    finish_bootstrap()

def download_api():
    request=urllib.request.Request('https://api.github.com/repos/termux/termux-api/releases/latest',headers={'User-Agent':'AncientEmpires-offline-training'})
    with urllib.request.urlopen(request,timeout=60) as response:data=json.load(response)
    save(ASSETS/'termux-api-release.json',data)
    choices=[a for a in data['assets'] if a['name'].endswith('.apk') and 'debug' in a['name']]
    assert len(choices)==1,[a['name'] for a in data['assets']]
    item=choices[0];path=ASSETS/item['name']
    with urllib.request.urlopen(item['browser_download_url'],timeout=60) as response,path.open('wb') as out:
        while block:=response.read(2**20):out.write(block)
    save(HERE/'TERMUX_API_DOWNLOAD.json',dict(path=str(path),url=item['browser_download_url'],sha256=sha(path),tag=data['tag_name'],purpose='仅显示手机本地中文进度和完成通知'))
    print(json.dumps(dict(file=path.name,bytes=path.stat().st_size)))

def install_api():
    record=json.loads((HERE/'TERMUX_API_DOWNLOAD.json').read_text('utf-8'))
    assert not shell('pm path com.termux.api',check=False)
    assert sha(record['path'])==record['sha256']
    print(call('install','--no-streaming','-t',record['path'],timeout=120),flush=True)
    print(termux('export DEBIAN_FRONTEND=noninteractive; apt-get install -y termux-api',timeout=180),flush=True)
    print(termux('termux-wake-lock; termux-notification --id 91030 --title "远古帝国训练准备" --content "正在核验离线训练包，核验完成后可拔线充电。" --priority low'),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['download','install','inspect','start','crash','packages','background','bootstrap','finish_bootstrap','bootstrap_file','download_api','install_api']);args=parser.parse_args()
    globals()[args.action]()
