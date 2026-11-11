"""全量复算R7训练/验证网络输入，保留旧文件不变。"""
import json,pathlib,collections
from curate import ih,sha,S
R=S.parent/'r7_training_stage_20261014_083500/artifacts/data'
sets={};report={}
for name in ['train_samples','val_samples','dagger_samples','round2_train_samples']:
    seen={};bad=[];conflicts=set();rows=0;maps=collections.Counter()
    with (R/f'{name}.jsonl').open(encoding='utf8') as f:
        for line in f:
            s=json.loads(line);rows+=1;h=ih(s);maps[s['mapName']]+=1
            if h!=s['inputHash']:bad.append(rows)
            if h in seen and seen[h]!=s['targetActionIndex']:conflicts.add(h)
            seen[h]=s['targetActionIndex']
    sets[name]=set(seen);report[name]={'rows':rows,'uniqueRealInputs':len(seen),'hashMismatches':bad,'conflictingInputs':len(conflicts),'maps':dict(maps),'fileSha256':sha(R/f'{name}.jsonl')}
report['overlap']={k:len(v&sets['val_samples']) for k,v in sets.items() if k!='val_samples'}
report['reuseDecision']='保留为来源受限的探索/比较材料；本阶段主数据重新采集并保存完整状态，不把旧缺少stateJson的标签自动当真值。'
(S/'evidence/r7_full_input_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
