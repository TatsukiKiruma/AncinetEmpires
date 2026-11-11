import collections
import hashlib
import json
import shutil
import sys
import time
import traceback

import pipeline as P

ROOT = P.ROOT
RECOVERY = ROOT / 'recovery'
ORIGINAL_STATUS = P.status


def status(phase, **fields):
    # 恢复事件时间与状态记录时间分别保存，避免同名参数冲突。
    if 'at' in fields:
        fields['eventAt'] = fields.pop('at')
    ORIGINAL_STATUS(phase, **fields)


P.status = status


def main():
    P.guard()
    gate = P.read('HOST_GATE.json')
    assert P.sha(ROOT / 'HOST_GATE.json') == '18bcc4c25fb8d71eedc5a1fefa5b0afa86c13fb20218115f20790ddca90d958c'
    for name, expected in gate['bindings'].items():
        assert P.sha(P.REPO / name) == expected, name
    for local, remote in [('trainer-arm64', 'trainer'), ('config.json', 'config.json'), ('schema.json', 'schema.json'), ('initial.json', 'initial.json'), ('GATE.json', 'GATE.json')]:
        assert P.sha(ROOT / local) == P.adb('shell', 'sha256sum', P.REMOTE + '/' + remote).split()[0], local
    for path in ROOT.glob('train-epoch-*.live.json'):
        pid = json.loads(path.read_text(encoding='utf-8'))['pid']
        assert P.REMOTE + '/trainer' not in P.adb('shell', 'cat', f'/proc/{pid}/cmdline', check=False), pid
    assert not P.adb('shell', f'if [ -e {P.REMOTE}/pause ]; then echo PAUSED; fi', check=False)
    saved = P.adb('shell', 'cat', P.REMOTE + '/resume.json')
    state = json.loads(saved)
    checkpoint_sha = hashlib.sha256(saved.encode()).hexdigest()
    assert checkpoint_sha == 'b21ec0aa0375a7fc947513a85744c3ae2a5a498c7a8140839b8aaab0498d298d'
    assert (state['epoch'], state['rows'], state['updates'], state['done']) == (3, 44800, 5600, False)
    assert state['configSha256'] == P.sha(ROOT / 'config.json')
    assert state['contractSha256'] == P.sha(ROOT / 'GATE.json')
    assert state['weights'][-261:] == P.read('initial.json')[-261:]
    RECOVERY.mkdir(exist_ok=True)
    assert not (RECOVERY / 'revision.json').exists(), '恢复修订已启动，禁止重复启动'
    shutil.copy2(ROOT / 'updates.jsonl', RECOVERY / 'updates-before-recovery.jsonl')
    journal_path = RECOVERY / 'updates-phone-at-recovery.jsonl'
    P.adb('pull', P.REMOTE + '/updates.jsonl', str(journal_path), timeout=120)
    assert P.sha(journal_path) == P.adb('shell', 'sha256sum', P.REMOTE + '/updates.jsonl').split()[0]
    journal = [json.loads(line) for line in journal_path.read_text(encoding='utf-8').splitlines()]
    for epoch, count in [(1, 31165), (2, 31165), (3, 5600)]:
        actual = [row['updates'] for row in journal if row['epoch'] == epoch]
        assert len(actual) == count and set(actual) == set(range(1, count + 1)), epoch
    resource = P.snapshot()
    assert P.suitable(resource), resource
    revision = dict(at=time.time(), reason='C盘门槛触发后批边界保存；原恢复控制器at字段重复导致退出', reset=False, wrapperSha256=P.sha(ROOT / 'resume_pipeline.py'), originalBindings=P.STARTUP_BINDINGS, hostGateSha256=P.sha(ROOT / 'HOST_GATE.json'), checkpointSha256=checkpoint_sha, epoch=3, rows=44800, updates=5600, recordedUpdates=len(journal), freePCBytes=shutil.disk_usage(ROOT).free, resource=resource)
    (RECOVERY / 'revision.json').write_text(json.dumps(revision, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'pipeline-failure.json').rename(RECOVERY / 'pipeline-failure-before-resume.json')
    status('仅手机恢复第3轮，前两轮不重跑', resumeRows=44800, resumeUpdates=5600, optimizerUpdatesOnPC=0)
    for attempt in range(2, 5):
        try:
            P.call([sys.executable, ROOT / 'run_900.py'], f'run-900-recovered-{attempt}')
            break
        except BaseException as error:
            if attempt == 4:
                raise
            P.recover(attempt, error)
    status('最佳模型只读复验')
    P.trained_check()
    P.call([sys.executable, ROOT / 'seal_training.py'], 'seal-training')
    status('固定五图十槽开发对战，无补赛')
    for script in ['prepare.ts', 'preflight.ts', 'run.ts', 'replay.ts', 'report.ts']:
        P.call(['node', '--import', 'tsx', P.BATTLE / script], 'battle-' + script.replace('.ts', ''))
    P.finish()


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        (ROOT / 'pipeline-failure.json').write_text(json.dumps(dict(at=time.time(), error=str(error), traceback=traceback.format_exc(), reset=False), indent=2), encoding='utf-8')
        status('恢复流程发生错误，保留全部证据与检查点', error=str(error), reset=False)
        raise
