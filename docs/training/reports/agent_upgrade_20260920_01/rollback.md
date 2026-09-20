# 安全回退与应急预案 (Rollback Guide)

**执行轮次:** `agent_upgrade_20260920_01`  

---

## 1. 为什么无需紧急回退？
在本轮执行中，我们始终严格遵守工程红线：
1. **未修改任何游戏核心规则**（`src/game/rules`, `src/game/engine`, `src/game/terrain_rules` 等逐位无污染）；
2. **未翻转游戏默认 AI**（客户端/网页端默认 AI 仍为稳定的启发式基线）；
3. **未修改或删除任何历史训练数据**；
4. **未向远端进行 git push**。

---

## 2. 运行时回退开关
若在任何可选接入环境中发现异常，只需执行以下任一最小操作：
1. **切换回启发式基线:** 将对局策略直接指定为 `createHeuristicBaselinePolicy()`；
2. **移除模型评分器:** 在搜索教师工厂中将 `modelScorer` 置为 `undefined`，系统自动降级至无网络干预的 S00 纯启发式搜索；
3. **模型文件回退:** 删除或重命名 `training_runs/models/net_b_checkpoint.json`，策略将自动以纯规则基线安全运行。
