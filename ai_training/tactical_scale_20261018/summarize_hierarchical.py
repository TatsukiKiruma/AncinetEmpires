from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
plan=read(HERE/'battle-plan.json');slots=[];panels=[]
for slot in plan['slots']:
    prefix=HERE/'battles/slots'/slot['id'];r=read(prefix/'result.json');strict=read(prefix/'strict-replay.json')
    assert strict['passed'] and strict['actions']==r['actions'];slots.append(dict(result=r,strict=strict))
for opponent in ['random','apk_like','heuristic']:
    for model in ['best','hierarchical']:
        chosen=[x for x in slots if x['result']['slot']['opponent']==opponent and x['result']['slot']['model']==model];assert len(chosen)==10
        counts={};totals={k:0 for k in ['actions','effectiveMoves','unmovedWaits','endWithRecruit','lethalLandings','knownMoveRisk']}
        reached=[]
        for x in chosen:
            r=x['result'];counts[r['classification']]=counts.get(r['classification'],0)+1
            for k in totals:totals[k]+=r['metrics']['model'][k]
            if 'recurringIncomeDifference' in r['round10']:reached.append(r['round10']['recurringIncomeDifference'])
        panels.append(dict(opponent=opponent,model=model,classification=counts,slots=10,naturalWinRate=counts.get('natural_win',0)/10,
            truncationRate=(counts.get('action_truncation',0)+counts.get('wall_truncation',0)+counts.get('decision_timeout',0))/10,
            round10Reached=len(reached),round10IncomeDifference=sum(reached)/max(1,len(reached)),totals=totals,strictActions=sum(x['strict']['actions'] for x in chosen)))
out=dict(panels=panels,slots=slots,allStrictPassed=True,totalSlots=len(slots),budgets=plan['budgets'],independentEvaluation=False)
(HERE/'hierarchical-battle-summary.json').write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
lines=['# 分层新模型配对实战','','原最佳权重使用group_mass；新模型使用显式组头两阶段解码。相同地图/座位/对手seed与预算，各30槽。截断不计自然胜负，双方过程整数计数和逐局第10轮经济保存在JSON。第10轮均值只包含实际达到该轮的对局，分母另列。','', '|对手|模型|自然胜|自然负|动作截断|墙钟截断|决策超时|错误|自然胜率|截断率|到第10轮|第10轮收入差|strict动作|','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for p in panels:
    c=p['classification'];lines.append(f"|{p['opponent']}|{p['model']}|{c.get('natural_win',0)}|{c.get('natural_loss',0)}|{c.get('action_truncation',0)}|{c.get('wall_truncation',0)}|{c.get('decision_timeout',0)}|{c.get('error',0)}|{p['naturalWinRate']:.0%}|{p['truncationRate']:.0%}|{p['round10Reached']}|{p['round10IncomeDifference']:.2f}|{p['strictActions']}|")
lines+=['','|对手|模型|有效移动/模型动作|未移动wait/模型动作|可招募却endturn|致死落点/已知移动|','|---|---|---|---|---:|---|']
for p in panels:
    t=p['totals'];lines.append(f"|{p['opponent']}|{p['model']}|{t['effectiveMoves']}/{t['actions']}|{t['unmovedWaits']}/{t['actions']}|{t['endWithRecruit']}|{t['lethalLandings']}/{t['knownMoveRisk']}|")
(HERE/'BATTLES_HIERARCHICAL.md').write_text('\n'.join(lines)+'\n',encoding='utf-8');print(json.dumps(panels,ensure_ascii=False))
