import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { AncientEmpiresEnv } from '../src/game/env';
import { calculateDamage, getLegalActions } from '../src/game/rules';
import { addExp } from '../src/game/abilities';
import {
    getApkSkirmishRuleConfig,
    getApkSkirmishSetupOptions,
    resolveApkSkirmishSetupSelection
} from '../src/game/apk_skirmish';
import { getApkSkirmishTrainingMapManifest } from '../src/game/apk_manifest';
import {
    APK_ABILITY_ID_TO_TYPE,
    APK_STATUS_ID_TO_TYPE,
    APK_UNIT_ID_TO_CLASS,
    APK_UNIT_CLASS_TO_ID,
    APK_ABILITY_TYPE_TO_ID,
    APK_STATUS_TYPE_TO_ID
} from '../src/game/apk_compat';
import {
    APK_TERRAIN_CONFIGS,
    APK_TERRAIN_COUNT,
    APK_TERRAIN_RECORD_SIZE,
    getSkirmishApkTerrainMappingInfo,
    type ApkTerrainMappingConfidence
} from '../src/game/apk_terrain';
import {
    APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS,
    APK_SCRIPT_API_CALL_COUNTS,
    APK_SCRIPT_DECRYPTED_JS_FILE_COUNT,
    APK_SCRIPT_LITERAL_RULE_CONFIGS,
    APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS,
    getApkScriptLiteralRuleConfig
} from '../src/game/apk_script_manifest';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getRuleConfig, getTileIncome, getUnitCost } from '../src/game/rule_config';
import { getTileDefenseBonus, getTileHealPerTurn, getTileTerrainKey } from '../src/game/terrain_rules';
import type { Action, GameState, StatusType, Unit, UnitClass } from '../src/game/types';
import { parseDexKeyRuleMethodEvidence } from './apk_dex_report';
import { buildApkLanguageRuleReportSync } from './apk_language_rule_report';
import { buildApkScriptApplicationChecks } from './apk_script_report';

interface CliOptions {
    json: boolean;
    check: boolean;
}

type CheckStatus = 'pass' | 'fail';

export interface ApkSkirmishRuleCheck {
    id: string;
    title: string;
    source: string;
    expected: unknown;
    actual: unknown;
    status: CheckStatus;
}

export interface ApkSkirmishManualVerificationItem {
    id: string;
    priority: 'P0' | 'P1' | 'P2';
    title: string;
    currentProjectAssumption: string;
    requestedEvidence: string;
}

export interface ApkSkirmishProjectProbeItem {
    id: string;
    title: string;
    purpose: string;
    currentProjectBehavior: unknown;
    suggestedVerification: string;
}

export interface ApkSkirmishRuleReport {
    generatedAt: string;
    checkCount: number;
    failedCheckCount: number;
    checks: ApkSkirmishRuleCheck[];
    projectProbeItems: ApkSkirmishProjectProbeItem[];
    manualVerificationItems: ApkSkirmishManualVerificationItem[];
}

const SD_RECRUITABLE_UNITS: UnitClass[] = [
    'commander',
    'soldier',
    'ghost',
    'mermaid',
    'archer',
    'slime',
    'dark_mage',
    'water_elemental',
    'paladin',
    'witch',
    'berserker',
    'elf',
    'wolf',
    'ice_elemental',
    'golem',
    'druid',
    'catapult',
    'wolf_archer',
    'dragon'
];

const SO_RECRUITABLE_UNITS: UnitClass[] = [
    'soldier',
    'archer',
    'water_elemental',
    'witch',
    'elf',
    'wolf',
    'golem',
    'catapult',
    'dragon'
];

const EXPECTED_SD_RECRUIT_ECONOMY = [
    { unitClass: 'commander', cost: 400, population: 0 },
    { unitClass: 'soldier', cost: 150, population: 1 },
    { unitClass: 'ghost', cost: 200, population: 1 },
    { unitClass: 'mermaid', cost: 200, population: 1 },
    { unitClass: 'archer', cost: 250, population: 1 },
    { unitClass: 'slime', cost: 250, population: 1 },
    { unitClass: 'dark_mage', cost: 300, population: 1 },
    { unitClass: 'water_elemental', cost: 300, population: 1 },
    { unitClass: 'paladin', cost: 400, population: 2 },
    { unitClass: 'witch', cost: 400, population: 2 },
    { unitClass: 'berserker', cost: 500, population: 2 },
    { unitClass: 'elf', cost: 500, population: 2 },
    { unitClass: 'wolf', cost: 600, population: 3 },
    { unitClass: 'ice_elemental', cost: 600, population: 3 },
    { unitClass: 'golem', cost: 600, population: 3 },
    { unitClass: 'druid', cost: 600, population: 3 },
    { unitClass: 'catapult', cost: 800, population: 4 },
    { unitClass: 'wolf_archer', cost: 800, population: 4 },
    { unitClass: 'dragon', cost: 1000, population: 5 }
];

const EXPECTED_SO_RECRUIT_ECONOMY = [
    { unitClass: 'soldier', cost: 150, population: 1 },
    { unitClass: 'archer', cost: 250, population: 1 },
    { unitClass: 'water_elemental', cost: 300, population: 1 },
    { unitClass: 'witch', cost: 400, population: 2 },
    { unitClass: 'elf', cost: 500, population: 2 },
    { unitClass: 'wolf', cost: 600, population: 3 },
    { unitClass: 'golem', cost: 600, population: 3 },
    { unitClass: 'catapult', cost: 800, population: 4 },
    { unitClass: 'dragon', cost: 1000, population: 5 }
];

const DEX_OPERATION_ORDER_METHOD_IDS = [
    'support-target-validation',
    'counter-attack-validation',
    'attack-status-application'
];

const LANGUAGE_RULE_REQUIRED_CHECK_IDS = [
    'language-entries',
    'support-restrictions',
    'support-reset-action',
    'combat-modifiers',
    'assault-post-attack-move',
    'aura-abilities',
    'summon-and-undead-graves',
    'single-status-slot',
    'tile-language-rules',
    'status-blind-weaken'
];

const SCRIPT_RULE_REQUIRED_APPLICATION_CHECK_IDS = [
    'rule-config-observation',
    'so-recruit-observation',
    'team-rule-observation',
    'team-rule-turn-application',
    'script-income-application',
    'stage-move-override-observation',
    'stage-status-observation'
];

const DATA_BIN_TERRAIN_MAPPING_CONFIDENCE_ORDER: ApkTerrainMappingConfidence[] = [
    'confirmed',
    'atlas',
    'approximate',
    'unmapped'
];

function printHelp() {
    console.log(`用法: npm run apk:skirmish-rule-report -- [选项]

选项:
  --json     输出 JSON
  --check    任意 APK skirmish 行为检查失败时以非 0 退出
  --help     显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        json: false,
        check: false
    };

    for (const arg of argv) {
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--check') {
            options.check = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
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

function stableStringify(value: unknown): string {
    return JSON.stringify(normalizeForCompare(value));
}

function sameValue(left: unknown, right: unknown): boolean {
    return stableStringify(left) === stableStringify(right);
}

function check(
    checks: ApkSkirmishRuleCheck[],
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

function buildManualVerificationItems(): ApkSkirmishManualVerificationItem[] {
    return [
        {
            id: 'low-confidence-tiles-t80-t83',
            priority: 'P1',
            title: '低可信 t80/t83 神庙候选语义',
            currentProjectAssumption: 't80/t83 仍按贴图、data.bin 数值和语言表近似处理，不提升为 confirmed；t80 当前全 AEM 未出现，t83 不在 skirmish 地图中。',
            requestedEvidence: '若未来地图或实机局面出现 t80/t83，分别记录是否回血、是否清中毒/致盲/虚弱、是否可占领、是否有收入、是否可招募，以及水/陆地分类表现。'
        },
        {
            id: 'water-obstacle-tiles-t81-t82',
            priority: 'P1',
            title: 't81/t82 水面障碍语义',
            currentProjectAssumption: 't81/t82 按水面障碍候选处理，不带神庙净化标签；二者只出现在非 skirmish 战役资源中。',
            requestedEvidence: '若未来对战地图使用 t81/t82，记录普通陆地单位、水系单位、飞行单位的移动消耗，以及水之子/水地形相关能力是否触发。'
        },
        {
            id: 'support-and-assault-edge-order',
            priority: 'P2',
            title: '支援与突击后移动边界顺序',
            currentProjectAssumption: '支援排除城堡捕获者/支援者/突击单位，目标必须已行动且等级不高于支援者；支援按联盟关系判友军；突击后移动使用剩余移动力，执行后不再生成二次突击移动。',
            requestedEvidence: 'DEX 已确认 Cannot support from/state 字符串引用到 Lc/a/b/a/l;.m(int,int)，且该方法检查动作状态 2 并调用 Lc/a/b/a/q;.h(Unit,int,int)；q.h 会取目标单位并委托 q.n(Unit,Unit)，q.n 的关键操作顺序为目标行动状态、已支援标记、队伍/关系校验、supporter 能力排除、等级字段比较。仍需针对性实测记录 UI 是否允许同一目标多次支援、未行动/高等级/同联盟目标的支援可用性，以及攻击前移动后突击剩余移动力和执行突击后移动后的动作结束状态。'
        },
        {
            id: 'counter-blind-storm-order',
            priority: 'P2',
            title: '致盲、反击和反击风暴顺序',
            currentProjectAssumption: '攻击前已有致盲通过射程降为 0 限制普通反击；本次主动攻击刚附加的致盲不取消同一次普通反击；反击风暴在 2 格内可反击。',
            requestedEvidence: 'DEX 已确认 Cannot attack from/state 引用到 Lc/a/b/a/l;.i(int,int)，且该方法检查动作状态 2 并调用 Lc/a/b/a/q;.a(Unit,int,int) 做攻击规则校验；q.i(Unit,Unit) 的关键操作顺序为可反击状态/队伍校验、counter_storm 能力校验、距离字面量 2、普通射程校验；q.c(Unit,Unit) 的关键操作顺序为 poisoner 能力/中毒状态应用，再到 blinder 能力/致盲状态应用；AsyncAttack 和 SyncSetUnitStatus 签名已确认。仍需针对性实测记录本次攻击附加致盲后是否影响同一次普通反击、反击风暴在 1/2/3 格和防守方死亡边界时是否反击，以及虚弱/鼓舞叠加时伤害顺序。'
        }
    ];
}

function actionTypes(actions: Action[]): string[] {
    return [...new Set(actions.map(action => action.type))].sort();
}

function createProbeUnit(
    id: string,
    ownerId: number,
    unitClass: UnitClass,
    x: number,
    y: number,
    overrides: Partial<Unit> = {}
): Unit {
    return {
        id,
        ownerId,
        unitClass,
        pos: { x, y },
        hp: 100,
        maxHp: 100,
        hasMoved: false,
        hasActed: false,
        ...overrides
    };
}

function createRoadProbeState(units: Unit[], width = 8, height = 3): GameState {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    state.currentPlayer = 0;
    state.map.width = width;
    state.map.height = height;
    state.map.tiles = Array.from({ length: height }, () => (
        Array.from({ length: width }, () => ({ terrainId: 6 as const, ownerId: null }))
    ));
    state.units = units;
    return state;
}

function createStatusUnit(id: string, status: StatusType, x: number): Unit {
    return {
        id,
        ownerId: 0,
        unitClass: 'soldier',
        pos: { x, y: 0 },
        hp: 50,
        maxHp: 100,
        hasMoved: true,
        hasActed: true,
        status: status === 'poisoned'
            ? { type: status, remainingTicks: 2 }
            : { type: status, remainingTurns: 1 }
    };
}

function buildSupportAssaultProbeBehavior() {
    const supportTarget = createProbeUnit('target', 0, 'soldier', 1, 0, {
        level: 1,
        hasMoved: true,
        hasActed: true
    });
    const supportState = createRoadProbeState([
        createProbeUnit('supporter_a', 0, 'druid', 0, 0, { level: 1 }),
        createProbeUnit('supporter_b', 0, 'druid', 0, 1, { level: 1 }),
        supportTarget,
        createProbeUnit('enemy_anchor', 1, 'soldier', 7, 2)
    ]);
    const supportEngine = new GameEngine(supportState);
    const initialSupportActions = supportEngine.getLegalActions(0).filter(action => action.type === 'support');
    supportEngine.step({ type: 'support', supporterId: 'supporter_a', targetId: 'target' });
    const afterFirstSupport = supportEngine.getState();
    supportEngine.step({ type: 'wait', unitId: 'target' });
    const secondSupportAvailableAfterTargetActsAgain = supportEngine.getLegalActions(0)
        .some(action => action.type === 'support' && action.supporterId === 'supporter_b' && action.targetId === 'target');

    const supportRestrictionState = createRoadProbeState([
        createProbeUnit('supporter', 0, 'druid', 0, 0, { level: 1 }),
        createProbeUnit('fresh_target', 0, 'soldier', 0, 1, { level: 1 }),
        createProbeUnit('high_level_target', 0, 'soldier', 0, 2, { level: 2, hasMoved: true, hasActed: true }),
        createProbeUnit('equal_level_target', 0, 'soldier', 1, 1, { level: 1, hasMoved: true, hasActed: true }),
        createProbeUnit('enemy_anchor', 1, 'soldier', 7, 2)
    ]);
    const supportRestrictionActions = new GameEngine(supportRestrictionState).getLegalActions(0);

    const alliedSupportState = createRoadProbeState([
        createProbeUnit('supporter', 0, 'druid', 0, 0, { level: 1 }),
        createProbeUnit('allied_target', 1, 'soldier', 0, 2, { level: 1, hasMoved: true, hasActed: true }),
        createProbeUnit('enemy_anchor', 2, 'soldier', 7, 2)
    ]);
    alliedSupportState.rules = {
        ...alliedSupportState.rules,
        alliances: { 0: 1, 1: 1, 2: 2 }
    };
    const alliedSupportAvailable = new GameEngine(alliedSupportState).getLegalActions(0)
        .some(action => action.type === 'support' && action.supporterId === 'supporter' && action.targetId === 'allied_target');

    const assaultState = createRoadProbeState([
        createProbeUnit('wolf', 0, 'wolf', 0, 0),
        createProbeUnit('enemy', 1, 'soldier', 3, 0)
    ], 6, 2);
    const assaultEngine = new GameEngine(assaultState);
    assaultEngine.step({ type: 'move', unitId: 'wolf', to: { x: 2, y: 0 } });
    const afterMove = assaultEngine.getState().units.find(unit => unit.id === 'wolf')!;
    assaultEngine.step({ type: 'attack', attackerId: 'wolf', targetId: 'enemy' });
    const afterAttackState = assaultEngine.getState();
    const afterAttackWolf = afterAttackState.units.find(unit => unit.id === 'wolf')!;
    const postAttackMoves = assaultEngine.getLegalActions(0)
        .filter(action => action.type === 'post_attack_move' && action.unitId === 'wolf');
    const oneStepPostAttackMove = postAttackMoves.find(action => (
        action.type === 'post_attack_move' && action.to.x === 1 && action.to.y === 0
    ));
    if (oneStepPostAttackMove) {
        assaultEngine.step(oneStepPostAttackMove);
    }
    const afterPostAttackMoveState = assaultEngine.getState();
    const afterPostAttackMoveWolf = afterPostAttackMoveState.units.find(unit => unit.id === 'wolf');

    return {
        support: {
            initialSupportActionCount: initialSupportActions.length,
            targetHasActedAfterSupport: afterFirstSupport.units.find(unit => unit.id === 'target')?.hasActed ?? null,
            targetHasMovedAfterSupport: afterFirstSupport.units.find(unit => unit.id === 'target')?.hasMoved ?? null,
            targetMovementRemainingAfterSupport: afterFirstSupport.units.find(unit => unit.id === 'target')?.movementRemaining ?? null,
            targetSupportedFlagAfterSupport: afterFirstSupport.units.find(unit => unit.id === 'target')?.hasBeenSupportedThisTurn ?? null,
            supporterHasActedAfterSupport: afterFirstSupport.units.find(unit => unit.id === 'supporter_a')?.hasActed ?? null,
            secondSupportAvailableAfterTargetActsAgain,
            freshTargetSupportAvailable: supportRestrictionActions.some(action => (
                action.type === 'support' && action.targetId === 'fresh_target'
            )),
            highLevelTargetSupportAvailable: supportRestrictionActions.some(action => (
                action.type === 'support' && action.targetId === 'high_level_target'
            )),
            equalLevelTargetSupportAvailable: supportRestrictionActions.some(action => (
                action.type === 'support' && action.targetId === 'equal_level_target'
            )),
            alliedTeamSupportAvailable: alliedSupportAvailable
        },
        assault: {
            movementRemainingAfterMove: afterMove.movementRemaining ?? null,
            movementRemainingAfterAttack: afterAttackWolf.movementRemaining ?? null,
            hasActedAfterAttack: afterAttackWolf.hasActed,
            postAttackMoveCount: postAttackMoves.length,
            farthestPostAttackMoveDistance: Math.max(
                0,
                ...postAttackMoves.map(action => (
                    action.type === 'post_attack_move'
                        ? Math.abs(action.to.x - afterAttackWolf.pos.x) + Math.abs(action.to.y - afterAttackWolf.pos.y)
                        : 0
                ))
            ),
            oneStepPostAttackMoveResolved: oneStepPostAttackMove !== undefined,
            movementRemainingAfterPostAttackMove: afterPostAttackMoveWolf?.movementRemaining ?? null,
            hasPostAttackMovedAfterPostAttackMove: afterPostAttackMoveWolf?.hasPostAttackMoved ?? null,
            postAttackMoveAvailableAfterPostAttackMove: assaultEngine.getLegalActions(0)
                .some(action => action.type === 'post_attack_move' && action.unitId === 'wolf')
        }
    };
}

function buildCounterBlindStormProbeBehavior() {
    const normalCounterState = createRoadProbeState([
        createProbeUnit('dark_mage', 0, 'dark_mage', 0, 0),
        createProbeUnit('soldier', 1, 'soldier', 1, 0)
    ]);
    const normalCounterEngine = new GameEngine(normalCounterState);
    normalCounterEngine.step({ type: 'attack', attackerId: 'dark_mage', targetId: 'soldier' });
    const normalCounterUnits = Object.fromEntries(normalCounterEngine.getState().units.map(unit => [unit.id, unit]));

    const stormCounterState = createRoadProbeState([
        createProbeUnit('wolf_archer', 0, 'wolf_archer', 0, 0),
        createProbeUnit('berserker', 1, 'berserker', 2, 0)
    ]);
    const stormCounterEngine = new GameEngine(stormCounterState);
    stormCounterEngine.step({ type: 'attack', attackerId: 'wolf_archer', targetId: 'berserker' });
    const stormCounterUnits = Object.fromEntries(stormCounterEngine.getState().units.map(unit => [unit.id, unit]));

    const rangeThreeStormState = createRoadProbeState([
        createProbeUnit('wolf_archer', 0, 'wolf_archer', 0, 0),
        createProbeUnit('berserker', 1, 'berserker', 3, 0)
    ], 6, 2);
    const rangeThreeStormEngine = new GameEngine(rangeThreeStormState);
    rangeThreeStormEngine.step({ type: 'attack', attackerId: 'wolf_archer', targetId: 'berserker' });
    const rangeThreeStormUnits = Object.fromEntries(rangeThreeStormEngine.getState().units.map(unit => [unit.id, unit]));

    const activeKillNoCounterState = createRoadProbeState([
        createProbeUnit('dragon', 0, 'dragon', 0, 0),
        createProbeUnit('soldier', 1, 'soldier', 1, 0, { hp: 5 })
    ]);
    const activeKillNoCounterEngine = new GameEngine(activeKillNoCounterState);
    activeKillNoCounterEngine.step({ type: 'attack', attackerId: 'dragon', targetId: 'soldier' });
    const activeKillNoCounterUnits = Object.fromEntries(activeKillNoCounterEngine.getState().units.map(unit => [unit.id, unit]));

    const counterKillAssaultState = createRoadProbeState([
        createProbeUnit('wolf', 0, 'wolf', 0, 0, { hp: 5 }),
        createProbeUnit('p0_anchor', 0, 'soldier', 0, 2),
        createProbeUnit('soldier', 1, 'soldier', 1, 0)
    ]);
    const counterKillAssaultEngine = new GameEngine(counterKillAssaultState);
    counterKillAssaultEngine.step({ type: 'attack', attackerId: 'wolf', targetId: 'soldier' });
    const counterKillAssaultStateFinal = counterKillAssaultEngine.getState();

    return {
        blindingAttackAgainstNormalCounter: {
            defenderStatusAfterAttack: normalCounterUnits.soldier?.status?.type ?? null,
            attackerHpAfterAttack: normalCounterUnits.dark_mage?.hp ?? null,
            normalCounterTriggered: (normalCounterUnits.dark_mage?.hp ?? 100) < 100
        },
        blindingAttackAgainstCounterStormAtRange2: {
            defenderStatusAfterAttack: stormCounterUnits.berserker?.status?.type ?? null,
            attackerHpAfterAttack: stormCounterUnits.wolf_archer?.hp ?? null,
            counterStormTriggered: (stormCounterUnits.wolf_archer?.hp ?? 100) < 100
        },
        counterStormAtRange3: {
            defenderStatusAfterAttack: rangeThreeStormUnits.berserker?.status?.type ?? null,
            attackerHpAfterAttack: rangeThreeStormUnits.wolf_archer?.hp ?? null,
            counterStormTriggered: (rangeThreeStormUnits.wolf_archer?.hp ?? 100) < 100
        },
        activeKillPreventsCounter: {
            attackerHpAfterAttack: activeKillNoCounterUnits.dragon?.hp ?? null,
            defenderAliveAfterAttack: activeKillNoCounterUnits.soldier !== undefined
        },
        counterKillClearsAssaultPostMove: {
            attackerAliveAfterCounter: counterKillAssaultStateFinal.units.some(unit => unit.id === 'wolf'),
            attackerGraveCreated: counterKillAssaultStateFinal.graves?.some(grave => (
                grave.pos.x === 0 && grave.pos.y === 0
            )) ?? false,
            postAttackMoveAvailable: counterKillAssaultEngine.getLegalActions(0).some(action => (
                action.type === 'post_attack_move' && action.unitId === 'wolf'
            ))
        }
    };
}

function buildProjectProbeItems(): ApkSkirmishProjectProbeItem[] {
    return [
        {
            id: 'support-assault-project-probe',
            title: '当前项目支援与突击边界行为快照',
            purpose: '给实机验证提供可复现对照；该项不代表 APK 已确认。',
            currentProjectBehavior: buildSupportAssaultProbeBehavior(),
            suggestedVerification: '在原版 skirmish 中测试未行动目标、更高等级目标、等等级目标和同联盟目标能否被支援；再测试同一单位被支援后再次行动，第二个支援者是否还能再次支援；最后测试狼移动后攻击，攻击后可移动范围是否等于攻击前剩余移动力，执行突击后移动后是否彻底结束该单位行动。'
        },
        {
            id: 'counter-blind-storm-project-probe',
            title: '当前项目致盲、普通反击与反击风暴顺序快照',
            purpose: '给实机验证提供可复现对照；该项不代表 APK 已确认。',
            currentProjectBehavior: buildCounterBlindStormProbeBehavior(),
            suggestedVerification: '在原版 skirmish 中分别测试攻击前已致盲的普通单位是否不能反击，以及黑魔法师/狼骑射手本次致盲攻击后普通 1 格反击是否仍发生；再测试狂战士 2 格反击风暴是否仍触发，3 格是否不触发。'
        }
    ];
}

function buildT30T31State(): GameState {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    state.currentPlayer = 1;
    state.map.width = 7;
    state.map.height = 1;
    state.map.tiles = [[
        { terrainId: 6, ownerId: null, apkTerrainId: 30 },
        { terrainId: 6, ownerId: null, apkTerrainId: 31 },
        { terrainId: 6, ownerId: null, apkTerrainId: 30 },
        { terrainId: 6, ownerId: null, apkTerrainId: 31 },
        { terrainId: 6, ownerId: null, apkTerrainId: 30 },
        { terrainId: 6, ownerId: null, apkTerrainId: 31 },
        { terrainId: 6, ownerId: null }
    ]];
    state.units = [
        createStatusUnit('t30_poisoned', 'poisoned', 0),
        createStatusUnit('t31_poisoned', 'poisoned', 1),
        createStatusUnit('t30_blinded', 'blinded', 2),
        createStatusUnit('t31_blinded', 'blinded', 3),
        createStatusUnit('t30_weakened', 'weakened', 4),
        createStatusUnit('t31_weakened', 'weakened', 5),
        {
            id: 'p1_actor',
            ownerId: 1,
            unitClass: 'soldier',
            pos: { x: 6, y: 0 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        }
    ];
    return state;
}

function summarizeUnit(unit: Unit | undefined) {
    return {
        hp: unit?.hp ?? null,
        status: unit?.status?.type ?? null,
        remainingTicks: unit?.status?.remainingTicks ?? null,
        remainingTurns: unit?.status?.remainingTurns ?? null
    };
}

function buildT30T31RecoveryActual() {
    const engine = new GameEngine(buildT30T31State());
    engine.step({ type: 'end_turn' });
    const units = Object.fromEntries(engine.getState().units.map(unit => [unit.id, unit]));

    return {
        t30Poisoned: summarizeUnit(units.t30_poisoned),
        t31Poisoned: summarizeUnit(units.t31_poisoned),
        t30Blinded: summarizeUnit(units.t30_blinded),
        t31Blinded: summarizeUnit(units.t31_blinded),
        t30Weakened: summarizeUnit(units.t30_weakened),
        t31Weakened: summarizeUnit(units.t31_weakened)
    };
}

function buildT30T31TerrainActual() {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    const t30 = { terrainId: 6 as const, ownerId: 0, apkTerrainId: 30 };
    const t31 = { terrainId: 6 as const, ownerId: 0, apkTerrainId: 31 };
    state.map.tiles[0][0] = t30;
    state.map.tiles[0][1] = t31;
    state.units[0].pos = { x: 0, y: 0 };
    state.units[0].unitClass = 'commander';
    state.players[0].gold = 1000;

    return {
        t30: {
            terrainKey: getTileTerrainKey(t30),
            healPerTurn: getTileHealPerTurn(t30),
            income: getTileIncome(state, t30),
            actionTypes: actionTypes(getLegalActions(state, 0).filter(action => (
                action.type === 'capture'
                || action.type === 'recruit_to_castle'
                || action.type === 'recruit_and_deploy'
            )))
        },
        t31: {
            terrainKey: getTileTerrainKey(t31),
            healPerTurn: getTileHealPerTurn(t31),
            income: getTileIncome(state, t31),
            actionTypes: actionTypes(getLegalActions({
                ...state,
                units: [{ ...state.units[0], pos: { x: 1, y: 0 } }, ...state.units.slice(1)]
            }, 0).filter(action => (
                action.type === 'capture'
                || action.type === 'recruit_to_castle'
                || action.type === 'recruit_and_deploy'
            )))
        }
    };
}

function buildPendingRecruitActual() {
    const emptyCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
    emptyCastleState.units.find(unit => unit.id === 'u1')!.pos = { x: 2, y: 2 };
    emptyCastleState.players[0].gold = 1000;
    const emptyCastleEngine = new GameEngine(emptyCastleState);
    const recruitToCastle = emptyCastleEngine.getLegalActions(0).find(action => (
        action.type === 'recruit_to_castle' && action.unitClass === 'soldier'
    ));
    if (!recruitToCastle) throw new Error('空城堡招募动作缺失');
    emptyCastleEngine.step(recruitToCastle);
    const emptyCastleActions = emptyCastleEngine.getLegalActions(0);

    const commanderCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
    commanderCastleState.players[0].gold = 1000;
    const commanderCastleEngine = new GameEngine(commanderCastleState);
    const recruitAndDeploy = commanderCastleEngine.getLegalActions(0).find(action => (
        action.type === 'recruit_and_deploy' && action.unitClass === 'soldier'
    ));
    if (!recruitAndDeploy) throw new Error('指挥官城堡部署招募动作缺失');
    commanderCastleEngine.step(recruitAndDeploy);
    const commanderCastleActions = commanderCastleEngine.getLegalActions(0);

    return {
        emptyCastle: {
            hasEndTurn: emptyCastleActions.some(action => action.type === 'end_turn'),
            hasSurrender: emptyCastleActions.some(action => action.type === 'surrender'),
            canControlOtherUnit: emptyCastleActions.some(action => (
                'unitId' in action && action.unitId !== emptyCastleEngine.getState().pendingUnitId
            ))
        },
        commanderCastle: {
            hasEndTurn: commanderCastleActions.some(action => action.type === 'end_turn'),
            hasSurrender: commanderCastleActions.some(action => action.type === 'surrender')
        }
    };
}

function buildRecruitExecutionActual() {
    const emptyCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
    emptyCastleState.units.find(unit => unit.id === 'u1')!.pos = { x: 2, y: 2 };
    emptyCastleState.players[0].gold = 1000;
    const emptyCastleEngine = new GameEngine(emptyCastleState);
    const recruitToCastle = emptyCastleEngine.getLegalActions(0).find(action => (
        action.type === 'recruit_to_castle' && action.unitClass === 'soldier'
    ));
    if (!recruitToCastle) throw new Error('空城堡招募动作缺失');
    emptyCastleEngine.step(recruitToCastle);
    const emptyCastleFinal = emptyCastleEngine.getState();
    const emptyCastlePendingUnit = emptyCastleFinal.units.find(unit => unit.id === emptyCastleFinal.pendingUnitId);
    const emptyCastleActions = emptyCastleEngine.getLegalActions(0);

    const commanderCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
    commanderCastleState.players[0].gold = 1000;
    const commanderCastleEngine = new GameEngine(commanderCastleState);
    const recruitAndDeploy = commanderCastleEngine.getLegalActions(0).find(action => (
        action.type === 'recruit_and_deploy'
        && action.unitClass === 'soldier'
        && action.castlePos.x === 0
        && action.castlePos.y === 0
        && action.to.x === 0
        && action.to.y === 1
    ));
    if (!recruitAndDeploy) throw new Error('指挥官城堡部署招募动作缺失');
    commanderCastleEngine.step(recruitAndDeploy);
    const commanderCastleFinal = commanderCastleEngine.getState();
    const commanderCastlePendingUnit = commanderCastleFinal.units.find(unit => unit.id === commanderCastleFinal.pendingUnitId);
    const commanderCastleActions = commanderCastleEngine.getLegalActions(0);

    return {
        emptyCastle: {
            playerGold: emptyCastleFinal.players.find(player => player.id === 0)?.gold ?? null,
            pendingUnitId: emptyCastleFinal.pendingUnitId ?? null,
            pendingUnit: {
                unitClass: emptyCastlePendingUnit?.unitClass ?? null,
                x: emptyCastlePendingUnit?.pos.x ?? null,
                y: emptyCastlePendingUnit?.pos.y ?? null,
                hasMoved: emptyCastlePendingUnit?.hasMoved ?? null,
                hasActed: emptyCastlePendingUnit?.hasActed ?? null,
                movementRemaining: emptyCastlePendingUnit?.movementRemaining ?? null,
                source: emptyCastlePendingUnit?.apkPendingRecruitSource ?? null
            },
            actionTypes: actionTypes(emptyCastleActions),
            canControlOtherUnit: emptyCastleActions.some(action => (
                'unitId' in action && action.unitId !== emptyCastleFinal.pendingUnitId
            )),
            canRecruitAgain: emptyCastleActions.some(action => (
                action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy'
            ))
        },
        commanderCastle: {
            playerGold: commanderCastleFinal.players.find(player => player.id === 0)?.gold ?? null,
            pendingUnitId: commanderCastleFinal.pendingUnitId ?? null,
            pendingUnit: {
                unitClass: commanderCastlePendingUnit?.unitClass ?? null,
                x: commanderCastlePendingUnit?.pos.x ?? null,
                y: commanderCastlePendingUnit?.pos.y ?? null,
                hasMoved: commanderCastlePendingUnit?.hasMoved ?? null,
                hasActed: commanderCastlePendingUnit?.hasActed ?? null,
                movementRemaining: commanderCastlePendingUnit?.movementRemaining ?? null,
                source: commanderCastlePendingUnit?.apkPendingRecruitSource ?? null
            },
            actionTypes: actionTypes(commanderCastleActions),
            canControlOtherUnit: commanderCastleActions.some(action => (
                'unitId' in action && action.unitId !== commanderCastleFinal.pendingUnitId
            )),
            canRecruitAgain: commanderCastleActions.some(action => (
                action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy'
            ))
        }
    };
}

function buildCommanderRecruitAvailabilityActual() {
    const sdWithCommanderState = createDemoState(getApkSkirmishRuleConfig('SD'));
    sdWithCommanderState.players[0].gold = 1000;
    const sdWithCommanderActions = getLegalActions(sdWithCommanderState, 0);

    const sdWithoutCommanderState = createDemoState(getApkSkirmishRuleConfig('SD'));
    sdWithoutCommanderState.players[0].gold = 1000;
    sdWithoutCommanderState.units = sdWithoutCommanderState.units.filter(unit => !(unit.ownerId === 0 && unit.unitClass === 'commander'));
    const sdWithoutCommanderActions = getLegalActions(sdWithoutCommanderState, 0);

    const soWithoutCommanderState = createDemoState(getApkSkirmishRuleConfig('SO'));
    soWithoutCommanderState.players[0].gold = 1000;
    soWithoutCommanderState.units = soWithoutCommanderState.units.filter(unit => !(unit.ownerId === 0 && unit.unitClass === 'commander'));
    const soWithoutCommanderActions = getLegalActions(soWithoutCommanderState, 0);

    return {
        sdWithAliveCommander: {
            canRecruitCommander: sdWithCommanderActions.some(action => (
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
                && action.unitClass === 'commander'
            ))
        },
        sdWithoutCommander: {
            canRecruitCommander: sdWithoutCommanderActions.some(action => (
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
                && action.unitClass === 'commander'
            ))
        },
        soWithoutCommander: {
            canRecruitCommander: soWithoutCommanderActions.some(action => (
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
                && action.unitClass === 'commander'
            ))
        }
    };
}

function buildCommanderRecruitCostActual() {
    const sdState = createDemoState(getApkSkirmishRuleConfig('SD'));
    const soState = createDemoState(getApkSkirmishRuleConfig('SO'));

    return {
        sdDeathCounts0To2: [0, 1, 2].map(deathCount => {
            sdState.players[0].commanderDeathCount = deathCount;
            return getUnitCost(sdState, 0, 'commander');
        }),
        soDeathCounts0To2: [0, 1, 2].map(deathCount => {
            soState.players[0].commanderDeathCount = deathCount;
            return getUnitCost(soState, 0, 'commander');
        })
    };
}

function buildCommanderAutoReviveActual() {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    state.players[1].gold = 1000;

    const attacker = state.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'soldier');
    const commander = state.units.find(unit => unit.ownerId === 1 && unit.unitClass === 'commander');
    if (!attacker || !commander) {
        throw new Error('缺少指挥官自动复活检查所需单位');
    }

    attacker.unitClass = 'dragon';
    attacker.pos = { x: 6, y: 6 };
    commander.pos = { x: 6, y: 7 };
    commander.hp = 5;
    commander.level = 2;
    commander.exp = 350;

    const engine = new GameEngine(state);
    engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id });
    const afterDeath = engine.getState();
    const hasCommanderImmediatelyAfterDeath = afterDeath.units.some(unit => (
        unit.ownerId === 1 && unit.unitClass === 'commander'
    ));

    engine.step({ type: 'end_turn' });
    const nextTurnState = engine.getState();
    const nextTurnActions = engine.getLegalActions(1);
    const commanderRecruit = nextTurnActions.find(action => (
        action.type === 'recruit_to_castle' && action.unitClass === 'commander'
    ));
    if (commanderRecruit) {
        engine.step(commanderRecruit);
    }
    const afterRecruit = engine.getState();
    const recruitedCommander = afterRecruit.units.find(unit => unit.ownerId === 1 && unit.unitClass === 'commander');

    return {
        afterDeath: {
            commanderDeathCount: afterDeath.players.find(player => player.id === 1)?.commanderDeathCount ?? null,
            commanderReserveLevel: afterDeath.players.find(player => player.id === 1)?.commanderReserveLevel ?? null,
            commanderReserveExp: afterDeath.players.find(player => player.id === 1)?.commanderReserveExp ?? null,
            playerAlive: afterDeath.players.find(player => player.id === 1)?.isAlive ?? null,
            hasCommander: hasCommanderImmediatelyAfterDeath
        },
        nextOwnTurn: {
            currentPlayer: nextTurnState.currentPlayer,
            commanderDeathCount: nextTurnState.players.find(player => player.id === 1)?.commanderDeathCount ?? null,
            playerAlive: nextTurnState.players.find(player => player.id === 1)?.isAlive ?? null,
            commanderCount: nextTurnState.units.filter(unit => unit.ownerId === 1 && unit.unitClass === 'commander').length,
            commanderRecruitCost: getUnitCost(nextTurnState, 1, 'commander'),
            canRecruitCommander: commanderRecruit !== undefined
        },
        afterRecruit: {
            gold: afterRecruit.players.find(player => player.id === 1)?.gold ?? null,
            commanderLevel: recruitedCommander?.level ?? null,
            commanderExp: recruitedCommander?.exp ?? null
        }
    };
}

function buildOverhealClippingActual() {
    const firstHealState = createDemoState(getApkSkirmishRuleConfig('SD'));
    const firstHealer = firstHealState.units.find(unit => unit.ownerId === 0)!;
    firstHealer.unitClass = 'paladin';
    firstHealer.pos = { x: 0, y: 0 };
    const firstTarget = firstHealState.units.find(unit => unit.ownerId === 0 && unit.id !== firstHealer.id)!;
    firstTarget.unitClass = 'soldier';
    firstTarget.pos = { x: 0, y: 1 };
    firstTarget.hp = 100;
    firstTarget.maxHp = 100;
    const firstHealEngine = new GameEngine(firstHealState);
    const firstHealAction = firstHealEngine.getLegalActions(0).find(action => (
        action.type === 'heal' && action.healerId === firstHealer.id && action.targetId === firstTarget.id
    ));
    if (!firstHealAction) throw new Error('治疗超上限检查缺少首次治疗动作');
    firstHealEngine.step(firstHealAction);
    const firstHealTarget = firstHealEngine.getState().units.find(unit => unit.id === firstTarget.id)!;

    const secondHealState = createDemoState(getApkSkirmishRuleConfig('SD'));
    const secondHealer = secondHealState.units.find(unit => unit.ownerId === 0)!;
    secondHealer.unitClass = 'paladin';
    secondHealer.pos = { x: 0, y: 0 };
    const secondTarget = secondHealState.units.find(unit => unit.ownerId === 0 && unit.id !== secondHealer.id)!;
    secondTarget.unitClass = 'soldier';
    secondTarget.pos = { x: 0, y: 1 };
    secondTarget.hp = 130;
    secondTarget.maxHp = 100;
    const secondHealEngine = new GameEngine(secondHealState);
    const secondHealAction = secondHealEngine.getLegalActions(0).find(action => (
        action.type === 'heal' && action.healerId === secondHealer.id && action.targetId === secondTarget.id
    ));
    if (!secondHealAction) throw new Error('治疗超上限检查缺少二次治疗动作');
    secondHealEngine.step(secondHealAction);
    const secondHealTarget = secondHealEngine.getState().units.find(unit => unit.id === secondTarget.id)!;

    const turnStartState = createDemoState(getApkSkirmishRuleConfig('SD'));
    turnStartState.currentPlayer = 1;
    const turnStartUnit = turnStartState.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'commander')!;
    turnStartUnit.hp = 130;
    turnStartUnit.maxHp = 100;
    turnStartUnit.pos = { x: 0, y: 0 };
    const turnStartEngine = new GameEngine(turnStartState);
    turnStartEngine.step({ type: 'end_turn' });
    const turnStartFinalUnit = turnStartEngine.getState().units.find(unit => unit.id === turnStartUnit.id)!;

    const levelUpState = createDemoState(getApkSkirmishRuleConfig('SD'));
    const levelUpUnit = levelUpState.units[0];
    levelUpUnit.unitClass = 'soldier';
    levelUpUnit.exp = 90;
    levelUpUnit.level = 0;
    levelUpUnit.hp = 130;
    const levelUpTriggered = addExp(levelUpUnit, 10, levelUpState.rules?.levelCap);

    const undeadPoisonState = createDemoState(getApkSkirmishRuleConfig('SD'));
    undeadPoisonState.currentPlayer = 1;
    const undead = undeadPoisonState.units.find(unit => unit.ownerId === 0)!;
    undead.unitClass = 'ghost';
    undead.hp = 130;
    undead.maxHp = 100;
    undead.status = { type: 'poisoned', remainingTicks: 2 };
    const undeadPoisonEngine = new GameEngine(undeadPoisonState);
    undeadPoisonEngine.step({ type: 'end_turn' });
    const undeadAfterPoison = undeadPoisonEngine.getState().units.find(unit => unit.id === undead.id)!;

    return {
        firstHeal: {
            hp: firstHealTarget.hp,
            maxHp: firstHealTarget.maxHp,
            exceededMaxHp: firstHealTarget.hp > firstHealTarget.maxHp
        },
        secondHeal: {
            hp: secondHealTarget.hp,
            maxHp: secondHealTarget.maxHp,
            exceededMaxHp: secondHealTarget.hp > secondHealTarget.maxHp
        },
        turnStartRecovery: {
            hp: turnStartFinalUnit.hp,
            maxHp: turnStartFinalUnit.maxHp
        },
        levelUp: {
            triggered: levelUpTriggered,
            level: levelUpUnit.level,
            hp: levelUpUnit.hp
        },
        undeadPoison: {
            hp: undeadAfterPoison.hp,
            maxHp: undeadAfterPoison.maxHp,
            remainingTicks: undeadAfterPoison.status?.type === 'poisoned'
                ? undeadAfterPoison.status.remainingTicks ?? null
                : null
        }
    };
}

function buildUndeadOverhealActual() {
    const buildPoisonResult = (hp: number) => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.currentPlayer = 1;
        const undead = state.units.find(unit => unit.ownerId === 0)!;
        undead.unitClass = 'ghost';
        undead.hp = hp;
        undead.maxHp = 100;
        undead.status = { type: 'poisoned', remainingTicks: 2 };

        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' });
        const finalUnit = engine.getState().units.find(unit => unit.id === undead.id)!;

        return {
            hp: finalUnit.hp,
            maxHp: finalUnit.maxHp,
            remainingTicks: finalUnit.status?.type === 'poisoned'
                ? finalUnit.status.remainingTicks ?? null
                : null
        };
    };

    const buildGraveResult = (hp: number) => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        state.currentPlayer = 0;
        state.graves = [
            { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
        ];
        const undead = state.units.find(unit => unit.ownerId === 0)!;
        undead.unitClass = 'ghost';
        undead.pos = { x: 0, y: 0 };
        undead.hp = hp;
        undead.maxHp = 100;

        const engine = new GameEngine(state);
        engine.step({ type: 'move', unitId: undead.id, to: { x: 0, y: 1 } });
        const finalState = engine.getState();
        const finalUnit = finalState.units.find(unit => unit.id === undead.id)!;

        return {
            hp: finalUnit.hp,
            maxHp: finalUnit.maxHp,
            graveCount: finalState.graves?.length ?? 0
        };
    };

    return {
        poison95: buildPoisonResult(95),
        poison100: buildPoisonResult(100),
        grave95: buildGraveResult(95),
        grave100: buildGraveResult(100)
    };
}

function buildDefaultCommanderIncomeActual() {
    const sdControllerRuleConfig = getApkScriptLiteralRuleConfig('assets/mods/SD/controller.js');
    const soControllerRuleConfig = getApkScriptLiteralRuleConfig('assets/mods/SO/controller.js');
    const zeroCommanderIncomeProfile = APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.ruleIncomeProfiles.find(profile => (
        profile.incomeCommanderBase === 0 && profile.incomeCommanderGrowth === 0
    ));
    const buildModeResult = (mode: 'SD' | 'SO') => {
        const baseState = createDemoState(getApkSkirmishRuleConfig(mode));
        const effectiveRules = getRuleConfig(baseState);

        const runProbe = (level: NonNullable<Unit['level']>, keepCommander = true) => {
            const state = createDemoState(getApkSkirmishRuleConfig(mode));
            state.currentPlayer = 1;
            state.players.find(player => player.id === 0)!.gold = 0;
            for (const row of state.map.tiles) {
                for (const tile of row) {
                    tile.ownerId = null;
                }
            }

            const commander = state.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'commander');
            if (!commander) throw new Error(`${mode} 指挥官收入检查缺少指挥官`);
            commander.level = level;
            if (!keepCommander) {
                state.units = state.units.filter(unit => unit.id !== commander.id);
            }

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });
            return engine.getState().players.find(player => player.id === 0)?.gold ?? null;
        };

        return {
            rules: {
                incomeCommanderBase: effectiveRules.incomeCommanderBase,
                incomeCommanderGrowth: effectiveRules.incomeCommanderGrowth
            },
            goldAfterTurnStart: {
                level0: runProbe(0),
                level1: runProbe(1),
                level2: runProbe(2),
                noCommander: runProbe(2, false)
            }
        };
    };

    return {
        staticEvidence: {
            languageConfirmsCommanderIncome: true,
            dexRuleDataConstructorDefaults: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
            dexSetterFields: { incomeCommanderBase: 'Lc/a/b/a/t/d;.s:I', incomeCommanderGrowth: 'Lc/a/b/a/t/d;.t:I' },
            sdControllerHasLiteralRuleConfig: sdControllerRuleConfig !== null,
            soControllerRuleIncome: soControllerRuleConfig?.ruleIncome ?? null,
            explicitZeroCommanderIncomeScriptCount: zeroCommanderIncomeProfile?.scriptCount ?? 0
        },
        sd: buildModeResult('SD'),
        so: buildModeResult('SO')
    };
}

function buildDefaultTrainingTerrainRiskActual() {
    const entries = getApkSkirmishTrainingMapManifest();
    const approximateIds = [...new Set(entries.flatMap(entry => entry.terrainConfidence.approximateTerrainIds))]
        .sort((left, right) => left - right);
    const unverifiedIds = approximateIds.filter(apkTerrainId => ![30, 31].includes(apkTerrainId));
    const lowConfidenceIdsInDefaultTraining = approximateIds.filter(apkTerrainId => (
        [80, 81, 82, 83].includes(apkTerrainId)
    ));

    return {
        mapCount: entries.length,
        approximateTerrainIds: approximateIds,
        unverifiedApproximateTerrainIds: unverifiedIds,
        lowConfidenceIdsInDefaultTraining,
        mapsWithApproximateTerrain: entries
            .filter(entry => entry.terrainConfidence.approximateTileCount > 0)
            .map(entry => ({
                name: entry.name,
                approximateTerrainIds: entry.terrainConfidence.approximateTerrainIds,
                approximateTileCount: entry.terrainConfidence.approximateTileCount
            }))
    };
}

function buildDexOperationOrderEvidenceActual() {
    const dexPath = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack', 'classes.dex');
    const evidence = parseDexKeyRuleMethodEvidence(readFileSync(dexPath));
    const evidenceById = Object.fromEntries(evidence.map(item => [item.id, item]));
    const requiredOperationOrders = DEX_OPERATION_ORDER_METHOD_IDS.map(id => {
        const item = evidenceById[id];

        return {
            id,
            operationOrderMatched: item?.matchedExpectations.some(expectation => expectation.startsWith('operation-order:')) ?? false,
            missingOperationOrderExpectations: item?.missingExpectations
                .filter(expectation => expectation.startsWith('operation-order:')) ?? null
        };
    });

    return {
        dexPath: path.relative(process.cwd(), dexPath).replaceAll(path.sep, '/'),
        methodCount: evidence.length,
        missingExpectationCount: evidence.reduce((count, item) => count + item.missingExpectations.length, 0),
        requiredOperationOrders
    };
}

function buildLanguageRuleEvidenceActual() {
    const report = buildApkLanguageRuleReportSync();
    const checksById = Object.fromEntries(report.checks.map(item => [item.id, item]));

    return {
        langPath: path.relative(process.cwd(), report.langPath).replaceAll(path.sep, '/'),
        checkCount: report.checkCount,
        failedCheckCount: report.failedCheckCount,
        requiredChecks: LANGUAGE_RULE_REQUIRED_CHECK_IDS.map(id => ({
            id,
            status: checksById[id]?.status ?? null
        }))
    };
}

function buildScriptRuleEvidenceActual() {
    const applicationChecks = buildApkScriptApplicationChecks();
    const applicationChecksById = Object.fromEntries(applicationChecks.map(item => [item.id, item]));

    return {
        manifestScriptCount: APK_SCRIPT_DECRYPTED_JS_FILE_COUNT,
        apiCallKindCount: Object.keys(APK_SCRIPT_API_CALL_COUNTS).length,
        literalRuleConfigCount: APK_SCRIPT_LITERAL_RULE_CONFIGS.length,
        literalStageStateConfigCount: APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS.length,
        applicationCheckCount: applicationChecks.length,
        failedApplicationCheckCount: applicationChecks.filter(item => item.status === 'fail').length,
        requiredApplicationChecks: SCRIPT_RULE_REQUIRED_APPLICATION_CHECK_IDS.map(id => ({
            id,
            status: applicationChecksById[id]?.status ?? null
        }))
    };
}

function buildDataBinManifestEvidenceActual() {
    const apkUnitClasses = Object.values(APK_UNIT_ID_TO_CLASS);
    const projectUnitClasses = Object.keys(UNIT_CONFIGS) as UnitClass[];
    const terrainMappingSummary = DATA_BIN_TERRAIN_MAPPING_CONFIDENCE_ORDER.reduce(
        (summary, confidence) => ({ ...summary, [confidence]: 0 }),
        {} as Record<ApkTerrainMappingConfidence, number>
    );
    for (const config of APK_TERRAIN_CONFIGS) {
        terrainMappingSummary[getSkirmishApkTerrainMappingInfo(config.id).confidence] += 1;
    }

    return {
        unitClassCount: projectUnitClasses.length,
        apkUnitIdCount: Object.keys(APK_UNIT_ID_TO_CLASS).length,
        projectMissingApkUnitClasses: apkUnitClasses.filter(unitClass => !(unitClass in UNIT_CONFIGS)),
        apkMissingProjectUnitClasses: projectUnitClasses.filter(unitClass => APK_UNIT_CLASS_TO_ID[unitClass] === undefined),
        projectCostedUnitCount: projectUnitClasses.filter(unitClass => UNIT_CONFIGS[unitClass].cost !== null).length,
        ruleDrivenUnitCosts: projectUnitClasses
            .filter(unitClass => UNIT_CONFIGS[unitClass].cost === null)
            .sort(),
        abilityIdCount: Object.keys(APK_ABILITY_ID_TO_TYPE).length,
        abilityRoundTripCount: Object.values(APK_ABILITY_ID_TO_TYPE)
            .filter(ability => APK_ABILITY_TYPE_TO_ID[ability] !== undefined).length,
        statusIdCount: Object.keys(APK_STATUS_ID_TO_TYPE).length,
        statusRoundTripCount: Object.values(APK_STATUS_ID_TO_TYPE)
            .filter(status => APK_STATUS_TYPE_TO_ID[status] !== undefined).length,
        terrainCount: APK_TERRAIN_CONFIGS.length,
        expectedTerrainCount: APK_TERRAIN_COUNT,
        terrainRecordSize: APK_TERRAIN_RECORD_SIZE,
        terrainMappingSummary
    };
}

function buildTerrainDefenseCombatActual() {
    const buildState = (defenderClass: UnitClass): GameState => {
        const state = createDemoState(getApkSkirmishRuleConfig('SD'));
        const attacker = state.units.find(unit => unit.ownerId === 0)!;
        const defender = state.units.find(unit => unit.ownerId === 1)!;
        attacker.unitClass = 'soldier';
        defender.unitClass = defenderClass;
        attacker.pos = { x: 1, y: 1 };
        defender.pos = { x: 1, y: 2 };
        attacker.hp = 100;
        defender.hp = 100;
        state.map.tiles[2][1] = { terrainId: 6, ownerId: null, apkTerrainId: 33 };
        return state;
    };

    const soldierState = buildState('soldier');
    const flyingState = buildState('ghost');

    return {
        apkTile: {
            id: 33,
            defenseBonus: getTileDefenseBonus(soldierState.map.tiles[2][1])
        },
        soldierDefenderDamage: calculateDamage(soldierState, 'u1', 'u2'),
        flyingDefenderDamage: calculateDamage(flyingState, 'u1', 'u2')
    };
}

function buildRecruitEconomyActual() {
    const buildModeResult = (mode: 'SD' | 'SO') => {
        const state = createDemoState(getApkSkirmishRuleConfig(mode));
        const recruitableUnits = getRuleConfig(state).recruitableUnits ?? [];
        return recruitableUnits.map(unitClass => ({
            unitClass,
            cost: getUnitCost(state, 0, unitClass),
            population: UNIT_CONFIGS[unitClass].population
        }));
    };

    return {
        sd: buildModeResult('SD'),
        so: buildModeResult('SO')
    };
}

function buildSetupApplicationActual() {
    const setupState = createDemoState(getApkSkirmishRuleConfig('SD', {
        initialGold: 450,
        unitLimit: 20,
        levelCap: 1
    }));

    const unitLimitState = createDemoState(getApkSkirmishRuleConfig('SD', {
        initialGold: 1000,
        unitLimit: 20,
        levelCap: 3
    }));
    const occupiedPositions = new Set(unitLimitState.units.map(unit => `${unit.pos.x},${unit.pos.y}`));
    for (let i = unitLimitState.units.filter(unit => unit.ownerId === 0).length; i < 20; i += 1) {
        const pos = { x: i % unitLimitState.map.width, y: Math.floor(i / unitLimitState.map.width) + 1 };
        if (pos.y >= unitLimitState.map.height || occupiedPositions.has(`${pos.x},${pos.y}`)) continue;
        occupiedPositions.add(`${pos.x},${pos.y}`);
        unitLimitState.units.push({
            id: `limit_${i}`,
            ownerId: 0,
            unitClass: 'soldier',
            pos,
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: 0,
            exp: 0
        });
    }
    const unitLimitActions = getLegalActions(unitLimitState, 0);

    const levelCapState = createDemoState(getApkSkirmishRuleConfig('SD', {
        initialGold: 300,
        unitLimit: 30,
        levelCap: 1
    }));
    levelCapState.units = [
        {
            id: 'attacker',
            ownerId: 0,
            unitClass: 'soldier',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: 1,
            exp: 600
        },
        {
            id: 'defender',
            ownerId: 1,
            unitClass: 'soldier',
            pos: { x: 0, y: 1 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: 0,
            exp: 0
        }
    ];
    const levelCapEngine = new GameEngine(levelCapState);
    levelCapEngine.step({ type: 'attack', attackerId: 'attacker', targetId: 'defender' });
    const finalAttacker = levelCapEngine.getState().units.find(unit => unit.id === 'attacker');

    return {
        playerGold: setupState.players.map(player => player.gold),
        rules: {
            initialGold: setupState.rules?.initialGold ?? null,
            unitLimit: setupState.rules?.unitLimit ?? null,
            levelCap: setupState.rules?.levelCap ?? null
        },
        unitLimitBlocksRecruit: !unitLimitActions.some(action => (
            action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy'
        )),
        levelAfterAtCapAttack: finalAttacker?.level ?? null,
        expAfterAtCapAttack: finalAttacker?.exp ?? null
    };
}

function buildTrainingObservationActual() {
    const state = createDemoState(getApkSkirmishRuleConfig('SD', {
        initialGold: 450,
        unitLimit: 20,
        levelCap: 1
    }));
    const env = new AncientEmpiresEnv({ initialState: state });
    const observation = env.getObservation();
    const player0 = observation.players.find(player => player.id === 0);
    const commander = observation.units.find(unit => unit.id === player0?.commanderUnitId);
    const legalActions = env.getLegalActions();

    const pendingState = createDemoState(getApkSkirmishRuleConfig('SD'));
    pendingState.units.find(unit => unit.id === 'u1')!.pos = { x: 2, y: 2 };
    pendingState.players[0].gold = 1000;
    const pendingEnv = new AncientEmpiresEnv({ initialState: pendingState });
    const recruitToCastle = pendingEnv.getLegalActions().find(action => (
        action.type === 'recruit_to_castle' && action.unitClass === 'soldier'
    ));
    if (!recruitToCastle) throw new Error('Observation pending 测试缺少空城堡招募动作');
    const pendingResult = pendingEnv.stepAction(recruitToCastle);
    const pendingObservation = pendingResult.observation;
    const pendingUnitId = pendingObservation.pendingUnitId ?? null;
    const pendingUnit = pendingObservation.units.find(unit => unit.id === pendingUnitId);

    return {
        rules: {
            initialGold: observation.rules.initialGold,
            unitLimit: observation.rules.unitLimit,
            levelCap: observation.rules.levelCap,
            allowSurrender: observation.rules.allowSurrender,
            commanderRecruitBaseCost: observation.rules.commanderRecruitBaseCost
        },
        player0: {
            gold: player0?.gold ?? null,
            unitCount: player0?.unitCount ?? null,
            population: player0?.population ?? null,
            unitLimit: player0?.unitLimit ?? null,
            recruitableUnitCount: player0?.recruitableUnits.length ?? null,
            includesCommander: player0?.recruitableUnits.includes('commander') ?? null,
            commanderRecruitCost: player0?.recruitCosts.commander ?? null,
            commanderUnitId: player0?.commanderUnitId ?? null
        },
        commander: {
            id: commander?.id ?? null,
            isCommander: commander?.isCommander ?? null,
            population: commander?.population ?? null,
            cost: commander?.cost ?? null
        },
        legalActions: {
            hasSurrender: legalActions.some(action => action.type === 'surrender'),
            hasCommanderRecruitWhileAlive: legalActions.some(action => (
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
                && action.unitClass === 'commander'
            )),
            hasSoldierRecruit: legalActions.some(action => (
                (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
                && action.unitClass === 'soldier'
            ))
        },
        pending: {
            pendingUnitId,
            pendingUnitIsMarked: pendingUnit?.isPending ?? null,
            pendingUnitSource: pendingUnit?.apkPendingRecruitSource ?? null,
            observationPendingMatchesState: pendingUnitId === pendingResult.state.pendingUnitId
        }
    };
}

function buildSurrenderActual() {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    state.map.tiles[1][1].terrainId = 9;
    state.map.tiles[1][1].ownerId = 0;
    const engine = new GameEngine(state);
    engine.step({ type: 'surrender' });
    const finalState = engine.getState();

    return {
        playerAlive: finalState.players.find(player => player.id === 0)?.isAlive ?? null,
        ownUnitCount: finalState.units.filter(unit => unit.ownerId === 0).length,
        ownedBuildingCount: finalState.map.tiles.flat().filter(tile => tile.ownerId === 0).length,
        winner: finalState.winner
    };
}

function buildDefeatActual() {
    const castleOnlyState = createDemoState(getApkSkirmishRuleConfig('SD'));
    castleOnlyState.units = castleOnlyState.units.filter(unit => unit.ownerId !== 1);
    const castleOnlyEngine = new GameEngine(castleOnlyState);
    castleOnlyEngine.step({ type: 'wait', unitId: 'u3' });
    const castleOnlyFinal = castleOnlyEngine.getState();

    const noCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
    noCastleState.units = noCastleState.units.filter(unit => unit.ownerId !== 1);
    noCastleState.map.tiles[7][7].ownerId = null;
    const noCastleEngine = new GameEngine(noCastleState);
    noCastleEngine.step({ type: 'wait', unitId: 'u3' });
    const noCastleFinal = noCastleEngine.getState();

    return {
        noUnitsButHasCastle: {
            playerAlive: castleOnlyFinal.players.find(player => player.id === 1)?.isAlive ?? null,
            winner: castleOnlyFinal.winner
        },
        noUnitsAndNoCastle: {
            playerAlive: noCastleFinal.players.find(player => player.id === 1)?.isAlive ?? null,
            winner: noCastleFinal.winner
        }
    };
}

function buildCastleIntruderActual() {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    state.units = state.units.filter(unit => unit.ownerId !== 1);
    const intruder = state.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'soldier');
    if (!intruder) throw new Error('缺少用于压城堡测试的单位');
    intruder.pos = { x: 7, y: 7 };
    intruder.hp = 100;
    state.currentPlayer = 0;

    const engine = new GameEngine(state);
    engine.step({ type: 'end_turn' });
    const finalState = engine.getState();

    return {
        intruderHp: finalState.units.find(unit => unit.id === intruder.id)?.hp ?? null,
        player1Alive: finalState.players.find(player => player.id === 1)?.isAlive ?? null,
        currentPlayer: finalState.currentPlayer
    };
}

export function buildApkSkirmishRuleReport(generatedAt = new Date().toISOString()): ApkSkirmishRuleReport {
    const checks: ApkSkirmishRuleCheck[] = [];
    const setupOptions = getApkSkirmishSetupOptions();
    const sdRules = getApkSkirmishRuleConfig('SD');
    const soRules = getApkSkirmishRuleConfig('SO');

    check(
        checks,
        'setup-options',
        '遭遇战开局设置范围',
        '用户 2026-06-30 实机确认',
        {
            initialGold: { default: 300, min: 0, max: 2000, step: 50 },
            unitLimit: { default: 30, min: 20, max: 100, step: 10 },
            levelCap: { default: 3, min: 0, max: 9, step: 1 },
            modes: { default: 'SD', options: ['SD', 'SO'], labels: { SD: '默认', SO: '原版' } }
        },
        setupOptions
    );

    check(
        checks,
        'setup-validation',
        '遭遇战开局设置校验',
        '用户 2026-06-30 实机确认',
        {
            valid: { initialGold: 450, unitLimit: 40, levelCap: 9 },
            invalidErrors: [
                'APK skirmish 起始金币 必须按 50 递增',
                'APK skirmish 单位上限 必须在 20-100 范围内',
                'APK skirmish 等级上限 必须在 0-9 范围内'
            ]
        },
        {
            valid: resolveApkSkirmishSetupSelection({ initialGold: 450, unitLimit: 40, levelCap: 9 }),
            invalidErrors: [
                () => resolveApkSkirmishSetupSelection({ initialGold: 425 }),
                () => resolveApkSkirmishSetupSelection({ unitLimit: 10 }),
                () => resolveApkSkirmishSetupSelection({ levelCap: 10 as never })
            ].map(fn => {
                try {
                    fn();
                    return '未报错';
                } catch (error) {
                    return error instanceof Error ? error.message : String(error);
                }
            })
        }
    );

    check(
        checks,
        'sd-recruitable-units',
        'SD 默认可招募单位',
        '用户 2026-06-30 实机确认',
        {
            recruitableUnits: SD_RECRUITABLE_UNITS,
            includesCommander: true,
            excludesSkeleton: true,
            excludesCrystal: true,
            commanderRecruitBaseCost: 400
        },
        {
            recruitableUnits: sdRules.recruitableUnits,
            includesCommander: sdRules.recruitableUnits?.includes('commander') ?? false,
            excludesSkeleton: !(sdRules.recruitableUnits?.includes('skeleton') ?? false),
            excludesCrystal: !(sdRules.recruitableUnits?.includes('crystal') ?? false),
            commanderRecruitBaseCost: sdRules.commanderRecruitBaseCost
        }
    );

    check(
        checks,
        'so-recruitable-units',
        'SO 默认可招募单位',
        'SO/controller.js 字面量规则与项目映射',
        {
            recruitableUnits: SO_RECRUITABLE_UNITS,
            commanderRecruitBaseCost: null
        },
        {
            recruitableUnits: soRules.recruitableUnits,
            commanderRecruitBaseCost: soRules.commanderRecruitBaseCost
        }
    );

    check(
        checks,
        'recruit-economy',
        'SD/SO 默认招募费用和人口占用',
        'APK data.bin 单位 cost/population + 用户 2026-06-30 实机确认 SD 招募列表 + SO/controller.js 字面量招募列表',
        {
            sd: EXPECTED_SD_RECRUIT_ECONOMY,
            so: EXPECTED_SO_RECRUIT_ECONOMY
        },
        buildRecruitEconomyActual()
    );

    check(
        checks,
        't30-t31-recovery',
        't30/t31 回血与清状态差异',
        '用户 2026-06-30 实机确认',
        {
            t30Poisoned: { hp: 40, status: 'poisoned', remainingTicks: 1, remainingTurns: null },
            t31Poisoned: { hp: 60, status: null, remainingTicks: null, remainingTurns: null },
            t30Blinded: { hp: 70, status: 'blinded', remainingTicks: null, remainingTurns: 1 },
            t31Blinded: { hp: 70, status: null, remainingTicks: null, remainingTurns: null },
            t30Weakened: { hp: 70, status: 'weakened', remainingTicks: null, remainingTurns: 1 },
            t31Weakened: { hp: 70, status: null, remainingTicks: null, remainingTurns: null }
        },
        buildT30T31RecoveryActual()
    );

    check(
        checks,
        't30-t31-terrain-semantics',
        't30/t31 不占领/不收入/不招募',
        '用户 2026-06-30 实机确认',
        {
            t30: { terrainKey: 'camp', healPerTurn: 20, income: 0, actionTypes: [] },
            t31: { terrainKey: 'temple', healPerTurn: 20, income: 0, actionTypes: [] }
        },
        buildT30T31TerrainActual()
    );

    check(
        checks,
        'terrain-defense-combat',
        'APK 地形防御参与战斗结算',
        'APK data.bin 地形 defenseBonus + 用户 2026-06-30 实机确认地形防御存在',
        {
            apkTile: { id: 33, defenseBonus: 20 },
            soldierDefenderDamage: 30,
            flyingDefenderDamage: 50
        },
        buildTerrainDefenseCombatActual()
    );

    check(
        checks,
        'pending-recruit-menu',
        '招募 pending 与 stacked 菜单限制',
        '用户 2026-06-30 实机确认',
        {
            emptyCastle: { hasEndTurn: true, hasSurrender: true, canControlOtherUnit: false },
            commanderCastle: { hasEndTurn: false, hasSurrender: false }
        },
        buildPendingRecruitActual()
    );

    check(
        checks,
        'recruit-execution-state',
        '招募动作执行后的 pending 来源、扣费和行动标记',
        '用户 2026-06-30 实机确认 + GameEngine pending 状态',
        {
            emptyCastle: {
                playerGold: 850,
                pendingUnitId: 'u_100',
                pendingUnit: {
                    unitClass: 'soldier',
                    x: 0,
                    y: 0,
                    hasMoved: false,
                    hasActed: false,
                    movementRemaining: null,
                    source: 'empty_castle'
                },
                actionTypes: ['end_turn', 'move', 'surrender', 'wait'],
                canControlOtherUnit: false,
                canRecruitAgain: false
            },
            commanderCastle: {
                playerGold: 850,
                pendingUnitId: 'u_100',
                pendingUnit: {
                    unitClass: 'soldier',
                    x: 0,
                    y: 1,
                    hasMoved: true,
                    hasActed: false,
                    movementRemaining: 0,
                    source: 'commander_castle'
                },
                actionTypes: ['wait'],
                canControlOtherUnit: false,
                canRecruitAgain: false
            }
        },
        buildRecruitExecutionActual()
    );

    check(
        checks,
        'commander-recruit-availability',
        'SD 指挥官不在场时可重招募，SO 不招募指挥官',
        '用户 2026-06-30 实机确认',
        {
            sdWithAliveCommander: { canRecruitCommander: false },
            sdWithoutCommander: { canRecruitCommander: true },
            soWithoutCommander: { canRecruitCommander: false }
        },
        buildCommanderRecruitAvailabilityActual()
    );

    check(
        checks,
        'commander-recruit-cost-profile',
        '当前 SD/SO 指挥官重招募费用曲线',
        'data.bin 指挥官基础价格字段 + 用户 2026-07-01 实机确认每死一次 +100',
        {
            sdDeathCounts0To2: [400, 500, 600],
            soDeathCounts0To2: [null, null, null]
        },
        buildCommanderRecruitCostActual()
    );

    check(
        checks,
        'commander-no-auto-revive',
        'skirmish 指挥官死亡后不自动复活且重招募继承等级经验',
        'DEX revive 关键词分组 0 命中 + 用户 2026-07-01 实机确认 skirmish 只能城堡重招募且继承等级经验',
        {
            afterDeath: {
                commanderDeathCount: 1,
                commanderReserveLevel: 2,
                commanderReserveExp: 350,
                playerAlive: true,
                hasCommander: false
            },
            nextOwnTurn: {
                currentPlayer: 1,
                commanderDeathCount: 1,
                playerAlive: true,
                commanderCount: 0,
                commanderRecruitCost: 500,
                canRecruitCommander: true
            },
            afterRecruit: {
                gold: 600,
                commanderLevel: 2,
                commanderExp: 350
            }
        },
        buildCommanderAutoReviveActual()
    );

    check(
        checks,
        'overheal-clipping',
        '治疗超上限后的回合开始裁剪行为',
        'APK 语言表确认治疗师可超上限 + 用户 2026-07-01 实机确认下一己方回合开始先裁剪到最大生命',
        {
            firstHeal: { hp: 140, maxHp: 100, exceededMaxHp: true },
            secondHeal: { hp: 170, maxHp: 100, exceededMaxHp: true },
            turnStartRecovery: { hp: 100, maxHp: 100 },
            levelUp: { triggered: true, level: 1, hp: 130 },
            undeadPoison: { hp: 100, maxHp: 100, remainingTicks: 1 }
        },
        buildOverhealClippingActual()
    );

    check(
        checks,
        'undead-overheal',
        '当前默认亡灵被动回血上限',
        'APK 语言表确认亡灵中毒/墓碑转回血 + 用户 2026-07-01 实机确认最多回复到生命上限',
        {
            poison95: { hp: 100, maxHp: 100, remainingTicks: 1 },
            poison100: { hp: 100, maxHp: 100, remainingTicks: 1 },
            grave95: { hp: 100, maxHp: 100, graveCount: 0 },
            grave100: { hp: 100, maxHp: 100, graveCount: 0 }
        },
        buildUndeadOverhealActual()
    );

    check(
        checks,
        'default-commander-income',
        '当前默认 skirmish 指挥官收入',
        'APK 语言表确认指挥官存活收入机制；DEX 规则数据构造器确认默认 base=50/growth=25；SD/SO controller 未显式覆盖收入',
        {
            staticEvidence: {
                languageConfirmsCommanderIncome: true,
                dexRuleDataConstructorDefaults: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                dexSetterFields: { incomeCommanderBase: 'Lc/a/b/a/t/d;.s:I', incomeCommanderGrowth: 'Lc/a/b/a/t/d;.t:I' },
                sdControllerHasLiteralRuleConfig: false,
                soControllerRuleIncome: null,
                explicitZeroCommanderIncomeScriptCount: 7
            },
            sd: {
                rules: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 50, level1: 75, level2: 100, noCommander: 0 }
            },
            so: {
                rules: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 50, level1: 75, level2: 100, noCommander: 0 }
            }
        },
        buildDefaultCommanderIncomeActual()
    );

    check(
        checks,
        'default-training-terrain-risk',
        '默认 skirmish 训练地图不包含未验证 t80/t81/t82/t83',
        'APK skirmish manifest + 已确认 t30/t31 approximate 放行策略',
        {
            mapCount: 20,
            approximateTerrainIds: [30, 31],
            unverifiedApproximateTerrainIds: [],
            lowConfidenceIdsInDefaultTraining: [],
            mapsWithApproximateTerrain: [
                { name: '(2) Mourningstar.aem', approximateTerrainIds: [30], approximateTileCount: 2 },
                { name: '(4) The Crucible.aem', approximateTerrainIds: [31], approximateTileCount: 1 },
                { name: '(4) Waterways.aem', approximateTerrainIds: [31], approximateTileCount: 2 },
                { name: '(4) Winterstorm.aem', approximateTerrainIds: [31], approximateTileCount: 4 }
            ]
        },
        buildDefaultTrainingTerrainRiskActual()
    );

    check(
        checks,
        'dex-operation-order-evidence',
        'DEX 关键规则操作顺序证据',
        'classes.dex 关键方法字节码引用顺序；支援目标、反击风暴和攻击附加状态已进入 operation-order 门禁',
        {
            dexPath: 'APK/_analysis/unpack/classes.dex',
            methodCount: 8,
            missingExpectationCount: 0,
            requiredOperationOrders: DEX_OPERATION_ORDER_METHOD_IDS.map(id => ({
                id,
                operationOrderMatched: true,
                missingOperationOrderExpectations: []
            }))
        },
        buildDexOperationOrderEvidenceActual()
    );

    check(
        checks,
        'language-rule-evidence',
        'APK 文案支撑的能力和状态规则证据',
        'assets/languages/en.lang + apk:language-rule-report 28 项能力/状态/建筑地形行为检查',
        {
            langPath: 'APK/_analysis/unpack/assets/languages/en.lang',
            checkCount: 28,
            failedCheckCount: 0,
            requiredChecks: LANGUAGE_RULE_REQUIRED_CHECK_IDS.map(id => ({
                id,
                status: 'pass'
            }))
        },
        buildLanguageRuleEvidenceActual()
    );

    check(
        checks,
        'script-rule-evidence',
        'APK 脚本规则配置证据',
        '已归档脚本 manifest + 7 项脚本规则/状态配置应用检查；完整 DES 解密由 apk:script-report 单独门禁',
        {
            manifestScriptCount: 27,
            apiCallKindCount: 60,
            literalRuleConfigCount: 26,
            literalStageStateConfigCount: 4,
            applicationCheckCount: 7,
            failedApplicationCheckCount: 0,
            requiredApplicationChecks: SCRIPT_RULE_REQUIRED_APPLICATION_CHECK_IDS.map(id => ({
                id,
                status: 'pass'
            }))
        },
        buildScriptRuleEvidenceActual()
    );

    check(
        checks,
        'data-bin-manifest-evidence',
        'APK data.bin 单位和地形归档证据',
        '已归档 data.bin 单位/能力/状态/地形 manifest；完整 DES 解密由 apk:unit-report 和 apk:terrain-report 单独门禁',
        {
            unitClassCount: 21,
            apkUnitIdCount: 21,
            projectMissingApkUnitClasses: [],
            apkMissingProjectUnitClasses: [],
            projectCostedUnitCount: 18,
            ruleDrivenUnitCosts: ['commander', 'crystal', 'skeleton'],
            abilityIdCount: 26,
            abilityRoundTripCount: 26,
            statusIdCount: 4,
            statusRoundTripCount: 4,
            terrainCount: 84,
            expectedTerrainCount: 84,
            terrainRecordSize: 40,
            terrainMappingSummary: {
                confirmed: 4,
                atlas: 73,
                approximate: 7,
                unmapped: 0
            }
        },
        buildDataBinManifestEvidenceActual()
    );

    check(
        checks,
        'setup-applied-to-gameplay',
        '遭遇战开局设置实际进入训练状态并约束规则',
        '用户 2026-06-30 实机确认的开局设置范围 + RuleConfig 行为',
        {
            playerGold: [450, 450],
            rules: { initialGold: 450, unitLimit: 20, levelCap: 1 },
            unitLimitBlocksRecruit: true,
            levelAfterAtCapAttack: 1,
            expAfterAtCapAttack: 600
        },
        buildSetupApplicationActual()
    );

    check(
        checks,
        'training-observation-skirmish-rules',
        '训练 observation 暴露 skirmish 规则、费用、指挥官和 pending 状态',
        'AncientEmpiresEnv observation + APK skirmish RuleConfig',
        {
            rules: {
                initialGold: 450,
                unitLimit: 20,
                levelCap: 1,
                allowSurrender: true,
                commanderRecruitBaseCost: 400
            },
            player0: {
                gold: 450,
                unitCount: 2,
                population: 1,
                unitLimit: 20,
                recruitableUnitCount: 19,
                includesCommander: true,
                commanderRecruitCost: 400,
                commanderUnitId: 'u1'
            },
            commander: {
                id: 'u1',
                isCommander: true,
                population: 0,
                cost: 400
            },
            legalActions: {
                hasSurrender: true,
                hasCommanderRecruitWhileAlive: false,
                hasSoldierRecruit: true
            },
            pending: {
                pendingUnitId: 'u_100',
                pendingUnitIsMarked: true,
                pendingUnitSource: 'empty_castle',
                observationPendingMatchesState: true
            }
        },
        buildTrainingObservationActual()
    );

    check(
        checks,
        'surrender',
        'skirmish 投降结算',
        '用户 2026-06-30 实机确认',
        { playerAlive: false, ownUnitCount: 0, ownedBuildingCount: 0, winner: 1 },
        buildSurrenderActual()
    );

    check(
        checks,
        'defeat-condition',
        'skirmish 淘汰条件',
        'SD/SO controller.js 与用户 2026-06-30 实机确认',
        {
            noUnitsButHasCastle: { playerAlive: true, winner: null },
            noUnitsAndNoCastle: { playerAlive: false, winner: 0 }
        },
        buildDefeatActual()
    );

    check(
        checks,
        'castle-intruder-damage',
        '敌军压己方城堡时回合开始扣血并跳过无操作队伍',
        '用户 2026-06-30 实机确认',
        { intruderHp: 50, player1Alive: true, currentPlayer: 0 },
        buildCastleIntruderActual()
    );

    return {
        generatedAt,
        checkCount: checks.length,
        failedCheckCount: checks.filter(item => item.status === 'fail').length,
        checks,
        projectProbeItems: buildProjectProbeItems(),
        manualVerificationItems: buildManualVerificationItems()
    };
}

function renderMarkdown(report: ApkSkirmishRuleReport): string {
    const lines = [
        '# APK skirmish 对战规则复核报告',
        '',
        `- 生成时间：${report.generatedAt}`,
        `- 检查项：${report.checkCount}，失败：${report.failedCheckCount}`,
        '',
        '| ID | 规则 | 证据来源 | 状态 |',
        '| --- | --- | --- | --- |'
    ];

    for (const checkItem of report.checks) {
        lines.push(`| \`${checkItem.id}\` | ${checkItem.title} | ${checkItem.source} | ${checkItem.status === 'pass' ? '通过' : '失败'} |`);
    }

    lines.push(
        '',
        '## 当前项目边界探针',
        '',
        '| ID | 目的 | 建议验证 |',
        '| --- | --- | --- |'
    );
    for (const item of report.projectProbeItems) {
        lines.push(`| \`${item.id}\` | ${item.purpose} | ${item.suggestedVerification} |`);
    }

    lines.push(
        '',
        '## 待实机验证',
        '',
        '| 优先级 | ID | 规则 | 当前项目假设 | 需要回填的 APK 证据 |',
        '| --- | --- | --- | --- | --- |'
    );
    for (const item of report.manualVerificationItems) {
        lines.push(`| ${item.priority} | \`${item.id}\` | ${item.title} | ${item.currentProjectAssumption} | ${item.requestedEvidence} |`);
    }

    const failed = report.checks.filter(checkItem => checkItem.status === 'fail');
    if (failed.length > 0) {
        lines.push('', '## 失败明细', '');
        for (const checkItem of failed) {
            lines.push(
                `### ${checkItem.id}`,
                '',
                `期望：`,
                '```json',
                JSON.stringify(checkItem.expected, null, 2),
                '```',
                `实际：`,
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
    const report = buildApkSkirmishRuleReport();

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
