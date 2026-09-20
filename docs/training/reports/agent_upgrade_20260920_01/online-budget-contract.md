# 在线 1,000 ms 底层动作决策预算契约 (N03-A)

**执行轮次:** `agent_upgrade_20260920_01`  
**模块:** `tools/skirmish_search_teacher.ts`  
**生效日期:** 2026-09-20  

---

## 1. 预算目标与硬时限约束

在 AncientEmpires 竞技与对局流程中，每个底层动作（即 `move`, `attack`, `recruit`, `capture`, `repair`, `destroy_town`, `heal`, `support`, `summon`, `wait`, `end_turn`）的端到端决策耗时上限为：

$$T_{\text{end-to-end}} \le 1,000 \text{ ms}$$

该耗时完整包含：
1. 状态传递与合法动作获取（`PlanningNode.legalActions()`）。
2. 特征提取与动作粗筛预过滤（`prefilterActions`）。
3. 候选动作评分（`heuristicRank` / 可选 `modelScorer`）。
4. 候选集合配额保留（`selectBeamCandidates`）。
5. 只读引擎前向推演、己方后续动作模拟与对手真实阶段交接（`handToOpponent`）。
6. 叶节点保守聚合评估与胜负短路判断。
7. 最终动作映射与索引回填。

---

## 2. 三段式时间窗口设计

为确保在任何复杂局面、GC 抖动或单步推演延时下均不突破 1,000 ms 硬约束，搜索教师采用三段式时间调度：

| 阶段 | 阈值参数 | 缺省值 (ms) | 触发行为 |
| :--- | :--- | :--- | :--- |
| **正常搜索** | $0 \le t < t_{\text{stop}}$ | 0 ~ 850 | 正常展开候选、模拟己方后续动作并进行对手回应评估 |
| **硬停止新增搜索** | $t \ge t_{\text{stop}}$ (`searchStopElapsedMs`) | 850 | 立即停止开启新的候选 rollout；当前进行中的微步骤完成后，将当前节点标记为截断叶节点并退出循环 |
| **决策返回窗口** | $t \ge t_{\text{return}}$ (`returnTargetElapsedMs`) | 950 | 立即提取已推演候选中的合法 incumbent，若无已完成推演候选则进入确定性启发式/首个合法动作兜底，返回合法动作 |
| **硬超时上限** | $t = t_{\text{deadline}}$ (`deadlineMs`) | 1,000 | 绝对上限，禁止超出 |

---

## 3. 兜底策略（Incumbent & Fallback）

1. **合法 Incumbent 保留：** 搜索在推演每一候选后即更新已推演候选列表。任何时刻因时限或节点预算截断时，直接在已推演的非空 `candidates` 中按 `(胜负 > 保守聚合估值 > 启发式分数 > 动作编码字典序)` 选出最优候选，`reason = 'selected'`。
2. **零候选完成兜底：** 若在首个候选完成前即触发 $t \ge 850\text{ ms}$ 或节点超限：
   - 优先选择未推演前预筛选集合中的启发式最高分合法动作，`reason = 'budget-fallback-heuristic'`，`fallbackUsed = true`。
   - 若启发式不可用，选择首个已检查合法动作，`reason = 'budget-fallback-first-legal'`，`fallbackUsed = true`。
   - 绝不返回非法动作，绝不抛出未捕获超时异常。

---

## 4. 真实对手阶段曝光证明 (F04 修复)

1. **显式交接契约：** `handToOpponent` 在未切换阵营且无合法 `end_turn` 时返回 `stop: 'incomplete'`，绝不返回 `stop: 'ok'`。
2. **严禁己方动作伪充敌方回应：** 仅当 `handed.stop === 'reached-opponent'` 且未终局时才调用 `evalOpponentReply`。
3. **逐候选回应标记：** 每个候选显式记录 `c.sawOpponentPhase`。决策顶层的 `decision.selectedSawOpponentPhase` 严格取自被选中的候选 `selected.sawOpponentPhase`，禁止用全局任意候选曾看过对手来混淆。

---

## 5. 验证套件与通过状态

- 单元测试：`tools/skirmish_search_teacher_n03.test.ts`
  - `F03反例：低启发式分但模型高推荐的候选动作必须保留在最终展开集合` (PASS)
  - `F04反例：处于本方阶段但无 end_turn 时（如 pending 状态），不得谎报已切换至对手阶段` (PASS)
  - `逐候选回应：selectedSawOpponentPhase 必须真实反映选中候选，而非搜索中其他候选` (PASS)
  - `N03-A 在线预算时效：850ms 停止新增搜索，返回合法 incumbent，不超过 1000ms` (PASS)
- 规划不变量与战术夹具测试：`tools/skirmish_search_teacher.test.ts` (11/11 PASS)
- 全量回归测试：`npx vitest run` (574/574 PASS, 0 FAIL)
- 类型检查与静态检查：`npm run lint` (0 ERRORS)
