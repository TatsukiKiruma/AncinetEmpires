"""登记用户切换真机验证后的停止现场，保留旧计划及全部对局原件。"""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import shutil
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
STAMP = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
OUT = HERE / 'revisions' / 'xiaomi_20261020' / STAMP
OUT.mkdir(parents=True, exist_ok=False)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x', encoding='utf-8') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)


skip = {psutil.Process().pid, *[p.pid for p in psutil.Process().parents()]}
needles = ['pipeline_revision.py', 'pipeline_full.py', 'run_battles.py', 'battle.ts', 'run_expert.py', 'expert.ts']
active = []
for process in psutil.process_iter(['name', 'cmdline']):
    if process.pid in skip:
        continue
    args = [str(arg).replace('\\', '/') for arg in process.info['cmdline'] or []]
    if any('/tactical_exit_20261019/' in arg and arg.rsplit('/', 1)[-1] in needles for arg in args):
        active.append(dict(pid=process.pid, name=process.info['name'], args=args))
assert not active, f'本任务仍有活动进程：{active}'

for name in ['run_battles.py', 'run_expert.py', 'battle.ts', 'expert.ts', 'pipeline_revision.py', 'pipeline_full.py', 'TASK_STATE.json', 'teacher-battle-plan.json', 'final-battle-plan.json']:
    source = HERE / name
    if source.exists():
        shutil.copy2(source, OUT / (name + '.before.snapshot'))
        assert sha(source) == sha(OUT / (name + '.before.snapshot'))

plan = read(HERE / 'teacher-battle-plan.json')
completed, interrupted, unstarted = [], [], []
groups = collections.defaultdict(collections.Counter)
for slot in plan['slots']:
    folder = HERE / 'teacher-r24-battles' / 'slots' / slot['id']
    if (folder / 'result.json').exists():
        result = read(folder / 'result.json')
        completed.append(dict(slot=slot['id'], actions=result['actions'], classification=result['classification'], resultSha256=sha(folder / 'result.json'), rawSha256=sha(folder / 'actions.jsonl'), strict=(folder / 'strict-replay.json').exists()))
        groups[f'{slot.get("panel", "fixed")}/{slot["model"]}'][result['classification']] += 1
    elif (folder / 'actions.jsonl').exists():
        source = folder / 'actions.jsonl'
        digest, lines, tail = hashlib.sha256(), 0, b''
        with source.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
                lines += chunk.count(b'\n')
                tail = chunk[-1:]
        interrupted.append(dict(slot=slot['id'], rawLog=source.relative_to(HERE).as_posix(), bytes=source.stat().st_size, completeLines=lines, hasIncompleteLastLine=tail not in [b'', b'\n'], sha256=digest.hexdigest(), lastLive=read(folder / 'live.json') if (folder / 'live.json').exists() else None))
    else:
        unstarted.append(slot['id'])

record = dict(stopped=True, reason='用户要求以后取消Random组，所有对局验证改在小米真机进行；中断不构成算法失败结论', stoppedAt=datetime.datetime.now().isoformat(timespec='seconds'), plannedSlots=len(plan['slots']), completedSlots=len(completed), completedActions=sum(row['actions'] for row in completed), completedStrictSlots=sum(row['strict'] for row in completed), completed=completed, interruptedSlots=interrupted, unstartedSlots=unstarted, groups={key:dict(value) for key,value in groups.items()}, activeTaskProcesses=active, qualifiedTeacher=False, trueSearchExpertGames=0, distillationStarted=False, pcEvidenceIsHistoricalOnly=True)
write(OUT / 'R24_PC_STOP.json', record)
write(HERE / 'teacher-r24-battles' / 'STOP_NEW_SLOTS.json', dict(reason=record['reason'], record=(OUT / 'R24_PC_STOP.json').relative_to(HERE).as_posix()))

protocol = dict(version='xiaomi-phone-only-v1', effectiveAt=record['stoppedAt'], userInstruction='往后不需要再跑Random组，并且对局验证都通过小米手机进行', executionDevice='physical_xiaomi', runtime='手机Chrome中的本项目TS权威引擎与同源模型；PC只编译、提供资产、保存日志和执行PyTorch训练', allowPcBattleExecution=False, allowRandom=False, historicalEvidence='全部保留；PC对局不能作为新真机门禁通过证据；历史中断动作仍须strict收尾', fixedPanel=dict(apk_like=10, heuristic=10), expandedPanel=dict(heuristic=20), pairedTeacherArms=['hierarchical','pure','teacher_search'], pairedFinalArms=['hierarchical','pure','stage5_pure','stage5_search'], teacherSlots=120, finalSlots=160, phoneConcurrency=1, budgets=plan['budgets'], gates=dict(valueEvaluateP95Ms=5, rootTargetP95Ms=500, decisionP95MaxMs=600, rootDecisionP95MaxMs=600, decisionTimeouts=0, wallTruncations=0, strictReplayShare=1, numericMaxAbsErrorExclusive=1e-8, argmaxAgreement=1, panelQuality='固定及扩展分别不低于同手机同计划的全部相应基线', finalStrictImprovement='总自然胜数严格超过阶段4纯策略及阶段5纯策略'), dependencies='教师完整真机门禁通过前，真正搜索专家采样和蒸馏保持禁止；40局专家采样也迁移到手机运行。', status='awaiting_device_and_phone_runner_validation')
write(HERE / 'ACTIVE_DEVICE_PROTOCOL.json', protocol)
for old_name, new_name, expected in [('teacher-battle-plan.json','teacher-phone-plan-v1.json',120),('final-battle-plan.json','final-phone-plan-v1.json',160)]:
    old = read(HERE / old_name)
    new = dict(old)
    new['slots'] = [slot for slot in old['slots'] if slot['opponent'] != 'random']
    assert len(new['slots']) == expected
    new['executionDevice'] = 'physical_xiaomi'
    new['protocol'] = 'ACTIVE_DEVICE_PROTOCOL.json'
    new['historicalSourcePlan'] = dict(path=old_name, sha256=sha(HERE / old_name))
    new['randomExcludedByUser'] = True
    new['independentEvaluation'] = False
    write(HERE / new_name, new)

line = (f'\n2026-10-20 用户修改后续范围：不再运行Random，对局验证全部改为小米真机。R24 PC流程已终止并保留{len(completed)}/150槽、{record["completedActions"]}条完整局动作，另{len(interrupted)}槽中断（{sum(row["completeLines"] for row in interrupted)}条完整行），尚未strict收尾，不计新真机通过。'
        f'未来固定ApkLikeAI/HeuristicAI各10槽，扩展HeuristicAI20槽；教师三臂120槽、最终四臂160槽，同手机配对基线重新测；p95≤600ms、两类超时0、strict100%、数值误差<1e-8及胜率门槛不降低。真正专家0、未蒸馏。现场：{(OUT / "R24_PC_STOP.json").relative_to(HERE).as_posix()}；协议：ACTIVE_DEVICE_PROTOCOL.json。ADB正常权限设备列表为空，等待连接小米手机，期间仅准备手机运行入口和保全证据。\n')
with (HERE / 'WORKLOG.md').open('a', encoding='utf-8', newline='') as handle:
    handle.write(line)
current = ROOT / 'ai_training/status/CURRENT.md'
raw = current.read_bytes()
marker = b'<!-- end-tactical-exit-20261019 -->'
assert raw.count(marker) == 1
current.write_bytes(raw.replace(marker, line.encode('utf-8') + marker))
(HERE / 'TASK_STATE.json').write_text(json.dumps(dict(status='waiting_for_device', complete=False, phase='已切换小米真机验证；取消后续Random，准备手机入口，等待设备连接', stopRecord=(OUT / 'R24_PC_STOP.json').relative_to(HERE).as_posix(), protocol='ACTIVE_DEVICE_PROTOCOL.json', teacherQualified=False), ensure_ascii=False), encoding='utf-8')
print(json.dumps(dict(record=(OUT / 'R24_PC_STOP.json').relative_to(HERE).as_posix(), completed=len(completed), actions=record['completedActions'], interrupted=len(interrupted), interruptedActions=sum(row['completeLines'] for row in interrupted), unstarted=len(unstarted), activeProcesses=active, teacherPhoneSlots=120, finalPhoneSlots=160), ensure_ascii=False))
