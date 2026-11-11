import pathlib,json,gzip,hashlib,sys,datetime
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300';b=r.parent/'r9b_commander_stage_20261014_231000';keys=set();val=set()
for line in gzip.open(old/'data/base_locked/train.jsonl.gz','rt',encoding='utf8'):keys.add(json.loads(line)['inputHash'])
for f in [b/'joint/training/effective_courses.jsonl.gz',r/'course.jsonl.gz']:
 for line in gzip.open(f,'rt',encoding='utf8'):keys.add(json.loads(line)['inputHash'])
keys.update(s['inputHash'] for s in json.loads((r.parent/'r9_decision_chain_stage_20261014_225400/tiny_samples.json').read_text(encoding='utf-8-sig')))
for line in gzip.open(old/'data/base_locked/val.jsonl.gz','rt',encoding='utf8'):val.add(json.loads(line)['inputHash'])
previous=json.loads((b/'joint/independent_dev_manifest.json').read_text(encoding='utf-8-sig'))['games'];previousStates={s['initialStateHash'] for s in previous};previousPrefixes={tuple((t['beforeHash'],t['actionCode'],t['afterHash']) for t in s['prefix']) for s in previous};candidates=json.loads(gzip.open(r/'opening_candidates.json.gz','rt',encoding='utf8').read());chosen=[];rejected=[];used=set()
for m in range(7):
 for seat in [0,1]:
  for x in [x for x in candidates if x['mapIndex']==m and x['candidateSeat']==seat]:
   sig=tuple((t['beforeHash'],t['actionCode'],t['afterHash']) for t in x['prefix'])
   if x['inputHash'] in keys|val or x['initialStateHash'] in previousStates|used or sig in previousPrefixes:rejected.append({'map':m,'seat':seat,'attempt':x['attempt'],'reason':'Known training/validation input or consumed prefix opening'});continue
   used.add(x['initialStateHash']);seed=lambda k:int(hashlib.sha256(f'R10-dev-v1|{m}|{seat}|{k}'.encode()).hexdigest()[:8],16);chosen.append({'gameIndex':m*2+seat,'mapName':x['mapName'],'candidateSeat':seat,'initialState':x['initialState'],'initialStateHash':x['initialStateHash'],'inputHash':x['inputHash'],'prefix':x['prefix'],'prefixSeed':x['seed'],'seeds':[seed(0),seed(1)],'maxSteps':3000,'maxDecisionMs':1000,'maxWallSeconds':300});break
  else:raise RuntimeError('No isolated opening')
order=[10,11,12,13,0,1,2,3,4,5,6,7,8,9];chosen.sort(key=lambda x:order.index(x['gameIndex']));record={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'initialTrainInputOverlap':0,'originalValInputOverlap':0,'consumedOpeningMatches':0,'knownConservativeTrainingInputs':len(keys),'courseFamily':'Consumed R9b legal-prefix Duel0; all successful variants stay one training family','developmentFamilies':'New preregistered uniform-legal prefix RNG parents, actual state and trace identities saved','rejections':rejected,'noUnbiasedGeneralizationClaim':True,'legacyPretrainingLineageIncomplete':True,'confirmationUntouched':True};(r/'dev_manifest.json').write_text(json.dumps({'protocol':record,'games':chosen},ensure_ascii=False,indent=2),encoding='utf8');(r/'training_input_keys.json').write_text(json.dumps(sorted(keys)),encoding='utf8');print(record)

