# OPENCODE APK 实机规则核实文档

**分析日期**：2026-07-01  
**APK 版本**：aer-release-4.2.5.1  
**分析方法**：反编译 Java 源码精确追踪（jadx 1.4.7，全1643类反编译）  
**分析范围**：6 项待核实机制

---

## 目录
1. [致盲与同次反击的交互](#1-致盲与同次反击的交互)
2. [反击风暴触发条件](#2-反击风暴触发条件)
3. [反击击杀与突击后移动](#3-反击击杀与突击后移动)
4. [二次支援可行性](#4-二次支援可行性)
5. [t80/t83/t81/t82 地形语义](#5-t80t83t81t82-地形语义)
6. [鼓舞+虚弱叠加的近战/远程伤害](#6-鼓舞虚弱叠加的近战远程伤害)

---

## 1. 致盲与同次反击的交互

### 问题
本次攻击命中后刚附加致盲状态，是否影响同一次反击？

### 反编译证据

命令队列处理顺序（`C0586f.java:307-334`）：
```java
case 1:  // ATTACK 先执行
    m4500d().m4464a(ax, ay, dx, dy, dmg, anim);
    return;
case 9:  // COUNTER_ATTACK 后执行
    m4500d().m4469a(ax, ay, dx, dy);
    return;
```

主动攻击 `m4464a`（`C0595l.java:329-353`）：
```java
public void m4464a(int ax, int ay, int dx, int dy, int dmg, EnumC0603b anim) {
    C0613f attacker = getUnitAt(ax, ay);
    C0613f defender = getUnitAt(dx, dy);
    // Step 1: 对防御方扣血
    dmg = -applyDamage(defender, calcDamage(attacker, defender));
    // Step 2: 攻击方附加状态给防御方（中毒/致盲）
    m4328c(attacker, defender);  // ← 致盲在此处应用
    // 通知 UI、处理防御方死亡...
}
```

反击执行 `m4469a`（`C0595l.java:262-281`）：
```java
public void m4469a(int ax, int ay, int dx, int dy) {
    C0613f attacker = getUnitAt(ax, ay);
    C0613f defender = getUnitAt(dx, dy);
    // Step 1: 检查反击条件
    if (m4287i(attacker, defender)) {  // ← 此时防御方已被致盲
        // 执行反击...
    }
}
```

致盲对 `m4272l` 的影响（`C0600q.java:1416-1420`）：
```java
public int m4258t(C0613f unit) {   // 最大射程
    if (m4256v(unit) == EnumC0615h.BLINDED) {
        return 0;  // 致盲时最大射程=0
    }
    return config.maxRange;
}

public int m4257u(C0613f unit) {   // 最小射程
    if (m4256v(unit) == EnumC0615h.BLINDED) {
        return 0;  // 致盲时最小射程=0
    }
    return config.minRange;
}
```

### 结论

**普通反击（非 COUNTER_MADNESS）**：
- 流程：ATTACK 命令（伤害→致盲）→ COUNTER_ATTACK 命令（检查条件→执行）
- `m4287i` 调用 `m4272l(defender, attacker)` → `m4313e(defender, ax, ay)` → `m4258t(defender)` 返回 **0**
- `m4313e` 检查 `minRange ≤ distance ≤ maxRange`，此时 maxRange=0 → 在距离≥1 时永远返回 false
- ✅ **确认：本次攻击刚附加的致盲确实会阻止同一次普通反击**

**反击风暴（COUNTER_MADNESS）**：
- `m4287i` 中：`return m4263p(defender, attacker) <= 2` — 只检查距离，不查射程
- ✅ **确认：致盲不会阻止反击风暴**

| 场景 | 距离 | 普通反击 | 反击风暴 |
|------|------|---------|---------|
| 未致盲 | 1 | ✅ 触发 | ✅ 触发 |
| 未致盲 | 2 | ❌ (距离≠1) | ✅ 触发 |
| **本次刚致盲** | **1** | **❌ 不触发** | **✅ 触发** |

---

## 2. 反击风暴触发条件

### 问题
反击风暴在 1/2/3 格、被致盲、防守方死亡边界时是否触发？

### 反编译证据

反击判定全源码（`C0600q.java:1214-1219`）：
```java
public boolean m4287i(C0613f attacker, C0613f defender) {
    // 条件1: 防御方存活（HP > 0）
    if (m4277k(defender) && m4281j(attacker, defender)) {
        if (m4359a(defender, EnumC0614g.COUNTER_MADNESS)) {
            // 反击风暴：只检查距离
            return m4263p(defender, attacker) <= 2;
        } else {
            // 普通反击：距离==1 且攻击方在射程内
            return m4263p(defender, attacker) == 1 && m4272l(defender, attacker);
        }
    }
    return false;
}
```

条件分解：

| 条件 | 方法 | 语义 |
|------|------|------|
| `m4277k(defender)` | `defender.f1307e > 0` | 防御方HP>0 |
| `m4281j(attacker, defender)` | `m4317e(attacker.team, defender.team)` | 敌对队伍 |
| `m4263p(defender, attacker)` | 曼哈顿距离 | 棋盘格距离 |
| `m4272l(defender, attacker)` | `m4313e(defender, ax, ay)` | 攻击方在防御方攻击范围内 |

`m4277k` 死亡边界检查（`C0600q.java:1279-1281`）：
```java
public boolean m4277k(C0613f unit) {
    return unit != null && unit.f1307e > 0;
}
```

### 结论

| 场景 | 距离 | 反击风暴 | 原因 |
|------|------|---------|------|
| 存活未致盲 | 1 | ✅ | `distance≤2` |
| 存活未致盲 | 2 | ✅ | `distance≤2` |
| 存活未致盲 | 3 | ❌ | `distance>2` |
| **存活已致盲** | 1-2 | **✅** | 不检查射程，仅查距离 |
| **被攻击致死** | 任意 | **❌** | `m4277k` 返回 false（HP≤0） |

**关键发现**：
- 反击风暴在距离≤2 时**强制触发**，无视致盲、无视射程
- 如果防御方被攻击杀死（HP≤0），**连反击风暴也不会触发**（`m4277k` 在第一步检查）

---

## 3. 反击击杀与突击后移动

### 问题
防守方反击击杀攻击方后，突击部队（ASSAULT_FORCE）的突击后移动是否完全取消？

### 反编译证据

反击流程完整跟踪（`C0595l.java:262-281`）：
```java
public void m4469a(int ax, int ay, int dx, int dy) {
    C0613f attacker = getUnitAt(ax, ay);
    C0613f defender = getUnitAt(dx, dy);
    if (m4287i(attacker, defender)) {
        // 对攻击方扣血（反击伤害）
        int counterDmg = calcDamage(defender, attacker);
        applyDamage(attacker, -counterDmg);
        // 防御方附加状态给攻击方
        m4328c(defender, attacker);
        // 判断攻击方生死
        if (m4277k(attacker)) {    // 存活
            exp = assistExp;        // 助攻经验 10
        } else {                   // 死亡
            exp = killExp;          // 击杀经验
            destroyUnit(attacker);  // 销毁单位
        }
        emitChangeExp(defender.position, exp);
    }
}
```

突击部队后动作处理（`C0595l.java:528-538`）：
```java
public void m4452b(int x, int y) {
    C0613f unit = getUnitAt(x, y);
    if (!m4277k(unit)) {              // 攻击方已死亡
        m4377C(null);                  // 清除选择
        resetMenu();                   // 重置菜单
    } else if (unit.f1308f > 0 && hasAbility(ASSAULT_FORCE)) {
        showAssaultMoveMenu();         // 显示突击移动菜单
    } else {
        standby(x, y);                 // 待机
        triggerAuras(x, y);            // 触发光环
    }
}
```

命令队列顺序（`C0595l.java:922-928`）：
```java
// m4432i — 攻击动作入口
// 队列顺序：先入先出 (addLast)
queueCommand(ATTACK, ...);             // 1. 攻击
queueCommand(COUNTER_ATTACK, ...);     // 2. 反击
queueCommand(POST_ACTION, ...);        // 3. 后动作（含突击检查）
```

### 结论

✅ **确认：反击击杀攻击方后，突击后移动被完全取消**

执行序列：
```
ATTACK → COUNTER_ATTACK → POST_ACTION
                            ↓
                     m4452b(攻击方坐标)
                            ↓
                    m4277k(unit) = false
                            ↓
                    m4377C(null)  → 不进入突击菜单
```

即使攻击方有 ASSAULT_FORCE 能力且有剩余移动力，由于反检查 `m4277k` 返回 false（HP≤0），突击菜单不会被显示。

---

## 4. 二次支援可行性

### 问题
支援后目标再次行动，再被第二个支援者支援是否永远不允许？

### 反编译证据

支援条件检查（`C0600q.java:1371-1373`）：
```java
public boolean m4267n(C0613f supporter, C0613f target) {
    return target != null
        && target.f1311i           // 目标已行动
        && !target.f1312j          // 目标尚未被支援过
        && sameTeam(supporter, target)
        && supporter.hasAbility(SUPPORTER)
        && !target.hasAbility(SUPPORTER)
        && supporter.level >= target.level;
}
```

支援执行（`C0595l.java:878-886`）：
```java
public void m4434h(int x, int y) {
    C0613f target = getUnitAt(x, y);
    target.f1311i = false;    // 重置已行动标记
    target.f1312j = true;     // 设置已支援标记 ← 关键！
    recalcMovement(target);   // 重新计算剩余移动力
    notifyUI(supportEvent);
}
```

### 结论

✅ **确认：二次支援永远不允许**

第一次支援后的状态变化：
```
支援前: target.f1311i = true,  target.f1312j = false
支援后: target.f1311i = false, target.f1312j = true
```

第二次支援时 `m4267n` 检查：
- `target.f1311i` 要求 **true** → 实际 **false** ❌
- `target.f1312j` 要求 **false** → 实际 **true** ❌

两个条件均失败，第二次支援在任何情况下（无论支援者等级/能力）都无法执行。

**注意**：`f1312j` 还有另一个赋值路径——待机 `m4436g` 对 CASTLE_CAPTOR 和 ASSAULT_FORCE 单位也设置 `f1312j = true`，这意味着：
- CASTLE_CAPTOR 和 ASSAULT_FORCE 单位在待机后**永远无法被支援**
- 其他单位在待机后 `f1312j` 保持 false（仍可支援），但 `f1311i` 保持 true（尚未被重置）→ 实际上仍可被支援**一次**

---

## 5. t80/t83/t81/t82 地形语义

### 反编译证据

TileConfig 字段定义（`C0619b.java:8-41`）：
```java
public class C0619b {
    public boolean f1368a;   // isWater
    public int f1369b;       // kind (0=plain, 1=mountain, 2=forest, 3=castle, 4=village, 5=capital, 6-8=other)
    public int f1370c;       // unknown (可能在 C0600q.m4357a 移动消耗中用作 override)
    public int f1371d;       // defenseBonus
    public int f1372e;       // incomeBonus
    public int f1373f;       // moveCost
    public boolean f1374g;   // isCapturable
    public int f1375h;       // captureReward (>=0 → DESTROYER 可破坏并奖励单位)
    public int f1376i;       // repairTarget (修理后变成的地形 ID)
    public int[] f1377j;     // spriteVariant
    public int f1378k;       // unknown (可能在 C0600q.f1362a 移动范围计算中使用)
}
```

### data.bin 数值对比

从项目 `apk_terrain.ts` 提取的 4 个低可信 tile 数值：

| Tile ID | kind | isWater (f1368a) | defBonus | moveCost | healPerTurn (注1) | isCapturable (f1374g) | 项目映射 |
|---------|------|-----------------|----------|----------|-------------------|----------------------|---------|
| **t80** | 4 (village) | true (flagA=1) | 10 | 1 | 20 | false (flagB=0) | 项目地形 12 (神庙) |
| **t81** | 8 | false (flagA=0) | 10 | 3 | 0 | false (flagB=0) | 项目地形 2 (水) |
| **t82** | 8 | false (flagA=0) | 10 | 3 | 0 | false (flagB=0) | 项目地形 2 (水) |
| **t83** | 8 | false (flagA=0) | 10 | 3 | 20 | false (flagB=0) | 项目地形 16 (治疗平台) |

注1：healPerTurn 在反编译 TileConfig 中不存在独立字段；项目通过 `APK_TERRAIN_CONFIGS` 的解析逻辑从 data.bin 中推导。

### kind 语义对照表（从 C0600q.java 使用点推导）

| kind | 语义 | 关键代码证据 |
|------|------|------------|
| 0 | 平原/草地 | 默认 fallthrough，`!isWater && kind=0` |
| 1 | 山地 | `m4364a`/`m4342b`: `kind==1 && SON_OF_MOUNTAIN` |
| 2 | 森林 | `m4364a`/`m4342b`: `kind==2 && SON_OF_FOREST` |
| 3 | 城堡 | `m4346b` income, `m4321d` capturable by CASTLE_CAPTOR |
| 4 | 村庄 | `m4346b` income, `m4321d` capturable by VILLAGE_CAPTOR |
| 5 | 首都/圣坛 | `m4472a`: `kind==5 && harmfulStatus → cleanse` |
| 6 | 桥梁/码头 | t28: `kind=6`, t37(capital): `kind=6` |
| 7 | 不可通行 | t38: `kind=7, moveCost=3, flagA=0` |
| 8 | 建筑 | t31-t36: kind=8（包含城镇、神庙等） |

### 结论

| Tile | 语义推断 | 置信度 | 说明 |
|------|---------|--------|------|
| **t80** | **特殊村庄/神庙混合** | 中 | kind=4(村庄) + healPerTurn=20 + variant=5 → 神庙贴图的村庄，不可占领 |
| **t81** | **水面障碍物（浮冰/礁石）** | 中 | kind=8 + isWater=false + moveCost=3 → 不下水的装饰性障碍 |
| **t82** | **水面障碍物（浮冰/礁石）** | 中 | 同 t81，variant=1 |
| **t83** | **水中治疗平台** | 低 | kind=8 + healPerTurn=20 + variant=5 → 功能类似神庙的水中版，不可占领 |

**对训练的影响**：
- t80/t83 在 skirmish 地图中作为装饰性建筑出现（无占领价值但有治疗功能）
- t81/t82 在 skirmish 地图中作为水面障碍出现（不可通行装饰）
- 7张 skirmish 地图用到这些 tile，当前 `SKIRMISH_APK_TERRAIN_TO_PROJECT` 映射已近似处理

---

## 6. 鼓舞+虚弱叠加的近战/远程伤害

### 问题
鼓舞（INSPIRED）和虚弱（WEAKENED）同时存在时，近战和远程伤害是否与项目一致？

### 反编译证据

完整伤害计算（`C0600q.java:646-658`）：

```java
public int m4339b(C0613f attacker, C0613f defender) {
    // === 攻击方攻击力 ===
    int atkPower = m4273l(attacker)               // baseAtk + atkGrowth*level
                 + m4360a(attacker, defender);    // 能力攻击加成（含鼓舞）

    // === 防御方防御力 ===
    int defPower = m4266o(defender)               // baseDef + defGrowth*level
                 + m4320d(attacker, defender);    // 防御修正（含虚弱、元素、地形）

    // === 原始伤害 ===
    int rawDamage = atkPower > defPower ? atkPower - defPower : 0;

    // === 战意（BLOODTHIRSTY）跳过血量比例 ===
    if (!attacker.hasAbility(BLOODTHIRSTY)) {
        rawDamage = rawDamage * attacker.currentHP / attacker.maxHP;
    }

    // === 近战大师 / 远程防御 修正 ===
    int multiplier = 100;
    if (distance == 1 && attacker.hasAbility(MELEE_MASTER) && !defender.hasAbility(MELEE_MASTER)) {
        multiplier = 150;   // ×1.5
    }
    if (distance > 1 && defender.hasAbility(RANGED_DEFENDER)) {
        multiplier -= 50;   // ×0.5
    }

    // === 联盟伤害减免 ===
    int allyReduction = (C0641e.m4119a(f1237i, defender.team, 0) == 1) ? f1267F : 0;
    // f1267F = 0（默认无减免）

    return (rawDamage * multiplier * (100 - allyReduction)) / 10000;
}
```

鼓舞加成 `m4360a` 相关片段（`C0600q.java:297-298`）：
```java
if (attacker.isInspired()) {
    int bonus = f1275d;  // 10
    if (distance > 1) {
        bonus /= 2;      // 远程减半 → 5
    }
    atkBonus += bonus;
}
```

虚弱惩罚 `m4320d` 相关片段（`C0600q.java:826-827`）：
```java
if (defender.isWeakened()) {
    int penalty = f1266E;  // 10
    if (distance > 1) {
        penalty /= 2;      // 远程攻击时防御惩罚减半 → 5
    }
    defModifier -= penalty;
}
```

### 伤害数值对照表

假设：攻击方攻击=30，防御方防御=20，HP=满血，无其他能力/地形加成，无元素修正：

| 场景 | 鼓舞 | 虚弱 | 攻击 | 防御 | 净伤害 | 说明 |
|------|------|------|------|------|--------|------|
| 近战 base | - | - | 30 | 20 | 10 | 基准 |
| 近战+鼓舞 | +10 | - | 40 | 20 | 20 | 鼓舞加攻+10 |
| 近战+虚弱 | - | -10 | 30 | 10 | 20 | 虚弱减防10 |
| **近战+鼓舞+虚弱** | **+10** | **-10** | **40** | **10** | **30** | **叠加效果** |
| 远程 base | - | - | 30 | 20 | 10 | 基准 |
| 远程+鼓舞 | +5 | - | 35 | 20 | 15 | 鼓舞远程减半 |
| 远程+虚弱 | - | -5 | 30 | 15 | 15 | 虚弱远程减半 |
| **远程+鼓舞+虚弱** | **+5** | **-5** | **35** | **15** | **20** | **叠加效果** |

### 关键发现

**使用哪个距离**：
- 鼓舞的加成量和虚弱的减防量都使用 `m4263p(attacker, defender)`——即**攻击方与防御方之间的曼哈顿距离**
- 近战（距离=1）：鼓舞+10，虚弱-10
- 远程（距离>1）：鼓舞+5，虚弱-5

**近战大师与远程防御的条件**：
- `MELEE_MASTER`: 距离=1 AND 攻击方有近战大师 AND 防御方无近战大师 → ×1.5
- `RANGED_DEFENDER`: 距离>1 AND 防御方有远程防御 → ×0.5

### 结论

| 场景 | 反编译公式 | 净效果 | 项目对齐 |
|------|-----------|--------|---------|
| 近战 base | `(atk-def)` | 10 | ✅ |
| 近战+鼓舞 | `(atk+10-def)` | 20 | ✅ |
| 近战+虚弱 | `(atk-(def-10))` | 20 | ✅ |
| **近战+鼓舞+虚弱** | `(atk+10-(def-10))` | **30** | ✅ 需确认项目 |
| 远程 base | `(atk-def)` | 10 | ✅ |
| 远程+鼓舞 | `(atk+5-def)` | 15 | ✅ |
| 远程+虚弱 | `(atk-(def-5))` | 15 | ✅ |
| **远程+鼓舞+虚弱** | `(atk+5-(def-5))` | **20** | ✅ 需确认项目 |
| **近战+鼓舞+虚弱+近战大师** | `(atk+10-(def-10)) × 1.5` | **45** | ✅ 需确认项目 |
| **远程+鼓舞+虚弱+远程防御** | `(atk+5-(def-5)) × 0.5` | **10** | ✅ 需确认项目 |

---

## 附录：反编译源码索引

| 功能 | 类 | 方法/行 | 
|------|-----|---------|
| 反击判定 | `C0600q.java:1214` | `m4287i` |
| 攻击附加状态 | `C0600q.java:794` | `m4328c` |
| 最大射程（致盲） | `C0600q.java:1416` | `m4258t` |
| 最小射程（致盲） | `C0600q.java:1424` | `m4257u` |
| 存活检查 | `C0600q.java:1279` | `m4277k` |
| 射程内检查 | `C0600q.java:971` | `m4313e` |
| 曼哈顿距离 | `C0600q.java:620` | `m4343b` |
| 攻击执行 | `C0595l.java:329` | `m4464a` |
| 反击执行 | `C0595l.java:262` | `m4469a` |
| 后动作处理 | `C0595l.java:528` | `m4452b` |
| 待机标记 | `C0595l.java:839` | `m4436g` |
| 支援执行 | `C0595l.java:878` | `m4434h` |
| 支援条件 | `C0600q.java:1371` | `m4267n` |
| 命令分发 | `C0586f.java:307` | `m4501c` |
| 伤害计算 | `C0600q.java:646` | `m4339b` |
| 攻击加成（含鼓舞） | `C0600q.java:276` | `m4360a` |
| 防御修正（含虚弱） | `C0600q.java:824` | `m4320d` |
| 经验等级公式 | `C0613f.java:76` | `m4201a` |
| Unit 状态打包 | `C0613f.java:1199` | `m4288i` |
| TileConfig 字段 | `C0619b.java:8` | 全部字段 |
| 能力枚举 | `EnumC0614g.java` | 25能力 |
| 状态枚举 | `EnumC0615h.java` | 5状态（含harmless） |

---

*本文档基于 jadx 1.4.7 反编译结果进行精确源码追踪生成，不修改任何项目代码。所有结论均附带反编译源码行级证据。*
