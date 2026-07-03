# APK Unit Status System — Comprehensive Reference

## Status Enum

| Ordinal | APK `EnumC0615h`   | Project `StatusType` | Field `f1350a` (harmful) |
|--------:|--------------------|----------------------|:-------------------------:|
| 0       | `NONE`             | —                    | —                         |
| 1       | `POISONED`         | `"poisoned"`         | `true`                    |
| 2       | `INSPIRED`         | `"inspired"`         | `false`                   |
| 3       | `BLINDED`          | `"blinded"`          | `true`                    |
| 4       | `WEAKENED`         | `"weakened"`         | `true`                    |

Mapping: `apk_compat.ts:31-40` — `APK_STATUS_ID_TO_TYPE` / `APK_STATUS_TYPE_TO_ID`.

## Status Storage

**APK (Java `C0613f.f1309g`):** Bit-packed `(ordinal << 12) \| duration` — upper 4 bits = status ordinal, lower 12 bits = remaining ticks.

**Project (`types.ts:13-17`):**
```typescript
interface UnitStatus {
  type: StatusType;
  remainingTicks?: number;   // only POISONED
  remainingTurns?: number;   // INSPIRED, BLINDED, WEAKENED
}
```

POISONED uses `remainingTicks` (tick-based, decremented each turn-start). All other statuses use `remainingTurns` (turn-based, decremented each turn-start). See `engine.ts:19-34`.

## Status Durations (APK RuleData `C0611d`)

| Status    | APK Field | Default | Project Value | Evidence                              |
|-----------|-----------|--------:|:-------------:|---------------------------------------|
| POISONED  | `f1270I`  | 2       | 2 ticks       | `engine.ts:364`                      |
| BLINDED   | `f1268G`  | 1       | 1 turn        | `engine.ts:371`                      |
| WEAKENED  | `f1271J`  | 1       | 1 turn        | `engine.ts:412`                      |
| INSPIRED  | `f1269H`  | 0       | 0 → 1 turn*   | `engine.ts:401`                      |

> \* APK default 0 means "expires same turn". The project uses `remainingTurns: 1` for convenience; the turn-start decay from 1→0 makes it harmless next turn, matching APK semantics.

## Status Application Points

### 1. Combat — `applyCombatStatusEffects` (`engine.ts:357-373`)

Applied during both attack and counter-attack:

```typescript
// Order: POISONED first, then BLINDED
if (source has 'poisoner' && target does NOT have 'poisoner') {
  if (!target.status || target.status.type === 'poisoned') {
    target.status = { type: 'poisoned', remainingTicks: 2 };
  }
}
if (source has 'blinder' && target does NOT have 'blinder') {
  if (!target.status || target.status.type === 'blinded') {
    target.status = { type: 'blinded', remainingTurns: 1 };
  }
}
```

Rules:
- Status applied on every attack AND counterattack
- Does NOT replace a *different* existing status (`!target.status || target.status.type === sameType`)
- Immunity = same ability (`poisoner` → poison immune, `blinder` → blind immune)

### 2. Auras — `triggerAuras` (`engine.ts:375-417`)

Triggered on **wait only** (NOT on attack):

| Aura Ability       | Effect                                   | Radius | Target      | Duration   |
|--------------------|------------------------------------------|:------:|-------------|------------|
| `cleansing_aura`   | Removes harmful statuses, heal +10 (+5/level) or damage undead for same amount | 2      | Allied      | Instant    |
| `attack_aura`      | Grants `INSPIRED` for 1 turn             | 2      | Allied      | 1 turn     |
| `weakness_aura`    | Grants `WEAKENED` for 1 turn             | 2      | Enemy       | 1 turn     |

Aura application rules:
- Only applies if target has **no existing status** (`!u.status`)
- `weakness_aura`: immunity = `weakness_aura` on target
- `attack_aura`: no immunity check (skips units with existing status)

### 3. Script — `syncSetUnitStatus` (`apk_stage.ts:511-542`)

APK Stage API `SyncSetUnitStatus`:
```typescript
syncSetUnitStatus(state, x, y, statusId, rounds, replaceExisting?)
```
- `statusId`: 1=poisoned, 2=inspired, 3=blinded, 4=weakened
- `rounds`: duration in ticks (poisoned) or turns (others)
- `replaceExisting`: default `true`; if `false` and unit already has a status, call fails

## Status Effects Detail

### POISONED

| Unit Type       | Effect              | Code Reference                     |
|-----------------|---------------------|------------------------------------|
| Non-undead      | `hpDelta = -10` (overrides all other healing) | `engine.ts:321` |
| UNDEAD          | `hpDelta += +10` (adds to terrain heal)      | `engine.ts:321` |
| SUMMONER (APK)  | `hpDelta = 0` (APK behavior, **not yet implemented**) | `C0600q.m4331c:730-737` |

- Duration: 2 ticks, decremented each turn-start (`engine.ts:188-198`)
- Poisoned unit on temple (kind=5) → status cleared before poison damage (`engine.ts:287-291`)
- `self_repair` ability adds +25% HP after poison, so slime/ice_elemental can partially mitigate

### INSPIRED

| Distance | Attack Bonus | Code Reference              |
|:--------:|:------------:|-----------------------------|
| 1 (melee) | `+10`       | `rules.ts:54-56`           |
| >1 (ranged) | `+5`      | `rules.ts:54-56`           |

- Duration: 1 turn (decays on next turn-start)
- NOT affected by temple cleansing (`f1350a=false`)
- Only applied by `attack_aura` on wait

### BLINDED

| Stat    | Value | Code Reference                     |
|---------|:-----:|------------------------------------|
| MinRange | 0    | `abilities.ts:229-231`            |
| MaxRange | 0    | `abilities.ts:229-231`            |

Consequences:
- Cannot attack (`getLegalActions` skips units with `eff.maxRange === 0`)
- Cannot normal counterattack (range 0 fails `inRange` check at `engine.ts:502-507`)
- Counter Storm (`counter_storm` ability) still works (range-independent at `engine.ts:500`)
- Duration: 1 turn
- Immunity: `blinder` ability

### WEAKENED

| Situation | Defense Penalty | Move  | Code Reference                    |
|-----------|:---------------:|:-----:|-----------------------------------|
| Melee (dist=1) | `pDef -= 10, mDef -= 10` | 1 | `abilities.ts:220-224` |
| Ranged (dist>1) | `actualDefenderDefense += 5` (reduced penalty) | 1 | `rules.ts:60-61` |

Move is reduced to **1** via `getEffectiveStats` (`abilities.ts:223`). This is confirmed by APK decompile (`C0600q.m4252z:1453-1458`).

Duration: 1 turn. Immunity: `weakness_aura` ability.

## GRIM_REAPER Bonus

**APK Ability `death_reaper`** (project ability `'death_reaper'`, APK ID `25`):

```typescript
if (hasAbi(attacker, 'death_reaper') && defender.status?.type is harmful) {
    extraAttack += 20;  // APK field f1274c
}
```
(`rules.ts:42-44`)

Harmful statuses: `poisoned`, `blinded`, `weakened` (any status where `f1350a === true`).

Only unit with `death_reaper`: **Ghost** (APK ID 14).

## Temple Cleansing

Determined by `tileClearsNegativeStatusAtTurnStart` (`terrain_rules.ts:43-48`):

```typescript
if (tile.apkTerrainId !== undefined) {
  return getApkTerrainConfig(tile.apkTerrainId)?.kind === 5;  // APK kind=5
}
return tileHasTerrainTag(tile, 'cleanse');  // project tag
```

APK terrain with `kind === 5`: camp (APK ID 30) — observed to clear negative status.
APK terrain with `kind === 8`: temple (APK ID 31) — currently does NOT clear via kind check (the project's `'cleanse'` tag on project terrain 12 is the intended temple terrain).

Cleanses (statuses with `f1350a === true`):
- POISONED — ✓
- BLINDED — ✓  
- WEAKENED — ✓
- INSPIRED — ✗ (not harmful)

## EOT Status Decay

At turn-start for player-owned units (`engine.ts:188-198`):

```typescript
private decayStatusAtTurnStart(unit: Unit) {
  const nextDuration = getStatusDuration(unit.status) - 1;
  if (nextDuration < 0) {
    delete unit.status;  // expired
    return;
  }
  setStatusDuration(unit.status, nextDuration);
}
```

**Exception**: If the unit is on a cleansing tile (temple, kind=5), status is deleted directly without decay (`engine.ts:287-291`).

## Per-Unit Status Table

APK unit order (21 units, per `APK_UNIT_ID_TO_CLASS`).

| ID | Unit Class       | Applies | Immune To | GRIM_REAPER | Special Notes |
|:--:|------------------|---------|-----------|:-----------:|---------------|
| 0  | soldier          | — | — | — | No status interaction |
| 1  | archer           | — | — | — | No status interaction |
| 2  | water_elemental  | — | — | — | No status interaction |
| 3  | witch            | — | — | — | APK: SUMMONER → poison deals 0 HP (project: currently treats as normal -10) |
| 4  | elf              | `cleansing_aura` (radius 2, wait) | — | — | Heals allies +10/level*5, damages undead; removes harmful statuses |
| 5  | wolf             | POISONED (`poisoner`) | POISONED | — | `assault_troop` status-independent |
| 6  | golem            | WEAKENED (`weakness_aura` radius 2, wait) | WEAKENED | — | `weakness_aura` triggers on wait |
| 7  | catapult         | — | — | — | No status interaction |
| 8  | dragon           | — | — | — | `melee_master` + `ranged_defense` but no status abilities |
| 9  | commander        | — | — | — | `castle_capturer` + `village_capturer` + `repairer` |
| 10 | skeleton         | POISONED (`poisoner`) | POISONED | — | UNDEAD → poison **heals** +10 HP at turn-start |
| 11 | crystal          | — | — | — | No status interaction (campaign target, move=0) |
| 12 | paladin          | — | — | — | `healer` but no status abilities |
| 13 | berserker        | — | — | — | `fighting_spirit` + `counter_storm` no status abilities |
| 14 | ghost            | — | — | **+20 vs status targets** | UNDEAD → poison **heals** +10 HP; `death_reaper` grants +20 dmg vs poisoned/blinded/weakened |
| 15 | dark_mage        | BLINDED (`blinder`) | BLINDED | — | BLINDED applied on each attack+counter |
| 16 | wolf_archer      | BLINDED (`blinder`) | BLINDED | — | Also has `sharpshooter`, `assault_troop`, `forest_child` |
| 17 | ice_elemental    | — | — | — | `self_repair` (+25% maxHP) partially mitigates poison |
| 18 | slime            | — | — | — | `self_repair` (+25% maxHP) partially mitigates poison; `magicDefense=-10` |
| 19 | mermaid          | — | — | — | No status interaction |
| 20 | druid            | INSPIRED (`attack_aura` radius 2, wait) | — | — | INSPIRED at wait; `supporter` resets ally actions |

## Summary: Status Interactions by Ability

| Ability              | Applies Status | Immune To | Source                     |
|----------------------|:--------------:|:---------:|----------------------------|
| `poisoner`           | POISONED       | POISONED  | Combat (attack+counter)    |
| `blinder`            | BLINDED        | BLINDED   | Combat (attack+counter)    |
| `attack_aura`        | INSPIRED       | —         | Wait (radius 2)            |
| `weakness_aura`      | WEAKENED       | WEAKENED  | Wait (radius 2)            |
| `cleansing_aura`     | Cleanses all harmful | —   | Wait (radius 2)            |
| `death_reaper`       | —             | —         | +20 dmg vs status targets  |

## Project vs APK Differences

| Aspect | APK | Project | Status |
|--------|-----|---------|--------|
| SUMMONER poison immunity | witch takes 0 damage from poison | witch takes -10 (same as all non-undead) | **Unimplemented** (`engine.ts:321`) |
| Poison HP logic | Non-undead: `hpDelta = -10` (override), Undead: `+=10` (additive) | Same | ✓ Match |
| INSPIRED duration (APK field `f1269H=0`) | 0 turns → expires same turn | `remainingTurns: 1` → decays to 0 at next turn-start | ✓ Equivalent |
| Move=1 when WEAKENED | `C0600q.m4252z` returns 1 | `abilities.ts:223` | ✓ Match |
| Temple cleanse (kind=5) | APK terrain kind=5 clears status (`tileClearsNegativeStatusAtTurnStart`) | Same | ✓ Match |
| GRIM_REAPER +20 | `f1274c` against harmful status targets | `rules.ts:42-44` | ✓ Match |
| Status application order | POISONED first, then BLINDED | `applyCombatStatusEffects` POISONED first | ✓ Match |
| Immunity by same ability | `poisoner` → poison immune, `blinder` → blind immune, `weakness_aura` → weaken immune | Same | ✓ Match |
| Aura only triggers on wait | Yes (`m4328c` in standby path) | `triggerAuras` called on wait only | ✓ Match |
| Aura does not overwrite different status | APK checks `!target.status` | `!u.status` check | ✓ Match |
