import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { tacticalPriorBundle } from '../../../src/ai_runtime/dual_v3/search_policy';
import type { Action, GameState } from '../../../src/game/types';
import type { SearchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import type { WorkerModel } from './worker_model';

export function validTeacher(teacher: SearchTeacher | null) {
    return !!teacher?.available && teacher.evaluatedMask.filter((v, i) => v && !teacher.vetoMask[i]).length >= 2;
}

export async function fastAction(model: Pick<WorkerModel, 'forwardBatch'>, state: GameState, legal: Action[], rng: () => number, rounds: number) {
    const obs = encodeDualObservation(state, legal);
    const [out] = await model.forwardBatch([obs]);
    const { priors, forbidden } = tacticalPriorBundle(state, legal, new ReachabilityContext(state), true);
    const temperature = rounds < 3 ? 1 : .5;
    const scored = Array.from(obs.actions.sourceIndices, (source, row) => ({ source,
        score: forbidden?.[source] ? -Infinity : (out.logits[row] + priors[source]) / temperature }));
    const max = Math.max(...scored.map(s => s.score));
    if (!Number.isFinite(max)) throw Error('快走没有可采样动作');
    const weights = scored.map(s => Math.exp(s.score - max));
    let threshold = rng() * weights.reduce((a, b) => a + b, 0), last = -1;
    for (let i = 0; i < weights.length; i++) {
        if (weights[i] <= 0) continue;
        last = i; threshold -= weights[i];
        if (threshold < 0) return legal[scored[i].source];
    }
    if (last < 0) throw Error('快走概率质量为零');
    return legal[scored[last].source];
}
