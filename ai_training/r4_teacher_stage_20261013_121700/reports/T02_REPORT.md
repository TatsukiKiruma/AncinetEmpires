# T02: 固定赛场、开局与战术题报告

- **执行日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **状态判定**：**PASS**

---

## 1. 赛场划分与历史地图使用清点

依照 `AncientEmpires_AI_Strategy_Package.zip` 中 `configs/plan_defaults.yaml` 与现行 r4 交付规范，对内置 8 张双人官方地图进行了严格的赛场划分，配置文件保存于 `configs/scenario_split.json`：

| 分组 | 地图名称 | 尺寸 | 历史角色与本阶段边界 |
|---|---|---|---|
| **train** | `(2) Duel.aem` | 13×13 | 历史默认测试图，训练与基准开局来源 |
| **train** | `(2) Liberty Port.aem` | 13×13 | 港口水陆混合图，训练来源 |
| **train** | `(2) Swamplands.aem` | 10×10 | 沼泽低速水草图，训练来源 |
| **dev** | `(2) Icy Paths.aem` | 15×15 | 冰雪独立评测图，用于搜索教师开发与 Gate B 验证 |
| **dev** | `(2) The Crossing.aem` | 15×10 | 狭窄桥梁走廊图，用于搜索教师开发与 Gate B 验证 |
| **test** | `(2) Peak Island.aem` | 15×15 | 离岛封存地图，T12 最终发布前严禁消费与调参 |
| **test** | `(2) Crossed swords.aem` | 11×18 | 双剑狭长封存地图，T12 最终发布前严禁消费与调参 |
| **quarantine** | `(2) Mourningstar.aem` | 11×11 | 含有 2 处 APK terrain 30 近似地块，按策略严格隔离 |

- **模式与初始配置**：双人对战，2 个敌对联盟，SD 遭遇战模式；初始金币 300，人口上限 30，等级上限 3。

## 2. 战术题套件构建

生成并严格验证了 44 个规则有效的战术题目（保存于 `eval/tactical_suite.json`），全部经权威 `GameEngine` 逐一检验，预期动作全部真实合法：
- **总题目数**：44 题（要求 ≥ 40 题）
- **分类覆盖**：15 种核心战术类别全覆盖（斩首指挥官、城堡占领、治疗保核、墓碑召唤、卡位阻挡、黑魔法致盲、集火输出、城镇经济占领、据点修复、长程拉扯、两栖机动、克制招募、濒死撤退、墓碑压制、等级碾压）
- **难度与性质划分**：
  - 可证明验收题（`isDiagnostic: false`）：32 题
  - 启发式诊断题（`isDiagnostic: true`）：12 题

## 3. 配对评测与分层统计协议

在 `research/evaluate.ts` 中实现了完整的配对竞技场运行器与分层 Bootstrap 统计计算：
- **控制侧交换**：每对对局严格包含同一初态下的 Seat 0 与 Seat 1 互换，消除先后手偏置；
- **开局家族**：支持 0-handoff（标准初态）、4-handoff（短前缀中局）、8-handoff（展开中局）家族；
- **统计指标**：严格分离 W/L/D/T/E，输出有效独立轨迹数与按配对簇分层 bootstrap 95% 置信区间下界（保守得分）；
- **测试验收**：在 `research/evaluate.test.ts` 中完成 5 项全面测试全部通过。
