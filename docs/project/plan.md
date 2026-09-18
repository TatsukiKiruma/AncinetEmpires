
该项目用于复刻《远古帝国》核心战棋规则，并作为后续 AI 训练环境。

当前已有：

- `GameEngine`
- `getLegalActions`
- `step`
- `clone`
- 16 类地形
- 20 个兵种
- 状态系统
- 墓碑
- 经验升级
- 简单随机 AI 和启发式 AI
- 手动沙盒 UI

但当前还不能直接作为训练环境，因为：

- 最新规则缺少关键测试覆盖。
- `bypassValidation` 暴露在 `GameEngine` 上，容易被训练代码误用。
- 没有统一 Gym-like 环境封装。
- 没有 action mask。
- 胜负条件和 reward 语义还不够清晰。
- 随机 AI 使用 `Math.random()`，不可复现实验。

## 目标

完成训练环境硬化，使后续 AI 只能通过稳定、确定性、可验证的环境接口对局。

## 任务 1：安装依赖并建立验证基线

先运行：

```bash
npm install
npm test
npm run lint
npm run build
```

如果测试失败，先判断是旧测试构造不合法，还是业务规则真的错误。不要通过关闭规则校验来掩盖问题。

## 任务 2：限制 `bypassValidation`

当前 `GameEngine` 暴露了：

```ts
public bypassValidation: boolean = false;
```

请修改为更安全的测试专用机制。

要求：

- 训练和生产代码默认无法误用绕过校验。
- 不允许普通业务代码直接设置 `engine.bypassValidation = true`。
- 可以选择以下方案之一：
  - 删除该字段，并把旧测试改成使用真实合法动作。
  - 或将其改为构造函数私有选项，例如 `new GameEngine(state, { unsafeBypassValidationForTests: true })`。
- 如果保留测试绕过能力，命名必须带 `unsafe` 和 `ForTests`。
- 在注释里明确：训练环境禁止使用。

## 任务 3：补齐核心规则回归测试

在 `src/game/tests/engine.test.ts` 中新增测试，至少覆盖以下内容。

### 非法动作

1. 非当前玩家单位不能行动。
2. 已行动单位不能再次普通行动。
3. 非法移动不会改变坐标。
4. 移动到越界格不会改变状态。
5. 非法招募不会扣金币、不会生成单位。
6. 非治疗者不能治疗。
7. 非召唤者不能召唤。
8. 非支援者不能支援。
9. 非修理者不能修理。
10. 非占领者不能占领。
11. 投石车不能破坏城堡。
12. 非法动作返回 `info` 中包含 `非法动作`。

要求：非法动作后，完整 `GameState` 与动作前深拷贝相等。

### 确定性

1. 同一初始状态和同一合法动作序列，结果完全一致。
2. 招募 ID 确定。
3. 召唤 ID 确定。
4. 墓碑 ID 确定。
5. 引擎核心代码中不允许出现 `Date.now()` 或 `Math.random()`。

### 能力规则

1. `death_reaper`：幽灵攻击有 `poisoned/blinded/weakened` 的单位时攻击 +20。
2. `death_reaper`：目标无状态时不触发。
3. `counter_storm`：狂战士被 2 格攻击时可以反击。
4. `counter_storm`：狂战士致盲后仍可在 2 格内反击。
5. 普通单位不能越射程反击。
6. 反击不触发投毒或致盲。
7. 反击击杀给经验。

### 神庙结算

1. 中毒单位站普通神庙 `terrainId = 12`：
   - 回合开始先扣 10。
   - 未死亡则清除中毒。
   - 然后结算地形回血。
2. 中毒单位如果扣血致死，不触发神庙清状态和回血。
3. 致盲单位站神庙会清除致盲。
4. 虚弱单位站神庙会清除虚弱。
5. 水中神庙 `terrainId = 16` 暂不清状态，并写 TODO，除非已有明确规则要求。

### 突击部队

1. 狼未移动直接攻击后，剩余移动力等于有效移动力。
2. 狼先移动消耗移动力，再攻击后，剩余移动力保持攻击前剩余值。
3. `post_attack_move` 后不能再次二次移动。
4. 二次移动仍不能穿越非法阻挡或停在被占用格。

## 任务 4：新增 Gym-like 训练环境封装

新增文件：

```text
src/game/env.ts
```

实现一个训练环境类，例如：

```ts
export interface EnvStepResult {
  state: GameState;
  observation: Observation;
  reward: number;
  done: boolean;
  info: string;
  legalActions: Action[];
  actionMask: boolean[];
}

export class AncientEmpiresEnv {
  constructor(config?: {
    initialState?: GameState;
    seed?: number;
    maxPlies?: number;
  });

  reset(seed?: number): EnvStepResult;
  step(actionIndex: number): EnvStepResult;
  stepAction(action: Action): EnvStepResult;
  getState(): GameState;
  getCurrentPlayer(): number;
  getLegalActions(): Action[];
  getActionMask(): boolean[];
  getObservation(playerId?: number): Observation;
  clone(): AncientEmpiresEnv;
}
```

要求：

- `env` 内部使用 `GameEngine`。
- `step(actionIndex)` 只能从当前 `getLegalActions()` 中选动作。
- `actionIndex` 越界时不改变状态，返回非法动作信息。
- `stepAction(action)` 也必须经过 `GameEngine` 合法性校验。
- `clone()` 必须复制当前状态、步数、seed/RNG 状态。
- 不依赖 UI。

## 任务 5：定义稳定动作编码和 action mask

新增或在 `env.ts` 中实现：

```ts
export function encodeAction(action: Action): string;
export function decodeAction(code: string): Action | null;
export function getActionSpaceSchema(): string[];
```

要求：

- 先不强求固定全局离散动作空间可以覆盖所有地图。
- 但必须提供当前状态下的 `legalActions` 和对应 `actionMask`。
- `actionMask.length === legalActions.length`。
- 当前版本所有合法动作 mask 都为 `true`。
- 以后如果扩展为固定动作空间，不能破坏当前接口。

## 任务 6：定义 observation

新增类型：

```ts
export interface Observation {
  currentPlayer: number;
  turn: number;
  mapWidth: number;
  mapHeight: number;
  players: Array<{
    id: number;
    gold: number;
    isAlive: boolean;
    commanderDeathCount: number;
  }>;
  tiles: Array<{
    x: number;
    y: number;
    terrainId: number;
    ownerId: number | null;
  }>;
  units: Array<{
    id: string;
    ownerId: number;
    unitClass: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    exp: number;
    hasMoved: boolean;
    hasActed: boolean;
    status: string | null;
  }>;
  graves: Array<{
    id: string;
    x: number;
    y: number;
    remainingTurns: number;
  }>;
}
```

要求：

- observation 必须是纯 JSON 可序列化对象。
- 不暴露函数、类实例、Map、Set。
- `getObservation(playerId?)` 当前可以先返回全信息观测，因为游戏暂时是完全信息。
- 后续如加入战争迷雾，再扩展 playerId 视角过滤。

## 任务 7：明确基础胜负和 reward

当前阶段先使用最小可训练定义，别追求最终游戏完全准确。

实现或封装以下规则：

### 胜负

- 若某玩家没有任何单位，则该玩家失败。
- 若达到 `maxPlies`，游戏结束，按以下顺序判定：
  1. 单位总价值更高者胜。
  2. 若相同，金币更多者胜。
  3. 若仍相同，平局，`winner = -1`。
- 不要在本任务中实现复杂指挥官复活规则，只写 TODO。

### reward

在 `env` 层定义，不要重写 `engine` 的内部即时 reward。

建议：

- 非终局普通 step：`0`
- 当前玩家胜利：`+1`
- 当前玩家失败：`-1`
- 平局：`0`
- 非法动作：`-0.01`

注意：

- reward 必须明确是“执行动作玩家视角”。
- `EnvStepResult.info` 中写清当前动作玩家和是否终局。
- 后续可以再增加 shaped reward，但本次先保持稀疏奖励。

## 任务 8：随机 AI 改为可复现

修改 `src/game/ai/random_ai.ts`：

- 不要直接使用 `Math.random()`。
- 支持注入 RNG：

```ts
type Rng = () => number;
constructor(rng?: Rng)
```

- 默认可以使用 `Math.random`，但测试和训练可以传 seed RNG。
- 如有需要，在 `env.ts` 中实现简单 seed RNG，例如 mulberry32。

修改 `heuristic_ai.ts`：

- 不要在评分里直接调用 `Math.random()`。
- 如果需要打破平分，使用注入 RNG。
- 或者使用稳定排序规则。

## 任务 9：类型收紧

尽量小步修改，避免大重构。

要求：

- `StepResult.info` 改为 `string`。
- `Ability` 改为联合类型，覆盖当前所有能力：
  - `village_capturer`
  - `castle_capturer`
  - `repairer`
  - `flying`
  - `undead`
  - `death_reaper`
  - `water_child`
  - `sharpshooter`
  - `self_repair`
  - `blinder`
  - `summoner`
  - `healer`
  - `cleansing_aura`
  - `fighting_spirit`
  - `counter_storm`
  - `earth_child`
  - `poisoner`
  - `ranged_defense`
  - `mountain_child`
  - `weakness_aura`
  - `attack_aura`
  - `supporter`
  - `destroyer`
  - `forest_child`
  - `assault_troop`
  - `melee_master`
- `UNIT_CONFIGS` 尽量改为 `Record<UnitClass, UnitConfig>`。
- 不要用大量 `as any` 掩盖类型错误。
- UI 中确实需要 action 类型收窄时，写类型保护函数。

## 任务 10：文档更新

更新 `README.md`，增加：

- 项目目标：用于 AI 训练的战棋 Gym 环境。
- 如何运行测试。
- 如何使用 `AncientEmpiresEnv`。
- reward 当前定义。
- 当前未实现 TODO：
  - 指挥官死亡/复活完整规则。
  - 人口上限。
  - 固定全局动作空间。
  - 战争迷雾。
  - 更真实胜负条件。
  - MCTS/RL 尚未实现。

## 完成标准

完成后请汇报：

1. 修改了哪些文件。
2. 新增了哪些测试。