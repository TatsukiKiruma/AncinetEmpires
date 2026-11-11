"""复核第二次 V19 运行的谱系、逐局结果、完整性与不同权重的价值误差。"""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'v19/out/run_20260929_v19_02'
OUT = Path(__file__).resolve().parent

def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def rows(p):
    with p.open(encoding='utf-8-sig') as f:
        for s in f:
            if s.strip():
                yield json.loads(s)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def panel(base, key):
    return {(r['mapName'],r['seed'],r['candidateSeat']):r
            for p in base.glob(key+'.m*.games.jsonl') for r in rows(p) if r['arm']=='CANDIDATE'}

keys = ['ppo_w1_theta1','ppo_w2_theta2','ppo_w3_theta3']
panels = {k:panel(RUN/'arena/dev',k) for k in keys}
champ = panel(ROOT/'v19/out/run_20260928_v19_01/arena/dev','P1_s2026_v19control')
arena = {}
for k,p in panels.items():
    arena[k] = {'games':len(p),'outcomes':dict(collections.Counter(r['outcomeKind'] for r in p.values())),
                'maps':{m:sum(r['mapName']==m and r['outcomeKind']=='NATURAL_WIN' for r in p.values())
                        for m in sorted({r['mapName'] for r in p.values()})},
                'sameOutcomeAsChampion':sum(r['outcomeKind']==champ[g]['outcomeKind'] for g,r in p.items()),
                'errors':sum(bool(r['error']) for r in p.values()),
                'fallbacks':sum(bool(r['fallbackUsed']) for r in p.values())}
p2,p3 = panels[keys[1]],panels[keys[2]]
comparison = {'sameOutcomes':sum(p2[k]['outcomeKind']==p3[k]['outcomeKind'] for k in p2),
              'sameActionDigests':sum(p2[k]['actionDigest']==p3[k]['actionDigest'] for k in p2),
              'sameStepCounts':sum(p2[k]['steps']==p3[k]['steps'] for k in p2)}

old_games = list(rows(ROOT/'v19/out/run_20260928_v19_01/data/wave2/wave2.games.jsonl'))
prev_games = [g for g in old_games if g['naturalTerminal']]
previous_step_constant = sum(g['terminalReturn']*min(g['subjectDecisions'],2000) for g in prev_games)/sum(min(g['subjectDecisions'],2000) for g in prev_games)
previous_output = 'e999131c6b01f3233727cc0894ca72f60ba2f67da3e2a54660164ac17bd339c9'
waves = {}
for i in (1,2,3):
    base = RUN / f'data/wave{i}'
    games = list(rows(base/f'w{i}.games.jsonl'))
    by_id = {g['gameId']:g for g in games}
    met = read(RUN/f'experiments/ppo_w{i}/s42/ppo_w{i}.metrics.json')
    expected_sha = sha(ROOT/met['initCheckpoint'])
    output_sha = sha(ROOT/met['output']['path'])
    assert expected_sha == previous_output
    assert output_sha == met['output']['sha256']
    assert {g['behaviorCheckpointSha256'] for g in games} == {expected_sha}
    assert {r['checkpointSha256'] for r in panels[keys[i-1]].values()} == {output_sha}
    stats = collections.defaultdict(collections.Counter)
    phase = collections.defaultdict(collections.Counter)
    action_types = collections.Counter()
    issues = []
    episode_constant = met['valueValidation']['constantValue']
    seen_shas = set()
    for t in rows(base/f'w{i}.transitions.jsonl'):
        g = by_id[t['gameId']]
        s = stats[t['gameId']]
        if t['subjectDecisionIndex'] != s['n']:
            issues.append({'game':t['gameId'],'index':t['subjectDecisionIndex'],'expected':s['n']})
        s['n'] += 1
        s['terminalCount'] += bool(t['terminal'])
        s['rewardSum'] += t['reward']
        if t['terminal'] and t['subjectDecisionIndex'] != g['subjectDecisions']-1:
            issues.append({'game':t['gameId'],'prematureTerminal':t['subjectDecisionIndex']})
        seen_shas.add(t.get('checkpointSha256'))
        if not g['naturalTerminal']:
            continue
        target = g['terminalReturn']
        err = (t['value']-target)**2
        s['sse'] += err
        s['baselineEpisodeSse'] += (episode_constant-target)**2
        s['baselineStepSse'] += (previous_step_constant-target)**2
        s['targetSum'] += target
        s['absAdvSum'] += abs(target-t['value'])
        bucket = 'early' if t['turn']<=5 else ('mid' if t['turn']<=15 else 'late')
        phase[bucket]['n'] += 1
        phase[bucket]['sse'] += err
        phase[bucket]['targetSum'] += target
        phase[bucket]['baselineSse'] += (episode_constant-target)**2
        phase[bucket]['absAdvSum'] += abs(target-t['value'])
        if t['subjectDecisionIndex'] == 0:
            phase['firstDecision']['n'] += 1
            phase['firstDecision']['sse'] += err
            phase['firstDecision']['baselineSse'] += (episode_constant-target)**2
            phase['firstDecision']['targetSum'] += target
            phase['firstDecision']['absAdvSum'] += abs(target-t['value'])
        action_types[t['chosenActionCode'].split(':')[0]] += 1
    assert seen_shas == {expected_sha}
    for g in games:
        s = stats[g['gameId']]
        if s['n'] != g['subjectDecisions'] or s['n'] != g['recordedDecisions']:
            issues.append({'game':g['gameId'],'countMismatch':True})
        if s['terminalCount'] != int(g['naturalTerminal']) or s['rewardSum'] != (g['terminalReturn'] or 0):
            issues.append({'game':g['gameId'],'rewardBoundaryMismatch':dict(s)})
        if hashlib.sha256('\n'.join(g['actionCodes']).encode()).hexdigest()!=g['actionDigest']:
            issues.append({'game':g['gameId'],'digestMismatch':True})
    natural = [g for g in games if g['naturalTerminal']]
    n = sum(stats[g['gameId']]['n'] for g in natural)
    total = sum(s['n'] for s in stats.values())
    sse = sum(stats[g['gameId']]['sse'] for g in natural)
    base_step_sse = sum(stats[g['gameId']]['baselineStepSse'] for g in natural)
    episode_mse = sum(stats[g['gameId']]['sse']/stats[g['gameId']]['n'] for g in natural)/len(natural)
    episode_base = sum((g['terminalReturn']-episode_constant)**2 for g in natural)/len(natural)
    top = sorted(natural,key=lambda g:stats[g['gameId']]['n'],reverse=True)[:5]
    wave = {
        'behaviorSha':expected_sha,'outputSha':output_sha,'chainVerifiedIndependently':True,
        'games':len(games),'outcomes':dict(collections.Counter(g['outcomeKind'] for g in games)),
        'transitions':total,'trainingDecisions':n,'excludedDecisionFraction':(total-n)/total,
        'winDecisionFraction':sum(stats[g['gameId']]['n'] for g in natural if g['terminalReturn']==1)/n,
        'top5NaturalEpisodeDecisionFraction':sum(stats[g['gameId']]['n'] for g in top)/n,
        'reportedValueImprovement':met['valueValidation']['improvementVsConstant'],
        'valueMseStepWeighted':sse/n,'priorStepWeightedConstant':previous_step_constant,
        'valueImprovementVsPriorStepWeightedConstant':1-sse/base_step_sse,
        'valueMseEpisodeWeighted':episode_mse,'baselineMseEpisodeWeighted':episode_base,
        'valueImprovementEpisodeWeighted':1-episode_mse/episode_base,
        'phase':{p:{'n':s['n'],'mse':s['sse']/s['n'],'constantMse':s['baselineSse']/s['n'],
                    'meanTarget':s['targetSum']/s['n'],'meanAbsAdvantage':s['absAdvSum']/s['n']}
                 for p,s in phase.items()},
        'top5NaturalEpisodes':[{k:g[k] for k in ['mapName','seed','subjectSeat','outcomeKind','subjectDecisions','turns']} for g in top],
        'naturalChosenActionTypes':dict(action_types),'integrityIssues':issues,
        'klStop':met['klStop'],
    }
    assert not issues, issues[:3]
    assert n==met['data']['decisionsUsed']
    waves[f'wave{i}'] = wave
    previous_step_constant = sum(g['terminalReturn']*stats[g['gameId']]['n'] for g in natural)/n
    previous_output = output_sha

result = {'arena':arena,'theta2vsTheta3':comparison,'waves':waves}
(OUT/'audit_run02.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'arena':arena,'theta2vsTheta3':comparison,'waves':{
    w:{k:v[k] for k in ['transitions','trainingDecisions','excludedDecisionFraction','winDecisionFraction',
                         'top5NaturalEpisodeDecisionFraction','valueImprovementVsPriorStepWeightedConstant',
                         'valueImprovementEpisodeWeighted','phase']} for w,v in waves.items()}},ensure_ascii=False,indent=2))
