# APK 规则与项目规则对比复核：aer-release-4.2.5.1

分析日期：2026-06-29

## 1. 范围

本次只做 APK 资源分析与项目规则对比，不修改项目代码，也不修改 `demo` 目录文档。

分析对象：

- APK：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
- SHA256：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
- 解包目录：`C:\code\AncinetEmpires\APK\_analysis\unpack`
- 对比代码：`src/game`

证据来源：

- `assets/data.bin`
- `assets/languages/zh.lang`、`assets/languages/en.lang`
- `assets/maps/*.aem`
- `assets/mods/**/*.js`
- `classes.dex` 字符串
- 当前项目 `src/game` 规则实现

## 2. 总体结论

当前项目已经覆盖 APK 4.2.5.1 的主要 skirmish 对战规则骨架：

- 21 个单位、26 个能力、4 个状态已建模。
- 核心伤害公式、血量比例、地形防御、能力加成和状态修正规则大体对齐。
- 城镇/城堡收入、指挥官收入、可招募列表、价格覆盖、单位上限、人口上限、多队伍、联盟和禁用队伍均有配置表达能力。
- 20 张 APK 内置 skirmish `.aem` 地图可解密解析，项目已提供 AEM 解析和 skirmish GameState 生成入口。
- SD/SO 对战模式的终局逻辑与 SO 可招募限制已被项目规则表达。
- APK 导入地图的 tile 已能保留 `apkTerrainId/apkTerrainRaw/apkOwnerCode`，AI Observation 也能输出 APK tile 的防御、回血、移动消耗数值。

仍未完全对齐的部分主要集中在：

- 84 个 APK tile 的完整贴图/类别/建筑语义。
- `.aem` 推荐金币后的 58 字节尾部业务语义。
- 战役脚本层，包括剧情、目标、增援、水晶目标、单位 head、移动覆盖和完整目标 UI 等；单位 static/targeted 已有基础状态适配。
- 指挥官死亡后复活/重招募的官方默认流程。
- 招募 stacked/pending 状态下的精确 UI 与行动细节。
- 若要让 demo 和 APK 实际游戏完全一致，还需要把 APK 地图、脚本配置、目标条件和特殊演出层独立补齐。

判断：如果目标是 AI 训练用 skirmish 对战环境，当前规则已接近可用；如果目标是完整复刻 APK 4.2.5.1，还不能宣称一致。

## 3. APK 资源复核

### 3.1 资源数量

从 APK zip 直接统计，与现有解包目录一致：

| 类型 | 数量 | 规则意义 |
| --- | ---: | --- |
| `.aem` | 90 | 地图与战役地图 |
| `.js` | 55 | 战役脚本和控制脚本，其中 `assets/mods/**/*.js` 27 个可用 data.bin key 解密 |
| `.json` | 23 | 模组和场景索引，多数加密 |
| `.lang` | 38 | 多语言文案，核心规则说明明文可读 |
| `.bin` | 2 | `data.bin` 与根部副本 |
| `.dex` | 1 | Java 字节码，含 Stage/Rule API 字符串 |
| `.png` | 60 | 贴图资源 |
| `.xml` | 54 | Android 资源 |
| `.so` | 10 | libGDX 原生库 |

### 3.2 加密与解密

`assets/data.bin` 复核结果：

- 文件 magic：`365703`
- DES key：`72 6b 00 00 00 00 46 46`
- 资源加密方式：`DES/CBC/PKCS5Padding`，key 与 IV 相同。
- `data.bin` 解密后再次出现 magic `365703`，随后 `0x54` 表示 84 条 tile 定义。
- 27/27 个 `assets/mods/**/*.js` 可用该 key 解密为 JS 明文。

### 3.3 语言表确认的规则

`zh.lang/en.lang` 可直接确认：

- 单位：APK ID 0 到 20，共 21 个单位。
- 能力：APK ID 0 到 25，共 26 个能力。
- 状态：中毒、鼓舞、致盲、虚弱，共 4 个状态。
- 战斗公式：最终伤害通常为 `(攻击力 - 防御力) * 攻击者血量百分比`，能力可继续修正。
- 收入来源：占领村庄/城堡，或保证指挥官存活；收入在己方回合开始结算。
- 招募条件：己方城堡可招募，城堡上没有单位时可招募，己方指挥官站城堡是例外。
- 状态规则：单位同一时间只能拥有一种状态，已有状态不会被另一种状态替换。
- 桥规则：桥也按水面地形处理。

## 4. skirmish 控制脚本复核

已解密：

- `assets/mods/SD/controller.js`
- `assets/mods/SO/controller.js`

核心结论：

- SD 与 SO 的队伍淘汰条件一致：队伍同时没有单位且没有城堡时，调用 `Stage.SyncDestroyTeam(team)`。
- 胜利判断按存活联盟计算：仅剩一个联盟时 `Stage.SyncGameOver(alliance)`。
- 如果被摧毁的是当前行动队伍，且胜利判断尚未终局，脚本会调用 `Stage.AsyncNextTurn()`。
- SO 在开局调用 `Stage.SyncSetRecruitUnits(0, 1, 2, 3, 4, 5, 6, 7, 8)`，即只开放 APK ID 0 到 8 的基础单位招募。

短摘录：

```js
var unitCount = Stage.CountUnit(team);
var castleCount = Stage.CountCastle(team);
if (unitCount == 0 && castleCount == 0) {
    Stage.SyncDestroyTeam(team);
}
```

```js
Stage.SyncSetRecruitUnits(0, 1, 2, 3, 4, 5, 6, 7, 8);
```

项目对比：

- `src/game/apk_skirmish.ts` 已提供 `getApkSkirmishRuleConfig` 与 `createApkSkirmishGameState`。
- SD/SO 的 skirmish 默认终局通过 `defeatOnNoUnitsAndNoCastles = true` 表达。
- 当前队伍被摧毁且未终局时，引擎会跳到下一存活队伍，避免训练停在无合法动作的死亡队伍。
- SO 的可招募限制已映射到 APK ID 0 到 8 对应的项目单位。

## 5. skirmish 地图复核

根目录 `assets/maps/*.aem` 共 20 张内置 skirmish 地图，全部可解密解析。

尾部模板：

- 20/20 张地图推荐金币后均为 58 字节尾部。
- 20/20 张模板均为 `zero_suffix_58`。
- 该尾部不随玩家数量、推荐金币、地图尺寸或初始单位变化，暂不能推断为联盟/玩家颜色/阵营预设。
- 20/20 张地图的初始单位 `extra` 字段全部为 `0`；项目仅保留 `apkUnitId/apkUnitExtra` 原始字段，不把 `extra` 解释为等级。

推荐金币分布：

| 推荐金币 | 地图数量 |
| --- | ---: |
| 50 | 5 |
| 150 | 4 |
| 200 | 2 |
| 250 | 1 |
| 300 | 2 |
| null | 6 |

地图摘要：

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

20 张 skirmish 地图合计 tile 使用量最高的 APK tile：

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

高可信建筑 tile 使用量：

| APK tile | 项目地形 | 使用量 | 说明 |
| ---: | --- | ---: | --- |
| 27 | `damaged_town` | 23 | 损坏城镇，关联修复到 `t36` |
| 36 | `town` | 201 | 城镇，防御 15、回血 20 |
| 37 | `castle` | 81 | 城堡，防御 15、回血 20 |
| 72 | `bridge` | 0 | 桥候选，当前 20 张 skirmish 地图未使用 |

项目对比：

- `src/game/apk_map.ts` 已解析 magic、宽高、作者、玩家 ID、地形矩阵、单位块、推荐金币和尾部。
- `src/game/apk_map.ts` 创建 GameState 时会使用 skirmish tile 映射，并把每格原始 APK tile 信息写入 `Tile`。
- 当前项目根目录 `assets` 下没有实际导入的 APK 地图文件，仍依赖 APK 解包资源或外部导入流程。
- `GameState.metadata` 与 `observation.metadata` 现已保存地图名、APK 模式、推荐金币和尾部模板等 map-level metadata，用于训练样本追踪和复现实验配置。

## 6. 单位、能力、状态对比

APK 单位 ID 与项目 key 已基本对齐：

| APK ID | APK 单位 | 项目 key | 状态 |
| ---: | --- | --- | --- |
| 0 | Soldier | `soldier` | 已实现 |
| 1 | Archer | `archer` | 已实现 |
| 2 | Aqua Elemental | `water_elemental` | 已实现 |
| 3 | Sorceress | `witch` | 已实现 |
| 4 | Spirit | `elf` | 已实现 |
| 5 | Wolf | `wolf` | 已实现 |
| 6 | Golem | `golem` | 已实现 |
| 7 | Catapult | `catapult` | 已实现 |
| 8 | Dragon | `dragon` | 已实现 |
| 9 | Commander | `commander` | 已实现 |
| 10 | Skeleton | `skeleton` | 已实现，不作为普通招募 |
| 11 | Crystal | `crystal` | 已有占位，但完整战役目标行为未实现 |
| 12 | Paladin | `paladin` | 已实现 |
| 13 | Berserker | `berserker` | 已实现 |
| 14 | Ghost | `ghost` | 已实现 |
| 15 | Black Mage | `dark_mage` | 已实现 |
| 16 | Wolfarcher | `wolf_archer` | 已实现 |
| 17 | Ice Elemental | `ice_elemental` | 已实现 |
| 18 | Slime | `slime` | 已实现 |
| 19 | Mermaid | `mermaid` | 已实现 |
| 20 | Druid | `druid` | 已实现 |

代码锚点：

- `src/game/types.ts:8` 定义 21 个 `UnitClass`。
- `src/game/types.ts:9` 定义 26 个 `Ability`。
- `src/game/types.ts:11` 定义 4 个 `StatusType`。
- `src/game/apk_compat.ts` 集中维护 APK ID 到项目枚举的映射。
- `src/game/units.ts:25` 起定义单位基础数值。

主要差异：

- `Crystal` 在 APK `data.bin` 中有移动值，但项目将其作为不可招募、不可行动占位，这是合理的战役目标简化，但不是完整复刻。
- APK 原始单位模型是“攻击元素 + 元素亲和/防御修正”，项目已经折算为 `physicalDefense/magicDefense` 双防，规则效果接近，但不是原始数据结构。
- 指挥官在 APK `data.bin` 中有价格字段，但普通招募标记不可招募；项目默认 `commanderRecruitBaseCost = null`，只在规则配置显式开启时允许重招募。官方默认复活流程仍未知。
- APK 单位 `moveGrowth` 已进入有效属性、合法移动范围和移动消耗校验；升级后的移动力不再只停留在显示属性。

## 7. 战斗规则对比

项目已对齐的主要规则：

- 伤害公式按攻击、防御、地形防御、攻防地形之子、攻击者血量比例计算。
- 神射手攻击空军 +10。
- 空军攻击水面非空军目标 +10。
- 破坏者攻击站在城镇上的单位 +10。
- 死亡收割者攻击负面状态单位 +20。
- 近战大师近战伤害乘 1.5。
- 远程防御受到远程攻击时伤害减半。
- 战意单位伤害不受当前血量比例影响。
- 鼓舞为正式状态，攻击 +10，远程减半。
- 虚弱使移动力降至 1，防御 -10，远程惩罚减半。
- 状态不叠加，已有状态时不会被新状态替换。
- 自我修复按 APK 文案不受中毒影响；低血量单位先被中毒扣到 0 以下时，仍会执行 25% 最大生命回复，回复后仍不大于 0 才死亡。

代码锚点：

- `src/game/rules.ts:17` 伤害计算。
- `src/game/rules.ts:33` 神射手。
- `src/game/rules.ts:36` 破坏者攻击城镇单位。
- `src/game/rules.ts:42` 死亡收割者。
- `src/game/rules.ts:47` 飞行单位不吃地形防御。
- `src/game/rules.ts:54` 鼓舞攻击加成。
- `src/game/rules.ts:60` 虚弱远程防御修正。
- `src/game/engine.ts:180` 攻击光环附加鼓舞。
- `src/game/engine.ts:191` 虚弱光环附加虚弱。

待确认差异：

- 治疗师主动治疗已允许突破最大血量，但 APK 后续回合是否会把超上限血量裁回最大血量仍需实测。
- 亡灵从墓碑或中毒获得的回血，项目仍受最大血量限制，APK 文案没有明确是否可突破。
- 召唤师文案说明“摧毁墓碑不损失生命”，项目已覆盖直接移动踩墓碑不扣血；普通非亡灵单位仍扣 10，亡灵回血 10。
- 净化光环的精确回血量、等级成长和是否对亡灵造成伤害，目前项目有实现，但仍缺 APK 反编译或实机确认。

## 8. 经济、招募、回合与终局

项目已覆盖：

- 城镇收入、城堡收入。
- 指挥官存活收入和等级成长收入。
- 初始金币和队伍初始金币。
- 单位价格覆盖。
- 单位上限、人口上限。
- 全局/队伍可招募列表。
- 联盟、禁用队伍、恢复队伍、销毁队伍、强制终局。
- 多队伍回合轮转。
- skirmish 默认“无单位且无城堡”淘汰。
- 单独“无单位”“无城堡”“指挥官阵亡”淘汰条件可配置。
- 招募 pending/stacked 状态：刚招募的单位必须优先处理，pending 时不允许继续招募或结束回合。

代码锚点：

- `src/game/rule_config.ts:5` 默认规则配置。
- `src/game/rule_config.ts:187` 地形收入。
- `src/game/rules.ts:230` 城堡招募合法动作。
- `src/game/rules.ts:253` pending 状态禁止结束回合。
- `src/game/engine.ts:512` `recruit_to_castle`。
- `src/game/engine.ts:540` `recruit_and_deploy`。
- `src/game/engine.ts:569` 回合结束与收入结算。
- `src/game/engine.ts:754` 胜负条件。

待确认差异：

- APK 默认收入数值、默认单位上限、默认人口上限不应只从项目默认值反推，需要继续从脚本或反编译代码确认。
- 指挥官死亡后的官方复活入口、费用、是否占用人口、是否受可招募列表影响仍未知。
- 指挥官站城堡招募后，新单位部署范围、移动力、是否仍需立即行动、UI 是否允许取消，仍需 APK 实测或反编译。
- DEX 中存在 `Cannot recruit/select/end turn/surrender when stacked!`，项目仅覆盖了训练引擎所需的 pending 限制，未复刻完整 UI 禁止项。

## 9. 地形与地图导入

APK `data.bin` 已确认有 84 条 tile 定义。每条 tile 记录是 40 字节定长结构，当前稳定使用字段包括：

- `defenseBonus`
- `healPerTurn`
- `moveCost`
- 若干 kind、variant、linked 字段，业务语义仍需校准。

项目地形只有 17 个抽象地形：

- `src/game/terrain.ts` 定义 17 个 `TerrainId`。
- `src/game/apk_terrain.ts` 归档 84 条 APK tile 基础数值。
- `src/game/terrain_rules.ts` 在 APK 导入地图上优先读取原始 APK tile 的防御、回血、移动消耗。

高可信映射：

| APK tile | 项目地形 | 可信原因 |
| ---: | --- | --- |
| 27 | `damaged_town` | 防御 10、回血 0、linkedC 指向 36 |
| 36 | `town` | 防御 15、回血 20、可与损坏城镇互相联系 |
| 37 | `castle` | 防御 15、回血 20，符合城堡文案 |
| 72 | `bridge` | 移动 1、桥按水面处理，但 skirmish 未使用 |

skirmish 训练映射：

- `SKIRMISH_APK_TERRAIN_TO_PROJECT` 将 APK 的水面、海岸、道路、森林、山地、建筑和特殊 tile 归并到 17 个项目地形。
- 这是一套训练导入近似映射，不等于完整官方 tile 语义。
- 对 AI 训练而言，数值层更重要：APK 导入地图会保留原始 tile ID，移动、防御、回血优先取 APK 原始数值。

待确认差异：

- `t30/t31/t80-t83` 等治疗建筑、水中建筑、神庙/营地分类仍需校准。
- 部分水面/海岸 tile 的可通行性、单位能力交互和贴图语义还不应高可信认定。
- `16777215` 移动消耗在 APK 中应表示不可通行或特殊移动代价，项目目前通过原始数值暴露，但仍需确认各单位能力如何绕过。

## 10. 脚本 API 与战役差异

27 个可解密 `assets/mods/**/*.js` 中，常见 API 统计：

| API | 出现次数 | 项目状态 |
| --- | ---: | --- |
| `Stage.AsyncMessage` | 187 | 未实现，剧情/UI 层 |
| `Stage.CreateReinforcement` | 162 | 未实现，战役增援层 |
| `Stage.SyncGameOver` | 83 | 基础适配已实现 |
| `Stage.AsyncMapFocus` | 67 | 未实现，演出/UI 层 |
| `Stage.SyncSetUnitStaticWithCode` | 57 | 基础适配已实现；`apkStatic` 单位不生成合法动作 |
| `Stage.AsyncReinforce` | 51 | 未实现，战役增援层 |
| `Stage.PutBoolean` | 44 | 已有脚本变量基础适配 |
| `Stage.GetBoolean` | 42 | 已有脚本变量基础适配 |
| `Stage.SyncSetUnitCode` | 40 | code 元数据已基础适配；static/targeted 已基础适配，head 仍未实现 |
| `Stage.SyncSetUnitLevel` | 35 | 基础适配已实现 |
| `Stage.SyncSetUnitLimit` | 25 | 基础适配已实现 |
| `Stage.CountUnit` | 25 | 基础适配已实现 |
| `Stage.GetUnit` | 18 | 已支持按 code 或坐标查询 |
| `Stage.PutInteger` | 17 | 已有脚本变量基础适配 |
| `Stage.CheckCommander` | 16 | 基础适配已实现 |
| `Stage.SyncSetGold` | 16 | 基础适配已实现 |
| `Stage.AsyncDestroyUnit` | 16 | 未实现，演出/战役层 |
| `Stage.SyncSetRecruitUnitsForTeam` | 14 | 基础适配已实现 |
| `Stage.SyncDisableTeam` | 13 | 基础适配已实现 |
| `Stage.SyncSetRecruitUnits` | 13 | 基础适配已实现 |

项目已覆盖的脚本适配集中在同步规则配置和统计查询：

- `src/game/apk_stage.ts`
- `src/game/apk_rule.ts`
- DEX 暴露的坐标查询 `CheckCastle`、`CheckVillage`、`GetTileTeam` 已补到 `apk_stage.ts`，用于建筑/地块归属目标判断。
- 解密脚本实际调用的 `SyncSetUnitCode(x,y,code)`、`GetUnit(code)`、`GetUnit(x,y)`、`GetUnits(team)` 已基础适配，用作单位标识和目标查询。
- 解密脚本实际调用的 `SyncSetUnitStatic*` 和 `SyncSetUnitTargeted*` 已基础适配，分别用于行动锁定和训练可见目标标记。
- 解密脚本实际调用的布尔/整数脚本变量和 `GetDistance` 已基础适配，用于后续承接目标判断状态。

尚未覆盖的是完整战役执行器：

- `Async*` 剧情和演出。
- 增援创建、移动演出、地图聚焦。
- 更完整的脚本变量生命周期和持久化。
- 单位 head、移动覆盖和完整目标展示。
- 水晶和特殊目标单位。
- 关卡目标 UI 与失败条件展示。

## 11. AI Observation 对比

项目当前 Observation 已输出：

- 玩家金币、存活状态、指挥官死亡次数。
- 每格 `terrainId/ownerId`。
- 每格 APK 原始字段：`apkTerrainId/apkTerrainRaw/apkOwnerCode`。
- 每格规则数值：`defenseBonus/healPerTurn/moveCost`。
- 单位位置、血量、等级、经验、行动状态、状态类型、APK 初始单位 ID/extra 和脚本 code/static/targeted。
- APK Stage 脚本变量：`apkScriptState.booleans` 与 `apkScriptState.integers`。
- 墓碑信息。

代码锚点：

- `src/game/env.ts:17` Observation 定义。
- `src/game/env.ts:236` `getObservation`。
- `src/game/env.ts:254` 输出 APK tile 原始字段。
- `src/game/env.ts:257` 输出地形规则数值。
- `src/game/env.ts` 输出单位 `apkUnitId/apkUnitExtra/apkUnitCode/apkStatic/apkTargeted` 和 `apkScriptState`，用于训练侧观察 APK 初始单位记录和脚本目标判断状态。

已包含：

- 地图名。
- skirmish 模式 SD/SO。
- 推荐金币原始值。
- AEM 尾部模板。

仍缺：

- APK 源文件路径或资源名以外的完整资源路径。
- APK 解包/规则版本。

这些字段不会改变规则，但会影响训练数据追踪、实验复现和错误样本定位。

## 12. 风险清单

| 优先级 | 差异 | 影响 |
| --- | --- | --- |
| P0 | 低可信 APK tile 语义未校准 | 地形类别、建筑功能、特殊地形能力可能偏离 APK |
| P0 | 战役脚本未系统归档为场景配置 | 无法完整复刻战役与特殊规则 |
| P1 | `.aem` 58 字节尾部语义未知 | 不应据此推导联盟、玩家颜色或阵营预设 |
| P1 | 指挥官复活/重招募官方流程未知 | 指挥官模式和 APK 可能不同 |
| P1 | stacked/pending 精确行为未知 | 招募后部署、移动力、回合结束限制可能有差异 |
| P1 | `Crystal` 仍只是占位 | 完整战役目标、目标 UI 和特殊胜负条件不完整 |
| P2 | 剧情/演出 `Async*` API 未实现 | 不影响基础 skirmish 训练，但影响完整游戏体验 |
| P2 | Observation 地图元数据仍缺 APK 版本/完整资源路径 | 影响训练样本追踪，不影响即时规则执行 |

## 13. 建议后续任务

1. 建立 skirmish 地图数据表
   - 每张地图记录尺寸、玩家、推荐金币、初始单位、城堡/城镇归属、tile 使用量、尾部模板。
   - 作为训练地图集的固定输入清单。

2. 校准 APK tile 语义
   - 优先处理 20 张 skirmish 地图高频 tile。
   - 对 `t30/t31/t80-t83` 等治疗/神庙/水中建筑做截图、贴图和实测校准。
   - 区分“数值已确认”和“地形类别推断”。

3. 扩展 GameState/Observation 地图元数据
   - 已保存地图名、skirmish 模式、推荐金币、尾部模板。
   - 后续可继续补充 APK 版本和完整资源路径。
   - 这属于训练可观测性增强，不改变游戏规则。

4. 系统提取脚本配置
   - 先提取 `SyncSetGold`、`SyncSetUnitLimit`、`SyncSetRecruitUnits`、`SyncSetAlliance`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncGameOver`。
   - 输出关卡级配置表，避免把战役规则硬编码进引擎。

5. 反编译或实机验证高风险细节
   - 指挥官复活。
   - 招募 stacked/pending 后部署与移动。
   - 治疗突破最大血量后的后续裁剪。
   - 召唤师踩墓碑免伤已覆盖；后续可继续实测墓碑回血是否允许突破上限。

## 14. 最终判断

项目当前更接近“APK skirmish 规则训练环境”，而不是完整 APK 游戏复刻。

核心对战规则、单位数值、能力、状态、skirmish 终局、SO 招募限制和 AEM 地图解析已经有较好基础。接下来最有价值的工作不是继续堆通用规则，而是把 APK 地图与脚本数据整理成可复用配置，并校准地形和战役特殊行为。这样才能让 demo、训练环境和实际应用游戏逐步收敛到同一套规则事实。
