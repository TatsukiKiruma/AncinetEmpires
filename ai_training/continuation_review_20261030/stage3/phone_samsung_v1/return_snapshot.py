"""在手机专属导出目录冻结只读记录，不暂停或改写训练任务。"""
import hashlib
import json
from pathlib import Path
import time

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def collect(root,destination):
    root=Path(root);destination=Path(destination);work=root/'work';target=destination/'records'
    target.mkdir(exist_ok=False)
    captured=[]
    def capture(source,name):
        if not source.is_file():return
        before=source.stat();data=source.open('rb').read(before.st_size)
        trimmed=0
        if source.suffix=='.jsonl' and data and not data.endswith(b'\n'):
            position=data.rfind(b'\n')+1;trimmed=len(data)-position;data=data[:position]
        output=target/name;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(data)
        captured.append(dict(source=str(source),file='records/'+name,sourceSizeAtRead=before.st_size,capturedBytes=len(data),incompleteTailDroppedBytes=trimmed))
    for source in work.iterdir():
        if source.is_file() and source.suffix in ['.py','.json','.mjs']:capture(source,'work/'+source.name)
    for source in (work/'training').iterdir():
        if source.is_file() and source.suffix in ['.json','.jsonl','.log'] and source.name!='last.json':capture(source,'training/'+source.name)
    for source in root.iterdir():
        if source.is_file() and source.suffix in ['.sh','.json','.jsonl']:capture(source,'controller/'+source.name)
    for source in (root/'logs').glob('*.log'):capture(source,'logs/'+source.name)
    files=[]
    for source in sorted(destination.rglob('*')):
        if source.is_file():files.append(dict(file=source.relative_to(destination).as_posix(),bytes=source.stat().st_size,sha256=sha(source)))
    manifest=dict(schema='samsung-return-snapshot-v1',requestedUpdate=4400,exact4400Exists=False,
        checkpointUpdates=[4390,4500],createdEpoch=time.time(),files=files,captures=captured,
        sourceRoot=str(root),trainingWasNotPaused=True,sealedAccess=0,
        inputData='本机已有相同冻结训练集；本包带逐文件清单和手机完整输入校验收据，取回后核对本机原件。')
    output=destination/'SNAPSHOT_MANIFEST.json';output.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(dict(files=len(files),bytes=sum(f['bytes'] for f in files),manifestSha256=sha(output)),ensure_ascii=False))
