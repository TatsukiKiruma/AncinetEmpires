"""同步已完成2000局的模型、完整恢复状态和日志，逐文件核对后才允许清理缓存。"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import tarfile
from device import HERE, PHONE, ROOT, root, call, write

OLD=HERE
SOURCE=PHONE
DEST=OLD/'completion'
ARCHIVE='/data/local/tmp/aeii-2000-completion-20261027-20261025.tar'


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def read(name):return json.loads(root('cat '+SOURCE+'/job/'+name))


def stopped():
    complete=read('output/COMPLETE.json');assert complete['status']=='complete' and complete['cumulativeParents']==2000
    assert read('CONTROLLER_EXIT.json')['returncode']==0
    workers=read('output/WORKERS.json')
    for identity in [read('CONTROLLER_STARTED.json'),workers['coordinator'],*workers['workers'],workers['encoder']]:
        raw=root('if test -r /proc/'+str(identity['pid'])+'/stat; then cat /proc/'+str(identity['pid'])+'/stat; fi')
        if raw:
            fields=raw.rsplit(')',1)[1].split();assert int(fields[19])!=identity['startTicks'] or fields[0] in {'Z','X'}
    return complete


def sync():
    assert not (HERE/'SYNC_2000.json').exists(),'已同步，不覆盖历史回执'
    complete=stopped();DEST.mkdir(exist_ok=True)
    listing='/data/local/tmp/aeii-2000-completion-20261027-files.txt';hashes='/data/local/tmp/aeii-2000-completion-20261027-sha256.txt'
    command=r'''set -e
test "$(readlink -f SOURCE)" = SOURCE
cd SOURCE
find . \( -path ./job/inputs -o -path ./job/node -o -name __pycache__ \) -prune -o -type f -print | sort > LIST
while IFS= read -r FILE; do sha256sum "$FILE"; done < LIST > HASHES
tar -cf ARCHIVE -T LIST
chmod 644 ARCHIVE
sha256sum ARCHIVE
'''.replace('SOURCE',SOURCE).replace('LIST',listing).replace('HASHES',hashes).replace('ARCHIVE',ARCHIVE)
    digest=root(command,timeout=120).split()[-2]
    manifest=root('cat '+hashes)
    (DEST/'PHONE_SHA256SUMS').write_text(manifest+'\n',encoding='utf-8')
    archive=DEST/'phone-completion.tar';call('pull',ARCHIVE,archive,timeout=180);assert sha(archive)==digest
    with tarfile.open(archive,'r') as tar:
        for member in tar:
            assert member.isfile(),member.name
            target=(DEST/member.name).resolve();assert target.is_relative_to(DEST.resolve())
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                assert sha(target)==hashlib.sha256(tar.extractfile(member).read()).hexdigest()
            else:
                with target.open('wb') as output:shutil.copyfileobj(tar.extractfile(member),output)
    verified=[]
    for line in manifest.splitlines():
        expected,name=line.split(None,1);name=name.lstrip('*').removeprefix('./');p=DEST/name
        assert p.is_file() and sha(p)==expected,name
        verified.append({'relativePath':name,'local':str(p.resolve()),'remote':SOURCE+'/'+name,'sha256':expected,'bytes':p.stat().st_size})
    checkpoint=DEST/'job/output'/complete['finalCheckpoint']['file'];assert sha(checkpoint)==complete['finalCheckpoint']['sha256']
    value={'status':'complete','checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'phoneRoot':SOURCE,'destination':str(DEST.resolve()),
        'archiveSha256':digest,'archiveBytes':archive.stat().st_size,'files':verified,'fileCount':len(verified),'allFileHashesVerified':True,
        'finalCheckpoint':str(checkpoint.resolve()),'finalCheckpointSha256':sha(checkpoint),'complete':complete,'strictReplayExecuted':False}
    write(HERE/'SYNC_2000.json',value);write(DEST/'SYNC_RECEIPT.json',value)
    print(json.dumps({k:v for k,v in value.items() if k not in {'files','complete'}},ensure_ascii=False),flush=True)


if __name__=="__main__":sync()
