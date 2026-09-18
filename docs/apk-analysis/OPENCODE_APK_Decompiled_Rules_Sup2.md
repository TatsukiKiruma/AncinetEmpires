# APK Decompiled Rules — Supplement 2: Newly Discovered Mechanics

## Purpose
Documents rule mechanics discovered during systematic deep re-analysis that were missed or incomplete in the original `OPENCODE_APK_Decompiled_Rules.md` and `OPENCODE_APK_Project_Rules_Comparison.md`.

## Evidence Convention
- `[C0595l:NNN]` = C0595l.java line NNN
- `[C0600q:NNN]` = C0600q.java line NNN
- `[C0611d:NNN]` = C0611d.java line NNN
- Verified labels: **confirmed** (decompiled evidence), **inferred** (derived from code), **uncertain** (ambiguous)

---

## §1. Support Mechanics — Full Decompiled Flow

### 1.1 Support Validation (`m4267n` [C0600q:1371-1373])
EXACTLY 6 conditions, ALL must be true:

| # | Condition | Source | Detail |
|---|-----------|--------|--------|
| 1 | Supporter exists | `c0613f != null` | Selected unit must exist |
| 2 | Target exists | `c0613f2 != null` | Target position must have a unit |
| 3 | Target is activated | `c0613f2.f1311i == true` | Target's `hasBeenActivated` flag is set |
| 4 | Target hasn't acted | `!c0613f2.f1312j` | Target's `hasActed` flag is NOT set |
| 5 | Same team | `m4299g(attacker, target)` | Same diplomacy group (allies) |
| 6 | Supporter has SUPPORTER | `m4359a(attacker, SUPPORTER)` | Ability ordinal 24 |
| — | Target NOT SUPPORTER | `!m4359a(target, SUPPORTER)` | Target must not have SUPPORTER ability |
| — | Supporter level ≥ target | `attacker.f1316n >= target.f1316n` | Star level check |

**confirmed** — all conditions verified from `m4267n` body

### 1.2 Support Healing/Damage Formula (`m4312e` [C0600q:909-916])
```
supportAmount = f1295x + (f1296y * supporterStarLevel)
             = 40    + (10    * supporterStarLevel)
```
- **Ally target**: returns positive → heals the target
- **UNDEAD target**: returns `((-i) * 3) / 2` = **1.5× damage** (bonus vs undead)

### 1.3 Support Execution [C0595l:551-556]
```
1. Apply HP change: m4455a(singleton(target pos, supportAmount))
2. Award exp to supporter:
   - Target survived (HP>0): f1286o = 30 exp
   - Target died: f1284m = 10 (kill exp) + f1288q = 10 (support exp)
3. Target state change [C0595l:878-886]:
   - target.f1311i = false  (deactivate)
   - target.f1312j = true   (mark as acted)
   - Refresh movement points
```

### 1.4 Support Exp Values [C0611d:56-64]
| Field | Value | Usage |
|-------|-------|-------|
| `f1288q` | **10** | Support action exp (awarded to supporter) |
| `f1286o` | **30** | Support kill exp (when support kills undead) |
| `f1283l` | **30** | Default attack exp |
| `f1284m` | **10** | Kill exp |

### 1.5 Can a unit support AND attack in same turn?
- `m4450b` executor changes only the **target's** flags (`f1311i`, `f1312j`)
- Supporter is **deselected** at UI level after support action
- Code-level flags on supporter are NOT changed — **mechanically possible but UI/game-state prevents**
- **inferred**: The practical answer is "no" due to game flow, but there is no explicit code flag lock

---

## §2. Heal Mechanics — Full Decompiled Flow

### 2.1 Heal Validation (`m4276k` [C0600q:1284-1292])
5 conditions for non-UNDEAD targets:

| # | Condition | Source | Detail |
|---|-----------|--------|--------|
| 1 | Healer has HEALER | `m4359a(healer, HEALER)` | Ability ordinal 7 |
| 2 | Not overhealed | `m4295h(target)` | `currentHp <= maxHp && status != POISONED` |
| 3 | Not enemy | `!m4281j(healer, target)` | Same team check |
| 4a | In heal range | `m4272l(healer, target)` | Target within minRange-maxRange |
| 4b | OR self-target | `m4265o(healer, target)` | Same unit (heal self) |
| 5 | UNDEAD shortcut | Always healable if target is UNDEAD | Heal damages undead instead |

### 2.2 Heal Formula (`m4305f` [C0600q:982-989])
```
healAmount = f1297z + (f1262A * healerStarLevel)
           = 10     + (5     * healerStarLevel)
```
- **Ally target**: positive → heal
- **UNDEAD target**: negative → damage (raw negative, no 1.5× bonus)
- **confirmed**: uses `m4307f` [C0600q:977-979] → clamped to `[0, maxHP]`

### 2.3 NO Overheal — Hard-Capped at maxHP
```java
// C0600q:977-979
public int m4307f(C0613f target, int healAmount) {
    return C0641e.m4121a(target.f1307e, healAmount, 0, m4253y(target))
           - target.f1307e;
}
```
- `m4253y(target)` = `config.baseHp + config.hpPerLevel * starLevel` [C0600q:1447-1449]
- Any healing beyond maxHP is silently discarded
- **confirmed**: validation `m4295h` also prevents targeting overhealed units (`currentHp <= maxHp` check)

---

## §3. Cleansing Aura — Full Decompiled Flow

### 3.1 Trigger [C0595l:688-751 `m4442d`]
- Triggered when **any unit** with `CLEANSING_AURA` (ordinal 19) is **right-clicked/activated**
- Executed at **POST_STANDBY** time (part of `m4442d` aura processing)

### 3.2 AoE Parameters
```
Set<C0632c> tiles = m4370a(i, i2, 0, 2);
// Manhattan distance radius: [min=0, max=2]
// Affects ALL tiles within range from source position
```

### 3.3 Cleansing — Status Removal [C0595l:703-708]
```java
if (hasCleansingAura) {
    if (m4293h(source, target)) {
        m4358a(target, NONE, 0, true);  // Remove ALL status effects
        if (!target.f1311i) {
            m4378B(target);  // Refresh movement points
        }
    }
}
```
- `m4293h` [C0600q:1157-1159]: cleanses only if target has a harmful status (`f1350a==true`) AND is NOT an enemy
- Removes: **POISONED, BLINDED, WEAKENED** (all with `f1350a==true`)
- **confirmed**: only harmful statuses are cleansed; INSPIRED is untouched

### 3.4 Cleansing — Healing [C0595l:710-719]
```java
if (m4269m(source, target)) {
    int healAmount = m4305f(source, target);  // SAME formula: 10 + 5*star
    // Self-heal accumulated separately, others applied immediately
}
```
- **Same heal formula** as manual heal (`m4305f`)
- Self-healing is accumulated and applied at the end
- Others healed immediately with `m4307f` (capped at maxHP)
- `m4269m` [C0600q:1361-1363]: valid if target HP <= maxHP AND (not enemy OR target is UNDEAD)

### 3.5 Building Capture [C0595l:728-732]
Cleansing aura also handles adjacent building captures:
```
if (unit is on capturable building && owner belongs to enemy faction):
    capture building
    i4 -= m4331c(source)  // subtract capture HP cost from self-heal
```
- `m4331c` [C0600q:730-738]: UNDEAD→ -10 (gain 10 HP), SUMMONER→ 0, else→ +10 (lose 10 HP)

---

## §4. Summon Mechanics — Full Decompiled Flow

### 4.1 Summon Validation (`m4300g` [C0600q:1066-1068])
EXACTLY 5 conditions, ALL must be true:

| # | Condition | Method | Detail |
|---|-----------|--------|--------|
| 1 | In bounds | `m4236a(x, y)` | `0 <= x < width && 0 <= y < height` |
| 2 | Has grave marker | `m4212f(x, y)` | `f1252d[x][y] >> 12 > -1` (tombstone present) |
| 3 | Tile is empty | `m4207i(x, y) == null` | No unit at target position |
| 4 | In summoner range | `m4313e(unit, x, y)` | Manhattan distance within `[minRange, maxRange]` |
| 5 | Has SUMMONER ability | `m4359a(unit, SUMMONER)` | Ability ordinal 6 |

**confirmed** — all conditions from `m4300g` body

### 4.2 Summon Execution (`m4468a` [C0595l:285-291])
```java
void m4468a(int x, int y, int unitTypeId, int team, int level) {
    m4417r().m4234a(x, y, -1, 4095);    // Consume grave (clear marker)
    m4415t().m4369a(unitTypeId, team, level, x, y);  // Create unit
    if (m4418q()) {
        m4429k().mo3928a(SUMMON);       // UI notification
    }
}
```

### 4.3 Summoned Unit Construction (`m4333c` [C0600q:741-760])
| Field | Value | Source |
|-------|-------|--------|
| unitTypeId | **10** (Skeleton) | `f1294w` in RuleData |
| team | **inherits** from summoner | `summoner.f1304b` |
| level | **inherits** from summoner | `summoner.f1316n` |
| HP | `100 + 0*level = 100` | config baseHP + hpPerLevel |
| attack | `40 + 0*level = 40` | config baseAttack |
| defense | `5 + 0*level = 5` | config baseDefense |
| movement | `3 + 0*level = 3` | config baseMovement |
| range | `min=1, max=1` | config ranges |
| abilities | `[8 (POISONER), 9 (UNDEAD)]` | config ability ordinals |
| exp | `C0613f.m4201a(level)` | exp threshold for inherited level |
| cost | **0 gold, 0 population** | config cost/population |
| status | Cleared to NONE | `m4358a(unit, NONE, 0, true)` |

**confirmed** — skeleton is unit type ID 10, all growth = 0

### 4.4 Summoner Tags/Effects
- SUMMONER ability ordinal: **6**
- Only the **Witch** (APK unit type ID 3) has SUMMONER
- Summoner range: minRange=1, maxRange=2 (Manhattan distance from Witch config)
- Summoner gets **10 exp** per summon (`f1287p` [C0611d:56])
- Summoner marked as **acted** (POST_ACTION command)

### 4.5 Grave Mechanics
- **Created** (`m4454a` [C0595l:498]): when non-UNDEAD, non-neutral unit dies
- **Required** for summon: `m4212f(x,y)` checks `f1252d[x][y] >> 12 > -1`
- **Consumed** on summon: `m4234a(x, y, -1, 4095)` clears high 20 bits
- **Grave standing damage** (`m4331c` [C0600q:730-738]):
  - UNDEAD: **+10 HP** (healed)
  - SUMMONER: **0** (no effect)
  - Others: **-10 HP** (damage)
- Each grave is **single-use** (consumed on summon)
- No cooldown on summon ability — limited by grave availability and action points

### 4.6 SUMMON Command (C0583d ordinal 29)
```java
// C0583d:88-90
public static C0583d m4539a(int x, int y, int unitTypeId, int team, int level) {
    return new C0583d(SUMMON, x, y, unitTypeId, team, level);
}
// Args: [0]=x, [1]=y, [2]=unitTypeId(10), [3]=team(inherited), [4]=level(inherited)
```

---

## §5. Movement Mechanics — Full Decompiled Flow

### 5.1 Movement Cost Calculation (`m4357a` [C0600q:306-320])
```java
int calcMovementCost(C0613f unit, C0619b tile) {
    // 1. Custom per-unit per-terrain override (string-keyed)
    String key = unit.f1315m;  // unit name/custom key
    if (key != null) {
        int override = this.f1215f.f1229a.m4167a(
            C0640d.m4127b(key, tile.f1369b), -1);
        if (override > 0) return override;
    }

    // 2. Base cost from tile config
    int baseCost = tile.f1373f;

    // 3. Affinity units pay 1 on native terrain
    if (AIR_FORCE ||
        (SON_OF_LAND && tile.f1368a) ||          // land unit on land
        (SON_OF_WATER && !tile.f1368a) ||         // water unit on water
        (SON_OF_FOREST && tile.f1369b == 2) ||    // forest unit on forest
        (SON_OF_MOUNTAIN && tile.f1369b == 1)) {  // mountain unit on mountain
        return 1;
    }

    // 4. SON_OF_LAND pays base+1 on non-land
    return (!SON_OF_LAND || tile.f1368a) ? baseCost : baseCost + 1;
}
```
**confirmed** — 5 affinity abilities each cost 1 on their native terrain

### 5.2 BFS Pathfinding (`m4349a` [C0600q:135-172])
- **Algorithm**: Recursive layer-by-layer BFS (not iterative single-queue)
- **Starts**: from unit position with movement points = unit current move
- **Explores**: 4 cardinal neighbors per tile
- **Pass-through** (`m4261q` [C0600q:224-226]):
  - Empty tile → pass
  - Friendly unit → pass
  - Air over ground → pass
  - Enemy unit → **blocked** (cannot pass through)
- **Can stop** (`m4329c` [C0600q:815-821]): only if tile is empty OR same unit
- **Buffer**: `C0631b` has `f1432a` (reachable MP grid) and `f1433b` (reachable tiles)
- **Entry**: `m4338b(unit, z, buffer)` [C0600q:677-683] clones unit, initializes buffer

**confirmed** — recursive layer-by-layer, enemy blocks, air passes over ground

### 5.3 Occupy Validation (`m4321d` [C0600q:897-906])
```java
boolean canOccupy(C0613f unit, int x, int y) {
    if (!isInBounds(x, y)) return false;
    C0619b tile = getTileConfig(x, y);
    if (!tile.f1374g || unit == null || areAllied(unit.owner, tile.getOwner()))
        return false;
    return (tile.f1369b == 3 && hasFlag(unit, CASTLE_CAPTOR)) ||  // Castle
           (tile.f1369b == 4 && hasFlag(unit, VILLAGE_CAPTOR));    // Village
}
```
- CASTLE_CAPTOR = ordinal 0 → captures castles (tile type 3)
- VILLAGE_CAPTOR = ordinal 1 → captures villages (tile type 4)
- Can only occupy enemy-owned buildings (not allied)
- `f1374g`: tile's `isCapturable` flag
- No gold cost to occupy; owner bits in `f1251c[x][y]` are updated

**confirmed** — two distinct captor abilities for two building types

### 5.4 Repair Mechanics (`m4306f` [C0600q:1017-1019])
```java
boolean canRepair(C0613f unit, int x, int y) {
    return unit != null && isInBounds(x, y) &&
           hasFlag(unit, REPAIRER) &&                    // Ability ordinal 2
           getTileConfig(x, y).f1376i >= 0;              // Has repair unit type ID
}
```
- **Repair = spawn unit** (NOT HP restore) [C0595l:806-810]:
  ```java
  void executeRepair(int x, int y) {
      int unitTypeId = tile.f1376i;   // unit type to construct
      int owner = configs[unitTypeId].f1395q ? 4094 : 4095;
      createUnit(unitTypeId, owner, x, y, NONE);
      incomeManager.m4393a(x, y);      // Gold gain
  }
  ```
- `f1376i`: the unit type ID to spawn when repairing
- Owner = 4094 (neutral) if recruitable, 4095 (unowned) otherwise
- REPAIRER ability ordinal: **2**
- **confirmed**: repair does NOT heal HP — it spawns a new unit from tile config

---

## §6. Element Affinity System — Complete

### 6.1 Element Types (`C0620c.f1381c`)
| ID | Name | Detail |
|----|------|--------|
| 0 | **PHYSICAL** | Default element type |
| 1 | **MAGIC** | Second element type |

Only **2 element types** exist (not 4 — X and N are not element types).

### 6.2 Element Defense Mechanism [C0600q:825]
```java
int elementDef = (attacker.f1381c == defender.f1381c)
    ? defender.f1382d + 0      // SAME element: ADD affinity value to defense
    : 0 - defender.f1382d;     // DIFFERENT element: SUBTRACT affinity from defense
```
- `f1382d`: Elemental defense/affinity value (per unit config)
- **Same element**: defense += `f1382d` (resistance)
- **Different element**: defense -= `f1382d` (weakness)
- **confirmed**: only 2 elements, not 4

### 6.3 Terrain Defense Formula (`m4342b` [C0600q:625-636])
```java
int terrainDef = 0;
if (!tile.isCapturable || sameOwnerAsDefender) {
    terrainDef += tile.f1372e;   // Base terrain defense value
}
// Terrain affinity bonus:
if (SON_OF_WATER on water)     → terrainDef += f1263B + f1264C * level  (10 + 0*L)
if (SON_OF_FOREST on forest)   → terrainDef += f1263B + f1264C * level  (10 + 0*L)
if (SON_OF_MOUNTAIN on mountain)→ terrainDef += f1263B + f1264C * level  (10 + 0*L)
```
- `f1263B = 10` [C0611d:92]: terrain defense base
- `f1264C = 0` [C0611d:96]: terrain defense per level (growth disabled by default)
- **confirmed**: only captured buildings owned by enemy don't give terrain defense

### 6.4 Commander Defense [C0600q:657]
```java
int cmdMod = (defender.playerAlliance[playerIdx] == 1)
    ? 100 - f1267F   // default: 100 - 0 = 100% (no reduction)
    : 100;
```
- `f1267F = 0` [C0611d:104]: commander damage reduction percent (disabled by default)
- **confirmed**: commander defense is 0% reduction by default (can be set in rulesets)

### 6.5 WEAKENED Status Defense Penalty [C0600q:826-828]
```java
if (defender has WEAKENED) {
    if (range > 1) elementDef -= f1266E / 2;  // -5 for ranged attacks
    else           elementDef -= f1266E;       // -10 for melee attacks
}
```
- `f1266E = 10` [C0611d:100]: WEAKENED defense penalty
- Halved to 5 when attacked from range > 1
- **confirmed**: WEAKENED penalty is distance-dependent

---

## §7. Gold Income Formula [C0600q:597-617]

```
income = 0
for each tile owned by player:
    if village (type=4):   income += f1289r = 100
    if castle (type=3):     income += f1292u = 50
if player has commander:
    income += f1290s + (f1291t * commanderLevel)
           = 50     + (25     * commanderLevel)
```

| Field | Value | Usage |
|-------|-------|-------|
| `f1289r` | **100** | Village gold income [C0611d:62] |
| `f1292u` | **50** | Castle gold income [C0611d:73] |
| `f1290s` | **50** | Commander base gold [C0611d:66] |
| `f1291t` | **25** | Commander per-level gold [C0611d:70] |

**confirmed** — villages give 100, castles give 50, commander gives 50+25*level

---

## §8. End-of-Turn Phase Processing [C0595l:196-243 `m4472a`]

Complete order at turn start:

| Step | Action | Formula |
|------|--------|---------|
| 1 | Status timer decrement | `m4376D` reduces duration by 1 [C0600q:249-259] |
| 2 | City tile heal | If on enemy city (type 3) owned by warring faction: **+50 HP** (`f1280i`) |
| 3a | Poison damage (normal) | `-f1281j = -10` HP |
| 3b | Poison effect (UNDEAD) | `+f1281j = +10` HP (healed by poison) |
| 4 | SELF_REPAIR | `+maxHP * 0.25` (`f1265D = 0.25f`) |
| 5 | Overheal correction | If `currentHp > maxHp`, restore to maxHP |
| 6 | Terrain heal | `tile.f1372e + affinityBonus` (see §6.3) |

---

## §9. Corrected Ability Count

**EnumC0614g has 26 abilities (ordinals 0-25), NOT 27 as previously stated.**

| Ordinal | Name | Notes |
|---------|------|-------|
| 0 | VILLAGE_CAPTOR | Capture villages (type 4) |
| 1 | CASTLE_CAPTOR | Capture castles (type 3) |
| 2 | REPAIRER | Spawn unit from tile config |
| 3 | AIR_FORCE | Flying, +10 vs non-air, 1 move on all |
| 4 | MARKSMAN | +10 vs AIR_FORCE |
| 5 | DESTROYER | +10 vs buildings |
| 6 | SUMMONER | Summon skeletons from graves |
| 7 | HEALER | Heal allies, damage undead |
| 8 | POISONER | Apply POISONED on attack |
| 9 | UNDEAD | Reverse heal/poison, no grave |
| 10 | MELEE_MASTER | 150% damage at range=1 |
| 11 | RANGED_DEFENDER | -50% ranged damage taken |
| 12 | SON_OF_WATER | +10 atk/def/move on water |
| 13 | SON_OF_FOREST | +10 atk/def/move on forest |
| 14 | SON_OF_MOUNTAIN | +10 atk/def/move on mountain |
| 15 | BLOODTHIRSTY | Full damage regardless of HP |
| 16 | COUNTER_MADNESS | Counter at range ≤ 2 |
| 17 | SELF_REPAIR | 25% maxHP heal each turn |
| 18 | ATTACK_AURA | +20% ally attack in radius 2 |
| 19 | CLEANSING_AURA | Heal + cleanse + capture in radius 2 |
| 20 | WEAKENING_AURA | Apply WEAKENED in radius 2 |
| 21 | ASSAULT_FORCE | Move after attacking |
| 22 | SON_OF_LAND | 1 move on land, can't enter water |
| 23 | BLINDING_ATTACK | Apply BLINDED on attack |
| 24 | SUPPORTER | Support ally (heal/damage undead) |
| 25 | GRIM_REAPER | +20 vs status-afflicted |

---

## §10. Newly Identified APK-Project Differences

| # | Area | APK Behavior | Project Risk | P0/P1 |
|---|------|-------------|--------------|-------|
| 1 | **Repair = spawn unit** | `m4438f` spawns `tile.f1376i` unit type | Project may treat repair as HP restore | **P0** |
| 2 | **BFS recursive** | Layer-by-layer recursive (`m4349a` calls itself) | Project may use iterative BFS (different expansion order) | P1 |
| 3 | **Affinity cost=1** | Hardcoded: 5 affinities + AIR_FORCE all cost 1 on native terrain | Project may use configurable constant | P1 |
| 4 | **Can't stop on occupied** | `m4329c` only allows empty tile or same unit | Project may allow stacking | P1 |
| 5 | **Element system** | 2 types (PHYSICAL/MAGIC), SAME=+def, DIFF=-def | Project may use different system | **P0** |
| 6 | **Commander defense** | `f1267F=0` (disabled by default) | Project may hardcode commander defense | P1 |
| 7 | **WEAKENED halved at range** | `f1266E/2` for range > 1 | Project may apply full penalty at all ranges | **P0** |
| 8 | **Support level gate** | `attacker.star >= target.star` required | Project may not check star levels | P1 |
| 9 | **Gold income per building** | Village=100, Castle=50, Cmd=50+25*L | May differ from project values | P1 |
| 10 | **End-of-turn: status timer first** | `m4376D` decrements BEFORE heal/poison | Order may differ in project | **P0** |
| 11 | **Grave standing: SUMMONER=0** | Summoner takes 0 damage on grave (not 10) | Project may not distinguish SUMMONER | P1 |
| 12 | **Ability count** | 26 abilities (0-25), GRIM_REAPER=25 | Project has 25 abilities (missing GRIM_REAPER?) | **P0** |

---

## §11. Complete Field Maps (Newly Clarified)

### 11.1 `C0619b` (TileConfig) [C0619b:10-41]
| Field | Offset | Type | Meaning |
|-------|--------|------|---------|
| `f1368a` | 0 | boolean | Is water? |
| `f1369b` | 1 | int | Tile type: 0=plain, 1=mountain, 2=forest, 3=castle, 4=village |
| `f1370c` | 2 | int | *(unchanged from original)* |
| `f1371d` | 3 | int | **Defense bonus** (used in `m4364a`) |
| `f1372e` | 4 | int | **Terrain heal value** (used in `m4342b`) |
| `f1373f` | 5 | int | **Movement cost** (base cost for BFS) |
| `f1374g` | 6 | boolean | Is capturable building |
| `f1375h` | 7 | int | Building ID (for DESTROYER) |
| `f1376i` | 8 | int | **Repair unit type ID** (spawned on repair) |
| `f1377j` | 9 | int[] | Tile-specific data |
| `f1378k` | 10 | int | *(unknown)* |

### 11.2 `C0620c` (UnitConfig) — Newly Clarified Fields
| Field | Offset | Type | Meaning |
|-------|--------|------|---------|
| `f1379a` | 0 | int | Gold cost |
| `f1380b` | 1 | int | Population cost |
| **`f1381c`** | **2** | **int** | **Element type ID (0=PHYSICAL, 1=MAGIC)**
| **`f1382d`** | **3** | **int** | **Elemental defense/affinity value**
| `f1383e` | 4 | int | Base attack |
| `f1384f` | 5 | int | Attack visual type |
| `f1385g` | 6 | int | Attack per level |
| `f1386h` | 7 | int | Base defense |
| `f1387i` | 8 | int | Defense per level |
| `f1388j` | 9 | int | Base HP |
| `f1389k` | 10 | int | HP per level |
| `f1390l` | 11 | int | Base movement |
| `f1391m` | 12 | int | Movement per level |
| `f1392n` | 13 | int | Min attack range |
| `f1393o` | 14 | int | Max attack range |
| `f1394p` | 15 | int[] | Ability ordinal array |
| `f1395q` | 16 | boolean | Is recruitable (playable) |
| `f1396r` | 17 | boolean | Is commander/unique |

---

## Change Log
| Date | Change |
|------|--------|
| 2026-07-01 | Created: support/heal (6, 15 formulas), cleansing aura (radius 2, heal+capture), summon (grave, skeleton ID 10), BFS (recursive, pass-through), occupy/repair (captor abilities, spawn-on-repair), element (2 types, SAME=+def, DIFF=-def), commander defense (disabled by default, `f1267F=0`), income (100/50/50+25*L), EOT order (timer→heal→poison→SELF_REPAIR), 26 abilities corrected, 12 new APK-project differences |
