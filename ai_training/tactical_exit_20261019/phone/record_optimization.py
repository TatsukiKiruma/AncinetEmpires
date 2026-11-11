"""追加Chrome87性能修订进度，保留既有状态和报告的原字节。"""
from pathlib import Path
import datetime
import hashlib
import json

HERE = Path(__file__).resolve().parent.parent
revision = HERE / 'revisions/xiaomi_20261020'
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')
target = revision / ('optimization-progress-' + stamp)
target.mkdir()
read = lambda file: json.loads(file.read_text(encoding='utf-8-sig'))
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
reports = []
for file in sorted(revision.glob('phone-r24-v*/selfcheck-*/SELFCHECK.json')):
    report = read(file)
    reports.append(dict(path=file.relative_to(HERE).as_posix(), sha256=sha(file),
                        version=file.parent.parent.name, valueP95Ms=report['valueLatency']['p95'],
                        rootP95Ms=report['rootLatency']['p95'], functionalPassed=report['passed'],
                        valueGatePassed=report['valueGatePassed'], rootGatePassed=report['rootTargetPassed'],
                        foregroundConfirmed=report['foregroundConfirmed'], visibilityViolations=report['visibilityViolations']))
assert reports and not any(item['rootGatePassed'] and item['valueGatePassed'] for item in reports)
for name in ['TASK_STATE.json', 'REPORT.md', 'BATTLES.md', 'DELIVERY_MANIFEST.json']:
    file = HERE / name
    if file.exists():
        (target / (name + '.before.snapshot')).write_bytes(file.read_bytes())
parities = [dict(path=file.relative_to(HERE).as_posix(), sha256=sha(file), result=read(file))
            for pattern in ['performance-v*-parity-*/PARITY.json', 'cow-*-replay-*/REPLAY.json', 'stable-movement-parity-*/PARITY.json']
            for file in sorted(revision.glob(pattern))]
receipt = dict(complete=False, teacherQualified=False, userDecision='继续在现有Chrome87上优化',
               phase='正在优化和复核；尚未通过完整根速度前置', phoneChecks=reports, parityEvidence=parities,
               formalTeacherSlots=0, trueExpertGames=0, distillationStarted=False, finalSlots=0,
               thresholds=dict(valueP95ExclusiveMs=5, rootP95Ms=500, formalP95Ms=600),
               parameters=dict(topRoots=16, followups=24, nodes=400, priorWeight=.8))
with (target / 'OPTIMIZATION_PROGRESS.json').open('x', encoding='utf-8') as out:
    json.dump(receipt, out, ensure_ascii=False, indent=2)
state = read(HERE / 'TASK_STATE.json')
state.update(status='optimizing_chrome87', phase='按用户选择继续Chrome87无损性能优化，完整根前置尚未通过',
             optimizationProgress=(target / 'OPTIMIZATION_PROGRESS.json').relative_to(HERE).as_posix(),
             waitingForUser=False, complete=False, teacherQualified=False)
(HERE / 'TASK_STATE.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
table = '\n'.join(f"|{r['version']}|{r['valueP95Ms']:.2f}|{r['rootP95Ms']:.2f}|{'通过' if r['functionalPassed'] else '失败'}|" for r in reports)
text = '\n\n## 2026-10-20 Chrome87持续性能修订进度 ' + stamp + '\n\n用户已选择继续现有Chrome87优化，当前不等待更新浏览器。所有旧失败和冻结资产保留；Top16/24/400、0.8系数和5/500/600ms门槛不变。\n\n|冻结版本|Value p95 ms|完整根 p95 ms|69项功能对照|\n|---|---:|---:|---|\n' + table + '\n\n每轮230次Value、48次完整根。尚无同时通过两项速度前置的版本；正式教师0/120、真正专家0/40、蒸馏未开始、最终0/160。写时复制与只读快照版本已经固定1557根完整候选/计划/风险见证字节对照及历史动作克隆/合法集合回归；各项范围和通过收据见 ' + (target / 'OPTIMIZATION_PROGRESS.json').relative_to(HERE).as_posix() + '，未结束检查不记为通过。\n'
for name in ['REPORT.md', 'BATTLES.md', 'WORKLOG.md']:
    with (HERE / name).open('a', encoding='utf-8') as out:
        out.write(text)
current = HERE.parent / 'status/CURRENT.md'
before = current.read_bytes()
(target / 'CURRENT.md.before.snapshot').write_bytes(before)
marker = b'<!-- end-tactical-exit-20261019 -->'
assert before.count(marker) == 1
current.write_bytes(before.replace(marker, text.encode('utf-8') + marker))
print(json.dumps(dict(output=target.relative_to(HERE).as_posix(), checks=len(reports), complete=False), ensure_ascii=False))
