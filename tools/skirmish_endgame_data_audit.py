"""比较复习数据与新收官数据的候选、标签及教师分数分布。"""
import json,math
from collections import Counter
from pathlib import Path

root=Path('training_runs/endgame_20260918')
files={'ai-train':Path('training_runs/pvp_navigation_20260918/ai-train-v4.jsonl'),
       'ai-validation':Path('training_runs/pvp_navigation_20260918/ai-validation-v4.jsonl'),
       'curriculum-train':root/'curriculum-train.jsonl','curriculum-validation':root/'curriculum-validation.jsonl'}
output={}
for name,path in files.items():
    c=Counter();labels=Counter();candidates=Counter();teachers=Counter()
    with path.open(encoding='utf-8') as stream:
        for line in stream:
            sample=json.loads(line);items=sample['candidates'];codes=[v['actionCode'] for v in items];label=sample['label']['actionCode']
            assert sample['featureExtractor']=='hashed-action-v4' and sample['featureDim']==4096
            assert label in codes and len(set(codes))==len(codes)<=64
            for item in items:
                assert math.isfinite(item['teacherScore'])
                assert all(isinstance(i,int) and 0<=i<4096 and math.isfinite(v) for i,v in item['features'])
                candidates[item['actionCode'].split(':')[0]]+=1
            scores={v['actionCode']:v['teacherScore'] for v in items};best=max(items,key=lambda v:v['teacherScore'])
            labels[label.split(':')[0]]+=1;teachers[best['actionCode'].split(':')[0]]+=1
            c['samples']+=1;c['candidates']+=len(items);c['labelTopTeacher']+=scores[label]==best['teacherScore'];c['labelFirst']+=codes[0]==label
    output[name]=dict(c,averageCandidates=c['candidates']/c['samples'],labelTopTeacherRate=c['labelTopTeacher']/c['samples'],
                      labelActions=labels,candidateActions=candidates,teacherTopActions=teachers)
(root/'candidate-audit.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:{n:v[n] for n in ['samples','averageCandidates','labelTopTeacherRate']} for k,v in output.items()},indent=2))
