# APK Unit Terrain Features (地形特征)

> Evidence sources: `C0600q.java` (core rules), `C0619b.java` (tile data), `abilities.ts` (project implementation), `units.ts` (project unit config), `terrain.ts` (project terrain tags), `terrain_rules.ts` (project terrain rules)

---

## 1. APK Terrain Data Fields (`C0619b.java:8-41`)

| Field | Type | Description |
|-------|------|-------------|
| `f1368a` | boolean | **Land flag**: `true` = land/ground tile, `false` = water tile |
| `f1369b` | int | Terrain category: `1`=mountain, `2`=forest, `3`=castle/city, `4`=village/town |
| `f1371d` | int | Base tile defense bonus |
| `f1372e` | int | Base tile heal-per-turn |
| `f1373f` | int | Standard move cost for ground units |
| `f1374g` | boolean | Ownable flag (towns, castles) |
| `f1375h` | int | Building HP |
| `f1376i` | int | Building income |

---

## 2. APK Ability-to-Terrain Mapping

### 2.1 Ability ID Cross-Reference

| APK ID | APK Name | Project Name | Units |
|--------|----------|--------------|-------|
| 3 | `AIR_FORCE` | `flying` | ghost(14), elf(4), dragon(8) |
| 12 | `SON_OF_WATER` | `water_child` | water_elemental(2), ice_elemental(17), mermaid(19) |
| 13 | `SON_OF_FOREST` | `forest_child` | elf(4), wolf_archer(16) |
| 14 | `SON_OF_MOUNTAIN` | `mountain_child` | golem(6) |
| 22 | `SON_OF_LAND` | `earth_child` | wolf(5), berserker(13), golem(6), druid(20) |

### 2.2 Unit Ability Details (from data.bin)

| Unit | APK ID | abilityIds | Abilities (Project) |
|------|--------|-----------|---------------------|
| soldier | 0 | `[0,2]` | village_capturer, repairer |
| archer | 1 | `[4]` | sharpshooter |
| water_elemental | 2 | `[12]` | **water_child** |
| witch | 3 | `[6]` | summoner |
| elf | 4 | `[3,13,19]` | **flying**, **forest_child**, cleansing_aura |
| wolf | 5 | `[8,21,22]` | poisoner, assault_troop, **earth_child** |
| golem | 6 | `[11,14,20]` | ranged_defense, **mountain_child**, weakness_aura |
| catapult | 7 | `[5]` | destroyer |
| dragon | 8 | `[3,10,11,21]` | **flying**, melee_master, ranged_defense, assault_troop |
| commander | 9 | `[0,1,2]` | village_capturer, castle_capturer, repairer |
| skeleton | 10 | `[8,9]` | poisoner, undead |
| crystal | 11 | `[]` | none |
| paladin | 12 | `[0,7]` | village_capturer, healer |
| berserker | 13 | `[15,16,22]` | fighting_spirit, counter_storm, **earth_child** |
| ghost | 14 | `[3,9,25]` | **flying**, undead, death_reaper |
| dark_mage | 15 | `[23]` | blinder (no terrain ability) |
| wolf_archer | 16 | `[4,13,21,23]` | sharpshooter, **forest_child**, assault_troop, blinder |
| ice_elemental | 17 | `[12,17]` | **water_child**, self_repair |
| slime | 18 | `[17]` | self_repair |
| mermaid | 19 | `[0,2,12]` | village_capturer, repairer, **water_child** |
| druid | 20 | `[18,22,24]` | attack_aura, **earth_child**, supporter |

---

## 3. APK Terrain Rule Functions (`C0600q.java`)

### 3.1 Movement Cost — `m4357a` (lines 306-320)

```java
public int m4357a(C0613f c0613f, C0619b c0619b) {
    // Step 1: Check scripted per-unit overrides (f1315m = unit-specific move table)
    String str = c0613f.f1315m;
    if (str != null) {
        int m4167a = this.f1215f.f1229a.m4167a(C0640d.m4127b(str, c0619b.f1369b), -1);
        if (m4167a > 0) return m4167a;
    }
    // Step 2: Standard move cost
    int i = c0619b.f1373f;
    int i2 = c0619b.f1369b;
    // Step 3: Terrain-child matching → move cost = 1
    if (AIR_FORCE ||
        (SON_OF_LAND && f1368a) ||           // earth_child on LAND
        (SON_OF_WATER && !f1368a) ||          // water_child on WATER
        (SON_OF_FOREST && i2 == 2) ||         // forest_child on FOREST
        (SON_OF_MOUNTAIN && i2 == 1))         // mountain_child on MOUNTAIN
    {
        return 1;
    }
    // Step 4: SON_OF_LAND penalty on water
    return (!SON_OF_LAND || f1368a) ? i : i + 1;
}
```

**Movement Rules Summary:**

| Ability | Matching Condition | Move Cost | Non-Matching |
|---------|-------------------|-----------|-------------|
| `AIR_FORCE` | Always | **1** | — |
| `SON_OF_WATER` | Water (`!f1368a`) | **1** | tile standard (`f1373f`) |
| `SON_OF_FOREST` | Forest (`f1369b==2`) | **1** | tile standard |
| `SON_OF_MOUNTAIN` | Mountain (`f1369b==1`) | **1** | tile standard |
| `SON_OF_LAND` | Land (`f1368a`) | **1** | tile standard + 1 on water |
| No terrain ability | — | tile `f1373f` | — |

### 3.2 Terrain Defense — `m4364a` (lines 262-265)

```java
public int m4364a(C0613f c0613f) {
    int i = AIR_FORCE ? 0 : tile.f1371d;
    // Condition for NO bonus:
    // (land || !SON_OF_WATER) && !((forest && SON_OF_FOREST) || (mountain && SON_OF_MOUNTAIN))
    return (condition) ? i : i + bonusValue;
}
```

**Defense Rules:**

| Ability | Matching Terrain | Effect |
|---------|-----------------|--------|
| `AIR_FORCE` | Always | **Defense = 0** (ignores tile defense) |
| `SON_OF_WATER` | Water (`!f1368a`) | `tile f1371d + bonus` |
| `SON_OF_FOREST` | Forest (`f1369b==2`) | `tile f1371d + bonus` |
| `SON_OF_MOUNTAIN` | Mountain (`f1369b==1`) | `tile f1371d + bonus` |
| `SON_OF_LAND` | — | No special defense bonus |
| None | — | `tile f1371d` |

### 3.3 Attack Bonus — `m4360a` (lines 276-303)

```java
// Terrain child attack bonuses:
if (SON_OF_MOUNTAIN && f1369b == 1)  i += f1277f;   // mountain → +10
if (SON_OF_FOREST && f1369b == 2)    i += f1277f;   // forest → +10
if (SON_OF_WATER && !f1368a)         i += f1277f;   // water → +10
// Other bonuses (non-terrain):
if (DESTROYER && target on building)  i += f1272a;   // +10 vs building targets
if (MARKSMAN && target is AIR_FORCE)  i += f1276e;   // +10 vs flying
if (GRIM_REAPER && target has status) i += f1274c;   // +20 vs status-afflicted
if (AIR_FORCE && target on water)     i += f1273b;   // +10 vs water non-flying
```

**Attack Bonus Rules:**

| Ability | Matching Terrain | Bonus |
|---------|-----------------|-------|
| `SON_OF_WATER` | Water (`!f1368a`) | **+10** |
| `SON_OF_FOREST` | Forest (`f1369b==2`) | **+10** |
| `SON_OF_MOUNTAIN` | Mountain (`f1369b==1`) | **+10** |
| `AIR_FORCE` (attacker) vs water target | target on water + not AIR_FORCE | **+10** |
| `SON_OF_LAND` | — | **None** |

### 3.4 Turn-Start Heal — `m4342b` (lines 625-636)

```java
public int m4342b(C0613f c0613f) {
    int i = tile.f1372e;  // tile base heal
    // Friendly building heal:
    if (!f1374g || isOwnerMatch) { i += tile.f1372e; }
    // Terrain child matching heal:
    if ((!SON_OF_WATER || f1368a) &&        // SON_OF_WATER on LAND → NO heal
        !((SON_OF_FOREST && f1369b==2) ||    // forest_child on FOREST → heal
          (SON_OF_MOUNTAIN && f1369b==1)))   // mountain_child on MOUNTAIN → heal
    {
        return i;  // no terrain child heal
    }
    // Territory-child matching → +10 (f1263B) + 0*level (f1264C = 0)
    return i + f1263B + (f1264C * level);
}
```

**Turn-Start Heal Rules:**

| Ability | Matching Terrain | Heal Amount | Notes |
|---------|-----------------|-------------|-------|
| `SON_OF_WATER` | Water (`!f1368a`) | **+10** (no level scaling) | `f1264C = 0` |
| `SON_OF_FOREST` | Forest (`f1369b==2`) | **+10** | No level scaling |
| `SON_OF_MOUNTAIN` | Mountain (`f1369b==1`) | **+10** | No level scaling |
| `SON_OF_LAND` | — | **None** | No terrain heal |
| On building (own) | — | Base tile `f1372e` | Town/castle: +20 |

---

## 4. Per-Unit Terrain Summary

| # | Unit | APK ID | Terrain Ability | Move on Land | Move on Water | Move on Forest | Move on Mountain | Attack Bonus | Defense Bonus | Turn Heal | Special Rules |
|---|------|--------|----------------|-------------|--------------|----------------|-----------------|-------------|--------------|-----------|---------------|
| 1 | ghost | 14 | `flying` | **1** | **1** | **1** | **1** | +10 vs water targets | 0 (ignores tile) | 0 | Can fly over non-flying enemies |
| 2 | elf | 4 | `flying`, `forest_child` | **1** (fly) | **1** (fly) | **1** (fly/forest) | **1** (fly) | +10 on forest (via forest_child); +10 vs water (via flying) | 0 on non-forest; +bonus on forest | +10 on forest | Dual terrain ability |
| 3 | dragon | 8 | `flying` | **1** | **1** | **1** | **1** | +10 vs water targets | 0 (ignores tile) | 0 | Also has melee_master, ranged_defense |
| 4 | water_elemental | 2 | `water_child` | standard (3) | **1** | standard (2/3) | standard (3) | **+10 on water** | **+bonus on water** | **+10 on water** | Pure water child |
| 5 | ice_elemental | 17 | `water_child`, `self_repair` | standard (3) | **1** | standard (2/3) | standard (3) | **+10 on water** | **+bonus on water** | **+10 on water** + 25% self_repair | Magic type |
| 6 | mermaid | 19 | `water_child`, `village_capturer`, `repairer` | standard (3) | **1** | standard (2/3) | standard (3) | **+10 on water** | **+bonus on water** | **+10 on water** | Also captures/repairs |
| 7 | golem | 6 | `mountain_child`, `ranged_defense`, `weakness_aura` | standard (1-3) | standard (3) | standard (2) | **1** | **+10 on mountain** | **+bonus on mountain** | **+10 on mountain** | Only mountain_child unit |
| 8 | wolf_archer | 16 | `forest_child`, `sharpshooter`, `assault_troop`, `blinder` | standard (1-3) | standard (3) | **1** | standard (3) | **+10 on forest**; +10 vs flying (sharpshooter) | **+bonus on forest** | **+10 on forest** | Ranged + assault_troop |
| 9 | wolf | 5 | `earth_child`, `poisoner`, `assault_troop` | **1** | standard+1 (4) | standard (2) | standard (3) | None | None (standard tile) | None | Water penalty +1 |
| 10 | berserker | 13 | `earth_child`, `fighting_spirit`, `counter_storm` | **1** | standard+1 (4) | standard (2) | standard (3) | None | None (standard tile) | None | Water penalty +1 |
| 11 | druid | 20 | `earth_child`, `attack_aura`, `supporter` | **1** | standard+1 (4) | standard (2) | standard (3) | None | None (standard tile) | None | Water penalty +1 |
| 12 | soldier | 0 | none | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 13 | archer | 1 | `sharpshooter` | standard | standard (3) | standard (2/3) | standard (3) | +10 vs air targets | Standard tile | Standard tile | No terrain ability |
| 14 | witch | 3 | `summoner` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 15 | catapult | 7 | `destroyer` | standard | standard (3) | standard (2/3) | standard (3) | +10 vs building targets | Standard tile | Standard tile | No terrain ability |
| 16 | commander | 9 | `village_capturer`, `castle_capturer`, `repairer` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 17 | skeleton | 10 | `poisoner`, `undead` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 18 | paladin | 12 | `village_capturer`, `healer` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 19 | dark_mage | 15 | `blinder` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 20 | slime | 18 | `self_repair` | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | No terrain ability |
| 21 | crystal | 11 | none | standard | standard (3) | standard (2/3) | standard (3) | None | Standard tile | Standard tile | Campaign target only |

*Note: "standard" = tile `f1373f` value. Parenthesized numbers are example values for common terrain types: road(1), forest(2), mountain(3), deep_water(3).*

---

## 5. APK vs Project Terrain Differences

### 5.1 Terrain Classification Method

| Aspect | APK | Project |
|--------|-----|---------|
| Water detection | `f1368a == false` | `tags.includes('water')` |
| Forest detection | `f1369b == 2` | `tags.includes('forest')` |
| Mountain detection | `f1369b == 1` | `tags.includes('mountain')` |
| Land detection | `f1368a == true` | `tags.includes('land')` |

The APK uses hardcoded terrain category IDs (`f1369b`), while the project uses tag-based classification (`terrain.ts:11-29`). This is an expected architectural difference — the project's tag system is more flexible and allows composite tags (e.g., `bridge` has both `water` and `road` tags).

### 5.2 SON_OF_WATER / `water_child` Direction

| Aspect | APK (`SON_OF_WATER`) | Project (`water_child`) | Match? |
|--------|---------------------|------------------------|--------|
| Move cost 1 on | **Water** (`!f1368a`) | **Water** (`isWaterTerrain`) | ✅ |
| Attack bonus +10 on | **Water** (`!f1368a`) | **Water** (`isWaterTerrain`) | ✅ |
| Defense bonus on | **Water** (`!f1368a`) | **Water** (`isWaterTerrain`) | ✅ |
| Turn-start heal +10 on | **Water** (`!f1368a`) | **Water** (`isWaterTerrain`) | ✅ |

**Both APK and project agree: `water_child` provides terrain benefits on WATER terrain.**

*(Note: APK enum field `f1368a` is a **land** flag where `true=land`, `false=water`. `!f1368a` = water. This can be a source of confusion when reading the decompiled Java code.)*

### 5.3 SON_OF_LAND / `earth_child` Water Penalty

| Aspect | APK (`SON_OF_LAND`) | Project (`earth_child`) | Match? |
|--------|--------------------|------------------------|--------|
| Land move cost | **1** | **1** | ✅ |
| Water move cost | `standard + 1` | **2** (hardcoded) | ⚠️ Numeric assumption |
| Special defense | None | None | ✅ |
| Turn-start heal | None | None | ✅ |

The project hardcodes water move cost as `2`, while APK uses `standard + 1`. For most water tiles (`f1373f=3`), both yield 4. But if a scripted tile had a different base move cost, APK would dynamically compute the penalty.

### 5.4 Current Project Terrain Tags (`terrain.ts:11-29`)

| ID | Key | Tags |
|----|-----|------|
| 1 | snow | `land` |
| 2 | deep_water | `water` |
| 3 | mountain | `land`, `mountain` |
| 4 | hill | `land`, `hill`, `mountain` |
| 5 | island | `land`, `water`, `special` |
| 6 | road | `land`, `road` |
| 7 | forest | `land`, `forest` |
| 8 | damaged_town | `land`, `building`, `town`, `damaged`, `repairable` |
| 9 | town | `land`, `building`, `town`, `capturable`, `income`, `destructible` |
| 10 | castle | `land`, `building`, `castle`, `capturable`, `income`, `recruit_source` |
| 11 | camp | `land`, `building`, `camp`, `healing`, `not_capturable` |
| 12 | temple | `land`, `building`, `temple`, `healing`, `cleanse` |
| 13 | special_1 | `special` |
| 14 | special_2 | `special` |
| 15 | special_3 | `special` |
| 16 | water_temple | `water`, `building`, `temple`, `healing`, `cleanse` |
| 17 | bridge | `water`, `bridge`, `road` |

### 5.5 Bridge Terrain Handling

Bridge (`t72` in APK data) has `kind=1` (same category as water tiles) but `f1368a=true` (land flag). The APK language table states "桥也是水面地形" (bridge counts as water terrain). In the project, bridge has `tags: ["water", "bridge", "road"]`, so all water-child checks (`isWaterTerrain`) will match bridge. The `f1368a=true` classification in APK means:

- `SON_OF_LAND` treats bridge as land → move=1 ✅
- `SON_OF_WATER` treats bridge as land (f1368a=true) → NO water-child bonus on bridge in APK
- Project `water_child` treats bridge as water → YES water-child bonus on bridge

This is a **potential difference** that needs gameplay verification.

### 5.6 Turn-Start Healing Logic

| Aspect | APK (`m4342b` line 625-636) | Project (`engine.ts:305-318`) |
|--------|----------------------------|------------------------------|
| Building heal | Town/castle: +20 HP (f1372e) | Town/castle: +20 (via `getTileHealPerTurn`) |
| Territory-child heal | **+10** on matching terrain | **+10** on matching terrain |
| Level scaling | `f1264C = 0` (none) | None |
| Stacking | Tile heal + territory heal | Tile heal + territory heal |
| SELF_REPAIR | Separate method (25% maxHP) | `engine.ts:324` (25% maxHP) |
| UNDEAD poison | +10 heal on poison (not -10) | `engine.ts:320-322` |

---

## 6. Key Evidence Locations

| Rule | File | Lines |
|------|------|-------|
| Movement cost | `C0600q.java` | 306-320 |
| Terrain defense | `C0600q.java` | 262-265 |
| Attack bonus | `C0600q.java` | 276-303 |
| Turn-start heal | `C0600q.java` | 625-636 |
| Tile data structure | `C0619b.java` | 8-57 |
| Project move cost | `abilities.ts` | 72-125 |
| Project attack bonus | `abilities.ts` | 130-145 |
| Project defense bonus | `abilities.ts` | 150-165 |
| Project turn-start heal | `engine.ts` | 295-339 |
| Project terrain config | `terrain.ts` | 11-29 |
| Project terrain rules | `terrain_rules.ts` | 1-101 |
| APK ability mapping | `apk_compat.ts` | 42-69 |
| APK terrain data | `apk_terrain.ts` | 33-118 |
| APK skirmish mapping | `apk_terrain.ts` | 134-171 |
| Unit configs | `units.ts` | 25-47 |

---

## 7. Revision History

| Date | Change |
|------|--------|
| 2026-07-02 | Initial document. Compiled from `C0600q.java`, `C0619b.java`, and project `abilities.ts`, `engine.ts`, `terrain.ts`, `units.ts`, `terrain_rules.ts` |
