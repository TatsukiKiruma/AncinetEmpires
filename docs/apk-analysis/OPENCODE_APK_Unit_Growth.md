# APK Unit Growth Values (成长)

## 1. Growth Field Mapping (C0620c)

**APK** (`C0620c.java:28-47`) — UnitConfig fields in the APK data.bin:

| C0620c field | Type | Meaning | Project field | UnitConfig key |
|---|---|---|---|---|
| `f1385g` | `int` | Attack per level (攻击/级) | `attackGrowth` | `units.ts:16` |
| `f1387i` | `int` | Defense per level (防御/级) | `defenseGrowth` | `units.ts:17` |
| `f1389k` | `int` | HP per level (血量成长/级) | `maxHpGrowth` | `units.ts:18` |
| `f1391m` | `int` | Move per level (移动成长/级) | `moveGrowth` | `units.ts:19` |

**Project** (`src/game/units.ts:5-23`):
```typescript
export interface UnitConfig {
  key: UnitClass;
  // ...
  attackGrowth: number;    // line 16
  defenseGrowth: number;   // line 17
  maxHpGrowth: number;     // line 18
  moveGrowth: number;      // line 19
  // ...
}
```

Evidence: `C0620c.java:28-47` (APK), `src/game/units.ts:16-19` (project).

---

## 2. Per-Unit Growth Table

Source: `npm run apk:unit-report` — extracted from APK data.bin, validated against `src/game/units.ts:25-47`. **0 mismatches** on all growth values.

| APK ID | Class | AtkGrowth | DefGrowth | HpGrowth | MoveGrowth |
|---|---|---|---|---|---|
| 0 | soldier | 10 | 5 | 0 | 0 |
| 1 | archer | 10 | 5 | 0 | 0 |
| 2 | water_elemental | 10 | 5 | 0 | 0 |
| 3 | witch | 5 | 5 | 0 | 0 |
| 4 | elf | 5 | 5 | 0 | 0 |
| 5 | wolf | 10 | 5 | 0 | 0 |
| 6 | golem | 5 | 5 | 25 | 0 |
| 7 | catapult | 10 | 5 | 0 | 0 |
| 8 | dragon | 10 | 5 | 0 | 0 |
| 9 | commander | 10 | 5 | 0 | 1 |
| 10 | skeleton | 10 | 5 | 0 | 0 |
| 11 | crystal | 0 | 0 | 0 | 0 |
| 12 | paladin | 5 | 5 | 0 | 0 |
| 13 | berserker | 10 | 5 | 0 | 0 |
| 14 | ghost | 10 | 5 | 0 | 1 |
| 15 | dark_mage | 10 | 5 | 0 | 0 |
| 16 | wolf_archer | 10 | 5 | 0 | 0 |
| 17 | ice_elemental | 10 | 5 | 10 | 0 |
| 18 | slime | 10 | 5 | 5 | 0 |
| 19 | mermaid | 10 | 5 | 0 | 0 |
| 20 | druid | 5 | 5 | 0 | 1 |

Key observations:
- **AtkGrowth**: Most units = 10. Exceptions: `witch/elf/golem/paladin/druid` = 5. `crystal` = 0.
- **DefGrowth**: All non-crystal units = 5. Crystal = 0.
- **HpGrowth**: Only 3 units have nonzero values (see §6).
- **MoveGrowth**: Only 3 units have nonzero values (see §7).

---

## 3. Level-Up Formula (m4322d)

**APK** (`C0600q.java:860-867`):
```java
public void m4322d(C0613f c0613f, int i) {
    int oldLevel = c0613f.f1316n;              // old level
    c0613f.f1306d = i;                         // set exp
    c0613f.f1316n = C0613f.m4199b(i);          // compute level from exp
    int levelsGained = c0613f.f1316n - oldLevel;
    C0620c config = this.f1211b.f1367b[c0613f.f1303a];  // config by unitClass
    // HP: currentHP += hpGrowth * levelsGained, clamp [1, 9999]
    c0613f.f1307e = C0641e.m4121a(c0613f.f1307e, config.f1389k * levelsGained, 1, 9999);
    // Move: currentMP += moveGrowth * levelsGained, clamp [0, 99]
    c0613f.f1308f = C0641e.m4121a(c0613f.f1308f, levelsGained * config.f1391m, 0, 99);
}
```

Key mechanics:
- **EXP is set directly** (not additive), then level is recomputed from total EXP.
- **HP delta**: `hpGrowth * levelsGained` added to current HP.
- **Move delta**: `moveGrowth * levelsGained` added to current MP.
- Both clamped: HP `[1, 9999]`, Move `[0, 99]`.
- `m4363a` (`C0600q.java:269-272`) is the additive wrapper: clamps total EXP `[0, 99999]`, calls `m4322d`, returns levels gained.

**Project** (`src/game/abilities.ts:256-294`):
```typescript
export function addExp(unit: Unit, amount: number, levelCap: LevelCap = 3): boolean {
    // additive EXP, clamp [0, 99999]
    unit.exp = clamp(unit.exp + amount, 0, MAX_EXP);
    // while loop for multi-level-up
    while (unit.level < levelCap) {
        const threshold = getExpThresholdForLevel(nextLevel);
        if (unit.exp >= threshold) { unit.level = nextLevel; levelsGained++; }
        else break;
    }
    if (levelsGained > 0) {
        const config = UNIT_CONFIGS[unit.unitClass];
        const hpGain = config.maxHpGrowth * levelsGained;
        const moveGain = config.moveGrowth * levelsGained;
        if (hpGain !== 0) unit.hp = clamp(unit.hp + hpGain, 1, 9999);
        if (moveGain !== 0 && unit.movementRemaining !== undefined)
            unit.movementRemaining = clamp(unit.movementRemaining + moveGain, 0, 99);
    }
    return upgraded;
}
```

Test evidence (`src/game/tests/engine.test.ts`):
- **6.9a** (`:3884-3891`): Soldier (HpGrowth=0) level-up keeps HP unchanged (50→50).
- **6.9b** (`:3893-3913`): Soldier with overheal (130 HP) stays at 130 after level-up — no clipping to maxHp.
- **6.9c** (`:3916-3939`): Golem level-up: HP 50→75 (+25). Druid level-up: movementRemaining 2→3 (+1).
- **6.10** (`:3941-3957`): EXP 280→310 triggers level 1→2.
- **6.11** (`:3959-3975`): EXP 580→610 triggers level 2→3.
- **6.11b** (`:3977-3981`): Threshold formula verified: L1=100, L2=300, L3=600, L9=4500.

---

## 4. Effective Stat Calculation Formulas

APK computes effective stats on-the-fly per use (formula, not stored):

| Stat | APK method | Formula | Evidence |
|---|---|---|---|
| Attack | `C0600q.m4273l:1302-1304` | `baseAtk + atkGrowth × level` | `config.f1385g` |
| Defense | `C0600q.m4266o:1376-1379` | `baseDef + defGrowth × level` | `config.f1387i` |
| MaxHP | `C0600q.m4253y:1447-1449` | `baseHP + hpGrowth × level` | `config.f1389k` |
| Move | `C0600q.m4252z:1453-1458` | `baseMove + moveGrowth × level` | `config.f1391m` |

**Project** (`src/game/abilities.ts:206-243`):
```typescript
const attackBonus = base.attackGrowth * level;    // line 209
const defBonus = base.defenseGrowth * level;       // line 210
const maxHpBonus = base.maxHpGrowth * level;       // line 211
const moveBonus = base.moveGrowth * level;         // line 212
```

**Physical/Magic defense split**: APK uses `defenseShift` to split total defense into physical and magic components. The project stores `physicalDefense` and `magicDefense` separately in `UnitConfig`, and both are increased by `defBonus` (`abilities.ts:214-215`). See the defense stats document for the split formula.

**Range**: No growth — `minRange`/`maxRange` are fixed per unit class (`C0620c` fields `f1392n`/`f1393o`). The project mirrors this (`units.ts:13-14`).

Test evidence (`src/game/tests/engine.test.ts`):
- **6.12** (`:3984-3994`): Soldier level 1 → attack=65 (55+10), pDef=10 (5+5), mDef=10 (5+5).
- **6.12b** (`:3996-4024`): Druid level 2 → attack=50 (40+10), pDef=10 (0+10), mDef=40 (30+10), move=6 (4+2). Ice elemental level 2 → maxHp=120 (100+20).
- **6.15** (`:4065-4081`): Golem level 1 → maxHp=125 (100+25).
- **6.16** (`:4083-4103`): Commander level 1 → move=5 (4+1).
- **6.17** (`:4105+`): Commander movement range includes the extra tile from moveGrowth.

---

## 5. EXP Threshold Formula

**APK** (`C0613f.m4201a:76-78`):
```java
public static int m4201a(int level) {
    if (level == 0) return 0;
    return (((level + 1) * 100) * level) / 2;
}
```

| Level | EXP Threshold | Calculation |
|---|---|---|
| 0 | 0 | — |
| 1 | 100 | (2×100×1)/2 |
| 2 | 300 | (3×100×2)/2 |
| 3 | 600 | (4×100×3)/2 |
| 4 | 1000 | (5×100×4)/2 |
| 5 | 1500 | (6×100×5)/2 |
| 6 | 2100 | (7×100×6)/2 |
| 7 | 2800 | (8×100×7)/2 |
| 8 | 3600 | (9×100×8)/2 |
| 9 | 4500 | (10×100×9)/2 |

**Level lookup** (`C0613f.m4199b:92-102`): Iterates 9→1, returns highest level where `exp >= threshold`.

**Project** (`src/game/abilities.ts:245-248`):
```typescript
export function getExpThresholdForLevel(level: UnitLevel): number {
    if (level <= 0) return 0;
    return ((level + 1) * 100 * level) / 2;
}
```

Test evidence (`src/game/tests/engine.test.ts:3977-3981`):
```typescript
expect(getExpThresholdForLevel(1)).toBe(100);
expect(getExpThresholdForLevel(2)).toBe(300);
expect(getExpThresholdForLevel(3)).toBe(600);
expect(getExpThresholdForLevel(9)).toBe(4500);
```

---

## 6. Units That Benefit from HP Growth

Only **3 units** have nonzero `maxHpGrowth`:

| Unit | HpGrowth | Effect per level | Data location |
|---|---|---|---|
| **golem** (ID 6) | **25** | +25 maxHP, +25 current HP on level-up | `units.ts:38` |
| **ice_elemental** (ID 17) | **10** | +10 maxHP, +10 current HP on level-up | `units.ts:39` |
| **slime** (ID 18) | **5** | +5 maxHP, +5 current HP on level-up | `units.ts:30` |

All other 18 units have HpGrowth = 0, meaning:
- `maxHP = baseHP` at all levels (no HP scaling).
- Level-up does **not** change current HP (no heal, no increase).

Example: Golem at level 3 has `maxHP = 100 + 25×3 = 175`. Golems gain 25 HP on each level-up.

Test evidence:
- Golem level 1 maxHp=125 (`engine.test.ts:4065-4081`)
- Golem level-up HP 50→75 (`engine.test.ts:3916-3927`)
- Ice elemental level 2 maxHp=120 (`engine.test.ts:4016-4023`)
- Soldier (HpGrowth=0) level-up HP stays same (`engine.test.ts:3884-3891`)

---

## 7. Units That Benefit from Move Growth

Only **3 units** have nonzero `moveGrowth`:

| Unit | MoveGrowth | Effect per level | Data location |
|---|---|---|---|
| **commander** (ID 9) | **1** | +1 move, +1 current MP on level-up | `units.ts:44` |
| **ghost** (ID 14) | **1** | +1 move, +1 current MP on level-up | `units.ts:27` |
| **druid** (ID 20) | **1** | +1 move, +1 current MP on level-up | `units.ts:40` |

All other 18 units have MoveGrowth = 0.

Example: Commander at level 3 has `move = 4 + 1×3 = 7`. Ghost at level 3 has `move = 4 + 1×3 = 7`. Druid at level 3 has `move = 4 + 1×3 = 7`.

Test evidence:
- Commander level 1 move=5 (`engine.test.ts:4083-4103`)
- Commander move range includes bonus tile (`engine.test.ts:4105+`)
- Druid level-up movementRemaining 2→3 (`engine.test.ts:3916-3939`)

---

## 8. Project Comparison — 0 Mismatches

The `npm run apk:unit-report -- --check` tool verifies all growth fields against APK data.bin:

```
src/game/units.ts           (project UNIT_CONFIGS)
src/game/apk_unit_report.ts (extraction script)
```

**Growth fields verified** (6 fields per unit × 21 units = 126 values):
| Field | Match rate |
|---|---|
| `attackGrowth` | 21/21 ✅ |
| `defenseGrowth` | 21/21 ✅ |
| `maxHpGrowth` | 21/21 ✅ |
| `moveGrowth` | 21/21 ✅ |

**4 intentional differences exist** (non-growth fields, excluded from growth comparison):
- `commander`: cost is `null` in project vs 0 in APK
- `skeleton`: cost is `null` in project vs 0 in APK
- `crystal`: cost is `null` in project vs 0 in APK
- `crystal`: move is 0 in project vs 0 in APK (same value, but flagged as intentional config)

All growth values are **bit-for-bit identical** between APK data.bin and `src/game/units.ts:25-47`.

---

## 9. Known P0 Difference: Additive HP vs Max-Heal

**APK behavior** (`C0600q.m4322d:860-867`):
```java
// HP: currentHP += hpGrowth * levelsGained, clamp [1, 9999]
unit.f1307e = C0641e.m4121a(unit.f1307e, config.f1389k * levelsGained, 1, 9999);
```

- **Additive**: Current HP increases by exactly `hpGrowth × levelsGained`.
- If `hpGrowth = 0`, current HP is **unchanged** (even if damaged).
- If a unit is overhealed (e.g., 130/100 HP), level-up with HpGrowth=0 leaves it at 130.
- The clamp only prevents HP falling below 1 or exceeding 9999.

**Project behavior** (`src/game/abilities.ts:283-284`):
```typescript
if (hpGain !== 0) {
    unit.hp = clamp(unit.hp + hpGain, 1, 9999);
}
```

For units with HpGrowth=0, the project skips the HP update entirely (same as APK). The project does **not** set `hp = max(hp, maxHp)` or any form of healing on level-up.

**Status**: ✅ **Aligned as of 2026-07-02 fix**. The project previously had a `max-heal` behavior (set HP to new maxHp on level-up) which was a P0 difference. This is now resolved.

Test evidence:
- Soldier (HpGrowth=0): HP=50 at level 0 → HP=50 at level 1 (`engine.test.ts:3884-3891`)
- Soldier overhealed (HpGrowth=0): HP=130 at level 0 → HP=130 at level 1 (`engine.test.ts:3893-3913`)
- Golem (HpGrowth=25): HP=50 at level 0 → HP=75 at level 1 (`engine.test.ts:3916-3927`)

---

## Evidence File Index

| APK file | Method | Content |
|---|---|---|
| `C0620c.java:28-47` | — | UnitConfig growth fields: g=atk, i=def, k=hp, m=mov |
| `C0600q.java:860-867` | `m4322d` | Level-up: HP+=hpGrowth×levelsGained, MP+=moveGrowth×levelsGained |
| `C0600q.java:269-272` | `m4363a` | Additive EXP wrapper → m4322d |
| `C0600q.java:1302-1304` | `m4273l` | Attack = baseAtk + atkGrowth×level |
| `C0600q.java:1376-1379` | `m4266o` | Defense = baseDef + defGrowth×level |
| `C0600q.java:1447-1449` | `m4253y` | MaxHP = baseHP + hpGrowth×level |
| `C0600q.java:1452-1458` | `m4252z` | Move = baseMove + moveGrowth×level |
| `C0613f.java:76-81` | `m4201a` | EXP threshold: ((L+1)×100×L)/2 |
| `C0613f.java:92-102` | `m4199b` | Level lookup from EXP (9→1) |

| Project file | Function | Content |
|---|---|---|
| `src/game/units.ts:16-19` | `UnitConfig` | Growth field definitions |
| `src/game/units.ts:25-47` | `UNIT_CONFIGS` | All 21 unit configs with growth values |
| `src/game/abilities.ts:206-243` | `getEffectiveStats` | Effective stats with level growth |
| `src/game/abilities.ts:245-248` | `getExpThresholdForLevel` | EXP threshold formula |
| `src/game/abilities.ts:256-294` | `addExp` | Level-up with additive HP/move growth |
| `src/game/tests/engine.test.ts:3884-3891` | 6.9a | HpGrowth=0: no HP change on level-up |
| `src/game/tests/engine.test.ts:3893-3913` | 6.9b | HpGrowth=0: overheal preserved |
| `src/game/tests/engine.test.ts:3916-3939` | 6.9c | Golem (HpGrowth=25) and Druid (MoveGrowth=1) level-up |
| `src/game/tests/engine.test.ts:3977-3981` | 6.11b | EXP threshold verification |
| `src/game/tests/engine.test.ts:3984-3994` | 6.12 | Soldier level 1 effective stats |
| `src/game/tests/engine.test.ts:3996-4024` | 6.12b | Druid/ice elemental level 2 effective stats |
| `src/game/tests/engine.test.ts:4065-4081` | 6.15 | Golem level 1 maxHp=125 |
| `src/game/tests/engine.test.ts:4083-4103` | 6.16 | Commander level 1 move |
