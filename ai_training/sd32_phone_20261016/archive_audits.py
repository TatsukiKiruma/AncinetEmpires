import json,hashlib
from device import ROOT,REMOTE,adb,snapshot,transfer
assert (ROOT/'data-audit.json').exists()
receipt=ROOT/'phone-audit-archive.json'
if receipt.exists():
    saved=json.loads(receipt.read_text(encoding='utf-8'))
    for entry in saved['artifacts']:assert adb('shell','sha256sum',entry['remotePath']).split()[0]==entry['sha256']
else:
    names=['row-audit.jsonl.gz','input-audit.jsonl.gz'];before=snapshot();total=sum((ROOT/n).stat().st_size for n in names)
    assert before['remoteBytes']+total<490*1024**2 and before['freeBytes']-total>2*1024**3
    transfer(names)
    entries=[dict(path=n,remotePath=REMOTE+'/'+n,bytes=(ROOT/n).stat().st_size,sha256=hashlib.sha256((ROOT/n).read_bytes()).hexdigest()) for n in names]
    saved=dict(passed=True,artifacts=entries,before=before,after=snapshot(),reason='本阶段审计原件迁存手机独立目录，逐字节SHA验证后移除PC重复副本；旧数据不动',recoverCommand='adb -s c2357770 pull <remotePath> <path>')
    receipt.write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8')
    # 只移除本次新建且已完整迁存手机的PC重复副本，保留逐字节恢复路径与摘要。
    for n in names:(ROOT/n).unlink()
print(json.dumps(dict(passed=True,archivedBytes=sum(e['bytes'] for e in saved['artifacts']))))
