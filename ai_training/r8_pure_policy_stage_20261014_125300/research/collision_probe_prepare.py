"""从已隔离的交集中抽取真实状态对，分离状态差异与教师查询随机流差异。"""
import json,pathlib,gzip,re,hashlib
S=pathlib.Path(__file__).resolve().parents[1];D=S/'data/base_locked'
def read(p):return json.loads(p.read_text(encoding='utf8'))
alltargets=set(read(D/'quarantined_aliases.json'))&set(read(D/'quarantined_conflicts.json'));targets=set(sorted(alltargets)[:16]);seen={};pairs=[];pattern=re.compile(r'"inputHash":"([0-9a-f]{64})"')
def core(s):return hashlib.sha256(json.dumps({k:s['stateJson'].get(k) for k in ['currentPlayer','players','units','graves','pendingUnitId','map','ruleConfig']},sort_keys=True).encode()).hexdigest()
for file in read(D/'manifest.json')['rawFiles']:
    with gzip.open(S/'data/raw'/file,'rt',encoding='utf8') as f:
        for line in f:
            if not line.startswith('{"type":"sample"'):continue
            match=pattern.search(line)
            if not match or match[1] not in targets:continue
            s=json.loads(line)['sample'];h=s['inputHash'];c=core(s);previous=seen.setdefault(h,[])
            other=next((p for pc,p in previous if pc!=c and p['targetActionIndex']!=s['targetActionIndex']),None)
            if other:pairs.append({'inputHash':h,'a':other,'b':s});targets.remove(h)
            elif not any(pc==c and p['targetActionIndex']==s['targetActionIndex'] for pc,p in previous):previous.append((c,s))
    if not targets:break
(S/'data/collision_probe_pairs.json').write_text(json.dumps(pairs,ensure_ascii=False),encoding='utf8');print({'intersection':len(alltargets),'requested':16,'pairs':len(pairs)})
