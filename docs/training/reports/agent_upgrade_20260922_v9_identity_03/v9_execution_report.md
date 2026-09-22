# V9 收尾修复执行报告 (run 03)

**Run ID**: agent_upgrade_20260922_v9_identity_03
**基准提交**: e95b65366186dc55482d5db77346936aaf255ae6 (path-b-spatial-ai)
**日期**: 2026-09-22
**平台**: win32 | Node v22.18.0 | Python 3.12 | torch 2.14.0+cpu | PyTorch CPU

本报告只记录本轮实际执行与实测数字。所有数字均可由 source_snapshot.json 中的工件 SHA 与下列命令复现。

---

## 1. 本轮修复项与实测结果

### R1 D10：用真实规模数据替换名不副实的 10k 标签

问题：上一轮 learning_curves.json 写 "10k unique state baseline training (D10)"，但 sampleCount = 7832；
scale_benchmark.json 的 scale_10000.datasetSize = 10000 是字面量，与真实数据集不符。

本轮动作：
1. 真实生成更大数据集并训练（new runId）：
   node --experimental-loader ./.codex_runner/ts-loader.mjs tools/v7_training_pipeline.ts --run-id agent_upgrade_20260922_v9_identity_03 --limit 22000 --epochs 8
2. 修改 tools/v9_compile_training_scale_report.ts：
   - D10 的 description / datasetUniqueStates / trainPartitionStates / valPartitionStates 全部从
     split_manifest.json、dataset_accounting.json、d10_metrics.json 动态读取；
   - scale 档位键名改为动态 scale_<真实唯一状态数>，删除 10000 字面量；
   - 30k 档位改为 targetStates: 30000 + datasetSize: null + status NOT_RUN；
   - 历史 7832 基线改为固定读取 v8_final_01 自身指标，避免被本轮数据顶替。

实测：
- 唯一状态 16,231（训练分区 11,011 / 验证 5,220），总仿真步数 41,813；
- learning_curves.json 中该档描述为 "D16.2k baseline training (real 32ch/2-block policy-only run)"，
  datasetUniqueStates = 16231，trainPartitionStates = 11011；
- 训练分区 11,011 >= 10,000，满足 V9-07 对训练分区唯一状态数的口径要求；
- scale_benchmark 档位为 scale_64 / scale_7832 / scale_16231 / scale_30000(NOT_RUN)，无 10000 字面量。

训练实测（真实 PyTorch，8 epochs，best/last 分别保存）：
- epoch 1: train_acc 0.3395 / val_acc 0.4370；epoch 4 (best): val_acc 0.4860；
- epoch 8: train_acc 0.5923 / val_acc 0.4785；best_val_acc = 0.48602 @ epoch 4。

### R2 先验消融：根因修复 + 重写为可判别指标

根因：runPriorAblation 中 `if (engine.getState().winner !== undefined) break;` 在初始状态
winner === null 时即为真，导致**从未推进任何原子步**，此前所有消融状态都是同一个 turn-1 开局，
因此三臂一致率恒为 1.0。

修复：
- 改用 engine.isTerminal()；
- 状态覆盖扩到 5 张图 x 2 座位 x 5 个步进量程 [12, 48, 96, 160, 240]，实测 40 个状态、turn 1..12；
- 输出拆分为：候选集差异率、固定节点决策差异率、置零/置乱并列排序规则、真实先验改变决策的状态占比；
- 固定节点（deterministic）与真实墙钟两臂分开记录；写明 honestLimits。

实测（40 状态，20 节点固定预算）：
- 候选集与 S10_TRUE 不同的状态占比：S00 75.0%、S10_DISABLED 72.5%、S10_SHUFFLED 72.5%；
- 平均 Jaccard：S00 0.8187、Disabled 0.7664、Shuffled 0.7715；
- 决策改变率：S00 vs TRUE 5.0%、Disabled vs TRUE 0.0%、Shuffled vs TRUE 5.0%；
- verdict = PRIOR_CHANGES_DECISIONS_ON_AT_LEAST_ONE_STATE。

诚实结论：在这批状态与 20 节点预算下，空间先验改变了候选集（约 72% 状态），但只在 5% 状态改变最终 argmax；
不得据此宣称先验提升棋力。该结论已写入 prior_ablation.json 的 honestLimits 与 verdict。

### R3 教师资格：按证据降级

问题：teacher_qualification.json 仅 2 个手工场景（其中一个选择动作 score = -307 仍判 pass），
却输出 teacherQualifiedForTraining: true。

修复：改为必须提供真实冻结开发对局证据（>=100 配对根对局且正向差值区间），否则
teacherQualifiedForTraining: false / NOT_QUALIFIED_INSUFFICIENT_EVIDENCE。

实测：读取 identity_01 开发矩阵（5 图 x 2 座位 x 2 种子，每臂 20 场）：
- S00：7 胜 / 7 负 / 6 截断，W/N = 35%；
- Heuristic：6 胜 / 6 负 / 8 截断，W/N = 30%；
- delta(W/N) = +5 个百分点，但 n=20 不显著；
- verdict = NOT_QUALIFIED_INSUFFICIENT_EVIDENCE，labelPolicy = 保留 Heuristic 基础标签。

---

## 2. 继承自上一轮并已复核通过的修复

- V9-02 Worker：cancellable_ai_runner.ts 浏览器路径使用真实 Web Worker，超时/取消/过期时调用 terminate()；
  play.ts 与 App.tsx 透传 stateVersion 与 getCurrentStateVersion；CANCELLED/STALE 不落子。
  浏览器 E2E 因无 Playwright/Puppeteer 标 NOT_RUN，Node 数值单独记录，未冒充浏览器延迟。
- V9-04 配额：v7_heuristic_bounded_search.ts 采用 heuristicTop -> tactical -> heuristicFill -> spatial(剩余额度)，
  非 top1 启发式配额不再被挤空。
- V9-00 工件：artifact_availability.json 22/22，sizeBytes 与 SHA-256 全部与实际文件一致（本轮重新生成为 22 项）。
- V9-05/V9-06：hash_audit 8/8 维度；sampling_coverage 64/64 组合、0 根碰撞；
  split_audit 对 run 03 新分区验证：0 泄露、Duel 与 Liberty Port 训练根为 0、验证覆盖两图。

---

## 3. 本轮实际执行的命令与退出码

| 步骤 | 命令 | 结果 |
|---|---|---|
| 数据集+训练 | node --experimental-loader ./.codex_runner/ts-loader.mjs tools/v7_training_pipeline.ts --run-id ..._03 --limit 22000 --epochs 8 | 完成 spatioal v2 训练；NET_A 被 shell 重置中断后重跑 |
| NET_A 补跑 | node --experimental-loader ./.codex_runner/ts-loader.mjs <temp script> 调用真实导出函数 trainV7NetAControl | 退出码 0，Train 11011 / Val 5220 |
| 过拟合归档 | RUN_ID=... node ... tools/v9_archive_overfit_verification.ts | 退出码 0，train_acc 100% / best val 62.5% |
| 数据审计 | RUN_ID=... node ... tools/v9_audit_sampling_and_split.ts | 退出码 0，写出 hash/sampling/split/accounting 四份 |
| 搜索与教师 | RUN_ID=... node ... tools/v9_benchmark_search.ts | 退出码 0，三份 |
| 先验消融 | RUN_ID=... node ... tools/v9_run_reeval_01.ts --ablation-only | 退出码 0，40 状态 |
| 报告编译 | RUN_ID=... node ... tools/v9_compile_training_scale_report.ts | 退出码 0，四份 |
| 工件可用性 | RUN_ID=... node ... tools/v9_refresh_artifact_availability.ts | 退出码 0，22/22 |
| 单元测试 | npx vitest run（6 个 v9 测试文件） | 30/30 通过 |
| 类型检查 | npx tsc --noEmit | 退出码 0 |

---

## 4. 关键数字汇总

| 项目 | 数值 |
|---|---|
| 唯一状态（本轮数据集） | 16,231 |
| 训练分区唯一状态 | 11,011 |
| 验证分区唯一状态 | 5,220 |
| 根家族 | 训练 75 / 验证 44（共 119） |
| 数据自洽 | 11011 + 5220 = 16231 <= 16231 <= 41813，MATHEMATICALLY_SELF_CONSISTENT |
| D10 归档模型 best | f4c8f14b5953cb6e... (sha256 前缀) |
| D10 归档模型 last | cce536bd705871e0... (sha256 前缀) |
| best_val_acc / epoch | 0.48602 / 4 |
| 64 样本过拟合 | train_acc 100.0%，best val 62.5% @ epoch 4 |
| 消融 | 40 状态；候选集差异 72.5%~75%；决策改变 0%~5% |
| 搜索覆盖 | 60 决策 / 246 候选；交接率 64.2%；对手攻击覆盖 13.8% |
| 教师资格 | NOT_QUALIFIED_INSUFFICIENT_EVIDENCE |
| 工件可用性 | 22/22 ALL_VERIFIED |
| 测试 / 类型 | 30/30 通过；tsc 0 错误 |

---

## 5. 未完成与明确限制

- V9-08（对照 DAgger）、V9-09（2 vs 4 块/价值标签）未执行，标 NOT_RUN，无伪造数据。
- V9-10 确认评测（>=100 配对根对局）未执行；本轮 80 场矩阵仍属 identity_01 的开发诊断规模。
- 浏览器端到端验收 NOT_RUN（环境无 Playwright/Puppeteer）；node_runtime_benchmark 与浏览器口径分开保存。
- 对手攻击覆盖 oppAttackCoveredRate = 13.8%，仍偏低；尚未补 (对手第二个攻击更致命)(移动后才出现攻击) 两个 fixture。
- D10 命名口径：本 run 的 D 数字取真实唯一状态数（D16.2k），训练分区 11,011 满足 10,000 门槛；
  与历史名称 "10k pilot"（实际 7,832）明确区分。
- 本 run 只训练了单一种子（seed 42），未做多种子稳定性检查。

---

## 6. 复现要点

- 数据集 SHA-256：见 training_runs/agent_upgrade_20260922_v9_identity_03/source_snapshot.json
- 所有参评权重 SHA：同文件 trainedArtifacts 段
- 未跟踪的 v9_*.ts 工具源码各自 SHA 亦记录在 source_snapshot.json（trackedDiffSha256 只覆盖已跟踪文件的修改）

---

## 7. V9-04 追加修复：对手回应改为"最危险的可验证回应"

问题：原实现在对手回合取 `oppActions.find(a => a.type === 'attack')`，即第一条合法攻击，
且一旦攻击立即 break，无法覆盖 move-then-attack 序列，也无法比较多个攻击的威胁。

修复（tools/v7_heuristic_bounded_search.ts）：
- 首个回应步改为对最多 8 个候选（攻击优先，其余按合法顺序）做浅探针，用同一叶评价
  evaluatePositionHeuristic(probe, rootPlayer) 选出让己方最不利的动作；探针次数记录在
  trace.opponentProbeEvaluations，不与树节点混算，固定节点与墙钟口径保持分离。
- trace 新增 opponentChosenAction（首步）、opponentPrimaryRule、oppAttackAvailable，
  使是否取第一条攻击、当时是否存在合法攻击都可被直接验证。
- 后续步保持既有规则（有攻击取攻击，否则启发式），因此 move 后再 attack 的序列可被覆盖。

新增/重写 fixture（tools/v9_search_qualification.test.ts，该文件 7 项测试全部通过）：
- V9-04-C 重写：原断言把弓手死角当成致命区（弓手 minRange=2、maxRange=3，距离 1 无法攻击），
  现改为按 UNIT_CONFIGS 实时判定攻击包线：所选移动不得落入 [minRange, maxRange]，
  且落入包线的候选分数必须低于最优（证明被评估后否决）。
- V9-04-E：己方待行动单位超过 4 个时，搜索不得谎报回合交接（所有 trace turnHandover=false
  且 opponentSteps=0）。
- V9-04-F：两个敌人按单位顺序排列（弱攻击在前），对手首步必须选择对指挥官致命的那次攻击，
  而不是第一条合法攻击。
- V9-04-G：交接时不存在合法攻击（弓手距离 4），对手必须通过先移动再攻击完成回应。

搜索覆盖口径（search_coverage.json 已扩展，避免单一比例误导）：
- 60 个决策 / 247 个候选；交接率 63.2%；
- 到达对手的 156 个候选中，仅 19.2% 当时存在合法攻击，21.8% 最终发生攻击；
- 因此 13.8% 的全候选口径受接触局面比例限制，不能单独当作回应质量指标。

注意：identity_01 的 80 场开发矩阵是在此次对手回应修改之前跑的，其数值不用于评价本次改动；
本轮只声明代码、fixture 与 trace 级证据，未宣称棋力提升。
