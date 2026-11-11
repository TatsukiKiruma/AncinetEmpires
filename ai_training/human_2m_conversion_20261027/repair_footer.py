"""修正本次转换包尾的字段覆盖；仅重新压缩，不重新生成状态。"""
import gzip
import json
import hashlib
from pathlib import Path

OUT=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest=json.loads((OUT/'CONVERSION.json').read_text(encoding='utf8'))
changes=[]
for receipt in manifest['reports']:
    p=(OUT/receipt['output']).resolve()
    assert p.is_relative_to(OUT/'states') and sha(p)==receipt['outputSha256']
    before=sha(p);temporary=p.with_suffix(p.suffix+'.tmp');changed=0
    with gzip.open(p,'rt',encoding='utf8') as source,gzip.open(temporary,'wt',encoding='utf8',compresslevel=4) as target:
        for line in source:
            row=json.loads(line)
            if row.get('sourceId')==receipt['sourceId'] and row.get('kind')==receipt['kind'] and 'complete' in row:
                row['sourceKind']=row['kind'];row['kind']='end';changed+=1
                line=json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n'
            target.write(line)
    assert changed==1
    temporary.replace(p)
    receipt['outputSha256']=sha(p);receipt['bytes']=p.stat().st_size
    (OUT/'receipts'/f"{receipt['sourceId']}.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    changes.append({'sourceId':receipt['sourceId'],'beforeSha256':before,'afterSha256':receipt['outputSha256'],'stateRowsUnchanged':True})
(OUT/'CONVERSION.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'FOOTER_REPAIR.json').write_text(json.dumps({'reason':'对象展开将kind=end覆盖为来源类型；仅修正包尾标签','changes':changes,'gameActionsExecuted':0},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('repaired',len(changes))
