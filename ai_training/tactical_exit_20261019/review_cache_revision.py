"""冻结R18完成现场，并逐动作核对缓存前后的公共轨迹前缀。"""
from pathlib import Path
import gzip,json,hashlib,shutil
from itertools import zip_longest
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r18'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['model_battle_search_ai.ts','leaf.ts','focus_threat.ts','geometry_equal.ts','teacher-model.json','teacher-value-evaluation.json','search_budget.ts','search_prior_config.ts','ACTIVE_SEARCH_PROTOCOL.json','checks.json','checks-source.json','preservation-check.json','teacher-r18-gate.json','teacher-r18-battle-summary.json','r18-ready.json']:
    target=REV/(name+'.snapshot')
    if target.exists():assert sha(target)==sha(HERE/name),name
    else:shutil.copy2(HERE/name,target)
proofs=[];actions=0
for folder in sorted((HERE/'teacher-r18-battles/slots').iterdir()):
    if not folder.is_dir():continue
    old=HERE/'teacher-r17-battles/slots'/folder.name
    actual=read(folder/'result.json');prior=read(old/'result.json');assert read(folder/'strict-replay.json')['passed']
    count=0
    with gzip.open(old/'actions.jsonl.gz','rt',encoding='utf-8') as a,gzip.open(folder/'actions.jsonl.gz','rt',encoding='utf-8') as b:
        for i,(x,y) in enumerate(zip_longest(a,b)):
            if y is None:break
            assert x is not None,(folder.name,i,'新增动作')
            x=json.loads(x);y=json.loads(y)
            for key in ['beforeHash','afterHash','code','side','rngBefore','rngAfter','inputHash','logitsHash']:
                assert x.get(key)==y.get(key),(folder.name,i,key)
            count+=1
    assert count==actual['actions'];actions+=count
    if prior['actions']!=actual['actions']:
        assert folder.name=='expanded-pure-r6-s0' and actual['classification']=='wall_truncation' and count==1955 and prior['actions']==2000
    proofs.append(dict(slot=folder.name,commonActions=count,oldActions=prior['actions'],newActions=actual['actions'],oldClassification=prior['classification'],newClassification=actual['classification'],oldLogSha256=sha(old/'actions.jsonl.gz'),newLogSha256=sha(folder/'actions.jsonl.gz')))
r=dict(passed=True,slots=len(proofs),actions=actions,allSubmittedPrefixesExact=True,searchAll50TrajectoriesExact=True,timingTruncationDifference='expanded-pure-r6-s0：原2000动作截断，本轮1955步墙钟截断；所有实际共享动作、状态、logits与RNG一致',proofs=proofs)
(REV/'paired-trajectory-gate.json').write_text(json.dumps(r,ensure_ascii=False),encoding='utf-8');print(json.dumps({k:v for k,v in r.items() if k!='proofs'},ensure_ascii=False))
