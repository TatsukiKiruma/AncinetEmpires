"""只读复核 R7 产物，结果仅写入本审核目录。"""
import json, hashlib, collections, pathlib, struct, os
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
R=ROOT/'ai_training/r7_training_stage_20261014_083500'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def ih(s):
    h=hashlib.sha256()
    def floats(a): h.update(struct.pack('<'+'f'*len(a),*a))
    floats(s['spatial']); floats(s['global'])
    h.update(f"candidates:{len(s['candidateActorCoords'])};".encode())
    for a,l,t,v in zip(s['candidateActorCoords'],s['candidateLandingCoords'],s['candidateTargetCoords'],s['candidateSemantics']):
        h.update(f'[{a[0]},{a[1]}][{l[0]},{l[1]}][{t[0]},{t[1]}]:'.encode()); floats(v)
    return h.hexdigest()
result={}; sets={}; games={}
result['datasets']={}
for name in ['train_samples','val_samples','dagger_samples','round2_train_samples']:
    p=R/f'artifacts/data/{name}.jsonl'; counts=collections.Counter(); acts=collections.Counter(); hashes=[]; gs=set(); bad=[]
    for i,line in enumerate(p.open(encoding='utf-8')):
        s=json.loads(line); counts[s['mapName']]+=1; gs.add(s['gameId']); hashes.append(s['inputHash'])
        sem=s['candidateSemantics'][s['targetActionIndex']]; acts[str(sem[:14].index(max(sem[:14])))]+=1
        # 每文件系统抽样校验真实浮点字节哈希，所有行仍检查记录指纹。
        if i%100==0 and ih(s)!=s['inputHash']: bad.append(i)
    sets[name]=set(hashes); games[name]=gs
    result['datasets'][name]={'rows':len(hashes),'uniqueRecordedInputs':len(set(hashes)),'games':len(gs),'maps':dict(counts),'targetTypeIndex':dict(acts),'sampledHashMismatches':bad,'sha256':sha(p),'bytes':p.stat().st_size}
result['overlap']={k:len(sets[k]&sets['val_samples']) for k in sets if k!='val_samples'}
result['gameOverlap']=len(games['train_samples']&games['val_samples'])
result['reports']={}; reports={}
for p in list((R/'artifacts/dev_eval').glob('*.json'))+[R/'artifacts/final_eval/final_acceptance_report.json']:
    d=read(p); rr=d['results']; reports[p.stem]=rr
    result['reports'][p.stem]={'games':len(rr),'outcomes':dict(collections.Counter(x['outcomeCategory'] for x in rr)), 'lastActions':dict(collections.Counter(x['replayTrace'][-1]['actionType'] if x['replayTrace'] else 'empty' for x in rr)), 'traceLengthErrors':[x['gameIndex'] for x in rr if len(x['replayTrace'])!=x['totalSteps']], 'seconds':sum(x['elapsedWallSeconds'] for x in rr)}
def trace(x): return tuple((s['player'],s['actionEncoded']) for s in x['replayTrace'])
d=reports['round3_enhanced_v2_best_dev_report']; f=reports['final_acceptance_report']
result['trajectoryOverlap']=[{'dev':x['gameIndex'],'final':y['gameIndex'],'steps':len(trace(x))} for x in d for y in f if x['mapName']==y['mapName'] and x['candidateSeat']==y['candidateSeat'] and trace(x)==trace(y)]
result['finalRows']=[{k:x[k] for k in ['gameIndex','mapName','candidateSeat','matchSeed','totalSteps','winner','outcomeCategory']}|{'lastAction':x['replayTrace'][-1]['actionType']} for x in f]
result['hashes']={}
for filename in ['round3_enhanced_v2_best.json','theta1_baseline.json']:
    result['hashes'][filename]=sha(R/'artifacts/models'/filename)
result['protected']=[]
for rel,v in read(R/'artifacts/protected_assets_check.json')['assets'].items():
    p=ROOT/rel; actual=sha(p) if p.is_file() else None
    result['protected'].append({'path':rel,'expected':v.get('sha256'),'actual':actual,'match':actual==v.get('sha256')})
result['frozenManifest']=[]
for rel,h in read(R/'artifacts/frozen_env_manifest.json')['files'].items():
    p=R/'env/src_game_frozen'/rel
    result['frozenManifest'].append({'path':rel,'match':sha(p)==h})
result['frozenVsCurrent']=[]
for p in (R/'env/src_game_frozen').rglob('*'):
    if p.is_file():
        q=ROOT/'src/game'/p.relative_to(R/'env/src_game_frozen')
        result['frozenVsCurrent'].append({'path':str(p.relative_to(R/'env/src_game_frozen')),'match':q.is_file() and sha(p)==sha(q)})
py=read(R/'artifacts/py_predictions.json'); ts=read(R/'artifacts/ts_predictions.json')
result['savedParity']={'states':len(py),'maxLogitError':max(abs(a-b) for p,t in zip(py,ts) for a,b in zip(p['actionLogits'],t['actionLogits'])),'maxValueError':max(abs(p['value']-t['value']) for p,t in zip(py,ts)),'argmaxMatches':sum(p['argmaxIndex']==t['argmaxIndex'] for p,t in zip(py,ts))}
fixture=read(R/'artifacts/parity_fixture_100.json'); result['fixtureMaps']=dict(collections.Counter(s.get('mapName') for s in fixture))
result['ledgers']=[]
for p in (R/'artifacts/models').glob('*ledger.json'):
    l=read(p); result['ledgers'].append({k:v for k,v in l.items() if k!='records'}|{'recordCount':len(l['records']),'lastRecord':l['records'][-1]})
(OUT/'audit_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['protected','frozenManifest','frozenVsCurrent','finalRows']},ensure_ascii=False,indent=2))
print('保护清单',len(result['protected']),[x for x in result['protected'] if not x['match']])
print('冻结清单',len(result['frozenManifest']),[x for x in result['frozenManifest'] if not x['match']])
print('冻结/当前源码',len(result['frozenVsCurrent']),[x for x in result['frozenVsCurrent'] if not x['match']])
