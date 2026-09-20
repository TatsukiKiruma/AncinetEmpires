# 历史证据与门禁可信度审计报告

**审查基点：** `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`  
**执行轮次：** `agent_upgrade_20260920_v4_01`  
**依据文档：** `AncinetEmpires_AI_Progress_Review_20260920_v4.md` 及 `AncinetEmpires_AI_Agent_Taskbook_20260920_v4.md`  

---

## 1. 历史成果有效性核查 (ALREADY_FIXED vs OPEN_DEFECTS)

经过对当前代码库及审查提交 `85a87a0` 的逐项代码核验：

| 模块/功能 | 状态 | 核验证据 |
|---|:---:|---|
| 45维动作语义编码 (`encodeGameActionV2`) | **ALREADY_FIXED** | `tools/skirmish_network_features.ts` 与 `tools/skirmish_network_features_n02.test.ts` (5个反例单测通过) |
| 有限差分数值梯度检验 | **ALREADY_FIXED** | `tools/skirmish_dual_head_net.test.ts` (差分误差 $< 4.2 \times 10^{-6}$，通过) |
| 严格模型加载器 (权重校验/NaN检测) | **ALREADY_FIXED** | `tools/skirmish_dual_head_net.ts` `loadDualHeadModelFromJson`，通过 |
| 状态特征标准化折入 Trunk | **ALREADY_FIXED** | `foldInputStandardization` 在 `tools/skirmish_dual_head_net.ts` 实现且通过 |
| 搜索多通道候选注入与交接推演 | **ALREADY_FIXED** | `tools/skirmish_search_teacher.ts` 已支持波束配额与真实交接推演 |
| 门禁判定与结果计算 (F4-01) | **OPEN_DEFECT** | 原脚本直接输出固化模板 `OFFICIALLY PASSED` 与固化指标，需改为纯函数计算 |
| 自然结果与截断分离 (F4-02) | **OPEN_DEFECT** | 原评估将 `winnerAlliance == null` 判定为平局，8局全部150步截断，需重新分类 |
| 根家族独立分区 (F4-03) | **OPEN_DEFECT** | 原 holdout 仅改变单位坐标 `seed%2`，非独立根家族，已转为开发回归集 |
| 价值头标签与分区泄漏 (F4-04) | **OPEN_DEFECT** | 混入裁定与未解决0.0，全局随机洗牌无 episode/根隔离，需降级为 `VALUE_HOLD` |
| 真实时延与耗时裁剪 (F4-06) | **OPEN_DEFECT** | 原搜索 `Math.min(deadlineMs, ...)` 裁剪耗时，前端同步调用无看门狗取消机制 |
| 模型产物不可变性 (F4-09) | **OPEN_DEFECT** | 原训练直接覆盖公共 `training_runs/models/net_b_checkpoint.json`，需重构为不可变 run 目录 |

---

## 2. 状态重标记声明

依据复核原则，对各关键能力模块正式重标记如下：

- **NET_B vs NET_A 选型：** 标记为 `NOT_ESTABLISHED`（原测试仅多1条样本正确，loss 更差，仅单seed未证明通用优越性）。
- **全盘搜索教师：** 标记为 `HOLD`（原开局3负5未解决，战略参数不一致）。
- **残局搜索教师：** 标记为 `LOCAL_SIGNAL_ONLY(endgame)`（原胜利仅出现在P0，P1全未解决）。
- **双头网络价值头：** 标记为 `VALUE_HOLD`（标签存在截断混入与分区泄漏风险）。
- **1000ms 在线时延合规：** 标记为 `NOT_VERIFIED`（原统计数据被人为裁剪）。
- **默认 AI 切换资格：** 标记为 `HOLD`（严禁擅自修改用户默认规则与 AI）。

---

## 3. 证据链完整性重构说明

1. 本轮运行已在 `training_runs/agent_upgrade_20260920_v4_01/checkpoints/historical_archive/` 完成现有模型物理归档，SHA256 校验一致。
2. 预算账本继承 `agent_upgrade_20260920_01` 的累计消耗，严格遵守 `teacherQueries: 2000` 上限。因历史消耗已达 3718，本轮禁止新增未经授权的大规模教师查询，优先执行无副作用的验证与离线门禁。
