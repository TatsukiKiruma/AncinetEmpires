"""核对缓存前后完整离线搜索见证；不只比较汇总风险和最终叶子分。"""
from pathlib import Path
from itertools import zip_longest
import gzip,json,hashlib,sys
HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
oldTag=sys.argv[1] if len(sys.argv)>1 else 'teacher-r17';newTag=sys.argv[2] if len(sys.argv)>2 else 'teacher-r18';revision=sys.argv[3] if len(sys.argv)>3 else 'r18'
lanes=[];rows=0
for lane in range(4):
    paths=[HERE/f'search-scale/{tag}-witness-{lane}.jsonl.gz' for tag in [oldTag,newTag]]
    count=0
    with gzip.open(paths[0],'rt',encoding='utf-8') as a,gzip.open(paths[1],'rt',encoding='utf-8') as b:
        for i,(before,after) in enumerate(zip_longest(a,b)):
            assert before is not None and after is not None and json.loads(before)==json.loads(after),(lane,i,'完整见证不一致')
            count+=1
    rows+=count;lanes.append(dict(lane=lane,roots=count,oldSha256=sha(paths[0]),newSha256=sha(paths[1])))
r=dict(passed=True,roots=rows,fullWitnessRecordsExact=True,focusSha256=sha(HERE/'focus_threat.ts'),geometryEqualSha256=sha(HERE/'geometry_equal.ts'),lanes=lanes)
target=HERE/f'revisions/{revision}/cache-full-witness-gate.json';data=json.dumps(r).encode('utf-8')
if target.exists():assert target.read_bytes()==data,'已有版本见证收据不能覆盖'
else:
    with target.open('xb') as f:f.write(data)
print(json.dumps(r))
