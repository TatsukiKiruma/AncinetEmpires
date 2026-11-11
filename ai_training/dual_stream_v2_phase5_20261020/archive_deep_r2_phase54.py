"""封存第二深度修订的60+112与诊断，未过门禁的事实保持原样。"""
import shutil
from run_league import DIR, ROOT, read, save, sha


def main():
    audit = DIR / 'phase54-audit/v5-deep-r2'
    assert read(audit / 'status.json')['stage'] == 'quality_unmet'
    assert read(audit / 'map-retention-comparison/status.json')['stage'] == 'complete'
    assert read(audit / 'gc-threads-comparison/status.json')['stage'] == 'complete'
    assert not (audit / 'superseded-evidence-manifest.json').exists(), '既有封存不可覆盖'
    gates = read(audit / 'gate-summary.json')
    assert gates['promoted'] is False
    assert gates['gates']['allAttemptsStrict'] and gates['gates']['complete112Search']
    for profile in [*audit.glob('gc-threads-comparison/*/round-*/lane-*/profile.json'), *audit.glob('map-retention-comparison/*/round-*/lane-*/profile.json'), *audit.glob('jit-trace/lane-*/profile.json')]:
        plan = read(profile.parent / 'plan.json')
        for slot in plan['slots']:
            folder = profile.parent / 'games' / slot['id']
            strict, result = read(folder / 'strict-replay.json'), read(folder / 'result.json')
            assert strict['passed'] and strict['actions'] == result['actions']
    conclusion = audit / 'conclusion'
    conclusion.mkdir()
    for name in ['REPORT.md', 'BATTLES.md', 'gate-summary.json', 'RUNTIME_REVISION.json', 'league-state.json', 'dual-v2-champion.json', 'dual-v2-champion.bin']:
        shutil.copyfile(DIR / name, conclusion / name)
    shutil.copyfile(ROOT / 'ai_training/status/CURRENT.md', conclusion / 'CURRENT.md')
    sources = audit / 'diagnostic-source'
    sources.mkdir()
    for name in ['diagnose_gc_phase54.ts', 'diagnose_core_phase54.ts', 'diagnose_queue_jit_phase54.ts', 'diagnose_takeover_witness_phase54.ts', 'compare_first_divergence_phase54.py', 'run_gc_threads_phase54.py', 'run_map_retention_phase54.py', 'record_external_gui_phase54.py']:
        shutil.copyfile(DIR / name, sources / name)
    summary = dict(stage='superseded_by_phase54_revision', promoted=False, gates=gates['gates'], pureWins=gates['pureWins'], searchWins=gates['searchWins'], panelComparison=gates['panelComparison'], counts=gates['counts'], queueMax=gates['queueMax'], diagnosticsStrict=True, externalGuiChangeAuthorized=read(audit / 'external-gui-change/authorization.json')['authorizedByHuman'], reason='完整60初态与双方112搜索槽均保留：候选固定17<18、多人9<自身pure10、总42<43，队列与核心完成率未过。后续另立预登记与源码冻结，不覆盖本轮失败。')
    save(audit / 'superseded-summary.json', summary)
    files = dict(read(DIR / 'phase54-audit/v5-deep/superseded-evidence-manifest.json')['files'])
    for path in audit.rglob('*'):
        if path.is_file():
            files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path), bytes=path.stat().st_size)
    save(audit / 'superseded-evidence-manifest.json', dict(passed=gates['gates']['allAttemptsStrict'], files=files))
    print(dict(preservedFiles=len(files), promoted=False, pureWins=summary['pureWins'], searchWins=summary['searchWins']))


if __name__ == '__main__':
    main()
