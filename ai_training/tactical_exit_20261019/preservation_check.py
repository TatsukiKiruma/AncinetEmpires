"""对立项时实际存在的文件复核，授权源码修改以原文副本证明保留。"""
from pathlib import Path
import json,hashlib,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()
baseline=read(HERE/'PRESERVE.json');intentional={f'src/game/{n}.ts':f'public_before/{n}.ts.snapshot' for n in ['engine','map','rules','abilities','rule_config','campaign_events']};intentional['ai_training/status/CURRENT.md']='public_before/CURRENT.md.snapshot'
missing=[];changed=[];retained=[];unchanged=0;start=time.perf_counter()
for i,(name,entry) in enumerate(baseline.items()):
    p=Path(name);p=p if p.is_absolute() else ROOT/p
    if not p.is_file():missing.append(name);continue
    digest=sha(p)
    if digest==entry['sha256']:unchanged+=1
    elif name in intentional:
        copy=HERE/intentional[name];assert copy.is_file() and sha(copy)==entry['sha256'],name
        retained.append(dict(path=name,beforeSha256=entry['sha256'],afterSha256=digest,originalCopy=intentional[name]))
    else:changed.append(dict(path=name,expected=entry['sha256'],actual=digest))
    if i%1000==0:print('保全复核',i,'/',len(baseline),flush=True)
result=dict(passed=not missing and not changed,baselineFiles=len(baseline),unchangedFiles=unchanged,authorizedChangesWithExactOriginal=retained,missing=missing,unexpectedChanged=changed,scope='仅立项时实际存在的文件；不纳入立项前已删除的阶段2临时缓存',seconds=time.perf_counter()-start)
(HERE/'preservation-check.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');print(json.dumps(dict(passed=result['passed'],files=len(baseline),missing=len(missing),unexpected=len(changed))))
