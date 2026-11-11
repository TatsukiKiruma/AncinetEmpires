"""保全默认堆下的完整失败基准，登记显式Node内存预算后重新配对。"""
import shutil
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save


def main():
    archive = AUDIT / 'v4r2-baseline-archive'
    assert not archive.exists()
    summary = read(DIR / 'champion-search-arena/arena-summary.json')
    assert summary['complete'] and summary['strictAllAttempts']
    assert len(list((DIR / 'generations/gen_03/arena/battles').glob('*turn_search/started.json'))) == 0
    archive.mkdir()
    before = DIR / 'champion-search-arena'; plan = read(before / 'plan.json')
    files = {p.relative_to(before).as_posix():sha(p) for p in before.rglob('*') if p.is_file()}
    assert before.resolve().is_relative_to(DIR.resolve()) and archive.resolve().is_relative_to(AUDIT.resolve())
    before.rename(archive / 'champion-search-arena')
    for p, digest in files.items():
        assert sha(archive / 'champion-search-arena' / p) == digest
    for name in ['gen0-search-0.log', 'gen0-search-1.log', 'arena-driver.log']:
        source = AUDIT / name
        if source.exists():
            assert source.resolve().is_relative_to(AUDIT.resolve())
            source.rename(archive / name)
    shutil.copyfile(DIR / 'RUNTIME_REVISION.json', archive / 'RUNTIME_REVISION.json')
    shutil.copyfile(AUDIT / 'runtime-freeze.json', archive / 'runtime-freeze.json')
    save(archive / 'manifest.json', dict(files=files, completeSlots=56, strictAllAttempts=True, queueMax=summary['queueLatency']['max'], reason='默认Node堆的完整基准仅1步超过0.5ms，保留失败，不修改计时或剔除峰值'))
    execution = dict(nodeArgs=['--max-semi-space-size=128'], lanes=2, budgetMs=1000, timing='原始performance.now墙钟，包含GC与调度耗时', reason='快返已移除大对象分配，固定失败前态9900次p95为0.036ms；明确登记V8内存预算，重新验证尾部，不按战绩选参数')
    revision = read(DIR / 'RUNTIME_REVISION.json')
    revision.update(v4QueueRevision=3, executionContract=execution, v4r2FailedBaseline='phase53-audit/v4r2-baseline-archive')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    freeze = read(AUDIT / 'runtime-freeze.json')
    freeze.update(executionContract=execution, v4r2FailedBaseline='phase53-audit/v4r2-baseline-archive')
    save(AUDIT / 'runtime-freeze.json', freeze)
    candidate = DIR / 'generations/gen_03/arena'
    for destination, p in [(before, plan), (candidate, read(candidate / 'plan.json'))]:
        p.update(runtimeRevision='gen03-phase53-v4r3-node128', executionContract=execution)
        save(destination / 'plan.json', p)
    registry = read(AUDIT / 'evaluation-archives.json')
    registry['directories'].append('phase53-audit/v4r2-baseline-archive')
    save(AUDIT / 'evaluation-archives.json', registry)
    print(dict(archivedFiles=len(files), execution=execution))


if __name__ == '__main__':
    main()
