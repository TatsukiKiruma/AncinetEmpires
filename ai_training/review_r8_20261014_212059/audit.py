"""只读产物重算，输出仅位于独立审核目录。"""
import json,pathlib,hashlib,gzip,struct,collections,re
O=pathlib.Path(__file__).resolve().parent;ROOT=O.parents[1];S=O.parent/'r8_pure_policy_stage_20261014_125300'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
cache={}
def sha(p):
 p=pathlib.Path(p);k=str(p)
 if k not in cache:
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
  cache[k]=h.hexdigest()
 return cache[k]
def ih(s):
 h=hashlib.sha256()
 for k in ['spatial','global']:h.update(struct.pack('<'+'f'*len(s[k]),*s[k]))
 h.update(f"candidates:{len(s['candidateSemantics'])};".encode())
 for a,l,t,v in zip(s['candidateActorCoords'],s['candidateLandingCoords'],s['candidateTargetCoords'],s['candidateSemantics']):
  h.update(f'[{a[0]},{a[1]}][{l[0]},{l[1]}][{t[0]},{t[1]}]:'.encode());h.update(struct.pack('<'+'f'*len(v),*v))
 return h.hexdigest()
a={'candidateSha256':sha(S/'checkpoints/r1_warm/best.json')}
a['panels']={}
for folder in (S/'runs').iterdir():
 if not folder.is_dir() or not (folder/'summary.json').is_file():continue
 rr=[read(folder/f'game_{i}.json') for i in range(20)]
 a['panels'][folder.name]={'games':len(rr),'counts':dict(collections.Counter(x['outcome'] for x in rr)),'surrender':sum(x.get('lastAction',{}).get('type')=='surrender' for x in rr),'steps':sum(x['steps'] for x in rr),'loadedModelHashes':sorted(set(x.get('loadedModelSha256') or '' for x in rr))}
final=[read(S/f'runs/final_r8/game_{i}.json') for i in range(20)];fm=read(S/'configs/final_manifest.json')['games']
a['finalManifestMatches']=all(all(x[k]==y[k] for k in ['gameIndex','slot','mapName','candidateSeat','seeds','maxSteps','maxWallSeconds','maxDecisionMs']) for x,y in zip(final,fm))
a['frozenCheck']=[]
for v in read(S/'identity/manifest.json')['files']:
 a['frozenCheck'].append({'source':v['source'],'frozen':v['frozen'],'frozenMatch':sha(S/v['frozen'])==v['frozenSha256'],'currentSourceMatch':sha(ROOT/v['source'])==v['sourceSha256']})
a['candidateFreezeMatches']={rel:sha(S/rel)==h for rel,h in read(S/'identity/candidate_freeze.json')['files'].items()}
a['protection']={'checked':0,'mismatches':[]}
for rel,v in read(S/'identity/protected_before.json')['files'].items():
 p=ROOT/rel;a['protection']['checked']+=1
 if not p.is_file() or sha(p)!=v['sha256']:a['protection']['mismatches'].append(rel)
a['delivery']={'indexed':0,'checked':0,'mismatches':[],'skipped':['tmp/venv','data/raw（仅本次未全量哈希）']}
for v in read(S/'identity/delivery_manifest.json')['files']:
 a['delivery']['indexed']+=1
 if v['path'].startswith(('tmp/venv/','data/raw/')):continue
 p=S/v['path'];a['delivery']['checked']+=1
 if not p.is_file() or sha(p)!=v['sha256']:a['delivery']['mismatches'].append(v['path'])
a['training']=[]
configs={}
for name in ['r1_warm','r1_scratch','r2_dagger','r3_balanced','r1_warm_s2026']:
 D=S/'checkpoints'/name;c=read(D/'config.json');configs[name]=c;rows=[json.loads(x) for x in (D/'ledger.jsonl').read_text().splitlines()]
 a['training'].append({'name':name,'ledgerRecords':len(rows),'lastUpdate':rows[-1]['update'],'dataHashMatches':sha(c['train'])==c['trainSha256'] and sha(c['val'])==c['valSha256'],'sourceMatches':sha(S/'research'/c.get('trainer','train.py'))==c['sourceSha256']['train'] and sha(S/'research/model.py')==c['sourceSha256']['model'],'initHashMatches':not c.get('init') or sha(ROOT/c['init'])==c['initSha256'] if not pathlib.Path(c.get('init') or '').is_absolute() else sha(c['init'])==c['initSha256'],'lastMetrics':rows[-1]})
a['secondSeedDiff']={k:[configs['r1_warm'].get(k),configs['r1_warm_s2026'].get(k)] for k in set(configs['r1_warm'])|set(configs['r1_warm_s2026']) if configs['r1_warm'].get(k)!=configs['r1_warm_s2026'].get(k)}
fixture=read(S/'data/parity_fixture.json');a['parityFixtureMaps']=dict(collections.Counter(x['mapName'] for x in fixture));a['savedParity']=[]
for name in configs:
 h=sha(S/f'checkpoints/{name}/best.json');p=read(S/f'evidence/parity_py_{h}.json');r=read(S/f'evidence/parity_{h}.json')
 a['savedParity'].append({'name':name,'states':len(p),'reportStates':r['states'],'maxLogitError':max(x['logitError'] for x in r['rows']),'argmaxMatches':sum(x['argmaxMatch'] for x in r['rows']),'reportPassed':r['passed'],'inputHashMatches':all(x['inputHash']==s['inputHash'] and x['actionCodes']==s['actionCodes'] for x,s in zip(p,fixture))})
a['datasets']={};sets={};families={}
for name,rel in [('base_train','data/base_locked/train.jsonl.gz'),('val','data/base_locked/val.jsonl.gz'),('dagger_train','data/dagger_locked/train.jsonl.gz')]:
 p=S/rel;hs=set();fs=set();maps=collections.Counter();seats=collections.Counter();n=0;bad=[];hashChecked=0;labels=0
 with gzip.open(p,'rt',encoding='utf8') as f:
  for line in f:
   s=json.loads(line);n+=1;hs.add(s['inputHash']);fs.add(s['familyId']);maps[s['mapName']]+=1;seats[(s['mapName'],s['playerId'])]+=1
   if n%100==1:
    hashChecked+=1
    if ih(s)!=s['inputHash']:bad.append(n)
   if len(s['actionCodes'])!=len(s['candidateSemantics']) or not 0<=s['targetActionIndex']<len(s['actionCodes']):labels+=1
 sets[name]=hs;families[name]=fs
 a['datasets'][name]={'rows':n,'uniqueRecordedInputs':len(hs),'families':len(fs),'maps':dict(maps),'seatCounts':{f'{m}|{seat}':v for (m,seat),v in seats.items()},'hashChecked':hashChecked,'hashMismatches':bad,'labelShapeErrors':labels,'sha256':sha(p)}
a['overlap']={'baseValInputs':len(sets['base_train']&sets['val']),'daggerValInputs':len(sets['dagger_train']&sets['val']),'baseValFamilies':len(families['base_train']&families['val']),'daggerValFamilies':len(families['dagger_train']&families['val']),'baseRetainedInDagger':len(sets['base_train']&sets['dagger_train'])}
(O/'audit_results.json').write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in a.items() if k not in ['frozenCheck','training','candidateFreezeMatches','datasets']},ensure_ascii=False,indent=2))
print(json.dumps(a['datasets'],ensure_ascii=False,indent=2))
