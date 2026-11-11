"""批量下载成功原件并静态核验、归类缺口；不执行游戏动作。"""
from pathlib import Path
from collections import Counter
import csv
import hashlib
import json
import subprocess
import sys
import tarfile
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,TASK,ADB,DEVICE,shell
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from artifact_integrity import verify

def main():
    dest=Path(sys.argv[1]);plan=json.loads((OUT/'production/PLAN.json').read_text(encoding='utf-8'))
    jobs={j['executionSequence']:j for j in json.loads((TASK/'JOBS.json').read_text(encoding='utf-8'))['jobs']}
    rows=[];gaps=[];attempts=[];inventory=[]
    for w in plan['workers']:
        wid=w['workerId'];pkg=w['package'];folder=dest/wid
        completed=[l.split('\t') for l in (folder/'completed.tsv').read_text().splitlines() if l.strip()]
        names=[r[2] for r in completed];archive=dest/(wid+'-success.tar')
        if not archive.exists():
            with archive.open('xb') as stream:
                p=subprocess.run([ADB,'-s',DEVICE,'exec-out','run-as '+pkg+' tar -C files/.aeii-hard-production -cf - '+' '.join(names)],stdout=stream,stderr=subprocess.PIPE,timeout=1200)
            assert p.returncode==0,p.stderr
        target=dest/(wid+'-success');target.mkdir(exist_ok=True)
        with tarfile.open(archive) as tar:
            for m in tar:
                assert not m.name.startswith('/') and '..' not in Path(m.name).parts
                if m.isfile():
                    path=target/m.name;path.parent.mkdir(parents=True,exist_ok=True)
                    if not path.exists():path.write_bytes(tar.extractfile(m).read())
                else:assert m.isdir()
        for seq,parent,attempt,epoch in completed:
            job=jobs[int(seq)];assert job['parentId']==parent
            rows.append(verify(target/attempt,job))
        print(wid,'verified',len(completed),flush=True)
        failures=[l.split('\t') for l in (folder/'failure.tsv').read_text().splitlines() if l.strip()]
        for seq,parent,attempt,reason,epoch in failures:
            base=dest/(wid+'-attempts')/attempt
            error=json.loads((base/'worker-error.json').read_text()) if (base/'worker-error.json').exists() else None
            state=json.loads((base/'STATE.json').read_text()) if (base/'STATE.json').exists() else None
            attempts.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'reason':reason,'epoch':int(epoch),'workerId':wid,'error':error,'state':state})
        for marker in (folder/'FINAL_SEQS').iterdir():
            seq=int(marker.name);fields=marker.read_text().strip().split('\t');job=jobs[seq]
            related=[a for a in attempts if a['sequence']==seq]
            started=list((folder/'STARTED_ATTEMPTS'/str(seq)).glob('*'))
            assert len(started)<=3
            gaps.append({'sequence':seq,'parentId':job['parentId'],'category':job['category'],'players':job['actualPlayerCount'],'map':job['map'],'terminalReason':fields[-1],'actualStarts':len(started),'attempts':related})
        # 对失败原件逐文件比较设备SHA，保留设备输出与本地核对结果。
        dirs=sorted({a[2] for a in failures});present=[d for d in dirs if (dest/(wid+'-attempts')/d).exists()]
        command='run-as '+pkg+' sh -c "cd files/.aeii-hard-production && find '+' '.join(present)+' -type f -exec sha256sum {} +"'
        output=shell(command,timeout=180)
        (dest/(wid+'-remote-sha256.txt')).write_text(output,encoding='utf-8')
        count=0
        for line in output.splitlines():
            digest,name=line.split(None,1);path=dest/(wid+'-attempts')/name
            assert path.is_file() and hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==digest,name
            count+=1
        inventory.append({'workerId':wid,'failureFilesShaVerified':count})
    assert len(rows)==679 and len({r['parentId'] for r in rows})==679
    assert len(gaps)==321 and {r['executionSequence'] for r in rows}.isdisjoint({g['sequence'] for g in gaps})
    assert {r['executionSequence'] for r in rows}|{g['sequence'] for g in gaps}==set(range(1001,2001))
    duplicates=Counter(r['trajectorySha256'] for r in rows)
    summary={'naturalParents':len(rows),'gapParents':len(gaps),'actions':sum(r['actions'] for r in rows),'bytes':sum(r['bytes'] for r in rows),'failures':len(attempts),'terminalReasons':dict(Counter(g['terminalReason'] for g in gaps)),'attemptReasons':dict(Counter(a['reason'] for a in attempts)),'gapActualStarts':dict(Counter(g['actualStarts'] for g in gaps)),'errorMessages':dict(Counter(a['error']['error'] for a in attempts if a['error'])),'errorPendingActions':dict(Counter(a['error'].get('pendingAction',{}).get('fields',{}).get('j','unknown') for a in attempts if a['error'])),'duplicateTrajectoryGroups':sum(n>1 for n in duplicates.values()),'duplicateTrajectoryExtraParents':sum(n-1 for n in duplicates.values()),'byCategory':dict(Counter(r['category'] for r in rows)),'byPlayers':dict(Counter(r['players'] for r in rows)),'failureInventory':inventory,'replay':False,'training':False,'recollection':False}
    for name,value in [('SUMMARY.json',summary),('VERIFIED_PARENTS.json',rows),('GAPS_321.json',sorted(gaps,key=lambda g:g['sequence'])),('FAILED_ATTEMPTS.json',attempts)]:
        (dest/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    with (dest/'GAPS_321.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        keys=['sequence','parentId','category','players','map','terminalReason','actualStarts'];writer=csv.DictWriter(stream,fieldnames=keys);writer.writeheader();writer.writerows({k:g[k] for k in keys} for g in sorted(gaps,key=lambda g:g['sequence']))
    print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
