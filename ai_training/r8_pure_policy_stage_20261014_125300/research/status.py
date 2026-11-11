"""压缩读取当前进度，不从文件时间推断任务成功。"""
import pathlib,json,collections,time
S=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf8'))
games=[]
for p in (S/'data/raw').glob('*.json'):
    try:games.append(read(p))
    except (ValueError,OSError):pass
panels={p.parent.name:read(p)['counts'] for p in (S/'runs').glob('dev_*/summary.json')}
b=read(S/'identity/budget.json');r={'elapsedWallMinutes':round((time.time()-b['startedUnix'])/60,1),'collectionGames':len(games),'mapGames':dict(collections.Counter(g['mapName'] for g in games)),'collectionOutcomes':dict(collections.Counter(g['outcome'] for g in games)),'completedDevPanels':panels,'trainingRuns':[p.parent.name for p in (S/'checkpoints').glob('*/last.pt')],'round1Complete':(S/'evidence/round1_completed.json').exists()}
(S/'identity/live_status.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(r,ensure_ascii=False,indent=2))
