/** 老师只读模型适配；统一使用现有编码及有限战术先验。 */
import fs from 'node:fs';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { getAllianceId } from '../../../../src/game/rule_config';
import { encodeDualObservation } from '../../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../../src/ai_runtime/dual_v2/reachability';
import { computeScalarValue } from '../../../../src/ai_runtime/dual_v2/value_model';
import { DualStreamModel } from '../../../../src/ai_runtime/dual_v3/model_runtime';
import { softPriors, type RankedAction } from '../../../../src/ai_runtime/dual_v3/search_policy';
import { read, sha } from './common';
import type { GameState } from '../../../../src/game/types';
export function load(prefix: string) {
    const raw = fs.readFileSync(prefix + '.bin');
    const model = new DualStreamModel(read(prefix + '.json'), raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    return { model, sha256: sha(raw) };
}
export function terminalValue(state: GameState, root: number): number | undefined {
    return state.winner === null ? undefined : state.winner === -1 ? 0 : state.winner === getAllianceId(state, root) ? 1 : -1;
}
export function evaluate(engine: GameEngine, model: DualStreamModel, root: number) {
    const state = engine.getState(), terminal = terminalValue(state, root);
    if (terminal !== undefined) return { value: terminal, ranked: [] as RankedAction[] };
    const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    if (!legal.length) throw Error('非终局没有合法策略动作');
    const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context);
    const output = model.forward(observation), prior = softPriors(state, legal, context);
    const ranked = Array.from(observation.actions.sourceIndices, (source, index) => ({ action: legal[source], code: encodeAction(legal[source]), score: output.logits[index] + prior[source], prior: prior[source] }));
    if (ranked.some(r => !Number.isFinite(r.score))) throw Error('策略分数非有限');
    ranked.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    return { value: computeScalarValue(output.valueProbs, state, observation.playerOrder, root), ranked };
}
