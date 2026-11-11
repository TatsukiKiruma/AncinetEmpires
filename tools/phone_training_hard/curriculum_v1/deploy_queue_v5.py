"""迁移精确启动账本；未启动预留不计次数，所有已启动尝试仍计入三次上限。"""
from pathlib import Path
import json
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,DEPLOY,REMOTE,root,call,sha,write

def main():
    source=OUT/'collector-v5';out=OUT/'repairs/queue-v5';out.mkdir(parents=True,exist_ok=True)
    assert not any(out.iterdir()),'已有迁移证据，不能盲目重跑'
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    assert state['phase']=='workers_exited' and all(not w['controllerAlive'] for w in state['workers'])
    write(out/'BEFORE.json',state)
    jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs']
    cells=''.join(f'{j["executionSequence"]} {j["category"]} {j["actualPlayerCount"]}\n' for j in jobs[:21])
    mapping=out/'OBSERVATION_CELLS.tsv';mapping.write_text(cells,encoding='utf-8',newline='\n')
    call('push',mapping,'/data/local/tmp/hc7-observation-cells-v5.tsv')
    root('cp /data/local/tmp/hc7-observation-cells-v5.tsv '+REMOTE+'/OBSERVATION_CELLS.tsv\nchown 0:0 '+REMOTE+'/OBSERVATION_CELLS.tsv\nchmod 644 '+REMOTE+'/OBSERVATION_CELLS.tsv')
    plan=json.loads((DEPLOY/'PLAN.json').read_text(encoding='utf-8'))
    migration=[];unstarted=[];reopened=[];revisions=[]
    for w in plan['workers']:
        wid=w['workerId'];phone=w['remoteRoot'];local=out/wid;local.mkdir()
        assert not call('shell','pidof',w['package'],check=False)
        prior=OUT/'repairs/population-neutral-v4'/wid/'collector.bundle.js'
        assert root('sha256sum '+phone+'/collector.bundle.js').split()[0]==sha(prior)
        bundle=prior.read_text(encoding='utf-8');pattern=r'const HARD_WORKER_SOURCE=(.*?);\n';assert len(re.findall(pattern,bundle))==1
        bundle=re.sub(pattern,lambda m:'const HARD_WORKER_SOURCE='+json.dumps((source/'worker.rhino.js').read_text(encoding='utf-8'),ensure_ascii=True)+';\n',bundle)
        (local/'collector.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
        for name in ['controller.sh','queue_policy.sh']:(local/name).write_bytes((source/name).read_bytes())
        configs=root('find '+phone+'/config-run -name "*.json" -type f').splitlines()
        starts={};reserve=[]
        for config in sorted(configs):
            attempt=Path(config).stem
            match=re.fullmatch(r'hc7-mi8-20261027-v1-w0[01]-(\d{4})-r\d{4}',attempt);assert match
            seq=int(match[1]);runlog=phone+'/logs/'+attempt+'.log'
            # RUN_LOG由am start的重定向建立，即使启动失败也计一次；仅预留配置不计。
            present=root('if test -f '+runlog+'; then printf yes; fi')=='yes'
            if present:starts.setdefault(seq,[]).append(attempt)
            else:reserve.append({'sequence':seq,'attemptId':attempt,'reason':'没有am start日志，只有预留配置'})
        for seq,attempts in starts.items():
            assert len(attempts)<=3,(seq,attempts)
            target=phone+'/STARTED_ATTEMPTS/'+str(seq);root('mkdir -p '+target)
            for ordinal,attempt in enumerate(attempts,1):root('printf "%s\\n" '+str(ordinal)+' > '+target+'/'+attempt)
            migration.append({'worker':wid,'sequence':seq,'startedAttempts':attempts,'count':len(attempts)})
        unstarted+=reserve
        archive=phone+'/history/queue-v5';root('mkdir -p '+archive)
        final_files=root('find '+phone+'/FINAL_SEQS -type f').splitlines()
        for path in final_files:
            seq=int(Path(path).name);content=root('cat '+path)
            if len(starts.get(seq,[]))<3 and ('\tfailed' in content or '\texhausted' in content):
                root('mv '+path+' '+archive+'/reopened-final-'+str(seq))
                reopened.append({'worker':wid,'sequence':seq,'actualStarted':len(starts.get(seq,[])),'before':content,'remainingActualAttempts':3-len(starts.get(seq,[]))})
        staging='/data/local/tmp/hc7-queue-v5-'+wid;call('push',local,staging)
        for name in ['collector.bundle.js','controller.sh','queue_policy.sh']:
            assert root('sha256sum '+staging+'/'+name).split()[0]==sha(local/name)
            before=root('sha256sum '+phone+'/'+name).split()[0]
            root('mv '+phone+'/'+name+' '+archive+'/'+name+'\ncp '+staging+'/'+name+' '+phone+'/'+name+'\nchown 0:0 '+phone+'/'+name+'\nchmod 644 '+phone+'/'+name)
            revisions.append({'worker':wid,'file':name,'beforeSha256':before,'afterSha256':sha(local/name)})
        root('sh -n '+phone+'/controller.sh\nsh -n '+phone+'/queue_policy.sh')
    for name in ['DRAIN','OBSERVATION_FAILED']:
        root('if test -f '+REMOTE+'/'+name+'; then mv '+REMOTE+'/'+name+' '+REMOTE+'/history/'+name+'-before-queue-v5; fi')
    write(out/'REPAIR.json',{'migrated':migration,'unstartedReservations':unstarted,'reopened':reopened,'revisions':revisions,
        'actualStartLimit':3,'allocationIdMayExceedThree':True,'reason':'分配编号和实际启动次数分离，未执行的预留不消耗实际预算；不重置任何已启动尝试',
        'observation':'每格两个父局均自然完成或达到终态后，至少一局自然完成则该格通过；零自然完成的格单独暂停，其他格继续；失败与截断保留缺口',
        'replay':'disabled_by_user'})
    root('setsid sh '+REMOTE+'/master.sh '+REMOTE+' </dev/null >'+REMOTE+'/launch-queue-v5.log 2>&1 &')
    print(json.dumps({'restarted':True,'migratedParentLedgers':len(migration),'unstartedReservations':len(unstarted),'reopened':reopened,'actualStartLimit':3},ensure_ascii=False))
if __name__=='__main__':main()
