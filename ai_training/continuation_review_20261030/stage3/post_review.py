"""验收后补充开发战报和新实战归因；不允许回调训练或重选候选。"""
from pathlib import Path
import json
from core import HERE, DATA, ROOT, legacy, read, save
from finish import clustered

assert (HERE/'FINAL_PAIRED_COMPARISON.json').exists()
lock=read(HERE/'FINAL_CANDIDATE_LOCK.json')
lines=['','## 开发全人数战报','',
       '| 权重更新 | 先验 | 人数 | 独胜/自然局 | 归一名次分 | 截断/错误/超时 |',
       '|---:|---:|---:|---:|---:|---:|']
sources=[('基线',1.,DATA/'dev-baseline/SUMMARY.json')]
for u in read(HERE/'DEV_CANDIDATES.json')['updates']:
    for scale in [.3,1.]:
        sources.append((str(u),scale,DATA/f'dev-{u:05d}-prior-{scale}/SUMMARY.json'))
for name,scale,file in sources:
    result=read(file)
    for n in [2,3,4]:
        g=result['byPlayers'][str(n)]
        lines.append(f'| {name} | {scale} | {n}P | {g["wins"]}/{g["natural"]} | {g["normalizedRank"]} | {g["truncations"]}/{g["errors"]}/{g["timeForfeits"]} |')
development=clustered(read(DATA/'dev-baseline/SUMMARY.json'),read(Path(lock['candidate']['arena'])))
save(HERE/'DEV_FINAL_PAIRED_COMPARISON.json',development)
history=read(DATA/'historical-final/SUMMARY.json')
lines.extend(['','历史冻结40局纵向对照：'])
for opponent in ['hard','simple']:
    games=[g for g in history['games'] if g['opponent']==opponent]
    lines.append(f'- {opponent}：自然胜{sum(g["classification"]=="natural_win" for g in games)}／和{sum(g["classification"]=="natural_draw" for g in games)}／负{sum(g["classification"]=="natural_loss" for g in games)}，非自然{sum(not g["natural"] for g in games)}。')
lines.extend(['','## 胜败直接证据与局限',''])
analysis=read(HERE/'TACTICAL_TRACE_ANALYSIS.json')
for case in analysis['reports']:
    changes='由基线未独胜变为独胜' if case['modelFirstPlace'] and not case['baselineFirstPlace'] else '由基线独胜变为未独胜' if case['baselineFirstPlace'] and not case['modelFirstPlace'] else '配对独胜结果相同'
    text=f'{case["id"]}（{case["map"]}，{changes}）：模型动作计数{json.dumps(case["actionCounts"],ensure_ascii=False)}。'
    if case['eliminationEvidence']:
        event=case['eliminationEvidence'][0]
        text+=f'模型在回合{event["turn"]}、动作{event["step"]}后出局；直接触发动作为玩家{event["actingPlayer"]}的{event["triggerAction"]["type"]}，此前尚有{len(event["modelUnitsBefore"])}个单位、{event["castlesBefore"]}座城堡。'
    lines.append('- '+text)
lines.extend(['','上述最多六局均来自本阶段刚生成的实战，动作前后SHA与终态逐项复核。它们解释直接触发与具体行为，不能据少数例子推出普遍战略根因，也未用测试结果继续调参。',
    '工程累计更新9次，三次不可晋升副本每次3次；异尺寸边界专项性能检查0优化。正式前84更新沿同一100k日程、同一模型/AdamW/RNG/游标及累计墙钟精确续接，合计正式更新不重复。串行原件、闭合及早停后控制异常保存在D盘原目录；新版由PERFORMANCE_REVISION精确绑定。首次数值预检遇到2条MIOpen求解器计时警告，最终冻结版本复验无该警告且数值通过。'])
report=HERE/'REPORT.md'
existing=report.read_text('utf-8')
if '## 开发全人数战报' in existing:
    raise ValueError('不可重复追加已审核战报')
report.write_text(existing+'\n'.join(lines)+'\n','utf-8')
evidence=read(HERE/'EVIDENCE_MANIFEST.json')
for p in HERE.rglob('*'):
    if p.is_file() and '__pycache__' not in p.parts and p.name!='EVIDENCE_MANIFEST.json':
        evidence['files'][str(p.relative_to(ROOT))]=dict(bytes=p.stat().st_size,sha256=legacy.sha(p))
save(HERE/'EVIDENCE_MANIFEST.json',evidence)
print(json.dumps(dict(reportUpdated=True,traceCases=len(analysis['reports']))))
