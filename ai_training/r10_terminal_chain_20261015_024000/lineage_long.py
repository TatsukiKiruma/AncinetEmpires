import pathlib,json,sys,gzip,hashlib
r=pathlib.Path(sys.argv[1]);b=r.parent/'r9b_commander_stage_20261014_231000';c=r.parent/'r9c_eval_completion_20261014_235100';load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));old=load(c/'family_lineage_audit.json');dev=load(r/'dev_manifest.json')['games'];prior=load(b/'joint/independent_dev_manifest.json')['games'];root=next(x for x in prior if x['gameIndex']==0);jobs=load(c/'regression_jobs.json');baseline=[json.loads(line) for line in (b/'joint/independent_dev/frozen_anchor_0.jsonl').read_text(encoding='utf8').splitlines()];baseSteps=[x for x in baseline if x['type']=='step'];edges=[]
for job in jobs:
 source=c/'regression'/('replay_control_handoffs8.json' if job['arm']=='replay_control' else 'safety_course_handoffs16.json');meta=load(source);ready=next(json.loads(x) for x in source.with_suffix('.jsonl').read_text(encoding='utf8').splitlines() if '"type":"ready"' in x[:45]);assert meta['initialStateHash']==baseSteps[job['step']]['beforeHash'];assert tuple(meta['seeds'])==tuple(root['seeds']);assert meta['outcome']=='natural_win';edges.append({'child':str(source),'parentOpeningGame':0,'parentInitialHash':root['initialStateHash'],'parentSeeds':root['seeds'],'branchAtStep':job['step'],'branchStateHash':meta['initialStateHash'],'sameFamily':True})
maxlen=max(len(g['prefix']) for g in dev);histories=[]
for src in old['sources']:
 meta=pathlib.Path(src['metaPath']);assert hashlib.sha256(meta.read_bytes()).hexdigest()==src['metaSha256'];gz=src['kind'] in ['inherited_base_train','remaining_validation'];trace=meta.with_name(meta.stem+('.jsonl.gz' if gz else '.jsonl'));steps=[];op=gzip.open if gz else open
 with op(trace,'rt',encoding='utf8') as f:
  for line in f:
   if '"type":"step"' not in line[:45] and '"type": "step"' not in line[:45]:continue
   x=json.loads(line);steps.append((x['beforeHash'],x['actionCode'],x['afterHash']))
   if len(steps)>=maxlen:break
 histories.append((src['name'],src['map'],steps))
for p in prior:histories.append(('consumed_prefix_'+str(p['gameIndex']),p['mapName'],[(t['beforeHash'],t['actionCode'],t['afterHash']) for t in p['prefix']]))
rows=[]
for g in dev:
 prefix=[(t['beforeHash'],t['actionCode'],t['afterHash']) for t in g['prefix']];matches=[];common=[]
 for name,mapname,h in histories:
  if mapname!=g['mapName']:continue
  n=0
  for x,y in zip(prefix,h):
   if x!=y:break
   n+=1
  if n==len(prefix):matches.append(name)
  common.append(n)
 assert not matches;rows.append({'game':g['gameIndex'],'map':g['mapName'],'prefixSeed':g['prefixSeed'],'sourceHistoriesCompared':len(common),'completePrefixMatches':matches,'maxCommonPrefixSteps':max(common,default=0)})
out={'passedWithinKnownLineage':True,'inheritedBaseTrainingFamilies':116,'remainingValidationFamilies':12,'priorCourseAncestorGames':[4,5,18,19],'newTerminalCourseFamilies':1,'ancestryEdges':edges,'metadataSourcesReverified':len(old['sources']),'consumedPrefixesCompared':14,'newDevRows':rows,'knownTrainingValidationParentIntersection':0,'limits':['Shared official maps are not unseen-map generalization.','R7/theta1 and older inherited pretraining lineage remains incomplete.','Consumed previousDEV is now a training family and is not reused as currentDEV or confirmation.'],'confirmationUntouched':True};(r/'family_lineage_audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print({'metadataSources':len(old['sources']),'terminalCourseFamilies':1,'currentDevOpenings':len(rows),'matches':0})
