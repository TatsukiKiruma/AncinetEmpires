# T07 证据、裁判与评测协议审计报告 (AUDIT_REPORT.md)

- **执行日期**：2026-10-14 02:40:00
- **工作区路径**：`C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500`
- **冻结规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **干净交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`
- **审计结论**：历史证据与评测实现存在 8 项严重偏差；已完成严格代码修正并确立法定基线。

---

## 1. 历史评测与证据链的 8 项关键缺陷核验

通过对 `r4_teacher_stage_20261013_121700` 代码与产物的逐项排查，证实以下历史缺陷：

| 序号 | 缺陷项 | 历史代码位置 | 实测复现证据 | 对历史结论的影响与更正 |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **截断归因混淆** | `scratch/evaluate_gate_b.ts:129-135` | `else if (rec.outcome.isTruncated) { failureStats.endgame_loop++; }` 将换手上限（`truncated_ply_limit`）、原子步上限（`truncated_step_limit`）与墙钟超时全部盲目计入 `endgame_loop`。 | 历史报告声称“39/40 死锁循环截断”并不准确，掩盖了长盘慢节奏换手耗尽与其他截断原因，使归因失真。 |
| **2** | **伪换手开局** | `research/evaluate.ts:107-109` | `const targetSteps = family === '4_handoff' ? 4 : 8; for (let step=0; step<targetSteps; step++) { engine.step(...); }` 直接执行原子动作而非真实玩家轮换。 | 名为 `4_handoff`/`8_handoff`，实为走 4 或 8 个原子动作（常停留在第 1 回合内），未真正形成多样化开局盘面。 |
| **3** | **推演相位未对齐** | `research/search_teacher.ts:151,178,192` | 本方推演达 20 步或对手推演达 `maxSimulationSteps` 时跳出循环，但未检查当前行动联盟是否重回 root 联盟，直接调用 `evaluateStateValue`。 | 将半成品中间状态冒充统一行动相位评估，造成 Q 值评估失真。 |
| **4** | **Bootstrap 未分层** | `research/evaluate.ts:57-89` | `bootstrapConfidenceInterval` 直接对全体样本平铺抽样，未实现文档宣称的按地图分层与开局家族簇处理。 | 历史宣称的“分层 Bootstrap”系未落实现象，无法反映跨地图方差结构。 |
| **5** | **轨迹去重失真** | `research/evaluate.ts:178,189,288` | `uniqueHashes.add(rec.outcome.finalStateHash); uniqueTrajectoriesCount: uniqueHashes.size` 使用终态哈希计数。 | 终态哈希相同不代表轨迹相同，亦无法证明初始局面或轨迹的独立性。 |
| **6** | **战术题答案单一与干扰** | `scratch/build_tactical_suite.ts` 及 `eval/tactical_suite.json` | 初始盘面保留城堡招募且金币充足，AI 选 `recruit_to_castle` 估值更高导致 15 题失败；等价合法走法未纳入答案。 | 战术题将等价或不同行动顺序误判为失败，分母存在系统性偏差。 |
| **7** | **候选选择探索配额失效** | `research/candidate_selector.ts:100-115` | `nonTopPriorFraction` 参数未参与计算，`remainingSlots = K - chosenIndices.size`，若前置类型占满 K，探索动作数为 0；且依赖未置种的 `Math.random`。 | 候选搜索缺乏确定性探索配额，候选集合顺序依赖固定类型遍历。 |
| **8** | **统计门槛定义重复** | `scratch/evaluate_gate_b.ts:154-155` | `conservativeScoreA` 直接赋值为 `ci.lower95`，导致“保守得分≥60%”与“CI 下界>50%”检查同一个标量。 | 门槛语义混淆；明确“保守得分”指置信下界达标，“CI 下界>50%”指统计显著胜势。 |

---

## 2. 评测协议与核心基础设施修正

本阶段在完全隔离的研究目录下重构并交付以下核心协议模块：

### 2.1 真实换手开局生成器 ([openings.ts](file:///C:/code/AncinetEmpires/ai_training/r5_eval_teacher_v2_20261014_023500/research/openings.ts))
- **真实换手计数**：以 `currentPlayer` 切换作为 1 次换手，严格推演至目标换手数（0、4、8）。
- **零容忍非法动作**：基线 AI 动作必须严格属于合法候选集，若引擎或策略报非法动作，**显式抛出致命异常**，严禁静默回退（如 `legal[0]`）。
- **元数据绑定**：同时记录 `initialBoardHash`、`openingStateHash`、`openingActionCodes` 与开局家族标识。

### 2.2 终局归因与轨迹唯一性 ([statistics.ts](file:///C:/code/AncinetEmpires/ai_training/r5_eval_teacher_v2_20261014_023500/research/statistics.ts))
- **轨迹唯一性哈希**：
  $$\text{TrajectoryHash} = \text{SHA256}(\text{InitialStateHash} \parallel \text{ActionCodesSequence})$$
  由全轨迹动作序列决定，彻底杜绝终态哈希冒充。
- **精细截断分类**：
  明确细分为 `truncated_repeated_state`（3折重复局面循环）、`truncated_ply_limit`（换手数耗尽）、`truncated_step_limit`（原子步耗尽）与 `truncated_wall_seconds`（墙钟超时）。

### 2.3 分层 Bootstrap 95% 置信区间 ([statistics.ts](file:///C:/code/AncinetEmpires/ai_training/r5_eval_teacher_v2_20261014_023500/research/statistics.ts))
- **配对单元**：以先后手配对为基本单元，配对得分 $S_{\text{pair}} \in [0, 1]$（胜=1，平=0.5，截断/负=0）。
- **按地图分层抽样**：在每个地图层内部独立进行有放回重抽样，汇总均值分布，计算 2.5% 与 97.5% 分位数。
- **先后手独立指标**：独立计算 `seat0WinRate` 与 `seat1WinRate`（分母均为 `totalGames`）。

---

## 3. 针对性回归测试与验证记录

在独立工作区执行单元测试：
1. `npm test` 在独立环境下回归 285 项规则测试：**PASS** (100% 匹配)；
2. `match_runner.test.ts` 验证 1,157 步精确重放与进程硬超时杀灭：**PASS**；
3. `evaluate.test.ts` 验证真实换手开局生成、非法动作显式抛错、轨迹哈希唯一性与分层 Bootstrap：**PASS**；
4. `features.test.ts` 验证 Schema 契约与 Golden 样本 100% 精确重建：**PASS**。

受保护的主项目核心文件变动数：**0**。
