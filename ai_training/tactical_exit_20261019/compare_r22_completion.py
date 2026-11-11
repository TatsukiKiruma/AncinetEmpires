"""R21到R22只允许完整、安全、严格更高的部署物理叶子变化。"""
from pathlib import Path
import gzip,json,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r22'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda tag,i:list(map(json.loads,gzip.open(HERE/f'search-scale/{tag}-{i}.jsonl.gz','rt',encoding='utf-8')))
roots=0;unchanged=0;changes=[];earlyWins=[];lanes=[]
for lane in range(4):
    before,after=load('teacher-r21',lane),load('teacher-r22',lane);assert len(before)==len(after)
    for a,b in zip(before,after):
        roots+=1;assert {k:v for k,v in a.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in b.items() if k not in ['candidates','rankingMode']}
        ac={v['code']:v for v in a['candidates']};bc={v['code']:v for v in b['candidates']}
        if ac.keys()!=bc.keys():
            assert bc.keys()<=ac.keys() and len(bc)==1 and b['preferred'] in bc and bc[b['preferred']]['naturalWin'];earlyWins.append(b['id'])
        for code,y in bc.items():
            x=ac[code];assert x['index']==y['index'] and x['confidence']==y['confidence']
            if x==y:unchanged+=1;continue
            assert code.startswith('recruit_to_castle:'),'本轮只能改变空城部署叶子'
            assert y['complete'] and y['riskKnown'] and not y['actorLethal'] and not y['commanderLethal']
            assert y['score']>x['score']+1e-10 and y['tactical']>=x['tactical']-.15
            changes.append(dict(id=b['id'],code=code,before=x,after=y))
    lanes.append(dict(lane=lane,roots=len(before),beforeSha256=sha(HERE/f'search-scale/teacher-r21-{lane}.jsonl.gz'),afterSha256=sha(HERE/f'search-scale/teacher-r22-{lane}.jsonl.gz')))
assert roots==1557
proof=dict(passed=True,roots=roots,allRecordsExact=not changes and not earlyWins,sameUnitCompletionChange=True,deploymentCompletionChange=True,rootInputAndPrimaryExact=True,rootCoverageExact=not earlyWins,policyConfidenceExact=True,unchangedCandidates=unchanged,changedPhysicalLeaves=len(changes),primaryNaturalWinEarlyReturns=earlyWins,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),recoverySha256=sha(HERE/'deployment_recovery.ts'),proposalModelSha256=sha(HERE/'base-policy-final.json'),proposalSourceSha256=sha(HERE/'candidate_proposal.ts'),teacherModelSha256=sha(HERE/'teacher-model.json'),lanes=lanes,scope='只允许已执行部署分支的安全且严格更高叶子；非部署候选与根输入、先验完全相同')
for name,value in [('safe-completion-physical-leaf-changes.json',changes),('candidate-scalars-exact.json',proof)]:
    with (REV/name).open('x',encoding='utf-8') as out:json.dump(value,out,ensure_ascii=False)
print(json.dumps(proof,ensure_ascii=False))
