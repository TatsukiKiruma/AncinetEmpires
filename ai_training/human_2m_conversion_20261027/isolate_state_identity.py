"""依据转换时已保存的摘要结果收紧用途；不重建或执行状态。"""
import gzip
import json
import hashlib
import collections
from pathlib import Path

OUT=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest=json.loads((OUT/'CONVERSION.json').read_text(encoding='utf8'));changes=[]
for receipt in manifest['reports']:
    if not receipt['sourceStateDifferent']:continue
    p=(OUT/receipt['output']).resolve();assert p.is_relative_to(OUT/'states') and sha(p)==receipt['outputSha256']
    before=sha(p);tmp=p.with_suffix('.gz.tmp');counts=collections.Counter();changed=0
    with gzip.open(p,'rt',encoding='utf8') as src,gzip.open(tmp,'wt',encoding='utf8',compresslevel=4) as dst:
        for line in src:
            row=json.loads(line)
            if row['kind']=='sample':
                if row.get('sourceBeforeHash') and not row['sourceStateMatches'] and row['admission']!='excluded':
                    row['admission']='pending_state_identity';changed+=1
                    line=json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n'
                counts[row['admission']]+=1
            elif row['kind']=='end':
                for key,admission in [('trainAdmittedRows','train_admitted'),('devRows','dev'),('pendingRows','pending_full_exclusion'),('excludedRows','excluded'),('stateIdentityPendingRows','pending_state_identity')]:
                    receipt[key]=counts[admission];row[key]=counts[admission]
                line=json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n'
            dst.write(line)
    tmp.replace(p);receipt['outputSha256']=sha(p);receipt['bytes']=p.stat().st_size
    (OUT/'receipts'/f"{receipt['sourceId']}.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    changes.append({'sourceId':receipt['sourceId'],'changedAdmissionRows':changed,'beforeSha256':before,'afterSha256':receipt['outputSha256'],'stateAndActionUnchanged':True})
(OUT/'CONVERSION.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'STATE_IDENTITY_ISOLATION.json').write_text(json.dumps({'reason':'前态摘要不一致不能由旧验收覆盖；可能含状态字段/规则版本差异，不直接认定动力学错误','gameActionsExecuted':0,'changes':changes},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('isolated',sum(x['changedAdmissionRows'] for x in changes))
