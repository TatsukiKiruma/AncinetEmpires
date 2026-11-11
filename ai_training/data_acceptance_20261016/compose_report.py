"""仅在原生和真实验收均完成后生成交付报告；不启动训练或任何新对局。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PHONE = HERE/'phone'
def read(file):
    return json.loads(file.read_text(encoding='utf8'))

releases = sorted(p for p in PHONE.glob('release-*') if p.is_dir() and not p.name.endswith('.partial'))
if not releases:
    raise RuntimeError('原生最终release尚未发布，不能生成完成报告')
release = releases[-1]
native = read(release/'summary.json')
real = read(HERE/'replay/final-summary.json')
endpoint = read(PHONE/'endpoints/audit-summary.json')
families = read(HERE/'replay/families.json')
validation = read(HERE/'validation-summary.json')
if not native['finalRelease'] or not native['allRequestedProcessed'] or native['processedSegments'] != 5012:
    raise RuntimeError('原生逐段验收仍未完成')
if real['completeReceipts'] != 257 or not (HERE/'replay/EVIDENCE_MANIFEST.json').exists() or not validation['passed']:
    raise RuntimeError('真实回放封存或最终检查尚未完成')
manifest = read(release/'manifest.json')
for name, digest in manifest['artifacts'].items():
    if hashlib.sha256((release/name).read_bytes()).hexdigest() != digest:
        raise RuntimeError('最终原生release内容发生变化')
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
logical = sum(p.stat().st_size for p in HERE.rglob('*') if p.is_file())
free = shutil.disk_usage(ROOT).free
parent_rows = [json.loads(s) for s in (release/'parent-acceptance.jsonl').read_text(encoding='utf8').splitlines()]
report = {'completedAt': now, 'scope': '全部固定来源已产生验收结论，所有合格来源归train；不表示全部宏动作通过',
          'nativeRelease': str(release.relative_to(HERE)).replace('\\', '/'), 'native': native,
          'real': {k: v for k, v in real.items() if k not in ('sourceAdmission', 'actions', 'macroEvents', 'actorClasses', 'controllers')},
          'rawEndpointAndLineageAccepted': endpoint['allEndpointsAndLinksAccepted'],
          'nativeQuarantinedMacroTail': sum(p['quarantinedMacroTail'] for p in parent_rows),
          'trainingStarted': False, 'evaluationGamesGenerated': 0, 'phoneControlsTouched': False,
          'modelSchemaAccepted': False, 'returnEligible': False, 'existingDataHoldout': 0,
          'newDirectoryLogicalBytesBeforeReport': logical, 'cFreeBytesAtReport': free,
          'nativeConfiguredPlayers': {'2': 1944, '3': 528, '4': 528}, 'validation': validation}
(HERE/'FINAL_ACCEPTANCE.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
n2 = native['firstProductTwoPlayerSD']
r2 = real['firstProductTwoPlayerSD']
text = f'''# 数据转换、合法性与标签验收结果

完成时间：{now}。本轮固定来源均已产生验收结论，全部合格来源登记为训练用途；现有数据留出比例为0。独立评测另备[新父局协议](INDEPENDENT_EVAL_PROTOCOL.md)，本轮没有生成新评测局，也没有启动训练或操作手机采集。首产品范围为双人SD、当前电脑浏览器。

## 覆盖与结论

原生截止2026-10-16 00:17:30 +08:00、第39轮：3000父局加2012续段，共8,132,273宏动作。端点、原始动作序号/种子、逐字节续跑链5012段全部通过；2953父局自然终局、1局确认循环停止、46局在截止点未结束。后续手机采集不追入本轮。

|来源|验收覆盖|当前合格policy原子标签|当前合格自然结果原子标签|
|---|---|---:|---:|
|原生固定快照|5012/5012段：{native['fullSegments']}完整通过，{native['prefixSegments']}仅前缀通过，{native['zeroSegments']}零通过|{native['policyLabelAtoms']:,}|{native['valueLabelAtoms']:,}|
|真实抓取|270路径、257唯一响应：{real['acceptedGames']}通过、{real['rejectedGames']}隔离|{real['acceptedPolicyRows']:,}|0|

原生有{native['policyLabelParents']}个父局包含合格policy记录，合格宏步共{native['policyLabelMacros']:,}；{native['fullyStrictParents']}个父局的全部已采集段完整通过，其中{native['valueEligibleParents']}个父局满足本轮自然结果标签门槛。续段不增加独立父局数。每段在首个分歧处截止，失败宏步整组撤回；合计{report['nativeQuarantinedMacroTail']:,}条宏动作尾部隔离，不能将这些未继续重放的尾部全部称为已证实错误。

原生实际启用2/3/4队为1944/528/528，源地图人数为1008/840/1152；按实际配置分桶。700局属于人工残局，另有860局其他预设状态，正常/参数变体1440局，均保留计划和来源身份。

首个双人SD桶当前包含原生{n2['parents']}个有合格记录的父局、{n2['atoms']:,}条policy原子标签；真实{r2['policySources']}份有合格记录的响应、{r2['policyRows']:,}条policy标签。其他人数/SO合格桶也归训练用途，后续按各自模型合同使用，不混淆首产品验收分母。

## 标签与隔离边界

原生赢家h已按联盟编号与唯一存活联盟核验；目标按行动者实际联盟给±1，不逐原子动作翻符号。只有自然终局且整父链strict通过的父局放行本轮结果标签。未完、循环停止或任一段转移失败的父局value保持mask；return全部关闭。宏动作展开标签来源为native_macro_commitment，每个宏步展开权重合计1，不冒充独立原生查询。

原生主要隔离原因见[分歧台账](phone/failure-diagnosis.json)：{json.dumps(native['failureCategories'], ensure_ascii=False)}。原始归档与端点证据继续保存，本轮没有为通过单个样本修改公共规则。

真实隔离项及原始SHA见[真实最终汇总](replay/final-summary.json)。投降行全部屏蔽policy/value/return；{real['pureSurrenderSourceGames']}份纯投降来源保留溯源，正常前缀按索引使用；屏蔽投降行{real['maskedSurrenderRows']}条。真实value/return均关闭，不从CLOSED或TS重建胜者制造原生胜负标签。

## 证据强度与下一步边界

原生逐宏步比较原生快照投影与连续TS状态的受限规则语义，并比较两种构造的完整TS合法候选集合；这不是原生Java候选oracle验证。非当前玩家行动资源的规范化也不是网络观察完全相等。真实响应只具备初态加动作的TS strict重建证据，没有逐步原生中间快照比较。

所有具体网络的modelSchemaAccepted仍为false；来源标签通过不能自动成为旧34通道网络的输入验收。后续在选定网络合同后核对编码、候选特征及TS/Python/浏览器前向，本轮训练次数为0。

原生采用actionCode-codepoint-asc-v1，真实采用engine-order-legacy；两类索引不能直接混拼。训练适配器须按动作码重映射到具体网络的候选顺序，并重算候选特征与摘要。完整来源合同见[SOURCE_SCHEMA_CONTRACTS.json](SOURCE_SCHEMA_CONTRACTS.json)，没有改写已封存真实回放。

真实{families['apiMappedResponses']}份响应由下载报告和实际API请求代码绑定到{families['identifiedApiFamilies']}个API标识组，{families['unknownApiFamilyResponses']}份的API家族映射未知。独立对局数未证实；唯一响应、API标识组与统计独立完整对局分开。见[来源家族侧车](replay/families.json)。

## 交付与磁盘

- [原生最终release]({release.relative_to(HERE).as_posix()}/summary.json)、[逐父局验收]({release.relative_to(HERE).as_posix()}/parent-acceptance.jsonl)、[用途索引]({release.relative_to(HERE).as_posix()}/release-index.jsonl)。
- [真实用途索引](replay/policy-release-index.json)、[全量分片完整性](replay/integrity-report.json)、[封存SHA清单](replay/EVIDENCE_MANIFEST.json)。
- [修订方案](PLAN.md)、[机器验收合同](ACCEPTANCE_PROTOCOL.json)、[最终汇总](FINAL_ACCEPTANCE.json)。

报告生成前本轮目录逻辑文件量约{logical/1024**2:.1f}MiB，C盘空闲约{free/1024**3:.2f}GiB。未导出全量dense张量，未复制约5.99GB源归档；大分片用路径引用合并。保持本轮1.25GiB新增预算与C盘12GiB水位。工具会话中断后的临时产物和失效锁均留存SHA与恢复记录，未删除历史数据。

检查结果见[验证汇总](validation-summary.json)。最终交付内容SHA见DELIVERY_MANIFEST.json；本报告不登记新模型、不启动训练、不生成新评测成绩。
'''
(HERE/'REPORT.md').write_text(text, encoding='utf8')
print(json.dumps({'report': str(HERE/'REPORT.md'), 'nativePolicyAtoms': native['policyLabelAtoms'],
                  'realPolicyAtoms': real['acceptedPolicyRows'], 'logicalMiB': logical/1024**2,
                  'cFreeGiB': free/1024**3}, ensure_ascii=False))
