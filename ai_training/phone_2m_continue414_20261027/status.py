"""核实414局续训的完整继承、进程身份、推进和独立运行证据。"""
import datetime as dt
import json
from device import HERE, PHONE, root, write

JOB = PHONE + '/job'


def read(name):
    raw = root('if test -f ' + JOB + '/' + name + '; then cat ' + JOB + '/' + name + '; fi')
    return json.loads(raw) if raw else None


def process(identity):
    pid = identity['pid']
    raw = root('if test -r /proc/' + str(pid) + '/stat; then cat /proc/' + str(pid) + '/stat; fi')
    if not raw:
        return {'pid': pid, 'identityMatched': False, 'exited': True}
    fields = raw.rsplit(')', 1)[1].split()
    return {'pid': pid, 'startTicks': int(fields[19]), 'state': fields[0], 'sessionId': int(fields[3]),
            'identityMatched': int(fields[19]) == identity['startTicks'] and fields[0] not in {'Z', 'X'},
            'exe': root('readlink /proc/' + str(pid) + '/exe'),
            'fds': [root('readlink /proc/' + str(pid) + '/fd/' + str(i), check=False) for i in range(3)]}


def main():
    names = ['output/PROGRESS.json', 'output/BASE_RESUME_VERIFIED.json', 'output/WORKER_RNG_RESTORED.json',
             'output/WORKERS.json', 'output/LATEST.json', 'RESOURCE.json', 'CONTROLLER_STARTED.json',
             'CONTROLLER_EXIT.json', 'output/COMPLETE.json']
    values = {name: read(name) for name in names}
    now = int(root('date +%s'))
    errors = root('find ' + JOB + ' -maxdepth 2 -type f -name "*ERROR-*.json"')
    report = {'checkedBeijing': dt.datetime.fromtimestamp(now, dt.timezone(dt.timedelta(hours=8))).isoformat(),
              'values': values, 'errorFiles': errors, 'strictReplayExecuted': False, 'automaticBeyond2414': False}
    if values['CONTROLLER_EXIT.json'] or values['output/COMPLETE.json']:
        report['currentBattery'] = root('dumpsys battery')
        write(HERE / 'LATEST_STATUS.json', report)
        print(json.dumps(report, ensure_ascii=False))
        return
    missing = [name for name in names[:-2] if not values[name]]
    if missing:
        report['waitingFor'] = missing
        write(HERE / 'STARTUP_STATUS.json', report)
        print(json.dumps(report, ensure_ascii=False))
        return
    plan = json.loads((HERE / 'PLAN.json').read_text(encoding='utf-8'))
    progress = values['output/PROGRESS.json']
    base = values['output/BASE_RESUME_VERIFIED.json']
    workers = values['output/WORKERS.json']
    latest = values['output/LATEST.json']
    resource = values['RESOURCE.json']
    identities = {'controller': process(values['CONTROLLER_STARTED.json']),
                  'coordinator': process(workers['coordinator']),
                  **{'worker' + str(i): process(w) for i, w in enumerate(workers['workers'])},
                  'encoder': process(workers['encoder'])}
    checks = {'modelAdamwSchedulerRngInherited': base['passed'] and all(base['checks'].values())
              and base['sourceCheckpointSha256'] == plan['baseCheckpointSha256'],
              'baseGlobalStepContinued': base['globalStep'] == 201251 and base['cursor'] == 0
              and base['cumulativeSamples'] == 1610008 and base['inheritedParents'] == 2000,
              'bothWorkerRngRestored': values['output/WORKER_RNG_RESTORED.json']['passed'],
              'twoWorkers': len(workers['workers']) == 2,
              'allProcessIdentitiesMatched': all(p['identityMatched'] for p in identities.values()),
              'trainingAdvanced': progress['phase'] == 'training' and progress['cursor'] > 0,
              'newCheckpointSaved': latest['globalStep'] > 201251
              and root('sha256sum ' + JOB + '/output/' + latest['file']).split()[0] == latest['sha256'],
              'resourceMonitorValid': resource['valid'] and now - resource['epoch'] < 30,
              'noEncodingErrors': not errors,
              'localControllerDetached': identities['controller'].get('sessionId') == identities['controller']['pid']
              and identities['controller'].get('fds', [None])[0] == '/dev/null',
              'sameAuthorizedBudget': progress['samples'] == 325181 and progress['parents'] == 414
              and progress['totalSegmentUpdates'] == 40648 and progress['automaticBeyond2414'] is False}
    report.update(checks=checks, processes=identities)
    write(HERE / 'LATEST_STATUS.json', report)
    if all(checks.values()):
        write(HERE / 'RUNNING_VERIFIED.json', report)
        write(HERE / 'SAFE_TO_DISCONNECT.json', {'ready': True, 'checkedBeijing': report['checkedBeijing'],
              'checks': checks, 'hostRpcRequired': False, 'physicalUsbUnplugTested': False,
              'stopAfterCumulativeParents': 2414, 'automaticBeyond2414': False})
    print(json.dumps({'checkedBeijing': report['checkedBeijing'], 'checks': checks, 'progress': progress,
                      'resource': resource, 'latestCheckpoint': latest}, ensure_ascii=False))
    if not all(checks.values()):
        raise SystemExit(2)


if __name__ == '__main__':
    main()
