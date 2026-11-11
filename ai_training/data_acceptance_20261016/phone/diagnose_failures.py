"""汇总已完成收据的规则分歧；不重放、不修规则，也不修改资格。"""
import collections
import datetime
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
receipts = [json.loads(p.read_text(encoding='utf8')) for p in (HERE/'full_v6/receipts').glob('*.json')]
categories = collections.Counter()
paths = collections.Counter()
candidate_types = collections.Counter()
examples = {}
for row in receipts:
    failure = row.get('failure')
    if not failure:
        continue
    category = failure['category']
    categories[category] += 1
    examples.setdefault(category, [])
    if len(examples[category]) < 3:
        examples[category].append({'id': row['id'], 'receipt': 'full_v6/receipts/'+row['id']+'.json',
                                  'macro': failure.get('globalIndex'),
                                  'details': {k: v for k, v in failure.items() if k not in ('state', 'legal')}})
    for diff in failure.get('differences', []):
        paths[re.sub(r'\.\d+(?=\.|$)', '.*', diff['path'])] += 1
    for side in ('onlyActual', 'onlyExpected'):
        for code in failure.get(side, []):
            parsed = json.loads(code)
            unit = parsed.get('unitId')
            unit_type = unit[1] if isinstance(unit, list) and len(unit) > 1 else None
            candidate_types[(side, parsed['type'], unit_type)] += 1
result = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'processedSegments': len(receipts), 'requestedSegments': 5012,
          'allRequestedProcessed': len(receipts) == 5012,
          'categories': dict(categories), 'differingPaths': dict(paths),
          'candidateDifferencesSampleCounts': [dict(side=k[0], action=k[1], unit=k[2], count=v)
                                              for k, v in candidate_types.most_common()],
          'examples': examples,
          'scope': '候选差异列表每侧最多12项，计数仅为已记录样本，不是所有差异动作总数；不判断哪一侧规则应修改',
          'publicRulesModified': False, 'trainingStarted': False}
(HERE/'failure-diagnosis.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps({k: result[k] for k in ('processedSegments', 'allRequestedProcessed', 'categories')}, ensure_ascii=False))
