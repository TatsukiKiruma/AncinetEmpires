"""缺口输入、稀疏调度、原生载荷及有限预算静态合同；不执行游戏或回放。"""
from collections import Counter
import json
from device import OUT,ROOT,SOURCE,read,sha,write

def main():
    jobs=read(OUT/'JOBS.json')['jobs'];dispatch=read(OUT/'DISPATCH.json');plan=read(OUT/'production/PLAN.json')
    original={j['executionSequence']:j for j in read(ROOT/'ai_training/hard_curriculum3000_execution_20261027/JOBS.json')['jobs']}
    accepted=read(ROOT/'ai_training/hard_collection_pc64_v4_20261029/QUALIFIED_INDEX.json')
    assert len(jobs)==1172 and len({j['parentId'] for j in jobs})==1172
    assert not {j['parentId'] for j in jobs}&{r['parentId'] for r in accepted}
    for j in jobs:
        if j['executionSequence']<=3000:assert j==original[j['executionSequence']]
        else:
            assert j['supplementalLineage']['stateAndMapRetained'] and j['category']=='parameter_variant' and j['actualPlayerCount']==2
            assert j['seed']>=2042000001
        assert j['maxActions']==20000 and j['maxEffectiveSeconds']==21600 and j['replay']=='disabled_by_user'
    observed=dispatch['observationParents']
    assert len(observed)==42 and Counter((r['category'],r['players']) for r in observed)=={(j['category'],j['actualPlayerCount']):2 for j in jobs}
    assert [len(w['sequences']) for w in plan['workers']]==[586,586]
    config_count=0
    for w in plan['workers']:
        folder=OUT/'production'/w['workerId'];source=SOURCE/'production'/w['workerId']
        for name in ['collector.bundle.js','base-config.zip']:assert sha(folder/name)==sha(source/name)
        index=[line.split() for line in (folder/'index.txt').read_text().splitlines()]
        assert len(index)==len({r[0] for r in index})==586
        assert len({r[1] for r in index})==586
        for seq,parent,remote in index:
            cfg=read(folder/'configs'/f'{int(seq):04d}.json');j=next(j for j in jobs if j['executionSequence']==int(seq))
            assert cfg['job']==j and cfg['job']['parentId']==parent
            assert cfg['populationLimit']==j['setup']['unitLimit'] and cfg['populationCaps']==[j['setup']['unitLimit']]*6
            assert cfg['globalRoot']==plan['remoteRoot'] and cfg['taskRoot']==w['remoteRoot']
            assert cfg['replay']=='disabled_by_user' and not cfg['independentReplayDeferred']
            config_count+=1
        controller=(folder/'controller.sh').read_text(encoding='utf-8')
        assert 'if ! is_observation_parent "$SEQ"; then' in controller and 'test "$SEQ" -le 3008' in controller
        assert 'STARTED_COUNT" -ge 3' in controller and 'RUN_ORDINAL=$((STARTED_COUNT+1))' in controller
    write(OUT/'CONTRACTS.json',{'passed':True,'jobs':len(jobs),'configurations':config_count,'observationParents':42,'cells':21,'originalFrozenJobsUnchanged':1164,'newSupplementalParents':8,'sourceRuntimeUnchanged':True,'attemptLimit':3,'gameActionsExecuted':0,'replay':'disabled_by_user'})
    print(json.dumps({'passed':True,'jobs':len(jobs),'configurations':config_count,'cells':21}))

if __name__=='__main__':main()
