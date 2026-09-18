# APK 升级规则与项目对比

## 1. 经验阈值（EXP Threshold）

**APK** (`C0613f.java:76-81`, `m4201a`):
```java
public static int m4201a(int level) {
    if (level == 0) return 0;
    return (((level + 1) * 100) * level) / 2;
}
```

| Level | EXP 阈值 | 累积公式 |
|-------|---------|---------|
| 0 | 0 | — |
| 1 | 100 | (2×100×1)/2 |
| 2 | 300 | (3×100×2)/2 |
| 3 | 600 | (4×100×3)/2 |
| 4 | 1000 | (5×100×4)/2 |
| 5 | 1500 | (6×100×5)/2 |
| 6 | 2100 | (7×100×6)/2 |
| 7 | 2800 | (8×100×7)/2 |
| 8 | 3600 | (9×100×8)/2 |
| 9 | **4500** | (10×100×9)/2 |

**Level 反查** (`C0613f.java:92-102`, `m4199b`): 从 9 向下迭代到 1，返回 `exp >= threshold` 的最高等级。

**项目** (`abilities.ts:245-248`, `getExpThresholdForLevel`):
```typescript
export function getExpThresholdForLevel(level: UnitLevel): number {
    if (level <= 0) return 0;
    return ((level + 1) * 100 * level) / 2;
}
```
✅ **一致**

---

## 2. 升级属性成长（Per-Level Stats）

### 2.1 UnitConfig 成长字段

**APK** (`C0620c.java`):

| 字段 | 类型 | 含义 | 对应项目字段 |
|------|------|------|------------|
| `f1385g` | int | 攻击/级（attackPerLevel） | `attackGrowth` |
| `f1387i` | int | 防御/级（defensePerLevel） | `defenseGrowth` |
| `f1389k` | int | 生命/级（hpPerLevel） | `maxHpGrowth` |
| `f1391m` | int | 移动/级（movePerLevel） | `moveGrowth` |

**项目** (`units.ts:16-19`, `UnitConfig`):
```typescript
attackGrowth: number;
defenseGrowth: number;
maxHpGrowth: number;
moveGrowth: number;
```
✅ **字段对齐**

### 2.2 每个等级的实际属性

**APK 即时计算公式**（不存储，每次使用时计算）：

| 属性 | APK 方法 | 公式 | 行号 |
|------|---------|------|------|
| 攻击 | `m4273l` | `baseAtk + atkGrowth × level` | `C0600q:1302-1304` |
| 防御 | `m4266o` | `baseDef + defGrowth × level` | `C0600q:1376-1379` |
| 最大 HP | `m4253y` | `baseHP + hpGrowth × level` | `C0600q:1447-1449` |
| 移动力 | `m4252z` | `baseMove + moveGrowth × level`（虚弱时=1） | `C0600q:1452-1458` |
| 射程 | — | **无成长**（minRange/maxRange 固定） | `C0620c` |
| 能力 | — | **不随等级变化**（固定数组） | `C0620c.f1394p` |
| 元素类型/亲和 | — | **不随等级变化** | `C0620c.f1381c/f1382d` |

**项目** (`abilities.ts:206-243`, `getEffectiveStats`):
```typescript
const attackBonus = base.attackGrowth * level;
const defBonus = base.defenseGrowth * level;
const maxHpBonus = base.maxHpGrowth * level;
const moveBonus = base.moveGrowth * level;
```
✅ **公式一致**

---

### 2.3 APK data.bin 全单位成长表

来源：`npm run apk:unit-report`，对比 project `units.ts`

| APK ID | 单位 | AtkG | DefG | HPG | MovG | 能力随等级变化？ |
|--------|------|------|------|-----|------|----------------|
| 0 | soldier | 10 | 5 | 0 | 0 | 否 |
| 1 | archer | 10 | 5 | 0 | 0 | 否 |
| 2 | water_elemental | 10 | 5 | 0 | 0 | 否 |
| 3 | witch | **5** | 5 | 0 | 0 | 否 |
| 4 | elf | **5** | 5 | 0 | 0 | 否 |
| 5 | wolf | 10 | 5 | 0 | 0 | 否 |
| 6 | golem | **5** | 5 | **25** | 0 | 否 |
| 7 | catapult | 10 | 5 | 0 | 0 | 否 |
| 8 | dragon | 10 | 5 | 0 | 0 | 否 |
| 9 | commander | 10 | 5 | 0 | **1** | 否 |
| 10 | skeleton | 10 | 5 | 0 | 0 | 否 |
| 11 | crystal | 0 | 0 | 0 | 0 | 否 |
| 12 | paladin | **5** | 5 | 0 | 0 | 否 |
| 13 | berserker | 10 | 5 | 0 | 0 | 否 |
| 14 | ghost | 10 | 5 | 0 | **1** | 否 |
| 15 | dark_mage | 10 | 5 | 0 | 0 | 否 |
| 16 | wolf_archer | 10 | 5 | 0 | 0 | 否 |
| 17 | ice_elemental | 10 | 5 | **10** | 0 | 否 |
| 18 | slime | 10 | 5 | **5** | 0 | 否 |
| 19 | mermaid | 10 | 5 | 0 | 0 | 否 |
| 20 | druid | **5** | 5 | 0 | **1** | 否 |

**项目 vs APK 差异**：已由 `npm run apk:unit-report -- --check` 验证为**差异 0**（4 个刻意差异：commander/skeleton/crystal cost，crystal move）。

**无成长（全 0）的单位**：crystal。skeleton 的 HP/移动不成长，但攻击/防御仍随等级成长（AtkG=10、DefG=5）。

---

## 3. 升级时的即时效果（On Level-Up Effects）

### 3.1 APK `m4322d` — 应用经验并处理升级

**APK** (`C0600q.java:860-867`):
```java
public void m4322d(C0613f unit, int newExp) {
    int oldLevel = unit.f1316n;
    unit.f1306d = newExp;
    unit.f1316n = C0613f.m4199b(newExp);      // 从经验重新计算等级
    int levelsGained = unit.f1316n - oldLevel;
    C0620c config = this.f1211b.f1367b[unit.f1303a];
    // HP: currentHP += hpGrowth * levelsGained, clamp [1, 9999]
    unit.f1307e = C0641e.m4121a(unit.f1307e, config.f1389k * levelsGained, 1, 9999);
    // Move: currentMP += moveGrowth * levelsGained, clamp [0, 99]
    unit.f1308f = C0641e.m4121a(unit.f1308f, levelsGained * config.f1391m, 0, 99);
}
```

**APK `m4363a`** — 添加经验并返回等级变化 (`C0600q.java:269-272`):
```java
public int m4363a(C0613f unit, int expAmount) {
    int oldLevel = unit.f1316n;
    m4322d(unit, C0641e.m4121a(unit.f1306d, expAmount, 0, 99999));  // XP clamp [0, 99999]
    return unit.f1316n - oldLevel;  // 返回升了几级
}
```

关键行为：
- **HP**：`currentHP += hpGrowth × levelsGained`（不是设为 maxHP）
  - 如果 `hpGrowth = 0`（多数单位）：HP **不变**
  - 如果 `hpGrowth = 25`（golem）：每升一级 HP +25
- **移动力**：`currentMP += moveGrowth × levelsGained`
  - 如果 `moveGrowth = 0`：移动力不变
  - 如果 `moveGrowth = 1`（commander/ghost/druid）：每升一级 MP +1
- **不自动回满血**：只有 hpGrowth > 0 的单位升级才会增加 HP

### 3.2 项目 `addExp`

**项目** (`abilities.ts:250+`, 2026-07-02 已修正):
```typescript
export function addExp(unit: Unit, amount: number, levelCap: LevelCap = 3): boolean {
    unit.exp = clamp(unit.exp + amount, 0, 99999);
    let upgraded = false;
    let levelsGained = 0;

    while (unit.level < levelCap) {
        const nextLevel = (unit.level + 1) as UnitLevel;
        const threshold = getExpThresholdForLevel(nextLevel);
        if (unit.exp >= threshold) {
            unit.level = nextLevel;
            upgraded = true;
            levelsGained += 1;
        } else {
            break;
        }
    }

    // 简化表示：实际实现包含 [1,9999]/[0,99] clamp，并仅在 movementRemaining 存在时更新。
    unit.hp += UNIT_CONFIGS[unit.unitClass].maxHpGrowth * levelsGained;
    unit.movementRemaining += UNIT_CONFIGS[unit.unitClass].moveGrowth * levelsGained;
    return upgraded;
}
```

### 3.3 对比

| 方面 | APK | 项目 | 一致？ |
|------|-----|------|-------|
| HP 增长 | `currentHP += hpGrowth × levelsGained` | `hp += maxHpGrowth × levelsGained` | ✅ **已修正** |
| 移动增长 | `currentMP += moveGrowth × levelsGained` | `movementRemaining += moveGrowth × levelsGained`（存在该字段时） | ✅ **已修正** |
| 单次多级升级 | ✅ 支持（按 levelsGained 累计） | ✅ 支持（while 循环） | ✅ |
| 等级上限 | 最高 9（`m4199b` 硬编码） | 取决于 `levelCap` 配置（默认 3） | ⚠️ **机制不同** |
| 满级时加经验 | 达到 9 级后经验仍可累计，但等级不变 | 经验继续累计，等级不超过 `levelCap` | ✅ **已修正** |

**复现场景**：士兵 HP=50/100，升 1 级（hpGrowth=0）

| 步骤 | APK 预期 | 项目当前 |
|------|---------|---------|
| 升级后 HP | `50 + 0 × 1 = 50`（不变） | `50` |
| 差异 | 无 | ✅ |

**复现场景**：指挥官移动力从 4/4 升 1 级（moveGrowth=1）

| 步骤 | APK 预期 | 项目当前 |
|------|---------|---------|
| 升级后移动力 | `4 + 1 × 1 = 5` | 已追踪剩余移动力时同步 `+1` |
| 差异 | 无 | ✅ |

---

## 4. 经验获取来源（EXP Sources）

### 4.1 APK exp 常量

**APK** (`C0611d.java`):

| 字段 | 默认值 | 含义 |
|------|-------|------|
| `f1283l` | **30** | 攻击经验（attacker） |
| `f1284m` | **10** | 助攻/反击未击杀经验 |
| `f1285n` | **60** | 默认击杀经验（通用） |
| `f1286o` | **30** | 治疗/治愈经验 |
| `f1287p` | **10** | 召唤经验 |
| `f1288q` | **10** | 支援动作经验 |

### 4.2 APK 各动作经验发放（反编译证据）

| 动作 | APK 方法 | 经验值 | 行号 |
|------|---------|--------|------|
| **攻击** | `m4464a` → 攻击者 | `f1283l = 30` | `C0595l:332-352` |
| **攻击杀死** | `m4464a` → 攻击者 | `m4458a(...)` = 脚本重写或 `f1285n = 60` | `C0595l:347-348` |
| **反击** | `m4469a` → 反击者 | 若未杀死: `f1284m = 10`，若杀死: `m4458a(...)` = 默认 60 | `C0595l:272-278` |
| **治疗** | `m4450b` → 治疗者 | 存活治疗经验 `f1286o = 30`；治疗击杀亡灵当前项目仍按默认击杀经验 60 | `C0595l:555` |
| **支援** | `m4424m` → 支援者 | `f1288q = 10` | `C0595l:1054` |
| **召唤** | `m4426l` → 召唤师 | `f1287p = 10` | `C0595l:1029` |
| **待机/光环** | `m4442d` | **无经验** | — |

**`m4458a` 详细逻辑** (`C0595l:41-43`):
```java
private int m4458a(C0613f attacker, C0613f defender) {
    int scriptOverride = this.f1198a.f1089i.m4390a(attacker, defender);
    return scriptOverride > 0 ? scriptOverride : f1285n;  // 默认 60
}
```
- 先调用 JS 脚本 `OverrideKillExp(attacker, defender)` 获取重写值
- 若无脚本重写（返回 -1），使用 `f1285n = 60`

**注意**：APK 中主动攻击和反击的击杀经验都会改用 `m4458a(...)`（默认 60），不会与普通攻击/助攻经验叠加。

### 4.3 项目 exp 发放

**项目** (`engine.ts`):

| 动作 | 经验值 | 行号 |
|------|--------|------|
| 攻击 | `30` | `engine.ts:487` |
| 反击 | `10` | `engine.ts:516` |
| 反击杀死 | `60`（替换） | `engine.ts` attack case |
| 攻击杀死 | `60`（替换） | `engine.ts` attack case |
| 治疗（存活目标） | `30` | `engine.ts:561` |
| 治疗杀死亡灵 | `60` | `engine.ts:553` |
| 召唤 | `10` | `engine.ts:597` |
| 支援 | `10` | `engine.ts:616` |
| 摧毁建筑 | `30` | `engine.ts:635` |

### 4.4 对比

| 动作 | APK | 项目 | 一致？ |
|------|-----|------|-------|
| 攻击 | 30 | 30 | ✅ |
| 攻击杀死 | 60（`m4458a` 默认） | 60（替换普通攻击经验） | ✅ **已修正** |
| 反击 | 未杀：10（`f1284m`） | 10 | ✅ |
| 反击杀死 | 60（`m4458a` 默认） | 60（替换助攻经验） | ✅ **已修正** |
| 治疗（存活） | 30（`f1286o`） | 30 | ✅ |
| 召唤 | 10 | 10 | ✅ |
| 支援 | 10 | 10 | ✅ |
| 反击风暴杀死 | 60（同反击击杀） | 60 | ✅ **已修正** |
| 脚本 OverrideKillExp | ✅ 支持 JS 重写 | ❌ **未实现** | ❌ |

---

## 5. 能力随等级变化（Level-Scaling Abilities）

### 5.1 APK 中隐式依赖等级的能力

APK 的能力**列表**不随等级变化，但部分能力的**效果值**依赖单位等级：

| 能力 | 公式 | 依赖 | APK 方法 |
|------|------|------|---------|
| **主动治疗** | `40 + 10 × healerLevel` | 治疗者等级 | `f1295x/f1296y`；语言表确认可超上限 |
| **净化光环小额治疗** | `10 + 5 × unitLevel` | 光环单位等级 | 当前项目与语言表门禁一致 |
| **支援** | 重置已待机友军行动状态 | 支援者/目标等级只影响合法性 | `m4267n`/`m4434h`；Verified Mechanics 确认不允许二次支援 |
| **指挥官收入** | `50 + 25 × commanderLevel` | 指挥官等级 | `m4346b:614` |
| **地形防御加成** | `10 + 0 × level`（默认 f1264C=0） | 单位等级 | `m4342b:635` |
| **经验升级阈值** | `((level+1)*100*level)/2` | 等级 | `m4201a` |

### 5.2 项目实现

**项目** (`engine.ts`):
- 治疗：`healVal = unitClass === 'paladin' ? (40 + level * 10) : 40` — 与语言表和当前门禁一致
- 净化光环：`healVal = 10 + level * 5` — 小额治疗，独立于主动治疗
- 支援：只重置行动状态；`OPENCODE_APK_Verified_Mechanics.md` 已确认支援执行写入目标行动/已支援标记
- 指挥官收入：`incomeCommanderBase + level * incomeCommanderGrowth`（默认 50+25*L）— **对齐**

**`rules.ts:184-206`** 的项目支援实现**不处理治疗/伤害**，只重置 `hasActed`：
```typescript
// 项目：支援只重置行动状态
target.hasActed = false;
target.hasMoved = false;
target.movementRemaining = getEffectiveStats(target).move;
```

对比 APK 支援执行 (`C0595l.java:878-886`，见 `OPENCODE_APK_Verified_Mechanics.md`):
```java
target.f1311i = false;    // 重置已行动标记
target.f1312j = true;     // 设置已支援标记
recalcMovement(target);   // 重新计算剩余移动力
```

### 5.3 对比

| 能力 | APK 等级相关公式 | 项目公式 | 一致？ |
|------|-----------------|---------|-------|
| 主动治疗 | `40 + 10 × level` | paladin: `40 + 10 × level` | ✅ |
| 净化光环 | `10 + 5 × level` | `10 + level × 5` | ✅ |
| 支援 | 重置待机友军行动状态 | 重置 `hasActed/hasMoved/movementRemaining` | ✅ |
| 指挥官收入 | `50 + 25 × level` | `incomeCommanderBase + level × incomeCommanderGrowth`（50+25×L） | ✅ **数值一致** |
| 地形防御成长 | `10 + 0 × level`（默认关闭） | 未实现地形防御成长 | ✅ **均默认 0 成长** |

---

## 6. 等级上限（Level Cap）

### 6.1 APK

- **硬编码上限**：9 级（`m4199b` 迭代 9→1，不可能超过 9）
- **可招募上限**：`f1279h = 3` — 从城堡招募的单位最高 3 级
- **经验继续积累**：达到 9 级后经验仍可增加（`m4363a` 用 `C0641e.m4121a(..., 0, 99999)` 限制总经验不超过 99999），但等级不再变化

### 6.2 项目

- **等级上限**：默认为 3（作为 `LevelCap` 类型），可通过 RuleConfig 配置
- **满级后经验**：2026-07-02 已改为继续累计经验，但等级不超过 `levelCap`

### 6.3 对比

| 方面 | APK | 项目 | 一致？ |
|------|-----|------|-------|
| 招募上限 | 3 级 | 3 级（默认） | ✅ |
| 可达最高等级 | 9 级（硬编码） | 取决于 levelCap 配置 | ⚠️ **项目默认 3，需要配置** |
| 满级后加经验 | 允许但等级不增 | 允许但等级不增 | ✅ **已修正** |
| 单个动作升级多级 | ✅ 支持 | ✅ 支持（while 循环） | ✅ |

---

## 7. 单位工厂初始化等级（Unit Factory Level)

**APK** (`m4333c` — 单位构造工厂, `C0600q:741-760`):
```java
public C0613f m4333c(int unitTypeId, int team, int level) {
    C0613f unit = new C0613f();
    // ...
    unit.f1307e = config.f1388j + (config.f1389k * level);  // HP = baseHP + hpGrowth*level
    unit.f1306d = C0613f.m4201a(level);  // 经验 = 该等级的阈值
    unit.f1316n = level;                 // 等级直接设置
    m4358a(unit, NONE, 0, true);         // 清除状态
    m4379A(unit);                        // 重置行动标志（hasActed=false, hasMoved refreshed）
    return unit;
}
```

**APK** (`m4282j` — 放置方法, `C0600q:198-221`):
在 `m4333c` 之后调用 `m4379A(unit)` 又调一次（冗余），然后放置到地图或 pending。

**项目**（单位创建各处分散，无统一工厂）：
- 招募时：HP=100, exp=0/level=0, `hasMoved=false`
- 召唤时：HP=100, exp=0, level=召唤师等级
- 脚本创建：通过 `campaign_events.ts`

**对比**:

| 方面 | APK | 项目 | 一致？ |
|------|-----|------|-------|
| 初始 HP | `baseHP + hpGrowth × level` | 100（硬编码） | ⚠️ 项目忽视 hpGrowth |
| 初始 exp | `threshold(level)` | 0 或 `getExpThresholdForLevel(level)` | ⚠️ 部分对齐 |
| 初始等级 | 直接赋值 | 直接赋值 | ✅ |
| 初始状态 | 清除为 NONE | undefined | ✅ |

---

## 8. 项目升级相关不一致汇总

| # | 差异 | APK | 项目 | 优先级 |
|---|------|-----|------|--------|
| 1 | **升级 HP 处理** | `currentHP += hpGrowth × levelsGained` | 已按成长值增加当前 HP | ✅ 已修正 |
| 2 | **升级移动力处理** | `currentMP += moveGrowth × levelsGained` | 已在 `movementRemaining` 存在时同步增长 | ✅ 已修正 |
| 3 | **反击经验** | 未击杀 10，击杀默认 60 | 已按 10/60 替换发放 | ✅ 已修正 |
| 4 | **攻击杀死总经验** | 60（`m4458a` 默认） | 已改为 60，不叠加普通攻击 30 | ✅ 已修正 |
| 5 | **支援治疗/伤害** | 已按 Verified Mechanics 修正为重置行动状态 | 项目只重置行动状态 | ✅ 文档口径已修正 |
| 6 | **治疗公式** | 主动治疗 `40 + 10 × level`；净化光环 `10 + 5 × level` | 项目一致 | ✅ 文档口径已修正 |
| 7 | **满级后加经验** | 允许但不升级 | 已允许经验继续累计 | ✅ 已修正 |
| 8 | **脚本 OverrideKillExp** | 支持 JS 回调覆盖击杀经验 | 未实现 | P1 |
| 9 | **等级上限** | 硬编码 9 级 | 配置化（默认 3） | ⚠️ 刻意差异 |
| 10 | **单位初始 HP** | `baseHP + hpGrowth × level` | 100 硬编码 | P1 |

---

## 9. 证据文件索引

| APK 文件 | 方法 | 内容 |
|----------|------|------|
| `C0613f.java:76-81` | `m4201a` | 经验阈值公式：`((level+1)*100*level)/2` |
| `C0613f.java:92-102` | `m4199b` | 经验反查等级（9→1 迭代） |
| `C0600q.java:860-867` | `m4322d` | 升级核心：XP 设置 + HP/移动增长 |
| `C0600q.java:269-272` | `m4363a` | 添加经验并返回等级变化数 |
| `C0600q.java:1302-1304` | `m4273l` | 攻击 = `baseAtk + atkGrowth × level` |
| `C0600q.java:1376-1379` | `m4266o` | 防御 = `baseDef + defGrowth × level` |
| `C0600q.java:1447-1449` | `m4253y` | 最大 HP = `baseHP + hpGrowth × level` |
| `C0600q.java:1452-1458` | `m4252z` | 移动力 = `baseMove + moveGrowth × level` |
| `C0600q.java:741-760` | `m4333c` | 单位工厂：HP/exp/level 初始化 |
| `C0600q.java:940-942` | `m4314e` | 设置单位到指定等级（指挥官复活用） |
| `C0600q.java:1401-1407` | `m4260r` | 距下一级所需经验 |
| `C0595l.java:41-43` | `m4458a` | 击杀经验（脚本重写或默认 60） |
| `C0595l.java:329-353` | `m4464a` | 攻击动作经验发放（30 攻击 + 60/其他 击杀） |
| `C0595l.java:262-280` | `m4469a` | 反击动作经验发放（10 非击杀或 60 击杀） |
| `C0595l.java:1011-1032` | `m4426l` | 召唤动作经验发放（10） |
| `C0595l.java:1036-1057` | `m4424m` | 支援动作经验发放（10） |
| `C0611d.java:43-59` | — | 经验常量：f1283l=30, f1284m=10, f1285n=60, f1286o=30, f1287p=10, f1288q=10 |
| `C0611d.java:31-32` | — | f1279h=3（招募等级上限） |
| `C0620c.java:28-47` | — | UnitConfig 成长字段：g=atk, i=def, k=hp, m=mov |

| 项目文件 | 函数 | 内容 |
|----------|------|------|
| `abilities.ts:245-248` | `getExpThresholdForLevel` | 经验阈值公式（与 APK 一致） |
| `abilities.ts:250-272` | `addExp` | 添加经验并处理升级 |
| `abilities.ts:206-243` | `getEffectiveStats` | 属性计算公式（含等级成长） |
| `engine.ts:472-537` | attack case | 攻击/反击经验发放 |
| `engine.ts:539-569` | heal case | 治疗经验发放 |
| `engine.ts:571-604` | summon case | 召唤经验发放 |
| `engine.ts:606-623` | support case | 支援经验发放（**无 HP 变化**） |
| `units.ts:25-47` | UNIT_CONFIGS | 全单位配置（含成长值） |
