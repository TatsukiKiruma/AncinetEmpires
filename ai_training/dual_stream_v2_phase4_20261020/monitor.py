"""只读显示本次两臂评测进度，不改变评测或校准。"""
import collections
import json
from pathlib import Path
DIR = Path(__file__).resolve().parent
rows = [json.loads(f.read_text('utf-8')) for f in (DIR / 'battles').glob('*/result.json')]
summary = []
for model in ['dual_v2_stage4_pure', 'dual_v2_stage4_turn_search']:
    r = [x for x in rows if x['slot']['model'] == model]
    summary.append(dict(model=model, completed=len(r), classifications=dict(collections.Counter(x['classification'] for x in r)), actions=sum(x['actions'] for x in r), witnesses=sum(json.loads((DIR / 'battles' / x['slot']['id'] / 'strict-replay.json').read_text('utf-8')).get('witnessActions', 0) for x in r if (DIR / 'battles' / x['slot']['id'] / 'strict-replay.json').exists())))
active = {f.parent.name: json.loads(f.read_text('utf-8')) for f in (DIR / 'battles').glob('*/progress.json') if not f.with_name('result.json').exists()}
print(json.dumps(dict(summary=summary, active=active), ensure_ascii=False))
