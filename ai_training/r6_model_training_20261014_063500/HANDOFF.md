# R6 阶段成果交接文档 (HANDOFF)

- **交接日期**: 2026-10-14T08:18:00+08:00
- **工作区绝对路径**: `C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500`
- **游戏规则环境**: `apk-4.2.5.1-rules-20261013-r4`
- **当前阶段主验收结论**: **NOT_MET (纯模型 1/20 胜，胜率 5.0%，未达 80% 成功门槛)**

---

## 1. 交付物与物证索引总表

| 资产类别 | 文件相对路径 | SHA-256 校验哈希 | 说明 |
| :--- | :--- | :--- | :--- |
| **冻结候选清单** | `artifacts/frozen_candidate_manifest.json` | `1c17238e49a5e0f964ef1417987be6681394beeb2ee640a6198df39636f7a954` | 候选模型规格与 20 局验收合同 |
| **最终验收裁定** | `artifacts/final_acceptance_verdict.json` | `87135e097c4288a33c9e1d3dcd0ea3b80a9975f13108ce4b522c0793fd2d306d` | 20 局逐局动作序列、哈希与胜负物证 |
| **冻结候选模型** | `artifacts/models/arm_a_warm_start.json` | `6df0fc279348df4f0ab1b27d4d55bcdbdb1261f45b5583a8c38e0b92a3ecda6f` | TS 前端可直接前向推理的最佳纯模型权重 |
| **对照组模型** | `artifacts/models/arm_b_scratch.json` | `dace3e3fbb1d176db654f0844cbbfa581ecd287a35349b256ee780fdec943f96` | 从零初始化训练的对照模型权重 |
| **训练台账** | `artifacts/training_ledger.json` | `3e78d4b6a4fda54450ade20914f722c4439d23461c1b7b03f3036f3d56863ef1` | 双臂训练 800 updates 演化记录 |
| **资产盘点** | `artifacts/asset_inventory.json` | `f289cf01fa7dd9ba9c792978a5e01eb123b3aa98b964319a51d8b67f1057e62a` | r4 规则与历史教师/模型资产核验证据 |

---

## 2. 报告文档套件

- **总阶段报告**: [STAGE_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/STAGE_REPORT.md)
- **正式主验收报告**: [FINAL_EVALUATION.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/FINAL_EVALUATION.md)
- **双臂训练实验报告**: [TRAINING_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/TRAINING_REPORT.md)
- **基线与教师对照报告**: [COMPARISON_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/COMPARISON_REPORT.md)
- **正确性修复与回归报告**: [CORRECTNESS_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/CORRECTNESS_REPORT.md)
- **资产盘点报告**: [ASSET_REUSE_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/ASSET_REUSE_REPORT.md)
- **阶段任务计划**: [TASK_PLAN.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/TASK_PLAN.md)

---

## 3. 可复现指令集

所有复现命令均在仓库根目录 `C:\code\AncinetEmpires` 下直接执行：

### 3.1 运行正确性回归测试 (5/5 PASS)
```powershell
npx vitest run ai_training/r6_model_training_20261014_063500/research/correctness.test.ts
```

### 3.2 运行双臂训练实验 (产生两臂模型与台账)
```powershell
python ai_training/r6_model_training_20261014_063500/research/train_arms.py
```

### 3.3 运行候选模型 DEV 面板对战
```powershell
node --import tsx ai_training/r6_model_training_20261014_063500/scratch/run_trained_models_eval.ts
```

### 3.4 复现 20 局正式主验收
```powershell
node --import tsx ai_training/r6_model_training_20261014_063500/scratch/run_final_formal_acceptance.ts
```

---

## 4. 后续接棒者的关键技术建议

1. **不要再试图仅靠有限小样本行为克隆来击败 HeuristicAI**:
   - 实测证明：P1 (10%)、θ1 (10%)、从零训练 Arm B (0%)、续训 Arm A (5%~10%) 在面对深度手工优化的 HeuristicAI 时，在全图经济扩张与防守反击上存在天然的战略盲区。
2. **推荐路线一：轻量 MCTS 引导的混合推理 (AlphaZero 式)**:
   - 现有的 `arm_a_warm_start` 已具备良好的落点与战术动作先验（Val Top-1 40.94%），若在推理时引入 30~50 次轻量展开模拟，即可利用前向推演过滤掉送兵与僵局动作，极大提升战术胜率。
3. **推荐路线二：强化学习自弈 (RL Self-Play)**:
   - 采用 PPO 算法，让模型以终局胜负为唯一奖励自弈对战，使网络能够自发学习“开局多路分兵抢占村庄”的宏观经济滚雪球策略。
