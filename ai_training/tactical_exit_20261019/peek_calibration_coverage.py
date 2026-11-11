"""只读现有候选小记录；不运行模型、不采新状态、不用于对战调参。"""
from pathlib import Path
import json,gzip,sys,collections
HERE=Path(__file__).resolve().parent;tag=sys.argv[1];counts={}
for lane in range(4):
    with gzip.open(HERE/f'search-scale/{tag}-{lane}.jsonl.gz','rt',encoding='utf-8') as f:
        for line in f:
            r=json.loads(line);c=counts.setdefault(r['split'],collections.Counter());c['roots']+=1;xs=r['candidates'];target=next((v for v in xs if v['code']==r['label']),None)
            if not xs:c['searchNotExpanded']+=1
            elif target is None:c['labelOutsideCandidates']+=1
            elif not target['complete']:c['labelIncomplete']+=1
            elif not target['riskKnown']:c['labelRiskUnknown']+=1
            elif target['commanderLethal'] or target['actorLethal']:c['labelFatal']+=1
            else:c['labelCompleteKnownSafe']+=1
            c['candidates']+=len(xs)
print(json.dumps(dict(tag=tag,rawRootsBeforeDedup=True,counts=counts),ensure_ascii=False))
