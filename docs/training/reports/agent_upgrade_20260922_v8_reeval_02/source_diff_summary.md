# V8 S8-1/S8-2 真实源码差异摘要 (Source Diff Summary)

**Run ID**: `agent_upgrade_20260922_v8_reeval_02`
**基准 Commit (HEAD)**: `28f0b847a0ac0147cdb8e096ac7ad9c132e85cb4` (branch `path-b-spatial-ai`)
**远端核查提交**: `251412da8bc7f0733374f8f9b8ad1b5e27c5a241` (= `origin/path-b-spatial-ai`)
**日期**: 2026-09-22

---

## 0. 前置核对结论 (S8-0)

| 命令 | 结果 |
|---|---|
| `git rev-parse --show-toplevel` | `C:/code/AncinetEmpires` |
| `git branch --show-current` | `path-b-spatial-ai` |
| `git rev-parse HEAD` | `28f0b847a0ac0147cdb8e096ac7ad9c132e85cb4` |
| `git worktree list` | `C:/code/AncinetEmpires` (28f0b84), `C:/code/AncinetEmpires/_work` (60e89a5, `codex-v8-work`) |
| `git rev-parse origin/path-b-spatial-ai` | `251412da8bc7f0733374f8f9b8ad1b5e27c5a241` |
| `git log --oneline origin/path-b-spatial-ai..HEAD` | 6 个提交：`2ee9e9f`, `0f35c71`, `109c00d`, `a25b9df`, `2fcbacf`, `28f0b84` |
| `git rev-list --left-right --count 251412d...HEAD` | `0  6` (远端不领先，本地领先 6) |

**结论**：本次远端提交只增加 V8 文档、清理旧文档；本地已包含全部 V8 工程修复。因此本批次**没有覆盖、没有重复实现**已有修复，而是复核并在此之上补齐 V8 明确要求、但当时尚未落地的部分。V8 目录里的说明文档、缩减复现和诊断文本一律未登记为业务修复代码。

---

## 1. 本批次真正修改/新增的文件

`git diff HEAD` 只覆盖下表前三行（业务源码）+ 配置；其余为新增未跟踪文件。

| 文件 | 性质 | 本批次实际变更 |
|---|---|---|
| `tools/v7_heuristic_bounded_search.ts` | 业务源码 | **新增 `BoundedSearchBudget.deterministic`**：该模式下不查询任何墙钟截止时间，节点消耗成为状态与 `maxNodes` 的纯函数。这是 S8-2「固定节点预算下的重放可复核」之前唯一缺失的能力。|
| `tools/v7_unified_evaluation.ts` | 业务/评测主干 | ①新增 `BenchmarkProtocol` 与 `DEFAULT_BENCHMARK_PROTOCOL`，搜索预算不再硬编码，且**逐场写入比赛记录**；②新增 `collectMatchProvenance()` 与 `MatchOutcome.provenance`（commit / dirty / patch hash / node）；③**重招募窗口口径修正**（见 §2）；④`NOT_RUN` 记录补齐新字段；⑤报告顶层写入 `protocol` 与 `provenance`。|
| `tools/v7_cross_language_parity.ts` | 业务源码 | 用既有的 `resolveTorchPython()` 解析解释器，替换硬编码的 `python`。此前 `python` 指向无 torch 的 anaconda，parity 测试**必然失败且与代码无关**。|
| `tools/v8_contract_entrypoints.test.ts` | 新增测试 | R8-01 真实入口契约测试（12 项），见 §3。|
| `tools/v8_run_reeval_02.ts` | 新增工具 | 本批次分阶段实测驱动 + 失败窗口归档。|
| `tools/v8_verify_replay_equality.ts` | 新增工具 | 固定节点预算重放等价性复核。|
| `tools/v8_reeval02_report_numbers.ts` | 新增工具 | 从实测 JSON 计算报告数字，避免手算。|
| `tools/zz_verify_prior_bias.ts` | 新增诊断 | 评审用配对诊断（155 决策点），保留作为归因证据。|
| `tsconfig.json` | 配置 | `exclude` 增加 `_work`（见 §4）。|
| `vite.config.ts` | 配置 | 继承自 reeval_01：`test.exclude` 增加 `_work` / `training_runs`。|
| `tools/v7_cross_language_parity.test.ts`, `tools/v8_p0_defect_exposure.test.ts` | 测试 | 继承自 reeval_01 的超时放宽。**

**明确声明：以下曾被 reeval_01 当作本批成果汇报的内容，实际是用户此前已提交的修复，本批次只是复核，未重写**：

| 内容 | 实际来源提交 |
|---|---|
| Spatial 二参数 `predict` 契约、维度/有限性断言 | `2ee9e9f` |
| NET_A `topIndex`/`bestActionIndex` 与 value-target 门控 | `2ee9e9f` |
| 移除单位数不变停滞截断、独立 PRNG 流、重招募机会由合法动作判定 | `a25b9df` |
| 软/硬墙钟门控与搜索遥测 | `109c00d` |
| split manifest / warm-start / consumed records | `0f35c71` |

（以上六个提交的时间戳为 2026-09-22 03:29:48–03:30:30，早于任何本批次产物。）

---

## 2. 重招募统计口径修正（S8-2 明文要求）

任务书 5.4 要求分别报告 `decisionOpportunityCount`、`recoveryWindowCount`、`recoveryCompletedCount` 及恢复延迟，并明确「不要把同一恢复窗口中的二十次普通单位动作都算二十次独立失败」。

修正前：`recoveryWindowSuccessRate` 与 `rehireRate` 都由同一次「招募合法」的决策计数派生，一个横跨多次决策的恢复窗口会被重复计入分母。

修正后（`tools/v7_unified_evaluation.ts`）：

1. 每次开启新窗口时重置窗口内决策计数器，并累加 `decisionsInCurrentRecoveryWindow`；
2. 新增 `recoveryWindowDurations: number[]`：**已完成的每个恢复窗口实际消耗的决策数**；
3. 新增 `recoveryWindowCompletionRate`：以**窗口**为分母，与以决策机会为分母的 `rehireRate` 分开；
4. 成功判定收紧为「`engine.step()` 之后金币下降 **且** 该座位再次存在存活指挥官」，不再只看金币；
5. 聚合层新增 `meanRecoveryWindowDuration`（已完成窗口的平均决策数）。

实测差异（主阶段 120 场）：

| 策略 | 决策机会 | 招募成功 | rehireRate | 恢复窗口 | 窗口完成 | 窗口完成率 | 平均窗口决策数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| HEURISTIC | 47 | 31 | 66% | 38 | 31 | 81.6% | 1.03 |
| SPATIAL_V2 | 16 | 15 | 93.8% | 15 | 15 | 100% | 1.07 |
| SPATIAL_DAGGER | 18 | 14 | 77.8% | 16 | 14 | 87.5% | 1.14 |
| NET_A | 24 | 1 | 4.2% | 12 | 1 | 8.3% | 2 |
| S00_SEARCH | 15 | 12 | 80% | 13 | 12 | 92.3% | 1.17 |
| S10_SPATIAL_SEARCH | 18 | 14 | 77.8% | 15 | 14 | 93.3% | 1.07 |

注意：窗口数与决策机会数在同一量级，说明本语料下恢复窗口普遍极短（平均约 1 次决策内就完成招募），因此「二十次动作算二十次失败」的偏差在本批数据中并未实际放大。口径修正的价值在于定义正确与可核对，而不是改变了本批结论。

---

## 3. 真实入口契约测试（S8-1）

`tools/v8_contract_entrypoints.test.ts`，12 项，全部通过。使用**真实 checkpoint**（`spatial_resnet_v2_best.json`）与**真实地图初态**，驱动**生产入口本身**，而不是只断言参数个数：

| 用例 | 断言 |
|---|---|
| R8-01-ENTRY-A | 同一 fixture 上，直接 `predict`、`PolicyAgent`、S10 候选过滤、DAgger `predictStudentAction` 四者选出**同一个动作**；该动作就是模型打分最高者 |
| R8-01-ENTRY-B | 两座位下 logits/probs 全部有限、索引合法、最终动作属于**真实合法动作集** |
| R8-01-ENTRY-C | 覆盖 >20 候选的 fixture（并断言确实取到了 >20 的集合，否则测试失败） |
| R8-01-ENTRY-D | 候选置换下 logits 按同一置换对应，argmax 稳定 |
| R8-01-ENTRY-E | 真实 pending 状态（若该 fixture 预算内可达）下各入口均可决策 |
| R8-01-ENTRY-F | 缺模型抛 `MODEL_LOAD_ERROR`，不回退 `legal[0]` |
| R8-01-ENTRY-G | checkpoint 不存在 → 逐场记录 `NOT_RUN`，`actualPolicy=NOT_RUN`，步数 0 |
| R8-01-ENTRY-H | checkpoint 存在但损坏 → `MODEL_LOAD_ERROR`，与 `NOT_RUN` **明确区分** |
| R8-01-NETA-A/B | 无 value 标签（`null`）batch 在 `valueWeight=0` 下 loss/权重/梯度全部有限；`undefined` 被显式拒收或规范化，二者都不允许静默 NaN |
| R8-01-NETA-C/D | 真实 NET_A checkpoint 返回 `topIndex`/`bestActionIndex`、logits 有限；全 null batch 不产生 NaN |

**诚实记录**：ENTRY-E 只在 fixture 预算内可达真实 pending 时执行；若不可达它会直接返回（不伪造通过）。实际运行中未取到 pending fixture，故 pending 路径在本批**未被真正覆盖**，仍属未完成项（见 NEXT_ACTION.md）。

---

## 4. 类型检查与 `_work` 排除的说明（不得掩盖错误）

- 命令：`node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`（`npm run lint` 调用的同一 tsc；此处走编译器 JS 入口是因为 `.cmd` shim 在本机会吞掉参数）。
- 结果：**exit code 0，0 错误，0 警告**。未新增任何 `any` / `@ts-ignore` / `@ts-expect-error`，未排除任何业务源文件。
- `_work` 排除的正当性（已实测，不是猜测）：
  1. `_work` 是一个**独立的 git worktree**（分支 `codex-v8-work`），并且已被 `.git/info/exclude` 忽略，不属于本仓库跟踪树；
  2. 移除该排除后 tsc 报 **27 个错误，全部位于 `_work/training_runs/preflight_20260918/deployed-source/APK/_analysis/unpack/...`，全部为 `TS1490 File appears to be binary`**（解包后的 APK 产物），**非 `_work` 下的错误数为 0**；
  3. 即 `_work` 内的业务源码副本没有产生任何类型错误，排除它只是阻止 tsc 扫描外部 worktree 的二进制产物。

---

## 5. 修复的历史归档完整性问题（附带发现）

上一批次把连通性 pilot 写进了**受保护的历史归档目录** `docs/training/reports/agent_upgrade_20260921_v7_01/`，导致 `tools/v8_directory_guard.test.ts` 的 R8-Guard-A/B 变红，而上一批次只跑了 3 个测试文件，因此没有发现。

处理：该文件被**移动**（不是删除）到 `training_runs/agent_upgrade_20260922_v8_reeval_01/pilot_corrected_v7_rerun.json`，历史归档恢复为恰好 5 个基线文件、`git status` 干净。现在 R8-Guard-A/B 通过。

---

## 6. 方法学更正：墙钟延迟不属于可复现指纹

驱动脚本第一版的「固定节点预算重放」比对把 `decisionLatencies` 计入指纹，因而报告 `identical=false`。这是**测量定义错误**，不是实现问题：延迟是 `performance.now()` 的墙钟测量，天然不可复现。

按**仅博弈与搜索投入**的指纹（terminationReason / steps / turns / 双方终局单位 / searchTotalNodes / candidatesEvaluated / shallowEvaluations / fallback / actualPolicy）复核两次独立运行：**4/4 场完全一致，0 处不匹配**；只有墙钟延迟不同（平均绝对差 12.7–27.1ms，最大 173.8ms）。报告见 `deterministic_replay_equality.json`。
