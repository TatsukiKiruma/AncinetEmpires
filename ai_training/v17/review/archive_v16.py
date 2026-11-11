"""保留V16原目录，创建精选证据包及全量文件SHA索引；已有包拒绝覆盖。"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil
import zipfile

ROOT=Path(__file__).resolve().parents[2]
RUN=ROOT/'v16/out/v16_20260926_core'
OUT=ROOT/'v17/archive/v16_20260926_core_reviewed'
ZIP=OUT.with_suffix('.zip')
if OUT.exists() or ZIP.exists(): raise SystemExit('归档目标已存在，拒绝覆盖。')
OUT.mkdir(parents=True)

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

files=set(p for p in RUN.rglob('*') if p.is_file())
files.update(ROOT.glob('v16/*.md'))
files.update(ROOT.glob('v16/tools/*'))
files.update(p for p in (ROOT/'src/game').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files.update(ROOT.glob('python/*.py'))
files.update(ROOT.glob('v17/*.md'))
files.update(p for p in (ROOT/'v17/review').glob('*') if p.is_file())
files={p for p in files if p.is_file()}
entries=[]
for p in sorted(files):
    rel=p.relative_to(ROOT).as_posix(); size=p.stat().st_size; digest=sha(p)
    embed=size<=8*1024*1024
    if embed:
        target=OUT/'payload'/rel; target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(p,target)
        if sha(target)!=digest: raise RuntimeError(f'复制期间文件发生变化：{rel}')
    entries.append({'path':rel,'bytes':size,'sha256':digest,'embedded':embed})

original=json.loads((RUN/'identity/source_manifest.json').read_text(encoding='utf-8'))
mismatches=[]
for group in original['groups'].values():
    for rel,expected in group.get('files',{}).items():
        p=ROOT/rel
        actual=sha(p) if p.exists() else None
        if actual!=expected: mismatches.append({'path':rel,'frozenSha256':expected,'auditSha256':actual})
manifest={'schema':'v17_v16_audit_archive_1','createdAt':datetime.now(timezone.utc).isoformat(),
    'verdict':'PARTIAL_EXECUTION_NO_PROMOTION','championDevWins':5,'goalConfirmWins':18,'goalGames':20,
    'sourceRun':RUN.relative_to(ROOT).as_posix(),'originalSourceDifferences':mismatches,
    'scope':'精选证据和模型内嵌；大型数据外置原路径，全部列SHA；当前源码快照非历史来源证明。',
    'embeddedFiles':sum(e['embedded'] for e in entries),'externalFiles':sum(not e['embedded'] for e in entries),
    'files':entries}
(OUT/'archive_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(ZIP,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(OUT).as_posix())
with zipfile.ZipFile(ZIP) as z:
    bad=z.testzip()
    if bad: raise RuntimeError(f'压缩包CRC失败：{bad}')
receipt={'zip':ZIP.relative_to(ROOT).as_posix(),'zipBytes':ZIP.stat().st_size,'zipSha256':sha(ZIP),
         'embeddedFiles':manifest['embeddedFiles'],'externalFiles':manifest['externalFiles'],
         'sourceDifferences':mismatches,'zipIntegrity':'PASS'}
ZIP.with_suffix('.receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(receipt,ensure_ascii=True))
