# T03: 固定动作与特征契约报告

- **执行日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **特征 Schema 哈希**：`711019e84844d2b3a2f14e557ce8735efbf6ce98ceaf5c7d26d86ffae94fb658`
- **状态判定**：**PASS**

---

## 1. 特征协议与张量维度交付

依据 `contracts/data_contract.md` 规范，实现并冻结了特征编码系统，配置文件保存于 `artifacts/features-v1.json`：

| 特征类型 | 张量 Shape | 维度 / 通道数 | 核心处理与边界保证 |
|---|---|---|---|
| **空间特征 (board)** | `[10, 20, 20]` | 10 通道 | 固定 20×20 空间，覆盖有效掩码、防御加成、回血率、移动成本、友/敌/中立所有权、城堡/城镇标记、耐久 |
| **实体表 (units)** | `[48, 16]` | 最多 48 实体，每实体 16 维 | **同格 pending 临时单位独立保留**（不被覆盖）、超上限 HP（如 190 HP）经 200 缩放保留精度、等级/经验、状态 |
| **全局特征 (global)** | `[12]` | 12 维 | 友/敌金币比率、单位数差、城镇/城堡数差、回合推进、行动方标识、pending 存在标记 |
| **动作特征 (actions)** | `[A, 20]` | 动态 A 维，每候选 20 维 | **支持任意动作数，绝不截断为 256**；包含动作类型 one-hot、发起/目标单位索引、目标坐标等 |
| **四种掩码** | `[A]` | 4 种独立布尔掩码 | `legalMask`（引擎合法）、`eligibleMask`（主动策略可用，默认过滤 surrender）、`searchCompletedMask`、`paddingMask` |

## 2. 观察者视角不变性

所有编码器均以 `observerPlayerId` 为唯一视角基准：
- 观察者所属联盟的所有玩家与单位均映射为友方（1.0）；
- 敌方联盟的所有玩家与单位均映射为敌方（-1.0 或独立 enemy 通道）；
- 经单元测试断言确认，P0 视角与 P1 视角互为精确镜像，具备视角不变性。

## 3. Golden 样例集生成与无损重建验收

- **生成位置**：`artifacts/golden/golden_samples.json`
- **样本总数**：269 份（要求 ≥ 200 份），全部来自 train/dev 真实对战及必要战术夹具
- **动作类型覆盖率**：13 / 13 种核心动作类型全部覆盖（`move`, `post_attack_move`, `attack`, `heal`, `support`, `summon`, `recruit_to_castle`, `recruit_and_deploy`, `capture`, `repair`, `destroy_town`, `wait`, `surrender`, `end_turn`）
- **100% 精确可重建性**：在 `research/features.test.ts` 中完成 269 份样本的全量重新生成校验，张量维度与数值 100% 字节一致。
