# V19 历史回放恢复数据审计

- 结论：**PASS**；数据完整性=True，恢复完整性=True；错误 0 项，警告 1 项。
- 原始五分片：选择覆盖 50/50 条；整局回放验证通过 49 条，含编码的 PASS 49 条；原始结果保持不变。
- 有效恢复视图：整局回放验证通过 50/50 条，含编码的 PASS 50/50 条，FAIL=0，TIMEOUT=0。
- 监督行：1600 行，1586 个独特 inputIdentity；精确重复 14 行。
- 同 inputIdentity 的硬目标冲突：0 个；教师分数或元数据差异：8 个。后者不等同于训练目标动作冲突。
- 主五图双人分层（按 stateJson 重算）：320 行，317 个独特 inputIdentity；原 provenance 误标 320 行。
- 语义初态家族：37 个，其中跨 episode 重复家族 7 个；按 stepIndex=0 的 inputIdentity 合并，不按 seed 拆分。
- current opening 边界：eligibleForCurrentOpeningDataset=true 为 0 行；主图双人标签不改变历史恢复数据身份。

## 警告

- 原 provenance.mainMapTwoPlayer 与 stateJson 重算结果不一致 320 行；这是已知短名比较问题，不判为数据内容失败。

完整的哈希核验、分布、重复组和冲突明细见 `audit.json`。
