/**
 * V14/T14-01：规则夹具构造器。
 *
 * 设计原则：
 * 1. 夹具只构造状态，不解释规则；所有规则判定都由真实 GameEngine 执行产生。
 * 2. 默认地形使用 road(6)：防御加成 0、移动消耗 1，因此普通战斗的伤害读数
 *    不受地形影响，便于写出可复核的期望值。
 * 3. 所有状态都显式给出 rules，避免把 DEFAULT_RULE_CONFIG 当成所有地图的实际规则。
 * 4. 本文件不修改引擎；发现引擎缺陷时在夹具里标记并通过 oracle 报告，而不是绕过。
 */
import { GameEngine } from '../../src/game/engine';
import { applyInitialRuleConfig, getRuleConfig } from '../../src/game/rule_config';
import { encodeAction } from '../../src/game/env';
import type {
    Action, GameState, PlayerState, Position, RuleConfig, Unit, UnitClass, UnitLevel,
} from '../../src/game/types';
import type { TerrainId, Tile } from '../../src/game/terrain';

/** road：防御加成 0，移动消耗 1。作为默认地面，避免地形悄悄改变伤害。 */
export const FLAT_TERRAIN: TerrainId = 6;
/** castle：用于招募/占领/经济场景。 */
export const CASTLE_TERRAIN: TerrainId = 10;
/** town：用于占领与收入场景。 */
export const TOWN_TERRAIN: TerrainId = 9;

export interface UnitSpec {
    id: string;
    ownerId: number;
    unitClass: UnitClass;
    x: number;
    y: number;
    hp?: number;
    maxHp?: number;
    hasMoved?: boolean;
    hasActed?: boolean;
    status?: Unit['status'];
    level?: UnitLevel;
    movementRemaining?: number;
    hasPostAttackMoved?: boolean;
    hasBeenSupportedThisTurn?: boolean;
    apkPendingRecruitSource?: Unit['apkPendingRecruitSource'];
}

export interface TileOverride {
    x: number;
    y: number;
    terrainId: TerrainId;
    ownerId?: number | null;
}

export interface StateSpec {
    width?: number;
    height?: number;
    players?: Array<number | PlayerState>;
    currentPlayer?: number;
    turn?: number;
    units?: UnitSpec[];
    tiles?: TileOverride[];
    rules?: RuleConfig;
    graves?: GameState['graves'];
    pendingUnitId?: string;
    nextUnitId?: number;
}

export function makePlayers(spec: StateSpec['players']): PlayerState[] {
    return (spec ?? [0, 1]).map((entry) => (typeof entry === 'number'
        ? { id: entry, gold: 0, isAlive: true, commanderDeathCount: 0 }
        : { commanderDeathCount: 0, ...entry }));
}

export function makeUnit(spec: UnitSpec): Unit {
    const maxHp = spec.maxHp ?? 100;
    return {
        id: spec.id,
        ownerId: spec.ownerId,
        unitClass: spec.unitClass,
        pos: { x: spec.x, y: spec.y },
        hp: spec.hp ?? maxHp,
        maxHp,
        hasMoved: spec.hasMoved ?? false,
        hasActed: spec.hasActed ?? false,
        ...(spec.status !== undefined ? { status: spec.status } : {}),
        ...(spec.level !== undefined ? { level: spec.level } : {}),
        exp: 0,
        ...(spec.movementRemaining !== undefined ? { movementRemaining: spec.movementRemaining } : {}),
        ...(spec.hasPostAttackMoved !== undefined ? { hasPostAttackMoved: spec.hasPostAttackMoved } : {}),
        ...(spec.hasBeenSupportedThisTurn !== undefined
            ? { hasBeenSupportedThisTurn: spec.hasBeenSupportedThisTurn } : {}),
        ...(spec.apkPendingRecruitSource !== undefined
            ? { apkPendingRecruitSource: spec.apkPendingRecruitSource } : {}),
    };
}

/** 构造一个真实可用的 GameState；不调用引擎私有能力，也不使用 unsafeBypassValidationForTests。 */
export function makeState(spec: StateSpec): GameState {
    const width = spec.width ?? 8;
    const height = spec.height ?? 8;
    const tiles: Tile[][] = [];
    for (let y = 0; y < height; y += 1) {
        const row: Tile[] = [];
        for (let x = 0; x < width; x += 1) {
            row.push({ terrainId: FLAT_TERRAIN, ownerId: null });
        }
        tiles.push(row);
    }
    for (const override of spec.tiles ?? []) {
        const tile = tiles[override.y]?.[override.x];
        if (!tile) throw new Error(`夹具 tile 越界: ${override.x},${override.y}`);
        tile.terrainId = override.terrainId;
        if (override.ownerId !== undefined) tile.ownerId = override.ownerId;
    }

    const state: GameState = {
        turn: spec.turn ?? 1,
        currentPlayer: spec.currentPlayer ?? 0,
        map: { width, height, tiles },
        units: (spec.units ?? []).map(makeUnit),
        players: makePlayers(spec.players),
        winner: null,
        nextUnitId: spec.nextUnitId ?? 500,
        nextGraveId: 1,
    };
    if (spec.graves) state.graves = spec.graves;
    if (spec.pendingUnitId) state.pendingUnitId = spec.pendingUnitId;
    if (spec.rules) state.rules = spec.rules;
    // 规则归一化与生产路径一致：缺失字段从默认规则补齐。
    applyInitialRuleConfig(state);
    return state;
}

/** 只用于读取夹具期望值，不用于判定：把规则配置显式取出，便于测试打印。 */
export function rulesOf(state: GameState): Required<RuleConfig> {
    return getRuleConfig(state);
}

export interface EngineRunResult {
    before: GameState;
    after: GameState;
    /** 每一步的 info 与行动者，便于区分“动作被接受”与“动作非法被忽略”。 */
    steps: Array<{ player: number; action: string; info: string; winner: GameState['winner'] }>;
    legalCodesBefore: string[];
    legalCodesAfter: string[];
    /** 第 i 步执行「之前」的局面快照；stepStates[0] 恒等于 before。 */
    stepStates: GameState[];
    /** 第 i 步是否被引擎接受（info 中不含“非法动作”）。 */
    stepLegal: boolean[];
}

/**
 * 在夹具状态上执行一串动作。第一个动作前记录合法动作集，
 * 每个动作都经过 GameEngine.step 的合法性校验（未开启 unsafeBypass）。
 */
export function runActions(state: GameState, actions: Action[]): EngineRunResult {
    const engine = new GameEngine(state);
    const before = engine.getState();
    const legalCodesBefore = engine.getLegalActions(before.currentPlayer).map(encodeAction);
    const steps: EngineRunResult['steps'] = [];
    const stepStates: GameState[] = [];
    const stepLegal: boolean[] = [];
    for (const action of actions) {
        const current = engine.getState();
        const player = current.currentPlayer;
        stepStates.push(current);
        const result = engine.step(action);
        // 引擎对非法动作不改状态、返回“非法动作”info；这里保留该读数而不是静默跳过。
        stepLegal.push(!/非法动作/.test(result.info));
        steps.push({ player, action: encodeAction(action), info: result.info, winner: result.state.winner });
    }
    const after = engine.getState();
    const legalCodesAfter = engine.isTerminal()
        ? []
        : engine.getLegalActions(after.currentPlayer).map(encodeAction);
    return { before, after, steps, legalCodesBefore, legalCodesAfter, stepStates, stepLegal };
}

/** 只执行一个动作；用于“一步结果”谓词。 */
export function stepOnce(state: GameState, action: Action): EngineRunResult {
    return runActions(state, [action]);
}

/** 克隆引擎，用于在多个候选动作上分别试算而不污染原状态。 */
export function forkEngine(state: GameState): GameEngine {
    return new GameEngine(state);
}

/** 引擎合法动作的 code 集合。 */
export function legalCodesOf(state: GameState, playerId?: number): string[] {
    const engine = new GameEngine(state);
    const player = playerId ?? state.currentPlayer;
    return engine.getLegalActions(player).map(encodeAction);
}

/** 在合法动作中按 code 找到动作；找不到返回 null（而不是抛错），便于夹具报告“不可执行”。 */
export function findLegalAction(state: GameState, code: string, playerId?: number): Action | null {
    const engine = new GameEngine(state);
    const player = playerId ?? state.currentPlayer;
    return engine.getLegalActions(player).find((action) => encodeAction(action) === code) ?? null;
}

/** 单位在某状态下的位置读数。 */
export function unitAt(state: GameState, unitId: string): Unit | null {
    return state.units.find((u) => u.id === unitId && u.hp > 0) ?? null;
}

export function posOf(state: GameState, unitId: string): Position | null {
    const unit = unitAt(state, unitId);
    return unit ? { x: unit.pos.x, y: unit.pos.y } : null;
}

/** 深度复制状态，避免夹具间共享引用。 */
export function cloneState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState;
}
