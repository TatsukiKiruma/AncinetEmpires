# Battle AI 训练存档（train/battle-ai-100pct）

对手：HeuristicAI（`src/game/ai/heuristic_ai.ts`）。评估：无封顶回合（safety 600，从未触发，全部自然终局），
交替先后手，固定种子可复现。评估脚本：`tools/train_battle_eval_uncapped.ts`（支持 `--out` 自动存档，含 git HEAD）。

## 模型版本（搜索型 AI，无神经网络权重；“模型”= 代码 + 参数快照）

| 版本 | 参数 | 战绩 | 说明 |
|---|---|---|---|
| v3 | topK6 / 单步探测宽4 / rollout3 / takeover1200 / veto800 / danger-1500 | Duel 17/20 | 首个达标版本，P0十局全胜 |
| v4 | topK8 / 单步探测宽6(含对手heuristic评分) / rollout3 / takeover350 / veto300 / danger-800 + 战术候选 | Duel 10/20 | 退化实验：P1发现4回合固定rush线十局全胜，P0十局全败 |
| v6 | topK6 / 集火深度3 / rollout1 / takeover350 / veto300 / danger-800 + 两阶段评估 + 战术候选 + 局面修正v1 | Liberty 4/10，Peak 5/10 | P1九胜一负，P0十局全败；大图P0问题暴露 |
| v7 | v6 + 攻击安全检查 + 招募名额保证 + 扩张期攻击接管门槛1500 + searchStartTurn开关 + 早期爆兵 | 调优中 | 当前 HEAD 代码，Liberty game1 仍负（13回合），继续优化 P0 |

参数快照：`models/battle_search_v*.json`。v4/v6 的 codeRef 为未提交演进态，以对局记录行为为准；
HEAD（含 v7）提交后即为精确可复现态，后续运行一律用 `--out` 存档。

## 对局数据（`matches/`，与 --out schema 一致）

| 文件 | 内容 |
|---|---|
| `duel_seed1001_v3_20games.json` | Duel 20局全记录，17/20（P0全胜，P1三负于10/12/16局） |
| `duel_seed1001_v4_20games.json` | Duel 20局摘要10/20 + 逐字摘录4行（含10/12/16三局全记录） |
| `liberty_seed1001_v6_10games.json` | Liberty 10局全记录，4/10（P1四胜，P0五负） |
| `peak_seed1001_v6_10games.json` | Peak 10局全记录，5/10（P1五胜，P0五负；第5局72回合3845步） |
| `mirror_baselines.json` | Heuristic内战基线（Duel/Liberty/Peak，含swap对照） |

## 关键结论（截至本存档）

1. 大图 P0 先手是系统性短板（0/10），P1 后手 9/10。Liberty 对称图 swap 后 1-1，说明非地图结构问题；
   Peak P1 开局自带 2 村庄，有结构性后手优势。
2. 失败路径高度一致：T7 前扩张落后 1~2 村 → T9 左右被 5v9/5v8 围殴 → 提前崩盘（比纯 heuristic 内战崩得更快，
   说明噪声接管有害）。
3. 已验证有效的单项：战术候选覆盖（Duel P1 三败局转全胜）、两阶段评估（提速约3倍）、集火深度探测。
4. 下一步：P0 开局扩张与 T9 会战选择（候选：严格安全击杀规则已上线 v7，待验证；会战期深搜；招募构成）。

## 工具

- `tools/train_battle_eval_uncapped.ts`：主评估（--map duel|liberty|peak --games --seed --safety --topK --oppK(深度) --rollout --takeover --veto --danger --searchStart --only --out）
- `tools/train_battle_mirror2.ts`：heuristic 内战基线（--map --games --seed --swap）
- `tools/train_battle_trace.ts`：单局逐回合流程追踪（--map --seed --game --p0 new|heuristic --swap；--actions --from N 打印动作）
- `tools/train_battle_mapdump.ts`：地图 ASCII 布局打印
