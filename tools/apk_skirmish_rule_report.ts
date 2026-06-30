import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { AncientEmpiresEnv } from '../src/game/env';
import { getLegalActions } from '../src/game/rules';
import {
    getApkSkirmishRuleConfig,
    getApkSkirmishSetupOptions,
    resolveApkSkirmishSetupSelection
} from '../src/game/apk_skirmish';
import { getTileIncome } from '../src/game/rule_config';
import { getTileHealPerTurn, getTileTerrainKey } from '../src/game/terrain_rules';
import type { Action, GameState, StatusType, Unit, UnitClass } from '../src/game/types';

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

export interface ApkSkirmishRuleReport {
    generatedAt: string;
    checkCount: number;
    failedCheckCount: number;
    checks: ApkSkirmishRuleCheck[];
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

function actionTypes(actions: Action[]): string[] {
    return [...new Set(actions.map(action => action.type))].sort();
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
        checks
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
