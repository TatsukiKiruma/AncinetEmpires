"""校验本轮训练、诊断和成对实战证据，生成可复核报告。"""
import json
import hashlib
import math
from pathlib import Path
from collections import defaultdict

root = Path('training_runs/iteration_20260918')
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
training = read(root / 'training-results.json')
baseline_validation = read(root / 'baseline-validation.json')
sample = read(root / 'sample-manifest.json')
audit = read(root / 'decision-audit.json')
labels = read(root / 'label-audit.json')
original_rows = read(Path('training_runs/evaluation_20260918/results.json'))
stages = {}
state_hashes = defaultdict(set)
for stage in ['screen', 'confirm', 'late']:
    directory = root / stage
    config = read(directory / 'manifest.json')
    assert config['workers'] == 8
    for metadata in config['models'].values():
        model_path = Path(metadata['model'])
        assert hashlib.sha256(model_path.read_bytes()).hexdigest() == metadata['sha256']
        model = read(model_path)
        assert model['featureExtractor'] == 'hashed-action-v3' and len(model['weights']) == 4096
        assert all(math.isfinite(w) for w in model['weights'])
    rows = read(directory / 'results.json')
    assert len(rows) == len(config['jobs']) == len({r['id'] for r in rows})
    for row in rows:
        record = read(directory / 'episodes' / f"{row['id']}.json")
        assert record['job'] == config['jobs'][row['id']]
        episode = record['episode']
        assert row['stepCount'] == len(episode['steps'])
        assert row['illegalActionCount'] == sum(s['illegal'] for s in episode['steps'])
        assert row['naturalWin'] == (row['winnerAlliance'] == row['subjectAlliance'])
        state_hashes[row['caseId']].add(episode['initialObservationHash'])
    stages[stage] = rows
assert all(len(v) == 1 for v in state_hashes.values())

def metrics(rows):
    n = len(rows)
    wins = sum(r['naturalWin'] for r in rows)
    return dict(games=n, wins=wins, winRate=wins / n if n else 0,
        timeouts=sum(r['timeout'] for r in rows), stagnations=sum(r.get('stoppedByStagnation', False) for r in rows),
        illegal=sum(r['illegalActionCount'] for r in rows), maxSteps=sum(r['stoppedByMaxSteps'] for r in rows))

all_new = stages['screen'] + stages['confirm'] + stages['late']
blend = [r for r in all_new if r['variant'] == 'blend']
assert len(blend) == 48 and len({r['caseId'] for r in blend}) == 48
original = [r for r in original_rows if r['subject'] == 'new' and r['opponent'] == 'heuristic']
assert {r['id'] for r in original} == {r['caseId'] for r in blend}
summary = {'newGames': len(all_new), 'workers': 8, 'screen': {}, 'confirmationOnly': metrics([r for r in stages['confirm'] if r['variant'] == 'blend']),
    'paired': {}, 'correctionHoldout': {}, 'allChecks': metrics(all_new)}
lines = ['# BC 诊断、训练迭代与实战验证', '',
    f'本轮完成 {len(all_new)} 局新对局（160局主矩阵及后期快照回归），各阶段均配置 8 worker；采用动态队列并逐局落盘。旧评估中的48局原模型对启发式对照被复用，初始状态一致。没有修改游戏默认 AI。', '',
    '## 训练改进', '',
    '训练器新增可选参数 `--save-epochs`（逐轮模型）、`--select-best`（验证集最佳轮次，平分保留较早轮次）、`--average-weights`（逐样本更新后权重的累计平均）。原有默认训练行为保留。', '',
    f"从原数据集全部406个分片等距抽样：训练{sample['counts']['train']}条、验证{sample['counts']['validation']}条，覆盖19种方案。逐文件SHA256全部匹配；保持原对局级分割，无训练/验证对局交叉；固定顺序用于全部实验。分片等额抽样改变了样本权重，因此不能把本次验证百分比直接与全量训练日志比较。", '',
    '| 方案 | 第1轮 | 第2轮 | 第3轮 | 保存轮次 |', '|---|---:|---:|---:|---:|']
for record in training:
    s = record['summary']
    values = [f"{e['val']['accuracy']:.2%}" for e in s['epochs']]
    lines.append('| ' + ' | '.join([record['experiment']['name']] + values + [str(s['model']['epochs'])]) + ' |')
correction_training = read(root / 'correction-training.json')
lines += ['| label-average-corrected | ' + ' | '.join([f"{e['val']['accuracy']:.2%}" for e in correction_training['epochs']] + [str(correction_training['model']['epochs'])]) + ' |', '',
    f"原全量模型在相同抽样验证集上的命中率：{baseline_validation['accuracy']:.2%}。上述新模型均为从零开始的小规模对照，不是原模型全量续训。", '',
    'lr003、lr001完成离线训练与验证，没有单独进入实战矩阵；实战保留lr01作为控制，并验证离线更优的平均权重方案。不能据此断言所有学习率都已完成实战穷举。', '',
    'label目标不使用teacherWeight参与更新；摘要中记录teacherWeight=0.25并不表示训练已混合教师监督。本轮mixed显式使用0.25的教师权重。', '',
    '学习率对照存在差异，但固定学习率感知机的理想精确算术主要体现为权重尺度变化；实际浮点计算和同分决策会改变更新轨迹。本次平均权重的离线改善更明显，不能仅据此认定实战更强。', '',
    '## 诊断证据', '',
    f"- 四个失败对局共重放{len(audit)}个决策点，导出特征与实时特征完全一致，原模型动作全部复现。{sum(x['candidates'] > 64 for x in audit)}个点超过64候选；按教师标签模拟训练采样后，{sum(x['candidateTruncationChangesChoice'] for x in audit)}个点改变选择。该采样使用教师最优标签，不是可直接复制到纯BC推理中的截断方案。",
    f"- {sum(x['tiedBest'] > 1 for x in audit)}个点出现模型最高分近似相同（误差阈值1e-9），说明候选顺序和特征区分能力值得关注，但不是所有失败都由同分造成。",
    '- 典型错误：原对局39第80回合，模型选择教师分-1850的等待，而教师推荐分19247.5的推进移动；原对局96第91回合也出现同类错误。推进候选本来就在合法动作中。',
    '- 结构差异：BC的nearestUnitDistance/nearestObjectiveDistance使用曼哈顿距离，而教师RuleTacticalEvaluator通过TacticalPathfinder计算地形路径代价。补充可达性、绕路代价和目标推进特征值得下一轮做消融实验；本轮未改变特征版本，尚未证明这一差异是唯一原因。',
    f"- 验证抽样{labels['validation:all']['samples']}条全部有teacherScore，仅{labels['validation:all']['labelBelowTeacherBest']}条标签低于候选最高教师分。三类优势残局共1102条均无此冲突。mixed在这里大部分是在强化已有标签，无法提供明显不同的监督。",
    f"- mixed按首个最高教师分候选取目标，有{labels['validation:all']['teacherFirstDifferentFromLabel']}条与标签不同，其中{labels['validation:all']['teacherFirstDifferentFromLabel']-labels['validation:all']['labelBelowTeacherBest']}条仅为同分替代动作；严格更优标签冲突与同分选择差异分别统计。",
    f"- 训练抽样第130回合及以后仅{labels['train:all']['turnAtLeast130']}/{labels['train:all']['samples']}（{labels['train:all']['turnAtLeast130']/labels['train:all']['samples']:.1%}）；后期覆盖不足是值得继续验证的方向，不能单凭该比例断言是唯一根因。",
    f"- 验证集中标签位于候选首位的比例为{labels['validation:all']['labelFirst']/labels['validation:all']['samples']:.1%}；零权重且按首位破平分即可取得该命中率。这是候选排序带来的评价基线偏差，离线命中率不可替代实战。", '',
    '## 第一阶段：相同14个局面的方案筛选', '',
    '4张地图、正常开局双方席位共8局；2张地图×3档优势共6局。统一seed=9101801。', '',
    '| 方案 | 常规自然胜 | 残局自然胜 | 超时 | 停滞 |', '|---|---:|---:|---:|---:|']
for variant in dict.fromkeys(r['variant'] for r in stages['screen']):
    group = [r for r in stages['screen'] if r['variant'] == variant]
    normal = metrics([r for r in group if r['plan'] == 'sd-normal'])
    end = metrics([r for r in group if r['plan'] != 'sd-normal'])
    total = metrics(group)
    summary['screen'][variant] = {'normal': normal, 'endgame': end, 'all': total}
    lines.append(f"| {variant} | {normal['wins']}/{normal['games']} | {end['wins']}/{end['games']} | {total['timeouts']} | {total['stagnations']} |")
lines += ['', 'hybrid/blend均使用原全量模型；其收益来自启发式参与决策，不能算作纯BC模型本身的提升。blend按筛选自然胜局数选择进入后续确认。', '',
    '## 第二阶段：BC-blend成对确认', '',
    '补测筛选之外的34个场景/种子/席位组合，与筛选14局合并为48局。正常对局覆盖4图×3种子×2席位；残局覆盖2图×3档×2种子×2行动顺序。使用原评估相同的400 ply绝对上限、25600步和停滞保护。', '',
    '| 策略 | 常规自然胜率 | 残局自然收尾率 | 超时 | 停滞 | 非法动作 |', '|---|---:|---:|---:|---:|---:|']
for name, group in [('原纯BC', original), ('原模型+BC-blend', blend)]:
    normal = metrics([r for r in group if r['plan'] == 'sd-normal'])
    end = metrics([r for r in group if r['plan'] != 'sd-normal'])
    total = metrics(group)
    summary['paired'][name] = {'normal': normal, 'endgame': end, 'all': total}
    lines.append(f"| {name} | {normal['wins']}/{normal['games']}（{normal['winRate']:.1%}） | {end['wins']}/{end['games']}（{end['winRate']:.1%}） | {total['timeouts']} | {total['stagnations']} | {total['illegal']} |")
confirmation = summary['confirmationOnly']
lines += ['', f"仅看新增的34局确认集：blend自然胜{confirmation['wins']}/{confirmation['games']}，超时{confirmation['timeouts']}，停滞{confirmation['stagnations']}。合并48局包含用于挑选方案的筛选局，不能把合并值当作完全独立测试成绩。", '',
    '## 小型定向补数据的独立地图对照', '',
    '从原失败对局39、96的第80/84回合快照出发，以教师决策推进，导出128条纠错样本，候选同时保留教师最优和原模型选择；每epoch追加5遍，与相同20,000条基础数据从零重训。纠错标签没有全部经终局胜利验证。', '',
    '评估地图Icy Paths、Mourningstar均未用于本次纠错，使用新种子9101804/9101805；但它们可能存在于原始训练集，不称为训练集外地图。三策略使用完全相同初始状态，各14局（正常8、残局6）。', '',
    '| 策略 | 正常自然胜 | 残局自然胜 | 超时 | 停滞 |', '|---|---:|---:|---:|---:|']
for variant in ['original', 'label-average', 'corrected']:
    group = [r for r in stages['confirm'] if r['variant'] == variant]
    normal = metrics([r for r in group if r['plan'] == 'sd-normal'])
    end = metrics([r for r in group if r['plan'] != 'sd-normal'])
    total = metrics(group)
    summary['correctionHoldout'][variant] = {'normal': normal, 'endgame': end, 'all': total}
    lines.append(f"| {variant} | {normal['wins']}/{normal['games']} | {end['wins']}/{end['games']} | {total['timeouts']} | {total['stagnations']} |")
late_evidence = read(root / 'late-evidence.json')
summary['lateProgress'] = {v: metrics([r for r in stages['late'] if r['variant'] == v]) for v in ['legacy', 'progress']}
lines += ['', '## 后期移动规则的定向回归', '',
    f"检查9个blend超时局面，在{sum(e['found'] for e in late_evidence)}个局面复现：第130回合以后，旧规则把教师评分不低于4200的移动强制替换成结束回合。实验选项 `preserveProductiveLateMoves: true` 保留这些移动，低分移动仍沿用原保护。默认策略保持不变。", '',
    '从对应第130回合之后的同一快照，分别运行旧规则和新选项；双方种子重新初始化且保持成对一致，仍使用400 ply绝对上限。这是针对已知失败的回归，不是全开局独立胜率评估。', '',
    '| 快照策略 | 自然胜 | 超时 | 停滞 | 非法动作 |', '|---|---:|---:|---:|---:|']
for variant, total in summary['lateProgress'].items():
    lines.append(f"| {variant} | {total['wins']}/{total['games']} | {total['timeouts']} | {total['stagnations']} | {total['illegal']} |")
lines += ['', '旧blend的26个获胜对局均在第88回合或以前结束；该实验选项只改变第130回合后的部分移动处理。但尚未把新选项完整重跑48局，不能直接推算修复后的全局胜率。', '',
    '## 工程与完整性校验', '',
    '- 类型检查通过；全套36个测试文件、435项测试通过，包含稀疏平均权重、逐轮保存、最佳轮次、后期推进保护和既有对局回归。',
    '- 生产构建通过；受测模型SHA256与启动清单一致，4096个权重均为有限数值。',
    '- 实战对局数量、任务ID、步数、非法动作计数与原始记录一致；成对初始状态哈希一致。',
    f"- 本轮全部{len(all_new)}局：非法动作{summary['allChecks']['illegal']}、步数保护停止{summary['allChecks']['maxSteps']}、回合超时{summary['allChecks']['timeouts']}、停滞{summary['allChecks']['stagnations']}。超时裁定胜不计为自然胜。", '',
    '## 证据与复现', '',
    '- `sample-manifest.json`：原数据ID、抽样数量和SHA256；`training-results.json`：6组逐轮训练指标；`correction-training.json`：补数据实验。',
    '- `decision-audit.json`：96个失败点的模型/教师评分；`label-audit.json`：分方案标签统计；`corrections-manifest.json`：纠错来源和限制。',
    '- `screen/`、`confirm/`、`late/`：任务清单、模型SHA256、逐局结果和完整动作记录；`late-evidence.json`记录规则拦截位置；`summary.json`为本报告汇总。',
    '- 复跑使用新的输出目录：`node --openssl-legacy-provider --import tsx tools/skirmish_iteration_eval.ts --workers 8 --config training_runs/iteration_20260918/confirm-config.json --out-dir training_runs/iteration_repeat`。', '',
    '这些结果用于当前代码的SD双人回归；未覆盖多人、SO或UI整合。不同种子可能产生重复轨迹，小样本提升需要谨慎解释。']
blend_metrics = summary['paired']['原模型+BC-blend']
lines[2:2] = [f"结论：纯BC的离线提升没有转化为正常开局胜率提升；原模型+BC-blend在48局成对评估中，正常局{blend_metrics['normal']['wins']}/24自然胜、优势残局{blend_metrics['endgame']['wins']}/24自然收尾。适合作为后续候选继续打磨，不能据此宣称已全面超过启发式AI。", '']
lines += ['', '## 后续优先级', '',
    '保留最佳轮次和平均权重工具；短期继续检验原模型+BC-blend。纯BC方向优先补充路径可达性/推进目标特征和更广泛的失败状态纠错数据，再做受控重训。现有结果不支持仅扩大epoch、仅切换mixed或直接大规模复制同分布数据。', '',
    '本轮没有自动替换游戏AI。128条纠错数据只来自两段快照，样本覆盖很窄；其独立地图结果不能用于断言针对性数据永远无效。更改特征前应建立新版本并重新导出对应特征，不能把新旧特征文件混训。']
summary['artifactSha256'] = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['sample-manifest.json','training-results.json','decision-audit.json','label-audit.json','corrections.jsonl']}
(root / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(root / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
