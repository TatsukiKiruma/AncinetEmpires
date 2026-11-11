"""只读增量取回小米8两段已完成对局，保留手机原件与历史电脑证据。"""
from collections import Counter, defaultdict
import datetime as dt
import gzip
import json
from pathlib import Path
import re
import shlex
import shutil
import struct
import subprocess
import tarfile
import time

from mi8_collection import ADB, DEVICE, TASK, PREVIOUS, REMOTE
from second_device.verify_completed import FILES, digest, verify


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def emit(**value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


class Sync:
    def __init__(self):
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        self.out = TASK / 'sync' / stamp
        self.out.mkdir(parents=True, exist_ok=False)
        self.started = time.monotonic()
        self.records = []
        self.errors = []
        self.rejected = []

    def read(self, command):
        wrapped = 'id >/dev/null; ' + command + '; aeii_read_status=$?; sleep 0.05; exit $aeii_read_status'
        args = [ADB, '-s', DEVICE, 'shell', 'su -c ' + shlex.quote(wrapped)]
        result = subprocess.run(args, capture_output=True, timeout=60)
        text = result.stdout.decode('utf-8', 'replace').strip()
        with (self.out / 'COMMANDS.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps({'command': args, 'returncode': result.returncode,
                                    'stdout': text, 'stderr': result.stderr.decode('utf-8', 'replace')}, ensure_ascii=False) + '\n')
        if result.returncode:
            raise RuntimeError(text + result.stderr.decode('utf-8', 'replace'))
        return text

    def snapshot(self, plan, label):
        target = self.out / label
        target.mkdir()
        master = json.loads(self.read('cat ' + plan['remoteRoot'] + '/STATE.json'))
        write(target / 'STATE.json', master)
        entries = []
        for worker in plan['workers']:
            wr = worker['remoteRoot']
            rows = self.read('cat ' + wr + '/completed.tsv')
            markers = self.read('cat ' + wr + '/DONE_SEQS/*')
            (target / (worker['workerId'] + '-completed.tsv')).write_text(rows, encoding='utf-8')
            (target / (worker['workerId'] + '-markers.tsv')).write_text(markers, encoding='utf-8')
            failures = self.read('cat ' + wr + '/failure.tsv')
            (target / (worker['workerId'] + '-failure.tsv')).write_text(failures, encoding='utf-8')
            state = json.loads(self.read('cat ' + wr + '/STATE.json'))
            write(target / (worker['workerId'] + '-STATE.json'), state)
            complete = [line.split() for line in rows.splitlines() if line.strip()]
            marks = [line.split() for line in markers.splitlines() if line.strip()]
            assert all(len(row) == 4 for row in complete)
            assert all(len(row) == 3 for row in marks)
            assert len(complete) == len({row[0] for row in complete}) == state['doneParents']
            assert len(marks) == len({row[0] for row in marks}) == len(complete)
            assert {tuple(row[1:3]) for row in complete} == {tuple(row[:2]) for row in marks}
            # 控制器先写完成标记再写账本，两个date可能跨秒；身份必须逐项一致。
            marker_times = {row[0]: int(row[2]) for row in marks}
            assert all(marker_times[row[1]] <= int(row[3]) for row in complete)
            for row in complete:
                seq, parent, attempt, epoch = row
                assert int(seq) in worker['sequences'] and epoch.isdigit()
                assert re.fullmatch(r'[A-Za-z0-9_-]{1,79}', attempt)
                entries.append({'row': row, 'worker': worker, 'segment': label})
        assert len(entries) == len({v['row'][1] for v in entries})
        assert len(entries) + plan['initialDone'] == master['doneParents']
        emit(phase='snapshot', segment=label, completed=master['doneParents'], remaining=master['remainingParents'])
        return entries, master

    def record(self, value, transfer):
        value['transfer'] = transfer
        self.records.append(value)
        with (self.out / 'verified.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(value, ensure_ascii=False) + '\n')

    def transfer(self, package, entries, number):
        assert package in {'net.toyknight.aeii.android', 'net.toyknight.aeii.worker01', 'net.toyknight.aeii.worker02'}
        attempts = [v['row'][2] for v in entries]
        assert len(attempts) == len(set(attempts)) and all(re.fullmatch(r'[A-Za-z0-9_-]{1,79}', a) for a in attempts)
        private = '/data/user/0/' + package + '/files/.aeii-hard-production'
        command = 'tar -C ' + private + ' -cf - ' + ' '.join(attempts)
        args = [ADB, '-s', DEVICE, 'exec-out', 'su -c ' + shlex.quote(command)]
        batch = self.out / 'data' / f'batch-{number:03d}'
        batch.mkdir(parents=True)
        archive = batch / 'original-evidence.tar'
        with archive.open('xb') as output:
            result = subprocess.run(args, stdout=output, stderr=subprocess.PIPE, timeout=60)
        write(batch / 'TRANSFER.json', {'command': args, 'returncode': result.returncode,
              'stderr': result.stderr.decode('utf-8', 'replace'), 'sha256': digest(archive),
              'bytes': archive.stat().st_size, 'phoneReadOnly': True})
        assert result.returncode == 0, result.stderr.decode('utf-8', 'replace')
        # 只接受本批次完成目录中的普通文件，拒绝链接和路径穿越。
        with tarfile.open(archive, 'r:') as source:
            for member in source:
                parts = member.name.rstrip('/').split('/')
                assert parts[0] in attempts and all(p not in {'', '.', '..'} and '\\' not in p for p in parts)
                if member.isdir():
                    assert len(parts) == 1
                    continue
                assert member.isfile() and len(parts) == 2
                target = batch.joinpath(*parts)
                assert target.resolve().is_relative_to(batch.resolve())
                target.parent.mkdir(exist_ok=True)
                with target.open('xb') as output, source.extractfile(member) as content:
                    shutil.copyfileobj(content, output)
        for entry in entries:
            directory = batch / entry['row'][2]
            try:
                value = check(directory, entry)
                self.record(value, 'downloaded')
            except (AssertionError, ValueError, OSError, EOFError) as error:
                self.errors.append({'attemptId': entry['row'][2], 'error': repr(error)})
        emit(phase='transfer', verified=len(self.records), errors=len(self.errors), seconds=round(time.monotonic() - self.started, 1))


def streams(directory, parent, attempt):
    paths = Counter()
    actions = 0
    with gzip.open(directory / 'actions.jsonl.gz', 'rt', encoding='utf-8') as source:
        for line in source:
            value = json.loads(line)
            assert value['parentId'] == parent and value['attemptId'] == attempt and value['index'] == actions
            assert value['path'] in {'hard_js_primary', 'hard_java_fallback'}
            paths[value['path']] += 1
            actions += 1
    frames = 0
    with gzip.open(directory / 'states.bin.gz', 'rb') as source:
        while header := source.read(4):
            assert len(header) == 4
            length = struct.unpack('>i', header)[0]
            assert 0 < length <= 64 * 1024 * 1024
            remaining = length
            while remaining:
                block = source.read(min(remaining, 1024 * 1024))
                assert block
                remaining -= len(block)
            frames += 1
    assert 0 < actions == frames <= 20000
    return actions, dict(paths)


def check(directory, entry):
    if 'preserved' not in entry:
        worker = {**entry['worker'], 'sha256': entry['worker']['installedSha256']}
        return verify(directory, entry['row'], worker, entry['job'], entry['planSha'], entry['sourceSha'])
    # 历史保留局按已冻结收据逐字节复核，不放宽后续分片的统一检查。
    directory = Path(directory)
    frozen = entry['preserved']
    result = load(directory / 'result.json')
    seq, parent, attempt, epoch = entry['row']
    assert result['parentId'] == parent and result['attemptId'] == attempt
    assert result['naturalEnd'] is True and result['truncationReason'] is None
    assert result['map'] == entry['job']['map'] and result['seed'] == entry['job']['seed']
    assert result['requestedPlayerType'] == 3 and result['jsRngMode'] == 'original_webview_rng'
    assert result['jsSeedControlled'] is False
    if 'source' in frozen:
        receipt_path = Path(frozen['source'])
        assert digest(receipt_path) == frozen['receiptSha256']
        receipt = load(receipt_path)
        assert receipt['collectionComplete'] and receipt['naturalEnd'] and not receipt['truncated']
        for name, expected in receipt['evidenceHashes'].items():
            path = receipt_path.parent / name
            assert path.resolve().is_relative_to(receipt_path.parent.resolve()) and digest(path) == expected
        host = directory.parent
        final = load(host / 'resident-final-status.json')
        assert final['phase'] == 'cleaned' and not final['workerAlive'] and final['workerFinished']
        assert final['cleanup'] == 'safe' and final['pendingCallbacks'] == 0 and final['workerResult'] == result
        assert load(receipt_path.parent / 'process-exit.json')['processExited']
        manifest_sha = digest(receipt_path)
    else:
        manifest = load(directory / 'artifact-manifest.json')
        assert manifest == frozen['manifest'] and result == frozen['result']
        assert load(directory / 'THREAD_EXITED.json') == frozen['threadExit']
        state = load(directory / 'STATE.json')
        assert state['parentId'] == parent and state['attemptId'] == attempt
        assert state['standalonePhase'] == 'complete' and state['workerCleanupComplete'] and state['naturalEnd']
        assert {v['name'] for v in manifest['files']} == FILES and len(manifest['files']) == 6
        for item in manifest['files']:
            path = directory / item['name']
            assert path.stat().st_size == item['bytes'] and digest(path) == item['sha256']
        manifest_sha = digest(directory / 'artifact-manifest.json')
    actions, paths = streams(directory, parent, attempt)
    assert actions == result['actions']
    if 'pathCounts' in result:
        assert paths == {k: v for k, v in result['pathCounts'].items() if v}
    return {'sequenceIndex': int(seq), 'parentId': parent, 'attemptId': attempt, 'completedEpoch': int(epoch),
            'directory': str(directory.resolve()), 'package': entry['worker']['package'],
            'map': result['map'], 'seed': result['seed'], 'actions': actions, 'stateFrames': actions,
            'manifestSha256': manifest_sha, 'bytes': sum((directory / name).stat().st_size for name in FILES),
            'transferHashesVerified': True, 'gzipAndRecordCountsVerified': True,
            'nativeReplayVerified': False, 'projectStrictVerified': False, 'automaticTrainingAdmission': False}


def main():
    sync = Sync()
    assert sync.read('getprop ro.product.model') == 'MI 8 UD'
    assert 'uid=0(root)' in sync.read('id')
    first = load(TASK / 'PLAN.json')
    old = load(TASK / 'production-parallel-01/PLAN.json')
    next_dir = TASK / 'continuation-2501-3000-20261024'
    new = load(next_dir / 'PLAN.json')
    segment = load(next_dir / 'SEGMENT_PLAN.json')
    assert old['remoteRoot'] == PREVIOUS and new['remoteRoot'] == REMOTE and new['device'] == DEVICE
    assert digest(TASK / 'PLAN.json') == old['sourcePlanSha256']
    assert digest(next_dir / 'SEGMENT_PLAN.json') == new['segmentPlanSha256']
    source = sync.out / 'source'
    source.mkdir()
    for path in [Path(__file__), Path(__file__).parent / 'second_device/verify_completed.py',
                 TASK / 'PLAN.json', next_dir / 'SEGMENT_PLAN.json',
                 TASK / 'concurrency-20261022/PRESERVED_BEFORE_PRODUCTION.json']:
        shutil.copy2(path, source / path.name)
    for w in old['workers']:
        path = sync.read('pm path ' + w['package']).removeprefix('package:')
        assert re.fullmatch(r'/data/app/[A-Za-z0-9_./=+\-]+/base\.apk', path)
        assert sync.read('sha256sum ' + path).split()[0] == w['installedSha256']
        assert int(re.search(r'(?m)^\s*userId=(\d+)', sync.read('dumpsys package ' + w['package']))[1]) == w['uid']
    rows, old_state = sync.snapshot(old, 'original-1000')
    more, new_state = sync.snapshot(new, 'additional-500')
    jobs_old = {j['index']: j for j in first['jobs']}
    jobs_new = {j['index']: j for j in segment['jobs']}
    for entry in rows + more:
        seq = int(entry['row'][0])
        entry['job'] = (jobs_old if seq <= 1000 else jobs_new)[seq]
        assert entry['job']['parentId'] == entry['row'][1]
        entry['planSha'] = old['sourcePlanSha256'] if seq <= 1000 else new['segmentPlanSha256']
        entry['sourceSha'] = old['sourceApkSha256']
    preserved = load(TASK / 'concurrency-20261022/PRESERVED_BEFORE_PRODUCTION.json')
    assert len(preserved['parents']) == old['initialDone'] == 41
    workers = {w['package']: w for w in old['workers']}
    early_local = {}
    for p in preserved['parents']:
        seq = p['sequenceIndex']
        if 'source' in p:
            receipt = load(p['source'])
            attempt = receipt['attemptId']
            package = 'net.toyknight.aeii.android'
            early_local[attempt] = Path(p['source']).parent / 'launcher' / attempt / 'native'
        else:
            attempt, package = p['attemptId'], p['package']
        rows.append({'row': [str(seq), p['parentId'], attempt, str(p.get('completedEpoch', 0))],
                     'worker': workers[package], 'job': jobs_old[seq], 'preserved': p})
    entries = rows + more
    assert len(entries) == len({v['row'][1] for v in entries}) == len({v['row'][0] for v in entries})
    assert len(rows) == old_state['doneParents'] and len(more) == new_state['doneParents']
    cache = defaultdict(list)
    for manifest in TASK.rglob('artifact-manifest.json'):
        if sync.out not in manifest.parents:
            cache[load(manifest)['attemptId']].append(manifest.parent)
    pending = defaultdict(list)
    for entry in entries:
        attempt = entry['row'][2]
        candidates = [early_local[attempt]] if attempt in early_local else cache.get(attempt, [])
        for directory in candidates:
            try:
                sync.record(check(directory, entry), 'reused_verified_local')
                break
            except (AssertionError, ValueError, OSError, EOFError) as error:
                sync.rejected.append({'attemptId': attempt, 'directory': str(directory), 'error': repr(error)})
        else:
            assert attempt not in early_local, '最早两局已有电脑证据未能复核，保留现场待修复'
            pending[entry['worker']['package']].append(entry)
    emit(phase='prepared', completedOnPhone=len(entries), reused=len(sync.records), download=sum(map(len, pending.values())))
    batch = 0
    for package, group in pending.items():
        for start in range(0, len(group), 100):
            batch += 1
            sync.transfer(package, group[start:start + 100], batch)
    records = sorted(sync.records, key=lambda v: v['sequenceIndex'])
    counts = Counter(v['transfer'] for v in records)
    indexed = {r['attemptId'] for r in records}
    missing = [v['row'][2] for v in entries if v['row'][2] not in indexed]
    index = {'schema': 'mi8-two-segment-incremental-sync-v1', 'device': DEVICE,
             'beijingTime': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
             'completedParents': len(records), 'originalCompleted': sum(r['sequenceIndex'] <= 1000 for r in records),
             'additionalCompleted': sum(r['sequenceIndex'] >= 2501 for r in records), 'total': 1500,
             'newlyDownloadedParents': counts['downloaded'], 'reusedVerifiedParents': counts['reused_verified_local'],
             'actions': sum(r['actions'] for r in records), 'bytes': sum(r['bytes'] for r in records),
             'parents': records, 'missing': missing, 'errors': sync.errors, 'rejectedLocalCache': sync.rejected,
             'originalState': old_state, 'additionalState': new_state,
             'battery': sync.read('dumpsys battery'), 'phoneEpoch': sync.read('date +%s'),
             'phoneOriginalsPreserved': True, 'phoneReadOnly': True,
             'transferHashesVerified': not sync.errors and not missing,
             'gzipAndRecordCountsVerified': not sync.errors and not missing,
             'independentReplayDeferred': True, 'automaticTrainingAdmission': False,
             'elapsedSeconds': time.monotonic() - sync.started}
    write(sync.out / 'INDEX.json', index)
    emit(**{k: v for k, v in index.items() if k not in {'parents', 'originalState', 'additionalState', 'battery', 'rejectedLocalCache'}},
         indexPath=str((sync.out / 'INDEX.json').resolve()))
    assert not sync.errors and not missing, '部分对局未通过传输核验，已保留原件与错误证据'


if __name__ == '__main__':
    main()
