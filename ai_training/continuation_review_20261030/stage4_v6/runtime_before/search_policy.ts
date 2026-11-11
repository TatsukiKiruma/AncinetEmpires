import type { Action, GameState } from '../../game/types';
import type { DualModelOutput } from '../dual_v2/model_runtime';
import type { DualObservation } from '../dual_v2/contract';
import { actionActor, tacticalActionPriors } from '../dual_v2/tactical_prior';
import { ReachabilityContext } from '../dual_v2/reachability';

export interface SearchModel { forward(input: DualObservation): DualModelOutput }
export const PRIOR_VERSION = 'soft-tactical-v1';

/** 策略偏好仅作有限先验；wait、end_turn及所有合法兵种均保留。训练端读取同一数值。 */
export function softPriors(state: GameState, actions: readonly Action[], context: ReachabilityContext): Float32Array {
    const old = tacticalActionPriors(state, actions, context);
    return Float32Array.from(old, (p, i) => p.forbidden ? actions[i].type === 'wait' ? -4 : actions[i].type === 'end_turn' ? -8 : Math.max(-40, Math.min(120, p.prior)) : Math.max(-40, Math.min(120, p.prior)));
}

export interface RankedAction { action: Action; code: string; score: number; prior: number; forbidden?: boolean }
export function actorKey(action: Action): string {
    return actionActor(action) ?? (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy' ? `recruit:${action.unitClass}` : action.type);
}

/** 分配语义、行动者及兵种配额，并过滤提前收口禁手；未入池动作只记遗漏，不视为劣解。 */
export function diverseCandidates(ranked: readonly RankedAction[], count: number, rotation = 0): RankedAction[] {
    const permitted = ranked.filter(r => !(r.forbidden && ['wait', 'end_turn'].includes(r.action.type)));
    if (permitted.length >= 2) ranked = permitted;
    const chosen: RankedAction[] = [], used = new Set<string>();
    const add = (r: RankedAction | undefined) => { if (r && !used.has(r.code) && chosen.length < count) { chosen.push(r); used.add(r.code); } };
    add(ranked[0]);
    for (const type of ['wait', 'end_turn', 'recruit_to_castle', 'recruit_and_deploy', 'attack', 'capture', 'repair', 'heal', 'support', 'summon', 'post_attack_move', 'destroy_town']) add(ranked.find(r => r.action.type === type));
    const actors = new Map<string,RankedAction>();
    for (const r of ranked) if (!actors.has(actorKey(r.action))) actors.set(actorKey(r.action),r);
    const representatives=[...actors.values()], diversitySlots=Math.max(1,Math.floor(count/4));
    for(let i=0;i<diversitySlots&&i<representatives.length;i++)add(representatives[(i+rotation)%representatives.length]);
    // 余下配额按排序均匀分位抽取，避免只覆盖Top-K。
    const remaining = ranked.filter(r => !used.has(r.code)), slots = count - chosen.length;
    for (let i = 0; i < slots; i++) add(remaining[Math.floor(i * remaining.length / Math.max(1, slots))]);
    for (const r of ranked) add(r);
    return chosen;
}

/** 状态确定的轮转使不同单位、低先验兵种在不同局面获得配额；正式策略保持确定性。 */
export function coverageRotation(state: GameState): number {
    const text=JSON.stringify(state);let value=2166136261;
    for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);
    return value>>>0;
}
