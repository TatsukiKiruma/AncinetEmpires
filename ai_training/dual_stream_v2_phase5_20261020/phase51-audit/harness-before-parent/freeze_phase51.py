"""冻结本轮运行身份，按SHA保全旧冠军搜索面板，核验纯策略可复用。"""
import json
import hashlib
from pathlib import Path
from run_league import DIR, ROOT, read, save, sha


def main():
    receipt = DIR / 'phase51-audit/runtime-freeze.json'
    if receipt.exists():
        frozen = read(receipt)
        assert all(sha(ROOT / p) == digest for p, digest in frozen['runtime'].items())
        return
    before = read(DIR / 'phase51-audit/before.json')
    revision = read(DIR / 'RUNTIME_REVISION.json')
    runtime = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
    pure_files = [p for p in revision['gen1RuntimeSha256'] if not p.endswith(('turn_search_ai.ts', 'value_calibration.ts'))]
    assert all(sha(ROOT / p) == revision['gen1RuntimeSha256'][p] for p in pure_files), '纯策略依赖发生变化，禁止直接复用旧纯策略基线'
    source = (DIR / 'champion-search-arena').resolve()
    archive = (DIR / 'champion-search-arena-v1-archive').resolve()
    assert source.parent == DIR.resolve() and archive.parent == DIR.resolve() and not archive.exists()
    hashes = {p.relative_to(source).as_posix(): sha(p) for p in source.rglob('*') if p.is_file()}
    source.rename(archive)
    assert all(sha(archive / p) == digest for p, digest in hashes.items())
    source.mkdir()
    plan = read(archive / 'plan.json')
    plan.update(runtimeRevision='gen02-phase51', runtimeSha256=runtime, comparisonRole='第2代同运行时冠军搜索基线')
    save(source / 'plan.json', plan)
    revision.update(gen2RuntimeSha256=runtime, gen2PreviousRuntimeSnapshot='phase51-audit/runtime-before', gen2Reason='默认单位链神经后续、750ms预算及候选期限守卫；军力保底价值候选')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    protocol = dict(generation=2, parentGeneration=0, games=60, mixture=dict(duel=24, fork=21, multiplayer=15), lr=3e-5, minimumLr=3e-6, weightDecay=1e-4, championKl=.10, expertWeights=dict(correction=1.5, winning=1.), rootScalarWeight=0., mixing='proportional-batch-interleave-v1', headDeltaLimit=.25, valueGrid=dict(rankWeights=[0, .5, 2, 8], balanced=[False, True], armyShareMix=[0., .05, .15]), selectionUsesBattleResults=False, calibrationTrainOnly=True, runtime=runtime)
    save(DIR / 'phase51-audit/protocol.json', protocol)
    save(receipt, dict(runtime=runtime, archivedChampionSearch=hashes, pureReuseVerifiedFiles=pure_files, pureBaselineSummarySha256=sha(DIR / 'champion-pure-arena/arena-summary.json'), protected=before['protected']))
    print(json.dumps(dict(archivedFiles=len(hashes), pureReuse=True)))


if __name__ == '__main__': main()
