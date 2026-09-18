# Campaign-AI Training Alignment Analysis

## Overview

Maps all 27 decrypted APK campaign/tutorial/skirmish scripts against the project's existing AI training pipeline (`GameEngine` + `AncientEmpiresEnv`). Documents which campaign mechanics are already handled, which belong to the story/presentation layer (excluded), and which gaps matter for training.

## Current Training Pipeline

```
ApkSkirmishTrainingScenario       AncientEmpiresEnv
  ├─ mode: SD | SO                  ├─ GameEngine (step/turn loop)
  ├─ mapName: string                ├─ maxPlies (default 1000)
  └─ rules: RuleConfig              └─ getObservation()
       ├─ initialGold                     → GameState (mutated in-place)
       ├─ unitLimit                       → action mask
       ├─ recruitList                     → legal actions
       ├─ alliances                       → turn rotation
       └─ disabledTeams                   → win condition
```

Training uses only **skirmish modes** (`SD` / `SO`). Campaign scripts (`AEI`, `AEII`, `AEIII`, `TU`) provide static literal configs via `apk_script_manifest.ts` → `apk_script_config.ts` but their **event-driven mid-game logic is excluded**.

## Implemented APIs (Sync* + Queries + Storage)

These are fully implemented in `src/game/apk_stage.ts` (603 lines) and correctly applied:

| Category | APIs | Calls in Scripts | Training Relevance |
|----------|------|-----------------|-------------------|
| Gold | `syncSetGold`, `syncSetGoldForTeam`, `syncChangeGold` | 20 | ✅ Critical - income & starting gold |
| Units | `syncSetUnitCode`, `syncSetUnitLevel`, `syncSetUnitStatic`, `syncSetUnitStaticWithCode`, `syncSetUnitHead`, `syncSetUnitTargeted`, `syncSetUnitTargetedWithCode` | 155 | ✅ Critical - static NPCs, targeted flags, level config |
| Status | `syncSetUnitStatus` | 1 | ✅ Used (e.g., Saeth inspired buff) |
| Movement | `syncOverrideMov` | 9 | ✅ Used (crystal escort, guard units) |
| Teams | `syncDisableTeam`, `syncRestoreTeam`, `syncDestroyTeam`, `syncSetAlliance`, `syncSetCurrentTeam` | 39 | ✅ Critical - alliance networks, ambush teams |
| Rules | `syncSetUnitLimit`, `syncSetUnitLimitForTeam`, `syncSetRecruitUnits`, `syncSetRecruitUnitsForTeam` | 52 | ✅ Critical - recruitment availability |
| Commander | `syncSetCommander` | 2 | ✅ Used (Saeth, demon lords) |
| Queries | `countUnit`, `countCastle`, `countVillage`, `getUnit`, `getUnits`, `getTileTeam`, `checkCastle`, `checkCommander`, `checkGameOver`, `checkPlayerTeam`, `getCurrentTeam`, `getAliveAlliances`, `getDistance` | 84 | ✅ Critical - all available |
| Storage | `putBoolean`, `getBoolean`, `putInteger`, `getInteger` | 111 | ✅ Critical - persistent flags |
| Rule config | `rule.SetIncome*`, `rule.SetLevelCap` | 29 | ✅ Fully applied via script config |

**Total implemented: 30/56 Stage APIs (54%), covering ~500/845 total calls (59%)**

## Excluded APIs (Async/Story Layer - Not Implemented)

These are explicitly documented as "属于剧情/演出层，不在对战规则引擎中执行" (belong to story/presentation layer, not executed in battle rule engine):

| API | Calls | Reason for Exclusion | Would Affect Training? |
|-----|-------|---------------------|----------------------|
| `AsyncMessage` | 187 | Dialog/story text | No - narrative only |
| `AsyncMapFocus` | 67 | Camera pan | No - visual only |
| `CreateReinforcement` | 162 | Builder used by AsyncReinforce | ⚠️ If Reinforcement ever implemented |
| `AsyncReinforce` | 51 | Deploy units mid-game | **YES** - dynamic unit spawning |
| `AsyncDestroyUnit` | 16 | Kill unit with/without effect | **YES** - scripted unit death |
| `AsyncDestroyTile` | 5 | Remove terrain | Minimal - terrain destruction is rare |
| `AsyncMoveUnit` | 13 | Scripted unit movement | **YES** - cutscene-style repositioning |
| `AsyncRemoveUnit` | 8 | Vanish unit | **YES** - scripted unit removal |
| `AsyncAttack` | 3 | Direct damage | **YES** - scripted combat |
| `AsyncDivineJudgement` | 5 | AoE damage | **YES** - turn-start AoE in AEIII boss fights |
| `AsyncChangeTile` | 6 | Terrain transformation | Minimal - bridge destruction etc. |
| `AsyncChangeUnitTeam` | 5 | Convert unit ownership | **YES** - ally conversion events |
| `AsyncChangeUnitHitPoint` | 1 | Direct HP change | **YES** - scripted healing/damage |
| `AsyncCreateUnit` | 2 | Spawn unit | **YES** - unit creation |
| `AsyncSummon` | 1 | Summon unit | **YES** - scripted summon |
| `AsyncLevelUp` | 0* | Level up unit | Minimal |
| `AsyncCarryFlag` | 2 | CTF mode | No - unrelated mode |
| `AsyncCarryUnit` | 1 | Transport unit | Minimal |
| `AsyncMoveOver` | 1 | Move+standby | **YES** - forced reposition |
| `AsyncNextTurn` | 2 | Advance turn | **YES** - forced turn advance |
| `AsyncShowObjectives` | 3 | UI overlay | No - visual only |
| `AsyncStandbyUnit` | 0* | Set standby | Minimal |

*API exists in Stage (C0598o) but not called in any script.

**Total excluded: 22 APIs (~345 calls, 41% of total)**

## Campiagn Mechanics: Training Gaps

### Gap 1: Mid-Game Rule Changes (HIGH)

Campaign scripts dynamically change game state mid-battle via JavaScript event callbacks. The training pipeline has **no mechanism** to execute these callbacks.

**Examples from decrypted scripts:**

| Script | Trigger | Effect | Mechanism |
|--------|---------|--------|-----------|
| `AEI/s1.js` | `OnUnitStandby` at x≥1,y≥5 | Restore team 1, reinforce 3 units | `SyncRestoreTeam` + `AsyncReinforce` |
| `AEI/s3.js` | `OnTileOccupied` at castle | Victory if `CountCastle(0)==1` | `SyncGameOver` |
| `AEII/s8.js` | `OnTurnStart` turn%2==0 | 60 AoE damage to player team | `AsyncDivineJudgement` |
| `AEIII/s4.js` | `OnUnitDestroyed` (i_chief) | Convert 12 ice units to player team | `AsyncChangeUnitTeam` + `SyncDisableTeam` |
| `AEIII/s6.js` | `OnTurnStart` turn%12==0 | Spawn 3 units at fixed positions | `AsyncReinforce` helper function |
| `AEIII/s7.js` | `OnTurnStart` when player in zone | Spawn 4 minions, restore team 3 | `AsyncReinforce` + `SyncRestoreTeam` |
| `AEI/s2.js` | `OnUnitStandby` at y≤5 | Restore team 1 + reinforce 5 units | Trigger-based difficulty ramp |

**Training impact:** The AI never experiences ambushes, reinforcements, mid-game ally conversions, or periodic AoE attacks. This creates a significant sim-to-real gap if the goal is to train on campaign-like scenarios.

### Gap 2: Event-Driven Callbacks (MEDIUM)

Campaign scripts define 10 JavaScript functions called by the Java engine at specific game events:

| Callback | Frequency in Scripts | Implemented in Engine |
|----------|---------------------|----------------------|
| `OnCreateRule(rule)` | 25/27 scripts | ✅ Via static config only |
| `OnGameStart()` | 25/27 scripts | ✅ Via static config only |
| `OnUnitRecruited(unit)` | 25/27 scripts (empty bodies) | ❌ Not called |
| `OnUnitStandby(unit)` | 25/27 scripts | ❌ Not called |
| `OnUnitDestroyed(unit)` | 25/27 scripts | ❌ Not called |
| `OnTileRepaired(x,y)` | 25/27 scripts (empty bodies) | ❌ Not called |
| `OnTileOccupied(x,y,oldTeam)` | 25/27 scripts | ❌ Not called |
| `OnTurnStart(turn)` | 25/27 scripts | ❌ Not called |
| `OnTeamDestroyed(team)` | 25/27 scripts | ❌ Not called |
| `GetObjectives()` | 25/27 scripts | ❌ Not called |

**Training impact:** The engine already handles win/loss detection internally (via `checkWinConditions()`). The callbacks that trigger mid-game changes (reinforcements, alliance changes, AoE damage) are what's missing, not the callbacks themselves.

### Gap 3: Turn Time Limits (LOW)

Only 1 script (`AEIII/s6.js`) uses a turn limit:
```javascript
function OnTurnStart(turn) {
    if (turn > 64) {
        Stage.SyncGameOver(2);  // defeat if exceed 64 turns
    }
}
```

The env already has `maxPlies` (default 1000), which serves a similar purpose of preventing infinite games. Campaign-style turn limits could be added as a **training scenario option** but are not critical.

### Gap 4: Variable Team Counts & Alliances (HIGH - Already Handled)

Campaign scripts demonstrate extensive use of multi-team alliances:

| Script | Player Team(s) | Enemy Teams | Allies | Disabled→Restored |
|--------|---------------|-------------|--------|-------------------|
| AEI s1-s7 | 0 | 1,2 | Player alone | Team 1 ambush |
| AEII s1-s8 | 0 | 1,2 | Player alone | Team 1 ambush |
| AEIII s3 | 0 | 2,3 | Player alone | - |
| AEIII s4 | 0 | 4,5 (T5 initial enemy) | - | T4, T5 disabled→restored |
| AEIII s6 | 0 | 1,2,3,4,5 (all alliance 2) | Player alone | T3 periodic restore |
| AEIII s7 | 0 | 1,2,3,4,5 (all alliance 2) | Player alone | T3 zone-triggered restore |

**Status: ✅ Already implemented.** The `apk_skirmish.ts` system handles multi-team scenarios via the `RuleConfig` properties (`alliances`, `disabledTeams`, per-team `recruitableUnits`). Campaign AEIII s6/s7 alliance configurations are already captured in the literal configs.

### Gap 5: Dynamic Objective Changes (LOW)

Two scripts (`AEI/s2.js`, `AEIII/s4.js`) have `GetObjectives()` returning different arrays based on persistent flags:
```javascript
function GetObjectives() {
    if (Stage.GetBoolean('reported', false)) {
        return OBJECTIVES_2;  // secondary objective after trigger
    } else {
        return OBJECTIVES_1;  // initial objective
    }
}
```

**Training impact:** Not relevant - training uses a single reward function (win/loss/timeout), not objective tracking.

### Gap 6: Reinforcement Spawning (HIGH IF campaign training needed)

The single largest gap for campaign-like training: **51 `AsyncReinforce` calls** and **162 `CreateReinforcement` calls** across all scripts create dynamic unit spawning patterns:

**Spawn trigger distribution:**
| Trigger Type | Scripts | Count |
|-------------|---------|-------|
| Turn-based (periodic) | AEII s8, AEIII s6, AEIII s7 | ~20 calls |
| Position-based (player reaches area) | AEI s1, s2, AEII s3 | ~15 calls |
| Event-based (unit killed, tile occupied) | AEI s5, AEIII s4, s7 | ~10 calls |
| Game start (initial deployment) | AEIII s4, s6, s7 | ~6 calls |

Skirmish mode avoids this issue entirely - all units deploy at game start.

## Script Dependency Graph

```
Campaign                        Skirmish (SD/SO)
    │                                │
    ├─ OnCreateRule→Rule API         ├─ controller.js (empty OnCreateRule)
    ├─ OnGameStart→Stage API         ├─ controller.js (empty OnGameStart)
    │   ├─ Sync* (implemented)       ├─ OnUnitDestroyed→ValidateTeamState
    │   └─ Async* (NOT implemented)  └─ OnTileOccupied→ValidateTeamState
    ├─ Event Callbacks               └─ OnTeamDestroyed→ValidateWinningState
    │   ├─ OnUnitDestroyed→
    │   │   SyncGameOver (boss/NPC)
    │   ├─ OnTurnStart→
    │   │   SyncGameOver (time limit)
    │   │   AsyncDivineJudgement
    │   │   AsyncReinforce (waves)
    │   ├─ OnUnitStandby→
    │   │   AsyncReinforce (trigger)
    │   └─ OnTileOccupied→
    │       SyncGameOver (castle win)
    └─ GetObjectives→objective IDs
```

The skirmish controller.js is significantly simpler - it only handles `OnUnitDestroyed`, `OnTileOccupied`, and `OnTeamDestroyed` to validate team/wins states. All other callbacks are empty.

## Verdict Per Component

| Component | Campaign Uses | Implemented | Gaps |
|-----------|---------------|-------------|------|
| Static script config (gold, limit, income, alliances, disabled teams, recruit list) | 24/27 scripts | ✅ Fully | None |
| Unit config (level, code, static, head, targeted, movement overrides) | 20/27 scripts | ✅ Fully | None |
| Status effects via scripts | 1 script | ✅ Fully | None |
| Boolean/Integer storage | 18/27 scripts | ✅ Fully | None |
| Skirmish win validation (destroy all enemies + castles) | All skirmish | ✅ Fully | None |
| Commander defeat detection | All scripts | ✅ Fully | None |
| Team destroy/restore/alliance mid-game | 12/27 scripts | ✅ Fully | Can apply at game start only |
| Turn-based periodic events (waves, AoE) | 3 scripts | ❌ | **GAP** - No mid-game event loop |
| Reinforcement/unit spawning mid-game | 15/27 scripts | ❌ | **GAP** - No unit creation mid-game |
| Scripted combat (AsyncAttack, DivineJudgement) | 5 scripts | ❌ | **GAP** - No scripted damage mid-game |
| Dialogue/story presentation | 25/27 scripts | ❌ (intentional) | Not needed for training |
| Replay/action logging | Not in APK | ❌ | Not available in APK either |
| Turn time limits | 1 script | ❌ | `maxPlies` in env already covers this |
| Dynamic objectives | 2 scripts | ❌ (intentional) | Training uses simple win/loss |

## Recommendations for Training on Campaign Patterns

### If the goal is skirmish-only training (SD/SO):

**No changes needed** ✅. The current pipeline correctly handles all skirmish-mode mechanics. Campaign scripts contribute static rule configs (income, gold, alliances, disabled teams) that are already extracted and applied.

### If the goal is campaign-like training scenarios:

**Priority changes (in order of impact):**

1. **Add `reinforcements` field to `RuleConfig`** — a static list of `{ turn: number, unitClass: string, x: number, y: number, teamId: number }[]` that the engine checks in `startTurnForPlayer()`. This handles the **most common** campaign pattern (turn-based periodic waves) without needing a full JS runtime.
   - Covers: AEII s8 (Divine Judgement), AEIII s6 (every 12 turns), AEIII s7 (Saeth turn-start)

2. **Add `checkApkScriptEvent(gameState, eventType, ...args)` hook in `engine.ts`** — a simple function that fires at key game events (unit destroyed, tile occupied, unit standby, turn start) and checks a static `eventHandlers[]` config.
   - This allows defining campaign-like behaviors in TypeScript without Rhino.
   - Covers: ambush triggers, ally conversion, boss-death-victory, zone-based spawns

3. **Direct reinforcement on game start (already possible via RuleConfig)** — Additional pre-placed units on the map via initial state configuration.

### If the goal is campaign performance benchmarking:

**No changes needed.** The 27 decrypted scripts provide the complete ground truth for what campaign scripts do. Training agents on existing skirmish scenarios with extracted rule configs already covers the same **state configurations** that campaigns use, just without the event-driven mid-game changes.

## Training vs Original APK: Data Flow Comparison

```
APK Java Runtime:                        Project Training Pipeline:
─────────────────                        ────────────────────────
data.bin → mods/*.mod                    data.bin → mods/*.mod (extracted)
  → decrypt scenario.json                  → apk_script_manifest.ts (extracted literals)
  → decrypt sN.js                          → apk_script_config.ts (build RuleConfig)
  → C0621a (Rhino)                         → apk_skirmish.ts (create env)
  → C0598o (Stage API)                     → apk_stage.ts (Stage API subset)
  → C0577a (battle runner)                 → AncientEmpiresEnv
      ↓                                      ↓
  JS callbacks fire on events             No callback system
  AsyncReinforce spawns units             No mid-game spawn
  SyncGameOver detects win/loss           Engine checkWinConditions()
  AsyncDivineJudgement damages            No scripted damage
  Turn limit in OnTurnStart               maxPlies in env
```

## Key Source Files Referenced

| File | Role |
|------|------|
| `src/game/apk_stage.ts` | 603 lines - all sync/query/storage APIs |
| `src/game/apk_script_config.ts` | 228 lines - build+apply config to state |
| `src/game/apk_script_manifest.ts` | 514 lines - static literal configs + call counts |
| `src/game/apk_skirmish.ts` | 317 lines - training scenario builder |
| `src/game/env.ts` | 1081 lines - RL environment |
| `src/game/engine.ts` | 881 lines - core game engine |
| `src/game/rule_config.ts` | 289 lines - RuleConfig merge + defaults |
| `src/game/types.ts` | 188 lines - type definitions |
