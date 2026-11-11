"""仅重跑两组v4搜索面板；已有完整结果只strict复核，中断前缀拒绝覆盖。"""
import os
import subprocess
import time
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from arena_summary import summarize


def battle(arena, generation):
    freeze = read(DIR / 'phase53-audit/runtime-freeze.json')
    assert all(sha(ROOT / p) == h for p, h in {**freeze['runtime'], **freeze['harness']}.items())
    processes, logs = [], []
    try:
        for lane in range(2):
            log = (DIR / f'phase53-audit/gen{generation}-search-{lane}.log').open('ab')
            logs.append(log)
            node_args = read(DIR / 'RUNTIME_REVISION.json').get('executionContract', {}).get('nodeArgs', [])
            args = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', *node_args, '--import', 'tsx', 'dual_stream_v2_phase5_20261020/battle.ts', 'play', str(lane), '2']
            processes.append(subprocess.Popen(args, cwd=ROOT, env={**os.environ, 'LEAGUE_ARENA': arena, 'LEAGUE_MODE': 'turn_search'}, stdout=log, stderr=subprocess.STDOUT))
        save(DIR / 'phase53-audit/pipeline-status.json', dict(stage='search_arena', generation=generation, pids=[p.pid for p in processes], startedAt=time.time()))
        codes = [p.wait() for p in processes]
        assert codes == [0, 0], f'面板中断，保留原始前缀:{codes}'
    finally:
        for log in logs:
            log.close()
    summary = summarize(generation, arena_path=arena if generation == 0 else None)
    print(dict(generation=generation, completed=summary['completedSlots'], strict=summary['strictAllAttempts']), flush=True)
    return summary


def main():
    verify_runtime_contract()
    baseline = battle('champion-search-arena', 0)
    if baseline['queueLatency']['max'] >= .5:
        # 基准已证明工程门禁失败，先保全完整56槽，再修复队列路径，避免浪费候选面板。
        save(DIR / 'phase53-audit/pipeline-status.json', dict(stage='queue_engineering_gate_failed', queueMax=baseline['queueLatency']['max'], endedAt=time.time()))
        return
    battle('generations/gen_03/arena', 3)
    save(DIR / 'phase53-audit/pipeline-status.json', dict(stage='arenas_complete', endedAt=time.time()))


if __name__ == '__main__':
    main()
