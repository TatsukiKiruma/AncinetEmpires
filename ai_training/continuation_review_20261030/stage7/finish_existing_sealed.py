"""只补完原封存令牌的离线计算和报告，不启动对局、不新建令牌。"""
import ctypes
import hashlib
import math
import subprocess
import sys
from pathlib import Path
from phase_b_watch import DATA, HERE, read_json, save, now
from stage7_reports import ROOT, reports


def digest(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    token_file = HERE / 'STAGE7_SEALED_TOKEN.json'
    token_hash = digest(token_file)
    token = read_json(token_file)
    gate = read_json(HERE / 'PHASE_D_DECISION.json')
    assert token['attempts'] == token['sealedAccess'] == 1
    assert token['gateSha256'] == digest(HERE / 'PHASE_D_DECISION.json')
    model = gate['chosen']['model']
    assert gate['passed'] and token['modelSha256'] == model['sha256'] == digest(model['prefix'] + '.bin')
    assert not (HERE / 'PHASE_E_DECISION.json').exists()
    results = []
    for label, count in [('C1-sealed', 54), ('candidate-sealed', 54), ('candidate-historical', 40)]:
        folder = DATA / 'arena' / label
        r = read_json(folder / 'SUMMARY.json')
        assert r['passed'] and r['natural'] == count and r['timeForfeits'] == 0
        assert len(r['games']) == len({g['id'] for g in r['games']}) == count
        for g in r['games']:
            receipt = read_json(folder / (g['id'] + '.receipt.json'))
            assert receipt['result'] == g and receipt['sourceIdentity'] == r['sourceIdentity']
            assert g['natural'] and not g['error'] and g['timeForfeits'] == 0
        assert r['wins'] == sum(g['won'] for g in r['games'])
        results.append(r)
    c1, candidate, historical = results
    folder = DATA / 'sealed-offline'
    dataset = read_json(folder / 'DATASET.json')
    assert dataset['parents'] == 329 and dataset['identity'].split('/')[0] == token['gateSha256']
    report = folder / 'OFFLINE.json'
    if not report.exists():
        with (folder / 'offline-recovery.log').open('ab') as log:
            subprocess.run([str(ROOT / 'ai_training/.venv-rocm/Scripts/python.exe'), '-B', '-X', 'utf8',
                str(HERE / 'sealed_offline_stage7.py'), model['prefix'], model['sha256'],
                dataset['dbFile'], dataset['identity'], str(token_file), str(report)], cwd=ROOT,
                stdout=log, stderr=log, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    offline = read_json(report)
    assert offline['passed'] and offline['parents'] == 329 and offline['modelSha256'] == model['sha256']
    assert all(math.isfinite(offline[k]) for k in ('brier', 'ce', 'slotECE'))
    module = './' + (HERE / 'phase7_io.ts').relative_to(ROOT).as_posix()
    subprocess.run(['node.exe', '--import', 'tsx', '--input-type=module', '-e',
        f"import {{checkSourceLock,checkH1}} from '{module}';checkSourceLock();checkH1();"], cwd=ROOT, check=True)
    assert digest(token_file) == token_hash
    passed = (candidate['wins'] >= max(37, c1['wins'] + 1) and candidate['equalWin'] > c1['equalWin']
        and all(candidate['byPlayers'][str(n)]['wins'] >= floor for n, floor in [(2, 15), (3, 11), (4, 10)])
        and all(candidate['byPlayers'][str(n)]['wins'] >= c1['byPlayers'][str(n)]['wins'] - 2 for n in (2, 3, 4)))
    save(HERE / 'PHASE_E_DECISION.json', dict(passed=passed, c1=c1, candidate=candidate,
        historical=historical, offline=offline, token=token, sealedAccess=1))
    save(HERE / 'PHASE_E_PROGRESS.json', dict(phase='complete', passed=passed, sealedAccess=1))
    return None if passed else '候选未达到最终封存晋级条件'


if __name__ == '__main__':
    kernel = ctypes.windll.kernel32
    assert kernel.SetThreadExecutionState(0x80000001)
    reason = '原封存会话离线补算未完成'
    save(HERE / 'RUN_STATUS.json', dict(phase='E', status='offline_recovery', sealedAccess=1, updatedAt=now()))
    try:
        reason = main()
    except Exception as exc:
        reason = f'原封存离线收尾失败：{type(exc).__name__}: {exc}'
        raise
    finally:
        kernel.SetThreadExecutionState(0x80000000)
        save(HERE / 'SEALED_OFFLINE_RECOVERY.json', dict(finishedAt=now(), reason=reason,
            originalTokenReused=True, newSession=False, sleepLockHeld=False))
        reports('E', reason, workload_sleep_lock_released=True)
