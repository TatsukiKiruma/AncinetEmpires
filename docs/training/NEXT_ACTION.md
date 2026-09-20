# V6 后续行动指南与执行交接 (NEXT ACTION)

**执行批次**: `agent_upgrade_20260921_v6_01`  
**基点分支**: `path-b-spatial-ai` (HEAD `a0a9dcdd483cb951a72734805504c947176d5d79`)  
**状态**: C60 — C68 阶段全部完成；全套 64 个测试套件、621 项测试 100% 通过。

---

## 1. 产物与 Checkpoint 清单

所有训练模型均保存于受控不可变目录，未覆盖 `src/game/ai/models/`：

| 模型名称 | 架构 | Checkpoint 相对路径 | SHA-256 哈希值 |
|---|---|---|---|
| **Skirmish BC Ranker** | 线性排序器 (4096维) | `training_runs/agent_upgrade_20260921_v6_01/checkpoints/bc/bc_ranker_checkpoint.json` | `e4e9b43245a6bcdad55a86c06e6c65b5effab40ed429c8c6edb23cffa20b60bb` |
| **NET_A DualHead** | 2-block MLP [256, 128] | `training_runs/agent_upgrade_20260921_v6_01/checkpoints/net_a/net_a_checkpoint.json` | `3260ddc09b57763c2f08f46a0b0ccbe109518c11e6501ccb5c8df2c49d9ce4f1` |
| **NET_B DualHead** | 3-block MLP [256, 256, 128] | `training_runs/agent_upgrade_20260921_v6_01/checkpoints/net_b/net_b_checkpoint.json` | `450a14fe190666874b94d9ca2907dbed4a35326ac2cca0bfd5d1cedefeb446a5` |
| **Spatial ResNet v2 (2-block)** | 32ch, 2 ResBlocks, 148-dim policy | `training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json` | `2fd090b86cc7f11380c7416faf5ca7819fd10580fab157e469fe126c456b6b3e` |
| **Spatial ResNet v2 (4-block)** | 32ch, 4 ResBlocks, 148-dim policy | `training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_4block_checkpoint.json` | `81f1853d9e487da8e79e60a33118cf9bcfe496c141d5b3d758d4a9f3900388d7` |

---

## 2. 核心实验报告索引

所有报告均已保存至 `docs/training/reports/agent_upgrade_20260921_v6_01/`：
- `inventory.json`：历史模型资产盘点与 SHA-256 注册 (C60)
- `policy-model-matrix.json`：策略-模型映射关系 (C60)
- `budget.json` & `budget-ledger.jsonl`：本地资源消耗账本 (C60)
- `commander-rule-audit.json`：CR01—CR16 全部 16 组真实死亡/涨价/pending 规则生命周期审计 (C61)
- `rules-entrypoint-matrix.json`：各代码入口规则注入审计 (C61)
- `commander-decision-funnel.jsonl`：18 状态归因漏斗逐步记录 (C62)
- `commander-baseline-matrix.json`：旧策略在基线场景下的失败表现 (C62)
- `commander-coverage-audit.json`：历史数据集覆盖漏斗审计 (C64)
- `all-model-training-coverage.json`：全部模型重训记录与状态呈现 (C65)
- `all-policy-before-after.json`：对称 Duel SD 对局评测与重招募率统计 (C66)
- `commander-retrained-curriculum-matrix.json`：全部重训模型在 S1—S6 课程场景中的逐动作验证 (C66)
- `c68-depth-data-matrix.json`：2-block vs 4-block 深度对照矩阵 (C68)
- `spatial_vs_heuristic_5maps_10matches.json` & `.md`：Spatial ResNet v2 vs HeuristicAI 5 地图 10 场对战锦标赛战报
- `all_models_vs_heuristic_5maps_benchmark.json` & `.md`：全部 4 个新训练模型 vs HeuristicAI 5 地图 40 场双向换边锦标赛综合战报

---

## 3. 验证与复现命令

```bash
# 1. 运行全部单元测试 (回归测试，当前 64 套件 / 621 单测全部通过)
npm test

# 2. 运行 V6 课程全策略对比核验
npx tsx tools/v6_commander_curriculum_verify.ts

# 3. 运行 5 地图 10 场完整对战评测 (Spatial ResNet v2 vs HeuristicAI)
npx tsx tools/v6_spatial_vs_heuristic_5maps_benchmark.ts

# 4. 运行完整 C64-C66 训练与评测全链路
npx tsx tools/v6_commander_specialist_pipeline.ts
```

---

## 4. 后续建议行动 (Next Actions)

1. **若用户确认替换生产模型**：
   - 可将验证通过的 `spatial_resnet_v2_checkpoint.json` 部署至 `src/game/ai/models/`，并在 UI 策略下拉列表中新增 `Spatial ResNet v2 (SD Rehire Qualified)`。
   - 默认 AI 仍严格保留为 `HeuristicAI`。
2. **结合启发式搜索的混合增强 (MCTS / S10 / 1-ply Lookahead)**：
   - 当前 Spatial ResNet v2 为纯单步策略预测网络（单步 ~20ms），在实战对战中已完美实现 SD 规则闭环、指挥官多次阵亡与重招募；
   - 若要进一步在实战胜率上战胜 HeuristicAI，可开启 1-ply 启发式展开或将 Spatial ResNet 作为价值评估头嵌入树搜索中。

2. **扩大规模数据实验 (选做)**：
   - 本轮构建的向量化 PyTorch 引擎将 30,000 样本的单轮训练耗时从 15 分钟优化至 25 秒，具备在数分钟内消化更高规模数据集（如 150k 全量状态池）的能力。
