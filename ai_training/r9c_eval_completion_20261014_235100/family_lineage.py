import pathlib,sys,json,gzip,hashlib,collections
r=pathlib.Path(sys.argv[1]);b=r.parent/'r9b_commander_stage_20261014_231000';s=r.parent/'r8_pure_policy_stage_20261014_125300';p=r.parent/'r9_decision_chain_stage_20261014_225400';j=b/'joint'
load=lambda x:json.loads(x.read_text(encoding='utf-8-sig'))
def families(file):
 d={}
 for line in gzip.open(file,'rt',encoding='utf8'):
  x=json.loads(line);f=x['familyId'];v=(x['gameId'],x['mapName']);assert f not in d or d[f]==v;d[f]=v
 return d
train=families(s/'data/base_locked/train.jsonl.gz');val=families(j/'validation_remaining.jsonl.gz');assert not set(train)&set(val)
opening=load(j/'independent_dev_manifest.json')['games'];maxlen=max(len(g['prefix']) for g in opening);sources=[]
def add(name,kind,meta,trace):
 m=load(meta);opener=gzip.open if str(trace).endswith('.gz') else open;steps=[]
 with opener(trace,'rt',encoding='utf8') as f:
  for line in f:
   if '"type":"step"' not in line[:45] and '"type": "step"' not in line[:45]:continue
   x=json.loads(line);steps.append((x['beforeHash'],x['actionCode'],x['afterHash']))
   if len(steps)>=maxlen:break
 sources.append({'name':name,'kind':kind,'map':m['mapName'],'seeds':m['seeds'],'initialStateHash':m.get('initialStateHash'),'gameId':m.get('gameId'),'familyId':m.get('familyId'),'metaPath':str(meta),'metaSha256':hashlib.sha256(meta.read_bytes()).hexdigest(),'prefix':steps})
for kind,group in [('inherited_base_train',train),('remaining_validation',val)]:
 for fam,(game,mapname) in group.items():
  meta=s/'data/raw'/f'{game}.json';trace=s/'data/raw'/f'{game}.jsonl.gz';assert meta.exists() and trace.exists(),game
  m=load(meta);assert m['familyId']==fam and m['gameId']==game and m['mapName']==mapname
  add(fam,kind,meta,trace)
for arm in ['control_original','production_target']:
 for g in [4,5,18,19]:add(f'pilot/{arm}/{g}','consumed_course_parent',p/f'tiny_fit/diagnostic_games/{arm}_{g}.json',p/f'tiny_fit/diagnostic_games/{arm}_{g}.jsonl')
for g in [4,5,18,19]:add(f'R8FINAL/{g}','consumed_initial_label_ancestor',s/f'runs/final_r8/game_{g}.json',s/f'runs/final_r8/game_{g}.jsonl')
# 家族按实际父局地图、真实初态和对手随机流归并，策略变化/分支不重新命名为独立家族。
def key(x):return (x['map'],x['initialStateHash'],tuple(x['seeds']))
trainkeys={key(x) for x in sources if x['kind']!='remaining_validation'};valkeys={key(x) for x in sources if x['kind']=='remaining_validation'};assert not trainkeys&valkeys
rows=[]
for g in opening:
 prefix=[(x['beforeHash'],x['actionCode'],x['afterHash']) for x in g['prefix']];same=[x for x in sources if x['map']==g['mapName']];matches=[];common=[]
 for x in same:
  n=0
  for a,z in zip(prefix,x['prefix']):
   if a!=z:break
   n+=1
  common.append(n)
  if n==len(prefix):matches.append(x['name'])
 assert not matches,'新DEV前缀与已知训练/验证源局完整前缀一致'
 rows.append({'game':g['gameIndex'],'map':g['mapName'],'prefixSeed':g['prefixSeed'],'opponentStreams':g['seeds'],'prefixSteps':len(prefix),'sourceHistoriesCompared':len(same),'fullPrefixMatches':matches,'maxCommonPrefixSteps':max(common,default=0),'firstSharedRootIsOfficialMapFactory':True})
manifest=load(b/'chain_course_manifest.json');parentgames={x['game'] for x in manifest['paths']};assert parentgames <= {4,5,18,19}
out={'passedWithinKnownLineage':True,'baseTrainingFamilies':len(train),'remainingValidationFamilies':len(val),'familyIdIntersection':[],'trueParentKeyDefinition':'mapName|actual initialStateHash|both opponent RNG seeds; policy variants and counterfactual descendants stay with same parent','trueParentKeyIntersection':[],'rawSourcesChecked':len(sources),'courseAncestorGameIndices':sorted(parentgames),'newDevRows':rows,'newDevPrefixTraceMatchesKnownSources':0,'scopeLimitations':['All splits share official map assets and normal initial factory; no unseen-map claim.','R8 parent inherits older R7/theta1 history; full legacy V10-V19 pretraining lineage not reaudited in this20min window.','NewDEV randomized legal prefixes are a different development protocol; family checks and exact-input checks do not prove unbiased generalization.','Final confirmation files were not read or executed for this audit.'],'sources':[{k:v for k,v in x.items() if k!='prefix'} for x in sources]};(r/'family_lineage_audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print({k:v for k,v in out.items() if k not in ['sources','newDevRows','scopeLimitations']})
