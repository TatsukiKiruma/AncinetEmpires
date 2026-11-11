"""只读核对交付文件、实战冻结身份与接手状态的旧内容保留。"""
from pathlib import Path
import json,hashlib,ast

HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
m=read(HERE/'DELIVERY_MANIFEST.json');bad=[]
for name,identity in m['artifacts'].items():
    p=HERE/name
    if not p.is_file() or p.stat().st_size!=identity['bytes'] or sha(p)!=identity['sha256']:bad.append(name)
assert not bad,bad
for freeze in ['battle-dynamic-source-freeze.json','battle-verified-source-freeze.json']:
    for name,digest in read(HERE/freeze).items():assert sha(HERE/name)==digest,(freeze,name)
assert m['status']=='completed_with_observed_battle_regression' and not m['promotionRecommended']
assert m['overallAcceptancePassed'] is False and read(HERE/'TASK_STATE.json')['complete'] is False
assert m['scope']['strictSlots']==250 and m['scope']['strictActions']==136511
assert m['preservation']['fullHistoricalSnapshotPassed'] is False
assert m['preservation']['stage3Unchanged'] and m['preservation']['newTrainingCachePassed']
current=ROOT/'ai_training/status/CURRENT.md';assert sha(current)==m['currentStatusSha256']
old=(HERE/'CURRENT.before-stage4.snapshot').read_text(encoding='utf-8-sig')
now=current.read_text(encoding='utf-8-sig');end='<!-- end-tactical-value-search-20261018 -->'
assert now.count('<!-- tactical-value-search-20261018 -->')==1
assert now.split(end,1)[1].lstrip('\n')==old.split('# 当前接手状态',1)[1].lstrip('\n')
for p in HERE.glob('*.py'):ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
print(json.dumps(dict(passed=True,artifacts=len(m['artifacts']),strictSlots=250,strictActions=136511,
    sourceFreezesUnchanged=True,currentHistoricalContentUnchanged=True,fullHistoricalSnapshotPassed=False,
    missingHistoricalCaches=80,stage3Unchanged=True,newTrainingCachePassed=True,promotionRecommended=False),ensure_ascii=False))
