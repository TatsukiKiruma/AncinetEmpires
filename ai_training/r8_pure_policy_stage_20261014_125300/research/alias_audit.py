"""检查相同网络输入对应的状态差异，不把身份差异自动当作决策别名。"""
import json,pathlib,collections
from curate import rows
S=pathlib.Path(__file__).resolve().parents[1]
targets=set(json.loads((S/'data/pilot_snapshot/quarantined_aliases.json').read_text(encoding='utf8'))[:30]);seen={};pairs=[]
def diff(a,b,p=''):
    if type(a)!=type(b):return [p]
    if isinstance(a,dict):return sum([diff(a.get(k),b.get(k),p+'.'+k) for k in a.keys()|b.keys()],[])
    if isinstance(a,list):
        if len(a)!=len(b):return [p+'.length']
        return sum([diff(x,y,p+f'[{i}]') for i,(x,y) in enumerate(zip(a,b))],[])
    return [] if a==b else [p]
files=[S/'data/raw'/name for name in json.loads((S/'data/pilot_snapshot/manifest.json').read_text(encoding='utf8'))['rawFiles']]
for p,s in rows(files):
    h=s['inputHash']
    if h not in targets:continue
    if h not in seen:seen[h]=s;continue
    d=diff(seen[h]['stateJson'],s['stateJson'])
    if d:
        pairs.append({'inputHash':h,'first':[seen[h]['gameId'],seen[h]['stepIndex']],'second':[s['gameId'],s['stepIndex']],'differentPaths':d,'legalCodesEqual':seen[h]['actionCodes']==s['actionCodes'],'teacherTargetEqual':seen[h]['targetActionIndex']==s['targetActionIndex']});targets.remove(h)
    if not targets:break
out={'pairs':pairs,'interpretation':'仅列原始差分，需结合权威规则判断；所有此类输入已保守隔离。'}
(S/'evidence/alias_audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pairs':len(pairs),'paths':dict(collections.Counter(p for r in pairs for p in r['differentPaths']))},ensure_ascii=False))
