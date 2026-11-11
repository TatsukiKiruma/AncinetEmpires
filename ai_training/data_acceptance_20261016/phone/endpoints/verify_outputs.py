"""独立复算小型端点回执，不重读归档或执行对局。"""
import collections
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
summary = json.loads((root / 'audit-summary.json').read_text(encoding='utf-8'))
segments = [json.loads(line) for line in (root / 'segment-receipts.jsonl').read_text(encoding='utf-8').splitlines()]
parents = [json.loads(line) for line in (root / 'parent-outcomes.jsonl').read_text(encoding='utf-8').splitlines()]
assert len(segments) == len({row['id'] for row in segments}) == 5012
assert len(parents) == len({row['parentId'] for row in parents}) == 3000
assert sum(row['actions'] for row in segments) == summary['totalActions'] == 8132273
last = {}
for row in segments:
    assert row['endpointAndLinkAccepted'] and not row['errors']
    assert not row['policyEligible'] and not row['valueEligible'] and not row['returnEligible']
    parent = row['parentId']
    if row['kind'] == 'continuation':
        assert last[parent]['id'] == row['parentIdInResult']
        assert last[parent]['globalEnd'] == row['globalOffset']
        assert last[parent]['finalSha256'] == row['initialSha256']
        assert last[parent]['configSha256'] == row['configSha256']
    else:
        assert row['globalOffset'] == 0 and parent == row['id']
    assert row['globalOffset'] + row['actions'] == row['globalEnd']
    if row['nativeH'] >= 0:
        assert row['aliveAlliances'] == [row['nativeH']]
    last[parent] = row
counts = collections.Counter()
for row in parents:
    assert row['endpointAndLineageAccepted'] and not row['errors']
    assert not row['policyEligible'] and not row['valueEligible'] and not row['returnEligible']
    latest = last[row['parentId']]
    assert row['finalSource'] == latest['id'] and row['finalSha256'] == latest['finalSha256']
    assert row['globalActions'] == latest['globalEnd']
    counts[row['outcome']] += 1
    if row['outcome'] == 'natural_terminal':
        assert row['nativeWinnerAlliance'] == latest['nativeH']
        for actor in row['actorAllianceLabels']:
            assert actor['nativeOutcomeSign'] == (1 if actor['alliance'] == row['nativeWinnerAlliance'] else -1)
    else:
        assert row['nativeWinnerAlliance'] is None
        assert all(actor['nativeOutcomeSign'] is None for actor in row['actorAllianceLabels'])
assert counts == {'natural_terminal': 2953, 'confirmed_cyclic_stalemate': 1, 'unfinished_at_fixed_snapshot': 46}
result = {
    'passed': True, 'segments': len(segments), 'parents': len(parents), 'outcomes': dict(counts),
    'all_training_eligibility_false': True,
    'output_sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ['segment-receipts.jsonl', 'parent-outcomes.jsonl', 'audit-summary.json']},
    'scope': '仅独立复算现有回执的计数、SHA链接、联盟metadata及mask，不取代归档解码或TS转移验收',
}
with (root / 'output-verification.json').open('x', encoding='utf-8') as handle:
    json.dump(result, handle, ensure_ascii=False, indent=2)
print(json.dumps(result, ensure_ascii=False))
