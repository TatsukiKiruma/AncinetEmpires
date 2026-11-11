"""仅在隔离等价性验证通过且源码未被他人改动时应用缓存与分配优化。"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
OUT=HERE/'performance_query_cache'
def read(n):return json.loads((OUT/n).read_text(encoding='utf-8'))
def sha(b):return hashlib.sha256(b).hexdigest()
assert read('query-cache-gate.json')['passed']
allocation=read('forward-allocation-gate.json');assert allocation['passed']
targets=[(HERE.parent.parent/'src/game/engine.ts','engine.ts',read('proposal.json')),(HERE/'group_model.ts','group_model.ts',allocation)]
for target,name,receipt in targets:
    before=(OUT/(name+'.before')).read_bytes();after=(OUT/(name+'.proposed')).read_bytes()
    assert target.read_bytes()==before, str(target)+' 已变更，不能覆盖'
    assert sha(before)==receipt['beforeSha256'] and sha(after)==receipt['proposedSha256']
for target,name,receipt in targets:target.write_bytes((OUT/(name+'.proposed')).read_bytes())
(OUT/'applied-r4.json').write_text(json.dumps(dict(passed=True,changesRules=False,files=[dict(path=str(p),beforeSha256=r['beforeSha256'],afterSha256=r['proposedSha256']) for p,_,r in targets])),encoding='utf-8')
print('两项有隔离等价证据的性能优化已应用')
