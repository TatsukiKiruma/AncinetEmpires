"""只读检查CURRENT原有字节与阶段块之外的内容。"""
from pathlib import Path
import json,hashlib,difflib
HERE=Path(__file__).resolve().parent
old=(HERE/'public_before/CURRENT.md.snapshot').read_bytes()
current=(HERE.parent/'status/CURRENT.md').read_bytes()
a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->')
tail=current[b:];head=current[:a]
normalize=lambda x:x.replace(b'\r\n',b'\n')
suffixBytes=0
for x,y in zip(old[::-1],current[::-1]):
    if x!=y:break
    suffixBytes+=1
diff=list(difflib.unified_diff(old.decode('utf-8-sig').splitlines(),(head+tail).decode('utf-8-sig').splitlines(),n=2))
r=dict(originalBytes=len(old),currentBytes=len(current),blockBytes=b-a,unchangedSuffixBytes=suffixBytes,originalCRLF=old.count(b'\r\n'),currentOutsideCRLF=(head+tail).count(b'\r\n'),normalizedOutsideDiff=diff[:40])
print(json.dumps(r,ensure_ascii=False))
