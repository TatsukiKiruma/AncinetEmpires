# GLM 项目规则 vs APK 规则差异清单：aer-release-4.2.5.1

**生成日期**：2026-06-30
**APK**：`C:\code\AncinetEmpires\APK\aer-release-4.2.5.1.apk`
**APK SHA256**：`51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`
**对比范围**：APK 解包资源（`APK/_analysis/unpack` + jadx 反编译）vs 项目 `src/game` 规则实现
**说明**：本文档仅做差异记录与证据归档，不修改任何代码。部分历史文档列出的差异已在代码中修复，本文档以**当前代码状态**为准重新校准。

---

## 0. 校准说明：历史文档已过时的"差异"

下面这些项在 `OPENCODE_APK_Project_Rules_Comparison.md` 等旧文档中被标为"待对齐"，但本次直接读取代码后确认**已对齐**，不再视为差异：

| 历史差异项 | 当前代码证据 | 结论 |
|---|---|---|
| 普通反击缺少 `isInRange(defender, attacker)` 检查 | [src/game/engine.ts#L454-L459](file:///c:/code/AncinetEmpires/src/game/engine.ts#L454-L459) 已使用 `inRange(target.pos, attacker.pos, targetStatsBeforeAttackStatus.minRange, targetStatsBeforeAttackStatus.maxRange)` | 已对齐 |
| 同能力免疫检查（poisoner/blinder）未显式实现 | [src/game/engine.ts#L464-L466](file:///c:/code/AncinetEmpires/src/game/engine.ts#L464-L466) 已 `hasAbility(attacker,'poisoner') && !hasAbility(target,'poisoner')`、`hasAbility(attacker,'blinder') && !hasAbility(target,'blinder')` | 已对齐 |
| 召唤骷髅不继承召唤师等级 | [src/game/engine.ts#L559-L574](file:///c:/code/AncinetEmpires/src/game/engine.ts#L559-L574) `const level = summoner.level ?? 0;` 并写入新单位 | 已对齐 |
| 黑魔法师最大射程错误（1→2） | [src/game/units.ts#L32](file:///c:/code/AncinetEmpires/src/game/units.ts#L32) `dark_mage.maxRange: 2` | 已对齐 |
| 空军打水中非空军 +10 未实现 | [src/game/rules.ts#L39-L41](file:///c:/code/AncinetEmpires/src/game/rules.ts#L39-L41) 已实现 | 已对齐 |

---

## 1. 总体判断

项目当前已覆盖 APK 4.2.5.1 skirmish 对战规则的**核心骨架**（21 单位 / 25 能力 / 4 状态 / 84 tile / SD-SO 模式 / 20 张官方地图 / 脚本同步配置层），反编译确认覆盖度约 95%+。剩余差异集中在三类：

1. **数值/持续时间微差**（可量化，影响实际结算）— 见 §2
2. **地形与 tile 语义未校准**（影响非默认地图和未来扩展）— 见 §3
3. **战役脚本/目标/演出层未实现**（不影响 skirmish 训练，影响完整复刻）— 见 §4

---

## 2. 数值与持续时间差异（P0/P1，影响结算）

### 2.1 鼓舞（INSPIRED）持续时间不一致 【P0】

| 项 | APK 反编译证据 | 项目实现 | 差异 |
|---|---|---|---|
| 鼓舞持续时间 | `RuleData.f1269H = 0`（仅当回合有效，下次衰减时立即到期） | `remainingTurns: 1` | 项目多持续 1 回合 |

**APK 证据**：
- 反编译 `C0611d.java` 第 109-110 行：`f1269H = 0`
- `OPENCODE_APK_Decompiled_Rules.md` §9.9 明确：`f1269H=0` = 仅当回合有效
- 反编译 `m4358a` 状态附加方法：`m4288i(unit, ordinal, duration)`，duration=0 表示下次 `m4376D` 衰减时立即清除

**项目证据**：
- [src/game/engine.ts#L355](file:///c:/code/AncinetEmpires/src/game/engine.ts#L355)：`u.status = { type: 'inspired', remainingTurns: 1 };`
- [src/game/types.ts#L13-L17](file:///c:/code/AncinetEmpires/src/game/types.ts#L13-L17)：`UnitStatus` 用对象 + `remainingTurns?` 表达，无 0 值"仅当回合"语义

**影响**：项目里攻击光环附加的鼓舞会在下个己方回合开始时仍生效，与 APK 行为不符。

---

### 2.2 致盲（BLINDED）持续时间未显式写入 【P1】

| 项 | APK 反编译证据 | 项目实现 | 差异 |
|---|---|---|---|
| 致盲持续时间 | `RuleData.f1268G = 1`（1 回合） | `{ type: 'blinded' }` 不显式指定 remainingTurns | 行为依赖默认值，语义不明 |

**APK 证据**：
- 反编译 `C0611d.java`：`f1268G = 1`
- `C0600q.java` 第 794-802 行 `m4328c` 方法：`m4358a(c0613f2, EnumC0615h.BLINDED, this.f1215f.f1231c.f1268G, false)`

**项目证据**：
- [src/game/engine.ts#L467](file:///c:/code/AncinetEmpires/src/game/engine.ts#L467)：`target.status = { type: 'blinded' };`
- [src/game/types.ts#L16](file:///c:/code/AncinetEmpires/src/game/types.ts#L16)：`remainingTurns?: number` 为可选字段

**影响**：项目致盲衰减依赖隐式默认值，与 APK 字面量 1 不显式等价，存在歧义风险。

---

### 2.3 状态存储数据结构差异 【P2，记录性】

| 项 | APK | 项目 |
|---|---|---|
| 状态字段存储 | 单 int 位打包：`f1309g = (ordinal << 12) \| duration`，高 20 位 ordinal，低 12 位 duration（max 4095） | `{ type: StatusType, remainingTicks?, remainingTurns? }` 对象 |
| 状态互斥 | 通过 ordinal 单值天然互斥 | 通过 `UnitStatus` 单对象天然互斥 |

**APK 证据**：`C0613f.java` 第 25-27 行 `f1309g`，方法 `m4288i` / `m4255w` / `m4254x`。
**项目证据**：[src/game/types.ts#L13-L17](file:///c:/code/AncinetEmpires/src/game/types.ts#L13-L17)。

**结论**：数据结构不同但语义等价，仅作记录。

---

## 3. 地形与 tile 语义差异（P1，影响非默认地图）

### 3.1 tile 数量与映射覆盖率

| 项 | APK | 项目 | 差异 |
|---|---|---|---|
| tile 总数 | 84 条 `data.bin` 定义 | 17 个抽象地形 + `SKIRMISH_APK_TERRAIN_TO_PROJECT` 映射 | 4 个高可信（confirmed），73 个 atlas，7 个 approximate，0 unmapped |
| 高可信映射 | `t27=damaged_town, t36=town, t37=castle, t72=bridge` | 已建立 | ✅ 对齐 |

**APK 证据**：
- `APK/_analysis/unpack/assets/data.bin` 已解密，84 条 40 字节记录
- `npm run apk:terrain-report -- --check` 输出 84/84 匹配

**项目证据**：
- [src/game/apk_terrain.ts](file:///c:/code/AncinetEmpires/src/game/apk_terrain.ts) 归档 84 条数值
- [src/game/terrain_rules.ts](file:///c:/code/AncinetEmpires/src/game/terrain_rules.ts) 在 APK 导入图上优先用 `apkTerrainId` 数值

### 3.2 未实测的 approximate tile（t80/t81/t82/t83）【P1】

| tile ID | 当前项目语义 | 实测状态 | skirmish 中使用 |
|---|---|---|---|
| t30 | camp（不清状态，不可占领/收入/招募） | ✅ 已实测确认 | 2 张图 2 格 |
| t31 | temple（回血+净化，不可占领/收入/招募） | ✅ 已实测确认 | 3 张图 7 格 |
| t80 | 神庙候选（按神庙近似处理） | ❌ 未实测 | 0 格（不在 skirmish 默认训练集） |
| t81 | 水面浮冰/礁石候选 | ❌ 未实测 | 0 格 |
| t82 | 水面浮冰/礁石候选 | ❌ 未实测 | 0 格 |
| t83 | 水中神庙候选 | ❌ 未实测 | 0 格 |

**APK 证据**：`npm run apk:map-report -- --check` 输出 `t80=0 / t81=0 / t82=0 / t83=0` 在 skirmish 中格子数均为 0；这些 tile 仅出现在 `assets/mods/AEIII/s4.aem` 与 `s6.aem`。

**项目证据**：[src/game/apk_manifest.ts](file:///c:/code/AncinetEmpires/src/game/apk_manifest.ts) 默认训练集 20 张图全部包含，但 `t80-t83` 不进入默认 skirmish 训练集。

### 3.3 神庙（kind=5）清除机制实现方式差异 【P2，语义等价】

| 项 | APK | 项目 |
|---|---|---|
| 神庙清除判断 | `tile.kind == 5` 时若有有害状态则清除 | `tileHasTerrainTag(tile, 'cleanse')` 时清除 |
| 衰减顺序 | kind=5 时跳过衰减直接清除；否则正常衰减 | 不区分衰减顺序，直接清除 |

**APK 证据**：反编译 `C0595l.java` 第 688-751 行 `m4472a`：`if (unit.hasHarmfulStatus && tile.kind == 5) unit.clearStatus(force=true); else unit.tickStatus();`
**项目证据**：[src/game/engine.ts#L270-L275](file:///c:/code/AncinetEmpires/src/game/engine.ts#L270-L275) `if (tileHasTerrainTag(tile, 'cleanse')) clearNegativeStatus(u);`

**结论**：功能等价但实现路径不同。

### 3.4 TileConfig 未使用字段 【P2，记录性】

反编译 `C0619b.java` 确认 TileConfig 含字段项目未实现：

| 字段 | 含义 | 项目实现 |
|---|---|---|
| `f1375h` 占领奖励单位类型 | 占领某些地块可能奖励单位 | ❌ 未实现 |
| `f1370c` / `f1378k` | 语义未确认 | 仅保留证据 |

**APK 证据**：`OPENCODE_APK_Decompiled_Rules.md` §11。

---

## 4. 战役脚本与目标层差异（P0/P1，影响完整复刻）

### 4.1 战役脚本未系统转为场景配置 【P0】

**APK 证据**：`APK/_analysis/unpack/assets/mods/**/*.js` 共 27 个脚本可解密，包含大量动态参数、剧情触发、目标判断。
**项目证据**：
- [src/game/apk_script_config.ts](file:///c:/code/AncinetEmpires/src/game/apk_script_config.ts) 仅把"安全字面量配置"（金币/单位上限/可招募列表/联盟/禁用队伍/收入覆盖）静态生成 `RuleConfig`
- [src/game/apk_script_manifest.ts](file:///c:/code/AncinetEmpires/src/game/apk_script_manifest.ts) 归档 26 个脚本的逐脚本字面量配置
- 动态逐关卡配置、剧情触发、目标判断仍未转为场景表

### 4.2 未实现的 Async 演出/增援 API 【P1】

| API | APK 出现次数 | 项目状态 |
|---|---:|---|
| `Stage.AsyncMessage` | 187 | ❌ 未实现 |
| `Stage.CreateReinforcement` | 162 | ❌ 未实现 |
| `Stage.AsyncMapFocus` | 67 | ❌ 未实现 |
| `Stage.AsyncReinforce` | 51 | ❌ 未实现 |
| `Stage.AsyncMoveUnit` / `AsyncAttack` / `AsyncDestroyUnit` | 多次 | ❌ 未实现 |
| `Stage.AsyncShowObjectives` | 多次 | ❌ 未实现 |

**APK 证据**：`npm run apk:script-report -- --check` 输出 API 调用计数。
**项目证据**：[src/game/apk_stage.ts](file:///c:/code/AncinetEmpires/src/game/apk_stage.ts) 仅适配同步 `Stage.*` 配置/查询 API。

**影响**：不影响纯 skirmish 训练，但影响完整战役复刻和游戏体验。

### 4.3 水晶（crystal）目标系统未实现 【P1】

| 项 | APK | 项目 |
|---|---|---|
| crystal 单位 | 战役目标单位，可被护送/夺回 | `cost=null / move=0` 不可行动占位 |
| 目标 UI | `AsyncShowObjectives` | ❌ 未实现 |

**APK 证据**：[src/game/units.ts#L46](file:///c:/code/AncinetEmpires/src/game/units.ts#L46) `crystal: { ... move: 0 ... }`；`OPENCODE_APK_Decompiled_Rules.md` §12 提到 `CARRY_FLAG` / `CARRY_UNIT` / `DIVINE_JUDGEMENT` 命令类型。

### 4.4 AEM 尾部 58 字节模板语义未确认 【P1】

| 项 | 状态 |
|---|---|
| 20 张 skirmish 地图尾部 | 全部 `zero_suffix_58`（全零 58 字节） |
| `ff_suffix_58`（全 0xFF） | 8 张战役地图使用 |
| 语义 | 未确认；项目仅保留原始字节，不参与规则推导 |

**APK 证据**：`npm run apk:map-report -- --check` 已门禁非预期尾部。
**项目证据**：[src/game/apk_map.ts](file:///c:/code/AncinetEmpires/src/game/apk_map.ts) `parseApkAemMap` 保留 `tailTemplate` 原始字节、十六进制和模板名。

### 4.5 UnitConfig 未使用字段 【P2，记录性】

反编译 `C0620c.java` 确认 UnitConfig 含字段项目未使用：

| 字段 | 含义 | 当前值 | 项目实现 |
|---|---|---|---|
| `f1382d` 闪避/回避 | 预留字段 | 全部为 0 | ❌ 未使用 |
| `f1384f` 攻击动画风格 | SLASH/DASH | 0 或 1 | ❌ 未使用（纯视觉） |
| `f1396r` 随机头像 | 视觉变体 | - | ❌ 未使用 |

### 4.6 新命令类型未实现 【P2，记录性】

反编译 `EnumC0584a` 确认 27 个命令类型，项目未实现的：

| 命令 | 含义 | 项目状态 |
|---|---|---|
| `CARRY_FLAG` | 携带旗帜 | ❌ 未实现 |
| `CARRY_UNIT` | 携带单位 | ❌ 未实现 |
| `DIVINE_JUDGEMENT` | 神圣审判（战役事件） | ❌ 未实现 |
| `CHANGE_TILE` | 改变地形 | ❌ 未实现 |
| `CHANGE_UNIT_TEAM` | 改变单位阵营 | ❌ 未实现 |
| `POST_STANDBY` / `POST_TURN_START` | 待机后/回合开始后动作 | ❌ 未实现 |

**APK 证据**：`OPENCODE_APK_Decompiled_Rules.md` §12。

---

## 5. UI 与演出层差异（P2，不影响训练）

| 项 | APK | 项目 |
|---|---|---|
| stacked/pending 纯 UI 细节 | 菜单限制、扣费动画、部署后必须行动 | 核心规则已入训练，纯 UI 细节未复刻 |
| 单位 head 头像 | `SyncSetUnitHead` 6 次调用 | 仅作为 `apkUnitHead` 元数据透传，无 UI |
| 攻击动画 SLASH/DASH | `f1384f` 区分 | ❌ 未实现 |
| 单位随机头像 | `f1396r` | ❌ 未实现 |

**项目证据**：[src/game/types.ts](file:///c:/code/AncinetEmpires/src/game/types.ts) 中 Unit 含 `apkUnitHead` 字段。

---

## 6. 反编译新发现但当前不影响规则的字段 【P2，记录性】

| # | 发现 | 来源 | 影响 |
|---|---|---|---|
| 1 | `TileConfig.f1375h` 占领奖励单位类型 | `C0619b.java` | 某些地形占领可能奖励单位，项目未实现 |
| 2 | `UnitConfig.f1382d` 闪避字段 | `C0620c.java` | 当前值均为 0，预留字段 |
| 3 | 经验公式内部支持 9 级 | `C0600q.java` `m4201a` | 项目 skirmish 默认 `levelCap=3`，引擎支持但未启用 |
| 4 | `RuleData.f1293v=9` 中立队伍 ID | `C0611d.java` | 项目未使用中立队伍概念 |
| 5 | `f1280i=50` 敌方单位站己方城堡伤害 | `C0611d.java` | 项目已实现"敌军压己方城堡回合开始扣 50 血" |
| 6 | `f1283l=30` 击杀经验 / `f1284m=10` 助攻经验 / `f1285n=60` 有助攻时击杀经验 / `f1286o=30` 治疗经验 / `f1287p=10` 召唤经验 / `f1288q=10` 支援经验 | `C0611d.java` §9.3 | 项目经验值散落在 [src/game/engine.ts](file:///c:/code/AncinetEmpires/src/game/engine.ts) 中，未集中配置化 |

---

## 7. 差异优先级汇总

| 优先级 | 差异 | 影响 | 证据 |
|---|---|---|---|
| **P0** | 鼓舞持续时间 `f1269H=0` vs `remainingTurns:1` | 训练样本状态衰减时机错位 | §2.1 |
| **P0** | 战役脚本未系统转为场景配置 | 无法完整复刻战役、教程、特殊胜负 | §4.1 |
| **P1** | 致盲持续时间未显式写入 `f1268G=1` | 隐式默认值歧义 | §2.2 |
| **P1** | 非 skirmish 低可信 tile 语义未校准（t80/t81/t82/t83） | 战役地图、未来扩展地图 | §3.2 |
| **P1** | `SyncOverrideMov` 字面量已归档但未系统应用 | 特定单位/地形移动覆盖未批量场景化 | §4.1 |
| **P1** | crystal 只是不可行动占位 | 水晶护送/夺回目标不能还原 | §4.3 |
| **P1** | 复杂行动顺序需实测 | 反击风暴/致盲/普通反击/死亡边界/突击移动 | `apk:skirmish-rule-report` 探针 |
| **P1** | AEM 尾部 58 字节语义未知 | 可能含联盟/玩家颜色/阵营预设 | §4.4 |
| **P1** | 大量 `Async*` 演出 API 未实现 | 影响完整游戏体验，不影响 skirmish 训练 | §4.2 |
| **P2** | 状态存储数据结构差异 | 记录性，语义等价 | §2.3 |
| **P2** | 神庙清除机制实现方式差异 | 记录性，语义等价 | §3.3 |
| **P2** | TileConfig 未使用字段（占领奖励单位类型） | 记录性 | §3.4 |
| **P2** | UnitConfig 未使用字段（闪避、动画、头像） | 记录性 | §4.5 |
| **P2** | 新命令类型未实现（CARRY_FLAG/UNIT、DIVINE_JUDGEMENT 等） | 记录性 | §4.6 |
| **P2** | stacked/pending 纯 UI 细节 | 核心规则已入训练 | §5 |

---

## 8. 关键证据文件索引

### 8.1 APK 证据来源

| 文件/目录 | 说明 |
|---|---|
| `APK/_analysis/unpack/assets/data.bin` | 单位/地形基础数据，DES key `72 6b 00 00 00 00 46 46` |
| `APK/_analysis/unpack/assets/languages/zh.lang` / `en.lang` | 明文规则文案 |
| `APK/_analysis/unpack/assets/maps/*.aem` | 20 张官方 skirmish 地图 |
| `APK/_analysis/unpack/assets/mods/**/*.js` | 27 个战役/教程脚本 |
| `APK/_analysis/unpack/classes.dex` | Java 字节码，含 Stage/Rule API 字符串 |
| `APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/` | jadx 1.4.7 反编译输出 |

### 8.2 项目核心规则文件

| 文件 | 说明 |
|---|---|
| [src/game/rules.ts](file:///c:/code/AncinetEmpires/src/game/rules.ts) | 合法动作生成、伤害计算、招募/pending 逻辑 |
| [src/game/engine.ts](file:///c:/code/AncinetEmpires/src/game/engine.ts) | 回合流程、状态结算、光环触发、动作执行 |
| [src/game/units.ts](file:///c:/code/AncinetEmpires/src/game/units.ts) | 21 单位配置 |
| [src/game/types.ts](file:///c:/code/AncinetEmpires/src/game/types.ts) | 核心类型定义 |
| [src/game/abilities.ts](file:///c:/code/AncinetEmpires/src/game/abilities.ts) | 能力判定、伤害加成、移动消耗 |
| [src/game/rule_config.ts](file:///c:/code/AncinetEmpires/src/game/rule_config.ts) | 规则配置合并、默认值 |
| [src/game/apk_skirmish.ts](file:///c:/code/AncinetEmpires/src/game/apk_skirmish.ts) | SD/SO 模式规则 |
| [src/game/apk_terrain.ts](file:///c:/code/AncinetEmpires/src/game/apk_terrain.ts) | 84 tile 数值归档 |
| [src/game/apk_map.ts](file:///c:/code/AncinetEmpires/src/game/apk_map.ts) | AEM 解析、GameState 生成 |
| [src/game/apk_script_config.ts](file:///c:/code/AncinetEmpires/src/game/apk_script_config.ts) | 脚本字面量配置 → RuleConfig |

### 8.3 可重复验证命令

```bash
# 单位数值复核（21/21 匹配，差异 0）
npm run apk:unit-report -- --check

# 地形数值复核（84/84 匹配，差异 0）
npm run apk:terrain-report -- --check

# 地图解析复核（20/20 匹配，0 unmapped）
npm run apk:map-report -- --check

# 脚本解密复核（27/27 可解密，API 计数一致）
npm run apk:script-report -- --check

# DEX 字符串/方法表复核（必要字符串/方法缺失 0）
npm run apk:dex-report -- --check

# Skirmish 规则复核（27/27 通过）
npm run apk:skirmish-rule-report -- --check

# 训练场景复核（40/40 场景可创建）
npm run apk:training-report -- --check
```

---

## 9. 结论

项目当前定位为 **"APK skirmish 规则训练环境"**，已覆盖核心规则骨架且数值对齐度高。剩余差异按价值排序：

1. **修掉鼓舞持续时间**（P0，单点改动，影响训练样本正确性）— §2.1
2. **显式写入致盲持续时间 1**（P1，单点改动）— §2.2
3. **继续校准非默认低可信 tile**（P1，需实机或反编译回填）— §3.2
4. **系统化战役脚本场景配置**（P0，工作量大，影响完整复刻）— §4.1
5. **补齐水晶目标系统**（P1）— §4.3

历史文档中标记的部分"差异"（如 isInRange、同能力免疫、召唤继承等级、黑魔法师射程、空军打水中 +10）已在代码中修复，本次校准后不再视为未对齐项。

---

*本文档基于 APK 解包资源、jadx 反编译输出与项目源码直接对比生成，未修改任何代码。所有差异项均附带 APK 证据文件位置和项目源码行号链接，便于后续追溯。*
