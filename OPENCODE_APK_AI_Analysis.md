# APK AI 行为逻辑分析及项目差异对比

> 来源：APK `aer-release-4.2.5.1`，jadx 1.4.7 全量反编译  
> 证据类：`C1275a.java`（1255行，主AI引擎） / `AbstractCallableC0596m.java`（146行，基类）/ `C0580c.java`（560行，AI调度器）/ `C0578b.java`（150行，AI动作结果）  
> 作者 AI 类：`src/game/ai/heuristic_ai.ts`（479行）/ `random_ai.ts`（33行）/ `play.ts`（41行）

---

## 目录

1. [APK AI 体系架构](#1-apk-ai-体系架构)
2. [APK AI 决策主流程](#2-apk-ai-决策主流程)
3. [APK AI 单元选择 (m2331o)](#3-apk-ai-单元选择-m2331o)
4. [APK AI 目标选择 (m2343i)](#4-apk-ai-目标选择-m2343i)
5. [APK AI 动作枚举 (m2365a)](#5-apk-ai-动作枚举-m2365a)
6. [APK AI 动作评分 (m2371a)](#6-apk-ai-动作评分-m2371a)
7. [APK AI 攻击评估 (m2369a)](#7-apk-ai-攻击评估-m2369a)
8. [APK AI 位置评分 (m2367a)](#8-apk-ai-位置评分-m2367a)
9. [APK AI 招募决策 (m2347h + m2330p)](#9-apk-ai-招募决策-m2347h--m2330p)
10. [APK AI 突击部队后移动 (m2370a)](#10-apk-ai-突击部队后移动-m2370a)
11. [APK AI 辅助方法](#11-apk-ai-辅助方法)
12. [APK C0580c AI 调度器](#12-apk-c0580c-ai-调度器)
13. [项目 AI 体系](#13-项目-ai-体系)
14. [APK vs 项目 AI 差异对比](#14-apk-vs-项目-ai-差异对比)

---

## 1. APK AI 体系架构

### 文件层次

```
InterfaceC0597n (AI工厂接口)
  └── C0652f (工厂实现，创建C1275a)
        └── C1275a (主AI引擎，继承AbstractCallableC0596m)
              └── AbstractCallableC0596m (基类，提供game state访问)
                    └── Callable<C0578b> (java.util.concurrent)
C0580c (AI调度器，管理AI创建、执行、状态转换)
  └── C0581a (内部类，后备AI——仅返回NEXT_TURN)
C0578b (AI返回的动作结果)
```

### AI 创建流程

```
C0580c.m4548w()  →  检查当前玩家是否AI
                   →  InterfaceC0597n == null ? new C0581a()  →  new C1275a(C0577a)
```

触发条件（`C0580c.m4548w()`:550）：

```java
void m4548w() {
    if (this.f1105d == null) {                         // 没有待处理的AI决策
        C0577a c0577a = this.f1102a;
        if (c0577a.f1085e.f1215f.f1236h >= 0          // 有pending unit
            || c0577a.m4593c()                          // 多人/网络模式
            || this.f1102a.f1084d.m4551t()) {           // UI正在播放动画
            return;
        }
        InterfaceC0597n interfaceC0597n = this.f1103b;
        this.f1105d = interfaceC0597n == null 
            ? new C0581a(this, this.f1102a)             // 后备AI
            : interfaceC0597n.mo4100a(this.f1102a);     // 创建C1275a
    }
}
```

### C0578b 动作结果结构

```java
public class C0578b {
    public int f1090a;   // 起始x
    public int f1091b;   // 起始y
    public int f1092c;   // 移动到x
    public int f1093d;   // 移动到y
    public int f1094e;   // 二次移动x (突击后移动)
    public int f1095f;   // 二次移动y
    public int f1096g;   // 目标x (攻击/治疗/召唤/支援目标)
    public int f1097h;   // 目标y
    public int f1098i;   // 招募兵种ID (>=0表示招募)
    public EnumC0591a f1099j;  // 动作类型
}
```

### C0590i.EnumC0591a 动作类型

```java
public enum EnumC0591a {
    ATTACK, GAME_START, HEAL, MOVE, NEXT_TURN, NONE, 
    OCCUPY, RECRUIT, REPAIR, REVERSE, SELECT, STANDBY, SUMMON, SUPPORT, SURRENDER
}
```

---

## 2. APK AI 决策主流程

`C1275a.call()` (1232-1254):

```
1. m2355e()      — 收集所有城堡(f3098i) 和 村庄(f3099j) 瓦片位置
2. m2338k()      — 地形分析（森林/山地 vs 水域密度 → f3110u 森林山地比率）
3. m2334m()      — 按能力索引兵种ID (f3100k: abilityID → [unitTypeID1, unitTypeID2, ...])
4. m2336l()      — 计算可达的可占领城堡/村庄 (f3104o: 可占领瓦片; f3106q: 可占领城堡数)
5. m2332n()      — 收集己方单位(f3101l)、单位类型计数(f3103n)、优先兵种列表(f3102m)
6. m2358d()      — 收集可移动单位位置(f3097h)
7. m2331o()      — 选择要行动的单元
   ├── 有单元 → m2333m(unit) → 生成并评分动作
   └── null → m2330p() → 招募决策或pass
8. 返回 C0578b
```

### 全局初始化

```java
public C0578b call() {
    this.f3095f.m4173a(m4405c().f1249a, m4405c().f1250b);  // 初始化路径缓冲区
    // 统计敌方玩家数
    this.f3107r = 0;
    for (int i = 0; i < 6; i++) {
        int m4119a = C0641e.m4119a(m4409b().f1237i, i, 0);
        if (m4119a != 0 && m4119a != 5) this.f3107r++;
    }
    // 计算平均兵种成本阈值
    int i2 = 0;
    for (int i3 : this.f1200a.m4291i(this.f1201b)) {
        i2 += this.f1200a.m4274l(i3, this.f1201b);  // getUnitCost
    }
    this.f3108s = i2 / this.f1200a.m4291i(this.f1201b).length;
    
    m2355e();   // 收集城堡/村庄
    m2338k();   // 地形分析
    m2334m();   // 能力索引
    m2336l();   // 可占领判定
    m2332n();   // 己方单位收集
    m2358d();   // 可移动单元
    
    C0613f m2331o = m2331o();  // 选择单元
    return m2331o == null ? m2330p() : m2333m(m2331o);
}
```

---

## 3. APK AI 单元选择 m2331o

优先级严格排序：

```
1. 待命单元（pre-selected via f1298a == 1）
   → return currentUnit.clone()

2. 己方城堡上的可指挥单元
   → 无指挥官阵亡 (m4283j == true)
   → 遍历 f3098i（所有城堡），选中第一个

3. 特殊能力单元 (m2352f)
   → 检查能力列表 f3090v: 
      CLEANSING_AURA, HEALER, VILLAGE_CAPTOR, WEAKENING_AURA, POISONER, BLINDING_ATTACK
   → 排除指挥官(!m4308f) 和 不可指挥单元(!m4283j)

4. GRIM_REAPER 单元（优先出手的吸血鬼）

5. 可移动集合中的第一个 → return

6. null → 触发招募/Pass决策
```

```java
private C0613f m2331o() {
    if (c0600q.f1216g.f1298a == 1)  // 有预选单元
        return new C0613f(c0600q.m4319e());
    for (C0632c c0632c : this.f3098i) {  // 城堡上的可指挥单元
        C0613f m4211f = m4405c().m4211f(c0632c);
        if (this.f1200a.m4283j(m4211f)) 
            return new C0613f(m4211f);
    }
    C0613f m2352f = m2352f();  // 特殊能力单元
    if (m2352f != null) return new C0613f(m2352f);
    // GRIM_REAPER
    for (C0632c c0632c2 : this.f3097h) {
        if (this.f1200a.m4359a(m4211f2, EnumC0614g.GRIM_REAPER))
            return new C0613f(m4211f2);
    }
    if (this.f3097h.size() > 0)  // 任意可移动单元
        return new C0613f(m4405c().m4211f(this.f3097h.iterator().next()));
    return null;  // 无可用单元
}
```

---

## 4. APK AI 目标选择 m2343i

根据选中单元的能力决定优先级：

```
1. SUPPORTER → 找 combatValue 最高的己方单位（必须比自己高）
   → return 目标位置

2. CASTLE_CAPTOR → 找最近的敌方城堡
   条件：敌方剩余阵营 <= 1 且 对方gold < 400 且 未被分配
   → return 城堡位置 或 null

3. VILLAGE_CAPTOR → 找最近的可占领村庄
   条件：村庄可占领(f1374g) 且 未被己方占领 且 未被分配

4. REPAIRER → 找最近的可修复村庄
   条件：tile.f1376i >= 0 (可修复生成单位) 且 未被己方占领 且 未被分配

5. HEALER → 找 combatValue 最高的己方受伤单位
   → return 目标位置

6. 默认 → m2360c() 攻击目标选择
   → 对所有敌方单位评分 `m2359c(己方, 敌方)`
   → 选评分最高的敌方单位位置返回
```

```java
private C0632c m2343i(C0613f c0613f) {
    // 1. SUPPORTER: 支援高combat ally
    if (hasAbility(SUPPORTER)) {
        for (ally : getAllAllies()) {
            if (ally.combatValue > supporter.combatValue && ally.combatValue > max)
                bestAlly = ally;
        }
        if (bestAlly != null) return bestAlly.position;
    }
    // 2. CASTLE_CAPTOR: 最近敌方城堡
    if (hasAbility(CASTLE_CAPTOR)) {
        target = nearestEnemyCastle;
        if (target != null) return assignTarget(target);
    }
    // 3. VILLAGE_CAPTOR: 最近可占领村庄
    if (hasAbility(VILLAGE_CAPTOR)) {
        target = nearestCapturableVillage;
        if (target != null) return assignTarget(target);
    }
    // 4. REPAIRER: 最近可修复村庄
    if (hasAbility(REPAIRER)) {
        target = nearestRepairableTile;
        if (target != null) return assignTarget(target);
    }
    // 5. HEALER: 最高价值受伤ally
    if (hasAbility(HEALER)) {
        target = highestValueAlly;
        if (target != null) return target;
    }
    // 6. 默认: 攻击目标
    return m2360c(c0613f);  // 评分最高的敌方单位
}
```

### 攻击目标评分 m2359c

```java
private int m2359c(C0613f c0613f, C0613f c0613f2) {
    // 基础值: 攻击力 - 敌方防御
    int value = elementTypeMatch ? (atk - def) : (atk + def);
    // 远程>1且打ally: 半值
    if (isEnemy && unitRange > 1) value /= 2;
    // MARKSMAN + AIR_FORCE: +15
    if (hasAbility(MARKSMAN) && targetHasAbility(AIR_FORCE)) value += 15;
    // 指挥官/脚本标记: +25
    if (isCommander || isScriptTagged) value += 25;
    // 距离惩罚: -5 per tile
    value -= distance(unitPos, targetPos) * 5;
    return value;
}
```

---

## 5. APK AI 动作枚举 m2365a

对每个可到达位置，生成当前单元可执行的所有动作：

```java
private Set<C0578b> m2365a(C0613f c0613f, Set<C0632c> reachablePositions) {
    for (C0632c pos : reachablePositions) {
        // 总是添加 STANDBY
        addAction(STANDBY, from, pos, null);
        
        // 进入该位置后检查:
        setUnitPosition(pos);
        
        for (C0632c targetPos : this.f1200a.m4355a(c0613f, false)) {  // 攻击范围
            C0613f target = tile.getUnit(targetPos);
            
            // ATTACK: 有敌方单位 || 敌方空城堡(可占领)
            if (target != null || isEnemyTerritory) && canAttack(targetPos)
                addAction(ATTACK, from, pos, targetPos);
            
            // HEAL: 友方单位且非自身位置且非同类(不死族)
            if (target != null && !samePos && !sameTeam)
                addAction(HEAL, from, pos, targetPos);
            
            // SUMMON: 有SUMMONER能力
            if (hasAbility(SUMMONER) && canSummon(targetPos))
                addAction(SUMMON, from, pos, targetPos);
            
            // SUPPORT: 有SUPPORTER能力
            if (hasAbility(SUPPORTER) && canSupport(targetPos))
                addAction(SUPPORT, from, pos, targetPos);
        }
        
        // 自治疗
        if (canHealSelf()) addAction(HEAL, from, pos, pos);
        
        // OCCUPY: 可占领位置
        if (canOccupy(c0613f, pos)) addAction(OCCUPY, from, pos, null);
        
        // REPAIR: 可修复位置
        if (canRepair(c0613f, pos)) addAction(REPAIR, from, pos, null);
    }
}
```

### C0600q 可行动作验证方法

| APK方法 | 对应动作类型 | 验证逻辑 |
|---------|-------------|----------|
| `m4362a(unit, x, y)` | ATTACK | 目标格有敌方单位 or 到达后目标格在攻击范围内 |
| `m4265o(attacker, target)` | HEAL | 同队检查（返回true=同队=不能治疗） |
| `m4276k(healer, target)` | HEAL | 治疗者与目标不同，不是满血，治疗距离内 |
| `m4300g(unit, x, y)` | SUMMON | 召唤位置有效 |
| `m4294h(unit, x, y)` | SUPPORT | 支援位置有效 |
| `m4321d(unit, x, y)` | OCCUPY | 到达城堡/村庄位置为敌方/中立 |
| `m4306f(unit, x, y)` | REPAIR | 村庄可修复 |

---

## 6. APK AI 动作评分 m2371a

所有动作评分基值 -2000，选最高分。

```java
private C1281e<Integer, Boolean> m2371a(C0613f unit, C0578b action) {
    int score = -2000;
    boolean willDieFlag = false;  // 突击部队攻击后会死标记
    
    switch (action.type) {
        case OCCUPY:
            score = tile.isCastle() ? 10000 : 
                    tile.isVillage() ? 10000 + 5000 : 0;  // castle=10000, village=15000
            break;
            
        case REPAIR:
            score = 2500;
            break;
            
        case SUMMON:
            score = 500;  // HttpStatus.SC_INTERNAL_SERVER_ERROR
            break;
            
        case HEAL:
            target = getUnit(action.targetPos);
            healAmount = m2363b(unit, target);
            if (target.isCommander()) healAmount *= 1.2;
            if (samePos) {
                // 自治疗：只有HP过半才有分
                score = (unit.hp > maxHp/2) ? -50 : healAmount + 50;
            } else if (isEnemy(target)) {
                // 治疗敌方（UNDEAD能力）
                score = hasAbility(UNDEAD) ? healAmount : -healAmount;
            } else {
                // 治疗友方
                score = (unit != target && unit == ally) ? healAmount + 50 : 0;
            }
            break;
            
        case ATTACK:
            target = getUnit(action.targetPos);
            if (!isEnemy(target)) {
                // 攻击空城堡（村庄占领）
                if (target == null && isEnemyVillage) score = 1000;
                else score = 0;
            } else {
                // 攻击敌方 - 模拟伤害
                C1281e<Integer, Boolean> result = simulateAttack(unit, target);
                score = targetValue/50 + result.score;
                willDieFlag = result.unitDies;  // 突击部队自己会死
            }
            break;
            
        case SUPPORT:
            target = getUnit(action.targetPos);
            if (target != null && !isEnemyCastle(target.pos)) {
                combatValue = getCombatValue(target);
                positionValue = getPositionValue(target);
                if (!hasAbility(HEALER)) {  // 支援者不能同时治疗
                    score = (combatValue + positionValue) * 20;
                }
            }
            break;
    }
    return (score, willDieFlag);
}
```

### 治疗量计算 m2363b

```java
private int m2363b(C0613f healer, C0613f target) {
    if (healer == null || target == null) return 0;
    // 如果目标不是HEALER或HP不过半 → 可以治疗
    if (!target.hasAbility(HEALER) || target.hp <= maxHp/2) {
        healAmount = game.getHealAmount(healer, target);  // 10+5×level
        targetValue = (atk * hp/maxHp + posValue*5) / 5;
        // 己方HP不过半 → 价值*1.5
        if (isAlly(target) && target.hp < maxHp/2) targetValue *= 1.5;
        // 守在己方城堡 → +5000
        if (isOwnCastle(target.pos) && isCapturable(target.pos)) targetValue += 5000;
        return healAmount * targetValue + 
               ((hp - maxHp) / maxHp) * unitCost * 2;  // 失血越多分越高
    }
    return 0;
}
```

### 动作最佳选择 m2366a

```java
private C1281e<C0578b, Boolean> m2366a(C0613f unit, C0632c target, Set<C0578b> actions) {
    // 先检查是否有非STANDBY且不是自治疗的动作
    boolean hasRealAction = false;
    for (action : actions) {
        if (action.type != STANDBY && !isSelfHeal(action)) { 
            hasRealAction = true; 
            break; 
        }
    }
    int bestScore = Integer.MIN_VALUE;
    for (action : actions) {
        score = m2371a(unit, action);  // 动作分
        // ASSAULT_FORCE: 如果行动位置经过突击区域，跳过位置分
        if (!hasAbility(ASSAULT_FORCE) || movementGrid[pos] < maxMove/2) {
            score += m2367a(unit, target, action.position, hasRealAction);  // 位置分
        }
        if (score > bestScore) { bestScore = score; best = action; }
    }
    return best;
}
```

---

## 7. APK AI 攻击评估 m2369a

模拟攻击并计算净收益：

```java
private C1281e<Integer, Boolean> m2369a(C0613f attacker, C0613f defender) {
    // 1. 计算伤害
    int damage = game.calcDamage(attacker, defender);
    game.applyDamage(defender, -damage);
    int damageValue = damage * getUnitValue(defender) / 20;
    int killValue = 0;
    boolean unitDies = false;
    
    // 2. 如果击杀
    if (defender.hp <= 0) {
        killValue = getUnitValue(defender) * 10 / 4;  // 2.5x base
        if (defender.isCommander())     killValue += level * 200;
        if (isScriptTagged(defender))   killValue += 1000;
        if (hasAbility(HEALER))         killValue += level * 100;
        if (hasAbility(CLEANSING_AURA)) killValue += level * 150;
        if (hasAbility(SUPPORTER))      killValue += level * 200;
    }
    int score = (damageValue + killValue) * (isInCapturablePos(defender) ? 2 : 1);
    
    // 3. 状态效果
    if (defender.status == NONE) {
        applyStatus(attacker, defender);
        if (POISONED)     score += (isUndead(defender) ? -value/4 : value/4);
        if (BLINDED)      score += value/2;
    }
    
    // 4. 反击伤害
    if (canCounterAttack(defender, attacker)) {
        int counterDamage = game.calcDamage(defender, attacker);
        game.applyDamage(attacker, -counterDamage);
        int counterPenalty;
        if (attacker.isCommander()) {
            counterPenalty = attacker.hp <= 0 ? value*20 : counterDamage*value/10;
        } else {
            counterPenalty = attacker.hp <= 0 ? value*10 : counterDamage*value/20;
        }
        score -= counterPenalty;
        
        // 反击时附加状态
        if (attacker.status == NONE) {
            applyStatus(defender, attacker);
            if (POISONED) score += (isUndead(attacker) ? value/4 : -value/4);
            if (BLINDED)  score -= value/2;
        }
        if (attacker.hp <= 0) unitDies = true;  // 攻击者死亡
    }
    
    // 5. REPAIRER在地块上
    if (tile.canRepair() && defender.hasAbility(REPAIRER))
        score += getUnitValue(defender) / 4;
    
    // 6. SUMMONER不打无价值目标
    if (attacker.hasAbility(SUMMONER) && killValue == 0) return -1000;
    
    return (score, unitDies);
}
```

---

## 8. APK AI 位置评分 m2367a

评估移动到一个位置的价值：

```java
private int m2367a(C0613f unit, C0632c objectiveTarget, C0632c movePos, boolean hasRealAction) {
    // 基础：unit价值 × 5
    int score = getUnitValue(unit) * 5;
    
    // 自身治疗地形（城堡/村庄/治愈地形）
    if (isHealingTile(movePos) && unit.hp <= maxHp/2)
        score += getCombatValue(unit) * m2337k(c0613f) / 10;
    
    // 森林/山地（UNDEAD特殊处理）
    if (isForestOrMountain(movePos)) 
        score += hasAbility(UNDEAD) ? value/10 : -value/10;
    
    // 接近目标
    if (objectiveTarget != null && !hasRealAction) {
        int distImprovement = distance(unitPos, target) - distance(movePos, target);
        score += distImprovement * 500;
        if (isEnemyCastle(target)) score += 2000;
    }
    
    // 逃离敌方平均距离（距离越大=越安全，惩罚）
    int allyDist = avgAllyDistance(movePos);
    int enemyDist = avgEnemyDistance(movePos);
    if (enemyDist > allyDist) score -= getCombatValue(unit);
    
    // 指挥官不能去敌方城堡
    if (!unit.isCommander() && isEnemyCastle(movePos))
        score -= getCombatValue(unit) * 50 / 20;
    
    // 敌方城堡占领中（附近有敌人）
    if (isOccupiedEnemyCastle(movePos)) score -= 10000;
    
    // 己方领地防御
    if (isCapturableTile(movePos) && unit.hp >= maxHp*4/5) {
        if (hasRealAction) {
            if (isOwnCastle(movePos)) {
                if (capturableCastleCount <= 1 && !isPreferredUnitType(unit) && cost < avgCost)
                    score -= 5000;  // 有其他事要做
                score += 10000;  // 守城
            }
            if (isOwnVillage(movePos)) score += 5000;  // 守村
        }
    } else if (isOwnCastle(movePos) && !canCommandUnit(unit)) {
        score -= 5000;  // 不能指挥的单元不要守城
    }
    
    // 光环效果
    if (hasAbility(WEAKENING_AURA) || hasAbility(ATTACK_AURA) || hasAbility(CLEANSING_AURA)) {
        for (nearbyUnit : getUnitsInRange(movePos, 2)) {
            if (WEAKENING_AURA && isEnemy && status == NONE) score += value/4;
            if (ATTACK_AURA && isAlly && status == NONE)     score += value/5;
            if (CLEANSING_AURA && isAlly) {
                if (hp < maxHp) score += value/20 * (level+2);
                if (hasHarmfulStatus) score += value/5;
            }
        }
    }
    return score;
}
```

---

## 9. APK AI 招募决策 m2347h + m2330p

### 招募/Pass决策 m2330p

```java
private C0578b m2330p() {
    C0632c capturableCastle = findBestCastleForRecruit();  // m2350g
    if (capturableCastle == null) return PASS;  // 没有可招募的城堡
    
    // 检查指挥官招募
    int commanderCost = getUnitCost(config.commanderUnitType, playerId);
    if (!hasCommander() && commanderCost <= currentGold) {
        if (commanderCost > 500 && unitCount < totalLimit * 0.9) { /* 继续判断 */ }
        return recruit(castle, config.commanderUnitType);
    }
    
    // 选择兵种
    int unitType = m2347h();
    if (unitType < 0 && isCapturableTile(castle)) {
        unitType = suggestUnitForCastle(castle);  // m2342i
    }
    
    if (unitType >= 0 && canDeploy(unitType, castle)) {
        return recruit(castle, unitType);
    }
    return PASS;
}
```

### 兵种选择 m2347h

```java
private int m2347h() {
    if (canAffordCommander) {
        // 早期(≤3回合)如果已有低级兵则不选指挥官
        if (turn <= 3 && hasCheapUnit(ids[1,18])) return cheapUnitID;
        return COMMANDER;  // 选指挥官
    }
    
    // 根据回合数:
    int turn = gameState.currentTurn;
    if (turn < 10 && canAffordArcher(3) && countArcher(3) < 1) return 3;  // 弓箭手
    if (turn < 15 && canAffordDragon(20) && countDragon(20) < 1) return 20;  // 龙
    
    // 敌方阵容分析 → 推荐兵种（m2344i）
    float[] recommendations = analyzeEnemyUnits();
    int bestType = argmax(recommendations);
    float bestScore = recommendations[bestType];
    
    if (bestType >= 0 && bestScore >= 1.0) return bestType;
    
    // 金币够平均成本 → 随机选优先兵种
    if (currentGold >= avgCost) {
        if (preferredList.isEmpty()) return randomAvailableUnit();
        return randomFrom(preferredList);
    }
    return bestType;  // 可能=-1
}
```

### 敌方阵容分析 m2344i

```java
private float[] m2344i() {
    float[] recs = new float[availableUnitTypes.length];
    for (C0613f enemy : enemyUnits) {
        int typeId = enemy.unitTypeId;
        recs[1] += 1.0f;          // 所有敌方 +1分到 soldier
        recs[16] += 0.25f;        // wolfarcher 0.25
        switch (typeId) {
            case 6:  // dark_mage
                recs[15] += 0.5f;  // catapult
                recs[4] += 0.5f;   // slime
                recs[8] += 0.5f;   // paladin
                recs[17] += 0.5f;  // dragon
                break;
            case 17: // dragon
                recs[2] += 1.0f;   // mermaid
                recs[19] += 1.0f;  // skeleton
                break;
            case 18: // wolf
                recs[14] += 0.5f;  // druid
                recs[18] += 1.0f;  // wolf_archer... wait that's odd
                recs[15] += 0.5f;  // catapult
                recs[17] += 0.3f;  // dragon
                break;
        }
    }
    // 己方:
    for (C0613f ally : ownUnits) {
        switch (typeId) {
            case 6:  recs[14] += 2.0f; break;  // dark_mage → druid +2
            case 12: recs[5] += 1.0f; recs[8] += 1.0f; break;  // golem → water_elem +1, paladin +1
            case 15: recs[14] += 1.0f; break;  // catapult → druid +1
        }
    }
    // 过滤不可招募的
    for (int i=0; i<recs.length; i++) {
        if (!canRecruit(i) || count(i) >= maxCount(i)) recs[i] = 0;
    }
    return recs;
}
```

### 每兵种最大招募数 m2361c

| 兵种ID | 名称 | 最大可招募数 | 条件 |
|--------|------|-------------|------|
| 0 | (unknown) | 999 | — |
| 1 | soldier | 4 | — |
| 2 | mermaid | 1-3 | 森林密度<0.2→1, <0.4→2, else 3 |
| 3 | archer | 1 | — |
| 4 | slime | 2 | — |
| 5 | water_elemental | 2 | — |
| 6 | dark_mage | 2 | — |
| 7 | witch | 2 | — |
| 8 | paladin | 5 | — |
| 9-11 | (various) | 0 | 默认不可招募 |
| 12 | golem | 2 | — |
| 13 | ice_elemental | 2 | — |
| 14 | druid | 2 | — |
| 15 | catapult | 2 | — |
| 16 | wolf_archer | 2 | — |
| 17 | dragon | 1-3 | 森林密度<0.2→1, <0.3→2, else 3 |
| 18 | wolf | 1-2 | 水域比率<0.3→1, else 2 |
| 19 | commander | 5-6 | 水域比率<0.6→5, else 6 |
| 20 | skeleton | 1 | — |

---

## 10. APK AI 突击部队后移动 m2370a

当 ASSAULT_FORCE 单元攻击且未在反击中死亡时，触发二次移动：

```java
private void m2370a(C0613f unit, C0578b action, C0632c objectiveTarget) {
    int remainingMove = movementGrid[action.pos.x][action.pos.y];
    if (remainingMove <= 0) return;  // 无剩余移动力
    
    // 到达攻击位置后，用剩余移动力再评估新位置
    unit.setPos(action.pos);
    unit.movementRemaining = remainingMove;
    calcReachable(unit, false);
    
    // 原位置可到达 → 添加到可选
    if (movementGrid[action.from.x][action.from.y] >= 0)
        reachable.add(action.from);
    
    // 选最佳新位置
    C0632c bestPos = reachable.iterator().next();
    int bestScore = Integer.MIN_VALUE;
    for (C0632c pos : reachable) {
        int score = m2367a(unit, objectiveTarget, pos, false);
        if (score > bestScore) { bestPos = pos; bestScore = score; }
    }
    action.f1094e = bestPos.x;
    action.f1095f = bestPos.y;  // 二次移动目标
}
```

---

## 11. APK AI 辅助方法

### 单元价值计算 m2337k

```java
private int m2337k(C0613f unit) {
    int base = Math.max(150, getUnitCost(unit.type, unit.team));
    int value = base * (unit.level + 3) / 3;
    if (isEnemy(unit) && unit.isOnOwnCastle()) value += 5000;
    if (unit.isCommander()) value += 200 + level * 100;
    if (isScriptTagged(unit)) value += 5000;
    return value;
}
```

### 战斗实力计算 m2340j

```java
private int m2340j(C0613f unit) {
    int atk = getBaseAttack(unit) - 20;
    if (hasAbility(BLOODTHIRSTY))   atk += level * 10 + 20;
    if (hasAbility(SUMMONER))       atk += level * 15 + 15;
    if (hasAbility(HEALER) || hasAbility(CLEANSING_AURA)) atk += level * 5 + 15;
    if (hasAbility(MELEE_MASTER))   atk += level * 5 + 10;
    if (hasAbility(MARKSMAN/WATER_CHILD/MOUNTAIN_CHILD/FOREST_CHILD)) atk += 5;
    return atk * unit.hp / unit.maxHp;  // 剩余HP比例调整
}
```

### 位置价值计算 m2346h

```java
private int m2346h(C0613f unit) {
    int bonus = 0;
    if (hasAbility(SON_OF_LAND)) bonus = 1;  // 非水地形
    if (hasAbility(AIR_FORCE)) bonus = 2;    // 飞行
    return (unit.getMoveRange() - 2) + unit.getBlindResist() + bonus;
}
```

### 入侵判定 m2339j / m2336l

```java
private boolean m2339j(C0632c tile) {
    return capturableTiles.contains(tile);
}
// m2336l: 计算哪些城堡/村庄是当前AI可以占领的
private void m2336l() {
    for (enemyUnit : enemyUnits) {
        calcReachable(enemyUnit, true);  // 使用保留移动力
        for (reachablePos : reachable) {
            if (isOwnCastle(reachablePos) && (noUnit || unit.isCommander()))
                canCaptureFromUnits.add(unitPos);  // 标记可占领来源
            if (isOwnVillage(reachablePos) && hasVillageCaptor)
                canCaptureFromUnits.add(unitPos);
        }
    }
}
```

### 可招募城堡选择 m2350g

```java
private C0632c m2350g() {
    C0632c best = null;
    for (C0632c castle : castles) {
        if (isOccupiedByEnemyUnit(castle))  // 有敌方单位占领
            if (best == null || compare(castle, best) > 0)
                best = castle;
    }
    return best;
}
```

### 己方单位收集 m2332n

```java
private void m2332n() {
    ownUnits.clear();  // f3101l
    ownUnits.addAll(getTeamUnits(playerId));
    
    preferredTypes.clear();  // f3102m
    for (int type : {7, 12, 6, 13, 18}) {  // witch, golem, water_elem, druid, wolf
        if (isAvailable(type)) preferredTypes.add(type);
    }
    
    typeCount.clear();  // f3103n
    for (C0613f unit : ownUnits) {
        typeCount[unit.typeId] = typeCount.getOrDefault(unit.typeId, 0) + 1;
    }
}
```

### 可移动单元收集 m2358d

```java
private void m2358d() {
    movablePositions.clear();  // f3097h
    for (entry : grid.unitPositions) {
        C0613f unit = grid.getUnit(entry);
        if (unit.team == myTeam && !unit.isCommander()) {  // 指挥官不自动行动
            movablePositions.add(entry);
        }
    }
}
```

### 特殊能力单元查找 m2352f

```java
private C0613f m2352f() {
    for (C0632c pos : movablePositions) {
        C0613f unit = grid.getUnit(pos);
        if (!unit.isCommander() && canCommandUnit(unit)) {
            for (EnumC0614g ability : SPECIAL_ABILITIES) {
                if (unit.hasAbility(ability)) return unit;
            }
        }
    }
    return null;
}
```

### 地形分析 m2338k

```java
private void m2338k() {
    // 计算村庄分布范围
    int minX, maxX, minY, maxY = village bounds;
    // 统计该范围内水域密度和水陆混合密度
    float totalTiles = 0, waterTiles = 0, landTiles = 0;
    for (x in range) for (y in range) {
        totalTiles++;
        if (isWater) {
            if (!forest && !mountain) waterTiles++;
        } else {
            landTiles++;
        }
    }
    waterDensity = waterTiles / totalTiles;      // f3109t
    landDensity  = landTiles / totalTiles;       // f3110u
}
```

### 抽象基类 AbstractCallableC0596m 方法

| 方法 | 功能 |
|------|------|
| `m4413a(playerId)` | 获取玩家gold |
| `m4410a(pos1, pos2)` | Manhattan距离 |
| `m4414a()` | 获取所有敌方单元 |
| `m4408b(teamId)` | 获取指定队伍所有单元 |
| `m4412a(unit)` | 检查unit是否被目标标记(脚本层) |
| `m4411a(pos)` | 检查pos是否为敌方城堡且被己方以外的队伍占领 |
| `m4409b()` | 获取GameState |
| `m4405c()` | 获取BattleGrid |
| `m4407b(unit)` | 检查unit是否有脚本标记 |
| `m4406b(pos)` | 检查pos是否有己方unit且该unit可被指挥 |
| `m4404c(pos)` | 检查pos是否为敌方城堡 |
| `m4403d(pos)` | 检查pos是否为敌方村庄 |
| `m4402e(pos)` | 检查pos是否为己方城堡 |
| `m4401f(pos)` | 检查pos是否为己方村庄 |

---

## 12. APK C0580c AI 调度器

### 关键方法

| 方法 | 功能 |
|------|------|
| `m4548w()` | 创建AI决策Callable（懒加载） |
| `m4566e()` | 取出AI Callable供UI提交执行 |
| `m4578a(C0578b)` | 将AI决策转化为C0586f命令队列 |
| `m4584a()` | 初始单元选择（game start自动选择第一个己方单位） |
| `m4582a(int)` | 状态转换（1=移动, 2=行动, 3=结束） |
| `m4581a(int, int)` | 执行子动作（到指定坐标执行对应类型的动作） |

### AI动作执行 m4578a

```java
public void m4578a(C0578b action) {
    if (action.f1098i >= 0) {  // 招募
        commandQueue.add(RECRUIT(action.f1098i, action.f1090a, action.f1091b));
    } else {
        // 1. 选择单元
        commandQueue.add(SELECT(action.f1090a, action.f1091b, false));
        // 2. 移动
        commandQueue.add(MOVE(action.f1092c, action.f1093d));
        // 3. 动作 (ATTACK/HEAL/SUMMON/SUPPORT)
        commandQueue.add(ACTION(action.type, action.f1096g, action.f1097h));
        // 4. 二次移动 (突击部队)
        if (action.f1094e >= 0 && action.f1095f >= 0)
            commandQueue.add(MOVE(action.f1094e, action.f1095f));
    }
}
```

---

## 13. 项目 AI 体系

### 文件结构

```
src/game/ai/
├── heuristic_ai.ts     — 启发式AI（P0使用）
├── random_ai.ts        — 随机AI（P1使用）
├── play.ts             — 自动对战入口
└── heuristic_ai.test.ts — 6个单元测试
```

### 使用方式 (`play.ts`)

```typescript
const ais = [new HeuristicAI(), new RandomAI()]; // P0 = 启发式, P1 = 随机
const action = ai.getAction(engine, playerId);    // 返回 Action 对象
const result = engine.step(action);               // 直接执行
```

### HeuristicAI 架构

**关键数据流：**
1. `getAction(engine, playerId)` → 获取所有 legal actions
2. 对每个 action 调用 `scoreAction()` 计算评分
3. 选最高分 action 返回

**评分函式体系：**
```
scoreAction()
  ├── scoreAttack()        — 攻击评分
  ├── scoreCapture()       — 占领评分  
  ├── scoreRepair()        — 修复评分（4200固定+rng）
  ├── scoreHeal()          — 治疗评分
  ├── scoreSupport()       — 支援评分
  ├── scoreSummon()        — 召唤评分（2600固定+压力+rng）
  ├── scoreDestroyTown()   — 拆城评分
  ├── scoreMove()          — 移动评分（多种因素加权）
  ├── scoreRecruit()       — 招募评分（多种情况分支）
  ├── scoreWait()          — 待机评分
  ├── end_turn             — -250
  └── surrender            — -100000
```

**评分细节（对比APK关键差异）：**

| 动作 | 项目评分 | APK评分 |
|------|---------|--------|
| 占领城堡 | 14000 | 10000 |
| 占领村庄 | 9500 | 15000（城堡+5000） |
| 修复 | 4200+rng | 2500 |
| 召唤 | 2600+压力+rng | 500 |
| 攻击（击杀） | +15000+目标值×8 | 目标值×2.5+特殊bonus |
| 攻击（指挥官击杀） | +18000 | +level×200 |
| 治疗（己方） | 3200+失血×55+价值×0.25 | 治疗量×目标价值 |
| 支援 | 3000+目标值×0.8+压力 | (战斗值+位置值)×20 |
| 待机 | 120+守城(69000)+压力+地形 | 无对应项 |
| 结束回合 | -250 | 返回NEXT_TURN |

---

## 14. APK vs 项目 AI 差异对比

### 架构差异

| 维度 | APK (C1275a) | 项目 (HeuristicAI) |
|------|-------------|-------------------|
| **评分模型** | 动作评分+位置评分 两阶段累加 | 动作综合单阶段评分 |
| **动作枚举** | 先移动位置枚举→再每个位置枚举动作 | 直接从 legalActions 枚举 |
| **模拟评估** | `new C0613f(copy)` 深度拷贝独立模拟 | `engine.clone()` 全状态克隆后step |
| **反击模拟** | 攻击评估中包含反击伤害模拟 | 无反击模拟 |
| **突击部队** | 二次移动到最佳位置（剩余移动力） | 无对应 |
| **回合内多单元** | 每次只选一个单元行动（框架外部循环） | 同 |
| **目标选择** | 根据能力严格优先级预选目标 | 所有 legal action 统一评分 |
| **敌方分析** | 分析敌方阵容推荐克制兵种 | 无敌方阵容分析 |
| **地形分析** | 统计村庄区域水域/森林密度 | 逐地块评估防御加成 |
| **随机因子** | `new Random()` 用于随机招募 | `rng()` 用于评分微调（0~30） |
| **AI创建** | 工厂模式，每次决策new实例 | 单例创建，getAction多次调用 |
| **动作执行** | 返回C0578b → 调度器转成命令队列 | 直接 engine.step(action) |
| **可招募判断** | `f3097h` 基于城堡可达性和敌方占位 | 基于 legalActions 的 recruit 类动作 |
| **时效性** | 当前帧同步计算 | 同步计算 |

### 决策逻辑差异

| # | 差异项 | APK | 项目 | 影响 |
|---|--------|-----|------|------|
| **P0** | 单元选择优先级 | 城堡上可指挥→特殊能力→GRIM_REAPER→第一个 | 所有单元统一通过 action 评分 | APK更倾向先动指挥体系 |
| **P0** | 目标选择 | 按能力预设（支援→占领→修复→治疗→攻击） | 所有动作统一评分竞争 | APK优先执行战略性动作 |
| **P1** | 占领评分 | 城堡10000 / 村庄15000 | 城堡14000 / 村庄9500 | 项目更重视城堡但低估村庄 |
| **P1** | 修复评分 | 2500 | 4200+rng | 项目更高估修复 |
| **P1** | 召唤评分 | 500 | 2600+压力+rng | APK不鼓励无战术目的召唤 |
| **P0** | 攻击击杀价值 | 2.5×单位基础价值 × 位置倍率 | +15000+目标值×8 | 项目击杀奖励远高于APK |
| **P0** | 指挥官击杀 | +level×200 | +18000 | 项目极端重视指挥官击杀 |
| **P1** | 治疗评分 | 治疗量×目标价值 | 3200+失血×55+价值×0.25 | 项目失血权重极高 |
| **P1** | 支援评分 | (战斗值+位置值)×20 | 3000+目标值×0.8+压力 | 结构完全不同 |
| **P0** | 守城防御 | 城堡+10000 / 村庄+5000 (HP≥80%) | castleDefense+68000 | 项目极端重视城堡守卫 |
| **P0** | 突击部队后移动 | 剩余移动力自动选最佳位置 | 无此能力 | APK中突击部队更具战术性 |
| **P0** | 反击风险评估 | 模拟反击伤害并对评分做惩罚 | 无 | APK AI会避免送死攻击 |
| **P1** | 状态效果评估 | 中毒+1/4值、盲目+1/2值 | 无 | APK考虑DEBUFF价值 |
| **P1** | 光环位置评分 | +value/4(弱化), +value/5(攻击), +value×L/20(净化) | 无显式光环评分 | APK利用光环走位 |
| **P0** | 敌方阵容分析 | 分析敌方类型推荐克制兵种 | 按固定优先级+高级兵倾向 | APK有战术针对性招募 |
| **P1** | 招募上限 | 按兵种ID有不同上限（地形影响） | 无上限限制 | APK限制同兵种数量 |
| **P2** | 森林/山地评分 | +/− value/10 (取决于UNDEAD) | +防御值×70 | 计算方法完全不同 |
| **P1** | 指挥官招募时机 | 有可用城堡且金币充足时优先 | 阵亡+金币够时优先 | 类似但细节不同 |
| **P2** | 自治疗判断 | HP≤50%才考虑自治疗 | 通过heal评分统一处理 | APK容忍低HP不浪费动作 |
| **P1** | 距离权重 | 接近目标：差值×500/格 | 接近目标：差值×620 | 类似但项目权重稍高 |

### 关键缺失功能

以下APK AI功能在项目 HeuristicAI 中完全缺失：

1. **反击伤害模拟** — AI不考虑攻击后被反击的损失
2. **状态效果价值评估** — 中毒/盲目/弱化的战术价值
3. **光环走位评估** — WEAKENING/ATTACK/CLEANSING光环范围的评分
4. **敌方阵容分析与克制兵种推荐** — 根据敌方单位推荐招募兵种
5. **突击部队二次移动逻辑** — 攻击后利用剩余移动力走位
6. **地形密度分析** — 统计村庄区域水域/森林密度影响招募决策
7. **兵种招募上限** — 每种兵种有最大招募数量限制（与地形相关）
8. **特殊能力单元优先** — 治疗/净化/占领等战略价值单元优先行动
9. **城堡占领风险评估** — 敌方占领己方城堡的严重惩罚(-10000)
10. **指挥官死亡标记(tagged)** — 脚本标记单位额外价值+5000

### Play.ts vs APK调度对比

| 维度 | APK (C0580c) | 项目 (play.ts) |
|------|-------------|----------------|
| AI执行时机 | framework框架自动触发（UI异步） | 主循环手动调用 |
| 玩家AI区分 | 通过C0585e数组(0=未分配,1=人,2=AI,3=网络) | 硬编码 `ais[cp]` |
| 后备AI | `C0581a` 仅返回NEXT_TURN | 无（RandomAI是fallback） |
| 游戏结束检查 | 内置到玩家循环 | `isTerminal()` |
| 多重AI | 通过InterfaceC0597n可插拔 | 数组支持多AI |
| 异步 | Callable提交到线程池 | 同步 |

---
