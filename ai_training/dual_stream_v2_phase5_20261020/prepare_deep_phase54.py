"""按用户追加指令登记五单位反扑、880ms预算与四案决赛圈的独立冻结验收。"""
import copy
import shutil
from run_league import DIR, read, save, sha


def main():
    source = DIR / 'phase54-audit'; target = source / 'v5-deep'
    if (target / 'protocol.json').exists(): print('深度版已预登记，保持原件'); return
    protocol = copy.deepcopy(read(source / 'protocol.json'))
    protocol.pop('previousPhaseRun',None)
    protocol.update(runtimeRevision='phase54-v5-deep880-retal5',previousPhaseSummary='phase54-audit/superseded-summary.json',previousEvidenceManifest='phase54-audit/superseded-evidence-manifest.json',engineeringFirst=True,searchOptions=dict(budgetMs=880,maxNodes=260,maxRetaliationUnits=5,retaliationHardLimitMs=950,tierOneFraction=.42,multiplayerTotalChains=8,mandatoryCorePerEnemy=2,duelFinalists=4,multiplayerFinalists=3),reason='用户紧急追加的五单位反扑与深度预算升级，候选仍由原开发审计固定为第3代；旧双链面板完整收尾并单列保全，不用旧工程收据代替新60局。')
    protocol['executionContract']['nodeArgs'] = ['--expose-gc','--min-semi-space-size=128','--max-semi-space-size=128']
    save(target / 'protocol.json',protocol)
    for name in ['historical-manifest.json','read-only-engine-equivalence.json','numeric-reuse.json','selection.json']:
        shutil.copyfile(source / name,target / name)
    shutil.copytree(source / 'v4-conclusion',target / 'v4-conclusion')
    shutil.copytree(source / 'pure-strict',target / 'pure-strict')
    for arm in ['champion-search-arena','candidate-search-arena','engineering60']:
        plan = read(source / arm / 'plan.json')
        plan.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],searchOptions=protocol['searchOptions'],protocolSha256=sha(target / 'protocol.json'))
        save(target / arm / 'plan.json',plan)
    save(source / 'v5r2/NOT_EXECUTED.json',dict(executed=False,reason='用户追加搜索深度升级，合并最小新生代配置进入v5-deep；原预登记保留'))
    print('五单位深度版预登记完成，先60初态工程复测，再双方112槽')


if __name__ == '__main__': main()
