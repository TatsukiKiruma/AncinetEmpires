# 远古帝国 AI 训练项目上下文

本文用于在新对话中快速恢复项目背景、当前本地实现状态和后续任务。它记录“本地当前事实”和“目标路线”，不把历史计划或远端提交直接当作已落地事实。

## 1. 项目目标

- 复刻《远古帝国》的核心战棋规则。
- 先构建确定性、可验证、可克隆、可无头运行的规则引擎。
- 在规则引擎稳定后，再实现自动对战评估、MCTS、遗传算法调参和强化学习训练。
- React UI 只作为手动沙盒和调试入口；AI 训练必须基于纯逻辑引擎。

## 2. 本地目录

| 路径 | 说明 |
| --- | --- |
| `demo/src/game` | 规则引擎主体代码。 |
| `demo/src/game/types.ts` | `GameState`、`Unit`、`Action`、状态、墓碑、玩家等类型。 |
| `demo/src/game/terrain.ts` | 16 类正式地形配置。 |
| `demo/src/game/units.ts` | 20 个正式兵种配置。 |
| `demo/src/game/abilities.ts` | 能力判断、地形之子、有效属性、经验升级等。 |
| `demo/src/game/map.ts` | 曼哈顿距离、边界判断、可达格和移动消耗。 |
| `demo/src/game/rules.ts` | 伤害公式和合法动作生成。 |
| `demo/src/game/engine.ts` | 状态机，提供 `step`、`clone`、`reset`、胜负判断。 |
| `demo/src/game/env.ts` | Gym-like 训练环境封装。 |
| `demo/src/game/ai` | 随机 AI、启发式 AI 和自动对局脚本。 |
| `demo/src/game/tests` | Vitest 规则测试。 |

## 3. 当前实现状态

已实现或已有基础：

- 正式 16 类地形。
- 正式 20 个兵种。
- 物理/魔法攻防、地形防御、血量影响伤害、部分被动伤害修正。
- 飞行、亡灵、地形之子、自我修复、死亡收割者、反击风暴、远程防御、近战大师等能力。
- 中毒、致盲、虚弱和净化。
- 治疗、召唤、支援、修理、破坏、墓碑、光环触发。
- 经验、等级和部分升级加成。
- 合法动作校验；非法动作不应改变状态。
- 确定性单位 ID 和墓碑 ID 计数。
- `AncientEmpiresEnv`、JSON observation、动态合法动作、action mask、稀疏 reward。

仍未按目标规则完成：

- 本地 `Action` 仍只有旧的 `recruit`，没有拆分为 `recruit_to_castle` 和 `recruit_and_deploy`。
- 本地 `GameState` 没有 `pendingUnitId`。
- 招募后新单位当前直接 `hasMoved = true`、`hasActed = true`，不能立即进入行动选择。
- 当前招募只从“指挥官站在己方城堡”分支生成，且候选位置仍偏相邻 8 格的旧思路。
- 手动沙盒中“指挥官站城堡时打开招募入口”的 UI 行为仍需要单独核验和修复。
- `decodeAction` 中 `unitClass` 仍存在类型绕过风险，需要合法兵种校验。

## 4. 已确认目标规则

### 城堡招募

- 只有己方城堡可以招募。
- 己方指挥官位于己方城堡时：
  - 城堡可招募。
  - 新单位不能生成在城堡本格。
  - 招募动作应包含兵种和部署目标。
  - 部署目标必须是该兵种从城堡格出发可到达的空地。
  - 招募后设置 `pendingUnitId`，必须先处理该新单位。
- 己方城堡为空时：
  - 新单位生成在城堡本格。
  - 招募后进入待处理状态，可移动、待机或攻击。
- 城堡上有非指挥官单位或敌方单位时，不能招募。
- `pendingUnitId` 存在时，禁止操作其他单位、继续招募或结束回合。

### 移动阻挡

- 普通单位不能穿过敌方单位。
- 普通单位可以穿过友军，但不能停在友军所在格。
- 任何单位不能停在已有单位的地块上。
- 飞行单位可以飞越非飞行敌方单位，但仍不能停在被占用格。

### 状态与治疗

- 单位同时只能拥有一种状态，已有状态不会被其他状态替换。
- 中毒在回合开始先结算；若中毒致死，不再触发净化或回复。
- 治疗师基础治疗量为 40。
- 净化光环基础回血量为 10，并清除中毒、致盲、虚弱。
- 骷髅和幽灵是亡灵，普通治疗和净化光环会对亡灵造成对应治疗量伤害。

## 5. 近期任务

### P0：验证基线

在 `demo` 目录运行：

```bash
npm install
npm test
npm run lint
npm run build
```

如果失败，先区分依赖缺失、类型错误、旧测试构造不合法和真实规则回归。不要通过开启测试绕过来掩盖训练路径问题。

### P1：重做城堡招募动作

目标动作：

```ts
| { type: "recruit_to_castle"; unitClass: UnitClass; castlePos: Position }
| { type: "recruit_and_deploy"; unitClass: UnitClass; castlePos: Position; to: Position }
```

规则层要求：

- 空己方城堡只生成 `recruit_to_castle`。
- 己方指挥官占据己方城堡时只生成 `recruit_and_deploy`。
- 部署目标必须由该兵种从城堡格计算可达，而不是固定周围 8 格。
- 城堡上有非指挥官单位或敌方单位时不生成招募动作。
- 招募扣钱、生成确定性 ID，并写入 `pendingUnitId`。

### P2：实现 `pendingUnitId`

建议在 `GameState` 增加：

```ts
pendingUnitId?: string;
```

行为要求：

- `pendingUnitId` 存在时，`getLegalActions` 只返回该单位可执行动作。
- pending 单位可以移动；移动后如果仍未结束行动，应继续保持 pending。
- pending 单位执行待机、攻击、治疗、召唤、支援、修理、破坏、占领或其他结束行动动作后清空 pending。
- pending 存在时不能结束回合，不能继续招募，不能操作其他单位。

### P3：修复手动沙盒入口

- 点击己方城堡时，即使城堡上有己方指挥官，也应能看到招募入口。
- UI 可同时显示城堡信息和城堡上单位信息。
- 指挥官占城堡时流程应为：选城堡 -> 选兵种 -> 高亮部署格 -> 选部署格 -> 自动选中新单位。
- 空城堡时流程应为：选城堡 -> 选兵种 -> 新单位生成在城堡 -> 自动选中新单位。
- pending 存在时，UI 应禁用结束回合、继续招募和其他单位操作。

### P4：补充测试

至少覆盖：

- 空城堡招募生成 `recruit_to_castle`。
- 指挥官占城堡招募生成 `recruit_and_deploy`。
- 非指挥官占城堡、敌方单位占城堡时不能招募。
- 无可部署目标时不生成对应兵种的招募动作。
- 部署目标必须符合该兵种移动、地形消耗和阻挡规则。
- 招募后 `pendingUnitId` 存在。
- pending 存在时不能结束回合、不能继续招募、不能操作其他单位。
- pending 单位移动后仍需完成行动。
- 招募扣钱、单位 ID、初始行动状态和移动剩余值正确。
- `encodeAction` / `decodeAction` 支持新动作，且 `decodeAction` 校验合法 `UnitClass`。

### P5：训练接口和 AI 适配

- `AncientEmpiresEnv` 的 `legalActions`、`actionMask`、`encodeAction`、`decodeAction` 必须支持新招募动作。
- 随机 AI 和启发式 AI 只能从合法动作中选择，不应假设旧 `recruit` 结构。
- 后续统一 `Agent` 接口：

```ts
interface Agent {
  selectAction(state: GameState, legalActions: Action[]): Action;
}
```

- 实现批量自动对战评估器，输出胜率、平均回合、金币、击杀、占领、招募和动作频率。

## 6. 中期 AI 路线

1. 稳定规则引擎和招募机制。
2. 完善测试、构建和类型检查。
3. 实现统一 Agent 接口。
4. 实现自动对战评估器和 replay 保存。
5. 强化 Random / Greedy / Economy / Combat baseline。
6. 实现纯 MCTS，rollout 使用启发式或轻量 baseline。
7. 用遗传算法优化启发式和 MCTS rollout 权重。
8. 在小地图、小兵种集合、短回合上限下尝试 PPO + action mask。

## 7. 训练环境要求

- `getLegalActions()` 生成的动作必须全部可由 `step()` 执行。
- 非法动作必须被拒绝，并且不改变完整 `GameState`。
- `clone()` 后修改副本不能影响原状态。
- 同一初始状态和同一动作序列必须得到完全一致结果。
- observation 必须是纯 JSON 可序列化对象。
- reward 语义必须明确当前玩家视角、固定玩家视角或零和差值；当前 `env.ts` 采用执行动作玩家视角的稀疏 reward。

## 8. 新对话启动建议

优先阅读：

1. `README.md`
2. `远古帝国AI训练项目上下文.md`
3. `远古帝国AI训练规则整理.md`
4. `远古帝国1-6步开发修改Prompt.md`

若继续开发代码，应先核验测试和构建，再处理招募拆分、`pendingUnitId`、沙盒 UI 入口和相关测试。

可直接使用以下起始提示：

```text
请阅读 C:\code\AncinetEmpires\README.md、远古帝国AI训练项目上下文.md 和 远古帝国AI训练规则整理.md。
不要修改 demo 下的文档。
当前本地 demo 仍使用旧 recruit 动作，尚未实现 recruit_to_castle / recruit_and_deploy 和 pendingUnitId。
请先跑测试和构建，再优先处理城堡招募动作拆分、pending 单位限制、手动沙盒入口和对应测试。
不要直接开始深度学习训练。
```
