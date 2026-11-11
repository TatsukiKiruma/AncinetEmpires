import pathlib,sys,json,gzip,shutil,datetime
r=pathlib.Path(sys.argv[1]);old=r.parent/'r8_pure_policy_stage_20261014_125300'
reports=[json.loads((r/f'eval_results_{a}.json').read_text()) for a in ['frozen_anchor','replay_control','safety_course']];wins=[x['counts'].get('natural_win',0) for x in reports]
if wins[2]>max(wins[:2]):raise SystemExit('已有自然胜收益，禁止启动数据修订分支，转冻结确认')
j=r/'joint';j.mkdir(exist_ok=False)
val=[json.loads(s) for s in gzip.open(old/'data/base_locked/val.jsonl.gz','rt',encoding='utf8')];retiredFamilies={s['familyId'] for s in val if 'Swamplands' in s.get('mapName','')};assert len(retiredFamilies)>0
kept=[s for s in val if s['familyId'] not in retiredFamilies];retired=[s for s in val if s['familyId'] in retiredFamilies];assert len(kept)>6000 and len(retired)>0
with gzip.open(j/'validation_remaining.jsonl.gz','wt',encoding='utf8') as f:
 for s in kept:f.write(json.dumps(s)+'\n')
with gzip.open(j/'retired_validation_consumed_for_training.jsonl.gz','wt',encoding='utf8') as f:
 for s in retired:f.write(json.dumps(s)+'\n')
(j/'earlier').mkdir();shutil.copyfile(r/'chain_courses.jsonl.gz',j/'courses.jsonl.gz');gzip.open(j/'earlier/courses.jsonl.gz','wt',encoding='utf8').write('')
p=json.loads((r/'batch_protocol.json').read_text(encoding='utf-8-sig'));p['jointAmendment']={'beforeGradientUpdate':True,'reason':'Safety labels fit9/9 but initial production inputs quarantined; test joint support instead of increasing same safety updates','retiredValFamilies':sorted(retiredFamilies),'retiredValRows':len(retired),'remainingValRows':len(kept),'validationCoverageGap':'Swamplands removed from offline validation; DEV and reserved confirmation still seven maps','retiredDataNeverAgainIndependentValidation':True,'sameParentAndBudget':True,'reservedConfirmationUnconsumed':True,'maximumFurtherRounds':1};(j/'batch_protocol.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf8')
code=(r/'train_safety_v2.py').read_text(encoding='utf-8-sig').replace("old=r.parent/'r8_pure_policy_stage_20261014_125300';prior=r.parent/'r9_decision_chain_stage_20261014_225400'","old=r.parents[1]/'r8_pure_policy_stage_20261014_125300';prior=r.parents[1]/'r9_decision_chain_stage_20261014_225400'").replace("valpath=old/'data/base_locked/val.jsonl.gz'","valpath=r/'validation_remaining.jsonl.gz'")
code=code.replace(';d=out/arm;d.mkdir();logs=[];t0=time.monotonic()', ";rootT=[courseT[i] for i,s in enumerate(course) if s.get('isRoot')];fragmentT=[courseT[i] for i,s in enumerate(course) if not s.get('isRoot')];assert rootT and fragmentT;d=out/arm;d.mkdir();logs=[];t0=time.monotonic()").replace('random.choices(courseT,k=4)','random.choices(rootT,k=2)+random.choices(fragmentT,k=2)')
(j/'train_joint.py').write_text(code,encoding='utf8')
py=(r/'parity.py').read_text(encoding='utf-8-sig').replace("old=root.parent/'r8_pure_policy_stage_20261014_125300'","old=root.parents[1]/'r8_pure_policy_stage_20261014_125300'");(j/'parity.py').write_text(py,encoding='utf8')
ts=(r/'parity.ts').read_text(encoding='utf-8-sig').replace("'../r8_pure_policy_stage_20261014_125300/","'../../r8_pure_policy_stage_20261014_125300/");(j/'parity.ts').write_text(ts,encoding='utf8')
evalcode=(r/'eval_safety.mjs').read_text(encoding='utf-8-sig').replace("'../r8_pure_policy_stage_20261014_125300/","'../../r8_pure_policy_stage_20261014_125300/");(j/'eval.mjs').write_text(evalcode,encoding='utf8');print(p['jointAmendment'])
p['createdAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();p['wallLimitSeconds']=1200;p['jointAmendment']['phaseWallLimitSeconds']=1200;p['jointAmendment']['courseSampling']='10 base + 2 production + 2 root + 2 branch continuation per update';(j/'batch_protocol.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf8')
