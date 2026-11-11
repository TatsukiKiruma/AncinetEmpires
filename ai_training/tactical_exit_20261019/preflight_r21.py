"""完成当前修复的全部前置门禁，保留旧版源码及原始检查收据。"""
from pathlib import Path
import json,hashlib,subprocess,time,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen=read('source-freeze-teacher-r20.json')['files']
for n in ['model_battle_search_ai.ts','leaf.ts','value_state.ts','shared_single_threat.ts','combined_tactics.ts','movement_query_cache.ts']:
    item=frozen['ai_training/tactical_exit_20261019/'+n];target=HERE/'revisions/r20'/(n+'.snapshot');source=HERE/item['snapshot'];assert sha(source)==item['sha256']
    if not target.exists():
        with target.open('xb') as out:out.write(source.read_bytes())
    assert sha(target)==item['sha256']
target=HERE/'revisions/r20/teacher-model.json.snapshot';source=HERE/'value-continuation-fit/selected-model.json';assert sha(source)==read('r20-ready.json')['teacherModelSha256']
if not target.exists():
    with target.open('xb') as out:out.write(source.read_bytes())
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',str(Path(__import__('sys').executable)),'-X','utf8','tactical_exit_20261019/'+n,*a]
while not (HERE/'search-scale/teacher-r21-calibration.json').exists():time.sleep(2)
assert read('search-scale/teacher-calibration.json')['collectionTag']=='teacher-r21'
for n in ['search-capacity-speed-gate.json','proposal-reuse-gate.json']:
    if (HERE/n).exists():shutil.copy2(HERE/n,REV/(n+'.before.snapshot'))
run(ts('search_capacity_speed.ts'),'capacity-speed')
run(ts('speed.ts','teacher-r21'),'value-speed')
run(py('validate_guard_revision.py','r21','r20'),'all-safety-engine-public-checks')
run(['node','ai_training/run.mjs','node','tactical_exit_20261019/prepare_revision.mjs','r21','r20'],'publish-ready')
print('R21前置门禁通过，下一步完整150槽资格',flush=True)
