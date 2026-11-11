# R9 首批执行报告

生成时间：2026-10-14T15:03:12.767299+00:00。项目 `C:\code\AncinetEmpires`。

本批已真实执行诊断、训练和严格评测；未达成稳定击败基线，没有模型晋升。该目录是R9的有界先导批，不是整份R9后继大阶段验收。

## 实测结果

- 七图共70对克隆反事实，140条分支；每图10对，68对位于父局前半段。样本优先来自每图先出现的分歧，未覆盖双座位全量，因此不能声称均衡覆盖。原子步上限240、真实玩家换手上限4、每分支软墙钟5秒；外部父进程540秒硬上限。
- 第一批结束类型：`{'handoff_window': 132, 'natural_terminal': 8}`。handoff_window表示诊断窗口结束，不是胜、负或平。
- Swamplands四个已消费槽×三个条件对手随机流，共12对；备选首动作12/12建立城堡与生产，原分支0/12；八换手后备选指挥官12/12阵亡。条件变流不是12个独立新开局。
- 受控训练从同一R8冻结权重初始化，各200更新、同seed/学习率/优化器；控制组学习原动作，纠正组学习取得城堡的目标动作。只有2个独特输入、无独立验证；结果证明这两个输入在现有表示下可以学习，不证明表示普遍充分。
- 训练后纠正组两输入argmax均为目标（2/2），控制组为原动作（2/2），本检查未选投降。两组250个七图冻结fixture前向parity均250/250 argmax一致，最大logit误差分别7.6294e-6、6.6758e-6。

|组别|自然胜/负/截断/错误|四槽步数|
|---|---|---|
|control_original|0/4/0/0|[75, 79, 77, 75]|
|production_target|0/4/0/0|[350, 186, 128, 189]|

所有新对战使用R8冻结worker和未弱化Heuristic、3000步/300秒/1000ms统一预算，完整合法集纯网络argmax；四槽均为已消费Swamplands历史材料，不能作独立验收。存活步数上升不能当胜率提升。

## 正确性、故障与保护

- 164条诊断分支、7066次转移逐步合法重放通过；74个原始同流分支逐步精确复现原轨迹。另八场新模型对局严格重放并核验自然负。
- 69项冻结源/原源/父模型SHA-256在诊断前后及最终核验一致；没有修改公共规则、对手、UI、模型登记及历史权重。新模型写新文件，未覆盖硬链接资产。
- 导出器首版把备选动作字段与分支结果重名，得到-1标签索引；生产组训练被异常阻止。失败控制组200更新及失败数据完整保存在tiny_fit_failed_label_mapping和tiny_samples_failed_label_mapping.json，不能计作有效配对。v2从备选分支首个实际动作恢复标签，TS导出和Python训练入口均拒绝非法索引，重新完成两组400有效更新。
- 本机Codex memories目录无文件；Personal Context服务返回不可用。项目列表、当前源码/报告和实际进程为依据。未发现根或训练区.agents/skills。
- 初始未发现项目训练进程。C盘约49.8GiB、D盘约31.0GiB可用；无需清理，删除0文件。未上传、未推送、未购买资源。

## 停止与下一批入口

两输入纠正可学，但两组四槽均自然负；缺少生产后保全指挥官的经验证决策链和独立家族数据，停止本支线扩量。
先定位纠正组取得城堡后指挥官首次失去安全路线的状态，开展同流战术反事实；以独立新父对局采集生产+安全多步课程，不能继续重复两输入拟合。

WP0全地图双座位随机敏感性、独立DEV/FINAL预登记仍未完成；本批未执行新的FINAL，也没有把旧FINAL重新包装为独立评测。未完成完整R9多轮课程、第二seed和晋升验收。

关键文件：batch_summary.json、results.json、cases.json.gz、robust/results.json、robust/cases.json.gz、verification.json、tiny_fit/results.json、tiny_fit/eval_results.json、tiny_fit/production_events.json、tiny_fit/parity_results.json。两个有效last.json与含优化器/调度/RNG的last.pt在tiny_fit各组目录。

复现：在项目根目录，运行本目录run.mjs或run_robust.mjs前需复制到新输出目录，现有产物使用wx拒绝覆盖；导出与训练使用export_tiny_v2.ts、tiny_fit_v2.py。Python环境为R8的tmp/venv/Scripts/python.exe；依赖/模型身份见manifest及协议。最直接的无新训练核验是 `node --import tsx <本目录>/verify.ts`，也需指定新输出或避免覆盖已存verification。