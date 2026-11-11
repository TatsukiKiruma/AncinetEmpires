"""按SHA归档旧搜索基线，冻结第3代运行时与训练前登记。"""
from run_league import DIR, ROOT, read, save, sha


def main():
    receipt = DIR / 'phase52-audit/runtime-freeze.json'
    runtime = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
    if receipt.exists():
        assert read(receipt)['runtime'] == runtime
        return
    revision = read(DIR / 'RUNTIME_REVISION.json')
    pure = {p: digest for p, digest in revision['gen2RuntimeSha256'].items() if not p.endswith('turn_search_ai.ts')}
    assert all(sha(ROOT / p) == digest for p, digest in pure.items())
    source = (DIR / 'champion-search-arena').resolve()
    hashes = {p.relative_to(source).as_posix(): sha(p) for p in source.rglob('*') if p.is_file()}
    archive = (DIR / ('champion-search-arena-sha-' + sha(source / 'plan.json')[:16])).resolve()
    assert source.parent == DIR.resolve() and archive.parent == DIR.resolve() and not archive.exists()
    source.rename(archive)
    assert all(sha(archive / p) == digest for p, digest in hashes.items())
    source.mkdir()
    plan = read(archive / 'plan.json')
    plan.update(runtimeRevision='gen03-phase52', runtimeSha256=runtime, comparisonRole='第3代同运行时冠军搜索基线')
    save(source / 'plan.json', plan)
    revision.update(activeRuntimeKey='gen3RuntimeSha256', gen3RuntimeSha256=runtime, gen3PreviousRuntimeSnapshot='phase52-audit/runtime-before', gen3Reason='定向合法动作、完整神经编码、一次分配队列状态键、25%一级预算及两案等额真实反扑窗口')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    save(receipt, dict(runtime=runtime, archive=archive.relative_to(DIR).as_posix(), archivedChampionSearch=hashes, pureReuseVerifiedFiles=pure, pureBaselineSummarySha256=sha(DIR / 'champion-pure-arena/arena-summary.json')))
    save(DIR / 'phase52-audit/protocol.json', dict(generation=3, stopAfter=3, games=60, parent=0, expertGenerations=[2, 3], correctionOnly=True, acrossGames=8, lr=2e-5, minLr=2e-6, margin=.5, baseKl=1., baseCe=.2, expertMargin=1., expertCe=.5, expertKl=.5, tacticalWeight=1.5, moveWeight=.5, waitHardWeight=0., frozen='共享骨干、价值头、headBias', inheritedCalibration=True, devHeadTop1MaxDrop=.002, devWaitMax=2, protectedHeads=[1, 2, 7, 11], protectedHeadCountRelativeRange=[.8, 1.2], expertHitMinimumGain=.02, tierOneFraction=.25, comparisonCandidates=2, selectionUsesBattles=False, directoryLimit=950000000, freeGiB=12))


if __name__ == '__main__': main()
