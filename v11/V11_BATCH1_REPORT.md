# V11 第一批执行报告（T11-00 ~ T11-03）

- 日期：2026-09-23
- 审查固定提交：`4451947355e9683437a6fc1348cf01657eaf50e3`
- 冻结时工作区 HEAD：`4451947355e9683437a6fc1348cf01657eaf50e3`（**一致**，分支 `path-b-spatial-ai`）
- 未做：改游戏规则、替换生产默认 AI、付费算力、push、上传工件、重跑 V7–V10 全量工具

---

## 1. 修复了哪些失败断言（红 → 绿）

先暴露、后修复。**首次执行 TypeScript 套件在审查提交上失败 7 条断言，Python 套件失败 9 条**，全部为真实缺陷。

| 用例 | 缺陷 | 旧实现实测行为 | 现状 |
|---|---|---|---|
| RC-01 | F01 状态错位 | 样本 tensor/global/candidate/turn 全来自开局 `state` | 通过 |
| RC-02 | F01b 前缀未回滚 | 失败局已 push 的前缀样本被保留 | 通过 |
| RC-03 | F02 只看异常 | 非法动作被 `step` 接受为"继续" | 通过 |
| RC-04 | F02b 默认设置回放 | 非默认 setup 被按默认设置回放 | 通过 |
| RC-05 | F03 根候选遗漏 | 已移动单位无法从根候选直接攻击 | 通过 |
| RC-06 | F03b 跨单位 macro | 生成 move(A)→wait(B) | 通过 |
| RC-07 | F04 账本/超时/兜底 | `candidateGenerationTransitions` 不存在、`wallClockExceeded` 恒 false、兜底返回未评分数组首项 | 通过 |
| RC-08 | `runTacticalFixtures` | 无参调用时 `searcher.search` 抛 TypeError | 通过 |
| RC-09 | 截断局 mask | value 为 null 时 policy mask 也关掉 | 通过 |
| RC-10 | F05 消费口径 | 训练前写 consumed_manifest 自证 | 通过 |
| RC-11 | F05b 末批损失 | `break` 早于 loss 累加 | 通过 |
| RC-12 | F05 兜底行为 | 未知 root 默认进 train、零验证集从 tail 切 | 通过 |
| RC-13 | F07 轨迹无初态 | 轨迹只有 `actionHistory` | 通过 |

复现命令：

```
pwsh -File v11/tools/run-tests.ps1                 # TypeScript：24 断言
py -3.12 -m unittest discover -s python/tests      # Python：9 断言
```

最终：**TypeScript 24 passed / Python 9 passed / `tsc --noEmit` 干净**。

---

## 2. V10 池不可复核（F07 新发现）

`v11/out/replay_validation.json`（对 V10 池）：454 局池，抽取 40 局逐局核查 → **validated=0**。

原因不是回放器坏了，而是 **V10 从未把初态落盘**：

- `v10/fix_01/episodes.jsonl` 的 18 个字段里没有 `initialStateHash`，也没有 setup；
- trajectory 日志只有 `actionHistory / candidatePolicy / matchId / steps / terminationReason / turns`；
- 而采集器对 seed 9001+ 使用 5 种 `initialGold/unitLimit/levelCap` 变体。

按任务书要求：**整池标为 `UNKNOWN_NOT_PROVEN` 并隔离，不猜测补齐**。

修复方向改为让新采集可证明：`src/game/state_snapshot.ts` 提供唯一快照契约，
`runBenchmarkMatch` 把 `initialSnapshot`（含行为哈希、完整性哈希、setupId、subjectSeat）写进每份轨迹。
`tools/v11_replay_e2e.test.ts` 证明真录音可无猜测复核、700/70/7 非默认 setup 能往返、篡改后立即被拒。

---

## 3. 真实优化消费（自证闭环已拆掉）

`python/train_spatial_resnet.py`：

- `planned_manifest`（训练前计划，标注 `measured: false`）与 `optimized_manifest`（仅 `optimizer.step()` 成功后累计）分离；
- 新增 `optimizer_update_ledger.jsonl`，逐次更新记录样本 ID，聚合值可从账本重算；
- `--global-update-limit` 为全局上限（不再随 epoch 重置）；
- 末批损失先累加再 `break`；
- 未知 root、重复 sampleId 冲突 stateHash、空验证集全部 fail loudly；
- `policyLossMask` / `valueLossMask` 分离并进入 collate 与 loss。

实测（`python/tests/test_v11_optimizer_consumption.py`）：40 行数据 + `--global-update-limit 3`
⇒ `updates=3, exposures=6, plannedTrainRows=40, plannedButNeverOptimized>0`，
且优化 ID 集合与计划 ID 集合**确实不同**。

---

## 4. 相同预算下规划器的行为（T11-02）

`v11/out/candidate_coverage.json`（8 个真实局面，priorMode=off，零神经干预）：

- `baselineAlwaysPresent = true` —— Heuristic 首选始终在根候选里；
- `positionsWithMissingTypes = 0` —— 每个合法单步动作类型都有根候选；
- 构造的立即制胜局面（引擎自证）中 `immediateWinKept = true`。

`v11/out/search_transition_profile.json`：

| budget | candidateGeneration | totalTransitions | ledger 一致 | 选中项来自保底集合 |
|---:|---:|---:|---|---|
| 32 | 17 | 43 | true | true |
| 64 | 17 | 64 | true | true |
| 128 | 17 | 128 | true | true |
| 256 | 17 | 125 | true | true |

候选生成阶段此前**完全不计账**，现在 17 次引擎步进被计入；预算耗尽时返回的是引擎已核验的保底动作。

`v11/out/tactical_regression.json`：仓库自带战术 fixture **全部通过**；重复运行同状态同预算，
选中动作 **0 次不稳定**。

---

## 5. 比赛 W/L/D/T/ERROR/NOT_RUN

**NOT_RUN（全部）**。本批按任务书要求不跑新的 400 场确认、不并行训练新模型。

V10 的既有比赛数字保持原状，但证据状态已逐项标注（`v11/out/issue_ledger.json`）：
2 项实测负结果、3 项统计不足、3 项输入对齐失效待重建、2 项未运行。**没有把任何一项笼统作废。**

---

## 6. 尚未完成项

1. **T11-01 数据集本体为空**：V10 池不可复核；V11 采集的新池见第二批报告。
2. **T11-03 的 `training_config.json`** 需在真正发起训练时生成。
3. **F06 只修了块 ID**：`chunkLabel` 已进入 sampleId/rootFamilyId；Heuristic 随机源仍未与 seed 绑定。
4. **F04 剩余项**：根调度仍是逐候选完整推演；对手 move 威胁排序仍读 `unit.pos`；8/2 截断仍在。
   这三项影响搜索**强度**，不影响记账正确性。
5. **价值叶尺度未统一**（`0.5*V` vs 数百量级启发式分），属 T11-04/05 实验设计。
6. **仓库既有测试的 24 条失败与本批无关**：`v7_cross_language_parity`（需 Python 进程）、
   `v8_directory_guard` / `v8_report_consistency` / `v8_runtime_fallback_analysis`（缺
   `agent_upgrade_20260921_v8_closure_02` 报告）、`skirmish_old_dataset_worker_pool`（需子进程）。

---

## 7. 产物清单

`v11/out/`：`source_snapshot.json`、`issue_ledger.json`、`regression_cases.json`、
`evidence_manifest.json`、`replay_validation.json`、`invalid_episodes.jsonl`、
`dataset_v11_manifest.json`、`split_v11.json`、`candidate_coverage.json`、
`search_transition_profile.json`、`tactical_regression.json`、`out_index.json`

新增/修改代码：`src/game/state_snapshot.ts`、`tools/v11/*`、`tools/v11_regression_contract.test.ts`、
`tools/v11_replay_e2e.test.ts`、`python/tests/test_v11_optimizer_consumption.py`、
`vitest.v11.config.mjs`、`v11/tools/*`；
最小修改：`tools/v10_turn_aware_search.ts`、`tools/v7_unified_evaluation.ts`、
`tools/v10_dagger_controlled.ts`、`tools/v10fix/pipeline.ts`、`python/train_spatial_resnet.py`。
**未改动**：`v10/**` 全部历史工件、游戏规则、生产 AI 默认值。

---

## 8. 运行环境说明（重要）

本机沙箱禁止创建进程与命名管道，而 `tsx` / `vite:esbuild` / `vitest` 默认都要 spawn esbuild 服务。
本批用三个**测试/工具专用**适配文件解决，均不影响应用构建：

- `vitest.v11.config.mjs`：`esbuild: false` + 用已安装的 `typescript` 做进程内转译 + 单线程池；
- `v11/tools/run-tool.mjs`：用同样方式加载并执行 TS 工具（替代 `--import tsx`）；
- `v11/tools/core-spawn-shim.cjs`：放行 vite 的 `net use` 探测。

未使用 `unsafeBypassValidationForTests` 或任何绕过引擎校验的加速手段。
