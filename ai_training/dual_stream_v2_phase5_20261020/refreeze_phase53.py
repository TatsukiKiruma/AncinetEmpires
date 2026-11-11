"""归档首版v4完整尝试，登记无规则改动的只读比较扩展，重新冻结评测。"""
import shutil
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save


def main():
    archive = AUDIT / 'v4-attempt01-search-archive'
    assert not archive.exists()
    assert read(DIR / 'champion-search-arena/arena-summary.json')['complete']
    assert read(DIR / 'generations/gen_03/arena-summary.json')['complete']
    archive.mkdir()
    files = {}
    champion = DIR / 'champion-search-arena'
    candidate = DIR / 'generations/gen_03/arena'
    plans = [read(champion / 'plan.json'), read(candidate / 'plan.json')]
    for p in champion.rglob('*'):
        if p.is_file():
            files['champion-search-arena/' + p.relative_to(champion).as_posix()] = sha(p)
    assert champion.resolve().is_relative_to(DIR.resolve()) and archive.resolve().is_relative_to(DIR.resolve())
    champion.rename(archive / 'champion-search-arena')
    save(archive / 'candidate-plan.json', plans[1])
    for slot in plans[1]['slots']:
        if slot['mode'] != 'turn_search':
            continue
        source = candidate / 'battles' / slot['id']
        assert (source / 'strict-replay.json').exists()
        destination = archive / 'candidate-search-battles' / slot['id']
        for p in source.rglob('*'):
            if p.is_file():
                files['candidate-search-battles/' + slot['id'] + '/' + p.relative_to(source).as_posix()] = sha(p)
        destination.parent.mkdir(parents=True, exist_ok=True)
        assert source.resolve().is_relative_to(DIR.resolve()) and destination.resolve().is_relative_to(AUDIT.resolve())
        source.rename(destination)
    shutil.copyfile(DIR / 'generations/gen_03/arena-summary.json', archive / 'candidate-arena-summary.json')
    for name in ['gen0-search-0.log', 'gen0-search-1.log', 'gen3-search-0.log', 'gen3-search-1.log', 'arena-driver.log']:
        source = AUDIT / name
        if source.exists():
            destination = archive / 'execution-logs' / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            files['execution-logs/' + name] = sha(source)
            assert source.resolve().is_relative_to(AUDIT.resolve()) and destination.resolve().is_relative_to(AUDIT.resolve())
            source.rename(destination)
    save(archive / 'manifest.json', dict(files=files, reason='首版v4队列工程门禁未达0.5ms，保留完整同运行时双方结果；只读快返优化后重测'))
    for name, digest in files.items():
        assert sha(archive / name) == digest
    old_freeze = read(AUDIT / 'runtime-freeze.json')
    shutil.copyfile(AUDIT / 'runtime-freeze.json', AUDIT / 'runtime-freeze-v4-attempt01.json')
    runtime = {p.relative_to(ROOT).as_posix():sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
    harness = {name:sha(ROOT / name) for name in old_freeze['harness']}
    equality = read(AUDIT / 'read-only-engine-equivalence.json')
    assert equality['passed']
    revision = read(DIR / 'RUNTIME_REVISION.json')
    revision.update(v4RuntimeSha256=runtime, v4QueueRevision=2, v4AuthorityReadOnlyExtension=dict(authoritySha256=equality['authoritySha256'], previousAuthoritySha256=equality['previousAuthoritySha256'], receipt='phase53-audit/read-only-engine-equivalence.json', receiptSha256=sha(AUDIT / 'read-only-engine-equivalence.json')), v4Attempt01Archive='phase53-audit/v4-attempt01-search-archive')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    for directory, plan in zip([champion, candidate], plans):
        plan.update(runtimeRevision='gen03-phase53-v4r2', runtimeSha256=runtime, harnessSha256=harness, authorityReadOnlyExtension=revision['v4AuthorityReadOnlyExtension'])
        save(directory / 'plan.json', plan)
    old_freeze.update(runtime=runtime, harness=harness, authorityReadOnlyExtension=revision['v4AuthorityReadOnlyExtension'], attempt01Archive='phase53-audit/v4-attempt01-search-archive')
    save(AUDIT / 'runtime-freeze.json', old_freeze)
    print(dict(archivedFiles=len(files), runtimeFiles=len(runtime), readonly=equality['passed']))


if __name__ == '__main__':
    main()
