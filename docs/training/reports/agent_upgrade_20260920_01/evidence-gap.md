# N00 证据差距与审计核验说明（evidence-gap.md）

**Run ID：** `agent_upgrade_20260920_01`  
**审计提交基线：** `cfb07fcc97aff5c2155d3289ddb834ffd1f7522d`  
**当前 HEAD：** `cfb07fcc97aff5c2155d3289ddb834ffd1f7522d`（完全一致）  
**文档版本：** `AncinetEmpires_AI_Agent_Taskbook_20260920.md` (v3.0) & `AncinetEmpires_AI_Progress_Review_20260920.md` (v3.0)  

## 1. 源码与工作区现状

- 工作区处于 `qwen` 分支，HEAD 即为审计提交 `cfb07fcc97aff5c2155d3289ddb834ffd1f7522d`。
- 源码没有任何未提交变动（`src/` 与 `tools/` 代码逐位一致）。
- 工作区脏变更仅包含：用户删除 20260919 任务书、增加 20260920 任务书与审查报告，以及未跟踪的 `search-traces.jsonl` 测试输出。
- `npm test` 560 项现有测试全绿通过，`npm run lint` (tsc --noEmit) exit 0，`npm run build` 成功。

## 2. 证据差距分析

1. **历史实战成绩 vs 新模型：**
   - 最近可信实战成绩仍为 2026-09-18 的旧 v4 + 启发式收官辅助（自然胜 8/16 正常、11/12 残局）。
   - 2026-09-19/20 的双头网络（45k 参数原型）与网络辅助搜索消融仅完成了小规模开发验证（32 局四臂），尚未展现同预算棋力超越旧基线的证据；价值头因训练数据缺乏胜局样本而退化为常数平凡解（`verdict.valueCapabilityValidated=false`）。
   - **不能把旧 v4 的实战胜率安插给新网络。**

2. **F01—F08 缺陷核查状态：**
   - **F01 (动作语义与编码碰撞)：** 经源码核对，`encodeGameAction` 在招募动作时 `actor` 为 null，导致几何坐标段完全未写入；`destroy_town` 未读显式 `action.target`；攻击/治疗/支援目标仅编码数值未编码目标坐标，存在确定性碰撞。状态为 `IMPLEMENTED_WITH_FLAWS`，待反例驱动修复。
   - **F02 (固定动作索引混淆)：** 经源码核对，`migrateLegacyFeatureSample` 行 148 使用 `candidates.findIndex` 填充 `fixedActionIndex`，将局部采样下标误当作全局动作索引。状态为 `IMPLEMENTED_WITH_FLAWS`，待反例驱动修复。
   - **F03 (搜索候选保留保证)：** 经源码核对，`buildCandidatePool` 收集的多来源候选在行 412 统一按 `heuristicScore` 截断，导致模型推荐与探索动作被抹除。状态为 `IMPLEMENTED_WITH_FLAWS`，待反例驱动修复。
   - **F04 (对手交接与逐候选证据)：** 经源码核对，`handToOpponent` 在未切换阵营且无 `end_turn` 时返回 `ok`，把己方动作误当对手动作评估；全局 `sawOpponentPhase` 未绑定选中候选。状态为 `IMPLEMENTED_WITH_FLAWS`，待反例驱动修复。
   - **F05 (状态表示分箱与排序)：** 4x4 分箱有损、Top-10 实体截断存在信息损失。本轮优先在动作段增加精确语义，状态段保持紧凑并在必要时评估网格/实体影响。
   - **F06 (损失口径、加载容错与推理分配)：** `loadDualHeadModelFromJson` 存在缺失字段回退到随机初始化的问题；`toDense` 在纯推理时分配梯度数组；非有限输出静默归零遮蔽回退。状态待强化。
   - **F07 (数据哈希与视角契约)：** `sampleIdSeed` 需全面校验，玩家/联盟视角需严格隔离。
   - **F08 (轻量化与预算计时)：** 粗筛招募限流与内部计时存在偏差；需实现端到端 1,000 ms 在线 profile。

## 3. 后续工作路径

按任务书批次执行：
1. **N01—N04 关键修复**：反例测试驱动 -> 最小实现 -> 回归测试。
2. **N05 评估协议**：冻结节点面板与 1,000 ms 在线面板。
3. **Gate A2 报告**。
4. **N06 教师资格 & N08 A/B 深度基线**。
5. **N09 消融 & N10 交付**。
