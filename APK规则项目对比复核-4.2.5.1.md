# APK 规则与项目规则对比复核：aer-release-4.2.5.1

分析日期：2026-06-29

本轮复核：2026-06-29。本次复核只读取 APK、解包资源、根目录文档和 `src/game` 规则实现；未修改项目源码，也未修改 `demo` 目录。

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
- 本轮没有重新生成大型解包产物；直接复用 `APK\_analysis\unpack` 和项目内已归档的 APK manifest/脚本 manifest 做复核。

## 2. 总体结论

当前项目已经覆盖 APK 4.2.5.1 的主要 skirmish 对战规则骨架：

- 21 个单位、26 个能力、4 个状态已在项目中建模。
- 单位基础数值、成长、攻击类型、防御、射程、移动、人口和招募价格基本按 APK `data.bin` 对齐。
- 战斗公式、地形防御、状态互斥、能力加成、治疗、召唤、墓碑、亡灵、支援、突击后移动等核心交互均已有实现。
- 城堡/村庄/指挥官收入、金币、单位上限、可招募列表、价格覆盖、等级上限、联盟、禁用队伍和强制终局已有规则配置入口。
- 20 张内置 skirmish `.aem` 地图可解密解析，项目已有 AEM 解析和 skirmish GameState 生成入口。
- SD/SO skirmish 模式的终局逻辑与 SO 可招募限制已能由项目规则表达。
- APK 导入地图会保留并维护当前 `apkTerrainId/apkTerrainRaw/apkOwnerCode`，移动、防御、回血优先使用 APK `data.bin` 的 tile 数值。
- 城镇摧毁/修理会使用 `data.bin` 的 linked tile：`t36.linkedB=27`，`t27.linkedC=36`；占领会同步更新 APK owner code。

仍不能宣称项目与 APK 完全一致：

- APK 有 84 个 tile，项目只有抽象地形模型；数值可用，但贴图/类别/建筑语义仍有未校准项。
- 战役脚本层只覆盖同步规则配置和部分查询，未实现大量 `Async*` 剧情、增援、目标 UI 和演出 API。
- 水晶目标、指挥官复活/重招募官方流程仍未完整还原；单位 head 已作为脚本元数据保留，但未实现头像 UI。
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

2026-06-30 补充：上述 skirmish 地图解密复核已固化为 `tools/apk_map_report.ts`，可通过以下命令重复验证：

```bash
npm run apk:map-report -- --check
```

当前命令输出确认：APK SHA256 匹配 `51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`，20 张 `assets/maps/*.aem` 全部可解密解析，20/20 与 `src/game/apk_manifest.ts` 清单匹配，unmapped tile 数为 0。报告同时列出 4 张含 approximate tile 的地图和 `t30/t31` 人工验证坐标。

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
- 状态与光环：投毒者、致盲者、攻击光环、净化光环、虚弱光环；三类光环按 APK 文案只在 `wait`/待机动作后触发。
- 特殊行动：治疗师、召唤师、自我修复、突击部队、支援者；支援会重置目标行动状态并同步重置有效剩余移动力。
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
- 治疗师主动治疗可突破最大血量；已超过最大血量的友军仍可作为治疗目标，治疗后继续累加。
- 亡灵被友军治疗转为伤害时，也会占用本回合被治疗次数，避免同一目标被重复治疗动作处理。
- 升级回满血会保证单位至少达到当前最大生命，但不会把治疗师造成的既有超上限生命压回最大生命。

仍需确认：

- 治疗师主动治疗已允许持续突破最大血量；普通封顶回血和升级回满血不会继续突破上限，也不会把既有超上限生命压回最大生命。APK 是否存在其它后续裁剪时机仍未知。
- 地形/光环/墓碑/亡灵中毒回血目前保留最大血量上限；APK 对这些回血是否允许突破上限未知。
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
- pending 存在时只生成该单位动作，不生成招募、投降和结束回合。
- `RuleConfig.allowSurrender` 已支持结构化 `surrender` 动作；普通规则默认关闭，`createApkSkirmishGameState` 的 SD/SO 规则默认开启。
- 执行 `surrender` 会让当前队伍失活，并复用既有联盟胜负结算；内置训练 AI 不会把投降当作普通非结束动作随机优先选择。
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
| `t27` | `damaged_town` | 防御 10、无回血、`linkedC=36`，可修理回村庄 |
| `t36` | `town` | 防御 15、回血 20、`linkedB=27`，可被摧毁到废墟 |
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

- `src/game/apk_manifest.ts` 已把上述 20 张官方 skirmish 地图清单代码化，包含资源路径、作者、尺寸、玩家、初始单位明细、城堡/城镇归属、完整 APK tile 使用量、tile 映射可信度统计、推荐金币和尾部模板。
- `src/game/apk_skirmish_tile_usage.ts` 固化了每张地图实际出现的 APK tile ID 及格子数量；`terrainConfidence` 会按当前 `SKIRMISH_APK_TERRAIN_TO_PROJECT` 映射统计 confirmed/atlas/approximate/unmapped 格子数。20 张官方 skirmish 地图的 `unmappedTerrainIds` 均为空。
- 低可信 approximate tile 只出现在 4 张官方 skirmish 图：`(2) Mourningstar.aem` 的 `t30` 2 格，`(4) The Crucible.aem` 的 `t31` 1 格，`(4) Waterways.aem` 的 `t31` 2 格，`(4) Winterstorm.aem` 的 `t31` 4 格；其余 16 张图不含 approximate/unmapped tile。
- `getApkSkirmishTrainingMapManifest()` 默认只返回不含 approximate/unmapped tile 的 16 张官方图，并支持按玩家数量或显式允许低可信 tile 筛选训练地图。
- `getApkSkirmishTerrainVerificationTargets()` 默认输出这 4 个低可信 skirmish 验证目标，并附带坐标、evidence、APK `data.bin` 地形配置副本、`projectRuleSemantics` 当前项目语义快照和 `manualChecks` 实测回填 key/value 清单；需要时可按 confidence、tile ID 或地图名查询其它 confirmed/atlas tile 的同类数据。当前坐标为：`Mourningstar t30=(3,4),(7,6)`，`The Crucible t31=(9,9)`，`Waterways t31=(7,8),(7,11)`，`Winterstorm t31=(0,0),(12,0),(0,12),(12,12)`。当前项目语义中，`t30` 按 camp 回血但不净化，`t31` 按 temple 回血并净化，二者都不可占领、无收入。
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
- `createGameStateFromApkAemMap` 会在推荐金币默认值之后应用 `RuleConfig.initialGold` 和队伍级 `initialGold`；`createApkSkirmishGameState` 使用公共 `mergeRuleConfig` 合并模式规则和外部规则，后续叠加 APK 脚本/场景配置时不会丢失嵌套队伍规则。
- 水之子/森林之子/山之子/大地之子、空军打水中单位等地形分类已优先按 `apkTerrainId -> SKIRMISH_APK_TERRAIN_TO_PROJECT` 判断，项目 `terrainId` 只在缺少 APK 原始 tile 时兜底。
- 占领、摧毁、修理、招募、收入、胜负城堡统计，以及 Stage 城堡/村庄查询和计数也已使用同一套 tile 语义 helper，避免 APK 导入地图因项目 `terrainId` 近似值而丢失建筑规则。
- 摧毁和修理会同步当前 APK tile：`t36 -> t27`、`t27 -> t36`；占领会同步当前 `apkOwnerCode/apkTerrainRaw`，避免 Observation 和后续规则仍保留导入时旧状态。

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
| `Stage.SyncOverrideMov` | 9 | 已有基础适配；按单位 code、APK tile ID/kind 和 mov 覆盖移动消耗 |
| `Stage.SyncSetUnitHead` | 6 | 已作为 `apkUnitHead` 元数据适配 |

项目已覆盖的脚本适配集中在同步规则配置和状态查询：

- 金币、单位上限、可招募列表、联盟、禁用/恢复/摧毁队伍、强制终局。
- 单位 code、static、targeted、head 元数据；`SyncSetUnitCode/Static/Targeted/Head` 已兼容解密脚本确认的 `x, y, ...` 坐标形态。
- 单位 code 绑定的 tile type 移动消耗覆盖：`SyncOverrideMov(code, tileType, mov)`；当前同时兼容 APK tile ID 与 terrain kind；9 个脚本字面量调用已进入 `APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS`，并可通过 `applyApkScriptStageStateConfig` 显式应用。
- 单位等级和状态设置；`SyncSetUnitLevel` 默认回满血，但不会把既有超上限生命压回最大生命；`SyncSetUnitLevel/SyncSetUnitStatus/SyncSetCommander` 均兼容解密脚本确认的 `x, y` 坐标调用形态；`SyncSetUnitStatus` 已支持 replaceExisting 标志，已归档的实际调用为 `SyncSetUnitStatus(6, 9, 2, 2, true)`。
- `CountUnit`、`CountCastle`、`CountVillage`、`GetUnit`、`GetUnits`、`GetDistance`；`GetTileTeam/CheckCastle/CheckVillage/GetUnit/GetDistance` 已兼容脚本中的 `x, y` 或 `x1, y1, x2, y2` 查询形态。
- 布尔/整数脚本变量。

未覆盖部分主要是战役表现和目标层：

- `AsyncMessage`、`AsyncMapFocus`、`AsyncMoveUnit`、`AsyncAttack`、`AsyncDestroyUnit`。
- `CreateReinforcement`、`AsyncReinforce`。
- `AsyncShowObjectives`、完整目标 UI。
- 水晶和特殊护送/夺回目标。

`src/game/apk_script_manifest.ts` 已把 27 个已解密 `assets/mods/**/*.js` 的调用次数和可直接提取的字面量规则配置分布代码化：

- 金币字面量：300x5、400x1、450x1、500x5、600x1、800x3。
- 单位上限字面量：10x5、15x6、20x2、25x1、30x5、40x1、50x4、60x1。
- 全局可招募列表 6 种组合，队伍级可招募列表 13 种组合。
- 联盟、禁用队伍和 `rule.SetIncome*` 收入覆盖已有分布表。
- `APK_SCRIPT_LITERAL_RULE_CONFIGS` 已按资源路径记录 26 个脚本的逐脚本字面量配置；`SD/controller.js` 只有动态队伍摧毁/胜负调用，没有固定规则字面量表项。

`src/game/apk_script_config.ts` 已提供字面量配置到项目 `RuleConfig` 的静态生成入口，可安全转换金币、收入、单位上限、全局/队伍可招募列表、联盟和禁用队伍。`SyncRestoreTeam` 与 `SyncGameOver` 属于生命周期/终局调用，只保留为被忽略证据，不写入开局静态规则。该入口仍不是完整脚本执行器；含动态参数的配置和剧情触发仍需独立场景层处理。

## 10. Observation 与训练数据

项目 Observation 已能输出：

- 玩家金币、存活状态、指挥官死亡次数。
- 当前有效回合队伍：`turnPlayerIds`。
- APK stacked/pending 招募状态：`pendingUnitId` 和单位级 `isPending`。
- 全局规则摘要：`initialGold/incomeVillage/incomeCastle/incomeCommanderBase/incomeCommanderGrowth/levelCap/unitLimit/populationLimit/recruitableUnits/priceOverrides/commanderRecruitBaseCost/commanderRecruitCostGrowth/allowSurrender/defeat*/alliances/disabledTeams/commanderUnitIds/teams`，用于让训练端直接读取 APK 模式或脚本配置后的经济、等级、招募价格覆盖、联盟/禁用队伍/脚本指挥官、队伍级规则和终局条件。
- 队伍规则状态：`isEnabled/allianceId/unitCount/population/unitLimit/populationLimit/recruitableUnits/recruitCosts/commanderUnitId`，用于暴露 APK 脚本可配置的禁用队伍、联盟、单位上限、人口上限、可招募列表、当前招募费用和队伍指挥官。
- 每格 `terrainId/ownerId`。
- 每格 APK 当前字段、映射可信度和映射依据：`apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence/apkTerrainMappingEvidence`。
- 每格 APK `data.bin` 当前配置快照：`apkTerrainConfig.id/kind/flagA/variant/linkedA/defenseBonus/healPerTurn/moveCost/flagB/linkedB/linkedC/flagC/tail`。
- 地图级 APK tile 映射可信度摘要：`terrainMappingSummary.apkTileCount/byConfidence/apkTerrainUsage/approximateApkTerrainIds/unmappedApkTerrainIds`，用于快速识别整张地图是否含低可信或未映射 tile。
- 每格实际规则数值：`defenseBonus/healPerTurn/moveCost`。
- 每格实际规则语义：`ruleTerrainId/terrainKey/terrainTags`，用于直接暴露 APK tile 映射后的城堡、城镇、水面、森林、山地等规则标签。
- 单位位置、血量、等级、经验、状态、行动状态。
- 单位隐藏规则状态：`movementRemaining/hasPostAttackMoved/hasBeenHealedThisTurn/hasBeenSupportedThisTurn/statusRemainingTicks/statusRemainingTurns`，用于暴露突击后移动、单回合治疗/支援限制和状态剩余时间。
- 单位最大生命使用 APK 等级成长后的有效值，避免高等级石头人、冰元素、史莱姆等在训练侧被低估或高估。
- 单位攻击、防御、射程和移动使用 APK 等级成长与状态修正后的有效值，避免致盲、虚弱、移动成长等规则在训练观测中变成隐藏信息。
- 单位基础数值与成长：`baseAttack/basePhysicalDefense/baseMagicDefense/baseMinRange/baseMaxRange/baseMove/attackGrowth/defenseGrowth/maxHpGrowth/moveGrowth`，直接来自 APK `data.bin` 单位表，供训练侧读取升级收益。
- 单位/能力/状态 APK 数字 ID：`apkUnitClassId/apkAbilityIds/apkStatusId`，用于直接对齐 `data.bin`、AEM 初始单位和 Stage 脚本 API 的数字 ID。
- 单位静态配置：`attackType/population/cost/abilities/isCommander`，其中 `cost` 反映当前规则价格覆盖和指挥官重招募价格，`isCommander` 反映当前规则实际使用的指挥官判定。
- 单位所在格规则地形快照：`tileTerrainId/tileRuleTerrainId/tileTerrainKey/tileTerrainTags/tileOwnerId/tileApkTerrainId/tileApkOwnerCode/tileApkTerrainConfig/tileApkTerrainMappingConfidence/tileApkTerrainMappingEvidence/tileDefenseBonus/tileHealPerTurn/tileMoveCost`，用于直接读取单位当前站位的 APK tile 映射语义、原始配置和数值。
- 单位 APK 元数据：`apkUnitId/apkUnitExtra/apkUnitCode/apkStatic/apkTargeted/apkUnitHead/apkMoveOverrides`。
- `apkScriptState.booleans` 与 `apkScriptState.integers`。
- 墓碑信息和地图 metadata。
- APK 导入状态可把 `apkVersion/apkSha256/apkResourcePath` 透传到 Observation，用于锁定训练样本的规则证据来源。
- APK AEM tile 可信度 metadata：`apkApproximateTerrainIds/apkApproximateTileCount/apkUnmappedTerrainIds/apkUnmappedTileCount`，用于样本索引阶段识别低可信或未映射 tile。
- APK 脚本字面量规则来源 metadata：`apkRuleScriptResourcePath/apkRuleScriptIgnoredRestoreTeamIds/apkRuleScriptIgnoredGameOverAllianceIds/apkRuleScriptWarnings`，用于追踪当前规则配置来自哪个脚本以及哪些生命周期调用被静态转换忽略。
- APK 脚本单位/坐标状态来源 metadata：`apkStageStateScriptResourcePath/apkStageStateAppliedSyncOverrideMovCount/apkStageStateAppliedSyncSetUnitStatusCount/apkStageStateScriptWarnings`，用于追踪训练状态是否显式应用过 `SyncOverrideMov` 或 `SyncSetUnitStatus` 字面量配置。

训练接口层还新增 `getActionSpaceSchema()`，返回当前结构化动作的字符串编码模板，覆盖移动、突击后移动、攻击、治疗、支援、召唤、招募、占领、修理、摧毁城镇、待机、投降和结束回合。该 schema 只描述动作编码格式，实际动作可用性仍由每个局面的 `legalActions/actionMask` 决定。

这对 AI 训练很关键：即使地形显示语义仍待校准，训练侧也能同时看到 APK 原始 tile 数值、映射可信度、映射依据，以及当前规则实际使用的地形语义。比如 APK 城堡/城镇 tile 即使在导入时保留了项目 `terrainId=road` 这类近似值，Observation 仍会输出 `ruleTerrainId=castle/town` 对应的项目 ID、`terrainKey` 和 `terrainTags`，避免训练管线再二次推导；低可信 tile 会按营地、陆地神庙、水中障碍和水中神庙候选输出 evidence，便于训练或数据清洗侧分组降权处理。

## 11. 差异与风险清单

| 优先级 | 差异 | 影响 |
| --- | --- | --- |
| P0 | 84 个 APK tile 的完整类别/贴图/建筑语义未校准 | 地形能力、建筑功能和移动分类可能与 APK 有偏差 |
| P0 | 战役脚本未系统转为场景配置 | 无法完整复刻战役、教程、特殊胜负条件 |
| P1 | `SyncOverrideMov` 字面量调用已归档，但脚本场景未系统应用 | 特定单位/地形移动覆盖已有规则入口和证据表，仍缺批量场景配置执行 |
| P1 | 脚本字面量配置已可生成 `RuleConfig`，动态逐关卡配置仍未转场景表 | 战役和特殊 skirmish 规则无法批量复现 |
| P2 | 单位 head 只做元数据透传 | 战役角色头像/单位外观 UI 未实现；不影响纯规则训练 |
| P1 | `crystal` 只是不可行动占位 | 水晶护送/夺回等目标不能完整还原 |
| P1 | 指挥官复活/重招募官方流程未知 | 指挥官模式可能与 APK 不一致 |
| P1 | 招募 stacked/pending 精确 UI 未实测 | 当前规则方向吻合，但交互细节可能不同 |
| P1 | 治疗突破最大血量后的长期裁剪未知 | 超上限血量在后续回合可能与 APK 不一致 |
| P2 | 大量 `Async*` 演出 API 未实现 | 不影响纯 skirmish 训练，但影响完整游戏体验 |
| P2 | AEM 58 字节尾部语义未知 | 当前只能保留证据，不应推导联盟或玩家设置 |

## 12. 建议后续任务

1. 校准 skirmish 高频与低可信 APK tile 语义
   - 20 张地图的尺寸、玩家、推荐金币、初始单位、城堡/村庄归属、tile 使用量、可信度统计和未映射清单已进入代码清单。
   - 低可信 tile 实测目标已可由 `getApkSkirmishTerrainVerificationTargets()` 直接导出，默认只列官方 skirmish 中实际出现的 `t30/t31` 目标，并附带精确坐标、APK owner code、项目当前规则语义和实测回填 key/value 清单。
   - 优先处理 `t0/t18/t17/t15/t21/t20/t36/t19/t9/t3` 等高频 tile。
   - `t30` 已按贴图收窄为营地/帐篷，`t81/t82` 已从水中神庙候选改为水面浮冰/礁石候选；evidence 现在会区分营地、陆地神庙、水中障碍和水中神庙候选。
   - 回合开始回归测试已覆盖 `t31/t80/t83` 按神庙候选清毒回血、`t30/t81` 不清毒；后续重点实测 `t31/t80/t83` 的净化、可占领、敌我归属和回血边界。
   - 文档中继续区分“数值确认”和“类别推断”。

2. 系统归档脚本配置
   - 已归档 API 计数、可直接提取的字面量配置分布、26 个脚本的逐脚本字面量配置表，并可把安全字面量生成 `RuleConfig`。
   - 下一步按关卡输出场景配置表，处理动态参数，并继续区分“规则配置”“目标判断”“剧情演出”三类，避免把战役差异硬编码到引擎。

3. 补齐必要的脚本层规则接口
   - 优先级高于剧情演出的是水晶目标、完整目标条件和脚本配置归档。
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
