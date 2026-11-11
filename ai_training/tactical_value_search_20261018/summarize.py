"""严格重放后的固定面板与开发前缀整数指标。"""
from pathlib import Path
import json,collections,gzip,numpy as np,sys
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
plan=read(HERE/'battle-plan.json')
extended=len(sys.argv)>1 and sys.argv[1]=='all'
if extended:plan=dict(plan,slots=plan['slots']+read(HERE/'battle-verified-plan.json')['slots'])
results=[];groups=collections.defaultdict(list)
for slot in plan['slots']:
    root=HERE/'battles/slots'/slot['id'];r=read(root/'result.json');strict=read(root/'strict-replay.json');assert strict['passed'];assert strict['actions']==r['actions']
    assert r['classification']!='error',(slot,r.get('error'))
    r['metrics']=strict['correctedMetrics'];results.append(r);groups[(slot.get('panel','fixed'),slot['opponent'],slot['model'])].append(r)
table=[]
for (panel,opponent,arm),rs in groups.items():
    c=collections.Counter(r['classification'] for r in rs);m=collections.Counter();latencies=[];round10=[]
    for r in rs:
        m.update({k:v for k,v in r['metrics']['model'].items() if isinstance(v,int)})
        if r['round10'].get('reached') is not False:round10.append(r['round10']['recurringIncomeDifference'])
        if 'latencySamples' in r:latencies.extend(r['latencySamples']['model'])
        else:
            path=HERE/'battles/slots'/r['slot']['id']/'actions.jsonl.gz'
            with gzip.open(path,'rt',encoding='utf-8') as f:
                for line in f:
                    row=json.loads(line)
                    if row['side']=='model':latencies.append(row['ms'])
    q=lambda p:float(np.quantile(latencies,p,method='inverted_cdf')) if latencies else None
    table.append(dict(panel=panel,opponent=opponent,arm=arm,slots=len(rs),classifications=dict(c),naturalWinRate=c['natural_win']/len(rs),truncationRate=sum(c[k] for k in ['action_truncation','wall_truncation','decision_timeout'])/len(rs),latency=dict(p50=q(.5),p95=q(.95),p99=q(.99),max=max(latencies) if latencies else None,count=len(latencies)),round10Count=len(round10),round10IncomeDifference=float(np.mean(round10)) if round10 else None,metrics=dict(m),strictActions=sum(r['actions'] for r in rs)))
pairkey=lambda r:(r['slot'].get('panel','fixed'),r['slot']['opponent'],r['slot']['mapIndex'],r['slot']['seat'],r['slot']['opponentSeed'])
anchors={pairkey(r):r for r in results if r['slot']['model']=='hierarchical'};paired=[]
for (panel,opponent,arm),rs in groups.items():
    if arm=='hierarchical':continue
    gain=loss=0;income=[]
    for r in rs:
        anchor=anchors[pairkey(r)];w=r['classification']=='natural_win';bw=anchor['classification']=='natural_win';gain+=int(w and not bw);loss+=int(bw and not w)
        if r['round10'].get('reached') is not False and anchor['round10'].get('reached') is not False:income.append(r['round10']['recurringIncomeDifference']-anchor['round10']['recurringIncomeDifference'])
    paired.append(dict(panel=panel,opponent=opponent,arm=arm,slots=len(rs),naturalWinsGained=gain,naturalWinsLost=loss,winRateDifference=(gain-loss)/len(rs),pairedRound10Count=len(income),pairedRound10IncomeDifference=float(np.mean(income)) if income else None))
(HERE/'battle-summary.json').write_text(json.dumps(dict(table=table,paired=paired,results=results,strictSlots=len(results),strictActions=sum(r['actions'] for r in results)),ensure_ascii=False),encoding='utf-8')
lines=['# 阶段4配对实战','', '固定五图双座位每臂30槽；额外10个开发父局前缀交换座位，每臂20槽。'+('原定四臂200槽及事件守卫修订50槽，共250槽。' if extended else '原定四臂共200槽。')+'全部为开发诊断，不是独立泛化评估。','', '|面板|对手|模型|自然胜/负|截断|p50/p95/p99 ms|第10轮收入差/到达局数|漏招募|单军致死/集火致死/已知移动|strict动作|','|---|---|---|---|---|---|---|---|---|---|']
for r in table:
    c=r['classifications'];m=r['metrics'];l=r['latency'];fmt=lambda v:'不可用' if v is None else f'{v:.2f}'
    lines.append(f"|{r['panel']}|{r['opponent']}|{r['arm']}|{c.get('natural_win',0)}/{c.get('natural_loss',0)}|{sum(c.get(k,0) for k in ['action_truncation','wall_truncation','decision_timeout'])}|{fmt(l['p50'])}/{fmt(l['p95'])}/{fmt(l['p99'])}|{fmt(r['round10IncomeDifference'])}/{r['round10Count']}|{m.get('endWithRecruit',0)}|{m.get('lethalLandings',0)}/{m.get('focusLethalLandings',0)}/{m.get('knownMoveRisk',0)}|{r['strictActions']}|")
lines+=['','自然胜率分母为该组全部槽位，截断不算自然胜利。第10轮仅统计实际到达对局。致死落点是落子后的反事实风险，不等同实际发生的死亡。集火为最多三不同敌军的可执行贪心见证，不能称完整最强对手搜索。严格重放复核全部已提交动作及前后状态，不重新运行双方策略。','', '|面板/对手/模型|选择攻击/攻击机会|有招募却end/end总数|集火已知移动|搜索触发/改选/节点|','|---|---|---|---|---|']
for r in table:
    m=r['metrics'];attack=m.get('attackTaken',0);opportunity=m.get('attackOpportunity',0);rate=f'{attack/opportunity:.2%}' if opportunity else '不可用'
    lines.append(f'|{r["panel"]}/{r["opponent"]}/{r["arm"]}|{attack}/{opportunity} ({rate})|{m.get("endWithRecruit",0)}/{m.get("endTurns",0)}|{m.get("focusKnownMoveRisk",0)}|{m.get("searchTriggers",0)}/{m.get("searchChanges",0)}/{m.get("searchNodes",0)}|')
lines+=['','|面板/对手/模型（相对阶段3配对）|新增自然胜/丢失自然胜|胜率差|双方均到第10轮的收入差变化/局数|','|---|---|---|---|']
for r in paired:
    income='不可用' if r['pairedRound10IncomeDifference'] is None else f'{r["pairedRound10IncomeDifference"]:.2f}'
    lines.append(f'|{r["panel"]}/{r["opponent"]}/{r["arm"]}|{r["naturalWinsGained"]}/{r["naturalWinsLost"]}|{r["winRateDifference"]:+.1%}|{income}/{r["pairedRound10Count"]}|')
(HERE/'BATTLES.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(table,ensure_ascii=False))
