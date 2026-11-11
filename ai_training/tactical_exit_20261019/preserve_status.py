"""保存状态页立项前原文；只移除本阶段新增段并核对原SHA。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
p=(ROOT/'ai_training/status/CURRENT.md').read_bytes();start=p.index(b'<!-- tactical-exit-20261019 -->');end=p.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->')
expected=json.loads((HERE/'PRESERVE.json').read_text())['ai_training/status/CURRENT.md']['sha256']
for n in range(12):
    candidate=p[:start]+p[end+n:]
    if hashlib.sha256(candidate).hexdigest()==expected:
        (HERE/'public_before/CURRENT.md.snapshot').write_bytes(candidate);print('状态页原文SHA核对通过');break
else:raise RuntimeError('原状态页恢复SHA不匹配')
