"""按字节SHA归档v3搜索，冻结v4；纯策略原件保留原位。"""
import shutil
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save


def move_inside(source, destination):
    assert source.resolve().is_relative_to(DIR.resolve())
    assert destination.resolve().is_relative_to(AUDIT.resolve())
    assert not destination.exists(), f'归档路径已存在:{destination}'
    destination.parent.mkdir(parents=True, exist_ok=True)
    source.rename(destination)


def main():
    target = AUDIT / 'runtime-freeze.json'
    assert not target.exists(), 'v4已经冻结，禁止覆盖'
    archive = AUDIT / 'v3-search-archive'
    assert not archive.exists(), '归档已经存在，请核对中断状态'
    archive.mkdir()
    champion = DIR / 'champion-search-arena'
    old_champion_plan = read(champion / 'plan.json')
    mappings = {}
    for p in champion.rglob('*'):
        if p.is_file():
            mappings[p.relative_to(ROOT).as_posix()] = (archive / 'champion-search-arena' / p.relative_to(champion)).relative_to(ROOT).as_posix()
    move_inside(champion, archive / 'champion-search-arena')
    folder = DIR / 'generations/gen_03'
    arena = folder / 'arena'
    old_plan = read(arena / 'plan.json')
    shutil.copyfile(arena / 'plan.json', archive / 'candidate-plan.json')
    for slot in old_plan['slots']:
        if slot['mode'] != 'turn_search':
            continue
        source = arena / 'battles' / slot['id']
        destination = archive / 'candidate-search-battles' / slot['id']
        for p in source.rglob('*'):
            if p.is_file():
                mappings[p.relative_to(ROOT).as_posix()] = (destination / p.relative_to(source)).relative_to(ROOT).as_posix()
        move_inside(source, destination)
    for name in ['arena-summary.json', 'promotion.json']:
        shutil.copyfile(folder / name, archive / ('candidate-' + name))
    before = read(AUDIT / 'before.json')['files']
    for old, new in mappings.items():
        assert sha(ROOT / new) == before[old]['sha256'], old
    runtime = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
    harness = {p.relative_to(ROOT).as_posix(): sha(p) for p in [DIR / name for name in ['battle.ts', 'selfplay.ts', 'warmup.ts', 'run_league.py', 'arena_summary.py']]}
    revision = read(DIR / 'RUNTIME_REVISION.json')
    revision.update(activeRuntimeKey='v4RuntimeSha256', v4RuntimeSha256=runtime, v4Reason='同深度完整神经基准、无先验终评、惰性队列身份、聚焦反扑与一圈顺位、预热隔离', v4PreviousSearchArchive='phase53-audit/v3-search-archive')
    save(DIR / 'RUNTIME_REVISION.json', revision)
    for dest, plan in [(champion, old_champion_plan), (arena, old_plan)]:
        plan.update(runtimeRevision='gen03-phase53-v4', runtimeSha256=runtime, harnessSha256=harness, defaultQueue='full')
        save(dest / 'plan.json', plan)
    save(target, dict(runtime=runtime, harness=harness, archivedPaths=mappings, candidateModelSha256=sha(folder / 'model.bin'), championModelSha256=sha(DIR / 'generations/gen_00/model.bin'), pureFiles={p:e for p,e in before.items() if '/champion-pure-arena/' in p or '/generations/gen_03/arena/battles/' in p and '_pure/' in p}, defaultQueue='full', queueChoiceReason='首单位切分不能通过既有四项协同夹具；完整神经队列4/4通过，实战前态压力两种切分均独立保留'))
    print(dict(archivedFiles=len(mappings), runtimeFiles=len(runtime), gen3=sha(folder / 'model.bin')))


if __name__ == '__main__':
    main()
