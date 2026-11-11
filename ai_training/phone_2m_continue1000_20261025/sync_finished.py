"""同步已完成1000局的模型、完整恢复状态和日志，逐文件核对后才允许清理缓存。"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import tarfile
from device import HERE, PHONE, ROOT, root, call, write

OLD=HERE.parent/'phone_2m_continue900_20261024'
SOURCE='/data/local/tmp/aeii-2m-continue900-20261024'
DEST=OLD/'completion'
ARCHIVE='/data/local/tmp/aeii-1000-completion-20261025.tar'


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def read(name):return json.loads(root('cat '+SOURCE+'/job/'+name))


def stopped():
    complete=read('output/COMPLETE.json');assert complete['status']=='complete' and complete['cumulativeParents']==1000
    assert read('CONTROLLER_EXIT.json')['returncode']==0
    workers=read('output/WORKERS.json')
    for identity in [read('CONTROLLER_STARTED.json'),workers['coordinator'],*workers['workers'],workers['encoder']]:
        raw=root('if test -r /proc/'+str(identity['pid'])+'/stat; then cat /proc/'+str(identity['pid'])+'/stat; fi')
        if raw:
            fields=raw.rsplit(')',1)[1].split();assert int(fields[19])!=identity['startTicks'] or fields[0] in {'Z','X'}
    return complete


def sync():
    assert not (HERE/'SYNC_1000.json').exists(),'已同步，不覆盖历史回执'
    complete=stopped();DEST.mkdir(exist_ok=True)
    listing='/data/local/tmp/aeii-1000-completion-files.txt';hashes='/data/local/tmp/aeii-1000-completion-sha256.txt'
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
    write(HERE/'SYNC_1000.json',value);write(DEST/'SYNC_RECEIPT.json',value)
    print(json.dumps({k:v for k,v in value.items() if k not in {'files','complete'}},ensure_ascii=False),flush=True)


def cleanup():
    assert not (HERE/'CACHE_CLEANUP_RESULT.json').exists(),'已有本次清理回执，拒绝重复删除'
    stopped();sync=json.loads((HERE/'SYNC_1000.json').read_text(encoding='utf-8'));assert sync['allFileHashesVerified']
    entries=[]
    def add(remote,local,kind):
        local=Path(local).resolve();assert local.is_relative_to(ROOT.resolve()) and local.is_file()
        entries.append({'remote':remote,'local':str(local),'sha256':sha(local),'bytes':local.stat().st_size,'kind':kind})
    plan=json.loads((OLD/'PLAN.json').read_text(encoding='utf-8'))
    for parent in plan['inputs']:
        for name,item in parent['coreFiles'].items():
            local=Path(parent['directory'])/name;assert sha(local)==item['sha256']
            add(SOURCE+'/job/inputs/'+parent['parentId']+'/'+name,local,'已结束900局的原始输入工作副本')
    for item in sync['files']:
        name=item['relativePath']
        if ('/shared/' in name or name.endswith('/resume-test-checkpoint.pt') or name=='job/output/checkpoint-0.pt'
            or name=='job/base-checkpoint.pt' or name.endswith('.bin') and ('/repairs/' in name or '/attempts/' in name or 'probe' in name)
            or '/repairs/03/before/checkpoint-' in name):
            add(item['remote'],item['local'],'已备份的中间状态、旧检查点或编码缓存')
    extras=[(ARCHIVE,DEST/'phone-completion.tar'),('/data/local/tmp/aeii-2m-continue900-payload.tar',OLD/'payload.tar'),
        ('/data/local/tmp/aeii-continue900-repair03-checkpoint.pt',OLD/'repairs/03/source-checkpoint.pt'),
        ('/data/local/tmp/aeii-continue900-repair03-update.tar',OLD/'repairs/03/update.tar'),
        ('/data/local/tmp/aeii-continue900-repair03-probe.bin',OLD/'repairs/03/resume-phone.bin')]
    for remote,local in extras:
        if local.is_file():add(remote,local,'已备份的传输临时文件')
    assert len({e['remote'] for e in entries})==len(entries)
    preserve=SOURCE+'/job/output/'+sync['complete']['finalCheckpoint']['file']
    assert all(e['remote']!=preserve and '/node/' not in e['remote'] and '/runtime/' not in e['remote'] for e in entries)
    write(HERE/'CACHE_CLEANUP_MANIFEST.json',{'files':entries,'authorization':'用户要求同步模型日志后清理手机已备份的训练缓存','recursiveDelete':False,'final1000CheckpointPreserved':preserve,'runtimePreserved':True})
    before=root('df -k /data')
    within=[{**e,'chrootPath':'/continue900/'+e['remote'].split('/job/',1)[1]} for e in entries if e['remote'].startswith(SOURCE+'/job/')]
    outside=[e for e in entries if not e['remote'].startswith(SOURCE+'/job/')]
    write(HERE/'cleanup-inside.json',within);call('push',HERE/'cleanup-inside.json','/data/local/tmp/aeii-1000-cleanup-inside.json')
    root('cp /data/local/tmp/aeii-1000-cleanup-inside.json '+SOURCE+'/job/CACHE_CLEANUP_INSIDE.json')
    program="""import hashlib,json
from pathlib import Path
items=json.loads(Path('/continue900/CACHE_CLEANUP_INSIDE.json').read_text());receipts=[]
for item in items:
 p=Path(item['chrootPath']);assert p.resolve().is_relative_to(Path('/continue900').resolve()) and not p.is_symlink()
 if not p.is_file():receipts.append({'remote':item['remote'],'status':'missing'});continue
 with p.open('rb') as s:actual=hashlib.file_digest(s,'sha256').hexdigest()
 if actual!=item['sha256']:receipts.append({'remote':item['remote'],'status':'mismatch','actual':actual});continue
 p.unlink();receipts.append({'remote':item['remote'],'status':'removed','bytes':item['bytes'],'sha256':actual})
Path('/continue900/CACHE_CLEANUP_RECEIPTS.json').write_text(json.dumps(receipts))
print(json.dumps({'removed':sum(r['status']=='removed' for r in receipts),'mismatches':sum(r['status']=='mismatch' for r in receipts)}))
"""
    runtime='/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'
    root('chroot '+runtime+' /usr/bin/python3 -c '+shlex.quote(program),timeout=120)
    receipts=read('CACHE_CLEANUP_RECEIPTS.json')
    for item in outside:
        remote=shlex.quote(item['remote']);value=root('if test -f '+remote+'; then sha256sum '+remote+'; fi')
        if not value:receipts.append({'remote':item['remote'],'status':'missing'});continue
        actual=value.split()[0]
        if actual!=item['sha256']:receipts.append({'remote':item['remote'],'status':'mismatch','actual':actual});continue
        assert item['remote'].startswith('/data/local/tmp/aeii-') and '..' not in item['remote']
        root('rm -f -- '+remote);receipts.append({'remote':item['remote'],'status':'removed','bytes':item['bytes'],'sha256':actual})
    assert root('sha256sum '+preserve).split()[0]==sync['finalCheckpointSha256']
    result={'status':'complete','checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'before':before,'after':root('df -k /data'),
        'removedFiles':sum(r['status']=='removed' for r in receipts),'removedLogicalBytes':sum(r.get('bytes',0) for r in receipts if r['status']=='removed'),
        'mismatches':[r for r in receipts if r['status']=='mismatch'],'receipts':receipts,'allDeletedFilesBackedUpAndShaVerified':True,
        'computerSourcesPreserved':True,'final1000CheckpointPreserved':True,'runtimePreserved':True,'strictReplayExecuted':False}
    write(HERE/'CACHE_CLEANUP_RESULT.json',result)
    assert not result['mismatches']
    print(json.dumps({k:v for k,v in result.items() if k!='receipts'},ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['sync','cleanup']);args=parser.parse_args();globals()[args.stage]()
