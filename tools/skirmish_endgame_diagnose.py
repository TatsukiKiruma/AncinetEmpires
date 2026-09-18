"""按实际动作记录定位往返和反复操作，保留可回放的逐步证据。"""
import json
from pathlib import Path
from collections import Counter,defaultdict

root=Path('training_runs/endgame_20260918')
output=[]
for directory in [root/'baseline',Path('training_runs/pvp_navigation_20260918/evaluation')]:
    rows=json.loads((directory/'results.json').read_text(encoding='utf-8'))
    for row in rows:
        if not row['timeout']:continue
        episode=json.loads((directory/'episodes'/f"{row['id']}.json").read_text(encoding='utf-8'))['episode']
        positions=defaultdict(list);counts=Counter();examples=[]
        for step in episode['steps']:
            if step['turnBefore']<100:continue
            parts=step['actionCode'].split(':');kind=parts[0]
            if step['playerId']!=row['subjectId']:
                if kind=='attack' and len(parts)>2:positions[parts[2]]=[]
                continue
            counts[kind]+=1
            if len(parts)<2:continue
            actor=parts[1]
            if kind in ['move','post_attack_move']:
                destination=':'.join(parts[2:]);prior=positions[actor]
                current=dict(step=step['step'],turn=step['turnBefore'],action=step['actionCode'],position=destination)
                if len(prior)>=2 and destination==prior[-2]['position'] and destination!=prior[-1]['position']:
                    counts['movementReversals']+=1
                    if len(examples)<8:examples.append(dict(unit=actor,sequence=prior[-2:]+[current]))
                positions[actor]=(prior+[current])[-2:]
            elif kind!='wait':positions[actor]=[]
        output.append(dict(source=str(directory/'episodes'/f"{row['id']}.json"),caseId=row['caseId'],variant=row['variant'],map=row['map'],plan=row['plan'],counts=counts,examples=examples))
(root/'cycle-diagnosis.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print('diagnosed timeout episodes',len(output),'reversals',sum(x['counts']['movementReversals'] for x in output))
