"""核对本阶段标记块外的原文仍逐字节存在，不写CURRENT本体。"""
from pathlib import Path
import hashlib,json,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
before=(HERE/'public_before/CURRENT.md.snapshot').read_bytes();current=(ROOT/'ai_training/status/CURRENT.md').read_bytes()
start=b'<!-- tactical-exit-20261019 -->';end=b'<!-- end-tactical-exit-20261019 -->'
assert current.count(start)==current.count(end)==1 and start not in before
prefix=current[:current.index(start)];suffix=current[current.index(end)+len(end):]
matched=[i for i in range(9) if prefix+suffix[i:]==before]
assert matched,'CURRENT块外原有文本发生变化；不得把该结果记为保留通过'
report=dict(passed=True,originalBytes=len(before),originalSha256=hashlib.sha256(before).hexdigest(),currentSha256=hashlib.sha256(current).hexdigest(),ownedBlockInsertionSeparatorBytes=matched[0],allOriginalOutsideBytesExact=True)
if len(sys.argv)>1:(HERE/sys.argv[1]).write_text(json.dumps(report),encoding='utf-8')
print(report)
