# 游戏环境接口

本文件描述公共环境的实际行为，不规定模型架构、特征或训练算法。

## 状态与动作

权威实现是 `src/game/engine.ts`、`rules.ts` 与 `env.ts`。`GameEngine` 执行动作和回合结算；`getLegalActions` 生成合法动作；`AncientEmpiresEnv` 提供观测、动作编码和 mask。不要在外部另写游戏规则。

`reset()` 返回初始结果，`step(index)` 使用当前动态合法动作列表的下标。状态改变后必须重新获取动作列表。跨进程可用 `encodeAction/decodeAction` 的语义编码，或固定动作空间接口 `stepFixedAction`、`fixedLegalActionIndexes`。动态下标和固定索引不能混用。

公共 `getLegalActions` 的定向查询支持 `unitId`、`skipMovement`、`skipRecruitment` 与 `onlyAttacks`；`skipRecruitment` 仅跳过全局招募候选，`onlyAttacks` 仅返回普通 `attack`，约束与顺序均等同完整集合过滤。定向查询用于局部战术或校验，不能把其下标当作环境完整动态动作列表的下标。引擎默认在没有任何有意义动作时自动换手；来源回放若显式关闭此行为，进入训练前应剔除自动轨迹不会出现的仅剩 `end_turn`/`surrender` 状态，并核对轨迹、收益与 clone 一致。

观测包含地形、单位、玩家、当前回合玩家、pending 单位及可用的 APK 来源信息。实际攻防、射程和移动能力通过现行规则计算。`metadata` 的版本及资源路径用于追踪来源；地块的 `apkTerrainId` 及显式 `apkTerrainKind/apkTerrainIsLand/apkMoveCost` 则参与规则，不能当作可随意丢弃的描述信息。地形快照包括校正后的 land、kind、移动成本、可占领标记和图形数组，数组与内部状态隔离。

## 奖励和结束状态

环境奖励按执行动作前的玩家视角计算，普通步骤为零，非法动作为负小值，自然胜负为正负一。连续动作可能属于同一玩家，不能假定每步都切换阵营。

当前环境达到 `maxPlies` 时会结束并按金币与军力计算代理奖励。因此 `done=true` 或 `reward=1` **不能单独证明自然胜利**。必须查看状态的 `winner`：`null` 表示没有规则终局，`-1` 表示规则平局，其余值按联盟身份解释。外部步数限制、墙钟超时、运行错误应分别记录，不能写成自然胜负。

`GameEngine.step` 自带奖励与 `AncientEmpiresEnv` 的奖励封装不是同一接口。使用者应明确选择哪层，并自行设计学习目标。

## 地图和初态

`createAppApkSkirmishGameState()` 使用内置官方地图，不需要 APK 解包目录。默认地图为 `(2) Duel.aem`，模式为 SD。自定义设置与 SD/SO 规则复用 `apk_skirmish.ts`，不能绕过地图来源或地形可信度校验。

新对局工厂结算首回合收益；已有快照不能再次结算。回放需要未结算配置时显式设 `applyInitialTurnStart: false`。见 [开局收益](../rules/initial-turn-income.md)。

## 最小示例

```ts
import { AncientEmpiresEnv } from './src/game/env';
import { createDefaultAppGameState } from './src/game/default_state';

const env = new AncientEmpiresEnv({ initialState: createDefaultAppGameState(), seed: 42 });
let result = env.reset();
for (let steps = 0; steps < 100 && !result.done; steps += 1) {
    if (result.legalActions.length === 0) break;
    // 仅用于接口演示，不是对战策略。
    result = env.step(0);
}
console.log(result.state.winner, result.done);
```

对手、地图范围、计算预算和独立验收集需要另行确定；接口文档不预设具体研究方案。
