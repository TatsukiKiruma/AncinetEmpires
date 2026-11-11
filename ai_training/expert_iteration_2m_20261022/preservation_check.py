"""只读核验前置保留清单，沿用已授权删除账本，不改写前置证据。"""
import hashlib
import json
from pathlib import Path
DIR=Path(__file__).resolve().parent
PRE=DIR.parent/'pretrain_preflight_20261022'


def main():
    read=lambda n:json.loads((PRE/n).read_text('utf-8-sig'))
    manifest=read('ASSET_MANIFEST.json');cleanup=read('CLEANUP_MANIFEST.json')
    candidates={e['path'].lower():e for e in cleanup['candidates']}
    ledger=[json.loads(line) for line in (PRE/'cleanup-deletion-ledger.jsonl').read_text('utf-8-sig').splitlines() if line]
    deleted=set()
    for row in ledger:
        if row['result']!='deleted':continue
        key=row['path'].lower();assert key in candidates and candidates[key]['sha256']==row['sha256'],'实际删除必须有原授权和SHA依据'
        deleted.add(key)
    assert len(deleted)==read('CLEANUP_RESULT.json')['deletedFiles']
    errors=[];checked=0;status=[]
    for e in manifest['files']:
        p=Path(e['path'])
        if str(p).lower() in deleted:continue
        if p==DIR.parent/'status/CURRENT.md':status.append(str(p));continue
        checked+=1
        if not p.exists():errors.append(dict(path=str(p),reason='保留文件缺失'));continue
        digest=hashlib.sha256()
        with p.open('rb') as f:
            for block in iter(lambda:f.read(4*1024*1024),b''):digest.update(block)
        if digest.hexdigest()!=e['sha256']:errors.append(dict(path=str(p),reason='SHA变化'))
    result=dict(passed=not errors,checked=checked,authorizedHistoricalDeleted=len(deleted),allowedCurrentStatusUpdates=status,errors=errors)
    target=DIR/'historical-preservation-corrected.json';assert not target.exists(),'拒绝覆盖历史保全核验'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({k:len(v) if k=='errors' else v for k,v in result.items()},ensure_ascii=False))
    assert not errors


if __name__=='__main__':main()
