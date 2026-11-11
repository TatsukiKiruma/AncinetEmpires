"""区分阶段3保全、新训练缓存身份与独立清理导致的历史缺件。"""
from pathlib import Path
import json,hashlib,shutil,datetime

HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

def run():
    missing=[];modified=[];snapshots={}
    for name in ['PRESERVE.json','stage3-preserve-all.json']:
        expected=read(HERE/name);absent=[];different=[]
        for path,digest in expected.items():
            p=ROOT/path
            if not p.is_file():absent.append(path)
            elif sha(p)!=digest:different.append(path)
        snapshots[name]=dict(files=len(expected),missing=absent,modified=different,passed=not (absent or different))
        missing.extend(absent);modified.extend(different)
    # 不放宽原快照，也不把缺件记为通过；仅允许首次失败中已记录的同一批缺件。
    first=read(HERE/'preservation-first-failure.json')['changed']
    assert sorted(set(missing))==sorted(first) and len(first)==80
    assert not modified and snapshots['stage3-preserve-all.json']['passed']
    assert all(Path(p).parent==Path('ai_training/tactical_conditional_20261018/packed') and Path(p).suffix=='.pkl' for p in first)
    source=ROOT/'captures/storage-cleanup-20261018-02/result.json';cleanup=read(source)
    assert cleanup['categories']['Tier4_tactical_conditional_cache']['files']==163
    copy=HERE/'external-storage-cleanup-result.snapshot.json'
    if copy.exists():assert sha(copy)==sha(source)
    else:shutil.copyfile(source,copy)
    files=read(HERE/'contract.json')['files'];wrong=[]
    for f in files:
        p=Path(f['packedPath'])
        if p.resolve().parent!=(HERE/'packed').resolve() or sha(p)!=f['packedSha256']:wrong.append(f['parent'])
    assert len(files)==600 and not wrong
    result=dict(passed=False,fullHistoricalSnapshotPassed=False,stage3Unchanged=True,newTrainingCachePassed=True,
        snapshots=snapshots,missingHistoricalFiles=first,modifiedHistoricalFiles=[],newTrainingCaches=len(files),
        independentCleanupEvidence=dict(path=str(source.relative_to(ROOT)),sha256=sha(source),preservedAt=copy.name,
            category=cleanup['categories']['Tier4_tactical_conditional_cache'],exactPerFileAttributionAvailable=False),
        interpretation='原快照不改写。80个阶段2缓存缺失；独立清理记录列出同类缓存清理，但缺逐文件清单，不能严格逐件归因。阶段3全目录及本次600份独立缓存SHA通过。不重建缺失旧缓存，不回滚独立清理。',
        checkedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    (HERE/'preservation-check.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    return result

if __name__=='__main__':
    r=run();print(json.dumps({k:r[k] for k in ['fullHistoricalSnapshotPassed','stage3Unchanged','newTrainingCachePassed']},ensure_ascii=False))
