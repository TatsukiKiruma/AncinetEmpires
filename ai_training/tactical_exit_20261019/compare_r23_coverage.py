"""只允许替换最后一个补充根，共同候选全部物理字段精确一致。"""
from pathlib import Path
import gzip,json,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r23'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda tag,i:list(map(json.loads,gzip.open(HERE/f'search-scale/{tag}-{i}.jsonl.gz','rt',encoding='utf-8')))
roots=common=0;changes=[];lanes=[]
for lane in range(4):
    before,after=load('teacher-r22',lane),load('teacher-r23',lane);assert len(before)==len(after)
    for a,b in zip(before,after):
        roots+=1;assert {k:v for k,v in a.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in b.items() if k not in ['candidates','rankingMode']}
        ac={v['code']:v for v in a['candidates']};bc={v['code']:v for v in b['candidates']}
        assert [v['code'] for v in a['candidates'][:6]]==[v['code'] for v in b['candidates'][:6]],'原六根必须完整保留'
        for code in ac.keys()&bc.keys():assert ac[code]==bc[code],(b['id'],code);common+=1
        added=bc.keys()-ac.keys();removed=ac.keys()-bc.keys();assert len(added)==len(removed)<=1
        if added:
            assert b['preferred'].startswith(('wait:','end_turn')) and all(v.startswith('recruit_to_castle:') for v in added)
            assert list(bc)[-1] in added and list(ac)[-1] in removed and len(bc)<=12
            changes.append(dict(id=b['id'],added=[bc[v] for v in added],removed=[ac[v] for v in removed]))
    lanes.append(dict(lane=lane,roots=len(before),beforeSha256=sha(HERE/f'search-scale/teacher-r22-{lane}.jsonl.gz'),afterSha256=sha(HERE/f'search-scale/teacher-r23-{lane}.jsonl.gz')))
assert roots==1557
proof=dict(passed=True,roots=roots,allRecordsExact=not changes,sameUnitCompletionChange=False,safeCompletionBehaviorUnchanged=True,safeRecruitmentCoverageChange=True,rootInputAndPrimaryExact=True,rootCoverageExact=not changes,policyConfidenceExact=True,originalSixPreserved=True,commonCandidatesExact=common,changedCoverageRoots=len(changes),changedPhysicalLeaves=0,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),coverageSha256=sha(HERE/'safe_recruitment_coverage.ts'),proposalModelSha256=sha(HERE/'base-policy-final.json'),proposalSourceSha256=sha(HERE/'candidate_proposal.ts'),teacherModelSha256=sha(HERE/'teacher-model.json'),lanes=lanes,scope='只补最高先验安全生产性空城招募，共同候选物理字段全同，原六根/Top12/24/300不变')
for name,value in [('safe-recruitment-coverage-changes.json',changes),('candidate-scalars-exact.json',proof)]:
    with (REV/name).open('x',encoding='utf-8') as out:json.dump(value,out,ensure_ascii=False)
print(json.dumps(proof,ensure_ascii=False))
