"""小米8专属预加载与查询；新500局由手机门禁在原1000局结束后启动。"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TASK = ROOT / 'ai_training/hard_native_1000_20261022'
OUT = TASK / 'continuation-2501-3000-20261024'
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE = 'c2357770'
PREVIOUS = '/data/local/tmp/aeii-hard-production-parallel-20261022-01'
REMOTE = '/data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def textfile(path, value):
    Path(path).write_text(value, encoding='utf-8', newline='\n')


def call(*args, check=True):
    command = [ADB, '-s', DEVICE, *map(str, args)]
    result = subprocess.run(command, capture_output=True, timeout=60)
    output = result.stdout.decode('utf-8', 'replace').strip()
    error = result.stderr.decode('utf-8', 'replace')
    if OUT.is_dir():
        with (OUT / 'ADB_COMMANDS.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps({'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'command': command,
                         'returncode': result.returncode, 'stdout': output, 'stderr': error}, ensure_ascii=False) + '\n')
    if check and result.returncode:
        raise RuntimeError(output + error)
    return output


def root(command, check=True):
    wrapped = 'id >/dev/null\n' + command + '\naeii_read_status=$?\nsleep 0.05\nexit $aeii_read_status'
    return call('shell', 'su -c ' + shlex.quote(wrapped), check=check)


def previous_plan():
    return json.loads((TASK / 'production-parallel-01/PLAN.json').read_text(encoding='utf-8'))


def preflight():
    assert root('getprop ro.product.model') == 'MI 8 UD'
    assert 'uid=0(root)' in root('id')
    previous = previous_plan()
    installed = []
    for worker in previous['workers']:
        package = worker['package']
        paths = root('pm path ' + package).splitlines()
        assert len(paths) == 1 and paths[0].startswith('package:')
        path = paths[0][8:]
        assert re.fullmatch(r'/data/app/[A-Za-z0-9_./=+\-]+/base\.apk', path)
        assert root('sha256sum ' + path).split()[0] == worker['installedSha256']
        uid = re.search(r'(?m)^\s*userId=(\d+)', root('dumpsys package ' + package))
        assert uid and int(uid[1]) == worker['uid']
        installed.append({'path': path, 'sha256': worker['installedSha256']})
    return previous, installed


def prepare():
    previous, installed = preflight()
    OUT.mkdir(exist_ok=False)
    source_dir = OUT / 'phone-source'
    source_dir.mkdir()
    names = {'master': ['master-adaptive-02.sh', 'process-importance.jar']}
    names.update({w['workerId']: ['controller.sh', 'process_thaw.sh', 'collector.bundle.js',
                                'base-config.zip', 'inject-path.txt'] for w in previous['workers']})
    hashes = {}
    for group, files in names.items():
        local = source_dir / group
        local.mkdir()
        phone = PREVIOUS if group == 'master' else PREVIOUS + '-' + group
        for name in files:
            call('pull', phone + '/' + name, local / name)
            hashes[group + '/' + name] = root('sha256sum ' + phone + '/' + name).split()[0]
            assert digest(local / name) == hashes[group + '/' + name]
    source_path = ROOT / 'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json'
    source = json.loads(source_path.read_text(encoding='utf-8'))
    samsung_segment = json.loads((ROOT / 'ai_training/hard_native_second_20261023/continuation-2001-2500-20261024/SEGMENT_PLAN.json').read_text(encoding='utf-8'))
    assert digest(source_path) == samsung_segment['sourcePlanSha256']
    selected = source['jobs'][2500:3000]
    assert len(selected) == 500
    for field in ['parentId', 'seed']:
        assert len({j[field] for j in selected}) == 500
        assert not {j[field] for j in selected}.intersection(j[field] for j in source['jobs'][:2500])
    jobs = [{'index': i, 'globalZeroBasedIndex': i - 1, 'parentId': j['parentId'],
             'sourcePlanParentId': j['parentId'], 'attemptId': '__ATTEMPT__', 'map': j['map'], 'seed': j['seed'],
             'maxActions': 20000, 'mode': 'SD', 'requestedPlayerType': 3, 'jsRngMode': 'original_webview_rng'}
            for i, j in enumerate(selected, 2501)]
    segment = {'schema': 'mi8-fourth-hard-segment-v1', 'device': DEVICE, 'sourcePlan': str(source_path),
               'sourcePlanSha256': digest(source_path), 'sourceApkSha256': source['apkSha256'],
               'globalZeroBasedRange': [2500, 3000], 'humanGameNumbers': [2501, 3000], 'total': 500,
               'quota': dict(Counter(j['map'] for j in jobs)), 'jobs': jobs, 'jsSeedControlled': False,
               'javaHardFallbackPreserved': True, 'independentReplayDeferred': True, 'automaticTrainingAdmission': False,
               'noOverlapWithEarlier2500': True}
    write(OUT / 'SEGMENT_PLAN.json', segment)
    master = OUT / 'master'
    master.mkdir()
    for name in names['master']:
        shutil.copy2(source_dir / 'master' / name, master / name)
    for name in ['mi8_chain_gate.sh', 'mi8_chain_contract.sh', 'mi8_chain_gate_test.sh']:
        shutil.copy2(HERE / name, master / name)
    textfile(master / 'global.env', 'TOTAL=500\nINITIAL_DONE=0\nLIMIT=2\nWORKER_COUNT=3\n')
    textfile(master / 'OPERATING_CEILING', '2\n')
    first_plan = json.loads((TASK / 'PLAN.json').read_text(encoding='utf-8'))
    initial_path = TASK / 'concurrency-20261022/PRESERVED_BEFORE_PRODUCTION.json'
    initial = json.loads(initial_path.read_text(encoding='utf-8'))
    assert initial['completedParents'] == len(initial['parents']) == 41
    initial_seqs = {p['sequenceIndex'] for p in initial['parents']}
    previous_seqs = [seq for w in previous['workers'] for seq in w['sequences']]
    assert len(previous_seqs) == len(set(previous_seqs)) == 959
    assert initial_seqs.union(previous_seqs) == set(range(1, 1001)) and not initial_seqs.intersection(previous_seqs)
    shutil.copy2(initial_path, master / 'PREVIOUS_PRESERVED_PARENTS.json')
    workers, lines = [], []
    for slot, old in enumerate(previous['workers']):
        wid = old['workerId']
        local = OUT / wid
        local.mkdir()
        (local / 'configs').mkdir()
        phone = REMOTE + '-' + wid
        for name in names[wid]:
            data = (source_dir / wid / name).read_bytes()
            if name == 'controller.sh':
                before = b'test "$SEQ" -ge 3 && test "$SEQ" -le 1000'
                assert data.count(before) == 1
                data = data.replace(before, b'test "$SEQ" -ge 2501 && test "$SEQ" -le 3000')
            (local / name).write_bytes(data)
        shard = jobs[slot::3]
        env = {'PACKAGE': old['package'], 'APP_UID': old['uid'], 'ACTIVITY': 'net.toyknight.aeii.android.AndroidLauncher',
               'GLOBAL_ROOT': REMOTE, 'WORKER_ID': wid, 'TOTAL': len(shard)}
        textfile(local / 'worker.env', ''.join(f'{k}={v}\n' for k, v in env.items()))
        textfile(local / 'attempt-prefix.txt', 'mi8-seg4-p02-20261024-' + wid + '\n')
        template = json.loads((TASK / 'production-parallel-01' / wid / 'configs' / f'{old["sequences"][0]:04d}.json').read_text(encoding='utf-8'))
        index = []
        for job in shard:
            config = {**template, 'job': job, 'baseConfigZip': phone + '/base-config.zip', 'taskRoot': phone,
                      'globalRoot': REMOTE, 'sequenceIndex': job['index'], 'planSha256': digest(OUT / 'SEGMENT_PLAN.json')}
            write(local / 'configs' / f'{job["index"]:04d}.json', config)
            index.append(f'{job["index"]} {job["parentId"]} {phone}/configs/{job["index"]:04d}.json\n')
        textfile(local / 'index.txt', ''.join(index))
        textfile(master / f'prerequisite-{wid}.tsv', ''.join(f'{seq} {first_plan["jobs"][seq-1]["parentId"]}\n' for seq in old['sequences']))
        lines.append(f'{wid} {old["package"]} {old["uid"]} {phone}\n')
        workers.append({**old, 'remoteRoot': phone, 'sequences': [j['index'] for j in shard]})
    textfile(master / 'workers.tsv', ''.join(lines))
    static_hashes = [(digest(p), REMOTE + '/' + str(p.relative_to(master)).replace('\\', '/')) for p in master.rglob('*') if p.is_file()]
    for worker in workers:
        local = OUT / worker['workerId']
        static_hashes.extend((digest(p), worker['remoteRoot'] + '/' + str(p.relative_to(local)).replace('\\', '/')) for p in local.rglob('*') if p.is_file())
    static_hashes.extend((v['sha256'], v['path']) for v in installed)
    inject = '/data/local/tmp/aeii-hard-inject-17.2.5'
    static_hashes.append((root('sha256sum ' + inject).split()[0], inject))
    textfile(master / 'CHAIN_SHA256SUMS', ''.join(f'{h}  {p}\n' for h, p in static_hashes))
    write(OUT / 'PLAN.json', {'device': DEVICE, 'remoteRoot': REMOTE, 'previousRoot': PREVIOUS, 'total': 500,
          'initialDone': 0, 'limit': 2, 'operatingCeiling': 2, 'workers': workers, 'globalZeroBasedRange': [2500, 3000],
          'humanGameNumbers': [2501, 3000], 'segmentPlanSha256': digest(OUT / 'SEGMENT_PLAN.json'),
          'previousRequiredNaturalParents': 1000, 'previousPreservedNaturalParents': 41})
    write(OUT / 'PREPARED.json', {'utc': dt.datetime.now(dt.timezone.utc).isoformat(),
          'actualPhoneSourceSha256': hashes, 'collectorBundlesByteIdentical': True, 'apkReinstallRequired': False})
    shutil.copy2(__file__, OUT / 'mi8_collection.py')
    write(OUT / 'SOURCE_SHA256.json', {str(p.relative_to(OUT)).replace('\\', '/'): digest(p)
          for p in OUT.rglob('*') if p.is_file() and p.name != 'ADB_COMMANDS.jsonl'})
    print(json.dumps({'prepared': str(OUT), 'total': 500, 'humanGameNumbers': [2501, 3000], 'ceiling': 2}, ensure_ascii=False), flush=True)


def deploy():
    preflight()
    assert not (OUT / 'PRELOADED.json').exists()
    for relative, expected in json.loads((OUT / 'SOURCE_SHA256.json').read_text(encoding='utf-8')).items():
        assert digest(OUT / relative) == expected, relative
    plan = json.loads((OUT / 'PLAN.json').read_text(encoding='utf-8'))
    for local, phone in [(OUT / 'master', REMOTE)] + [(OUT / w['workerId'], w['remoteRoot']) for w in plan['workers']]:
        root('test ! -e ' + phone)
        call('push', local, phone)
        actual = dict(line.split(None, 1)[::-1] for line in root('find ' + phone + ' -type f -exec sha256sum {} +').splitlines())
        expected = {phone + '/' + str(p.relative_to(local)).replace('\\', '/'): digest(p) for p in local.rglob('*') if p.is_file()}
        assert actual == expected
        root('chown -R 0:0 ' + phone + '\nchmod -R go-w ' + phone + '\nchmod 755 ' + phone)
        for path in local.glob('*.sh'):
            root('sh -n ' + phone + '/' + path.name)
    test = json.loads(root('sh ' + REMOTE + '/mi8_chain_gate_test.sh ' + REMOTE))
    assert test['passed']
    write(OUT / 'GATE_TEST.json', test)
    root('sha256sum -c ' + REMOTE + '/CHAIN_SHA256SUMS > ' + REMOTE + '/upload-hashes.log')
    before = json.loads(root('cat ' + PREVIOUS + '/STATE.json'))
    write(OUT / 'PREVIOUS_BEFORE.json', before)
    command = 'setsid sh ' + REMOTE + '/mi8_chain_gate.sh ' + REMOTE + ' </dev/null >' + REMOTE + '/chain-launch.log 2>&1 &'
    root(command)
    time.sleep(2)
    lock = root('cat ' + REMOTE + '/chain.lock/identity', check=False).split()
    chain = json.loads(root('cat ' + REMOTE + '/CHAIN_STATE.json'))
    processes = []
    if chain['phase'].startswith('waiting_'):
        assert len(lock) == 2
        fields = root('cat /proc/' + lock[0] + '/stat').rsplit(')', 1)[1].split()
        assert fields[0] not in {'Z', 'X', 'x'} and fields[19] == lock[1] and int(fields[1]) == 1
        links = [root('readlink /proc/' + lock[0] + '/fd/' + str(n)) for n in [0, 1, 2]]
        assert links[0] == '/dev/null' and all(v.startswith(REMOTE) for v in links[1:])
        processes.append({'pid': int(lock[0]), 'startTicks': int(lock[1]), 'ppid': 1, 'standardStreams': links})
        assert not root('test -e ' + REMOTE + '/STATE.json && cat ' + REMOTE + '/STATE.json', check=False), '旧段未完成时不应启动新master'
    else:
        assert chain['phase'] in {'starting_next', 'handed_off'}
    after = json.loads(root('cat ' + PREVIOUS + '/STATE.json'))
    if after['phase'] == 'running':
        assert after['masterPid'] == before['masterPid'] and after['doneParents'] >= before['doneParents']
    receipt = {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'beijingTime': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
               'device': DEVICE, 'remoteRoot': REMOTE, 'previousRoot': PREVIOUS, 'nextTotal': 500,
               'humanGameNumbers': [2501, 3000], 'gate': chain, 'processes': processes, 'previousAfter': after,
               'command': command, 'all500JobsOnPhone': True, 'computerRequired': False, 'networkRequired': False,
               'automaticAfterPrevious1000': True, 'physicalUsbDisconnectTested': False, 'rebootAutoStart': False,
               'oldTaskModified': False, 'gateContractTestPassed': True, 'allUploadedHashesVerified': True}
    write(OUT / 'PRELOADED.json', receipt)
    write(TASK / 'PRELOADED_COLLECTION.json', {'plan': str((OUT / 'PLAN.json').resolve()),
          'segmentPlan': str((OUT / 'SEGMENT_PLAN.json').resolve()), 'previousRoot': PREVIOUS, 'remoteRoot': REMOTE,
          'nextTotal': 500, 'humanGameNumbers': [2501, 3000], 'automaticAfterPrevious1000': True})
    print(json.dumps(receipt, ensure_ascii=False), flush=True)


def status():
    pointer = TASK / 'PRELOADED_COLLECTION.json'
    value = json.loads(pointer.read_text(encoding='utf-8')) if pointer.is_file() else None
    result = {'device': DEVICE, 'previous': json.loads(root('cat ' + PREVIOUS + '/STATE.json')),
              'battery': root('dumpsys battery'), 'phoneEpoch': root('date +%s')}
    if value:
        result['chain'] = json.loads(root('cat ' + value['remoteRoot'] + '/CHAIN_STATE.json'))
        raw = root('cat ' + value['remoteRoot'] + '/STATE.json', check=False)
        result['next'] = json.loads(raw) if raw else None
        result['humanGameNumbers'] = value['humanGameNumbers']
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'deploy', 'status'])
    args = parser.parse_args()
    {'prepare': prepare, 'deploy': deploy, 'status': status}[args.mode]()
