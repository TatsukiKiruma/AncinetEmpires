"""同一模型及根输入下，只允许已枚举安全完结改善完整叶子。"""
from pathlib import Path
import json,gzip,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r21'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda tag,i:list(map(json.loads,gzip.open(HERE/f'search-scale/{tag}-{i}.jsonl.gz','rt',encoding='utf-8')))
roots=0;unchanged=0;changes=[];earlyWins=[];lanes=[]
for lane in range(4):
    before,after=load('teacher-r20',lane),load('teacher-r21',lane);assert len(before)==len(after)
    for a,b in zip(before,after):
        roots+=1;assert {k:v for k,v in a.items() if k not in ['candidates','rankingMode']}=={k:v for k,v in b.items() if k not in ['candidates','rankingMode']},'根输入、标签、分区及默认策略必须完全相同'
        ac={v['code']:v for v in a['candidates']};bc={v['code']:v for v in b['candidates']}
        if ac.keys()!=bc.keys():
            assert bc.keys()<=ac.keys() and len(bc)==1 and b['preferred'] in bc and bc[b['preferred']]['naturalWin'],'只允许默认连动发现自然获胜后提前返回'
            earlyWins.append(b['id'])
        for code,y in bc.items():
            x=ac[code];assert x['index']==y['index'] and x['confidence']==y['confidence'],'根先验和顺序不变'
            if x==y:unchanged+=1;continue
            assert y['complete'] and y['riskKnown'] and not y['actorLethal'] and not y['commanderLethal'],'新增替换必须是完整且已知非致死'
            assert y['score']>x['score']+1e-10 and y['tactical']>=x['tactical']-.15,'保持完整叶子和净收益原条件'
            changes.append(dict(id=b['id'],code=code,before=x,after=y))
    lanes.append(dict(lane=lane,roots=len(before),beforeSha256=sha(HERE/f'search-scale/teacher-r20-{lane}.jsonl.gz'),afterSha256=sha(HERE/f'search-scale/teacher-r21-{lane}.jsonl.gz')))
assert roots==1557
proof=dict(passed=True,roots=roots,allRecordsExact=not changes and not earlyWins,sameUnitCompletionChange=True,rootInputAndPrimaryExact=True,rootCoverageExact=not earlyWins,policyConfidenceExact=True,unchangedCandidates=unchanged,changedPhysicalLeaves=len(changes),primaryNaturalWinEarlyReturns=earlyWins,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),recoverySha256=sha(HERE/'completion_recovery.ts'),proposalModelSha256=sha(HERE/'base-policy-final.json'),proposalSourceSha256=sha(HERE/'candidate_proposal.ts'),teacherModelSha256=sha(HERE/'teacher-model.json'),lanes=lanes,scope='纯性能分支已有1557根完整一致性证明；当前新增物理叶子必须安全、完整且严格提高叶子分，不伪称原候选矩阵完全相同')
(REV/'safe-completion-physical-leaf-changes.json').write_text(json.dumps(changes,ensure_ascii=False),encoding='utf-8');(REV/'candidate-scalars-exact.json').write_text(json.dumps(proof,ensure_ascii=False),encoding='utf-8');print(proof)
