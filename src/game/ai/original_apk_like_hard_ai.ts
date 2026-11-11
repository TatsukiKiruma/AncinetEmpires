/**
 * Original-APKlikeAI-Hard：补丁 APK 内嵌 hardAiDecide 的同步移植入口。
 * APK 原有估值脚本保留在独立生成资产中，真正的合法性与结算始终使用 GameEngine。
 * 复合动作先在克隆上完整验证，避免先移动后才发现后续动作不可执行。
 */
import { GameEngine } from '../engine';
import type { Action, GameState, Position } from '../types';
import { APK_UNIT_ID_TO_CLASS } from '../apk_compat';
import { encodeAction } from '../env';
import { createApkHardRuntime, type ApkHardDecision } from './runtime/apk_hard_runtime';
import { buildApkHardSnapshot } from './original_apk_like_hard_snapshot';
import { OriginalApkLikeHardNativeAI } from './original_apk_like_hard_native_ai';
import type { ApkHardComputeOptions } from './runtime/apk_hard_compute';

export interface OriginalApkLikeHardAIOptions {
    compute?: ApkHardComputeOptions;
    rng?: () => number;
    onDecision?: (summary: { decision: ApkHardDecision | null; sequence: Action[]; fallbackReason: string | null }) => void;
}

interface PlannedStep { signature: string; action: Action }

export class OriginalApkLikeHardAI {
    private readonly rng: () => number;
    private readonly onDecision?: OriginalApkLikeHardAIOptions['onDecision'];
    private runtime: ReturnType<typeof createApkHardRuntime> | null = null;
    private readonly native: OriginalApkLikeHardNativeAI;
    private readonly compute: ApkHardComputeOptions;
    private plan: PlannedStep[] = [];
    private previousActionAccepted = false;
    private matchSerial = 0;
    private contextKey: string | null = null;
    public readonly telemetry = {
        runtimeDecisions: 0, nativeFallbacks: 0, rejectedPlans: 0, runtimeErrors: 0,
        lastFallbackReason: null as string | null,
    };

    constructor(options: OriginalApkLikeHardAIOptions = {}) {
        this.compute = options.compute ?? {};
        this.rng = options.rng ?? Math.random;
        this.onDecision = options.onDecision;
        this.native = new OriginalApkLikeHardNativeAI({ rng: this.rng });
    }

    /** 新对局、手动接管或外部跳转局面时清除桥接内部的回合记忆。 */
    reset(): void {
        this.runtime = null;
        this.plan = [];
        this.previousActionAccepted = false;
        this.contextKey = null;
        this.matchSerial += 1;
        this.native.reset();
        Object.assign(this.telemetry, { runtimeDecisions: 0, nativeFallbacks: 0, rejectedPlans: 0, runtimeErrors: 0, lastFallbackReason: null });
    }

    getAction(engine: GameEngine, playerId: number): Action {
        const state = engine.getState();
        const legal = engine.getLegalActions(playerId);
        const signature = stateSignature(state);
        const contextKey = `${playerId}|${state.metadata?.apkMapName ?? ''}|${state.map.width},${state.map.height}`;
        if (this.contextKey !== null && this.contextKey !== contextKey) this.reset();
        this.contextKey = contextKey;
        const planned = this.plan[0];
        if (planned?.signature === signature && includesAction(legal, planned.action)) {
            this.plan.shift();
            return planned.action;
        }
        if (this.plan.length > 0) {
            this.plan = [];
            this.previousActionAccepted = false;
        }
        let decision: ApkHardDecision | null = null;
        let fallbackReason: string;
        try {
            this.runtime ??= createApkHardRuntime(this.rng, this.compute);
            decision = this.runtime.decide(buildApkHardSnapshot(state, playerId, `project-hard-${this.matchSerial}`, this.previousActionAccepted));
            this.telemetry.runtimeDecisions += 1;
            if (decision.kind === 'error') throw new Error(decision.reason ?? 'APK 困难脚本未返回动作');
            const sequence = decisionSequence(state, decision);
            const steps = validateSequence(engine, playerId, sequence);
            this.previousActionAccepted = steps !== null;
            if (steps && steps.length > 0) {
                this.native.reset();
                this.plan = steps;
                this.telemetry.lastFallbackReason = null;
                this.onDecision?.({ decision, sequence, fallbackReason: null });
                return this.plan.shift()!.action;
            }
            this.telemetry.rejectedPlans += 1;
            fallbackReason = `APK 复合动作与项目合法动作不兼容：${JSON.stringify(decision)}`;
        } catch (error) {
            this.previousActionAccepted = false;
            this.telemetry.runtimeErrors += 1;
            fallbackReason = error instanceof Error ? error.message : String(error);
        }
        this.telemetry.nativeFallbacks += 1;
        this.telemetry.lastFallbackReason = fallbackReason;
        const action = this.native.getAction(engine, playerId);
        this.onDecision?.({ decision, sequence: [action], fallbackReason });
        return action;
    }
}

function includesAction(legal: Action[], action: Action): boolean {
    const encoded = encodeAction(action);
    return legal.some(item => encodeAction(item) === encoded);
}

/** 包含规则、地图、金币、状态持续时间和支援标记，防止跨引擎实例复用过期计划。 */
function stateSignature(state: GameState): string {
    return JSON.stringify(state);
}

function position(row: number | undefined, col: number | undefined): Position {
    if (!Number.isInteger(row) || !Number.isInteger(col)) throw new Error('APK 动作坐标缺失');
    return { x: col!, y: row! };
}

function decisionSequence(state: GameState, decision: ApkHardDecision): Action[] {
    if (decision.kind === 'end') return [{ type: 'end_turn' }];
    const destination = position(decision.row, decision.col);
    if (decision.kind === 'recruit') {
        const unitClass = APK_UNIT_ID_TO_CLASS[decision.unitType!];
        if (!unitClass) throw new Error(`APK 招募兵种未知：${decision.unitType}`);
        return [{ type: 'recruit_to_castle', unitClass, castlePos: destination }];
    }
    if (decision.kind !== 'unit') throw new Error(`APK 动作类型未知：${decision.kind}`);
    const from = position(decision.fromRow, decision.fromCol);
    const actor = state.units.find(unit => unit.ownerId === state.currentPlayer && unit.pos.x === from.x && unit.pos.y === from.y
        && (state.pendingUnitId ? unit.id === state.pendingUnitId : true));
    if (!actor) throw new Error('APK 动作来源格没有当前玩家单位');
    const sequence: Action[] = [];
    if (actor.pos.x !== destination.x || actor.pos.y !== destination.y) sequence.push({ type: 'move', unitId: actor.id, to: destination });
    const targetPos = { x: decision.targetCol ?? -1, y: decision.targetRow ?? -1 };
    const target = targetPos.x === destination.x && targetPos.y === destination.y ? actor
        : state.units.find(unit => unit.id !== actor.id && unit.pos.x === targetPos.x && unit.pos.y === targetPos.y);
    switch (decision.actionType) {
        case 'wait': sequence.push({ type: 'wait', unitId: actor.id }); break;
        case 'attack':
            sequence.push(target ? { type: 'attack', attackerId: actor.id, targetId: target.id }
                : { type: 'destroy_town', unitId: actor.id, target: targetPos });
            break;
        case 'heal':
            if (!target) throw new Error('APK 治疗目标缺失');
            sequence.push({ type: 'heal', healerId: actor.id, targetId: target.id }); break;
        case 'support':
            if (!target) throw new Error('APK 支援目标缺失');
            sequence.push({ type: 'support', supporterId: actor.id, targetId: target.id }); break;
        case 'summon': {
            const grave = state.graves?.find(item => item.pos.x === targetPos.x && item.pos.y === targetPos.y);
            if (!grave) throw new Error('APK 召唤墓碑缺失');
            sequence.push({ type: 'summon', summonerId: actor.id, graveId: grave.id, spawnPos: targetPos }); break;
        }
        case 'occupy': sequence.push({ type: 'capture', unitId: actor.id }); break;
        case 'repair': sequence.push({ type: 'repair', unitId: actor.id }); break;
        default: throw new Error(`APK 单位动作未知：${decision.actionType}`);
    }
    if (decision.secondRow !== undefined && decision.secondCol !== undefined) {
        sequence.push({ type: 'post_attack_move', unitId: actor.id, to: position(decision.secondRow, decision.secondCol) });
    }
    return sequence;
}

/** 允许攻击者死亡或自动交接回合自然终止后续二次移动。 */
function validateSequence(engine: GameEngine, playerId: number, sequence: Action[]): PlannedStep[] | null {
    if (sequence.length === 0) return null;
    const clone = engine.clone();
    const steps: PlannedStep[] = [];
    for (const action of sequence) {
        const state = clone.getState();
        if (state.winner !== null || state.currentPlayer !== playerId) break;
        if (!includesAction(clone.getLegalActions(playerId), action)) {
            if (action.type === 'post_attack_move' && !state.units.some(unit => unit.id === action.unitId && unit.hp > 0)) break;
            return null;
        }
        steps.push({ signature: stateSignature(state), action });
        clone.step(action);
    }
    return steps;
}
