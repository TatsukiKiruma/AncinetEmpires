"""统计标签、教师评分与模型平分偏差；仅使用抽样集，不改变标签。"""
import json
from collections import defaultdict, Counter
from pathlib import Path

root = Path('training_runs/iteration_20260918')
model = json.loads(Path('training_runs/models/sd-bc-v3-20260918-011742.json').read_text(encoding='utf-8'))
groups = defaultdict(Counter)
for split in ['train', 'validation']:
    with (root / f'{split}.jsonl').open(encoding='utf-8') as stream:
        for line in stream:
            s = json.loads(line)
            plan = s['scenario']['id'].split(':')[1]
            c = s['candidates']
            label = next(v for v in c if v['actionCode'] == s['label']['actionCode'])
            scored = [v for v in c if v.get('teacherScore') is not None]
            weights = model['weights']
            scores = [sum(weights[i] * v for i, v in x['features']) for x in c]
            maximum = max(scores)
            top = [i for i, x in enumerate(scores) if abs(x - maximum) < 1e-9]
            label_index = c.index(label)
            for key in [f'{split}:all', f'{split}:{plan}']:
                g = groups[key]
                g['samples'] += 1
                g['turnAtLeast80'] += s['turn'] >= 80
                g['turnAtLeast100'] += s['turn'] >= 100
                g['turnAtLeast130'] += s['turn'] >= 130
                g['labelFirst'] += label_index == 0
                g['allTeacherScoresPresent'] += len(scored) == len(c)
                g['labelLowTempo'] += label['actionCode'].split(':')[0] in ['wait', 'end_turn', 'heal', 'repair', 'support']
                g['baselineCorrect'] += max(range(len(c)), key=lambda i: scores[i]) == label_index
                g['topScoreTied'] += len(top) > 1
                g['labelInTopTie'] += label_index in top and len(top) > 1
                if scored:
                    best = max(scored, key=lambda x: x['teacherScore'])
                    gap = best['teacherScore'] - label['teacherScore']
                    g['teacherFirstDifferentFromLabel'] += best['actionCode'] != label['actionCode']
                    g['teacherBestTied'] += sum(v['teacherScore'] == best['teacherScore'] for v in scored) > 1
                    g['labelBelowTeacherBest'] += gap > 1e-9
                    g['labelTeacherGapOver25'] += gap > 25
                    g['labelTeacherGapOver1000'] += gap > 1000
                    g['lowTempoLabelAgainstTeacherPressure'] += label['actionCode'].split(':')[0] in ['wait', 'end_turn', 'heal', 'repair', 'support'] and best['actionCode'].split(':')[0] in ['attack', 'capture', 'destroy_town'] and gap > 25
(root / 'label-audit.json').write_text(json.dumps(dict(groups), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in groups.items() if k.endswith(':all')}, ensure_ascii=False))
