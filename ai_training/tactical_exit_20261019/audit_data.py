"""逐分片身份、父局隔离及可信标签分母审计。"""
from pathlib import Path
import json,gzip,hashlib,pickle
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sel=read(HERE/'selection.json')['parents'];train={p['parentId'] for p in sel if p['split']=='train'};dev={p['parentId'] for p in sel if p['split']=='validation'}
assert len(train)==720 and len(dev)==180 and not train&dev
rows=winning=losing=unknown=0
for p in sel:
    receipt=read(HERE/f"packed/{p['parentId']}.receipt.json")
    assert receipt['currentStrictLabels'] and receipt['lossless']
    assert hashlib.sha256(Path(receipt['path']).read_bytes()).hexdigest()==receipt['sha256']
    assert hashlib.sha256(Path(receipt['packedPath']).read_bytes()).hexdigest()==receipt['packedSha256']
    with Path(receipt['packedPath']).open('rb') as f:data=pickle.load(f)
    assert len(data['rows'])==receipt['rows']
    for r in data['rows']:
        assert r['parent']==p['parentId'];assert r['candidates'].shape[1]==151 and len(r['valueSummary'])==36
        assert r['featuresSchema']=='tactics-state-value-v5'
        assert isinstance(r['valueMask'],bool)
        if r['valueMask']:
            assert r['valueTarget'] in [-1,1]
            winning+=r['valueTarget']==1;losing+=r['valueTarget']==-1
        else:assert r['valueTarget'] is None;unknown+=1
        rows+=1
result=dict(passed=True,parents=900,trainParents=720,devParents=180,rows=rows,winningLabels=winning,losingLabels=losing,maskedValueLabels=unknown,fullCandidates=True,splitOverlap=0,currentStrictLabels=True,sourceQualification='inspectAndRead在生成前重新检验每个分片；仅完整自然终局证据可放行Value')
(HERE/'data-audit.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');print(json.dumps(result))
