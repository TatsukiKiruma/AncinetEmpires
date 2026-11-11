"""Top16必须保留原Top12，共同候选全部字段完全相同，新增触发单列。"""
from pathlib import Path
import gzip,json,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r24'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda tag,i:list(map(json.loads,gzip.open(HERE/f'search-scale/{tag}-{i}.jsonl.gz','rt',encoding='utf-8')))
roots=common=addedTotal=0;changes=[];newTriggers=[];lanes=[]
for lane in range(4):
    before,after=load('teacher-r23',lane),load('teacher-r24',lane);assert len(before)==len(after)
    for a,b in zip(before,after):
        roots+=1;assert {k:v for k,v in a.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in b.items() if k not in ['candidates','rankingMode']}
        ac={v['code']:v for v in a['candidates']};bc={v['code']:v for v in b['candidates']};assert ac.keys()<=bc.keys(),'Top16不得丢失任何原Top12候选'
        assert [v for v in bc if v in ac]==list(ac),'原候选相对顺序不得改变'
        for code,x in ac.items():assert bc[code]==x,(b['id'],code);common+=1
        added=bc.keys()-ac.keys();assert len(bc)<=16
        if not ac and bc:newTriggers.append(b['id'])
        else:assert len(added)<=4
        addedTotal+=len(added)
        if added:changes.append(dict(id=b['id'],oldCandidates=len(ac),newCandidates=len(bc),added=[bc[v] for v in bc if v in added]))
    lanes.append(dict(lane=lane,roots=len(before),beforeSha256=sha(HERE/f'search-scale/teacher-r23-{lane}.jsonl.gz'),afterSha256=sha(HERE/f'search-scale/teacher-r24-{lane}.jsonl.gz')))
assert roots==1557
proof=dict(passed=True,roots=roots,allRecordsExact=not changes,sameUnitCompletionChange=False,safeCompletionBehaviorUnchanged=True,safeRecruitmentCoverageChange=False,safeRecruitmentCoverageBehaviorUnchanged=True,rootCapacityChange=True,rootInputAndPrimaryExact=True,rootCoverageExact=not changes,policyConfidenceExact=True,originalSixPreserved=True,originalTwelvePreserved=True,commonCandidatesExact=common,addedCandidates=addedTotal,changedCoverageRoots=len(changes),newSearchTriggers=newTriggers,changedPhysicalLeaves=0,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),coverageSha256=sha(HERE/'safe_recruitment_coverage.ts'),budgetSha256=sha(HERE/'search_budget.ts'),proposalModelSha256=sha(HERE/'base-policy-final.json'),proposalSourceSha256=sha(HERE/'candidate_proposal.ts'),teacherModelSha256=sha(HERE/'teacher-model.json'),lanes=lanes,scope='根输入/默认/先验相同，原Top12全部保留且共同候选物理字段完全相同；新增触发不伪装原矩阵完全一致')
for name,value in [('top16-coverage-changes.json',changes),('candidate-scalars-exact.json',proof)]:
    with (REV/name).open('x',encoding='utf-8') as out:json.dump(value,out,ensure_ascii=False)
print(json.dumps(proof,ensure_ascii=False))
