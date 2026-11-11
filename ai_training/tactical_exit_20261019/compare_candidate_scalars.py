"""从两轮实际重新采集的候选小记录证明仅修改Veto守卫没有改变叶子及NN输入。"""
from pathlib import Path
import gzip,json,sys,hashlib
HERE=Path(__file__).resolve().parent;oldTag=sys.argv[1];newTag=sys.argv[2];revision=sys.argv[3];proofs=[];total=0;recordsExact=True
capacityMode=len(sys.argv)>4 and sys.argv[4]=='capacity';proposalMode=len(sys.argv)>4 and sys.argv[4] in ['proposal','capacity'];cacheMode=len(sys.argv)>4 and sys.argv[4]=='cache';valueMode=len(sys.argv)>4 and sys.argv[4]=='value';valueChanges={};physicalChanges=[];coverage=dict(changedRoots=0,addedCandidates=0,removedCandidates=0,newlyTriggeredRoots=0,retiredTriggeredRoots=0,commonCandidates=0)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for lane in range(4):
    paths=[HERE/f'search-scale/{tag}-{lane}.jsonl.gz' for tag in [oldTag,newTag]]
    records=[]
    for p in paths:
        with gzip.open(p,'rt',encoding='utf-8') as f:records.append(list(map(json.loads,f)))
    recordsExact=recordsExact and records[0]==records[1]
    if cacheMode:assert records[0]==records[1],'纯缓存优化必须保持全部根记录逐项相同'
    stripped=[[{k:v for k,v in row.items() if k!='rankingMode'} for row in rows] for rows in records]
    if valueMode:
        assert len(records[0])==len(records[1])
        for before,after in zip(records[0],records[1]):
            assert {k:v for k,v in before.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in after.items() if k not in ['candidates','rankingMode']},'Value变更不能改变根输入、原标签或默认Policy'
            old={v['code']:v for v in before['candidates']};new={v['code']:v for v in after['candidates']};assert old.keys()==new.keys(),'Value头变更不能悄悄改变根候选覆盖'
            for code in old:
                assert old[code]['confidence']==new[code]['confidence'],'Policy先验必须完全相同'
                changed=[k for k in old[code] if old[code][k]!=new[code][k]]
                for k in changed:valueChanges[k]=valueChanges.get(k,0)+1
                if any(k!='score' for k in changed):physicalChanges.append(dict(id=before['id'],code=code,before=old[code],after=new[code]))
    elif not proposalMode:assert stripped[0]==stripped[1],f'lane{lane}输入或候选矩阵与前版本不同，不能声称守卫修改不影响叶子'
    else:
        assert len(records[0])==len(records[1])
        for before,after in zip(records[0],records[1]):
            assert {k:v for k,v in before.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in after.items() if k not in ['candidates','rankingMode']},'根输入、来源、目标及默认策略必须保持相同'
            old={v['code']:v for v in before['candidates']};new={v['code']:v for v in after['candidates']}
            assert len(old)<=6 and len(new)<=(12 if capacityMode else 6)
            if old and new:
                if capacityMode:assert old.keys()<=new.keys(),'扩容必须完整保留原六根'
                else:assert len(old.keys()-new.keys())<=1 and len(new.keys()-old.keys())<=1,'提议最多替换一个原候选'
                assert before['preferred'] in new
            coverage['changedRoots']+=int(old.keys()!=new.keys());coverage['addedCandidates']+=len(new.keys()-old.keys());coverage['removedCandidates']+=len(old.keys()-new.keys());coverage['newlyTriggeredRoots']+=int(not old and bool(new));coverage['retiredTriggeredRoots']+=int(bool(old) and not new)
            for code in old.keys()&new.keys():assert old[code]==new[code],'共同候选的真实叶子、置信度及安全标记必须完全相同';coverage['commonCandidates']+=1
    total+=len(records[0]);proofs.append(dict(lane=lane,roots=len(records[0]),oldSha256=sha(paths[0]),newSha256=sha(paths[1])))
r=dict(passed=True,roots=total,allRecordsExact=recordsExact,candidateAndInputFieldsExact=not proposalMode,rootInputAndPrimaryExact=True,commonCandidateFieldsExact=True,proposalCoverage=coverage if proposalMode else None,declaredAdditionalField=None if recordsExact else '候选提议覆盖及排序域变化' if proposalMode else 'rankingMode：v2区分固定Veto域与策略融合域',oldTag=oldTag,newTag=newTag,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),lanes=proofs,scope='根输入及默认策略相同；共同候选叶子、安全与置信分完全相同，提议最多替换一个根候选，触发搜索覆盖变化单列' if proposalMode else '候选输入、覆盖、叶子分与安全标记相同；实际选择、风险元数据及明确登记的排序域字段允许改变')
if proposalMode or cacheMode or valueMode:r.update(proposalModelSha256=sha(HERE/'base-policy-final.json'),proposalSourceSha256=sha(HERE/'candidate_proposal.ts'))
if valueMode:
    r.update(candidateAndInputFieldsExact=False,commonCandidateFieldsExact=False,valueOnlyModelChange=True,rootInputAndPrimaryExact=True,rootCoverageExact=True,policyConfidenceExact=True,changedCandidateFields=valueChanges,physicalLeafChanges=len(physicalChanges),scope='Policy输入、默认、先验及根覆盖严格一致；Value改变分数，可能改变同actor叶子选择，不声称旧叶子矩阵完全相同',modelAdoptionSha256=sha(HERE/'value-continuation-adoption.json'))
    (HERE/f'revisions/{revision}/value-physical-leaf-changes.json').write_text(json.dumps(physicalChanges,ensure_ascii=False),encoding='utf-8')
if capacityMode:r.update(originalSixPreserved=True,registeredRootLimit=12,maximumOwnNodes=300,budgetSha256=sha(HERE/'search_budget.ts'),scope='根输入及默认策略相同；原六根完整保留，共同候选叶子与安全字段相同；新增覆盖及搜索触发变化单列，Top12/24/300为新登记容量')
(HERE/f'revisions/{revision}/candidate-scalars-exact.json').write_text(json.dumps(r,ensure_ascii=False),encoding='utf-8');print(json.dumps(r,ensure_ascii=False))
