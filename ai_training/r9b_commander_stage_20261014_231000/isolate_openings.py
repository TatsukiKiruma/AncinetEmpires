import pathlib,sys,json,gzip,hashlib,datetime
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';j=r/'joint';keys=set();valkeys=set()
for line in gzip.open(old/'data/base_locked/train.jsonl.gz','rt',encoding='utf8'):keys.add(json.loads(line)['inputHash'])
for line in gzip.open(old/'data/base_locked/val.jsonl.gz','rt',encoding='utf8'):valkeys.add(json.loads(line)['inputHash'])
for line in gzip.open(r/'chain_courses.jsonl.gz','rt',encoding='utf8'):keys.add(json.loads(line)['inputHash'])
prod=json.loads((r.parent/'r9_decision_chain_stage_20261014_225400/tiny_samples.json').read_text(encoding='utf8'));keys.update(s['inputHash'] for s in prod)
(r/'conservative_training_input_keys.json').write_text(json.dumps(sorted(keys)),encoding='utf8')
raw=json.loads(gzip.open(r/'opening_candidates.json.gz','rt',encoding='utf8').read());chosen=[];reject=[];seen=set()
for m in range(7):
 for seat in [0,1]:
  found=None
  for x in [x for x in raw if x['mapIndex']==m and x['candidateSeat']==seat]:
   if x['inputHash'] in keys or x['inputHash'] in valkeys or x['initialStateHash'] in seen:reject.append({'map':x['mapName'],'seat':seat,'attempt':x['attempt'],'reason':'training/old-validation input or duplicated opening'});continue
   found=x;break
  assert found is not None,'无法找到无重合DEV开局，停止'
  seen.add(found['initialStateHash']);chosen.append({'gameIndex':len(chosen),'mapName':found['mapName'],'candidateSeat':seat,'initialState':found['initialState'],'initialStateHash':found['initialStateHash'],'inputHash':found['inputHash'],'prefixSeed':found['seed'],'prefix':found['prefix'],'seeds':[3921911+m*211+seat*71,4921911+m*419+seat*97],'maxSteps':3000,'maxDecisionMs':1000,'maxWallSeconds':300})
record={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protocol':'Independent newly generated legal-prefix DEV; original DEV downgraded to consumed diagnostics for joint phase','openingCount':14,'trainingInputsConservative':len(keys),'initialInputOverlapWithTraining':0,'initialInputOverlapWithOriginalValidation':0,'uniqueInitialStateHashes':len(seen),'rejections':reject,'confirmation':'No files executed or modified; fixed official-map starts share training support in Swamplands, so strict independence cannot be assumed','contamination':{'oldDev':'Swamplands slot 4 and5 initial candidate inputs match training production examples; full old DEV consumed for development','trainingParents':'consumed R8 FINAL games4,5,18,19 and prior diagnostic model rollouts; new prefix RNG parents distinct','newOfflineValidation':'All original Swamplands validation families retired before joint gradient updates; remaining families fixed; old and new scores not directly comparable'}}
(r/'opening_isolation_audit.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8');(j/'independent_dev_manifest.json').write_text(json.dumps({'protocol':record,'games':chosen},ensure_ascii=False,indent=2),encoding='utf8');print(record)
