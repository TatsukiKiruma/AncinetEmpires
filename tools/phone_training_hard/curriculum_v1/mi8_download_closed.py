"""小米只读取回已闭合成功局，文件核验不执行回放。"""
from pathlib import Path
from collections import Counter,defaultdict
import datetime as dt
import hashlib
import json
import subprocess
import tarfile
from device import OUT,REMOTE,ADB,DEVICE,root
from artifact_integrity import verify

def main():
    dest=OUT/('mi8-audit-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));dest.mkdir()
    plan=json.loads((OUT/'mi8-v1/PLAN.json').read_text(encoding='utf-8'))
    jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs'];rows=[]
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    (dest/'PHONE_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    for w in plan['workers']:
        wid=w['workerId'];ledger=root('cat '+w['remoteRoot']+'/completed.tsv')
        (dest/(wid+'-completed.tsv')).write_text(ledger+'\n',encoding='utf-8')
        entries=[line.split('\t') for line in ledger.splitlines() if line.strip()]
        names=[v[2] for v in entries]
        archive=dest/(wid+'-success.tar');base='/data/user/0/'+w['package']+'/files/.aeii-hard-production'
        with archive.open('xb') as stream:
            p=subprocess.run([ADB,'-s',DEVICE,'exec-out',"su -c 'tar -C "+base+" -cf - -T -'"],input=('\n'.join(names)+'\n').encode(),stdout=stream,stderr=subprocess.PIPE,timeout=1200)
        assert p.returncode==0,p.stderr
        folder=dest/(wid+'-success');folder.mkdir()
        with tarfile.open(archive) as tar:
            for m in tar:
                assert not m.name.startswith('/') and '..' not in Path(m.name).parts
                if m.isfile():
                    path=folder/m.name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(tar.extractfile(m).read())
                else:assert m.isdir()
        for seq,parent,attempt,epoch in entries:
            job=jobs[int(seq)-1];assert job['parentId']==parent
            rows.append(verify(folder/attempt,job))
        print(wid,'已下载核验',len(entries),flush=True)
    assert len(rows)==len({r['parentId'] for r in rows})
    groups=defaultdict(list)
    for r in rows:groups[r['trajectorySha256']].append(r['parentId'])
    result={'device':DEVICE,'syncedNaturalParents':len(rows),'actions':sum(r['actions'] for r in rows),'rows':rows,'byCategory':dict(Counter(r['category'] for r in rows)),'byPlayers':dict(Counter(r['players'] for r in rows)),'duplicateTrajectoryGroups':[g for g in groups.values() if len(g)>1],'replay':False,'training':False,'collectionStarted':False}
    (dest/'INDEX.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    (dest/'ARCHIVE_SHA256.json').write_text(json.dumps({p.name:hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in dest.glob('*.tar')},indent=2),encoding='utf-8')
    print(json.dumps({'path':str(dest),'naturalParents':len(rows),'actions':result['actions']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
