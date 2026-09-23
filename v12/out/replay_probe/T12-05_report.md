# T12-05 — 旧 episode 归档 verified-replay 试点报告

- 生成时间：2026-09-23T16:41:41.212Z
- 仓库 revision：`9c6c1ab897dd`（脚本直接读 `.git/HEAD`；沙箱禁止创建进程，无法调用 git）
- 归档目录：`C:/code/AncinetEmpires/training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced`
- SD 训练计划：`C:/code/AncinetEmpires/training_configs/sd_training_plan_20260705.json`
- APK 解包目录：`C:/code/AncinetEmpires/APK/_analysis/unpack`
- legacy OpenSSL provider 已启用：是

## 复现命令

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/replay_pilot.ts --target 3 --budget-ms 900000 --seed 20260923 --episode-timeout-ms 600000 --out-dir v12/out/replay
```

两点环境要求（都已在上面命令中体现）：

1. 必须用 `v12/tools/run-tool.mjs`：`v11/tools/run-tool.mjs` 在本环境会被 Vite 的 Windows `net use` 探测
   （`optimizeSafeRealPathSync` → `child_process.exec`）以 `spawn EPERM` 直接打死，v12 runner 就是为该问题准备的行为等价 shim。
2. 必须加 `--openssl-legacy-provider`：`.aem` 地图资源是用 DES 加密的，Node 22 默认 OpenSSL 3 provider 会抛
   `error:0308010C:digital envelope routines::unsupported`，此时所有 episode 都会在"环境构造"阶段失败（本次已复现并归类）。

## 抽样规则

- 分层抽样：按 claimed 行数比例分配（最大余数法），文件内用带种子偏移的等距 stride；处理顺序按 rank 轮转（每个文件各取第 r 个样本），因此预算截断后的样本仍跨变体成比例
- 随机种子：`20260923`
- 目标 episode 数：**3**（归档 11 个文件、claimed 合计 1395 行）
- 实际计划抽样：3 个
- 处理顺序：round-robin by rank, files sorted by name

| 文件 | claimed 行数 | 实测记录数 | 实测物理行 | 抽样数 | stride offset | 选中 lineIndex（0 基） |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `sd-normal-episodes.jsonl` | 400 | 400 | 400 | 1 | 0.969625 | 387 |
| `sd-high-gold-episodes.jsonl` | 100 | 100 | 100 | 0 | 0.838542 |  |
| `sd-low-gold-episodes.jsonl` | 100 | 100 | 100 | 0 | 0.210832 |  |
| `sd-low-unit-limit-episodes.jsonl` | 100 | 100 | 100 | 0 | 0.372792 |  |
| `sd-high-unit-limit-episodes.jsonl` | 100 | 100 | 100 | 0 | 0.723257 |  |
| `sd-3p-normal-extra-episodes.jsonl` | 160 | 160 | 160 | 1 | 0.743305 | 118 |
| `sd-3p-high-gold-extra-episodes.jsonl` | 60 | 60 | 60 | 0 | 0.731564 |  |
| `sd-3p-low-unit-extra-episodes.jsonl` | 60 | 60 | 60 | 0 | 0.461193 |  |
| `sd-4p-normal-extra-episodes.jsonl` | 35 | 35 | 35 | 0 | 0.106597 |  |
| `sd-small-advantage-endgame-episodes.jsonl` | 140 | 140 | 140 | 0 | 0.384238 |  |
| `sd-medium-advantage-endgame-episodes.jsonl` | 140 | 140 | 140 | 1 | 0.258792 | 36 |

实测记录数与 claimed 行数在全部文件上一致（逐文件重新计数，见上表）。

完整逐条清单见 `sd_replay_pilot.json` 的 `summary.samplingRule.allocation[].lineIndexes`、`results`（已跑）与 `notAttempted`（未跑）。

## 聚合结果

| 指标 | 数值 |
| --- | ---: |
| 计划抽样 | 3 |
| 实际尝试（attempted） | **3** |
| PASS | **3** |
| THROW | 0 |
| TIMEOUT（单 episode 墙钟上限 600000ms） | 0 |
| 预算截断未跑（budget-skipped，未验证） | 0 |
| **通过率（PASS / attempted）** | **100.00%** |
| 通过率（PASS / 计划抽样 3） | 100.00% |
| 重放步数（所有 attempt 合计） | 21116 |
| 通过 episode 的重放步数 | 21116 |
| 索引阶段耗时（固定 I/O 成本） | 871 ms |
| 墙钟总耗时 | 125856 ms（2.10 min） |
| 是否触发预算上限 | 否 |

### 按文件分布

| 文件 | attempted | PASS | THROW | TIMEOUT |
| --- | ---: | ---: | ---: | ---: |
| `sd-3p-normal-extra-episodes.jsonl` | 1 | 1 | 0 | 0 |
| `sd-medium-advantage-endgame-episodes.jsonl` | 1 | 1 | 0 | 0 |
| `sd-normal-episodes.jsonl` | 1 | 1 | 0 | 0 |

### 按 plan 分布

| planId | attempted | PASS | THROW/TIMEOUT | 通过 episode 步数 | 通过 episode 总耗时 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `sd-3p-normal-extra` | 1 | 1 | 0 | 2842 | 10052 |
| `sd-medium-advantage-endgame` | 1 | 1 | 0 | 66 | 321 |
| `sd-normal` | 1 | 1 | 0 | 18208 | 114547 |

## 失败原因分类

**本次试点没有出现任何失败样本：THROW = 0，TIMEOUT = 0。**

分类口径：错误类别直接来自 `tools/skirmish_dataset_export.ts` 抛出的消息模式（`ERROR_CATEGORIES` 表），
不是关键词统计的近似值；`other` 表示未能匹配任何已知模式。

## 成本模型

| 指标 | 数值 |
| --- | ---: |
| 每 attempt 平均耗时（含失败） | 41640 ms |
| 每 PASS episode 平均耗时 | 41640 ms |
| 每 PASS episode 耗时中位数 | 10052 ms |
| 每 PASS episode 耗时 min / max | 321 / 114547 ms |
| 每 PASS step 平均耗时 | 5.9159 ms |
| 重放吞吐（PASS 口径） | 169.04 steps/s |
| 重放吞吐（PASS 口径） | 86.5 episodes/hour |
| 一次性索引成本（3.3GB 扫描） | 871 ms |
| **全归档 1395 episode 外推** | **16.14 小时**（约 58087800 ms） |

外推依据（**这是外推，不是实测**）：每 PASS episode 实测平均 41640.0ms × 归档 1395 个 episode。
外推假设：抽样 episode 的耗时分布与全归档一致。若未抽样到的 episode 更长或更短，外推会相应偏移；
`env.reset` 与每步的 observation 构造是主要成本项，而它随对局步数增长，因此步数分布是外推误差的主要来源。

## 验证边界（必须如实阅读）

本次 gate 复用 `tools/skirmish_dataset_export.ts::replayEpisodeDatasetItems`，它检查：

- 初始 observation hash（sha256(JSON.stringify(env.reset(seed).observation))）与 episode 记录一致
- 初始合法动作数一致
- 固定动作空间大小一致
- 每步重放前的 currentPlayer / turn / 合法动作数 / 固定合法动作数 / step 序号连续性
- 每步固定动作索引可解析且其 actionCode 与日志一致
- 每步 env.stepAction 之后的 reward / done / winner 与日志一致

它**没有**检查（因此 PASS 弱于"逐步 state hash 全等"的重放）：

- episode 记录里没有逐步 state hash，因此"中间状态发生偏离但 winner/reward/done/合法动作数恰好相同"的情况无法被发现
- 除初始 reset 之外没有做完整 observation 相等性比较
- 日志中的经济字段（incomeValueByPlayer / spendValue / killValueByPlayer / lostValueByPlayer）从未比较
- info 字符串从未比较
- 未进入重放的 episode（预算截断）完全未验证

结论口径：PASS 表示"初始 observation 完全一致 **且** 每一步的 actionCode/reward/done/winner 与事件流一致"，
**不表示**每一步的完整内部状态逐位一致，也**不表示**日志里的经济字段可复现。

### 反向对照（negative control）：这个 gate 不是空验证

- 对首个抽样 episode 的内存副本做 4 种破坏，确认复用的 gate 真的会抛错（非空验证）
- 全部符合预期：是

| 破坏方式 | 是否抛错 | 观察到的类别 | 期望类别 | 是否符合预期 | 耗时 ms |
| --- | --- | --- | --- | --- | ---: |
| corrupt initialObservationHash | 是 | `initial-observation-hash-mismatch` | `initial-observation-hash-mismatch` | 是 | 8 |
| corrupt steps[0].actionCode | 是 | `step-action-code-mismatch` | `step-action-code-mismatch` | 是 | 2 |
| corrupt steps[0].reward (+1) | 是 | `step-reward-mismatch` | `step-reward-mismatch` | 是 | 5 |
| corrupt steps[0].winnerAfter | 是 | `step-winner-mismatch` | `step-winner-mismatch` | 是 | 4 |

反向对照只在内存副本上进行，`training_runs/episodes/**` 未被写入或修改。

## 环境可重建性（本任务的核心问题）

`scenario.id` 形如 `SDPLAN:<planId>:<mapName>`；`tools/skirmish_dataset_export.ts::createDefaultEnvFactory` 正是这样还原环境的：

1. `parseSdPlanScenarioId(scenario.id)` → `{ planId, mapName }`（纯字符串解析，planId 与地图都来自 `scenario.id`）；
2. `getSdTrainingPlanEntry(config, planId)` 从 `training_configs/sd_training_plan_20260705.json` 取 `setup` 与 `kind`（决定是否走派生局面 `deriveSdTrainingState`）；
3. 地图场景 id `SD:<mapName>` 从 APK 解包目录 `APK/_analysis/unpack` 读加密 `.aem`（需要 legacy OpenSSL provider）；
4. `createSdTrainingGameState(map, scenario, config, plan, episode.seed)` 生成初始状态，`maxPlies` 取自 episode 记录。

**结论（有证据）：仅凭 `scenario.id` 不足以还原环境。** `scenario.id` 唯一确定了 planId 与地图，但
initialGold / unitLimit / levelCap 与"是否派生"这些**决定初始状态**的参数并不在 episode 记录里，
必须来自外部 `sd_training_plan_20260705.json`；地图还必须能从 APK 解包目录解密读出。
因此一条 episode 可重放 = `scenario.id` + `seed` + `maxPlies`（记录内）+ 同版本训练计划 JSON + APK 地图（记录外）。
本次 PASS 同时构成"该外部配置与生成时一致"的间接证据：初始 observation hash 对 setup 变化极其敏感，
若 plan 的 setup 与生成时不同，第一步之前就会以 `initial-observation-hash-mismatch` 抛出（本次已单独验证该门禁会触发，见下）。

逐 episode 的 `planId` / `planKind` / `planSetup` / `mapScenarioId` 已写入 `sd_replay_pilot.json`。

