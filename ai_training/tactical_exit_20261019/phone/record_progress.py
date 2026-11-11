"""如实登记真机前置门禁失败；不将部分进度写成阶段5完成。"""
from pathlib import Path
import datetime
import hashlib
import json

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')
target = HERE / 'revisions/xiaomi_20261020' / ('progress-' + stamp)
target.mkdir()
closeout = HERE / 'revisions/xiaomi_20261020/r24-closeout-20261020T083148408839/CLOSEOUT.json'
index = HERE / 'revisions/xiaomi_20261020/R24_INDEX_RECEIPT-20261020T085402287368.json'
checks = HERE / 'revisions/xiaomi_20261020/local-checks-20261020T084524831125/CHECKS.json'
observation = HERE / 'revisions/xiaomi_20261020/observation-parity-1792457640710/PARITY.json'
phone_reports = [HERE / f'revisions/xiaomi_20261020/{folder}/{session}/SELFCHECK.json' for folder, session in [
    ('phone-r24-v3', 'selfcheck-2026-10-20T00-44-55-794Z'),
    ('phone-r24-v4', 'selfcheck-2026-10-20T00-50-50-732Z'),
]]
reports = [read(file) for file in phone_reports]
assert all(report['passed'] and not report['valueGatePassed'] and not report['rootTargetPassed'] for report in reports)
assert read(closeout)['passed'] and read(index)['passed'] and read(checks)['passed'] and read(observation)['passed']
gate = dict(passed=False, stage='phone_runtime_precondition', device='c2357770', chromeVersion='87.0.4280.141',
            checks=[dict(path=file.relative_to(HERE).as_posix(), sha256=sha(file), functionalParityPassed=report['passed'],
                         valueP95Ms=report['valueLatency']['p95'], rootP95Ms=report['rootLatency']['p95'],
                         valueGatePassed=False, rootTargetPassed=False, foregroundConfirmed=report['foregroundConfirmed'],
                         visibilityViolations=report['visibilityViolations']) for file, report in zip(phone_reports, reports)],
            thresholds=dict(valueP95ExclusiveMs=5, rootTargetP95Ms=500, formalDecisionP95Ms=600, formalRootP95Ms=600),
            formalPhoneTeacherSlots=0, teacherQualified=False, trueExpertGames=0, distillationStarted=False,
            finalAcceptanceSlots=0, reason='真机运行前置速度未通过，禁止解锁后续依赖；不降低阈值，不把自检当作120槽资格验收')
with (target / 'PHONE_PRECONDITION_GATE.json').open('x', encoding='utf-8') as out:
    json.dump(gate, out, ensure_ascii=False, indent=2)
for name in ['TASK_STATE.json', 'ACTIVE_DEVICE_PROTOCOL.json']:
    (target / (name + '.before.snapshot')).write_bytes((HERE / name).read_bytes())
state = dict(status='performance_gate_failed', complete=False, phase='步骤1完成；步骤2真机功能一致性通过、速度前置失败，等待浏览器运行环境选择或继续性能修订',
             teacherQualified=False, stopRecord='revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json',
             r24PcCloseout=closeout.relative_to(HERE).as_posix(), consumedIndexReceipt=index.relative_to(HERE).as_posix(),
             phonePreconditionGate=(target / 'PHONE_PRECONDITION_GATE.json').relative_to(HERE).as_posix(),
             phoneFunctionalChecks=69, phoneTeacherSlots=0, trueSearchExpertGames=0, distillationStarted=False,
             finalPhoneSlots=0, protocol='ACTIVE_DEVICE_PROTOCOL.json')
(HERE / 'TASK_STATE.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
line = '\n2026-10-20 本次接手已完成R24 PC现场strict收尾：85完整槽48533动作、4中断前缀2747动作，共51280实际动作及224334风险见证动作100%通过，原日志/结果/停机SHA保持。排重索引覆盖2877日志、1700891动作、283682不同前态；独立复核本轮49263不同前态遗漏0。小米c2357770实际在线（MI 8 UD、Android10、Chrome87）；用户明确同意经ADB传输冻结资产，并已手动解锁。Chrome87兼容及JSON传输校验修复后，两轮前台69固定决策/107哈希对照均通过；原版Value p95=12.8ms、完整根1405ms，观察分配优化版为11.2/1323.4ms，均未过5/500ms前置。两轮无前后台切换，失败原件及手机CPU profile保留；不因速度失败降阈值或减Top16/24/400。优化版固定1557根、336143实体和192257候选观察逐字节一致，未改变模型、规则或搜索系数。公共lint、379测试、build及两项独立类型通过；9925文件保全missing=0、unexpectedChanged=0。正式教师120槽、真正专家40局、蒸馏、最终Value及160槽均未开始，教师仍不合格、阶段5未完成。详细见REPORT.md、BATTLES.md与' + (target / 'PHONE_PRECONDITION_GATE.json').relative_to(HERE).as_posix() + '。\n'
with (HERE / 'WORKLOG.md').open('a', encoding='utf-8') as out:
    out.write(line)
current = ROOT / 'ai_training/status/CURRENT.md'
before = current.read_bytes()
marker = b'<!-- end-tactical-exit-20261019 -->'
assert before.count(marker) == 1
after = before.replace(marker, line.encode('utf-8') + marker)
current.write_bytes(after)
with (target / 'STATUS_UPDATE.json').open('x', encoding='utf-8') as out:
    json.dump(dict(passed=True, priorTaskStateSha256=sha(target / 'TASK_STATE.json.before.snapshot'),
                   currentTaskStateSha256=sha(HERE / 'TASK_STATE.json'), previousStatusSha256=hashlib.sha256(before).hexdigest(),
                   currentStatusSha256=hashlib.sha256(after).hexdigest(), existingStatusBytesPreserved=True), out, ensure_ascii=False, indent=2)
report_text = '''# 阶段5接手进度：尚未完成

截至2026-10-20，本次完成R24历史现场收尾及小米真机运行器验证。教师资格仍为false，后续专家采样、蒸馏和最终验收尚未解锁。

## 已核验的前置

- 85完整槽48,533动作及4中断前缀2,747动作，共51,280动作，连同224,334风险见证动作全部权威strict通过。原始日志、结果及停机记录SHA保持。
- 专家隔离索引含2,877历史日志、1,700,891动作、283,682不同前态。本轮49,263不同前态全部覆盖，遗漏0；只按输入排重，不导入评测标签。
- 小米c2357770、MI 8 UD、Android10、Chrome87.0.4280.141实际执行。用户明确授权传输并执行，手动解锁后使用屏幕唤醒锁；有效测量全程前台，可见性违规0。
- 两轮各69个固定决策（23状态×3臂）及107个SHA对照通过。比较动作、合法集合、模型输入和搜索风险元数据；数值容差1e-8，logits原始字节哈希仅作诊断。
- 观察分配优化版在固定1557根上，336,143实体记录与192,257候选的完整/空候选观察均逐字节一致，输入原态未改变。此项不构成完整实战或新的三端全梯度验收。

## 真机速度门禁失败

|运行资产|Value p95 / 最大 ms|完整根 p95 / 最大 ms|结论|
|---|---:|---:|---|
|v3 同源原实现|12.8 / 20.6|1405.0 / 1486.0|未过|
|v4 观察分配优化|11.2 / 23.5|1323.4 / 1592.2|未过|

每轮Value230次，完整根为固定24状态、每状态预热1次后测2次，共48次。冻结模型、Top16/24/400、0.8系数与门槛不变。原运行前置Value p95<5ms、完整根p95≤500ms；正式面板全部决策与根决策p95≤600ms、两类超时0及胜场门槛继续保留。

手机CPU profile显示根编码和状态观察/复制有较高成本。v4仅收窄观察投影的复制范围并按完整输入缓存只读观察记录；不是风险或候选裁剪。对照轮次并非随机交替性能试验，数值变化不能单独归因或称足够提速。只读检查省电模式0、大核观测频率2.8032GHz、电池37°C；没有调整电源设置。

## 验证与保全

公共lint、379测试、build、阶段5独立类型及手机模块独立类型通过。PRESERVE的9,925文件missing=0、unexpectedChanged=0；既有授权源码原字节备份保持。训练工作区历史总检查失败仍按前序证据保留，本次未称其通过。

历史PC入口六项拦截回归通过；本次没有新PC对局或优化器训练。Chrome87 Array.at缺失、JSON省略字段误报、最初锁屏测量和ADB短暂超时的原始记录均保留。自动审批曾拒绝资产服务器，随后用户在本会话明确回复允许传输到指定手机并执行，正常权限重试获准。

## 未完成与依赖

正式手机教师资格0/120槽，真正搜索专家0/40局，蒸馏及最终Value未启动，最终验收0/160槽。由于速度前置未过，不能将运行器功能通过写成教师合格或阶段5完成。当前等待用户选择更新Chrome后重测或继续现有运行环境优化；任何新修订必须保留失败证据并重过对应一致性和完整速度前置。
'''
battles_text = '''# 对局收尾与尚未执行的真机验收

阶段5未完成，教师未获资格。本次新真机正式对局0；固定状态推理自检不计为对局。

|现场|槽位|已提交动作|strict|
|---|---:|---:|---|
|R24历史PC完整槽|85|48,533|100%|
|R24历史PC中断前缀|4|2,747|100%|
|合计|89|51,280|100%；另224,334风险见证动作通过|

四中断槽保留user_interrupted_prefix分类，不计为自然负、决策超时或墙钟截断。61未开始PC槽不补跑。原PC结果及计时仅作历史证据，不能替代真机配对面板。

后续教师计划120槽：hierarchical、pure、teacher_search各40槽；每臂固定ApkLikeAI10、HeuristicAI10，扩展HeuristicAI20。最终计划160槽：前两基线与stage5_pure、stage5_search各40。两份原计划SHA保持，没有新Random组。

两轮有效真机运行器测量均未过速度前置，详细原始样本、前台证明与失败门禁见REPORT.md所列证据。不得将69个固定状态检查、24根时延探针或既有PC战绩填入上述120/160槽分母。
'''
for name, text in [('REPORT.md', report_text), ('BATTLES.md', battles_text)]:
    with (HERE / name).open('x', encoding='utf-8') as out:
        out.write(text)
print(json.dumps(dict(complete=False, teacherQualified=False, state='performance_gate_failed', output=target.relative_to(HERE).as_posix()), ensure_ascii=False))
