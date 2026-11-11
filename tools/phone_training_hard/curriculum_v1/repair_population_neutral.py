"""人口标记与中立哨兵适配，保留原尝试与原调度身份。"""
from pathlib import Path
import copy
import datetime as dt
import hashlib
import json
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import ROOT,OUT,DEPLOY,REMOTE,root,call,sha,write
from html import make_htmls

def main():
    source=OUT/'collector-v4';out=OUT/'repairs/population-neutral-v4';out.mkdir(parents=True,exist_ok=False)
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    assert state['phase']=='workers_exited' and all(not w['controllerAlive'] for w in state['workers'])
    write(out/'BEFORE.json',state)
    old=json.loads((OUT/'JOBS-pre-native-sentinel-v4.json').read_text(encoding='utf-8'))['jobs']
    jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs']
    for a,b in zip(old,jobs):
        projected=copy.deepcopy(a)
        if projected['state']:
            for building in projected['state']['buildings']:
                if building['owner']==254:building['owner']=4094
                elif building['owner']==255:building['owner']=4095
            projected['initialStateSha256']=b['initialStateSha256']
        assert projected==b,'除了原生中立哨兵之外，不应改变请求'
    html=(ROOT/'ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html').read_text(encoding='utf-8')
    htmls=make_htmls(html)
    native=(source/'native_engine.rhino.js').read_text(encoding='utf-8')+'\n'+(source/'projection.rhino.js').read_text(encoding='utf-8')
    plan=json.loads((DEPLOY/'PLAN.json').read_text(encoding='utf-8'))
    revisions=[];quarantined=[];kept=[]
    for w in plan['workers']:
        wid=w['workerId'];phone=w['remoteRoot'];local=out/wid;local.mkdir();(local/'configs').mkdir()
        assert not call('shell','pidof',w['package'],check=False)
        prior=OUT/'repairs/boolean-receipt-v3'/wid/'collector.bundle.js'
        assert root('sha256sum '+phone+'/collector.bundle.js').split()[0]==sha(prior)
        bundle=prior.read_text(encoding='utf-8')
        for key,value in [('HARD_NATIVE_SOURCE',native),('HARD_HTML_BY_CAP',htmls)]:
            pattern='const '+key+r'=(.*?);\n';assert len(re.findall(pattern,bundle))==1
            bundle=re.sub(pattern,lambda m:'const '+key+'='+json.dumps(value,ensure_ascii=True)+';\n',bundle)
        (local/'collector.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
        for seq in w['sequences']:
            cfg=json.loads((DEPLOY/wid/'configs'/f'{seq:04d}.json').read_text(encoding='utf-8'))
            cfg['job']=jobs[seq-1];cap=cfg['populationLimit'];cfg['patchHTMLSha']=hashlib.sha256(htmls[str(cap)].encode()).hexdigest();cfg['planSha256']=sha(OUT/'JOBS.json')
            write(local/'configs'/f'{seq:04d}.json',cfg)
        ledger=root('cat '+phone+'/completed.tsv',check=False);valid=[]
        for line in ledger.splitlines():
            if not line:continue
            seq,parent,attempt,epoch=line.split('\t');cfg=old[int(seq)-1]
            receipt=json.loads(root('cat /data/user/0/'+w['package']+'/files/.aeii-hard-production/'+attempt+'/initial-state-receipt.json'))
            bad=[b for b in receipt['actual']['buildings'] if b['owner'] not in [0,1,2,3,4,5,4094,4095]]
            row={'sequence':int(seq),'parentId':parent,'attemptId':attempt,'worker':wid}
            if bad:quarantined.append({**row,'reason':'invalid_native_neutral_owner','invalidBuildings':bad})
            else:valid.append(line+'\n');kept.append(row)
        (local/'completed.tsv').write_text(''.join(valid),encoding='utf-8',newline='\n')
        remote_tmp='/data/local/tmp/hc7-population-neutral-v4-'+wid
        call('push',local,remote_tmp)
        actual={p:h for h,p in (line.split(None,1) for line in root('find '+remote_tmp+' -type f -exec sha256sum {} +').splitlines())}
        assert actual=={remote_tmp+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
        archive=phone+'/history/population-neutral-v4'
        root('mkdir -p '+archive+'\nmv '+phone+'/collector.bundle.js '+archive+'/collector.bundle.js\nmv '+phone+'/configs '+archive+'/configs\nmv '+phone+'/completed.tsv '+archive+'/completed.tsv\ncp '+remote_tmp+'/collector.bundle.js '+phone+'/collector.bundle.js\ncp -R '+remote_tmp+'/configs '+phone+'/configs\ncp '+remote_tmp+'/completed.tsv '+phone+'/completed.tsv\nchown -R 0:0 '+phone+'/configs\nchmod -R go-w '+phone+'/configs\nchown 0:0 '+phone+'/collector.bundle.js '+phone+'/completed.tsv\nchmod 644 '+phone+'/collector.bundle.js '+phone+'/completed.tsv')
        for q in [q for q in quarantined if q['worker']==wid]:
            root('mv '+phone+'/DONE_SEQS/'+str(q['sequence'])+' '+archive+'/quarantined-done-'+str(q['sequence']))
        assert root('sha256sum '+phone+'/collector.bundle.js').split()[0]==sha(local/'collector.bundle.js')
        cfg_hashes=root('find '+phone+'/configs -type f -exec sha256sum {} +')
        assert {p:h for h,p in (line.split(None,1) for line in cfg_hashes.splitlines())}=={phone+'/configs/'+p.name:sha(p) for p in (local/'configs').iterdir()}
        revisions.append({'worker':wid,'bundleSha256':sha(local/'collector.bundle.js'),'configCount':500})
    root('mv '+REMOTE+'/DRAIN '+REMOTE+'/history/DRAIN-population-neutral-v4')
    write(out/'REPAIR.json',{'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'revisions':revisions,'quarantinedNaturalAttempts':quarantined,'retainedNaturalParents':kept,'sameDesignSlotAndSeed':True,'requestChangeOnly':'AEM 254/255转换为原生4094/4095','sameAttemptPrefixAndMaximumThree':True,'failedAndQuarantinedEvidencePreserved':True,'htmlChangeOnly':'TEAM_POPULATION_LIMIT与只读人口标记','replay':'disabled_by_user'})
    write(OUT/'QUARANTINED_ATTEMPTS.json',{'attempts':quarantined,'qualifiedNaturalParentsExcluded':len(quarantined),'reason':'首决策原生中立建筑归属编码不符合合同；原件保留，不准入训练'})
    root('setsid sh '+REMOTE+'/master.sh '+REMOTE+' </dev/null >'+REMOTE+'/launch-population-neutral-v4.log 2>&1 &')
    print(json.dumps({'restarted':True,'retainedNaturalParents':len(kept),'quarantinedNaturalAttempts':len(quarantined),'configsVerified':1000},ensure_ascii=False))
if __name__=='__main__':main()
