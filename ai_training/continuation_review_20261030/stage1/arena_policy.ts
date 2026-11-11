/** 冻结的无搜索推理算法：现有编码、softPriors和稳定argmax。 */
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import type { Action, GameState } from '../../../src/game/types';
import type { InferenceClient } from '../../gpu/inference_client';

export async function modelAction(state: GameState, legal: Action[], client: InferenceClient): Promise<Action> {
    if (legal.length === 1) return legal[0];
    const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context), prior = softPriors(state, legal, context);
    const response = (await client.forward([observation]))[0];
    if (response.logits.length !== observation.actions.sourceIndices.length || !response.logits.every(Number.isFinite)) throw Error('模型候选响应无效');
    let best = 0, score = -Infinity;
    response.logits.forEach((v: number, i: number) => { const s = v + prior[observation.actions.sourceIndices[i]]; if (s > score) { score = s; best = i; } });
    return legal[observation.actions.sourceIndices[best]];
}
