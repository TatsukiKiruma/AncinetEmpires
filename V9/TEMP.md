# V9 收尾修复执行总结 (agent_upgrade_20260922_v9_identity_03)

完整报告：docs/training/reports/agent_upgrade_20260922_v9_identity_03/v9_execution_report.md
上一轮报告原文保留为：V9/TEMP_run02.md

本轮针对独立复核发现的四处硬伤做了修复，全部结论均由真实运行产生。

## 一、修复项

### R1 D10 名不副实 -> 真实规模数据与动态口径
- 真实生成并训练：16,231 唯一状态；训练分区 11,011（>= 10,000），验证 5,220；根家族 75/44。
- tools/v9_compile_training_scale_report.ts 已改为从 split_manifest / dataset_accounting / d10_metrics
  动态读取：描述为 D16.2k，datasetUniqueStates=16231，trainPartitionStates=11011。
- scale_benchmark 档位改为动态 scale_16231；30k 档为 targetStates=30000 + datasetSize=null + NOT_RUN。
- 历史 7832 基线改回固定读取 v8_final_01 自身指标，不再被本轮模型顶替。
- 真实训练：8 epochs，best val 48.60% @ epoch 4，last train acc 59.23%；best/last 分离保存。

### R2 先验消融退化 -> 根因修复 + 可判别指标
- 根因：winner !== undefined 在 winner === null 时即成立，导致状态从未推进，三臂恒等。
- 已改用 engine.isTerminal()，覆盖 5 图 x 2 座位 x 5 步进量程 = 40 状态，turn 1..12。
- 实测：候选集与真先验不同的状态占 72.5%~75%；决策改变率 0%~5%。
- verdict = PRIOR_CHANGES_DECISIONS_ON_AT_LEAST_ONE_STATE，并在工件中写明 honestLimits：
  不得据此宣称先验提升棋力。

### R3 教师资格 -> 按证据降级
- 改为必须有 >=100 配对根对局的正向差值区间才可 QUALIFIED。
- 现有证据：S00 7W/7L/6T（W/N 35%）vs Heuristic 6W/6L/8T（W/N 30%），n=20 不显著。
- 结论：teacherQualifiedForTraining=false，NOT_QUALIFIED_INSUFFICIENT_EVIDENCE，
  保留 Heuristic 基础标签。

## 二、继承并已复核的修复
- V9-02 真实 Web Worker + terminate 抢占 + stateVersion 全链路；浏览器 E2E 诚实标 NOT_RUN。
- V9-04 配额保底顺序（heuristicFill 先于 spatial，spatial 只用剩余额度）。
- V9-00 artifact_availability 22/22，size 与 SHA 全部与文件一致。
- V9-05/V9-06 hash_audit 8/8、sampling 64/64、run-03 新分区 0 泄露且验证覆盖 Duel/Liberty。

## 三、实测数字
| 项目 | 数值 |
|---|---|
| 唯一状态 / 训练 / 验证 | 16,231 / 11,011 / 5,220 |
| D10 best_val_acc @ epoch | 0.48602 @ 4 |
| 64 样本过拟合 | train_acc 100%，best val 62.5% @ epoch 4 |
| 消融（40 状态） | 候选集差异 72.5%~75%；决策改变 0%~5% |
| 搜索覆盖 | 60 决策 / 246 候选；交接 64.2%；对手攻击 13.8% |
| 教师资格 | NOT_QUALIFIED_INSUFFICIENT_EVIDENCE |
| 工件可用性 | 22/22 ALL_VERIFIED |
| 测试 / 类型 | 30/30 通过；tsc 0 错误 |
| 数据自洽 | 11011 + 5220 = 16231 <= 16231 <= 41813 |

## 四、明确未完成 / 限制
- V9-08 / V9-09 / V9-10 标 NOT_RUN，未伪造。
- 浏览器端到端验收 NOT_RUN（环境无 Playwright/Puppeteer）。
- 对手攻击覆盖 13.8% 偏低，两个回应 fixture 未补。
- 仅单训练种子（seed 42），未做多种子稳定性。
- run-03 provenance 记录在 source_snapshot.json（trackedDiffSha256 只覆盖已跟踪文件；
  未跟踪的 v9_*.ts 工具逐个记录 SHA）。

## 五、本轮追加（V9-04 对手回应质量）

问题：搜索在对手回合取"第一条合法攻击"并立即 break，既不能比较多个攻击的威胁，也无法覆盖
move-then-attack 序列；同时对手攻击覆盖率 13.8% 缺少口径解释。

已完成：
- tools/v7_heuristic_bounded_search.ts：对手首步改为对最多 8 个候选做浅探针（攻击优先），
  以同一叶评价选出对己方最不利的回应；探针次数单列记录，不与树节点混算。
- trace 新增 opponentChosenAction / opponentPrimaryRule / oppAttackAvailable，
  使"是否取了第一条攻击""当时是否存在合法攻击"可被直接验证。
- tools/v9_search_qualification.test.ts 由 4 项扩到 7 项：重写 V9-04-C（按 UNIT_CONFIGS
  实时判定攻击包线，替换原先把弓手死角当致命区的错误断言），新增 V9-04-E（>4 待行动不谎报
  回合交接）、V9-04-F（弱攻击在前的单位顺序下仍必须选择对指挥官致命的攻击）、
  V9-04-G（交接时无合法攻击，必须 move 后再 attack）。
- tools/v9_benchmark_search.ts：search_coverage 增加 of-reached 口径与 breakdown。

实测：6 个测试文件 33/33 通过；tsc 退出码 0。搜索覆盖：60 决策 / 247 候选，交接率 63.2%；
到达对手的 156 个候选中 19.2% 存在合法攻击、21.8% 发生攻击（全候选口径 13.8% 受接触局面
比例限制，不能单独作为回应质量指标）。

限制：identity_01 的 80 场矩阵早于本次对手回应改动，未据此宣称棋力提升；未重跑 80 场矩阵。

## 六、run 04：更强对手模型下的 80 场 A/B（矩阵重跑）

目的：隔离验证"对手回应改为最危险可验证回应"这一处改动的影响。
做法：冻结与 identity_01 完全相同的权重（1721ca17，逐字节一致），用可续跑驱动调用真实评测套件，
重跑 5 图 x 2 座位 x 2 种子 x 4 臂 = 80 场，全部完成，80 份轨迹落盘。

有效性校验：不使用搜索的两个臂在两次运行中逐场 100% 一致（HEURISTIC 20/20、SPATIAL_V2 20/20），
证明差异只来自搜索侧。

| 臂 | 旧 W/L/T（W/N） | 新 W/L/T（W/N，95% CI） |
|---|---|---|
| HEURISTIC | 6/6/8（30%） | 6/6/8（30% [14.5,51.9]） |
| SPATIAL_V2 | 2/13/5（10%） | 2/13/5（10% [2.8,30.1]） |
| S00_SEARCH | 7/7/6（35%） | 6/7/7（30% [14.5,51.9]） |
| S10_SPATIAL_SEARCH | 9/6/5（45%） | 5/7/8（25% [11.2,46.9]） |

结论：上一轮"S10 四臂最高"不能维持 —— 在更强对手回应下 S10 从 45% 降到 25%，低于 HEURISTIC/S00 的 30%；
S00 从 35% 降到 30%。即此前的部分优势来自弱对手模型（只取第一条合法攻击）造成的假象。
n=20/臂、区间高度重叠，本轮仍只作开发诊断，不构成棋力结论。两个搜索臂在 20 场中均出现软预算
（200ms）超限，硬上限 900ms 未破（p99 < 360ms，max < 650ms）。

报告：docs/training/reports/agent_upgrade_20260922_v9_identity_04/ab_matrix_report.md
未做：未对 run 03 的 D16.2k 权重跑同一矩阵；未做 100 场/臂确认矩阵。
