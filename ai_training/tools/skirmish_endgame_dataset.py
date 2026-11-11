"""固定基础样本，混入经过自然终局验证的收官片段，来源对局不跨分区。"""
import json,random,hashlib
from pathlib import Path
root=Path('training_runs/endgame_20260918');base=Path('training_runs/pvp_navigation_20260918')
manifest=json.loads((root/'curriculum-manifest.json').read_text(encoding='utf-8'))
used=[x for x in manifest if x['accepted']]
groups={s:{x['group'] for x in used if x['split']==s} for s in ['train','validation']}
assert groups['train'] and groups['validation'] and not groups['train']&groups['validation']
def lines(p):return [x for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
ai=lines(base/'ai-train-v4.jsonl');av=lines(base/'ai-validation-v4.jsonl')
by_split={s:[lines(Path(x['file'])) for x in used if x['split']==s] for s in groups}
files={}
def write(name,data):
 p=root/name;p.write_text('\n'.join(data)+'\n',encoding='utf-8');files[name]=dict(samples=len(data),sha256=hashlib.sha256(p.read_bytes()).hexdigest())
for split,games in by_split.items():write(f'curriculum-{split}.jsonl',[row for game in games for row in game])
for ratio in [10,25]:
 rng=random.Random(2026091804);count=round(len(ai)*ratio/(100-ratio));mixed=ai.copy();games=by_split['train']
 for i in range(count):mixed.append(rng.choice(games[i%len(games)]))
 rng.shuffle(mixed);write(f'train-p{ratio}.jsonl',mixed)
rng=random.Random(2026091805);rng.shuffle(av)
cv=[row for game in by_split['validation'] for row in game];rng.shuffle(cv)
count=min(128,len(cv));validation=av[:count*4]+cv[:count];rng.shuffle(validation);write('selection-validation.jsonl',validation)
(root/'training-manifest.json').write_text(json.dumps(dict(files=files,groups={s:sorted(g) for s,g in groups.items()},validationWeight={'ai':0.8,'curriculum':0.2}),indent=2),encoding='utf-8')
print(files)
