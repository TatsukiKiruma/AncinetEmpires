# OPENCODE APK 与项目规则对比文档

**分析日期**：2026-07-01  
**APK 版本**：aer-release-4.2.5.1  
**APK SHA256**：51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B  
**对比范围**：APK 解包资源 vs 当前项目 `src/game` 规则实现

---

## 1. 总体结论

当前项目已覆盖 APK 4.2.5.1 的**主要 skirmish 对战规则骨架**：
- 21 个单位、26 个能力、4 个状态已建模
- 核心伤害公式、城堡/村庄/指挥官收入、招募限制、多队伍/联盟、单位上限、可招募列表、价格覆盖、等级上限
- 20 张内置 skirmish `.aem` 地图可解密解析并生成训练用 `GameState`
- SD/SO skirmish 模式终局逻辑与 SO 可招募限制已表达

**仍未完全对齐的核心差异**：
1. **地形语义未完全校准**：APK 有 84 个 tile，项目只有 17 个抽象地形；数值可用但贴图/类别/建筑语义仍有未校准项
2. **战役脚本层未系统化**：大量 `Async*` 剧情、增援、目标 UI 和演出 API 未实现
3. **水晶目标和战役失败/目标 UI 未还原**
4. **部分复杂行动顺序需实测验证**：反击风暴、致盲、普通反击、死亡边界、突击移动的精确顺序
5. **AEM 尾部 58 字节模板语义未知**

---

## 2. 详细规则对比表

### 2.1 单位系统对比

| 规则域 | APK 规则 (data.bin + lang) | 项目实现 (src/game/units.ts) | 差异状态 | 证据 |
|--------|---------------------------|------------------------------|----------|------|
| **单位总数** | 21 个 (APK ID 0-20) | 21 个 UnitClass + crystal 占位 | ✅ 基础对齐 | APK分析§4表、units.ts:25-46 |
| **单位数值** | data.bin 含价格、人口、攻击类型、攻击、物防/魔防、生命成长、移动成长、射程、能力列表 | 已全部对齐 (差异 0) | ✅ 已修正 | `npm run apk:unit-report -- --check` 输出差异 0 |
| **黑魔法师射程** | APK: 1-2 (maxRange=2) | 项目原为 1-1，已修正为 1-2 | ✅ 已修正 | apk_unit_report 校准出、units.ts:32 maxRange:2 |
| **指挥官价格** | data.bin raw cost=400 | 项目 cost=null，通过 commanderRecruitBaseCost=400 表达 | ✅ 刻意差异 | data.bin 单位表、units.ts:44 cost=null、rule_config.ts:213-215 |
| **骷髅/水晶价格** | data.bin 有价格字段但 q=false 不可招募 | 项目 cost=null，不可普通招募 | ✅ 刻意差异 | APK分析§4.1注、units.ts:45-46 cost=null |
| **水晶移动力** | data.bin 移动=4 | 项目 move=0 (不可行动占位) | ✅ 刻意差异 | units.ts:46 move:0、APK分析§4.1注 |
| **APK ID 映射** | 单位/能力/状态均以数字 ID 出现 | apk_compat.ts 提供完整映射 | ✅ 已对齐 | apk_compat.ts |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 4 节、第 4.1 节
- `src/game/units.ts` 第 25-46 行
- `tools/apk_unit_report.ts` 复核命令输出

---

### 2.2 状态系统对比

| 状态 | APK 规则 (lang + Wiki) | 项目实现 | 差异状态 | 证据 |
|------|----------------------|----------|----------|------|
| **中毒** | 回合开始损失 10，无法治疗；亡灵转回血 | 已实现 | ✅ 对齐 | APK分析§6表、abilities.ts:231-249 |
| **鼓舞** | 攻击 +10，远程减半为 +5 | 已实现为 `inspired` 正式状态 | ✅ 对齐 | APK分析§6、rules.ts:54-56、types.ts:11 |
| **致盲** | 射程降为 0 | 已实现 | ✅ 对齐 | APK分析§6、abilities.ts:227-232 |
| **虚弱** | 移动力降为 1，防御 -10，远程攻击时惩罚减半 | 已实现 | ✅ 对齐 | APK分析§6、abilities.ts:220-224 |
| **状态互斥** | 同一时间只能拥有一种状态，已有状态不被替换 | 已按 APK 文案实现：攻击光环附加 inspired 不覆盖已有状态 | ✅ 对齐 | APK分析§6注、engine.ts:354-356 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 6 节
- `src/game/abilities.ts` 第 220-249 行
- `src/game/rules.ts` 第 54-56 行

---

### 2.3 能力系统对比

| 能力 | APK 规则要点 | 项目实现 | 差异状态 | 证据 |
|------|------------|----------|----------|------|
| **空军** | 所有地形移动 1，可穿越地面单位，无地形防御，攻击水中非空军 +10 | 已实现 | ✅ 对齐 | APK分析§5 ID=ID=3、rules.ts:39-41、abilities.ts:94-97 |
| **神射手** | 攻击空军 +10 | 已实现 | ✅ 对齐 | APK分析§5ID=4、rules.ts:33-35 |
| **破坏者** | 可破坏村庄，攻击村庄上单位 +10 | 已实现 | ✅ 对齐 | APK分析§5ID=5、rules.ts:36-38 |
| **召唤师** | 从墓碑召唤骷髅，摧毁/踩墓碑不扣血 | 已实现召唤；踩墓碑/摧毁不扣血 | ✅ 对齐 | APK分析§5ID=6、rules.ts:172-182、engine.ts:319-324 |
| **治疗师** | 治疗随等级上升，**可突破目标最大血量** | **主动治疗已允许突破最大血量** | ✅ 对齐 | APK分析§5ID=7、lang文案、rules.ts:158-169 |
| **投毒者** | 攻击附加中毒，同能力无效 | 已实现 | ✅ 对齐 | APK分析§5ID=8 |
| **亡灵** | 死亡不留墓碑；友军治疗变伤害；踩墓碑/中毒变回血 | 大体实现；回血不突破上限且不压低既有超上限 | ⚠️ 部分差异 | APK分析§5ID=9、engine.ts:319-324、237-249 |
| **近战大师** | 近战伤害 +50% | 已实现 | ✅ 对齐 | APK分析§5ID=10、abilities.ts:173-175 |
| **远程防御** | 受远程攻击伤害 -50% | 已实现 | ✅ 对齐 | APK分析§5ID=11、abilities.ts:177-179 |
| **水/森林/山之子** | 对应地形攻防+10，回合开始治疗，移动 1 | 已实现 | ✅ 对齐 | APK分析§5ID=12-14、abilities.ts:130-165 |
| **战意** | 伤害不受血量影响 | 已实现 | ✅ 对齐 | APK分析§5ID=15、rules.ts:66-68 |
| **反击风暴** | 可反击 2 格内任何攻击，无论致盲 | 已实现 | ✅ 对齐 | APK分析§5ID=16、DEX q.i 证据 |
| **自我修复** | 回合开始回复 25%，不受中毒影响；中毒扣到 0 以下仍先执行 | 已实现 | ✅ 对齐 | APK分析§5ID=17、engine.ts:255-265 |
| **攻击光环** | 待机给 2 格友军附加鼓舞状态 | 已改为正式 inspired 状态，只在 wait 触发 | ✅ 对齐 | APK分析§5ID=18、engine.ts:350-358 |
| **净化光环** | 待机清除友军负面状态并少量治疗 | 已实现，只在 wait 触发 | ✅ 对齐 | APK分析§5ID=19、engine.ts:332-348 |
| **虚弱光环** | 待机给 2 格敌军附加虚弱状态 | 已按 APK 数值实现，只在 wait 触发 | ✅ 对齐 | APK分析§5ID=20、engine.ts:361-370 |
| **突击部队** | 行动后可用剩余移动力再移动，不能被支援 | 已实现 | ✅ 对齐 | APK分析§5ID=21、rules.ts:104-130 |
| **大地之子** | 陆地移动 1，水面移动额外 +1，桥算水面 | 基本实现；桥/水地形映射需确认 | ⚠️ 映射待确认 | APK分析§5ID=22、abilities.ts:114-122 |
| **致盲者** | 攻击附加致盲，同能力无效 | 已实现 | ✅ 对齐 | APK分析§5ID=23 |
| **支援者** | 重置友军待机，不能支援同能力/更高等级/城堡捕获者/突击部队 | 已实现并额外排除城堡捕获者/突击部队；同步重置有效剩余移动力 | ✅ 对齐 | APK分析§5ID=24、rules.ts:184-198 |
| **死亡收割者** | 攻击负面状态单位 +20 | 已实现 | ✅ 对齐 | APK分析§5ID=25、rules.ts:42-44 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 5 节能力表
- `src/game/rules.ts` 第 32-44 行、172-198 行
- `src/game/abilities.ts` 第 130-182 行
- `src/game/engine.ts` 第 319-371 行

---

### 2.4 战斗与伤害公式对比

| 规则项 | APK 规则 (lang + data.bin + 实测) | 项目实现 | 差异状态 | 证据 |
|--------|----------------------------------|----------|----------|------|
| **基础公式** | (攻击 - 防御) × 攻击者血量百分比 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:64-70 |
| **元素防御** | 攻击元素=防守元素时防御+d，不等时-d | 已折算为物理/魔法双防 | ✅ 对齐 | APK分析§4.1、abilities.ts:214-216 |
| **神射手对空军** | 攻击 +10 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:33-35 |
| **空军打水中非空军** | 攻击 +10，同为空军无效 | **已修正增加 +10** | ✅ 已修正 | APK分析§8.1#3、rules.ts:39-41 |
| **破坏者攻村庄** | 攻击 +10 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:36-38 |
| **死亡收割者** | 攻击负面状态 +20 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:42-44 |
| **地形之子加成** | 对应地形攻防 +10 | 已实现 | ✅ 对齐 | APK分析§8、abilities.ts:130-165 |
| **近战大师** | 近战伤害 ×1.5 | 已实现 | ✅ 对齐 | APK分析§8、abilities.ts:173-175 |
| **远程防御** | 受远程攻击伤害 ×0.5 | 已实现 | ✅ 对齐 | APK分析§8、abilities.ts:177-179 |
| **鼓舞加成** | 攻击 +10，远程减半 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:54-56 |
| **虚弱惩罚** | 防御 -10，远程攻击时减半 | 已实现 | ✅ 对齐 | APK分析§8、abilities.ts:220-224、rules.ts:60-61 |
| **战意** | 不按血量削减伤害 | 已实现 | ✅ 对齐 | APK分析§8、rules.ts:66-68 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 8 节
- `src/game/rules.ts` 第 32-75 行
- `src/game/abilities.ts` 第 130-182 行、220-224 行

---

### 2.5 经济、招募与回合规则对比

| 规则项 | APK 规则 (lang + DEX + script + 实测) | 项目实现 | 差异状态 | 证据 |
|--------|--------------------------------------|----------|----------|------|
| **村庄收入** | 每回合 +50 (可配置) | RuleConfig.incomeVillage=50 默认 | ✅ 对齐 | APK分析§7、rule_config.ts:8-9 |
| **城堡收入** | 每回合 +100 (可配置) | RuleConfig.incomeCastle=100 默认 | ✅ 对齐 | APK分析§7、rule_config.ts:9-10 |
| **指挥官收入** | 基础 50 + 每级 25 (可配置) | incomeCommanderBase=50, Growth=25 | ✅ 对齐 | APK分析§7、rule_config.ts:10-11、DEX构造器证据 |
| **招募条件** | 只能己方城堡；城堡空或己方指挥官站城堡例外 | 已实现 recruit_to_castle / recruit_and_deploy | ✅ 对齐 | APK分析§7、rules.ts:223-253 |
| **指挥官站城堡招募** | 有可部署格才允许，招募后堆叠，**不能结束回合/投降** | 已实现 pending 来源区分，指挥官城堡 pending 禁止结束/投降 | ✅ 对齐 | APK分析§7.2、rules.ts:256-262、types.ts:41 |
| **空城堡招募 pending** | 仍可结束回合/投降 | 已实现 allowPendingRecruitEndTurn/Surrender=true | ✅ 对齐 | APK分析§7.2、rules.ts:256-262 |
| **指挥官重招募费用** | 开局 400，阵亡后 500 起每死 +100，保留等级/经验 | commanderRecruitBaseCost=400, CostGrowth=100，记录死亡次数/等级/经验 | ✅ 对齐 | APK分析§7#250、rule_config.ts:211-215、types.ts:55-57 |
| **单位上限** | 可配置 (SyncSetUnitLimit) | RuleConfig.unitLimit 支持 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:13 |
| **人口上限** | 隐含 (DEX 暴露) | RuleConfig.populationLimit 支持 | ✅ 对齐 | rule_config.ts:14、265-267 |
| **可招募列表** | 全局/队伍级可配置 | recruitableUnits 全局/队伍级支持 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:15、223-229 |
| **价格覆盖** | SetPrices 可配置 | RuleConfig.prices 支持 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:16、208-209 |
| **等级上限** | SetLevelCap 可配置 | RuleConfig.levelCap=3 默认 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:12 |
| **联盟** | SyncSetAlliance 可配置 | RuleConfig.alliances 支持 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:26、142-149 |
| **禁用队伍** | SyncDisableTeam/RestoreTeam | RuleConfig.disabledTeams 支持 | ✅ 对齐 | APK分析§8#168-170、rule_config.ts:27、159-161 |
| **skirmish 终局** | 同时无单位且无城堡淘汰 | defeatOnNoUnitsAndNoCastles=true 默认 | ✅ 对齐 | APK分析§7.3#290-295、rule_config.ts:22、apk_skirmish.ts:155 |
| **SO 模式招募限制** | 只开放 APK ID 0-8 | SO 模式 recruitableUnits 仅 0-8 映射单位 | ✅ 对齐 | APK分析§7.3#306-307、apk_skirmish.ts:161-168 |
| **SD 模式招募列表** | 指挥官+18 个普通单位(不含骷髅/水晶) | SD_RECRUITABLE_APK_UNIT_IDS 定义 19 个 ID | ✅ 对齐 | APK分析§7.3#307、apk_skirmish.ts:17-18、167 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 7、8 节
- `src/game/rule_config.ts` 全文
- `src/game/rules.ts` 第 223-263 行
- `src/game/apk_skirmish.ts` 第 17-18、140-171 行
- `src/game/types.ts` 第 41、120-144 行

---

### 2.6 地形与地图导入对比

| 规则项 | APK 规则 (data.bin + .aem + lang) | 项目实现 | 差异状态 | 证据 |
|--------|----------------------------------|----------|----------|------|
| **tile 总数** | 84 条 tile 定义 | 归档 84 条，项目抽象 17 种地形 | ⚠️ 映射不完全 | APK分析§8.1#333-334、apk_terrain.ts |
| **高可信映射** | t27=damaged_town, t36=town, t37=castle, t72=bridge | 4 个高可信映射已建立 | ✅ 对齐 | APK分析§8.1#330-333、apk_terrain.ts |
| **skirmish 近似映射** | 84 tile → 17 项目地形 | SKIRMISH_APK_TERRAIN_TO_PROJECT 映射 | ✅ 训练可用 | APK分析§10#308-330、apk_terrain.ts |
| **地形数值优先级** | 移动/防御/回血优先用 data.bin 当前 tile | APK 导入地图优先使用 apkTerrainId 数值 | ✅ 对齐 | APK分析§10#397-401、terrain_rules.ts |
| **城镇摧毁/修理** | t36→t27 摧毁，t27→t36 修理 | 已同步 APK tile 变更 | ✅ 对齐 | APK分析§10#403、engine.ts |
| **占领同步** | 更新 owner code | 已同步 apkOwnerCode | ✅ 对齐 | APK分析§10#403 |
| **AEM 解析** | 20 张 skirmish 地图可解密 | parseApkAemMap 已实现 | ✅ 对齐 | APK分析§8.2、apk_map.ts |
| **推荐金币** | -1 表示无推荐金币 | 导入时 -1→0，可外部覆盖 | ✅ 对齐 | APK分析§9#190-193、apk_map.ts |
| **尾部 58 字节** | 20 张均为 zero_suffix_58，**语义未知** | 仅保留原始字节/模板名，**不参与规则推导** | ✅ 正确处理 | APK分析§9#195-200、apk_map.ts |
| **桥地形** | 语言表明确：桥也按水面处理 | t72 映射为 bridge，kind=1 与水面组一致 | ✅ 对齐 | APK分析§8.1#333、lang 文案 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 8.1、8.2、10 节
- `src/game/apk_terrain.ts` 全文
- `src/game/terrain_rules.ts` 全文
- `src/game/apk_map.ts` 全文

---

### 2.7 战役脚本 API 对比

| API 类别 | APK API (DEX + 解密 script) | 项目实现 | 差异状态 | 证据 |
|----------|----------------------------|----------|----------|------|
| **同步规则配置** | SyncSetGold, SyncSetUnitLimit, SyncSetRecruitUnits, SetIncome*, SetLevelCap, SetPrices | apk_rule.ts、apk_stage.ts、apk_script_config.ts 已适配 | ✅ 核心对齐 | APK分析§9、11、apk_rule.ts、apk_stage.ts、apk_script_config.ts |
| **同步状态/单位** | SyncSetUnitCode/Static/Targeted/Head/Level/Status/Commander | 已适配 x,y 坐标形态 | ✅ 对齐 | APK分析§11#295-296、apk_stage.ts |
| **查询 API** | CountUnit/Castle/Village, GetUnit/Units, GetTileTeam, CheckCastle/Village, GetDistance | 已适配 x,y 形态 | ✅ 对齐 | APK分析§11#295-296、apk_stage.ts |
| **联盟/队伍控制** | SyncSetAlliance, SyncDisableTeam/RestoreTeam/DestroyTeam, SyncGameOver | 已适配 | ✅ 对齐 | APK分析§11#295-296、apk_stage.ts |
| **移动覆盖** | SyncOverrideMov(code, tileType, mov) | apkMoveOverrides 按 tile ID/kind 覆盖 | ✅ 对齐 | APK分析§11#290、types.ts:48 |
| **剧情/演出 API** | AsyncMessage, AsyncMapFocus, AsyncMoveUnit, AsyncAttack, AsyncDestroyUnit, CreateReinforcement, AsyncReinforce, AsyncShowObjectives | **未实现** (属于剧情/UI层) | ❌ 未实现 | APK分析§11#411-412、447-452 |
| **水晶/目标系统** | 特殊目标单位、护送/夺回目标 | 仅 crystal 占位单位，**目标系统未实现** | ❌ 未实现 | APK分析§4#118、§12#16、§12#22 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 9、11 节
- `src/game/apk_stage.ts` 全文
- `src/game/apk_script_config.ts` 全文
- `src/game/apk_script_manifest.ts` 全文

---

### 2.8 回合开始结算顺序对比

| 步骤 | APK 规则 (lang + 实测) | 项目实现 | 差异状态 | 证据 |
|------|------------------------|----------|----------|------|
| 1. 重置行动状态 | 隐含 | hasMoved/hasActed/hasBeenHealed/Supported/PostAttackMoved=false | ✅ 对齐 | engine.ts:215-221 |
| 2. 中毒结算 | 回合开始扣 10，亡灵回血 10 | 已实现，含剩余 ticks 递减 | ✅ 对齐 | engine.ts:231-250 |
| 3. 中毒致死处理 | 立即死亡，跳过后续 | 已实现 isPoisonDead 标记 | ✅ 对齐 | engine.ts:251-265 |
| 4. 自我修复优先 | 中毒扣到 0 以下仍先执行自我修复 | 已实现 isPoisonDead 分支中优先处理 | ✅ 对齐 | engine.ts:255-261、APK文案 |
| 5. 神庙净化 | 清除负面状态 (含水中神庙) | tileHasTerrainTag('cleanse') 清除 | ✅ 对齐 | engine.ts:269-275、APK分析#451 |
| 6. 地形回复 | 中毒期间失效，友方/中立建筑生效 | 已实现 isCurrentlyPoisoned 判断 | ✅ 对齐 | engine.ts:277-286 |
| 7. 地形之子回复 | 中毒期间失效 | 已实现 | ✅ 对齐 | engine.ts:288-299 |
| 8. 自我修复 | 回复 25% maxHp | 已实现 | ✅ 对齐 | engine.ts:301-308 |
| 9. 金币收入 | 城镇/城堡/指挥官收入汇总 | 已实现 | ✅ 对齐 | engine.ts:191-212 |

**证据来源**：
- `APK规则分析-4.2.5.1.md` 第 8、13 节
- `src/game/engine.ts` 第 170-311 行
- `远古帝国AI训练规则整理.md` 第 13 节

---

### 2.9 待确认/未完成差异 (P0-P2)

| 优先级 | 差异项 | 影响范围 | 当前状态 | 证据 |
|--------|--------|----------|----------|------|
| **P0** | 战役脚本未系统转为场景配置 | 无法完整复刻战役、教程、特殊胜负 | 仅同步配置/查询 API | APK分析§12#18-19、§12#20-21 |
| **P1** | 非 skirmish 低可信 tile 语义未校准 (t80/t81/t82/t83) | 战役地图、未来扩展地图 | 默认训练集已排除 | APK分析§11#517、§12#529-535 |
| **P1** | AEM 尾部 58 字节模板语义未知 | 可能含联盟/玩家颜色/阵营预设 | 仅保留证据，不推导规则 | APK分析§9#195-200、§11#525 |
| **P1** | crystal 只是不可行动占位 | 水晶护送/夺回等目标不能还原 | 单位 code/static/targeted/head 已作元数据 | APK分析§4#118、§12#22 |
| **P1** | 复杂行动顺序需实测 | 反击风暴、致盲、普通反击、死亡边界、突击移动 | 探针结果已文档化，需实测回填 | APK分析§7#154、§6#245、§11#549 |
| **P2** | 净化光环精确数值/对亡灵处理 | 精灵升级加成、亡灵交互 | 基础实现，精确值待确认 | APK分析§6#215、engine.ts:332-348 |
| **P2** | stacked/pending 纯 UI 细节 | 菜单限制、扣费动画等 | 核心规则已入训练，UI 细节未复刻 | APK分析§12#14、§11#523 |
| **P2** | 大量 Async* 演出 API | 影响完整游戏体验、战役复刻 | 不影响纯 skirmish 训练 | APK分析§12#15、§11#447-452 |

### 2.10 反编译确认的 P0/P1 微调项

反编译 `C0600q.java`、`C0595l.java`、`C0611d.java` 后确认以下需项目对齐的关键差异：

| # | 规则 | 反编译证据 | 项目当前实现 | 优先级 | 对应文件 |
|---|------|-----------|-------------|--------|---------|
| 1 | **普通反击 `isInRange`** | `m4287i`: `distance==1 && m4272l(defender,attacker)` — 仅曼哈顿距离=1 且攻击方在防御方射程内才反击 | 项目仅检查 `distance===1`，未显式检查防御方射程 | P0 | `C0600q.java:1214-1219` |
| 2 | **同能力免疫** | `m4328c`: `!defender.hasAbility(POISONER)` 和 `!defender.hasAbility(BLINDING_ATTACK)` | 需确认项目 `canPoison/canBlind` 是否等价 | P0 | `C0600q.java:794-802` |
| 3 | **状态附加顺序** | `m4328c`: 中毒→致盲（严格顺序，第二个用 `return` 提前退出） | 项目 `applyCombatStatusEffects` 顺序一致 | P0 | `C0600q.java:794-802` |
| 4 | **鼓舞持续时间** | `f1269H=0`（仅当回合有效，下次衰减时到期） | 需确认项目 `inspired` 持续时间 | P1 | `C0611d.java:109-110` |
| 5 | **神庙（kind=5）** | 有害状态时清除，否则正常衰减；非有害状态不清除 | 需确认项目 `cleanse` 标签实现 | P1 | `C0595l.java:205-208` |
| 6 | **pending 满槽静默丢弃** | `m4282j`: `if pendingSlot==null` 才允许堆叠，否则丢弃 | 需确认项目叠加招募行为 | P1 | `C0600q.java:198-221` |
| 7 | **召唤继承等级** | `SUMMON` 指令 args 含 `summoner.level` | 项目 `summonUnit` 传递 level | P1 | `C0595l.java:1028` |

---

## 3. 关键证据文件索引

### 3.1 APK 分析文档 (只读证据)
| 文件 | 说明 |
|------|------|
| `APK规则分析-4.2.5.1.md` | 完整 APK 规则分析、单位/能力/状态/地形/脚本/DEX 证据 |
| `APK项目规则对比分析-4.2.5.1.md` | 项目 vs APK 逐项对比、覆盖情况统计表 |
| `APK规则项目对比复核-4.2.5.1.md` | 复核报告、工具化验证命令、差异优先级清单 |

### 3.2 项目核心规则实现
| 文件 | 说明 |
|------|------|
| `src/game/rules.ts` | 合法动作生成、伤害计算、招募/pending 逻辑 |
| `src/game/units.ts` | 21 单位配置 (含 crystal 占位) |
| `src/game/types.ts` | 核心类型定义、Action、GameState、RuleConfig |
| `src/game/abilities.ts` | 能力判定、伤害加成、移动消耗、状态处理 |
| `src/game/engine.ts` | 回合流程、状态结算、光环触发、动作执行 |
| `src/game/rule_config.ts` | 规则配置合并、默认值、招募/收入/胜负判定 |
| `src/game/apk_skirmish.ts` | SD/SO 模式规则、训练场景生成 |
| `src/game/apk_terrain.ts` | 84 tile 数值归档、映射表 |
| `src/game/terrain_rules.ts` | 地形语义判定、APK tile 优先逻辑 |
| `src/game/apk_map.ts` | AEM 解析、GameState 生成 |

### 3.3 可重复验证命令
```bash
# 单位数值复核 (21/21 匹配，差异 0)
npm run apk:unit-report -- --check

# 地形数值复核 (84/84 匹配，差异 0)
npm run apk:terrain-report -- --check

# 地图解析复核 (20/20 匹配，0 unmapped)
npm run apk:map-report -- --check

# 脚本解密复核 (27/27 可解密，API 计数一致)
npm run apk:script-report -- --check

# DEX 字符串/方法表复核 (必要字符串/方法缺失 0)
npm run apk:dex-report -- --check

# Skirmish 规则复核 (27/27 通过)
npm run apk:skirmish-rule-report -- --check

# 训练场景复核 (40/40 场景可创建，mask/序列化对齐)
npm run apk:training-report -- --check
```

---

## 4. 结论与建议

### 当前项目定位
**更接近 "APK skirmish 规则训练环境"**，而非完整 APK 复刻。

### 适合 AI 训练的已就绪项
- ✅ 单位/能力/状态完整建模且数值对齐
- ✅ 核心战斗/移动/经济/招募规则实现
- ✅ 20 张官方 skirmish 地图可导入训练
- ✅ SD/SO 两种对战模式规则配置
- ✅ Observation 暴露 APK 原始 tile 数值、映射可信度、单位静态数值
- ✅ 固定稀疏动作空间、合法动作掩码、动作序列化

### 下一阶段高价值工作
1. **地形映射校准**：优先处理高频 tile (t0/t18/t17/t15/t21/t20/t36/t19/t9/t3)，继续校准非默认低可信 tile
2. **脚本配置系统化**：按关卡输出场景配置表，处理动态参数，区分"规则配置/目标判断/剧情演出"三类
3. **补齐脚本层规则接口**：水晶目标、完整目标条件、脚本配置归档 (优先于 Async* 演出 API)
4. **实机/反编译验证高风险细节**：t80/t83/t81/t82 语义、支援/突击/致盲/反击风暴复杂顺序、净化光环精确数值

---

*本文档基于 APK 解包资源分析与项目源码对比生成，不修改任何代码，仅作规则差异记录与证据归档。*