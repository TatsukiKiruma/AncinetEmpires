"""依次执行双方完整搜索面板和60初态工程复测，所有尝试保留并strict收尾。"""
import os
import subprocess
import time
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from arena_summary import summarize
from phase54_paths import audit_directory

AUDIT = audit_directory()


def verify():
    verify_runtime_contract()
    freeze = read(AUDIT / 'runtime-freeze.json')
    assert all(sha(ROOT / p) == h for p,h in {**freeze['runtime'],**freeze['harness']}.items())


def lanes(stage, script, env, args):
    verify()
    processes, logs = [], []
    try:
        for lane in range(2):
            output = (AUDIT / f'{stage}-{lane}.log').open('ab'); logs.append(output)
            cmd = ['node',str(ROOT / 'ai_training/run.mjs'),'node',*read(AUDIT / 'protocol.json')['executionContract']['nodeArgs'],'--import','tsx','dual_stream_v2_phase5_20261020/'+script,*args,str(lane),'2']
            processes.append(subprocess.Popen(cmd,cwd=ROOT,env={**os.environ,'LEAGUE_PHASE54':'1',**env},stdout=output,stderr=subprocess.STDOUT))
        save(AUDIT / 'status.json',dict(stage=stage,pids=[p.pid for p in processes],startedAt=time.time()))
        codes = [p.wait() for p in processes]
        assert codes == [0,0], f'阶段失败，所有前缀原样保留:{stage}:{codes}'
    finally:
        for output in logs: output.close()


def main():
    engineering_env = dict(LEAGUE_ENGINEERING=(AUDIT / 'engineering60').relative_to(DIR).as_posix())
    engineering_first = read(AUDIT / 'protocol.json').get('engineeringFirst', False)
    if engineering_first: lanes('engineering60','engineering_gen4_phase53.ts',engineering_env,[])
    for generation,name in [(0,'champion-search-arena'),(3,'candidate-search-arena')]:
        arena = (AUDIT / name).relative_to(DIR).as_posix()
        lanes(name,'battle.ts',dict(LEAGUE_ARENA=arena),['play'])
        summarize(generation,arena_path=arena)
    if not engineering_first: lanes('engineering60','engineering_gen4_phase53.ts',engineering_env,[])
    save(AUDIT / 'status.json',dict(stage='full_evaluation_complete',endedAt=time.time()))


if __name__ == '__main__': main()
