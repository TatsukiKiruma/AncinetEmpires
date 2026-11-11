"""只读配对失败与日志决策计数，作为源码缺陷定位线索。"""
from pathlib import Path
import json,gzip,sys,collections
HERE=Path(__file__).resolve().parent;phase=sys.argv[1];base=HERE/(phase+'-battles')/'slots';comparisons=[]
for folder in sorted(base.glob('*teacher_search*')):
    if not (folder/'result.json').exists():continue
    r=json.loads((folder/'result.json').read_text());other=base/folder.name.replace('teacher_search','pure')/'result.json'
    if not other.exists():continue
    p=json.loads(other.read_text());regressed=p['classification']=='natural_win' and r['classification']!='natural_win'
    if not regressed:continue
    counts=collections.Counter();changes=[];last=[]
    with gzip.open(folder/'actions.jsonl.gz','rt',encoding='utf-8') as f:
        for line in f:
            row=json.loads(line);s=row.get('search')
            if row['side']!='model' or not s:continue
            counts[s['reason']]+=1
            if s.get('changed'):
                pref=next((v for v in s.get('traces',[]) if v['index']>=0 and v['action']==row['action']),None)
                changes.append(dict(i=row['i'],beforeHash=row['beforeHash'],preferred=s['preferred'],selected=s['selected'],reason=s['reason'],selectedNet=pref.get('net') if pref else None))
            last.append(row['code']);last=last[-15:]
    final=json.loads((folder/'final.json').read_text());seat=r['slot']['seat'];own=[u for u in final['units'] if u['ownerId']==seat]
    comparisons.append(dict(slot=folder.name,search=r['classification'],pure=p['classification'],actions=r['actions'],turn=r['finalTurn'],reasons=counts,firstChanges=changes[:8],lastActions=last,ownUnits=len(own),ownClasses=collections.Counter(u['unitClass'] for u in own),enemyUnits=len(final['units'])-len(own)))
out=HERE/(phase+'-regressed-diagnostics.json');out.write_text(json.dumps(dict(exploratory=True,pairs=comparisons),ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(pairs=comparisons),ensure_ascii=False))
