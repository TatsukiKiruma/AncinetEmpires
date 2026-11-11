"""重连后取回本批已完成父局并检查文件；不启动采集、训练或重放。"""
from pathlib import Path
from collections import Counter,defaultdict
import datetime as dt
import gzip
import hashlib
import json
import re
import struct
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,DEPLOY,REMOTE,DEVICE,ADB,root,write

def json_bytes(b):return json.loads(b.decode('utf-8'))
def fetch(path,missing=False):
    assert re.fullmatch(r'/data/(?:local/tmp|user/0)/[A-Za-z0-9_./-]+',path),path
    p=subprocess.run([ADB,'-s',DEVICE,'exec-out',"su -c 'cat "+path+"'"],capture_output=True,timeout=90)
    if p.returncode:
        if missing and b'No such file' in p.stderr:return None
        raise RuntimeError(p.stderr.decode('utf-8','replace'))
    assert p.stdout,'设备返回空文件：'+path
    assert not (p.stdout.startswith(b'sh: ') and b'inaccessible or not found' in p.stdout),p.stdout.decode('utf-8','replace')
    return p.stdout
def store(path,data):
    if path.exists():
        if path.stat().st_size==0 or path.read_bytes().startswith(b'sh: cat '):
            path.rename(path.with_name(path.name+'.failed-transfer-preserved'))
            path.write_bytes(data)
            return
        assert path.read_bytes()==data,'已保存文件身份变化：'+str(path)
    else:
        temp=path.with_name(path.name+'.partial');assert not temp.exists();temp.write_bytes(data);temp.rename(path)
def verify(directory,job):
    manifest=json_bytes((directory/'artifact-manifest.json').read_bytes())
    result=json_bytes((directory/'result.json').read_bytes());receipt=json_bytes((directory/'initial-state-receipt.json').read_bytes())
    assert result['parentId']==job['parentId'] and receipt['verified'] and result['naturalEnd']
    assert result['populationLimit']==job['setup']['unitLimit']
    assert receipt['requestedInitialStateSha256']==job['initialStateSha256']
    for f in manifest['files']:
        data=(directory/f['name']).read_bytes();assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256']
    initial=receipt['actual']
    # 早期回执把空的招募列表表示成0；规范化表示后再统计轨迹，原文件保持不变。
    if 'n' in initial.get('playerArrays',{}):initial['playerArrays']['n']=[None if v==0 else v for v in initial['playerArrays']['n']]
    digest=hashlib.sha256(json.dumps(initial,sort_keys=True,separators=(',',':')).encode())
    actions=0;skills=Counter()
    with gzip.open(directory/'actions.jsonl.gz','rt',encoding='utf-8') as stream:
        for line in stream:
            value=json.loads(line);assert value['index']==actions and value['parentId']==job['parentId'] and value['attemptId']==result['attemptId']
            digest.update(json.dumps(value['fields'],sort_keys=True,separators=(',',':')).encode()+b'\n')
            skills[value['fields']['j']]+=1;actions+=1
    frames=0
    with gzip.open(directory/'states.bin.gz','rb') as stream:
        while True:
            prefix=stream.read(4)
            if not prefix:break
            assert len(prefix)==4;length=struct.unpack('>i',prefix)[0];assert 0<length<64000000
            assert len(stream.read(length))==length;frames+=1
    assert frames==actions==result['actions']
    assert sum(result['pathCounts'].values())==actions
    assert json_bytes((directory/'THREAD_EXITED.json').read_bytes())['attemptId']==result['attemptId']
    return {'executionSequence':job['executionSequence'],'parentId':job['parentId'],'attemptId':result['attemptId'],'category':job['category'],'profile':job['profile'],'players':job['actualPlayerCount'],'map':job['map'],'actions':actions,'frames':frames,'bytes':sum(p.stat().st_size for p in directory.iterdir() if p.is_file()),'effectiveSeconds':result['effectiveSeconds'],'paths':result['pathCounts'],'initialCounts':receipt['counts'],'initialPopulations':receipt['populations'],'observedPlayers':result['observedPlayers'],'skillEventCounts':dict(skills),'trajectorySha256':digest.hexdigest(),'replay':'disabled_by_user'}
def main():
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    syncroot=OUT/'sync';syncroot.mkdir(exist_ok=True);snap=syncroot/stamp;snap.mkdir()
    parents=OUT/'parents';parents.mkdir(exist_ok=True)
    plan=json.loads((DEPLOY/'PLAN.json').read_text(encoding='utf-8'));jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs']
    state=json.loads(root('cat '+REMOTE+'/STATE.json'));write(snap/'PHONE_STATE.json',state)
    rows=[];failures=[]
    for w in plan['workers']:
        wid=w['workerId'];phone=w['remoteRoot']
        ledger=root('cat '+phone+'/completed.tsv',check=False)
        (snap/(wid+'-completed.tsv')).write_text(ledger+'\n',encoding='utf-8')
        failures_text=root('cat '+phone+'/failure.tsv',check=False)
        (snap/(wid+'-failure.tsv')).write_text(failures_text+'\n',encoding='utf-8')
        for line in failures_text.splitlines():
            if not line.strip():continue
            seq,parent,attempt,why,epoch=line.split('\t');failures.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'reason':why,'epoch':int(epoch)})
        for line in ledger.splitlines():
            if not line.strip():continue
            seq,parent,attempt,epoch=line.split('\t');job=jobs[int(seq)-1]
            assert parent==job['parentId'] and re.fullmatch(r'hc7-mi8-20261027-v1-w0[01]-\d{4}-r\d{4}',attempt)
            directory=parents/parent/attempt;directory.mkdir(parents=True,exist_ok=True)
            remote=f'/data/user/0/{w["package"]}/files/.aeii-hard-production/{attempt}'
            manifest=fetch(remote+'/artifact-manifest.json');json_bytes(manifest);store(directory/'artifact-manifest.json',manifest)
            for name in [f['name'] for f in json_bytes(manifest)['files']]+['THREAD_EXITED.json','initial-state-observed.json']:
                assert re.fullmatch(r'[a-zA-Z0-9_.-]+',name)
                expected=next((f['sha256'] for f in json_bytes(manifest)['files'] if f['name']==name),None)
                local=directory/name
                if local.exists() and expected:
                    assert hashlib.sha256(local.read_bytes()).hexdigest()==expected
                else:store(local,fetch(remote+'/'+name))
            rows.append(verify(directory,job))
    assert len(rows)==len({r['parentId'] for r in rows})
    groups=defaultdict(list)
    for r in rows:groups[r['trajectorySha256']].append(r['parentId'])
    bytes_total=sum(r['bytes'] for r in rows)
    report={'device':DEVICE,'phoneSnapshotParents':state['doneParents'],'syncedNaturalParents':len(rows),'rows':rows,'failedAttempts':failures,'failuresByReason':dict(Counter(f['reason'] for f in failures)),
        'byCategory':dict(Counter(r['category'] for r in rows)),'byPlayers':dict(Counter(r['players'] for r in rows)),
        'duplicateTrajectoryGroups':[v for v in groups.values() if len(v)>1],'duplicatesNotRecollected':True,'bytes':bytes_total,
        'provisionalRemainingBytesAtObservedMean':round(bytes_total/max(1,len(rows))*(1000-len(rows))),
        'estimateQualification':'早期未覆盖全部密度，均值估算不能保证剩余空间够用；手机保留2GiB暂停门槛',
        'quarantinedAttempts':json.loads((OUT/'QUARANTINED_ATTEMPTS.json').read_text(encoding='utf-8'))['attempts'] if (OUT/'QUARANTINED_ATTEMPTS.json').exists() else [],
        'replay':'disabled_by_user','training':False,'automaticDatasetAdmission':False}
    write(snap/'INDEX.json',report)
    active=OUT/'LATEST_SYNC.json'
    if active.exists():active.rename(OUT/('LATEST_SYNC-before-'+stamp+'.json'))
    write(active,{'path':str(snap),'syncedNaturalParents':len(rows),'device':DEVICE})
    print(json.dumps({k:report[k] for k in ['syncedNaturalParents','byCategory','byPlayers','failuresByReason','bytes','provisionalRemainingBytesAtObservedMean','duplicateTrajectoryGroups']},ensure_ascii=False))
if __name__=='__main__':main()
