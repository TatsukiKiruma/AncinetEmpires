"""复用已有预测作人数、来源和场景汇总，不新增模型前向。"""
import json
from collections import defaultdict
from offline import summarize
from runtime import HERE, save

groups = defaultdict(list)
for line in (HERE / 'offline-baseline/samples.jsonl').read_text('utf-8').splitlines():
    row = json.loads(line)
    for key in [f'{row["corpus"]}/{row["split"]}/{row["players"]}p', f'{row["corpus"]}/{row["split"]}/source/{row["source"]}', f'{row["corpus"]}/{row["split"]}/category/{row["category"]}']:
        groups[key].append(row)
    if row['candidates'] > 1:
        groups[f'nontrivial/{row["corpus"]}/{row["split"]}'].append(row)
save(HERE / 'OFFLINE_STRATA.json', dict(buckets={k: summarize(v) for k, v in groups.items()}, additionalForwardCalls=0, finalTestEvaluated=False))
