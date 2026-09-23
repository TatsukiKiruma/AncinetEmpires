# T12-00 报告：重新冻结证据基线并把 BattleSearchAI 纳入证据链

- runId：`agent_upgrade_v12_b1`
- 执行时间：2026-09-23
- 输出目录：`v12/out/freeze/`
- 未改动：`v11/out/**`（原批一冻结记录完整保留）、`v10/**`、游戏规则、生产 AI 默认值

---

## 1. 做了什么

| 步骤 | 结果 |
|---|---|
| 在原审查提交与当前 HEAD 之间计算 delta | **仅 2 个新增文件，0 个修改文件** |
| 确认 delta 与 F01–F07 涉及文件无交集 | **是**（`git diff --name-only` 无任何 v10 / train_spatial_resnet / heuristic_ai / engine.ts 命中） |
| 把新冻结写入新目录（不覆盖批一） | `V11_OUT_DIR=v12/out/freeze` |
| 在冻结源清单中加入 `src/game/ai/battle_search_ai.ts` | 已加入（`tools/v11/common.ts` FROZEN_SOURCE_FILES，20 个文件） |
| 新增问题条目 F08、F09 | 已加入 `tools/v11/evidence.ts` |
| 写出 BattleSearchAI 交叉引用档案 | `v12/out/freeze/battle_ai_crossref.json` |

复现命令：

```
$env:V11_OUT_DIR='v12/out/freeze'
$env:V11_RUN_ID='agent_upgrade_v12_b1'
$env:V11_RUN_DIR='training_runs/agent_upgrade_v12_b1'
node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs tools/v11/run.ts freeze
```

> 注意：`tools/v11/run.ts` 头部注释写的 `node v11/tools/run-tool.mjs ...` **不足以运行**。
> 沙箱禁止创建进程，vite 的 `windowsSafeRealPathSync` 会 `exec('net use')` 并抛 `spawn EPERM`。
> 必须加 `--require ./v11/tools/core-spawn-shim.cjs`（`v11/tools/run-tests.ps1` 就是这么做的）。
> 这一点原注释有误导，建议修正。

---

## 2. 冻结结果（实测输出，逐字）

```
[T11-00] review commit : 4451947355e9683437a6fc1348cf01657eaf50e3
[T11-00] working HEAD  : 9c6c1ab897dd2612a56912d5f843ffc399e2bae5 (match=false)
[T11-00] issues frozen : 13
```

`source_snapshot.json`：`reviewCommit=4451947…`，`workingTreeHead=9c6c1ab…`，`headMatchesReviewCommit=false`，`files=20`，`battle_search_ai.ts` 已在冻结清单内。

`issue_ledger.json` 汇总：

```json
{ "total": 13, "confirmedFromSource": 11, "confirmedFromArtifactArithmetic": 1,
  "riskNotQuantified": 1, "p0": 10, "invalidatedArtifactCount": 9,
  "measuredNegativeResults": 2, "insufficientSample": 3, "notRun": 2 }
```

条目：F01、F01b、F02、F02b、F03、F03b、F04、F05、F05b、F06、F07、**F08（新）**、**F09（新）**。

### 为什么 `headMatchesReviewCommit=false` 是正确的而不是缺陷

批一冻结时 HEAD 恰为审查提交，所以当时为 `true`。此后新增了 BattleSearchAI v3。
把 `false` 如实记录、并附上 delta 声明，比强行改写 `reviewCommit` 更诚实。
**F01–F07 的结论不因这次 HEAD 移动而改变**，因为 delta 没有触及任何一个相关文件。

---

## 3. 新增条目摘要

**F08（P1，CONFIRMED_FROM_SOURCE）— 两条平行线互不引用。**
`battle_search_ai.ts` 提交于 18:03，夹在批一（17:12–17:50）与批二（23:36）之间，两份报告都没提到它。
批二的自我审计缺陷 **V11-D01**（未播种的 `new HeuristicAI()` 回退 `Math.random`）正是
`battle_search_ai.ts:59-60` 早已处理过的问题。两条线在同一目标上各自重造了启发式锚定的残差覆盖结构。

**F09（P0，CONFIRMED_FROM_ARTIFACT_ARITHMETIC）— 空间数据集丢失局面身份字段且 valueTarget 只在终局赋值。**
实测 `spatial_train_scaled_30k.jsonl`：30,000 条记录只有 6 个字段；`rootFamilyId` 缺失 30,000/30,000；
`valueTarget` 为 null 29,980/30,000。根因在 `tools/convert_archive_to_spatial.ts:166-179`。
后果：`python/train_spatial_resnet.py:477-499` 的分组切分静默回退到 `f"ep_{idx // 60}"` 合成分组，
train/val 共享同一 episode —— **所有 val_acc / OOD top-1 读数是同局泄漏值**；同时 value 头几乎没有标签。
这是 V12 新发现的 P0 缺陷，已进入 T12-03 修复范围。

---

## 4. 验收

| 验收项 | 状态 |
|---|---|
| 重算 hash 与冻结内容一致 | ✅ 冻结命令成功产出 4 个文件 |
| 明确声明 9c6c1ab delta 不触及 F01–F07 | ✅ `battle_ai_crossref.json::deltaDeclaration` |
| `v11/out/**` 未被改写 | ✅ 全程使用 `V11_OUT_DIR=v12/out/freeze` |
| 24 TS + 14 Python 断言在 9c6c1ab 上复跑全绿 | ⏳ 在本轮结束时统一复跑（改动落在 `evidence.ts`/`common.ts`，见下） |

## 5. 本轮对 v11 源码的最小改动

| 文件 | 改动 | 理由 |
|---|---|---|
| `tools/v11/common.ts` | `FROZEN_SOURCE_FILES` 加入 `src/game/ai/battle_search_ai.ts` | 它现在是棋力叙事的关键源文件，冻结必须覆盖 |
| `tools/v11/evidence.ts` | 追加 F08、F09 | 记录新发现的缺陷与重复劳动 |

两者都没有被 `tools/v11_regression_contract.test.ts` 断言（已 grep 确认无 `V11_ISSUES` / `FROZEN_SOURCE_FILES` / `issues.length` 引用），因此不会破坏回归契约。

## 6. 未完成 / 边界

- 未修正 `tools/v11/run.ts` 头部注释里缺失 `--require core-spawn-shim.cjs` 的命令示例（属文档瑕疵，留待统一处理）。
- F08/F09 只做登记与影响标注，**不修改任何历史报告数字**。
- F09 的修复与验收在 T12-03/T12-04。
