"""按固定槽配对，截断不计胜利；比较提交动作前缀和严格重放收据。"""
from pathlib import Path
import gzip,json
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'tactical_conditional_20261018'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
plan=read(HERE/'battle-plan.json');rows=[];panels=[]
speedSlots=[s for s in plan['slots'] if s['model']=='best']
for slot in speedSlots:
    prefix=HERE/'battles/slots'/slot['id'];r=read(prefix/'result.json')
    prior=read(OLD/'battles/slots'/slot['id']/'result.json') if slot['model']=='best' else None
    replay=read(prefix/'strict-replay.json') if (prefix/'strict-replay.json').exists() else None
    pair=None
    if prior:
        def codes(p):
            with gzip.open(p,'rt',encoding='utf-8') as f:return [json.loads(line)['code'] for line in f if line.strip()]
        a=codes(prefix/'actions.jsonl.gz');b=codes(OLD/'battles/slots'/slot['id']/'actions.jsonl.gz');n=min(len(a),len(b));first=next((i for i in range(n) if a[i]!=b[i]),None)
        pair=dict(commonLength=n,firstDivergence=first,prefixEqual=first is None,oldClassification=prior['classification'],newClassification=r['classification'])
    rows.append(dict(result=r,paired=pair,strict=replay))
for opponent in ['random','apk_like','heuristic']:
    selected=[x for x in rows if x['result']['slot']['opponent']==opponent];count={}
    for x in selected:count[x['result']['classification']]=count.get(x['result']['classification'],0)+1
    round10=[x['result']['round10']['recurringIncomeDifference'] for x in selected if 'recurringIncomeDifference' in x['result']['round10']]
    panels.append(dict(opponent=opponent,slots=len(selected),classification=count,round10Reached=len(round10),round10IncomeDifference=sum(round10)/max(1,len(round10)),
        newNaturalWinsFromPriorWall=sum(x['paired'] is not None and x['paired']['oldClassification']=='wall_truncation' and x['result']['classification']=='natural_win' for x in selected),
        strictActions=sum(x['strict']['actions'] if x['strict'] else 0 for x in selected),strictPassed=all(x['strict'] and x['strict']['passed'] for x in selected)))
out=dict(panels=panels,slots=rows,complete=len(rows)==len(speedSlots),budgets=plan['budgets'])
(HERE/'battle-speed-summary.json').write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
lines=['# 阶段2最佳权重无损提速复测','', '固定五图双座位，每档10槽；2000原子 / 600秒 / 单决策30秒。两轮调试轨迹单独保留在battles-attempt1/2；补齐缓存兵种与城堡光环阈值后完整重跑，未挑选结果。','', '|对手|自然胜|自然负|动作截断|墙钟截断|错误|原墙钟转自然胜|第10轮收入差|strict动作|','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for p in panels:
    c=p['classification'];lines.append(f"|{p['opponent']}|{c.get('natural_win',0)}|{c.get('natural_loss',0)}|{c.get('action_truncation',0)}|{c.get('wall_truncation',0)}|{c.get('error',0)}|{p['newNaturalWinsFromPriorWall']}|{p['round10IncomeDifference']:.2f}|{p['strictActions']}|")
lines+=['','|固定槽|原分类|新分类|原子|秒|与阶段2动作前缀相同|','|---|---|---|---:|---:|---|']
for x in rows:
    r=x['result'];pair=x['paired'];lines.append(f"|{r['slot']['id']}|{pair['oldClassification'] if pair else '无'}|{r['classification']}|{r['actions']}|{r['wallSeconds']:.2f}|{pair['prefixEqual'] if pair else '无'}|")
(HERE/'BATTLES_SPEED.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(panels,ensure_ascii=False))
