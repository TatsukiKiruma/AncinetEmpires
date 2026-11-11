"""保留串行控制原件，建立同一100k日程的等价批处理桥接证据。"""
import hashlib
import json
from pathlib import Path
import shutil
HERE=Path(__file__).resolve().parent
OLD=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1')
NEW=OLD/'run-v2-batch8'
def read(p):
    return json.loads(p.read_text('utf-8-sig'))
def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()
def save(p,v):
    p.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8')
latest=read(OLD/'training/LATEST.json')
ledger=read(OLD/'training/ARM_BUDGET.json')
assert latest['updates']==84 and ledger['status']=='explicit_stop'
assert sha(Path(latest['file']))==latest['sha256']
assert read(HERE/'RAGGED_VERIFIED.json')['relativeGradientL2']<1e-4
archive=HERE/'revisions/serial-v1'
archive.mkdir(exist_ok=False)
for file in HERE.iterdir():
    if file.is_file():
        shutil.copy2(file,archive/file.name)
NEW.mkdir(exist_ok=False)
for folder,names in [('training',['ARM_BUDGET.json','METRICS.jsonl']),('baseline-offline',['RESULT.json']),
                     ('dev-baseline',['SUMMARY.json','RESULTS.json']),('dev-cache',['COMPLETE.json'])]:
    (NEW/folder).mkdir()
    for name in names:
        shutil.copy2(OLD/folder/name,NEW/folder/name)
baselines={}
for folder in ['baseline-offline','dev-baseline','dev-cache']:
    for p in (NEW/folder).iterdir():
        baselines[str(p)]=dict(source=str(OLD/folder/p.name),sha256=sha(p))
save(HERE/'BASELINE_REUSE.json',dict(oldContractSha256=sha(HERE/'SCIENCE_CONTRACT.json'),files=baselines,
    method='原始2414、面板、推理编码与无搜索算法均不变，复用已完成1299态和54局原件；未重新声明为新实战'))
save(HERE/'PERFORMANCE_REVISION.json',dict(schema='stage3-batch8-equivalent-control-v2',
    oldContractSha256=sha(HERE/'SCIENCE_CONTRACT.json'),checkpoint=latest,
    originalBudgetLedger=str(OLD/'training/ARM_BUDGET.json'),continuedArmId=ledger['armId'],
    minimumConsumedWallSeconds=ledger['consumedWallSeconds'],configurationSha256=sha(HERE/'CONFIG.json'),
    updatesAlreadyComplete=84,scheduleTotalUpdates=100000,resumeWithoutScheduleChange=True,
    originalOutputRoot=str(OLD),newOutputRoot=str(NEW),
    reason='异尺寸逻辑微批分裂导致实测预算不可达；改用严格原图边界的真正batch8并行编码和有界预取',
    numericalEvidenceSha256=sha(HERE/'RAGGED_VERIFIED.json'),
    sealedRawAccess=0,sealedForward=0,oldOutputsModified=False))
print(json.dumps(dict(archive=str(archive),newOutput=str(NEW),continuedUpdates=84)))
