"""三星完成旧段后，复用实机采集器下发第2001–2500局，保留旧数据。"""
import argparse
from collections import Counter
import datetime as dt
import json
from pathlib import Path
import re
import shutil
import time

from device import ROOT, TASK, DEVICE, call, shell
from verify_completed import digest

OUT = TASK / 'continuation-2001-2500-20261024'
REMOTE = '/data/local/tmp/aeii-hard-production-parallel-samsung-20261024-04'


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def textfile(path, value):
    Path(path).write_text(value, encoding='utf-8', newline='\n')


def old_plan():
    return json.loads((TASK / 'production-03/PLAN.json').read_text(encoding='utf-8'))


def identity(pid, ticks):
    assert str(pid).isdigit() and int(pid) > 1 and str(ticks).isdigit()
    fields = shell('cat /proc/' + str(pid) + '/stat').rsplit(')', 1)[1].split()
    assert fields[0] not in {'Z', 'X', 'x'} and int(fields[19]) == int(ticks)
    owner = re.search(r'(?m)^Uid:\s*(\d+)', shell('cat /proc/' + str(pid) + '/status'))
    assert owner and int(owner[1]) == 2000
    return {'pid': int(pid), 'startTicks': int(ticks), 'uid': 2000, 'ppid': int(fields[1])}


def preflight():
    assert shell('getprop ro.product.model') == 'SM-N9500'
    previous = old_plan()
    state = json.loads(shell('cat ' + previous['remoteRoot'] + '/STATE.json'))
    assert state['phase'] == 'complete' and state['doneParents'] == 1000
    assert all(w['state']['phase'] == 'complete' and not w['controllerAlive'] for w in state['workers'])
    for worker in previous['workers']:
        assert shell('sha256sum ' + worker['installedPath']).split()[0] == worker['sha256']
        uid = re.search(r'(?m)^\s*userId=(\d+)', shell('dumpsys package ' + worker['package']))
        assert uid and int(uid[1]) == worker['uid']
        assert not shell('pidof ' + worker['package'], check=False), '独立采集副本仍有未知进程，拒绝覆盖启动输入'
    return previous, state


def prepare():
    previous, state = preflight()
    OUT.mkdir(exist_ok=False)
    source_dir = OUT / 'phone-source'
    source_dir.mkdir()
    # 拉取实际运行的最终版本，避免误用先前被修复过的旧脚本。
    inputs = {'master': ['master-smart-01.sh', 'smart_governor.sh', 'smart_governor_test.sh',
                         'process-importance.jar', 'recovery_guard.sh']}
    inputs.update({w['workerId']: ['controller.sh', 'process_thaw.sh', 'collector.bundle.js',
                                  'base-config.zip', 'inject-path.txt'] for w in previous['workers']})
    source_hashes = {}
    for group, names in inputs.items():
        local = source_dir / group
        local.mkdir()
        remote = previous['remoteRoot'] if group == 'master' else previous['remoteRoot'] + '-' + group
        for name in names:
            call('pull', remote + '/' + name, local / name)
            actual = shell('sha256sum ' + remote + '/' + name).split()[0]
            assert digest(local / name) == actual
            source_hashes[group + '/' + name] = actual
    source_path = ROOT / 'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json'
    source = json.loads(source_path.read_text(encoding='utf-8'))
    previous_segment = json.loads((TASK / 'SEGMENT_PLAN.json').read_text(encoding='utf-8'))
    assert digest(source_path) == previous_segment['sourcePlanSha256']
    selected = source['jobs'][2000:2500]
    reserved = source['jobs'][2500:3000]
    assert len(selected) == len(reserved) == 500
    assert len({j['parentId'] for j in selected}) == len({j['seed'] for j in selected}) == 500
    for field in ['parentId', 'seed']:
        assert not {j[field] for j in selected}.intersection(j[field] for j in source['jobs'][:2000] + reserved)
    jobs = [{'index': i, 'globalZeroBasedIndex': i - 1, 'parentId': j['parentId'],
             'sourcePlanParentId': j['parentId'], 'attemptId': '__ATTEMPT__', 'map': j['map'],
             'seed': j['seed'], 'maxActions': 20000, 'mode': 'SD', 'requestedPlayerType': 3,
             'jsRngMode': 'original_webview_rng'} for i, j in enumerate(selected, 2001)]
    segment_path = OUT / 'SEGMENT_PLAN.json'
    segment = {'schema': 'samsung-third-hard-segment-v1', 'device': DEVICE, 'sourcePlan': str(source_path),
               'sourcePlanSha256': digest(source_path), 'sourceApkSha256': source['apkSha256'],
               'globalZeroBasedRange': [2000, 2500], 'humanGameNumbers': [2001, 2500], 'total': 500,
               'quota': dict(Counter(j['map'] for j in jobs)), 'jobs': jobs, 'jsSeedControlled': False,
               'javaHardFallbackPreserved': True, 'independentReplayDeferred': True,
               'automaticTrainingAdmission': False, 'reservedForMi8': {'globalZeroBasedRange': [2500, 3000],
               'humanGameNumbers': [2501, 3000], 'total': 500, 'dispatched': False},
               'noOverlapWithEarlierSegmentsOrReservedMi8': True}
    write(segment_path, segment)
    master = OUT / 'master'
    master.mkdir()
    for name in inputs['master']:
        data = (source_dir / 'master' / name).read_bytes()
        if name == 'recovery_guard.sh':
            data = data.replace(previous['remoteRoot'].encode(), REMOTE.encode())
        (master / name).write_bytes(data)
    textfile(master / 'global.env', 'TOTAL=500\nINITIAL_DONE=0\nLIMIT=3\nWORKER_COUNT=3\n')
    textfile(master / 'OPERATING_CEILING', '3\n')
    textfile(master / 'SELECTED_LIMIT', '3\n')
    workers, rows = [], []
    for slot, previous_worker in enumerate(previous['workers']):
        wid = previous_worker['workerId']
        local = OUT / wid
        local.mkdir()
        (local / 'configs').mkdir()
        remote = REMOTE + '-' + wid
        for name in inputs[wid]:
            data = (source_dir / wid / name).read_bytes()
            if name == 'controller.sh':
                old = b'test "$SEQ" -ge 1001 && test "$SEQ" -le 2000'
                assert data.count(old) == 1
                data = data.replace(old, b'test "$SEQ" -ge 2001 && test "$SEQ" -le 2500')
                # 新总调度使用私有umask；由shell打开输入，再经stdin交给run-as。
                old_bootstrap = b'run-as "$PACKAGE" sh -c "cat $BUNDLE > files/collector.bundle.js; cat $CONFIG > files/current.json"'
                new_bootstrap = b'run-as "$PACKAGE" sh -c \'cat > files/collector.bundle.js\' < "$BUNDLE" && run-as "$PACKAGE" sh -c \'cat > files/current.json\' < "$CONFIG"'
                assert data.count(old_bootstrap) == 1
                data = data.replace(old_bootstrap, b'(' + new_bootstrap + b')')
            elif name == 'process_thaw.sh':
                assert previous['remoteRoot'].encode() in data
                data = data.replace(previous['remoteRoot'].encode(), REMOTE.encode())
            (local / name).write_bytes(data)
        shard = jobs[slot::3]
        env = {'PACKAGE': previous_worker['package'], 'APP_UID': previous_worker['uid'],
               'ACTIVITY': 'net.toyknight.aeii.android.AndroidLauncher', 'GLOBAL_ROOT': REMOTE,
               'WORKER_ID': wid, 'TOTAL': len(shard)}
        textfile(local / 'worker.env', ''.join(f'{k}={v}\n' for k, v in env.items()))
        textfile(local / 'attempt-prefix.txt', 'samsung-seg3-p04-20261024-' + wid + '\n')
        template_path = TASK / 'production-03' / wid / 'configs' / f'{previous_worker["sequences"][0]:04d}.json'
        template = json.loads(template_path.read_text(encoding='utf-8'))
        index = []
        for job in shard:
            config = {**template, 'job': job, 'baseConfigZip': remote + '/base-config.zip',
                      'taskRoot': remote, 'globalRoot': REMOTE, 'sequenceIndex': job['index'],
                      'planSha256': digest(segment_path)}
            write(local / 'configs' / f'{job["index"]:04d}.json', config)
            index.append(f'{job["index"]} {job["parentId"]} {remote}/configs/{job["index"]:04d}.json\n')
        textfile(local / 'index.txt', ''.join(index))
        rows.append(f'{wid} {previous_worker["package"]} {previous_worker["uid"]} {remote}\n')
        workers.append({**previous_worker, 'remoteRoot': remote, 'sequences': [j['index'] for j in shard]})
    textfile(master / 'workers.tsv', ''.join(rows))
    write(OUT / 'PLAN.json', {'device': DEVICE, 'remoteRoot': REMOTE, 'limit': 3, 'initialDone': 0,
          'total': 500, 'workers': workers, 'globalZeroBasedRange': [2000, 2500],
          'humanGameNumbers': [2001, 2500], 'segmentPlanPath': str(segment_path.resolve()),
          'segmentPlanSha256': digest(segment_path), 'sourceApkSha256': source['apkSha256'],
          'previousCompletedRoot': previous['remoteRoot'], 'previousCompletedParents': 1000})
    write(OUT / 'PREPARED.json', {'utc': dt.datetime.now(dt.timezone.utc).isoformat(),
          'previousState': state, 'actualPhoneSourceSha256': source_hashes,
          'collectorBundlesByteIdentical': True, 'apkReinstallRequired': False})
    shutil.copy2(__file__, OUT / 'continue_segment.py')
    write(OUT / 'SOURCE_SHA256.json', {str(p.relative_to(OUT)).replace('\\', '/'): digest(p)
          for p in OUT.rglob('*') if p.is_file()})
    print(json.dumps({'directory': str(OUT), 'total': 500, 'humanGameNumbers': [2001, 2500],
                      'reservedForMi8': [2501, 3000]}, ensure_ascii=False), flush=True)


def deploy():
    previous, _ = preflight()
    assert not (OUT / 'DEPLOYED.json').exists()
    # 旧段的1000局必须已全部取回且通过传输核验，才开始新段。
    latest = json.loads((TASK / 'LATEST_SYNC.json').read_text(encoding='utf-8'))
    index = json.loads(Path(latest['index']).read_text(encoding='utf-8'))
    assert index['completedParents'] == 1000 and index['transferHashesVerified']
    assert not index['errors'] and not index['notYetDownloaded']
    for relative, expected in json.loads((OUT / 'SOURCE_SHA256.json').read_text(encoding='utf-8')).items():
        assert digest(OUT / relative) == expected, relative
    plan = json.loads((OUT / 'PLAN.json').read_text(encoding='utf-8'))
    assert plan['device'] == DEVICE and plan['remoteRoot'] == REMOTE and plan['total'] == 500
    for local, remote in [(OUT / 'master', REMOTE)] + [(OUT / w['workerId'], w['remoteRoot']) for w in plan['workers']]:
        shell('test ! -e ' + remote)
        call('push', local, remote)
        actual = dict(line.split(None, 1)[::-1] for line in shell('find ' + remote + ' -type f -exec sha256sum {} +').splitlines())
        expected = {remote + '/' + str(p.relative_to(local)).replace('\\', '/'): digest(p)
                    for p in local.rglob('*') if p.is_file()}
        assert actual == expected
        shell('chmod -R go-w ' + remote + '; chmod 755 ' + remote)
        for path in local.glob('*.sh'):
            shell('sh -n ' + remote + '/' + path.name)
    test_result = json.loads(shell('sh ' + REMOTE + '/smart_governor_test.sh ' + REMOTE + '/smart_governor.sh'))
    assert test_result['passed']
    write(OUT / 'GOVERNOR_TEST.json', test_result)
    probe = shell('CLASSPATH=' + REMOTE + '/process-importance.jar app_process /system/bin ProcessImportance --probe')
    assert 'probe_passed' in probe
    textfile(OUT / 'IMPORTANCE_PROBE.txt', probe)
    # 不接管旧PID，不修改旧root；新任务由独立手机本地总调度启动。
    command = 'setsid sh ' + REMOTE + '/master-smart-01.sh ' + REMOTE + ' </dev/null >' + REMOTE + '/launch.log 2>&1 &'
    shell(command)
    time.sleep(6)
    state = json.loads(shell('cat ' + REMOTE + '/STATE.json'))
    assert state['phase'] == 'running' and state['total'] == 500 and all(w['controllerAlive'] for w in state['workers'])
    master_identity = identity(*shell('cat ' + REMOTE + '/master.lock/identity').split())
    assert master_identity['ppid'] == 1
    shell('setsid sh ' + REMOTE + '/recovery_guard.sh </dev/null >' + REMOTE + '/recovery-guard.log 2>&1 &')
    receipt = {'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'device': DEVICE, 'remoteRoot': REMOTE,
               'total': 500, 'humanGameNumbers': [2001, 2500], 'command': command,
               'masterIdentity': master_identity, 'state': state, 'computerRequired': False,
               'previousSyncIndex': latest['index'], 'previousSyncIndexSha256': digest(latest['index']),
               'previousCompletedRoot': previous['remoteRoot'], 'previousCompletedParentsPreserved': 1000}
    write(OUT / 'DEPLOYED.json', receipt)
    write(TASK / 'ACTIVE_COLLECTION.json', {'plan': str((OUT / 'PLAN.json').resolve()),
          'segmentPlan': str((OUT / 'SEGMENT_PLAN.json').resolve()), 'remoteRoot': REMOTE,
          'total': 500, 'humanGameNumbers': [2001, 2500], 'previousCompletedParents': 1000,
          'runningReceipt': str((OUT / 'RUNNING_CONFIRMED.json').resolve())})
    print(json.dumps(receipt, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'deploy'])
    args = parser.parse_args()
    {'prepare': prepare, 'deploy': deploy}[args.mode]()
