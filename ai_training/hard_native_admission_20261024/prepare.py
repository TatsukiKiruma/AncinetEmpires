"""冻结3000父局来源并逐局复核完整性，失败隔离；不训练、不改源文件。"""
from collections import Counter
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys

from phone import HERE, ROOT, write

INDEXES = [
    'ai_training/hard_native_1000_20261022/sync/20261024T023159Z/INDEX.json',
    'ai_training/hard_native_second_20261023/sync/20261023T163438Z/INDEX.json',
    'ai_training/hard_native_second_20261023/sync/20261024T015058Z/INDEX.json',
]
FILES = ['config.bin', 'initial.bin', 'final.bin', 'actions.jsonl.gz', 'states.bin.gz', 'result.json']
PLAN = ROOT / 'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def source_hashes():
    paths = set((ROOT / 'src/game').rglob('*.ts'))
    for folder in ['tools/phone_training_hard/verification', 'ai_training/data_acceptance_20261016/native_reader',
                   'ai_training/data_acceptance_20261016/phone']:
        paths |= {p for p in (ROOT / folder).glob('*') if p.suffix in {'.ts', '.js', '.py'}}
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(paths)}


def freeze():
    destination = HERE / 'SOURCE_MANIFEST.json'
    if destination.exists():
        return load(destination)
    parents = []
    for batch, index in enumerate(INDEXES):
        for p in load(ROOT / index)['parents']:
            d = Path(p['directory'])
            files = {f.name: {'bytes': f.stat().st_size, 'sha256': sha(f)} for f in d.iterdir() if f.is_file()}
            parents.append({**p, 'batch': batch, 'indexSource': index, 'files': files,
                            'expectedActions': p['actions'], 'maxActions': 20000})
    assert len(parents) == len({p['parentId'] for p in parents}) == 3000
    assert sum(p['actions'] for p in parents) == 1351026
    assert set(Counter(p['map'] for p in parents).values()) == {375}
    value = {'schema': 'hard-native-admission-source-v1', 'createdUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
             'indexHashes': {p: sha(ROOT / p) for p in INDEXES}, 'planPath': str(PLAN), 'planSha256': sha(PLAN),
             'authoritativeSourceHashes': source_hashes(), 'sourceApkSha256': 'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48',
             'parents': parents, 'trainingAuthorized': False, 'sourceFilesModified': False}
    write(destination, value)
    return value


def verify(p):
    d = Path(p['directory'])
    r = load(d / 'result.json')
    for name in FILES:
        assert name in p['files'] and sha(d / name) == p['files'][name]['sha256'], '冻结文件摘要变化：' + name
    for k in ['parentId', 'attemptId', 'map', 'seed', 'actions']:
        assert r[k] == p[k], '结果身份不符：' + k
    assert r['naturalEnd'] is True and r['truncationReason'] is None
    assert r['requestedPlayerType'] == 3 and r['jsRngMode'] == 'original_webview_rng'
    assert r['jsSeedControlled'] is False and r['rngModified'] is False
    evidence = {'format': 'production'}
    if (d / 'artifact-manifest.json').exists():
        manifest = load(d / 'artifact-manifest.json')
        assert sha(d / 'artifact-manifest.json') == p['manifestSha256']
        assert len(manifest['files']) == 6 and {x['name'] for x in manifest['files']} == set(FILES)
        for x in manifest['files']:
            assert x['sha256'] == p['files'][x['name']]['sha256'] and x['bytes'] == p['files'][x['name']]['bytes']
        for x in [manifest, load(d / 'STATE.json'), load(d / 'THREAD_EXITED.json')]:
            assert x['parentId'] == p['parentId'] and x['attemptId'] == p['attemptId']
        state = load(d / 'STATE.json')
        assert state['standalonePhase'] == 'complete' and state['workerCleanupComplete'] is True
        assert load(d / 'THREAD_EXITED.json')['standalonePhase'] == 'thread_exited'
    else:
        evidence['format'] = 'legacy_launcher'
        transfer = load(d.parent / 'artifact-transfer.json')
        assert transfer['transferHashesVerified'] is True and transfer['completeSuccessSet'] is True
        byname = {x['name']: x for x in transfer['files']}
        for name in FILES:
            assert byname[name]['sha256'] == p['files'][name]['sha256'] and byname[name]['bytes'] == p['files'][name]['bytes']
        status = load(d.parent / 'resident-after-export.json')
        assert status['workerAlive'] is False and status['cleanup'] == 'safe' and status['workerResult'] == r
        sys.path.insert(0, str(ROOT / 'tools/phone_training_hard/verification'))
        from run import evidence as legacy_evidence
        evidence.update(legacy_evidence(d.parent, r, p))
    paths = Counter()
    trace = hashlib.sha256()
    count = 0
    with gzip.open(d / 'actions.jsonl.gz', 'rt', encoding='utf-8') as stream:
        for i, line in enumerate(stream):
            row = json.loads(line)
            assert row['index'] == i and row['parentId'] == p['parentId'] and row['attemptId'] == p['attemptId']
            assert row['ai_seed'] == p['seed'] + i * 104729, '原生Java seed合同不符'
            assert row['path'] in {'hard_js_primary', 'hard_java_fallback'}
            assert sorted(row['fields']) == list('abcdefghij')
            assert all(type(row['fields'][k]) is int for k in 'abcdefghi')
            assert isinstance(row['fields']['j'], str)
            paths[row['path']] += 1
            trace.update((json.dumps(row['fields'], sort_keys=True, separators=(',', ':')) + '\n').encode())
            count += 1
    assert count == p['actions'] and 0 < count <= 20000
    if 'pathCounts' in r:
        assert dict(paths) == {k: v for k, v in r['pathCounts'].items() if v}
    frames = 0
    with gzip.open(d / 'states.bin.gz', 'rb') as stream:
        while header := stream.read(4):
            assert len(header) == 4
            size = struct.unpack('>i', header)[0]
            assert 0 < size <= 67108864
            blob = stream.read(size)
            assert len(blob) == size
            if frames == 0:
                assert hashlib.sha256(blob).hexdigest() == p['files']['initial.bin']['sha256']
            frames += 1
    assert frames == count
    return {'integrityVerified': True, 'parentId': p['parentId'], 'attemptId': p['attemptId'], 'actions': count,
            'frames': frames, 'pathCounts': dict(paths), 'traceSha256': trace.hexdigest(), 'evidence': evidence,
            'initialBytesSha256': p['files']['initial.bin']['sha256'], 'sourceArtifactHashes': {k: v['sha256'] for k,v in p['files'].items()}}


def main():
    manifest = freeze()
    smoke = []
    covered = set()
    fallbacks = set()
    for p in manifest['parents']:
        r = load(Path(p['directory']) / 'result.json')
        key = (p['batch'], p['map'])
        fallback = r.get('pathCounts', {}).get('hard_java_fallback', 0) > 0
        if key not in covered or p['sequenceIndex'] <= 2 or (fallback and p['batch'] not in fallbacks):
            smoke.append(p)
            covered.add(key)
            if fallback:
                fallbacks.add(p['batch'])
    write(HERE / 'SMOKE.json', smoke)
    for p in manifest['parents']:
        target = HERE / 'integrity' / (p['parentId'] + '.json')
        if target.exists():
            r = load(target)
        else:
            try:
                r = verify(p)
            except Exception as error:
                r = {'integrityVerified': False, 'parentId': p['parentId'], 'error': repr(error)}
            write(target, r)
        if len(list((HERE / 'integrity').glob('*.json'))) % 100 == 0:
            print(json.dumps({'integrityReceipts': len(list((HERE/'integrity').glob('*.json')))}, ensure_ascii=False), flush=True)
    write(HERE / 'SMOKE.json', smoke)
    counts = Counter(load(p).get('integrityVerified') for p in (HERE / 'integrity').glob('*.json'))
    write(HERE / 'INTEGRITY_SUMMARY.json', {'parents': len(manifest['parents']), 'passed': counts[True], 'failed': counts[False], 'smokeParents': len(smoke)})
    print(json.dumps(dict(counts)), flush=True)


if __name__ == '__main__':
    if (HERE / 'USER_STOP_RECEIPT.json').exists():
        raise SystemExit('用户已停止本轮重放，不允许自动继续。')
    main()
