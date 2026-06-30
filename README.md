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

如果状态来自 APK `.aem` 地图导入，`observation.metadata` 会返回 `source/apkVersion/apkSha256/apkResourcePath/apkMapName/apkSkirmishMode/apkSkirmishSetupOptions/recommendedGold/apkTailTemplate`。这些字段只用于训练样本追踪、规则证据锁定和复现实验配置，不参与规则判定。

`src/game/apk_manifest.ts` 和 `src/game/apk_skirmish_tile_usage.ts` 已归档 APK 4.2.5.1 的 20 张官方 skirmish 地图清单。通过 `createApkSkirmishGameState` 导入地图时，只有地图名、作者、尺寸、玩家、开局单位集合、城堡/城镇归属、完整 APK tile 使用量、推荐金币和尾部模板都匹配官方清单，才会自动写入 APK 版本、SHA256 和资源路径。

`getApkSkirmishTrainingScenarios()` 会基于默认 16 张无 approximate/unmapped tile 的官方地图生成 SD/SO 两种训练场景，并附带地图资源路径、玩家数、推荐金币、地形可信度摘要、遭遇战开局设置范围和对应模式规则配置。训练端可以用 `modes/playerCounts/allowApproximateTerrain` 过滤场景，避免重复拼接地图清单与 SD/SO 规则。

训练端可用 `getApkSkirmishTrainingScenario(id)` 定位稳定场景，并通过 `createApkSkirmishTrainingGameState(map, id)` 或 `createApkSkirmishTrainingEnv(map, id)` 把已解析的官方 AEM 地图直接变成带 APK 规则、来源元数据和 manifest 严格校验的训练状态/环境。

需要自定义遭遇战开局设置时，可向 `getApkSkirmishRuleConfig(mode, setup)` 或 `createApkSkirmishGameState(..., { setup })` 传入 `initialGold/unitLimit/levelCap`。这些值会按 APK 实机确认的范围和步进校验，避免训练样本生成 APK UI 中不能选择的非法配置。

### Observation 队伍字段

`observation.turnPlayerIds` 会返回当前仍参与回合轮转的队伍 ID。`observation.pendingUnitId` 会返回 APK stacked/pending 招募状态下必须优先处理的单位 ID。`observation.players` 除金币、存活状态和指挥官死亡次数外，还会输出 `isEnabled/allianceId/unitCount/population/unitLimit/populationLimit/recruitableUnits/commanderUnitId`，用于让训练侧直接观察 APK 脚本可配置的联盟、禁用队伍、单位上限、人口上限、可招募列表和队伍指挥官。

### Observation 单位字段

如果状态来自 APK `.aem` 地图导入，`observation.units` 会保留每个初始单位的 `apkUnitId/apkUnitExtra`。`apkUnitExtra` 当前只作为原始证据字段输出，不参与等级或规则推断。

`observation.units[].maxHp` 使用当前单位等级计算后的有效最大生命值，和 APK `data.bin` 中的生命成长规则一致；训练侧不要直接用内部 `Unit.maxHp` 字段推断高等级单位上限。

`observation.units` 还会输出 `attack/physicalDefense/magicDefense/minRange/maxRange/move`，这些字段同样是当前等级和状态修正后的有效数值。例如致盲单位射程会显示为 `0-0`，虚弱单位移动会显示为 `1`。

`observation.units` 同时输出 `attackType/population/cost/abilities/isCommander`。其中 `cost` 使用当前 `RuleConfig` 计算，能反映 APK `SetPrices` 价格覆盖和指挥官重招募价格配置；`isCommander` 复用当前收入、死亡和胜负规则使用的指挥官判定，支持 APK `SyncSetCommander` 把普通单位指定为队伍指挥官；`abilities` 是单位能力列表的副本，训练侧读取后不会污染全局单位配置。

`observation.units[].apkMoveOverrides` 会输出 APK `Stage.SyncOverrideMov(code, tileType, mov)` 写入的单位级地形移动消耗覆盖。移动规则会优先按 `tile.apkTerrainId` 匹配，其次按 APK terrain `kind` 匹配，没有 APK 原始 tile 时才用项目 `terrainId` 兜底。

`observation.units[].isPending` 会标记当前 APK stacked/pending 招募状态下的待处理单位；该状态存在时，合法动作只会围绕该单位生成，不能继续招募或选择其它单位。APK skirmish 实测显示空城堡招募 pending 时仍可结束回合/投降，指挥官站城堡触发的堆叠招募 pending 则不能结束回合或投降。

APK skirmish 规则配置会通过 `allowSurrender` 开启结构化 `surrender` 动作；投降会删除当前阵营全部单位并把该阵营占领建筑变为无主。普通 demo/自定义规则默认不启用，避免改变既有训练动作空间。内置 Random AI 与 Heuristic AI 会把投降视为兜底/负收益动作，不会当作普通推进动作随机优先选择。

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

### 复核 APK skirmish 地图资源
```bash
npm run apk:map-report -- --check
```
该命令会用 APK 4.2.5.1 的 DES key/iv 解密 `APK/_analysis/unpack/assets/maps/*.aem`，重新解析 20 张官方 skirmish 地图并和项目内 manifest 对比。当前复核结果为 APK SHA256 匹配、20/20 地图匹配、0 个 unmapped tile，并输出 `t30/t31` 低可信地形的实机验证坐标、当前项目语义和已确认实机行为。

### 复核 APK data.bin 地形数值
```bash
npm run apk:terrain-report -- --check
```
该命令会解密 `APK/_analysis/unpack/data.bin`，重新解析 84 条 40 字节地形记录，并和 `src/game/apk_terrain.ts` 的归档逐项对比。当前复核结果为 84/84 地形记录匹配、项目归档差异 0；报告会输出防御、回血、移动消耗分布和每个 APK tile 的 skirmish 映射可信度。

### 复核 APK 脚本规则证据
```bash
npm run apk:script-report -- --check
```
该命令会解密 `APK/_analysis/unpack/assets/mods/**/*.js`，重新统计 27 个脚本的 Stage/Rule API 调用次数，并复核可安全提取的字面量规则配置和单位/坐标状态配置。当前复核结果为 27/27 脚本匹配、API 计数无差异、字面量配置无差异。

### 复核 APK DEX 字符串证据
```bash
npm run apk:dex-report -- --check
```
该命令会解析 `APK/_analysis/unpack/classes.dex` 的字符串表，复核指挥官、招募、开局设置和复活相关关键词。当前复核结果为 26529 个字符串可解析，`CheckCommander/GetCommander/SyncSetCommander`、`SyncSetRecruitUnits*`、`SetPrices/SetLevelCap` 等必要字符串均存在，未发现 `ReviveCommander/RespawnCommander` 一类通用指挥官复活 API 字符串。

### 复核 APK skirmish 训练场景
```bash
npm run apk:training-report -- --check
```
该命令会解密默认 16 张干净官方 skirmish 地图，生成 SD/SO 共 32 个训练场景，并逐一创建 `AncientEmpiresEnv`。当前复核结果为 32/32 场景 manifest 匹配、metadata 匹配，且所有场景初始合法动作数均大于 0；可加 `--include-approximate` 检查含低可信地形的 40 个扩展场景。

## 待补充与未实现 (TODO List)

为了后续扩展以及更完善的游戏训练体验，以下部分特性和规则当前仍作为保留项目：

- **指挥官死亡/复活完整规则**：DEX 字符串层未发现通用指挥官复活 API，当前仍不能确认 APK 的死亡后重招募价格递增和完整复活流程。
- **固定全局动作空间 (Fixed Global Action Space)**：当前已提供 `getActionSpaceSchema()` 描述可变参数动作编码模板；未来为了兼容 PPO 等强化学习框架，仍可能需要设计固定的稀疏动作矩阵编码。
- **战争迷雾 (Fog of War)**：当前为完全公开信息博弈 (Perfect Information Game)。
- **MCTS / 强化学习模型构建**：目前自带的仅有 Random AI 与基础 Heuristic AI，真正的深度 AI 搜索尚待实现。
