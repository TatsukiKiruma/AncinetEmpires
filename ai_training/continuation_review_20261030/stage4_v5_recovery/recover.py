"""保留异常局，核验完整收据，局级硬看门狗保护剩余开发评测。"""
import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path('C:/code/AncinetEmpires')
HERE = ROOT / 'ai_training/continuation_review_20261030/stage4_v5'
OUT = ROOT / 'ai_training/continuation_review_20261030/stage4_v5_recovery'
DATA = Path('D:/AncientEmpiresData/continuation_stage4_v5_20261101_v1')
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p, value):
    with p.open('x', encoding='utf-8') as f: json.dump(value, f, ensure_ascii=False, indent=2)

plan = read(HERE / 'PLAN.json')
for file, expected in plan['runtime']['files'].items():
    assert digest(ROOT / file) == expected, file
for file, expected in plan['preserved'].items():
    assert digest(Path(file)) == expected, file
games = []
for receipt in (DATA / 'C1').glob('*.receipt.json'):
    r = read(receipt)
    for file, expected in r['files'].items(): assert digest(Path(file)) == expected, file
    summary = read(receipt.with_name(receipt.name.replace('.receipt.json', '')) / 'SUMMARY.json')
    games.extend(summary['games'])
assert len(games) == 6
assert not (HERE / 'FINAL_TEST_ATTEMPT.json').exists()
failed = DATA / 'C1/p3-10-s0'
save(OUT / 'INTERRUPTION.json', {'classification': 'runtime_stall', 'id': 'p3-10-s0', 'natural': False,
    'preserved': {str(p): digest(p) for p in failed.rglob('*') if p.is_file()},
    'completedReceiptsVerified': 6, 'sealedAccess': 0, 'trainingUpdates': 0})
done = {r['id'] for r in games} | {'p3-10-s0'}
for match in read(HERE / 'DEV_SUBSET.json')['ids']:
    if match in done: continue
    if (HERE / 'STOP').exists(): raise RuntimeError('用户停止')
    folder = DATA / 'recovery-C1' / match
    assert not folder.exists(), '禁止覆盖已有尝试'
    subset = DATA / ('recovery-' + match + '.json')
    save(subset, {'panelSha256': plan['panelSha256'], 'ids': [match]})
    (OUT / 'PROGRESS.json').write_text(json.dumps({'match': match, 'completed': len(games), 'interrupted': 1, 'sealedAccess': 0}), encoding='utf-8')
    with (DATA / ('recovery-' + match + '.stdout.log')).open('x') as out, (DATA / ('recovery-' + match + '.stderr.log')).open('x') as err:
        child = subprocess.Popen(['node', 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'arena.ts'), str(HERE / 'config-C1.json'), str(folder), 'dev', str(subset)], cwd=ROOT, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
        try: code = child.wait(timeout=1920)
        except subprocess.TimeoutExpired:
            subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], capture_output=True)
            child.wait()
            save(OUT / (match + '-TIMEOUT.json'), {'natural': False, 'classification': 'external_watchdog_timeout'})
            continue
    if code: raise RuntimeError('评测异常，保留全部文件：' + match)
    result = read(folder / 'SUMMARY.json')
    assert result['gpuExited'] and result['complete']
    save(folder.with_suffix('.receipt.json'), {'files': {str(p): digest(p) for p in folder.rglob('*') if p.is_file()}})
    games.extend(result['games'])
save(OUT / 'RESULTS.json', {'games': games, 'missing': ['p3-10-s0'], 'completeCoverage': False, 'sealedAccess': 0})
(OUT / 'DEVELOPMENT_GATE_REPORT.md').write_text('# V5恢复报告\n\n剩余Dev-18评测已结束。原p3-10-s0无限等待，原始记录保留，未重跑。完整覆盖门禁不成立，停止后续配置与封存；异常不计自然负局。训练更新0、封存访问0。\n', encoding='utf-8')
save(OUT / 'RUN_CLOSED.json', {'childrenRemaining': 0, 'sealedAccess': 0, 'trainingUpdates': 0})
