/**
 * V14/T14-01：规则 oracle 谓词求值器。
 *
 * 定位：
 * - oracle 只使用真实 GameEngine、真实合法动作集和明确的结果谓词；
 *   不使用“动作类别”代替结果（例如把“存在 move”当作解围成功）。
 * - 每个谓词都必须能区分正例与反例；求值结果只输出 PASS/FAIL + 读数，
 *   不输出“看起来合理”的模糊判断。
 * - 夹具声明的 `verified` 标志由 T14-01 的验收规则使用：只有带真实引擎读数的
 *   谓词才能标 VERIFIED，否则标 UNKNOWN 且不计入通过率。
 */
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getEffectiveStats } from '../../src/game/abilities';
import { getDistance, getReachablePositions } from '../../src/game/map';
import { calculateDamage } from '../../src/game/rules';
import { encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState, Position, UnitClass } from '../../src/game/types';
import type { EngineRunResult } from './rule_fixtures';
import { cloneState, findLegalAction, legalCodesOf, posOf, unitAt } from './rule_fixtures';


function actionTypeOf(code: string): string {
    return code.split(':')[0];
}

function actionActorId(code: string): string | null {
    const type = actionTypeOf(code);
    if (type === 'attack') return code.split(':')[1] ?? null;
    if (type === 'heal' || type === 'support') return code.split(':')[1] ?? null;
    if (type === 'recruit_to_castle' || type === 'recruit_and_deploy') return null;
    if (type === 'surrender' || type === 'end_turn') return null;
    return code.split(':')[1] ?? null;
}

export type Predicate =
    /** 终局：winner 必须等于给定联盟 id（null 表示未结束，-1 表示规则平局）。 */
    | { kind: 'winner'; value: number | null; note?: string }
    /** 必须有恰好一个引擎合法动作立即产生该 winner。 */
    | { kind: 'forced_win'; allianceId: number; note?: string }
    /** 必须没有任何引擎合法动作立即产生该 winner。 */
    | { kind: 'no_immediate_win'; allianceId: number; note?: string }
    /** 单位必须存活（hp > 0）。 */
    | { kind: 'unit_alive'; unitId: string; note?: string }
    /** 单位必须不存在或 hp <= 0（整局中确实死亡或从未出现）。 */
    | { kind: 'unit_dead'; unitId: string; note?: string }
    /** 单位血量必须等于给定值。 */
    | { kind: 'hp_equals'; unitId: string; value: number; note?: string }
    /** 行动后攻击者血量变化必须等于给定值（负数为失血）。 */
    | { kind: 'attacker_hp_delta'; unitId: string; value: number; note?: string }
    /** 单位必须处于给定坐标（用于验证移动/部署/突击后移动的真实落点）。 */
    | { kind: 'unit_at'; unitId: string; x: number; y: number; note?: string }
    /** 单位必须不在玩家领地内（用于验证占领的真实归属变化）。 */
    | { kind: 'tile_owner'; x: number; y: number; ownerId: number | null; note?: string }
    /** 玩家必须被淘汰（isAlive = false）。 */
    | { kind: 'player_eliminated'; playerId: number; note?: string }
    /** 玩家必须存活。 */
    | { kind: 'player_alive'; playerId: number; note?: string }
    /** 该玩家在给定规则下实际可执行的合法动作数必须等于给定值。 */
    | { kind: 'legal_action_count'; playerId: number; value: number; note?: string }
    /** 该动作码必须在合法动作里。atStep 指定在轨迹的第 n 步执行前检查（多步窗口夹具）。 */
    | { kind: 'legal_action_present'; code: string; note?: string; atStep?: number; forPlayer?: number }
    /** 该动作码必须不在合法动作里。 */
    | { kind: 'legal_action_absent'; code: string; note?: string; atStep?: number; forPlayer?: number }
    /** 动作轨迹中的第 index 步 info 必须包含给定子串（引擎真实回执）。 */
    | { kind: 'step_info_contains'; index: number; value: string; note?: string }
    /** 执行完整个轨迹后，每个合法动作都必须落在这 (动作类型, 行动者) 集合内。 */
    | { kind: 'only_actor_actions'; actorId: string; note?: string }
    /** 执行完整个轨迹后，实际被执行的每一步都必须属于给定动作类型集合。 */
    | { kind: 'trace_types_executed'; types: string[]; note?: string }
    /** 该动作在当前状态必须真的能击杀目标（引擎读数验证，不靠估算）。 */
    | { kind: 'lethal_attack'; attackerId: string; targetId: string; note?: string }
    /** 该动作在当前状态必须不能击杀目标。 */
    | { kind: 'nonlethal_attack'; attackerId: string; targetId: string; note?: string }
    /**
     * 反击读数：引擎一步执行后攻击者实际失血必须等于给定值。
     * 反例（v13 编码器）：投石车距离 3 攻击士兵，编码器预计反击 50，
     * 引擎实际失血 0 —— 该谓词的 expected 就是 0。
     */
    | { kind: 'attack_attacker_hp_delta'; attackerId: string; targetId: string; expectedLoss: number; note?: string; atStep?: number }
    /**
     * 反击通道读数：编码器语义槽 15（预计反击/100）必须等于给定值。
     * 这是“特征规则正确性”的直接读数，由 T14-03 复用。
     */
    | { kind: 'encoder_counter_semantics'; attackerId: string; targetId: string; expectedValue: number; note?: string; atStep?: number }
    /** 该动作必须不在该单位可达移动集合里（曼哈顿近不等于可达）。 */
    | { kind: 'unreachable_move'; unitId: string; x: number; y: number; note?: string }
    /** 该坐标必须在该单位可达移动集合里。 */
    | { kind: 'reachable_move'; unitId: string; x: number; y: number; note?: string }
    /** 玩家金币必须等于给定值（回合开始收入结算）。 */
    | { kind: 'gold_equals'; playerId: number; value: number; note?: string }
    /** 引擎执行必须没有错误，并且第一个动作必须被引擎接受。 */
    | { kind: 'accepted'; note?: string }
    /** 自定义读数：由夹具提供纯函数，输出必须等于期望值。 */
    | { kind: 'reading'; label: string; expected: unknown; note?: string; read: (ctx: OracleContext) => unknown };

export interface OracleContext {
    /** 轨迹执行前的状态（深拷贝，可安全修改）。 */
    before: GameState;
    /** 轨迹执行后的状态（深拷贝）。 */
    after: GameState;
    /** 引擎执行记录。 */
    run: EngineRunResult;
    /** 引擎在当前状态下的合法动作码（before, currentPlayer）。 */
    legalBefore: string[];
    /** 轨迹第 i 步执行「之前」的局面快照；stepStates[0] 与 before 相同。 */
    stepStates: GameState[];
    /** 与 stepStates 对应的逐步执行合法性（引擎 info 中是否出现“非法动作”）。 */
    stepLegal: boolean[];
    /** 引擎终局后的 winner（未结束时为 null）。 */
    winner: GameState['winner'];
}

export interface PredicateResult {
    kind: Predicate['kind'];
    label: string;
    pass: boolean;
    /** 真实读数，必须可复核。 */
    reading: unknown;
    expected: unknown;
    note?: string;
}

function describe(predicate: Predicate): string {
    switch (predicate.kind) {
        case 'winner': return `winner=${predicate.value}`;
        case 'forced_win': return `forced_win(alliance=${predicate.allianceId})`;
        case 'no_immediate_win': return `no_immediate_win(alliance=${predicate.allianceId})`;
        case 'unit_alive': return `${predicate.unitId} alive`;
        case 'unit_dead': return `${predicate.unitId} dead`;
        case 'hp_equals': return `${predicate.unitId} hp=${predicate.value}`;
        case 'attacker_hp_delta': return `${predicate.unitId} hpDelta=${predicate.value}`;
        case 'unit_at': return `${predicate.unitId} at ${predicate.x},${predicate.y}`;
        case 'tile_owner': return `tile ${predicate.x},${predicate.y} owner=${predicate.ownerId}`;
        case 'player_eliminated': return `P${predicate.playerId} eliminated`;
        case 'player_alive': return `P${predicate.playerId} alive`;
        case 'legal_action_count': return `P${predicate.playerId} legal=${predicate.value}`;
        case 'legal_action_present': return `legal has ${predicate.code}`;
        case 'legal_action_absent': return `legal lacks ${predicate.code}`;
        case 'step_info_contains': return `step[${predicate.index}] info~"${predicate.value}"`;
        case 'only_actor_actions': return `only ${predicate.actorId} may act`;
        case 'trace_types_executed': return `trace types ⊆ {${predicate.types.join(',')}}`;
        case 'lethal_attack': return `${predicate.attackerId}->${predicate.targetId} lethal`;
        case 'nonlethal_attack': return `${predicate.attackerId}->${predicate.targetId} nonlethal`;
        case 'attack_attacker_hp_delta': return `engine attacker loss(${predicate.attackerId},${predicate.targetId})=${predicate.expectedLoss}`;
        case 'encoder_counter_semantics': return `encoder counter semantics(${predicate.attackerId},${predicate.targetId})=${predicate.expectedValue}`;
        case 'unreachable_move': return `${predicate.unitId} cannot reach ${predicate.x},${predicate.y}`;
        case 'reachable_move': return `${predicate.unitId} can reach ${predicate.x},${predicate.y}`;
        case 'gold_equals': return `P${predicate.playerId} gold=${predicate.value}`;
        case 'accepted': return 'engine accepted the action';
        case 'reading': return `reading(${predicate.label})=${JSON.stringify(predicate.expected)}`;
        default: return 'unknown';
    }
}

/** 构造 oracle 上下文：先跑轨迹，再收集读数所需信息。 */
export function buildContext(beforeState: GameState, actions: Action[], run: EngineRunResult): OracleContext {
    return {
        before: cloneState(beforeState),
        after: cloneState(run.after),
        run,
        legalBefore: run.legalCodesBefore,
        winner: run.after.winner,
        stepStates: run.stepStates.map((s) => cloneState(s)),
        stepLegal: run.stepLegal,
    };
}

/**
 * 在一次真实引擎执行中枚举“第一步动作”，返回每个动作的直接结果。
 * 只用于即时终局与即时致胜判定；这不是 rollout，也不允许被当作强制获胜证明。
 */
function immediateOutcomes(state: GameState, playerId: number): Array<{ code: string; winner: GameState['winner'] }> {
    const engine = new GameEngine(state);
    const outcomes: Array<{ code: string; winner: GameState['winner'] }> = [];
    for (const action of engine.getLegalActions(playerId)) {
        const fork = new GameEngine(state);
        try {
            const result = fork.step(action);
            outcomes.push({ code: encodeAction(action), winner: result.state.winner });
        } catch {
            // 引擎抛错本身就是读数：标记为不可评估，不静默当成失败以外的东西。
            outcomes.push({ code: encodeAction(action), winner: null });
        }
    }
    return outcomes;
}

function attackDamageReading(state: GameState, attackerId: string, targetId: string): { damage: number; appliedHp: number } | null {
    const attacker = unitAt(state, attackerId);
    const target = unitAt(state, targetId);
    if (!attacker || !target) return null;
    const action = findLegalAction(state, encodeAction({ type: 'attack', attackerId, targetId }));
    if (!action) return null;
    const run = (() => {
        const engine = new GameEngine(state);
        engine.step(action);
        return engine.getState();
    })();
    const after = unitAt(run, targetId);
    return { damage: target.hp - (after?.hp ?? 0), appliedHp: after?.hp ?? 0 };
}

function stateAtStep(ctx: OracleContext, atStep?: number): GameState {
    if (atStep === undefined) return ctx.before;
    // 越界时回退到 before 并保持可求值：越界本身由 evaluateFixture 报告成 FAIL，
    // 不能让一个写错的夹具把整个套件的其它读数吞掉。
    return ctx.stepStates[atStep] ?? ctx.before;
}

function legalAt(ctx: OracleContext, playerId: number, atStep?: number): string[] {
    return legalCodesOf(stateAtStep(ctx, atStep), playerId);
}
export function evaluatePredicate(predicate: Predicate, ctx: OracleContext): PredicateResult {
    const base = { kind: predicate.kind, label: describe(predicate), note: predicate.note };
    switch (predicate.kind) {
        case 'winner':
            return { ...base, pass: ctx.winner === predicate.value, reading: ctx.winner, expected: predicate.value };
        case 'forced_win': {
            const outcomes = immediateOutcomes(ctx.before, ctx.before.currentPlayer);
            const wins = outcomes.filter((o) => o.winner === predicate.allianceId);
            return {
                ...base,
                pass: wins.length > 0,
                reading: { candidateActions: outcomes.length, immediateWinActions: wins.map((w) => w.code) },
                expected: `>=1 action with winner=${predicate.allianceId}`,
            };
        }
        case 'no_immediate_win': {
            const outcomes = immediateOutcomes(ctx.before, ctx.before.currentPlayer);
            const wins = outcomes.filter((o) => o.winner === predicate.allianceId);
            return {
                ...base,
                pass: wins.length === 0,
                reading: wins.map((w) => w.code),
                expected: 'no action reaches that winner',
            };
        }
        case 'unit_alive': {
            const unit = unitAt(ctx.after, predicate.unitId);
            return { ...base, pass: unit !== null, reading: unit ? unit.hp : null, expected: 'alive' };
        }
        case 'unit_dead': {
            const unit = ctx.after.units.find((u) => u.id === predicate.unitId);
            const hp = unit ? unit.hp : null;
            return { ...base, pass: unit === undefined || unit.hp <= 0, reading: hp, expected: 'dead' };
        }
        case 'hp_equals': {
            const unit = ctx.after.units.find((u) => u.id === predicate.unitId);
            return { ...base, pass: unit?.hp === predicate.value, reading: unit?.hp ?? null, expected: predicate.value };
        }
        case 'attacker_hp_delta': {
            const before = unitAt(ctx.before, predicate.unitId);
            const after = unitAt(ctx.after, predicate.unitId);
            const delta = after && before ? after.hp - before.hp : null;
            return { ...base, pass: delta === predicate.value, reading: delta, expected: predicate.value };
        }
        case 'unit_at': {
            const pos = posOf(ctx.after, predicate.unitId);
            return {
                ...base,
                pass: pos?.x === predicate.x && pos?.y === predicate.y,
                reading: pos,
                expected: { x: predicate.x, y: predicate.y },
            };
        }
        case 'tile_owner': {
            const tile = ctx.after.map.tiles[predicate.y]?.[predicate.x];
            const owner = tile ? tile.ownerId : undefined;
            return { ...base, pass: owner === predicate.ownerId, reading: owner ?? null, expected: predicate.ownerId };
        }
        case 'player_eliminated': {
            const player = ctx.after.players.find((p) => p.id === predicate.playerId);
            return { ...base, pass: player?.isAlive === false, reading: player?.isAlive ?? null, expected: false };
        }
        case 'player_alive': {
            const player = ctx.after.players.find((p) => p.id === predicate.playerId);
            return { ...base, pass: player?.isAlive === true, reading: player?.isAlive ?? null, expected: true };
        }
        case 'legal_action_count': {
            const codes = legalCodesOf(ctx.after, predicate.playerId);
            return { ...base, pass: codes.length === predicate.value, reading: codes.length, expected: predicate.value };
        }
        case 'legal_action_present': {
            const player = predicate.forPlayer ?? ctx.before.currentPlayer;
            const codes = legalAt(ctx, player, predicate.atStep);
            return { ...base, pass: codes.includes(predicate.code), reading: codes.includes(predicate.code), expected: true };
        }
        case 'legal_action_absent': {
            const player = predicate.forPlayer ?? ctx.before.currentPlayer;
            const codes = legalAt(ctx, player, predicate.atStep);
            return { ...base, pass: !codes.includes(predicate.code), reading: codes.includes(predicate.code), expected: false };
        }
        case 'step_info_contains': {
            const step = ctx.run.steps[predicate.index];
            return {
                ...base,
                pass: Boolean(step && step.info.includes(predicate.value)),
                reading: step?.info ?? null,
                expected: `info contains ${predicate.value}`,
            };
        }
        case 'only_actor_actions': {
            const codes = legalCodesOf(ctx.after, ctx.after.currentPlayer);
            const foreign = codes.filter((code) => actionActorId(code) !== null
                && actionActorId(code) !== predicate.actorId);
            return { ...base, pass: foreign.length === 0, reading: foreign, expected: 'no other actor has an action' };
        }
        case 'trace_types_executed': {
            const executed = ctx.run.steps.map((s) => actionTypeOf(s.action));
            const disallowed = executed.filter((t) => !predicate.types.includes(t));
            return { ...base, pass: disallowed.length === 0, reading: executed, expected: predicate.types };
        }
        case 'lethal_attack': {
            const reading = attackDamageReading(ctx.before, predicate.attackerId, predicate.targetId);
            const target = unitAt(ctx.before, predicate.targetId);
            return {
                ...base,
                pass: Boolean(reading && reading.appliedHp <= 0),
                reading: { damage: reading?.damage ?? null, targetHpBefore: target?.hp ?? null },
                expected: 'engine applies lethal damage',
            };
        }
        case 'nonlethal_attack': {
            const reading = attackDamageReading(ctx.before, predicate.attackerId, predicate.targetId);
            return {
                ...base,
                pass: Boolean(reading && reading.appliedHp > 0),
                reading: reading ? { damage: reading.damage, targetHpAfter: reading.appliedHp } : null,
                expected: 'engine leaves the target alive',
            };
        }
        case 'attack_attacker_hp_delta': {
            const atState = stateAtStep(ctx, predicate.atStep);
            const attackerBefore = unitAt(atState, predicate.attackerId);
            const targetBefore = unitAt(atState, predicate.targetId);
            if (!attackerBefore || !targetBefore) {
                return { ...base, pass: false, reading: null, expected: predicate.expectedLoss };
            }
            const engineRun = (() => {
                const engine = new GameEngine(atState);
                const action = findLegalAction(atState, encodeAction({
                    type: 'attack', attackerId: predicate.attackerId, targetId: predicate.targetId,
                }));
                if (!action) return null;
                engine.step(action);
                return engine.getState();
            })();
            if (!engineRun) {
                return { ...base, pass: false, reading: null, expected: predicate.expectedLoss };
            }
            const attackerAfter = unitAt(engineRun, predicate.attackerId);
            const loss = attackerBefore.hp - (attackerAfter?.hp ?? 0);
            return { ...base, pass: loss === predicate.expectedLoss, reading: loss, expected: predicate.expectedLoss };
        }
        case 'encoder_counter_semantics': {
            const atState = stateAtStep(ctx, predicate.atStep);
            const action = findLegalAction(atState, encodeAction({
                type: 'attack', attackerId: predicate.attackerId, targetId: predicate.targetId,
            }));
            if (!action) {
                return { ...base, pass: false, reading: 'attack not legal', expected: predicate.expectedValue };
            }
            const features = encodeCandidateActionSpatial(atState, atState.currentPlayer, action);
            const value = features.semantics[15];
            return { ...base, pass: value === predicate.expectedValue, reading: value, expected: predicate.expectedValue };
        }        case 'unreachable_move': {
            const reachable = getReachablePositions(ctx.before, predicate.unitId);
            const found = reachable.some((p) => p.x === predicate.x && p.y === predicate.y);
            const dist = (() => {
                const pos = posOf(ctx.before, predicate.unitId);
                return pos ? getDistance(pos, { x: predicate.x, y: predicate.y }) : null;
            })();
            return { ...base, pass: !found, reading: { reachable: found, manhattanDistance: dist }, expected: false };
        }
        case 'reachable_move': {
            const reachable = getReachablePositions(ctx.before, predicate.unitId);
            const found = reachable.some((p) => p.x === predicate.x && p.y === predicate.y);
            return { ...base, pass: found, reading: found, expected: true };
        }
        case 'gold_equals': {
            const player = ctx.after.players.find((p) => p.id === predicate.playerId);
            return { ...base, pass: player?.gold === predicate.value, reading: player?.gold ?? null, expected: predicate.value };
        }
        case 'accepted': {
            const firstStep = ctx.run.steps[0];
            const accepted = Boolean(firstStep && !/非法动作/.test(firstStep.info));
            return { ...base, pass: accepted, reading: firstStep?.info ?? null, expected: 'engine accepted the first action' };
        }
        case 'reading': {
            const reading = predicate.read(ctx);
            return {
                ...base,
                pass: JSON.stringify(reading) === JSON.stringify(predicate.expected),
                reading,
                expected: predicate.expected,
            };
        }
        default: {
            const never: never = predicate;
            throw new Error(`未知谓词: ${JSON.stringify(never)}`);
        }
    }
}

export interface FixtureResult {
    fixtureId: string;
    scenario: string;
    verified: boolean;
    actionCodes: string[];
    predicates: PredicateResult[];
    unknownReasons: string[];
    pass: boolean;
}

/**
 * 求值一个夹具的全部谓词。
 * `verified=false` 的夹具其谓词结果会被保留为读数，但不计入通过率（任务书：未知项不计入通过率）。
 */
export function evaluateFixture(
    fixtureId: string,
    scenario: string,
    verified: boolean,
    actionCodes: string[],
    predicates: Predicate[],
    ctx: OracleContext,
    unknownReasons: string[] = [],
): FixtureResult {
    const results = predicates.map((p) => evaluatePredicate(p, ctx));

    return {
        fixtureId,
        scenario,
        verified,
        actionCodes,
        predicates: results,
        unknownReasons,
        pass: verified && results.every((r) => r.pass),
    };
}

/** 供夹具在需要时构造“类型 + 行动者”读数。 */
export function actionActor(code: string): string | null {
    return actionActorId(code);
}

/** 在状态中按兵种找出第一个存活单位，便于写“某兵种在某格”的夹具。 */
export function firstUnitOfClass(state: GameState, unitClass: UnitClass): string | null {
    return state.units.find((u) => u.unitClass === unitClass && u.hp > 0)?.id ?? null;
}

/** 该单位当前可达集合的曼哈顿距离边界，仅用于诊断打印。 */
export function reachableCount(state: GameState, unitId: string): number {
    return getReachablePositions(state, unitId).length;
}

/** 该单位有效属性读数，用于断言“不能只看动作类型猜射程”。 */
export function effectiveStatsReading(state: GameState, unitId: string): Record<string, number | undefined> | null {
    const unit = unitAt(state, unitId);
    if (!unit) return null;
    const stats = getEffectiveStats(unit);
    return {
        minRange: stats.minRange,
        maxRange: stats.maxRange,
        move: stats.move,
        maxHp: stats.maxHp,
        attack: stats.attack,
    };
}

/** 位置是否在地图内。 */
export function inBounds(state: GameState, pos: Position): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < state.map.width && pos.y < state.map.height;
}
