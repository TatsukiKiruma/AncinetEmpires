/**
 * T11 网络辅助搜索适配层：把 T10 双头网络接入 T07 搜索教师与对局策略。
 *
 * 三种用法（任务书 T11 执行详情 1）：
 *   ① createNetworkModelScorer —— 策略头对合法动作打分，作【推演剪枝先验】（buildCandidatePool 的 model 来源，
 *      保留启发式/占领/探索槽位，网络不会把有价值动作从搜索中永久排除）；
 *   ② createNetworkLeafEvaluator —— 价值头作【未终局叶节点】局面评估，替换昂贵的领地全图扫描；
 *      真实胜/负/平短路始终优先（不改规则），网络量级远低于 TERMINAL，绝不冒充已验证胜负；
 *   ③ createNeuralPolicyFactory —— 纯网络 1-ply 快速路径（消融基线：无搜索时网络的独立棋力/时延）。
 *
 * 全部为策略性挂钩，绝不修改引擎转移、合法性或评分公式；缺省不注入时搜索行为与 T07/T08 逐位一致。
 */
import { encodeAction } from '../src/game/env';
import { getAllianceId } from '../src/game/rule_config';
import type { Action, GameState } from '../src/game/types';
import { encodeGameState, encodeGameAction } from './skirmish_network_features';
import { predictDecision, type DualHeadNet } from './skirmish_dual_head_net';
import type { ModelScorer } from './skirmish_search_teacher';
import type { SkirmishPolicy, SkirmishPolicyContext, SkirmishPolicyFactory } from './skirmish_training_runner';

/** 策略头评分器：只对非 surrender 合法动作给出有限先验（key=encodeAction）。 */
export function createNetworkModelScorer(net: DualHeadNet): ModelScorer {
    return (state: GameState, playerId: number, actions: readonly Action[]): Map<string, number> => {
        const out = new Map<string, number>();
        const legal = actions.filter(a => a.type !== 'surrender');
        if (legal.length === 0) return out;
        const sv = Array.from(encodeGameState(state, playerId));
        const candidates = legal.map(a => Array.from(encodeGameAction(state, playerId, a)));
        const decision = predictDecision(net, sv, candidates);
        legal.forEach((a, i) => out.set(encodeAction(a), decision.logits[i] ?? -Infinity));
        return out;
    };
}

/**
 * 价值头叶评估器：返回根阵营视角标量（rootAllianceId → 该联盟任一玩家编码视角）。
 * scale 控制量级，默认 1000，确保 |value| 远低于 TERMINAL_WIN，真实胜负永远压倒网络估值。
 */
export function createNetworkLeafEvaluator(net: DualHeadNet, opts: { scale?: number } = {}): (state: GameState, rootAllianceId: number) => number {
    const scale = opts.scale ?? 1000;
    return (state: GameState, rootAllianceId: number): number => {
        const perspective = state.players.find(p => getAllianceId(state, p.id) === rootAllianceId)?.id ?? state.currentPlayer;
        const sv = Array.from(encodeGameState(state, perspective));
        const decision = predictDecision(net, sv, []);
        const v = decision.value * scale;
        return Number.isFinite(v) ? v : 0;
    };
}

/** 纯网络 1-ply 策略工厂：直接取策略头 argmax（同分按动作码字典序稳定裁决），兜底首个合法动作。 */
export function createNeuralPolicyFactory(net: DualHeadNet, name = 'neural-policy-1ply'): SkirmishPolicyFactory {
    return (playerId: number): SkirmishPolicy => ({
        name,
        selectFixedActionIndex(context: SkirmishPolicyContext): number {
            const result = context.result as unknown as {
                state: GameState;
                legalActionEntries?: { code: string; action: Action; fixedActionIndex: number | null }[];
                fixedLegalActionIndexes?: number[];
            };
            const entries = (result.legalActionEntries ?? []).filter(e => e.fixedActionIndex !== null && e.action.type !== 'surrender');
            if (entries.length === 0) return result.fixedLegalActionIndexes?.[0] ?? -1;
            const sv = Array.from(encodeGameState(result.state, playerId));
            const candidates = entries.map(e => Array.from(encodeGameAction(result.state, playerId, e.action)));
            const decision = predictDecision(net, sv, candidates);
            let best = 0;
            for (let i = 1; i < entries.length; i += 1) {
                const li = decision.logits[i] ?? -Infinity;
                const lb = decision.logits[best] ?? -Infinity;
                if (li > lb || (li === lb && entries[i].code < entries[best].code)) best = i;
            }
            const chosen = entries[best].fixedActionIndex!;
            if ((result.fixedLegalActionIndexes ?? []).includes(chosen)) return chosen;
            return entries[0].fixedActionIndex!;
        }
    });
}
