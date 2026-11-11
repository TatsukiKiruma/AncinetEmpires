# R8 交付入口

状态：大阶段已结束，**模型未达标（REJECTED）**，未登记或发布。

- FINAL20：1胜19负、0截断0错误，5%，目标至少16胜。
- 严格独立性失败：2场FINAL与DEV完整轨迹重复，FINAL内部另有1对重复。
- 已完成三轮、五次各12000更新的正式训练，以及领先配方的完整第二seed；第二seed为0胜19负1截断。
- 当前保留候选：`checkpoints/r1_warm/best.json`，SHA-256 `44570e4c18a7ba0cf99a239fc58501b2d34e1e2c1dcc2b60bca0a4a4cd4ec812`。
- 保护账本14940文件与冻结依赖无变化；原git修改完整保留。全部模型、数据、逐局轨迹、失败证据及恢复状态保留。

先读[阶段报告](STAGE_REPORT.md)和[逐项验收](reports/要求逐项验收.md)。机器裁决见[evidence/final_acceptance_verdict.json](evidence/final_acceptance_verdict.json)，完整性见[交付索引](identity/delivery_manifest.json)。

恢复资产位于各`checkpoints/<run>/`：best/last PT和JSON、config、initial、ledger。训练数据和依赖按配置哈希固定；`tmp/venv`是运行依赖，应保留。现有脚本默认输出本阶段目录，后续复用应在独立新目录安排输出，避免覆盖历史结果。

本阶段已排除“仅修投降/仅增多图样本即可达标”的乐观假设；DAgger和座位均衡没有带来自然胜收益。当前仍需解决经济/战术误选和评测独立性，未以失败证明纯模型路线无效，也没有预设MCTS/RL。
