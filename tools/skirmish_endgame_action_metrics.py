"""按动作类型拆分留出命中率，并与训练器的整体评估逐项核对。"""
import json
from pathlib import Path
from collections import defaultdict,Counter

root=Path('training_runs/endgame_20260918')
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8'))
trained=read(root/'training-results.json');selected=read(root/'selected.json')
models=[('v4-ai-only','training_runs/pvp_navigation_20260918/fresh-v4-p0.json',selected['baseline']['curriculum']['correct'])]
models += [(r['name'],r['summary']['outFile'],r['validation']['curriculum']['correct']) for r in trained]
samples=[json.loads(line) for line in (root/'curriculum-validation.jsonl').read_text(encoding='utf-8').splitlines()]
output={}
for name,path,expected in models:
    model=read(path);weights=model['weights'];groups=defaultdict(Counter)
    for sample in samples:
        best=None;maximum=float('-inf')
        for candidate in sample['candidates']:
            # 与 TypeScript 累加顺序和同分时保留首项的规则一致。
            score=0.0
            for index,value in candidate['features']:score+=weights[index]*value
            if score>maximum:maximum=score;best=candidate['actionCode']
        label=sample['label']['actionCode'];correct=best==label
        for key in ['total',label.split(':')[0]]:groups[key]['samples']+=1;groups[key]['correct']+=correct
    assert groups['total']['correct']==expected
    output[name]=groups
(root/'action-validation.json').write_text(json.dumps(output,indent=2),encoding='utf-8')
print(json.dumps(output,indent=2))
