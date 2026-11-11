"""离线查找被统一非致死过滤排除的低军力正净交换；不据此直接改门禁。"""
from pathlib import Path
import json,gzip,sys,collections
HERE=Path(__file__).resolve().parent;phase=sys.argv[1];examples=[];counts=collections.Counter()
for folder in sorted((HERE/(phase+'-battles')/'slots').glob('*teacher_search*')):
    if not (folder/'result.json').exists():continue
    with gzip.open(folder/'actions.jsonl.gz','rt',encoding='utf-8') as f:
        for line in f:
            row=json.loads(line);s=row.get('search')
            if not s or not s.get('traces'):continue
            primary=next((v for v in s['traces'] if v['action'].get('type') and v.get('policyConfidence')==0),None)
            if not primary:continue
            for v in s['traces']:
                if v['action']==row['action'] or not v['complete'] or not v['riskKnown'] or v['commanderLethal'] or not v['actorLethal'] or v['highValueActor']:continue
                risk=next((r for r in v['risks'] if r['id']==v.get('actor')),None);future=0 if v['actorLost'] else (risk['army']/1024 if risk else float('inf'));net=v['net']-future
                if net<=0:continue
                hard=v['enemyCommanderKills']>primary['enemyCommanderKills'] or v['enemyCastlesCaptured']>primary['enemyCastlesCaptured']
                significant=net>=primary['net'] and v['tactical']>primary['tactical']+.12 and v.get('rankScore',v['score'])>primary.get('rankScore',primary['score'])+.03
                counts['positiveFullyCharged']+=1
                if not (hard or significant):continue
                counts['otherwiseTakeoverEligible']+=1
                if len(examples)<12:examples.append(dict(slot=folder.name,macro=row['i'],beforeHash=row['beforeHash'],default=s['preferred'],selected=row['code'],reason=s['reason'],fullyChargedNet=net,hardEvent=hard,significant=significant,trace=v,primary=primary))
out=HERE/(phase+'-missed-exchanges.json');out.write_text(json.dumps(dict(exploratory=True,counts=counts,examples=examples),ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(exploratory=True,counts=counts,file=out.name),ensure_ascii=False))
