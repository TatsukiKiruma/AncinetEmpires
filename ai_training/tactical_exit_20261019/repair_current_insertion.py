"""移动本阶段插入块，并且只撤掉已证实由插入造成的三个空白差异。"""
from pathlib import Path
import difflib,json
HERE=Path(__file__).resolve().parent;p=HERE.parent/'status/CURRENT.md'
old=(HERE/'public_before/CURRENT.md.snapshot').read_bytes();current=p.read_bytes()
a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->')
block=current[a:b];outside=current[:a]+current[b:]
ops=[v for v in difflib.SequenceMatcher(None,old,outside,autojunk=False).get_opcodes() if v[0]!='equal']
assert [(t,i,j,outside[k:l]) for t,i,j,k,l in ops]==[('insert',20,20,b'\r'),('insert',21,21,b'\r'),('insert',132,132,b'\r\n\r\n')],ops
clean=outside
for t,i,j,k,l in reversed(ops):clean=clean[:k]+clean[l:]
assert clean==old
snapshot=HERE/'revisions/r11/CURRENT-before-insertion-repair.snapshot';snapshot.write_bytes(current)
insert=clean.index(b'<!-- tactical-value-search-20261018 -->')
new=clean[:insert]+block+b'\r\n\r\n'+clean[insert:]
p.write_bytes(new)
assert p.read_bytes().replace(block+b'\r\n\r\n',b'',1)==old
receipt=dict(passed=True,originalBytes=len(old),originalOutsidePreservedExactly=True,originalPhase4BlockContiguous=True,priorSnapshot=str(snapshot.relative_to(HERE)),onlyPriorDifferences='两个新增CR字节和两个新增空行，已逐字节验证后撤除')
(HERE/'revisions/r11/current-insertion-integrity.json').write_text(json.dumps(receipt,ensure_ascii=False),encoding='utf-8')
print(json.dumps(receipt,ensure_ascii=False))
