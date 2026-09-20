/**
 * 前端/应用层 AI 策略适配器 (P0 可选交付)
 *
 * 封装原生启发式、随机 AI 以及训练生成的 NET_B 神经网络策略 (S10 搜索与 1-ply 快速预测)，
 * 提供零依赖纯浏览器端支持与异常安全回退保护。
 */
import { GameEngine } from '../engine';
import type { Action } from '../types';
import { HeuristicAI } from './heuristic_ai';
import { RandomAI } from './random_ai';
import { loadDualHeadModelFromJson, predictDecision, type DualHeadNet } from '../../../tools/skirmish_dual_head_net';
import { createNetworkModelScorer } from '../../../tools/skirmish_neural_search';
import { searchTeacherAction } from '../../../tools/skirmish_search_teacher';
import { encodeGameState, encodeGameAction } from '../../../tools/skirmish_network_features';
import netBData from './models/net_b_checkpoint.json';

export type SupportedAiPolicy = 'heuristic' | 'random' | 'net_b_s10' | 'net_b_1ply';

export interface AiActionResult {
    action: Action;
    latencyMs: number;
    nodesExpanded?: number;
    source: string;
    fallbackUsed?: boolean;
}

let cachedNetB: DualHeadNet | null = null;
let cachedModelScorer: ((state: any, playerId: number, actions: readonly Action[]) => Map<string, number>) | null = null;

function getNetB(): DualHeadNet {
    if (!cachedNetB) {
        cachedNetB = loadDualHeadModelFromJson(JSON.stringify(netBData));
    }
    return cachedNetB;
}

function getModelScorer() {
    if (!cachedModelScorer) {
        const net = getNetB();
        cachedModelScorer = createNetworkModelScorer(net);
    }
    return cachedModelScorer;
}

export function getAiAction(
    policy: SupportedAiPolicy,
    engine: GameEngine,
    playerId: number
): AiActionResult {
    const t0 = performance.now();

    if (policy === 'random') {
        const ai = new RandomAI();
        const action = ai.getAction(engine, playerId);
        return {
            action,
            latencyMs: Math.round(performance.now() - t0),
            source: 'RandomAI'
        };
    }

    if (policy === 'heuristic') {
        const ai = new HeuristicAI();
        const action = ai.getAction(engine, playerId);
        return {
            action,
            latencyMs: Math.round(performance.now() - t0),
            source: 'HeuristicAI'
        };
    }

    if (policy === 'net_b_1ply') {
        try {
            const net = getNetB();
            const state = engine.getState();
            const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
            if (legalActions.length === 0) {
                return {
                    action: { type: 'end_turn' },
                    latencyMs: Math.round(performance.now() - t0),
                    source: 'NET_B (1-ply: Empty)'
                };
            }
            const stateVec = Array.from(encodeGameState(state, playerId));
            const candVecs = legalActions.map(a => Array.from(encodeGameAction(state, playerId, a)));
            const decision = predictDecision(net, stateVec, candVecs);
            const bestAction = legalActions[decision.topIndex] ?? legalActions[0];
            return {
                action: bestAction,
                latencyMs: Math.round(performance.now() - t0),
                source: 'NET_B (1-ply Policy)'
            };
        } catch (err) {
            console.warn('[AI] NET_B 1-ply 异常，安全回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            return {
                action: fallbackAi.getAction(engine, playerId),
                latencyMs: Math.round(performance.now() - t0),
                source: 'HeuristicAI (Fallback)',
                fallbackUsed: true
            };
        }
    }

    if (policy === 'net_b_s10') {
        try {
            const scorer = getModelScorer();
            const state = engine.getState();
            const decision = searchTeacherAction({
                state,
                playerId,
                config: {
                    nodeBudget: 150,
                    deadlineMs: 1000,
                    searchStopElapsedMs: 850,
                    returnTargetElapsedMs: 950
                },
                modelScorer: scorer
            });
            return {
                action: decision.action,
                latencyMs: Math.round(decision.elapsedMs),
                nodesExpanded: decision.nodesExpanded,
                source: `NET_B S10 (${decision.reason})`,
                fallbackUsed: decision.fallbackUsed
            };
        } catch (err) {
            console.warn('[AI] NET_B S10 搜索异常，安全回退到 HeuristicAI:', err);
            const fallbackAi = new HeuristicAI();
            return {
                action: fallbackAi.getAction(engine, playerId),
                latencyMs: Math.round(performance.now() - t0),
                source: 'HeuristicAI (Fallback)',
                fallbackUsed: true
            };
        }
    }

    // 默认兜底
    const fallback = new HeuristicAI();
    return {
        action: fallback.getAction(engine, playerId),
        latencyMs: Math.round(performance.now() - t0),
        source: 'HeuristicAI (Default)'
    };
}
