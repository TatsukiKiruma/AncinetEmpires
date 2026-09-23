# T12-05 — 旧 episode 归档 verified-replay 试点报告

- 生成时间：2026-09-23T17:54:58.190Z
- 仓库 revision：`9c6c1ab897dd`（脚本直接读 `.git/HEAD`；沙箱禁止创建进程，无法调用 git）
- 归档目录：`C:/code/AncinetEmpires/training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced`
- SD 训练计划：`C:/code/AncinetEmpires/training_configs/sd_training_plan_20260705.json`
- APK 解包目录：`C:/code/AncinetEmpires/APK/_analysis/unpack`
- legacy OpenSSL provider 已启用：是
- 本报告的聚合/成本部分由 `--recompute-report` 从**同一次运行**的结果重新计算：`v12/out/replay/sd_replay_pilot.json`
  （重算不重放 episode；所有聚合量都从 `results` 重新推导，不做任何沿用。）

**本报告由两次运行合并而成**（`--resume`）：
- 前一次运行：60 个 episode 已重放（其中 60 PASS），墙钟 1908543 ms；其 `results` 原样并入本报告（未重放、未修改）。
- 本次运行：补跑剩余的 40 个 episode，墙钟 2120919 ms。
- 抽样确定性检查：上次遗留的未跑清单与本次重新计算的抽样计划**完全一致**（计划是 (target, seed, 文件列表) 的纯函数）。
- 成本统计（每 episode / 每步耗时）基于合并后的全部 100 个 episode；墙钟总耗时字段是**本次**运行的墙钟（两次运行之间有间隔），不能直接相加。

> **样本量声明**：
> 计划抽样的 **100** 个 episode **全部完成重放**（attempted = 100），无预算截断。
> 这是归档 1395 个 episode 的 7.2% 分层抽样，
> 相对于全归档**仍是小样本**：它按文件比例分层，但每个文件内只有少量 episode，且各长度段的样本很薄
> （最大的 15000+ 步段占归档 59% 的步数，却只抽到少量 episode），所以通过率置信区间与成本投影都带有小样本不确定性。

## 复现命令

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/replay_pilot.ts --target 100 --budget-ms 5400000 --seed 20260923 --episode-timeout-ms 600000 --resume v12/out/replay60/sd_replay_pilot.json --out-dir v12/out/replay
```

两点环境要求（都已在上面命令中体现）：

1. 必须用 `v12/tools/run-tool.mjs`：`v11/tools/run-tool.mjs` 在本环境会被 Vite 的 Windows `net use` 探测
   （`optimizeSafeRealPathSync` → `child_process.exec`）以 `spawn EPERM` 直接打死，v12 runner 就是为该问题准备的行为等价 shim。
2. 必须加 `--openssl-legacy-provider`：`.aem` 地图资源是用 DES 加密的，Node 22 默认 OpenSSL 3 provider 会抛
   `error:0308010C:digital envelope routines::unsupported`，此时所有 episode 都会在"环境构造"阶段失败（本次已复现并归类）。

产出位置：

- `v12/out/replay/`：**本报告与 100-episode 合并结果**（canonical，任务要求的交付路径）；
- `v12/out/replay100/`：补跑剩余 episode 的那次 `--resume` 运行；
- `v12/out/replay60/`：第一次运行（60 个 episode）的存档，也是上面复现命令里 `--resume` 的输入；
- `v12/out/replay_probe/`：3 episode 的端到端 smoke 证据。

注意：`--resume` 只补跑上次未完成的 episode，并把上次的 `results` 原样并入，因此不会重复消耗 30 分钟以上的重放时间。
若要从零复现全部 100 个（不 resume），去掉 `--resume` 参数即可；两次运行为此合计花费约 67 分钟墙钟。

## 抽样规则

- 分层抽样：按 claimed 行数比例分配（最大余数法），文件内用带种子偏移的等距 stride；处理顺序按 rank 轮转（每个文件各取第 r 个样本），因此预算截断后的样本仍跨变体成比例
- 随机种子：`20260923`
- 目标 episode 数：**100**（归档 11 个文件、claimed 合计 1395 行）
- 实际计划抽样：100 个
- 处理顺序：round-robin by rank, files sorted by name

| 文件 | claimed 行数 | 实测记录数 | 实测物理行 | 抽样数 | stride offset | 选中 lineIndex（0 基） |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `sd-normal-episodes.jsonl` | 400 | 400 | 400 | 29 | 0.969625 | 13, 27, 40, 54, 68, 82, 96, 109, 123, 137, 151, 165, 178, 192, 206, 220, 234, 247, 261, 275, 289, 303, 316, 330, 344, 358, 371, 385, 399 |
| `sd-high-gold-episodes.jsonl` | 100 | 100 | 100 | 7 | 0.838542 | 11, 26, 40, 54, 69, 83, 97 |
| `sd-low-gold-episodes.jsonl` | 100 | 100 | 100 | 7 | 0.210832 | 3, 17, 31, 45, 60, 74, 88 |
| `sd-low-unit-limit-episodes.jsonl` | 100 | 100 | 100 | 7 | 0.372792 | 5, 19, 33, 48, 62, 76, 91 |
| `sd-high-unit-limit-episodes.jsonl` | 100 | 100 | 100 | 7 | 0.723257 | 10, 24, 38, 53, 67, 81, 96 |
| `sd-3p-normal-extra-episodes.jsonl` | 160 | 160 | 160 | 12 | 0.743305 | 9, 23, 36, 49, 63, 76, 89, 103, 116, 129, 143, 156 |
| `sd-3p-high-gold-extra-episodes.jsonl` | 60 | 60 | 60 | 4 | 0.731564 | 10, 25, 40, 55 |
| `sd-3p-low-unit-extra-episodes.jsonl` | 60 | 60 | 60 | 4 | 0.461193 | 6, 21, 36, 51 |
| `sd-4p-normal-extra-episodes.jsonl` | 35 | 35 | 35 | 3 | 0.106597 | 1, 12, 24 |
| `sd-small-advantage-endgame-episodes.jsonl` | 140 | 140 | 140 | 10 | 0.384238 | 5, 19, 33, 47, 61, 75, 89, 103, 117, 131 |
| `sd-medium-advantage-endgame-episodes.jsonl` | 140 | 140 | 140 | 10 | 0.258792 | 3, 17, 31, 45, 59, 73, 87, 101, 115, 129 |

实测记录数与 claimed 行数在全部文件上一致（逐文件重新计数，见上表）。

完整逐条清单见 `sd_replay_pilot.json` 的 `summary.samplingRule.allocation[].lineIndexes`、`results`（已跑）与 `notAttempted`（未跑）。

## 聚合结果

| 指标 | 数值 |
| --- | ---: |
| 计划抽样 | 100 |
| 实际尝试（attempted） | **100** |
| PASS | **100** |
| THROW | 0 |
| TIMEOUT（单 episode 墙钟上限 600000ms） | 0 |
| 预算截断未跑（budget-skipped，未验证） | 0 |
| **通过率（PASS / attempted）** | **100.00%** |
| 通过率（PASS / 计划抽样 100） | 100.00% |
| 重放步数（所有 attempt 合计） | 602526 |
| 通过 episode 的重放步数 | 602526 |
| 索引阶段耗时（固定 I/O 成本） | 860 ms |
| 墙钟总耗时 | 2120919 ms（35.35 min） |
| 是否触发预算上限 | 否 |

### 按文件分布

| 文件 | attempted | PASS | THROW | TIMEOUT |
| --- | ---: | ---: | ---: | ---: |
| `sd-3p-high-gold-extra-episodes.jsonl` | 4 | 4 | 0 | 0 |
| `sd-3p-low-unit-extra-episodes.jsonl` | 4 | 4 | 0 | 0 |
| `sd-3p-normal-extra-episodes.jsonl` | 12 | 12 | 0 | 0 |
| `sd-4p-normal-extra-episodes.jsonl` | 3 | 3 | 0 | 0 |
| `sd-high-gold-episodes.jsonl` | 7 | 7 | 0 | 0 |
| `sd-high-unit-limit-episodes.jsonl` | 7 | 7 | 0 | 0 |
| `sd-low-gold-episodes.jsonl` | 7 | 7 | 0 | 0 |
| `sd-low-unit-limit-episodes.jsonl` | 7 | 7 | 0 | 0 |
| `sd-medium-advantage-endgame-episodes.jsonl` | 10 | 10 | 0 | 0 |
| `sd-normal-episodes.jsonl` | 29 | 29 | 0 | 0 |
| `sd-small-advantage-endgame-episodes.jsonl` | 10 | 10 | 0 | 0 |

### 按 plan 分布

| planId | attempted | PASS | THROW/TIMEOUT | 通过 episode 步数 | 通过 episode 总耗时 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `sd-3p-high-gold-extra` | 4 | 4 | 0 | 5008 | 12258 |
| `sd-3p-low-unit-extra` | 4 | 4 | 0 | 6460 | 15829 |
| `sd-3p-normal-extra` | 12 | 12 | 0 | 94868 | 461178 |
| `sd-4p-normal-extra` | 3 | 3 | 0 | 31066 | 183490 |
| `sd-high-gold` | 7 | 7 | 0 | 27484 | 136917 |
| `sd-high-unit-limit` | 7 | 7 | 0 | 79140 | 708333 |
| `sd-low-gold` | 7 | 7 | 0 | 52141 | 286537 |
| `sd-low-unit-limit` | 7 | 7 | 0 | 19857 | 69611 |
| `sd-medium-advantage-endgame` | 10 | 10 | 0 | 40199 | 535071 |
| `sd-normal` | 29 | 29 | 0 | 192177 | 980545 |
| `sd-small-advantage-endgame` | 10 | 10 | 0 | 54126 | 637571 |

## 失败原因分类

**本次试点没有出现任何失败样本：THROW = 0，TIMEOUT = 0。**

分类口径：错误类别直接来自 `tools/skirmish_dataset_export.ts` 抛出的消息模式（`ERROR_CATEGORIES` 表），
不是关键词统计的近似值；`other` 表示未能匹配任何已知模式。

## 成本模型

样本量 n = **100** 个 PASS episode（另有 0 THROW、0 TIMEOUT）；
单 episode 成本实测相差很大（见下表 spread ratio），因此均值与中位数两个口径都给出。

| 指标 | 数值 |
| --- | ---: |
| 每 attempt 平均耗时（含失败） | 40273.4 ms |
| 每 PASS episode **平均**耗时 | 40273.4 ms |
| 每 PASS episode **中位数**耗时 | 5953.5 ms |
| 每 PASS episode 耗时 min / max | 212 / 322137 ms |
| min→max 倍数（spread ratio） | 1519.5× |
| 每 PASS episode 步数 min / 中位数 / max | 69 / 1926.5 / 29728 |
| 每 PASS step 平均耗时 | 6.6841 ms |
| 每 PASS step 中位数耗时 | 3.7 ms |
| 重放吞吐（均值口径） | 149.61 steps/s, 89.4 episodes/hour |
| 重放吞吐（中位数口径） | 270.27 steps/s, 604.7 episodes/hour |
| 一次性索引成本（约 3.3GB 扫描，每轮只付一次） | 860 ms |

### 全归档 1395 episode 成本外推（**投影，不是实测**）

| 口径 | 每 episode 成本 | 全归档 1395 episode |
| --- | ---: | ---: |
| 均值口径（mean basis，上界） | 40273.4 ms | **15.61 h**（56181393 ms） |
| 中位数口径（median basis，下界） | 5953.5 ms | **2.31 h**（8305133 ms） |
| **步数普查口径**：归档实测 9219721 步 × 每步成本 | 3.7（中位）/ 6.6841（均值）ms/step | **9.48 – 17.12 h** |
| **区间** | — | **2.31 – 15.61 小时**（episode 口径） |
| **分层步数口径（首选）** | 见下表按长度分桶 | **约 17.38 h**（区间 15.68 – 17.38 h） |

步数普查（**实测，不是外推**）：归档 1395 个 episode 的 `summary.stepCount` 合计 **9219721** 步（均值 6609.1、中位数 2650 步/episode，缺失 0 条，普查时间 2026-09-23T17:18:29.877Z）。
步数口径的投影只依赖"每步成本"，而每步成本实测比每 episode 成本稳定得多，所以这个口径比 episode 均值口径更可信；
它仍是投影，因为每步成本取自本次抽样的 episode。

#### 按对局长度分层的步数投影（首选口径）

每步成本随对局变长而明显上升，所以"一个统一 ms/step × 全归档步数"仍有偏差。
下面对归档按步数分桶，每个桶用**同长度桶内实测**的 ms/step 加权，得到分层投影：

| 步数桶 | 归档 episode | 归档步数 | 抽样 episode | 抽样步数 | 桶内实测 ms/step（均值/中位） | 用回退均值? |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1-999 | 394 | 202469 | 34 | 18461 | 2.7245 / 1.7 | 否 |
| 1000-4999 | 443 | 1013421 | 32 | 73724 | 3.8567 / 4.3 | 否 |
| 5000-14999 | 267 | 2545805 | 15 | 145957 | 7.7925 / 4.0621 | 否 |
| 15000+ | 291 | 5458026 | 19 | 364384 | 7.0128 / 7.5833 | 否 |

**分层投影：约 17.38 小时**（桶内均值口径；桶内中位数口径 15.68 小时，区间 15.68 – 17.38 小时）。
这是**首选**的成本口径：它把"归档真实步数分布"（实测）与"同长度段的每步成本"（抽样实测）结合，
只剩每步成本的不确定性；但最大的桶（15000+ 步，占归档 59% 的步数）只有少量抽样 episode 支撑，这一点必须计入不确定性。

为什么用分桶而不是线性模型：对 100 个 PASS episode 拟合 `elapsedMs = 固定成本 + 每步成本 × steps` 得到 截距 **-4332.8 ms**（**负**）、斜率 7.4032 ms/step、R²=0.7978。
线性拟合给出**负**截距，说明每步成本随对局变长而上升（超线性），单一直线模型不适用，故采用分桶投影。

外推依据：上界=每 PASS episode 平均 40273.4ms × 1395；下界=中位数 5953.5ms × 1395（两者都是外推，不是实测）。

外推假设：假设这 100 个已重放 episode 的耗时分布与归档全部 1395 个 episode 一致；由于单 episode 成本实测相差约 1520 倍，小样本下的均值受长对局离群值驱动，因此同时给出中位数口径。
这是基于 100 个重放成功的 episode 的**投影**：若归档中未抽到的 episode 步数分布与样本不同，投影会偏移；
`env.reset` 与每步 observation/合法动作构造是主要成本项，随对局步数增长，所以步数分布是投影误差的主要来源。
（索引阶段成本不随 episode 数增长，可忽略。）

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
| corrupt initialObservationHash | 是 | `initial-observation-hash-mismatch` | `initial-observation-hash-mismatch` | 是 | 18 |
| corrupt steps[0].actionCode | 是 | `step-action-code-mismatch` | `step-action-code-mismatch` | 是 | 3 |
| corrupt steps[0].reward (+1) | 是 | `step-reward-mismatch` | `step-reward-mismatch` | 是 | 6 |
| corrupt steps[0].winnerAfter | 是 | `step-winner-mismatch` | `step-winner-mismatch` | 是 | 3 |

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

### 旁证：seed 与训练计划的生成公式一致

- 公式（来自 `tools/sd_training_state_generator.ts::buildSdTrainingJobs`）：`seed = defaults.seedBase + planIndex*100000 + mapIndex*1000 + episodeIndex`
- 可核对样本：100 个（有 planId / mapName / seed 的 episode）
- 落在期望 seed 窗口内的：**100 / 100**

这一旁证的意义：seed 与 `(planId, mapName, episodeIndex)` 的对应关系由同一个计划 JSON 决定，
因此 seed 全部落在公式窗口内，说明**归档与 HEAD 上的训练计划配置同源**，而不只是"重放恰好通过"。

