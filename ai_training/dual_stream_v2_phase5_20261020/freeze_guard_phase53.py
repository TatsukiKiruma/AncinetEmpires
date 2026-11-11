"""保全v4r3两模型完整结果，冻结相同根态单位集合的风险守卫修复。"""
import shutil
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save


def main():
    archive = AUDIT / 'v4r3-search-archive'
    assert not archive.exists()
    assert read(DIR / 'champion-search-arena/arena-summary.json')['complete']
    assert len(list((DIR / 'generations/gen_03/arena/battles').glob('*turn_search/result.json'))) == 56
    archive.mkdir()
    champion = DIR / 'champion-search-arena'
    candidate = DIR / 'generations/gen_03/arena'
    plans = [read(champion / 'plan.json'), read(candidate / 'plan.json')]
    files = {}
    for p in champion.rglob('*'):
        if p.is_file():
            files['champion-search-arena/' + p.relative_to(champion).as_posix()] = sha(p)
    assert champion.resolve().is_relative_to(DIR.resolve()) and archive.resolve().is_relative_to(AUDIT.resolve())
    champion.rename(archive / 'champion-search-arena')
    save(archive / 'candidate-plan.json', plans[1])
    save(archive / 'candidate-search-battles/plan.json', plans[1])
    for slot in plans[1]['slots']:
        if slot['mode'] != 'turn_search':
            continue
        source = candidate / 'battles' / slot['id']
        destination = archive / 'candidate-search-battles' / slot['id']
        assert read(source / 'strict-replay.json')['passed']
        for p in source.rglob('*'):
            if p.is_file():
                files['candidate-search-battles/' + slot['id'] + '/' + p.relative_to(source).as_posix()] = sha(p)
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
    shutil.copyfile(DIR / 'RUNTIME_REVISION.json', archive / 'RUNTIME_REVISION.json')
    shutil.copyfile(AUDIT / 'runtime-freeze.json', archive / 'runtime-freeze.json')
    save(archive / 'manifest.json', dict(files=files, sourceSnapshot='phase53-audit/v4r3-runtime-source', reason='独立同终态回归证明actors名单可伪造风险改善；新版本按根态相同友军集合比较，不用胜负调参'))
    for name, digest in files.items():
        assert sha(archive / name) == digest
    freeze = read(AUDIT / 'runtime-freeze.json')
    runtime = {p.relative_to(ROOT).as_posix():sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
    freeze.update(runtime=runtime, riskContract='same-root-allied-unit-set', v4r3Archive='phase53-audit/v4r3-search-archive')
    revision = read(DIR / 'RUNTIME_REVISION.json')
    revision.update(v4RuntimeSha256=runtime, v4QueueRevision=4, v4RiskContract='same-root-allied-unit-set', v4r3Archive='phase53-audit/v4r3-search-archive')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    save(AUDIT / 'runtime-freeze.json', freeze)
    for directory, plan in zip([champion, candidate], plans):
        plan.update(runtimeRevision='gen03-phase53-v4r4-node128', runtimeSha256=runtime, riskContract='same-root-allied-unit-set')
        save(directory / 'plan.json', plan)
    registry = read(AUDIT / 'evaluation-archives.json')
    registry['directories'].append('phase53-audit/v4r3-search-archive')
    save(AUDIT / 'evaluation-archives.json', registry)
    print(dict(archivedFiles=len(files), runtimeFiles=len(runtime), riskContract=freeze['riskContract']))


if __name__ == '__main__':
    main()
