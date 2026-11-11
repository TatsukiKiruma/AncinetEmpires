"""读取当前112槽的紧凑实时快照，不改变任何评测或训练状态。"""
import json
from collections import Counter
from run_league import DIR, read, sha

folder = DIR / 'generations/gen_03'; arena = folder / 'arena'; plan = read(arena / 'plan.json')
groups = {}; strict = 0; active = []; rows = []; model = sha(folder / 'model.bin')
for slot in plan['slots']:
    location = arena / 'battles' / slot['id']; path = location / 'result.json'
    if path.exists():
        row = read(path); assert row['modelSha256'] == model; rows.append(row)
        key = slot['mode'] + '/' + slot['panel']; groups.setdefault(key, Counter())[row['classification']] += 1
        proof = location / 'strict-replay.json'
        strict += int(proof.exists() and read(proof)['passed'])
    elif (location / 'started.json').exists():
        progress = read(location / 'progress.json') if (location / 'progress.json').exists() else {}
        active.append(dict(id=slot['id'], **progress))
print(json.dumps(dict(completed=len(rows), target=len(plan['slots']), strict=strict, outcomes=dict(Counter(r['classification'] for r in rows)), groups={k:dict(v) for k,v in groups.items()}, active=active, modelSha256=model), ensure_ascii=False))
