"""只读汇总阶段5.4原始收据；自然胜负、截断与工程门禁分别计算。"""
import gzip
import json
from collections import Counter
from run_league import DIR, read, save, sha
from phase54_paths import audit_directory

AUDIT = audit_directory()


def quantiles(values):
    values = sorted(values)
    if not values: return dict(count=0,p50=None,p95=None,p99=None,max=None)
    import math
    return dict(count=len(values),**{key:values[max(0,math.ceil(len(values)*p)-1)] for key,p in [('p50',.5),('p95',.95),('p99',.99),('max',1)]})


def collect(name, engineering=False, partial=False):
    base = AUDIT / name
    plan = read(base / 'plan.json')
    counts = Counter(); groups = {}; missing = []; queue = []; roots = []; incomplete = []; failures = []; worst = None; games = []
    for slot in plan['slots']:
        folder = base / ('games' if engineering else 'battles') / slot['id']
        if not (folder / 'result.json').exists(): missing.append(slot['id']); continue
        result = read(folder / 'result.json'); games.append(dict(id=slot['id'],classification=result['classification'],actions=result['actions']))
        key = slot.get('panel',slot.get('mode','engineering'))
        group = groups.setdefault(key,Counter()); group[result['classification']] += 1
        receipt = read(folder / 'strict-replay.json') if (folder / 'strict-replay.json').exists() else {}
        counts['strictFailures'] += not (receipt.get('passed') and receipt.get('actions') == result['actions'])
        if not engineering:
            counts['identityFailures'] += result['modelSha256'] != plan['modelSha256']
            counts['strictFailures'] += receipt.get('logSha256') != sha(folder / 'actions.jsonl.gz')
            counts['modelTimeouts'] += (result['latency']['model']['max'] or 0) > 1000
            counts['opponentTimeouts'] += (result['latency']['opponent']['max'] or 0) > 1000
        elif result.get('failedDecision'):
            counts['modelTimeouts' if result['failedDecision']['teacher'] else 'opponentTimeouts'] += result['classification'] == 'decision_timeout'
        counts['actualActions'] += receipt.get('actions',0); counts['witnessActions'] += receipt.get('witnessActions',0)
        if plan.get('searchOptions'):
            counts['identityFailures'] += result.get('runtimeRevision') != plan['runtimeRevision'] or result.get('searchOptions') != plan['searchOptions']
            counts['identityFailures'] += not all(argument in result.get('executionArgs',[]) for argument in plan['executionContract']['nodeArgs'])
        if result.get('error') or result['classification'] in ['error','wall_truncation','decision_timeout']:
            failures.append(dict(id=slot['id'],classification=result['classification'],error=result.get('error'),failedDecision=result.get('failedDecision')))
        # 部分进度只读取结果，避免在面板计时中反复解压已完成日志。
        if partial:
            queue.extend(result.get('queueTimes',[])); roots.extend(result.get('rootTimes',[]))
            continue
        actual = 0
        with gzip.open(folder / 'actions.jsonl.gz','rt',encoding='utf-8') as stream:
            for line in stream:
                row = json.loads(line); actual += 1
                telemetry = row.get('telemetry') or {}
                if telemetry.get('queued'):
                    queue.append(row['ms'])
                    if worst is None or row['ms'] > worst['ms']: worst = dict(path=folder.relative_to(DIR).as_posix(),i=row['i'],ms=row['ms'],code=row['code'],beforeHash=row['beforeHash'])
                elif telemetry:
                    roots.append(row['ms']); counts['retaliationAttempts'] += telemetry.get('retaliationAttempts',0); counts['retaliationComplete'] += telemetry.get('retaliationComplete',0)
                    counts['plannedFinalists'] += telemetry.get('plannedFinalists',len(telemetry.get('comparedUnits',[])))
                    counts['budgetSkippedCandidates'] += telemetry.get('budgetSkippedCandidates',0)
                    for risk in telemetry.get('risks',[]):
                        counts['expandedChains'] += risk.get('expandedChains',0); counts['coreChains'] += risk.get('coreChains',0); counts['adaptiveClosures'] += risk.get('adaptiveClosures',0)
                    if telemetry.get('retaliationAttempts',0) != telemetry.get('retaliationComplete',0): incomplete.append(dict(path=folder.relative_to(DIR).as_posix(),i=row['i'],ms=row['ms'],telemetry=telemetry))
        counts['strictFailures'] += actual != result['actions']
    output = dict(complete=not missing,expected=len(plan['slots']),completed=len(games),missing=missing,groups=groups,counts=counts,queueLatency=quantiles(queue),rootLatency=quantiles(roots),worstQueue=worst,incomplete=incomplete,failures=failures,games=games,runtimeRevision=plan['runtimeRevision'],executionContract=plan['executionContract'],planSha256=sha(base / 'plan.json'))
    if not partial: save(base / 'audit-summary.json',output)
    return output


def panels(summary):
    groups = summary['groups']
    return dict(fixed=groups.get('fixed',{}).get('natural_win',0),expanded=groups.get('expanded',{}).get('natural_win',0),multiplayer=sum(groups.get(p,{}).get('natural_win',0) for p in ['3ffa','4ffa','2v2']))


if __name__ == '__main__':
    for name,engineering in [('champion-search-arena',False),('candidate-search-arena',False),('engineering60',True)]:
        summary = collect(name,engineering,partial=True)
        print(json.dumps(dict(name=name,completed=summary['completed'],expected=summary['expected'],groups=summary['groups'],queueLatency=summary['queueLatency'],failures=summary['failures']),ensure_ascii=False))
