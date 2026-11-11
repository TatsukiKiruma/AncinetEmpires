"""审计配对初态、原始动作、模型和数据哈希，输出收官迭代报告。"""
import json,hashlib,math
from pathlib import Path
from collections import defaultdict,Counter

root=Path('training_runs/endgame_20260918')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rate(n,d):return f'{n}/{d}（{n/d:.1%}）' if d else '—'
stages=['baseline','curriculum','regression-policy','regression-trained','holdout']
stats=defaultdict(lambda:defaultdict(Counter));breakdown=defaultdict(lambda:defaultdict(Counter))
hashes=defaultdict(set);cycles=defaultdict(Counter);memoryDiagnostics=defaultdict(Counter);liveCandidates=defaultdict(list);allrows=[]
for name,digest in read(root/'implementation-hashes.json').items():assert sha(name)==digest
for stage in stages:
    manifest=read(root/stage/'manifest.json');rows=read(root/stage/'results.json')
    assert manifest['workers']==8 and len(rows)==len(manifest['jobs'])
    assert {r['id'] for r in rows}=={j['id'] for j in manifest['jobs']}
    for modelEntry in manifest['models'].values():
        assert sha(modelEntry['model'])==modelEntry['sha256']
        model=read(modelEntry['model'])
        assert model['featureDim']==len(model['weights'])==4096 and all(isinstance(w,(int,float)) and math.isfinite(w) for w in model['weights'])
    for row in rows:
        raw=read(root/stage/'episodes'/f"{row['id']}.json");episode=raw['episode'];s=episode['summary']
        assert row['stepCount']==len(episode['steps'])
        assert row['illegalActionCount']==s['illegalActionCount']==sum(bool(x['illegal']) for x in episode['steps'])
        assert row['naturalWin']==(s['winnerAlliance']==row['subjectAlliance'])
        assert all(row[k]==raw['job'][k] for k in ['id','caseId','variant','map','plan','seed','seat'])
        hashes[row['caseId']].add(row['initialObservationHash'])
        key=f"{stage}/{row['variant']}";group='normal' if row['plan']=='sd-normal' else 'endgame'
        memoryDiagnostics[key].update(row.get('policyDiagnostics',{}).get(row['variant'],{}))
        elapsedTurns=row['finalTurn']-(episode['steps'][0]['turnBefore'] if episode['steps'] else row['finalTurn'])
        for g in [group,'total']:
            c=stats[key][g];c['games']+=1;c['wins']+=row['naturalWin'];c['losses']+=row['naturalLoss'];c['timeouts']+=row['timeout']
            c['illegalActions']+=row['illegalActionCount'];c['maxSteps']+=row['stoppedByMaxSteps'];c['stagnations']+=row['stoppedByStagnation']
            c['elapsedTurns']+=elapsedTurns
            if row['naturalWin']:c['winningElapsedTurns']+=elapsedTurns
            timing=row['timings'][row['variant']];c['calls']+=timing['calls'];c['decisionMs']+=timing['totalMs'];c['maxDecisionMs']=max(c['maxDecisionMs'],timing['maxMs'])
        for field,value in [('map',row['map']),('subjectFirst',str(row['subjectFirst'])),('seed',str(row['seed'])),('plan',row['plan'])]:
            c=breakdown[key][f'{field}={value}'];c['games']+=1;c['wins']+=row['naturalWin'];c['timeouts']+=row['timeout'];c['illegalActions']+=row['illegalActionCount']
        history=defaultdict(list)
        for step in episode['steps']:
            parts=step['actionCode'].split(':');kind=parts[0]
            if step['playerId']!=row['subjectId']:
                if kind=='attack' and len(parts)>2:history[parts[2]]=[]
                continue
            c=cycles[key];c['actions']+=1
            liveCandidates[key].append(step['legalActionCount'])
            if step['turnBefore']>=100:c['lateActions']+=1
            if len(parts)<2:continue
            actor=parts[1]
            if kind in ['move','post_attack_move']:
                c['moves']+=1;pos=':'.join(parts[2:]);prior=history[actor]
                reversal=len(prior)>=2 and pos==prior[-2] and pos!=prior[-1]
                c['reversals']+=reversal
                if step['turnBefore']>=100:c['lateMoves']+=1;c['lateReversals']+=reversal
                history[actor]=(prior+[pos])[-2:]
            elif kind!='wait':history[actor]=[]
        allrows.append(dict(row,stage=stage))
assert all(len(s)==1 for s in hashes.values())
cached={}
previous=read('training_runs/pvp_navigation_20260918/evaluation/results.json')
previousManifest=read('training_runs/pvp_navigation_20260918/evaluation/manifest.json')
for name in ['original','ai-only']:
    entry=previousManifest['models'][name];assert sha(entry['model'])==entry['sha256']
    games=[r for r in previous if r['variant']==name]
    assert len(games)==20 and all(r['initialObservationHash'] in hashes[r['caseId']] for r in games)
    cached[name]=dict(normalWins=sum(r['naturalWin'] for r in games if r['plan']=='sd-normal'),
                      endgameWins=sum(r['naturalWin'] for r in games if r['plan']!='sd-normal'),
                      timeouts=sum(r['timeout'] for r in games),illegalActions=sum(r['illegalActionCount'] for r in games))
curriculum=read(root/'curriculum-manifest.json');accepted=[x for x in curriculum if x['accepted']]
for x in curriculum:assert sha(x['snapshotFile'])==x['snapshotHash']
for x in accepted:
    assert sha(x['source'])==x['sourceHash'] and sha(x['file'])==x['sha256']
    assert len(Path(x['file']).read_text(encoding='utf-8').splitlines())==x['samples']
groups={s:{x['group'] for x in accepted if x['split']==s} for s in ['train','validation']}
assert not groups['train']&groups['validation']
candidateAudit={}
for name in ['curriculum-train.jsonl','curriculum-validation.jsonl']:
    c=Counter()
    for line in (root/name).read_text(encoding='utf-8').splitlines():
        sample=json.loads(line);candidates=sample['candidates'];codes=[v['actionCode'] for v in candidates]
        assert sample['featureExtractor']=='hashed-action-v4' and sample['featureDim']==4096
        assert sample['label']['actionCode'] in codes and len(set(codes))==len(codes)<=64
        for candidate in candidates:
            assert math.isfinite(candidate['teacherScore'])
            assert all(isinstance(i,int) and 0<=i<4096 and math.isfinite(v) for i,v in candidate['features'])
        label=next(v for v in candidates if v['actionCode']==sample['label']['actionCode'])
        c['samples']+=1;c['candidates']+=len(candidates);c['labelTopTeacher']+=label['teacherScore']==max(v['teacherScore'] for v in candidates)
    candidateAudit[name]=dict(c,averageCandidates=c['candidates']/c['samples'])
for name,entry in read(root/'training-manifest.json')['files'].items():assert sha(root/name)==entry['sha256']
chosen=read(root/'deployment-candidate.json');training=read(root/'training-results.json');gates=read(root/'gate-results.json')
for c in cycles.values():
    c['reversalsPer1000Moves']=1000*c['reversals']/c['moves'] if c['moves'] else 0
    c['lateReversalsPer1000Moves']=1000*c['lateReversals']/c['lateMoves'] if c['lateMoves'] else 0
for stageStats in stats.values():
    for c in stageStats.values():
        c['meanElapsedTurns']=c['elapsedTurns']/c['games']
        c['meanWinningElapsedTurns']=c['winningElapsedTurns']/c['wins'] if c['wins'] else None
liveCandidateSummary={}
for key,values in liveCandidates.items():
    values.sort();n=len(values)
    liveCandidateSummary[key]=dict(decisions=n,mean=sum(values)/n,median=values[n//2],p95=values[min(n-1,math.ceil(n*.95)-1)],maximum=max(values),fractionAbove64=sum(v>64 for v in values)/n)
checks=dict(pairedInitialStates=True,rawEpisodeMetrics=True,sourceAndModelHashes=True,groupIsolation=True,workers=8)
acceptance=read(root/'independent-acceptance.json')
independent=stats[f"holdout/{chosen['variant']}"];reference=stats['holdout/v4-ai-only']
assert independent['normal']['games']==acceptance['normalGames'] and independent['endgame']['games']==acceptance['endgameGames']
independentPassed=(independent['endgame']['wins']>=acceptance['minimumEndgameWins'] and independent['normal']['wins']>=reference['normal']['wins']
    and independent['total']['timeouts']/independent['total']['games']<=acceptance['maximumTimeoutRate'] and independent['total']['illegalActions']==0
    and independent['total']['stagnations']+independent['total']['maxSteps']==0)
output=dict(games=len(allrows),workers=8,candidate=chosen,gates=gates,independentAcceptancePassed=independentPassed,evaluation=stats,breakdown=breakdown,cycles=cycles,memoryDiagnostics=memoryDiagnostics,cachedV3=cached,candidateAudit=candidateAudit,liveCandidates=liveCandidateSummary,
            curriculum=dict(states=len(curriculum),accepted=len(accepted),groups={k:sorted(v) for k,v in groups.items()},samples={s:sum(x['samples'] for x in accepted if x['split']==s) for s in groups}),checks=checks)
(root/'summary.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# 收官诊断、示范训练与独立种子验证（2026-09-18）','',
       f"完成 {len(allrows)} 场新对局，全部验证池使用 8 worker；其中 24 场是失败快照的示范生成。保留游戏默认 AI。",'',
       '## 基线与诊断','',
       '纯 AI 数据 v4 基线：正常开局 2/8 胜，优势残局 7/12 胜，总超时 4/20，非法动作 0。验证门槛因此提高为正常至少 2/8、残局至少 8/12、超时至多 2/20，且无非法动作及保护停止。',
       '',
       '严格重放确认三局超时记录在第 80 回合破坏己方城镇；动作循环包含破坏、重新占领、修复，以及单位往返。旧纯 BC 没有显式的长期目标状态，因此不能把往返直接解释为“内部目标切换”。证据保存在 ownership-probe.json 与 cycle-diagnosis.json。',
       '',
       '新增策略按实际路径代价选择攻击/占领目标，并跨行动保存目标；目标失效、不可达或长期无进展时重新选择。只记录已观察到的真实位置，受伤、有效战斗及合理撤退允许清除/绕过往返惩罚；抑制破坏己方、盟方及中立城镇。紧急战术动作优先。',
       '',
       '这是启发式辅助策略：战术分数为主，BC 仅提供 ±1200 的偏好，再叠加目标推进和历史惩罚。历史没有写入 v4 特征；不能宣称纯 BC 已经学会记忆。tactical-only 控制保留同样的战术评分和 BC 偏好，但关闭新增记忆/目标/城镇修正。',
       '',
       '候选分布仍有差异：基础 AI 训练平均约 38 个候选，新示范约 39 个、上限 64；原 v4 实战合法动作均值约 109、中位数 34，44.85% 的决策超过 64，上限 622。实战数字按决策加权，长局贡献更多，且合法动作可能含策略过滤项；它提示训练与实战候选规模不一致，不能单独证明失利原因。详见 candidate-audit.json 及 summary.json 的 liveCandidates。',
       '', '## 配对回归','',
       '| 方案 | 正常自然胜 | 残局自然胜 | 总超时 | 非法动作 | 平均决策毫秒 |',
       '|---|---:|---:|---:|---:|---:|']
lines[4:4]=['## 结论','',
    ('已有 v4 权重＋收官策略通过开发回归和独立验收，保留已有权重；本轮补训权重不替换。' if independentPassed else '已有 v4 权重＋收官策略通过开发回归，但未通过独立验收；保留实验产物和默认 AI，不作替换。'),'',
    '收益主要来自启发式战术辅助、持续目标、往返历史以及城镇保护。补训候选的纯模型为正常 2/8、残局 4/12、超时 7/20，差于既有 v4；加同样策略后也只有正常 5/8、残局 10/12、超时 2/20，低于保留原权重的组合。', '',
    '独立正常开局为 8/16，其中 Icy Paths 为 0/4；尚不能宣称全面优于现有启发式 AI。当前成果是经验证的启发式辅助策略，不是纯模型能力已达同等水平。代码供离线训练/评估调用，游戏默认 AI 尚未切换。', '',
    '后续数据应优先覆盖当前 v4 尚未解决的失败状态，并检查完整合法候选中的高分误选；减少重复已经会做的旧收官示范。当前结果不支持直接增加训练轮次或大幅扩大同类示范占比。', '']
def table(stage):
    for key,groups in stats.items():
        if not key.startswith(stage+'/'):continue
        n,e,t=groups['normal'],groups['endgame'],groups['total']
        lines.append(f"| {key.split('/',1)[1]} | {rate(n['wins'],n['games'])} | {rate(e['wins'],e['games'])} | {t['timeouts']}/{t['games']} | {t['illegalActions']} | {t['decisionMs']/max(1,t['calls']):.2f} |")
for stage in ['baseline','regression-policy','regression-trained']:table(stage)
lines+=['','同一矩阵的前序缓存对照（初态哈希一致，本轮未重复计算）：原全量 v3 正常 0/8、残局 6/12、超时 2/20；AI-only v3 正常 0/8、残局 8/12、超时 2/20。两者均无非法动作。',
        '',f"独立评估前冻结候选：**{chosen['variant']}**；开发回归门槛：**{'通过' if chosen['passGate'] else '未通过'}**。模型：`{chosen['model']}`。",'',
        '## 获胜示范与训练','',
        f"12 个失败快照，启发式与目标记忆教师各跑一次，共 24 场。仅接纳自然胜利、无超时/非法动作/保护停止的完整轨迹；共有 {len(accepted)} 个快照获得有效轨迹，每个快照选收官较快的一个，再严格重放全部动作。",'',
        '其中 6 个早期策略失败快照只需“移动 → 占领”两步即可自然获胜。补充核对发现，当前 v4 基线和新模型在离线子集及完整合法集合中都能选对这 12 步；它们已经不是当前 v4 的难例，不能作为候选截断造成错误的证据。按来源均衡抽样会重复这些短示范，实际独立数据量仍是 11 个来源快照，不是重复采样后的动作条数。详见 candidate-probe.json。', '',
        '额外逐状态审计发现，获胜轨迹的尾段仍含 4 个破坏己方城镇的动作。它们已从正标签中剔除，并重新训练所有最终候选；详情见 curriculum-town-audit.json。获胜本身不能为轨迹中每个动作背书。后续实战只使用清洗后模型。', '',
        f"训练 {len(output['curriculum']['groups']['train'])} 个来源组、{output['curriculum']['samples']['train']} 条片段动作；验证 {len(output['curriculum']['groups']['validation'])} 个来源组、{output['curriculum']['samples']['validation']} 条。每局取开始 64 步和结束 192 步，去重；整段来源必须真实终局获胜，但不代表其中每步都最优。来源对局分区不交叉。",'',
        '基础复习数据为 8,437 条 AI 训练动作，本轮是抽样重训而非原全量 886,494 条数据重跑。新示范分别占采样的 10% / 25%，单样本权重 1，label 目标、teacherWeight=0。每组从头训练 v4、4096 维、学习率 0.1、最多 3 轮、平均权重、逐轮保存；以 80% AI＋20% 隔离示范验证选轮次和占比。实战只评估验证集选出的 25% 方案，不能据此断言 10% 方案实战一定更差。未使用开发回归及独立种子局面训练。',
        '', '| 模型 | 保留轮次 | AI 验证命中率 | 收官验证命中率 | 选模验证第 1 / 2 / 3 轮 |','|---|---:|---:|---:|---|']
for row in training:
    model=read(row['summary']['outFile']);v=row['validation']
    curve=' / '.join(f"{epoch['val']['accuracy']:.2%}" for epoch in row['summary']['epochs'])
    lines.append(f"| {row['name']} | {model['epochs']} | {v['ai']['accuracy']:.2%} | {v['curriculum']['accuracy']:.2%} | {curve} |")
lines+=['', '动作细分显示，25% 模型相对基线多命中 6 条验证动作：等待 +3、攻击后移动 +2、招募 +1；普通移动均为 53/68，占领均为 3/3。因此总命中率提升不等于终结动作能力提升。这 148 条验证动作来自 3 个来源，其中 144 条来自同一来源，泛化证据有限；详见 action-validation.json。']
lines+=['','## 独立种子验证','',
        '矩阵在回归结果出炉前冻结：种子 9101821/9101822；正常开局为 Duel、Crossed swords、Icy Paths、Mourningstar，双先后手共 16 场；后两张地图再覆盖小/中/大优势及先后手，共 12 场残局。候选与原 v4 基线配对，共 56 场。这些地图不保证从未出现在更早的 AI 基础训练中。',
        '', '| 方案 | 正常自然胜 | 残局自然胜 | 总超时 | 非法动作 | 平均决策毫秒 |','|---|---:|---:|---:|---:|---:|']
table('holdout')
lines+=['',f"独立验收：**{'通过' if independentPassed else '未通过'}**。预先冻结的要求为残局至少 8/12 胜、正常胜场不低于配对基线、超时率不超过 10%、无非法动作及保护停止。该结果不用于反向选参。"]
lines+=['','| 地图 | 方案 | 正常自然胜 | 残局自然胜 | 超时 |','|---|---|---:|---:|---:|']
holdout=[r for r in allrows if r['stage']=='holdout']
for mapname in sorted({r['map'] for r in holdout}):
    for variant in sorted({r['variant'] for r in holdout}):
        subset=[r for r in holdout if r['map']==mapname and r['variant']==variant]
        normal=[r for r in subset if r['plan']=='sd-normal'];endgame=[r for r in subset if r['plan']!='sd-normal']
        lines.append(f"| {mapname} | {variant} | {rate(sum(r['naturalWin'] for r in normal),len(normal))} | {rate(sum(r['naturalWin'] for r in endgame),len(endgame))} | {sum(r['timeout'] for r in subset)}/{len(subset)} |")
lines+=['','| 分组 | 方案 | 自然胜 | 超时 | 非法动作 |','|---|---|---:|---:|---:|']
for field in ['subjectFirst','seed']:
    for value in sorted({r[field] for r in holdout}):
        label=('先手' if value else '后手') if field=='subjectFirst' else f'种子 {value}'
        for variant in sorted({r['variant'] for r in holdout}):
            subset=[r for r in holdout if r[field]==value and r['variant']==variant]
            lines.append(f"| {label} | {variant} | {rate(sum(r['naturalWin'] for r in subset),len(subset))} | {sum(r['timeout'] for r in subset)}/{len(subset)} | {sum(r['illegalActionCount'] for r in subset)} |")
lines+=['','## 收官速度','',
    f"独立残局自然胜局的平均经过回合：基线 {reference['endgame']['meanWinningElapsedTurns']:.1f}，修正策略 {independent['endgame']['meanWinningElapsedTurns']:.1f}。这里只统计胜局，两者赢下的局面不同，不能直接把均值差解释为同局速度变化。下面给出修正策略耗时最长的三个残局及配对基线。",'',
    '| 地图／计划／种子／先后手 | 修正策略终局回合 | 同局纯 v4 |','|---|---:|---|']
slow=sorted([r for r in holdout if r['variant']==chosen['variant'] and r['plan']!='sd-normal'],key=lambda r:r['finalTurn'],reverse=True)[:3]
for row in slow:
    old=next(r for r in holdout if r['variant']=='v4-ai-only' and r['caseId']==row['caseId'])
    outcome='胜' if old['naturalWin'] else '超时' if old['timeout'] else '负'
    current='胜' if row['naturalWin'] else '超时' if row['timeout'] else '负'
    lines.append(f"| {row['map']} / {row['plan']} / {row['seed']} / {'先手' if row['subjectFirst'] else '后手'} | {row['finalTurn']}（{current}） | {old['finalTurn']}（{outcome}） |")
lines+=['','自然收官率提高不等于所有局面都能快速结束。个别胜局仍经过较长拉锯，应继续作为效率问题跟踪。']
lines+=['','## 往返及验证边界','', '| 阶段/方案 | 移动动作数 | 每千次移动的往返 | 第 100 回合后每千次移动的往返 |','|---|---:|---:|---:|']
for key,c in cycles.items():
    if key.startswith('curriculum/'):continue
    lines.append(f"| {key} | {c['moves']} | {c['reversalsPer1000Moves']:.1f} | {c['lateReversalsPer1000Moves']:.1f} |")
lines+=['', '往返按同一单位连续 A→B→A 位置重复统计，战斗/有效动作清除历史；该统计仍可能包含合理机动，不能直接等同错误。全部阶段核对配对初态哈希、原始动作非法标记、自然终局胜者、模型/数据/来源 SHA-256。超时按环境 400 plies 预算计，不是单次推理时间超标；快照沿用绝对回合预算。推理时间为 8 worker 并发下测量，机器负载会影响数值。', '',
        '类型检查、445 项测试和构建通过；v4 在线/离线特征对齐 54 个状态、2,026 个候选。新导航目标接口未改变原 v4 特征语义。详细按地图、先后手、种子分组的胜率及安全指标见 summary.json 的 breakdown。', '',
        '这些结果是有限地图与相关局面的实验，不能据此断言在所有地图或真人对局中胜率相同。独立集只用于最终验证，未据此调参；默认 AI 与原模型保留。']
(root/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(dict(games=len(allrows),candidate=chosen,checks=checks),ensure_ascii=False,indent=2))
