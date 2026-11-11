"""工程证据驱动的v5r2：只固定最小新生代容量，模型与搜索源码不变。"""
import copy
import shutil
from run_league import DIR, read, save, sha


def main():
    source = DIR / 'phase54-audit'; target = source / 'v5r2'
    if (target / 'protocol.json').exists():
        print('v5r2预登记已存在，保持原件'); return
    protocol = copy.deepcopy(read(source / 'protocol.json'))
    protocol.update(runtimeRevision='phase54-v5r2-min-semispace',previousPhaseRun='phase54-audit',reason='正式v5队列0.9439ms尖峰保留；独立容量探针证明仅max参数时显式GC后新生代为2MB，固定min与max均128MB以减少盘外垃圾触发的回收。只按工程证据修订，不选择新权重或搜索参数。')
    protocol['executionContract']['nodeArgs'] = ['--expose-gc','--min-semi-space-size=128','--max-semi-space-size=128']
    save(target / 'protocol.json',protocol)
    for name in ['historical-manifest.json','read-only-engine-equivalence.json','numeric-reuse.json','selection.json','verification.json']:
        shutil.copyfile(source / name,target / name)
    shutil.copytree(source / 'v4-conclusion',target / 'v4-conclusion')
    shutil.copytree(source / 'pure-strict',target / 'pure-strict')
    for arm in ['champion-search-arena','candidate-search-arena','engineering60']:
        plan = read(source / arm / 'plan.json')
        plan.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],protocolSha256=sha(target / 'protocol.json'))
        save(target / arm / 'plan.json',plan)
    print('v5r2配置预登记完成；冻结与正式执行须等待v5原尝试完整收尾')


if __name__ == '__main__': main()
