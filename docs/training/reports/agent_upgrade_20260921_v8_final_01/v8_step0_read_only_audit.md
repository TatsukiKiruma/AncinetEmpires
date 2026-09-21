# AncientEmpires AI v8：第 0 步只读审计与模型身份冻结报告

- **报告日期**：2026-09-21
- **审查基点**：`6e7b7e22d36597369e75a5f21f743bd2f5faab93` (分支 `path-b-spatial-ai`)
- **审计人员**：Antigravity Pairing Agent
- **本轮 Run ID**：`agent_upgrade_20260921_v8_final_01`

---

## 1. 现有模型 Checkpoint SHA-256 审计

通过密码学哈希（SHA-256）对系统中现存的关键 Checkpoint 进行确权：

| Checkpoint 路径 | SHA-256 哈希值 | 实际性质 / 样本规模 |
|---|---|---|
| `training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json` | `43c0d74841453b5ddf20f1cbcb8d6d56297bfff953a8240e37f8c21bebba876b` | **100 样本测试模型** (train 95, val 5) |
| `training_runs/agent_upgrade_20260921_v7_01/checkpoints/net_a/net_a_checkpoint.json` | `e2ca0a10aa44c8dca75331e586346f014ab80d02cff6d2d2391cda172aa669f8` | **100 样本测试模型** (train 95, val 5) |
| `training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json` | `d402890bb0c030d7096b91efd501460de9919287f2fec110858146d3a3c473ce` | **12 样本测试模型** |
| `training_runs/agent_upgrade_20260921_v8_clean_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json` | `75c7117b286a83578a3876fe9fa479fe6e7305e054562c86bc79fc411be5ea38` | **7,706 状态 Pilot 模型** (4 epochs, 32ch) |
| `training_runs/agent_upgrade_20260921_v8_clean_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json` | `1e8fe8be57f97c28f544c41e7953eed0ece5cf66b87c9f2bcede654d895cd493` | **DAgger 微调模型** (Warm-start on 75c7117b) |

---

## 2. v7_01 Checkpoint 真实性核查 (100 样本模型证实)

经检查 `training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_metrics.json`：
- `dataset`: `.../datasets/d_v7_spatial.jsonl`
- `train_samples`: **95**
- `val_samples`: **5**
- `best_val_acc`: 0.60
- `history`: 仅 2 个 epoch
- `d_v7_spatial.jsonl` 行数：**精确为 100 行**

**结论**：`v7_01` 目录下的 checkpoint 绝非原始经过数千条样本充分训练的 v7 正式模型，而是在某次过拟合或冒烟测试中被覆写的 **100 样本玩具模型**。

---

## 3. 原始 v7 模型 (`fefc8660...`) 归档状态

全盘与 Git 历史检索结果：
- 在当前工作树、`.git` 日志、`docs/`、`training_runs/` 及备份中，均**无法找到** SHA 为 `fefc8660...` 的原始 v7 权重文件或备份。
- **裁决**：
  $$\text{R8-03 (Original v7 Weights Benchmark)} = \mathbf{BLOCKED / NOT\_REPRODUCIBLE}$$
- **红线规定**：严禁继续使用当前 100 样本 checkpoint 冒充原始 v7 权重；已进行的 `v8_clean_01` 中 SPATIAL_V2/S10 评测数据，只能客观表述为“对某个 100 样本替代 checkpoint 的测量结果”，不可作为旧 v7 正式模型的评测结论。

---

## 4. v8_clean_01 实验孤岛审查与缺陷发现

核查 `v8_clean_01` 历史产物，发现以下元数据与工程缺陷：

1. **元数据 RunId 错误**：
   - `docs/training/reports/agent_upgrade_20260921_v8_clean_01/data-and-training-coverage.json` 中的 `runId` 字段误记录为 `agent_upgrade_20260921_v7_01`；
   - `docs/training/reports/agent_upgrade_20260921_v8_clean_01/split_manifest.json` 中的 `runId` 字段同样误记录为 `agent_upgrade_20260921_v7_01`；
   - 根因：`tools/v7_training_pipeline.ts` 中 `RUN_ID` 常量写死，未动态绑定调用方传入的当前运行 ID。
2. **课程 E (CURRICULUM_PENDING) 真实样本为 0**：
   - `data-and-training-coverage.json` 中 `curriculumBreakdown.E_pending` 显式为 `0`；
   - 根因：在生成器中使用 `createAppApkSkirmishGameState` 初始化地图时，城堡上已有单位阻挡且指挥官未被移除，导致 `recruit_to_castle` 无法作为合法动作生成，直接被跳过；
   - 处置：必须在生成逻辑中真实移除阻挡/触发招募，使课程 E 产出 > 0，并在数据集中真实校验 `CURRICULUM_PENDING`。
3. **消费样本清单 `consumed_samples_manifest.json` 为空**：
   - `training_runs/agent_upgrade_20260921_v8_clean_01/checkpoints/spatial_resnet/consumed_samples_manifest.json` 中：
     - `"train_sample_ids": []`
     - `"val_sample_ids": []`
   - 根因：`python/train_spatial_resnet.py` 的 `SpatialDataset` 类在解析每一行样本时未保留 `sampleId` 字段，导致向清单写入时读取为空列表。
4. **失败窗口条数口径不一致**：
   - `task-status.json` 中声称捕获 `72 failure windows`；
   - 实际磁盘文件 `training_runs/agent_upgrade_20260921_v8_clean_01/failures/failure_windows.json` 经机器计数仅为 **49 条**；
   - 处置：后续报告严禁人工估计，必须通过机器精确核验。

---

## 5. 新一轮执行策略

本轮 `agent_upgrade_20260921_v8_final_01` 将全面修正上述问题：
1. 修复代码前编写真实失败测试（利用临时目录）；
2. 修复 `runId` 透传、课程 E 生成、`sampleId` 消费记录；
3. 执行严格的过拟合测试（训练准确率 $\ge 90\%$ 或损失显著压低）；
4. 运行 10k pilot 训练与两座位 DAgger 纠偏，产出可机器核验的完整清单；
5. 在新 runId 下重跑涵盖所有策略身份的 R8-03 干净基准评测。
