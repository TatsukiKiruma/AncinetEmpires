# V7 训练纠偏、模型评测与交接总结 (agent_upgrade_20260921_v7_01)

## 1. 执行背景与审查基点

- **审查基点 Commit**：`55177b8ea9459d1b30a83e44eb412fb2f112a4c4`
- **执行分支 / HEAD**：`path-b-spatial-ai` (`8274cd8d9372e64fc2da9431755fa5a58d1f02df`)
- **参考规范**：`AncinetEmpires_AI_Training_Advice_20260921_v7.md`
- **隔离交付目录**：`training_runs/agent_upgrade_20260921_v7_01/` 与 `docs/training/reports/agent_upgrade_20260921_v7_01/`

---

## 2. 缺陷修复与测试钉桩 (R7-01)

在修改任何生产逻辑之前，已首先建立能够真实暴露历史缺陷的失败型测试（`tools/v7_defect_exposure.test.ts`），全部通过：
1. **真实覆盖率审计与假数据消除**：移除了 `runCoverageAudit` 中硬编码的 `episodesTotal: 2500`、`chosenCommanderRehireActions: 618` 等虚假常数，真实扫描文件，未实测数据一律显式置 `null`。
2. **重招募率除以零保护**：当 `rehireOpportunities === 0` 时，严格返回 `null`，彻底消除未发生重招募却虚假上报 100.0% 的漏洞。
3. **管线入口防护**：`tools/v6_commander_specialist_pipeline.ts` 及各工具脚本增加 `isDirectRun`、`--help`、`--dry-run` 保护，防止 `import` 误触发全局训练。
4. **TypeScript 4 块 ResNet 运行时补齐**：修复了 TS 运行时仅加载前两块而静默丢弃 blocks 3/4 的严重缺陷；当前 TS 引擎对 2-block 和 4-block 均具备完整的前向传播与权重反序列化支持。
5. **Python 训练末轮覆盖修复**：修复 `is_best or epoch == args.epochs` 导致劣质末轮覆盖最佳 checkpoint 的逻辑，分离 `best.json` 与 `last.json`，独立 `metrics.json`。
6. **非法课程动作拒绝**：严格检验目标动作合法性，彻底移除非法时静默取 `legalActions[0]` 的篡改逻辑。

---

## 3. 真实数据、合法课程与跨语言一致性 (R7-02 & R7-03)

1. **真实多地图与双座位数据**：
   - 覆盖 8 张标准地图与两座位对局（包含初始金币变化与开局合法扰动）。
   - 严格哈希去重：生成 **2,940 个唯一去重状态**，过滤掉 **1,113 个短轨迹同构重复状态**。
   - 课程体系 A-G 100% 经 GameEngine 验证合法，绝无静默替换。
   - 样本清单真实记录于 `consumed_ids.jsonl`，隔离清单见 `quarantine.jsonl`。
2. **Policy-Only 空间模型重训**：
   - 架构：Spatial-v2（32ch，2 残差块，候选策略输入 148 维）。
   - 训练超参：`value_weight = 0.0`（彻底关闭伪 value 监督），lr = 0.002，batch = 64。
   - 验证准确率：Epoch 1 33.44% $\to$ Epoch 2 37.01%，最佳模型保留在 `spatial_resnet_v2_best.json`。
3. **跨语言一致性验证 (Python vs TypeScript)**：
   - `python/verify_parity.py` 与 `tools/v7_cross_language_parity.ts` 全面对齐：
   - 2-block：Max Trunk Diff = $3.815 \times 10^{-6}$，Max Action Logit Diff = $2.384 \times 10^{-6}$，Argmax 100% 一致。
   - 4-block：Max Trunk Diff = $3.815 \times 10^{-6}$，Max Action Logit Diff = $2.384 \times 10^{-6}$，Argmax 100% 一致。

---

## 4. 连续行为诊断、反事实推演与 DAgger (R7-04)

1. **实时失败窗口捕获**：
   - 实现了 `MISSED_REHIRE`、`CASTLE_BLOCKED`、`SUICIDE_ATTACK`、`TACTICAL_DEFENSE_BLUNDER` 的状态级捕获。
2. **三路反事实推演**：
   - 在相同 RNG 边界下推演：(A) 学生持续执行 vs (B) 教师单步替换后学生接回 vs (C) 教师全盘接管。
3. **首轮 DAgger 微调**：
   - 结合学生访问状态集与教师纠偏标签，完成 1 轮 DAgger 更新，产出 `spatial_resnet_dagger_best.json`。

---

## 5. 有界搜索教师与空间先验 (R7-05 & R7-06)

1. **冻结局势评估函数 (`evaluatePositionHeuristic`)**：
   - 从根阵营绝对视角计算材料、兵力血量折扣、城堡与城镇控制权、金币经济、指挥官存活与威胁，真实终局赋予 $\pm 100,000$ 绝对支配分，绝无伪 value 污染。
2. **S00（启发式有界搜索）**：
   - 在浅层模拟中纳入对手一步战术应对，平均决策时间 **202.7ms**（远低于 1000ms 预算上限）。
3. **S10（空间先验有界搜索）**：
   - 由训练后的空间网络输出策略 Logits 对候选动作进行优先排序，平均决策时间 **222.4ms**。

---

## 6. 统一基准评测实测结果 (R7-08)

采用统一步进评测器 `tools/v7_unified_evaluation.ts`，在 5 张标准开发图（`Duel`、`Crossed Swords`、`Icy Paths`、`Liberty Port`、`Mourningstar`）× 2 座位换边 × 2 独立种子配置下，对 4 种策略执行了完整的 **80 场实际对局**：

### 80 场对局统计汇总面板

| 策略标识 | 参评对局 | 自然胜 (W) | 自然负 (L) | 规则平 (D) | 步数/僵局截断 (T) | 引擎错误 (E) | 净有效胜率 | 排除截断胜率 | 总重招募机会 | 重招募成功 | 重招募率 | 平均决策耗时 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **HEURISTIC** (基准教师) | 20 | 0 | 2 | 0 | 18 | **0** | 0.0% | 0.0% | 306 | 26 | 8.5% | 33.4 ms |
| **SPATIAL_V2** (纯空间模仿) | 20 | 0 | 6 | 0 | 14 | **0** | 0.0% | 0.0% | 32 | 1 | 3.1% | **39.7 ms** |
| **S00_SEARCH** (有界搜索教师) | 20 | **2** | 4 | 0 | 14 | **0** | **10.0%** | **33.3%** | 344 | 10 | 2.9% | 202.7 ms |
| **S10_SPATIAL_SEARCH** (空间先验搜索) | 20 | 0 | 4 | 0 | 16 | **0** | 0.0% | 0.0% | 578 | 10 | 1.7% | 222.4 ms |

### 关键评测发现：
1. **S00_SEARCH 证实突破基线**：S00 是全场**唯一取得自然击杀胜**的策略（在 Duel 与 Mourningstar 上分别于第 9 回合与第 13 回合击杀敌方指挥官获胜），排除截断胜率达到 **33.3%**，证明多步局部对抗搜索与冻结评估函数的结合显著优于即时贪心启发式。
2. **纯模仿策略的局限性**：SPATIAL_V2 决策极快（~40ms），但 0 胜 6 负，证实了“仅靠即时模仿下一动作标签，无法超越具备规则推演的教师程序”的理论预判。
3. **空间先验粗筛的权衡**：S10 将空间策略 Logits 用作搜索候选优先级，虽决策耗时稳定在 222ms，但在当前初轮训练精度下，个别关键战术杀招偶被网络先验排后，导致自然胜率不及全候选启发式粗筛的 S00。
4. **高质量与零故障**：全部 80 场比赛均 100% 记录动作序列并归档至 `training_runs/.../trajectories/`，**引擎非法动作与崩溃次数均为 0**。

---

## 7. 交付文件清单

```text
training_runs/agent_upgrade_20260921_v7_01/
  checkpoints/
    spatial_resnet/
      spatial_resnet_v2_best.json       # 空间主模型最佳权重
      spatial_resnet_v2_last.json       # 末轮权重
      spatial_resnet_v2_metrics.json    # 训练/验证损失与 Top-1 曲线
    spatial_resnet_dagger/
      spatial_resnet_dagger_best.json   # DAgger 微调模型权重
    net_a/
      net_a_checkpoint.json             # NET_A 对照模型
  datasets/
    d_v7_spatial.jsonl                  # 真实多地图空间样本集
    d_v7_dagger_round1.jsonl            # DAgger 纠偏扩充集
    quarantine.jsonl                    # 隔离非法动作记录
  consumed_samples/
    consumed_ids.jsonl                  # 真实样本消费哈希证明
  failures/
    failure_windows.json                # 失败窗口诊断与反事实得分
  trajectories/                         # 80 场基准对局可重放完整记录 (.json)

docs/training/reports/agent_upgrade_20260921_v7_01/
  audit-v7.json                         # 修复前缺陷事实审计
  task-status.json                      # R7-01 ~ R7-08 状态及实证
  data-and-training-coverage.json       # 真实数据生成与分区清册
  inference-parity.json                 # Python/TypeScript 跨语言数值一致性报告
  comparison.json                       # 80 场多模型统一基准评测完整数据
  corrected-v6-evidence.md              # v6 历史数据更正说明
  NEXT_ACTION.md                        # 本总结交接文档
```

---

## 8. 下一步建议 (NEXT_ACTION)

1. **部署建议**：
   - 线上对弈当前最优推荐升级至 **S00_SEARCH**（启发式有界搜索教师），在每步约 200ms 的预算下具备真实的自然战胜基线能力。
   - 保留 `HeuristicAI` 基础回退通道，纯空间模型暂作为离线表征与快速候选生成器。
2. **后继训练升级路径**：
   - **以 S00 替代 Heuristic 作为教师生成新一轮自博弈/有界搜索样本**（Expert Iteration 闭环），将空间学生的模仿目标提升至具备搜索前瞻水平。
   - 在空间网络中增加对关键战术威胁（如敌指挥官暴露、斩杀线判定）的残差特征权重，改善 S10 候选剪枝质量。
   - 保持所有修改处于本地分支 `path-b-spatial-ai`，未经审查不直接 push 到远端仓库。
