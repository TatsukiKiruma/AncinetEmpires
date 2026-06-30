import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMoveCostTo, getReachablePositions } from '../src/game/map';
import { GameEngine } from '../src/game/engine';
import { calculateDamage, getLegalActions } from '../src/game/rules';
import type { Action, GameState, Unit, UnitClass } from '../src/game/types';
import { APK_RELEASE_VERSION } from '../src/game/apk_manifest';

interface CliOptions {
    langPath: string;
    json: boolean;
    check: boolean;
}

type CheckStatus = 'pass' | 'fail';

export interface ApkLanguageRuleCheck {
    id: string;
    title: string;
    source: string;
    expected: unknown;
    actual: unknown;
    status: CheckStatus;
}

export interface ApkLanguageRuleReport {
    apkVersion: string;
    langPath: string;
    checkCount: number;
    failedCheckCount: number;
    checks: ApkLanguageRuleCheck[];
}

const DEFAULT_LANG_PATH = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack', 'assets', 'languages', 'en.lang');

const REQUIRED_LANGUAGE_ENTRIES = {
    P_ABILITY3_DESCRIPTION_0: 'Units with this ability can capture villages.',
    P_ABILITY3_DESCRIPTION_1: 'Units with this ability can capture castles, but cannot be supported by supporters.',
    P_ABILITY3_DESCRIPTION_2: 'Units with this ability can repair destroyed villages.',
    P_ABILITY3_DESCRIPTION_3: 'Air forces can move through all terrains using only 1 movement point. They can also move through ground units, but they cannot receive terrain defence bonus. They gain 10 attack bonus against units in water (does not work on units with same ability).',
    P_ABILITY3_DESCRIPTION_4: 'Marksman gains 10 attack bonus against air forces.',
    P_ABILITY3_DESCRIPTION_5: 'Destroyers can destroy villages, they also gain 10 attack bonus against units standing on villages.',
    P_ABILITY3_DESCRIPTION_6: 'Summoners can summon skeletons from tombstones, also they won lose HP when destroying tombstones.',
    P_ABILITY3_DESCRIPTION_7: "Healers can heal allies, their healing increases as they level up. Healer's heal can exceed target's max HP.",
    P_ABILITY3_DESCRIPTION_8: 'Poisoners can poison enemies with their attacks, does not work if enemy also has this ability.',
    P_ABILITY3_DESCRIPTION_9: "Undead units won't create tombstones when they die. Ally's heal will become damage to them, but they will gain HP when destroying tombstones and poison damage will become heal to them.",
    P_ABILITY3_DESCRIPTION_10: 'Melee masters do 50% more damage with melee attacks.',
    P_ABILITY3_DESCRIPTION_11: 'Ranged defenders receive 50% less damage from ranged attacks.',
    P_ABILITY3_DESCRIPTION_12: 'Sons of water gains 10 bonus attack/defence and get healed at turn start when on water, they can also move through water terrains using 1 movement point.',
    P_ABILITY3_DESCRIPTION_13: 'Sons of forest gains 10 bonus attack/defence and get healed at turn start when in forest, they can also move through forest terrains using 1 movement point.',
    P_ABILITY3_DESCRIPTION_14: 'Sons of mountain gains 10 bonus attack/defence and get healed at turn start when on mountain, they can also move through mountain terrains using 1 movement point.',
    P_ABILITY3_DESCRIPTION_15: "For units who are bloodthirsty, their attack damage won't be affected by current HP.",
    P_ABILITY3_DESCRIPTION_16: 'For units who have this ability, they can counter attack within range 2 regardless of their attack range.',
    P_ABILITY3_DESCRIPTION_17: 'For self-repair units they gain 25% HP recovery at turn start, regardless of being poisoned or not.',
    P_ABILITY3_DESCRIPTION_18: 'For units with attack aura, they will attach inspired status to allies on standby within range 2.',
    P_ABILITY3_DESCRIPTION_19: 'For units with cleansing aura, they will remove negative status from allies and heal them for a small amount on standby within range 2.',
    P_ABILITY3_DESCRIPTION_20: 'For units with weakening aura, they will attach weakened status to enemies on standby with range 2.',
    P_ABILITY3_DESCRIPTION_21: 'Assault forces can use remaining movement points to move again after action, but cannot be supported by supporters.',
    P_ABILITY3_DESCRIPTION_22: 'Sons of land can move through all land terrains using only 1 movement point, but they will have to use 1 more movement point to move through water terrains (bridges are water terrains).',
    P_ABILITY3_DESCRIPTION_23: 'Units with blinding attack will attach blinded status to enemies with their attacks, does not work if enemy also has this ability.',
    P_ABILITY3_DESCRIPTION_24: 'Supporters can support allies by reset them from standby state to let them act one more time, does not work if target has same ability or has higher level than self.',
    P_ABILITY3_DESCRIPTION_25: 'Grim Reapers gain 20 attack bonus when attacking units with negative status.',
    P_STATUS3_DESCRIPTION_1: 'Units who have been poisoned will lose 10 HP at turn start and cannot receive heal.',
    P_STATUS3_DESCRIPTION_2: 'For units who have been inspired, their gain 10 attack bonus (halved for ranged attacks).',
    P_STATUS3_DESCRIPTION_3: 'For units who have been blinded, their attack range will be reduced to 0.',
    P_STATUS3_DESCRIPTION_4: 'For units who have been weakened, their movement points will be reduced to 1 and defence will be reduced by 10 (halved against ranged attacks).',
    P_TILE_CASTLE_DESCRIPTION: 'Can generate income at turn start, can recruit new units when no unit is standing on it except your own commander.',
    P_TILE_RUIN_DESCRIPTION: 'Can be repaired.',
    P_TILE_TEMPLE_DESCRIPTION: 'Clears negative status at turn start.',
    P_TILE_VILLAGE_DESCRIPTION: 'Can generate income at turn start, can be destroyed.',
    P_WIKI_BATTLE_BASICS_4_L2: "There are two 2 element types in this game: physical & magic. Each unit has one specific element type, and it's attack will be using this element type.",
    P_WIKI_BATTLE_BASICS_4_L3: "Each unit also has it's own element affinity value. Generally speaking, the higher the affinity the higher defence they have against same elements, but the lower defence against different elements.",
    P_WIKI_BATTLE_BASICS_L4: 'Damage calculation here is very simple. Generally speaking the final damage equals to:',
    P_WIKI_BATTLE_BASICS_L5: '(ATK - DEF) * HP%',
    P_WIKI_INCOME_RECRUIT_L1: 'First thing first, to defeat enemies you need troops. You can recruit troops from castles which will cost gold.',
    P_WIKI_INCOME_RECRUIT_L2: 'There are 2 ways you can earn gold: occupying villages/castles or keeping your commander alive. Income will be calculated & gained when your turn starts.',
    P_WIKI_INCOME_RECRUIT_L3: 'To recruit new units you can simply click your castle. But please note that you can do recruiting only when no unit is on the castle, except your commander.',
    P_WIKI_INCOME_RECRUIT_L4: 'While recruiting new units you should pay attention to their cost and occupancy, to make sure that it will not cause troubles for your future plans.',
    P_WIKI_STATUS_L1: 'Despite terrains, you can also utilize status to win battles. There are positive as well as negative status, but a unit can have only one status at a time. Once a unit gets a status, it will not be replaced with another ones.',
    P_WIKI_STATUS_L2: 'That being said, sometimes having a negative status is not always bad since it can prevent the unit from getting worse status. Anyway, positive status are always good.',
    P_WIKI_TERRAINS_L1: 'Most of the terrains will provide defence bonus to units. But usually terrains with higher defence bonus will require more movement points to go through.',
    P_WIKI_TERRAINS_L2: 'Keep in mind that some abilities will let units gain additional attack/defence bonuses while on specific type of terrains, sometimes even movement point cost will be affected.'
} as const;

function printHelp() {
    console.log(`用法: npm run apk:language-rule-report -- [选项]

选项:
  --lang <file>   APK 英文语言表路径，默认 APK/_analysis/unpack/assets/languages/en.lang
  --json          输出 JSON
  --check         文案或行为检查失败时以非 0 退出
  --help          显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        langPath: DEFAULT_LANG_PATH,
        json: false,
        check: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--check') {
            options.check = true;
        } else if (arg === '--lang') {
            const value = argv[++i];
            if (!value) throw new Error('--lang 缺少文件参数');
            options.langPath = path.resolve(value);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
}

export function parseLanguageEntries(source: string): Record<string, string> {
    const entries: Record<string, string> = {};
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) continue;
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        entries[key] = value;
    }
    return entries;
}

function normalizeForCompare(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeForCompare);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, normalizeForCompare(item)])
        );
    }
    return value;
}

function sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(normalizeForCompare(left)) === JSON.stringify(normalizeForCompare(right));
}

function check(
    checks: ApkLanguageRuleCheck[],
    id: string,
    title: string,
    source: string,
    expected: unknown,
    actual: unknown
) {
    checks.push({
        id,
        title,
        source,
        expected,
        actual,
        status: sameValue(expected, actual) ? 'pass' : 'fail'
    });
}

function createRoadState(units: Unit[], currentPlayer = 0): GameState {
    return {
        turn: 1,
        currentPlayer,
        map: {
            width: 5,
            height: 5,
            tiles: Array.from({ length: 5 }, () => (
                Array.from({ length: 5 }, () => ({ terrainId: 6 as const, ownerId: null }))
            ))
        },
        units,
        players: [
            { id: 0, gold: 500, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 500, isAlive: true, commanderDeathCount: 0 }
        ],
        winner: null,
        nextUnitId: 100,
        nextGraveId: 100
    };
}

function createUnit(id: string, ownerId: number, unitClass: UnitClass, x: number, y: number): Unit {
    return {
        id,
        ownerId,
        unitClass,
        pos: { x, y },
        hp: 100,
        maxHp: 100,
        hasMoved: false,
        hasActed: false,
        level: 0,
        exp: 0
    };
}

function hasSupportAction(actions: Action[], targetId: string): boolean {
    return actions.some(action => action.type === 'support' && action.targetId === targetId);
}

function buildSupportRestrictionActual() {
    const probe = (targetClass: UnitClass, targetLevel = 0) => {
        const supporter = createUnit('supporter', 0, 'druid', 0, 0);
        supporter.level = 1;
        const target = createUnit('target', 0, targetClass, 0, 1);
        target.level = targetLevel as Unit['level'];
        target.hasActed = true;
        target.hasMoved = true;
        const actions = getLegalActions(createRoadState([supporter, target]), 0);
        return hasSupportAction(actions, target.id);
    };

    return {
        actedSoldier: probe('soldier'),
        castleCapturer: probe('commander'),
        assaultTroop: probe('wolf'),
        sameSupporterAbility: probe('druid'),
        higherLevelTarget: probe('soldier', 2)
    };
}

function buildSupportResetActual() {
    const supporter = createUnit('supporter', 0, 'druid', 0, 0);
    const target = createUnit('target', 0, 'soldier', 0, 1);
    target.hasActed = true;
    target.hasMoved = true;
    target.movementRemaining = 0;

    const engine = new GameEngine(createRoadState([supporter, target]));
    const supportAction = engine.getLegalActions(0).find(action => action.type === 'support' && action.targetId === target.id);
    if (!supportAction) throw new Error('支援动作缺失');
    engine.step(supportAction);
    const finalTarget = engine.getState().units.find(unit => unit.id === target.id)!;
    const finalSupporter = engine.getState().units.find(unit => unit.id === supporter.id)!;

    return {
        targetHasMovedAfterSupport: finalTarget.hasMoved,
        targetHasActedAfterSupport: finalTarget.hasActed,
        targetMovementRemaining: finalTarget.movementRemaining ?? null,
        targetMarkedSupported: finalTarget.hasBeenSupportedThisTurn ?? false,
        supporterHasActed: finalSupporter.hasActed
    };
}

function buildHealingActual() {
    const healer = createUnit('healer', 0, 'paladin', 0, 0);
    const target = createUnit('target', 0, 'soldier', 0, 1);
    target.hp = 90;
    const engine = new GameEngine(createRoadState([healer, target]));
    const healAction = engine.getLegalActions(0).find(action => action.type === 'heal' && action.targetId === target.id);
    if (!healAction) throw new Error('治疗动作缺失');
    engine.step(healAction);
    const finalTarget = engine.getState().units.find(unit => unit.id === target.id)!;
    return {
        hp: finalTarget.hp,
        exceededMaxHp: finalTarget.hp > finalTarget.maxHp
    };
}

function buildHealerLevelScalingActual() {
    const level0Healer = createUnit('level0_healer', 0, 'paladin', 0, 0);
    const level0Target = createUnit('level0_target', 0, 'soldier', 0, 1);
    level0Target.hp = 10;
    const level0Engine = new GameEngine(createRoadState([level0Healer, level0Target]));
    const level0Action = level0Engine.getLegalActions(0).find(action => action.type === 'heal' && action.targetId === level0Target.id);
    if (!level0Action) throw new Error('0 级治疗动作缺失');
    level0Engine.step(level0Action);

    const level2Healer = createUnit('level2_healer', 0, 'paladin', 0, 0);
    level2Healer.level = 2;
    const level2Target = createUnit('level2_target', 0, 'soldier', 0, 1);
    level2Target.hp = 10;
    const level2Engine = new GameEngine(createRoadState([level2Healer, level2Target]));
    const level2Action = level2Engine.getLegalActions(0).find(action => action.type === 'heal' && action.targetId === level2Target.id);
    if (!level2Action) throw new Error('2 级治疗动作缺失');
    level2Engine.step(level2Action);

    return {
        level0TargetHp: level0Engine.getState().units.find(unit => unit.id === level0Target.id)?.hp ?? null,
        level2TargetHp: level2Engine.getState().units.find(unit => unit.id === level2Target.id)?.hp ?? null
    };
}

function buildPoisonerActual() {
    const attacker = createUnit('attacker', 0, 'skeleton', 0, 0);
    const targetWithoutPoisoner = createUnit('target_without_poisoner', 1, 'soldier', 0, 1);
    const targetWithPoisoner = createUnit('target_with_poisoner', 1, 'wolf', 0, 1);

    const normalEngine = new GameEngine(createRoadState([attacker, targetWithoutPoisoner]));
    normalEngine.step({ type: 'attack', attackerId: attacker.id, targetId: targetWithoutPoisoner.id });
    const normalTarget = normalEngine.getState().units.find(unit => unit.id === targetWithoutPoisoner.id)!;

    const immuneEngine = new GameEngine(createRoadState([attacker, targetWithPoisoner]));
    immuneEngine.step({ type: 'attack', attackerId: attacker.id, targetId: targetWithPoisoner.id });
    const immuneTarget = immuneEngine.getState().units.find(unit => unit.id === targetWithPoisoner.id)!;

    return {
        targetWithoutPoisonerStatus: normalTarget.status?.type ?? null,
        targetWithPoisonerStatus: immuneTarget.status?.type ?? null
    };
}

function buildUndeadPoisonActual() {
    const skeleton = createUnit('skeleton', 0, 'skeleton', 0, 0);
    skeleton.hp = 50;
    skeleton.status = { type: 'poisoned', remainingTicks: 2 };
    const enemy = createUnit('enemy', 1, 'soldier', 4, 4);
    const engine = new GameEngine(createRoadState([skeleton, enemy], 1));
    engine.step({ type: 'end_turn' });
    const finalSkeleton = engine.getState().units.find(unit => unit.id === skeleton.id)!;
    return {
        hp: finalSkeleton.hp,
        status: finalSkeleton.status?.type ?? null,
        remainingTicks: finalSkeleton.status?.remainingTicks ?? null
    };
}

function buildCounterStormActual() {
    const attacker = createUnit('archer', 0, 'archer', 0, 0);
    const defender = createUnit('berserker', 1, 'berserker', 2, 0);
    const engine = new GameEngine(createRoadState([attacker, defender]));
    engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });
    const finalAttacker = engine.getState().units.find(unit => unit.id === attacker.id)!;
    return {
        attackerHpAfterRange2Attack: finalAttacker.hp,
        countered: finalAttacker.hp < 100
    };
}

function buildFlyingActual() {
    const dragon = createUnit('dragon', 0, 'dragon', 0, 0);
    const enemy = createUnit('enemy', 1, 'soldier', 1, 0);
    const moveState = createRoadState([dragon, enemy]);
    const reachable = getReachablePositions(moveState, dragon.id);

    const roadState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('dragon', 1, 'dragon', 1, 0)
    ]);
    const castleState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('dragon', 1, 'dragon', 1, 0)
    ]);
    castleState.map.tiles[0][1] = { terrainId: 10, ownerId: 1 };

    return {
        canMoveThroughGroundEnemy: reachable.some(pos => pos.x === 2 && pos.y === 0),
        canStopOnOccupiedEnemy: reachable.some(pos => pos.x === 1 && pos.y === 0),
        damageToFlyingOnRoad: calculateDamage(roadState, 'attacker', 'dragon'),
        damageToFlyingOnCastle: calculateDamage(castleState, 'attacker', 'dragon')
    };
}

function buildCombatModifierActual() {
    const meleeState = createRoadState([
        createUnit('dragon', 0, 'dragon', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    const rangedDefenseState = createRoadState([
        createUnit('archer', 0, 'archer', 0, 0),
        createUnit('golem', 1, 'golem', 0, 2)
    ]);
    const fightingSpiritState = createRoadState([
        createUnit('berserker', 0, 'berserker', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    fightingSpiritState.units[0].hp = 20;
    const normalLowHpState = createRoadState([
        createUnit('wolf', 0, 'wolf', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    normalLowHpState.units[0].hp = 20;
    const deathReaperNormalState = createRoadState([
        createUnit('ghost', 0, 'ghost', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    const deathReaperStatusState = createRoadState([
        createUnit('ghost', 0, 'ghost', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    deathReaperStatusState.units[1].status = { type: 'poisoned', remainingTicks: 2 };
    const sharpshooterState = createRoadState([
        createUnit('archer', 0, 'archer', 0, 0),
        createUnit('dragon', 1, 'dragon', 0, 2)
    ]);
    const destroyerState = createRoadState([
        createUnit('catapult', 0, 'catapult', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 3)
    ]);
    destroyerState.map.tiles[3][0] = { terrainId: 9, ownerId: 1 };

    return {
        meleeMasterDamage: calculateDamage(meleeState, 'dragon', 'soldier'),
        rangedDefenseDamage: calculateDamage(rangedDefenseState, 'archer', 'golem'),
        fightingSpiritDamageAtLowHp: calculateDamage(fightingSpiritState, 'berserker', 'soldier'),
        normalLowHpDamage: calculateDamage(normalLowHpState, 'wolf', 'soldier'),
        deathReaperDamageNormal: calculateDamage(deathReaperNormalState, 'ghost', 'soldier'),
        deathReaperDamageAgainstNegativeStatus: calculateDamage(deathReaperStatusState, 'ghost', 'soldier'),
        sharpshooterDamageToFlying: calculateDamage(sharpshooterState, 'archer', 'dragon'),
        destroyerDamageToVillageTarget: calculateDamage(destroyerState, 'catapult', 'soldier')
    };
}

function buildInspiredStatusActual() {
    const meleeNormalState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 1)
    ]);
    const meleeInspiredState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 1)
    ]);
    meleeInspiredState.units[0].status = { type: 'inspired', remainingTurns: 1 };

    const rangedNormalState = createRoadState([
        createUnit('attacker', 0, 'archer', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 2)
    ]);
    const rangedInspiredState = createRoadState([
        createUnit('attacker', 0, 'archer', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 2)
    ]);
    rangedInspiredState.units[0].status = { type: 'inspired', remainingTurns: 1 };

    return {
        meleeNormalDamage: calculateDamage(meleeNormalState, 'attacker', 'defender'),
        meleeInspiredDamage: calculateDamage(meleeInspiredState, 'attacker', 'defender'),
        rangedNormalDamage: calculateDamage(rangedNormalState, 'attacker', 'defender'),
        rangedInspiredDamage: calculateDamage(rangedInspiredState, 'attacker', 'defender')
    };
}

function buildAssaultTroopActual() {
    const wolf = createUnit('wolf', 0, 'wolf', 0, 0);
    wolf.movementRemaining = 3;
    const target = createUnit('target', 1, 'soldier', 0, 1);
    const engine = new GameEngine(createRoadState([wolf, target]));
    engine.step({ type: 'attack', attackerId: wolf.id, targetId: target.id });
    const afterAttack = engine.getState().units.find(unit => unit.id === wolf.id)!;
    const postAttackActions = engine.getLegalActions(0).filter(action => (
        action.type === 'post_attack_move' && action.unitId === wolf.id
    ));
    if (postAttackActions.length === 0) throw new Error('突击攻击后移动动作缺失');
    engine.step(postAttackActions[0]);
    const afterPostMove = engine.getState().units.find(unit => unit.id === wolf.id)!;

    return {
        hasPostAttackMove: postAttackActions.length > 0,
        movementRemainingAfterAttack: afterAttack.movementRemaining ?? null,
        hasActedAfterAttack: afterAttack.hasActed,
        hasPostAttackMovedAfterMove: afterPostMove.hasPostAttackMoved ?? false,
        hasActedAfterPostMove: afterPostMove.hasActed
    };
}

function buildTerrainChildActual() {
    const waterAttackState = createRoadState([
        createUnit('water', 0, 'water_elemental', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    waterAttackState.map.tiles[0][0] = { terrainId: 2, ownerId: null };

    const waterDefenseState = createRoadState([
        createUnit('soldier', 1, 'soldier', 0, 1),
        createUnit('water', 0, 'water_elemental', 0, 0)
    ], 1);
    waterDefenseState.map.tiles[0][0] = { terrainId: 2, ownerId: null };

    const forestAttackState = createRoadState([
        createUnit('elf', 0, 'elf', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    forestAttackState.map.tiles[0][0] = { terrainId: 7, ownerId: null };

    const mountainAttackState = createRoadState([
        createUnit('golem', 0, 'golem', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    mountainAttackState.map.tiles[0][0] = { terrainId: 3, ownerId: null };

    const healingState = createRoadState([
        createUnit('water', 0, 'water_elemental', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ], 1);
    healingState.units[0].hp = 50;
    healingState.map.tiles[0][0] = { terrainId: 2, ownerId: null };
    const healingEngine = new GameEngine(healingState);
    healingEngine.step({ type: 'end_turn' });

    return {
        waterAttackBonusDamage: calculateDamage(waterAttackState, 'water', 'soldier'),
        waterDefenseBonusDamageTaken: calculateDamage(waterDefenseState, 'soldier', 'water'),
        forestAttackBonusDamage: calculateDamage(forestAttackState, 'elf', 'soldier'),
        mountainAttackBonusDamage: calculateDamage(mountainAttackState, 'golem', 'soldier'),
        waterChildHpAfterTurnStart: healingEngine.getState().units.find(unit => unit.id === 'water')?.hp ?? null
    };
}

function buildSelfRepairActual() {
    const slime = createUnit('slime', 0, 'slime', 0, 0);
    slime.hp = 50;
    slime.status = { type: 'poisoned', remainingTicks: 2 };
    const engine = new GameEngine(createRoadState([slime, createUnit('enemy', 1, 'soldier', 4, 4)], 1));
    engine.step({ type: 'end_turn' });
    const finalSlime = engine.getState().units.find(unit => unit.id === slime.id)!;

    return {
        hp: finalSlime.hp,
        status: finalSlime.status?.type ?? null,
        remainingTicks: finalSlime.status?.remainingTicks ?? null
    };
}

function buildAuraActual() {
    const attackAuraState = createRoadState([
        createUnit('druid', 0, 'druid', 0, 0),
        createUnit('ally', 0, 'soldier', 0, 2)
    ]);
    const attackAuraEngine = new GameEngine(attackAuraState);
    attackAuraEngine.step({ type: 'wait', unitId: 'druid' });

    const cleansingAuraState = createRoadState([
        createUnit('elf', 0, 'elf', 0, 0),
        createUnit('ally', 0, 'soldier', 0, 2)
    ]);
    cleansingAuraState.units[1].hp = 50;
    cleansingAuraState.units[1].status = { type: 'poisoned', remainingTicks: 2 };
    const cleansingAuraEngine = new GameEngine(cleansingAuraState);
    cleansingAuraEngine.step({ type: 'wait', unitId: 'elf' });
    const cleansedAlly = cleansingAuraEngine.getState().units.find(unit => unit.id === 'ally')!;

    const weaknessAuraState = createRoadState([
        createUnit('golem', 0, 'golem', 0, 0),
        createUnit('enemy', 1, 'soldier', 0, 2)
    ]);
    const weaknessAuraEngine = new GameEngine(weaknessAuraState);
    weaknessAuraEngine.step({ type: 'wait', unitId: 'golem' });

    return {
        attackAuraAllyStatus: attackAuraEngine.getState().units.find(unit => unit.id === 'ally')?.status?.type ?? null,
        cleansingAuraAllyHp: cleansedAlly.hp,
        cleansingAuraAllyStatus: cleansedAlly.status?.type ?? null,
        weaknessAuraEnemyStatus: weaknessAuraEngine.getState().units.find(unit => unit.id === 'enemy')?.status?.type ?? null
    };
}

function buildEarthChildActual() {
    const berserker = createUnit('berserker', 0, 'berserker', 0, 0);
    const state = createRoadState([berserker]);

    state.map.tiles[0][1] = { terrainId: 6, ownerId: null };
    const roadCost = getMoveCostTo(state, berserker.id, { x: 1, y: 0 });

    state.map.tiles[0][1] = { terrainId: 2, ownerId: null };
    const waterCost = getMoveCostTo(state, berserker.id, { x: 1, y: 0 });

    state.map.tiles[0][1] = { terrainId: 17, ownerId: null };
    const bridgeCost = getMoveCostTo(state, berserker.id, { x: 1, y: 0 });

    return {
        roadCost,
        waterCost,
        bridgeCost
    };
}

function buildSummonAndGraveActual() {
    const summoner = createUnit('witch', 0, 'witch', 0, 0);
    const summonState = createRoadState([summoner]);
    summonState.graves = [{ id: 'grave', pos: { x: 0, y: 1 }, remainingTurns: 2 }];
    const summonEngine = new GameEngine(summonState);
    const summonAction = summonEngine.getLegalActions(0).find(action => action.type === 'summon');
    if (!summonAction) throw new Error('召唤动作缺失');
    summonEngine.step(summonAction);
    const summonedState = summonEngine.getState();

    const skeleton = createUnit('skeleton', 0, 'skeleton', 0, 0);
    skeleton.hp = 50;
    const undeadGraveState = createRoadState([skeleton]);
    undeadGraveState.graves = [{ id: 'grave', pos: { x: 1, y: 0 }, remainingTurns: 2 }];
    const undeadGraveEngine = new GameEngine(undeadGraveState);
    undeadGraveEngine.step({ type: 'move', unitId: skeleton.id, to: { x: 1, y: 0 } });
    const healedSkeleton = undeadGraveEngine.getState().units.find(unit => unit.id === skeleton.id)!;

    const undeadDeathState = createRoadState([
        createUnit('dragon', 0, 'dragon', 0, 0),
        createUnit('skeleton', 1, 'skeleton', 0, 1)
    ]);
    undeadDeathState.units[1].hp = 5;
    const undeadDeathEngine = new GameEngine(undeadDeathState);
    undeadDeathEngine.step({ type: 'attack', attackerId: 'dragon', targetId: 'skeleton' });

    return {
        summonerHpAfterUsingGrave: summonedState.units.find(unit => unit.id === 'witch')?.hp ?? null,
        skeletonSummoned: summonedState.units.some(unit => unit.unitClass === 'skeleton' && unit.ownerId === 0),
        undeadHpAfterConsumingGrave: healedSkeleton.hp,
        graveRemovedAfterUndeadConsumes: (undeadGraveEngine.getState().graves?.length ?? 0) === 0,
        undeadDeathCreatedGrave: (undeadDeathEngine.getState().graves?.length ?? 0) > 0
    };
}

function buildBlindingActual() {
    const normalTargetState = createRoadState([
        createUnit('dark_mage', 0, 'dark_mage', 0, 0),
        createUnit('soldier', 1, 'soldier', 0, 1)
    ]);
    const normalEngine = new GameEngine(normalTargetState);
    normalEngine.step({ type: 'attack', attackerId: 'dark_mage', targetId: 'soldier' });

    const immuneTargetState = createRoadState([
        createUnit('dark_mage', 0, 'dark_mage', 0, 0),
        createUnit('target_mage', 1, 'dark_mage', 0, 1)
    ]);
    const immuneEngine = new GameEngine(immuneTargetState);
    immuneEngine.step({ type: 'attack', attackerId: 'dark_mage', targetId: 'target_mage' });

    return {
        targetWithoutBlinderStatus: normalEngine.getState().units.find(unit => unit.id === 'soldier')?.status?.type ?? null,
        targetWithBlinderStatus: immuneEngine.getState().units.find(unit => unit.id === 'target_mage')?.status?.type ?? null
    };
}

function buildPoisonedStatusActual() {
    const healer = createUnit('healer', 0, 'paladin', 0, 0);
    const poisoned = createUnit('poisoned', 0, 'soldier', 0, 1);
    poisoned.status = { type: 'poisoned', remainingTicks: 2 };
    const canHealPoisoned = getLegalActions(createRoadState([healer, poisoned]), 0)
        .some(action => action.type === 'heal' && action.targetId === poisoned.id);

    const turnStartState = createRoadState([poisoned, createUnit('enemy', 1, 'soldier', 4, 4)], 1);
    turnStartState.units[0].hp = 50;
    const engine = new GameEngine(turnStartState);
    engine.step({ type: 'end_turn' });
    const finalPoisoned = engine.getState().units.find(unit => unit.id === poisoned.id)!;

    return {
        canHealPoisoned,
        hpAfterTurnStart: finalPoisoned.hp,
        remainingTicks: finalPoisoned.status?.remainingTicks ?? null
    };
}

function buildBasicDamageFormulaActual() {
    const fullHpState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 1)
    ]);
    const lowHpState = createRoadState([
        createUnit('attacker', 0, 'soldier', 0, 0),
        createUnit('defender', 1, 'soldier', 0, 1)
    ]);
    lowHpState.units[0].hp = 40;

    return {
        fullHpDamage: calculateDamage(fullHpState, 'attacker', 'defender'),
        lowHpDamage: calculateDamage(lowHpState, 'attacker', 'defender')
    };
}

function buildAttackTypeDefenseActual() {
    const physicalState = createRoadState([
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('slime', 1, 'slime', 0, 1)
    ]);
    const magicState = createRoadState([
        createUnit('dark_mage', 0, 'dark_mage', 0, 0),
        createUnit('slime', 1, 'slime', 0, 1)
    ]);

    return {
        physicalDamageToSlime: calculateDamage(physicalState, 'soldier', 'slime'),
        magicDamageToSlime: calculateDamage(magicState, 'dark_mage', 'slime')
    };
}

function buildStatusSlotActual() {
    const blindingState = createRoadState([
        createUnit('dark_mage', 0, 'dark_mage', 0, 0),
        createUnit('target', 1, 'soldier', 0, 1)
    ]);
    blindingState.units[1].status = { type: 'poisoned', remainingTicks: 2 };
    const blindingEngine = new GameEngine(blindingState);
    blindingEngine.step({ type: 'attack', attackerId: 'dark_mage', targetId: 'target' });

    const weaknessAuraState = createRoadState([
        createUnit('golem', 0, 'golem', 0, 0),
        createUnit('target', 1, 'soldier', 0, 2)
    ]);
    weaknessAuraState.units[1].status = { type: 'poisoned', remainingTicks: 2 };
    const weaknessAuraEngine = new GameEngine(weaknessAuraState);
    weaknessAuraEngine.step({ type: 'wait', unitId: 'golem' });

    const attackAuraState = createRoadState([
        createUnit('druid', 0, 'druid', 0, 0),
        createUnit('ally', 0, 'soldier', 0, 2)
    ]);
    attackAuraState.units[1].status = { type: 'poisoned', remainingTicks: 2 };
    const attackAuraEngine = new GameEngine(attackAuraState);
    attackAuraEngine.step({ type: 'wait', unitId: 'druid' });

    return {
        poisonedAfterBlindingAttack: blindingEngine.getState().units.find(unit => unit.id === 'target')?.status?.type ?? null,
        poisonedAfterWeaknessAura: weaknessAuraEngine.getState().units.find(unit => unit.id === 'target')?.status?.type ?? null,
        poisonedAfterAttackAura: attackAuraEngine.getState().units.find(unit => unit.id === 'ally')?.status?.type ?? null
    };
}

function buildIncomeRecruitActual() {
    const commander = createUnit('commander', 0, 'commander', 0, 0);
    commander.level = 2;
    const enemy = createUnit('enemy', 1, 'soldier', 4, 4);
    const incomeState = createRoadState([commander, enemy], 1);
    incomeState.players[0].gold = 0;
    incomeState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    incomeState.map.tiles[0][1] = { terrainId: 9, ownerId: 0 };
    incomeState.rules = {
        incomeVillage: 50,
        incomeCastle: 100,
        incomeCommanderBase: 25,
        incomeCommanderGrowth: 25,
        recruitableUnits: ['soldier']
    };
    const incomeEngine = new GameEngine(incomeState);
    incomeEngine.step({ type: 'end_turn' });

    const commanderCastleState = createRoadState([
        createUnit('commander', 0, 'commander', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    commanderCastleState.players[0].gold = 1000;
    commanderCastleState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    commanderCastleState.rules = { recruitableUnits: ['soldier'] };

    const emptyCastleState = createRoadState([
        createUnit('commander', 0, 'commander', 1, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    emptyCastleState.players[0].gold = 1000;
    emptyCastleState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    emptyCastleState.rules = { recruitableUnits: ['soldier'] };

    const occupiedCastleState = createRoadState([
        createUnit('commander', 0, 'commander', 1, 0),
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    occupiedCastleState.players[0].gold = 1000;
    occupiedCastleState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    occupiedCastleState.rules = { recruitableUnits: ['soldier'] };

    const commanderCastleActions = getLegalActions(commanderCastleState, 0);
    const emptyCastleActions = getLegalActions(emptyCastleState, 0);
    const occupiedCastleActions = getLegalActions(occupiedCastleState, 0);

    return {
        goldAfterTurnStart: incomeEngine.getState().players.find(player => player.id === 0)?.gold ?? null,
        commanderOnCastleCanRecruitAndDeploy: commanderCastleActions.some(action => action.type === 'recruit_and_deploy' && action.unitClass === 'soldier'),
        commanderOnCastleCanRecruitToCastle: commanderCastleActions.some(action => action.type === 'recruit_to_castle' && action.unitClass === 'soldier'),
        emptyCastleCanRecruitToCastle: emptyCastleActions.some(action => action.type === 'recruit_to_castle' && action.unitClass === 'soldier'),
        nonCommanderOccupantBlocksRecruit: !occupiedCastleActions.some(action => (
            (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') && action.unitClass === 'soldier'
        ))
    };
}

function buildRecruitCostOccupancyActual() {
    const affordableState = createRoadState([
        createUnit('commander', 0, 'commander', 1, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    affordableState.players[0].gold = 150;
    affordableState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    affordableState.rules = { recruitableUnits: ['soldier'] };

    const unaffordableState = createRoadState([
        createUnit('commander', 0, 'commander', 1, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    unaffordableState.players[0].gold = 149;
    unaffordableState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    unaffordableState.rules = { recruitableUnits: ['soldier'] };

    const populationFullState = createRoadState([
        createUnit('commander', 0, 'commander', 1, 0),
        createUnit('soldier', 0, 'soldier', 2, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    populationFullState.players[0].gold = 5000;
    populationFullState.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
    populationFullState.rules = {
        recruitableUnits: ['soldier', 'dragon'],
        populationLimit: 1
    };

    const hasRecruit = (state: GameState, unitClass: UnitClass) => getLegalActions(state, 0).some(action => (
        (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
        && action.unitClass === unitClass
    ));

    return {
        soldierCostPaidThreshold: {
            gold149CanRecruitSoldier: hasRecruit(unaffordableState, 'soldier'),
            gold150CanRecruitSoldier: hasRecruit(affordableState, 'soldier')
        },
        populationLimit: {
            currentPopulation: 1,
            limit: 1,
            canRecruitSoldier: hasRecruit(populationFullState, 'soldier'),
            canRecruitDragon: hasRecruit(populationFullState, 'dragon')
        }
    };
}

function buildCaptureRepairActual() {
    const soldierTownState = createRoadState([
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    soldierTownState.map.tiles[0][0] = { terrainId: 9, ownerId: null };

    const soldierCastleState = createRoadState([
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    soldierCastleState.map.tiles[0][0] = { terrainId: 10, ownerId: null };

    const commanderCastleState = createRoadState([
        createUnit('commander', 0, 'commander', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    commanderCastleState.map.tiles[0][0] = { terrainId: 10, ownerId: null };

    const repairState = createRoadState([
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    repairState.map.tiles[0][0] = { terrainId: 8, ownerId: null };

    const hasAction = (state: GameState, type: 'capture' | 'repair', unitId: string) => (
        getLegalActions(state, 0).some(action => action.type === type && action.unitId === unitId)
    );

    return {
        soldierCanCaptureVillage: hasAction(soldierTownState, 'capture', 'soldier'),
        soldierCanCaptureCastle: hasAction(soldierCastleState, 'capture', 'soldier'),
        commanderCanCaptureCastle: hasAction(commanderCastleState, 'capture', 'commander'),
        soldierCanRepairDestroyedVillage: hasAction(repairState, 'repair', 'soldier')
    };
}

function buildTerrainDefenseMoveActual() {
    const damageOnTerrain = (terrainId: GameState['map']['tiles'][number][number]['terrainId']) => {
        const state = createRoadState([
            createUnit('attacker', 0, 'soldier', 0, 0),
            createUnit('defender', 1, 'soldier', 1, 0)
        ]);
        state.map.tiles[0][1] = { terrainId, ownerId: null };
        return calculateDamage(state, 'attacker', 'defender');
    };

    const moveCostToTerrain = (terrainId: GameState['map']['tiles'][number][number]['terrainId']) => {
        const state = createRoadState([createUnit('walker', 0, 'soldier', 0, 0)]);
        state.map.tiles[0][1] = { terrainId, ownerId: null };
        return getMoveCostTo(state, 'walker', { x: 1, y: 0 });
    };

    return {
        road: { defenseDamageTaken: damageOnTerrain(6), moveCost: moveCostToTerrain(6) },
        forest: { defenseDamageTaken: damageOnTerrain(7), moveCost: moveCostToTerrain(7) },
        mountain: { defenseDamageTaken: damageOnTerrain(3), moveCost: moveCostToTerrain(3) }
    };
}

function buildTileRuleActual() {
    const templeUnit = createUnit('temple_unit', 0, 'soldier', 0, 0);
    templeUnit.hp = 50;
    templeUnit.status = { type: 'poisoned', remainingTicks: 2 };
    const templeState = createRoadState([templeUnit, createUnit('enemy', 1, 'soldier', 4, 4)], 1);
    templeState.map.tiles[0][0] = { terrainId: 12, ownerId: null };
    const templeEngine = new GameEngine(templeState);
    templeEngine.step({ type: 'end_turn' });
    const templeFinal = templeEngine.getState().units.find(unit => unit.id === templeUnit.id)!;

    const ruinState = createRoadState([
        createUnit('soldier', 0, 'soldier', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    ruinState.map.tiles[0][0] = { terrainId: 8, ownerId: null };
    const repairAction = getLegalActions(ruinState, 0).find(action => action.type === 'repair' && action.unitId === 'soldier');
    const repairEngine = new GameEngine(ruinState);
    if (repairAction) {
        repairEngine.step(repairAction);
    }

    const villageState = createRoadState([
        createUnit('catapult', 0, 'catapult', 0, 0),
        createUnit('enemy', 1, 'soldier', 4, 4)
    ]);
    villageState.map.tiles[0][0] = { terrainId: 9, ownerId: 1 };
    const destroyAction = getLegalActions(villageState, 0).find(action => action.type === 'destroy_town' && action.unitId === 'catapult');
    const destroyEngine = new GameEngine(villageState);
    if (destroyAction) {
        destroyEngine.step(destroyAction);
    }

    return {
        templeStatusAfterTurnStart: templeFinal.status?.type ?? null,
        templeHpAfterTurnStart: templeFinal.hp,
        ruinCanBeRepaired: repairAction !== undefined,
        repairedTerrainId: repairEngine.getState().map.tiles[0][0].terrainId,
        repairedOwnerId: repairEngine.getState().map.tiles[0][0].ownerId,
        villageCanBeDestroyed: destroyAction !== undefined,
        destroyedVillageTerrainId: destroyEngine.getState().map.tiles[0][0].terrainId,
        destroyedVillageOwnerId: destroyEngine.getState().map.tiles[0][0].ownerId
    };
}

function buildStatusActual() {
    const blinded = createUnit('blinded', 0, 'archer', 0, 0);
    blinded.status = { type: 'blinded' };
    const weakened = createUnit('weakened', 0, 'soldier', 0, 0);
    weakened.status = { type: 'weakened', remainingTurns: 1 };

    return {
        blindedActionTypes: getLegalActions(createRoadState([blinded, createUnit('enemy', 1, 'soldier', 0, 2)]), 0)
            .map(action => action.type)
            .filter((value, index, array) => array.indexOf(value) === index)
            .sort(),
        weakenedReachableCount: getReachablePositions(createRoadState([weakened]), weakened.id).length,
        weakenedDamageTakenFromMelee: calculateDamage(
            createRoadState([createUnit('attacker', 1, 'soldier', 0, 1), weakened], 1),
            'attacker',
            weakened.id
        )
    };
}

export async function buildApkLanguageRuleReport(options: Partial<CliOptions> = {}): Promise<ApkLanguageRuleReport> {
    const langPath = path.resolve(options.langPath ?? DEFAULT_LANG_PATH);
    const entries = parseLanguageEntries(await readFile(langPath, 'utf8'));
    const checks: ApkLanguageRuleCheck[] = [];

    check(
        checks,
        'language-entries',
        'APK 英文语言表包含关键能力/状态规则说明',
        'APK assets/languages/en.lang',
        REQUIRED_LANGUAGE_ENTRIES,
        Object.fromEntries(Object.keys(REQUIRED_LANGUAGE_ENTRIES).map(key => [key, entries[key] ?? null]))
    );

    check(
        checks,
        'support-restrictions',
        '支援者只能支援已待机且未被排除的同盟单位',
        'P_ABILITY3_DESCRIPTION_1/21/24',
        {
            actedSoldier: true,
            castleCapturer: false,
            assaultTroop: false,
            sameSupporterAbility: false,
            higherLevelTarget: false
        },
        buildSupportRestrictionActual()
    );

    check(
        checks,
        'support-reset-action',
        '支援者会把友军从待机状态重置为可行动',
        'P_ABILITY3_DESCRIPTION_24',
        {
            targetHasMovedAfterSupport: false,
            targetHasActedAfterSupport: false,
            targetMovementRemaining: 4,
            targetMarkedSupported: true,
            supporterHasActed: true
        },
        buildSupportResetActual()
    );

    check(
        checks,
        'healer-overheal',
        '治疗可以超过目标最大生命值',
        'P_ABILITY3_DESCRIPTION_7',
        { hp: 130, exceededMaxHp: true },
        buildHealingActual()
    );

    check(
        checks,
        'healer-level-scaling',
        '治疗量会随治疗者等级提升',
        'P_ABILITY3_DESCRIPTION_7',
        { level0TargetHp: 50, level2TargetHp: 70 },
        buildHealerLevelScalingActual()
    );

    check(
        checks,
        'poisoner-immunity',
        '毒攻击不能给同样有 poisoner 能力的目标挂毒',
        'P_ABILITY3_DESCRIPTION_8',
        { targetWithoutPoisonerStatus: 'poisoned', targetWithPoisonerStatus: null },
        buildPoisonerActual()
    );

    check(
        checks,
        'undead-poison-heal',
        '亡灵中毒回合开始回血而非扣血',
        'P_ABILITY3_DESCRIPTION_9',
        { hp: 60, status: 'poisoned', remainingTicks: 1 },
        buildUndeadPoisonActual()
    );

    check(
        checks,
        'counter-storm-range2',
        '反击风暴允许 2 格内反击',
        'P_ABILITY3_DESCRIPTION_16',
        { attackerHpAfterRange2Attack: 35, countered: true },
        buildCounterStormActual()
    );

    check(
        checks,
        'flying-movement-and-defense',
        '飞行单位可越过地面单位且不吃地形防御',
        'P_ABILITY3_DESCRIPTION_3',
        {
            canMoveThroughGroundEnemy: true,
            canStopOnOccupiedEnemy: false,
            damageToFlyingOnRoad: 30,
            damageToFlyingOnCastle: 30
        },
        buildFlyingActual()
    );

    check(
        checks,
        'combat-modifiers',
        '攻击类能力按 APK 文案修正伤害',
        'P_ABILITY3_DESCRIPTION_4/5/10/11/15/25',
        {
            meleeMasterDamage: 97,
            rangedDefenseDamage: 7,
            fightingSpiritDamageAtLowHp: 65,
            normalLowHpDamage: 14,
            deathReaperDamageNormal: 45,
            deathReaperDamageAgainstNegativeStatus: 65,
            sharpshooterDamageToFlying: 15,
            destroyerDamageToVillageTarget: 50
        },
        buildCombatModifierActual()
    );

    check(
        checks,
        'inspired-status-damage',
        '鼓舞状态近战攻击 +10，远程攻击 +5',
        'P_STATUS3_DESCRIPTION_2',
        {
            meleeNormalDamage: 50,
            meleeInspiredDamage: 60,
            rangedNormalDamage: 40,
            rangedInspiredDamage: 45
        },
        buildInspiredStatusActual()
    );

    check(
        checks,
        'assault-post-attack-move',
        '突击单位攻击后可用剩余移动力再移动',
        'P_ABILITY3_DESCRIPTION_21',
        {
            hasPostAttackMove: true,
            movementRemainingAfterAttack: 3,
            hasActedAfterAttack: true,
            hasPostAttackMovedAfterMove: true,
            hasActedAfterPostMove: true
        },
        buildAssaultTroopActual()
    );

    check(
        checks,
        'terrain-child-abilities',
        '地形之子能力提供攻防、回血和地形移动收益',
        'P_ABILITY3_DESCRIPTION_12/13/14',
        {
            waterAttackBonusDamage: 65,
            waterDefenseBonusDamageTaken: 30,
            forestAttackBonusDamage: 60,
            mountainAttackBonusDamage: 60,
            waterChildHpAfterTurnStart: 60
        },
        buildTerrainChildActual()
    );

    check(
        checks,
        'self-repair-poisoned',
        '自我修复单位中毒时仍会在回合开始回复 25% HP',
        'P_ABILITY3_DESCRIPTION_17',
        { hp: 65, status: 'poisoned', remainingTicks: 1 },
        buildSelfRepairActual()
    );

    check(
        checks,
        'aura-abilities',
        '攻击/净化/虚弱光环在待机时影响 2 格内单位',
        'P_ABILITY3_DESCRIPTION_18/19/20',
        {
            attackAuraAllyStatus: 'inspired',
            cleansingAuraAllyHp: 60,
            cleansingAuraAllyStatus: null,
            weaknessAuraEnemyStatus: 'weakened'
        },
        buildAuraActual()
    );

    check(
        checks,
        'earth-child-movement',
        '大地之子陆地移动 1，水面和桥移动 2',
        'P_ABILITY3_DESCRIPTION_22',
        { roadCost: 1, waterCost: 2, bridgeCost: 2 },
        buildEarthChildActual()
    );

    check(
        checks,
        'summon-and-undead-graves',
        '召唤师与亡灵按 APK 文案处理墓碑',
        'P_ABILITY3_DESCRIPTION_6/9',
        {
            summonerHpAfterUsingGrave: 100,
            skeletonSummoned: true,
            undeadHpAfterConsumingGrave: 60,
            graveRemovedAfterUndeadConsumes: true,
            undeadDeathCreatedGrave: false
        },
        buildSummonAndGraveActual()
    );

    check(
        checks,
        'blinding-immunity',
        '致盲攻击不能给同样有 blinder 能力的目标挂致盲',
        'P_ABILITY3_DESCRIPTION_23',
        { targetWithoutBlinderStatus: 'blinded', targetWithBlinderStatus: null },
        buildBlindingActual()
    );

    check(
        checks,
        'poisoned-status',
        '中毒单位回合开始扣血且不能接受治疗',
        'P_STATUS3_DESCRIPTION_1',
        { canHealPoisoned: false, hpAfterTurnStart: 40, remainingTicks: 1 },
        buildPoisonedStatusActual()
    );

    check(
        checks,
        'basic-damage-formula',
        '基础伤害公式按 (ATK - DEF) * HP% 计算',
        'P_WIKI_BATTLE_BASICS_L4/L5',
        { fullHpDamage: 50, lowHpDamage: 20 },
        buildBasicDamageFormulaActual()
    );

    check(
        checks,
        'attack-type-defense-selection',
        '物理/魔法攻击分别使用目标物防/魔防',
        'P_WIKI_BATTLE_BASICS_4_L2/L3',
        { physicalDamageToSlime: 15, magicDamageToSlime: 60 },
        buildAttackTypeDefenseActual()
    );

    check(
        checks,
        'single-status-slot',
        '单位已有状态时不会被新状态覆盖',
        'P_WIKI_STATUS_L1/L2',
        {
            poisonedAfterBlindingAttack: 'poisoned',
            poisonedAfterWeaknessAura: 'poisoned',
            poisonedAfterAttackAura: 'poisoned'
        },
        buildStatusSlotActual()
    );

    check(
        checks,
        'income-and-castle-recruit',
        '收入在回合开始结算，城堡按占位规则招募',
        'P_WIKI_INCOME_RECRUIT_L2/L3; P_TILE_CASTLE_DESCRIPTION',
        {
            goldAfterTurnStart: 225,
            commanderOnCastleCanRecruitAndDeploy: true,
            commanderOnCastleCanRecruitToCastle: false,
            emptyCastleCanRecruitToCastle: true,
            nonCommanderOccupantBlocksRecruit: true
        },
        buildIncomeRecruitActual()
    );

    check(
        checks,
        'recruit-cost-and-occupancy',
        '招募费用和人口占用会限制可招募动作',
        'P_WIKI_INCOME_RECRUIT_L1/L4',
        {
            soldierCostPaidThreshold: {
                gold149CanRecruitSoldier: false,
                gold150CanRecruitSoldier: true
            },
            populationLimit: {
                currentPopulation: 1,
                limit: 1,
                canRecruitSoldier: false,
                canRecruitDragon: false
            }
        },
        buildRecruitCostOccupancyActual()
    );

    check(
        checks,
        'capture-and-repair-abilities',
        '村庄/城堡占领与废墟修理由单位能力决定',
        'P_ABILITY3_DESCRIPTION_0/1/2',
        {
            soldierCanCaptureVillage: true,
            soldierCanCaptureCastle: false,
            commanderCanCaptureCastle: true,
            soldierCanRepairDestroyedVillage: true
        },
        buildCaptureRepairActual()
    );

    check(
        checks,
        'terrain-defense-and-move-cost',
        '地形防御降低伤害，较高防御地形通常移动消耗更高',
        'P_WIKI_TERRAINS_L1/L2',
        {
            road: { defenseDamageTaken: 50, moveCost: 1 },
            forest: { defenseDamageTaken: 40, moveCost: 2 },
            mountain: { defenseDamageTaken: 35, moveCost: 3 }
        },
        buildTerrainDefenseMoveActual()
    );

    check(
        checks,
        'tile-language-rules',
        '建筑类地形按 APK 文案清状态、修理和破坏',
        'P_TILE_TEMPLE_DESCRIPTION; P_TILE_RUIN_DESCRIPTION; P_TILE_VILLAGE_DESCRIPTION',
        {
            templeStatusAfterTurnStart: null,
            templeHpAfterTurnStart: 60,
            ruinCanBeRepaired: true,
            repairedTerrainId: 9,
            repairedOwnerId: 0,
            villageCanBeDestroyed: true,
            destroyedVillageTerrainId: 8,
            destroyedVillageOwnerId: null
        },
        buildTileRuleActual()
    );

    check(
        checks,
        'status-blind-weaken',
        '致盲和虚弱状态按 APK 文案影响射程、移动和防御',
        'P_STATUS3_DESCRIPTION_3/4',
        {
            blindedActionTypes: ['end_turn', 'move', 'wait'],
            weakenedReachableCount: 3,
            weakenedDamageTakenFromMelee: 60
        },
        buildStatusActual()
    );

    return {
        apkVersion: APK_RELEASE_VERSION,
        langPath,
        checkCount: checks.length,
        failedCheckCount: checks.filter(item => item.status === 'fail').length,
        checks
    };
}

function renderMarkdown(report: ApkLanguageRuleReport): string {
    const lines = [
        '# APK 语言表能力规则复核报告',
        '',
        `- APK 版本：${report.apkVersion}`,
        `- 语言表：\`${report.langPath}\``,
        `- 检查项：${report.checkCount}，失败：${report.failedCheckCount}`,
        '',
        '| ID | 规则 | 证据来源 | 状态 |',
        '| --- | --- | --- | --- |'
    ];

    for (const checkItem of report.checks) {
        lines.push(`| \`${checkItem.id}\` | ${checkItem.title} | ${checkItem.source} | ${checkItem.status === 'pass' ? '通过' : '失败'} |`);
    }

    const failed = report.checks.filter(checkItem => checkItem.status === 'fail');
    if (failed.length > 0) {
        lines.push('', '## 失败明细', '');
        for (const checkItem of failed) {
            lines.push(
                `### ${checkItem.id}`,
                '',
                '期望：',
                '```json',
                JSON.stringify(checkItem.expected, null, 2),
                '```',
                '实际：',
                '```json',
                JSON.stringify(checkItem.actual, null, 2),
                '```',
                ''
            );
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildApkLanguageRuleReport(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    if (options.check && report.failedCheckCount > 0) {
        process.exitCode = 1;
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
