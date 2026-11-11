"""严格收尾R24停机现场，保留所有原件；本工具不启动任何新对局。"""
from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
stop_path = HERE / 'revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json'
stop = read(stop_path)
target = HERE / 'revisions/xiaomi_20261020' / ('r24-closeout-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f'))
target.mkdir()

# 手机切换只修改了两个旧执行入口的拦截；规则与风险审计必须仍等于冻结源码。
freeze = read(HERE / 'source-freeze-teacher-r24.json')
differences = []
for name, identity in freeze['files'].items():
    file = ROOT / name
    if sha(file) != identity['sha256']:
        assert file.name in ('battle.ts', 'expert.ts'), name
        old = (HERE / identity['snapshot']).read_text(encoding='utf-8')
        new = file.read_text(encoding='utf-8')
        import difflib
        diff = ''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile='冻结源码', tofile=name))
        assert 'rejectPcGames' in diff
        differences.append(dict(path=name, oldSha256=identity['sha256'], currentSha256=sha(file), diff=diff))
with (target / 'source-binding.json').open('x', encoding='utf-8') as out:
    json.dump(dict(sourceFreezeSha256=sha(HERE / 'source-freeze-teacher-r24.json'), entryGuardDifferences=differences), out, ensure_ascii=False, indent=2)
entries = stop['completed'] + stop['interruptedSlots']
assert len(entries) == 89 and len(stop['completed']) == 85

def run(index):
    entry = entries[index]
    folder = HERE / 'teacher-r24-battles/slots' / entry['slot']
    receipt = folder / ('strict-prefix-replay.json' if index >= 85 else 'strict-replay.json')
    assert not receipt.exists(), '首次收尾拒绝覆盖任何已有收据'
    command = ['node', 'ai_training/run.mjs', 'node', '--import', 'tsx', 'tactical_exit_20261019/replay_r24_stop.ts', str(index)]
    with (target / f'{index:03d}-{entry["slot"]}.log').open('x', encoding='utf-8') as out:
        result = subprocess.run(command, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print(f'{index + 1}/89 {entry["slot"]} exit={result.returncode}', flush=True)
    return result.returncode

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    codes = list(pool.map(run, range(len(entries))))
assert not any(codes), str(target)
risks = {}
receipts = []
for index, entry in enumerate(entries):
    folder = HERE / 'teacher-r24-battles/slots' / entry['slot']
    file = folder / ('strict-prefix-replay.json' if index >= 85 else 'strict-replay.json')
    receipt = read(file)
    assert receipt['passed']
    assert sha(folder / 'actions.jsonl') == (entry['sha256'] if index >= 85 else entry['rawSha256'])
    if index < 85:
        assert sha(folder / 'result.json') == entry['resultSha256']
    for key, value in receipt['riskWitnessAudit'].items():
        risks[key] = risks.get(key, 0) + value
    receipts.append(dict(path=file.relative_to(HERE).as_posix(), sha256=sha(file), actions=receipt['actions']))
report = dict(passed=True, completedSlots=85, completedActions=sum(r['actions'] for r in receipts[:85]), interruptedSlots=4,
              interruptedActions=sum(r['actions'] for r in receipts[85:]), riskWitnessAudit=risks,
              stopRecordSha256=sha(stop_path), originalLogsAndResultsUnchanged=True, receipts=receipts,
              qualifiedTeacher=False, gamesStarted=0, scope='历史PC现场strict收尾，不作为真机门禁通过证据')
assert report['completedActions'] == 48533 and report['interruptedActions'] == 2747
with (target / 'CLOSEOUT.json').open('x', encoding='utf-8') as out:
    json.dump(report, out, ensure_ascii=False, indent=2)
print(json.dumps(dict(report, receipts=len(receipts), output=target.relative_to(HERE).as_posix()), ensure_ascii=False), flush=True)
