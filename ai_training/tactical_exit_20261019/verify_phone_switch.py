"""验证无Random计划的谱系与六个旧PC入口拦截，禁止真的提交动作。"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def inventory():
    # 连日志字节及写入时间也必须不变，不能把已执行动作的失败误当入口成功拦截。
    return {str(path.relative_to(HERE)): (path.stat().st_size, path.stat().st_mtime_ns) for path in HERE.glob('*battles/slots/*/actions.jsonl')}


protocol = read(HERE / 'ACTIVE_DEVICE_PROTOCOL.json')
assert not protocol['allowRandom'] and not protocol['allowPcBattleExecution']
plans = []
for name, count in [('teacher-phone-plan-v1.json', 120), ('final-phone-plan-v1.json', 160)]:
    new = read(HERE / name)
    source = HERE / new['historicalSourcePlan']['path']
    assert sha(source) == new['historicalSourcePlan']['sha256']
    old = read(source)
    assert new['slots'] == [slot for slot in old['slots'] if slot['opponent'] != 'random']
    assert new['maps'] == old['maps'] and new['budgets'] == old['budgets']
    assert len(new['slots']) == count
    for arm in new['arms']:
        slots = [slot for slot in new['slots'] if slot['model'] == arm]
        assert sum(slot.get('panel', 'fixed') == 'fixed' for slot in slots) == 20
        assert sum(slot.get('panel', 'fixed') == 'expanded' for slot in slots) == 20
        assert len({(slot.get('panel', 'fixed'),slot['opponent'],slot['mapIndex'],slot['seat'],slot['opponentSeed']) for slot in slots}) == 40
    plans.append(dict(path=name, sha256=sha(HERE / name), slots=count, oldSourceUnchanged=True, oldAllNonRandomSlotsExact=True))

commands = [
    [sys.executable, '-X', 'utf8', str(HERE / 'run_battles.py'), 'teacher-r24', 'play', '4'],
    [sys.executable, '-X', 'utf8', str(HERE / 'run_expert.py'), 'play', '4'],
    [sys.executable, '-X', 'utf8', str(HERE / 'pipeline_revision.py'), 'r24', 'teacher-r23'],
    [sys.executable, '-X', 'utf8', str(HERE / 'pipeline_full.py')],
    ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'tactical_exit_20261019/battle.ts', 'play', '0', '150'],
    ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'tactical_exit_20261019/expert.ts', 'play', '0', '4'],
]
before, state_sha = inventory(), sha(HERE / 'TASK_STATE.json')
results = []
for command in commands:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=45, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    assert result.returncode != 0 and '旧PC' in result.stderr and '真机' in result.stderr, result.stdout + result.stderr
    assert inventory() == before
    results.append(dict(entry=next(arg for arg in command if arg.endswith(('.py', '.ts'))), rejected=True, exitCode=result.returncode))
assert sha(HERE / 'TASK_STATE.json') == state_sha
report = dict(passed=True, plans=plans, oldPcEntries=results, oldActionLogsUnchanged=True, taskStateUnchanged=True, gamesStarted=0, phoneBattleGatePassed=False)
target = HERE / 'revisions/xiaomi_20261020' / ('switch-verification-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f') + '.json')
with target.open('x', encoding='utf-8') as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
print(json.dumps(dict(report, receipt=target.relative_to(HERE).as_posix()), ensure_ascii=False))
