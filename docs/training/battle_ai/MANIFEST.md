# Battle AI 训练存档（train/battle-ai-100pct）

对手：HeuristicAI（`src/game/ai/heuristic_ai.ts`）。评估：无封顶回合（safety 600，偶发截断/马拉松），
交替先后手，固定种子可复现。评估脚本：`tools/train_battle_eval_uncapped.ts`（支持 `--out` 自动存档，含 git HEAD；
`--bot battle|policy|vsearch|beam`，`--map` 单图，5图×4局=20局）。

> 命名注意：battle v11（搜索型教师，16/20）与 learned v11（学习型，5/20）是两条路线的不同版本，
> 仅编号巧合。下文分开记载。

## 模型版本（搜索型 AI，无神经网络权重；“模型”= 代码 + 参数快照）

| 版本 | 参数 | 战绩 | 说明 |
|---|---|---|---|
| v3 | topK6 / 单步探测宽4 / rollout3 / takeover1200 / veto800 / danger-1500 | Duel 17/20 | 首个达标版本，P0十局全胜 |
| v4 | topK8 / 单步探测宽6(含对手heuristic评分) / rollout3 / takeover350 / veto300 / danger-800 + 战术候选 | Duel 10/20 | 退化实验：P1发现4回合固定rush线十局全胜，P0十局全败 |
| v6 | topK6 / 集火深度3 / rollout1 / takeover350 / veto300 / danger-800 + 两阶段评估 + 战术候选 + 局面修正v1 | Liberty 4/10，Peak 5/10 | P1九胜一负，P0十局全败；大图P0问题暴露 |
| v7 | v6 + 攻击安全检查 + 招募名额保证 + 扩张期攻击接管门槛1500 + searchStartTurn开关 + 早期爆兵 | 调优中 | Liberty game1 仍负（13回合），继续优化 P0 |
| v8 | v7 + 开局双招修正（指挥官让城/便宜优先）+ 全双人图评估表 | 5图×4局=10/20 | Liberty 3/4，Peak 2/4，Icy 2/4，Crossing 2/4，Mourning 1/4 |
| v11 | v8 + 缺人数爆兵门 + 防偷半径8+无人防守 + 局部兵力 + 有利交换 + 扫尾 | 5图×4局=16/20 | 当前 HEAD：Liberty 4/4，Peak 4/4，Icy 1/4，Crossing 3/4，Mourning 4/4；教师快照 |

参数快照：`models/battle_search_v*.json`。v4/v6 的 codeRef 为未提交演进态，以对局记录行为为准；
HEAD（含 v7）提交后即为精确可复现态，后续运行一律用 `--out` 存档。

## 对局数据（`matches/`，与 --out schema 一致）

| 文件 | 内容 |
|---|---|
| `duel_seed1001_v3_20games.json` | Duel 20局全记录，17/20（P0全胜，P1三负于10/12/16局） |
| `duel_seed1001_v4_20games.json` | Duel 20局摘要10/20 + 逐字摘录4行（含10/12/16三局全记录） |
| `liberty_seed1001_v6_10games.json` | Liberty 10局全记录，4/10（P1四胜，P0五负；v6旧码） |
| `peak_seed1001_v6_10games.json` | Peak 10局全记录，5/10（P1五胜，P0五负；第5局72回合3845步；v6旧码） |
| `liberty_seed1001_v8_4games.json` | Liberty 4局全记录，3/4（v8现码；负于第4局P1） |
| `peak_seed1001_v8_4games.json` | Peak 4局全记录，2/4（v8现码；P0两局皆8回合速败，故障模式待查） |
| `icy_seed1001_v8_4games.json` | Icy Paths 4局全记录，2/4（v8现码；P0胜第3局） |
| `crossing_seed1001_v8_4games.json` | The Crossing 4局全记录，2/4（v8现码；P1两胜，P0两负） |
| `mourning_seed1001_v8_4games.json` | Mourningstar 4局全记录，1/4（v8现码；仅第4局P1胜，第2局P1亦负） |
| `mirror_baselines.json` | Heuristic内战基线（Duel/Liberty/Peak，含swap对照） |

5图×4局（v8，seed 1001，topK6/深度3/rollout1）合计 10/20：P0 3/10（Liberty 2/2 为 opener 修复所救），P1 7/10。
5图×4局（v11，同配置）合计 16/20：Liberty 4/4，Peak 4/4，Mourning 4/4，Crossing 3/4（负第1局P0），Icy 1/4（仅第4局P1胜）。
转向：用户要求改走深度/强化/监督学习道路。v11 作为蒸馏 teacher，快照于此；学习型模型见 `learned/`（待训练）。

## 关键结论（截至本存档）

1. 大图 P0 先手是系统性短板（0/10），P1 后手 9/10。Liberty 对称图 swap 后 1-1，说明非地图结构问题；
   Peak P1 开局自带 2 村庄，有结构性后手优势。
2. 失败路径高度一致：T7 前扩张落后 1~2 村 → T9 左右被 5v9/5v8 围殴 → 提前崩盘（比纯 heuristic 内战崩得更快，
   说明噪声接管有害）。
3. 已验证有效的单项：战术候选覆盖（Duel P1 三败局转全胜）、两阶段评估（提速约3倍）、集火深度探测。
4. 下一步：P0 开局扩张与 T9 会战选择（候选：严格安全击杀规则已上线 v7，待验证；会战期深搜；招募构成）。

## 工具

- `tools/train_battle_eval_uncapped.ts`：主评估（--map duel|liberty|peak|icy|crossing|mourning|swords|swamp --games --seed --safety --bot battle|policy|vsearch|beam --topK --oppK --coverK --only --out）
- `tools/train_battle_mirror2.ts`：heuristic 内战基线（--map --games --seed --swap）
- `tools/train_battle_trace.ts`：单局逐回合流程追踪（--map --seed --game --p0 new|heuristic --p1 new|heuristic --bot battle|policy|vsearch --coverK；--actions --from N 打印动作；--swap）
- `tools/train_battle_mapdump.ts`：地图 ASCII 布局打印
- `tools/learn_duel_export.ts`：蒸馏/DAgger/自博弈数据导出（--maps --seeds --colors --mirror/--dagger/--selfplay --thin --safety --out）
- `tools/learn_duel_relabel.ts`：旧数据行动方视角重标注（新导出已内置 outcomeActing，仅用于存量校验）
- `tools/learn_duel_diagnose.ts`：单局复现 + teacher 重标注一致率 + teacher 自 agreement（标签噪声上限）
- `tools/learn_duel_headcheck.ts`：policy 排名 / cover 召回 / value 偏好三指标
- `tools/learn_duel_extra_features.ts`：14→19 维关系事实特征（导出与推理共用）
- `python/learn_duel_train.py`：policy（listwise BC）+ value（BCE+pairwise）训练（--policy-in --value-in --pairs-in --hidden --depth --act-dim --tag --policy-all --seat）
- `python/learn_duel_diag.py`：训练集动作分布 + 已训模型 train/val top1

---

# 学习型路线（LearnedDuelAI：监督蒸馏 policy + 结局回归 value + DAgger + 自博弈）

推理入口：`src/game/ai/learned_duel_ai.ts`（policy / value-search / beam 三模式）+
`src/game/ai/learned_duel_net.ts`（纯 TS MLP 前向 + 分色选网）。
当前生效权重：`src/game/ai/models/learned_duel_v1.json`（active slot，内容为 v12 单网）、
`learned_duel_p0/p1.json`（分色网：v14 policy + v6 value 注入）。

## 学习型版本（`models/learned_duel_*.json`，tag 即版本）

| 版本 | 结构/数据 | 训练指标 | 5×4 policy 套件 | 说明 |
|---|---|---|---|---|
| v1 | 128h/45维/胜局过滤 | top1 0.42 | mourning 0/1（冒烟） | 首个蒸馏模型，极快（2-3秒/局）但崩 |
| v2 | 256h/全量决策 | top1 0.41 | mourning 0/4 | 全量决策未涨 |
| v3 | +dagger R1（v2学生） | top1 0.40 | mourning 0/4 | 一致率0.36→0.52，value 校准修复，但胜率不动 |
| v4 | +pairwise value | pairAcc 0.99（训练集过拟合） | mourning 0/4 | 诚实 holdout 前的虚假信号 |
| v5 | pair 降权0.3+holdout | top1 0.44/MSE0.005/诚实pairAcc 0.85 | mourning 0/4 | 指标健康，胜率不动 |
| v6 | 1024h + wait 降权 | top1 0.38 | — | wait 降权有害，revert |
| v7 | 1024h + 回合加权 | top1 0.42/T1 一致率 0.67 | mourning 0/4 | 开局学会双招，但整局仍输 |
| v8 | **59维（+14关系事实）** | top1 **0.56** | — | 表示修复实锤（0.44→0.56） |
| v9 | +dagger R4（v8学生） | top1 0.47/对 0.89 | mourning 0/4 | headcheck 双头齐跳但胜率不动 |
| v10 | +类型加权（招募×3/攻击×2.5） | top1 0.44 | mourning 0/4 | 招募意愿恢复但单位太贵/堵城 |
| v11 | +dagger R5 数据 | top1 0.43 | **5/20**（peak2 icy2 crossing0 mourning1 liberty0） | 首个非零总分 |
| v12 | +落后×3/结局加权 | top1 **0.48** | 4/20（liberty2 peak1 crossing1） | P0 0→3/10 但 P1 5→1/10 |
| v13 | 3层512h | train 0.50/val 0.43 | 3/20（crossing2 mourning1） | 加深过拟合，回归 |
| v14 | **分色 P0/P1-net** | P0-net 0.39 / P1-net 0.44 | 3/20（liberty1 mourning2） | P0 数据本身更难；分色未质变 |

vsearch / beam 在 v6–v14 多轮 mourning 4 局中全部 0/4（value 动作级 7–16/25，撑不起 rerank/搜索）。

## 学习型对局数据（`matches/learned*_4.json`，--out schema，含模型 tag）

v11：liberty 0/4（+1 安全截断 600 回合马拉松）、peak 2/4、icy 2/4、crossing 0/4（g3 打 341 回合）、mourning 1/4。
v12：liberty 2/4（P0 双胜！）、peak 1/4、icy 0/4、crossing 1/4、mourning 0/4。
v13：liberty 0/4、peak 0/4、icy 0/4、crossing 2/4、mourning 1/4。
v14（分色）：liberty 1/4、peak 0/4、icy 0/4、crossing 0/4（g2 打 513 回合）、mourning 2/4（P1 双胜）。

## 训练原始数据（`training_runs/learn_duel/`，gitignored，约 200MB，可复现）

teacher64_*.jsonl（5图×4局，battle 教师示范，64维）、dagger64_*.jsonl+.pairs.jsonl（v10 学生态 teacher 重标注+价值对）、
mirror_01*.jsonl（heuristic 内战价值数据）、selfplay_*.jsonl（v14 学生自博弈 40 局，**未用于训练**，颜色偏见故封存）、
archive45/ / archive59/（旧维度数据留档）。
复现命令见本节工具；value 数据与动作维度无关可跨版本复用，policy 数据须与 act-dim 一致。

## 套件天花板分析（重要）

- battle v11（16/20）输的 4 局：icy g1（P0,T56）、g2（P1,T40）、g3（P0,T43）、crossing g1（P0,T22）。
- icy-P0：battle 跨种子（1001/3001）0/4、teacher 0/2、learned 全版本 0/N——**从未被任何 AI 赢过**，
  两个必败点（g1/g3）使本套件理论上限为 **18/20**。
- crossing-P0（g1）：teacher 在 3002 赢过，可学；learned 各版本 0/3，待攻。
- icy g2（P1）：battle 输、learned v11/v13 赢过——learned 已证明能拿 battle 拿不到的分。
- 结论：19/20 要求赢下 icy-P0 双局，按现有证据不可达；18/20 要求横扫其余（battle 已证 12/12 liberty/peak/mourning
  可横扫 + crossing g1 + icy g2/g4）。learned 当前 5/20，差 13 局，主差在 P0 横扫能力。
