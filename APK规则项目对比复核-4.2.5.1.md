# APK 规则与项目规则对比复核：aer-release-4.2.5.1

分析日期：2026-06-29

## 1. 范围与约束

本次只分析 APK 资源并对比项目规则，不修改项目代码，不修改 `demo` 目录文档。

分析对象：

- APK：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
- SHA256：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
- 解包目录：`C:\code\AncinetEmpires\APK\_analysis\unpack`
- 临时解密目录：`C:\code\AncinetEmpires\APK\_analysis\decrypted_tmp`（分析后已清理）
- 对比代码：`src/game`

可用工具限制：

- 当前环境没有 `jadx`、`apktool`，因此本报告没有完整 Java 反编译结论。
- DEX 只按字符串/API 暴露做佐证。
- 可读规则主要来自语言表、`data.bin`、解密后的 AEM 地图和 JS 脚本。

## 2. 总体结论

当前项目已经覆盖 APK 4.2.5.1 的主要 skirmish 对战规则骨架：

- 21 个单位、26 个能力、4 个状态已在项目中建模。
- 单位基础数值、成长、攻击类型、防御、射程、移动、人口和招募价格基本按 APK `data.bin` 对齐。
- 战斗公式、地形防御、状态互斥、能力加成、治疗、召唤、墓碑、亡灵、支援、突击后移动等核心交互均已有实现。
- 城堡/村庄/指挥官收入、金币、单位上限、可招募列表、价格覆盖、等级上限、联盟、禁用队伍和强制终局已有规则配置入口。
- 20 张内置 skirmish `.aem` 地图可解密解析，项目已有 AEM 解析和 skirmish GameState 生成入口。
- SD/SO skirmish 模式的终局逻辑与 SO 可招募限制已能由项目规则表达。
- APK 导入地图会保留原始 `apkTerrainId/apkTerrainRaw/apkOwnerCode`，移动、防御、回血优先使用 APK `data.bin` 的 tile 数值。

仍不能宣称项目与 APK 完全一致：

- APK 有 84 个 tile，项目只有抽象地形模型；数值可用，但贴图/类别/建筑语义仍有未校准项。
- 战役脚本层只覆盖同步规则配置和部分查询，未实现大量 `Async*` 剧情、增援、目标 UI 和演出 API。
- 水晶目标、单位 head、移动覆盖、指挥官复活/重招募官方流程仍未完整还原。
- 招募后 stacked/pending 的官方 UI 行为、治疗突破最大血量后的长期裁剪规则、亡灵回血是否可突破上限仍需实机或反编译确认。

判断：如果目标是 AI 训练用 skirmish 对战环境，当前规则已接近可用；如果目标是完整复刻 APK 4.2.5.1，还需要继续补齐地图语义、脚本配置和战役目标层。

## 3. APK 资源复核

### 3.1 解包资源统计

从 `APK\_analysis\unpack` 直接统计：

| 类型 | 数量 | 规则意义 |
| --- | ---: | --- |
| `.aem` | 90 | 地图资源；包含 root 与 `assets` 两套镜像 |
| `.png` | 60 | 贴图与图标 |
| `.js` | 55 | 战役/教程/skirmish 控制脚本，部分为加密资源 |
| `.xml` | 54 | Android 资源 |
| `.lang` | 38 | 多语言文案，规则说明明文可读 |
| `.json` | 23 | 地图/模组索引，部分为加密资源 |
| `.so` | 10 | libGDX 原生库 |
| `.bin` | 2 | root 与 `assets` 下的 `data.bin` |
| `.dex` | 1 | Java 字节码，包含 Stage/Rule API 字符串 |

与规则直接相关的目录：

| 目录 | 内容 |
| --- | --- |
| `assets/maps` | 20 张内置 skirmish 地图与 `_list.json` |
| `maps` | 同名 skirmish 地图镜像 |
| `assets/mods` | AEI/AEII/AEIII/TU 的战役地图、脚本、语言表 |
| `mods` | 模组资源镜像 |

### 3.2 加密与解密

`assets/data.bin` 明文头复核：

- 前 4 字节 magic：`365703`
- DES key：`72 6b 00 00 00 00 46 46`
- 加密方式：`DES/CBC/PKCS7`，key 与 IV 相同
- 解密后再次出现 magic `365703`，随后 `0x54` 表示 84 条 tile 定义

本次用同一 key 临时解密：

| 类型 | 解密数量 | 说明 |
| --- | ---: | --- |
| `.aem` | 45 | `assets/maps` 20 张 + `assets/mods` 25 张 |
| `.js` | 27 | `assets/mods` 下全部脚本 |
| `.json` | 10 | `assets/mods` 下索引/场景配置 |

`assets/maps/_list.json` 本身是明文，不需要解密。

## 4. 语言表确认的核心规则

来源：`APK\_analysis\unpack\assets\languages\zh.lang` 与 `en.lang`。

语言表可直接确认：

- 单位：APK ID `0..20`，共 21 个。
- 能力：APK ID `0..25`，共 26 个。
- 状态：中毒、鼓舞、致盲、虚弱，共 4 个。
- 战斗公式：`(攻击力 - 防御力) * 攻击者血量百分比`，再叠加能力修正。
- 状态规则：一个单位同一时间只能拥有一种状态，已有状态不会被另一种状态替换。
- 招募规则：只能从己方城堡招募；城堡为空时可招募；己方指挥官站在城堡上是例外。
- 收入规则：村庄/城堡产生收入，指挥官存活也是收入来源；收入在己方回合开始结算。
- 桥规则：桥也按水面地形处理。
- 治疗师：主动治疗可突破目标最大血量。
- 亡灵：友军治疗变伤害；踩墓碑和中毒变回血；死亡不留墓碑。

## 5. 单位、能力、状态对比

### 5.1 单位映射

| APK ID | APK 名称 | 项目 key | 对齐状态 |
| ---: | --- | --- | --- |
| 0 | 战士 / Soldier | `soldier` | 已实现；项目显示名为“士兵” |
| 1 | 弓箭手 / Archer | `archer` | 已实现 |
| 2 | 水元素 / Aqua Elemental | `water_elemental` | 已实现 |
| 3 | 女巫 / Sorceress | `witch` | 已实现 |
| 4 | 精灵 / Spirit | `elf` | 已实现；项目 key 使用 `elf` |
| 5 | 狼 / Wolf | `wolf` | 已实现 |
| 6 | 石头人 / Golem | `golem` | 已实现 |
| 7 | 投石车 / Catapult | `catapult` | 已实现 |
| 8 | 龙 / Dragon | `dragon` | 已实现 |
| 9 | 指挥官 / Commander | `commander` | 已实现；默认不可普通招募 |
| 10 | 骷髅 / Skeleton | `skeleton` | 已实现；默认不可普通招募 |
| 11 | 水晶 / Crystal | `crystal` | 已有占位；完整战役目标行为未实现 |
| 12 | 圣骑士 / Paladin | `paladin` | 已实现 |
| 13 | 狂战士 / Berserker | `berserker` | 已实现 |
| 14 | 幽灵 / Ghost | `ghost` | 已实现 |
| 15 | 黑魔法师 / Black Mage | `dark_mage` | 已实现 |
| 16 | 狼骑射手 / Wolfarcher | `wolf_archer` | 已实现 |
| 17 | 冰元素 / Ice Elemental | `ice_elemental` | 已实现 |
| 18 | 史莱姆 / Slime | `slime` | 已实现 |
| 19 | 人鱼 / Mermaid | `mermaid` | 已实现 |
| 20 | 德鲁伊 / Druid | `druid` | 已实现 |

项目锚点：

- `src/game/types.ts`：`UnitClass`、`Ability`、`StatusType`
- `src/game/units.ts`：单位数值与能力配置
- `src/game/apk_compat.ts`：APK 数字 ID 到项目 key 的映射

注意：APK `data.bin` 中 `crystal` 有基础移动字段，但项目将 `crystal` 作为不可招募、不可行动的战役目标占位处理。这对 skirmish 训练影响较小，但不等同于完整 APK 战役行为。

### 5.2 状态规则

| APK ID | 状态 | APK 规则 | 项目状态 |
| ---: | --- | --- | --- |
| 1 | 中毒 | 回合开始损失 10；不能被治疗；亡灵转为回血 | 已实现 |
| 2 | 鼓舞 | 攻击 +10，远程攻击加成减半 | 已实现为 `inspired` |
| 3 | 致盲 | 射程降为 0 | 已实现 |
| 4 | 虚弱 | 移动力降为 1，防御 -10，远程攻击时减半 | 已实现 |

项目已按 APK 文案使用单状态模型：攻击光环附加 `inspired` 时不会覆盖已有状态。

### 5.3 能力规则覆盖

已对齐或基本对齐的能力包括：

- 占领/修理：村庄捕获者、城堡捕获者、修理者。
- 攻击加成：神射手、破坏者、近战大师、死亡收割者、空军打水中非空军。
- 防御与移动：空军、远程防御、水之子、森林之子、山之子、大地之子。
- 状态与光环：投毒者、致盲者、攻击光环、净化光环、虚弱光环。
- 特殊行动：治疗师、召唤师、自我修复、突击部队、支援者。
- 特殊族类：亡灵、战意。

仍需确认的能力边界：

- 净化光环的精确回血量、等级成长和对亡灵扣血规则仍缺 APK 反编译或实机证据。
- 亡灵从墓碑/中毒获得的回血是否可以突破最大血量，语言表未明确。
- 支援和突击后移动的 UI 层细节仍需实机确认。

## 6. 战斗规则对比

项目已实现并与 APK 文案/数据一致或高度一致的规则：

- 伤害按攻击、防御、地形防御和攻击者血量比例计算。
- 同元素/异元素防御差已折算到项目的物理防御和魔法防御。
- 鼓舞攻击 +10，远程 +5。
- 虚弱移动力降至 1，防御 -10，远程攻击时惩罚减半。
- 战意单位不按当前血量削减伤害。
- 近战大师近战伤害乘 1.5。
- 远程防御受到远程攻击时伤害减半。
- 神射手攻击空军 +10。
- 空军攻击水中非空军 +10。
- 破坏者攻击站在村庄上的单位 +10。
- 死亡收割者攻击负面状态单位 +20。
- 召唤师可从墓碑召唤骷髅；召唤师踩/摧毁墓碑不扣血。
- 非亡灵死亡生成墓碑；亡灵死亡不留墓碑。
- 自我修复在回合开始回复 25% 最大生命，且不受中毒阻止。

仍需确认：

- 治疗师主动治疗已允许突破最大血量，但 APK 是否在后续回合或回合开始阶段裁剪回最大血量未知。
- 地形/光环回血目前保留最大血量上限；APK 对这些回血是否允许突破上限未知。
- 反击风暴、致盲、反击、突击移动在复杂状态下的官方顺序仍需更多实测。

## 7. 经济、招募、回合与胜负

### 7.1 收入和招募

APK 证据：

- 语言表确认村庄/城堡/指挥官收入与城堡招募规则。
- DEX 字符串暴露 `Rule.SetIncomeVillage`、`Rule.SetIncomeCastle`、`Rule.SetIncomeCommanderBase`、`Rule.SetIncomeCommanderGrowth`、`Rule.SetLevelCap`、`Rule.SetPrices`。
- 解密脚本实际调用：
  - `rule.SetIncomeVillage`：8 次
  - `rule.SetIncomeCastle`：7 次
  - `rule.SetIncomeCommanderBase`：7 次
  - `rule.SetIncomeCommanderGrowth`：7 次

项目对比：

- `src/game/rule_config.ts` 支持默认收入、指挥官收入、等级上限、单位上限、人口上限、价格覆盖和可招募列表。
- `src/game/apk_rule.ts` 支持 APK Rule API 的基础适配。
- `src/game/apk_stage.ts` 支持 `SyncSetGold`、`SyncSetGoldForTeam`、`SyncChangeGold`、`SyncSetUnitLimit*`、`SyncSetRecruitUnits*`。

### 7.2 stacked/pending 招募状态

DEX 字符串明确存在：

- `Cannot recruit when stacked!`
- `Cannot end turn when stacked!`
- `Cannot select when stacked!`
- `Cannot surrender when stacked!`

项目对比：

- 项目通过 `pendingUnitId` 表达招募后的待处理状态。
- pending 存在时只生成该单位动作，不生成招募和结束回合。
- `AncientEmpiresEnv.getObservation()` 已输出 `pendingUnitId` 和单位级 `isPending`，训练侧可直接观察 stacked 状态。
- 该规则方向与 DEX 字符串吻合，但 UI 精确行为仍未实机确认。

### 7.3 skirmish 终局

解密 `SD/controller.js` 与 `SO/controller.js` 后确认：

```js
var unitCount = Stage.CountUnit(team);
var castleCount = Stage.CountCastle(team);
if (unitCount == 0 && castleCount == 0) {
    Stage.SyncDestroyTeam(team);
}
```

并且只剩一个联盟时：

```js
Stage.SyncGameOver(alliances[0]);
```

项目对比：

- `src/game/apk_skirmish.ts` 使用 `defeatOnNoUnitsAndNoCastles = true`。
- `SO/controller.js` 的 `OnGameStart` 调用 `Stage.SyncSetRecruitUnits(0, 1, 2, 3, 4, 5, 6, 7, 8)`，项目已映射为 SO 模式只开放 APK ID 0 到 8 对应的基础单位。

## 8. 地图与地形

### 8.1 `data.bin` tile 数值

APK `data.bin` 已确认含 84 条 tile 定义。当前项目稳定使用的字段：

- `defenseBonus`
- `healPerTurn`
- `moveCost`

项目对比：

- `src/game/apk_terrain.ts` 归档 84 条 tile 的数值字段。
- `src/game/terrain_rules.ts` 在 APK 导入地图存在 `apkTerrainId` 时优先使用 APK tile 数值。
- 普通项目地图仍走项目抽象地形规则。

高可信映射：

| APK tile | 项目地形 | 证据 |
| ---: | --- | --- |
| `t27` | `damaged_town` | 防御 10、无回血、关联 `t36` |
| `t36` | `town` | 防御 15、回血 20、可被摧毁到 `t27` |
| `t37` | `castle` | 防御 15、回血 20 |
| `t72` | `bridge` | 移动 1；语言表确认桥按水面处理 |

### 8.2 20 张 skirmish AEM 地图

本次复核 20 张 `assets/maps/*.aem` 全部可解析：

| 地图 | 尺寸 | 玩家 | 初始单位 | 推荐金币 | 尾部 |
| --- | --- | --- | ---: | --- | --- |
| `(2) Crossed swords.aem` | 11x18 | 0,1 | 2 | 50 | `zero_suffix_58` |
| `(2) Duel.aem` | 13x13 | 0,1 | 2 | 200 | `zero_suffix_58` |
| `(2) Icy Paths.aem` | 15x15 | 0,1 | 2 | null | `zero_suffix_58` |
| `(2) Liberty Port.aem` | 13x13 | 0,1 | 2 | null | `zero_suffix_58` |
| `(2) Mourningstar.aem` | 11x11 | 0,1 | 2 | 250 | `zero_suffix_58` |
| `(2) Peak Island.aem` | 15x15 | 0,1 | 2 | 300 | `zero_suffix_58` |
| `(2) Swamplands.aem` | 10x10 | 0,1 | 6 | 50 | `zero_suffix_58` |
| `(2) The Crossing.aem` | 15x10 | 0,1 | 2 | 150 | `zero_suffix_58` |
| `(3) Frozen fields.aem` | 15x12 | 0,1,2 | 3 | null | `zero_suffix_58` |
| `(3) Glu.aem` | 13x19 | 0,1,2 | 3 | null | `zero_suffix_58` |
| `(3) Midway.aem` | 17x12 | 0,1,2 | 3 | null | `zero_suffix_58` |
| `(3) classic 2.aem` | 17x12 | 0,2,3 | 3 | null | `zero_suffix_58` |
| `(4) Critical mass.aem` | 15x15 | 0,1,2,3 | 4 | 50 | `zero_suffix_58` |
| `(4) Crossroads.aem` | 11x19 | 0,1,2,3 | 4 | 200 | `zero_suffix_58` |
| `(4) Shadowlands.aem` | 19x19 | 0,1,2,3 | 4 | 150 | `zero_suffix_58` |
| `(4) Solitude.aem` | 15x15 | 0,1,2,3 | 4 | 50 | `zero_suffix_58` |
| `(4) The Crucible.aem` | 19x19 | 0,1,2,3 | 4 | 300 | `zero_suffix_58` |
| `(4) Waterways.aem` | 15x15 | 0,1,2,3 | 4 | 150 | `zero_suffix_58` |
| `(4) Winterstorm.aem` | 13x13 | 0,1,2,3 | 4 | 150 | `zero_suffix_58` |
| `(4) classic 1.aem` | 16x15 | 0,1,2,3 | 4 | 50 | `zero_suffix_58` |

补充结论：

- `src/game/apk_manifest.ts` 已把上述 20 张官方 skirmish 地图清单代码化，包含资源路径、作者、尺寸、玩家、初始单位明细、城堡/城镇归属、完整 APK tile 使用量、推荐金币和尾部模板。
- `src/game/apk_skirmish_tile_usage.ts` 固化了每张地图实际出现的 APK tile ID 及格子数量；按当前 `SKIRMISH_APK_TERRAIN_TO_PROJECT` 映射，20 张官方 skirmish 地图的 `unmappedTerrainIds` 均为空。
- `createApkSkirmishGameState` 只在地图名、作者、尺寸、玩家、开局单位集合、城堡/城镇归属、完整 tile 使用量、推荐金币和尾部模板同时匹配清单时，自动写入 `apkVersion/apkSha256/apkResourcePath`，避免合成地图被误标为 APK 官方资源。
- 20 张图的初始单位 `extra` 字段全部为 `0`，当前不能解释为等级。
- 推荐金币分布：50 有 5 张，150 有 4 张，200 有 2 张，250 有 1 张，300 有 2 张，null 有 6 张。
- 20 张图的 58 字节尾部全部为 `zero_suffix_58`，不能据此推导联盟、玩家颜色或阵营预设。

高频 tile：

| APK tile | 使用量 |
| ---: | ---: |
| 0 | 574 |
| 18 | 383 |
| 17 | 313 |
| 15 | 231 |
| 21 | 209 |
| 20 | 208 |
| 36 | 201 |
| 19 | 200 |
| 9 | 185 |
| 3 | 184 |
| 11 | 170 |
| 16 | 167 |
| 6 | 161 |
| 1 | 109 |
| 37 | 81 |
| 28 | 73 |

项目对比：

- `src/game/apk_map.ts` 已能解析 AEM 地图结构、单位块、推荐金币和尾部。
- `createGameStateFromApkAemMap` 可生成训练用 `GameState`。
- `GameState.metadata` 可保留 APK 版本、APK SHA256、APK 内资源路径、地图名、skirmish 模式、推荐金币和尾部模板。

## 9. 脚本 API 对比

解密 27 个 `assets/mods/**/*.js` 后，最高频 `Stage.*` 调用如下：

| API | 次数 | 项目状态 |
| --- | ---: | --- |
| `Stage.AsyncMessage` | 187 | 未实现；剧情/UI 层 |
| `Stage.CreateReinforcement` | 162 | 未实现；战役增援层 |
| `Stage.SyncGameOver` | 83 | 已有基础适配 |
| `Stage.AsyncMapFocus` | 67 | 未实现；演出/UI 层 |
| `Stage.SyncSetUnitStaticWithCode` | 57 | 已有基础适配 |
| `Stage.AsyncReinforce` | 51 | 未实现；战役增援层 |
| `Stage.PutBoolean` | 44 | 已有基础适配 |
| `Stage.GetBoolean` | 42 | 已有基础适配 |
| `Stage.SyncSetUnitCode` | 40 | 已有基础适配 |
| `Stage.SyncSetUnitLevel` | 35 | 已有基础适配 |
| `Stage.SyncSetUnitLimit` | 25 | 已有基础适配 |
| `Stage.CountUnit` | 25 | 已有基础适配 |
| `Stage.GetUnit` | 18 | 已有基础适配 |
| `Stage.PutInteger` | 17 | 已有基础适配 |
| `Stage.CheckCommander` | 16 | 已有基础适配 |
| `Stage.SyncSetGold` | 16 | 已有基础适配 |
| `Stage.AsyncDestroyUnit` | 16 | 未实现；演出/战役层 |
| `Stage.SyncSetRecruitUnitsForTeam` | 14 | 已有基础适配 |
| `Stage.SyncDisableTeam` | 13 | 已有基础适配 |
| `Stage.SyncSetRecruitUnits` | 13 | 已有基础适配 |
| `Stage.SyncSetAlliance` | 12 | 已有基础适配 |
| `Stage.CountCastle` | 12 | 已有基础适配 |
| `Stage.SyncRestoreTeam` | 12 | 已有基础适配 |
| `Stage.SyncSetUnitTargetedWithCode` | 9 | 已有基础适配 |
| `Stage.SyncOverrideMov` | 9 | 未实现 |
| `Stage.SyncSetUnitHead` | 6 | 未实现 |

项目已覆盖的脚本适配集中在同步规则配置和状态查询：

- 金币、单位上限、可招募列表、联盟、禁用/恢复/摧毁队伍、强制终局。
- 单位 code、static、targeted 元数据。
- 单位等级和状态设置。
- `CountUnit`、`CountCastle`、`CountVillage`、`GetUnit`、`GetUnits`、`GetDistance`。
- 布尔/整数脚本变量。

未覆盖部分主要是战役表现和目标层：

- `AsyncMessage`、`AsyncMapFocus`、`AsyncMoveUnit`、`AsyncAttack`、`AsyncDestroyUnit`。
- `CreateReinforcement`、`AsyncReinforce`。
- `AsyncShowObjectives`、完整目标 UI。
- `SyncOverrideMov`、`SyncSetUnitHead`。
- 水晶和特殊护送/夺回目标。

## 10. Observation 与训练数据

项目 Observation 已能输出：

- 玩家金币、存活状态、指挥官死亡次数。
- 当前有效回合队伍：`turnPlayerIds`。
- APK stacked/pending 招募状态：`pendingUnitId` 和单位级 `isPending`。
- 队伍规则状态：`isEnabled/allianceId/unitCount/population/unitLimit/populationLimit/recruitableUnits/commanderUnitId`，用于暴露 APK 脚本可配置的禁用队伍、联盟、单位上限、人口上限、可招募列表和队伍指挥官。
- 每格 `terrainId/ownerId`。
- 每格 APK 原始字段和映射可信度：`apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence`。
- 每格实际规则数值：`defenseBonus/healPerTurn/moveCost`。
- 单位位置、血量、等级、经验、状态、行动状态。
- 单位最大生命使用 APK 等级成长后的有效值，避免高等级石头人、冰元素、史莱姆等在训练侧被低估或高估。
- 单位攻击、防御、射程和移动使用 APK 等级成长与状态修正后的有效值，避免致盲、虚弱、移动成长等规则在训练观测中变成隐藏信息。
- 单位静态配置：`attackType/population/cost/abilities/isCommander`，其中 `cost` 反映当前规则价格覆盖和指挥官重招募价格，`isCommander` 反映当前规则实际使用的指挥官判定。
- 单位 APK 元数据：`apkUnitId/apkUnitExtra/apkUnitCode/apkStatic/apkTargeted`。
- `apkScriptState.booleans` 与 `apkScriptState.integers`。
- 墓碑信息和地图 metadata。
- APK 导入状态可把 `apkVersion/apkSha256/apkResourcePath` 透传到 Observation，用于锁定训练样本的规则证据来源。

这对 AI 训练很关键：即使地形显示语义仍待校准，训练侧至少能看到当前规则真正使用的 APK 原始 tile 数值。

## 11. 差异与风险清单

| 优先级 | 差异 | 影响 |
| --- | --- | --- |
| P0 | 84 个 APK tile 的完整类别/贴图/建筑语义未校准 | 地形能力、建筑功能和移动分类可能与 APK 有偏差 |
| P0 | 战役脚本未系统转为场景配置 | 无法完整复刻战役、教程、特殊胜负条件 |
| P1 | `SyncOverrideMov` 未实现 | 战役中特定单位/地形移动覆盖不完整 |
| P1 | `SyncSetUnitHead` 未实现 | 战役角色头像/单位外观目标表达不完整 |
| P1 | `crystal` 只是不可行动占位 | 水晶护送/夺回等目标不能完整还原 |
| P1 | 指挥官复活/重招募官方流程未知 | 指挥官模式可能与 APK 不一致 |
| P1 | 招募 stacked/pending 精确 UI 未实测 | 当前规则方向吻合，但交互细节可能不同 |
| P1 | 治疗突破最大血量后的长期裁剪未知 | 超上限血量在后续回合可能与 APK 不一致 |
| P2 | 大量 `Async*` 演出 API 未实现 | 不影响纯 skirmish 训练，但影响完整游戏体验 |
| P2 | AEM 58 字节尾部语义未知 | 当前只能保留证据，不应推导联盟或玩家设置 |

## 12. 建议后续任务

1. 校准 skirmish 高频与低可信 APK tile 语义
   - 20 张地图的尺寸、玩家、推荐金币、初始单位、城堡/村庄归属、tile 使用量和未映射清单已进入代码清单。
   - 优先处理 `t0/t18/t17/t15/t21/t20/t36/t19/t9/t3` 等高频 tile。
   - 对 `t30/t31/t80-t83` 等治疗/神庙/水中建筑做截图、贴图和实测校准。
   - 文档中继续区分“数值确认”和“类别推断”。

2. 系统归档脚本配置
   - 提取 `SyncSetGold`、`SyncSetUnitLimit`、`SyncSetRecruitUnits`、`SyncSetAlliance`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncGameOver`。
   - 输出关卡级配置表，避免把战役差异硬编码到引擎。

3. 补齐必要的脚本层规则接口
   - 优先级高于剧情演出的是 `SyncOverrideMov`、`SyncSetUnitHead`、水晶目标、完整目标条件。
   - `Async*` 演出 API 可后置。

4. 实机或反编译验证高风险细节
   - 指挥官复活/重招募。
   - stacked/pending 招募后部署与结束回合限制。
   - 治疗突破最大血量后的裁剪。
   - 亡灵从墓碑/中毒回血是否可突破上限。
   - 净化光环的精确数值和对亡灵处理。

## 13. 最终判断

项目当前更接近“APK skirmish 规则训练环境”，还不是完整 APK 复刻。

对 AI 训练最关键的单位、战斗、状态、经济、招募、skirmish 终局、SO 招募限制和 AEM 地图解析已经有可用基础。下一阶段最有价值的工作是把 APK 地图和脚本参数整理成可复用配置，并继续校准地形和战役目标行为，使 demo、训练环境和实际应用游戏逐步使用同一套规则事实。
