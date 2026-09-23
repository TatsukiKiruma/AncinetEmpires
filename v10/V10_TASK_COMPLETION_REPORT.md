# V10 任务完成情况报告

审查基准：`88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037`（`path-b-spatial-ai`）。

本报告描述 V10 任务本身的完成程度与证据边界，不记录对话过程。

## 总结论

V10 的工程修复、数据管线、搜索对照、表示消融、价值校准与条件闸门都已按真实实验重做。当前可确认的结论是：**在冻结协议下没有出现可验证的棋力提升**。

- 新 checkpoint 纯策略弱于旧模型。
- S10 搜索没有稳定超过 S00。
- DAgger 新数据即使真实进入训练，也没有转化为自然终局胜率。
- 回合感知宏动作搜索原型显著弱于 S00。
- 表示消融没有赢家；soft+equiv 损失只改善排序 regret，却降低 top-1。
- 价值头仍未 qualified；搜索内 value 验证没有正向信号。
- 因此 T10-07 与 T10-08 按条件依赖保持 NOT_RUN。

## 任务状态

| 任务 | 状态 | 结论 |
|---|---|---|
| T10-01 | 修正分析完成；确认部分完成 | 纯策略 newBest 0%（40场） vs old 14.7%（40场）；S10 55.6%（20场） vs S00 53.8%（22场），截断率 55%/41%，搜索结论 INCONCLUSIVE |
| T10-02 | 完成 | 454 episodes，自然终局 349，唯一状态 79,595，root 隔离 train/val_id/val_ood/test = 37/17/36/100，回放错误 0 |
| T10-03 | 完成；无验证收益 | 扩量到 3,980 个唯一状态（256 局采样）；C 消费新样本 3,980/3,980；A/B/C 自然胜率均为 0% |
| T10-04 | 部分完成；不优于基线 | 真实 fixture 完成；正式对照 S00 26 场自然胜率 28.6% vs turn-aware 40 场 0%（0W/29L/11T）；80 场目标未跑满 |
| T10-05（表示） | 完成；无赢家 | Arm1/Arm2(GAP)/Arm3 的 OOD top-1 = 29.50% / 29.50% / 29.75% |
| T10-05（损失） | 完成；混合信号 | CE top1 46.88%、regret 290.16；soft+equiv top1 45.39%、regret 243.57 |
| T10-06 | 完成；value 未合格 | 4,888 个价值样本（自然 3,983）；Arm2 Pearson 0.0556、MSE 0.8656；valueHeadQualified=false |
| T10-06（搜索内 value） | 诊断完成；无正向信号 | value off：0W/14L/6T；value on：0W/12L/8T；均为 0 胜 |
| T10-07 | NOT_RUN | T10-03 无正向自然终局收益；T10-06 value head 未 qualified |
| T10-08 | NOT_RUN | 无通过 P0 闸门的冻结候选；未执行 400 场确认 |

## 关键实测

### T10-01：新 checkpoint 与搜索基线

- `SPATIAL_V2_OLD`：自然 W/(W+L)=14.7%（40 场）
- `SPATIAL_V2_BEST`：自然 W/(W+L)=0%（40 场）
- `S00_SEARCH`：自然 W/(W+L)=53.8%（22 场，截断 40.9%）
- `S10_SEARCH_BEST`：自然 W/(W+L)=55.6%（20 场，截断 55%）

边界：纯策略比较确认未提升；搜索比较场次少且截断极高，只能判 INCONCLUSIVE，不能声称 S10 升级。原报告把 S10 搜索成绩归因给纯策略新 best 的错误已修正。

### T10-02：有效数据与 root 隔离

- episodes：454
- 自然终局：349
- censored/截断：105
- 唯一状态：79,595
- root 隔离：train 37 / val_id 17 / val_ood 36 / test 100
- 回放错误：0

边界：确认用的真实开局变体轨迹可以产出有效对局结果，但其 replay-derived 唯一状态/课程覆盖按默认设置近似；价值提取会跳过无法忠实重放的 episode。

### T10-03：数据扩量与受控训练

- 新增采样：256 局（4 个 64 局 chunk）
- C 使用唯一状态：3,980（critical 131 / divergence 2,269 / audit 1,580）
- C consumed manifest：3,980/3,980 新样本全部进入训练
- B/C 同更新预算：B val_acc 48.62%，C val_acc 48.79%
- 三臂实战（20 场/臂）：A/B/C 自然 W/(W+L)=0% / 0% / 0%

结论：数据量目标（2k–5k）达成；没有可验证的自然终局收益。

### T10-04：回合感知搜索与正式对照

- Fixture 1：真实相邻致命威胁，lethalDetected=11。
- 已实现 prior off/real/shuffled 仪表与危险动作排序。
- 已修复搜索评估完整宏链但实际只执行第一步的提交 bug。
- 正式对照：
  - S00_SEARCH：26 场，4W/10L/12T，自然 28.6%，截断 46.2%
  - T10_TURN_SEARCH：40 场，0W/29L/11T，自然 0%，截断 27.5%

结论：没有搜索升级；正式 80 场未完整执行，但差距方向明确。

### T10-05：表示与损失

表示消融（同数据、同 split、只改表示）：

- Arm1 2-block：val_acc 48.62%，OOD top-1 29.50%
- Arm2 2-block+GAP：val_acc 48.77%，OOD top-1 29.50%
- Arm3 4-block：val_acc 48.72%，OOD top-1 29.75%

损失消融（2,560 条 teacher 样本，含 teacherQ 与等价动作组）：

- CE：top-1 46.88%，groupAcc 46.88%，teacher regret 290.16
- soft+equiv：top-1 45.39%，groupAcc 45.39%，teacher regret 243.57

结论：GAP 已真实实现，但无表示赢家；soft+equiv 有排序信号但损失 top-1，不能采用。

### T10-06：价值学习、分层与搜索内验证

数据：

- 价值样本：4,888（自然 3,983，censored 905）
- 训练/验证：train 2,646 / val_id 548 / val_ood 1,694
- 无法忠实重放的变体 episode 会被价值提取跳过。

校准（Arm2 cv=0.1）：

- Pearson：0.0556
- MSE：0.8656
- ECE：0.033
- valueHeadQualified=false
- recommendedForDownstream=null

按采集策略分层（Arm2）：

- SPATIAL_V2_BEST：Pearson 0.0436
- SPATIAL_V2_OLD：Pearson 0.3693
- S00_SEARCH：Pearson -0.1104
- S10_SEARCH_BEST：Pearson -0.1652
- T10_TURN_SEARCH：Pearson 0.2701

搜索内 value 诊断：

- off：0W/14L/6T
- on：0W/12L/8T

结论：value head 不满足预注册阈值；分层显示不同采集分布下行为不一致；搜索内无正向信号。

## 预算与合规

- 未接入付费算力。
- 未改变默认生产 AI。
- 未改变游戏规则。
- 旧 v10 工件未被覆盖；修正工件在 v10/fix_01/。
- V7/V8/V9 归档包与版本报告文档已删除；V7/V8/V9 工具代码保留，因为 V10 工具链仍依赖。

## 产物索引

- v10/fix_01/TASKS_1_5_RESULTS.md
- v10/fix_01/T10-01_corrected_report.json
- v10/fix_01/T10-01_confirmation.json
- v10/fix_01/dataset_v10_manifest.json
- v10/fix_01/split_v10.json
- v10/fix_01/episodes.jsonl
- v10/fix_01/dagger_controlled_report.json
- v10/fix_01/T10-03_report_881states.json
- v10/fix_01/turn_search_profile.json
- v10/fix_01/T10-04_formal_comparison.json
- v10/fix_01/representation_ablation.json
- v10/fix_01/T10-05_loss_ablation.json
- v10/fix_01/value_calibration.json
- v10/fix_01/policy_value_ablation.json
- v10/fix_01/T10-06_search_value_comparison.json
- v10/fix_01/value_gate.json
- v10/fix_01/expert_iteration_round1.json
- v10/fix_01/confirmation_results.json
- v10/fix_01/browser_e2e.json

## 未完成与阻塞

- T10-01 搜索臂确认只完成部分新增场次，且截断率高。
- T10-04 正式对照 S00 只跑到 26/40；方向明确，但不是完整 40/40。
- T10-05 soft+equiv 只有单 seed，且 top-1 下降。
- T10-06 value head 未 qualified；搜索内 value 与采集策略分层均不稳定。
- T10-07/T10-08 必须等待至少一条学习线出现可复核收益后才能启动。
