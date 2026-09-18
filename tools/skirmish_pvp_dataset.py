"""按整局分区组装配对的 v3/v4 数据，真人占比通过样本数量控制。"""
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path('training_runs/pvp_navigation_20260918')
summary = json.loads((ROOT / 'feature-summary.json').read_text(encoding='utf-8'))
manifest = {'seed': 20260918, 'humanSampling': '胜方真人动作，训练按对局均匀抽样；相对 AI 单样本权重为 1', 'files': {}}

def write(name, rows):
    dest = ROOT / name
    dest.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    manifest['files'][name] = {'samples': len(rows), 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()}

for version in ('v3', 'v4'):
    groups = defaultdict(list)
    human_games = []
    for row in sorted(summary, key=lambda r: (r['kind'], r['id'])):
        lines = [l for l in (ROOT / 'features' / f"{row['kind']}-{row['id']}-{version}.jsonl").read_text(encoding='utf-8').splitlines() if l.strip()]
        assert len(lines) == row['samples']
        groups[row['kind'], row['split']].extend(lines)
        if row['kind'] == 'pvp' and row['split'] == 'train' and lines:
            human_games.append(lines)
    for (kind, split), lines in groups.items():
        write(f'{kind}-{split}-{version}.jsonl', lines)
    ai = groups['ai', 'train']
    for ratio in (0, 0.1, 0.25):
        rng = random.Random(20260918)
        human_count = round(len(ai) * ratio / (1 - ratio))
        mixed = ai.copy()
        for i in range(human_count):
            game = human_games[i % len(human_games)]
            mixed.append(rng.choice(game))
        rng.shuffle(mixed)
        write(f'train-{version}-p{round(ratio*100)}.jsonl', mixed)
    # 验证打分固定各取相同数量的人类与 AI 样本，不使用最终测试集选参。
    rng = random.Random(20260919)
    a, h = groups['ai', 'validation'].copy(), groups['pvp', 'validation'].copy()
    rng.shuffle(a); rng.shuffle(h)
    count = min(len(a), len(h))
    assert count > 0
    balanced = a[:count] + h[:count]
    rng.shuffle(balanced)
    write(f'select-validation-{version}.jsonl', balanced)

# 两套特征使用完全相同的动作标签与候选顺序，便于解释差异。
for split in ('train-v3-p0', 'train-v3-p10', 'train-v3-p25', 'select-validation-v3'):
    v4 = split.replace('v3', 'v4')
    with (ROOT/f'{split}.jsonl').open(encoding='utf-8') as a, (ROOT/f'{v4}.jsonl').open(encoding='utf-8') as b:
        for la, lb in zip(a,b,strict=True):
            x,y=json.loads(la),json.loads(lb)
            assert x['label']==y['label'] and x['source']==y['source']
            assert [c['actionCode'] for c in x['candidates']]==[c['actionCode'] for c in y['candidates']]
(ROOT/'dataset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
