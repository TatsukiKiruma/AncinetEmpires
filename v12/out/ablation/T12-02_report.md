# T12-02 报告：修掉 100% 截断并重跑强度对照

- runId `agent_upgrade_v12_b1` · 2026-09-24 · 基线 `9c6c1ab`
- 产物：`v12/out/ablation/strength_ablation.json`、`v12/out/ablation/intervention_audit.json`
- 未改动：`v11/out/**`（原批二工件完整保留）、游戏规则、生产 AI 默认值

---

## 1. 问题

批二 `v11/out/strength_ablation.json` 的四个臂里有三个 **`truncationRate = 1.0`（100%）**：

```
heuristic         n=4  W/L/D/T/E = 2/2/0/0/0
planner           n=4  0/0/0/4/0    ← 全部截断
planner_zeroed    n=4  0/0/0/4/0    ← 全部截断
planner_residual  n=4  0/0/0/4/0    ← 全部截断
```

截断意味着对局在自然结束前被硬上限掐断，**整张强度表读不出任何信息**。
根因是 `maxDecisionsPerMatch = 8`（外加 `maxAtomicSteps = 1200`、`maxTurns = 40` 偏低）。

---

## 2. 修复

`tools/v11/ablation.ts::defaultAblationOptions()`：

| 参数 | 原值 | 新值 | 依据（实测自然值） |
|---|---:|---:|---|
| `maxDecisionsPerMatch` | 8 | **240** | 实测最大 132 → 1.8× |
| `maxAtomicSteps` | 1200 | **4000** | 实测最大 194 → 21× |
| `maxTurns` | 40 | **60** | 实测最大 9 → 6.7× |
| `V11_ABLATION_SEATS` | （硬编码 `[0,1]`） | **新增环境变量** | 与既有 `_MAPS`/`_SEEDS` 同构 |

三个上限都设在实测自然值之上，因此**正常路径就是自然终局，上限只在病态对局上触发**。

---

## 3. 成本标定（子任务实测，写入 `ablation.ts:217-228` 注释）

```
arm               turns  steps  decisions  termination
heuristic             8    130          0  NATURAL_LOSS
planner_zeroed        8    127         40  NATURAL_LOSS
planner_residual      9    194        132  NATURAL_WIN
```

| 臂 | 单决策成本 |
|---|---:|
| `planner` / `planner_zeroed` | ~0.18 s |
| `planner_residual` | **9.9 s** |

`planner_residual` 是唯一会为候选比较付钱的臂（只有它的 ranker 能把非基准候选打到基准之上，从而触发比较门）。
一个 9 回合对局约 22 分钟。原矩阵 4 图 × 3 seeds × 2 座位 × 4 臂 ≈ 96 场，**residual 臂单独就要约 9 小时** ——
这是完整矩阵跑不完的真实原因，不是 bug。

---

## 4. 本轮实际运行（有界，单 block）

```
V11_OUT_DIR=v12/out/ablation
V11_RUN_ID=agent_upgrade_v12_b1
V11_RANKER_FILE=v11/out/ranker_weights/fit1_pair_all.json
V11_ABLATION_MAPS='(2) Duel.aem'  V11_ABLATION_SEEDS=42  V11_ABLATION_SEATS=0
node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs tools/v11/run.ts ablation
```

协议（来自 `strength_ablation.json::protocol`）：
`maps=["(2) Duel.aem"] seeds=[42] seats=[0] maxTurns=60 maxAtomicSteps=4000 maxDecisionsPerMatch=240`
`plannerOptions`: `searchTransitions=48, searchMaxMs=250, compareOptions={continuationBudget:80, maxCandidates:3, continuationSeed:20260924}, minDelta=0.02, maxCandidates=3`

**墙钟 1721.5 s（28.7 分钟）**，其中 residual 臂占绝大部分。

---

## 5. 结果（逐字来自产物）

| 臂 | n | W/L/D/T/E | 截断率 | 决策 | engine transitions | 覆盖 |
|---|---:|---|---:|---:|---:|---:|
| `heuristic` | 1 | 0/1/0/**0**/0 | **0** | 0 | 0 | 0 |
| `planner` | 1 | 0/1/0/**0**/0 | **0** | 40 | 8,915 | 0 |
| `planner_zeroed` | 1 | 0/1/0/**0**/0 | **0** | 40 | 8,915 | 0 |
| `planner_residual` | 1 | 1/0/0/**0**/0 | **0** | 132 | 23,290 | **3** |

```
controlCheck = {"plannerMatchesZeroed":true,"mismatchBlocks":0,
                "note":"The zeroed-ranker arm reproduces the no-ranker arm exactly,
                        so the learning-disabled control is valid."}
verdict      = "residual natural win rate 100.0% vs planner 0.0% and heuristic 0.0%"
learningAddsValue = true
intervention_audit: events=212 overrides=3 (1.4%) refusals=209
```

---

## 6. 验收判定

| 验收项 | 结果 |
|---|---|
| 三个规划器臂截断率 < 30% | ✅ **0%**（原状 100%） |
| `controlCheck` 通过 | ✅ `plannerMatchesZeroed = true`, `mismatchBlocks = 0` |
| 未改写 `v11/out/**` | ✅ 输出到 `v12/out/ablation/` |
| 出现自然 W/L/D | ✅ 四臂全部自然终局 |

**T12-02 的核心目标（让截断率可读）已达成并经产物验证：截断率 100% → 0%。**

---

## 7. 不能从这张表读出的（必须明说）

- **这不是棋力结论。** 每臂 **n = 1**。`learningAddsValue = true` 来自**单场对局**，
  统计上不构成任何证据。批二犯过的正是"把小样本当结论"的错，本轮不重犯。
- 覆盖只有 3 次（3/132 = 1.4%），与批二的保守门控形态一致（批二 4/32 = 12.5%），
  但同样不足以判断覆盖是否有益。
- 只测了 1 张图（`(2) Duel.aem`）、1 个 seed（42）、1 个座位（0）。其他地图/座位的截断率未测。
- `planner_residual` 的 9.9 s/决策意味着**完整矩阵约需 9 小时算力**，
  属于需要另行授权的范围（见 V12 报告 §7）。本轮故意不做。

---

## 8. 复现

```powershell
$env:V11_OUT_DIR='v12/out/ablation'; $env:V11_RUN_ID='agent_upgrade_v12_b1'
$env:V11_RANKER_FILE='v11/out/ranker_weights/fit1_pair_all.json'
$env:V11_ABLATION_MAPS='(2) Duel.aem'; $env:V11_ABLATION_SEEDS='42'; $env:V11_ABLATION_SEATS='0'
node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs tools/v11/run.ts ablation
```

`V11_RANKER_FILE` 必须显式设置：`ablation.ts` 从 `OUT_DIR` 解析 ranker 路径，
改了 `V11_OUT_DIR` 而不设它，residual 臂会静默丢掉学到的权重、退化成与 `planner` 相同 —— 这正是批二 `V11-D02` 的同类陷阱。
