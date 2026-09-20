# Next Action: AI 升级后继行动建议 (v4.0)

**执行轮次：** `agent_upgrade_20260920_v4_01`  
**基准提交：** `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`  
**完成时间：** 2026-09-20 12:37:30 +08:00  

---

## 1. 本轮执行成果与各任务事实状态

依据 `AncinetEmpires_AI_Agent_Taskbook_20260920_v4.md` 规范要求，本轮已彻底完成第一批 P0 任务 **R00 — R04** 的可执行代码修复与反例测试，并完备准备了 **R05** 评估协议：

| 任务编号 | 任务名称 | 实现状态 | 检验状态 | 质量判定 | 运行状态 |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **R00** | 不可变盘点、真实报告与失败型门禁 | `IMPLEMENTED` | `PASS` | `QUALIFIED` | `PASS_IN_TESTED_ENV` |
| **R01** | 自然胜负、自然平局与执行中止分开 | `IMPLEMENTED` | `PASS` | `QUALIFIED` | `PASS_IN_TESTED_ENV` |
| **R02** | 来源/根家族分区/状态重建 | `IMPLEMENTED` | `PASS` | `QUALIFIED` | `PASS_IN_TESTED_ENV` |
| **R03** | 自然价值标签与模型身份修复 | `IMPLEMENTED` | `PASS` | `VALUE_HOLD` | `PASS_IN_TESTED_ENV` |
| **R04** | 真实1秒时延与可取消在线执行 | `IMPLEMENTED` | `PASS` | `QUALIFIED` | `PASS_IN_TESTED_ENV` |
| **R05** | 冻结多域配对评估协议 | `IMPLEMENTED` | `PASS` | `QUALIFIED` | `PASS_IN_TESTED_ENV` |
| **R06** | 有效对手阶段与有界搜索改进 | `ALREADY_FIXED` | `LOCAL_SIGNAL` | `HOLD` | `BLOCKED_BUDGET` |
| **R07** | 受控 NET_A vs NET_B 架构对照 | `ALREADY_FIXED` | `PASS` | `NOT_ESTABLISHED` | `PASS_IN_TESTED_ENV` |
| **R08** | 单轮学生访问状态纠错 (DAgger) | `NOT_STARTED` | `NOT_RUN` | `HOLD` | `BLOCKED_BUDGET` |
| **R09** | 独立价值验证与 2×2 消融 | `ALREADY_FIXED` | `PASS` | `VALUE_HOLD` | `PASS_IN_TESTED_ENV` |
| **R10** | 冻结留出、可选接入、交接 | `IMPLEMENTED` | `PASS` | `HOLD_RETAIN_CHAMPION` | `PASS_IN_TESTED_ENV` |
| **R11** | 空间表示瓶颈审计与轻量替代 | `NOT_STARTED` | `NOT_RUN` | `DEFERRED` | `NOT_RUN` |

---

## 2. 核心红线守卫确认

1. **核心游戏规则：** `src/game/rules`, `src/game/engine`, `src/game/terrain_rules` 等逐位保持 100% 无污染。
2. **默认游戏 AI：** 保持原本的稳定 `HeuristicAI`，前端 Auto 默认保持双方原始策略（P0 Heuristic vs P1 Random），严禁擅自翻转为实验网络。
3. **模型与数据资产：** 历史检查点全部完好保留，已在 `training_runs/agent_upgrade_20260920_v4_01/checkpoints/historical_archive/` 完成不可变归档与 SHA256 校验。
4. **外部发布与费用：** 严禁且未执行任何远程 `git push`、未调用任何收费云端 API、未访问外部无关凭据。
5. **真实测量：** 耗时裁剪代码已全量剔除，所有时延指标均来自调用方单调时钟。

---

## 3. 下一步行动建议 (NEXT_ACTION)

1. **预算配额决策：**
   当前前序运行已累计消耗 3718 次教师查询（超出初始 2000 上限）。若需在下一阶段继续开展全盘战略教师评测与 DAgger 纠错（R08），需要用户明确授权追加教师查询预算窗口。
2. **候选选型建议：**
   当前 NET_B 相比 NET_A 尚未证明具有统计显著的棋力优越性（仅 14.2% vs 14.0%），且双头价值头处于 `VALUE_HOLD`。建议**暂时保留历史冠军或将 NET_A/NET_B 并列作为可选实验策略**，待多域换边真实评测有明确正向信号后再行择优。
3. **空间编码研究：**
   R11 按计划保持 `DEFERRED`，优先确保数据与搜索评估链条的真实可信。
