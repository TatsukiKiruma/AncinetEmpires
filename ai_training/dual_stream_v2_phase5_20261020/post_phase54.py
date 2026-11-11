"""等待本轮固定评测完成，再建立永久排重与隔离证明，最后合取门禁。"""
import os
import shutil
import subprocess
import sys
import time
from run_league import DIR, ROOT, read, save, sha
from phase54_paths import audit_directory

AUDIT = audit_directory()


def main():
    while read(AUDIT / 'status.json')['stage'] != 'full_evaluation_complete': time.sleep(5)
    registry = DIR / 'phase53-audit/evaluation-archives.json'
    original = AUDIT / 'evaluation-archives-before.json'
    if not original.exists(): shutil.copyfile(registry,original)
    record = read(registry)
    roots = [AUDIT]
    protocol = read(AUDIT / 'protocol.json')
    if protocol.get('previousPhaseSummary'): roots.append((DIR / protocol['previousPhaseSummary']).parent)
    for name in [(root / arm).relative_to(DIR).as_posix() for root in roots for arm in ['champion-search-arena','candidate-search-arena']]:
        if name not in record['directories']: record['directories'].append(name)
    save(registry,record)
    save(AUDIT / 'status.json',dict(stage='post_evaluation_isolation',startedAt=time.time()))
    cmd = ['node',str(ROOT / 'ai_training/run.mjs'),'node','--max-old-space-size=8192','--import','tsx','dual_stream_v2_phase5_20261020/isolation_phase52.ts']
    with (AUDIT / 'isolation.log').open('ab') as output:
        code = subprocess.call(cmd,cwd=ROOT,env={**os.environ,'LEAGUE_PHASE54':'1','LEAGUE_ISOLATION_OUTPUT':(AUDIT / 'post-evaluation-isolation.json').relative_to(DIR).as_posix()},stdout=output,stderr=subprocess.STDOUT)
    assert code == 0, '保留隔离审计失败日志，不晋升'
    subprocess.run(['node',str(ROOT / 'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase5_20261020/finish_phase54.py'],cwd=ROOT,check=True)


if __name__ == '__main__': main()
