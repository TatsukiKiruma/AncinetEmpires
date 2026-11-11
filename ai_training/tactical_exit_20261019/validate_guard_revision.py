"""公共引擎和编码依赖完全相同时复用其既有门禁，重新核验改变的搜索与全部检查。"""
from pathlib import Path
import json,sys,hashlib,subprocess,time,shutil,re
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;revision=sys.argv[1] if len(sys.argv)>1 else 'r6';previous=sys.argv[2] if len(sys.argv)>2 else 'r5';REV=HERE/'revisions'/revision;REV.mkdir(parents=True,exist_ok=True)
revisionNumber=int(revision.removeprefix('r'))
valueContinuation=(HERE/'value-continuation-adoption.json').exists() and revisionNumber==20
sameUnitCompletion=revisionNumber>=21
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(args,label):
    p=REV/f'{label}-{int(time.time())}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p.name
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def node(n,*a):return ['node','ai_training/run.mjs','node','tactical_exit_20261019/'+n,*a]
changed={'ai_training/tactical_exit_20261019/model_battle_search_ai.ts','ai_training/tactical_exit_20261019/audit_search_risks.ts','ai_training/tactical_exit_20261019/policy_runtime.ts'}
if revisionNumber>=11:changed|={'ai_training/tactical_exit_20261019/leaf.ts','ai_training/tactical_exit_20261019/search_prior_config.ts'}
if revisionNumber>=18:changed|={'ai_training/tactical_exit_20261019/focus_threat.ts'}
if sameUnitCompletion:
    changed|={f'src/game/{n}.ts' for n in ['engine','rules','rule_config','campaign_events']}
    changed|={f'ai_training/tactical_exit_20261019/{n}.ts' for n in ['movement_query_cache','shared_single_threat','combined_tactics','value_state']}
    assert read(f'revisions/{revision}/performance-consistency-gate.json')['passed']
    performanceExclusions=['ai_training/tactical_exit_20261019/model_battle_search_ai.ts','ai_training/tactical_exit_20261019/search_prior_config.ts']
    if revisionNumber>=24:
        performanceExclusions+=['ai_training/tactical_exit_20261019/search_budget.ts','ai_training/tactical_exit_20261019/audit_search_risks.ts']
        changed.add('ai_training/tactical_exit_20261019/search_budget.ts')
    for name,r in read('source-freeze-r21-performance-only.json')['files'].items():
        if name not in performanceExclusions:assert sha(ROOT/name)==r['sha256'],'纯性能冻结依赖改变，须重新证明'
    beforeCore=(HERE/f'revisions/{revision}/model_battle_search_ai.ts.before.snapshot').read_text(encoding='utf-8');currentCore=(HERE/'model_battle_search_ai.ts').read_text(encoding='utf-8')
    beforeBody=beforeCore[beforeCore.index('    public getAction('):];currentBody=currentCore[currentCore.index('    public getAction('):]
    if revisionNumber==23:currentBody=currentBody.replace('        indexes=coverSafeRecruitment(before,root,indexes,seedK);\n','')
    assert beforeBody==currentBody,'除登记的单次根覆盖调用外，不修改根Veto/Takeover守卫或阈值'
    assert read(f'revisions/{revision}/safe-completion-red-green-gate.json')['passed']
    if revisionNumber>=22:
        dep=read(f'revisions/{revision}/deployment-completion-final-red-green-gate.json')
        assert dep['passed'] and dep['coreSha256']==sha(HERE/'model_battle_search_ai.ts') and dep['recoverySha256']==sha(HERE/'deployment_recovery.ts')
    if revisionNumber>=23:
        coverage=read(f'revisions/{revision}/safe-recruitment-coverage-red-green-gate.json')
        assert coverage['passed'] and coverage['coreSha256']==sha(HERE/'model_battle_search_ai.ts') and coverage['coverageSha256']==sha(HERE/'safe_recruitment_coverage.ts')
    if revisionNumber>=24:
        capacity=read(f'revisions/{revision}/top16-capacity-red-green-gate.json')
        assert capacity['passed'] and capacity['coreSha256']==sha(HERE/'model_battle_search_ai.ts') and capacity['budgetSha256']==sha(HERE/'search_budget.ts') and capacity['originalTwelvePreserved']
if valueContinuation:
    changed|={'ai_training/tactical_exit_20261019/combined_tactics.ts','ai_training/tactical_exit_20261019/teacher-model.json'}
    adoption=read('value-continuation-adoption.json');assert adoption['passed'] and adoption['teacherModelSha256']==sha(HERE/'teacher-model.json')
    before=read('revisions/r20/teacher-model.json.before.snapshot');current=read('teacher-model.json');assert before['schema']==current['schema'] and before['weights']==current['weights'] and current['valueWeights']!=before['valueWeights']
    assert read('revisions/r19/candidate-scalars-exact.json')['allRecordsExact'] and read('revisions/r19/cache-full-witness-gate.json')['passed']
    for name,r in read('source-freeze-search-scale-teacher-r19-cache.json')['files'].items():
        if name!='ai_training/tactical_exit_20261019/search_prior_config.ts':assert sha(ROOT/name)==r['sha256'],'已证明一致的缓存实现身份改变'
if revisionNumber>=16:
    assert numeric_receipt_valid(HERE,'proposal') and read('proposal-reuse-gate.json')['passed']
if revisionNumber>=17:
    assert read('search-capacity-speed-gate.json')['passed'] and read('search_scale_protocol_v5.json')['searchBudget']==dict(topK=12,maxFollowNodes=24,maximumOwnNodes=300,oldTopK=6,oldMaximumOwnNodes=150,originalSixPreserved=True)
    assert read('search-capacity-speed-gate.json')['coreSha256']==sha(HERE/'model_battle_search_ai.ts') and read('search-capacity-speed-gate.json')['budgetSha256']==sha(HERE/'search_budget.ts')
frozen=read(f'source-freeze-teacher-{previous}.json')['files']
assert all(sha(ROOT/name)==r['sha256'] for name,r in frozen.items() if name not in changed),'复用范围存在其他源码变化'
if valueContinuation:assert sha(HERE/'revisions/r20/teacher-model.json.before.snapshot')==read(f'{previous}-ready.json')['teacherModelSha256']
else:assert sha(HERE/'teacher-model.json')==read(f'{previous}-ready.json')['teacherModelSha256']
if valueContinuation or sameUnitCompletion:run(ts('audit_features.ts'),'features-after-current-revision')
if sameUnitCompletion:
    for n in ['trajectory_gate.ts','movement_gate.ts','damage_gate.ts']:run(ts(n),'fresh-'+n)
reused=[]
for name in ['trajectory-gate.json','feature-audit.json','movement-gate.json','damage-gate.json']:
    if sameUnitCompletion:
        assert read(name)['passed'];shutil.copy2(HERE/name,REV/name);continue
    if revisionNumber>=18 and name=='feature-audit.json':
        assert read('feature-audit.json')['passed'];shutil.copy2(HERE/name,REV/name);continue
    source=HERE/'revisions'/previous/name;r=json.loads(source.read_text());assert r['passed'];shutil.copy2(source,REV/name);reused.append(dict(source=source.relative_to(HERE).as_posix(),sha256=sha(source)))
(REV/'reused-unchanged-engine-gates.json').write_text(json.dumps(dict(passed=True,previous=previous,allowedChangedSources=sorted(changed),unchangedSourceFiles=len(frozen)-len(changed),evidence=reused)),encoding='utf-8')
if sameUnitCompletion:
    (REV/'fresh-engine-gates.json').write_text(json.dumps(dict(passed=True,reusedOldEngineChecks=False,trajectorySteps=read('trajectory-gate.json')['steps'],files=['trajectory-gate.json','feature-audit.json','movement-gate.json','damage-gate.json'])),encoding='utf-8')
for n in ['browser-initial.json','browser-teacher.json','numeric-initial.json','numeric-teacher.json','regression-gate.json','guard-regression-gate.json','causal-real-witness-gate.json']:
    if (HERE/n).exists() and not (REV/('before-'+n)).exists():shutil.copy2(HERE/n,REV/('before-'+n))
run(node('verify_defender.mjs',revision),'defender-red-green');run(node('verify_causal.mjs',revision),'causal-red-green');run(node('verify_finish.mjs',revision),'finish-red-green')
run(node('verify_prior.mjs',revision),'prior-red-green')
productive=revisionNumber>=10;armyAccounting=revisionNumber>=11;deployment=revisionNumber>=12
if productive:
    run(node('verify_productive.mjs',revision) if deployment else node('verify_productive.mjs'),'productive-red-green')
    if deployment:run(node('verify_deployment.mjs',revision),'deployment-red-green')
    if revisionNumber>=13:
        run(node('verify_commander_health.mjs',revision),'commander-health-red-green')
        assert read(f'revisions/{revision}/candidate-scalars-exact.json')['passed']
        if revisionNumber>=16:
            comparison=read(f'revisions/{revision}/candidate-scalars-exact.json')
            assert comparison['proposalModelSha256']==sha(HERE/'base-policy-final.json') and comparison['proposalSourceSha256']==sha(HERE/'candidate_proposal.ts')
    if revisionNumber==14:run(node('verify_veto_actor.mjs',revision),'veto-actor-red-green')
    if revisionNumber>=15:run(node('verify_veto_objective.mjs',revision),'veto-objective-red-green')
    if revisionNumber>=17:run(node('verify_root_capacity.mjs',revision),'root-capacity-red-green')
    if armyAccounting:
        run(node('verify_army_risk.mjs'),'army-risk-red-green')
        active=read('ACTIVE_SEARCH_PROTOCOL.json');protocol=read(active['path']);tag=protocol.get('candidateCollectionTag','teacher-'+revision)
        calibration=read('search-scale/teacher-calibration.json');assert calibration['passed'] and calibration['collectionTag']==tag
        rebuilt=[read(f'search-scale/{tag}-{i}.receipt.json') for i in range(4)]
        assert all(r['passed'] and r['searchCoreSha256']==sha(HERE/'model_battle_search_ai.ts') and r['leafSha256']==sha(HERE/'leaf.ts') for r in rebuilt)
        assert sum(r['roots'] for r in rebuilt)==1557
        (HERE/'fresh-search-calibration-gate.json').write_text(json.dumps(dict(passed=True,roots=1557,collectionTag=tag,coreSha256=sha(HERE/'model_battle_search_ai.ts'),leafSha256=sha(HERE/'leaf.ts'),calibrationSha256=sha(HERE/'search-scale/teacher-calibration.json'),reuseRejected=revision=='r11',candidateComparison=read(f'revisions/{revision}/candidate-scalars-exact.json') if revisionNumber>=13 else None,reason='Top12容量完整保留原六根，全量重采并核验共同候选，新增覆盖与触发变化单列' if revisionNumber>=17 else '共享根编码提议改变最多一条候选覆盖，根输入和共同候选逐项核验，按登记协议全量重采校准' if revisionNumber>=16 else '风险成本改变后旧安全矩阵复用失败' if revision=='r11' else '新兵部署与实际叶子改变，主动重新采集校准' if revision=='r12' else '守卫或排序域改变，重新采集并显式核验输入及候选字段，刷新全部评测排重')),encoding='utf-8')
    else:
        matrices=[read(f'revisions/r10/candidate-reuse-{i}.json') for i in range(4)]
        assert all(r['passed'] and r['currentCoreSha256']==sha(HERE/'model_battle_search_ai.ts') and r['configSha256']==sha(HERE/'search_prior_config.ts') for r in matrices)
        assert sum(r['roots'] for r in matrices)==read('search-scale/teacher-calibration.json')['roots']==1557
        (HERE/'candidate-score-reuse-gate.json').write_text(json.dumps(dict(passed=True,roots=1557,currentCoreSha256=sha(HERE/'model_battle_search_ai.ts'),calibrationSha256=sha(HERE/'search-scale/teacher-calibration.json'),evidence=matrices)),encoding='utf-8')
else:run(node('verify_search_zero.mjs'),'search-zero')
extra=(['productive_follow_regression.ts','productive_real_witness.ts'] if productive else [])+(['army_risk_regression.ts'] if armyAccounting else [])+(['deployment_regression.ts','deployment_real_witness.ts'] if deployment else [])+(['commander_health_regression.ts'] if revisionNumber>=13 else [])+(['veto_actor_regression.ts'] if revisionNumber==14 else [])+(['veto_objective_regression.ts'] if revisionNumber>=15 else [])+(['proposal_reuse_regression.ts','metadata_compat_regression.ts'] if revisionNumber>=16 else [])
for n in ['regressions.ts','guard_regressions.ts','critical_event_regression.ts','causal_veto_regression.ts','causal_defender_regression.ts','finish_risk_regression.ts','hierarchical_prior_regression.ts','rank_score_regression.ts','finish_real_witness.ts','causal_real_witness.ts','standalone_value_parity.ts',*extra]:run(ts(n),n)
run(node('purity_gate.mjs'),'purity')
for name in ['initial','teacher']:run(ts('gates.ts',name),'numeric-'+name)
run([sys.executable,'-X','utf8',str(HERE/'run_checks.py')],'checks')
assert all(r['passed'] for r in read('checks.json') if r['name'] in ['public-lint','public-test','public-build','stage5-typecheck'])
for n in ['checks.json','regression-gate.json','guard-regression-gate.json','numeric-initial.json','numeric-teacher.json','standalone-value-parity.json','causal-real-witness-gate.json','finish-real-witness-gate.json']:shutil.copy2(HERE/n,REV/n)
core=HERE/'model_battle_search_ai.ts';old=HERE/'revisions'/previous/'model_battle_search_ai.ts.snapshot';pattern=r'this\.options=\{[^\n]+\};';stripPrior=lambda s:s.replace(',priorWeight:options.priorWeight??SEARCH_PRIOR_WEIGHT','').replace('??SEARCH_TOP_K','??6').replace('??SEARCH_FOLLOW_NODES','??24');assert stripPrior(re.search(pattern,core.read_text()).group())==stripPrior(re.search(pattern,old.read_text()).group())
proofNames=['causal-red-green-gate.json','defender-red-green-gate.json','finish-red-green-gate.json','prior-red-green-gate.json']+(['productive-red-green-gate.json'] if productive else [])+(['army-risk-red-green-gate.json'] if armyAccounting else [])+(['deployment-red-green-gate.json'] if deployment else [])+(['commander-health-red-green-gate.json'] if revisionNumber>=13 else [])+(['veto-actor-red-green-gate.json'] if revisionNumber==14 else [])+(['veto-objective-red-green-gate.json'] if revisionNumber>=15 else [])
proofs={n:read(n) for n in proofNames};assert all(r['passed'] and r['currentSha256']==sha(core) for r in proofs.values())
if revisionNumber>=17:
    proofs['root-capacity-red-green-gate.json']=read('root-capacity-red-green-gate.json');assert proofs['root-capacity-red-green-gate.json']['passed'] and proofs['root-capacity-red-green-gate.json']['currentSha256']==sha(core) and proofs['root-capacity-red-green-gate.json']['budgetSha256']==sha(HERE/'search_budget.ts')
calibration=read('search-scale/teacher-calibration.json');assert calibration['passed'] and calibration['configSha256']==sha(HERE/'search_prior_config.ts')
result=dict(passed=True,coreSha256=sha(core),leafSha256=sha(HERE/'leaf.ts'),teacherModelSha256=sha(HERE/'teacher-model.json'),publicChecksPassed=True,typecheckPassed=True,existingNumericCoefficientsAndBudgetUnchanged=True,leafRiskAccountingChanged=armyAccounting,searchPriorWeight=calibration['selected']['priorWeight'],searchCalibration='search-scale/teacher-calibration.json',zeroScaleEquivalence=read('search-zero-gate.json')['passed'] if not productive else None,unchangedCandidateScoreMatrix=read('candidate-score-reuse-gate.json')['passed'] if productive and not armyAccounting else None,freshSearchCalibration=read('fresh-search-calibration-gate.json')['passed'] if armyAccounting else None,rankScoreGate=read('rank-score-gate.json')['passed'],reusedUnchangedEngineEvidence='revisions/'+revision+'/reused-unchanged-engine-gates.json',proofs=proofs,readonlyEngineEnabled=False,speculativeSingleThreatEnabled=False)
if revisionNumber>=18:result.update(cacheOptimization=dict(gate='revisions/r19/cache-consistency-gate.json' if valueContinuation else 'revisions/'+revision+'/cache-consistency-gate.json',focusSha256=sha(HERE/'focus_threat.ts'),geometryEqualSha256=sha(HERE/'geometry_equal.ts'),featureAuditReexecuted=True,allCandidateRecordsExact=read('revisions/r19/candidate-scalars-exact.json')['allRecordsExact'] if valueContinuation else read(f'revisions/{revision}/candidate-scalars-exact.json')['allRecordsExact']))
if sameUnitCompletion:
    comparison=read(f'revisions/{revision}/candidate-scalars-exact.json');assert (comparison['sameUnitCompletionChange'] or comparison.get('safeRecruitmentCoverageChange') or comparison.get('rootCapacityChange')) and comparison['rootInputAndPrimaryExact'] and comparison['policyConfidenceExact']
    assert read(f'revisions/{revision}/performance-consistency-gate.json')['roots']==1557
    result.update(sameUnitCompletionChange=dict(performanceGate=f'revisions/{revision}/performance-consistency-gate.json',regressionGate=f'revisions/{revision}/safe-completion-red-green-gate.json',comparison=f'revisions/{revision}/candidate-scalars-exact.json',rootGuardsByteExact=True,maximumAdditionalFullLeavesPerRoot=2,additionalOwnSteps=0,additionalBranchPolicyCalls=0),cacheProofRevision=revision,reusedUnchangedEngineEvidence=None,freshEngineEvidence=f'revisions/{revision}/fresh-engine-gates.json')
    if revisionNumber>=22:
        assert comparison.get('deploymentCompletionChange') or comparison.get('safeCompletionBehaviorUnchanged')
        result['deploymentCompletionChange']=dict(regressionGate=f'revisions/{revision}/deployment-completion-final-red-green-gate.json',recoverySha256=sha(HERE/'deployment_recovery.ts'),maximumAdditionalFullLeavesPerRoot=2,additionalOwnSteps=0,modelWeightsUnchanged=True,behaviorActuallyChanged=revisionNumber==22)
    if revisionNumber>=23:
        assert (comparison.get('safeRecruitmentCoverageChange') or comparison.get('rootCapacityChange')) and comparison['originalSixPreserved'] and comparison['changedPhysicalLeaves']==0
        result['safeRecruitmentCoverageChange']=dict(regressionGate=f'revisions/{revision}/safe-recruitment-coverage-red-green-gate.json',coverageSha256=sha(HERE/'safe_recruitment_coverage.ts'),maximumRootReplacements=1,originalSixPreserved=True,commonCandidatePhysicalLeavesExact=True,rootGuardsOtherwiseByteExact=True,additionalRootFeatureEncodes=0,additionalPolicyForwards=0,behaviorActuallyChanged=revisionNumber==23)
    if revisionNumber>=24:
        assert comparison['rootCapacityChange'] and comparison['originalTwelvePreserved']
        registered=read(read('ACTIVE_SEARCH_PROTOCOL.json')['path'])['searchBudget'];assert registered==dict(topK=16,maxFollowNodes=24,maximumOwnNodes=400,oldTopK=12,oldMaximumOwnNodes=300,originalSixPreserved=True,originalTwelvePreserved=True)
        result['rootCapacityExpansion']=dict(regressionGate=f'revisions/{revision}/top16-capacity-red-green-gate.json',originalTwelvePreserved=True,topK=16,maximumOwnNodes=400,budgetSha256=sha(HERE/'search_budget.ts'),allOldCandidateScalarsExact=True)
if valueContinuation:
    comparison=read(f'revisions/{revision}/candidate-scalars-exact.json');assert comparison['valueOnlyModelChange'] and comparison['rootInputAndPrimaryExact'] and comparison['rootCoverageExact'] and comparison['policyConfidenceExact']
    result.update(valueHeadChange=dict(adoptionSha256=sha(HERE/'value-continuation-adoption.json'),evaluationSha256=adoption['evaluationSha256'],originalQualityGatesUnchanged=True,policyWeightsAndSchemaExact=True,comparison=f'revisions/{revision}/candidate-scalars-exact.json'),cacheProofRevision='r19')
if revisionNumber>=16:result.update(rootProposal=dict(modelSha256=sha(HERE/'base-policy-final.json'),sourceSha256=sha(HERE/'candidate_proposal.ts'),browserReceiptSha256=sha(HERE/'browser-proposal.json'),reuseGateSha256=sha(HERE/'proposal-reuse-gate.json'),newChromeExecution=True,additionalRootForwards=1,additionalFeatureEncodes=0))
if revisionNumber>=17:result.update(existingNumericCoefficientsAndBudgetUnchanged=False,leafCoefficientsUnchanged=True,registeredCapacityChange=dict(topK=16 if revisionNumber>=24 else 12,maxFollowNodes=24,maximumOwnNodes=400 if revisionNumber>=24 else 300,originalSixPreserved=True,originalTwelvePreserved=revisionNumber>=24,budgetSha256=sha(HERE/'search_budget.ts'),speedGateSha256=sha(HERE/'search-capacity-speed-gate.json')))
(HERE/f'{revision}-pre-browser-ready.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');print('等待真实Chrome复核后发布'+revision+'-ready',flush=True)
