# 远古帝国开发 Prompt 档案

本文保留原“1-6 步开发修改 Prompt”的用途，但不再直接堆叠过期长 Prompt。当前本地代码已经完成了大部分 1-6 步基础能力，继续开发时应优先处理招募机制、pending 行为、UI 入口和训练接口收口。

## 1. 使用原则

- 新任务开始前先阅读根目录 `README.md`、`远古帝国AI训练项目上下文.md`、`远古帝国AI训练规则整理.md`。
- 不要修改 `demo` 下的文档，除非用户明确要求。
- 代码修改应以 `demo/src/game` 的现有结构为准。
- 训练环境不能依赖 React UI。
- 不要通过测试专用绕过掩盖训练路径的非法动作问题。

## 2. 历史 1-6 步状态

| 步骤 | 原目标 | 当前状态 |
| --- | --- | --- |
| 1 | 正式地形与建筑规则 | 已有 16 类地形、收入、回复、修理、占领等基础。 |
| 2 | 真实兵种数据与伤害公式 | 已有 20 个兵种、物理/魔法攻防和正式伤害雏形。 |
| 3 | 能力系统框架与低风险被动 | 已有能力模块、地形之子、飞行、亡灵等。 |
| 4 | 状态系统 | 已有中毒、致盲、虚弱和净化。 |
| 5 | 主动技能、光环、墓碑、二次移动 | 已有治疗、召唤、支援、破坏、修理、光环、墓碑和突击移动。 |
| 6 | 经验、等级与升级 | 已有经验、升级阈值和主要升级加成。 |

这些步骤不建议直接重放。若需要修复基础能力，应先读现有代码和测试，再做小范围补丁。

## 3. 当前最高优先 Prompt：城堡招募收口

```text
你是一个资深 TypeScript 游戏规则工程师。请在 demo 项目中收口城堡招募机制。

背景：
- 当前本地代码仍使用旧 Action：{ type: "recruit"; unitClass; castlePos; spawnPos }。
- 当前 GameState 尚无 pendingUnitId。
- 目标规则需要拆分为空城堡招募和指挥官占城堡部署。

任务：
1. 将招募动作拆分为：
   - { type: "recruit_to_castle"; unitClass: UnitClass; castlePos: Position }
   - { type: "recruit_and_deploy"; unitClass: UnitClass; castlePos: Position; to: Position }
2. 在 GameState 增加 pendingUnitId。
3. 空己方城堡只生成 recruit_to_castle。
4. 己方指挥官位于己方城堡时只生成 recruit_and_deploy。
5. recruit_and_deploy 的 to 必须按该兵种移动力、地形消耗和阻挡规则从城堡格计算可达空地。
6. 城堡上有非指挥官单位或敌方单位时不能招募。
7. 招募成功后扣钱、生成确定性单位 ID，并设置 pendingUnitId。
8. pendingUnitId 存在时，禁止结束回合、继续招募、操作其他单位。
9. pending 单位移动后如果仍未结束行动，继续保持 pending；执行待机、攻击或其他结束行动后清空 pending。
10. 更新 encodeAction / decodeAction，并为 decodeAction 增加合法 UnitClass 校验。

测试至少覆盖：
- 空城堡招募。
- 指挥官占城堡招募与部署。
- 非指挥官或敌方单位占城堡不能招募。
- 无合法部署格时不生成招募动作。
- pending 限制其他操作、继续招募和结束回合。
- pending 单位移动后仍需完成行动。
- 招募扣钱、ID、行动状态和移动剩余值正确。

不要做：
- 不要实现 MCTS。
- 不要开始深度学习。
- 不要重写 UI 架构。
```

## 4. 手动沙盒 UI Prompt

```text
请修复 demo 手动沙盒中的城堡招募入口。

目标行为：
1. 点击己方城堡时，即使城堡上有己方指挥官，也能看到招募入口。
2. UI 可以同时展示城堡操作和城堡上单位信息。
3. 指挥官占城堡时，流程为：选择城堡 -> 选择兵种 -> 高亮合法部署格 -> 选择部署格 -> 自动选中新单位。
4. 空城堡时，流程为：选择城堡 -> 选择兵种 -> 新单位生成在城堡 -> 自动选中新单位。
5. pendingUnitId 存在时，UI 禁用结束回合、继续招募和其他单位操作。

限制：
- 不修改 demo 下的文档。
- 尽量拆分 UI 状态、动作过滤和展示组件，避免继续扩大 App.tsx。
- 所有用户可见文本使用中文。
```

## 5. 训练环境与 AI 适配 Prompt

```text
请适配 AncientEmpiresEnv、RandomAI 和 HeuristicAI，使其支持新的招募动作与 pendingUnitId。

要求：
1. env.getLegalActions() 返回包含 recruit_to_castle / recruit_and_deploy 的合法动作。
2. actionMask 与 legalActions 长度一致。
3. encodeAction / decodeAction 支持新动作。
4. decodeAction 对 UnitClass 做白名单校验，非法字符串返回 null。
5. RandomAI 只从合法动作中选取。
6. HeuristicAI 的招募评分适配新动作，不再依赖旧 recruit.spawnPos。
7. 如果 pendingUnitId 存在，AI 不应尝试选择其他单位或 end_turn。
8. 增加最小回归测试，保证 env.step(index) 和 env.stepAction(action) 都经过合法性校验。
```

## 6. 自动对战评估器 Prompt

```text
请实现一个可复现的自动对战评估器，用于批量比较 Agent。

建议接口：

interface Agent {
  selectAction(state: GameState, legalActions: Action[]): Action;
}

评估器要求：
1. 支持 Agent A vs Agent B。
2. 支持固定 seed。
3. 支持批量运行 N 局。
4. 输出胜率、平均回合数、平均金币、击杀数、占领数、招募数和动作类型频率。
5. 支持保存关键 replay，replay 使用 JSON 动作序列。
6. 不依赖 React UI。

不要实现深度学习；该评估器先服务 Random、Heuristic、Greedy 和后续 MCTS。
```

## 7. MCTS Prompt

```text
请在规则引擎和自动对战评估器稳定后，实现第一版纯 MCTS Agent。

要求：
1. 使用 GameEngine.clone() 或等价状态克隆模拟未来局面。
2. 每个节点扩展 getLegalActions()。
3. rollout 使用 RandomAgent 或轻量 GreedyAgent。
4. 支持限制模拟次数，例如 100、500、1000。
5. 使用固定 RNG，保证可复现实验。
6. 输出每步选择动作、访问次数、平均价值和耗时。
7. 与 RandomAgent 和 HeuristicAgent 做批量对战评估。

不要接神经网络；不要修改核心规则以迁就 MCTS。
```
