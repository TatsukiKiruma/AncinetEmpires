# 古代帝国战棋逻辑核心 (Gym Env)

**项目目标：** 这是一个用于 AI 训练（如 MCTS、强化学习）的完全解耦的回合制战棋游戏环境。项目已提供标准 Gym-like 环境封装 (`AncientEmpiresEnv`)，保证内部状态 100% 独立、确定性、且无界面的纯逻辑演练。

## 环境接口 (AncientEmpiresEnv)

核心训练接口位于 `src/game/env.ts` 中。
前端沙盒与自动 AI 演示默认使用 `createDefaultAppGameState()`，即沿用现有演示棋盘，但规则配置为 APK 正常遭遇战 `SD` 模式；裸 `createDemoState()` 仍保留给测试和自定义局面使用。

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
    
    // stepResult 包含: { state, observation, reward, done, info, legalActions, legalActionCodes, legalActionEntries, actionMask, fixedActionSpaceDescriptor, fixedLegalActionIndexes }
}
```

### Observation 地形字段

`observation.tiles` 会返回每个格子的 `terrainId/ownerId`，以及当前规则实际使用的 `defenseBonus/healPerTurn/moveCost`。如果状态来自 APK `.aem` 地图导入，还会包含 `apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence`，用于让 AI 观察到 APK 原始 tile 数值差异和当前地形语义映射的证据等级。

### Observation 地图元数据

如果状态来自 APK `.aem` 地图导入，`observation.metadata` 会返回 `source/apkVersion/apkSha256/apkResourcePath/apkMapName/apkSkirmishMode/apkSkirmishSetupOptions/recommendedGold/apkTailTemplate`。这些字段只用于训练样本追踪、规则证据锁定和复现实验配置，不参与规则判定。

`src/game/apk_manifest.ts` 和 `src/game/apk_skirmish_tile_usage.ts` 已归档 APK 4.2.5.1 的 20 张官方 skirmish 地图清单。通过 `createApkSkirmishGameState` 导入地图时，只有地图名、作者、尺寸、玩家、开局单位集合、城堡/城镇归属、完整 APK tile 使用量、推荐金币和尾部模板都匹配官方清单，才会自动写入 APK 版本、SHA256 和资源路径。

`getApkSkirmishTrainingScenarios()` 会基于 20 张官方 skirmish 地图生成 SD/SO 两种训练场景，并附带地图资源路径、玩家数、推荐金币、地形可信度摘要、遭遇战开局设置范围和对应模式规则配置。默认只自动放行无 approximate tile 或 approximate tile 已经实机确认的地图；训练端可以用 `modes/playerCounts/allowVerifiedApproximateTerrain/allowApproximateTerrain` 过滤场景，避免重复拼接地图清单与 SD/SO 规则。

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
该命令会用 APK 4.2.5.1 的 DES key/iv 解密 `APK/_analysis/unpack/assets/maps/*.aem`，重新解析 20 张官方 skirmish 地图并和项目内 manifest 对比。当前复核结果为 APK SHA256 匹配、20/20 地图匹配、尾部模板 `zero_suffix_58=20`、非预期尾部 0、0 个 unmapped tile，并输出 `t30/t31` 低可信地形的实机验证坐标、当前项目语义和已确认实机行为。该报告还会扫描 `assets` 下全部 45 张 `.aem` 的地形段并门禁低可信 tile 使用范围：`t30=30`、`t31=16`、`t80=0`、`t81=9`、`t82=8`、`t83=6`；其中 `t81/t82/t83` 的 skirmish 格子数均为 0，只出现在非 skirmish 战役资源中。

### 复核 APK data.bin 地形数值
```bash
npm run apk:terrain-report -- --check
```
该命令会解密 `APK/_analysis/unpack/data.bin`，重新解析 84 条 40 字节地形记录，并和 `src/game/apk_terrain.ts` 的归档逐项对比。当前复核结果为 84/84 地形记录匹配、项目归档差异 0；报告会输出防御、回血、移动消耗分布和每个 APK tile 的 skirmish 映射可信度。

### 复核 APK data.bin 单位数值
```bash
npm run apk:unit-report -- --check
```
该命令会解密 `APK/_analysis/unpack/data.bin`，重新解析 21 条单位记录，并和 `src/game/units.ts` 的战斗数值、成长、射程、人口和能力 ID 对比。当前复核结果为 21/21 单位记录匹配、项目单位配置差异 0；指挥官/骷髅/水晶价格和水晶移动力属于已记录的刻意差异。

### 复核 APK 语言表能力规则
```bash
npm run apk:language-rule-report -- --check
```
该命令会读取 `APK/_analysis/unpack/assets/languages/en.lang`，复核关键能力/状态/wiki/建筑说明，并用当前引擎跑行为探针：基础伤害公式、物理/魔法攻击防御选择、单状态槽不覆盖、鼓舞伤害、回合收入与城堡招募占位规则、招募费用与人口占用限制、村庄/城堡占领与废墟修理能力、地形防御与移动消耗、神庙/废墟/村庄建筑语义、支援排除与支援重置、治疗超上限与治疗等级成长、毒攻击/致盲免疫、亡灵中毒回血、反击风暴 2 格反击、飞行越过地面单位且不吃地形防御、近战大师/远程防御/战意/死神等伤害修正、突击攻击后移动、地形之子、自我修复、光环、大地之子移动、召唤/亡灵墓碑、致盲/虚弱/中毒状态等。当前复核结果为 28/28 检查通过。

### 复核 APK skirmish 对战行为
```bash
npm run apk:skirmish-rule-report -- --check
```
该命令会把已确认的 skirmish 规则跑成机器检查：SD/SO 招募列表、SD/SO 默认招募费用和人口占用、SD 指挥官不在场时可重招募且 SO 不招募指挥官、SD 指挥官费用曲线 `400/500/600` 与 SO 禁用指挥官招募、DEX 默认规则数据确认的 SD/SO 指挥官收入 `base=50/growth=25`、skirmish 指挥官死亡后不自动复活且重招募继承等级/经验、主动治疗可超上限但下一己方回合开始先裁剪到最大生命、升级不裁剪既有超上限生命、亡灵中毒/墓碑被动回血不突破最大生命、默认 20 张 skirmish 训练地图只包含已验证 approximate `t30/t31` 且不含 `t80/t81/t82/t83`、开局设置范围及其对起始金币/单位上限/等级上限的实际约束、训练 observation 暴露的规则/费用/指挥官/pending 状态、APK 地形防御参与战斗且飞行单位不吃地形防御、投降、pending/stacked 招募菜单限制、招募后 pending 来源/扣费/行动标记、无单位且无城堡淘汰、敌军压城堡回合开始扣 50 血等。当前复核结果为 22/22 检查通过，并在报告末尾输出 2 项当前项目边界探针和 4 项待调查清单；探针用于对照实机验证支援/突击、致盲/反击风暴的当前项目行为，不参与 APK 已确认检查。

### 复核 APK 脚本规则证据
```bash
npm run apk:script-report -- --check
```
该命令会解密 `APK/_analysis/unpack/assets/mods/**/*.js`，重新统计 27 个脚本的 Stage/Rule API 调用次数，并复核可安全提取的字面量规则配置和单位/坐标状态配置；同时会把代表性脚本配置应用到训练状态，确认全局/队伍招募、联盟、禁用队伍、收入覆盖、移动覆盖和状态覆盖都能进入 observation，且脚本禁用队伍会影响合法动作和回合轮转、脚本收入会影响回合开始金币结算。当前复核结果为 27/27 脚本匹配、API 计数无差异、字面量配置无差异、应用检查 7/7 通过。

### 复核 APK DEX 字符串与方法表证据
```bash
npm run apk:dex-report -- --check
```
该命令会解析 `APK/_analysis/unpack/classes.dex` 的字符串表、`method_ids` 方法表和少量规则构造器/关键动作方法字节码，复核指挥官、招募、开局设置、攻击、支援、状态和复活相关关键词。当前复核结果为 26529 个字符串可解析，必要字符串缺失 0，必要方法名缺失 0，关键字符串引用方法 9 个，关键规则方法证据 8 个且缺失期望 0 项；报告还会输出关键字段、方法和字面量在 code_item 中的出现顺序。已解析到 `CheckCommander`、`GetCommander`、`SyncSetCommander`、`SetIncomeCommanderBase/Growth`、`SyncSetRecruitUnits*`、`AsyncAttack`、`SyncSetUnitStatus` 等关键方法签名；`Cannot attack from/state` 引用到 `Lc/a/b/a/l;.i(int,int)`，且该方法读取状态字段 `Lc/a/b/a/t/e;.a:I`、状态字面量为 2，并调用 `Lc/a/b/a/q;.a(Unit,int,int):boolean` 和 `Lc/a/b/a/q;.m(Unit)`；`q.a(Unit,int,int)` 继续引用攻击目标/地形/能力校验；`q.i(Unit,Unit)` 的关键操作顺序显示先做可反击状态/队伍校验，再检查 `counter_storm` 能力、距离字面量 2，最后走普通射程校验；`q.c(Unit,Unit)` 的关键操作顺序显示先处理 `poisoner`/中毒状态应用，再处理 `blinder`/致盲状态应用；`Cannot support from/state` 引用到 `Lc/a/b/a/l;.m(int,int)`，且该方法同样检查状态 2，并调用 `Lc/a/b/a/q;.h(Unit,int,int):boolean`；`q.h(Unit,int,int)` 会取目标单位后委托 `q.n(Unit,Unit)`，而 `q.n` 引用目标行动状态、已支援标记、等级字段和支援者能力排除校验；`Cannot recruit when stacked!` 引用到 `Lc/a/b/a/l;.c(int,int,int)`，且该方法检查 pending 字段 `Lc/a/b/a/t/a;.d:Unit`、状态字面量为 1，并调用 `Lc/a/b/a/q;.b(int,int,int):boolean`；`SetIncomeCommanderBase` 写入字段 `Lc/a/b/a/t/d;.s:I` 且默认值为 50，`SetIncomeCommanderGrowth` 写入字段 `Lc/a/b/a/t/d;.t:I` 且默认值为 25；`revive` 关键词分组命中 0。反击/状态方法证据可证明 APK 规则层存在对应校验并缩小了分支顺序范围，但同一次攻击内的伤害、附加状态、普通反击、反击风暴和死亡边界顺序仍需实机或完整控制流反编译确认。

### 复核 APK skirmish 训练场景
```bash
npm run apk:training-report -- --check
```
该命令会解密默认 20 张官方 skirmish 地图，生成 SD/SO 共 40 个训练场景，并逐一创建 `AncientEmpiresEnv`。默认训练集包含已经由 2026-06-30 实机确认的 `t30/t31` approximate tile 地图，但仍会排除未实测 approximate/unmapped tile。当前复核结果为 40/40 场景 manifest 匹配、metadata 匹配，含未实测 approximate 的场景 0 个，模式规则错配 0 个，指挥官重招募费用错配 0 个，Observation 招募经济错配 0 个，Observation APK 地形/单位证据字段错配 0 个，固定动作空间错配 0 个，初始与 smoke 过程 actionMask 错配 0 个，动作序列化错配 0 个，动作接口 schema 14 个模板匹配且编码/解码往返通过，所有场景初始合法动作数均大于 0，且默认每场景执行 4 个合法动作 smoke test 无失败；该门禁还会检查 SD/SO 可招募单位列表和每个玩家 `players[].recruitCosts` 中的默认招募费用是否与 APK data.bin 及已确认模式规则一致。可加 `--include-approximate` 放行未来可能出现的未实测 approximate 地图。

## 待补充与未实现 (TODO List)

为了后续扩展以及更完善的游戏训练体验，以下部分特性和规则当前仍作为保留项目：

- **指挥官死亡/复活完整规则**：skirmish 已按实机确认实现“阵亡后只能城堡重招募、费用 500 起并每次 +100、保留等级/经验”；DEX 字符串与方法表仍未发现通用指挥官复活 API，战役复活/失败流程不纳入当前 AI 对战目标。
- **训练动作空间封装**：当前已提供 `getActionSpaceSchema()` 描述可变参数动作编码模板，并提供 `getFixedActionSpaceDescriptor()`、`encodeFixedActionIndex()`、`getFixedLegalActionIndexes()`、`getFixedActionMask()` 和 `stepFixedAction()` 作为固定稀疏动作空间入口；`EnvStepResult` 会直接输出 `legalActionCodes`、`legalActionEntries`、`fixedActionSpaceDescriptor` 和 `fixedLegalActionIndexes`，其中 `legalActionEntries[]` 将结构化动作、字符串编码、动态 mask 位和固定索引聚合为一条记录，便于训练端跨进程消费动作。`apk:training-report -- --check` 已门禁 schema、`encodeAction/decodeAction` 往返、动态 `legalActions/actionMask` 对齐、动作序列化字段对齐和 40 个默认 APK 训练场景的固定动作索引无碰撞。后续可按 PPO 等训练框架再做压缩编码或张量封装。
- **战争迷雾 (Fog of War)**：当前为完全公开信息博弈 (Perfect Information Game)。
- **MCTS / 强化学习模型构建**：目前自带的仅有 Random AI 与基础 Heuristic AI，真正的深度 AI 搜索尚待实现。
