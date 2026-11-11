"""归档第二台已完成父局及失败尝试；只核传输完整性，不执行独立重放或训练。"""
import datetime as dt
import gzip
import hashlib
import io
import json
import re
from pathlib import Path
import subprocess
import tarfile
from device import TASK, DEVICE, ADB, shell


def archive(package, attempt, destination):
    assert re.fullmatch(r'[A-Za-z0-9_-]{1,79}',attempt)
    command=[ADB,'-s',DEVICE,'exec-out','run-as',package,'tar','-C','/data/user/0/'+package+'/files/.aeii-hard-production','-cf','-',attempt]
    result=subprocess.run(command,capture_output=True,timeout=90)
    if result.returncode:
        return {'available':False,'error':result.stderr.decode('utf-8','replace')}
    raw=result.stdout
    with (destination/(attempt+'.tar')).open('xb') as file:
        file.write(raw)
    directory=destination/attempt;directory.mkdir()
    try:
        archive_file=tarfile.open(fileobj=io.BytesIO(raw),mode='r:')
    except tarfile.ReadError as error:
        # exec-out不提供可靠的远端退出码；启动失败且没有产物目录时，tar错误文字可能混在标准输出。
        return {'available':False,'archiveSha256':hashlib.sha256(raw).hexdigest(),'error':str(error),'remoteMessage':raw[:300].decode('utf-8','replace')}
    with archive_file:
        for member in archive_file.getmembers():
            if member.isdir():
                continue
            assert member.isfile() and member.name.startswith(attempt+'/')
            relative=Path(member.name).relative_to(attempt)
            assert len(relative.parts)==1
            target=directory/relative
            assert target.resolve().is_relative_to(directory.resolve())
            with target.open('xb') as output:
                output.write(archive_file.extractfile(member).read())
    return {'available':True,'archiveSha256':hashlib.sha256(raw).hexdigest(),'directory':str(directory)}


def main():
    out=TASK/'archives'/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ');out.mkdir(parents=True,exist_ok=False)
    plan=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    state=json.loads(shell('cat '+plan['remoteRoot']+'/STATE.json'))
    (out/'STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    complete,failures=[],[]
    for worker in plan['workers']:
        wid,pkg,root=worker['workerId'],worker['package'],worker['remoteRoot']
        local=out/wid;local.mkdir()
        for filename in ['completed.tsv','failure.tsv','STATE.json','current-state.json','important-targets.tsv']:
            text=shell('cat '+root+'/'+filename,check=False)
            (local/filename).write_text(text.replace('\r',''),encoding='utf-8',newline='\n')
        for line in (local/'completed.tsv').read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            seq,parent,attempt,epoch=line.split()
            record=archive(pkg,attempt,local)
            assert record['available']
            directory=Path(record['directory'])
            manifest=json.loads((directory/'artifact-manifest.json').read_text(encoding='utf-8'))
            result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
            assert manifest['naturalEnd'] and result['naturalEnd'] and manifest['parentId']==parent==result['parentId']
            assert (directory/'THREAD_EXITED.json').is_file()
            for item in manifest['files']:
                content=(directory/item['name']).read_bytes()
                assert len(content)==item['bytes'] and hashlib.sha256(content).hexdigest()==item['sha256']
                if item['name'].endswith('.gz'):
                    gzip.decompress(content)
            complete.append({'sequenceIndex':int(seq),'parentId':parent,'attemptId':attempt,'package':pkg,'workerId':wid,
                             'actions':result['actions'],'seconds':result['elapsedSeconds'],'map':result['map'],'seed':result['seed'],
                             'pathCounts':result['pathCounts'],'nativeReplayVerified':False,'projectStrictVerified':False,
                             'transferHashesVerified':True,**record})
        for line in (local/'failure.tsv').read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            seq,parent,attempt,reason,epoch=line.split()
            record=archive(pkg,attempt,local)
            failures.append({'sequenceIndex':int(seq),'parentId':parent,'attemptId':attempt,'package':pkg,'reason':reason,'naturalCompletionCounted':False,**record})
    assert len(complete)==len({p['parentId'] for p in complete})
    assert all(1001<=p['sequenceIndex']<=2000 for p in complete)
    index={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'completedParents':len(complete),'failedAttempts':len(failures),
           'parents':complete,'failures':failures,'independentReplayDeferred':True,'automaticTrainingAdmission':False}
    (out/'INDEX.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'directory':str(out),'completedParents':len(complete),'failedAttempts':len(failures),'transferHashesVerified':True},ensure_ascii=False))


if __name__=='__main__':
    main()
