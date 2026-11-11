"""把真实前检和三端结果写入运行中报告，不把未完成竞技场记作完成。"""
import time
import shutil
from run_league import DIR, ROOT, read, save, sha

folder = DIR / 'generations/gen_03'; audit = read(folder / 'dev-policy-audit.json'); parity = read(folder / 'tri-runtime-parity.json')
assert audit['passed'] and parity['passed'] and audit['modelSha256'] == parity['modelSha256'] == sha(folder / 'model.bin')
assert parity['chrome']['chromeProfileCleaned']
plan = folder / 'arena/plan.json'; assert plan.exists()
frozen = dict(modelSha256=sha(folder / 'model.bin'), planSha256=sha(plan), headCalibrationSha256=sha(folder / 'head-calibration.json'), valueConfigSha256=sha(folder / 'value-config.json'), devAuditSha256=sha(folder / 'dev-policy-audit.json'), triParitySha256=sha(folder / 'tri-runtime-parity.json'), semanticProtocolSha256=sha(folder / 'semantic-repair-protocol.json'))
receipt = folder / 'ARENA_INPUT_FREEZE.json'
if receipt.exists(): assert read(receipt)['identities'] == frozen
else: save(receipt, dict(identities=frozen, frozenBeforeCandidateResults=True, recordedAt=time.time(), stopAfterGeneration=3))
backup = DIR / 'phase52-audit/pre-arena-documents'; backup.mkdir(exist_ok=True)
for name in ['REPORT.md', 'BATTLES.md', 'gate-summary.json', 'LEAGUE_RESUME_GUIDE.md']:
    if not (backup / name).exists(): shutil.copyfile(DIR / name, backup / name)
current = ROOT / 'ai_training/status/CURRENT.md'
if not (backup / 'CURRENT.md').exists(): shutil.copyfile(current, backup / 'CURRENT.md')
completed = list((folder / 'arena/battles').glob('*/result.json'))
groups = {}
for path in completed:
    result = read(path); slot = result['slot']; key = slot['mode'] + '/' + slot['panel']
    groups.setdefault(key, []).append(result)
table = ['|策略/面板|已完成|自然胜|自然负|动作截断|决策超时|错误|', '|---|---:|---:|---:|---:|---:|---:|']
for key, rows in sorted(groups.items()):
    table.append('|' + '|'.join(map(str, [key, len(rows), *[sum(r['classification'] == kind for r in rows) for kind in ['natural_win', 'natural_loss', 'action_truncation', 'decision_timeout', 'error']]])) + '|')
(DIR / 'BATTLES.md').write_text('# 阶段5.2本轮正式评测进行中\n\n当前快照'+str(len(completed))+'/112槽；完整战报在本轮结束后生成，实时原件见generations/gen_03/arena/battles。冠军纯策略34/56按SHA复用，冠军搜索38/56按同运行时重测。\n\n'+'\n'.join(table)+'\n\n自然胜、动作截断、超时和错误分别统计。本轮结束后执行原promote(3)并停止，不追加训练或启动第4代。\n', encoding='utf-8')
state = read(DIR / 'league-state.json'); preservation = read(DIR / 'phase52-audit/current-preservation.json')
save(DIR / 'gate-summary.json', dict(stage='phase5.2', generation=3, complete=False, status='formal_arena_running', candidateArenaSlots=len(completed), candidateArenaTarget=112, currentCompletedGeneration=state['currentGeneration'], championGeneration=state['championGeneration'], promotionExecuted=False, modelSha256=frozen['modelSha256'], devPolicyAudit=audit, triRuntimeParity=parity, semanticRowAudit=read(folder / 'semantic-row-byte-audit.json'), isolation=read(DIR / 'phase52-audit/post-evaluation-isolation.json'), preservation=preservation, gatesUnchanged=True, generation4Started=False))
text = f'''# 阶段5.2第3代：原前检通过，112槽正式验收进行中

第3代当前模型已通过全部原开发前检与89状态三端核验，正在进行纯策略56槽+搜索56槽正式配对评测。本报告快照已有{len(completed)}/112槽结果；逐槽实时状态见generations/gen_03/arena/battles。联赛已完成代数仍为{state['currentGeneration']}，冠军仍为第{state['championGeneration']}代，promote(3)须等完整评测后执行。没有启动第4代。

|指标|同口径第0代|当前第3代|
|---|---:|---:|
|dev headTop1|{audit['champion']['headTop1']:.4%}|{audit['student']['headTop1']:.4%}|
|有未移动机会时待机|{audit['champion']['waitWithAnyUnmovedOpportunity']}|{audit['student']['waitWithAnyUnmovedOpportunity']}（门槛≤2）|
|纠错训练集命中|{audit['expert']['championHits']}/8520|{audit['expert']['studentHits']}/8520|

受保护动作头计数、headTop1、待机、纠错显著提升及valueLogits严格零漂移全部通过。纠错命中只证明训练拟合，不称独立泛化；开发前检使用完整34763样本，未降低门槛。请求引用的82.8755%/2来自第2代旧字段，实际冠军同口径为85.1192%/23；本轮保持绝对待机≤2。

最终模型从第一版9534048b分支继续，只拟合what_entity前15行，独立二进制审计通过，其余策略参数与第一版相同，骨干、价值、内置headBias与第0代完全相同。固定表征只在RAM缓存，无稠密特征落盘；完整网络已重新校验。基础池19127条中912条标签被当前先验禁止、799条为机会待机，两类可能重叠；辅助阶段对这些冲突基础标签仅保留冠军KL。新增按动作头最大分数的头CE、机会约束，保持原专家纠错损失，固定20轮62980次语义联合更新。完整身份见semantic-training-complete.json。

前3次尝试90/106/99份文件按SHA保存在training-attempt01-prior-aware、training-attempt02-wait-linear、training-attempt03-joint-policy，所有失败门禁原件保留。最终模型没有继承第2/3次尝试的权重。旧代及另一合同共{preservation['protectedFiles']}份受保护文件变化0项，3份训练归档变化0项。训练/评测完整SHA与规则等价态重叠为0，价值外置校准与动作偏置逐字继承冠军，16/16价值切片继承，无外置父代双前向。

模型SHA：{frozen['modelSha256']}。89状态PyTorch/Node/真实Chrome最大误差0、Profile清理完成。输入冻结收据见ARENA_INPUT_FREEZE.json，候选计划必须匹配当前前检和模型SHA。实战结束后按原promote(3)判定晋升，不按胜负反选训练超参。

同运行时冠军基准及60局采样已经完成；其中已观测的队列峰值、对手超时和少量未完反扑保留在旧收据中，不能据开发前检通过宣称所有工程门禁已通过。完整战报与最终门禁须等112槽结束后更新。公共lint、440测试/20跳过、build通过，阶段tsc及22项Python回归通过。没有修改GUI入口、操作手机或部署。完成第3代后立即停止。
'''
(DIR / 'REPORT.md').write_text(text, encoding='utf-8')
message = '第3代原开发前检全部通过：headTop1=85.3695%、有未移动机会时待机1、纠错训练命中503/8520；89状态三端最大误差0、Profile已清理。112槽正式配对评测正在运行，完成后按原promote(3)判定。已完成代数仍2、冠军仍0，禁止启动第4代。'
for path, marker, end, heading in [(DIR / 'LEAGUE_RESUME_GUIDE.md', '<!-- phase52-precheck-state -->', '<!-- end-phase52-precheck-state -->', '# 双流 v2 联赛续跑'), (current, '<!-- dual-stream-v2-phase52-precheck-20261021 -->', '<!-- end-dual-stream-v2-phase52-precheck-20261021 -->', '# 当前接手状态')]:
    body = path.read_text('utf-8')
    if marker in body:
        start = body.index(marker); finish = body.index(end, start)+len(end); body = body[:start]+marker+'\n'+message+'\n'+end+body[finish:]
    else: body = body.replace(heading, heading+'\n\n'+marker+'\n'+message+'\n'+end, 1)
    body = body.replace('用户已选择保持原门禁继续第3代同代优化。第二次失败模型与收据保全于training-attempt02-wait-linear，正在执行joint-repair-protocol.json；原报告指标仍指第二次模型，112槽由前检守门，第4代禁止启动。', '')
    path.write_text(body, encoding='utf-8')
print(dict(status='formal_arena_running', completed=len(completed), identities=frozen))
