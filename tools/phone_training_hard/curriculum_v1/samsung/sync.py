"""重连后只读取回三星本批原始完成局，不启动、训练或重放。"""
from collections import Counter,defaultdict
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import TASK,OUT,ADB,DEVICE,shell,write
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from artifact_integrity import verify

def fetch(pkg,path):
    assert pkg in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12']
    assert re.fullmatch(r'/data/user/0/'+re.escape(pkg)+r'/files/\.aeii-hard-production/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+',path)
    p=subprocess.run([ADB,'-s',DEVICE,'exec-out','run-as '+pkg+' cat '+path],capture_output=True,timeout=90)
    assert p.returncode==0 and p.stdout,p.stderr.decode('utf-8','replace')
    assert not p.stdout.startswith(b'cat: '),p.stdout[:200]
    return p.stdout
def main():
    plan_path=OUT/'production/PLAN.json'
    if not (OUT/'production/DEPLOYED.json').exists():plan_path=OUT/'preflight/PLAN.json'
    plan=json.loads(plan_path.read_text(encoding='utf-8'));jobs=json.loads((TASK/'JOBS.json').read_text(encoding='utf-8'))['jobs']
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ');snapshot=OUT/'sync'/stamp;snapshot.mkdir(parents=True)
    state=json.loads(shell('cat '+plan['remoteRoot']+'/STATE.json'));write(snapshot/'PHONE_STATE.json',state)
    rows=[];failures=[];parents=OUT/'parents';parents.mkdir(exist_ok=True)
    for w in plan['workers']:
        ledger=shell('cat '+w['remoteRoot']+'/completed.tsv',check=False)
        (snapshot/(w['workerId']+'-completed.tsv')).write_text(ledger+'\n',encoding='utf-8')
        failure=shell('cat '+w['remoteRoot']+'/failure.tsv',check=False)
        (snapshot/(w['workerId']+'-failure.tsv')).write_text(failure+'\n',encoding='utf-8')
        for line in failure.splitlines():
            if not line.strip():continue
            seq,parent,attempt,reason,epoch=line.split('\t');failures.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'reason':reason,'epoch':int(epoch)})
        for line in ledger.splitlines():
            if not line.strip():continue
            seq,parent,attempt,epoch=line.split('\t');seq=int(seq);job=jobs[seq-1]
            assert 1001<=seq<=2000 and parent==job['parentId']
            assert re.fullmatch(r'hc7-samsung-20261028-v1-w0[01]-\d{4}-r\d{4}',attempt)
            directory=parents/parent/attempt;directory.mkdir(parents=True,exist_ok=True)
            base=f'/data/user/0/{w["package"]}/files/.aeii-hard-production/{attempt}'
            manifest=fetch(w['package'],base+'/artifact-manifest.json');m=json.loads(manifest)
            path=directory/'artifact-manifest.json'
            if path.exists():assert path.read_bytes()==manifest
            else:path.write_bytes(manifest)
            for name in [f['name'] for f in m['files']]+['THREAD_EXITED.json','initial-state-observed.json']:
                assert re.fullmatch(r'[A-Za-z0-9_.-]+',name)
                target=directory/name;entry=next((f for f in m['files'] if f['name']==name),None)
                if target.exists():
                    if entry:assert hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256']
                    continue
                data=fetch(w['package'],base+'/'+name)
                if entry:assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
                tmp=target.with_name(target.name+'.partial');assert not tmp.exists();tmp.write_bytes(data);tmp.rename(target)
            rows.append(verify(directory,job))
    assert len(rows)==len({r['parentId'] for r in rows})
    groups=defaultdict(list)
    for r in rows:groups[r['trajectorySha256']].append(r['parentId'])
    summary={'device':DEVICE,'syncedNaturalParents':len(rows),'rows':rows,'failedAttempts':failures,'failuresByReason':dict(Counter(f['reason'] for f in failures)),
        'byCategory':dict(Counter(r['category'] for r in rows)),'byPlayers':dict(Counter(r['players'] for r in rows)),
        'duplicateTrajectoryGroups':[v for v in groups.values() if len(v)>1],'bytes':sum(r['bytes'] for r in rows),'replay':'disabled_by_user','training':False}
    write(snapshot/'INDEX.json',summary)
    latest=OUT/'LATEST_SYNC.json'
    if latest.exists():latest.rename(OUT/('LATEST_SYNC-before-'+stamp+'.json'))
    write(latest,{'path':str(snapshot),'syncedNaturalParents':len(rows)})
    print(json.dumps({k:summary[k] for k in ['syncedNaturalParents','byPlayers','failuresByReason','bytes']},ensure_ascii=False))
if __name__=='__main__':main()
