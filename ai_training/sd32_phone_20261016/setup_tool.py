import pathlib, subprocess, urllib.request, hashlib, json, tarfile, os

ROOT = pathlib.Path(__file__).resolve().parent
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
REMOTE = '/data/local/tmp/ae_sd32_900_20261016'
URL = 'https://go.dev/dl/go1.27.2.linux-arm64.tar.gz'
SHA = '94f3e30b8e374bc285e7dadc11e0865726b9bc6e85b841ccceaabc0214c6b7c8'


def adb(*args):
    r = subprocess.run([ADB,'-s','c2357770',*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
    if r.returncode: raise RuntimeError(r.stdout+r.stderr)
    return r.stdout.strip()


def main():
    archive = ROOT/'go1.27.2.linux-arm64.tar.gz'
    if not archive.exists():
        with urllib.request.urlopen(URL,timeout=60) as source,archive.open('wb') as out:
            while block:=source.read(1024*1024): out.write(block)
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==SHA
    adb('shell','mkdir','-p',REMOTE)
    adb('push',str(archive),REMOTE+'/toolchain.tar.gz')
    assert adb('shell','sha256sum',REMOTE+'/toolchain.tar.gz').split()[0]==SHA
    extracted=subprocess.run([ADB,'-s','c2357770','shell',f'cd {REMOTE} && tar -xzf toolchain.tar.gz'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
    if extracted.returncode:
        errors=[s for s in extracted.stderr.splitlines() if s.strip()]
        assert errors and all('chown' in s or 'Operation not permitted' in s for s in errors),extracted.stderr
    # Android tar已完整写入文件，但非root不能恢复归档uid；逐文件摘要确认关键工具后接受这个已知警告。
    archive_info = tarfile.open(archive, 'r:gz')
    for name in ['go/bin/go', 'go/pkg/tool/linux_arm64/compile', 'go/pkg/tool/linux_arm64/link']:
        expected = hashlib.sha256(archive_info.extractfile(name).read()).hexdigest()
        assert adb('shell','sha256sum',REMOTE+'/'+name).split()[0]==expected,name
    archive_info.close()
    version = adb('shell',REMOTE+'/go/bin/go','version')
    assert 'go1.27.2 linux/arm64' in version,version
    (ROOT/'toolchain-receipt.json').write_text(json.dumps(dict(url=URL,sha256=SHA,bytes=archive.stat().st_size,phoneVersion=version,remote=REMOTE,compilerRunsOnlyOnPhone=True),indent=2),encoding='utf-8')
    print(version,flush=True)
    # 只清理本阶段可从已验官方归档恢复的非构建资源，所有目标均验证在独立目录下。
    targets = [REMOTE+'/toolchain.tar.gz'] + [REMOTE+'/go/'+x for x in ['test','src/cmd','doc','api','lib','misc']]
    for target in targets:
        resolved=adb('shell','realpath',target)
        assert resolved.startswith(REMOTE+'/') and resolved==target,resolved
    adb('shell','rm','-rf',*targets)
    print(adb('shell','du','-sk',REMOTE),flush=True)


if __name__=='__main__': main()
