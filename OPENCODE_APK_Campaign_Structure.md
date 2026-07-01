# APK Campaign/Scenario Mode Structure

## Overview

The APK `aer-release-4.2.5.1` implements campaign and scenario modes as JavaScript-driven scripts executed by the Mozilla Rhino engine. Mod/campaign files are stored under `assets/mods/` and encrypted with DES/CBC/PKCS7.

## Mod Types

Enum `EnumC1254e` defines 3 mod types:

| Type | Code | Description | Instances |
|------|------|-------------|-----------|
| CAMPAIGN | `AEI` | Battle of Thorin Prequel | 7 stages |
| CAMPAIGN | `AEII` | Battle of Thorin | 8 stages |
| CAMPAIGN | `AEIII` | Battle of Thorin Finale | 7 stages |
| SKIRMISH | `SD` | Skirmish Default | N/A (shared controller.js) |
| SKIRMISH | `SO` | Skirmish Online | N/A (shared controller.js) |
| *Tutorial* | `TU` | Tutorial | 3 stages (type-less system mod) |

Source: `EnumC1254e.java` (CAMPAIGN, SKIRMISH, TRANSLATION), `C1253d.java` (mod descriptor with `code`/`type`/`name` fields).

## File Structure

Each mod directory (`assets/mods/<code>/`) contains:

```
assets/mods/<code>/
├── index.json        DES-encrypted ModDescriptor (C1253d)
├── scenario.json     DES-encrypted ScenarioDefinition (C1250a)
├── default.lang      Plaintext - scenario name, stage names, objectives, dialog strings
├── zh.lang           Plaintext - Chinese localization (optional)
├── s1.js             DES-encrypted stage script for stage 1
├── s1.aem            DES-encrypted map for stage 1
├── s2.js
├── s2.aem
├── ...
└── controller.js     DES-encrypted shared skirmish script (only for SD, SO)
```

### DES Encryption Details

| Property | Value | Source |
|----------|-------|--------|
| Cipher | `DES/CBC/PKCS7` | `C1242a.java`, `C1243b.java` |
| Key (hex) | `72 6b 00 00 00 00 46 46` → ASCII `rk\0\0\0\0FF` → **`FF7000A1`** | `C1242a.f2959a` |
| IV (hex) | Same as key | `apk_resource_crypto.ts` |
| Java class | `C1243b` (createDecipheriv/createCipheriv wrappers) | |

Note: The key bytes in source are `{70, 70, 55, 48, 48, 48, 65, 49}` = ASCII `"FF7000A1"`. The actual DES key used by `C1243b` differs — the project's `apk_resource_crypto.ts` uses `72 6b 00 00 00 00 46 46` which matches the working decryption.

### Binary Loading Flow

```
Game Start
  └─ C0656i.m4057o()
       ├─ data.bin decrypt → extract .mod files via C0656i.m4079a()
       ├─ C1280d.m2310a() → load system mods (embedded index.json in data.bin)
       └─ C1280d.m2309b() → load user mods from local storage

Scenario Select
  └─ AbstractC1246e → C1250a[] (all scenarios with stages)
       └─ C0664l.m4047a(C1253d) → read scenario.json → C1250a
            └─ C0601r.m4248a() (DES-decrypting deserializer)

Stage Start
  ├─ C0664l.m4036b(code, stageIdx) → s{idx}.aem FileHandle
  ├─ C0664l.m4030d(code, stageIdx) → s{idx}.js → InterfaceC0623c
  └─ C0621a (Rhino) evaluates script
       ├─ C0621a.m4193a() → evaluateReader(script, prototype)
       └─ C0577a.m4597a() → executes battle + hooks JS events
```

## Java Class Hierarchy

| Obfuscated | Purpose | Key Fields |
|------------|---------|------------|
| `C1253d` | Mod descriptor | `code` (e.g. "AEI"), `name`, `type` (EnumC1254e), `uid`, `username`, `system`, `installed`, `activated` |
| `C1250a` | Scenario definition | `difficulty` (int), `expanded` (boolean), `stages` (C1251b[]) |
| `C1251b` | Stage/mission definition | `ranked` (boolean=true), `teamsPlayer` (int[]), `teamsRobot` (int[]) |
| `C1257c` | Mod file entry | `f2985a` (filename), `f2986b` (encrypted byte[]) |
| `AbstractC1246e` | Abstract mod repository | `f2961a` (Map<String,C1253d>), `f2962b` (List<C1252c> skirmishes), `f2963c` (List<C1250a> scenarios) |
| `C0650e` | Concrete mod repository | Delegates `mo2413a` → `f1480d.f1493i.m4047a()` |
| `C0664l` | File I/O manager | `m4047a()` load scenario, `m4030d()` load script, `m4036b()` load map |
| `C1280d` | Mod serialization | `m2310a()` load system mods, `m2309b()` load user mods, `m2314a()` write mod |
| `C1242a` | Encryption key holder | `f2959a` = `{70,70,55,48,48,48,65,49}` |
| `C1243b` | DES operations | `m2423a()` CipherInputStream, `m2422a()` CipherOutputStream |
| `C0601r` | Serialization with crypto | `m4248a()` decrypt+deserialize, `m4247a()` serialize+encrypt |

### Scenario.json Binary Serialization (C1250a + C1251b)

From `C0573c`/`C0574d` I/O (confirmed by reading decrypted scenario.json):

```
[4 bytes: int difficulty]
[1 byte: boolean expanded]
[4 bytes: int stageCount]
  for each stage:
    [1 byte: boolean ranked]
    [4 bytes: int teamsPlayer[] length]
    [4 bytes * N: int[] teamsPlayer]          (1 = human player, 2 = robot)
    [4 bytes: int teamsRobot[] length]         (1 = human player, 2 = robot)
    [4 bytes * N: int[] teamsRobot]
```

Decoded example — AEI (7 stages, difficulty=1, expanded=false, all `ranked=true`):
- Stage 1: teamsPlayer=[1], teamsRobot=[2]
- Stage 2-7: teamsPlayer=[1], teamsRobot=[2, 4] (robot team 4 in later AEIII stages)

AEIII differs with multiple player teams and complex alliance configurations (e.g., s4 has teamsPlayer=[1,4], s6 has teamsPlayer=[1,4,5]).

## Stage Script Engine (Rhino JavaScript)

### Initialization

| Component | Class | Method |
|-----------|-------|--------|
| Rhino Context | `C0621a` | `m4189a(boolean optimized)` — creates thread-local Context |
| Evaluation | `C0621a` | `m4193a(InterfaceC0623c, Scriptable)` — evaluateReader |
| Function call | `C0621a` | `m4190a("functionName", args...)` — invoke JS function by name |
| Variable injection | `C0621a` | `m4191a("name", javaObject)` → Context.javaToJS → Scriptable.put |
| Variable check | `C0621a` | `m4192a("name")` → scope.get + null/NOT_FOUND check |
| Cleanup | `C0621a` | `m4186c()` → Context.exit, `m4194a()` → null prototypes |

### ScriptingTarget APIs (exposed to JavaScript)

| Annotation `@ScriptingTarget` | Class | Purpose |
|------------------------------|-------|---------|
| ✓ | `C0598o` **Stage** | Main game stage API (async queue + sync immediate methods) |
| ✓ | `C0628e` **Rule** | Game rule configuration (income, level cap) |
| ✓ | `C0629f` **Unit** | Unit wrapper (position, stats, abilities) |
| ✓ | `C0626c` **Position** | Position wrapper (x, y) |
| ✓ | `C0627d` **Reinforcement** | Builder for reinforcement descriptors |

### Required JavaScript Functions

Every stage script must define these functions (called by Java at specific points):

| Function | Called When | Typical Use |
|----------|------------|-------------|
| `OnCreateRule(rule)` | Game setup | Call `rule.SetIncome*()` to override default income |
| `OnGameStart()` | After map+units loaded | Configure gold, unit limit, recruit list, units, flags, dialog |
| `OnUnitRecruited(unit)` | Unit purchased | Apply level/dynamic unit changes |
| `OnUnitStandby(unit)` | Unit ends turn | Check position→trigger events, flag progress |
| `OnUnitDestroyed(unit)` | Unit killed | Check commander death→defeat, boss death→victory, count-mobs |
| `OnTileRepaired(x, y)` | Tile repaired | Flag progress tracking |
| `OnTileOccupied(x, y, oldTeam)` | Tile captured | Check castle occupation→victory, trigger enemy spawn |
| `OnTurnStart(turn)` | Start of each turn | Time limit check, periodic reinforcements, AoE judgment |
| `OnTeamDestroyed(team)` | Team eliminated | Check player death→defeat, alliance victory |
| `GetObjectives()` | UI query | Return array of objective IDs (from lang file) |

## Stage API Reference (C0598o)

### Async Methods (queued, executed in FIFO order via C0586f command queue)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `AsyncAttack(x, y, damage[, type])` | x, y, dmg, typeOrd | Direct damage at position |
| `AsyncCarryFlag(x1,y1,x2,y2,flagIdx[,carrierIdx,carrierTeam])` | CTF positions | CTF mode |
| `AsyncCarryUnit(x1,y1,unitIdx,team,x2,y2)` | Transport | Move unit via carrier |
| `AsyncChangeTile(x,y,tileIdx,team,changeType)` | Terrain | Transform tile (bridge→dust, etc.) |
| `AsyncChangeUnitHitPoint(x,y,delta)` | HP delta | Direct HP change |
| `AsyncChangeUnitTeam(x,y,team[,resetStatus])` | Convert | Change unit ownership |
| `AsyncCreateUnit(idx,team,x,y[,level,head,code])` | Spawn | Create new unit |
| `AsyncDestroyTile(x,y)` | Remove tile | Destroy destroyable tile |
| `AsyncDestroyUnit(x,y,showEffect)` | Kill | Destroy unit optionally with effect |
| `AsyncDivineJudgement(team,x,y,dmg,showEffect,...anims)` | AoE | Area damage targeting team or position |
| `AsyncLevelUp(x,y)` | Level | Level up unit at position |
| `AsyncMapFocus(x,y)` | Camera | Pan camera to position |
| `AsyncMessage(msgType,msgIdx)` | Dialog | Show story/instruction dialog from `default.lang` |
| `AsyncMoveOver(idx,team,level,x1,y1,x2,y2)` | Move+end | Move unit to dest, end its turn |
| `AsyncMoveUnit(x1,y1,x2,y2)` | Move | Simple unit move |
| `AsyncNextTurn()` | Turn | Advance to next turn |
| `AsyncReinforce(x,y, ...C0627d)` | Deploy | Deploy reinforcements at position |
| `AsyncRemoveUnit(x,y)` | Vanish | Remove unit without death effect |
| `AsyncShowObjectives()` | UI | Show objectives overlay |
| `AsyncStandbyUnit(x,y)` | Standby | Set unit to standby |
| `AsyncSummon(x,y,unitIdx,team,level)` | Summon | Summon unit at position |

### Sync Methods (immediate execution)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `SyncChangeGold(team, delta)` | Gold | Add/subtract team gold |
| `SyncDestroyTeam(team)` | Team | Eliminate entire team |
| `SyncDisableTeam(team)` | Team | Disable team (skips turns) |
| `SyncGameOver(alliance)` | Alliance | End game with winning alliance |
| `SyncOverrideMov(code,tileType,mov)` | Movement | Override unit's movement cost on tile type |
| `SyncRestoreTeam(team)` | Team | Re-enable disabled team |
| `SyncSetAlliance(team,alliance)` | Alliance | Set team's alliance |
| `SyncSetCommander(x,y)` | Unit | Designate unit as commander |
| `SyncSetCurrentTeam(team)` | Team | Force current active team |
| `SyncSetGold(amount)` | Gold | Set all teams/global gold |
| `SyncSetGoldForTeam(team,amount)` | Gold | Set specific team gold |
| `SyncSetRecruitUnits(...unitIndices)` | All teams | Set recruit list for all teams |
| `SyncSetRecruitUnitsForTeam(team, ...unitIndices)` | Per team | Set recruit list for specific team |
| `SyncSetUnitCode(x,y,code)` | Unit | Assign unique string code |
| `SyncSetUnitHead(x,y,headIdx)` | Unit | Set visual head/skin |
| `SyncSetUnitLevel(x,y,level)` | Unit | Set level (0-9) |
| `SyncSetUnitLimit(limit)` | All teams | Set unit cap for all teams |
| `SyncSetUnitLimitForTeam(team,limit)` | Per team | Set unit cap |
| `SyncSetUnitStatic(x,y,isStatic)` | Unit | Set immobile flag |
| `SyncSetUnitStaticWithCode(code,isStatic)` | Unit | Set immobile flag by code |
| `SyncSetUnitStatus(x,y,statusType,rounds,overwrite)` | Status | Apply status effect |
| `SyncSetUnitTargeted(x,y,isTargeted)` | Unit | Set targeted flag |
| `SyncSetUnitTargetedWithCode(code,isTargeted)` | Unit | Set targeted flag by code |

### Query Methods

| Method | Return | Description |
|--------|--------|-------------|
| `CheckCastle(x,y [,team])` | boolean | Tile is castle (optionally owned by team) |
| `CheckCommander(unit [,team])` | boolean | Unit is commander (optionally of team) |
| `CheckGameOver()` | boolean | Game over state set |
| `CheckPlayerTeam(team)` | boolean | Team is valid player team |
| `CheckTeamDestroyed(team)` | boolean | Team eliminated |
| `CheckVillage(x,y [,team])` | boolean | Tile is village (optionally owned by team) |
| `CountCastle(team)` | int | Number of castles owned by team |
| `CountUnit(team)` | int | Number of units owned by team |
| `CountVillage(team)` | int | Number of villages owned by team |
| `GetAliveAlliances()` | int[] | Active alliance IDs |
| `GetAlliance(team)` | int | Team's alliance ID |
| `GetBoolean(key, default)` | boolean | Persistent boolean storage |
| `GetInteger(key, default)` | int | Persistent integer storage |
| `GetCommander(team)` | C0629f | Commander unit for team (or null) |
| `GetCurrentGold()` | int | Current team gold |
| `GetCurrentTeam()` | int | Current active team (0-5) |
| `GetDistance(x1,y1,x2,y2)` | int | Manhattan distance |
| `GetGold(team)` | int | Team's gold |
| `GetTileTeam(x,y)` | int | Tile owner (or 4095=null, 4094=neutral) |
| `GetTileType(x,y)` | int | Tile type (0=regular, 1=mountain, 2=forest, 3=castle, 4=village, 5=temple) |
| `GetUnit(x,y)` or `GetUnit(code)` | C0629f | Unit at position or by code (or null) |
| `GetUnits(team)` | C0629f[] | All units of team |
| `GetMaxTeams()` | int | Always 6 |
| `PutBoolean(key, value)` | void | Persistent boolean storage (rejects keys starting with `#`) |
| `PutInteger(key, value)` | void | Persistent integer storage (rejects keys starting with `#`) |

### Constants

| Method | Returns | Value |
|--------|---------|-------|
| `ConstPlayerHuman()` | int | 1 |
| `ConstPlayerRobot()` | int | 2 |
| `ConstTeamNeutral()` | int | 4094 |
| `ConstTeamNull()` | int | 4095 |
| `ConstTileRegular()` | int | 0 |
| `ConstTileMountain()` | int | 1 |
| `ConstTileForest()` | int | 2 |
| `ConstTileCastle()` | int | 3 |
| `ConstTileVillage()` | int | 4 |
| `ConstTileTemple()` | int | 5 |

### Reinforcement Builder (C0627d)

```
Stage.CreateReinforcement(index, team, x, y)
    .Level(level)      // set level (0-9)
    .Head(headIdx)     // set visual head/skin index
    .Code(string)      // set unique code string
```

Returns a `C0627d` object passed to `Stage.AsyncReinforce()`.

## Campaign Structure by Mod

### AEI — Battle of Thorin Prequel (7 stages)

| Stage | Name | Gold | Limit | Income | Recruit | Teams | Victory Condition | Unique Mechanics |
|-------|------|------|-------|--------|---------|-------|-------------------|------------------|
| 1 | Regroup | 0 | 10 | 0 all | none | P0, R1(D→R) | Occupy castle with Galamar | Team 1 ambush on reaching coords |
| 2 | Friends & Enemies | 0 | 10 | default | 0-2 | P0, R1(D→R) | Occupy castle + recruit + scout | Dynamic objectives; wolf allies |
| 3 | Escort | 0 | 15 | 0 all | none | P0, R2 | Galamar+Element Chief reach castle | Bridge destroyed; escort NPC |
| 4 | Reinforcements | 300 | 15 | default | 0-5 | P0, R2 | Destroy all enemies | Catapult range; city betrayal dialog |
| 5 | Dragon Rescue | 800+100 | 20 | default | 0-7 | P0, R1 | Destroy enemy commander | Static dragons freed on commander death |
| 6 | Siege | 300 | 25 | default | 0-8 | P0, R2 | Destroy all enemies | Dragon allies |
| 7 | Final Assault | 300 | 30 | default | 0-8 | P0, R2 | Destroy all + capture castle | Saeth reveal; finale |

### AEII — Battle of Thorin (8 stages)

| Stage | Name | Gold | Limit | Recruit | Victory | Unique Mechanics |
|-------|------|------|-------|---------|---------|------------------|
| 1 | Temple of Courage | 0 | 10 | none | Destroy all, Galamar survive | Skeleton raiders; Crystal of Courage |
| 2 | Temple of Wisdom | 300 | 15 | 0-1 | Destroy all + occupy both castles | Crystal of Wisdom stolen |
| 3 | Forest of Mists | 0 | 30 | none | Galamar survive, clear forest | Team 1 disabled→restored; wolves+elementals |
| 4 | Temple of Life | 0 | 15 | 0-7 | Destroy all + occupy enemy castle | Protect Crystal; enemy destroys buildings |
| 5 | Pathway to Thorin | 0 | 15 | none | Galamar survive, deliver Crystal | Crystal unit +mov ovrd; team 1 ambush; escort |
| 6 | Gates of Thorin | 600 | 30 | 0-8 | Occupy enemy castle + destroy all | Large battle |
| 7 | Outside City | 300 | 40 | 0-8 | Escort Crystal + defeat commander | Dragon attacks Crystal; Valadorn reinforcement |
| 8 | Ancient Citadel | 800+200 | 30 | 0-8 | Defeat Saeth | Boss fight; Saeth Lv4 static; turn-2 Divine Judgement (60 AoE); Heaven's Fury |

### AEIII — Battle of Thorin Finale (7 stages)

| Stage | Name | Gold | Limit | Alliances | Recruit | Victory | Unique Mechanics |
|-------|------|------|-------|-----------|---------|---------|------------------|
| 1 | Return to Citadel | 0 | 10 | - | none | Destroy all, Galamar survive | Crystals missing; team 5(D) |
| 2 | Temple of Life | 500 | 50 | - | P0:0-8,12; P4:0-8 | Reach temple or defeat all | Paladin squad ally; enemy transfers crystal |
| 3 | Only Cold Steel | 800 | 30 | - | P0:1,2,5,6,7,12 | Defeat clan leader (team 3), G+V survive | No magic challenge; Berserker clan ally |
| 4 | Uncharted Water | 500 | 50 | T5→5 | P0:0,1,3-7,12,13; T5:1,2,3,4,12,14,17,19 | Occupy castle + defeat enemy | Ice Chief ally conversion; mermaid join; incomeVillage=100; T4/T5(D→R) |
| 5 | Gates of Death | 400 | 50 | - | P0:0-8,12,13,17,19; T4:0,1,3,14,18 | G or V reach north exit | Undead army; Druid clan ally; T4 allied |
| 6 | Breakthrough | 500 | 50 | T1-5→2 | P0:0-8,12,13,16,17,19,20; T1,T4,T5 have own | Defeat demon lord (dl1/2/3), G+V survive | Turn 64 limit; periodic T3 reinf; 3 bosses |
| 7 | The Armageddon | 500 | 60 | T0→1, T1-5→2 | P0:0-8,12,13,16,17,19,20; T4,T5 have own | Defeat Saeth, G+V survive | Saeth boss (Lv8, 3 shields); AoE turn-start 60 dmg; T3 minion spawn when player in zone |

### TU — Tutorial (3 stages)

| Stage | Name | Gold | Limit | Recruit | Lesson |
|-------|------|------|-------|---------|--------|
| 1 | Move & Attack | 0 | 10 | none | Selecting units, movement, attacking, ending turn |
| 2 | Repair, Occupy & Recruit | 450 | 15 | 0-1 | Capturing buildings, repairing ruins, recruiting units, income |
| 3 | Prepare for Battle! | 500 | 20 | 0-3 | Element affinities (physical/magic), advanced units (element, sorceress) |

### SD / SO — Skirmish

| Mod | Script | Gold | Limit | Recruit | Unique |
|-----|--------|------|-------|---------|--------|
| SD | controller.js | default | default | default | OnTeamDestroyed → validate winner alliance |
| SO | controller.js | default | default | 0-8 | Sets recruit list for all teams (9 unit types) |

## Campaign Mechanics Catalog

### 1. Victory Conditions (83 `SyncGameOver` calls total)

| Pattern | Scripts | Detection | Implementation |
|---------|---------|-----------|----------------|
| Occupy castle | AEI s1,s3; AEIII s4 | `OnTileOccupied` + `CountCastle(team)==N` | `Stage.SyncGameOver(winningAlliance)` |
| Destroy all enemies | AEI s2,s4,s6,s7; AEII s2,s4,s6; TU all | `OnUnitDestroyed` + `CountUnit(team)==0` | `Stage.SyncGameOver(alliance)` |
| Kill commander | AEII s1; AEIII s3 | `OnUnitDestroyed` + `CheckCommander(unit,enemyTeam)` | `Stage.SyncGameOver(playerAlliance)` |
| Kill boss/NPC | AEI s5; AEII s8; AEIII s6,s7 | `OnUnitDestroyed` + `unit.GetCode()=='boss_code'` | Dialog + SyncGameOver |
| Dynamic objectives | AEI s2; AEIII s4 | `GetObjectives()` returns different array based on flags | Two-phase win conditions |
| Turn time limit | AEIII s6 | `OnTurnStart(turn>64)` → `SyncGameOver(2)` | Defeat if exceed turn limit |

### 2. Ambush / Reinforcement Patterns

| Pattern | Script | Trigger | Effect |
|---------|--------|---------|--------|
| Coordinate-triggered | AEI s1 | Unit at `x>=1 && y>=5` | Restore team 1, reinforce 3 skeleton raiders |
| Progress-triggered | AEI s2 | Unit reaches `y<=9` (scout), `y<=5` (report) | Scout dialog, report→restore team+reinforce |
| Turn-based periodic | AEII s8 | Turn%2==0 | Divine Judgment 60 AoE damage on team 0 |
| Turn-based periodic | AEIII s6 | Turn%12==0 (turn>0) | Reinforce team 3 at 3 positions |
| Trigger-zone | AEIII s7 | Player unit in zone 3-9x,6-12y | Restore team 3, reinforce 4 minions |
| Timeout auto-trigger | AEIII s4 | Turn>7 without occupying castle | Auto-trigger Occupy() (enemy attack begins) |

### 3. Persistent State Tracking

| Pattern | Scripts | Storage | Example |
|---------|---------|---------|---------|
| Boolean flags | Most scripts | `PutBoolean/GetBoolean` | `'reinforced'`, `'moved'`, `'scouted'`, `'reported'` |
| Integer counters | TU s2 | `PutInteger/GetInteger` | `'occupied_castle'`, `'repaired_village_left'` |
| Unit codes | Scripts with static/NPC units | `SyncSetUnitCode` | `'element_chief'`, `'galamar'`, `'saeth'`, `'crystal'` |
| Targeted flags | AEIII s6,s7 | `SyncSetUnitTargetedWithCode` | Highlight Galamar/Valadorn as critical NPCs |

### 4. Terrain Manipulation

| Type | Script | API | Effect |
|------|--------|-----|--------|
| Bridge destruction | AEI s3 | `AsyncChangeTile(x,y,0,-1,2)` | Convert tile to regular terrain with dust effect |
| Area destruction | AEIII s7 | `AsyncDestroyTile(5,11)` etc. | Opening cutscene terrain removal |
| Terrain armor | AEIII s4 | `SyncOverrideMov('g1',0,1)` | Guard units: movement cost 1 on regular (vs default) |

### 5. Alliance & Team Management

| Scenario | Setups | Description |
|----------|--------|-------------|
| AEIII s4 | T0 alone, T5 alone (initial), later T4+T5 disabled | Player captures castle → T5 restored as enemy |
| AEIII s6 | T1-5 all alliance 2 vs T0 alliance 1 | 5 enemy teams allied; T3 disabled→periodic restore |
| AEIII s7 | T0 alliance 1, T1-5 alliance 2 | 5 teams vs player; T3 periodic spawns |
| Ice Chief ally | AEIII s4 | Defeat `i_chief` → all 12 ice elementals change to team 0 |

### 6. Side Objectives / Optional Content

| Script | Objective | Reward |
|--------|-----------|--------|
| AEIII s4 | Defeat Ice Elemental Chief | 12 Ice elementals convert to player team |
| AEIII s4 | Occupy lakeside island | Mermaid units join player (3x Lv3) |

### 7. Unit Index Mapping

The integer indices in `CreateReinforcement`, `SyncSetRecruitUnits`, etc. map to unit definitions:

| Index | Unit | Index | Unit | Index | Unit |
|-------|------|-------|------|-------|------|
| 0 | Soldier | 7 | Paladin | 14 | Guard |
| 1 | Archer | 8 | Wolfarcher | 15 | Guard |
| 2 | Cavalry | 9 | King/Commander | 16 | Biondotta |
| 3 | Commander | 10-11 | (unused) | 17 | Assault |
| 4 | Element | 12 | Ice Elemental | 18 | Berserker |
| 5 | Sorceress | 13 | Mermaid | 19 | Pirate |
| 6 | Dragon | | | 20 | Ninja |

### 8. Income Configuration

| Configuration | Scripts Using It | Effect |
|--------------|-----------------|--------|
| All income = 0 | AEI s1,s3; AEII s1,s3,s5; AEIII s1; TU s1 | Forced progression, no economic play |
| IncomeVillage=100 | AEIII s4 | Increased economic reward |
| Default income | All other scripts | Uses RuleData defaults (castle=100, village=50, commBase=50, commGrowth=25) |

### 9. Turn-Action Patterns

| Action | Epic Count |
|--------|-----------|
| AsyncMessage (dialog) | 187 calls |
| CreateReinforcement | 162 calls |
| SyncGameOver | 83 calls |
| AsyncMapFocus (camera) | 67 calls |
| SyncSetUnitStaticWithCode | 57 calls |
| PutBoolean | 44 calls |
| SyncSetUnitCode | 40 calls |
| SyncSetUnitLevel | 35 calls |
| CountUnit | 25 calls |
| SyncSetUnitLimit | 25 calls |

## Key Source Files

| File | Description |
|------|-------------|
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p040a\C0598o.java` | Stage API (906 lines) |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p040a\p045w\C0621a.java` | Rhino JS engine wrapper (107 lines) |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p040a\p046x\C0628e.java` | Rule API |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p040a\p046x\C0629f.java` | Unit API |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p049b\C0664l.java` | File I/O manager (319 lines) |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p062h\C1250a.java` | ScenarioDefinition |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p062h\C1251b.java` | StageDefinition |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p062h\C1253d.java` | ModDescriptor |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p062h\EnumC1254e.java` | ModType enum |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p063i\C1257c.java` | ModFileEntry |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\AbstractC1246e.java` | Abstract mod repository |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\C1242a.java` | Encryption key |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\C1243b.java` | DES encryption |
| `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\p061c\p065k\C1280d.java` | Mod serialization |
| `C:\code\AncinetEmpires\tools\apk_resource_crypto.ts` | Project decryption utility |
| `C:\code\AncinetEmpires\tools\apk_script_report.ts` | Script analysis tool (799 lines) |

## Decrypted Scripts Available To Inspect

All 27 mod JS files are decryptable using `npm run apk:script-report -- --json`. Individual scripts can be read with:

```typescript
import { decryptApkResourceBytes } from './tools/apk_resource_crypto';
import { readFile } from 'node:fs/promises';
const encrypted = await readFile('APK/_analysis/unpack/assets/mods/AEI/s1.js');
const decrypted = decryptApkResourceBytes(encrypted);
console.log(decrypted.toString('utf8'));
```

The campaign `.lang` files are plaintext and contain all stage names, objectives, and dialog in `APK\_analysis\unpack\assets\mods\<code>\default.lang`.
