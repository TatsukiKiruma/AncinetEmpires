# APK 能力规则详解及项目差异对比

> 来源：APK `aer-release-4.2.5.1`，jadx 1.4.7 全量反编译  
> 能力枚举：`p042t/EnumC0614g.java`（26项 ordinals 0-25）  
> 核心规则：`p040a/C0600q.java`（1460行，能力检查、伤害公式、状态附加）  
> 动作执行：`p040a/C0595l.java`（1058行，治疗/支援/召唤/修复执行）  
> 单位配置：`p044v/C0620c.java`（`f1394p int[]` 存储能力ID数组）  
> 常量定义：`p042t/C0611d.java`（30个规则常量，含能力相关）  
> 项目代码：`src/game/abilities.ts` / `engine.ts` / `types.ts`

> 复核日期：2026-07-02。原始 OPENCODE 草稿中混淆了主动治疗、净化光环和支援路径，并误读了部分 APK 地形布尔字段。若旧段落与第 24 节汇总冲突，以本次复核后的第 24 节为准。本次代码修复项：HEALER 允许自治疗；MELEE_MASTER 攻击 MELEE_MASTER 时不触发 1.5 倍近战加成。

---

## 目录

1. [能力总览](#1-能力总览)
2. [VILLAGE_CAPTOR / CASTLE_CAPTOR（占领）](#2-village_captor--castle_captor占领)
3. [REPAIRER（修复）](#3-repairer修复)
4. [AIR_FORCE（空军）](#4-air_force空军)
5. [MARKSMAN（精准射击）](#5-marksman精准射击)
6. [DESTROYER（摧毁）](#6-destroyer摧毁)
7. [SUMMONER（召唤）](#7-summoner召唤)
8. [HEALER（治疗）](#8-healer治疗)
9. [POISONER（施毒） + BLINDING_ATTACK（致盲）](#9-poisoner施毒--blinding_attack致盲)
10. [UNDEAD（亡灵）](#10-undead亡灵)
11. [MELEE_MASTER（近战大师）](#11-melee_master近战大师)
12. [RANGED_DEFENDER（远程防御）](#12-ranged_defender远程防御)
13. [SON_OF_WATER / SON_OF_FOREST / SON_OF_MOUNTAIN（地形之子）](#13-son_of_water--son_of_forest--son_of_mountain地形之子)
14. [SON_OF_LAND（大地之子）](#14-son_of_land大地之子)
15. [BLOODTHIRSTY（嗜血）](#15-bloodthirsty嗜血)
16. [COUNTER_MADNESS（反击风暴）](#16-counter_madness反击风暴)
17. [SELF_REPAIR（自我修复）](#17-self_repair自我修复)
18. [ATTACK_AURA（攻击光环）](#18-attack_aura攻击光环)
19. [CLEANSING_AURA（净化光环）](#19-cleansing_aura净化光环)
20. [WEAKENING_AURA（虚弱光环）](#20-weakening_aura虚弱光环)
21. [ASSAULT_FORCE（突击部队）](#21-assault_force突击部队)
22. [SUPPORTER（支援）](#22-supporter支援)
23. [GRIM_REAPER（死神）](#23-grim_reaper死神)
24. [差异汇总表](#24-差异汇总表)

---

## 1. 能力总览

### APK EnumC0614g（26项，ordinals 0-25）

```java
public enum EnumC0614g {
    VILLAGE_CAPTOR,     // 0
    CASTLE_CAPTOR,      // 1
    REPAIRER,           // 2
    AIR_FORCE,          // 3
    MARKSMAN,           // 4
    DESTROYER,          // 5
    SUMMONER,           // 6
    HEALER,             // 7
    POISONER,           // 8
    UNDEAD,             // 9
    MELEE_MASTER,       // 10
    RANGED_DEFENDER,    // 11
    SON_OF_WATER,       // 12
    SON_OF_FOREST,      // 13
    SON_OF_MOUNTAIN,    // 14
    BLOODTHIRSTY,       // 15
    COUNTER_MADNESS,    // 16
    SELF_REPAIR,        // 17
    ATTACK_AURA,        // 18
    CLEANSING_AURA,     // 19
    WEAKENING_AURA,     // 20
    ASSAULT_FORCE,      // 21
    SON_OF_LAND,        // 22
    BLINDING_ATTACK,    // 23
    SUPPORTER,          // 24
    GRIM_REAPER;        // 25
}
```

### APK→项目能力名映射

| ordinal | APK名 | 项目名 | 单位 |
|---------|-------|--------|------|
| 0 | VILLAGE_CAPTOR | village_capturer | soldier/mermaid/paladin/commander |
| 1 | CASTLE_CAPTOR | castle_capturer | commander |
| 2 | REPAIRER | repairer | soldier/mermaid/commander |
| 3 | AIR_FORCE | flying | ghost/elf/dragon |
| 4 | MARKSMAN | sharpshooter | archer/wolf_archer |
| 5 | DESTROYER | destroyer | catapult |
| 6 | SUMMONER | summoner | witch |
| 7 | HEALER | healer | paladin |
| 8 | POISONER | poisoner | wolf/skeleton |
| 9 | UNDEAD | undead | ghost/skeleton |
| 10 | MELEE_MASTER | melee_master | dragon |
| 11 | RANGED_DEFENDER | ranged_defense | golem/dragon |
| 12 | SON_OF_WATER | water_child | mermaid/water_elem/ice_elem/dark_mage |
| 13 | SON_OF_FOREST | forest_child | elf/wolf_archer |
| 14 | SON_OF_MOUNTAIN | mountain_child | golem |
| 15 | BLOODTHIRSTY | fighting_spirit | berserker |
| 16 | COUNTER_MADNESS | counter_storm | berserker |
| 17 | SELF_REPAIR | self_repair | slime/ice_elemental |
| 18 | ATTACK_AURA | attack_aura | druid |
| 19 | CLEANSING_AURA | cleansing_aura | elf |
| 20 | WEAKENING_AURA | weakness_aura | golem |
| 21 | ASSAULT_FORCE | assault_troop | wolf/wolf_archer/dragon |
| 22 | SON_OF_LAND | earth_child | berserker/wolf/golem/druid |
| 23 | BLINDING_ATTACK | blinder | dark_mage/wolf_archer |
| 24 | SUPPORTER | supporter | druid |
| 25 | GRIM_REAPER | death_reaper | ghost |

### APK 能力检查方法

```java
// C0600q.java:587-593
public boolean m4359a(C0613f c0613f, EnumC0614g enumC0614g) {
    for (int i : this.f1211b.f1367b[c0613f.f1303a].f1394p) {
        if (i == enumC0614g.ordinal()) {  // 按ordinal号匹配
            return true;
        }
    }
    return false;
}
```
证据：`C0600q.java:587` / `C0620c.java:56` (`f1394p int[]` 能力ID数组)

---

## 2. VILLAGE_CAPTOR / CASTLE_CAPTOR（占领）

### APK 规则

**占领判定**（`C0600q.m4321d:897-903`）：
```java
// tile.f1374g (capturable=true) 且 不是己方占领
// tile.f1369b == 3 (城堡) + 有 CASTLE_CAPTOR
// tile.f1369b == 4 (村庄) + 有 VILLAGE_CAPTOR
return (m4284j.f1369b == 3 && m4359a(c0613f, EnumC0614g.CASTLE_CAPTOR)) 
    || (m4284j.f1369b == 4 && m4359a(c0613f, EnumC0614g.VILLAGE_CAPTOR));
```

**占领收入**（`C0600q.m4346b:597-616`）：
```java
// 每个城堡: f1289r=100 gold/turn
// 每个村庄: f1292u=50 gold/turn
// 指挥官额外: f1290s=50 + f1291t=25×level
```
证据：`C0600q.java:897-903`（capture检查）/ `C0600q.java:597-616`（收入）

### 项目实现

**占领判定**（`src/game/rules.ts:211-215`）：
```typescript
if (terrainConfig.key === 'town' && canCaptureOwner && hasAbi(unit, 'village_capturer'))
    actions.push({ type: 'capture', unitId: unit.id });
if (terrainConfig.key === 'castle' && canCaptureOwner && hasAbi(unit, 'castle_capturer'))
    actions.push({ type: 'capture', unitId: unit.id });
```
**执行**（`engine.ts:642-659`）：直接设置 `tile.ownerId`

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | tile.f1374g 统一标记 capturable | 通过 terrain key 判定 | 项目忽略 capturable 标签 |
| P1 | tile.f1369b==3/4 区分城堡/村庄 | 用 terrainConfig.key 区分 | 字段映射问题 |
| P2 | 收入计算在收入方法中统一处理 | 收入逻辑在内置规则中 | 功能等价 |

---

## 3. REPAIRER（修复）

### APK 规则

**修复判定**（`C0600q.m4306f:1017-1018`）：
```java
return c0613f != null && this.f1214e.m4236a(i, i2) 
    && m4359a(c0613f, EnumC0614g.REPAIRER) 
    && m4284j(i, i2).f1376i >= 0;
```
`tile.f1376i` 是修复后目标地形/层对象 ID（>=0 表示可修复），不是单位生成 ID。

**修复执行**（`C0595l.m4438f:806`）：调用 `m4463a(tile.f1376i, owner, x, y, NONE)`，后续由地图层替换地形 ID 并设置所有者；不会生成单位。
证据：`C0600q.java:1017-1018` / `C0595l.java:806` / `C0595l.java:358` / `C0607b.java:160,370`

### 项目实现

**修复判定**（`rules.ts:224-225`）：
```typescript
if (terrainConfig.key === 'damaged_town' && hasAbi(unit, 'repairer'))
    actions.push({ type: 'repair', unitId: unit.id });
```
**执行**（`engine.ts:662-676`）：把 `damaged_town`(8) 变成 `town`(9)，设置 owner

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 修复损坏建筑时替换地形并设置所有者 | 修复 `damaged_town` 为 `town` 并设置所有者 | 规则语义匹配 |
| P2 | 通过 `f1376i>=0` 判定 | 通过 `damaged_town` key 判定 | 数据字段映射不同 |

---

## 4. AIR_FORCE（空军）

### APK 规则

**移动消耗**（`C0600q.m4357a:306-319`）：
```java
if (m4359a(c0613f, EnumC0614g.AIR_FORCE)) return 1;  // 所有地形移动=1
```

**地形防御忽略**（`C0600q.m4364a:262-265`）：
```java
int i = m4359a(c0613f, EnumC0614g.AIR_FORCE) ? 0 : 0 + m4352a.f1371d;
// AIR_FORCE 不获得地形防御加成（防御=0）
```

**空中攻击加成**（`C0600q.m4360a:302`，与语言表一致）：
```java
// 攻击水中非空军目标: + f1273b (10伤害)
return (!目标在水中 || !AIR_FORCE || 目标也是AIR_FORCE) ? i : i + f1273b;
```

**攻击限制**（`C0600q.m4261q:224-225`）：
```java
// 非空军不能攻击空军（除非目标在地面）
return 目标为空 || 不是敌人 || (AIR_FORCE && !目标AIR_FORCE);
```

证据：`C0600q.java:306-319`（移动）/ `C0600q.java:262-265`（防御）/ `C0600q.java:302`（攻击加成）/ `en.lang:299`（能力文案）

### 项目实现

**移动消耗**（`abilities.ts:95-97`）：
```typescript
if (isFlying(unit)) return 1;  // 匹配
```

**地形防御忽略**（`rules.ts:47`）：`const defBonus = isFlying(defender) ? 0 : getTileDefenseBonus(defTile);`

**空中攻击加成**（`rules.ts:39-41`）：飞行单位攻击水地形上的非飞行目标 +10

**攻击限制**：项目当前无“地面单位不能攻击空军”限制；该限制未在 APK 英文能力文案中出现，需单独结合 `m4261q` 调用场景复核。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | AIR_FORCE 忽略地形防御加成 | 已实现 | 匹配 |
| P2 | AIR_FORCE 对水中非空军 +10 伤害 | 已实现 | 匹配 |
| 待核实 | `m4261q` 是否还隐含攻击限制 | 项目无此限制 | 需单独结合动作生成路径确认，不列为已确定差异 |

---

## 5. MARKSMAN（精准射击）

### APK 规则

**对空加成**（`C0600q.m4360a:293-294`）：
```java
if (m4359a(c0613f, EnumC0614g.MARKSMAN) && m4359a(c0613f2, EnumC0614g.AIR_FORCE)) {
    i += this.f1215f.f1231c.f1276e;  // +10
}
```
证据：`C0600q.java:293-294`

### 项目实现

`rules.ts:33-35` 已实现 `sharpshooter` 攻击 `flying` 目标 +10。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | MARKSMAN 对 AIR_FORCE +10 伤害 | 已实现 | 匹配 |

---

## 6. DESTROYER（摧毁）

### APK 规则

**摧毁判定**（`C0600q.m4362a:580-581`）：
```java
// 目标为空 → 检查 DESTROYER + tile有建筑(f1375h>=0)
return m4207i == null ? m4359a(c0613f, EnumC0614g.DESTROYER) && m4284j(i, i2).f1375h >= 0 : 有敌人;
```

**攻击建筑加成**（`C0600q.m4360a:290-291`）：
```java
if (m4359a(c0613f, EnumC0614g.DESTROYER) && m4352a(c0613f2.f1305c).f1375h >= 0) {
    i += this.f1215f.f1231c.f1272a;  // +10
}
```

**可攻击检查**（`C0600q.m4301g:1051-1062`）：
```java
// DESTROYER 可攻击建筑（即使没有敌人）
if (m4211f == null) {
    if (m4352a(c0632c).f1375h >= 0 && m4359a(c0613f, EnumC0614g.DESTROYER)) return true;
}
```
证据：`C0600q.java:580-581` / `C0600q.java:290-291` / `C0600q.java:1051-1062`

### 项目实现

**摧毁判定**（`rules.ts:219-220`）：
```typescript
if (terrainConfig.key === 'town' && hasAbi(unit, 'destroyer'))
    actions.push({ type: 'destroy_town', unitId: unit.id });
```

**执行**（`engine.ts:623-639`）：将 `town` 设置为 `damaged_town`(8)

**建筑攻击加成**（`rules.ts:36-38`）：`destroyer` 攻击站在 `town` 上的目标时 +10。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | DESTROYER 对建筑 +10 伤害 | 已实现 | 匹配 |
| 待核实 | 可空击建筑（无单位时直接摧毁） | 项目需要单位站桩才能摧毁 | 需单独确认动作模型是否要对齐 |

---

## 7. SUMMONER（召唤）

### APK 规则

**召唤判定**（`C0600q.m4300g:1066-1068`）：
```java
return 为空 && 空地在召唤距离内 && 有SUMMONER;
```

**召唤执行**（`C0595l`）：消耗墓碑，生成 skeleton（兵种ID=10），继承召唤者等级
证据：`C0600q.java:1066-1068`

### 项目实现

**召唤判定**（`rules.ts:182-188`）：
```typescript
if (hasAbi(unit, 'summoner') && state.graves) {
    for (const grave of state.graves) {
        if (getDistance(unit.pos, grave.pos) <= 2)
            actions.push({ type: 'summon', summonerId: unit.id, graveId: grave.id, spawnPos: { ...grave.pos } });
    }
}
```

**执行**（`engine.ts:569-601`）：生成 skeleton，继承 summoner 等级，移除墓碑

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 召唤距离由 `m4313e` 计算（移动力+盲距） | 硬编码距墓碑≤2 | 功能等价 |

---

## 8. HEALER（治疗）

### APK 规则

**主动治疗量**（`C0600q.m4312e:909-915`，由 `C0595l.m4450b` 的 HEAL 分支调用）：
```java
C0611d c0611d = this.f1215f.f1231c;
int i = c0611d.f1295x + (c0611d.f1296y * c0613f.f1316n);
// f1295x=40, f1296y=10 → 40 + 10×level
return m4359a(c0613f2, EnumC0614g.UNDEAD) ? ((-i) * 3) / 2 : i;
```
→ 治疗亡灵时变为 1.5 倍伤害。`m4305f = 10+5×level` 是净化光环的小额治疗路径，不是 HEAL 命令。

**治疗目标判定**（`C0600q.m4276k:1284-1292`）：
```java
if (c0613f == null || c0613f2 == null || !m4359a(c0613f, EnumC0614g.HEALER)) return false;
if (m4359a(c0613f2, EnumC0614g.UNDEAD)) return true;  // 亡灵可治疗（造成伤害）
return (m4295h(c0613f2) && !m4281j(c0613f, c0613f2))  // 未中毒+不是敌人
    && (m4272l(c0613f, c0613f2) || m4265o(c0613f, c0613f2));  // 在范围或自身
```
→ **治疗可对自己使用**（`m4265o` 检查是否是同一单位）

**治疗不封顶 HP**（`m4307f:977-979`）：
```java
return C0641e.m4121a(c0613f.f1307e, i, 0, m4253y(c0613f)) - c0613f.f1307e;
// clamp 到 [1, maxHP] 但治疗量计算会超出
```

**治疗执行**（`C0595l`）：非攻击命令（HEAL 动作），不触发反击

**治疗经验**（`C0595l.m4458a`）：
- 治疗存活目标：`f1283l=30` (30 EXP)
- 治疗杀死亡灵：`f1285n=60` (60 EXP)

**治疗/光环执行区别**：
- 主动 HEAL 用 `m4312e`（40+10×level，亡灵 1.5 倍伤害）
- CLEANSING_AURA 用 `m4305f`（10+5×level，亡灵等额伤害）
- SUPPORTER 的支援执行不调用 HP 治疗/伤害路径，只重置目标行动状态

证据：`C0600q.java:909-915`（主动治疗量公式）/ `C0595l.java:551`（HEAL 调用）/ `C0600q.java:982-988`（净化光环量公式）/ `C0600q.java:1284-1292`（治疗目标判定）/ `C0600q.java:977-979`（HP clamp）

### 项目实现

**治疗量**（`engine.ts:542-556`）：
```typescript
const healVal = healer.unitClass === 'paladin' ? (40 + level * 10) : 40;
```
→ 硬编码：paladin 用 `40+10×level`，其他治疗者用40

**治疗目标判定**（`rules.ts:84-96`）：
```typescript
if (getDistance(healer.pos, target.pos) > 1) return false;
```
→ 已按 APK 复核结果移除自治疗禁止。

**治疗不封顶 HP**：项目直接 `target.hp += healVal`（匹配）

**治疗亡灵伤害**（`engine.ts:546-556`）：
```typescript
if (isUndead(target)) {
    hpDelta = -Math.floor((healVal * 3) / 2);  // 1.5倍伤害，与APK不同
    ...
}
```
→ 与 APK 主动治疗亡灵 1.5 倍伤害匹配。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| 已修复 | 治疗可对**自身**使用 | 已允许自治疗 | 匹配 |
| P2 | 主动治疗公式：`40+10×level` | paladin=`40+10×level` | 当前治疗单位匹配 |
| P2 | 治疗亡灵：HP `-1.5×healVal` | 治疗亡灵：HP `-1.5×healVal` | 匹配 |
| P2 | 治疗经验：存活30/击杀60 | 项目：存活30/击杀60 | 匹配 |

---

## 9. POISONER（施毒） + BLINDING_ATTACK（致盲）

### APK 规则

**状态附加顺序**（`C0600q.m4328c:794-801`）：
```java
// 1. 先加中毒
if (m4359a(c0613f, EnumC0614g.POISONER) && !m4359a(c0613f2, EnumC0614g.POISONER)) {
    m4358a(c0613f2, EnumC0615h.POISONED, f1270I=2, false);
}
// 2. 后加致盲（POISONER免疫，BLINDING_ATTACK免疫）
if (!m4359a(c0613f, EnumC0614g.BLINDING_ATTACK) || m4359a(c0613f2, EnumC0614g.BLINDING_ATTACK)) return;
m4358a(c0613f2, EnumC0615h.BLINDED, f1268G=1, false);
```

**免疫规则**（`C0600q.m4328c:795-801`）：
- POISONER 免疫 POISONED（有 POISONER 的单位不会被中毒）
- BLINDING_ATTACK 免疫 BLINDED（有 BLINDING_ATTACK 的单位不会被致盲）

**中毒效果**（`C0600q.m4331c:730-737` / 回合结算 `m4472a`）：
- 亡灵：+10 HP
- 召唤师：0
- 其他：-10 HP
- 持续 `f1270I=2` 回合
- EOT 后减1

**致盲效果**（`C0600q.m4258t`）：
- 攻击距离 minRange=maxRange=0
- 即 `m4258t` 返回 0（blind 时无攻击范围）
- 持续 `f1268G=1` 回合

证据：`C0600q.java:794-801`（状态附加）/ `C0600q.java:730-737`（中毒伤害）/ 致盲通过 `m4258t` 返回值控制

### 项目实现

**状态附加**（`engine.ts:357-372`）：
```typescript
// 1. 先加中毒
if (hasAbility(source, 'poisoner') && !hasAbility(target, 'poisoner')) {
    if (!target.status || target.status.type === 'poisoned') {
        target.status = { type: 'poisoned', remainingTicks: 2 };
    }
}
// 2. 后加致盲
if (hasAbility(source, 'blinder') && !hasAbility(target, 'blinder')) {
    if (!target.status || target.status.type === 'blinded') {
        target.status = { type: 'blinded', remainingTurns: 1 };
    }
}
```

**免疫规则**：匹配（POISONER 免疫中毒，BLINDING_ATTACK 免疫致盲）

**中毒效果**（`engine.ts:320-322`）：
```typescript
if (u.status?.type === 'poisoned') {
    hpDelta = isUndead(u) ? hpDelta + 10 : -10;
}
```

**致盲效果**（`abilities.ts:229-232`）：
```typescript
if (unit.status && unit.status.type === 'blinded') {
    minRange = 0;
    maxRange = 0;
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 状态附加顺序：中毒→致盲 | 一致 | 匹配 |
| P2 | 中毒持续 `f1270I=2` 回合 | remainingTicks=2 | 匹配 |
| P2 | 致盲持续 `f1268G=1` 回合 | remainingTurns=1 | 匹配 |
| P2 | 免疫规则一致 | 一致 | 匹配 |
| P2 | `m4331c` 的召唤师豁免属于墓碑结算，不是中毒结算 | 墓碑豁免已在 `engine.ts:347-352` 实现 | 匹配 |

---

## 10. UNDEAD（亡灵）

### APK 规则

**墓碑**（`C0600q.m4331c:730-737`）：
```java
if (m4359a(c0613f, EnumC0614g.UNDEAD)) return -f1282k;  // 亡灵:+10 HP
if (m4359a(c0613f, EnumC0614g.SUMMONER)) return 0;      // 召唤师:0
return f1282k;                                            // 其他:-10 HP
```
**治疗效果反转**（`C0600q.m4312e:909-915` / `C0600q.m4305f:982-988`）：
- HEALER 主动治疗亡灵 → 变为 `-i×3/2` 伤害
- CLEANSING_AURA 作用于亡灵 → 变为等额伤害
- SUPPORTER 支援不改变 HP

**治疗目标判定可通过 UNDEAD**（`C0600q.m4276k:1284-1292` / `m4269m:1361-1362`）：
```java
// 可以治疗/攻击亡灵（造成伤害）
if (m4359a(c0613f2, EnumC0614g.UNDEAD)) return true;
```

**亡灵不能获得 INSPIRED**（`C0600q.m4328c`）：在 temple/aura 处理中，
INSPIRED 使用 `f1350a` 标记判断，UNDEAD 不受 INSPIRED 影响
（`EnumC0615h.INSPIRED.f1350a = false`，而 GRIM_REAPER 对 `f1350a=true` 的目标加伤）

**自身免疫**：UNDEAD 单位不受 POISONED 负面伤害（反而回复）

证据：`C0600q.java:730-737` / `C0600q.java:982-988` / `C0600q.java:909-915` / `C0600q.java:1284-1292`

### 项目实现

**墓碑**（`engine.ts:347-352`）：
```typescript
if (isUndead(unit)) {
    this.applyCappedRecovery(unit, getEffectiveStats(unit).maxHp, 10);
} else if (!hasAbility(unit, 'summoner')) {
    unit.hp -= 10;
}
```

**治疗效果反转**（`engine.ts:546-556`；支援本身不改变 HP）：
```typescript
if (isUndead(target)) {
    hpDelta = -Math.floor((healVal * 3) / 2);  // 1.5倍
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 墓碑 APK 用 `f1282k=10`，治疗后 clamp | 项目用 `applyCappedRecovery` | 功能等价 |
| P2 | 支援不改变亡灵 HP | 项目支援不执行 HP 效果 | 匹配 |
| P2 | 主动治疗亡灵：HP `-1.5×healVal` | 治疗亡灵：HP `-1.5×healVal` | 匹配 |
| P2 | 亡灵不影响 INSPIRED 获取 | 同（已实现） | 匹配 |

---

## 11. MELEE_MASTER（近战大师）

### APK 规则

**伤害倍率**（`C0600q.m4339b:653`）：
```java
// 近战(距离=1) + 有MELEE_MASTER + 目标无MELEE_MASTER → 倍率150%
int i2 = (m4263p == 1 && m4359a(攻击方, MELEE_MASTER) && !m4359a(目标, MELEE_MASTER)) ? 150 : 100;
```
证据：`C0600q.java:653`

### 项目实现

**伤害倍率**（`abilities.ts:173-174`）：
```typescript
if (hasAbility(attacker, 'melee_master') && distance === 1) {
    multiplier *= 1.5;
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| 已修复 | MELEE_MASTER 互怼时无效（双方都有则无加成） | 已检查目标没有 MELEE_MASTER | 匹配 |

---

## 12. RANGED_DEFENDER（远程防御）

### APK 规则

**伤害减半**（`C0600q.m4339b:654-656`）：
```java
// 远程(距离>1) + 目标有RANGED_DEFENDER → 倍率-50%=50%
if (m4263p > 1 && m4359a(c0613f2, EnumC0614g.RANGED_DEFENDER)) i2 -= 50;
```
证据：`C0600q.java:654`

### 项目实现

**伤害减半**（`abilities.ts:177-179`）：
```typescript
if (hasAbility(defender, 'ranged_defense') && distance > 1) {
    multiplier *= 0.5;
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 实现一致 | 一致 | 匹配 |

---

## 13. SON_OF_WATER / SON_OF_FOREST / SON_OF_MOUNTAIN（地形之子）

### APK 规则

**移动消耗**（`C0600q.m4357a:306-319`）：
```java
// 语言表确认：SON_OF_WATER 在水地形移动消耗1。
// 反编译条件 SON_OF_WATER && !c0619b.f1368a 中，!f1368a 对应水地形。
// SON_OF_FOREST: f1369b==2（森林）移动=1
// SON_OF_MOUNTAIN: f1369b==1（山地）移动=1
if (SON_OF_WATER && !c0619b.f1368a) return 1;
if (SON_OF_FOREST && f1369b==2) return 1;
if (SON_OF_MOUNTAIN && f1369b==1) return 1;
```

**地形攻防加成**（`C0600q.m4360a:281-288` / `m4364a:262-265` / `m4342b:625-636`）：
```java
// 攻击加成(SON_OF_xxx + 对应地形): +f1277f=10
if (SON_OF_MOUNTAIN && f1369b==1) i += 10;
if (SON_OF_FOREST && f1369b==2) i += 10;
if (SON_OF_WATER && !f1368a) i += 10; // 水地形

// 地形防御加成: 如果有对应的地形之子，获得额外f1278g=10防御
// (m4364a: 地形之子在对应地形 +10防御)

// 回合初回复: m4342b, 对应地形 + f1263B=10 + f1264C=0×level
```

**回合初回复**（`C0600q.m4342b:625-636` 在 `C0595l.m4472a` turn-start 中调用）：
```java
// 在地形之子对应的地形上，回合初回复 f1263B=10 HP
if (SON_OF_WATER && 水地形) → 或 (SON_OF_FOREST && f1369b==2) || (SON_OF_MOUNTAIN && f1369b==1)
    i += f1263B + f1264C*level;
```

**注意**：APK 中地形通过 `f1369b kind` 判断：
- `f1369b==1` = 山地 (MOUNTAIN)  
- `f1369b==2` = 森林 (FOREST)
- `!f1368a` = 水域 (WATER)，此处原始草稿曾误读
- 其他 = 平原/特殊地形

证据：`C0600q.java:306-319`（移动）/ `C0600q.java:281-288`（攻击加成）/ `C0600q.java:262-265`（防御）/ `C0600q.java:625-636`（回复）

### 项目实现

**移动消耗**（`abilities.ts:100-112`）：
```typescript
if (hasAbility(unit, 'water_child') && isWaterTerrain(tile)) return 1;
if (hasAbility(unit, 'forest_child') && isForestTerrain(tile)) return 1;
if (hasAbility(unit, 'mountain_child') && isMountainTerrain(tile)) return 1;
```
→ APK 语言表 `en.lang:308` 与项目实现一致：`water_child` 在水地形上移动=1。

**攻击加成**（`abilities.ts:130-145`）：
```typescript
if (hasAbility(attacker, 'water_child') && isWaterTerrain(atkTile)) bonus += 10;
if (hasAbility(attacker, 'forest_child') && isForestTerrain(atkTile)) bonus += 10;
if (hasAbility(attacker, 'mountain_child') && isMountainTerrain(atkTile)) bonus += 10;
```

**回合初回复**（`engine.ts:310-318`）：
```typescript
if (hasAbility(u, 'water_child') && isWaterTerrain(tile)) hpDelta += 10;
if (hasAbility(u, 'forest_child') && isForestTerrain(tile)) hpDelta += 10;
if (hasAbility(u, 'mountain_child') && isMountainTerrain(tile)) hpDelta += 10;
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | SON_OF_WATER: 水地形移动=1 | water_child: 水地形移动=1 | 匹配 |
| P2 | SON_OF_FOREST: 森林移动=1 | forest_child: 森林移动=1 | 匹配 |
| P2 | SON_OF_MOUNTAIN: 山地移动=1 | mountain_child: 山地移动=1 | 匹配 |
| P2 | 攻击加成：对应地形+10 | 匹配 | 匹配 |
| P2 | 回合初回复：对应地形+10 | 在 `applyTurnStartHpDelta` 中 | 匹配 |
| P2 | 地形判定：`f1369b==1/2` + `f1368a` | 项目通过 terrain tag | 字段映射问题 |

---

## 14. SON_OF_LAND（大地之子）

### APK 规则

**移动消耗**（`C0600q.m4357a:316-319`）：
```java
// SON_OF_LAND: 陆地→移动1，水面和桥→移动2
if (m4359a(c0613f, EnumC0614g.SON_OF_LAND) && c0619b.f1368a) {
    // 陆地上
    return 1;
}
// 水上时：语言表与项目门禁固化为移动2；桥也算水地形
return (!m4359a(c0613f, EnumC0614g.SON_OF_LAND) || c0619b.f1368a) ? i : i + 1;
```
解析：
- 陆地（`f1368a`）：移动1
- 水面和桥：移动2（`en.lang:318`，`apk:language-rule-report` 已门禁）

**BLOODTHIRSTY 专属**：SON_OF_LAND 在 AI 评估 `m2346h` 中 +1 位置价值

### 项目实现

**移动消耗**（`abilities.ts:115-122`）：
```typescript
if (hasAbility(unit, 'earth_child')) {
    if (isWaterTerrain(tile)) return 2;
    if (isLandTerrain(tile)) return 1;   // 陆地=1
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | SON_OF_LAND 水面和桥移动=2 | earth_child 水地形移动=2 | 匹配 |
| P2 | SON_OF_LAND 陆地：固定1 | earth_child 陆地：固定1 | 匹配 |

---

## 15. BLOODTHIRSTY（嗜血）

### APK 规则

**满伤不管HP**（`C0600q.m4339b:650-652`）：
```java
if (!m4359a(c0613f, EnumC0614g.BLOODTHIRSTY)) {
    i = (i * c0613f.f1307e) / m4253y(c0613f);  // 非BLOODTHIRSTY按HP比例缩放
}
// BLOODTHIRSTY: 跳过HP缩放，damage = full
```
证据：`C0600q.java:650-652`

### 项目实现

`rules.ts:66-68` 已实现：`fighting_spirit` 使用满血比例 1，否则按当前 HP / 最大 HP 缩放伤害。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | BLOODTHIRSTY = 满血伤害（无视当前HP） | 已实现 | 匹配 |

---

## 16. COUNTER_MADNESS（反击风暴）

### APK 规则

**反击距离**（`C0600q.m4287i:1214-1218`）：
```java
public boolean m4287i(C0613f attacker, C0613f defender) {
    if (m4277k(defender) && 是敌人) {
        return m4359a(defender, COUNTER_MADNESS) 
            ? m4263p(defender, attacker) <= 2    // 反击风暴：≤2格内可反击
            : m4263p == 1 && 在范围;              // 普通反击：相邻+射程内
    }
    return false;
}
```
证据：`C0600q.java:1214-1218`

### 项目实现

**反击判定**（`engine.ts:496-509`）：
```typescript
const isCounterStorm = hasAbility(target, 'counter_storm') && getDistance(target.pos, attacker.pos) <= 2;
const canNormalCounter = distance === 1 && inRange(...);
canCounter = isCounterStorm || canNormalCounter;
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 逻辑一致 | 一致 | 匹配 |

---

## 17. SELF_REPAIR（自我修复）

### APK 规则

**回合初回复**（`C0595l.m4472a` EOT 处理中）：
```java
// SELF_REPAIR: 回复 25% 最大HP
// 在 turn-start 处理中，在 terrainHeal 之后，poison 之后
```
通过 `C0600q` 中 `SELF_REPAIR` 能力检查 + 25% 回复

### 项目实现

**回合初回复**（`engine.ts:324-326`）：
```typescript
if (hasAbility(u, 'self_repair')) {
    hpDelta += Math.floor(eff.maxHp * 0.25);
}
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | SELF_REPAIR 在 terrainHeal **之后**应用 | SELF_REPAIR 在 terrainHeal **之后** | 匹配 |
| P2 | 25% 最大HP | `Math.floor(eff.maxHp * 0.25)` | 匹配 |

---

## 18. ATTACK_AURA（攻击光环）

### APK 规则

**触发时机**：unit wait/standby 时触发（`C0595l.m4442d:688-810`）

**效果（半径2）**：
```java
// 对半径2内的友方单位附加 INSPIRED 状态，持续 f1269H=0 回合
// f1269H=0 → 持续到当前回合结束
```

**INSPIRED 效果**（`C0600q.m4360a:296-297`）：
```java
if (INSPIRED == attackerStatus) {
    i += m4263p(attacker, defender) > 1 
        ? this.f1215f.f1231c.f1275d / 2  // 远程: +5
        : this.f1215f.f1231c.f1275d;      // 近战: +10
}
```
→ INSPIRED 提供 +10 伤害（近战）或 +5 伤害（远程）

证据：`C0600q.java:688-810`（aura触发）/ `C0600q.java:296-297`（INSPIRED伤害）

### 项目实现

**触发时机**（`engine.ts:397-404`）：
```typescript
if (hasAbility(unit, 'attack_aura')) {
    this.state.units.forEach(u => {
        if (areAlliedPlayers && getDistance <= 2) {
            if (!u.status) {
                u.status = { type: 'inspired', remainingTurns: 1 };
            }
        }
    });
}
```

**INSPIRED 效果**（`rules.ts` `calculateDamage` 中）：
```typescript
const inspiredAttackBonus = attacker.status?.type === 'inspired'
    ? (dist > 1 ? 5 : 10)
    : 0;
```
→ 项目 INSPIRED 近战 +10，远程 +5。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | INSPIRED 近战+10，远程+5 | 已实现 | 匹配 |
| P2 | 触发时机一致（wait时触发） | 一致 | 匹配 |

---

## 19. CLEANSING_AURA（净化光环）

### APK 规则

**触发时机**：unit move/standby 时触发（`C0595l.m4442d:688-810`）

**效果（半径2）**：
```java
// 1. 净化负面状态（POISONED/BLINDED/WEAKENED）
// 2. 回复 HP: f1297z + f1262A×level → 10+5×level
// 3. 对亡灵造成伤害（等于回复量）
```

### 项目实现

**触发时机**（`engine.ts:379-394`）：
```typescript
// 随 wait 触发
const level = unit.level ?? 0;
const healVal = 10 + level * 5; // 升级后净化光环回血+5
// 友方范围内：治疗 10+5×level，净化状态
// 亡灵：造成 =healVal 伤害（不是1.5倍）
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 净化光环 HP 回复：`10 + level × 5` | `10 + level × 5` | 匹配 |
| P2 | 净化对亡灵伤害：回复量的1倍（`-healVal`） | `u.hp = Math.max(0, u.hp - healVal)` | 功能等价 |
| P2 | 净化负面状态 | `clearNegativeStatus(u)` | 匹配 |

---

## 20. WEAKENING_AURA（虚弱光环）

### APK 规则

**触发时机**：unit move/standby 时触发（与 CLEANSING_AURA 同一方法）

**效果（半径2）**：
```java
// 对半径2内的敌方单位附加 WEAKENED 状态，持续 f1271J=1 回合
// f1271J=1 → 持续到下一个 EOT
```

**WEAKENED 效果**（`C0600q.m4320d:824-830`）：
```java
// 移动力降至 1；防御减少：f1266E=10，远程时减半=5
if (WEAKENED) {
    m4262q -= m4263p > 1 ? f1266E/2 : f1266E;  // 远程-5，近战-10
}
```
→ 语言表 `en.lang:326` 确认 WEAKENED 会将移动力降至 1。

证据：`C0600q.java:824-830`

### 项目实现

**WEAKENED 效果**（`abilities.ts:220-224`）：
```typescript
if (unit.status && unit.status.type === 'weakened') {
    pDef -= 10;  // 固定-10
    mDef -= 10;
    move = 1;    // 移动降至1
}
```
→ 项目 WEAKENED 降低移动力至1；远程减半差异在伤害公式中按距离补偿。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | WEAKENED：移动=1，防御近战-10/远程-5 | 已实现 | 匹配 |
| P2 | 触发时机一致 | 一致 | 匹配 |

---

## 21. ASSAULT_FORCE（突击部队）

### APK 规则

**攻击后移动**：攻击后如果还有剩余移动力，可移动到一个新的位置

**实现**（`C0595l.m4453a` 攻击执行后）：
```java
// 1. 检查剩余移动力 (`f1308f > 0`)
// 2. 如果有剩余移动力，触发移动决策到新位置
if (m4278k.f1308f > 0 && m4415t().m4359a(m4278k, EnumC0614g.ASSAULT_FORCE)) {
    m4425m().m4572b();  // 触发二次移动模式
}
```

**移动力保留**：到达攻击位置时记录移动消耗，剩余移动力保留
证据：`C0595l.java:530-538`

### 项目实现

**攻击后移动**（`engine.ts:528-533`）：
```typescript
if (hasAbility(attacker, 'assault_troop') && (attacker.movementRemaining ?? 0) > 0 && !attacker.hasPostAttackMoved) {
    // 暂不设 acted，通过规则系统生成 post_attack_move 动作
}
```
→ 使用 `movementRemaining` 追踪剩余移动力，生成 `post_attack_move` 动作

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 逻辑一致 | 一致 | 匹配 |

---

## 22. SUPPORTER（支援）

### APK 规则

**支援判定**（`C0600q.m4267n:1371-1372`）：
```java
return c0613f != null && c0613f2 != null 
    && c0613f2.f1311i                                         // 已被行动
    && !c0613f2.f1312j                                        // 状态字段，语义需结合动作循环确认
    && m4299g(c0613f, c0613f2)                                // 同队
    && m4359a(c0613f, EnumC0614g.SUPPORTER)                   // 有SUPPORTER
    && !m4359a(c0613f2, EnumC0614g.SUPPORTER)                 // 目标不能有SUPPORTER
    && c0613f.f1316n >= c0613f2.f1316n;                        // 支援者等级≥目标
```
→ `f1311i` 对应已待机/已行动；`f1312j` 的项目字段映射不应只按变量名直接等同。

**支援执行**（`C0595l.m4434h:878-886`）：
```java
// 1. 重置目标行动状态
m4420o.f1311i = false;   // hasActed = false
m4420o.f1312j = true;    // 状态字段
// 2. 重置移动力到最大值
m4378B(m4420o);          // movement = max
// 3. 支援事件经验: f1288q = 10
```
→ 支援不调用 `m4312e` 或 `m4305f`，不改变 HP。

**支援者约束**：支援者等级 ≥ 目标等级，目标不能有 SUPPORTER 能力

证据：`C0600q.java:1371-1372` / `C0595l.java:878-886` / `C0595l.java:1038`

### 项目实现

**支援判定**（`rules.ts:194-203`）：
```typescript
if (hasAbi(unit, 'supporter')) {
    for (const friend of sameTeamUnits) {
        const isExcluded = hasAbi(friend, 'assault_troop') 
            || hasAbi(friend, 'castle_capturer') 
            || hasAbi(friend, 'supporter');
        const isLevelLesserOrEqual = (friend.level ?? 0) <= (unit.level ?? 0);
        const notSupportedYet = !friend.hasBeenSupportedThisTurn;
        if (friend.hasActed && !isExcluded && isLevelLesserOrEqual && notSupportedYet) {
            actions.push({ type: 'support', supporterId: unit.id, targetId: friend.id });
        }
    }
}
```

**支援执行**（`engine.ts:604-621`）：
```typescript
// 重置目标行动状态
target.hasActed = false;
target.hasMoved = false;
target.movementRemaining = getEffectiveStats(target).move;
// 经验
addExp(supporter, 10, ruleConfig.levelCap);
```

**排除规则**（`rules.ts:198`）：
```typescript
const isExcluded = hasAbi(friend, 'assault_troop') 
    || hasAbi(friend, 'castle_capturer') 
    || hasAbi(friend, 'supporter');
```

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | 支援不改变 HP | 项目支援不改变 HP | 匹配 |
| P2 | 支援者等级≥目标 | 已实现 | 匹配 |
| P2 | 支援经验：10 | 支援经验：10 | 匹配 |
| P1 | 排除规则：目标有 SUPPORTER；ASSAULT_FORCE 文案也声明不能被支援 | 项目排除 SUPPORTER/ASSAULT_FORCE/CASTLE_CAPTOR | CASTLE_CAPTOR 是否应排除仍需单独核实 |
| 待核实 | `f1312j` 支援后状态字段 | 项目置 `hasMoved=false` 并恢复移动力 | 需结合 APK UI 动作循环确认，不列为本轮代码修复 |

---

## 23. GRIM_REAPER（死神）

### APK 规则

**伤害加成**（`C0600q.m4360a:299-300`）：
```java
if (m4359a(c0613f, EnumC0614g.GRIM_REAPER) && m4196b2.f1350a) {
    i += this.f1215f.f1231c.f1274c;  // +20
}
```
→ 对`f1350a=true`状态的目标（POISONED/BLINDED/WEAKENED）额外+20伤害

证据：`C0600q.java:299-300`

### 项目实现

`rules.ts:42-44` 已实现：`death_reaper` 攻击中毒、致盲、虚弱目标时 +20。

### 差异

| | APK | 项目 | 影响 |
|---|-----|------|------|
| P2 | GRIM_REAPER 对有状态目标 +20 伤害 | 已实现 | 匹配 |

---

## 24. 差异汇总表

### 本次已修复

| # | 能力 | APK 规则 | 项目修复 |
|---|------|----------|----------|
| 1 | HEALER | 治疗者可对自身使用 HEAL | `rules.ts` 移除自治疗禁止，并新增测试 |
| 2 | MELEE_MASTER | 攻击方有 MELEE_MASTER 且目标没有 MELEE_MASTER 时才触发 1.5 倍 | `abilities.ts` 增加目标能力检查，并新增测试 |

### 复核后确认匹配或旧误判

| 能力 | 复核结论 |
|------|----------|
| HEALER | 主动治疗量是 `40+10×level`，亡灵为 1.5 倍伤害；`10+5×level` 属于 CLEANSING_AURA 路径。 |
| REPAIRER | APK 修复替换损坏建筑地形并设置所有者，不生成守军；项目匹配。 |
| AIR_FORCE | 移动消耗 1、不吃地形防御、攻击水中非空军 +10 已实现；“地面不能攻击空军”未由英文能力文案确认。 |
| MARKSMAN | 对 AIR_FORCE +10 已实现。 |
| SON_OF_WATER | 水地形移动/攻防/回血生效，项目匹配；原文把 `!f1368a` 误读为非水。 |
| SON_OF_LAND | 陆地移动 1，水面和桥移动 2；原文“水域无惩罚”是误判，项目与语言规则门禁匹配。 |
| BLOODTHIRSTY | 满血伤害倍率已实现。 |
| ATTACK_AURA | INSPIRED 近战 +10、远程 +5 已实现。 |
| CLEANSING_AURA | 回复 `10+5×level`、净化负面状态、对亡灵等额伤害已实现。 |
| WEAKENING_AURA | WEAKENED 移动力降至 1，防御近战 -10/远程 -5 已实现。 |
| SUPPORTER | 支援不改变 HP，经验 +10；原文把 HEAL 路径误套到了 SUPPORTER。 |
| GRIM_REAPER | 对中毒/致盲/虚弱目标 +20 已实现。 |
| SUMMONER/UNDEAD | 召唤师踩墓碑不扣血已实现；原文“召唤师中毒伤害=0”是 `m4331c` 函数来源误标。 |

### 待单独核实

| 能力 | 待核实点 |
|------|----------|
| DESTROYER | APK 是否允许对无人建筑远程“空击摧毁”，以及当前站桩摧毁是否需要改成目标格动作。 |
| SUPPORTER | `f1312j` 在 APK 支援后的 UI/动作循环语义，以及项目额外排除 CASTLE_CAPTOR 是否应保留。 |
| AIR_FORCE | `m4261q` 是否在非文案路径中限制地面单位攻击空军。 |

---
