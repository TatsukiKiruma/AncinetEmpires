"""独立只读复核指定checkpoint索引；不运行builder或转换器。"""
import collections
import argparse
import datetime
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PHONE = HERE / 'phone'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--release', default='checkpoint-2026-10-15T16-43-22-349Z')
args = parser.parse_args()
RELEASE = (PHONE / args.release).resolve()
if not RELEASE.is_relative_to(PHONE.resolve()):
    raise RuntimeError('复核目标必须位于本轮phone目录')
SEEN = {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    data = path.read_bytes()
    SEEN[str(path.relative_to(HERE))] = digest(data)
    return json.loads(data)


def lines(path):
    data = path.read_bytes()
    SEEN[str(path.relative_to(HERE))] = digest(data)
    return [json.loads(line) for line in data.splitlines() if line]


summary = read(RELEASE / 'summary.json')
manifest = read(RELEASE / 'manifest.json')
entries = lines(RELEASE / 'release-index.jsonl')
pending = lines(RELEASE / 'pending.jsonl')
endpoints = {r['id']: r for r in lines(PHONE / 'endpoints/segment-receipts.jsonl')}
parents = {r['parentId']: r for r in lines(PHONE / 'endpoints/parent-outcomes.jsonl')}
buckets = {r['parentId']: r for r in lines(PHONE / 'endpoints/parent-buckets.jsonl')}
assert len(entries) == len({r['segmentId'] for r in entries}) == summary['processedSegments']
assert len(pending) == len({r['segmentId'] for r in pending}) == summary['pendingSegments']
assert {r['segmentId'] for r in entries}.isdisjoint({r['segmentId'] for r in pending})
assert {r['segmentId'] for r in entries + pending} == set(endpoints)
assert sum(r['admittedMacros'] for r in entries) == summary['policyLabelMacros']
assert sum(r['admittedAtoms'] for r in entries) == summary['policyLabelAtoms']
assert sum(r['admittedAtoms'] for r in entries if r['valueEligible']) == summary['valueLabelAtoms']
assert summary['existingTrainHoldout'] is False and summary['modelSchemaAccepted'] is False
assert summary['trainingStarted'] is False and summary['trainingAuthorized'] is False
assert summary['returnEligible'] is False and summary['policyGateSatisfied'] is False
for name, sha in manifest['artifacts'].items():
    assert digest((RELEASE / name).read_bytes()) == sha

value_parents = set()
for row in entries:
    endpoint, parent = endpoints[row['segmentId']], parents[row['parentId']]
    receipt = read(PHONE / row['receipt'])
    assert row['actualBucket'] == buckets[row['parentId']]
    assert row['actualBucket']['configSha256'] == parent['configSha256'] == endpoint['configSha256']
    assert row['segmentId'] == receipt['id'] and row['parentId'] == receipt['parentId']
    assert row['sourceIdentity'] == receipt['sourceIdentity'] == summary['sourceIdentity']
    assert row['maxGlobalMacroExclusive'] <= receipt['summary']['maxAdmissibleGlobalMacroExclusive']
    assert row['admittedMacros'] == row['maxGlobalMacroExclusive'] - row['globalOffset']
    assert row['globalOffset'] == endpoint['globalOffset']
    assert row['quarantinedMacroTail'] == endpoint['globalEnd'] - row['maxGlobalMacroExclusive']
    assert row['modelSchemaAccepted'] is False and row['trainingAuthorized'] is False
    assert row['returnEligible'] is False and row['policyGateSatisfied'] is False
    assert row['assignedPartition'] == ('train' if row['policyLabelEligible'] else 'quarantine')
    assert row['policyLabelEligible'] == (row['admittedMacros'] > 0)
    assert digest((PHONE / row['candidateShard']).read_bytes()) == row['shardSha256']
    if row['valueEligible']:
        value_parents.add(row['parentId'])
        evidence_file = PHONE / row['valueEvidence']['path']
        assert digest(evidence_file.read_bytes()) == row['valueEvidence']['sha256']
        evidence = read(evidence_file)
        assert evidence['parentId'] == row['parentId']
        assert evidence['nativeWinningAllianceId'] == row['nativeWinningAllianceId'] == parent['nativeWinnerAlliance']
        assert parent['outcome'] == evidence['outcomeKind'] == row['outcomeKind'] == 'natural_terminal'
        group = [e for e in endpoints.values() if e['parentId'] == row['parentId']]
        assert set(evidence['segmentIds']) == {e['id'] for e in group}
        for item in evidence['segmentReceiptHashes']:
            p = PHONE / 'full_v6/receipts' / (item['id'] + '.json')
            assert digest(p.read_bytes()) == item['sha256']
            assert read(p)['summary']['transitionAccepted'] is True
    else:
        assert 'valueEvidence' not in row
    if row['parentId'] == 's2466':
        assert not row['valueEligible'] and row['maxGlobalMacroExclusive'] <= max(row['globalOffset'], 78100)
assert len(value_parents) == summary['valueEligibleParents']
endpoint_manifest = read(PHONE / 'endpoints/delivery-manifest.json')
for item in endpoint_manifest['files']:
    assert digest((PHONE / 'endpoints' / item['file']).read_bytes()) == item['sha256']
changed = [name for name, sha in SEEN.items() if digest((HERE / name).read_bytes()) != sha]
assert not changed
report = {
    'observedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
    'checkpoint': RELEASE.relative_to(HERE).as_posix(), 'passed': True,
    'auditorScript': 'review_release_index.py', 'auditorSha256': digest(Path(__file__).read_bytes()),
    'processed': len(entries), 'pending': len(pending),
    'admittedMacros': summary['policyLabelMacros'], 'admittedAtoms': summary['policyLabelAtoms'],
    'valueAtoms': summary['valueLabelAtoms'], 'valueParents': len(value_parents),
    'configuredPlayerBuckets': dict(collections.Counter(r['actualBucket']['configuredPlayerCount'] for r in entries)),
    'sourceReads': len(SEEN), 'changedAfterRead': changed, 'sourceHashes': SEEN,
    'scope': '独立复核指定发布的全量索引计数/身份/边界/value证据/分桶；未重做引擎转移、未运行builder',
}
out = HERE / ('release_review_' + str(int(datetime.datetime.now().timestamp())) + '.json')
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'sourceHashes'}, ensure_ascii=False, indent=2))
print(str(out))
