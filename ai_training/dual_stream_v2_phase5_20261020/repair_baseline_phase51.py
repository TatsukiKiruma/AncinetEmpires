"""保全磁盘扫描竞态的失败槽，等一个原分片结束后按相同身份补跑。"""
import os
import subprocess
import sys
import time
from pathlib import Path
from run_league import DIR, ROOT, read, save, sha

arena = DIR / 'champion-search-arena'
plan = read(arena / 'plan.json')
slot_id = 'multi-3ffa-2-dual_v2_gen0_turn_search'
index = next(i for i, slot in enumerate(plan['slots']) if slot['id'] == slot_id)
source = (arena / 'battles' / slot_id).resolve()
archive = (arena / 'attempts/disk-scan-race-20261021' / slot_id).resolve()
assert source.is_relative_to(DIR.resolve()) and archive.is_relative_to(DIR.resolve())
if not archive.exists():
    result = read(source / 'result.json')
    assert result['classification'] == 'error' and 'ENOENT' in result['error']['message']
    strict = read(source / 'strict-replay.json')
    assert strict['passed'] and strict['actions'] == result['actions']
    identities = {p.relative_to(source).as_posix(): sha(p) for p in source.rglob('*') if p.is_file()}
    archive.parent.mkdir(parents=True, exist_ok=True)
    source.rename(archive)
    assert all(sha(archive / name) == digest for name, digest in identities.items())
    save(DIR / 'phase51-audit/disk-race-attempt-archive.json', dict(slot=slot_id, actions=strict['actions'], witnessActions=strict['witnessActions'], archive=str(archive.relative_to(DIR)), files=identities, reason=result['error']['message']))
# 原偶数分片最后一槽已完成才启动补跑，避免增加同时计算对局的数量。
last = [s for i, s in enumerate(plan['slots']) if i % 2 == index % 2][-1]
while not (arena / 'battles' / last['id'] / 'strict-replay.json').exists():
    time.sleep(5)
save(DIR / 'phase51-audit/baseline-repair-status.json', dict(stage='replaying', slot=slot_id))
command = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase5_20261020/battle.ts', 'play', str(index), str(len(plan['slots']))]
with (DIR / 'phase51-audit/baseline-repair.log').open('ab') as log:
    code = subprocess.call(command, cwd=ROOT, env={**os.environ, 'LEAGUE_ARENA': 'champion-search-arena'}, stdout=log, stderr=subprocess.STDOUT)
assert code == 0
save(DIR / 'phase51-audit/baseline-repair-status.json', dict(stage='replayed', slot=slot_id, result=read(source / 'result.json')['classification']))
