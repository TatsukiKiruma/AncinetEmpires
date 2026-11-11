"""保全首轮深度60局及全部GC诊断，任何失败不被后续修订覆盖。"""
import gzip
import json
from run_league import DIR, ROOT, read, save, sha
from audit_phase54 import collect, quantiles
from phase54_paths import audit_directory

audit = audit_directory(); engineering = collect('engineering60',engineering=True)
assert engineering['complete'] and engineering['completed'] == 60
diagnostic = audit / 'gc-comparison'; comparison = {}; semantic = {}; diagnostic_strict = True
for mode in ['direct','yield']:
    rows = []; seconds = []; games = []
    plan = read(diagnostic / mode / 'plan.json')
    for slot in plan['slots']:
        folder = diagnostic / mode / 'games' / slot['id']; result = read(folder / 'result.json'); strict = read(folder / 'strict-replay.json')
        assert strict['passed'] and strict['actions'] == result['actions']
        diagnostic_strict &= strict['passed']; seconds.append(result['seconds']); games.append(dict(id=slot['id'],classification=result['classification'],actions=result['actions']))
        rows.extend(json.loads(line) for line in gzip.decompress((folder / 'actions.jsonl.gz').read_bytes()).splitlines())
    queues = [row['ms'] for row in rows if (row.get('telemetry') or {}).get('queued')]
    semantic[mode] = [[row[k] for k in ['code','beforeHash','afterHash','rngAfter']] for row in rows]
    profile = read(diagnostic / (mode+'-profile.json'))
    comparison[mode] = dict(queueLatency=quantiles(queues),seconds=seconds,games=games,actualRuntimeSha256=profile['actualRuntimeSha256'],largeQueuedSamples=[s for s in profile['slow'] if s['ms'] >= .5],gcEvents=len(profile['events']))
same = semantic['direct'] == semantic['yield']
assert same and comparison['direct']['actualRuntimeSha256'] == comparison['yield']['actualRuntimeSha256']
selection = dict(passed=diagnostic_strict and same,selected='yield',usesBattleSelection=False,semanticTrajectoriesEqual=same,comparison=comparison,reason='固定三次配对中归还事件循环组队列最大0.2602ms，直接组1.7842ms；大尖峰无GC重叠，不能归因为Minor GC。选择协作调度边界，仍须新60+112全量验证。')
save(diagnostic / 'comparison.json',selection)
previous = read(DIR / 'phase54-audit/superseded-summary.json')
strict = engineering['counts']['strictFailures'] == engineering['counts']['identityFailures'] == 0 and diagnostic_strict and previous['gates']['allAttemptsStrict']
record = dict(stage='superseded_by_engineering_revision',promoted=False,gates=dict(allAttemptsStrict=strict,engineering60=False,queueBelowPoint5ms=False,retaliationComplete100=False),qualityArenasExecuted=0,engineering=engineering,diagnostic=selection,reason='首轮深度队列及核心完成率未过门禁；完整60局后停止，增加候选入场与后续敌方核心时间预留、协作调度边界，再独立冻结重测。')
save(audit / 'superseded-engineering-summary.json',record)
files = dict(read(DIR / 'phase54-audit/superseded-evidence-manifest.json')['files'])
for name in ['engineering60','v5-source','gc-comparison']:
    for path in (audit / name).rglob('*'):
        if path.is_file(): files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path),bytes=path.stat().st_size)
for name in ['protocol.json','runtime-freeze.json','RUNTIME_FROZEN.json','superseded-engineering-summary.json','pipeline.log']:
    path = audit / name; files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path),bytes=path.stat().st_size)
save(audit / 'superseded-evidence-manifest.json',dict(passed=strict,files=files))
save(audit / 'status.json',dict(stage=record['stage'],promoted=False,strict=strict,engineering60=60,diagnosticSelection='yield'))
print(dict(strict=strict,files=len(files),comparison={mode:group['queueLatency'] for mode,group in comparison.items()}))
