# APK 规则分析与项目对比：aer-release-4.2.5.1

分析日期：2026-06-29

## 1. 分析范围

分析对象：

- APK：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
- SHA256：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
- 解包目录：`C:\code\AncinetEmpires\APK\_analysis\unpack`

对比对象：

- 当前项目规则代码：`demo/src/game`
- 当前项目规则文档：`README.md`、`远古帝国AI训练规则整理.md`、`远古帝国AI训练项目上下文.md`

初次 APK 分析只输出文档；后续实现记录见第 15 节，代码侧已逐步接入已确认规则。

## 2. 结论摘要

APK 资源能确认一批核心规则：单位、能力、状态、招募、收入、战斗公式、地形加成、墓碑、亡灵、支援、光环等。当前项目实现已经覆盖大多数核心战棋动作，并且最近加入的 `pendingUnitId` 招募待处理机制，与 APK dex 字符串中的 `Cannot ... when stacked!` 高度吻合。

本轮已按 APK 明文规则修正以下差异：

1. `鼓舞 / Inspired` 已加入正式状态系统，攻击光环会附加鼓舞状态，并遵守“已有状态不替换”。
2. `虚弱 / Weakened` 已改为移动力降至 1，近战防御 -10，远程攻击时防御惩罚减半。
3. 治疗师主动治疗已允许突破目标最大血量；其他地形/光环回复仍保留最大血量上限，等待进一步确认。
4. 空军攻击水中非空军单位已增加攻击 +10；目标同为空军时不触发。
5. 已加入 APK 第 11 号 `水晶 / Crystal` 占位单位，并新增 APK 单位/状态/能力 ID 映射。

仍未完成的关键差异：

1. APK 明确存在初始金币等更多可配置规则；项目已接入单位上限、人口上限、可招募列表、收入、价格覆盖和等级上限配置，但 APK 默认值仍需反编译或实测确认。
2. 指挥官死亡计数和重招募费用增长已有配置支持；官方复活流程、默认费用和胜负关系仍需反编译或实测确认。
3. APK 资源中的 `.aem/.js/.json` 尚未解码，地图/脚本数值仍不能作为已确认事实写入规则引擎。

## 3. APK 结构观察

解包后主要内容：

| 类型 | 数量 | 说明 |
| --- | ---: | --- |
| `.aem` | 90 | 地图/战役地图资源 |
| `.png` | 60 | 贴图与 Android 图标 |
| `.js` | 55 | 战役脚本或控制脚本，但不是明文 |
| `.xml` | 54 | Android/通知等资源 |
| `.lang` | 38 | 语言表，核心规则文案可读 |
| `.json` | 23 | 地图/模组索引，大多不是明文 |
| `.so` | 10 | libGDX 原生库 |
| `.dex` | 1 | Android Java/Kotlin 字节码 |
| `.bin` | 2 | `data.bin` 与 `assets/data.bin`，两者 SHA256 相同 |

可确认技术栈：

- APK 内含 `libgdx.so`、`libgdx-freetype.so`，游戏基于 libGDX。
- APK 内含 Rhino JavaScript 包 `org.mozilla.javascript.*`，战役逻辑由内置 JS 引擎驱动。
- `classes.dex` 中存在大量 Stage/Rule API 字符串，例如 `Stage.AsyncCreateUnit`、`Stage.SyncSetRecruitUnitsForTeam`、`Rule.SetIncomeVillage`。

二进制限制：

- `mods/*/*.js`、`mods/*/*.json`、`maps/*.aem` 不是明文。
- 对这些文件尝试了 zlib/gzip/bz2/lzma 直接解压，均未成功。
- 文件熵接近 8，判断为自定义打包、压缩或加密资源。
- 当前机器没有 `jadx`、`apktool`、`baksmali` 命令，因此本分析没有完成 Java 反编译，只基于明文语言表、dex 字符串和当前项目代码对照。

## 4. APK 确认的单位表

来自 `languages/zh.lang` 与 `languages/en.lang`：

| APK ID | 中文 | 英文 | 当前项目 key | 对比 |
| ---: | --- | --- | --- | --- |
| 0 | 战士 | Soldier | `soldier` | 项目显示名为“士兵”，规则上对应 |
| 1 | 弓箭手 | Archer | `archer` | 对应 |
| 2 | 水元素 | Aqua Elemental | `water_elemental` | 对应 |
| 3 | 女巫 | Sorceress | `witch` | 对应 |
| 4 | 精灵 | Spirit | `elf` | 对应，项目 key 用 `elf` |
| 5 | 狼 | Wolf | `wolf` | 对应 |
| 6 | 石头人 | Golem | `golem` | 对应 |
| 7 | 投石车 | Catapult | `catapult` | 对应 |
| 8 | 龙 | Dragon | `dragon` | 对应 |
| 9 | 指挥官 | Commander | `commander` | 对应 |
| 10 | 骷髅 | Skeleton | `skeleton` | 对应 |
| 11 | 水晶 | Crystal | `crystal` | 已加入不可招募占位单位，疑似战役目标单位 |
| 12 | 圣骑士 | Paladin | `paladin` | 对应 |
| 13 | 狂战士 | Berserker | `berserker` | 对应 |
| 14 | 幽灵 | Ghost | `ghost` | 对应 |
| 15 | 黑魔法师 | Black Mage | `dark_mage` | 对应 |
| 16 | 狼骑射手 | Wolfarcher | `wolf_archer` | 对应，项目显示名为“狼射手” |
| 17 | 冰元素 | Ice Elemental | `ice_elemental` | 对应 |
| 18 | 史莱姆 | Slime | `slime` | 对应 |
| 19 | 人鱼 | Mermaid | `mermaid` | 对应 |
| 20 | 德鲁伊 | Druid | `druid` | 对应 |

关键影响：

- 当前项目 `UnitClass` 没有保存 APK 原始数字 ID，且配置顺序和 APK ID 顺序不同。
- 后续若要解析 APK `.aem` 地图或战役脚本，必须建立 `apkUnitId <-> UnitClass` 映射。
- `Crystal` 在英文/中文基础说明里是 `<none>/<无>`，但战役语言文件大量出现护送/夺回水晶目标，说明它至少是战役目标对象。

## 5. APK 确认的能力规则

| APK ID | 能力 | 当前项目 key | APK 规则要点 | 项目状态 |
| ---: | --- | --- | --- | --- |
| 0 | 村庄捕获者 | `village_capturer` | 可占领村庄 | 已实现 |
| 1 | 城堡捕获者 | `castle_capturer` | 可占领城堡，不能被支援 | 已实现支援排除 |
| 2 | 修理者 | `repairer` | 可修复被破坏村庄 | 已实现 |
| 3 | 空军 | `flying` | 所有地形移动 1，可穿越地面单位，无地形防御，攻击水中单位 +10，对同能力无效 | 已实现 |
| 4 | 神射手 | `sharpshooter` | 攻击空军 +10 | 已实现 |
| 5 | 破坏者 | `destroyer` | 可破坏村庄，攻击村庄上单位 +10 | 已实现 |
| 6 | 召唤师 | `summoner` | 从墓碑召唤骷髅，摧毁墓碑不损失生命 | 已实现召唤；踩墓碑细节基本对应 |
| 7 | 治疗师 | `healer` | 治疗随等级上升，可突破目标最大血量 | 主动治疗已允许突破最大血量 |
| 8 | 投毒者 | `poisoner` | 攻击附加中毒，对同能力无效 | 已实现 |
| 9 | 亡灵 | `undead` | 死亡不留墓碑；友军治疗变伤害；踩墓碑/中毒变回血 | 大体实现，回血仍被最大血量夹住 |
| 10 | 近战大师 | `melee_master` | 近战伤害 +50% | 已实现 |
| 11 | 远程防御 | `ranged_defense` | 受远程攻击伤害 -50% | 已实现 |
| 12 | 水之子 | `water_child` | 水上攻防 +10，回合开始治疗，水面移动 1 | 已实现 |
| 13 | 森林之子 | `forest_child` | 森林攻防 +10，回合开始治疗，森林移动 1 | 已实现 |
| 14 | 山之子 | `mountain_child` | 山地攻防 +10，回合开始治疗，山地移动 1 | 已实现 |
| 15 | 战意 | `fighting_spirit` | 伤害不受当前血量影响 | 已实现 |
| 16 | 反击风暴 | `counter_storm` | 可反击 2 格内任何攻击，无论致盲与否 | 已实现 |
| 17 | 自我修复 | `self_repair` | 回合开始回复 25% 血量，不受中毒影响 | 已实现 |
| 18 | 攻击光环 | `attack_aura` | 待机时给 2 格内友军附加鼓舞状态 | 已改为正式 `inspired` 状态 |
| 19 | 净化光环 | `cleansing_aura` | 待机清除友军负面状态并少量治疗 | 已实现 |
| 20 | 虚弱光环 | `weakness_aura` | 待机给 2 格内敌军附加虚弱状态 | 已按 APK 数值实现 |
| 21 | 突击部队 | `assault_troop` | 行动完毕后可用剩余移动力再移动，不能被支援 | 已实现 |
| 22 | 大地之子 | `earth_child` | 陆地移动 1，水面移动额外 +1，桥也算水面 | 基本实现；桥/水地形映射需确认 |
| 23 | 致盲者 | `blinder` | 攻击附加致盲，对同能力无效 | 已实现 |
| 24 | 支援者 | `supporter` | 重置友军待机状态，不能支援同能力或更高等级单位 | 已实现，并额外排除城堡捕获者/突击部队 |
| 25 | 死亡收割者 | `death_reaper` | 攻击负面状态单位 +20 | 已实现 |

## 6. APK 确认的状态规则

APK 状态表：

| APK ID | 中文 | 英文 | APK 效果 | 当前项目 |
| ---: | --- | --- | --- | --- |
| 1 | 中毒 | Poisoned | 回合开始损失 10，无法接受治疗；亡灵中毒回血 | 已实现 |
| 2 | 鼓舞 | Inspired | 攻击 +10，远程攻击时加成减半 | 已实现正式状态 |
| 3 | 致盲 | Blinded | 射程降至 0 | 已实现 |
| 4 | 虚弱 | Weakened | 移动力降至 1，防御 -10，面对远程攻击时减半 | 已实现 |

APK Wiki 明确说明：

- 状态包括增益和减益。
- 单位同一时间只能拥有一种状态。
- 单位已经拥有一种状态时，不会被另一种状态替换。

这意味着 `鼓舞` 不应作为独立布尔字段与中毒、致盲、虚弱叠加。当前项目已移除 `attackAuraActive` 规则路径，攻击光环会尝试附加 `inspired` 状态；若目标已有状态，则不会替换。

## 7. APK 确认的经济、招募与行动规则

语言表确认：

- 城堡在回合开始产生收入。
- 村庄在回合开始产生收入，可被摧毁。
- 获取金币有两类来源：占领村庄/城堡，或保证指挥官存活。
- 轮到玩家回合时结算收入。
- 只有己方城堡可招募。
- 城堡上无单位时可招募；己方指挥官站在城堡上是例外。
- 招募时需要关注单位价格和人口占用。

语言表和模组目标文案确认的胜负条件：

- 教程关卡明确写有“失败条件：指挥官阵亡”。
- 教程第 3 关明确写有“胜利条件：消灭所有敌军并且夺取敌方城堡”。
- 沙盒模组目标文案写有“占领所有的敌军城堡”。
- 多个战役关卡把“摧毁所有敌军单位”和“占领所有城堡/敌方城堡”作为目标条件。

这些目标在 APK 中明显可以按关卡/模式配置，不应全部写成固定全局规则。对战训练环境应支持这些淘汰条件，但默认保持较通用的“无单位淘汰”。

dex 字符串确认或强烈暗示：

- 存在 `Cannot recruit when stacked!`、`Cannot end turn when stacked!`、`Cannot select when stacked!`、`Cannot surrender when stacked!`。
- 这说明官方规则中有“单位堆叠/待处理”的临时状态，会禁止继续招募、结束回合或选择其他对象。
- 当前项目新增的 `pendingUnitId` 与这个机制高度吻合。

仍需确认：

- APK 里“指挥官站城堡招募”之后，新单位的精确部署范围、是否消耗移动力、是否还可移动，目前只能通过 dex 字符串推断，尚未从脚本或反编译代码确认。
- APK 的单位上限、人口上限和关卡级可招募列表需要反编译或解码脚本确认。

## 8. APK 确认的战斗与地形规则

语言表确认的基础公式：

```text
最终伤害 = （攻击力 - 防御力） * 攻击者血量百分比
```

同时文案说明单位能力会继续修正最终伤害。

APK 规则中涉及的加成：

- 神射手攻击空军：攻击 +10。
- 空军攻击水中单位：攻击 +10，对同为空军目标无效。
- 破坏者攻击站在村庄上的单位：攻击 +10。
- 死亡收割者攻击负面状态单位：攻击 +20。
- 水/森林/山之子在对应地形：攻防 +10，并在回合开始治疗。
- 近战大师：近战伤害 +50%。
- 远程防御：受到远程攻击伤害 -50%。
- 鼓舞：攻击 +10，远程攻击时加成减半。
- 虚弱：防御 -10，面对远程攻击时减半。

当前项目伤害公式总体方向一致；空军对水中目标、鼓舞状态、虚弱数值和治疗师突破上限等第一批差异已修正。

## 9. APK dex 中可见的规则 API

`classes.dex` 中可见以下规则与关卡脚本 API 字符串：

| API/字符串 | 含义 |
| --- | --- |
| `Rule.SetIncomeVillage` | 配置村庄收入 |
| `Rule.SetIncomeCastle` | 配置城堡收入 |
| `Rule.SetIncomeCommanderBase` | 配置指挥官存活基础收入 |
| `Rule.SetIncomeCommanderGrowth` | 配置指挥官收入成长 |
| `Rule.SetLevelCap` | 配置等级上限 |
| `SetPrices` | 配置价格 |
| `Stage.SyncSetRecruitUnitsForTeam` | 配置某队可招募单位 |
| `Stage.SyncSetUnitLimitForTeam` | 配置某队单位上限 |
| `Stage.SyncSetUnitStatus` | 设置单位状态和回合数 |
| `Stage.SyncSetGoldForTeam` | 设置某队金币 |
| `Stage.AsyncCreateUnit` | 创建单位 |
| `Stage.AsyncSummon` | 召唤单位 |
| `Stage.AsyncReinforce` | 增援 |
| `Stage.CountCastle` / `CountVillage` / `CountUnit` | 关卡统计条件 |

这些 API 说明 APK 的关卡层并不是固定全局规则，至少经济、等级、价格、招募列表、单位上限都可以由脚本配置。当前训练环境如果只做通用 skirmish，可以先用固定规则；如果目标是复刻战役或读取 APK 地图，就必须引入场景配置层。

## 10. 与当前项目的一致项

当前项目已经实现并与 APK 规则方向一致的内容：

- 结构化动作与合法动作校验。
- 移动、攻击、反击、占领、修理、破坏村庄、治疗、召唤、支援、待机。
- 中毒、致盲、虚弱三类负面状态的互斥模型。
- 墓碑、亡灵死亡不留墓碑、亡灵被治疗伤害、亡灵中毒回血。
- 水/森林/山地地形子能力的移动、攻防和回合治疗。
- 飞行单位地形移动 1、不享受地形防御、可飞越非飞行敌军。
- 战意、反击风暴、自我修复、近战大师、远程防御、死亡收割者。
- 城堡招募拆分为 `recruit_to_castle` / `recruit_and_deploy`，并通过 `pendingUnitId` 限制后续动作。
- 空城堡招募到城堡本格，指挥官占城堡时招募并部署到可达空地。

## 11. 与当前项目的主要差异

### P0：规则语义差异

1. 鼓舞应是正式状态
   - APK：`Inspired` 是 `STATUS3_NAME_2`，并受“同一时间只能一种状态”约束。
   - 项目：已加入 `inspired`，攻击光环附加正式状态并遵守状态互斥。
   - 状态：已修正。

2. 虚弱数值不一致
   - APK：移动力降至 1，防御 -10，面对远程攻击时减半。
   - 项目：已按近战 -10、远程 -5 结算。
   - 状态：已修正。

3. 治疗不能突破最大血量
   - APK：治疗师治疗可以超过目标最大血量。
   - 项目：治疗师主动治疗已可超过 `maxHp`；净化、墓碑、回合回血仍保留上限。
   - 状态：主动治疗已修正，其他回血来源需继续确认。

4. 空军攻击水中目标 +10
   - APK：空军攻击水中单位获得 10 攻击加成，对同为空军目标无效。
   - 项目：已增加空军攻击水中非空军单位 +10。
   - 状态：已修正。

5. 水晶单位
   - APK：存在 `UNIT_NAME_11=Crystal`。
   - 项目：已加入不可招募占位单位 `crystal`，并建立 APK ID 映射。
   - 状态：已修正。

### P1：系统完整性差异

1. 人口/单位上限
   - APK：语言表有 `Unit Limit`，Wiki 提到单位价格和人口占用，dex 有 `SyncSetUnitLimitForTeam`。
   - 项目：已通过 `RuleConfig.teams[playerId].unitLimit/populationLimit` 接入招募合法性和执行阶段保护。
   - 状态：已实现配置层，APK 真实默认值待确认。

2. 指挥官收入未完整建模
   - APK：Wiki 明确“保证指挥官存活”产生金币，dex 有 `SetIncomeCommanderBase` 和 `SetIncomeCommanderGrowth`。
   - 项目：已支持 `incomeCommanderBase + level * incomeCommanderGrowth`。默认仍保持旧项目行为：基础收入 0，每级 +25。
   - 状态：配置层已实现，APK 真实默认值待确认。

3. 关卡级可招募单位列表
   - APK：dex 有 `SyncSetRecruitUnitsForTeam`。
   - 项目：已通过 `RuleConfig.teams[playerId].recruitableUnits` 限制合法招募动作。
   - 状态：已实现配置层。

4. 单位价格是可配置规则
   - APK：dex 有 `SetPrices`。
   - 项目：已通过 `RuleConfig.prices` 覆盖普通单位价格，并用于合法招募和实际扣费。
   - 状态：已实现配置层，APK 真实默认值待确认。

5. 等级上限是可配置规则
   - APK：dex 有 `SetLevelCap`。
   - 项目：已通过 `RuleConfig.levelCap` 控制经验升级上限，默认 3。
   - 状态：已实现配置层。

6. 胜负淘汰条件需要可配置
   - APK：教程确认“指挥官阵亡失败”；教程/沙盒/战役目标确认“消灭所有敌军”和“占领敌方/所有城堡”可作为目标。
   - 项目：已通过 `RuleConfig.defeatOnNoUnits/defeatOnCommanderDeath/defeatOnNoCastles` 接入可配置淘汰条件。
   - 状态：已实现配置层，默认仅启用无单位淘汰。

7. 地形映射仍需校准
   - APK：大地之子说明“桥也是水面地形”。
   - 项目：当前没有明确 `bridge` 地形；`isWaterTerrain` 包含 `deep_water`、`water_temple`、`island`，但 `island` 在 terrain tags 中又标为 land/special。

8. 招募待处理机制仍需与 APK 精确对齐
   - 项目当前方向与 dex `stacked` 字符串吻合。
   - 但 APK 对部署后剩余移动力、是否可继续移动、UI 选择状态的精确行为仍需反编译或运行 APK 实测。

### P2：战役/脚本层差异

APK dex 还暴露了当前项目未建模的脚本能力：

- 队伍联盟、禁用/恢复队伍、直接改变金币。
- 改变单位阵营、等级、头像、状态、静态/目标标记。
- 增援、搬运单位/旗帜、神圣裁决、地图聚焦。
- 战役目标统计：单位、城堡、村庄数量。

这些对 AI 训练的基础 skirmish 不一定是第一优先级，但如果目标是让 demo 与实际应用游戏完全一致，后续需要建立“规则引擎 + 场景脚本适配层”的边界。

## 12. 建议后续实现顺序

1. 建立 APK 兼容 ID 映射
   - 新增独立映射表：`apkUnitId -> UnitClass`、`apkAbilityId -> Ability`、`apkStatusId -> StatusType`。
   - 保留 `crystal` 占位单位，即使暂不允许招募。
   - 状态：已完成，见 `src/game/apk_compat.ts`。

2. 修正状态系统
   - 把 `inspired` 加入 `StatusType`。
   - 攻击光环改为给友军附加 `inspired` 状态。
   - 所有状态附加都遵守“已有状态不替换”。
   - 状态：已完成。

3. 修正战斗数值差异
   - 虚弱改为近战防御 -10，远程防御 -5。
   - 增加空军攻击水中非空军目标 +10。
   - 保留现有神射手、破坏者、死亡收割者等加成。
   - 状态：已完成。

4. 修正治疗上限
   - 治疗师主动治疗允许超过目标最大血量。
   - 是否所有治疗来源都可突破上限，需要进一步确认；APK 文案只明确“治疗师的治疗”。
   - 需要确认超过最大血量后是否在待机或回合开始被压回最大血量。
   - 状态：主动治疗已完成，其余待确认。

5. 加入人口/单位上限和可招募列表
   - 招募合法性同时检查金币、单位上限、人口占用、当前关卡允许招募集合。
   - 在 `GameState.rules` 和独立 `RuleConfig` 查询模块中加入这些配置。
   - 状态：已完成。

6. 完善指挥官经济与死亡规则
   - 支持指挥官基础收入和等级成长收入。
   - 指挥官死亡、复活、后续招募费用 +100 等规则需要结合旧资料和 APK 进一步确认。
   - 状态：基础收入/成长收入、死亡计数、可配置重招募价格增长已完成；官方复活流程和默认值仍待确认。

7. 加入可配置胜负条件
   - 支持无单位淘汰、指挥官阵亡淘汰、无城堡淘汰。
   - 默认保留当前无单位淘汰，避免把战役目标强行写成所有对战的全局规则。
   - 状态：已完成。

8. 继续 APK 深入分析
   - 优先安装/使用 `jadx` 或 `apktool` 反编译 `classes.dex`。
   - 找出资源解码逻辑，解码 `.aem`、`.js`、`.json`。
   - 从战役脚本中提取真实价格、收入、单位上限、可招募列表和关卡特殊规则。

## 13. 当前可信度分级

| 结论类型 | 可信度 | 来源 |
| --- | --- | --- |
| 单位/能力/状态名称与描述 | 高 | 明文 `zh.lang/en.lang` |
| 状态互斥、战斗公式、招募基础规则 | 高 | 明文 Wiki 文案 |
| `pendingUnitId` 与 APK stacked 机制同方向 | 中高 | dex 错误字符串 |
| 价格、人口、收入具体数值 | 中低 | 项目旧资料与当前代码，APK 未解码确认 |
| 战役脚本特殊规则 | 低 | 资源存在但二进制未解码 |
| 指挥官死亡/复活完整规则 | 低 | 当前 APK 文本不足，需要反编译或实测 |

## 14. 对“demo 与实际应用游戏一致”的判断

如果目标只是训练一个稳定的战棋规则环境，当前根目录规则引擎已经具备继续训练前的基础。本轮已优先修正 P0 规则语义差异，并补齐对应测试。

如果目标是让 demo 与 APK 4.2.5.1 的实际游戏规则尽量一致，则还需要：

1. 继续解码或反编译 APK 资源，确认真实数值和战役脚本规则。
2. 用 APK 实测或反编译结果校准招募后的 stacked/pending 细节。
3. 在规则引擎中补齐官方指挥官复活流程、初始金币配置和价格默认值等仍未落地的对战规则。

当前最值得继续落地的代码任务是：初始金币配置、官方指挥官复活流程，以及用 APK 实测或反编译结果校准招募 pending 细节。

## 15. 实现记录

2026-06-29 第一批 APK 明确规则已落地：

- 新增 `src/game/apk_compat.ts`：记录 APK 单位、状态、能力 ID 映射。
- `StatusType` 新增 `inspired`，攻击光环附加鼓舞状态，不再使用独立攻击光环布尔字段。
- 鼓舞攻击加成按距离结算：近战 +10，远程 +5。
- 虚弱防御惩罚按距离结算：近战 -10，远程 -5；移动力仍降至 1。
- 空军攻击水中非空军单位 +10；攻击同为空军目标不触发。
- 治疗师主动治疗可超过目标最大血量；非治疗师来源回复仍保持最大血量上限。
- 新增不可招募 `crystal` 单位，用于承接 APK 第 11 号水晶目标。
- 验证：`npm test` 160 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 第二批 APK 配置层规则已落地：

- 新增 `src/game/rule_config.ts`：集中提供默认规则、队伍规则、招募合法性、人口统计和地形收入查询。
- `GameState.rules` 新增 `RuleConfig`，支持 `incomeVillage`、`incomeCastle`、`incomeCommanderBase`、`incomeCommanderGrowth`、`levelCap` 和队伍级 `unitLimit/populationLimit/recruitableUnits`。
- 招募合法动作生成和招募执行阶段均检查金币、可招募列表、单位数量上限和人口上限。
- 回合收入改为配置驱动：城镇/城堡收入和指挥官基础/成长收入均可覆盖。
- 经验升级改为 `RuleConfig.levelCap` 控制，默认仍为 3 级上限。
- 验证：`npm test` 166 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 第三批 APK 配置层规则已落地：

- `RuleConfig.prices` 支持按单位覆盖价格，合法招募和实际扣费使用同一价格查询。
- `RuleConfig.commanderRecruitBaseCost/commanderRecruitCostGrowth` 支持在配置开启后按死亡次数递增指挥官重招募费用；默认禁用，避免把未确认 APK 默认值写死。
- 单位死亡清理时会记录指挥官死亡次数；如果玩家仍有其他单位，不会仅因指挥官死亡立即淘汰。
- 指挥官仍只能在场上没有己方存活指挥官时重招募，避免多指挥官。
- 验证：`npm test` 169 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 第四批 APK 对战目标规则已落地：

- `RuleConfig.defeatOnNoUnits` 支持无单位淘汰，默认启用，保持现有行为。
- `RuleConfig.defeatOnCommanderDeath` 支持指挥官阵亡淘汰，对应 APK 教程失败条件文案。
- `RuleConfig.defeatOnNoCastles` 支持无己方城堡淘汰，对应 APK 沙盒/教程目标文案中的占领敌方城堡目标。
- 胜负判断会忽略 `hp <= 0` 的待清理单位，避免死亡但尚未过滤的单位影响淘汰条件。
- 验证：`npm test` 171 个测试通过，`npm run lint` 通过，`npm run build` 通过。
