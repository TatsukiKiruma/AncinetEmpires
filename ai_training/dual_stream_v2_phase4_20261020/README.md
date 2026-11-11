# 双流v2阶段4

公共实现位于 `src/ai_runtime/dual_v2/`。纯策略通过 `{ tactical: true, headBias }` 显式启用，旧默认argmax路径保留；搜索构造器为 `DualStreamTurnSearchAI(model, { headBias, valueCalibration, onWitness })`。没有接入应用入口或改动权威游戏规则。

所有命令在仓库根目录运行。已封存结果不要覆盖；复跑应使用新目录并重新登记身份。

```text
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase4_20261020/calibrate.py
node --import tsx ai_training/dual_stream_v2_phase4_20261020/combo_regressions.ts
node --import tsx ai_training/dual_stream_v2_phase4_20261020/probe.ts
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase4_20261020/reference.py
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase4_20261020/value_reference.py
node --import tsx ai_training/dual_stream_v2_phase4_20261020/prepare_pipeline_parity.ts
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase4_20261020/pipeline_reference.py
node --import tsx ai_training/dual_stream_v2_phase4_20261020/parity.ts node
node ai_training/run.mjs node dual_stream_v2_phase4_20261020/browser_runner.mjs dual-v2-stage4-pure
node --import tsx ai_training/dual_stream_v2_phase4_20261020/battle.ts play 0 2
node --import tsx ai_training/dual_stream_v2_phase4_20261020/battle.ts play 1 2
node --import tsx ai_training/dual_stream_v2_phase4_20261020/battle.ts replay 0 1
npx tsc -p ai_training/dual_stream_v2_phase4_20261020/tsconfig.json --noEmit
```

`stream.ts`只读阶段3冻结压缩原态，重新核对SHA、排重和权威合法集合，校准不进行D2随机增强。train/dev缓存仅含冻结网络分数、max组统计和校准特征，不含全量dense空间特征。`value_reference.py`对另外89条固定开发真实前态验证新增校准层；原89输入的网络三端验收单独保留，不能把新增层探针冒称原89状态的来源补全。

`prepare_pipeline_parity.ts`恢复原89状态的完整前态，所有冻结观测数组逐字节相符；`pipeline_reference.py`和两端parity执行器进一步验证原89状态的网络、战术先验、动作偏置和价值校准组合流程。Node与Chrome均实际重新调用权威规则生成战术先验。

搜索队列保存完整快照字符串，校验无哈希碰撞，但校验复杂度随快照大小增长；性能以实际计时为准，不声称复杂度严格O(1)。风险中的静态三军伤害是现有可达性估计，真实反扑动作另有完整引擎见证与strict重放。未完成全部顺位风险覆盖时不能据此接管默认方案。

自然胜负、动作截断、墙钟截断和决策超时严格分开。失败门禁不得改成通过，开发面板不得称独立最终测试。
