# S1 工具链勘察：如何跑一局 / 跑一个面板 / 家族与窗口如何定义

勘察日期：2026-09-30。范围：只读分析 `C:\code\AncinetEmpires`，不修改任何既有文件（本文件为唯一新增产物）。
目的：为「40 个固定窗口的整回合搜索试验」（`V19_R123_REVIEW_AND_SEARCH_20260930.md` §S1）准备工具清单。

---

## 0. 结论先行

1. **「一局」只有一个真实来源**：`v14/tools/eval_v14_match.ts:323` 的 `playOne(options)`。v15/v16/v17/v18/v19 的所有 arena / collector / 诊断工具都 import 它，没有第二份对局实现。**改对局语义必须改这里，改别处无效**。
2. **「一个面板」是纯代码派生的**：`v16/tools/eval_v16_protocol.ts:104-137`（`V16_PANELS`）+ `:188-219`（`blocksForPanelV16`）。seed 公式 `base + 10*mapIndex + s`，每 seed 跑候选座位 0 与 1 各一局。**没有任何独立的 seed 清单文件**；清单只存在于代码常量与各 run 的 `*.blocks.json` 里。
3. **DEV20 当前冠军 5/20 的逐局原始记录**有两份且一致：`v16/out/v16_20260926_core/arena/dev/P1_s2026.games.jsonl`（v16 原始）与 `v19/out/run_20260928_v19_01/arena/dev/P1_s2026_v19control.m0..m4.games.jsonl`（v19 复跑，20 行 = 5 胜 15 负，SHA `b705b52a…`）。
4. **FRESH40 在代码里叫 `recheck`**（panelId = `recheck`，输出目录 `arena/recheck/`）。已消费：`2609260200 + 10m + s, s=0..3`（θ1 与 P1 各 40 局，共 80 场）。**CONFIRM20（2609260300）从未运行过**。
5. **家族 = `rootFamilyId = <scenarioId>#<rootSeed>#<episodeIndex>`**；**窗口 = 父局 id 加后缀**（v16 是 `<gameId>#step<N>`，v18 是 `w<NNN>:<gameId>`）。「同一原局及其派生窗口不跨组」目前**只靠 id 前缀 + 配额（同 gameId 最多 3、同 rootFamilyId 最多 3）表达，没有任何工具做过 20/20 分组冻结**。
6. **面板运行 = 5 进程分片**：`v19/scripts/run_panel_sharded_v19.ps1`，每图一个 node 进程，内部调 `v17/tools/arena_run_v17.ts`。支持 `--shard i/n`、`--blocks`、`--resume`、`--retry-errors`。
7. **单局实测耗时（DEV20 冠军 20 局）**：总计 1703.7s，均值 85.2s，中位约 46s，最快 5.9s，最慢 468.8s。**正式规则上限 = 12000 原子动作 / 900 秒墙钟 / maxPlies=null**（capsId `v16-student-caps-12k-900s-v2`）。
8. **结果分类只有一套权威实现**：`v13/tools/eval_v3_core.ts:12-73`。`POLICY_ERROR` 在 `playOne` 的 6 个位置产生，最终写进 `GameRecord.error`。
9. **「从中途某步恢复继续跑」已经可用**：`captureStateOnStep + onStep` 取 `stateBeforeJson` → `new GameEngine(savedState)` 续弈。`v19/review/r123_20260930/probe_icy_order.ts:19-42` 是现成的 50 行范例。**但 H0 的随机流无法克隆/快进**——这是 S1 最硬的一个缺口。
10. **已有大量可复用资产**：`v16/tools/teacher_s1_v16.ts`（完整玩家回合搜索教师）、`v16/tools/counterfactual_v16.ts` 与 `v18/tools/counterfactual_v18.ts`（成对续弈）、`v16/tools/select_windows_v16.ts`（40 窗口选择）、`v18/tools/freeze_recheck40_manifest.py`（命名空间冻结 + 重叠检查）。**缺的不是「从零写搜索」，而是「H0 RNG 克隆」「整段己方动作序列作为分支」「v19 新家族的窗口清单 + 20/20 分组」这三件事。**

---

## 1. `playOne` 完整参数表

### 1.1 签名与全部选项

`v14/tools/eval_v14_match.ts:247-280`（`PlayOptions`），实现 `:323-642`。

| 参数 | 类型 | 默认 | 含义 | 证据 |
|---|---|---|---|---|
| `runId` | string | 无（必填） | 写进身份与 gameId | `:248`、`:575` |
| `scenarioId` | string | 无 | `SDPLAN:sd-normal:(2) Duel.aem` 形式；`mapName` 由 `split(':').pop()` 得出 | `:249`、`:333` |
| `seed` | number | 无 | 本局 root seed；同时决定 H0 的逐座位随机流 | `:250`、`:349` |
| `candidateSeat` | number \| null | 无 | **null ⇒ 镜像臂（全 H0）**；非 null ⇒ 只有该座位用 predictor/policyOverride | `:251`、`:378`、`:394` |
| `viewedSeatHint` | number \| null | 无 | **只在 `candidateSeat === null` 时生效**（`viewedSeat = candidateSeat ?? viewedSeatHint`），用来算 `candidateAllianceId` | `:252`、`:499-500` |
| `maxSteps` | number | 无（CLI 默认 20000） | 原子动作上限；循环条件 `steps < maxSteps` | `:253`、`:380`、CLI `:672` |
| `maxPlies` | number \| null | 无（CLI 默认 null） | 只用于**分类**与 `episode.maxPlies`；**循环不强制它**（见下） | `:254`、`:337`、`:503`、`:512` |
| `wallTimeoutMs` | number | 无（CLI 默认 60000） | 墙钟保险；触发则 `wallTimeout=true` 并 break | `:255`、`:381`、CLI `:674` |
| `predictor` | `SpatialResNetPredictor` \| null | 无 | **null ⇒ 候选座位也走 H0**（对照臂） | `:256`、`:403-407` |
| `checkpointSha256` | string \| null | 无 | 权重文件字节摘要，进记录与身份 | `:257`、`:593` |
| `requestedPolicyId` | string | 无 | 写进记录；`actualPolicyId` 当前等于它（无静默回退） | `:258`、`:590` |
| `envFactory` | any | 无 | `createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE)` 的产物 | `:259`、`:342` |
| `emitIdentity` | boolean? | **false** | true 时补 V15 身份字段；true 而未给 `identityContext` 直接抛错 | `:263`、`:328-332` |
| `identityContext` | `IdentityContextV15`? | undefined | 身份来源：runMode/panelId/blockId/rootSeed/episodeIndex/rootFamilyId/modelTag/sourceDigests | `:265`、`:283-293` |
| `mirrorViewRecompute` | boolean? | **false** | 镜像行按被测座位联盟从 winner 重算 `outcomeKind`，原值存 `mirrorDeclaredOutcomeKind` | `:267`、`:530-532`、`:640` |
| `onStep` | `StepHookV16`? | **undefined** | 逐步回调；**默认不提供时循环与历史逐字节一致** | `:272`、`:448` |
| `captureStateOnStep` | boolean? | **false** | trace 里是否带完整动作前状态 JSON | `:274`、`:456` |
| `policyOverride` | `CandidatePolicyV16`? | undefined | 候选座位的策略注入（搜索教师臂）；**优先于 predictor** | `:279`、`:398-402` |

### 1.2 `maxPlies` 的一个真实陷阱

`playOne` **不调用 `env.stepAction`**，而是直接 `engine.step(action)`（`:468`）。而 ply 上限检查在 `src/game/env.ts:694`（`AncientEmpiresEnv.stepAction`）里。因此：

- `maxPlies` 在 `playOne` 里**不会被强制**，只影响分类（`:503`、`:512`）与 `mirrorId`（`:352`）。
- 正式面板 `maxPlies = null`（`v16/tools/eval_v16_protocol.ts:79`），所以这个差异当前无影响。
- 但**自行续弈时必须注意**：`new GameEngine(state)` 的 ply 语义与 env 不同。

### 1.3 返回值 `GameRecord`

`v14/tools/eval_v14_match.ts:118-197`。核心字段：

- 结果：`outcomeKind`、`winnerAllianceId`、`candidateAllianceId`、`error`
- 规模：`steps`（= `engineTransitions`，`:600`/`:603`）、`turns`、`plies`、`candidateDecisions`
- 身份：`rulesHash`、`mirrorId`、`arm`（`CANDIDATE`/`MIRROR`）、`checkpointSha256`、`encoderSchema`、`requestedPolicyId`/`actualPolicyId`
- 质量：`fallbackUsed`、`fallbackReason`、`filteredSurrenderBySeat`、`latencyMs{p50,p95,p99,max,mean}`、`wallMs`、`earlyEliminationAux`
- 摘要：`actionDigest = sha256(actionCodes.join('\n'))`（`:615`，动作串形如 `P0:move:u_1:3,4`）、`trajectoryDigest`（`:616`）
- **可选身份块**（仅 `emitIdentity=true`）：`gameId`、`runMode`、`panelId`、`blockId`、`rootSeed`、`episodeIndex`、`rootFamilyId`、`initialStateHash`、`mapHash`、`mapLayoutHash`、`engineSourceDigest`、`policySourceDigest`、`rngContract`、`actionFilterVersion`、`modelTag`、`seatAlliances`、`cacheIdentity{version,fields,key,gameId}`（`:621-639`）

### 1.4 `onStep` 的字段（`StepTraceV16`，`:200-224`）

| 字段 | 说明 |
|---|---|
| `stepIndex` | 引擎原子步序号（动作前那次的 `stepIndex` = 当前 `steps`） |
| `playerId` | 行动玩家座位 |
| `allianceId` | 该局真实联盟号（`getAllianceId`，不假设座位==联盟） |
| `byCandidate` | 本步是否由候选座位决定 |
| `stateHashBefore` | 动作前规范化状态摘要（`canonicalStateJson` 的 sha256） |
| `stateBeforeJson` | **动作前完整状态 JSON；`captureStateOnStep=false` 时为 null** |
| `legalActionCodes` | 策略允许集合（已过滤 surrender）的全部 actionCode |
| `orderedActionCodes` / `actionLogits` / `candidateOrderingId` | 仅候选臂由 predictor 决定时非 null |
| `actionCode` | 本步实际执行的动作 |
| `turnAfter` / `terminalAfter` / `winnerAfter` | **只有「步后」那条 trace 才填**（`:474-494`） |

**重要**：`StepTraceV16` **没有 `turn` 字段**（决策前的回合号）。想拿决策前回合号必须解析 `stateBeforeJson`。这一坑已被 `v19/tools/summarize_diag_trace.py:57-60` 记录（因此 `diag/trace.json` 里 `windows[].turn` 恒为 null）。

`onStep` 每一步被调用 **两次**：动作前（`:448-466`，`actionCode` 非空、`turnAfter=0`）与动作后（`:474-494`，`actionCode` 为空串、`legalActionCodes=[]`）。筛选候选决策时必须同时判 `byCandidate && actionCode !== '' && orderedActionCodes !== null`（`v19/tools/diagnose_dev_families.ts:156`）。

---

## 2. DEV20 的固定清单

### 2.1 清单定义位置

`v16/tools/eval_v16_protocol.ts:21-27`（五图顺序）+ `:104-112`（DEV20 规格）+ `:188-219`（派生函数）。

```
V16_MAPS = ['(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem',
            '(2) Mourningstar.aem', '(2) Crossed swords.aem']
dev: { baseSeed: 2609260100, seedsPerMap: 2 }
rootSeed = baseSeed + 10*mapIndex + s      // s = 0..seedsPerMap-1
blockId  = `${panelId}:m${m}:s${s}`
rootFamilyId = `${scenarioId}#${rootSeed}#${s}`
candidateSeats = [0, 1]
```
（`eval_v16_protocol.ts:197`、`:200`、`:210`、`:211`）

### 2.2 DEV20 逐图 seed 与座位

| m | 地图 | seeds（各跑 seat 0 与 seat 1） | blockId |
|---|---|---|---|
| 0 | (2) Duel.aem | 2609260100, 2609260101 | `dev:m0:s0`, `dev:m0:s1` |
| 1 | (2) Icy Paths.aem | 2609260110, 2609260111 | `dev:m1:s0`, `dev:m1:s1` |
| 2 | (2) Liberty Port.aem | 2609260120, 2609260121 | `dev:m2:s0`, `dev:m2:s1` |
| 3 | (2) Mourningstar.aem | 2609260130, 2609260131 | `dev:m3:s0`, `dev:m3:s1` |
| 4 | (2) Crossed swords.aem | 2609260140, 2609260141 | `dev:m4:s0`, `dev:m4:s1` |

5 图 × 2 seed × 2 座位 = **20 局**（`expectedCandidateGamesV16`，`:222-226`）。镜像实体只有 10 个（每 (地图, seed) 一次，`:229-233`）。

**没有独立的 seed 清单文件。** 最接近「冻结清单」的产物：
- `v19/out/run_20260928_v19_01/identity/manifest.json#frozenContracts.dev20SeedFormula` = `"2609260100 + 10*mapIndex + s, s=0,1"`
- 每个 run 分片的 `*.blocks.json`（材料化后的 block + 逐行结果），如 `v19/out/run_20260929_v19_02/arena/recheck/theta1_fresh40.m0.blocks.json`
- `v16/out/v16_20260926_core/arena/dev/P1_s2026.blocks.json`

### 2.3 冠军 5/20 的逐局结果在哪

| 文件 | 内容 |
|---|---|
| `v16/out/v16_20260926_core/arena/dev/P1_s2026.games.jsonl` | 20 行，5 `NATURAL_WIN` / 15 `NATURAL_LOSS`（v16 原始） |
| `v19/out/run_20260928_v19_01/arena/dev/P1_s2026_v19control.m0..m4.games.jsonl` | 20 行，同上；`progress.json#checkpointSha256 = b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899` |
| `v19/out/run_20260928_v19_01/arena/dev/P1_s2026_v19control_T18_04_w1_U_best_T18_04_w1_K_best.summary.v19.json` | 汇总（schema `v19_arena_summary_1`） |

我逐行统计的 20 局明细（来源：上述 v19 目录，字段 `mapName/rootSeed/candidateSeat/outcomeKind/steps/turns/wallMs`）：

```
Crossed swords 2609260140 s0 LOSS  380步  38.7s      Duel 2609260100 s0 LOSS 2379步 159.1s
Crossed swords 2609260140 s1 LOSS 2183步 203.4s      Duel 2609260100 s1 WIN   154步   6.1s
Crossed swords 2609260141 s0 WIN  4911步 216.6s      Duel 2609260101 s0 LOSS  447步  17.8s
Crossed swords 2609260141 s1 LOSS  589步  37.3s      Duel 2609260101 s1 WIN   154步   5.9s
Icy Paths 2609260110 s0 LOSS  544步  56.7s           Liberty Port 2609260120 s0 LOSS  424步  20.6s
Icy Paths 2609260110 s1 LOSS  817步  72.5s           Liberty Port 2609260120 s1 WIN  1885步  93.2s
Icy Paths 2609260111 s0 LOSS  811步  70.5s           Liberty Port 2609260121 s0 LOSS  381步  18.0s
Icy Paths 2609260111 s1 LOSS 5066步 468.8s           Liberty Port 2609260121 s1 WIN  2913步 131.4s
Mourningstar 2609260130 s0 LOSS  515步 22.7s         Mourningstar 2609260131 s0 LOSS  635步  30.1s
Mourningstar 2609260130 s1 LOSS  377步 17.9s         Mourningstar 2609260131 s1 LOSS  362步  16.5s
```

逐图胜场：Duel 2 / Icy 0 / Liberty 2 / Mourningstar 0 / Crossed 1。

---

## 3. FRESH40 / CONFIRM20 的命名空间与 seed 规则

### 3.1 命名对照（术语陷阱）

| 人类说法（任务书） | 代码 panelId | 输出目录 | baseSeed | seedsPerMap |
|---|---|---|---|---|
| DEV20 | `dev` | `arena/dev/` | 2609260100 | 2 |
| **FRESH40 / RECHECK40** | **`recheck`** | **`arena/recheck/`** | **2609260200** | **4** |
| CONFIRM20 | `confirm` | `arena/confirm/` | 2609260300 | 2 |
| PREFLIGHT（不计正式成绩） | `preflight` | `arena/preflight/` | 2609260900 | 1 |

来源：`v16/tools/eval_v16_protocol.ts:104-137`。FRESH40 的「40」= 5 图 × 4 seed × 2 座位（换边），与任务书 `V19_LONG_TERM_TASKBOOK.md:39` 一致。

### 3.2 seed 从哪来、如何保证不重叠

- seed 全部由 `baseSeed + 10*mapIndex + s` 派生（`eval_v16_protocol.ts:197`）。**同一地图的 seed 落在长度 10 的窗口内，不同地图窗口互不重叠**（`:186-187` 注释）。
- 命名空间之间靠 baseSeed 相隔 100 以上来隔离（DEV 0100 / RECHECK 0200 / CONFIRM 0300 / PREFLIGHT 0900）。
- 训练 root 命名空间另有独立常量：`V16_TRAIN_ROOT_BASE_SEED = 2609300000`、`V16_TRAIN_VAL_BASE_SEED = 2609400000`、`V16_CURRICULUM_BASE_SEED = 2609600000`（`eval_v16_protocol.ts:156-159`）。
- 逐 wave 复核与失败后新确认集：`waveRecheckBaseSeedV16(wave) = 2609270200 + 100*wave`（`:140-145`）、`nextConfirmBaseSeedV16(attempt) = 2609500000 + 100*attempt`（`:148-153`）。
- **CONFIRM20 的运行闸门**：`v17/tools/arena_run_v17.ts:79-81` 在 `PANEL === 'confirm'` 且未显式传 `--allow-confirm true` 时直接抛错；分片脚本只有加 `-AllowConfirm` 开关才透传（`v19/scripts/run_panel_sharded_v19.ps1:58`）。
- **重叠检查的现成模板**：`v18/tools/freeze_recheck40_manifest.py:34-48` 维护 `USED_NAMESPACES` 字典，`:74-95` 做两层检查（seed 集合交集 + 训练池 `trueFamilyId` 交集），并输出 `acceptance.{noNamespaceOverlap,noFamilyOverlapWithTraining,blockCountIs40}`。

### 3.3 已消费的命名空间（尽量列全）

| 命名空间 | base | 状态 | 证据 |
|---|---|---|---|
| `v16_train` | 2609250000 | 已用 | `v18/tools/freeze_recheck40_manifest.py:35` |
| `v16_val` | 2609260000 | 已用 | 同上 `:36` |
| `dev20` | 2609260100 | **已反复使用** | `eval_v16_protocol.ts:108` |
| **`recheck40`（= FRESH40，本次 R3 用的那个）** | **2609260200** | **已消费，已退休** | `eval_v16_protocol.ts:116`；实际产物 `v19/out/run_20260929_v19_02/arena/recheck/*` |
| `confirm20` | 2609260300 | **未消费（保留）** | `eval_v16_protocol.ts:124`；仓库内无 `v19/out/*/arena/confirm/` 目录（`v17/out/v17_20260926_r2/arena/confirm/` 存在但为空） |
| `preflight` | 2609260900 | 已用（非正式） | `eval_v16_protocol.ts:132` |
| `waveRecheck(wave)` | 2609270200 + 100w | 未确定是否用过 | `eval_v16_protocol.ts:144` |
| `nextConfirm(attempt)` | 2609500000 + 100a | 未用 | `eval_v16_protocol.ts:152` |
| `v17_train` | 2610010000 | 已用 | `freeze_recheck40_manifest.py:39` |
| `v17_val` | 2610020000 | 已用（v18 校准复用 rootIndex 20..23/50,51/60） | `:40-41` |
| `recheck40_wave1/2/3` | 2610030100/0200/0300 | manifest 已冻结但**从未运行** | `:42-44`、`:102` |
| `train_collect_wave1/2/3` | 2610050000/2610060000/2610070000 | 已用 | `:45-47` |
| **V19 训练 V2** | `2611000000 + 100000*wave + 1000*mapIndex + seedIndex` | **wave1..4 各 80/80 已消费** | `v19/rollout/collector.ts:54-58`；wave1 seed 实测 2611100000 / 2611101000…；四波 summary 均 `attemptedThisRun=80` |
| 标签种子 | 2609700000（v16）、2610800000（v18） | 已用 | `counterfactual_v16.ts:53`、`counterfactual_v18.ts:62` |
| 续弈种子 | 2609900000（v16）、2026099801/02/03（v18） | 已用 | `counterfactual_v16.ts:52`、`counterfactual_v18.ts:60` |
| 采样种子（V19 训练） | `seed*2 + subjectSeat` | 已用 | `collector.ts:198` |

### 3.4 ⚠️ 一处命名冲突必须注意

`v19/out/run_20260928_v19_01/identity/manifest.json#frozenContracts.recheck40SeedFormula` 写的是：

```
"recheck40SeedFormula": "2610030000 + 100*wave + 10*mapIndex + s, s=0..3"
```

但**实际运行的面板**用的是 `V16_PANELS.recheck.baseSeed = 2609260200`。`2610030000 + …` 是 **V18 自己的 `recheck40_waveN`** 命名空间（`v18/tools/freeze_recheck40_manifest.py:58`），它被冻结成 manifest 但从未运行。两者是不同的命名空间，**不要混用**。

---

## 4. 家族（family）与窗口（window）的定义

### 4.1 family

**权威定义（V16 起）**：`v16/tools/eval_v16_protocol.ts:162-175` 的 `V16Block`

```
blockId, panelId, purpose, mapIndex, mapName, scenarioId,
playerCount, rootSeed, episodeIndex, rootFamilyId,
candidateSeats: number[], seatAlliances: Record<string, number>
```

**家族 id**：`rootFamilyId = <scenarioId>#<rootSeed>#<episodeIndex>`（`:210`）。实测值形如
`SDPLAN:sd-normal:(2) Duel.aem#2609260100#0`（见 `v19/out/run_20260928_v19_01/arena/dev/P1_s2026_v19control.m0.games.jsonl` 第 1 行的 `rootFamilyId` 字段）。

**其他场景下的 family 对象（不统一，需要留意）**：

| 出处 | 字段 |
|---|---|
| `v19/tools/diagnose_dev_families.ts:170-173` 输入清单 | `{id, mapName, seed, seat, expectA?, expectB?, note?}` |
| `v19/tools/make_diag_families.py:66-76` 生成器 | 上述 + `perModel{theta1,theta2,theta3,champion}` |
| `v18/tools/counterfactual_v18.ts:108,144` | `rootFamilyId = row.trueFamilyId ?? row.rootFamilyId` |
| `v18/tools/freeze_recheck40_manifest.py:94` | `f"{mapName}#sd-first-turn-start-v1#{seed}"`（**旧格式，含初始化策略 id**） |
| `v19/rollout/collector.ts:122` | `gameId = f"{runId}|wave{wave}|{mapName}|seed={seed}|seat={subjectSeat}"` |

### 4.2 window

**V16 反事实窗口**（`v16/tools/collect_trajectories_v16.ts:181-206`，schema `v16_failure_window_1`）：

```
gameId, panelId, blockId, mapName, seed, candidateSeat, candidateAllianceId,
outcomeKind, modelSha, modelTag, reason, proofLevel, proofLevelNote,
stepIndex, playerId, allianceId, stateHashBefore,
modelActionCode, l1ActionCode, divergence,
l1ScoreOfModelAction, l1ScoreOfL1Action, l1ScoreGap,
legalActionCount, modelRankInCanonicalOrder,
stateJson, replaySource{gameId, actionDigest, initialStateHash, rulesHash, caps}
```
窗口 id：`windowId = ${gameId}#step${stepIndex}`（`v16/tools/counterfactual_v16.ts:244`）。

**V19 诊断窗口**（`v19/tools/diagnose_dev_families.ts:228-242`，schema `v19_r1_failure_diagnosis_1`）：

```
decisionIndex, engineStepIndex, turn, playerId, legalActionCount,
actionA, actionB, logitsA, logitsB, orderedA, orderedB,
state{...}, counterfactual{forcedAction, appliedTo, outcomeKind, winnerAllianceId,
                           candidateAllianceId, steps, changedOutcome}
```
`engineStepIndex` = 该决策对应的引擎原子步号（= `StepTraceV16.stepIndex`）；`turn` 实测恒为 null（见 §1.4）。

**V18 窗口**（`v18/tools/counterfactual_v18.ts:555, 599-618`，schema `v18_counterfactual_1`）：

```
windowId = `w${NNN}:${gameId}`
windowId, gameId, mapName, phaseBucket, stepIndex, subjectPlayerId, subjectSeat,
rootFamilyId, kinds[], legalActionCount, stateHash, sourceOutcome,
studentBranch, bestBranchActionCode, bestBranchRoles, highCostError,
branches[{actionCode, roles[], naturalWins, naturalLosses, horizonReachedAllSeeds,
          meanUnitsKilled, meanUnitsLost, meanTransitions, replicates[]}]
```

### 4.3 「同一原局及其派生窗口不跨组」在数据上如何表达

1. **id 前缀**：派生窗口 id 以父局 id 为前缀 —— `<gameId>#step<N>`（v16）或 `w<NNN>:<gameId>`（v18）。反向解析即可拿到父局。
2. **配额约束**：
   - `v16/tools/select_windows_v16.ts:71-80` —— 同一 `gameId` 最多取 3 个窗口。
   - `v18/tools/counterfactual_v18.ts:285-308` —— 同一 `rootFamilyId` 最多 `MAX_PER_ROOT = 3`（`:57`）。
3. **分组键的选择**：`v18` 用 `rootFamilyId`（同 map+seed 的家族）而非 `gameId`；`v16` 用 `gameId`。**两者粒度不同**：一个 `rootFamilyId` 对应两个 `gameId`（seat 0 / seat 1）。
4. **缺口**：**没有任何现有脚本实现「20 个开发窗口 + 20 个封存验证窗口，同一原局及其派生窗口不跨两组，每图各 4 个」**。`select_windows_v16.ts` 只有 per-map / per-seat / per-game 配额（`:81-126`），没有两组切分。→ 见 §10。

---

## 5. 面板运行方式

### 5.1 一次跑 DEV20（20 局）的完整命令

```powershell
# 仓库根目录 C:\code\AncinetEmpires
pwsh -NoProfile -ExecutionPolicy Bypass -File v19/scripts/run_panel_sharded_v19.ps1 `
    -RunId run_20260930_v19_03 -Panel dev `
    -ModelKey 'theta1' `
    -Model 'v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json'
```

脚本行为（`v19/scripts/run_panel_sharded_v19.ps1`）：
- `seedsPerMap = if Panel -eq 'recheck' { 4 } else { 2 }`（`:31`）
- 输出目录默认 `v19/out/<RunId>/arena/<Panel>`（`:34`）
- 起 5 个 node 进程（`for $m = 0..4`，`:44`），每个的 argv 是（`:51-55`）：
  ```
  node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/arena_run_v17.ts
       --run-id <RunId> --run-root v19/out/<RunId> --panel <Panel> --arms candidate
       --policy <Policy> --blocks <Panel>:m<M>:s0,<Panel>:m<M>:s1 --out <OutDir>/<name>.m<M>.games.jsonl
  ```
- 日志写 `<runRoot>/logs/<name>.m<M>.panel.log`（+ `.err`）（`:49`、`:61`）
- **成功以产物判定，不以退出码判定**（`:13` 注释、`:74-88`）

### 5.2 一次跑 FRESH40（40 局）

把 `-Panel dev` 换成 `-Panel recheck`（`seedsPerMap` 自动变 4，block 变 `recheck:mM:s0..s3`）。真实用例见 `v19/out/run_20260929_v19_02/arena/recheck/theta1_fresh40.m0..m4.*`。

### 5.3 分片（shard）支持

支持，三个层级：

| 方式 | 参数 | 证据 |
|---|---|---|
| 面板级 5 分片（每图一进程） | ps1 固定做法 | `run_panel_sharded_v19.ps1:44-62` |
| block 取模分片 | `--shard i/n`（`idx % n === i`） | `v17/tools/arena_run_v17.ts:94-101` |
| 显式列 block | `--blocks a,b,c` | `:86-93` |

配套的**续跑与错误重试**：
- `--resume true`（默认）：按 `gameId` 跳过已完成；`--resume false` 且文件已存在时抛错拒绝覆盖（`:73`、`:206-218`、`:334`）
- `--retry-errors true`（默认）：`isError(outcomeKind)` 的行不视为完成，会被重跑（`:74`、`:214`）
- `--dry-run`：只打印计划，不跑（`:75`、`:263-268`）
- v16 版本还有 `--shard` + 实际用过的 4 分片产物（`v16/out/v16_20260926_core/arena/dev/s1a.shard0of4.games.jsonl` …）；v19 分片脚本未使用 `--shard`。

### 5.4 单局典型耗时（实测数字，均标来源）

| 场景 | 局数 | 总 wall | 均值/局 | 最慢 | 来源 |
|---|---|---|---|---|---|
| DEV20 冠军 P1:s2026 | 20 | **1703.7 s（28.4 min）** | **85.2 s** | **468.8 s** | `v19/out/run_20260928_v19_01/arena/dev/P1_s2026_v19control.m{0..4}.games.jsonl` 的 `wallMs`（逐行统计） |
| FRESH40 θ1 | 40 | **3529.7 s（58.8 min）** | **88.2 s** | — | `v19/out/run_20260929_v19_02/arena/recheck/theta1_fresh40.m*.progress.json#wallMs` |
| FRESH40 冠军 | 40 | **3642.4 s（60.7 min）** | **91.1 s** | — | 同上，`P1_champion_fresh40.m*.progress.json` |
| FRESH40 分片墙钟（5 进程并发） | — | m0..m4 = 643.8 / 1018.2 / 500.2 / 132.8 / **1234.7** s | — | — | 同上 `progress.json#wallMs` ⇒ 整个 40 局面板墙钟 ≈ **20.6 min** |
| S1a 教师臂 DEV20 | 20 | 6656 s | **332.8 s** | 903.5 s（撞 900s 墙钟，4 局 `WALL_TIMEOUT`） | `v16/out/v16_20260926_core/arena/dev/s1a.shard{0..3}of4.games.jsonl` |
| V19 训练采样 wave1 | 80 | — | — | — | `v19/out/run_20260929_v19_02/data/wave1/w1.summary.json#throughput` |

单局候选侧网络延迟：`latencyMs.p95` 约 43–58 ms（DEV20 冠军 20 行）。也就是说**单局耗时基本由引擎推进步数决定，不由网络推理决定**。

### 5.5 跑一局的最大步数上限（正式规则）

`v16/tools/eval_v16_protocol.ts:76-85`：

```ts
export const V16_CAPS_V2_900S: V16Caps = {
    maxStepsAtomicActions: 12000,
    wallTimeoutMs: 900000,
    maxPlies: null,
};
export const V16_DEFAULT_CAPS: V16Caps = V16_CAPS_V2_900S;
export const V16_CAPS_ID = 'v16-student-caps-12k-900s-v2';
```

即 **12000 个原子动作 / 900 秒墙钟 / 不设 ply 上限**。历史 caps v1（300s）保留在 `:57-61` 供复算。教师离线搜索允许独立 caps（`:91`，`v16-teacher-caps-12k-900s-v1`），但必须写明。

---

## 6. 结果分类

### 6.1 权威枚举与判定

`v13/tools/eval_v3_core.ts:12-21`：

```
NATURAL_WIN | NATURAL_LOSS | NATURAL_DRAW | STEP_LIMIT | PLY_LIMIT
| WALL_TIMEOUT | CANCELLED | POLICY_ERROR | ENGINE_ERROR
```

判定优先级 `classifyOutcome`（`:57-73`）：

```
cancelled → POLICY_ERROR → ENGINE_ERROR
→ winner !== null ? (winner === -1 ? NATURAL_DRAW : (winner === candidateAlliance ? NATURAL_WIN : NATURAL_LOSS))
→ wallTimeout → PLY_LIMIT（plies >= maxPlies） → STEP_LIMIT（steps >= maxSteps）
→ 兜底 ENGINE_ERROR   // 循环退出但没有规则判决也没有撞预算 ⇒ 视为 harness 缺陷，不伪装成截断
```

辅助判定：`isUndecided`（`:29-31`，STEP_LIMIT/PLY_LIMIT/WALL_TIMEOUT/CANCELLED）、`isError`（`:34-36`）、`isNatural`（`:39-41`）。

### 6.2 `POLICY_ERROR` 在哪里产生与记录

全部在 `playOne` 内（`v14/tools/eval_v14_match.ts`），共 6 处：

| 行 | 消息 |
|---|---|
| `:395` | `'no policy-allowed action'`（候选座位无允许动作） |
| `:423` | predictor 抛出的异常消息 |
| `:429` | `` `no policy-allowed action for seat ${current}` ``（其他座位） |
| `:434` | H0 启发式抛出的异常消息 |
| `:438` | `'policy returned no action'` |
| `:443` | `` `chosen action is not in the policy-allowed set: ${encodeAction(action)}` `` |

写进记录的字段：`error: engineError ?? policyError`（`:617`）；分类经 `classifyOutcome` 变成 `outcomeKind = 'POLICY_ERROR'`（`:504-513`）。

**具体字段名**（逐局 JSONL 行）：
`outcomeKind`、`error`、`fallbackUsed`、`fallbackReason`、`winnerAllianceId`、`candidateAllianceId`。

`fallbackUsed` 只在一种情况置真：模型返回了不在策略允许集合内的动作（`:416-420`，`fallbackReason = 'model returned an action outside the policy-allowed set'`），随后回退到 H0。**教师臂（`policyOverride`）不静默回退**，返回非法动作会走 `:443` 直接记 `POLICY_ERROR` 并终止该局（设计意图见 `v17/tools/arena_run_v17.ts:22-26`）。

### 6.3 训练侧是另一套枚举（不要混用）

`v19/env/subject_episode.ts:38-46`：

```
NATURAL_WIN | NATURAL_LOSS | NATURAL_DRAW
| TRUNCATED_STEP_LIMIT | TRUNCATED_PLY_LIMIT | TRUNCATED_WALL_TIMEOUT
| POLICY_ERROR | ENGINE_ERROR
```

判定顺序 `:557-571`。它把「截断」写在类型名里（`TRUNCATED_*`），并且有硬自检：截断局出现终局回报、或自然终局局缺少终局回报，直接抛错（`:604-609`）。`terminalReturn` 只在自然终局时非 null（`:573`）。

### 6.4 聚合口径

`v19/tools/arena_summary_v19.py:44-73`：

- `wins = outcomes['NATURAL_WIN']`（`:51`）
- `truncated = STEP_LIMIT + PLY_LIMIT + WALL_TIMEOUT + CANCELLED`（`:59-60`）—— **截断不计为胜，也不从分母删除**
- `fallbacks = sum(1 for r in rows if r.get("fallbackUsed"))`（`:65`）
- `errors = sum(1 for r in rows if r.get("error"))`（`:66`）
- 配对键：`(mapName, rootSeed, candidateSeat)`（`:77`，`paired_dev_compare.py:28` 同）

### 6.5 ⚠️ 一处已知的错误判据（R123 §2 已点名）

`v19/tools/diagnose_dev_families.ts:223` 写的是：

```ts
changedOutcome: forced.outcomeKind !== runB.outcomeKind,
```

它把 `POLICY_ERROR != 原结果` 也算成「改变了结果」。审核脚本才补上修正：`v19/review/r123_20260930/audit.py:50` 要求 `cf.get('outcomeKind') in ['NATURAL_WIN','NATURAL_LOSS','NATURAL_DRAW']` 才算有效自然反事实。**S1 新工具必须在 schema 层面把自然结果 / 未跨边界 / 错误分成互斥字段，不能复用这个布尔。**

---

## 7. 模型加载与 SHA 校验

### 7.1 加载流程（四处实现一致）

```ts
const json = fs.readFileSync(abs, 'utf8');                          // 读原始文本
const declared = JSON.parse(json).encoderSchemaId ?? null;           // 取声明的 schema
const expected = declared === null ? null
    : SUPPORTED_ENCODER_SCHEMA_IDS.includes(declared) ? declared
    : (() => { throw new Error(`未知 encoderSchemaId '${declared}'`); })();
const predictor = new SpatialResNetPredictor(
    loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected }));
```

证据：`v14/tools/eval_v14_match.ts:696-714`、`v17/tools/arena_run_v17.ts:123-141`、`v19/rollout/collector.ts:100-107`、`v19/tools/diagnose_dev_families.ts:50-58`。未声明 schema 的历史检查点传 `null`，由加载器按 v13/v1 家族推断（`eval_v14_match.ts:704-705`）。

### 7.2 SHA 的计算与记录

- `checkpointSha256V15(abs)` = `sha256FileBytesV15(abs).sha256`（`v15/tools/eval_v15_identity.ts:175-177`，实现 `:70-80`，**文件不存在直接抛错，不静默降级**）
- 写进 `GameRecord.checkpointSha256`（`eval_v14_match.ts:593`；镜像臂为 null）
- 写进 `progress.json#checkpointSha256`（`arena_run_v17.ts:401`）
- `modelId = <policyId>:<tag>:<sha256 前 12 位>`（`eval_v15_identity.ts:184-193`），进 `gameId`（`arena_run_v17.ts:244-247`）

### 7.3 「与报告一致」的校验发生在哪

| 校验 | 位置 | 做法 |
|---|---|---|
| 同文件续写身份一致 | `v17/tools/arena_run_v17.ts:350-356` | `cacheReuseDiffV15(previous.cacheIdentity.fields, record.cacheIdentity.fields)`，有差异即抛错，拒绝把不同实验写进同一文件 |
| 面板内 SHA 唯一性 | `v19/tools/arena_summary_v19.py:67` | `sorted({r.get("checkpointSha256") for r in rows if r.get("checkpointSha256")})` |
| metrics 声明 SHA ↔ 实际文件 SHA ↔ 面板行 SHA 三方对齐 | `v19/review/r123_20260930/audit.py:37` | `assert sha(ROOT/m['output']['path']) == m['output']['sha256'] == result['panels'][key]['sha'][0]` |
| 冠军 SHA ↔ 审核声明 | `v19/tools/freeze_v19_identity.py:236-243` | `championSha == auditDeclaredSha256` |
| 重放忠实性 | `v16/tools/collect_trajectories_v16.ts:127-133` | `replay.actionDigest !== row.actionDigest` 直接抛错，窗口全部作废 |

**注意**：`arena_run_v17.ts` **没有 `--expect-sha` 之类的参数**——它只算实际 SHA 并如实记录，不做「与用户声称的 SHA 相等」断言。想强制校验必须在调用层（Python 脚本或新增参数）做。

---

## 8. 输出产物结构

### 8.1 一次面板运行（每个分片）会写的文件

| 文件 | schema | 内容 |
|---|---|---|
| `<OutDir>/<name>.m<M>.games.jsonl` | 无（每行一个 `GameRecord`） | 逐局记录；`emitIdentity=true` 时含 `gameId/rootSeed/blockId/rootFamilyId/initialStateHash/mapHash/rulesHash/engineSourceDigest/policySourceDigest/seatAlliances/cacheIdentity{version,fields,key,gameId}` |
| `<OutDir>/<name>.m<M>.progress.json` | `v17_arena_progress_1` | `runId,panelId,panelLabel,official,runMode,modelKey,policy,teacherId,teacherVersion,teacherDigest,modelPath,modelId,checkpointSha256,encoderSchemaId,initializationPolicyId,sourceDigests{engine,policy,h0,runner},outPath,blocks[],arms{candidate,mirror,skipped},failed,appendedRows,wallMs,caps{maxSteps,maxPlies,wallTimeoutMs,capsId},generatedAt`（`arena_run_v17.ts:387-419`） |
| `<OutDir>/<name>.m<M>.blocks.json` | `v17_arena_blocks_1` | `blocks[{blockId,mapName,mapIndex,rootSeed,rows[{gameId,arm,viewedSeat,outcomeKind,winnerAllianceId,candidateAllianceId,steps,turns,plies,wallMs,error}],wallMs}]`（`:426-430`） |
| `<OutDir>/<name>.m<M>.errors.jsonl` | 无 | 只在出现 error 时追加：`{gameId,outcomeKind,error,wallMs}`（`:201`、`:359-362`）。本次勘察的两个 run 里该文件不存在 |
| `<OutDir>/<name>.m<M>.decisions.jsonl` | 无 | **仅教师臂**（b100r/b100q）写（`:420-424`） |
| `<OutDir>/<name>.m<M>.s1stats.json` | `v16_s1_decision_stats_1` | **仅 v16 `--policy s1`** 写（`v16/tools/arena_run_v16.ts:435`） |
| `<runRoot>/logs/<name>.m<M>.panel.log` (+`.err`) | 文本 | 进程 stdout/stderr（`run_panel_sharded_v19.ps1:49,61`） |

事后 Python 汇总另写：
- `<OutDir>/<nameA>_<nameB>.summary.v19.json`（schema `v19_arena_summary_1`，`arena_summary_v19.py:119-134`）
- `<OutDir>/paired_<a>_vs_<b>.json`（`paired_dev_compare.py:58-66`）

### 8.2 真实样例路径

```
v19/out/run_20260929_v19_02/arena/recheck/
    theta1_fresh40.m0.games.jsonl          # 逐局（40 局面板的一图分片）
    theta1_fresh40.m0.progress.json        # 分片元数据
    theta1_fresh40.m0.blocks.json          # block 级逐行摘要
    theta1_fresh40_P1_champion_fresh40.summary.v19.json   # 汇总
    paired_theta1_vs_champion_fresh40.json                # 配对差
v19/out/run_20260929_v19_02/arena/dev/
    ppo_w1_theta1.m0.games.jsonl  ...  ppo_w1_theta1.m4.games.jsonl
    ppo_w1_theta1.summary.v19.json
    paired_theta1_vs_champion.json
v19/out/run_20260928_v19_01/arena/dev/
    P1_s2026_v19control.m0.games.jsonl  ...  m4
v19/out/run_20260929_v19_02/diag/
    families.json  trace.json  trace.log  summary.json  phase_gradient_w1.json
v19/out/run_20260929_v19_02/data/wave1/
    w1.games.jsonl  w1.transitions.jsonl  w1.tensors.f32  w1.summary.json
```

### 8.3 两个必须知道的坑

1. **任务书建议的 `arena/fresh/<panelId>/` 目前不存在**（`V19_LONG_TERM_TASKBOOK.md:284` 只是建议结构）。实际用的是 `arena/recheck/`。
2. **`arena_summary_v19.py` 只扫 `<name>.m0..m4.games.jsonl`**（`:33-35`），**不认分片后缀**。若用 `--shard` 产生 `s1a.shard0of4.games.jsonl` 这类名字，汇总脚本会找不到行并 `raise SystemExit`（`:115`）。v16 曾这样用过。

---

## 9. 「从一局中途某步恢复状态继续跑」的现有能力

### 9.1 已有能力清单

| 能力 | 位置 |
|---|---|
| 逐步抓完整动作前状态 | `playOne` 的 `onStep` + `captureStateOnStep: true` → `trace.stateBeforeJson`（`v14/tools/eval_v14_match.ts:448-466`） |
| 从状态直接建引擎续弈 | `new GameEngine(state)`（`src/game/engine.ts:113-130`）；**不传 `applyInitialTurnStart` ⇒ 不会重复发初始收入 / 不重跑回合开始结算** |
| 带预算的搜索节点 | `PlanningNode.root(state, playerId, spec)`（`src/game/ai/planning.ts:142-144`）；`apply()` 内部 `this.engine.clone()`（`:232`），节点间状态隔离 |
| 根动作 → 续弈到边界/终局 | `v16/tools/counterfactual_v16.ts:116-181`（`runBranch`） |
| 主体阶段 → 敌方完整阶段 → 边界 | `v18/tools/counterfactual_v18.ts:414-545`（`rollout`），显式记 `HORIZON_INCOMPLETE`（`:451`、`:519`） |
| 走完己方剩余行动的原语 | `v16/tools/teacher_s1_v16.ts:363-432`（`completeSideTurn`，`BoundaryStop` 枚举在 `:341-347`） |
| 重放忠实性核对 | `actionDigest` 必须与正式行一致（`v16/tools/collect_trajectories_v16.ts:127-133`、`v19/tools/diagnose_dev_families.ts:183-184`） |

### 9.2 最小可运行示例（≤20 行，改编自 `v19/review/r123_20260930/probe_icy_order.ts`）

```ts
import { createDefaultEnvFactory } from '../../../tools/skirmish_dataset_export';
import { playOne, UNPACK_DIR, SD_PLAN_FILE } from '../../../v14/tools/eval_v14_match';
import { GameEngine } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/types';

const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
let saved: GameState | null = null;
await playOne({
    runId: 'recon', scenarioId: 'SDPLAN:sd-normal:(2) Icy Paths.aem',
    seed: 2609260111, candidateSeat: 0, viewedSeatHint: 0,
    maxSteps: 272, maxPlies: null, wallTimeoutMs: 120000,          // 272 = 目标步 + 1
    predictor: null, checkpointSha256: null, requestedPolicyId: 'h0', envFactory,
    emitIdentity: false, mirrorViewRecompute: false,
    captureStateOnStep: true,
    onStep: (t) => { if (t.stepIndex === 271 && t.stateBeforeJson) saved = JSON.parse(t.stateBeforeJson); },
});
const engine = new GameEngine(saved!);                              // 不重复发初始收入
console.log(engine.getState().turn, engine.getLegalActions(engine.getState().currentPlayer).length);
engine.step(engine.getLegalActions(engine.getState().currentPlayer)[0]);  // 从该状态继续
```

（`probe_icy_order.ts:19-42` 是同一模式的 50 行完整版，跑两条攻击顺序并比较规则后果。）

### 9.3 限制（最关键的一条）

**恢复后 H0 的随机流不连续。**

- `HeuristicAI` 内部持有**有状态的** rng 闭包：`private rng: Rng`（`src/game/ai/heuristic_ai.ts:14-17`），在对局过程中被消费 17 次（`:87, 96, 168, 179, 199, 204, 212, 220, 274, 298, 302, 312, 333, 344` …）。
- `streamFor(seed, seat)`（`v14/tools/eval_v14_match.ts:111-116`）只按 `seed + seat` 生成一条新流；**没有「快进到第 N 次调用」的接口，`HeuristicAI` 也没有 `getState()/setState()/clone()`**。
- 因此照原样 `new HeuristicAI(streamFor(seed, seat))` 从中间状态恢复时，H0 会**从流的开头重新抽随机数**，行为与原局不同。
- **现有工具全部绕开这个问题**：`counterfactual_v16.ts:120` 用独立续弈种子 `2609900000`，`counterfactual_v18.ts:433` 用 `streamFor(seed, seat)` 但 seed 来自 `--continuation-seeds 2026099801,2026099802,2026099803`（`:60`）。它们实现的是「**同一续弈策略 + 共同随机流**」，**不是**「原局 H0 流的连续延伸」。`counterfactual_v18.ts:659-664` 的 disclaimer 明确写了「换续弈策略结论可能改变」。
- `probe_icy_order.ts` 只走两步且不依赖 H0，所以不受影响。

R123 §S0/§S1 的两条硬要求——「同一完整根状态及 **H0 RNG 可克隆恢复**」（`V19_R123_REVIEW_AND_SEARCH_20260930.md:53`）与「原轨迹反事实重放仍**保持原 H0 流连续**，不在途中重置」（`:67`）——**现有工具都不满足**。

其他次要限制：
- `StepTraceV16` 无 `turn` 字段（§1.4）。
- `playOne` 不强制 `maxPlies`（§1.2）。
- `env.getEngine()` 返回的是引擎**内部引用**（不是深拷贝），但 `playOne` 只用它读状态、`engine.step` 推进；`GameEngine.getState()` 本身返回深拷贝（`engine.ts:132-135`），所以 `stateBeforeJson` 是安全的快照。

---

## 10. 为了做「40 窗口、每窗口 当前己方完整动作序列 → H0 真实回应 → 下一己方边界」的搜索，现有工具缺什么

按「缺口硬度」排序：

### G1（最硬）H0 RNG 的可克隆 / 可快进状态

现有 `HeuristicAI` 的 rng 是不可观测的闭包，`streamFor` 无法快进。要做「**H0 真实回应**」且与原局一致，必须：
- 给 `HeuristicAI` 加 `rngState(): number` / `withRngState(s): HeuristicAI`，或把 `mulberry32` 的状态暴露出来（`v14/tools/eval_v14_match.ts:101-108` 与 `src/game/ai/heuristic_ai.ts` 各有一份 mulberry 实现，需要统一）；
- 或在 `playOne` 的每步 trace 里顺带记录「该座位 rng 已被调用多少次」，恢复时快进同样次数。
- 影响文件：`src/game/ai/heuristic_ai.ts`、`v14/tools/eval_v14_match.ts`。**这是唯一需要改核心源码的缺口。**

### G2 分支单位 = 「己方完整动作序列」（而不是单个根动作）

现有两个反事实工具的干预单位都是「只换第一个原子动作，然后全部交回 H0」——`v18/tools/counterfactual_v18.ts:70-80` 亲口写明，并且 **S2（干预单位改成整个玩家阶段）被刻意留空**（`:70-80`，「声明了却没接线，比不声明更糟」）。`teacher_s1_v16.ts:363-432` 的 `completeSideTurn` 有「走完己方剩余行动」的原语，但它是**固定策略**（`cheap-advance-v1` 或启发式最高分），不接受外部注入的任意动作序列。

### G3 搜索树（多候选 × 多分支 × 多续弈），而不是单动作成对比较

`v16/tools/teacher_s1_v16.ts:581-781`（`searchS1Action`）是最接近的骨架：有 root 候选池（`:484-576`，多源保留 heuristic/model/capture/recruit/explore/end_turn）、对手回应宽度（`:657-701`）、边界判定与 `boundaryReachedRatio`（`:774`）、预算与 `truncationStop`（`:606`、`:776`）。但它：
- 用启发式最高分选续弈动作，**不能按「完整动作序列」枚举**；
- 叶子估值是可解释局面量（`:291-315`）而非引擎自然结果；
- **实测性能很差**：S1a 档 DEV20 只有 **2 胜 / 14 负 / 4 局 900s 墙钟超时**，均值 332.8 s/局（`v16/out/v16_20260926_core/arena/dev/s1a.shard{0..3}of4.games.jsonl`）。
- 其默认粗筛宽度 `S1_DEFAULT_PREFILTER_WIDTH = 24`（`:159`）与「无粗筛时约 11 分钟/局」的实测记录（`:153`）说明**吞吐是这条路线的头号风险**。

### G4 v19 的「40 窗口清单 + 20 开发 / 20 封存分组」冻结器

R123 §S1（`:59`）要求：每图 8 个、按家族拆 20 开发 + 20 封存（各图各 4）、**同一原局及其派生窗口不跨两组**、与 DEV / 已消费 FRESH / CONFIRM / 训练 seed 家族做重叠检查、搜索前冻结清单并记录选择条件与全部 40 个分母。

- `v16/tools/select_windows_v16.ts` 只做 per-map / per-seat / per-game 配额（`:66-126`），**没有两组切分**，也没有重叠检查。
- `v18/tools/freeze_recheck40_manifest.py:34-95` 有完整的「命名空间 + 训练家族重叠检查」逻辑，**但它冻结的是面板 seed 清单，不是窗口清单**，可以直接当模板。
- **这两个东西的组合（窗口配额 + 命名空间检查 + 20/20 分组）目前不存在。**

### G5 窗口来源必须是「新的训练 seed 家族」

`v16/tools/teacher_s1_pilot_v16.ts:83` 从 `blocksForPanelV16(SOURCE_PANEL)`（即 DEV / PREFLIGHT / RECHECK 面板 seed）取窗口——**直接复用会污染面板**。R123 §S1 要求从「新的训练 seed 家族」抽窗口。

v19 已有的新家族是 `trainSeedV19(wave, mapIndex, seedIndex) = 2611000000 + 100000*wave + 1000*mapIndex + seedIndex`（`v19/rollout/collector.ts:56-58`），wave1..4 已各采 80 局。**但训练采样只保存了 `actionCodes`（完整动作序列）+ `turnSnapshots`（每个己方回合边界的 canonicalStateHash）**（`v19/env/subject_episode.ts:191-202`、`:211-219`），**没有全量 `stateJson` 快照**。要拿到可恢复的状态，只能按 `actionCodes` 从头重放（用 `playOne` + `policyOverride` 重放动作序列），或者新增 `captureStateOnStep` 式采样。

### G6 「搜索时的结果」与「封存复核结果」分离记录

R123 §S1（`:69`）要求逐窗口分别给出「搜索选择时的结果」和「封存复核结果」。现有工具没有这套字段（`counterfactual_v16.ts:242-268` 与 `counterfactual_v18.ts:599-618` 都是单份记录）。

### G7 每窗口预算与总预算硬闸 + 断点续跑

R123 §S1（`:65`）要求「每窗口最多 10 分钟，40 窗口总预算不超过约 7 小时」。现有工具只有 per-branch 的 `--max-transitions` / `--wall-ms`（`counterfactual_v18.ts:58-59`），**没有 per-window / 全局预算，也没有按窗口续跑**（`counterfactual_v18.ts:553` 的循环没有 resume 逻辑）。

### G8 逐窗口输出 schema 的规范化字段

R123 §S1（`:69`）点名的字段：根状态 hash、家族、**阶段**、**完整动作序列**、**双方合法性**、**预算**、自然结果 / 未知 / 错误、战术收益、验证结果、**实际耗时**。

最接近的是 `counterfactual_v18.ts:599-618` 的 `windowReports`，但缺：阶段（`phaseBucket` 有但来源是训练 rollout 行，`:147`）、完整动作序列（只在 `branches[].replicates[].actionCodes` 里，v16 版有 `BranchResult.actionCodes`）、预算、实际耗时。

### G9 自然结果 / 未跨边界 / 错误的互斥判据

必须新写，不能复用 `diagnose_dev_families.ts:223` 的 `changedOutcome`（§6.5）。可参考 `v18/tools/counterfactual_v18.ts:525-543` 的 `viewedOutcome = 'UNDECIDED_TRUNCATED'` 与 `incompleteReason` 分离写法。

### G10 汇总脚本的命名约束

`v19/tools/arena_summary_v19.py:33-35` 只认 `<name>.m0..m4.games.jsonl`。若 S1 想复用面板汇总口径，输出命名必须守规矩，不能用 `--shard` 后缀。

### 已经**不需要**重做的部分（避免重复实现）

- 引擎 / 规则 / 合法动作过滤 / 评测 caps：全部冻结（`v19/out/run_20260928_v19_01/identity/manifest.json#frozenContracts`）。
- 流式轨迹、谱系（lineage）、价值预热、KL 早停：已完成（`v19/out/run_20260929_v19_02/progress.json` A/B 节）。
- 从状态恢复续弈的引擎语义（`new GameEngine(state)` 不重复发初始收入）：已正确。
- 候选池构造、对手回应宽度、边界判定、预算截断标记：`teacher_s1_v16.ts` 已有可复用骨架。
- 成对续弈 + 多 replicate + 净兵力差 + `HORIZON_INCOMPLETE`：`counterfactual_v18.ts` 已有可复用骨架。
- 命名空间重叠检查：`freeze_recheck40_manifest.py` 已有可复用模板。

---

## 11. 一句话的最小可行 S1 实现路径

**以 `v18/tools/counterfactual_v18.ts` 的 `rollout()`（边界判定 + 多 replicate + `HORIZON_INCOMPLETE`）为骨架、以 `v16/tools/teacher_s1_v16.ts` 的 `buildRootCandidates()`/`completeSideTurn()`（候选池 + 走完己方回合）为搜索内核，新建一个 `v19/tools/s1_window_search.ts`：输入 = 新训练家族（`trainSeedV19(wave≥5, …)` 或新的 `replay` 采样）里由 `playOne + captureStateOnStep` 重放出的窗口清单（`v19/tools/freeze_s1_windows.py` 按 `rootFamilyId` 做 20 开发 / 20 封存分组并复用 `freeze_recheck40_manifest.py` 的重叠检查），分支 = 「己方完整动作序列」（复用 `completeSideTurn` 但允许注入动作序列），每个分支续弈到「下一个己方边界」，H0 侧先按现有独立续弈流实现（**G1 未解决前不得声称是「原局 H0 流的连续延伸」**），逐窗口落盘 `rootStateHash/family/phase/actionSequence/legal/budget/outcome∈{NATURAL_WIN,NATURAL_LOSS,NATURAL_DRAW,HORIZON_INCOMPLETE,POLICY_ERROR,ENGINE_ERROR}/tacticalDelta/elapsedMs` 并分「搜索选择结果」与「封存复核结果」两份字段。**

预计先要做的 3 件事（按顺序）：
1. 跑 `v16/tools/teacher_s1_pilot_v16.ts --mode pilot` 同口径的**吞吐预演**（前 2 个开发窗口），确定「每窗口 10 分钟 / 总 7 小时」是否可行——`S1a` 的历史读数（332.8 s/局、4/20 超时）说明这是首要风险。
2. 写窗口清单冻结器（G4/G5）并核对与 DEV20 / 2609260200 / 2609260300 / 2611xxxxxx 训练家族无重叠。
3. 决定 G1 的处置：要么给 `HeuristicAI` 加 rng 状态克隆（改核心源码，需谨慎并重跑受影响基线），要么在报告里如实声明「H0 用预登记的独立续弈流」，不声称「原 H0 流连续」。

---

## 附录 A：本报告用到的关键文件索引

| 主题 | 文件 |
|---|---|
| 一局的唯一实现 | `v14/tools/eval_v14_match.ts` |
| 面板 / seed / caps 冻结常量 | `v16/tools/eval_v16_protocol.ts` |
| 结果分类 | `v13/tools/eval_v3_core.ts` |
| 身份 / SHA | `v15/tools/eval_v15_identity.ts`、`v14/tools/eval_v14_protocol.ts` |
| 面板运行器（TS） | `v17/tools/arena_run_v17.ts`（v19 实际调用）、`v16/tools/arena_run_v16.ts`（含 `--policy s1`） |
| 面板运行器（PS1，分片） | `v19/scripts/run_panel_sharded_v19.ps1`（= v18 版 + 输出根改 v19） |
| 面板汇总 | `v19/tools/arena_summary_v19.py`、`v19/tools/paired_dev_compare.py` |
| 家族 / 窗口诊断 | `v19/tools/diagnose_dev_families.ts`、`v19/tools/make_diag_families.py`、`v19/tools/summarize_diag_trace.py` |
| 训练采样 | `v19/rollout/collector.ts`、`v19/env/subject_episode.ts` |
| **搜索教师（可复用骨架）** | `v16/tools/teacher_s1_v16.ts` |
| **成对续弈（可复用骨架）** | `v16/tools/counterfactual_v16.ts`、`v18/tools/counterfactual_v18.ts` |
| **窗口选择（可复用骨架）** | `v16/tools/select_windows_v16.ts` |
| **命名空间冻结（可复用模板）** | `v18/tools/freeze_recheck40_manifest.py` |
| 从状态恢复的现成范例 | `v19/review/r123_20260930/probe_icy_order.ts` |
| 任务合同 | `v19/V19_R123_REVIEW_AND_SEARCH_20260930.md`、`v19/V19_LONG_TERM_TASKBOOK.md` |

## 附录 B：本次勘察中标注「未确定」的项

1. `waveRecheckBaseSeedV16(wave) = 2609270200 + 100*wave` 是否被实际使用过 —— **未确定**（仓库内未见对应 arena 产物）。
2. `V16_PANELS.preflight`（2609260900）的实际运行产物位置 —— **未确定**（`v16/out/v16_20260926_core/arena/preflight_caps300s/` 存在，但未逐行核对 seed）。
3. `v17/out/v17_20260926_r2/arena/confirm/` 目录存在但为空，是否曾有计划运行 —— **未确定**（按 `arena_run_v17.ts:79-81` 的闸门，未传 `--allow-confirm` 时应当抛错）。
4. 「已消费 namespace」的完整清单：本报告基于仓库内可见的 arena 产物 + 各版本冻结 manifest 汇总；**仓库外的评测无法排除**（`v19/review/r123_20260930/audit.py:75-76` 已声明同一范围限制：只扫了 V14–V18 的 200 份 `arena/*.games.jsonl`，`overlaps=[]`）。
