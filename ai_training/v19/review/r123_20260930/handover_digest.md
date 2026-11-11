# V19/V18 证据与规则交接摘要（避免重复劳动版）

编写日期：2026-09-30。编写者：证据核对与文档摘要。**本文件只做汇总，不产生新实验结论。**

- 用途：给后续执行者一份「哪些已完成、哪些数字已被推翻、哪些缺陷还开着」的单页索引。
- 权威顺序：本文件 < `v19/V19_R123_REVIEW_AND_SEARCH_20260930.md`（最新审核）< `v19/V19_RUN02_REVIEW_AND_NEXT.md` < `v19/V19_PROGRESS_REVIEW_20260929.md` < `v19/V18_REVIEW_AND_RULES.md`；原始 run 报告与逐局文件是事实来源，本文件只做引用。
- 凡本文件写「未确定」的，表示在引用文件里查不到可复算依据，**不得**在后续报告里当成已证实数字使用。
- 编码提示：`v19/review/r123_20260930/audit_console.txt` 是 GB18030 而非 UTF-8（用 UTF-8 读取会报错）；`audit.json` 是同内容的 UTF-8 版本，优先读它。

---

## 1. 游戏规则要点（只保留影响搜索与训练的条目）

权威顺序：引擎与实测探针 > 回归测试 > APK 资料 > 旧笔记（`v19/V18_REVIEW_AND_RULES.md:127`）。**本节未写文件名的 `:行号` 一律指该文件**；五图实测见 `v19/review/rules_and_encoding_probe.json:2-122`。

- **五图**（:131-137）：Duel 13×13、Icy Paths 15×15、Liberty Port 13×13、Mourningstar 11×11、Crossed swords 11×18；配置初始金币均 300，先手首步实得 450/550/450/500/550，首步合法招募 9/11/9/11/11；后手轮到才按自己建筑结算，不是双方各加一次（:139）。
- **经济与终局**：回合开始＝城镇 50＋城堡 100＋存活指挥官 50＋25×等级（:141）；单位上限 30、等级上限 3、`populationLimit` 未配置（:144）；指挥官再招 400、每死一次 +100 且保留等级经验（:143）；淘汰仅当「无存活单位且无城堡」，按剩余联盟判胜（:142；`src/game/engine.ts:956-986`）。`winnerAllianceId`＝最后存活联盟 id，−1＝平局，null＝未终局；主体回报 +1/−1/0（`v19/env/subject_episode.ts:666-670`）。
- **动作与回合**：移动/攻击/占领/待机/招募/结束回合是独立原子动作，一步≠一个玩家回合，移动后常需继续选攻击或占领（:151）；无实质动作时引擎自动换手，必须看实际 `currentPlayer`（:152）；普通单位占己方城堡挡招募，空城堡与指挥官堆叠 pending 规则不同（:153-154）；突击有攻击后余动、德鲁伊可重置友军（:155）；评测只过滤投降（:156）。
- **地形与战斗**：真实地形消耗与占位路径（友军可穿不可停、敌军阻挡、飞行例外）（:160）；道路 1/0、森林 2/10、山脉 3/15、丘陵 2/10、深水 3，APK 可覆盖（:161）；顺序＝伤害→附加状态→攻击者升级→反击，次序改变生存结论（:163）；普通反击需存活、相邻、射程覆盖，致盲会改普通射程（:163）；回合开始另结算恢复/中毒/状态衰减/行动重置/墓碑（:164）；致盲/投毒/虚弱等状态见（:173）。
- **兵种**：士兵 150/人鱼 200/圣骑士 400 可占镇（:170）；史莱姆物防 40、魔防 −10（:171）；弓箭手 2–3、投石车 3–5、狼射手 1–3（:172）；圣骑士治疗 40+10×等级（:174）。
- **训练/搜索硬约束**：自然胜负只取引擎 winner，截断不得伪造（:88-90；`rules_and_encoding_probe.json:186-191`：maxPlies=1 时 winner=null，环境却返回 done=true、reward=−1）；必须学扩张收入、保护并使用指挥官、招募出口、翻盘再招与清场（:147）。

---

## 2. H0 是什么

| 项 | 事实 | 证据 |
|---|---|---|
| 身份 | H0＝项目既有启发式对手（生产默认 `HeuristicAI`），不是网络、不是搜索 | `v16/V16_EVALUATION_PROTOCOL.md:12`；`src/game/ai/heuristic_ai.ts:13` |
| 实现位置 | 三文件闭包：`src/game/ai/heuristic_ai.ts`、`src/game/ai/tactical_evaluation.ts`、`src/game/ai/tactical_pathfinding.ts` | `v16/out/v16_20260926_core/identity/source_manifest.json:59-71` |
| 冻结方式 | 源码清单 `sha256-filelist-v1`，h0 组 digest＝`e648bf9464b2656cf2860008aba84aabc0aee5d19805c0c3ff987c672f1d3fa8`；V19 复核结论 `sameAsV17=true`、`sameAsV18=true` | `v19/out/run_20260928_v19_01/identity/manifest.json:81-89`、`:114-118` |
| 随机流身份 | `heuristic-seatstream-v1`：每座位独立确定性流 `streamFor(seed, seat)`，同 seed 同座位→同一条流；每局重建，禁止跨局复用 | `v14/tools/eval_v14_match.ts:110-116`；`v16/V16_EVALUATION_PROTOCOL.md:13` |
| 对局中如何调用 | 非主体座位一律 `new HeuristicAI(streamFor(seed, seat))`，调用约定与正式 arena 相同，不传候选集 | `v19/env/subject_episode.ts:330-331`、`:489-490` |
| 「不改 H0」的工程含义 | ① 不能改这三个文件的任何行为语义；② 不能靠削弱/增强对手换胜场（要改教师必须另立 S1/S2 新 id）；③ 任何分叉/反事实续弈必须**保持原 H0 随机流连续**，不得中途重新初始化；④ 搜索/蒸馏中 `catch → H0` 兜底必须记录回退次数，否则不算纯教师结果 | `v16/V16_EVALUATION_PROTOCOL.md:12`；`v19/V19_RUN02_REVIEW_AND_NEXT.md:92`；`v19/V19_LONG_TERM_TASKBOOK.md:231` |

注：v19 的 policy 组摘要**已变化**（`c1224334…` → `5b39c2b61586ce9a456244aef8ffe95fb85534382c7402ed35efd05e3231c618`，仅 `src/game/ai/spatial_conv_net.ts`，原因是修测试夹具），engine/runner/h0 三组未变（`v19/out/run_20260928_v19_01/identity/manifest.json:58-127`）。这不是 H0 变动。

---

## 3. 已完成事项清单（**已完成，不要重做**）

### 3.1 表示 schema v19（34 通道）
- 新 schema `spatial34_global20_actionSemantics53_v19`，26 个旧通道逐位不变，新增通道修掉两个已证实反例：史莱姆/水元素位置身份碰撞（差异出现在 Ch26/28/29/30，旧 26 通道完全相同，而引擎实伤 20 vs 45）、敌军已行动时旧 Ch21 当前威胁读 0 / 新 Ch31 下一敌方行动阶段威胁读 1。
- 证据：`v19/representation/schema_v19.test.ts`（10 项验收）、`src/game/ai/spatial_tensor_encoder.ts`、`v19/out/run_20260928_v19_01/progress.json` 阶段「T19-01a」。
- 跨语言：200 个真实快照（五图各 40、覆盖 8 类动作）4/4 通过，空间张量与全局特征最大绝对差 ≤1e-6；顺带修掉 Python `estimate_counter_damage` 只实现 V14 口径的缺陷（改为语义变体显式分派，默认值仍 v14）。证据：`v19/tests/test_encoder_parity_v19.py`、`v19/out/run_20260928_v19_01/parity/snapshots_v19.report.json`。
- 未完成部分：Ch31 仍是曼哈顿半径（无地形/最小射程/多单位），Ch32 仍按 `hasMoved`（见 §6）。

### 3.2 训练环境与采样通道
- 主体环境 `v19/env/subject_episode.ts`：自然终局与截断类型分离（截断 `terminalReturn=null`）、终局回报归到最后一条主体决策、`behaviorLogProb` 可重放；修掉两个真实缺陷（终局发生在对手回应阶段时回报丢失；采样写盘无背压导致 25 分钟涨到 2.5GB 且中断丢数据）。12 个手工可核算短局全部满足「截断⟺无终局回报」。
- 分块流式写出（默认 `--chunk-size 256`，滞后一块承接终局回报），**2000 条记录上限已废弃**；wave1–wave4 全部 `recordCappedGames=0`、`recordCompleteness=1.0`，含 11804/11680/11541 条主体决策的超长局被完整记录。
- 采样器 `v19/rollout/collector.ts`：seed 公式 `V19_TRAIN_SEED_BASE_V2 + 100000*wave + 1000*mapIndex + seedIndex`（每图 1000 个 seed 并做全局唯一断言）；队列 seed 最外层、地图次之、座位最内层；`--resume` 按 gameId 只补缺失局。
- 证据：`v19/env/subject_episode.ts`、`v19/env/subject_episode.test.ts`、`v19/rollout/collector.ts`、`v19/out/run_20260929_v19_02/data/wave1/w1.summary.json`、`v19/out/run_20260929_v19_02/acceptance/verdict.json`（A4：4/4 恢复局 actionDigest 一致）。
- 吞吐实测（wave1，CPU）：19.48 引擎步/秒、9.70 网络决策/秒、34.47 自然局/小时（`w1.summary.json:49-58`）；wave4：27.40 步/秒、17.36 决策/秒、74.05 自然局/小时。

### 3.3 检查点保存钩子修复（T19-00）
- 旧实现只在 epoch 结束后比较 `consumption.updates == point`，导致 1000/2000 时点被漏掉（V18 只剩 best/u4000/final）。
- 修后挂钩真实 optimizer update；smoke 用 3/5/7 三个点（5 落在 epoch 中点）验证 SHA 与更新数一致：3 个快照、9 行 ledger、`missingIntermediateUpdates=[]`、`passed=true`。
- 证据：`v19/out/run_20260928_v19_01/hook_smoke/hook_verification.json`、`v19/scripts/t19_00_checkpoint_hook_smoke.ps1`。

### 3.4 两个失败 schema 测试夹具（已修）
- V18 时 `tools/skirmish_spatial_conv_net.test.ts` 两个手工权重夹具缺 `encoderSchemaId`，Vitest 为 487 通过 / 2 失败（`v19/V18_REVIEW_AND_RULES.md:187`、`v19/task_status.json:27-31`）。
- T19-00.4 已修：`createInitializedSpatialResNet` 声明 `encoderSchemaId` 并按 schema 推导层形状，**未放宽** schema 校验，历史权重仍走 `loadSpatialResNetFromJson` 兼容路径；同根因的 5 个 v8 用例一并恢复。证据：`v19/out/run_20260928_v19_01/identity/reverification.json`、`v19/out/run_20260928_v19_01/identity/manifest.json:217-221`。
- 副作用已重验：policy 组摘要变化后，冠军 DEV20 与 V18 控制组**逐局 20/20 一致**（`reverification.json:19-37`）。

### 3.5 PPO 生产链与三波连续训练（V19 第二窗口，`run_20260929_v19_02`）
- 生产链（连续，`chainVerified=true`）：`e999131c… → 0089afe6… → 05495a35… → 60450d04…`（`v19/out/run_20260929_v19_02/lineage.json:75-116`）。
- 三波各 80/80 新局、0 错误、记录完整率 1.0，五图各 16 局：

| 波 | 行为 SHA | 输出 SHA | transition | 入训决策 | 自然胜/负/截断 | 更新数 | DEV20 |
|---|---|---|---:|---:|---|---:|---:|
| 1 | e999131c | 0089afe6（θ1） | 78004 | 42979 | 14/63/3 | 1344（无 KL 事件） | 6/20 |
| 2 | 0089afe6 | 05495a35（θ2） | 80422 | 68222 | 19/59/2 | 1326（KL 早停） | 4/20 |
| 3 | 05495a35 | 60450d04（θ3） | 89229 | 53978 | 15/62/3 | 1439（KL 早停） | 4/20 |

- 证据：`v19/out/run_20260929_v19_02/data/wave{1,2,3}/w*.summary.json`、`v19/review/run02_followup/audit_run02.json:60-419`、`v19/out/run_20260929_v19_02/arena/dev/*.summary.v19.json`。
- 每波逐行完整性已验证：决策编号连续、每局仅最后一条带 terminal、截断无终局奖励、`actionDigest` 复算一致（`v19/V19_RUN02_REVIEW_AND_NEXT.md:21`）。
- 第一窗口（`run_20260928_v19_01`）也已完成、**不要重做**：pilot 10 局 4463 transition（DEV 3/20）、wave1 71/80 局 19047 transition（DEV 3/20）、wave1+价值预热（DEV 3/20）、wave2（34 通道）80 局 32556 transition（DEV 5/20）。证据：`v19/out/run_20260928_v19_01/progress.json`、`v19/review/progress_20260929/audit_progress.json:359-875`。

### 3.6 R1 / R2 / R3（第三窗口，已完成）
- **R1 失败机制定位**：4 个家族 × 2 窗口 = 8 个，8/8 `actionDigest` 与 DEV 一致；5 个是有效自然反事实，其中 **2 个改变胜负**（icy-0111-s0 决策#156、mou-0130-s0 决策#11）。证据：`v19/out/run_20260929_v19_02/diag/{families,trace,summary}.json`、`v19/review/r123_20260930/audit.json:218-473`。
- **阶段梯度诊断**（wave1，每阶段 256 条，只诊断不更新）：决策占比 10.0%/18.1%/72.0%，原始绝对优势 0.3967/0.1871/0.0348。证据：`v19/out/run_20260929_v19_02/diag/phase_gradient_w1.json`。
- **R2 对照**：同一 θ1 起点、同一批 θ1 新采 wave4 80 局（65844 transition、行为 SHA=0089afe6、记录完整率 1.0）、同 43369 条入训决策；唯一变量是阶段权重（control=uniform / fix=equalized）。结果 control 4/20（3 局截断）、fix 6/20（0 截断），配对 +2、17/20 相同。**控制臂精确复现历史 θ1 SHA**（`verify/ppo_w1_uniform/ppo_w1_uniform.json` = 0089afe6…），证明重构保行为。
- **R3 独立复核**：θ1 与 P1 在同一 40 局面板（命名空间 2609260200）各 40 场，**9/40 对 9/40，配对差 0，35/40 结果相同**；该面板到此退休。
- 证据：`v19/out/run_20260929_v19_02/R1_R2_R3_REPORT.md`、`v19/review/r123_20260930/audit.json`、`v19/review/r123_20260930/icy_order.json`。
- 历史面板重叠检查已完成：扫描 V14–V18 共 200 份 `arena/*.games.jsonl`，与本次 FRESH40 的 `map×seed×seat` **无重叠**（`audit.json:478-482`）。

### 3.7 U_best / K_best 补评（T19-00）
- U_best `c84b743a…`：3/20（2 截断）；K_best `7fd3294c…`：4/20（1 截断）；均未超过冠军 5/20，保留为负结果、不申请 FRESH。
- 证据：`v19/review/progress_20260929/audit_progress.json:256-357`、`v19/out/run_20260928_v19_01/identity/manifest.json:194-209`。

### 3.8 验收与测试（不要重跑整套）
- 第二窗口定向复跑：TS schema/env **26/26 通过**（含真实分块机制对局）、Python PPO 合同/parity **12/12 通过**（`v19/review/run02_followup/vitest.txt`、`pytest.txt`）。TS 必须带 `NODE_OPTIONS=--openssl-legacy-provider`，否则 8 个环境用例在 APK 解密初始化失败（`v19/review/progress_20260929/vitest.txt` 与 `vitest_with_node_options.txt` 的对比）。
- 第一窗口：TS 20/20、Python 12/12（`v19/review/progress_20260929/{vitest_with_node_options,pytest}.txt`）。
- **注意**：`v19/_tmp_fulltest.txt` 是全库历史失败快照，实际为 **47 failed / 997 passed（1044 测试）**，不是「40 个历史失败」；本次审核未重跑全库（`v19/V19_PROGRESS_REVIEW_20260929.md:40`）。

---

## 4. 当前模型与成绩台账

冠军未变更：**P1:s2026**，`v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json`，SHA `b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899`，DEV20 **5/20**（Duel2 / Icy0 / Liberty2 / Mourningstar0 / Crossed1，0 截断），CONFIRM20 **未运行**。证据：`v19/task_status.json:9-15`、`v19/review/audit_v18.json:22-45`、`v19/out/run_20260928_v19_01/identity/manifest.json:182-193`。

| 名称 | SHA256 | DEV20 | 独立面板 | 证据文件 |
|---|---|---|---|---|
| 冠军 P1:s2026 | `b705b52a…e06899` | 5/20 | FRESH40 9/40（2 截断） | `v19/review/r123_20260930/audit.json:40-52` |
| 迁移 P1（34 通道零初始化） | `1339764a…6cec361` | 未单评 | — | `v19/out/run_20260929_v19_02/lineage.json:8-12`；`v19/out/run_20260928_v19_01/experiments/migrated/P1_to_v19schema.json` |
| θ0 34 通道候选 | `e999131c…bd339c9` | 5/20（1 截断） | — | `v19/review/progress_20260929/audit_progress.json:197-254` |
| θ1（探索最好） | `0089afe6…19a30b47` | **6/20**（0 截断） | FRESH40 **9/40**（0 截断） | `v19/review/run02_followup/audit_run02.json:3-19`；`v19/review/r123_20260930/audit.json:28-39` |
| θ2 | `05495a35…8bf8f21e9` | 4/20 | — | `v19/review/run02_followup/audit_run02.json:20-36` |
| θ3 | `60450d04…92349ed6` | 4/20（与 θ2 20/20 同胜负、仅 2/20 同 actionDigest） | — | `audit_run02.json:37-59` |
| R2 control（uniform） | `a161269e…f96c395` | 4/20（3 截断） | — | `v19/review/r123_20260930/audit.json:3-15`、`:122-169` |
| R2 fix（equalized） | `833d0ff7…f971aba0` | **6/20**（0 截断） | 未申请 FRESH（未达 ≥7/20） | `audit.json:16-27`、`:170-216` |
| V18 U_best | `c84b743a…8b4e0da` | 3/20（2 截断） | — | `audit_progress.json:307-357` |
| V18 K_best | `7fd3294c…49d460` | 4/20（1 截断） | — | `audit_progress.json:256-306` |
| V18 U_final / K_final | `e117160d…d29bd6` / `a539c63f…707c6f` | 4/20 / 4/20 | — | `v19/review/audit_v18.json:96-159` |
| V18 A_final / B_final | `8712cc36…2b8a6e` / `4ff2e29c…a677fe2` | 5/20 / 4/20 | — | `audit_v18.json:46-95` |

- 面板定义：DEV20 seed ＝ `2609260100 + 10*mapIndex + s, s=0,1`（每图 4 局）；本次 FRESH40（RECHECK40 命名空间）实际用 `2609260200 + 10*mapIndex + s, s=0..3`（每图 8 局）；CONFIRM20 预定 `2609260300 + 10*mapIndex + s`。证据：`v19/out/run_20260928_v19_01/identity/manifest.json:238-241`、`v19/out/run_20260929_v19_02/arena/recheck/theta1_fresh40.m1.games.jsonl`（实测 seed 2609260210–213）。
- 三波 DEV 轨迹：θ0=5 → θ1=6 → θ2=4 → θ3=4，净 −1；R2 fix 受控 +2 但绝对 6/20；R3 独立面板配对差 0。**结论：至今没有任何候选拿到独立胜场收益，正式 18/20 目标未完成。**（`v19/task_status.json:51`）
- UI 默认内置权重与冠军**不是同一文件**（`spatial_resnet_checkpoint.json` `a6a88b20…` 等 3 个空间权重均 ≠ 冠军），所以界面试玩结果不能代表实验冠军；T19-08 的 UI 同权重验证未做。证据：`v19/review/audit_v18.json:620-627`、`identity/manifest.json:243-267`。

---

## 5. 已被最新审核推翻或需要修正的表述

最新审核＝`v19/V19_R123_REVIEW_AND_SEARCH_20260930.md`（§2 三处修正）＋`v19/V19_RUN02_REVIEW_AND_NEXT.md`（§2 两处修正）＋`v19/V19_PROGRESS_REVIEW_20260929.md`（§1、§3）。以下旧表述若继续沿用即为错误。

| # | 旧表述（出处） | 修正后表述 | 证据 |
|---|---|---|---|
| 1 | 「两处决定性差异是策略头近乎并列，Δlogit 0.25 / 0.64」（`v19/out/run_20260929_v19_02/R1_R2_R3_REPORT.md:42-46,50`） | **0.25/0.64 是跨模型取分，不是同模型动作差**。同模型内：Icy θ1 Δ≈0.0445（11.9646 vs 11.9201）、θ2 Δ≈0.0294（11.7133 vs 11.7427）；Mourningstar θ1 Δ≈0.2823、θ2 Δ≈0.2810。0.25＝11.9646−11.7133，0.64＝26.6747−26.0317，都跨了两个模型。可以说「同模型内分差很小、选择容易翻转」，**不能**说「动作价值几乎相等」或据此解释训练失败 | `v19/review/r123_20260930/audit.json:225-253,414-442`；`V19_R123_REVIEW_AND_SEARCH_20260930.md:39` |
| 2 | 「两个案例都属开局」（同上报告 §1.2） | Icy 决策#156 在**回合 10**，按现行分桶（early≤5 / mid 6–15 / late>15）属**中盘**；只有 mou-0130-s0 决策#11（回合 2）是开局。不能把两个案例都写成开局失误 | `V19_R123_REVIEW_AND_SEARCH_20260930.md:39`；分桶定义 `v19/training/ppo.py:613-618` |
| 3 | 「开局只占 10% 决策却只拿到约 **18%** 共享骨干梯度」（`R1_R2_R3_REPORT.md:61`） | 18% **不是实测梯度占比**，且无法从产物复算：`phase_gradient_w1.json` 只给各阶段**分别归一优势后**的梯度范数（policyLoss 的 gradSharedTrunk＝1.2292/6.6537/6.9971；直接归一为 8.3%/44.7%/47.0%，本摘要复算）。18% 与中盘决策占比 18.1% 数值相同，来源**未确定**。可安全引用的只有：决策占比 10.0%/18.1%/72.0%、原始绝对优势 0.3967/0.1871/0.0348 | `v19/out/run_20260929_v19_02/diag/phase_gradient_w1.json:9-120`；`V19_R123_REVIEW_AND_SEARCH_20260930.md:40` |
| 4 | 「fix 已经把三个阶段梯度三等分（33.3%×3）」（`R1_R2_R3_REPORT.md:83`） | 33.3% 是**数据总权重份额**，不是实测梯度份额。字段 `effectiveGradientShareByPhase` 的计算式就是 `阶段样本数 × 阶段权重 / Σ(样本数×权重)`；实际梯度还受优势、导数方向、minibatch 归一化、熵项与早停影响。要写「梯度占比」必须另做按阶段的真实梯度测量 | `v19/training/ppo.py:620-645`；`v19/review/r123_20260930/audit.json:190-216`；`V19_R123_REVIEW_AND_SEARCH_20260930.md:40` |
| 5 | 「两臂匹配同一优化预算，差异来自阶段权重」（`R1_R2_R3_REPORT.md:74-75`） | 起点、数据（80 局/43369 决策）与上限相同，但**实际更新数不同**：control 执行 **1356** 次（跑完 2 epoch），fix 因 KL 早停只执行 **750** 次。可以比较这两套完整配置的实际结果，**不能**把 +2 完全归因于阶段权重；各自贡献比例**未确定** | `v19/review/r123_20260930/audit.json:142,189`；`V19_R123_REVIEW_AND_SEARCH_20260930.md:41` |
| 6 | 「独立价值验证改善 94.2%/97.5%/95.2%」（三波报告与 `progress.json`） | 该数字按**上波每局等权常数** vs **本波每条决策等权 MSE** 计算，分布口径不一致。改口径后：上波决策等权常数→本波决策 MSE＝**85.0%/86.8%/83.5%**；每局先算 MSE 再各局等权＝**65.3%/78.9%/66.0%**；**仅每局第一步**＝**7.2%/11.0%/9.1%**。三列不是同一指标，不得挑最好看的一列；总体 MSE 好**不代表**开局决策或相近候选排序好 | `v19/review/run02_followup/audit_run02.json:76-82,190-196,312-318`（含 `phase.firstDecision.mse` 与 `constantMse`）；`V19_RUN02_REVIEW_AND_NEXT.md:37-48` |
| 7 | 「干预 8 次里 changedOutcome 多次为真」（`diag/trace.json` 字段；工具口径） | 工具把 `forced.outcomeKind !== runB.outcomeKind` 直接写成 `changedOutcome`（`v19/tools/diagnose_dev_families.ts:223`），于是 **POLICY_ERROR ≠ 原结果也算「改变了结果」**：按旧字段 8 个窗口有 **5 个** changedOutcome=true，按「有效自然反事实且结果类别改变」只有 **2/8**（icy-0111-s0#156、mou-0130-s0#11）。后续只按真实自然结果判断改善，错误与截断必须单列 | `v19/review/r123_20260930/audit.json:242-279`（对照 `changedOutcome` 与 `changedNaturalResult`）；`V19_R123_REVIEW_AND_SEARCH_20260930.md:43` |
| 8 | 「34 通道候选与冠军 **17/20 局结果不同**」（`v19/out/run_20260928_v19_01/progress.json:92`） | 写反了：应为 **17/20 局结果类别相同**，只有 3 局变化（Icy 2609260111 seat0 负→胜；Liberty 2609260121 seat1 胜→负；Mourningstar 2609260131 seat0 负→步数截断）。同一文件 `:80` 又写「17/20 局结果相同」，自相矛盾；动作轨迹不同与胜负类别不同也要分开 | `v19/review/progress_20260929/audit_progress.json:226-249`；`V19_PROGRESS_REVIEW_20260929.md:23` |
| 9 | 「H0 镜像 10/20 / B100-Q 12/20 是模仿网络的胜率上限」 | 那是**观测基线**，不是任何模仿网络的数学上限（近似模仿可能因平滑、随机性超过教师）。成立的说法只有：「继续提高单步模仿率，没有稳定达到 18/20 的已验证机制」 | `v19/V18_REVIEW_AND_RULES.md:123` |
| 10 | 「三个独立面板一致证明 H0 优于学生（合并 p=0.000042）」 | 面板间 family 大量复用（S3 与 S3复核共享 6 个 family，S3复核 与 S5 共享 9 个）；按 family 内先聚合再双侧符号检验：p＝**0.375 / 0.0386 / 1.000**。方向仍值得保留，但**不能**称为三个完全独立面板的强复现 | `v19/V18_REVIEW_AND_RULES.md:94-104`；`v19/review/audit_v18.json:337-604` |
| 11 | 「预热/价值校准改善 87.5%、85.6% 是泛化校准改善」 | 那是**训练内**同批 MSE（`value_warmup.py:97-153` 同集训练同集评分），现已改名 `trainMse`；A2 验收的 holdout 实际为 **0 个 family、0 样本**，即 holdout 校准**没有实证** | `v19/out/run_20260929_v19_02/acceptance/verdict.json:5-19`；`V19_RUN02_REVIEW_AND_NEXT.md:73` |
| 12 | 「价值预热已检验『更好的 critic 作为优势基线』」 | 第一窗口确实**没检验**：`ppo.py:393-404` 直接用采样时保存的旧 value 算优势，预热后的新读数未回填；抽读 189 个状态旧值与预热值平均绝对差 **0.793**、最大 **1.176**。第二窗口已修（新波采样前预热，采样时记录的 value 就是预热后的值，`warmedRolloutSampledByWarmedModel=true`） | `v19/V19_PROGRESS_REVIEW_20260929.md:52-60`；`v19/review/progress_20260929/probe_value_baseline.json:2-5`；`acceptance/verdict.json:17` |
| 13 | 「KL 早停已生效」（第一窗口） | 第一窗口 KL 判断在 `optimizer.step()` 之后，只跳出 minibatch 内层，外层 epoch 继续：pilot 第 1 轮 KL=0.0214 标 KL_STOP 后第 2 轮仍更新 1 个 batch、KL=0.0332。第二窗口已修（超限即跳过本次更新并停止本批所有后续 epoch） | `v19/V19_PROGRESS_REVIEW_20260929.md:68-72`；`v19/review/progress_20260929/audit_progress.json:907-934`；`acceptance/verdict.json:76-101` |
| 14 | 「28,556/32,556 条决策＝28.6k 条独立经验」（第一窗口 wave2） | 不是独立经验：实际主体决策 **84238**、落盘 **32556**、入 PPO **28556**；10 局超记录上限，其中 8 局有真实终局，前缀 16000 步占全部 PPO 样本 **56.03%**；且被截断前缀共享最终回报**不是该步的真实终止转移**。第二窗口改为分块完整落盘（上限废弃）后此问题消除 | `v19/V19_PROGRESS_REVIEW_20260929.md:74-82`；`audit_progress.json:698-702` |
| 15 | 「T19-01/T19-02 全量验收＝任务书规则表达已完成」 | 只证明**本次实现的跨语言对齐**；任务书要求的 **120 个规则场景**（夺城经济、招募/pending、射程/反击、状态/恢复、支援/突击、清场再招）、完整 pending/状态持续/墓碑/真实路径关系，以及 T19-03 可达中残局课程**均未交付** | `v19/V19_PROGRESS_REVIEW_20260929.md:86-92`；`v19/V19_LONG_TERM_TASKBOOK.md:103` |
| 16 | 「UI 默认加载的就是实验冠军」 | 不是：`championIsBundledByDefault=false`，三个内置空间权重 SHA 均 ≠ 冠军；若「模型很差」来自界面试玩，可能试玩的并不是实验冠军（冠军本身也只有 5/20） | `v19/review/audit_v18.json:620-627`；`identity/manifest.json:243-267`；`v19/V18_REVIEW_AND_RULES.md:189` |
| 17 | 「全库测试只有 40 个历史失败、可视为历史问题」 | `_tmp_fulltest.txt` 实为 **47 failed / 997 passed**；本次审核未重跑全库、也没有干净基线对照，不接受「全部属于历史问题」的已证实表述 | `v19/_tmp_fulltest.txt`（末行）；`V19_PROGRESS_REVIEW_20260929.md:40` |

---

## 6. 仍然有效的已知缺陷

| # | 缺陷 | 现状 | 证据 |
|---|---|---|---|
| 1 | **编码碰撞**：粗兵种类别使「敌方史莱姆 vs 水元素换位」两状态的空间张量、全局特征、39 个候选输入、冠军 logits 与所选动作**完全相同**，而实伤 20 vs 45 | **已修（34 通道）**；新 schema 在 Ch26/28/29/30 出现差异 | `v19/review/rules_and_encoding_probe.json:124-179`；`v19/out/run_20260928_v19_01/progress.json`（T19-01a） |
| 2 | **威胁图时间语义**：旧 `move = u.hasMoved ? 0 : stats.move`，我方行动期间敌军保留上回合已移动标记，交出回合后同一敌军可移动（威胁 0→1） | **部分修**：新 Ch31 按下一敌方行动阶段读 1；但 Ch31 仍只用曼哈顿半径，**不含地形路径、最小射程空洞、多单位相互作用**；Ch32 仍按 `hasMoved`，不能当完整突击余量 | `v19/V18_REVIEW_AND_RULES.md:80`；`rules_and_encoding_probe.json:180-185`；`v19/V19_PROGRESS_REVIEW_20260929.md:90` |
| 3 | **截断奖励污染**：`GameEngine.step` 的 dense reward（死亡奖励未分敌我）、`AncientEmpiresEnv.stepAction` 在 maxPlies 按金币/军力代理判胜负 | **已修（训练侧）**：`subject_episode.ts` 只认引擎 winner，截断 `terminalReturn=null`；V18 的 `winner=null/reward=−1` 探针作为负例保留。`GameEngine`/`AncientEmpiresEnv` 本体未改（属原规则红线） | `v19/env/subject_episode.ts:293-298,551-573`；`rules_and_encoding_probe.json:186-191`；`v19/V18_REVIEW_AND_RULES.md:82-90` |
| 4 | **检查点保存错过预登记时点**（1k/2k 文件缺失，只评 final） | **已修**：挂钩真实 optimizer update，smoke 3/5/7 全过 | `v19/V18_REVIEW_AND_RULES.md:57-63`；`v19/out/run_20260928_v19_01/hook_smoke/hook_verification.json` |
| 5 | **长局 2000 步前缀丢失**（wave2：84238 实际 / 32556 落盘 / 28556 入训） | **已修**：分块流式、上限废弃、`recordCappedGames=0`、`recordCompleteness=1.0`（wave1–4） | `v19/V19_PROGRESS_REVIEW_20260929.md:74-82`；`v19/out/run_20260929_v19_02/data/wave*/w*.summary.json` |
| 6 | **两个失败 schema 测试夹具**（缺 `encoderSchemaId`） | **已修**（T19-00.4），并已重验冠军 DEV20 逐局不变 | `v19/V18_REVIEW_AND_RULES.md:187`；`identity/reverification.json`；`identity/manifest.json:217-221` |
| 7 | **Icy 战斗次序缺陷**：决策#156 局面（己方指挥官 63HP、远程精灵 100HP、敌方指挥官 100HP，两者都能合法攻击同一目标），精灵先手→最终己方指挥官 50HP；指挥官先手→受反击 36、最终 27HP。相同进攻效果仅次序不同就差 **23 点**己方指挥官 HP | **未修（模型能力缺口）**。引擎行为经独立探针确认正确，属「远程削血→近战交换→保护重要单位」的组合决策缺失；`θ2` 单动作干预可把该局从负变胜，但审核**未重跑完该 7799 步整局**。后续 S0 要求把这条两步顺序作为回归例，但**不得**把该 DEV 根状态加入训练集 | `v19/review/r123_20260930/icy_order.json`；`v19/review/r123_20260930/audit.json:218-280`；`V19_R123_REVIEW_AND_SEARCH_20260930.md:24-35,53` |
| 8 | **S5 搜索分支回退未记录**：`fullgame_ab_v18.ts` 捕获 B100 异常后用 H0 补动作，却未在结果里记回退次数 | **未修**（现有记录不足以判断是否真实发生，因此不能保证那些续弈是纯 B100；正式 DEV arena 的回退记录是另一套流程，不受此缺口否定） | `v19/V18_REVIEW_AND_RULES.md:108` |
| 9 | **课程/规则场景覆盖未完成**：120 个六类规则场景、完整 pending/状态持续/墓碑/真实路径、T19-03 可达中残局课程 | **未修** | `v19/V19_PROGRESS_REVIEW_20260929.md:86-92`；`v19/V19_RUN02_REVIEW_AND_NEXT.md:102-104` |
| 10 | **训练状态不可恢复**：PPO 保存 `.train_state.pt` 但没有加载它的 CLI 路径，每波仍从 JSON 新建 AdamW；A4 只验证「采样按 gameId 续跑」 | **未修**（只能说「保存了状态」，不能说「已验证训练可恢复」；跨波保留模型参数的链成立，optimizer 重置需显式记录） | `v19/out/run_20260929_v19_02/acceptance/verdict.json:103-110`；`V19_RUN02_REVIEW_AND_NEXT.md:74` |
| 11 | **张量加载整块读入**：`tensors_path.read_bytes()` 每波 5.8–6.5GB，且新常数基线还要 load 上一整波 | **未修**（继续扩数据前应先改上一波常数只读 games/计数、必要时块读取；不要做成大框架重构） | `v19/out/run_20260929_v19_02/data/wave*/w*.tensors.f32`（5.81/6.05/6.49/5.00 GB）；`V19_RUN02_REVIEW_AND_NEXT.md:75` |
| 12 | **`--baseline recompute` 不能证明「critic 未用过本批标签」**：只检查 SHA 不相等 | **未修**（生产三波默认 sampling 不受影响；该实验入口应禁用或要求数据谱系证据） | `V19_RUN02_REVIEW_AND_NEXT.md:76` |
| 13 | **`chainVerified` 是弱断言**：只是单边 init 是否在 behavior SHA 集合中，缺 SHA 时还可能为真 | **未修**（本次审核独立检查了唯一行为 SHA 与相邻输出，真实生产链无误；以后自动断言需用唯一 SHA + 父输出） | `V19_RUN02_REVIEW_AND_NEXT.md:77`；`v19/review/run02_followup/audit_run02.json:62-64,176-178,298-300` |
| 14 | **Icy/Liberty 的失败窗口未定位**：lib-0120-s1 / lib-0121-s1 首个适用窗口（决策#14 互换 wait）**非决定性**，θ2 轨迹只有 627/654 步，失误点在更晚处；Mourningstar 的路线/地形/经济机制尚未像 Icy 一样核算 | **未修**（按「每家族最多 2 窗口、总 8 个」上限停止，如实标为待验证假设；这 6 个窗口不能算「已排除」） | `v19/out/run_20260929_v19_02/R1_R2_R3_REPORT.md:66-70,157`；`audit.json:305-407` |
| 15 | **收官方向未被证据支持**：三份 DEV 都是 0 截断，θ2/θ3 各 16 场自然负；8 场训练截断不足以证明自然负局主要输在收官 | **未修/待验证**：优先追踪 Icy/Liberty 丢掉的赢棋机制，再决定课程类别 | `V19_RUN02_REVIEW_AND_NEXT.md:67` |

---

## 7. 不能触碰的红线

1. **V14–V18 历史证据只读**：不得覆盖、改写、删除或「重算后替换」旧 run 报告、arena 逐局、identity 清单。补勘误必须另写文件，不覆盖历史原始文件（`v19/V19_RUN02_REVIEW_AND_NEXT.md:130`；`v19/V19_AGENT_START.md:23`）。
2. **原游戏规则不改**：不改地图、收入、兵种、胜负条件、合法动作过滤（`filter-surrender-v1`）、评测 caps（`v16-student-caps-12k-900s-v2`＝12000 原子步/900 秒）、初始态（`sd-first-turn-start-v1`）（`v19/V19_LONG_TERM_TASKBOOK.md:14`；`identity/manifest.json:223-242`）。
3. **冻结 H0 不改**：三文件闭包 digest `e648bf9464b2656cf2860008aba84aabc0aee5d19805c0c3ff987c672f1d3fa8` 与 V17/V18 一致；不得为提分而削弱/增强对手；改教师必须新立 S1/S2 id 并重跑受影响基线（`identity/manifest.json:81-89,114-118`；`v16/V16_EVALUATION_PROTOCOL.md:12`）。
4. **不 reset / 不 clean / 不 stash**：当前 HEAD `c1b9ac0`，工作树有 **39 项**他人未提交内容（19 个已修改文件 + 20 个未跟踪文件，含 `src/game/engine.ts`、`src/game/ai/*`、`python/*`、`tools/*`）。只允许在 `v19/out/<run>/`、`v19/review/` 等产物目录**新增**文件，不覆盖别人改动的源码（`v17/V17_TASKBOOK.md:17`；本机 `git status --porcelain` 实测）。
5. **正式推理保持纯模型**：不按地图换权重、不用 H0 静默兜底、不用搜索代理冒充交付；搜索/课程/混合策略必须单独标识。正式 20 局只加载一个冻结 SHA（`v19/V19_LONG_TERM_TASKBOOK.md:15`；`v19/V19_R123_REVIEW_AND_SEARCH_20260930.md:93`）。
6. **截断不得算胜**：平局、时间/步数截断都不计胜，错误/非法/回退使验收完整性不合格；不得删出分母（`v19/V19_LONG_TERM_TASKBOOK.md:13`；`v16/V16_EVALUATION_PROTOCOL.md:45`）。
7. **DEV20 已被反复使用**：其 +1/+2 都不是独立泛化证据；旧 FRESH 面板一旦看过即退休，不得反复挑「最幸运」的面板（`R1_R2_R3_REPORT.md:153`；`V19_RUN02_REVIEW_AND_NEXT.md:112`）。
8. **正式目标未完成**：DEV≥18/20 → 新 FRESH40≥36/40 且每图≥6/8 → 冻结单一 SHA → CONFIRM20 五图各 4 场≥18 次自然胜利 → UI 同权重核验。当前 5/20，**不得**写 `OBJECTIVE_COMPLETE`（`v19/V19_NEXT_TASKS_20260929.md:85`；`v19/task_status.json:6-8`）。

---

## 8. 下一步（据最新审核，仅作索引，不替代原文）

`v19/V19_R123_REVIEW_AND_SEARCH_20260930.md` §3 已冻结下一窗口合同，起点固定 θ1、P1 继续作冠军：

- **S0 最小搜索正确性**：同一根状态与 H0 RNG 可克隆恢复；恢复不重复发初始收入；按真实 `currentPlayer` 判断回合边界；自然胜负/截断/错误严格区分；用 Icy 两步顺序作回归例（不入训练集）。
- **S1 固定 40 窗口整回合搜索**（每图 8 个，20 开发 + 20 封存；搜索单位＝当前己方完整动作序列→H0 真实回应→下一己方边界；每窗口 ≤10 分钟、总预算约 7 小时；预登记工程门槛：封存 20 窗口中 ≥10 个得到双方自然结果、≥4 个家族改善且退化 ≤1、改善跨 ≥2 图）。
- **S2 分支**：过门槛→最多 200 窗口 + 一次短蒸馏（500–1500 更新）+ 纯模型 DEV20；只有局部战术改进→最多 500 更新微型课程；无收益→如实报告并停。
- **不要重做**：已完成的流式轨迹、谱系账本、价值预热、KL 早停；不要再跑原配方第 4/5/6 波（`V19_R123_REVIEW_AND_SEARCH_20260930.md:104`）。

---

## 附：本摘要未能确定的事项（禁止当已知数字用）

1. 「开局 18% 共享骨干梯度」的推导过程（`phase_gradient_w1.json` 无法复算；18% 与中盘决策占比 18.1% 数值相同）。
2. R2 fix 相对 control 的 +2 中，「阶段权重」与「750 vs 1356 次更新」各自的贡献比例。
3. V18 S5 面板 B100 续弈的实际回退次数（工具未记录）。
4. θ2/θ3 之间 18 局动作序列差异的具体失误点（R1 只覆盖 4 个家族）。
5. 第一窗口 wave2「14/80 胜局 vs DEV 5/20」的归因（模型、seed、样本量、选择方式均不同，不能归因探索噪声或温度）。
6. Icy 决策#156 那 7799 步反事实整局的完整复跑（本次只验证了两步规则后果）。
7. 搜索路线（T19-07/S1）是否有效——尚未执行。
