"""恢复已完成训练的正式电脑验收；不重复采样、拟合或操作手机。"""
import argparse
import time
from run_league import DIR, read, save, sha, verify_runtime_contract, parallel, python, promote


def main(generation):
    verify_runtime_contract()
    state = read(DIR / 'league-state.json')
    assert state['currentGeneration'] < generation, '该代已经完成，请查看报告或运行下一代'
    folder = DIR / f'generations/gen_{generation:02d}'
    if generation == 3:
        audit = read(folder / 'dev-policy-audit.json')
        assert audit['passed'] and audit['modelSha256'] == sha(folder / 'model.bin'), '恢复正式验收也必须满足原开发前检'
    assert read(folder / 'tri-runtime-parity.json')['modelSha256'] == sha(folder / 'model.bin')
    assert read(folder / 'training-complete.json')['updates'] > 0
    assert read(folder / 'extraction-summary.json')['strictAllAttempts']
    save(DIR / 'PC_RESUME_REQUEST.json', dict(generation=generation, resumedAt=time.time(), phoneTesting=False, reason='用户要求继续任务，不再使用手机测试', frozenModelSha256=sha(folder / 'model.bin')))
    parallel(f'gen{generation}-arena-pc-resume', 'battle.ts', ['play'], dict(LEAGUE_ARENA=f'generations/gen_{generation:02d}/arena'))
    python(f'gen{generation}-summary-pc-resume.log', 'arena_summary.py', generation)
    promote(generation)
    final = read(DIR / 'league-state.json')
    save(DIR / 'pipeline-status.json', dict(stage='pc_arena_finished', targetGeneration=generation, championGeneration=final['championGeneration'], phoneTesting=False, completedAt=time.time()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--generation', type=int, default=1)
    main(parser.parse_args().generation)
