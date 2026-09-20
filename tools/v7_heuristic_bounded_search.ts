/**
 * AncientEmpires - V7 Bounded Search Teacher & Spatial Prior Search (R7-05 & R7-06)
 * 
 * Implements:
 * 1. Frozen Heuristic Position Evaluation (NO pseudo-value, root-perspective terminal-dominant)
 * 2. Bounded Search Heuristic (S00): Shallow tactical search with opponent response simulation
 * 3. Spatial Prior + Bounded Search (S10): Spatial ResNet policy logits prioritize root candidates
 * 4. Wall-clock budget (100ms, 300ms, 700ms) and node budget tracking
 * 5. Trace logging: chosen branch, nodes explored, ms taken, candidate ranking
 */

import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getAllianceId, getUnitCost, isCommanderUnit, areEnemyPlayers } from '../src/game/rule_config';
import { encodeAction } from '../src/game/env';
import { SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';

export interface BoundedSearchBudget {
    maxNodes?: number;
    maxMs?: number;
}

export interface SearchTraceItem {
    action: Action;
    actionCode: string;
    score: number;
    nodesExplored: number;
    leafEvaluated: number;
    spatialPriorLogit?: number;
    depthReached: number;
}

export interface BoundedSearchResult {
    chosenAction: Action;
    chosenActionCode: string;
    bestScore: number;
    totalNodes: number;
    elapsedMs: number;
    budgetReason: 'completed' | 'timeout' | 'node_limit';
    traces: SearchTraceItem[];
}

/**
 * Deterministic Frozen Heuristic Leaf Evaluation function.
 * Evaluates state strictly from rootPlayerId's alliance perspective.
 * Positive = Advantage for rootPlayer. Negative = Advantage for opponent.
 */
export function evaluatePositionHeuristic(state: GameState, rootPlayerId: number): number {
    const rootAlliance = getAllianceId(state, rootPlayerId);

    // 1. Natural Terminal Dominance
    if (state.winner !== null) {
        if (state.winner === rootAlliance) return 100000;
        if (state.winner === -1) return 0; // True draw
        return -100000; // Loss
    }

    let rootMaterial = 0;
    let enemyMaterial = 0;
    let rootCommanderAlive = false;
    let enemyCommanderAlive = false;
    let rootCommanderHp = 0;
    let enemyCommanderHp = 0;

    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const isAllied = getAllianceId(state, u.ownerId) === rootAlliance;
        const cost = getUnitCost(state, u.ownerId, u.unitClass) ?? 200;
        const effectiveHpRatio = u.hp / 100.0;
        const value = cost * effectiveHpRatio;

        if (isCommanderUnit(state, u)) {
            if (isAllied) {
                rootCommanderAlive = true;
                rootCommanderHp = u.hp;
                rootMaterial += value + 600; // Commander strategic bonus
            } else {
                enemyCommanderAlive = true;
                enemyCommanderHp = u.hp;
                enemyMaterial += value + 600;
            }
        } else {
            if (isAllied) {
                rootMaterial += value;
            } else {
                enemyMaterial += value;
            }
        }
    }

    // 2. Territory / Building Control
    let rootTerritory = 0;
    let enemyTerritory = 0;
    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            if (tile.ownerId === null) continue;
            const isAllied = getAllianceId(state, tile.ownerId) === rootAlliance;
            const bVal = tile.terrainId === 10 ? 500 : 150; // Castle vs Town
            if (isAllied) {
                rootTerritory += bVal;
            } else {
                enemyTerritory += bVal;
            }
        }
    }

    // 3. Economy & Gold
    let rootGold = 0;
    let enemyGold = 0;
    for (const p of state.players) {
        const isAllied = getAllianceId(state, p.id) === rootAlliance;
        if (isAllied) {
            rootGold += p.gold;
        } else {
            enemyGold += p.gold;
        }
    }

    // 4. Commander Status Bonus/Penalty
    let commanderBonus = 0;
    if (!rootCommanderAlive) commanderBonus -= 1200;
    else if (rootCommanderHp < 35) commanderBonus -= 400;

    if (!enemyCommanderAlive) commanderBonus += 1200;
    else if (enemyCommanderHp < 35) commanderBonus += 400;

    const totalScore = (rootMaterial - enemyMaterial) * 2.0
        + (rootTerritory - enemyTerritory) * 1.5
        + (rootGold - enemyGold) * 0.5
        + commanderBonus;

    return totalScore;
}

/**
 * Filter and deduplicate candidate actions by exact action representation
 */
export function getFilteredCandidateActions(
    engine: GameEngine,
    playerId: number,
    heuristicAi: HeuristicAI,
    spatialPredictor?: SpatialResNetPredictor,
    topSpatialK: number = 8
): Action[] {
    const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legal.length <= 1) return legal;

    const actionMap = new Map<string, Action>();

    // 1. Always include the HeuristicAI's top recommendation
    const heuristicTop = heuristicAi.getAction(engine, playerId, legal);
    actionMap.set(encodeAction(heuristicTop), heuristicTop);

    // 2. Add high-priority tactical actions: commander recruit, attack, castle capture, repairs
    for (const a of legal) {
        if (a.type === 'recruit_to_castle' && a.unitClass === 'commander') {
            actionMap.set(encodeAction(a), a);
        } else if (a.type === 'attack') {
            actionMap.set(encodeAction(a), a);
        } else if (a.type === 'capture') {
            actionMap.set(encodeAction(a), a);
        }
    }

    // 3. If Spatial predictor is provided, add top-K candidates from network prior
    if (spatialPredictor) {
        const state = engine.getState();
        const encSpatial = encodeGameStateSpatial(state, playerId, 'v2');
        const candSpatial = legal.map(a => {
            const feat = encodeCandidateActionSpatial(state, playerId, a, 'v2');
            return {
                actorCoord: feat.actorCoord,
                landingCoord: feat.landingCoord,
                targetCoord: feat.targetCoord,
                semantics: feat.semantics
            };
        });
        const pred = spatialPredictor.predict(encSpatial.spatialTensor, encSpatial.globalFeatures, candSpatial);
        const scored = legal.map((a, idx) => ({ action: a, logit: pred.actionLogits[idx] }));
        scored.sort((a, b) => b.logit - a.logit);
        for (let i = 0; i < Math.min(topSpatialK, scored.length); i++) {
            actionMap.set(encodeAction(scored[i].action), scored[i].action);
        }
    }

    // 4. If candidate list is still small (< 6), add top actions by Heuristic scores
    if (actionMap.size < 6) {
        const scoredHeuristic = heuristicAi.scoreCandidateActions(engine, playerId, legal);
        scoredHeuristic.sort((a, b) => b.score - a.score);
        for (const item of scoredHeuristic) {
            if (actionMap.size >= 8) break;
            actionMap.set(encodeAction(item.action), item.action);
        }
    }

    return Array.from(actionMap.values());
}

/**
 * Execute Bounded Search (S00 or S10)
 */
export function runBoundedSearch(
    engine: GameEngine,
    playerId: number,
    options: {
        budget?: BoundedSearchBudget;
        heuristicAi?: HeuristicAI;
        spatialPredictor?: SpatialResNetPredictor;
        maxDepth?: number;
    } = {}
): BoundedSearchResult {
    const startMs = Date.now();
    const maxMs = options.budget?.maxMs ?? 700; // default 700ms (safe under 1000ms e2e)
    const maxNodes = options.budget?.maxNodes ?? 40;
    const heuristicAi = options.heuristicAi ?? new HeuristicAI();
    const candidates = getFilteredCandidateActions(engine, playerId, heuristicAi, options.spatialPredictor);

    if (candidates.length === 0) {
        return {
            chosenAction: { type: 'end_turn' },
            chosenActionCode: encodeAction({ type: 'end_turn' }),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: Date.now() - startMs,
            budgetReason: 'completed',
            traces: []
        };
    }

    let nodesExplored = 0;
    let bestScore = -Infinity;
    let bestAction = candidates[0];
    const traces: SearchTraceItem[] = [];
    let stopReason: 'completed' | 'timeout' | 'node_limit' = 'completed';

    for (const cand of candidates) {
        if (Date.now() - startMs >= maxMs) {
            stopReason = 'timeout';
            break;
        }
        if (nodesExplored >= maxNodes) {
            stopReason = 'node_limit';
            break;
        }

        const simEngine = engine.clone();
        simEngine.step(cand);
        nodesExplored++;

        let leafScore: number;
        let depth = 1;

        if (simEngine.isTerminal()) {
            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
        } else {
            const afterState = simEngine.getState();
            // If turn did not pass yet, let Heuristic play up to 1 more friendly tactical action
            if (afterState.currentPlayer === playerId) {
                const followActions = simEngine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
                if (followActions.length > 0) {
                    const followAction = heuristicAi.getAction(simEngine, playerId, followActions);
                    simEngine.step(followAction);
                    nodesExplored++;
                    depth++;
                }
            }

            // Simulate opponent response (1 step) to check immediate counter-attack
            const oppState = simEngine.getState();
            if (!simEngine.isTerminal() && oppState.currentPlayer !== playerId) {
                const oppId = oppState.currentPlayer;
                const oppActions = simEngine.getLegalActions(oppId).filter(a => a.type !== 'surrender');
                if (oppActions.length > 0) {
                    const oppAction = heuristicAi.getAction(simEngine, oppId, oppActions);
                    simEngine.step(oppAction);
                    nodesExplored++;
                    depth++;
                }
            }

            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
        }

        const candCode = encodeAction(cand);
        traces.push({
            action: cand,
            actionCode: candCode,
            score: leafScore,
            nodesExplored,
            leafEvaluated: leafScore,
            depthReached: depth
        });

        if (leafScore > bestScore) {
            bestScore = leafScore;
            bestAction = cand;
        }
    }

    const elapsedMs = Date.now() - startMs;
    return {
        chosenAction: bestAction,
        chosenActionCode: encodeAction(bestAction),
        bestScore,
        totalNodes: nodesExplored,
        elapsedMs,
        budgetReason: stopReason,
        traces
    };
}
