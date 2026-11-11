# Phase 6 困难AI专项

本轮唯一对手为 Original-APKlikeAI-Hard。最终入口见 REPORT.md、RESULT.json 和 FINAL_VERIFICATION.json；CURRENT.md 位于上级 status/。

- `arena.ts`：沿用公共严格引擎的标准/扩展地图换边评测，保存独立源码、模型副本、逐步动作和反扑见证。
- `verify.ts`：不调用AI的独立strict重放。
- `extract.ts`：从36个自然终局父局提取去重标签，按父局分区；所有来源动作重新strict复核。
- `train.py`：从gen03联合精调骨干、Policy和Value，保留3轮权重和优化器状态。
- `parity.ts`：同一冻结张量的PyTorch/Node前向对照。
- `gen_05/`：最终模型、全部轮次、开发指标、训练/源码身份和一致性收据。
- `corpus/`：冻结编码帧、所选源状态、父局分区、逐文件SHA。
- `protocol.json`、`sampling-protocol.json`：预算、种子、训练参数与扩展开局扰动。

执行过的入口依次为阶段6.1首轮、v6r2堆叠守军修复、v6r3有效血量修复；后两者没有覆盖首轮。run_phase6.py 的提取等待进程因运行时复核主动中止，原日志保留；finish_phase6.py 完成后续依赖步骤。运行器禁止覆盖已有正式输出，不能直接重跑旧命令覆盖目录。

本轮新工具可从仓库根目录通过 `node ai_training/run.mjs node --import tsx dual_stream_v2_phase6_20261022/verify.ts <评测绝对目录>` 独立重放。Python使用 `C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe`，PATH默认解释器没有PyTorch。

标准五图已用于方法开发和训练来源，父局开发分区不代表独立盲测。严格重放确认规则执行一致，不代表搜索具有战术完备性；所有胜负、截断、错误与时延必须分别查看。
