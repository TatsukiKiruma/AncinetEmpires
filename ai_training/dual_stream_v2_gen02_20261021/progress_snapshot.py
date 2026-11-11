"""只读正式收据，显示本轮进度，不触碰实验输入。"""
import json
import time
from collections import Counter
from pathlib import Path

here = Path(__file__).resolve().parent
status = json.loads((here / 'pipeline-status.json').read_text('utf-8'))
arena = here / 'generations/gen_02/arena'
groups = {}
pending = []
if (arena / 'plan.json').exists():
    plan = json.loads((arena / 'plan.json').read_text('utf-8'))
    for slot in plan['slots']:
        p = arena / 'battles' / slot['id'] / 'result.json'
        if p.exists():
            result = json.loads(p.read_text('utf-8'))
            key = slot['mode'] + '/' + slot['panel']
            groups.setdefault(key, Counter())[result['classification']] += 1
        elif (p.parent / 'progress.json').exists():
            pending.append(dict(id=slot['id'], **json.loads((p.parent / 'progress.json').read_text('utf-8'))))
print(json.dumps(dict(stage=status['stage'], stageSeconds=round(time.time() - status.get('startedAt', status.get('completedAt', time.time()))), completed=sum(sum(v.values()) for v in groups.values()), pending=pending, groups=groups), ensure_ascii=False))
