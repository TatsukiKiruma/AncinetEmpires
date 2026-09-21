/**
 * AncientEmpires - V7 Bounded Search Teacher & Spatial Prior Search (R7-05, R7-06, R8-04)
 * 
 * Implements:
 * 1. Interpretable Frozen Heuristic Position Evaluation (NO pseudo-value, terminal-dominant,
 *    distance-to-objective, commander vulnerability, capture progress)
 * 2. Bounded Adversarial Search (S00): Friendly rollouts to natural turn handover + opponent move->attack response chain
 * 3. Spatial Prior + Bounded Search (S10): Spatial ResNet policy logits prioritize candidates with quotas
 * 4. Wall-clock budget and node budget tracking
 * 5. Full search trace logging: reachedOpponent, turnHandover, opponentSteps, oppAttackCovered
 */

import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { Action, GameState, Position, Unit } from '../src/game/types';
import { getAllianceId, getUnitCost, isCommanderUnit, areEnemyPlayers } from '../src/game/rule_config';
import { encodeAction } from '../src/game/env';
import { getTileTerrainKey } from '../src/game/terrain_rules';
import { SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';

export interface BoundedSearchBudget {
    maxNodes?: number;
    maxMs?: number;
}

export interface CandidateFilteringOptions {
    maxTotal?: number;
    topSpatialK?: number;
    tacticalQuota?: number;
    heuristicQuota?: number;
}

export interface SearchTraceItem {
    action: Action;
    actionCode: string;
    score: number;
    nodesExplored: number;
    leafEvaluated: number;
    depthReached: number;
    reachedOpponent: boolean;
    turnHandover: boolean;
    opponentSteps: number;
    oppAttackCovered: boolean;
    spatialPriorLogit?: number;
}

export interface BoundedSearchResult {
    chosenAction: Action;
    chosenActionCode: string;
    bestScore: number;
    totalNodes: number;
    elapsedMs: number;
    budgetReason: 'completed' | 'timeout' | 'node_limit';
    traces: SearchTraceItem[];
    wallClockExceeded?: boolean;
    deadlineFallbackCount?: number;
}

/**
 * Deterministic Frozen Heuristic Leaf Evaluation function.
 * Evaluates state strictly from rootPlayerId's alliance perspective.
 * Positive = Advantage for rootPlayer. Negative = Advantage for opponent.
 * Non-terminal scores bounded to [-49000, 49000] so terminal +/-100000 strictly dominates.
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
    let rootCommanderPos: Position | null = null;
    let enemyCommanderPos: Position | null = null;

    const alliedUnits: Unit[] = [];
    const enemyUnits: Unit[] = [];

    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const isAllied = getAllianceId(state, u.ownerId) === rootAlliance;
        const cost = getUnitCost(state, u.ownerId, u.unitClass) ?? 200;
        const effectiveHpRatio = u.hp / 100.0;
        const value = cost * effectiveHpRatio;

        if (isAllied) {
            alliedUnits.push(u);
        } else {
            enemyUnits.push(u);
        }

        if (isCommanderUnit(state, u)) {
            if (isAllied) {
                rootCommanderAlive = true;
                rootCommanderHp = u.hp;
                rootCommanderPos = u.pos;
                rootMaterial += value + 600; // Commander strategic bonus
            } else {
                enemyCommanderAlive = true;
                enemyCommanderHp = u.hp;
                enemyCommanderPos = u.pos;
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

    // 2. Territory / Building Control & Target Buildings
    let rootTerritory = 0;
    let enemyTerritory = 0;
    const targetBuildings: Position[] = [];

    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            const tKey = getTileTerrainKey(tile);
            const isBuilding = tKey === 'castle' || tKey === 'town' || tKey === 'damaged_town';
            if (!isBuilding) continue;

            if (tile.ownerId === null || getAllianceId(state, tile.ownerId) !== rootAlliance) {
                targetBuildings.push({ x, y });
            }
            if (tile.ownerId === null) continue;
            const isAllied = getAllianceId(state, tile.ownerId) === rootAlliance;
            const bVal = tKey === 'castle' ? 500 : 150; // Castle vs Town
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

    // 5. Objective Distance & Advance Progress (R8-04)
    // Measures push toward enemy territory / commanders and capture targets
    let rootAdvanceBonus = 0;
    let enemyAdvanceBonus = 0;

    const enemyGoal = enemyCommanderPos ?? { x: state.map.width - 1, y: state.map.height - 1 };
    const rootGoal = rootCommanderPos ?? { x: 0, y: 0 };
    const maxBoardDist = state.map.width + state.map.height;

    for (const u of alliedUnits) {
        const distToGoal = Math.abs(u.pos.x - enemyGoal.x) + Math.abs(u.pos.y - enemyGoal.y);
        rootAdvanceBonus += Math.max(0, maxBoardDist - distToGoal) * 4;
    }

    for (const u of enemyUnits) {
        const distToGoal = Math.abs(u.pos.x - rootGoal.x) + Math.abs(u.pos.y - rootGoal.y);
        enemyAdvanceBonus += Math.max(0, maxBoardDist - distToGoal) * 4;
    }

    // 6. Tactical Threat & Commander Vulnerability (R8-04)
    let tacticalThreatDelta = 0;
    if (rootCommanderAlive && rootCommanderPos) {
        for (const e of enemyUnits) {
            const d = Math.abs(e.pos.x - rootCommanderPos.x) + Math.abs(e.pos.y - rootCommanderPos.y);
            if (d <= 2) {
                tacticalThreatDelta -= 200; // Immediate threat to friendly commander
            }
        }
    }
    if (enemyCommanderAlive && enemyCommanderPos) {
        for (const a of alliedUnits) {
            const d = Math.abs(a.pos.x - enemyCommanderPos.x) + Math.abs(a.pos.y - enemyCommanderPos.y);
            if (d <= 2) {
                tacticalThreatDelta += 200; // Tactical pressure on enemy commander
            }
        }
    }

    // 7. Capture In-Progress Bonus
    let captureBonus = 0;
    for (const u of alliedUnits) {
        const t = state.map.tiles[u.pos.y]?.[u.pos.x];
        const tKey = t ? getTileTerrainKey(t) : '';
        if (t && (tKey === 'castle' || tKey === 'town' || tKey === 'damaged_town') && (t.ownerId === null || getAllianceId(state, t.ownerId) !== rootAlliance)) {
            captureBonus += 80;
        }
    }

    const rawScore = (rootMaterial - enemyMaterial) * 2.0
        + (rootTerritory - enemyTerritory) * 1.5
        + (rootGold - enemyGold) * 0.5
        + commanderBonus
        + (rootAdvanceBonus - enemyAdvanceBonus)
        + tacticalThreatDelta
        + captureBonus;

    // Strict non-terminal bounding
    return Math.max(-49000, Math.min(49000, rawScore));
}

/**
 * Filter and deduplicate candidate actions with explicit quotas (R8-04)
 */
export function getFilteredCandidateActions(
    engine: GameEngine,
    playerId: number,
    heuristicAi: HeuristicAI,
    spatialPredictor?: SpatialResNetPredictor,
    options?: number | CandidateFilteringOptions
): Action[] {
    const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legal.length <= 1) return legal;

    const opts: CandidateFilteringOptions = typeof options === 'number'
        ? { topSpatialK: options, maxTotal: 10 }
        : (options ?? { maxTotal: 10, topSpatialK: 6, tacticalQuota: 4, heuristicQuota: 4 });

    const maxTotal = opts.maxTotal ?? 10;
    const topSpatialK = opts.topSpatialK ?? 6;
    const tacticalQuota = opts.tacticalQuota ?? 4;
    const heuristicQuota = opts.heuristicQuota ?? 4;
    const actionMap = new Map<string, Action>();

    // 1. Quota: Always include the HeuristicAI's top recommendation (1 slot)
    const heuristicTop = heuristicAi.getAction(engine, playerId, legal);
    actionMap.set(encodeAction(heuristicTop), heuristicTop);

    // 2. Quota: High-priority tactical actions: commander recruit, attacks, captures, castle unblock
    let tacticalAdded = 0;
    const tacticalCandidates: Action[] = [];
    for (const a of legal) {
        if ((a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && (a as any).unitClass === 'commander') {
            tacticalCandidates.push(a);
        } else if (a.type === 'attack') {
            tacticalCandidates.push(a);
        } else if (a.type === 'capture') {
            tacticalCandidates.push(a);
        }
    }
    for (const tac of tacticalCandidates) {
        if (tacticalAdded >= tacticalQuota || actionMap.size >= maxTotal) break;
        const code = encodeAction(tac);
        if (!actionMap.has(code)) {
            actionMap.set(code, tac);
            tacticalAdded++;
        }
    }

    // 3. Quota: Spatial predictor top-K candidates
    if (spatialPredictor && actionMap.size < maxTotal && topSpatialK > 0) {
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
        const pred = spatialPredictor.predict(encSpatial, candSpatial);
        const scored = legal.map((a, idx) => ({ action: a, logit: pred.actionLogits[idx] }));
        scored.sort((a, b) => b.logit - a.logit);
        let spatialAdded = 0;
        for (let i = 0; i < scored.length && spatialAdded < topSpatialK; i++) {
            if (actionMap.size >= maxTotal) break;
            const code = encodeAction(scored[i].action);
            if (!actionMap.has(code)) {
                actionMap.set(code, scored[i].action);
                spatialAdded++;
            }
        }
    }

    // 4. Quota: Fill remaining budget with top actions scored by HeuristicAI up to heuristicQuota
    if (actionMap.size < maxTotal && heuristicQuota > 0) {
        const scoredHeuristic = heuristicAi.scoreCandidateActions(engine, playerId, legal);
        scoredHeuristic.sort((a, b) => b.score - a.score);
        let heuristicAdded = 0;
        for (const item of scoredHeuristic) {
            if (actionMap.size >= maxTotal || heuristicAdded >= heuristicQuota) break;
            const code = encodeAction(item.action);
            if (!actionMap.has(code)) {
                actionMap.set(code, item.action);
                heuristicAdded++;
            }
        }
    }

    return Array.from(actionMap.values());
}

/**
 * Execute Bounded Adversarial Search (S00 or S10) with strict runtime gate
 */
export function runBoundedSearch(
    engine: GameEngine,
    playerId: number,
    options: {
        budget?: BoundedSearchBudget;
        heuristicAi?: HeuristicAI;
        spatialPredictor?: SpatialResNetPredictor;
        maxDepth?: number;
        quotas?: {
            tacticalQuota?: number;
            topSpatialK?: number;
            heuristicQuota?: number;
            maxTotal?: number;
        };
    } = {}
): BoundedSearchResult {
    const startMs = performance.now();
    const maxMs = options.budget?.maxMs ?? 700; // default 700ms
    const maxNodes = options.budget?.maxNodes ?? 40;
    const maxDepth = options.maxDepth ?? 8;
    const heuristicAi = options.heuristicAi ?? new HeuristicAI();

    let deadlineFallbackCount = 0;
    let wallClockExceeded = false;

    const checkDeadline = (): boolean => {
        if (performance.now() - startMs >= maxMs) {
            wallClockExceeded = true;
            return true;
        }
        return false;
    };

    const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legalActions.length === 0) {
        return {
            chosenAction: { type: 'end_turn' },
            chosenActionCode: encodeAction({ type: 'end_turn' }),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: performance.now() - startMs,
            budgetReason: 'completed',
            traces: [],
            wallClockExceeded: false,
            deadlineFallbackCount: 0
        };
    }

    // Heuristic top action cached for safe fallback if search times out before completing any candidate
    const heuristicTopAction = heuristicAi.getAction(engine, playerId, legalActions);

    if (checkDeadline()) {
        deadlineFallbackCount++;
        return {
            chosenAction: heuristicTopAction,
            chosenActionCode: encodeAction(heuristicTopAction),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: performance.now() - startMs,
            budgetReason: 'timeout',
            traces: [],
            wallClockExceeded: true,
            deadlineFallbackCount
        };
    }

    const candidates = getFilteredCandidateActions(engine, playerId, heuristicAi, options.spatialPredictor, options.quotas);

    if (candidates.length === 0) {
        return {
            chosenAction: heuristicTopAction,
            chosenActionCode: encodeAction(heuristicTopAction),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: performance.now() - startMs,
            budgetReason: 'completed',
            traces: [],
            wallClockExceeded: false,
            deadlineFallbackCount: 0
        };
    }

    let nodesExplored = 0;
    let bestScore = -Infinity;
    let bestAction: Action | null = null;
    const traces: SearchTraceItem[] = [];
    let stopReason: 'completed' | 'timeout' | 'node_limit' = 'completed';

    for (const cand of candidates) {
        if (checkDeadline()) {
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

        let leafScore: number | null = null;
        let depth = 1;
        let reachedOpponent = false;
        let turnHandover = false;
        let opponentSteps = 0;
        let oppAttackCovered = false;

        if (simEngine.isTerminal()) {
            if (checkDeadline()) {
                stopReason = 'timeout';
                break;
            }
            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
        } else {
            // 1. Friendly turn completion: roll out with HeuristicAI until natural handover, budget, maxDepth, or deadline
            let friendlySteps = 0;
            let friendlyAborted = false;
            while (!simEngine.isTerminal() && simEngine.getState().currentPlayer === playerId && friendlySteps < 4 && depth < maxDepth) {
                if (checkDeadline()) {
                    stopReason = 'timeout';
                    friendlyAborted = true;
                    break;
                }
                if (nodesExplored >= maxNodes) {
                    stopReason = 'node_limit';
                    break;
                }
                const followActions = simEngine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
                if (followActions.length === 0) break;
                const followAction = heuristicAi.getAction(simEngine, playerId, followActions);
                simEngine.step(followAction);
                nodesExplored++;
                depth++;
                friendlySteps++;
            }

            if (friendlyAborted) {
                break;
            }

            // 2. Opponent response simulation: roll out opponent move-then-attack chain
            const oppState = simEngine.getState();
            if (!simEngine.isTerminal() && oppState.currentPlayer !== playerId && depth < maxDepth) {
                reachedOpponent = true;
                turnHandover = true;
                const oppId = oppState.currentPlayer;
                for (let s = 0; s < 5 && !simEngine.isTerminal() && simEngine.getState().currentPlayer === oppId && depth < maxDepth; s++) {
                    if (checkDeadline()) {
                        stopReason = 'timeout';
                        break;
                    }
                    if (nodesExplored >= maxNodes) {
                        stopReason = 'node_limit';
                        break;
                    }
                    const oppActions = simEngine.getLegalActions(oppId).filter(a => a.type !== 'surrender');
                    if (oppActions.length === 0) break;
                    // Prioritize tactical attack response to test exposure
                    const attackAct = oppActions.find(a => a.type === 'attack');
                    const oppAct = attackAct ?? heuristicAi.getAction(simEngine, oppId, oppActions);
                    simEngine.step(oppAct);
                    nodesExplored++;
                    depth++;
                    opponentSteps++;
                    if (oppAct.type === 'attack') {
                        oppAttackCovered = true;
                        break;
                    }
                }
            }

            if (checkDeadline()) {
                stopReason = 'timeout';
                break;
            }

            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
        }

        if (leafScore !== null) {
            const candCode = encodeAction(cand);
            traces.push({
                action: cand,
                actionCode: candCode,
                score: leafScore,
                nodesExplored,
                leafEvaluated: leafScore,
                depthReached: depth,
                reachedOpponent,
                turnHandover,
                opponentSteps,
                oppAttackCovered
            });

            if (leafScore > bestScore) {
                bestScore = leafScore;
                bestAction = cand;
            }
        }
    }

    if (stopReason === 'timeout') {
        wallClockExceeded = true;
    }

    // If deadline expired before any candidate was completely evaluated, fallback to heuristic top action
    let chosenAction: Action;
    if (bestAction !== null) {
        chosenAction = bestAction;
    } else {
        chosenAction = heuristicTopAction;
        bestScore = 0;
        deadlineFallbackCount++;
    }

    const elapsedMs = performance.now() - startMs;
    return {
        chosenAction,
        chosenActionCode: encodeAction(chosenAction),
        bestScore,
        totalNodes: nodesExplored,
        elapsedMs,
        budgetReason: stopReason,
        traces,
        wallClockExceeded,
        deadlineFallbackCount
    };
}
