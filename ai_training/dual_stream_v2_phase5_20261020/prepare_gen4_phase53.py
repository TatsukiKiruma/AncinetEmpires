"""固定图少一胜触发用户的第4代授权；先登记网格，不消费评测结果选参。"""
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save

target = AUDIT / 'gen4-protocol.json'
if target.exists():
    print('第4代协议已存在，保持原件')
else:
    old = read(DIR / 'champion-search-arena/plan.json')
    fixed = [s for s in old['slots'] if s['panel'] == 'fixed']
    baseline = sum(read(DIR / 'champion-search-arena/battles' / s['id'] / 'result.json')['classification'] == 'natural_win' for s in fixed)
    current = read(DIR / 'generations/gen_03/arena/plan.json')
    selected = [s for s in current['slots'] if s['mode'] == 'turn_search' and s['panel'] == 'fixed']
    candidate = sum(read(DIR / 'generations/gen_03/arena/battles' / s['id'] / 'result.json')['classification'] == 'natural_win' for s in selected)
    assert len(fixed) == len(selected) == 20 and candidate == baseline - 1
    warm = 'generations/gen_03/model'
    protocol = dict(schema='phase53-gen4-policy-semantic-grid-v1', generation=4, trigger=dict(panel='fixed', championWins=baseline, candidateWins=candidate, authorization='用户阶段5.3第3.4条：比同运行时第0代少1局则自动第4代'), warmModel=warm, warmSha256=sha(DIR / (warm + '.bin')), teacher='当前冠军第0代，固定v4r4搜索', correctionReference='第3代热启动纯策略；只训练真实接管或否决且相对它发生的原子改写', sampleGames=60, mixture=dict(duel=24, fork=21, multiplayer=15), expertGenerations=[4], baseRate=20000/141381, supervised=dict(epochs=1, optimizer='AdamW', lr=1e-5, minLr=2e-6, weightDecay=1e-4, baseKl=1., baseActionCe=.2, expertLoss='prior_distillation.policy_loss', gradientClip=1., skipContradictoryHardBase=True), semanticGrid=[dict(id=f'lr{lr:g}-head{ce:g}-ep{epochs}', lr=lr, baseHeadCe=ce, epochs=epochs) for lr in [1e-5, 2e-5] for ce in [.5, 1.] for epochs in [10, 20]], semantic=dict(baseKl=1., baseActionCe=.2, baseOpportunityWeight=1., constraintKl=1., constraintOpportunityWeight=10., margin=.5, deltaL2=.01, minLr=2e-6, weightDecay=1e-4, gradientClip=1., constraintRepeats=1, trainedRows='what_entity前15个动作语义行', cache='仅RAM的冻结实体特征与完整候选分数，优化近似；开发集逐候选实际全网重验'), selection='固定开发集门禁通过者按headTop1降序、无谓wait升序、候选ID升序；禁止按实战胜负选模型', devGates=dict(headTop1RegressionTolerance=0., wastedWaitMax=2, protectedHeads=[1,2,7,5,11], protectedRatio=[.8,1.2], correctionGainMin=.02, exactMcNemarMax=.05), valueTraining=False, frozen='全部骨干、价值、内置headBias与校准配置', resource=dict(evidenceCapBytes=1200000000, minimumFreeBytes=12*1024**3, rationale='用户授权新增60局与8个开发候选，保留所有旧证据；质量、动作、时延门槛均保持'), independentBlindTest=False, guiDeployment=False)
    save(target, protocol)
    print(dict(trigger=protocol['trigger'], candidates=len(protocol['semanticGrid']), warmSha256=protocol['warmSha256']))
