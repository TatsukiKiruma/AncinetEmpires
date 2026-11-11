import { actionActor } from '../dual_v2/tactical_prior';
import { actorKey, type RankedAction } from './search_policy';
import type { BatchedBeamOptions, FinalistRecord } from './batched_search_types';

export function rolloutPriorScale(options: BatchedBeamOptions, own: boolean): number {
    return own ? options.ownRolloutPriorScale ?? 1 : options.enemyPriorScale ?? 1;
}

/** 主干未闭合时，只接受严格超越根基线的完整安全替代项。 */
export function safeBaselineReplacement(candidates: FinalistRecord[], baseline: number): FinalistRecord | undefined {
    return candidates.filter(c => !c.vetoed && c.responseComplete && c.safe && c.score > baseline).sort((a, b) => b.score - a.score)[0];
}

/** 主干保送后，仅在有限先验差内补充行动者与语义多样性。 */
export function anchoredCandidates(ranked: readonly RankedAction[], count: number, gap = 20): RankedAction[] {
    const permitted = ranked.filter(r => !(r.forbidden && ['wait', 'end_turn'].includes(r.action.type)));
    const pool = permitted.length >= 2 ? permitted : [...ranked];
    const result = pool.slice(0, Math.ceil(count / 2));
    const used = new Set(result.map(r => r.code));
    const semantics = new Set(result.map(r => `${actorKey(r.action)}:${r.action.type}`));
    const reasonable = pool.filter(r => r.score >= (pool[0]?.score ?? 0) - gap);
    for (const r of reasonable) {
        const key = `${actorKey(r.action)}:${r.action.type}`;
        if (result.length < count && !used.has(r.code) && !semantics.has(key)) {
            result.push(r); used.add(r.code); semantics.add(key);
        }
    }
    for (const r of reasonable) if (result.length < count && !used.has(r.code)) { result.push(r); used.add(r.code); }
    return result;
}

/** 使用全合法动作归一化，避免候选池变化改变根基线。 */
export function rootLogPriors(ranked: readonly RankedAction[], temperature: number): Map<string, number> {
    const max = Math.max(...ranked.map(r => r.score / temperature));
    const normalizer = max + Math.log(ranked.reduce((s, r) => s + Math.exp(r.score / temperature - max), 0));
    return new Map(ranked.map(r => [r.code, r.score / temperature - normalizer]));
}

/** 同单位占领、修复优于待机；推演排除禁手，无可用动作时保留原菜单。 */
export function filterRolloutActions(ranked: readonly RankedAction[]): RankedAction[] {
    const capturingActors = new Set(ranked.filter(r => r.action.type === 'capture' || r.action.type === 'repair').map(r => actionActor(r.action)));
    const permitted = ranked.filter(r => !(r.action.type === 'wait' && capturingActors.has(actionActor(r.action)))
        && !(Boolean(r.forbidden) && (r.action.type === 'wait' || r.action.type === 'end_turn')));
    return permitted.length ? permitted : [...ranked];
}
