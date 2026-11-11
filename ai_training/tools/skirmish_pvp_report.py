"""核对数据、模型、配对对局，再生成真人补训与路径特征实验报告。"""
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT=Path('training_runs/pvp_navigation_20260918')
def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pct(x): return f'{x*100:.2f}%'

audit=read('audit.json');identities=read('identity-audit.json');features=read('feature-summary.json')
assert len(audit)==78 and all(x['accepted'] and x['records']==x['expectedRecords'] for x in audit)
assert identities['groups']==78 and not identities['duplicateGroups']
assert all(not x['fileName'].endswith(('_065.bin','_078.bin','_097.bin')) for x in audit)
for row in audit: assert sha(row['copiedPath'])==row['sha256']
for name,entry in read('dataset-manifest.json')['files'].items(): assert sha(ROOT/name)==entry['sha256']
groups=defaultdict(Counter)
for x in features:
    g=groups[x['kind'],x['split']];g['games']+=1;g['usedGames']+=x['samples']>0;g['samples']+=x['samples'];g['belowTeacher']+=x['labelBelowTeacher']
    g['legalCandidates']+=x['legalCandidates'];g['exportedCandidates']+=x['exportedCandidates']

rows=[]
hashes=defaultdict(set)
late=defaultdict(Counter)
for stage in ['evaluation','ratio10-evaluation']:
    manifest=read(f'{stage}/manifest.json');result=read(f'{stage}/results.json')
    assert manifest['workers']==8 and len(result)==len(manifest['jobs'])
    assert {r['id'] for r in result}=={j['id'] for j in manifest['jobs']}
    for name,entry in manifest['models'].items():
        assert sha(entry['model'])==entry['sha256']
        model=json.loads(Path(entry['model']).read_text(encoding='utf-8'))
        assert len(model['weights'])==model['featureDim']==4096
        assert all(isinstance(w,(int,float)) and abs(w)<float('inf') for w in model['weights'])
    for r in result:
        raw=read(f"{stage}/episodes/{r['id']}.json")
        episode=raw['episode'];s=episode['summary']
        assert s['illegalActionCount']==r['illegalActionCount']==sum(bool(x['illegal']) for x in episode['steps'])
        assert r['naturalWin']==(s['winnerAlliance']==r['subjectAlliance'])
        assert r['stepCount']==len(episode['steps'])
        assert all(r[k]==raw['job'][k] for k in ['id','variant','caseId','map','plan','seed','seat'])
        hashes[r['caseId']].add(r['initialObservationHash'])
        if r['timeout']:
            history=defaultdict(list)
            for step in episode['steps']:
                if step['turnBefore']<130:continue
                parts=step['actionCode'].split(':');kind=parts[0]
                if step['playerId']!=r['subjectId']:
                    if kind=='attack' and len(parts)>2:history[parts[2]]=[]
                    continue
                late[r['variant']][kind]+=1
                if len(parts)<2:continue
                actor=parts[1]
                if kind in ['move','post_attack_move']:
                    position=':'.join(parts[2:]);previous=history[actor]
                    if len(previous)>=2 and position==previous[-2] and position!=previous[-1]:late[r['variant']]['movementReversals']+=1
                    previous.append(position);history[actor]=previous[-2:]
                elif kind!='wait':history[actor]=[]
        rows.append(dict(r,stage=stage))
assert len(rows)==120 and all(len(x)==1 for x in hashes.values())
summary=defaultdict(lambda:defaultdict(Counter))
for r in rows:
    group='normal' if r['plan']=='sd-normal' else 'endgame'
    for name in [group,'total']:
        t=summary[r['variant']][name];t['games']+=1;t['wins']+=r['naturalWin'];t['losses']+=r['naturalLoss'];t['timeouts']+=r['timeout'];t['illegalActions']+=r['illegalActionCount']
        t['stagnations']+=r.get('stoppedByStagnation',False);t['maxSteps']+=r['stoppedByMaxSteps']
        timing=r['timings'][r['variant']];t['calls']+=timing['calls'];t['decisionMs']+=timing['totalMs'];t['maxDecisionMs']=max(t['maxDecisionMs'],timing['maxMs'])
train=read('training-results.json');tests={x['name']:x['metrics'] for x in read('human-test.json')}
validation=[]
for x in train:
    e=x['experiment'];m=x['result']['model'];validation.append(dict(name=e['name'],epoch=m['epochs'],learningRate=e['lr'],humanRatio=e['ratio'],
        select=max(t['val']['accuracy'] for t in x['result']['epochs']),ai=x['validation']['ai']['accuracy'],human=x['validation']['human']['accuracy'],test=tests[e['name']]['accuracy']))
output={'auditPassed':len(audit),'humanWinningGames':sum(bool(x['humanWinnerTeams']) for x in identities['rows']),
    'data':{f'{a}/{b}':dict(c) for (a,b),c in groups.items()},'offline':validation,'evaluation':summary,'lateTimeoutActions':late,'newGames':len(rows),'workers':8,
    'checks':{'sourceHashes':True,'datasetHashes':True,'modelHashes':True,'pairedInitialStates':True,'rawEpisodeMetrics':True}}
(ROOT/'summary.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')

lines=['# 真人回放补训与 v4 路径特征评估（2026-09-18）','',
'已完成 78 局严格回放、8 组各 3 轮训练、120 场实战验证；验证使用 8 worker。原模型和默认 AI 均保留。',
'','## 决策建议','',
'真人数据能提高真人动作拟合，但本轮没有证明扩大真人补训可以稳定超过纯 AI 数据对照。暂不扩大到全量重训，也不继续叠加训练轮数；保留原模型及现有启发式 AI，新模型作为实验产物。',
'',
'若继续研究新路径特征，使用独立 v4 模型重新训练。本轮低学习率 0.03 的 v3 续训方案，真人留出表现弱于从头训练；但学习率、既有数据量和初始化同时不同，不能据此断言所有续训方案都无效。',
'',
'在本轮真人方案中，v4＋25% 真人采样、学习率 0.1、label、teacherWeight=0、平均权重、最多 3 轮，是验证集选出的候选；它仍不是已达到替换门槛的正式模型。保持逐轮保存与选优，不把 25% 占比或 3 轮当作普遍最优参数。',
'',
'下一步应优先补充可验证收官成功的多步片段、目标持续性和往返行为诊断。当前新特征改善了同一真人占比下的残局结果，但常规开局仍未战胜启发式 AI；单纯增加同分布对局或 epochs 不是已验证的解决方案。',
'','## 数据核查','',
'78 个原始文件的 SHA-256、当前引擎严格动作回放、记录总数和最终胜者均通过检查。初始局面＋随机种子识别出 78 个独立组，非短局没有重复的完整动作流；既有 065/078/097 黑名单未纳入。',
'',
'这些文件包含真人和机器人槽位，并非 78 局都能提供真人胜方标签。依据 APK `C1251b.java` 中 `teamsPlayer → 1`、`teamsRobot → 2` 的定义，只有 43 局由真人槽位所属联盟获胜；其余 35 局没有用于真人胜方训练。此筛选只能证明回放兼容及胜方身份，不能证明玩家水平。',
'',
'按完整对局哈希预先划分 54/12/12 局，再筛选真人胜方。每局均匀抽取最多 80 个回放记录及其展开动作；这是一轮抽样对照，不是对全部 117,884 条回放记录或原 886,494 条 AI 样本的全量重训。',
'','| 分区 | 原始对局 | 真人胜方有效局 | 真人样本 | AI 样本 |','|---|---:|---:|---:|---:|']
for split,title in [('train','训练'),('validation','验证'),('test','最终测试')]:
    h=groups['pvp',split];a=groups['ai',split]
    lines.append(f"| {title} | {h['games']} | {h['usedGames']} | {h['samples']} | {a['samples']} |")
lines += ['',
'AI 数据来自另行严格复现的 88 局既有启发式胜局（66 局训练、22 局验证），覆盖 11 种训练计划。v3/v4 使用完全相同的状态、标签和候选顺序。真人最终测试只有 5 局、235 个相关动作，不能把 235 个动作当作 235 个独立对局。',
'',
'在抽取的真人候选子集中，大约八成真人标签低于最高 teacherScore。评分差异不等于真人标签错误。因此本轮保留真人原动作，用 `label`、`teacherWeight=0`；没有把真人标签改写为启发式标签。候选先按类型抽至 96 个评分，再保留最多 64 个；顺序按固定哈希打散，不把标签固定在首位。实战仍比较全部合法候选。',
'','## 训练设置与结果','',
'真人“权重”通过混合采样控制：10% 对应 8,437 条 AI＋937 次真人抽样，25% 对应 8,437＋2,812；真人按训练对局均匀抽样，单样本更新权重均为 1。25% **不是** `--teacher-weight 0.25`。',
'',
'所有实验训练 3 轮、4096 维、平均权重，逐轮保存；选参验证集固定为 262 条 AI＋262 条真人，按综合命中率保留最佳轮次。重新训练学习率 0.1，续训从原全量 v3 模型开始、学习率 0.03；这是两种实际方案的对照，不是只改变初始化的单因素试验。',
'','| 模型 | 最佳轮 | 综合验证 | 完整 AI 验证 | 真人验证 | 真人最终测试 |','|---|---:|---:|---:|---:|---:|']
for x in validation:lines.append(f"| {x['name']} | {x['epoch']} | {pct(x['select'])} | {pct(x['ai'])} | {pct(x['human'])} | {pct(x['test'])} |")
lines += [f"| 原始全量 v3 | 3 | — | — | — | {pct(tests['original']['accuracy'])} |",'',
'仅按验证集冻结的候选是 `fresh-v3-p25`（第 2 轮）和 `fresh-v4-p25`（第 3 轮）。v4 在最终真人测试上只比该 v3 多正确 4 条；不能据此宣称稳定提升。后续补充了 10% 方案的同场景实战，用于检验离线选参是否与实际效果一致，未用真人测试集重新挑模型。',
'','## 实战结果','',
'每个模型 20 场：Duel、Crossed swords 的常规开局共 8 场（2 地图×2 种子×先后手），Swamplands、The Crossing 的小/中/大优势残局共 12 场（2 地图×3 档×先后手）；残局种子按地图和档位交替使用 9101811/9101812。全部对手为现有启发式 AI。相同场景的初始 observation 哈希完全一致。',
'',
'胜率只统计规则自然终局获胜；超时裁定领先不算自然胜。上限为绝对 400 ply、25,600 步；残局从第 35 回合开始，因此并不是额外运行 200 回合。',
'','| 模型 | 常规胜局 / 8 | 优势残局胜局 / 12 | 总自然胜率 | 超时 / 20 | 非法动作 | 停滞 / 步数保护 |','|---|---:|---:|---:|---:|---:|---:|']
for variant in ['original','ai-only','human-v3','human-v4','human-v3-p10','human-v4-p10']:
    d=summary[variant];t=d['total']
    lines.append(f"| {variant} | {d['normal']['wins']} | {d['endgame']['wins']} | {pct(t['wins']/t['games'])} | {t['timeouts']} | {t['illegalActions']} | {t['stagnations']} / {t['maxSteps']} |")
lines += ['',
'`human-v3` / `human-v4` 是 25% 真人方案，`ai-only` 是同一抽样 AI 集训练的 v3 对照。20 个场景数量较少，部分地图的不同种子也可能产生相同轨迹；结论限于本轮对照。',
'','## 路径与目标特征改动','',
'新增 `hashed-action-v4`，保持 v1/v2/v3 的既有特征语义。新模块 `tools/skirmish_navigation_features.ts` 用反向多源 Dijkstra 计算按兵种移动成本、地形能力、脚本移动覆盖、敌我占位及飞行规则约束的目标距离；用同一 observation 的缓存复用距离场。',
'',
'目标分别为可占领的敌方空城堡、可占领的城镇收入点、符合最小/最大射程的敌军攻击位置。特征描述可达性、预计移动回合、是否已经就位、移动前后路径进度，并区分兵种和早晚期。它没有替换游戏寻路规则，也不保证预测未来敌方移动。',
'',
'v4 必须从完整 observation 重新导出，不能把旧 compact 哈希样本直接改名为 v4。续训新增 `--initial-model` 并校验模型类型、版本、维度和有限权重，记录来源 SHA-256；禁止直接将 v3 权重当作 v4 使用。导出 CLI 和生成器指纹已包含 v4 模块。',
'',
'在线/离线逐项核对通过 54 条样本、2,026 个候选。路径单测覆盖不可通行地形绕路、敌军阻断/同盟穿越、兵种占领权限、最小射程以及跨局面缓存隔离。',
'','## 超时残局诊断','',
'以下只统计最终超时局中，受测模型在第 130 回合以后执行的动作。往返是同一单位连续移动目的地出现 A→B→A，期间自身攻击/占领等事件或遭受攻击会清除记录；这是循环行为的线索，不把所有战术后退自动判为错误。',
'','| 模型 | 移动 | 待机 | 攻击 | 结束回合 | 往返标记 |','|---|---:|---:|---:|---:|---:|']
for name,data in sorted(late.items()):
    lines.append(f"| {name} | {data['move']+data['post_attack_move']} | {data['wait']} | {data['attack']} | {data['end_turn']} | {data['movementReversals']} |")
lines += ['',
'路径可达性正确不等于长期目标稳定。当前实验仍需要对多步推进、目标切换以及可验证的终局成果提供训练信号；继续增加同分布模仿样本或训练轮次，没有在本轮得到实战收益保证。',
'','## 文件与复现','',
'- `audit.json`、`identity-audit.json`：78 局严格回放与身份核查。',
'- `dataset-manifest.json`、`feature-summary.json`：样本构成及文件哈希。',
'- `training-results.json`、`human-test.json`：8 组训练及留出测试原始指标。',
'- `fresh-v3-p25.json`、`fresh-v4-p25.json`：验证集选出的实验模型；各轮权重另存 `.epoch-N.json`。',
'- `evaluation/`、`ratio10-evaluation/`：8 worker 的配置、模型哈希、120 局原始动作和汇总。',
'- `summary.json`：报告对应的机器可读核查结果。',
'',
'验证命令：`npm run lint`、`npm test`、`npm run build`；另有原始文件、数据集、模型哈希和完整对局指标核对。具体工程检查结果见 `engineering-checks.json`。',
]
(ROOT/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'games':len(rows),'summary':summary},ensure_ascii=False))
