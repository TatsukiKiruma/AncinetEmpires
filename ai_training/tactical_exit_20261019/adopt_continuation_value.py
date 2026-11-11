"""只有独立Value候选改进且原质量门禁通过后才替换研究教师别名。"""
from pathlib import Path
import json,hashlib,shutil,pickle,datetime
HERE=Path(__file__).resolve().parent;read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
protocol=read('value-continuation-protocol.json');evaluation=read('value-continuation-fit/evaluation.json');pack=read('value-continuation-pack-gate.json')
assert evaluation['passed'] and pack['passed'] and read('value-continuation-games-gate.json')['passed']
assert evaluation['improvedSelectionScore'] and not evaluation['selectedOriginal'],'新Value没有改进，不替换教师，不启动依赖阶段'
assert sha(HERE/'teacher-model.json')==protocol['sourceModelSha256']
old=read('teacher-model.json');new=read('value-continuation-fit/selected-model.json');assert new['schema']==old['schema'] and new['weights']==old['weights'] and new['valueWeights']!=old['valueWeights']
assert sha(HERE/'value-continuation-fit/selected-model.json')==evaluation['selectedModelSha256']
phases=['opening','middle','late'];baseline=evaluation['baseline']['metrics']
for k in phases:
    m=evaluation['metrics'][k];assert m['rocAuc']>=(.9 if k=='opening' else .98) and m['rocAuc']>=baseline[k]['rocAuc']-.005 and m['brier']<=baseline[k]['brier']*1.05
    assert all(m['brier']<b[k]['brier'] for b in evaluation['baselines'].values())
for n,item in read('source-freeze-search-scale-teacher-r19-cache.json')['files'].items():assert sha(HERE.parent.parent/n)==item['sha256'],'Value拟合期间不得悄悄改变已证一致的运行时'
rev=HERE/'revisions/r20';rev.mkdir(exist_ok=False)
for n in ['teacher-model.json','teacher-value-evaluation.json','search-capacity-speed-gate.json','ACTIVE_SEARCH_PROTOCOL.json','search_prior_config.ts','browser-teacher.json','numeric-teacher.json','numeric-model-teacher.json','python-teacher.json']:
    shutil.copy2(HERE/n,rev/(n+'.before.snapshot'))
shutil.copy2(HERE/'value-continuation-fit/selected-model.json',HERE/'teacher-model.json')
with (HERE/'teacher-value-contexts.pkl').open('rb') as f:original=pickle.load(f)
with (HERE/'value-continuations.pkl').open('rb') as f:extra=pickle.load(f)
trainParents={r['parent'] for r in original['train']}|{r['parent'] for r in extra['rows'] if r['valueSplit']=='train'}
current=dict(evaluation,trainRows=evaluation['originalTrainRows']+evaluation['continuationTrainRows'],devRows=evaluation['originalDevRows'],trainParents=len(trainParents),devParents=len({r['parent'] for r in original['validation']}),auxValidationParents=pack['auxValidationParents'],source='value-continuation-fit/evaluation.json',originalSourceModelSha256=protocol['sourceModelSha256'],modelSha256=sha(HERE/'teacher-model.json'))
(HERE/'teacher-value-evaluation.json').write_text(json.dumps(current,ensure_ascii=False),encoding='utf-8')
binding=dict(passed=True,originalModelSha256=protocol['sourceModelSha256'],teacherModelSha256=sha(HERE/'teacher-model.json'),evaluationSha256=sha(HERE/'value-continuation-fit/evaluation.json'),packGateSha256=sha(HERE/'value-continuation-pack-gate.json'),gamesGateSha256=sha(HERE/'value-continuation-games-gate.json'),protocolSha256=sha(HERE/'value-continuation-protocol.json'),policyWeightsAndSchemaExact=True,valueOnlyChanged=True,originalQualityGatesUnchanged=True,expertPolicySamples=0)
(HERE/'value-continuation-adoption.json').write_text(json.dumps(binding),encoding='utf-8')
active=read('search_scale_protocol_v5.json');active.update(version='search-scale-v8-continuation-value',candidateCollectionTag='teacher-r20',registeredAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),executeAfter='R18完整150槽失败、R19性能一致性与三端通过、40局普通Value续弈strict及Value独立选模通过',purpose='冻结阶段4Policy，使用续弈自然结局改进Value；重新校准叶子排序，再以原完整面板验收',rootPolicyForTeacher='阶段4e93a212f策略与组偏置完全冻结，Value为value-continuation-adoption.json中已验证候选',teacherModelSha256=binding['teacherModelSha256'],performanceCacheProof=dict(path='source-freeze-search-scale-teacher-r19-cache.json',sha256=sha(HERE/'source-freeze-search-scale-teacher-r19-cache.json'),candidateExactGateSha256=sha(HERE/'revisions/r19/candidate-scalars-exact.json'),fullWitnessExactGateSha256=sha(HERE/'revisions/r19/cache-full-witness-gate.json')),valueAdoptionSha256=sha(HERE/'value-continuation-adoption.json'),valueUnchanged=False,rootPolicyUnchanged=True,qualification='全部固定30与扩展20每臂共150槽，原胜率、原全步/根p95<=600及零决策/墙钟超时；总胜超过纯策略；不提前停槽')
active['rootProposal']['valueUnchangedByProposal']=True
(HERE/'search_scale_protocol_v8_value_continuation.json').write_text(json.dumps(active,ensure_ascii=False,indent=2),encoding='utf-8');(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path='search_scale_protocol_v8_value_continuation.json')),encoding='utf-8')
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='新Value候选已过原质量与保持门槛；等待新教师三端、1557根校准和完整面板；专家0'),ensure_ascii=False),encoding='utf-8');print(json.dumps(binding))
