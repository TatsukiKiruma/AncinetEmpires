# APK 规则分析与项目对比：aer-release-4.2.5.1

分析日期：2026-06-29

## 1. 分析范围

分析对象：

- APK：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
- SHA256：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
- 解包目录：`C:\code\AncinetEmpires\APK\_analysis\unpack`

对比对象：

- 当前项目规则代码：`src/game`
- 当前项目规则文档：`README.md`、`远古帝国AI训练规则整理.md`、`远古帝国AI训练项目上下文.md`

后续实现记录见第 15 节，代码侧已逐步接入已确认规则；本轮继续补充 APK 脚本字面量配置到项目 `RuleConfig` 的静态生成入口。

## 2. 结论摘要

APK 资源能确认一批核心规则：单位、能力、状态、招募、收入、战斗公式、地形加成、墓碑、亡灵、支援、光环等。当前项目实现已经覆盖大多数核心战棋动作，并且最近加入的 `pendingUnitId` 招募待处理机制，与 APK dex 字符串中的 `Cannot ... when stacked!` 高度吻合。

本轮已按 APK 明文规则修正以下差异：

1. `鼓舞 / Inspired` 已加入正式状态系统，攻击光环会附加鼓舞状态，并遵守“已有状态不替换”。
2. `虚弱 / Weakened` 已改为移动力降至 1，近战防御 -10，远程攻击时防御惩罚减半。
3. 治疗师主动治疗已允许突破目标最大血量；其他地形/光环/墓碑/亡灵中毒回复仍保留最大血量上限，且不会把既有超上限生命压回最大生命；升级回满血时也不会裁剪既有超上限生命。
4. 空军攻击水中非空军单位已增加攻击 +10；目标同为空军时不触发。
5. 已加入 APK 第 11 号 `水晶 / Crystal` 占位单位，并新增 APK 单位/状态/能力 ID 映射。
6. skirmish 默认队伍摧毁条件已改为“无单位且无城堡”，并保留单独无单位/无城堡/指挥官阵亡作为可配置目标条件。
7. AEM 解析器已保留推荐金币后的尾部模板；SD/SO skirmish 模式已有独立入口，SO 模式按脚本限制 APK ID 0-8 可招募单位。
8. 已新增 `src/game/apk_script_config.ts`，可把 26 个脚本的安全字面量配置生成项目 `RuleConfig`，覆盖金币、收入、单位上限、招募列表、联盟和禁用队伍。
9. APK 导入地图的每个格子已保留原始 `apkTerrainId`，移动、防御和回合回血优先使用 `data.bin` 的 tile 数值。

仍未完成的关键差异：

1. APK 明确存在多项可配置规则；项目已接入初始金币、单位上限、人口上限、可招募列表、收入、价格覆盖、等级上限、联盟配置、多队伍回合轮转和禁用队伍配置；静态字面量脚本配置已可生成 `RuleConfig`，动态参数和剧情触发仍需场景层处理。
2. 指挥官死亡计数和重招募费用增长已有配置支持；官方复活流程和默认费用仍需反编译或实测确认。
3. APK 资源中的 `data.bin` 已解密并提取单位/地形基础数据，`.aem/.js/.json` 也已确认可用同一 DES key 解密；skirmish `.aem` 头部、队伍 ID、地形矩阵、初始单位、推荐金币和尾部模板已结构化，完整地形 ID 映射、尾部 58 字节业务语义和战役特殊规则仍未完全转为项目配置。

### 2.1 当前复核与覆盖结论

本轮重新校验了 APK 文件、解包目录、`classes.dex` 字符串、语言表和当前 `src/game` 规则实现。当前对齐状态如下：

| 规则域 | APK 证据 | 项目当前状态 | 仍需补齐 |
| --- | --- | --- | --- |
| 单位/能力/状态 | `zh.lang/en.lang`、`data.bin`、DEX 常量 | 21 个单位、26 个能力、4 个状态已建模；`crystal` 作为不可招募占位；APK ID 映射已存在；APK 单位 code/static/targeted/head 元数据已有基础适配 | `crystal` 的完整战役目标系统仍需脚本层建模 |
| 战斗数值 | Wiki 文案和 `data.bin` 数值 | 伤害公式、血量比例、空军对水中单位、鼓舞、虚弱、地形之子、近战大师、远程防御等已接入 | 治疗超过上限后的长期裁剪规则仍需实测 |
| 经济/招募 | `Rule.SetIncome*`、`SetPrices`、`Stage.SyncSetGold*`、`Stage.SyncSetRecruitUnits*`、`Stage.SyncSetUnitLimit*` | `RuleConfig`、`apk_rule.ts`、`apk_stage.ts` 已提供配置入口；`apk_script_config.ts` 可把安全字面量配置生成项目规则；招募检查覆盖金币、价格、人口、单位上限、可招募列表 | 动态脚本参数和剧情触发仍需场景层执行/归档 |
| 回合/联盟/队伍 | `SyncSetCurrentTeam`、`SyncSetAlliance`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncDestroyTeam`、`SyncGameOver` | 多队伍轮转、联盟关系、禁用/恢复/销毁队伍和强制终局已有基础适配 | 仍缺完整战役脚本执行器和地图/队伍初始化导入 |
| 指挥官 | `CheckCommander`、`GetCommander`、`SyncSetCommander`、指挥官收入文案 | 已支持队伍级 `commanderUnitIds`，`SyncSetCommander` 可按坐标把己方单位指定为指挥官；收入、死亡计数、重招募和指挥官阵亡淘汰使用同一模型 | APK 方法表显示 `SyncSetCommander(int team, int index)`，但错误字符串是坐标语义；当前按坐标落地，官方复活流程仍未确认 |
| 地图/地形 | `data.bin` 84 条地形定义、`.aem` 地图资源、桥为水面文案 | 项目地形标签化，已加入 `bridge` 并按水面处理；`apk_map.ts` 已可读取 skirmish `.aem` 头部、队伍 ID、地形矩阵、初始单位、推荐金币、尾部模板和原始 tile ID；APK 导入地图的移动/防御/回血优先使用 `data.bin` 数值；`apk_skirmish.ts` 可按 SD/SO 导入 | 84 条 APK tile 的贴图/类别语义和尾部 58 字节业务语义仍需校准 |
| 战役脚本 | Rhino、`.js/.json/.aem`、大量 `Stage.*` API | 已有部分 Stage/Rule 同步适配函数和统计查询函数；单位 code/static/targeted/head 可写入状态，静态单位不生成合法动作 | 异步剧情动作、完整目标系统、水晶目标等仍未落地 |

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

资源解码状态：

- `data.bin` 开头包含自定义序列化 magic `365703`，随后保存 8 字节 DES key；后续 payload 使用 `DES/CBC/PKCS5Padding`，key 与 IV 相同。
- `mods/*/*.js`、`mods/*/*.json`、`maps/*.aem` 初始不是明文，直接尝试 zlib/gzip/bz2/lzma 均失败；使用 `data.bin` key 后已确认可以解密。
- `.js` 脚本已能提取 `Stage.SyncSetGold`、`Stage.SyncSetUnitLimit`、`Stage.SyncSetRecruitUnits` 等关卡配置调用。
- `.aem` 地图已确认顶层结构包含宽高、作者、队伍、地形、单位和推荐金币；推荐金币后的 58 字节固定尾部有两种模板，当前不能证明其为玩家或联盟预设。完整地形 ID 到项目地形类型的映射仍需继续校准。
- 当前机器没有 `jadx`、`apktool`、`baksmali` 命令，因此还没有完成完整 Java 反编译；DEX 字符串和方法表只用于确认可见 API 与少量短方法行为。

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

### 4.1 data.bin 单位基础数值

`data.bin` 解密后包含 21 条 `Lc/a/b/a/v/c` 单位定义。已确认字段公式：

2026-06-30 起，`data.bin` 单位数值复核已固化为 `tools/apk_unit_report.ts`，可通过以下命令重复验证：

```bash
npm run apk:unit-report -- --check
```

当前命令输出确认：`APK/_analysis/unpack/data.bin` 中 21/21 条单位记录可解析，单位 section marker 为 8，section magic 为 `365703`；和 `src/game/units.ts` 的战斗数值、成长、射程、人口、能力 ID 对比后，项目单位配置差异为 0。报告将指挥官/骷髅/水晶的 `UnitConfig.cost=null`、水晶项目移动力 0 记录为刻意差异；其中指挥官 raw cost 为 400，由 `RuleConfig.commanderRecruitBaseCost` 表达。该工具本轮校准出黑魔法师 APK 射程为 `1-2`，项目已同步修正。

- 价格：`a`；人口：`b`；攻击元素：`c`，项目中按 `0=physical`、`1=magic` 映射。
- 元素防御修正：`d`。APK 伤害公式中，攻击元素等于防守方元素时防御 `+d`，不同时防御 `-d`。
- 攻击：`e + g * level`；防御基值：`h + i * level`；最大生命：`j + k * level`；最大移动：`l + m * level`。
- 射程：`n-o`；能力列表：`p`。

下表的物防/魔防是按 APK 元素公式推导出的项目双防等价值：

| APK ID | 项目 key | 价格 | 人口 | 攻击类型 | 攻击 | 物防 | 魔防 | 生命成长 | 移动成长 | 射程 | 能力 ID |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 0 | `soldier` | 150 | 1 | physical | 55 | 5 | 5 | 100+0/Lv | 4+0/Lv | 1-1 | 0,2 |
| 1 | `archer` | 250 | 1 | physical | 45 | 5 | 5 | 100+0/Lv | 4+0/Lv | 2-3 | 4 |
| 2 | `water_elemental` | 300 | 1 | physical | 60 | 15 | 15 | 100+0/Lv | 4+0/Lv | 1-1 | 12 |
| 3 | `witch` | 400 | 2 | magic | 45 | 0 | 40 | 100+0/Lv | 4+0/Lv | 1-2 | 6 |
| 4 | `elf` | 500 | 2 | magic | 55 | 20 | 30 | 100+0/Lv | 4+0/Lv | 1-2 | 3,13,19 |
| 5 | `wolf` | 600 | 3 | physical | 75 | 20 | 10 | 100+0/Lv | 6+0/Lv | 1-1 | 8,21,22 |
| 6 | `golem` | 600 | 3 | physical | 55 | 30 | 10 | 100+25/Lv | 5+0/Lv | 1-1 | 11,14,20 |
| 7 | `catapult` | 800 | 4 | physical | 60 | 5 | 5 | 100+0/Lv | 3+0/Lv | 3-5 | 5 |
| 8 | `dragon` | 1000 | 5 | magic | 70 | 25 | 25 | 100+0/Lv | 6+0/Lv | 1-2 | 3,10,11,21 |
| 9 | `commander` | 400 | 0 | physical | 60 | 20 | 20 | 100+0/Lv | 4+1/Lv | 1-1 | 0,1,2 |
| 10 | `skeleton` | 0 | 0 | physical | 40 | 5 | 5 | 100+0/Lv | 3+0/Lv | 1-1 | 8,9 |
| 11 | `crystal` | 0 | 0 | magic | 0 | 0 | 0 | 100+0/Lv | 4+0/Lv | 0-0 | - |
| 12 | `paladin` | 400 | 2 | physical | 50 | 10 | 10 | 100+0/Lv | 4+0/Lv | 1-1 | 0,7 |
| 13 | `berserker` | 500 | 2 | physical | 70 | 20 | 10 | 100+0/Lv | 5+0/Lv | 1-1 | 15,16,22 |
| 14 | `ghost` | 200 | 1 | magic | 50 | 5 | 15 | 100+0/Lv | 4+1/Lv | 1-1 | 3,9,25 |
| 15 | `dark_mage` | 300 | 1 | magic | 50 | 0 | 20 | 100+0/Lv | 4+0/Lv | 1-2 | 23 |
| 16 | `wolf_archer` | 800 | 4 | physical | 60 | 20 | 10 | 100+0/Lv | 6+0/Lv | 1-3 | 4,13,21,23 |
| 17 | `ice_elemental` | 600 | 3 | magic | 55 | 10 | 20 | 100+10/Lv | 4+0/Lv | 1-3 | 12,17 |
| 18 | `slime` | 250 | 1 | magic | 50 | 40 | -10 | 100+5/Lv | 4+0/Lv | 1-1 | 17 |
| 19 | `mermaid` | 200 | 1 | physical | 40 | 0 | 0 | 100+0/Lv | 4+0/Lv | 1-2 | 0,2,12 |
| 20 | `druid` | 600 | 3 | magic | 40 | 0 | 30 | 100+0/Lv | 4+1/Lv | 1-2 | 18,22,24 |

注意：

- `skeleton/crystal` 虽有价格字段，但 APK 单位定义中的 `q=false`，项目仍默认不把它们作为普通可招募单位。用户实机确认 SD skirmish 在本方无存活指挥官时可招募指挥官；项目通过 `commanderRecruitBaseCost=400` 和 SD 招募列表单独开启。
- `crystal` 在 data.bin 中移动为 4，但战役脚本会配合 `SyncSetUnitTargetedWithCode`、`SyncOverrideMov`、`SyncSetUnitStaticWithCode` 等接口控制目标单位行为；项目当前保留不可招募占位，并已把 static/targeted 作为脚本元数据接入，仍不把它当普通可招募作战单位处理。

## 5. APK 确认的能力规则

| APK ID | 能力 | 当前项目 key | APK 规则要点 | 项目状态 |
| ---: | --- | --- | --- | --- |
| 0 | 村庄捕获者 | `village_capturer` | 可占领村庄 | 已实现 |
| 1 | 城堡捕获者 | `castle_capturer` | 可占领城堡，不能被支援 | 已实现支援排除 |
| 2 | 修理者 | `repairer` | 可修复被破坏村庄 | 已实现 |
| 3 | 空军 | `flying` | 所有地形移动 1，可穿越地面单位，无地形防御，攻击水中单位 +10，对同能力无效 | 已实现 |
| 4 | 神射手 | `sharpshooter` | 攻击空军 +10 | 已实现 |
| 5 | 破坏者 | `destroyer` | 可破坏村庄，攻击村庄上单位 +10 | 已实现 |
| 6 | 召唤师 | `summoner` | 从墓碑召唤骷髅，摧毁墓碑不损失生命 | 已实现召唤；踩墓碑/摧毁墓碑不扣血 |
| 7 | 治疗师 | `healer` | 治疗随等级上升，可突破目标最大血量 | 主动治疗已允许突破最大血量 |
| 8 | 投毒者 | `poisoner` | 攻击附加中毒，对同能力无效 | 已实现 |
| 9 | 亡灵 | `undead` | 死亡不留墓碑；友军治疗变伤害；踩墓碑/中毒变回血 | 大体实现；回血不突破最大生命且不压低既有超上限生命；被治疗转伤害也会占用本回合被治疗次数 |
| 10 | 近战大师 | `melee_master` | 近战伤害 +50% | 已实现 |
| 11 | 远程防御 | `ranged_defense` | 受远程攻击伤害 -50% | 已实现 |
| 12 | 水之子 | `water_child` | 水上攻防 +10，回合开始治疗，水面移动 1 | 已实现 |
| 13 | 森林之子 | `forest_child` | 森林攻防 +10，回合开始治疗，森林移动 1 | 已实现 |
| 14 | 山之子 | `mountain_child` | 山地攻防 +10，回合开始治疗，山地移动 1 | 已实现 |
| 15 | 战意 | `fighting_spirit` | 伤害不受当前血量影响 | 已实现 |
| 16 | 反击风暴 | `counter_storm` | 可反击 2 格内任何攻击，无论致盲与否 | 已实现 |
| 17 | 自我修复 | `self_repair` | 回合开始回复 25% 血量，不受中毒影响；低血量单位被中毒扣到 0 以下时仍先执行该回复，回复后仍不大于 0 才死亡 | 已实现 |
| 18 | 攻击光环 | `attack_aura` | 待机时给 2 格内友军附加鼓舞状态 | 已改为正式 `inspired` 状态，且只在 `wait` 时触发 |
| 19 | 净化光环 | `cleansing_aura` | 待机清除友军负面状态并少量治疗 | 已实现，且只在 `wait` 时触发 |
| 20 | 虚弱光环 | `weakness_aura` | 待机给 2 格内敌军附加虚弱状态 | 已按 APK 数值实现，且只在 `wait` 时触发 |
| 21 | 突击部队 | `assault_troop` | 行动完毕后可用剩余移动力再移动，不能被支援 | 已实现 |
| 22 | 大地之子 | `earth_child` | 陆地移动 1，水面移动额外 +1，桥也算水面 | 基本实现；桥/水地形映射需确认 |
| 23 | 致盲者 | `blinder` | 攻击附加致盲，对同能力无效 | 已实现 |
| 24 | 支援者 | `supporter` | 重置友军待机状态，不能支援同能力或更高等级单位 | 已实现，并额外排除城堡捕获者/突击部队；支援后同步重置目标有效剩余移动力 |
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
- 解密 `APK\_analysis\unpack\assets\mods\SD\controller.js` 和 `SO\controller.js` 后确认，skirmish 模式的 `ValidateTeamState(team)` 使用 `Stage.CountUnit(team)` 与 `Stage.CountCastle(team)`，只有两者都为 0 时才调用 `Stage.SyncDestroyTeam(team)`。
- `SO\controller.js` 的 `OnGameStart` 额外调用 `Stage.SyncSetRecruitUnits(0, 1, 2, 3, 4, 5, 6, 7, 8)`，说明 AEII skirmish 模式会限制全局可招募单位为 APK ID 0-8。

这些目标在 APK 中明显可以按关卡/模式配置，不应全部写成固定全局规则。对战训练环境应支持这些淘汰条件；默认 skirmish 语义应是“同时无单位且无城堡淘汰”，单独“无单位淘汰”“无城堡淘汰”“指挥官阵亡淘汰”保留为配置项。

dex 字符串确认或强烈暗示：

- 存在 `Cannot recruit when stacked!`、`Cannot end turn when stacked!`、`Cannot select when stacked!`、`Cannot surrender when stacked!`。
- 这说明官方规则中有“单位堆叠/待处理”的临时状态，会禁止继续招募或选择其他对象；结束回合/投降限制需要区分 pending 来源。
- 2026-06-30 用户实机确认：空城堡招募后必须先控制新单位，不能控制其它单位或继续招募，但可以选择结束回合或投降；己方指挥官站城堡招募后会出现指挥官与新单位堆叠，此时不能结束回合或投降。

仍需确认：

- APK 里“指挥官站城堡招募”之后，新单位的完整 UI 选择流程仍需更多实机样例或反编译确认；当前项目已固化训练规则需要的扣费、pending 来源、行动标记和合法动作集合。
- 指挥官重招募费用是否按死亡次数增长仍需实测；当前 data.bin 单位表确认指挥官基础价格字段为 400。

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

### 8.1 data.bin 地形基础数值

`data.bin` 解密明文在 magic `365703` 和版本/占位字段后，以 1 字节 `0x54` 表示 84 条 tile 定义。每条 tile 记录为 40 字节定长结构；当前可稳定解析的字段布局如下：

2026-06-30 起，`data.bin` 地形数值复核已固化为 `tools/apk_terrain_report.ts`，可通过以下命令重复验证：

```bash
npm run apk:terrain-report -- --check
```

当前命令输出确认：`APK/_analysis/unpack/data.bin` envelope magic 和解密后 magic 均为 `365703`，DES key/iv 为 `72 6b 00 00 00 00 46 46`，加密 payload 从 offset 17 开始；解密后地形记录为 84/84，记录长度为 40/40，和 `src/game/apk_terrain.ts` 的项目归档差异为 0。报告会同时输出防御、回血、移动消耗分布和 skirmish 映射可信度汇总；当前汇总为 confirmed=4、atlas=73、approximate=7、unmapped=0。

| 偏移 | 类型 | 字段名 | 说明 |
| ---: | --- | --- | --- |
| 0 | int32 | `kind` | 地形/贴图组别，业务名称仍需结合贴图和反编译校准 |
| 4 | int16 | `flagA` | 标志位，疑似可通行/陆地类标志之一 |
| 6 | int32 | `variant` | 贴图或规则变体 |
| 10 | int32 | `linkedA` | 关联 tile，语义待确认 |
| 14 | int32 | `defenseBonus` | 地形防御加成 |
| 18 | int32 | `healPerTurn` | 回合开始地形回血 |
| 22 | int32 | `moveCost` | 普通地面单位移动消耗 |
| 26 | byte | `flagB` | 建筑/特殊标志之一，语义待确认 |
| 27 | int32 | `linkedB` | 高可信：村庄 `t36` 指向废墟 `t27`，对应被摧毁后的 tile |
| 31 | int32 | `linkedC` | 高可信：废墟 `t27` 指向村庄 `t36`，对应修复后的 tile |

高可信映射：

| APK tile | 项目地形 | 依据 |
| ---: | --- | --- |
| `t27` | `damaged_town` | 防御 10、移动 1、`linkedC=36`，对应废墟可修复到村庄 |
| `t36` | `town` | 防御 15、回血 20、移动 1、`linkedB=27`，对应村庄可摧毁为废墟 |
| `t37` | `castle` | 防御 15、回血 20、移动 1、无摧毁链接，符合城堡文案 |
| `t72` | `bridge` | `kind=1` 与水面组一致，移动 1；结合“大地之子：桥也是水面地形”文案 |

skirmish 训练导入映射：

| APK tile 范围 | 项目地形 | 依据与可信度 |
| --- | --- | --- |
| `t0-t14`、`t38-t71` | `deep_water` | atlas 为水面/海岸变体，`data.bin` 多数为防御 0、移动 3；`t0/t1` 移动值特殊，导入后规则仍优先使用 APK 原始移动值，可信度中 |
| `t15-t16` | `forest` | atlas 为树木，防御 10、移动 2，可信度中高 |
| `t17` | `mountain` | atlas 为雪山，防御 15、移动 3，可信度中高 |
| `t18/t32/t34` | `snow` | atlas 为雪地，防御 5、移动 1，可信度中高 |
| `t19` | `hill` | 防御 10、移动 2，atlas 为起伏雪地/丘陵，可信度中 |
| `t20-t26`、`t73-t79` | `road` | atlas 为土路/岸边可通行陆地，防御 0、移动 1，可信度中 |
| `t28/t29/t72` | `bridge` | atlas 为桥/木桥或桥候选，移动 1；APK 文案明确桥算水面，可信度中 |
| `t30` | `camp` | atlas 为营地/帐篷，防御 10、回血 20、移动 1，可信度中 |
| `t31/t80` | `temple` | atlas 为神庙建筑，防御 10、回血 20、移动 1；`t31` 已实测确认回血并净化，`t80` 当前 AEM 未使用且净化语义仍待实测，可信度中低 |
| `t33` | `special_2` | 防御 20、移动 3；skirmish 未使用，可信度低 |
| `t35` | `special_3` | 防御 10、移动 1；skirmish 未使用，可信度低 |
| `t81/t82` | `deep_water` | atlas 为水面浮冰/礁石，防御 10、回血 0、移动 3；不应附加神庙净化语义，可信度中 |
| `t83` | `water_temple` | atlas 为水中平台/桥候选，防御 10、回血 20、移动 3；净化语义仍待实测，可信度低 |
| `t27/t36/t37` | `damaged_town/town/castle` | 沿用高可信映射 |

该映射已在 `src/game/apk_terrain.ts` 中单独命名为 `SKIRMISH_APK_TERRAIN_TO_PROJECT`，不会覆盖 `HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT`。`getSkirmishApkTerrainMappingInfo` 会给每个 APK tile 输出 `confirmed/atlas/approximate/unmapped` 可信度，其中 `confirmed` 表示语言表或高可信建筑/桥证据明确，`atlas` 表示依赖贴图和 skirmish 上下文，`approximate` 表示训练可用但建筑/净化等细节仍需实测。`src/game/apk_map.ts` 新增 `createGameStateFromApkAemMap` 后，20 张内置 skirmish `.aem` 已全部可导入为 `GameState`；推荐金币为 `-1` 的地图导入时金币为 0，仍可由外部规则配置覆盖。导入后的 `Tile` 会保留并维护当前 `apkTerrainId/apkTerrainRaw/apkOwnerCode`，规则层通过 `terrain_rules.ts` 优先使用 APK 当前 tile 的防御、移动和回血数值；水之子/森林之子/山之子/大地之子、空军打水中单位等地形分类也优先按 `apkTerrainId -> SKIRMISH_APK_TERRAIN_TO_PROJECT` 判断。项目 `terrainId` 主要负责占领/招募/收入等抽象语义，并作为缺少 APK 当前 tile 时的兜底。

完整基础数值表如下。`linked* = -1` 表示无关联；`moveCost=16777215` 的 `t0/t1` 属特殊/不可普通通行 tile，APK 导入地图会保留该原始移动值，避免普通地面单位把这类格子当成可正常通行深水。

| ID | kind | flagA | variant | linkedA | 防御 | 回血 | 移动 | flagB | linkedB | linkedC | 备注 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 0 | 0 | -1 | 0 | 0 | 3 | 16777215 | 255 | -1 | 0 |  |
| 1 | 0 | 0 | -1 | 0 | 0 | 3 | 16777215 | 255 | -1 | 0 |  |
| 2 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 3 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 4 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 5 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 6 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 7 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 8 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 9 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 10 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 11 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 12 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 13 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 14 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 15 | 1 | 1 | 2 | -1 | 10 | 0 | 2 | 0 | -1 | -1 |  |
| 16 | 2 | 1 | 2 | -1 | 10 | 0 | 2 | 0 | -1 | -1 |  |
| 17 | 2 | 1 | 1 | -1 | 15 | 0 | 3 | 0 | -1 | -1 |  |
| 18 | 3 | 1 | 0 | -1 | 5 | 0 | 1 | 0 | -1 | -1 |  |
| 19 | 0 | 1 | 1 | -1 | 10 | 0 | 2 | 0 | -1 | -1 |  |
| 20 | 3 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 21 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 22 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 23 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 24 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 25 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 26 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 27 | 4 | 1 | 4 | -1 | 10 | 0 | 1 | 0 | -1 | 36 | 废墟/损坏村庄 |
| 28 | 6 | 0 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 29 | 5 | 0 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 30 | 5 | 1 | 0 | -1 | 10 | 20 | 1 | 0 | -1 | -1 |  |
| 31 | 8 | 1 | 5 | -1 | 10 | 20 | 1 | 0 | -1 | -1 |  |
| 32 | 8 | 1 | 0 | -1 | 5 | 0 | 1 | 0 | -1 | -1 |  |
| 33 | 8 | 1 | 0 | -1 | 20 | 0 | 3 | 0 | -1 | -1 |  |
| 34 | 8 | 1 | 0 | -1 | 5 | 0 | 1 | 0 | -1 | -1 |  |
| 35 | 8 | 1 | 0 | -1 | 10 | 0 | 1 | 0 | -1 | -1 |  |
| 36 | 8 | 1 | 4 | -1 | 15 | 20 | 1 | 1 | 27 | -1 | 村庄 |
| 37 | 6 | 1 | 3 | 0 | 15 | 20 | 1 | 1 | -1 | -1 | 城堡 |
| 38 | 7 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 39 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 40 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 41 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 42 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 43 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 44 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 45 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 46 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 47 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 48 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 49 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 50 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 51 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 52 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 53 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 54 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 55 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 56 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 57 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 58 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 59 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 60 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 61 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 62 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 63 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 64 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 65 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 66 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 67 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 68 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 69 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 70 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 71 | 1 | 0 | 0 | -1 | 0 | 0 | 3 | 0 | -1 | -1 |  |
| 72 | 1 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 | 桥候选 |
| 73 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 74 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 75 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 76 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 77 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 78 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 79 | 4 | 1 | 0 | -1 | 0 | 0 | 1 | 0 | -1 | -1 |  |
| 80 | 4 | 1 | 5 | -1 | 10 | 20 | 1 | 0 | -1 | -1 |  |
| 81 | 8 | 0 | 1 | -1 | 10 | 0 | 3 | 0 | -1 | -1 |  |
| 82 | 3 | 0 | 1 | -1 | 10 | 0 | 3 | 0 | -1 | -1 |  |
| 83 | 3 | 0 | 5 | -1 | 10 | 20 | 3 | 0 | -1 | -1 |  |

### 8.2 skirmish `.aem` 地图头部与地形区

`.aem` 使用 `data.bin` 同一 DES key 解密后是自定义二进制。当前已确认并在 `src/game/apk_map.ts` 落地的结构如下：

| 偏移/字段 | 类型 | 说明 |
| --- | --- | --- |
| 0 | uint32 BE | magic `365703` |
| 8 | uint32 LE | 地图宽度 |
| 12 | byte | 地图高度 |
| 13 起 | nullable string | 作者字段；`00 00 len + ASCII + 4 byte 0` 表示有作者，`01 00 00 00 00` 表示无作者 |
| 作者字段后 | byte | 队伍数量 |
| 后续 | uint32 BE[] | 队伍 ID 列表 |
| 后续 | uint40 BE | 地形格数量，必须等于 `width * height` |
| 地形区 | 4 byte/格 | 每格大端整数，按列优先存储；`raw >>> 12` 为 APK tile ID，`raw & 0xff` 为归属码，`0..7` 表示队伍，`0xfe/0xff` 当前按中立处理 |
| 地形区后 | int32 LE + int32 LE | 单位块标记，当前 skirmish 均为 `0`；第二个值是单位字段数量，等于 `unitCount * 5` |
| 单位记录 | 20 byte/条，最后一条 17 byte | 字段为 `apkUnitId, teamId, extra, x, y`；前四项为 int32 LE，非最后记录的 `y` 为 int32 LE，最后记录的 `y` 只占 1 byte，之后直接接推荐金币 |
| 单位区后 | int32 BE | 推荐金币；`-1` 表示无推荐金币 |

本轮已把头部、地形矩阵、初始单位和推荐金币作为已确认格式接入。推荐金币之后每张 skirmish 地图还剩固定 58 字节；复核结果显示 20 张根目录 skirmish 地图全部是同一个 `zero_suffix_58` 模板，不随 2/3/4 人数量、队伍 ID、初始单位或推荐金币变化。因此当前不能把该尾部解释为玩家/联盟预设，只能记录为“固定尾部模板，语义未确认”。

2026-06-30 起，`tools/apk_map_report.ts` 已把 20 张官方 skirmish `.aem` 的解密、解析和 manifest 对比工具化。运行 `npm run apk:map-report -- --check` 会读取 `APK/_analysis/unpack/assets/maps/*.aem`，使用 DES/CBC/PKCS7 和 key/iv `72 6b 00 00 00 00 46 46` 解密后调用 `parseApkAemMap`，并确认 APK SHA256、地图结构、tile 使用量、推荐金币和尾部模板是否仍与项目清单一致。当前结果为 20/20 地图匹配、尾部模板 `zero_suffix_58=20`、非预期尾部 0、0 个 unmapped tile。

本轮复核与实现统计：

| 范围 | 可解析数量 | 尾部长度 | 模板分布 |
| --- | ---: | ---: | --- |
| 根目录 `assets/maps/*.aem` skirmish 地图 | 20 | 58 | `zero_suffix_58`: 20 |
| 全部可按当前结构解析的 `.aem` | 42 | 58 | `zero_suffix_58`: 34；`ff_suffix_58`: 8 |

另有 3 个战役 `.aem` 在当前解析器下出现 `unitValueCount = -256`，说明单位块可能有特殊格式，暂未纳入尾部模板结论。

代码侧 `parseApkAemMap` 已把尾部记录为 `tail.offset/tail.length/tail.hex/tail.bytes/tail.template`。该字段只保留证据，不参与联盟、玩家颜色或阵营推断；`apk:map-report -- --check` 会在当前 20 张 skirmish 图出现非 `zero_suffix_58` 尾部时失败。

20 张内置 skirmish 地图的头部、关键地形、初始单位和推荐金币如下。`N` 表示中立/无归属；城堡/城镇统计只统计 APK tile `t37/t36`。单位格式为 `team@x,y#apkUnitId`，当前 20 张图中 `#9` 为指挥官。

| 地图 | 尺寸 | 队伍 | 作者 | 城堡归属 | 城镇归属 | 单位 | 推荐金币 | 尾部剩余 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |
| `(2) Crossed swords.aem` | 11x18 | 0/1 | youxing | 0:1,1:1,N:2 | 0:2,1:4,N:4 | 1@4,12#9; 0@5,2#9 | 50 | 58 |
| `(2) Duel.aem` | 13x13 | 0/1 | youxing | 0:1,1:1 | 1:1,N:4 | 1@9,6#9; 0@4,4#9 | 200 | 58 |
| `(2) Icy Paths.aem` | 15x15 | 0/1 | - | 0:1,1:1,N:2 | 0:2,1:2,N:6 | 0@13,13#9; 1@1,1#9 | - | 58 |
| `(2) Liberty Port.aem` | 13x13 | 0/1 | - | 0:1,1:1,N:1 | N:9 | 0@1,1#9; 1@11,1#9 | - | 58 |
| `(2) Mourningstar.aem` | 11x11 | 0/1 | youxing | 0:1,1:1 | 0:1,1:2,N:5 | 0@2,8#9; 1@8,2#9 | 250 | 58 |
| `(2) Peak Island.aem` | 15x15 | 0/1 | youxing | 0:1,1:1 | 1:2,N:6 | 0@7,3#9; 1@7,11#9 | 300 | 58 |
| `(2) Swamplands.aem` | 10x10 | 0/1 | youxing | N:2 | 1:2,N:11 | 0@3,9#0; 1@6,0#0; 1@9,0#0; 0@2,6#9; 1@5,5#9; 0@0,9#0 | 50 | 58 |
| `(2) The Crossing.aem` | 15x10 | 0/1 | youxing | 0:1,1:1,N:2 | 1:3,N:3 | 0@4,5#9; 1@12,3#9 | 150 | 58 |
| `(3) Frozen fields.aem` | 15x12 | 0/1/2 | - | 0:1,1:1,2:1 | N:6 | 0@2,1#9; 1@7,10#9; 2@13,1#9 | - | 58 |
| `(3) Glu.aem` | 13x19 | 0/1/2 | - | 0:1,1:1,2:1,N:1 | N:6 | 0@3,4#9; 2@3,14#9; 1@9,8#9 | - | 58 |
| `(3) Midway.aem` | 17x12 | 0/1/2 | - | 0:1,1:1,2:1,N:3 | N:15 | 1@15,10#9; 0@1,10#9; 2@8,1#9 | - | 58 |
| `(3) classic 2.aem` | 17x12 | 0/2/3 | - | 0:1,2:1,3:1 | 0:2,2:2,3:3,N:2 | 0@15,9#9; 2@1,9#9; 3@8,2#9 | - | 58 |
| `(4) Critical mass.aem` | 15x15 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | 0:2,1:2,2:2,3:2,N:12 | 3@7,2#9; 1@12,7#9; 0@2,7#9; 2@7,12#9 | 50 | 58 |
| `(4) Crossroads.aem` | 11x19 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | 0:1,1:1,2:1,3:1 | 1@1,3#9; 2@9,3#9; 3@1,15#9; 0@9,15#9 | 200 | 58 |
| `(4) Shadowlands.aem` | 19x19 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1,N:6 | N:12 | 3@16,7#9; 0@9,1#9; 1@9,15#9; 2@2,7#9 | 150 | 58 |
| `(4) Solitude.aem` | 15x15 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | N:12 | 0@7,2#9; 3@12,7#9; 2@2,7#9; 1@7,12#9 | 50 | 58 |
| `(4) The Crucible.aem` | 19x19 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1,N:4 | N:12 | 0@3,6#9; 1@6,15#9; 2@12,3#9; 3@15,12#9 | 300 | 58 |
| `(4) Waterways.aem` | 15x15 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | N:8 | 0@3,2#9; 1@11,2#9; 3@12,12#9; 2@2,12#9 | 150 | 58 |
| `(4) Winterstorm.aem` | 13x13 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | N:12 | 3@6,0#9; 0@6,12#9; 2@12,6#9; 1@0,6#9 | 150 | 58 |
| `(4) classic 1.aem` | 16x15 | 0/1/2/3 | youxing | 0:1,1:1,2:1,3:1 | 0:2,1:2,2:2,3:2,N:8 | 3@3,13#9; 0@1,7#9; 2@14,7#9; 1@12,1#9 | 50 | 58 |

2026-06-29 复核真实 20 张 skirmish `.aem`：初始单位记录的 `extra` 字段全部为 `0`，出现的 APK 单位 ID 只有 `0`（士兵，仅 `(2) Swamplands.aem`）和 `9`（指挥官）。因此项目只保留 `apkUnitId/apkUnitExtra` 原始字段，不把 `extra` 解释为等级或其他规则。

## 9. APK dex 中可见的规则 API

`classes.dex` 中可见以下规则与关卡脚本 API 字符串：

2026-06-30 起，DEX 字符串表复核已固化为 `tools/apk_dex_report.ts`，可通过以下命令重复验证：

```bash
npm run apk:dex-report -- --check
```

当前命令输出确认：`APK/_analysis/unpack/classes.dex` 可解析出 26529 个字符串；`CheckCommander`、`GetCommander`、`SyncSetCommander`、`SetIncomeCommanderBase`、`SetIncomeCommanderGrowth`、`SetLevelCap`、`SetPrices`、`SyncSetGold`、`SyncSetRecruitUnits`、`SyncSetRecruitUnitsForTeam`、`SyncSetUnitLimit`、`Cannot recruit when stacked!` 和 `OnUnitRecruited` 等必要字符串均存在；按 `ReviveCommander/RespawnCommander/CommanderRevive/CommanderRespawn` 匹配的疑似指挥官复活 API 字符串为 0。该报告只证明 DEX 字符串层的可见证据，不等同于完整 Java 控制流反编译。

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
| `Stage.SyncSetRecruitUnits` | 配置通用可招募单位列表 |
| `Stage.SyncSetUnitLimit` | 配置通用单位上限 |
| `Stage.SyncSetGold` | 配置通用金币 |
| `Stage.SyncSetUnitStatus` | 按坐标设置单位状态和回合数 |
| `Stage.SyncSetGoldForTeam` | 设置某队金币 |
| `Stage.SyncChangeGold` | 改变指定队伍金币 |
| `Stage.SyncSetCurrentTeam` | 设置当前行动队伍 |
| `Stage.SyncSetAlliance` | 设置队伍联盟 |
| `Stage.SyncDisableTeam` / `SyncRestoreTeam` | 禁用/恢复指定队伍 |
| `Stage.SyncDestroyTeam` | 销毁指定队伍 |
| `Stage.SyncSetUnitLevel` | 按坐标设置单位等级，已在脚本中确认形态为 `x, y, level` |
| `Stage.SyncSetUnitCode` | 按坐标给单位设置脚本 code，已确认形态为 `x, y, code` |
| `Stage.AsyncCreateUnit` | 创建单位 |
| `Stage.AsyncSummon` | 召唤单位 |
| `Stage.AsyncReinforce` | 增援 |
| `Stage.CountCastle` / `CountVillage` / `CountUnit` | 关卡统计条件 |
| `Stage.CheckCastle` / `CheckVillage` / `GetTileTeam` | 按坐标检查建筑和地块归属，脚本使用 `x, y` 形态 |
| `Stage.GetUnit` / `GetUnits` | 按 code、`x, y` 坐标或队伍查询单位 |
| `Stage.PutBoolean` / `GetBoolean` | 脚本布尔变量读写，常带默认值 |
| `Stage.PutInteger` / `GetInteger` | 脚本整数变量读写，常带默认值 |
| `Stage.GetDistance` | 坐标曼哈顿距离查询，脚本使用 `x1, y1, x2, y2` 形态 |

这些 API 说明 APK 的关卡层并不是固定全局规则，至少经济、等级、价格、招募列表、单位上限都可以由脚本配置。当前训练环境如果只做通用 skirmish，可以先用固定规则；如果目标是复刻战役或读取 APK 地图，就必须引入场景配置层。

2026-06-29 已新增 `src/game/apk_script_manifest.ts`，把 27 个已解密 `assets/mods/**/*.js` 的 API 计数和可直接提取的字面量规则配置分布代码化。解密参数为 `DES/CBC/PKCS7`，key/IV 均为 `72 6b 00 00 00 00 46 46`。已归档的确切分布包括：

- `Stage.SyncSetGold` 字面量：300 出现 5 个脚本，400 出现 1 个，450 出现 1 个，500 出现 5 个，600 出现 1 个，800 出现 3 个。
- `Stage.SyncSetUnitLimit` 字面量：10 出现 5 个脚本，15 出现 6 个，20 出现 2 个，25 出现 1 个，30 出现 5 个，40 出现 1 个，50 出现 4 个，60 出现 1 个。
- `Stage.SyncSetRecruitUnits` 全局列表共有 6 种字面量组合；`0..8` 组合出现 6 个脚本。
- `Stage.SyncSetRecruitUnitsForTeam` 队伍级列表共有 13 种字面量组合，已按 `teamId + apkUnitIds + scriptCount` 记录。
- `Stage.SyncSetAlliance` 字面量确认队伍 0 可设为联盟 1，队伍 1/2/3/4/5 可设为联盟 2，队伍 5 也出现过联盟 5。
- `Stage.SyncDisableTeam` 字面量确认禁用队伍 1、3、4、5，其中队伍 1 出现 7 次、队伍 3 出现 4 次。
- `rule.SetIncome*` 字面量确认 7 个脚本把村庄/城堡/指挥官基础/指挥官成长收入全部设为 0；另有 1 个脚本把村庄收入设为 100。

该 manifest 不执行战役脚本，也不处理 `unit.GetMapX()` 等动态参数；动态配置仍需后续场景执行器或逐关卡解析处理。本轮进一步新增 `APK_SCRIPT_LITERAL_RULE_CONFIGS`，按 `resourcePath` 记录 26 个脚本的逐脚本字面量规则配置；`SD/controller.js` 只有动态队伍摧毁/胜负调用，没有可提取的固定规则字面量，因此不进入该表。

脚本签名复核还确认：`Stage.SyncSetUnitCode(x, y, code)`、`Stage.SyncSetUnitStatic(x, y, flag)`、`Stage.SyncSetUnitTargeted(x, y, flag)`、`Stage.SyncSetUnitHead(x, y, head)`、`Stage.GetTileTeam(x, y)`、`Stage.CheckCastle(x, y)`、`Stage.GetUnit(x, y)` 和 `Stage.GetDistance(x1, y1, x2, y2)` 均有真实调用。项目 `src/game/apk_stage.ts` 已兼容这些 `x, y` 坐标形态，同时保留内部 `Position` 参数形态。

2026-06-29 进一步新增 `src/game/apk_script_config.ts`，用于把上述逐脚本字面量配置安全转换为项目 `RuleConfig`：

- 支持转换 `SyncSetGold`、`SyncChangeGold`、`SyncSetUnitLimit`、`SyncSetRecruitUnits`、`SyncSetRecruitUnitsForTeam`、`SyncSetAlliance`、`SyncDisableTeam` 和 `rule.SetIncome*`。
- `SyncChangeGold(team, delta)` 仅在同一脚本已有静态 `SyncSetGold(value)` 时折算为队伍初始金币，例如 AEI/s5 的全局 800 金币和队伍 0 的 +100 会生成队伍 0 初始 900 金币。
- `SyncRestoreTeam` 与 `SyncGameOver` 属于生命周期/终局触发，不作为开局静态规则写入；转换结果会把这些调用列入 ignored lifecycle 证据。
- 仍不执行 `Async*` 剧情 API，也不把动态参数误转成固定规则；这些内容继续留给后续场景层。

补充 DEX 方法表解析结果：

| 类 | 方法签名 | 已确认含义 |
| --- | --- | --- |
| `Lc/a/b/a/o` | `CheckCommander(Unit) -> boolean` | 检查单位是否为指挥官 |
| `Lc/a/b/a/o` | `CheckCommander(Unit, int team) -> boolean` | 检查单位是否为指定队伍指挥官 |
| `Lc/a/b/a/o` | `GetCommander(int team) -> Unit` | 获取指定队伍指挥官 |
| `Lc/a/b/a/o` | `SyncSetCommander(int team, int index) -> void` | 脚本可设置某队指挥官 |
| `Lc/a/b/a/o` | `CheckGameOver() -> boolean` | 检查游戏是否结束 |
| `Lc/a/b/a/o` | `CheckTeamDestroyed(int team) -> boolean` | 检查队伍是否被摧毁 |
| `Lc/a/b/a/o` | `SyncGameOver(int alliance) -> void` | 脚本可触发游戏结束 |
| `Lc/a/b/a/o` | `SyncSetGoldForTeam(int team, int gold) -> void` | 设置指定队伍金币 |
| `Lc/a/b/a/o` | `SyncSetRecruitUnitsForTeam(int team, int[] units) -> void` | 设置指定队伍可招募单位 |
| `Lc/a/b/a/o` | `SyncSetUnitLimitForTeam(int team, int limit) -> void` | 设置指定队伍单位上限 |
| `Lc/a/b/a/x/e` | `SetIncomeCommanderBase(int)` / `SetIncomeCommanderGrowth(int)` | 设置指挥官收入规则 |
| `Lc/a/b/a/x/f` | `GetPrice() -> int` | 读取单位对象的价格字段；短方法字节码显示它直接读取 `Lc/a/b/a/x/f.e` |
| `Lc/a/b/a/t/f` | `a(int level) -> int` | 等级经验阈值公式：`level <= 0` 为 0，否则 `(level + 1) * 100 * level / 2` |
| `Lc/a/b/a/t/f` | `b(int exp) -> int` | 按经验反推等级，内部从 9 级向下检查，说明 APK 数据层至少支持 0-9 级 |

当前 DEX 字符串报告和方法表没有发现通用的 `ReviveCommander`、`RespawnCommander` 一类 API；此前只在战役剧情文本中见到 `revive Saeth`。因此“官方指挥官复活流程”和“死亡后重招募是否递增”仍不能当作已确认规则写死，只能保留为可配置/待确认项。

## 10. 与当前项目的一致项

当前项目已经实现并与 APK 规则方向一致的内容：

- 结构化动作与合法动作校验。
- 移动、攻击、反击、占领、修理、破坏村庄、治疗、召唤、支援、待机。
- 中毒、致盲、虚弱三类负面状态的互斥模型。
- 神庙类地形在回合开始清除负面状态，包含陆地神庙和水中神庙。
- 墓碑、亡灵死亡不留墓碑、亡灵被治疗伤害、亡灵中毒回血。
- 水/森林/山地地形子能力的移动、攻防和回合治疗。
- 飞行单位地形移动 1、不享受地形防御、可飞越非飞行敌军。
- 战意、反击风暴、自我修复、近战大师、远程防御、死亡收割者。
- 城堡招募拆分为 `recruit_to_castle` / `recruit_and_deploy`，并通过 `pendingUnitId` 限制后续动作。
- 空城堡招募到城堡本格，指挥官占城堡时招募并部署到可达空地。
- `RuleConfig` 已覆盖金币、收入、价格、等级上限、单位/人口上限、可招募列表、联盟、禁用队伍和可配置淘汰条件。
- `apk_rule.ts` / `apk_stage.ts` 已承接部分 APK 同步配置和查询 API，用于后续脚本配置导入。

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
   - 项目：治疗师主动治疗已可超过 `maxHp`；合法动作生成不再因为目标已经超出 `maxHp` 而隐藏治疗动作；净化、墓碑、回合回血仍保留上限，且不会把既有超上限生命压回最大生命；升级回满血时只保证至少达到当前最大生命，不会降低已有超上限生命。
   - 状态：主动治疗已修正；用户 2026-07-01 实机确认主动治疗可临时突破最大生命，下一己方回合开始若仍超过最大生命会先裁剪到上限，再结算地形等回血；升级仍不裁剪既有超上限生命。

4. 空军攻击水中目标 +10
   - APK：空军攻击水中单位获得 10 攻击加成，对同为空军目标无效。
   - 项目：已增加空军攻击水中非空军单位 +10。
   - 状态：已修正。

5. 水晶单位
   - APK：存在 `UNIT_NAME_11=Crystal`。
   - 项目：已加入不可招募占位单位 `crystal`，并建立 APK ID 映射。
   - 状态：已修正。

6. 神庙清除负面状态不应硬编码单一地形
   - APK：`APK\_analysis\unpack\assets\languages\zh.lang:330` / `en.lang:330` 的 `P_TILE_TEMPLE_DESCRIPTION` 表示神庙在回合开始清除负面状态，文案没有限定只能是陆地神庙。
   - 项目：已改为按地形 `cleanse` 标签触发清除；陆地神庙和水中神庙都带有该标签。
   - 状态：已修正。

### P1：系统完整性差异

1. 人口/单位上限
   - APK：语言表有 `Unit Limit`，Wiki 提到单位价格和人口占用，dex 有 `SyncSetUnitLimitForTeam`。
   - 项目：已通过 `RuleConfig.teams[playerId].unitLimit/populationLimit` 接入招募合法性和执行阶段保护。
   - 状态：已实现配置层，APK 真实默认值待确认。

2. 初始金币是队伍级可配置规则
   - APK：dex 有 `Stage.SyncSetGoldForTeam`。
   - 项目：已通过 `RuleConfig.teams[playerId].initialGold` 支持在创建初始状态时应用队伍初始金币。
   - 状态：已实现配置层，APK 真实默认值待确认。

3. 指挥官收入默认值仍需确认
   - APK：Wiki 明确“保证指挥官存活”产生金币，dex 有 `SetIncomeCommanderBase` 和 `SetIncomeCommanderGrowth`。
   - 项目：已支持 `incomeCommanderBase + level * incomeCommanderGrowth`，并能按脚本指定的队伍指挥官结算。默认仍保持旧项目行为：基础收入 0，每级 +25。
   - 状态：配置层已实现；`apk:skirmish-rule-report` 已门禁当前训练默认 `base=0/growth=25` 与 0/1/2 级收入结算，并记录语言表确认指挥官收入机制、SD/SO controller 未显式覆盖收入、战役脚本 7 处显式 `0/0` 的静态证据。APK 规则类未显式配置时的默认初始化值仍待继续确认。

4. 关卡级可招募单位列表
   - APK：dex 有 `SyncSetRecruitUnitsForTeam`。
   - 项目：已通过 `RuleConfig.teams[playerId].recruitableUnits` 限制合法招募动作。
   - 状态：已实现配置层。

5. 单位价格是可配置规则
   - APK：dex 有 `SetPrices`。
   - 项目：已通过 `RuleConfig.prices` 覆盖普通单位价格，并用于合法招募和实际扣费。
   - 状态：已实现配置层，APK 真实默认值待确认。

6. 等级上限是可配置规则
   - APK：dex 有 `SetLevelCap`。
   - APK：单位配置类的经验阈值公式确认 1/2/3 级分别是 100/300/600，且内部等级推导最高检查到 9。
   - 项目：已通过 `RuleConfig.levelCap` 控制经验升级上限，默认 3；配置允许扩展到 9。
   - 状态：已实现配置层和 APK 阈值公式。

7. 胜负淘汰条件需要可配置
   - APK：教程确认“指挥官阵亡失败”；教程/沙盒/战役目标确认“消灭所有敌军”和“占领敌方/所有城堡”可作为目标；SD/SO skirmish 脚本确认默认队伍摧毁条件是 `CountUnit == 0 && CountCastle == 0`。
   - 项目：已通过 `RuleConfig.defeatOnNoUnitsAndNoCastles/defeatOnNoUnits/defeatOnCommanderDeath/defeatOnNoCastles` 接入可配置淘汰条件。
   - 状态：已实现配置层；默认启用 skirmish 的“无单位且无城堡淘汰”，其它目标条件按脚本/训练配置开启。

8. 队伍联盟关系需要进入对战规则层
   - APK：语言表有 `Alliance` 和 `Set Alliance`，DEX 方法表有 `SyncGameOver(int alliance)`；`.aem` 推荐金币后的 58 字节尾部暂不能证明为联盟预设。
   - 项目：已通过 `RuleConfig.alliances` 接入队伍到联盟 ID 的映射；攻击、治疗、支援、光环、移动阻挡、友方建筑回血、胜负判断和 AI 终局奖励均按联盟关系处理。
   - 状态：已实现基础对战规则层。默认不配置时每队自成联盟，保持现有双人训练行为。

9. 多队伍回合与禁用队伍需要进入训练规则
   - APK：内置地图存在 3/4 人地图；DEX 字符串确认 `SyncSetCurrentTeam`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncDestroyTeam`。
   - 项目：结束回合不再硬编码 P0/P1，而是按存活且启用的队伍 ID 升序轮转；`RuleConfig.disabledTeams` 可配置跳过队伍。
   - 状态：已实现多队伍轮转，并在 `apk_stage.ts` 提供设置当前队伍、禁用/恢复/销毁队伍的同步适配；仍缺完整脚本执行器。

10. 地形映射仍需校准
   - APK：大地之子说明“桥也是水面地形”。
   - 项目：已加入 `bridge` 地形占位，并把地形能力判断改为基于 `water/mountain/forest/land` 标签；`bridge` 按 APK 文案归为水面地形。
   - 状态：桥的规则分类已落地；84 条 APK 地形定义到项目地形 ID 的完整映射仍需继续校准。

11. 招募待处理机制已按当前实机证据固化
   - 项目当前方向与 dex `stacked` 字符串吻合。
   - 2026-06-30 实机结果已固化为空城堡 pending 可结束回合/投降、指挥官城堡堆叠 pending 不可结束回合/投降；复核工具还检查招募扣费、pending 来源、行动标记和是否禁止继续招募/控制其它单位。
   - 剩余待确认项主要是 APK UI 选择流程和更多部署样例，不应再作为当前训练规则主干阻塞项。

12. 脚本指定指挥官已接入基础规则层
   - APK：DEX 暴露 `SyncSetCommander`，并有 `[Stage.SyncSetCommander] No unit at (`、`Unit at (` 等坐标相关错误字符串。
   - 项目：`RuleConfig.commanderUnitIds` 可记录队伍指挥官单位 ID；`SyncSetCommander` 按坐标把己方单位设为指挥官；`CheckCommander`/`GetCommander`、指挥官收入、死亡计数和指挥官阵亡失败均复用该模型。
   - 状态：基础对战规则已实现；APK 方法签名中的 `index` 与错误字符串中的坐标语义仍需更完整反编译校准。

### P2：战役/脚本层差异

APK dex 还暴露了当前项目未建模的脚本能力：

- `SyncSetCommander` 的参数细节校准，以及脚本指定指挥官与战役目标的边界行为。
- 改变单位阵营、单位头像、移动覆盖；单位代码、静态和目标标记已有基础状态适配，但还没有完整战役目标/UI 系统。
- 异步创建单位、增援、搬运单位/旗帜、神圣裁决、地图聚焦。
- 战役目标脚本、布尔/整数变量存取、剧情触发和关卡流程控制。

这些对 AI 训练的基础 skirmish 不一定是第一优先级，但如果目标是让 demo 与实际应用游戏完全一致，后续需要建立“规则引擎 + 场景脚本适配层”的边界。

## 12. 建议后续实现顺序

1. 建立 APK 兼容 ID 映射
   - 新增独立映射表：`apkUnitId -> UnitClass`、`apkAbilityId -> Ability`、`apkStatusId -> StatusType`。
   - 保留 `crystal` 占位单位，即使暂不允许招募。
   - 状态：已完成，见 `src/game/apk_compat.ts`。

2. 修正状态系统
   - 把 `inspired` 加入 `StatusType`。
   - 攻击光环改为给友军附加 `inspired` 状态。
   - APK 文案明确攻击光环、净化光环和虚弱光环均为“待机时”触发；项目已收窄为只有 `wait` 动作触发光环，攻击、治疗、支援、占领等非待机动作不再触发。
   - 所有状态附加都遵守“已有状态不替换”。
   - 状态：已完成。

3. 修正战斗数值差异
   - 虚弱改为近战防御 -10，远程防御 -5。
   - 增加空军攻击水中非空军目标 +10。
   - 保留现有神射手、破坏者、死亡收割者等加成。
   - 状态：已完成。

4. 修正治疗上限
   - 治疗师主动治疗允许超过目标最大血量，并且已超过最大血量的友军仍可继续作为治疗目标。
   - 是否所有治疗来源都可突破上限，需要进一步确认；APK 文案只明确“治疗师的治疗”。
   - 项目普通封顶回复不会把既有超上限生命压回最大生命；是否存在其它官方裁剪时机仍需实测。
   - 状态：主动治疗已完成，普通封顶回复不再裁剪既有超上限；其它回血来源是否可突破仍待确认。

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
   - 已确认 `.aem`、`.js`、`.json` 可用 `data.bin` 中的 DES key 解密；下一步应把解密结果结构化归档。
   - 从战役脚本中提取真实价格、收入、单位上限、可招募列表、联盟、目标条件和关卡特殊规则。

## 13. 当前可信度分级

| 结论类型 | 可信度 | 来源 |
| --- | --- | --- |
| 单位/能力/状态名称与描述 | 高 | 明文 `zh.lang/en.lang` |
| 状态互斥、战斗公式、招募基础规则 | 高 | 明文 Wiki 文案 |
| `pendingUnitId` 与 APK stacked 机制同方向 | 中高 | dex 错误字符串 |
| 单位价格、人口、攻击、防御、生命、移动、射程和成长 | 高 | 已解密 `data.bin` 的 21 条单位定义 |
| 地形基础防御、移动、回复字段 | 中高 | 已解密 `data.bin` 的 84 条地形定义，项目地形类别映射仍需校准 |
| 收入、初始金币、单位上限、可招募列表的脚本配置能力 | 中高 | DEX API 与已解密 `.js` 脚本调用 |
| APK 各模式/关卡的默认经济数值 | 中 | 脚本已可读，但还没有完成全量关卡归档和项目映射 |
| 战役脚本特殊规则 | 中 | 脚本可解密，语义提取和引擎适配尚未完成 |
| 指挥官指定、游戏结束和队伍摧毁 API 存在 | 中高 | DEX 方法表解析 |
| 指挥官死亡/复活完整规则 | 低 | 当前 APK 文本和方法表未发现通用复活 API，需要反编译或实测 |

## 14. 对“demo 与实际应用游戏一致”的判断

如果目标只是训练一个稳定的战棋规则环境，当前根目录规则引擎已经具备继续训练前的基础。本轮已优先修正 P0 规则语义差异，并补齐对应测试。

如果目标是让 demo 与 APK 4.2.5.1 的实际游戏规则尽量一致，则还需要：

1. 继续整理已解密 APK 资源，把 `.js` 脚本里的经济、招募、单位上限、联盟和目标配置归档成可引用表。
2. 用 APK 实测或反编译结果继续补充指挥官城堡招募后的 UI 选择流程和更多部署样例。
3. 在规则引擎中补齐官方指挥官复活流程和价格默认值等仍未落地的对战规则。
4. 校准 84 条 APK 地形定义到项目地形类型的映射，尤其是桥、水面、建筑和特殊地形。
5. 继续确认 `.aem` 尾部 58 字节模板语义；在语义确认前，不应把固定尾部用于推导联盟、玩家颜色或阵营预设。

当前最值得继续落地的规则任务是：继续扩大脚本配置应用面，并用 APK 实测或更完整反编译结果校准指挥官复活流程、治疗超上限后的长期裁剪规则，以及战役目标相关但会影响训练状态的水晶/静态单位边界。

## 15. 实现记录

2026-06-29 第一批 APK 明确规则已落地：

- 新增 `src/game/apk_compat.ts`：记录 APK 单位、状态、能力 ID 映射。
- `StatusType` 新增 `inspired`，攻击光环附加鼓舞状态，不再使用独立攻击光环布尔字段。
- 鼓舞攻击加成按距离结算：近战 +10，远程 +5。
- 虚弱防御惩罚按距离结算：近战 -10，远程 -5；移动力仍降至 1。
- 空军攻击水中非空军单位 +10；攻击同为空军目标不触发。
- 治疗师主动治疗可超过目标最大血量；非治疗师来源回复仍保持最大血量上限，但不会降低既有超上限生命。
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

2026-06-29 第五批 APK 队伍初始规则已落地：

- `TeamRuleConfig.initialGold` 支持队伍初始金币配置，对应 APK dex 中的 `Stage.SyncSetGoldForTeam` 能力。
- `createDemoState(rules)` 可接收规则配置，并在创建初始状态时应用初始金币。
- 默认 demo 状态仍保持双方 500 金币，避免改变现有训练/测试基线。
- 验证：`npm test` 172 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 DEX 方法表补充分析：

- 确认 Stage 类存在 `CheckCommander`、`GetCommander`、`SyncSetCommander`、`CheckGameOver`、`CheckTeamDestroyed` 和 `SyncGameOver`。
- 确认 Rule 类存在指挥官收入、地形收入和等级上限设置方法。
- 确认单位价格由单位对象 `GetPrice()` 读取，价格字段在单位配置对象内。
- 未发现通用指挥官复活/重生 API；复活流程仍待更完整反编译或 APK 实测确认。

2026-06-29 AI 训练环境评估改进：

- `AncientEmpiresEnv` 的最大步数结算改为按金币与剩余军力价值评估，不再只比较单位数量。
- 军力价值使用当前规则配置中的单位价格和单位剩余血量比例；未定价单位只以存活单位小权重参与，避免把未确认 APK 价格写死。
- 该规则只影响 AI 训练环境的超时裁决，不改变 `GameEngine` 的真实终局规则。
- 验证：`npm test` 174 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 stacked/pending 行动限制修正：

- APK DEX 明确包含 `Cannot end turn when stacked!`。
- `getLegalActions` 在存在 `pendingUnitId` 时不再生成 `end_turn`，只能处理该待处理单位的合法动作。
- 继续保持 pending 状态下禁止招募，与 `Cannot recruit when stacked!` 一致。
- 验证：`npm test` 174 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 等级阈值与内部上限修正：

- APK DEX 中 `Lc/a/b/a/t/f.a(int)` 确认等级经验阈值公式：`level <= 0` 为 0，否则 `(level + 1) * 100 * level / 2`。
- APK DEX 中 `Lc/a/b/a/t/f.b(int)` 从 9 级向下反推等级，说明数据层至少支持 0-9 级。
- 项目默认 `levelCap` 仍保持 3，但 `RuleConfig.levelCap` 现在允许配置到 9；经验阈值改为 APK 公式。

2026-06-29 APK 加密资源与脚本规则补充：

- `data.bin` 使用自定义序列化 magic `365703`，开头明文保存 8 字节 DES key；后续资源使用 `DES/CBC/PKCS5Padding`，key 与 IV 相同。
- 已确认 `.js` 和 `.aem` 资源可以用该 key 解密；脚本中大量出现 `Stage.SyncSetUnitLimit(...)` 和 `Stage.SyncSetRecruitUnits(...)`。
- `RuleConfig` 新增全局 `unitLimit/populationLimit/recruitableUnits`，队伍级配置仍可覆盖全局配置。

2026-06-29 data.bin 单位基础数值校准：

- 已解出 21 条 APK 单位基础数值，并记录到第 4.1 节。
- 黑魔法师攻击从 45 校准为 APK 的 50。
- 2026-06-30 复核 `data.bin` 单位表后，黑魔法师最大射程从 1 校准为 APK 的 2。
- 史莱姆魔法防御按 APK 元素防御公式从 -20 校准为 -10。
- `UnitConfig` 新增攻击、防御、最大生命和移动成长字段，`getEffectiveStats` 改为按 APK `data.bin` 单位成长表计算，不再在逻辑函数里硬编码兵种分支。
- 合法移动范围和实际移动消耗校验已改为使用 `getEffectiveStats(unit).move`，确保指挥官、幽灵、德鲁伊等 APK `moveGrowth=1` 的单位升级后移动成长会实际进入对战规则。

2026-06-30 skirmish 实机规则复核工具化：

- 新增 `tools/apk_skirmish_rule_report.ts`，可通过 `npm run apk:skirmish-rule-report -- --check` 复核用户实机确认的 skirmish 行为。
- 当前覆盖 22 项：开局金币/单位上限/等级上限/模式范围，SD/SO 招募列表，SD/SO 默认招募费用和人口占用，SD 指挥官不在场时可重招募，SD 指挥官费用曲线 `400/500/600` 与 SO 禁用指挥官招募，当前训练默认 SD/SO 指挥官收入 `base=0/growth=25` 及 SD/SO controller 未显式覆盖收入的静态证据，skirmish 指挥官死亡后不自动复活且重招募继承等级/经验，主动治疗超上限后下一己方回合开始先裁剪到最大生命，升级不裁剪既有超上限生命，亡灵中毒/墓碑被动回血不突破最大生命，默认 20 张 skirmish 训练地图只包含已验证 approximate `t30/t31` 且不含 `t80/t81/t82/t83`，训练 observation 规则暴露，`t30/t31` 回血与清状态差异，`t30/t31` 不占领/不收入/不招募，APK 地形防御参与战斗且飞行单位不吃地形防御，pending/stacked 招募菜单限制，招募后 pending 来源/扣费/行动标记，投降结算，skirmish 淘汰条件，以及敌军压城堡回合开始扣 50 血并跳过无操作队伍。
- 当前复核结果为 22/22 检查通过；新增检查会门禁 SD/SO 默认招募费用和人口占用、SD 指挥官费用曲线 `400/500/600`、SO 禁用指挥官招募、skirmish 无自动复活且重招募继承等级/经验、治疗超上限后的回合开始裁剪、亡灵被动回血封顶、当前训练默认指挥官收入结算和静态来源证据、默认训练地图低可信地形风险隔离，以及 APK data.bin `defenseBonus` 进入战斗结算。该工具不重新解包 APK，专门用于防止已实机确认的项目行为和当前训练默认费用/复活/超上限生命/收入/地形防御/招募经济假设回退。
- 报告末尾输出 2 项当前项目边界探针和 5 项待调查清单，不参与 `--check` 失败判定。边界探针会把支援/突击、致盲/普通反击/反击风暴的当前项目行为转成可对照实机验证项；当前探针结果为：同一目标本回合只能被支援一次，狼移动 2 格后攻击仍保留 4 点突击后移动力，普通单位被致盲后不普通反击，狂战士在 2 格内可触发反击风暴而 3 格不触发。待调查清单用于后续回填低可信地形、复杂行动顺序和默认指挥官收入初始化来源等剩余边界。
- 新增 `createDefaultAppGameState()`，前端沙盒和自动 AI 演示默认沿用现有演示棋盘，但应用 APK 正常遭遇战 `SD` 规则配置，避免实际运行入口继续使用旧的裸 demo 规则。

2026-06-29 全局初始金币规则补充：

- 解密脚本确认 `Stage.SyncSetGold(value)` 是单参数全局金币设置，战役中常见 300、400、450、500、600、800 等配置。
- `RuleConfig.initialGold` 新增全局初始金币配置；`TeamRuleConfig.initialGold` 仍可覆盖指定队伍。

2026-06-29 APK 联盟/队伍关系规则补充：

- `RuleConfig.alliances` 新增队伍到联盟 ID 的映射；未配置时每个队伍自成联盟，默认双人对战行为不变。
- 攻击合法性、治疗/支援目标、攻击光环、虚弱光环、移动阻挡和友方建筑回血改为按联盟关系判断。
- 胜负判断改为“只剩一个存活联盟”时结束，`winner` 表示获胜联盟 ID；默认配置下仍等同获胜玩家 ID。
- AI 训练环境终局奖励和启发式 AI 的敌军计数已同步使用联盟关系。
- 验证：`npm test` 185 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK 地形分类规则补充：

- `TerrainId` 新增 `17: bridge` 桥地形占位，按 APK 能力文案归类为水面地形。
- `isWaterTerrain/isMountainTerrain/isForestTerrain/isLandTerrain` 改为读取地形标签，避免后续接入 APK 84 条地形变体时继续硬编码 ID。
- `hill` 标签补充 `mountain`，保持山之子把丘陵视为山地的既有规则；`island` 标签补充 `water`，与当前水之子/大地之子规则保持一致。
- 桥的完整 APK tile ID 映射和贴图变体仍待校准；本次只落地“桥也是水面地形”的已确认规则语义。

2026-06-29 APK 多队伍回合规则补充：

- DEX 字符串确认 `SyncSetCurrentTeam`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncDestroyTeam`，APK 也内置 3/4 人地图，因此对战规则不能只支持 P0/P1 轮转。
- `RuleConfig.disabledTeams` 新增静态禁用队伍配置；禁用队伍不参与合法动作、招募、回合轮转和胜负判定。
- `GameEngine` 结束回合改为按存活且启用的队伍 ID 升序轮转，并在回到首个可行动队伍时增加大回合数。
- `AncientEmpiresEnv` 的 `maxPlies` 估算和超时军力裁决改为支持多队伍/联盟，不再只比较 P0/P1。
- 验证：`npm test` 188 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK Stage 初始化适配器补充：

- 新增 `src/game/apk_stage.ts`，集中承接 APK 已确认的同步配置 API，不引入战役脚本执行器。
- 已支持金币类：`SyncSetGold`、`SyncSetGoldForTeam`、`SyncChangeGold`。
- 已支持规则类：`SyncSetRecruitUnits`、`SyncSetRecruitUnitsForTeam`、`SyncSetUnitLimit`、`SyncSetUnitLimitForTeam`、`SyncSetAlliance`。
- 已支持队伍类：`SyncSetCurrentTeam`、`SyncDisableTeam`、`SyncRestoreTeam`、`SyncDestroyTeam`。其中 `SyncDestroyTeam` 在项目中表现为把队伍标记为非存活，不删除单位对象。
- 已支持单位初始化类：`SyncSetUnitLevel` 按坐标设置等级和 APK 经验阈值，默认回满血但不裁剪既有超上限生命；`SyncSetUnitStatus` 按坐标、APK 状态 ID 和回合数设置状态。适配器同时保留项目内部 `Position` 参数形式，并兼容解密脚本确认的 `x, y, ...` 调用形态。
- `SyncSetCommander` 也兼容解密脚本中的 `x, y` 形态：按该坐标单位的所属队伍写入脚本指挥官；原有显式 `teamId + Position` 形式仍保留给项目侧调用。
- 为支持脚本设置的限时致盲，`blinded` 在带有 `remainingTurns` 时会按回合清除；普通攻击附加的无期限致盲行为保持不变。
- 验证：`npm test` 191 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK Rule 配置适配器补充：

- 新增 `src/game/apk_rule.ts`，集中承接 APK 已确认的 `Rule.*` 配置 API。
- 已支持收入类：`Rule.SetIncomeVillage`、`Rule.SetIncomeCastle`、`Rule.SetIncomeCommanderBase`、`Rule.SetIncomeCommanderGrowth`，均要求非负整数。
- 已支持等级类：`Rule.SetLevelCap`，映射到项目 `RuleConfig.levelCap`，允许 APK 内部已确认的 0-9 级范围。
- 已支持价格类：`SetPrices` / 单位价格覆盖，按 APK 单位 ID 映射到项目 `UnitClass` 后写入 `RuleConfig.prices`。
- 该适配器只负责把脚本提取出的配置写入规则层，不执行战役流程。
- 验证：`npm test` 193 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK Stage 查询/终局适配器补充：

- `src/game/apk_stage.ts` 新增 `SyncGameOver` 适配，允许按当前存活联盟 ID 强制设置 `winner`。
- 新增查询函数：`CheckGameOver`、`CheckTeamDestroyed`、`CheckCommander`、`GetCommander`。
- 新增计数函数：`CountUnit`、`CountCastle`、`CountVillage`；单位计数支持可选 APK 单位 ID 过滤。
- 这些函数用于承接 APK 目标/统计 API 和 AI 训练目标评估，不引入战役脚本执行器。
- 验证：`npm test` 195 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK Stage 坐标查询适配器补充：

- `classes.dex` 字符串确认存在 `Stage.CheckCastle`、`Stage.CheckVillage` 和 `Stage.GetTileTeam` 坐标查询 API，属于目标判断/规则查询层，不属于剧情演出层。
- `src/game/apk_stage.ts` 新增 `checkCastle`、`checkVillage`、`getTileTeam`，可按坐标检查城堡、村庄和地块归属；`checkCastle/checkVillage` 支持可选队伍过滤。
- 越界或无主地块查询保持保守：建筑检查返回 `false`，地块队伍返回 `null`。

2026-06-29 APK Stage 单位 code/查询适配器补充：

- 解密脚本确认 `Stage.SyncSetUnitCode(x, y, code)`、`Stage.GetUnit(code)`、`Stage.GetUnit(x, y)` 和 `Stage.GetUnits(team)` 都有实际调用；其中 code 用于脚本目标判断和按名称查找剧情/目标单位。
- `Unit` 新增可选 `apkUnitCode` 元数据；`src/game/apk_stage.ts` 新增 `syncSetUnitCode`、`getUnit`、`getUnits`，只负责查询和标识，不改变普通对战行为。
- `SyncSetUnitStatic*`、`SyncSetUnitTargeted*` 和 `SyncSetUnitHead*` 已作为脚本元数据基础适配；head 只保留 APK 脚本传入的整数 ID，不参与对战训练规则结算。

2026-06-29 APK Stage 脚本变量与距离查询适配器补充：

- 解密脚本确认 `Stage.PutBoolean(name, value)`、`Stage.GetBoolean(name, default)`、`Stage.PutInteger(name, value)`、`Stage.GetInteger(name, default)` 高频出现，用于记录目标/增援/教程进度等脚本状态。
- 解密脚本还确认 `Stage.GetDistance(x1, y1, x2, y2)` 至少在目标判断中出现；项目按既有 `getDistance` 的曼哈顿距离实现。
- `GameState.apkScriptState` 新增可选脚本变量容器；这些变量只服务 Stage 查询/目标判断适配，不改变普通对战引擎结算。

2026-06-29 APK skirmish 终局规则补充：

- 解密 `SD/controller.js` 与 `SO/controller.js` 确认默认对战队伍摧毁条件为 `CountUnit(team) == 0 && CountCastle(team) == 0`，不是单独“无单位即淘汰”。
- 同一脚本还确认：如果被摧毁的是当前行动队伍，且 `ValidateWinningState()` 尚未终局，则调用 `Stage.AsyncNextTurn()` 交给下一存活队伍。
- `RuleConfig.defeatOnNoUnitsAndNoCastles` 新增为默认开启；`defeatOnNoUnits` 默认关闭，但仍可为特定目标配置开启。
- `src/game/apk_stage.ts` 补充 `GetCurrentTeam`、`CheckPlayerTeam`、`GetAliveAlliances` 查询，以覆盖 SD/SO skirmish 控制脚本实际调用的 Stage API。
- 文档同时记录 `SO/controller.js` 在 `OnGameStart` 中调用 `SyncSetRecruitUnits(0..8)`，该限制已可由现有 `syncSetRecruitUnits` 表达。
- 验证：`npm test` 203 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK 脚本指定指挥官规则补充：

- `RuleConfig.commanderUnitIds` 新增队伍到单位 ID 的映射；未配置时仍按 `unitClass === 'commander'` 保持默认行为。
- `src/game/apk_stage.ts` 新增 `SyncSetCommander` 适配；依据 DEX 错误字符串中的 `No unit at (` / `Unit at (` 语义，当前按坐标把己方单位指定为队伍指挥官。
- `CheckCommander`、`GetCommander`、指挥官收入、指挥官死亡计数、指挥官重招募限制和 `defeatOnCommanderDeath` 均统一使用该指挥官模型。
- `AncientEmpiresEnv.getObservation()` 会在 `players` 输出 `commanderUnitId`，并在 `units` 输出 `isCommander`，避免训练侧在 APK 脚本指定普通单位为指挥官时误读规则状态。
- 若某队已经配置指定指挥官，则该队原本的 `commander` 兵种不再自动视为指挥官，避免一队出现多个指挥官来源。
- 验证：`npm test` 198 个测试通过。

2026-06-29 APK 地形基础数据归档：

- 新增 `src/game/apk_terrain.ts`，归档 `data.bin` 中 84 条 tile 定义的定长 40 字节解析结果。
- 确认 `defenseBonus`、`healPerTurn`、`moveCost` 字段位置，并记录 `kind/variant/linked*` 等仍待反编译确认的原始字段。
- 高可信映射已接入：`t27 -> damaged_town`、`t36 -> town`、`t37 -> castle`、`t72 -> bridge`。
- APK 分析文档新增第 8.1 节，记录字段布局、完整 84 条基础数值和高可信映射依据。
- 验证：`npm test` 199 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK 神庙清除规则补充：

- APK 中英文语言表均确认 `P_TILE_TEMPLE_DESCRIPTION` 为“回合开始清除负面状态”语义，未限定为单一地形 ID。
- `water_temple` 增加 `cleanse` 标签；引擎回合开始结算改为按地形标签清除负面状态。
- 新增水中神庙清除致盲测试，并补充陆地神庙/水中神庙 `cleanse` 标签断言。
- 验证：`npm test` 200 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK skirmish AEM 地图解析补充：

- 新增 `src/game/apk_map.ts`，解析已解密 `.aem` 明文字节中的 magic、宽高、作者、队伍 ID、5 字节地形数量、4 字节/格的地形矩阵、初始单位和推荐金币。
- 确认地形格按列优先存储，`raw >>> 12` 为 APK tile ID，`raw & 0xff` 为归属码；`0..7` 映射队伍，`0xfe/0xff` 目前按中立处理。
- 确认单位块字段数量为 `unitCount * 5`，单位记录为 `apkUnitId/teamId/extra/x/y`；最后一条单位的 `y` 后直接接 int32 BE 推荐金币，`-1` 表示未设置。
- 每个地形格会附带已知的项目 `TerrainId` 映射；当前只映射 `t27/t36/t37/t72` 等高可信地形，未确认 tile 保持 `null`。
- APK 分析文档新增第 8.2 节，归档 20 张内置 skirmish 地图的尺寸、队伍、作者、关键建筑归属、初始单位和推荐金币。
- 验证：`npm test` 204 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK skirmish GameState 导入补充：

- `src/game/apk_terrain.ts` 新增 `SKIRMISH_APK_TERRAIN_TO_PROJECT`，把 APK tile 变体按水面/森林/山地/雪地/土路/桥/治疗建筑等项目地形归并；该表用于训练导入，不覆盖高可信映射。
- `src/game/apk_map.ts` 新增 `getUnmappedSkirmishApkTerrainIds` 和 `createGameStateFromApkAemMap`，可把已解析 `.aem` 转为 `GameState`，默认使用推荐金币、初始回合 1、当前队伍为最小玩家 ID，并保留 skirmish 默认“无单位且无城堡淘汰”规则。
- 严格模式下若地图含未映射 tile 会抛错，避免把未知地形静默转为普通陆地。
- 已用真实 APK 的 20 张 `assets/maps/*.aem` 验证全部可导入；推荐金币为 `-1` 的地图导入金币为 0，可由外部规则配置覆盖。
- 验证：`npm test` 204 个测试通过，`npm run lint` 通过；另用解密脚本确认 `IMPORTED 20 / 20`。

2026-06-29 APK AEM 尾部模板与 skirmish 模式入口补充：

- `src/game/apk_map.ts` 新增 AEM 尾部模板识别，保留原始字节、十六进制和模板名；已知模板为 `zero_suffix_58` 与 `ff_suffix_58`。
- 新增 `src/game/apk_skirmish.ts`，集中封装 APK skirmish 模式规则；`SD` 使用默认 skirmish 终局，`SO` 额外按 `SO/controller.js` 写入 `SyncSetRecruitUnits(0..8)` 对应的 9 个基础单位。
- `createApkSkirmishGameState` 在 AEM 导入时合并模式规则和外部覆盖规则，作为后续 AI 训练加载 APK skirmish 地图的稳定入口。
- 20 张根目录 skirmish `.aem` 的推荐金币后均剩余 58 字节，且尾部完全一致，模板记为 `zero_suffix_58`。
- 全部可按当前结构解析的 42 个 `.aem` 中，`zero_suffix_58` 出现 34 次，`ff_suffix_58` 出现 8 次；另有 3 个战役地图因单位块格式特殊暂未解析。
- 该尾部不随玩家数量、队伍 ID、初始单位或推荐金币变化，当前不能作为玩家/联盟预设使用；联盟规则仍应优先来自脚本 `SyncSetAlliance` 或明确的模式配置。
- 验证：`npm test` 204 个测试通过，`npm run lint` 通过；使用真实 APK 的 20 张 `assets/maps/*.aem` 验证 `createApkSkirmishGameState` 的 SD/SO 导入，结果为 `SKIRMISH_IMPORTED 20`，尾部模板统计为 `{"zero_suffix_58":20}`。

2026-06-30 APK skirmish 模式与默认设置实机补充：

- 语言文件显示 `SD` 模式名为 `Default/默认`，`SO` 模式名为 `AEII/原版`；用户实机确认 SD 是正常遭遇战模式，SO 更接近原版/特殊规则模式。
- skirmish 开始前可设置起始金币、单位上限、等级上限和模式。实机默认值：起始金币 300（范围 0-2000，步进 50）、单位上限 30（范围 20-100，步进 10）、等级上限 3（范围 0-9，步进 1）。项目已用 `getApkSkirmishSetupOptions()` 结构化这些范围，并让训练场景、`GameState.metadata.apkSkirmishSetupOptions`、Observation metadata 和 `apk:training-report` 输出同一份设置事实。`getApkSkirmishRuleConfig(mode, setup)` 与 `createApkSkirmishGameState(..., { setup })` 会按这些范围校验自定义开局值，非法范围或步进会直接报错，避免训练端采样 APK UI 不能选择的配置。
- SD/默认模式可招募：指挥官、战士、幽灵、人鱼、弓箭手、史莱姆、黑魔法师、水元素、圣骑士、女巫、狂战士、精灵、狼、冰元素、石头人、德鲁伊、投石车、狼骑射手、龙；不能招募水晶和骷髅。指挥官仅在本方指挥官阵亡或不在场时可招募，data.bin 基础价格字段为 400，死亡后价格是否递增仍待实测。
- SO/原版模式仍按 `SO/controller.js` 限制为 APK ID 0-8：战士、弓箭手、水元素、女巫、精灵、狼、石头人、投石车、龙。
- 项目已把 `getApkSkirmishRuleConfig('SD'/'SO')` 的默认 `initialGold/unitLimit/levelCap` 分别设为 300/30/3；地图 AEM 的推荐金币仍保存在 metadata，用于记录地图建议值而不是覆盖用户开局设置。

2026-06-29 APK 原始 tile 数值接入：

- `Tile` 新增 `apkTerrainId/apkTerrainRaw/apkOwnerCode` 可选字段，`createGameStateFromApkAemMap` 会把每个 AEM 格子的原始地形记录写入导入后的 `GameState`。
- 新增 `src/game/terrain_rules.ts`，普通项目地图仍使用项目地形数值；APK 导入地图若存在 `apkTerrainId`，移动消耗、防御加成和回合回血优先读取 `data.bin` 中的 84 条 tile 数值。
- `getMoveCostForUnit`、战斗地形防御和回合开始地形回血已接入该辅助模块；占领、招募、收入、地形标签能力仍由项目 `terrainId` 控制。
- 验证：`npm test` 205 个测试通过，`npm run lint` 通过；真实 APK 20 张 skirmish 地图导入后 `TILES_WITH_APK_ID 4207/4207`，可读到移动集合 `1,2,3,16777215`、防御集合 `0,5,10,15`、回血集合 `0,3,20`。

2026-06-29 APK tile 数值进入 AI Observation：

- `AncientEmpiresEnv.getObservation().tiles` 新增 `apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence/defenseBonus/healPerTurn/moveCost` 字段。
- 普通项目地图也会输出有效防御、回血、移动字段；APK 导入地图输出的是当前规则实际使用的 APK 原始 tile 数值，并标明当前 tile 语义映射的证据等级，避免训练观察不到影响移动/防御/回血或映射不确定性的隐藏状态。
- 验证：真实 APK 20 张 skirmish 地图构造训练环境后，Observation 覆盖 `OBSERVED_APK_TILES 4207/4207`，输出移动集合 `1,2,3,16777215`、防御集合 `0,5,10,15`、回血集合 `0,3,20`。

2026-06-29 APK 地图元数据进入 AI Observation：

- `GameState.metadata` 新增来源元数据；APK AEM 导入会写入 `source=apk_aem`、`apkMapName`、`recommendedGold` 和 `apkTailTemplate`。
- `createApkSkirmishGameState` 会额外写入 `apkSkirmishMode=SD/SO`，便于训练样本区分 SD 与 SO 规则入口。
- `AncientEmpiresEnv.getObservation().metadata` 会把同一份元数据暴露给训练侧；这些字段只用于样本追踪和复现实验配置，不参与规则判定。
- 验证项已覆盖 AEM 导入、SO skirmish 导入和 Observation 元数据输出。

2026-06-30 APK AEM 低可信 tile 统计进入 metadata：

- `createGameStateFromApkAemMap` 会按当前 `getSkirmishApkTerrainMappingInfo` 对整张 AEM 地图统计 `apkApproximateTerrainIds/apkApproximateTileCount/apkUnmappedTerrainIds/apkUnmappedTileCount`。
- 这些字段会进入 `GameState.metadata` 和 `AncientEmpiresEnv.getObservation().metadata`，用于训练样本索引阶段直接过滤或降权含 approximate/unmapped tile 的地图，不需要先构造完整 Observation。
- 该统计只反映当前 skirmish 映射可信度，不改变 strict terrain 校验、地形映射、移动、防御、回血、占领、招募、收入或胜负判定。
- 验证：新增回归测试覆盖无低可信 tile 的合成 AEM、含 `t31` approximate tile 的合成 AEM，以及 Observation 元数据数组快照隔离。

2026-06-30 APK skirmish 官方地图可信度统计进入 manifest：

- `src/game/apk_manifest.ts` 新增 `terrainConfidence`，基于已固化的 `tileUsage` 为每张官方 skirmish 地图统计 confirmed/atlas/approximate/unmapped 格子数，并列出 approximate/unmapped APK tile ID 与格子数量。
- 当前 20 张官方 skirmish 地图均无 unmapped tile；只有 4 张包含 approximate tile：`(2) Mourningstar.aem` 的 `t30` 2 格，`(4) The Crucible.aem` 的 `t31` 1 格，`(4) Waterways.aem` 的 `t31` 2 格，`(4) Winterstorm.aem` 的 `t31` 4 格。
- 该字段不改变 AEM 导入和规则结算，仅让训练集构建阶段在不加载地图二进制、不创建 Observation 的情况下，直接选择更干净的官方 skirmish 地图或降权低可信地图。
- 验证：新增回归测试覆盖 `(2) Duel.aem` 的可信度统计、20 张图 tile 总数一致性、官方图无 unmapped，以及 4 张 approximate 地图清单。

2026-06-30 APK skirmish 训练地图筛选入口：

- `getApkSkirmishTrainingMapManifest()` 默认返回无 unmapped tile，且只包含“无 approximate”或“approximate 已实机确认”的官方 skirmish 地图；当前 20 张官方图都会进入默认训练集。
- 该函数支持 `allowVerifiedApproximateTerrain=false` 获取 16 张无 approximate 的保守基础图，也支持 `allowApproximateTerrain`、`allowUnmappedTerrain` 和 `playerCounts`，训练代码可以显式选择是否纳入低可信地图、未来未实测 approximate 地图，或只取 2/3/4 人图。
- 验证：新增回归测试覆盖默认 20 张官方 skirmish 地图、默认 2 人图过滤，以及已实机确认的 approximate tile 地图纳入训练集。

2026-06-30 APK skirmish 训练场景清单入口：

- `getApkSkirmishTrainingScenarios()` 默认基于上述 20 张官方 skirmish 地图生成 SD/SO 两种模式的训练场景，共 40 项。
- 每个场景包含稳定 ID（如 `SO:(2) Duel.aem`）、模式、地图名、资源路径、尺寸、玩家数、开局单位数量、推荐金币、地形可信度摘要和该模式的 `RuleConfig` 快照。SO 场景会带上 APK ID 0-8 的基础可招募单位限制；SD 场景会带上实机确认的 19 个可招募单位列表，包含指挥官，不包含骷髅/水晶。
- 该函数同样支持 `modes/playerCounts/allowApproximateTerrain/allowUnmappedTerrain`，用于训练调度直接选择模式和地图集合，不需要外部训练脚本再手工拼接 `getApkSkirmishTrainingMapManifest()` 与 `getApkSkirmishRuleConfig()`。若训练需要自定义金币、单位上限或等级上限，应通过 `setup` 入口生成规则，保留 APK 范围/步进校验。
- `getApkSkirmishTrainingScenario(id)` 可按稳定 ID 定位单个场景；`createApkSkirmishTrainingGameState(map, id)` 与 `createApkSkirmishTrainingEnv(map, id)` 会把已解析 AEM 地图转换为带 APK skirmish 规则的训练状态/环境，并默认严格校验地图与官方 manifest 匹配。匹配时会写入 APK 版本、SHA256、资源路径、`apkSkirmishMode` 和 `apkSkirmishTrainingScenarioId`。
- `tools/apk_training_report.ts` / `npm run apk:training-report -- --check` 会解密默认 20 张官方 skirmish 地图，生成 SD/SO 共 40 个训练场景并逐一创建 `AncientEmpiresEnv`。当前复核结果为 40/40 manifest 匹配、40/40 metadata 匹配，含未实测 approximate 的场景 0 个，模式规则错配 0 个，指挥官重招募费用错配 0 个，Observation 招募经济错配 0 个，Observation APK 地形/单位证据字段错配 0 个，固定动作空间错配 0 个，初始与 smoke 过程 actionMask 错配 0 个，动作序列化错配 0 个，动作接口 schema 14 个模板匹配且 `encodeAction/decodeAction` 往返通过，初始合法动作数均大于 0，且默认每场景执行 4 个合法动作 smoke test 无失败；`--include-approximate` 仍可用于未来放行未实测 approximate 地图。该报告会显示并门禁 SD 默认指挥官费用曲线 `400/500/600`、SO 禁用指挥官招募、SD/SO 可招募单位列表、每个玩家 `players[].recruitCosts` 中的 APK 默认招募费用、训练 Observation 中的 APK tile 数值、映射证据和单位静态数值字段、训练动作编码面、固定动作索引、`EnvStepResult` 动作序列化字段和 `legalActionEntries` 条目，以及动态 `legalActions/actionMask` 对齐。
- 验证：新增回归测试覆盖默认 40 个场景、2 人 SO 场景筛选、SO 可招募列表，以及返回的规则/地形可信度快照不会被调用方修改污染。

2026-06-30 APK skirmish 低可信 tile 验证目标入口：

- `getApkSkirmishTerrainVerificationTargets()` 默认返回 20 张官方 skirmish 地图中实际出现的 approximate tile 目标，包含 `mapName/resourcePath/playerCount/apkTerrainId/tileCount/projectTerrainId/confidence/evidence/terrainConfig`。
- 当前默认目标为 4 项：`(2) Mourningstar.aem` 的 `t30` 2 格，`(4) The Crucible.aem` 的 `t31` 1 格，`(4) Waterways.aem` 的 `t31` 2 格，`(4) Winterstorm.aem` 的 `t31` 4 格。返回的 `terrainConfig` 来自 APK `data.bin`，其中 `t30` 与 `t31` 均为防御 10、回血 20、移动 1；类别语义仍按 evidence 标记为低可信。
- 继续用 DES key `72 6b 00 00 00 00 46 46` 解密上述官方 AEM 后，已把低可信 tile 坐标固化到 `positions`：`(2) Mourningstar.aem` 的 `t30` 在 `(3,4)`、`(7,6)`；`(4) The Crucible.aem` 的 `t31` 在 `(9,9)`；`(4) Waterways.aem` 的 `t31` 在 `(7,8)`、`(7,11)`；`(4) Winterstorm.aem` 的 `t31` 在四角 `(0,0)`、`(12,0)`、`(0,12)`、`(12,12)`。这些格子的 `ownerCode` 均为 `0xff`，即中立/无归属。
- 返回值新增 `projectRuleSemantics`，用于说明项目当前会如何结算该 tile：映射地形 key/name/tags、防御、回血、移动，以及是否清除负面状态、可占领、有收入、可招募、可摧毁、可修理、水面/陆地。2026-06-30 用户实机确认：`t30` 能回血，不能清除中毒/致盲/虚弱，不能占领/收入/招募；`t31` 能回血，能清除中毒/致盲/虚弱，不能占领/收入/招募。当前项目语义与该实测一致。
- 返回值还新增 `manualChecks`，把需要实机回填的项目当前值结构化为 key/value：`projectTerrainKey`、`defenseBonus`、`healPerTurn`、`moveCost`、`clearsNegativeStatus`、`canBeCaptured`、`generatesIncome`、`canRecruit`、`canBeDestroyed`、`canBeRepaired`、`isWater`、`isLand`。`manualVerification` 会单独记录已由实机确认的 APK 行为、来源和日期；当前 `t30/t31` 已标记为 2026-06-30 用户实机确认，后续实测只需要按这些 key 继续补充 APK 是否一致，避免重新推断要测哪些边界。
- 该入口支持按 `confidences`、`apkTerrainIds` 和 `mapNames` 过滤，也可查询 confirmed/atlas tile 的同类数据；返回值会复制 evidence 和 terrainConfig，避免训练端或验证脚本修改后污染 manifest 常量。
- 这一步不改变任何规则结算，只把人工实测和训练集降权需要的数据结构化，避免后续再临时扫描 `tileUsage`、terrain 映射和 `data.bin` 表。

2026-06-30 低可信水域/神庙 tile 贴图复核：

- 复核 `assets/textures/main_texture.atlas/png` 后，`t30` 是营地/帐篷，`t31/t80` 是神庙建筑；`t80` 在当前 45 张 assets AEM 中未出现。
- `t81/t82` 贴图是水面浮冰/礁石，`data.bin` 为防御 10、回血 0、移动 3；项目不再把它们映射为 `water_temple`，改为水面类地形，避免错误附加 `cleanse` 标签。
- `t83` 贴图是水中平台/桥候选，`data.bin` 为防御 10、回血 20、移动 3；仍保留为低可信 `water_temple` 候选，等待实测确认是否净化。
- 全 APK assets AEM 使用量：`t30=30`、`t31=16`、`t81=9`、`t82=8`、`t83=6`、`t80=0`；其中 `t81/t82/t83` 只出现在 AEIII 战役地图，不影响 20 张官方 skirmish 地图。
- 验证：新增回归测试确认 `t80` 仍是低可信神庙候选，`t81/t82` 输出水面障碍 evidence，Observation 中 `t81` 不再带 `cleanse` 标签。

2026-06-30 APK 神庙/营地 tile 证据细分与结算回归：

- `getSkirmishApkTerrainMappingInfo` 的 approximate evidence 已拆分为 `low_confidence_camp_semantics`、`low_confidence_temple_semantics`、`low_confidence_water_obstacle_semantics` 和 `low_confidence_water_temple_semantics`，不再把营地、神庙和水中障碍统一标为模糊建筑语义。
- `t31/t80` 会同时输出 `language_table_temple_description` 和 `low_confidence_temple_semantics`；这只表示“神庙规则来自语言表，tile->神庙仍是贴图/数值推断”，不会提升为 confirmed。
- `t83` 会输出 `language_table_temple_description` 和 `low_confidence_water_temple_semantics`，继续作为低可信水中神庙候选；`t30` 只输出营地语义，不带净化证据。
- 新增回合开始结算回归：带 `apkTerrainId` 的 `t31/t80/t83` 即使项目 `terrainId` 是兜底道路，也按当前规则清除中毒并使用 `data.bin` 的 `healPerTurn=20` 回血；`t30/t81` 不清除中毒，避免把所有回血或水中 tile 都误当成神庙。
- 该测试锁定的是“当前训练规则语义和证据标签一致”；`t31` 已由 2026-06-30 实机确认会回血和净化且不可占领/无收入/不可招募，仍需用户实机或后续反编译确认 `t80/t83` 在官方 APK 中的可占领、敌我归属、净化和回血边界。

2026-06-29 APK 单位 code 与脚本变量进入 AI Observation：

- `AncientEmpiresEnv.getObservation().units` 新增可选 `apkUnitCode`，用于训练侧观察 APK 脚本标记的目标/关键单位。
- `AncientEmpiresEnv.getObservation().apkScriptState` 新增 `booleans/integers` 只读快照，暴露 Stage 脚本目标判断变量。
- 这些字段不参与规则判定；目的是避免 AI 训练样本丢失 APK 脚本状态上下文。

2026-06-29 APK AEM 单位原始字段进入 AI Observation：

- `parseApkAemMap` 已能读取每条初始单位记录的 `apkUnitId/teamId/extra/x/y`；真实 20 张 skirmish 地图中 `extra` 全部为 `0`，没有证据可把它解释为等级。
- `createGameStateFromApkAemMap` 会把 `apkUnitId/apkUnitExtra` 写入 `Unit`；`AncientEmpiresEnv.getObservation().units` 同步输出这两个字段，供训练样本追踪和后续复核使用。
- 这两个字段不改变单位属性、等级、经验或合法动作，只保留 APK 原始单位记录。

2026-06-29 APK Stage 静态/目标单位标记补充：

- 解密脚本确认 `Stage.SyncSetUnitStatic(x, y, flag)`、`Stage.SyncSetUnitStaticWithCode(code, flag)`、`Stage.SyncSetUnitTargeted(x, y, flag)` 和 `Stage.SyncSetUnitTargetedWithCode(code, flag)` 用于剧情/目标单位控制。
- `Unit` 新增可选 `apkStatic/apkTargeted/apkUnitHead`；`apkStatic` 会让单位不再生成普通行动或突击后移动，`apkTargeted` 暴露为训练侧可观察目标标记，`apkUnitHead` 仅保留脚本传入的头像/head ID。
- `AncientEmpiresEnv.getObservation().units` 同步输出 `apkStatic/apkTargeted/apkUnitHead`；头像渲染和完整目标 UI 仍属于战役/UI 层。

2026-06-29 APK Stage 移动消耗覆盖补充：

- `classes.dex` 字符串确认 `Stage.SyncOverrideMov` 存在，并包含 `[Stage.SyncOverrideMov] Unit code is null`、`Invalid tile type`、`Invalid mov` 错误文本，说明该 API 至少校验单位 code、tile type 和移动消耗值。
- `Unit` 新增 `apkMoveOverrides`，`syncOverrideMov(state, code, tileType, mov)` 会给指定 code 单位写入 tile type 到移动消耗的覆盖表。
- 移动规则在计算进入某格消耗时优先匹配 `tile.apkTerrainId`，其次匹配 APK terrain `kind`，没有 APK 原始 tile 时用项目 `terrainId` 兜底；命中后覆盖飞行/地形之子等默认消耗，符合脚本强制覆盖语义。由于 DEX 错误文本只暴露 `tile type` 而未暴露参数名，当前实现同时兼容 tile ID 和 kind 两种解释。
- `AncientEmpiresEnv.getObservation().units` 同步输出 `apkMoveOverrides` 的副本，训练侧可以观察脚本移动覆盖，不会反向污染环境状态。

2026-06-30 APK 脚本单位/坐标状态字面量归档：

- 重新解密 `assets/mods/**/*.js` 后确认，实际脚本没有 `rule.SetPrices` 或 `rule.SetLevelCap` 调用；这两个 API 仍保留为 DEX 能力适配，不写入脚本字面量 manifest。
- `src/game/apk_script_manifest.ts` 新增 `APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS`，单独归档不属于 `RuleConfig` 的单位/坐标状态调用：`AEII/s5.js` 的 `SyncOverrideMov('crystal', 1, 99)`，`AEIII/s4.js` 的 `g1..g5` 对 tile type `0` 移动消耗 `1`，`AEIII/s6.js` 的 `g1/s1/s2` 对 tile type `0` 移动消耗 `99`，以及 `AEIII/s7.js` 的 `SyncSetUnitStatus(6, 9, 2, 2, true)`。
- `syncSetUnitStatus` 已接入 `replaceExisting` 参数：默认或传 `true` 时覆盖目标现有状态；传 `false` 且目标已有状态时拒绝覆盖。APK 实际脚本目前只观察到 `true`，该实现保留参数语义，避免未来场景配置需要再改适配器。
- `apk_script_config.ts` 新增 `applyApkScriptStageStateConfig`，可显式把上述单位/坐标状态调用应用到 `GameState`；成功数和未应用警告会写入 `metadata.apkStageState*` 字段，并透传到 Observation。该入口不会自动套到 skirmish 地图，训练管线可按场景需要选择启用。

2026-06-29 APK skirmish 当前队伍摧毁后的回合推进补充：

- SD/SO `ValidateTeamState(team)` 在 `SyncDestroyTeam(team)` 后会调用 `ValidateWinningState()`；若被摧毁队伍正是 `Stage.GetCurrentTeam()` 且未终局，则调用 `Stage.AsyncNextTurn()`。
- `GameEngine.step` 在胜负条件结算后，如果当前队伍已失活且游戏未终局，会自动切到下一存活队伍，避免 AI 训练停留在无合法动作的死亡当前玩家上。
- 新增 3 人对战回归测试：当前队伍最后单位主动攻击后被反击击杀，队伍被淘汰但未终局，回合自动交给下一存活队伍。

2026-06-29 APK 召唤师摧毁墓碑规则补充：

- APK 语言表 `P_ABILITY3_DESCRIPTION_6` 明确说明召唤师可以从墓碑召唤骷髅，并且摧毁墓碑时不会损失生命值。
- `GameEngine` 的墓碑处理已统一：亡灵踩墓碑回血 10，召唤师踩墓碑不扣血，其他非亡灵单位踩墓碑扣 10；墓碑都会被移除。
- 新增回归测试覆盖女巫直接移动踩墓碑不掉血。

2026-06-29 APK 自我修复中毒边界规则补充：

- APK 英文语言表 `P_ABILITY3_DESCRIPTION_17` 明确说明自我修复单位在回合开始恢复 25% HP，且不论是否中毒。
- `GameEngine` 的回合开始结算已调整为：中毒先扣 10；若该单位有 `self_repair`，即使扣血后生命值不大于 0，也会先执行 25% 最大生命回复；回复后仍不大于 0 才死亡。
- 普通单位中毒致死仍不会触发地形回血，保持既有中毒规则。

2026-06-29 APK skirmish 地图清单代码化补充：

- 新增 `src/game/apk_manifest.ts`，归档 aer-release-4.2.5.1 的版本号、SHA256 和 20 张 `assets/maps/*.aem` 官方 skirmish 地图清单。
- 清单字段包括：资源路径、作者、尺寸、玩家 ID、初始单位明细、城堡/城镇归属、完整 APK tile 使用量、推荐金币和 AEM 尾部模板；顺序来自 `assets/maps/_list.json`，具体数值来自 20 张 AEM 解析结果。
- 新增 `src/game/apk_skirmish_tile_usage.ts`，固化每张官方 skirmish 地图实际出现的 APK tile ID 及格子数量；当前 20 张图的 `unmappedTerrainIds` 均为空。
- `createApkSkirmishGameState` 只有在地图名、作者、尺寸、玩家、开局单位集合、城堡/城镇归属、完整 tile 使用量、推荐金币和尾部模板同时匹配清单时，才自动写入 `apkVersion/apkSha256/apkResourcePath`，避免合成测试地图或外部同名地图被误标为官方 APK 资源。

2026-06-29 APK 队伍规则进入 AI Observation：

- APK 脚本和 DEX 已确认队伍可配置联盟、禁用状态、单位上限、可招募列表，语言表确认招募要考虑人口占用。
- `AncientEmpiresEnv.getObservation()` 新增 `turnPlayerIds`，并在 `players` 中输出 `isEnabled/allianceId/unitCount/population/unitLimit/populationLimit/recruitableUnits`。
- 这些字段只暴露当前规则状态，不改变招募、胜负或回合轮转判定；目的是让 AI 训练样本直接看到 APK 模式/脚本配置带来的队伍约束。

2026-06-29 APK 全局规则和招募费用进入 AI Observation：

- `AncientEmpiresEnv.getObservation()` 新增 `rules` 摘要，输出当前全局初始金币、村庄/城堡/指挥官收入、等级上限、全局单位/人口上限、全局可招募列表、价格覆盖、指挥官重招募费用配置、投降开关和失败条件。
- `rules` 摘要同步输出 `alliances/disabledTeams/commanderUnitIds/teams` 原始配置快照；队伍级配置会保留 `initialGold/unitLimit/populationLimit/recruitableUnits`，方便训练样本复现 APK 脚本配置后的规则状态。`metadata.apkSkirmishSetupOptions` 则保留遭遇战开局设置的合法范围和 SD/SO 标签，供训练端生成或复现实验配置。
- `players[]` 新增 `recruitCosts`，按每个队伍当前有效 `recruitableUnits` 输出实际费用；该费用会反映 `RuleConfig.prices` 覆盖和指挥官死亡次数带来的重招募价格变化。
- 这些字段只暴露规则快照，不改变任何合法动作或结算；目的是让训练侧不用把 APK 脚本配置、默认常量和队伍状态二次拼接后再推断经济/招募边界。

2026-06-29 APK 单位隐藏规则状态进入 AI Observation：

- `AncientEmpiresEnv.getObservation().units[]` 新增 `movementRemaining/hasPostAttackMoved/hasBeenHealedThisTurn/hasBeenSupportedThisTurn/statusRemainingTicks/statusRemainingTurns`。
- 这些字段会影响突击部队后续移动、单回合治疗/支援限制，以及中毒/虚弱等状态的后续结算；亡灵被治疗转伤害也会写入 `hasBeenHealedThisTurn`，避免同一目标在同回合被重复治疗动作处理。此前训练侧只能从合法动作集合或历史轨迹间接推断。
- 这些字段只暴露当前状态快照，不改变移动、治疗、支援、状态倒计时或任何胜负结算。

2026-06-29 APK 单位基础数值与成长进入 AI Observation：

- `AncientEmpiresEnv.getObservation().units[]` 新增 `baseAttack/basePhysicalDefense/baseMagicDefense/baseMinRange/baseMaxRange/baseMove/attackGrowth/defenseGrowth/maxHpGrowth/moveGrowth`。
- 这些字段来自已解析的 APK `data.bin` 21 条单位基础数值和成长表；训练侧可以直接看到单位升级后的潜在收益，不需要只凭当前等级有效数值反推。
- 这些字段只暴露静态规则表，不改变 `getEffectiveStats`、伤害、移动、升级或任何合法动作。

2026-06-30 APK 单位/能力/状态数字 ID 进入 AI Observation：

- `apk_compat.ts` 新增 `APK_UNIT_CLASS_TO_ID`、`APK_ABILITY_TYPE_TO_ID` 和 `APK_STATUS_TYPE_TO_ID`，与既有 APK ID 到项目枚举的映射互为反向表。
- `AncientEmpiresEnv.getObservation().units[]` 新增 `apkUnitClassId/apkAbilityIds/apkStatusId`，让训练样本能直接对齐 APK `data.bin` 单位 ID、能力 ID 和状态 ID。
- 这些字段只暴露 APK 数字标识，不改变单位配置、能力生效、状态倒计时、伤害或合法动作。
- 验证：新增回归测试覆盖 crystal/inspired/attack_aura 的反向映射，以及 commander/soldier 的 Observation 数字 ID 输出。

2026-06-29 APK 单位所在格规则地形进入 AI Observation：

- `AncientEmpiresEnv.getObservation().units[]` 新增 `tileTerrainId/tileRuleTerrainId/tileTerrainKey/tileTerrainTags/tileOwnerId/tileApkTerrainId/tileApkOwnerCode/tileApkTerrainMappingConfidence/tileApkTerrainMappingEvidence/tileDefenseBonus/tileHealPerTurn/tileMoveCost`。
- 这些字段复制单位当前所在格的规则地形快照；APK 导入地图若存在 `apkTerrainId`，会按 `terrain_rules.ts` 的当前规则语义输出，例如项目 `terrainId=road` 但 APK `t37` 会在单位上直接显示 `tileRuleTerrainId=10`、`tileTerrainKey=castle`。
- 这些字段只减少训练端反查 `tiles[]` 的成本，不改变地形、防御、回血、移动或建筑判定。

2026-06-29 APK stacked/pending 状态进入 AI Observation：

- DEX 字符串确认 APK 存在 `Cannot recruit when stacked!`、`Cannot end turn when stacked!`、`Cannot select when stacked!` 等 stacked 限制。
- 规则层已用 `pendingUnitId` 表达招募后的待处理单位，并区分 `apkPendingRecruitSource=empty_castle/commander_castle`：空城堡 pending 允许结束回合/投降，指挥官城堡堆叠 pending 禁止结束回合/投降。
- `AncientEmpiresEnv.getObservation()` 新增 `pendingUnitId`，`observation.units[]` 新增 `isPending/apkPendingRecruitSource`，让训练侧不用只靠合法动作集合反推当前 stacked 状态。

2026-06-29 APK skirmish 投降动作接入：

- DEX 字符串确认 APK 存在 `Cannot surrender when stacked!`；2026-06-30 实机补充显示只有指挥官城堡堆叠招募 pending 禁止投降，空城堡招募 pending 仍可投降。
- `RuleConfig.allowSurrender` 新增投降开关；普通规则默认关闭，`getApkSkirmishRuleConfig('SD'/'SO')` 默认开启。
- 合法动作在普通状态和空城堡 pending 状态下生成 `surrender`；执行后当前队伍失活、己方单位全部删除、己方占领建筑变为无主，并复用联盟胜负结算。
- `encodeAction/decodeAction` 已支持 `surrender`；内置 Random AI 与 Heuristic AI 不会把投降当作普通推进动作优先选择。

2026-06-30 AI 训练动作 schema 补充：

- `AncientEmpiresEnv` 相关工具新增 `getActionSpaceSchema()`，输出当前结构化动作的字符串编码模板，覆盖移动、突击后移动、攻击、治疗、支援、召唤、城堡招募、招募后部署、占领、修理、摧毁城镇、待机、投降和结束回合。
- 固定稀疏动作空间已提供 `getFixedActionSpaceDescriptor()`、`encodeFixedActionIndex()`、`getFixedLegalActionIndexes()`、`getFixedActionMask()` 和 `stepFixedAction()`。槽位按地图宽高、源格、目标格、招募兵种和全局动作分块计算，保留现有 `legalActions/actionMask` 作为动态可用性来源。
- `EnvStepResult` 已直接输出 `legalActionCodes`、`legalActionEntries`、`fixedActionSpaceDescriptor` 和 `fixedLegalActionIndexes`，让外部训练进程不必重新拼接字符串编码或固定索引；`legalActionEntries[]` 将结构化动作、字符串编码、动态 mask 位和固定索引聚合为一条记录，完整 dense 固定 mask 仍通过 `getFixedActionMask()` 按需获取，避免每步默认返回大数组。
- `apk:training-report -- --check` 已把该 schema、`encodeAction/decodeAction` 全动作类型往返、默认训练场景初始与 smoke 过程的 `legalActions/actionMask` 对齐、`EnvStepResult` 动作序列化字段和 `legalActionEntries` 条目对齐，以及 40 个默认 APK 训练场景的固定动作索引无碰撞纳入门禁；当前为 14 个模板匹配、往返通过、固定动作空间错配 0 个、动作序列化错配 0 个、mask 错配 0 个。
- 这一步不改变 APK 规则结算，只让 AI 训练端能稳定发现当前 APK 对齐规则层暴露的动作编码面和固定索引入口，避免外部训练脚本重复硬编码动作槽位细节。

2026-06-30 APK skirmish 地图解密复核工具：

- 新增 `tools/apk_resource_crypto.ts`，把 APK `.aem/.js/.json` 资源共用的 `DES/CBC/PKCS7`、key/iv `72 6b 00 00 00 00 46 46` 作为 Node 侧解密工具固化；该工具不进入前端运行包。
- 新增 `tools/apk_map_report.ts` 和 npm 脚本 `apk:map-report`，默认读取 `APK/_analysis/unpack`，解密 20 张官方 skirmish AEM，复用 `parseApkAemMap` 与 `matchesApkSkirmishMapManifest` 生成 Markdown/JSON 报告。
- 当前 `npm run apk:map-report -- --check` 结果：APK SHA256 匹配，20/20 地图 manifest 匹配，尾部模板 `zero_suffix_58=20`，非预期尾部 0，4 张地图含 approximate tile，0 张地图含 unmapped tile；报告末尾直接输出 `t30/t31` 人工验证坐标、当前项目语义 checklist，并显示 `t30/t31` 的实机确认状态。
- 这一步不改变对战规则结算；它把“从 APK 资源复核地图规则证据”的临时流程变成可重复命令，后续可用于确认新的 APK、重新生成地图证据或定位 manifest 漂移。

2026-06-30 APK 脚本解密复核工具：

- 新增 `tools/apk_script_report.ts` 和 npm 脚本 `apk:script-report`，默认读取 `APK/_analysis/unpack/assets/mods/**/*.js`，使用同一 DES key/iv 解密 27 个脚本。
- 工具会重新统计 `Stage.*` 与 `rule.SetIncome*` API 调用次数，并和 `APK_SCRIPT_API_CALL_COUNTS` 对比；同时重新提取可安全转为 `RuleConfig` 的字面量规则配置，以及 `SyncOverrideMov/SyncSetUnitStatus` 单位/坐标状态配置，并和 `APK_SCRIPT_LITERAL_RULE_CONFIGS`、`APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS` 对比。
- 当前 `npm run apk:script-report -- --check` 结果：27/27 脚本匹配，API 计数差异为 0，字面量配置差异为 0。
- 这一步不执行剧情 `Async*` API，也不把动态参数转为静态规则；它只把“脚本 manifest 的来源证据”变成可重复复核命令，防止后续忘记已确认的 APK 调用次数和字面量规则值。

2026-06-30 APK DEX 字符串复核工具：

- 新增 `tools/apk_dex_report.ts` 和 npm 脚本 `apk:dex-report`，默认读取 `APK/_analysis/unpack/classes.dex`，直接解析 DEX string_ids/string_data 字符串表，不依赖 `jadx/apktool/baksmali`。
- 工具按 commander、recruit、revive、setup 分组输出关键词命中，并用 `--check` 复核必要字符串和疑似指挥官复活 API 候选。
- 当前 `npm run apk:dex-report -- --check` 结果：26529 个字符串可解析，必要字符串缺失为 0，`revive` 关键词分组命中 0，`ReviveCommander/RespawnCommander/CommanderRevive/CommanderRespawn` 候选为 0。
- 这一步不改变对战规则结算；它只把“DEX 字符串层已确认/未发现的证据”变成可重复命令。指挥官死亡后重招募价格是否递增仍需实机或完整反编译确认。

2026-06-29 APK 脚本配置 manifest 补充：

- `src/game/apk_script_manifest.ts` 归档 27 个已解密 `assets/mods/**/*.js` 的 `Stage.*` 与 `rule.SetIncome*` 调用次数。
- 同文件归档可直接由字面量提取的规则配置分布：金币、单位上限、全局/队伍可招募列表、联盟、禁用队伍和收入覆盖。
- `APK_SCRIPT_LITERAL_RULE_CONFIGS` 按资源路径记录 26 个脚本的逐脚本字面量配置，`getApkScriptLiteralRuleConfig(resourcePath)` 可用于后续场景配置生成。
- 这一步只提供静态证据和后续场景配置输入，不执行 `Async*` 剧情 API，也不把动态参数误转为固定规则。
- 阶段验证：`npm test` 和 `npm run lint` 通过；后续综合验证见下一条。

2026-06-29 APK 脚本字面量配置到 `RuleConfig` 的静态生成入口：

- 新增 `src/game/apk_script_config.ts`，提供 `buildApkScriptRuleConfig`、`getApkScriptRuleConfig` 和 `applyApkScriptRuleConfig`。
- 支持把收入、全局/队伍初始金币、单位上限、全局/队伍可招募单位、联盟和禁用队伍转为项目规则。
- `SyncRestoreTeam`、`SyncGameOver` 只记录为被忽略的生命周期/终局调用，不写入开局静态规则，避免误用全脚本扫描结果。
- `tools/apk_script_report.ts` 的应用检查已覆盖 `assets/mods/AEIII/s6.js` 的联盟/禁用队伍配置：Observation 会显示脚本联盟与禁用队伍，禁用队伍不会生成合法动作，且回合轮转会跳过该队伍；也覆盖 `assets/mods/AEIII/s4.js` 的 `rule.SetIncomeVillage(100)`：Observation 会显示脚本收入配置，且只拥有一个村庄的队伍在回合开始金币从 500 增至 600。当前应用检查为 7/7 通过。
- 验证：`npm test` 229 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-30 APK 脚本规则来源进入 metadata：

- `applyApkScriptRuleConfig` 应用脚本字面量规则后，会在 `GameState.metadata` 写入 `apkRuleScriptResourcePath/apkRuleScriptIgnoredRestoreTeamIds/apkRuleScriptIgnoredGameOverAllianceIds/apkRuleScriptWarnings`。
- `AncientEmpiresEnv.getObservation().metadata` 同步输出这些字段，用于训练样本复现当前规则配置来自哪个 APK 脚本，以及哪些生命周期/终局调用被静态规则转换安全忽略。
- 这些字段只做证据追踪，不执行 `SyncRestoreTeam`、`SyncGameOver` 或剧情 `Async*` API，也不改变合并后的规则结算。
- 验证：新增回归测试覆盖 `assets/mods/AEI/s5.js` 应用后的规则来源、忽略项和 Observation 元数据快照隔离。

2026-06-29 `RuleConfig` 合并与 AEM 初始规则应用补充：

- `src/game/rule_config.ts` 新增公共 `mergeRuleConfig`，用于深合并价格、联盟、指挥官、队伍级规则等嵌套配置，避免后续 APK 模式规则、地图规则和脚本规则互相覆盖。
- `createGameStateFromApkAemMap` 在创建状态后会应用 `RuleConfig.initialGold` 和 `TeamRuleConfig.initialGold`；推荐金币仍作为无规则覆盖时的地图默认金币。
- `createApkSkirmishGameState` 和 `applyApkScriptRuleConfig` 已统一使用公共合并逻辑，方便后续把 APK 脚本/场景规则叠加到 skirmish 地图。
- 验证：`npm test` 229 个测试通过，`npm run lint` 通过。

2026-06-29 APK tile 感知的地形能力分类补充：

- `abilities.ts` 的水/森林/山地/陆地判断现在可接收 `Tile`；若存在 `apkTerrainId`，优先使用 `SKIRMISH_APK_TERRAIN_TO_PROJECT` 的映射结果判断地形标签。
- `getMoveCostForUnit`、地形之子攻防加成、回合开始地形之子回血，以及空军攻击水中单位的 +10 规则均改为使用 tile 感知分类。
- 这避免 APK 导入地图中 `terrainId` 为兜底或近似值时，能力加成与 APK 原始 tile 分类不一致。
- 验证：`npm test` 229 个测试通过，`npm run lint` 通过，`npm run build` 通过。

2026-06-29 APK tile 感知的地形语义统一补充：

- `terrain_rules.ts` 新增 `getTileTerrainIdForRules`、`getTileTerrainConfig`、`getTileTerrainKey` 和 `tileHasTerrainTag`，统一把带 `apkTerrainId` 的格子先映射为 APK skirmish 规则地形。
- 合法动作中的占领/摧毁/修理/招募、回合收入、胜负城堡统计，以及 Stage `CheckCastle/CheckVillage/CountCastle/CountVillage` 均改为使用上述 helper。
- 这保证 APK 导入地图即使项目 `terrainId` 是近似或兜底值，城堡、村庄、损坏村庄、神庙等规则语义仍优先跟随 APK tile 映射。
- 验证：`npm test` 229 个测试通过，`npm run lint` 通过。

2026-06-29 APK tile 规则语义进入 AI Observation：

- `AncientEmpiresEnv.getObservation().tiles` 在原有 `terrainId/apkTerrainId/apkTerrainRaw/apkOwnerCode/apkTerrainMappingConfidence/defenseBonus/healPerTurn/moveCost` 基础上，新增 `ruleTerrainId/terrainKey/terrainTags`。
- `ruleTerrainId` 来自 `getTileTerrainIdForRules`，`terrainKey/terrainTags` 来自规则层实际使用的地形配置；若 APK 导入地图的原始 tile 映射为城堡、城镇、水面、森林或山地，训练侧可以直接观察到这些规则语义。
- 这解决了 APK tile 被导入为项目近似地形时的隐藏信息问题。例如 APK `t37` 即使项目 `terrainId` 是 road，Observation 仍输出 `ruleTerrainId=10`、`terrainKey=castle` 和包含 `recruit_source` 的标签。
- 验证：新增回归测试覆盖 APK `t37` 城堡和 `t36` 城镇在 Observation 中的规则语义输出。

2026-06-29 APK tile 映射依据进入 AI Observation：

- `AncientEmpiresEnv.getObservation().tiles` 新增 `apkTerrainMappingEvidence`，其值来自 `getSkirmishApkTerrainMappingInfo(apkTerrainId).evidence`。
- 已确证建筑/桥会输出语言表或高可信建筑证据；atlas 映射会输出 `data_bin_values/texture_atlas/skirmish_map_context`；低可信 tile 会按营地、神庙、水中障碍或水中神庙候选输出对应 evidence，避免训练侧把近似地形语义误读为已确证规则。
- 该字段只是只读观测快照，不改变移动、防御、回血、招募、占领、收入或胜负判定。
- 验证：新增回归测试覆盖 confirmed、atlas、approximate 三类 evidence，并确认修改 Observation 快照不会污染环境状态。

2026-06-30 APK tile 映射可信度摘要进入 AI Observation：

- `AncientEmpiresEnv.getObservation()` 新增 `terrainMappingSummary`，当地图存在 APK tile 时输出 `apkTileCount/byConfidence/apkTerrainUsage/approximateApkTerrainIds/unmappedApkTerrainIds`。
- 该摘要按整张地图统计 confirmed、atlas、approximate、unmapped tile 数量，并列出低可信和未映射的 APK tile ID，便于训练管线按地图粒度过滤、降权或标记样本。
- 该字段只是只读观测摘要，不改变地形映射、移动、防御、回血、招募、占领、收入或胜负判定。
- 验证：新增回归测试覆盖 atlas、approximate 和 synthetic unmapped tile 的摘要输出。

2026-06-30 APK tile `data.bin` 原始配置进入 AI Observation：

- `AncientEmpiresEnv.getObservation().tiles[]` 新增 `apkTerrainConfig`，单位快照新增 `tileApkTerrainConfig`，按当前 `apkTerrainId` 输出 `data.bin` 中的 `id/kind/flagA/variant/linkedA/defenseBonus/healPerTurn/moveCost/flagB/linkedB/linkedC/flagC/tail`。
- 其中 `defenseBonus/healPerTurn/moveCost` 已参与规则结算；`kind/variant/linked*/flag*/tail` 目前只作为 APK 原始证据暴露，不把未知 flag 语义硬编码成规则。
- 该字段用于让训练、数据清洗和后续实测复核直接拿到当前 tile 的确切 APK 数值，避免每次再反查 `apk_terrain.ts` 或重新解析 `data.bin`。
- 验证：新增回归测试覆盖水面 `t0`、近似神庙 `t31` 和单位所在 APK 城堡 `t37` 的配置快照输出。

2026-06-30 APK `data.bin` 地形数值复核工具：

- 新增 `tools/apk_terrain_report.ts` 和 npm 脚本 `apk:terrain-report`，默认读取 `APK/_analysis/unpack/data.bin`，从文件头取 DES key/iv，解密 payload 后重新解析 84 条 40 字节地形记录。
- 工具会逐项对比真实 `data.bin` 解析结果和 `APK_TERRAIN_CONFIGS` 归档，并输出防御、回血、移动消耗分布与 skirmish 映射可信度汇总。
- 当前 `npm run apk:terrain-report -- --check` 结果：84/84 地形记录匹配，项目归档差异为 0；防御分布为 0/5/10/15/20，回血分布为 0/3/20，移动分布为 1/2/3/16777215。
- 这一步不改变对战规则结算；它把“地形基础数值来自 APK data.bin 且当前归档无漂移”的证据变成可重复命令。

2026-06-29 APK 城镇摧毁/修理 linked tile 同步：

- `data.bin` 已确认 `t36.linkedB=27`，对应村庄被摧毁后的废墟；`t27.linkedC=36`，对应废墟修理回村庄。
- `terrain_rules.ts` 新增 tile 状态写入 helper；`destroy_town` 会把 APK `t36` 同步改为 `t27`，`repair` 会把 APK `t27` 同步改回 `t36`，`capture` 会同步更新 `apkOwnerCode/apkTerrainRaw`。
- 这修正了 APK 导入地图中只改项目 `terrainId` 而保留旧 `apkTerrainId` 时，后续收入、占领、摧毁/修理和 Stage 查询继续按旧 tile 判定的问题。
- 验证：新增回归测试覆盖 APK 城镇摧毁、废墟修理和城堡占领后的 `apkTerrainId/apkTerrainRaw/apkOwnerCode` 当前状态。

## 16. 本次复核记录

2026-06-29 根据 `C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk` 重新复核并继续补齐对战规则：

- APK SHA256 与既有记录一致：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`。
- 复核来源包括：`APK\_analysis\unpack\assets\languages\zh.lang`、`assets\languages\en.lang`、`classes.dex` 字符串、`data.bin` 结论记录，以及当前 `src/game` 规则实现。
- 本轮确认 20 张根目录 skirmish `.aem` 的 58 字节尾部全部相同，全部可解析 `.aem` 仅出现两种固定尾部模板，并已把模板记录接入解析器；SD/SO skirmish 模式入口已落地；APK 导入地图已优先使用 `data.bin` 的原始 tile 移动/防御/回血数值；脚本字面量配置已可生成 `RuleConfig`。当前最重要的差距仍是完整 APK tile 的贴图/类别语义、`.aem` 尾部业务语义、动态脚本参数和逐关卡剧情/目标执行。
