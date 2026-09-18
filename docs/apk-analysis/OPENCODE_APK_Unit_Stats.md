# APK Unit Base Stats (UnitConfig)

> This document catalogs all 21 units from the APK `data.bin` file, mapping decompiled Java fields to their stat values, and confirms 0 mismatches with the project at `src/game/units.ts`.

---

## 1. APK UnitConfig Field Mapping

Decompiled from `C0620c.java` (APK UnitConfig class). Field names are obfuscated; the mapping below was determined by cross-referencing constructor usage in `C0600q.java`.

| APK Field     | data.bin Column     | Project Field      | Type             | Notes                        |
|---------------|---------------------|--------------------|------------------|------------------------------|
| `f1379a`      | Cost                | `cost`             | `int`            | 0 = free (summoned/scenario) |
| `f1380b`      | Population          | `population`       | `int`            | Pop cost for recruitment     |
| `f1381c`      | AtkType             | `attackType`       | `int` (element)  | 0=physical, 1=magic          |
| `f1382d`      | defenseShift        | *(derived)*        | `int`            | Splits baseDef into phy/mag  |
| `f1383e`      | baseAttack (Atk)    | `attack`           | `int`            | Pre-growth base value        |
| `f1384f`      | baseDefense         | *(derived)*        | `int`            | Midpoint of phy/mag defense  |
| `f1385g`      | baseMaxHp           | *(not in config)*  | `int`            | Always 100 in data.bin       |
| `f1386h`      | baseMove (Move)     | `move`             | `int`            | Movement range               |
| `f1387i`      | minRange            | `minRange`         | `int`            | Minimum attack range         |
| `f1388j`      | maxRange            | `maxRange`         | `int`            | Maximum attack range         |
| `f1389k`      | attackGrowth        | `attackGrowth`     | `int`            | Added per level to attack    |
| `f1390l`      | defenseGrowth       | `defenseGrowth`    | `int`            | Added per level to defense   |
| `f1391m`      | maxHpGrowth         | `maxHpGrowth`      | `int`            | Added per level to max HP    |
| `f1392n`      | moveGrowth          | `moveGrowth`       | `int`            | Added per level to move      |
| `f1393o`      | abilities           | `abilities`        | `int[]`          | Bitmask/enum array           |

**APK source**: `C0620c.java` — UnitConfig class definition.

---

## 2. Per-Unit Stats Table

All 21 units sorted by ID (0–20). Defense values are the *final resolved* physical/magic defense after the shift formula is applied (see §3). Growth values from `src/game/units.ts` are confirmed identical to APK.

| ID | Class           | Cost  | Pop | AtkType   | Atk | PhyDef | MagDef | HP  | Move | MinRng | MaxRng | AtkGr | DefGr | HPGr | MovGr | Abilities |
|----|-----------------|-------|-----|-----------|-----|--------|--------|-----|------|--------|--------|-------|-------|------|-------|-----------|
| 0  | soldier         | 150   | 1   | physical  | 55  | 5      | 5      | 100 | 4    | 1      | 1      | 10    | 5     | 0    | 0     | VILLAGE_CAPTOR, REPAIRER |
| 1  | archer          | 250   | 1   | physical  | 45  | 5      | 5      | 100 | 4    | 2      | 3      | 10    | 5     | 0    | 0     | MARKSMAN |
| 2  | water_elemental | 300   | 1   | physical  | 60  | 15     | 15     | 100 | 4    | 1      | 1      | 10    | 5     | 0    | 0     | SON_OF_WATER |
| 3  | witch           | 400   | 2   | magic     | 45  | 0      | 40     | 100 | 4    | 1      | 2      | 5     | 5     | 0    | 0     | SUMMONER |
| 4  | elf             | 500   | 2   | magic     | 55  | 20     | 30     | 100 | 4    | 1      | 2      | 5     | 5     | 0    | 0     | AIR_FORCE, SON_OF_FOREST, CLEANSING_AURA |
| 5  | wolf            | 600   | 3   | physical  | 75  | 20     | 10     | 100 | 6    | 1      | 1      | 10    | 5     | 0    | 0     | POISONER, ASSAULT_FORCE, SON_OF_LAND |
| 6  | golem           | 600   | 3   | physical  | 55  | 30     | 10     | 100 | 5    | 1      | 1      | 5     | 5     | 25   | 0     | RANGED_DEFENDER, SON_OF_MOUNTAIN, WEAKENING_AURA |
| 7  | catapult        | 800   | 4   | physical  | 60  | 5      | 5      | 100 | 3    | 3      | 5      | 10    | 5     | 0    | 0     | DESTROYER |
| 8  | dragon          | 1000  | 5   | magic     | 70  | 25     | 25     | 100 | 6    | 1      | 2      | 10    | 5     | 0    | 0     | AIR_FORCE, MELEE_MASTER, RANGED_DEFENDER, ASSAULT_FORCE |
| 9  | commander       | 400*  | 0   | physical  | 60  | 20     | 20     | 100 | 4    | 1      | 1      | 10    | 5     | 0    | 1     | VILLAGE_CAPTOR, CASTLE_CAPTOR, REPAIRER |
| 10 | skeleton        | 0*    | 0   | physical  | 40  | 5      | 5      | 100 | 3    | 1      | 1      | 10    | 5     | 0    | 0     | POISONER, UNDEAD |
| 11 | crystal         | 0*    | 0   | magic     | 0   | 0      | 0      | 100 | 0**  | 0      | 0      | 0     | 0     | 0    | 0     | (none) |
| 12 | paladin         | 400   | 2   | physical  | 50  | 10     | 10     | 100 | 4    | 1      | 1      | 5     | 5     | 0    | 0     | VILLAGE_CAPTOR, HEALER |
| 13 | berserker       | 500   | 2   | physical  | 70  | 20     | 10     | 100 | 5    | 1      | 1      | 10    | 5     | 0    | 0     | BLOODTHIRSTY, COUNTER_MADNESS, SON_OF_LAND |
| 14 | ghost           | 200   | 1   | magic     | 50  | 5      | 15     | 100 | 4    | 1      | 1      | 10    | 5     | 0    | 1     | AIR_FORCE, UNDEAD, GRIM_REAPER |
| 15 | dark_mage       | 300   | 1   | magic     | 50  | 0      | 20     | 100 | 4    | 1      | 2      | 10    | 5     | 0    | 0     | BLINDING_ATTACK |
| 16 | wolf_archer     | 800   | 4   | physical  | 60  | 20     | 10     | 100 | 6    | 1      | 3      | 10    | 5     | 0    | 0     | MARKSMAN, SON_OF_FOREST, ASSAULT_FORCE, BLINDING_ATTACK |
| 17 | ice_elemental   | 600   | 3   | magic     | 55  | 10     | 20     | 100 | 4    | 1      | 3      | 10    | 5     | 10   | 0     | SON_OF_WATER, SELF_REPAIR |
| 18 | slime           | 250   | 1   | magic     | 50  | 40     | -10    | 100 | 4    | 1      | 1      | 10    | 5     | 5    | 0     | SELF_REPAIR |
| 19 | mermaid         | 200   | 1   | physical  | 40  | 0      | 0      | 100 | 4    | 1      | 2      | 10    | 5     | 0    | 0     | VILLAGE_CAPTOR, REPAIRER, SON_OF_WATER |
| 20 | druid           | 600   | 3   | magic     | 40  | 0      | 30     | 100 | 4    | 1      | 2      | 5     | 5     | 0    | 1     | ATTACK_AURA, SON_OF_LAND, SUPPORTER |

**Legend**: AtkGr = attackGrowth, DefGr = defenseGrowth, HPGr = maxHpGrowth, MovGr = moveGrowth

**Notes**:
- `*` Cost is overridden: commander APK=400 → project `null` (free via RuleConfig); skeleton/crystal APK=0 → project `null` (summoned/scenario only).
- `**` Crystal move: APK `data.bin`=4, project=0 (intentional — crystal is a static scenario target, APK value unused).
- HP (baseMaxHp) is 100 for all units in `data.bin`. Only golem (25), ice_elemental (10), and slime (5) have non-zero `maxHpGrowth`.

---

## 3. Defense Calculation Formula

APK stores **baseDefense** and **defenseShift** per unit. The final physical/magic defense is derived based on the unit's own `attackElement` (which type of damage it deals). These store in the project's `physicalDefense` / `magicDefense` fields directly.

**Formulas**:

```
If attackElement == 0 (physical attacker):
    physicalDefense = baseDefense + defenseShift
    magicDefense    = baseDefense - defenseShift

If attackElement == 1 (magic attacker):
    physicalDefense = baseDefense - defenseShift
    magicDefense    = baseDefense + defenseShift
```

**Derivation examples**:

| Unit           | AtkType | baseDefense | defenseShift | PhyDef (calc) | MagDef (calc) |
|----------------|---------|-------------|--------------|---------------|---------------|
| witch          | magic   | 20          | 20           | 20−20 = **0** | 20+20 = **40** |
| elf            | magic   | 25          | 5            | 25−5 = **20** | 25+5 = **30**  |
| wolf           | phys    | 15          | 5            | 15+5 = **20** | 15−5 = **10**  |
| golem          | phys    | 20          | 10           | 20+10 = **30**| 20−10 = **10** |
| berserker      | phys    | 15          | 5            | 15+5 = **20** | 15−5 = **10**  |
| ghost          | magic   | 10          | 5            | 10−5 = **5**  | 10+5 = **15**  |
| slime          | magic   | 15          | 25           | 15−25 = **40**| 15+25 = **−10**|
| druid          | magic   | 15          | 15           | 15−15 = **0** | 15+15 = **30** |
| soldier        | phys    | 5           | 0            | 5+0 = **5**   | 5−0 = **5**    |
| dragon         | magic   | 25          | 0            | 25−0 = **25** | 25+0 = **25**  |

Units with `defenseShift = 0` (soldier, archer, water_elemental, catapult, dragon, commander, skeleton, crystal, paladin, mermaid) have equal physical and magic defense.

---

## 4. APK Evidence References

All evidence from decompiled APK classes (`C0620c.java`, `C0600q.java`).

### 4.1 Level Growth Formulas

| Stat     | Method            | Lines        | Formula                         |
|----------|-------------------|--------------|----------------------------------|
| Attack   | `C0600q.m4273l`   | 1302–1305    | `attack = baseAttack + attackGrowth × level` |
| Defense  | `C0600q.m4266o`   | 1376–1379    | `defense = baseDefense + defenseGrowth × level` |
| MaxHP    | `C0600q.m4253y`   | 1447–1450    | `maxHp = baseMaxHp + maxHpGrowth × level` |
| Move     | `C0600q.m4252z`   | 1453–1458    | `move = baseMove + moveGrowth × level` |
| MinRange | `C0600q.m4257u`   | 1424–1429    | `minRange = ...` (direct field read) |
| MaxRange | `C0600q.m4258t`   | 1416–1421    | `maxRange = ...` (direct field read) |

### 4.2 Field Definitions

All UnitConfig fields in `C0620c.java`:

| Field      | Declaration                        |
|------------|------------------------------------|
| cost       | `private int f1379a;`              |
| population | `private int f1380b;`              |
| elementType| `private int f1381c;`              |
| defenseShift | `private int f1382d;`            |
| baseAttack | `private int f1383e;`              |
| baseDefense| `private int f1384f;`              |
| baseMaxHp  | `private int f1385g;`              |
| baseMove   | `private int f1386h;`              |
| minRange   | `private int f1387i;`              |
| maxRange   | `private int f1388j;`              |
| attackGrowth | `private int f1389k;`            |
| defenseGrowth | `private int f1390l;`           |
| maxHpGrowth  | `private int f1391m;`           |
| moveGrowth   | `private int f1392n;`           |
| abilities  | `private int[] f1393o;`            |

---

## 5. Project Comparison Summary

Comparison between APK `data.bin` and `src/game/units.ts` (`UNIT_CONFIGS`).

| Check                               | Result |
|-------------------------------------|--------|
| Units compared                      | 21     |
| Stat mismatches                     | **0**  |
| Project matches APK values exactly  | **Yes** |

### Intentional Differences

| Unit      | Field      | APK Value | Project Value | Reason |
|-----------|------------|-----------|---------------|--------|
| commander | cost       | `400`     | `null`        | Cost handled via `RuleConfig` (free for all players) |
| skeleton  | cost       | `0`       | `null`        | Summoned-only unit (necromancy) |
| crystal   | cost       | `0`       | `null`        | Scenario-only object |
| crystal   | move       | `4`       | `0`           | Static target; APK value unused in practice |

### Confirmed Matching Fields (all 21 units)

- `attack` (baseAttack)
- `attackType` (elementType)
- `physicalDefense` / `magicDefense` (resolved via baseDefense + defenseShift)
- `minRange` / `maxRange`
- `move` (baseMove)
- `population`
- `abilities`
- `attackGrowth`
- `defenseGrowth`
- `maxHpGrowth`
- `moveGrowth`

---

## 6. Notable Stat Patterns

### Extreme Defense Values

| Unit           | PhyDef | MagDef | Note |
|----------------|--------|--------|------|
| slime          | 40     | −10    | Highest physical defense in the game, but **negative** magic defense (−10). Mirror-specialized. `baseDefense=15, defenseShift=25`. |
| witch          | 0      | 40     | Highest magic defense in the game, zero physical. Glass cannon vs physical attacks. `baseDefense=20, defenseShift=20`. |
| golem          | 30     | 10     | Second-highest physical defense, low magic defense. Classic tank profile. |
| mermaid        | 0      | 0      | Only unit with zero in both defenses. |

### Balanced Defenses (shift = 0)

| Unit           | AtkType | PhyDef | MagDef |
|----------------|---------|--------|--------|
| soldier        | physical | 5     | 5      |
| archer         | physical | 5     | 5      |
| water_elemental| physical | 15    | 15     |
| catapult       | physical | 5     | 5      |
| dragon         | magic    | 25    | 25     |
| commander      | physical | 20    | 20     |
| skeleton       | physical | 5     | 5      |
| paladin        | physical | 10    | 10     |

### Attack Power Tiers

| Tier  | Atk | Units                                      |
|-------|-----|--------------------------------------------|
| S     | 75  | wolf                                       |
| A     | 70  | berserker, dragon                          |
| B     | 60  | water_elemental, catapult, commander, wolf_archer |
| C     | 55  | soldier, elf, golem, ice_elemental         |
| D     | 50  | paladin, ghost, dark_mage, slime           |
| E     | 45  | archer, witch                              |
| F     | 40  | skeleton, mermaid, druid                   |
| G     | 0   | crystal                                    |

### Speed Comparison (base move)

| Move | Units |
|------|-------|
| 6    | wolf, dragon, wolf_archer |
| 5    | golem, berserker |
| 4    | soldier, archer, water_elemental, witch, elf, commander, crystal*, ghost, dark_mage, ice_elemental, slime, mermaid, druid, paladin |
| 3    | skeleton, catapult |
| 0    | crystal† |

> `*` Crystal APK move = 4, but project overrides to 0.  
> `†` Effective project value.

### Growth Rate Patterns

- **attackGrowth 10** (standard): soldier, archer, water_elemental, wolf, catapult, dragon, commander, skeleton, berserker, ghost, dark_mage, wolf_archer, ice_elemental, slime, mermaid
- **attackGrowth 5** (slow): witch, elf, golem, paladin, druid
- **attackGrowth 0** (none): crystal

- **maxHpGrowth 25**: golem (levels up to massive HP pool)
- **maxHpGrowth 10**: ice_elemental
- **maxHpGrowth 5**: slime
- **maxHpGrowth 0**: all other 18 units

- **moveGrowth 1**: ghost, druid, commander (gain mobility as they level)
- **moveGrowth 0**: all other 18 units

- **defenseGrowth 5**: all units except crystal (0)

### Ability Distribution

| Ability          | Units                                             |
|------------------|---------------------------------------------------|
| SON_OF_WATER     | water_elemental, ice_elemental, mermaid           |
| SON_OF_LAND      | wolf, berserker, druid                            |
| AIR_FORCE        | elf, dragon, ghost                                |
| VILLAGE_CAPTOR   | soldier, commander, paladin, mermaid              |
| REPAIRER         | soldier, commander, mermaid                       |
| MARKSMAN         | archer, wolf_archer                               |
| ASSAULT_FORCE    | wolf, dragon, wolf_archer                         |
| UNDEAD           | skeleton, ghost                                   |
| SELF_REPAIR      | ice_elemental, slime                              |
| POISONER         | wolf, skeleton                                    |
| RANGED_DEFENDER  | golem, dragon                                     |
| BLINDING_ATTACK  | dark_mage, wolf_archer                            |
| SUMMONER         | witch                                             |
| CLEANSING_AURA   | elf                                               |
| WEAKENING_AURA   | golem                                             |
| DESTROYER        | catapult                                          |
| HEALER           | paladin                                           |
| BLOODTHIRSTY     | berserker                                         |
| COUNTER_MADNESS  | berserker                                         |
| GRIM_REAPER      | ghost                                             |
| ATTACK_AURA      | druid                                             |
| SUPPORTER        | druid                                             |
| CASTLE_CAPTOR    | commander                                         |
| MELEE_MASTER     | dragon                                            |

### Cost-to-Efficiency Patterns

- **Best attack per gold**: skeleton (40 atk / 0 cost — summoned), berserker (70 atk / 500 gold = 0.14 atk/g), wolf (75 atk / 600 gold = 0.125 atk/g)
- **Worst attack per gold**: druid (40 atk / 600 gold = 0.067 atk/g), witch (45 atk / 400 gold = 0.1125 atk/g)
- **Highest population efficiency** (atk per pop): berserker (70/2 = 35 atk/pop), wolf (75/3 = 25 atk/pop)
- **Lowest pop efficiency**: druid (40/3 ≈ 13.3 atk/pop), witch (45/2 = 22.5 atk/pop)

---

## 7. Verification Tool

Run the APK unit report tool to verify the current project state:

```bash
npm run apk:unit-report
```

This reads `data.bin` from the Android APK and compares every field against `src/game/units.ts`, reporting any mismatches. Expected output: **0 mismatches**.
