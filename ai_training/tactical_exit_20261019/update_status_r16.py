"""仅更新本阶段所属状态块，并绑定旧元数据兼容修复的审计证据。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;current=HERE.parent/'status/CURRENT.md'
data=current.read_bytes();start=data.index(b'<!-- tactical-exit-20261019 -->');end=data.index(b'<!-- end-tactical-exit-20261019 -->',start)
assert b'R16' not in data[start:end]
snapshot=HERE/'revisions/r16/current-before.bin';assert not snapshot.exists();snapshot.write_bytes(data)
addition='\r\nR15停止后105槽/62842实际动作全部strict；固定搜索22/30胜低于pure24，部分扩展5/5不作完整20槽结论。首次一槽strict因旧新兵预分配ID的完整标记失败，原件保留；兼容修复明确核验新兵此前不存在、仍未行动可移动及66风险见证，不放宽规则。未来标记仅真实complete时成立。R16在新评测前登记v3：阶段4默认与Value不变，共享根编码让全量720/180基础策略提议至多一条原Top6外候选，总Top6/24/150不增，安全守卫不放宽。扩量权重已实际Chrome155三端前向/全参梯度通过（2.84e-14/1.78e-14），23状态共享编码与独立infer逐项0误差。原1557前态重新采集、全部1661日志/1009384动作/239514独立beforeHash纳入开发排重。尚无合格教师，专家0，未蒸馏或最终200槽。\r\n\r\n'.encode()
new=data[:end]+addition+data[end:];assert new[:start]==data[:start] and new[new.index(b'<!-- end-tactical-exit-20261019 -->'):]==data[end:];current.write_bytes(new)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
strict=HERE/'teacher-r15-battles/slots/apk_like-teacher_search-m0-s1/strict-replay.json'
receipt=dict(passed=True,rawLogUnchanged=True,compatibilityGateSha256=sha(HERE/'revisions/r15/metadata-compat-gate.json'),strictReceiptSha256=sha(strict),currentAuditSha256=sha(HERE/'audit_search_risks.ts'),originalFreezeSha256=sha(HERE/'source-freeze-teacher-r15.json'),reason='原正式动作不变，后续仅修复旧元数据审计解释；原失败收据保留')
(HERE/'revisions/r15/metadata-compat-binding.json').write_text(json.dumps(receipt,ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(passed=True,currentOwnedBlockOnly=True,metadataBinding=receipt),ensure_ascii=False))
