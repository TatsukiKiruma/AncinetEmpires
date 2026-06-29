# 古代帝国战棋逻辑核心 (Gym Env)

**项目目标：** 这是一个用于 AI 训练（如 MCTS、强化学习）的完全解耦的回合制战棋游戏环境。项目已提供标准 Gym-like 环境封装 (`AncientEmpiresEnv`)，保证内部状态 100% 独立、确定性、且无界面的纯逻辑演练。

## 环境接口 (AncientEmpiresEnv)

核心训练接口位于 `src/game/env.ts` 中。

```ts
import { AncientEmpiresEnv } from './src/game/env';

// 初始化并获取初始观测
const env = new AncientEmpiresEnv({
    initialState: myGameState,
    seed: 42,
    maxPlies: 200
});
const initResult = env.reset();

// 训练循环
while (!initResult.done) {
    const legalActions = env.getLegalActions();
    // AI 从 legalActions 当中挑选其一
    const actionIndex = 0; 
    
    // 演进环境状态
    const stepResult = env.step(actionIndex);
    
    // stepResult 包含: { state, observation, reward, done, info, legalActions, actionMask }
}
```

### Observation 地形字段

`observation.tiles` 会返回每个格子的 `terrainId/ownerId`，以及当前规则实际使用的 `defenseBonus/healPerTurn/moveCost`。如果状态来自 APK `.aem` 地图导入，还会包含 `apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence`，用于让 AI 观察到 APK 原始 tile 数值差异和当前地形语义映射的证据等级。

### Observation 地图元数据

如果状态来自 APK `.aem` 地图导入，`observation.metadata` 会返回 `source/apkVersion/apkSha256/apkResourcePath/apkMapName/apkSkirmishMode/recommendedGold/apkTailTemplate`。这些字段只用于训练样本追踪、规则证据锁定和复现实验配置，不参与规则判定。

`src/game/apk_manifest.ts` 和 `src/game/apk_skirmish_tile_usage.ts` 已归档 APK 4.2.5.1 的 20 张官方 skirmish 地图清单。通过 `createApkSkirmishGameState` 导入地图时，只有地图名、作者、尺寸、玩家、开局单位集合、城堡/城镇归属、完整 APK tile 使用量、推荐金币和尾部模板都匹配官方清单，才会自动写入 APK 版本、SHA256 和资源路径。

### Observation 队伍字段

`observation.turnPlayerIds` 会返回当前仍参与回合轮转的队伍 ID。`observation.pendingUnitId` 会返回 APK stacked/pending 招募状态下必须优先处理的单位 ID。`observation.players` 除金币、存活状态和指挥官死亡次数外，还会输出 `isEnabled/allianceId/unitCount/population/unitLimit/populationLimit/recruitableUnits`，用于让训练侧直接观察 APK 脚本可配置的联盟、禁用队伍、单位上限、人口上限和可招募列表。

### Observation 单位字段

如果状态来自 APK `.aem` 地图导入，`observation.units` 会保留每个初始单位的 `apkUnitId/apkUnitExtra`。`apkUnitExtra` 当前只作为原始证据字段输出，不参与等级或规则推断。

`observation.units[].maxHp` 使用当前单位等级计算后的有效最大生命值，和 APK `data.bin` 中的生命成长规则一致；训练侧不要直接用内部 `Unit.maxHp` 字段推断高等级单位上限。

`observation.units` 还会输出 `attack/physicalDefense/magicDefense/minRange/maxRange/move`，这些字段同样是当前等级和状态修正后的有效数值。例如致盲单位射程会显示为 `0-0`，虚弱单位移动会显示为 `1`。

`observation.units` 同时输出 `attackType/population/cost/abilities`。其中 `cost` 使用当前 `RuleConfig` 计算，能反映 APK `SetPrices` 价格覆盖和指挥官重招募价格配置；`abilities` 是单位能力列表的副本，训练侧读取后不会污染全局单位配置。

`observation.units[].isPending` 会标记当前 APK stacked/pending 招募状态下的待处理单位；该状态存在时，合法动作只会围绕该单位生成，不能继续招募或结束回合。

## Reward (奖励设定)

当前的 Default Reward 为稀疏奖励（Sparse Reward），其值针对当前执行动作的玩家角度返回：

- **普通行动、非终局回合**: `0`
- **胜利**: `+1`
- **失败**: `-1`
- **达到最大 Plies**: 按双方金币与剩余军力价值评估，优势方 `+1`，劣势方 `-1`，完全相等为 `0`
- **产生非法动作**: `-0.01` (环境本身会拦截并不改变状态)

## 如何运行与测试

### 运行应用
```bash
npm run dev
```

### 运行所有测试及类型检查
本项目使用 TypeScript 和 Vitest 进行测试和检查验证：
```bash
npm run test
npm run lint
```
当前测试包含了大量针对战棋特性（非法动作校验拦截、能力光环触发、治疗与结算机制等）的核心逻辑回归。

## 待补充与未实现 (TODO List)

为了后续扩展以及更完善的游戏训练体验，以下部分特性和规则当前仍作为保留项目：

- **指挥官死亡/复活完整规则**：当前尚未完全实现指挥官死亡需要进坟墓读秒及复活等复杂系统逻辑。
- **固定全局动作空间 (Fixed Global Action Space)**：目前返回的动作空间是基于当前状态动态生成的，未来为了兼容 PPO 等强化学习框架可能需要设计固定的稀疏动作矩阵编码。
- **战争迷雾 (Fog of War)**：当前为完全公开信息博弈 (Perfect Information Game)。
- **MCTS / 强化学习模型构建**：目前自带的仅有 Random AI 与基础 Heuristic AI，真正的深度 AI 搜索尚待实现。
