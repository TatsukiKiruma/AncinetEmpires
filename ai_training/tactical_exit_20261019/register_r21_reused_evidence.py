"""给恢复批次的135个逐字节副本补充复用身份，避免交付重复计作新提交动作。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r21/resume1'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
manifest=read(REV/'retained-evidence.json');protocol=read(REV/'resume-protocol.json');grouped={}
for entry in manifest:
    target=HERE/entry['target'];assert target.is_file();grouped.setdefault(target.parent,{})[target.name]=entry['sha256']
assert len(grouped)==135
for target,files in grouped.items():
    old=HERE/'teacher-r21-battles/slots'/target.name;r=read(target/'result.json');s=read(target/'strict-replay.json')
    assert s['passed'] and s['actions']==r['actions'] and read(old/'result.json')==r
    receipt=dict(reused=True,source=str(old),slot=r['slot'],files=files,sourceStrictSha256=files['strict-replay.json'],reason='用户停止后保留的已完成局逐字节复制；不计为新的独立对局或再次提交动作',sourceManifest='revisions/r21/resume1/retained-evidence.json',sourceManifestSha256=hashlib.sha256((REV/'retained-evidence.json').read_bytes()).hexdigest(),strictReplayAlreadyPassed=True)
    p=target/'reused-evidence.json'
    if p.exists():assert read(p)==receipt
    else:
        with p.open('x',encoding='utf-8') as out:json.dump(receipt,out,ensure_ascii=False)
print(dict(passed=True,retainedSlots=len(grouped),originalResultsUnchanged=True))
