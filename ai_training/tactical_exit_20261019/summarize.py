"""从逐局原始收据汇总配对结果，不把截断当作自然胜负。"""
from pathlib import Path
import json,sys,collections,math,subprocess
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
phase=sys.argv[1] if len(sys.argv)>1 else 'final';isTeacher=phase.startswith('teacher');folder=phase+'-battles' if isTeacher else 'battles';plan=read(HERE/('teacher-battle-plan.json' if isTeacher else 'final-battle-plan.json'))
identities=read(HERE/f'{phase}-model-identities.json')['models']
assert all((HERE/f"{folder}/slots/{s['id']}/{n}").exists() for s in plan['slots'] for n in ['result.json','strict-replay.json']),'完整面板与strict结束前不启动辅助审计'
if any(not (HERE/f"{folder}/slots/{s['id']}/opportunity-audit.json").exists() for s in plan['slots']):
    subprocess.run([sys.executable,'-X','utf8',str(HERE/'run_metric_audit.py'),phase],cwd=HERE.parent.parent,check=True)
def quantile(v):
    v=sorted(v)
    return {k:(v[max(0,math.ceil(q*len(v))-1)] if v else None) for k,q in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}
results=[];strictActions=0;groups=collections.defaultdict(list);riskWitnessAudit=collections.Counter()
for slot in plan['slots']:
    p=HERE/f"{folder}/slots/{slot['id']}";r=read(p/'result.json');strict=read(p/'strict-replay.json');assert strict['passed'];strictActions+=strict['actions'];assert r['modelHash']==identities[slot['model']]['semanticSha256']
    assert 'riskWitnessAudit' in strict;assert strict['riskWitnessAudit']['branches']>=0;riskWitnessAudit.update(strict['riskWitnessAudit'])
    r['metrics']=strict.get('correctedMetrics',r['metrics']);audit=read(p/'opportunity-audit.json');assert audit['passed'] and audit['actions']==r['actions']
    for side in ['model','opponent']:r['metrics'][side].update(audit['metrics'][side])
    r['rootLatencySamples']=audit['rootLatencySamples'];results.append(r);groups[(slot.get('panel','fixed'),slot['opponent'],slot['model'])].append(r)
summary=[]
counterKeys='actions moveAttempts effectiveMoves unmovedWaits endWithRecruit lethalLandings knownMoveRisk focusLethalLandings focusKnownMoveRisk endTurns recruitOpportunitySteps searchTriggers searchChanges searchNodes attackOpportunity attackTaken actualIncome turnExits automaticTurnExits turnExitsWithRecruitOption attackTargetDeaths actualFocusDeaths actualThreeAttackerDeaths damagedUnitTurns'.split()
for (panel,opponent,model),rows in groups.items():
    counts=collections.Counter(r['classification'] for r in rows);latency=[v for r in rows for v in r['latencySamples']['model']]
    metrics={k:sum(r['metrics']['model'].get(k,0) for r in rows) for k in counterKeys}
    incomes=[r['round10']['recurringIncomeDifference'] for r in rows if 'recurringIncomeDifference' in r['round10']]
    truncations=sum(counts[k] for k in ['action_truncation','wall_truncation','decision_timeout'])
    summary.append(dict(panel=panel,opponent=opponent,model=model,slots=len(rows),classifications=counts,naturalWins=counts['natural_win'],naturalWinRate=counts['natural_win']/len(rows),truncations=truncations,truncationRate=truncations/len(rows),latency=quantile(latency),latencyCount=len(latency),round10IncomeDifference=sum(incomes)/len(incomes) if incomes else None,round10Games=len(incomes),metrics=metrics,
        missedRecruitRate=metrics['endWithRecruit']/max(1,metrics['endTurns']),missedRecruitPerModelAction=metrics['endWithRecruit']/max(1,metrics['actions']),focusLethalRate=metrics['focusLethalLandings']/max(1,metrics['focusKnownMoveRisk']),recruitOpportunityExitRate=metrics['turnExitsWithRecruitOption']/metrics['turnExits'] if metrics['turnExits'] else None,actualFocusDeathShare=metrics['actualFocusDeaths']/metrics['attackTargetDeaths'] if metrics['attackTargetDeaths'] else None,rootLatency=quantile([v for r in rows for v in r['rootLatencySamples']]),rootLatencyCount=sum(len(r['rootLatencySamples']) for r in rows)))
panels={}
for panel in ['fixed','expanded']:
    panels[panel]={}
    for arm in plan['arms']:
        rows=[r for r in results if r['slot']['model']==arm and r['slot'].get('panel','fixed')==panel];times=[v for r in rows for v in r['latencySamples']['model']];counts=collections.Counter(r['classification'] for r in rows)
        extraKeys='turnExits automaticTurnExits turnExitsWithRecruitOption attackTargetDeaths actualFocusDeaths actualThreeAttackerDeaths damagedUnitTurns'.split()
        panels[panel][arm]=dict(slots=len(rows),naturalWins=counts['natural_win'],naturalWinRate=counts['natural_win']/max(1,len(rows)),classifications=counts,latency=quantile(times),rootLatency=quantile([v for r in rows for v in r['rootLatencySamples']]),rootLatencyCount=sum(len(r['rootLatencySamples']) for r in rows),opportunityMetrics={k:sum(r['metrics']['model'][k] for r in rows) for k in extraKeys})
search='teacher_search' if isTeacher else 'stage5_search';baselines=['hierarchical','pure']+([] if isTeacher else ['stage5_pure'])
paired=[]
def identity(r):
    s=r['slot'];return (s.get('panel','fixed'),s['opponent'],s['mapIndex'],s['seat'],s['opponentSeed'])
for arm in plan['arms']:
    for baseline in baselines:
        if arm==baseline:continue
        reference={identity(r):r for r in results if r['slot']['model']==baseline}
        for panel in ['fixed','expanded']:
            matches=[(r,reference[identity(r)]) for r in results if r['slot']['model']==arm and r['slot'].get('panel','fixed')==panel]
            delta=[a['round10']['recurringIncomeDifference']-b['round10']['recurringIncomeDifference'] for a,b in matches if 'recurringIncomeDifference' in a['round10'] and 'recurringIncomeDifference' in b['round10']]
            paired.append(dict(panel=panel,model=arm,baseline=baseline,slots=len(matches),winsGained=sum(a['classification']=='natural_win' and b['classification']!='natural_win' for a,b in matches),winsLost=sum(a['classification']!='natural_win' and b['classification']=='natural_win' for a,b in matches),round10IncomeDelta=sum(delta)/len(delta) if delta else None,round10PairedGames=len(delta)))
gates={}
for panel in ['fixed','expanded']:
    s=panels[panel][search];gates[panel]=dict(quality=s['naturalWins']>=max(panels[panel][a]['naturalWins'] for a in baselines),latency=s['latency']['p95']<=600,rootLatency=s['rootLatency']['p95']<=600,decisionTimeouts=s['classifications'].get('decision_timeout',0)==0,wallTruncations=s['classifications'].get('wall_truncation',0)==0,errors=s['classifications'].get('error',0)==0)
gate=dict(passed=all(all(g.values()) for g in gates.values()),panels=gates,strictReplay=True,strictActions=strictActions,riskWitnessAudit=dict(riskWitnessAudit),slots=len(results),exceedsPure=sum(panels[p][search]['naturalWins'] for p in panels)>sum(panels[p]['pure']['naturalWins'] for p in panels),independentEvaluation=False)
if phase=='final':
    gate['exceedsStage5Pure']=sum(panels[p][search]['naturalWins'] for p in panels)>sum(panels[p]['stage5_pure']['naturalWins'] for p in panels)
    # 最终交付还须实现用户提出的胜率超越纯策略目标，不能只报告持平。
    gate['strictImprovement']=gate['exceedsPure'] and gate['exceedsStage5Pure']
    gate['passed']=gate['passed'] and gate['strictImprovement']
if isTeacher:
    gate['valueGate']=read(HERE/'teacher-value-evaluation.json')['passed'];gate['speedGate']=read(HERE/f'{phase}-speed.json')['passed'];gate['passed']=gate['passed'] and gate['valueGate'] and gate['speedGate']
(HERE/f'{phase}-battle-summary.json').write_text(json.dumps(dict(phase=phase,evidenceFolder=folder,groups=summary,panels=panels,gates=gate,paired=paired),ensure_ascii=False),encoding='utf-8')
(HERE/f'{phase}-gate.json').write_text(json.dumps(gate,ensure_ascii=False),encoding='utf-8')
lines=['# 阶段5'+('教师资格' if isTeacher else '最终配对')+'实战','',f'共{len(results)}槽，{strictActions}动作全部strict重放。自然胜率分母包含全部槽位。已消费开发材料，不称独立泛化。','', '|面板|对手|模型|胜/负/和（槽）|动作/墙钟/决策截断|p50/p95/p99 ms|第10轮收入差/局数|漏招募/结束回合|集火致死/已知移动|','|---|---|---|---|---|---|---|---|---|']
for g in summary:
    m=g['metrics'];l=g['latency'];income='未到达' if g['round10IncomeDifference'] is None else f"{g['round10IncomeDifference']:.2f}/{g['round10Games']}"
    c=g['classifications'];lines.append(f"|{g['panel']}|{g['opponent']}|{g['model']}|{c['natural_win']}/{c['natural_loss']}/{c['natural_draw']}（{g['slots']}）|{c['action_truncation']}/{c['wall_truncation']}/{c['decision_timeout']}|{l['p50']:.1f}/{l['p95']:.1f}/{l['p99']:.1f}|{income}|{m['endWithRecruit']}/{m['endTurns']}|{m['focusLethalLandings']}/{m['focusKnownMoveRisk']}|")
lines+=['','上表移动集火致死率是反事实可重放风险；下表实际多敌攻击后阵亡另计，不能互换。','', '|面板|模型|含自动换手的招募机会关闭/非终局换手|实际多敌攻击后阵亡/主动攻击目标阵亡|受净HP伤害的单位回合|根决策p50/p95/p99 ms（次数）|','|---|---|---|---|---|---|']
for panel,arms in panels.items():
    for arm,r in arms.items():
        m=r['opportunityMetrics'];l=r['rootLatency'];lines.append(f"|{panel}|{arm}|{m['turnExitsWithRecruitOption']}/{m['turnExits']}（自动{m['automaticTurnExits']}）|{m['actualFocusDeaths']}/{m['attackTargetDeaths']}（三军{m['actualThreeAttackerDeaths']}）|{m['damagedUnitTurns']}|{l['p50']:.1f}/{l['p95']:.1f}/{l['p99']:.1f}（{r['rootLatencyCount']}）|")
lines+=['','自动换手指标是机会关闭代理，不等同每次都是错误；自然胜负结算不计作漏招募。实际多敌攻击指标按同一敌方回合、至少两名不同主动攻击者结算后净HP下降并在某次攻击结算及其权威后效中消失计数，不含反击者自身阵亡。详细定义、原始整数和日志身份见逐槽opportunity-audit.json。根决策时延排除已验证队列，原全部单步时延仍保留；二者均受同一600ms p95门禁约束。','', '分类、逐局整数分母和配对身份见对应battle-summary.json及逐槽result.json。','',f'门禁通过：{gate["passed"]}。未过项保留原值，不调整阈值。']
(HERE/(phase.upper().replace('-','_')+'_BATTLES.md' if isTeacher else 'BATTLES.md')).write_text('\n'.join(lines),encoding='utf-8');print(json.dumps(gate))
