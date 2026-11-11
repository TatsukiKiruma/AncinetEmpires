"""固定开发面板轮转调度、独立strict、自然胜配对及按开局家族重采样区间。"""
import concurrent.futures
import random
import sys
from collections import Counter
from core import HERE, R, ROOT, SEED, read, write_new, digest

OLD = R.parent / 'pretrain_preflight_20261022/evaluation/assets/phase5-gen03/model'


def node(script, *args):
    return ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', str(script), *map(str, args)]


def summary(results):
    return dict(games=len(results), wins=sum(r['natural'] and r['outcome'] == 'win' for r in results), losses=sum(r['natural'] and r['outcome'] == 'loss' for r in results),
                truncated=sum(not r['natural'] and not r['error'] for r in results), errors=sum(bool(r['error']) for r in results), over4000=sum(r['over4000'] for r in results))


def paired(champion, candidate):
    assert len(champion) == len(candidate) == 20
    baseline = {r['job']['id']: r for r in champion}
    family = {}
    new = lost = 0
    for c in candidate:
        a = baseline[c['job']['id']]
        assert a['openingCanonicalSha256'] == c['openingCanonicalSha256'] and a['job']['seat'] == c['job']['seat']
        aw = a['natural'] and a['outcome'] == 'win'
        cw = c['natural'] and c['outcome'] == 'win'
        new += not aw and cw; lost += aw and not cw
        key = a['openingCanonicalSha256']
        family[key] = family.get(key, 0) + int(cw) - int(aw)
    rng = random.Random(SEED)
    values = list(family.values())
    draws = sorted(sum(rng.choices(values, k=len(values))) for _ in range(10000))
    return dict(newWins=new, lostWins=lost, netWins=new-lost, clusterBootstrap95NetWins=[draws[249], draws[9749]], families=len(values),
                qualification='单种子20局探索性开发证据；家族聚类区间不代表独立最终验收')


def series(budget, kind, plan, prefixes):
    jobs = []
    # 每个开局家族轮转模型次序，同时最多4局，不与训练或老师并行。
    for i, job in enumerate(plan):
        names = list(prefixes)
        rotation = (i // 2) % len(names)
        for name in names[rotation:] + names[:rotation]:
            prefix = prefixes[name]
            folder = HERE / 'evaluation' / kind / name / job['id']
            folder.mkdir(parents=True, exist_ok=False)
            full = dict(job, modelPrefix=str(prefix), expectedModelSha256=digest(str(prefix) + '.bin'), opponentPrefix=str(OLD),
                        budgetMs=4000, maxSteps=4000, maxRounds=120, maxWallMs=int(budget.remaining() * 1000))
            if kind == 'historical':
                full['expectedOpponentSha256'] = digest(str(OLD) + '.bin')
            path = folder / 'job.json'; write_new(path, full)
            jobs.append((name, folder, path))
    def run(entry):
        name, folder, job = entry
        try:
            budget.run(node(R / 'battle.ts', job, folder), folder / 'battle.log')
            budget.run(node(R / 'verify_game.ts', folder), folder / 'strict.log')
            assert read(folder / 'strict.json')['passed']
            return name, read(folder / 'result.json')
        except BaseException as error:
            write_new(folder / 'incomplete.json', dict(reason=repr(error), phase=kind, identity=read(job), countedAsWin=False))
            raise
    results = {name: [] for name in prefixes}
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(run, entry) for entry in jobs]
        for future in concurrent.futures.as_completed(futures):
            try:
                name, result = future.result(); results[name].append(result)
            except BaseException as error:
                failures.append(repr(error))
    write_new(HERE / 'evaluation' / (kind + '-results.json'), dict(results=results, failures=failures))
    if failures or any(len(rs) != 20 for rs in results.values()):
        raise RuntimeError('固定20局面板未完整通过strict，不确定，停止后续面板')
    return results


def evaluate(budget):
    gate = read(HERE / 'offline-gate.json')
    prefixes = {'champion': R / 'training/pretrain_full/model'}
    prefixes.update({arm: HERE / 'training' / arm / 'epoch-4' for arm in ['B', 'C'] if gate['arms'][arm]['battleEligible']})
    assert 2 <= len(prefixes) <= 3
    plan = read(R / 'execution_v5/plan.json')
    hard = series(budget, 'hard', plan['hardValidation'], prefixes)
    summaries = {arm: summary(rows) for arm, rows in hard.items()}
    comparisons = {arm: paired(hard['champion'], hard[arm]) for arm in prefixes if arm != 'champion'}
    eligible = [arm for arm in comparisons if summaries[arm]['errors'] == summaries[arm]['over4000'] == 0]
    signals = {arm: comparisons[arm]['netWins'] >= 2 and summaries[arm]['truncated'] <= summaries['champion']['truncated'] and arm in eligible for arm in comparisons}
    label_signal = None
    if 'B' in hard and 'C' in hard:
        label_signal = gate['arms']['C']['metrics']['preferenceAccuracy'] >= gate['arms']['B']['metrics']['preferenceAccuracy'] + .05 and summaries['C']['wins'] >= summaries['B']['wins']
    write_new(HERE / 'hard-assessment.json', dict(summaries=summaries, comparisons=comparisons, methodSignals=signals, labelExtraSignal=label_signal, automaticallyPromoted=False))
    if eligible and budget.remaining() >= 14400:
        best = sorted(eligible, key=lambda a: (-summaries[a]['wins'], summaries[a]['losses'], summaries[a]['truncated'], a != 'B'))[0]
        series(budget, 'historical', plan['historicalValidation'], {name: prefixes[name] for name in ['champion', best]})
    else:
        write_new(HERE / 'history-skipped.json', dict(reason='无工程合格候选或实战阶段剩余不足4小时', remainingSeconds=budget.remaining()))
