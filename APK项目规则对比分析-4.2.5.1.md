# APK 项目规则对比分析：aer-release-4.2.5.1

分析日期：2026-06-29

## 1. 范围与约束

本报告分析对象：

- APK：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
- SHA256：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
- 解包目录：`C:\code\AncinetEmpires\APK\_analysis\unpack`
- 项目规则代码：`src/game`

本报告记录 APK 与项目规则对比；本轮继续把已确认的 skirmish 模式规则和 AEM 尾部模板识别落地到 `src/game`，未修改 `demo`。

## 2. 总体结论

当前项目已经覆盖 APK 4.2.5.1 的主要 skirmish 对战规则骨架：21 个单位、26 个能力、4 个状态、核心伤害公式、城堡/城镇收入、招募限制、指挥官收入、多队伍/联盟、单位上限、可招募列表、价格覆盖和 skirmish 默认终局条件。

仍未完全对齐的是“战役脚本层和低可信资源语义”：APK 有 84 条地形 tile 变体、90 个 `.aem` 地图资源、27 个可解密 `.js` 脚本以及大量异步剧情/目标 API。项目目前已归档 84 条地形基础数据，并为 skirmish 训练导入建立了单独的 tile 近似映射；20 张内置 skirmish `.aem` 已能转为 `GameState`，并可按 SD/SO 模式应用默认终局和 SO 的 APK ID 0-8 可招募限制。但 `.aem` 尾部 58 字节模板语义、低可信治疗建筑/水中建筑分类和战役特殊脚本仍未完全还原。

如果目标是 AI 训练用的 skirmish 规则，当前项目已经接近可用；如果目标是“demo 和 APK 实际游戏完全一致”，还需要继续补齐地形映射、地图导入、脚本配置归档和战役目标/剧情 API。

## 3. APK 证据来源

| 来源 | 观察结果 | 对规则恢复的意义 |
| --- | --- | --- |
| `assets/languages/zh.lang` / `en.lang` | 明文包含 21 个单位名、26 个能力名、4 个状态名、状态/地形/战斗/招募说明 | 可确认单位、能力、状态、公式和基础交互 |
| `assets/data.bin` | 自定义 magic `365703`，含 DES key；已解析 21 条单位数据和 84 条地形 tile 数据 | 可确认单位数值、成长、人口、地形防御/回血/移动 |
| `assets/maps/*.aem` | 20 张内置 skirmish 地图可解密解析 | 可确认地图尺寸、玩家 ID、初始单位、建筑归属、推荐金币；推荐金币后固定 58 字节尾部暂不能证明为玩家/联盟配置 |
| `assets/mods/**/*.js` | 27 个脚本可解密，出现大量 `Stage.*` 调用 | 可确认关卡配置能力、目标判断和 skirmish 控制逻辑 |
| `classes.dex` 字符串 | 暴露 `Stage.*`、`Rule.*`、`Cannot ... when stacked!` 等字符串 | 可确认官方引擎有待处理/堆叠状态、脚本配置 API |

## 4. APK 资源结构摘要

已解包资源中和规则直接相关的内容：

- `.aem`：90 个地图/关卡地图资源，其中根目录 `assets/maps` 有 20 张 skirmish 地图。
- `.js`：55 个脚本文件；其中 `mods` 下 27 个脚本已可用 `data.bin` 的 DES key 解密。
- `.lang`：38 个语言表，核心规则文案明文可读。
- `data.bin`：单位与地形基础规则数据。
- `classes.dex`：包含 libGDX、Rhino JavaScript 运行时和 Stage/Rule API 字符串。

加密资源使用 `DES/CBC/PKCS5Padding`，key 与 IV 相同；当前已能解密 `.aem/.js/.json` 这一类资源。

## 5. 项目当前覆盖情况

| 规则域 | APK 规则证据 | 项目当前实现 | 对齐状态 |
| --- | --- | --- | --- |
| 单位 | 语言表与 `data.bin` 确认 APK ID 0-20 | `src/game/units.ts` 已有 21 个 `UnitClass`，含不可招募 `crystal` | 基础对齐 |
| APK ID 映射 | APK 单位/状态/能力均以数字 ID 出现 | `src/game/apk_compat.ts` 提供单位、状态、能力映射 | 已对齐 |
| 能力 | 26 个能力名和说明 | `src/game/types.ts` 与 `abilities.ts` 已建模 26 个能力 | 基础对齐 |
| 状态 | 中毒、鼓舞、致盲、虚弱 | `StatusType` 包含 4 个状态；状态不叠加 | 已对齐 |
| 伤害公式 | 语言表说明“攻击-防御后乘血量比例”，能力继续修正 | `rules.ts` 按血量比例、地形防御、能力加成计算 | 大体对齐 |
| 地形 | `data.bin` 有 84 条 tile 定义 | 项目有 17 个抽象地形；高可信映射 4 个，另有 skirmish 训练导入近似映射；APK 导入地图优先使用原始 tile 的移动/防御/回血数值 | skirmish 数值更接近 APK，完整贴图/类别语义仍待校准 |
| 收入 | 城堡/村庄/指挥官存活收入 | `RuleConfig` 支持城镇、城堡、指挥官基础和成长收入 | 配置能力已对齐 |
| 招募 | 城堡空置可招募；己方指挥官站城堡例外 | `recruit_to_castle` / `recruit_and_deploy` 和 `pendingUnitId` 已实现 | 基础对齐，细节待实测 |
| 投降 | DEX 存在 `Cannot surrender when stacked!`，确认有投降入口且受 stacked 限制 | `RuleConfig.allowSurrender` + `surrender` 动作已实现；APK skirmish 默认开启，pending 时不生成 | 规则入口已对齐，菜单 UI 细节待实测 |
| 上限/价格 | DEX 暴露单位上限、价格和招募列表 API | `RuleConfig` 支持单位上限、人口上限、价格覆盖、可招募列表 | 配置能力已对齐 |
| skirmish 终局/模式 | `SD/SO controller.js` 使用 `CountUnit == 0 && CountCastle == 0` 淘汰队伍；`SO` 调用 `SyncSetRecruitUnits(0..8)` | 默认 `defeatOnNoUnitsAndNoCastles = true`；`apk_skirmish.ts` 可按 SD/SO 生成规则配置 | 已对齐 |
| 战役目标 | 脚本使用 `SyncGameOver`、计数、指挥官检查、城堡检查等 | 只实现基础 Stage 查询/同步适配 | 部分对齐 |
| skirmish 地图导入 | 20 张 `assets/maps/*.aem` | `parseApkAemMap` + `createApkSkirmishGameState` 可生成训练用 `GameState`，并保留 AEM 尾部原始模板、每格 APK 原始 tile 信息和地图级元数据；官方 manifest 已固化作者、开局单位、城堡/城镇归属和完整 tile 使用量，并用于防止同名外部地图被误标 | 基础导入已完成 |
| 多队伍/联盟 | APK 有 3/4 人地图和 `SyncSetAlliance` | 项目支持多队伍轮转、联盟、禁用队伍 | 基础对齐 |
| 指挥官 | 脚本 API 有 `SyncSetCommander`、`CheckCommander`、`GetCommander` | 项目支持脚本指定指挥官和指挥官死亡计数；Observation 输出 `commanderUnitId/isCommander` | 基础对齐，复活流程未知 |

## 6. 单位、状态与能力对比

APK 语言表确认单位 ID 0-20：

| APK ID | APK 名称 | 项目 key | 状态 |
| ---: | --- | --- | --- |
| 0 | 战士 / Soldier | `soldier` | 已实现 |
| 1 | 弓箭手 / Archer | `archer` | 已实现 |
| 2 | 水元素 / Aqua Elemental | `water_elemental` | 已实现 |
| 3 | 女巫 / Sorceress | `witch` | 已实现 |
| 4 | 精灵 / Spirit | `elf` | 已实现，项目 key 使用 `elf` |
| 5 | 狼 / Wolf | `wolf` | 已实现 |
| 6 | 石头人 / Golem | `golem` | 已实现 |
| 7 | 投石车 / Catapult | `catapult` | 已实现 |
| 8 | 龙 / Dragon | `dragon` | 已实现 |
| 9 | 指挥官 / Commander | `commander` | 已实现 |
| 10 | 骷髅 / Skeleton | `skeleton` | 已实现，不作为普通招募 |
| 11 | 水晶 / Crystal | `crystal` | 已有占位，战役目标行为未完整实现 |
| 12-20 | 圣骑士、狂战士、幽灵、黑魔法师、狼骑射手、冰元素、史莱姆、人鱼、德鲁伊 | 对应项目 key | 已实现 |

APK 状态 ID 与项目状态：

| APK ID | 状态 | APK 说明 | 项目状态 |
| ---: | --- | --- | --- |
| 1 | 中毒 | 回合开始损失 10，不能治疗；亡灵转为回血 | 已实现 |
| 2 | 鼓舞 | 攻击 +10，远程减半 | 已实现为 `inspired` |
| 3 | 致盲 | 射程降为 0 | 已实现 |
| 4 | 虚弱 | 移动力降为 1，防御 -10，远程减半 | 已实现 |

项目已将能力、状态和单位 ID 映射集中在 `apk_compat.ts`，这是后续读取 APK 地图和脚本配置的必要基础。

## 7. 战斗规则对比

已对齐的 APK 战斗规则：

- 伤害按攻击、防御、地形防御和攻击者血量比例计算。
- 召唤师摧毁/踩掉墓碑不会损失生命值；普通非亡灵单位踩墓碑扣 10，亡灵踩墓碑回血 10。
- 神射手攻击空军 +10。
- 空军攻击水中非空军单位 +10；同为空军时不触发。
- 破坏者攻击站在村庄上的单位 +10。
- 死亡收割者攻击负面状态单位 +20。
- 近战大师近战伤害乘 1.5。
- 远程防御受到远程攻击时伤害减半。
- 战意单位伤害不受当前血量比例影响。
- 鼓舞和虚弱按 APK 文案处理。
- 攻击光环、净化光环、虚弱光环按 APK 文案限定为待机触发；攻击、治疗、支援、占领等非待机动作不会触发光环。
- 自我修复单位在回合开始恢复 25% 最大生命；即使先被中毒扣到 0 以下，也会先执行自我修复，回复后仍不大于 0 才死亡。
- 单位等级移动成长会进入合法移动范围；例如 `moveGrowth=1` 的指挥官 1 级后可使用 5 点移动力。

仍需确认的细节：

- 治疗师主动治疗可突破最大血量，项目已实现为“已超上限仍可继续治疗”；但 APK 是否在后续回合把超上限血量压回最大血量，需要实测或反编译确认。
- 亡灵从墓碑/中毒获得的回血目前仍受最大血量限制；APK 文案没有明确是否可突破。
- 反击、突击后移动和 pending/stacked 状态的 UI 层行为仍缺 APK 实测；投降动作已按 DEX 字符串接入规则层，但菜单确认流程仍待实机确认。

## 8. 经济、招募和上限规则对比

APK 语言表确认：

- 村庄和城堡在回合开始产生收入。
- 指挥官存活也是金币来源。
- 招募只能在己方城堡进行。
- 城堡上没有单位时可招募，己方指挥官站在城堡上是例外。
- 招募需要关注单位价格和占用人口。

DEX 与脚本确认：

- DEX 暴露 `Stage.SyncSetGold`、`Stage.SyncSetGoldForTeam`、`Stage.SyncSetUnitLimit`、`Stage.SyncSetUnitLimitForTeam`、`Stage.SyncSetRecruitUnits`、`Stage.SyncSetRecruitUnitsForTeam`。
- DEX 暴露 `Rule.SetIncomeVillage`、`Rule.SetIncomeCastle`、`Rule.SetIncomeCommanderBase`、`Rule.SetIncomeCommanderGrowth`、`Rule.SetLevelCap`、`Rule.SetPrices`。
- 已解密脚本中 `Stage.SyncSetUnitLimit` 出现 25 次，`Stage.SyncSetGold` 出现 16 次，`Stage.SyncSetRecruitUnits` 出现 13 次，`Stage.SyncSetRecruitUnitsForTeam` 出现 14 次。

项目当前状态：

- `RuleConfig` 已支持初始金币、队伍初始金币、城镇收入、城堡收入、指挥官收入、等级上限、价格覆盖、单位上限、人口上限、全局/队伍可招募列表。
- `apk_rule.ts` 和 `apk_stage.ts` 已提供一批 APK API 适配函数。
- 缺口不是“配置表达能力”，而是还没有把所有 APK 关卡脚本参数系统化归档并转为项目场景配置。

## 9. skirmish 地图与终局规则

已解析 20 张内置 skirmish 地图：

| 类型 | 数量 | 观察 |
| --- | ---: | --- |
| 2 人图 | 8 | 初始单位多数为双方指挥官；`Swamplands` 额外有 4 个战士 |
| 3 人图 | 4 | 玩家 ID 有 `0,1,2` 或 `0,2,3` |
| 4 人图 | 8 | 玩家 ID 为 `0,1,2,3` |
| 地图尾部 | 20/20 | 推荐金币后均还有固定 58 字节尾部；20 张根目录 skirmish 地图完全相同，不随玩家数量、队伍 ID、单位或金币变化 |

推荐金币已解析：

- 有值：50、150、200、250、300 等。
- 无值：部分地图为 `-1`，项目侧应保留 `null`，不要强行写成 0。

尾部模板复核：

- 20 张根目录 skirmish `.aem` 的尾部长度均为 58 字节，模板均为 `zero_suffix_58`。
- 全部可按当前结构解析的 42 个 `.aem` 里，`zero_suffix_58` 出现 34 次，`ff_suffix_58` 出现 8 次；另有 3 个战役地图因单位块格式特殊暂未解析。
- 由于根目录 skirmish 地图的尾部完全一致，不能据此推导 2/3/4 人地图的联盟、玩家颜色或阵营预设。当前应把它记录为“固定尾部模板，语义未确认”。
- 代码侧 `parseApkAemMap` 已保留尾部原始字节、十六进制和模板名，供后续继续比对；当前不会把尾部写入联盟或队伍规则。

skirmish 控制脚本结论：

- `SD/controller.js` 与 `SO/controller.js` 的队伍摧毁逻辑为：某队同时没有单位且没有城堡时才 `SyncDestroyTeam`。
- 若被摧毁队伍是当前队伍且游戏尚未结束，SD/SO 脚本会调用 `Stage.AsyncNextTurn()` 交给下一存活队伍；项目引擎已在结算后自动跳过失活当前玩家。
- `SO/controller.js` 在开局调用 `SyncSetRecruitUnits(0,1,2,3,4,5,6,7,8)`，即 AEII skirmish 默认只招募 APK ID 0-8 的基础单位。
- 当前项目默认 `defeatOnNoUnitsAndNoCastles = true`，`createApkSkirmishGameState` 可按 `SD/SO` 模式生成训练状态；`SO` 模式会写入 APK ID 0-8 对应的 9 个基础可招募单位。

## 10. 地形与地图导入差异

APK `data.bin` 已确认有 84 条 tile 定义；项目目前只有 17 个抽象地形。二者不是一一对应关系，APK 的 tile 更像“规则类型 + 贴图变体 + 关联 tile”的组合。

当前高可信映射：

| APK tile | 项目地形 | 依据 |
| ---: | --- | --- |
| `t27` | `damaged_town` | 防御 10、无回血、关联 `t36`，符合废墟/可修复村庄 |
| `t36` | `town` | 防御 15、回血 20、关联摧毁后 `t27`，符合村庄 |
| `t37` | `castle` | 防御 15、回血 20，符合城堡 |
| `t72` | `bridge` | 移动 1、无防御/回血；语言表说明桥也按水面处理 |

20 张 skirmish 地图中的高可信 tile 使用量：

| APK tile | 总使用量 |
| ---: | ---: |
| `t27` | 23 |
| `t36` | 201 |
| `t37` | 81 |
| `t72` | 0 |

本轮进展：

- `SKIRMISH_APK_TERRAIN_TO_PROJECT` 已把 skirmish 实际使用的 APK tile 归并到项目地形。
- `createGameStateFromApkAemMap` 已能生成训练用 `GameState`，默认使用推荐金币；推荐金币为 `-1` 时为 0，可由外部配置覆盖。
- APK 导入地图的 `Tile` 会保留 `apkTerrainId/apkTerrainRaw/apkOwnerCode`；移动消耗、防御加成和回合回血优先读取 APK `data.bin` 的原始 tile 数值。
- AI 训练 Observation 已输出 `apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence/defenseBonus/healPerTurn/moveCost`，让策略能看到当前规则实际使用的地形数值和 tile 语义映射可信度。
- APK AEM 导入会在 `GameState.metadata` 和 `observation.metadata` 中输出 `source/apkMapName/apkSkirmishMode/recommendedGold/apkTailTemplate`，用于训练样本追踪和复现实验配置。
- `src/game/apk_skirmish_tile_usage.ts` 已固化 20 张官方 skirmish 地图的逐图 APK tile 使用量；按当前 skirmish 映射，20 张图均无未映射 tile。
- Observation 也会输出单位级 `apkUnitId/apkUnitExtra/apkUnitCode/apkStatic/apkTargeted/apkUnitHead` 和 `apkScriptState.booleans/integers`，避免训练侧丢失 APK 初始单位记录和脚本目标判断状态。
- 真实 20 张 skirmish 地图的单位 `extra` 字段全部为 `0`，当前仅作为原始证据字段保留，不参与等级或规则推断。
- 使用真实 APK 的 20 张 skirmish 地图验证，导入结果为 `IMPORTED 20 / 20`；本轮进一步确认 `TILES_WITH_APK_ID 4207/4207`，可读移动集合 `1,2,3,16777215`、防御集合 `0,5,10,15`、回血集合 `0,3,20`。

风险点：

- `t72` 是桥候选，但当前 20 张 skirmish 地图中没有使用它；桥更多出现在战役或其他地图。
- skirmish 映射是训练导入近似，不等同于完整官方 tile 语义。
- `t30/t31/t80-t83` 等治疗建筑/水中建筑的净化、可占领、回血边界仍需实测或反编译确认。

## 11. 脚本 API 与项目适配差异

已解密 27 个 `mods/**/*.js` 脚本，常见 API 统计：

| API | 出现次数 | 项目状态 |
| --- | ---: | --- |
| `Stage.AsyncMessage` | 187 | 未实现，属于剧情/UI 层 |
| `Stage.CreateReinforcement` | 162 | 未实现，属于战役增援层 |
| `Stage.SyncGameOver` | 83 | 已有基础适配 |
| `Stage.SyncSetUnitLevel` | 35 | 已有基础适配 |
| `Stage.CountUnit` | 25 | 已有基础适配 |
| `Stage.SyncSetUnitLimit` | 25 | 已有基础适配 |
| `Stage.SyncSetGold` | 16 | 已有基础适配 |
| `Stage.SyncSetRecruitUnitsForTeam` | 14 | 已有基础适配 |
| `Stage.SyncSetRecruitUnits` | 13 | 已有基础适配 |
| `Stage.SyncSetAlliance` | 12 | 已有基础适配 |
| `Stage.CountCastle` | 12 | 已有基础适配 |
| `Stage.CheckCastle` / `CheckVillage` / `GetTileTeam` | DEX 暴露 | 已有坐标查询适配 |
| `Stage.SyncSetUnitCode` / `GetUnit` / `GetUnits` | 脚本实际调用 | 已有 code 元数据和单位查询适配 |
| `Stage.SyncSetUnitStatic*` / `SyncSetUnitTargeted*` | 脚本实际调用 | 已有 static/targeted 元数据适配；静态单位不生成合法动作 |
| `Stage.SyncSetUnitHead` | API 统计出现 6 次 | 已有 `apkUnitHead` 元数据适配；不影响对战结算 |
| `Stage.SyncOverrideMov` | DEX 暴露并校验 unit code、tile type、mov | 已有 `apkMoveOverrides`，按 APK tile ID/kind 覆盖指定单位移动消耗 |
| `Stage.PutBoolean` / `GetBoolean` / `PutInteger` / `GetInteger` | 脚本实际调用 | 已有脚本变量基础适配 |
| `Stage.GetDistance` | 脚本实际调用 | 已有曼哈顿距离查询适配 |
| `Stage.SyncSetCommander` | 2 | 已有基础适配，但参数语义仍需反编译校准 |

项目目前适配的是“同步规则配置/查询”部分；其中坐标级建筑/归属查询已覆盖 `CheckCastle`、`CheckVillage`、`GetTileTeam`，单位 code/查询已覆盖 `SyncSetUnitCode`、`GetUnit`、`GetUnits`，单位 static/targeted/head 标记已有基础适配，脚本变量和距离查询已有基础适配。大量 `Async*` API 仍属于剧情表现、增援动画、单位移动演出、地图聚焦、消息弹窗和目标展示，不应混入纯规则引擎，需要独立脚本/场景层。

新增 `src/game/apk_script_manifest.ts` 后，27 个已解密脚本的 API 计数和可直接提取的字面量规则配置已有代码化记录。当前归档确认：金币配置出现 300/400/450/500/600/800；单位上限出现 10/15/20/25/30/40/50/60；全局可招募列表有 6 种组合，队伍级可招募列表有 13 种组合；联盟、禁用队伍和 `rule.SetIncome*` 收入覆盖已有分布表。`APK_SCRIPT_LITERAL_RULE_CONFIGS` 进一步按资源路径记录 26 个脚本的逐脚本字面量配置；动态参数和剧情触发仍未转为逐关卡场景配置。

## 12. 明确未完成的差异

| 优先级 | 差异 | 影响 |
| --- | --- | --- |
| P0 | 低可信 APK tile 语义未校准 | skirmish 可运行，但部分地形分类可能偏离官方 |
| P0 | `.aem` 尾部 58 字节模板语义未确认 | 当前没有证据表明 skirmish 依赖该尾部表达联盟；仍需反编译或更多地图格式样本确认 |
| P1 | `ApkAemMap -> GameState` 仍缺完整场景配置 | SD/SO 基础模式入口和地图级元数据已完成；战役、特殊脚本和非 skirmish 模式仍需独立场景层 |
| P1 | 脚本字面量配置已归档，动态逐关卡配置仍未转场景表 | 战役和特殊 skirmish 规则无法批量复现 |
| P1 | 指挥官复活/重招募官方默认流程未知 | 指挥官模式可能和 APK 有差异 |
| P1 | stacked/pending 的部署后移动细节未知 | 城堡招募体验和 APK UI 行为可能不完全一致 |
| P2 | `Async*` 剧情/演出 API 未实现 | 影响战役复刻，不影响基础 AI 训练 |
| P2 | 水晶目标和完整目标 UI 未实现 | 影响战役目标与剧情单位；单位 code/static/targeted/head/move override 已作为基础元数据适配 |

## 13. 建议后续任务

1. 先完成 skirmish 地图导入所需的地形映射。
   - 对 20 张 skirmish 地图实际使用的 tile 做优先级排序。
   - 结合 `data.bin` 的防御、回血、移动、kind、variant、linked 字段和贴图资源确认映射。
   - 对无法确认的 tile 保留“低可信/待确认”标记，避免误写成高可信规则。

2. 继续确认 `.aem` 尾部 58 字节模板语义。
   - 当前 20 张 skirmish 地图尾部完全一致，暂不应把它作为玩家/联盟预设。
   - 下一步应结合反编译字段名、编辑器保存格式或更多特殊地图样本确认该模板用途。

3. 增加 APK skirmish 地图导入文档或数据表。
   - 尺寸、玩家、推荐金币、初始单位、城堡/城镇归属、tile 使用量和未映射 tile 清单已进入官方 manifest。
   - 后续围绕这份数据表补充 tile 语义校准证据，而不是重复解包统计。
   - 明确记录尾部模板为原始字节，不参与联盟或队伍配置推断。
   - 已有代码入口为 `createApkSkirmishGameState`；后续数据表应围绕该入口补足校准证据。

4. 系统归档脚本配置。
   - 已提取并代码化 API 计数、金币/单位上限/招募/联盟/禁用队伍/收入覆盖的字面量分布，以及 26 个脚本的逐脚本字面量表。
   - 下一步按关卡输出配置表，处理动态参数，并继续区分“规则配置”“目标判断”“剧情演出”三类。

5. 针对 APK 实机或反编译补测高风险细节。
   - 指挥官死亡后是否可复活、复活价格默认值。
   - 招募 pending 状态下新单位部署、移动力和行动结束的精确行为。
   - 治疗突破最大血量后的后续裁剪规则。

## 14. 对当前项目的判断

当前项目适合作为“APK skirmish 规则训练环境”的基础，但还不应宣称已经完整复刻 APK 4.2.5.1。规则引擎层已经补齐大多数核心机制；真实 skirmish 地图导入已保留 APK 原始 tile 数值。剩余主要工作在地形贴图/类别语义校准、尾部模板语义和脚本配置归档。

建议下一步继续做“地形映射校准与 skirmish 地图数据表”，把每张地图实际使用的 APK tile、项目地形、原始数值和可信度归档，减少后续反复解包确认。
