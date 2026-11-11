"""只读汇报本次验收进度，不启动、停止或重试任何评测。"""
import datetime as dt
import json
from pathlib import Path
import time
from shared_read import text

HERE=Path(__file__).resolve().parent
DATA=Path(json.loads((HERE/'PLAN.json').read_text('utf-8'))['data'])


def read(path,default=None):
    if not path.exists():return default
    for _ in range(3):
        try:return json.loads(text(path))
        except (json.JSONDecodeError,PermissionError):time.sleep(.05)
    return default


phase='development'
if (DATA/'FINAL_CANDIDATE_LOCK.json').exists():phase='historical'
if (DATA/'FINAL_TEST_ATTEMPT.json').exists():phase='sealed'
if (DATA/'RUN_CLOSED.json').exists():phase='complete'
if (DATA/'RUN_BLOCKED.json').exists():phase='blocked'
jobs=[]
for name in [f'dev-{u:06d}-prior-{s}' for u in [40000,100000,80000] for s in [.3,1.]]+['historical-final','test-baseline','test-candidate']:
    folder=DATA/name
    if not folder.exists():continue
    # 只读取发布后不再修改的逐局结果；不打开会被原子替换的进度或汇总中间文件。
    values=[read(p) for p in sorted(folder.glob('*/result.json'))]
    values=[v for v in values if v is not None]
    summary=read(folder/'SUMMARY.json')
    active=[]
    for path in folder.glob('*/steps.jsonl'):
        if not path.with_name('result.json').exists():
            active.append(dict(match=path.parent.name,logBytes=path.stat().st_size))
    jobs.append(dict(name=name,completed=len(values),total=40 if name=='historical-final' else 54,
                     natural=sum(v['natural'] for v in values),nonNatural=[v['id'] for v in values if not v['natural']],
                     byPlayers={str(n):sum(v['players']==n for v in values) for n in [2,3,4]},
                     complete=summary is not None,activeGames=active))
print(json.dumps(dict(time=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds'),
                      phase=phase,jobs=jobs,blocked=read(DATA/'RUN_BLOCKED.json'),
                      lock=read(DATA/'FINAL_CANDIDATE_LOCK.json',{}).get('candidate'),
                      closed=read(DATA/'RUN_CLOSED.json')),ensure_ascii=False))
