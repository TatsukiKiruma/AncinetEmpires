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
    /** Soft search budget. Once exceeded, the search stops expanding but still keeps a real evaluated candidate when possible. */
    maxMs?: number;
    /** Absolute emergency ceiling. Only a hard breach permits returning the heuristic top action without any candidate trace. */
    hardMaxMs?: number;
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
    shallowEvaluation?: boolean;
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
    candidatesEvaluated?: number;
    shallowEvaluations?: number;
}

/**
 * Deterministically pick the HeuristicAI top action from precomputed candidate scores.
 * This mirrors HeuristicAI.getAction's urgent-action then non-surrender ordering without
 * paying for a second full scoring pass (the default AI's own behaviour is unchanged).
 */
export function selectHeuristicTopAction(
    scored: ReadonlyArray<{ action: Action; score: number }>,
    legalActions: readonly Action[]
): Action {
    const pickBest = (items: ReadonlyArray<{ action: Action; score: number }>): Action | null => {
        let best: { action: Action; score: number } | null = null;
        for (const item of items) {
            if (!best || item.score > best.score) {
                best = item;
            }
        }
        return best ? best.action : null;
    };
    const urgent = pickBest(scored.filter(item => item.score >= 50000));
    if (urgent) return urgent;
    const nonSurrender = pickBest(scored.filter(item => item.action.type !== 'surrender'));
    if (nonSurrender) return nonSurrender;
    return legalActions[0] ?? { type: 'end_turn' };
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
    options?: number | CandidateFilteringOptions,
    precomputedHeuristicScores?: ReadonlyArray<{ action: Action; score: number }>
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

    // One full HeuristicAI scoring pass is reused for the fallback top action, the fill quota,
    // and the caller's own fallback selection. No second scoring pass and no duplicated state copy.
    const scoredHeuristic = precomputedHeuristicScores
        ? [...precomputedHeuristicScores]
        : heuristicAi.scoreCandidateActions(engine, playerId, legal);
    const heuristicTop = selectHeuristicTopAction(scoredHeuristic, legal);
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
 * Execute Bounded Adversarial Search (S00 or S10) with a strict runtime gate.
 *
 * Deadline semantics:
 * - maxMs is the soft search budget. When it expires the search stops expanding.
 * - hardMaxMs is the absolute emergency ceiling. Only a hard breach may return the
 *   HeuristicAI top action without evaluating any candidate (deadlineFallbackCount).
 * - Before the hard ceiling, at least one candidate is always shallow-evaluated even
 *   when the soft budget has already expired, so the runtime gate can never regress
 *   to 100% heuristic action replacement during normal operation.
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
    const maxMs = options.budget?.maxMs ?? 700;
    const hardMaxMs = options.budget?.hardMaxMs ?? maxMs;
    const maxNodes = options.budget?.maxNodes ?? 40;
    const maxDepth = options.maxDepth ?? 8;
    const heuristicAi = options.heuristicAi ?? new HeuristicAI();

    let deadlineFallbackCount = 0;
    let wallClockExceeded = false;
    let candidatesEvaluated = 0;
    let shallowEvaluations = 0;

    const elapsedMs = (): number => performance.now() - startMs;
    const checkSoftDeadline = (): boolean => {
        if (elapsedMs() >= maxMs) {
            wallClockExceeded = true;
            return true;
        }
        return false;
    };
    const checkHardDeadline = (): boolean => elapsedMs() >= hardMaxMs;

    const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legalActions.length === 0) {
        return {
            chosenAction: { type: 'end_turn' },
            chosenActionCode: encodeAction({ type: 'end_turn' }),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: elapsedMs(),
            budgetReason: 'completed',
            traces: [],
            wallClockExceeded: false,
            deadlineFallbackCount: 0,
            candidatesEvaluated: 0,
            shallowEvaluations: 0
        };
    }

    // Single cached scoring pass: supplies the safe fallback action, candidate filtering,
    // and the fill quota. This removes the previous duplicate HeuristicAI scoring + state copy.
    const heuristicScores = heuristicAi.scoreCandidateActions(engine, playerId, legalActions);
    const heuristicTopAction = selectHeuristicTopAction(heuristicScores, legalActions);

    const emergencyFallback = (): BoundedSearchResult => {
        deadlineFallbackCount++;
        wallClockExceeded = true;
        return {
            chosenAction: heuristicTopAction,
            chosenActionCode: encodeAction(heuristicTopAction),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: elapsedMs(),
            budgetReason: 'timeout',
            traces: [],
            wallClockExceeded: true,
            deadlineFallbackCount,
            candidatesEvaluated: 0,
            shallowEvaluations: 0
        };
    };

    if (checkHardDeadline()) {
        return emergencyFallback();
    }

    const candidates = getFilteredCandidateActions(
        engine,
        playerId,
        heuristicAi,
        options.spatialPredictor,
        options.quotas,
        heuristicScores
    );

    if (checkHardDeadline()) {
        return emergencyFallback();
    }

    if (candidates.length === 0) {
        return {
            chosenAction: heuristicTopAction,
            chosenActionCode: encodeAction(heuristicTopAction),
            bestScore: 0,
            totalNodes: 0,
            elapsedMs: elapsedMs(),
            budgetReason: 'completed',
            traces: [],
            wallClockExceeded: false,
            deadlineFallbackCount: 0,
            candidatesEvaluated: 0,
            shallowEvaluations: 0
        };
    }

    let nodesExplored = 0;
    let bestScore = -Infinity;
    let bestAction: Action | null = null;
    const traces: SearchTraceItem[] = [];
    let stopReason: 'completed' | 'timeout' | 'node_limit' = 'completed';

    for (const cand of candidates) {
        if (nodesExplored >= maxNodes) {
            stopReason = 'node_limit';
            break;
        }

        const softExpiredBeforeCandidate = checkSoftDeadline();
        if (softExpiredBeforeCandidate && candidatesEvaluated > 0) {
            stopReason = 'timeout';
            break;
        }
        if (softExpiredBeforeCandidate && checkHardDeadline()) {
            stopReason = 'timeout';
            break;
        }

        // Only shallow-evaluate this candidate when the soft budget was already exhausted.
        const shallowOnly = softExpiredBeforeCandidate;

        const simEngine = engine.clone();
        simEngine.step(cand);
        nodesExplored++;

        let leafScore: number | null = null;
        let depth = 1;
        let reachedOpponent = false;
        let turnHandover = false;
        let opponentSteps = 0;
        let oppAttackCovered = false;
        let usedShallowEvaluation = shallowOnly;

        if (simEngine.isTerminal()) {
            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
        } else if (shallowOnly || checkHardDeadline()) {
            leafScore = evaluatePositionHeuristic(simEngine.getState(), playerId);
            shallowEvaluations++;
            usedShallowEvaluation = true;
        } else {
            // 1. Friendly turn completion: bounded rollout with HeuristicAI.
            let friendlySteps = 0;
            let friendlyAborted = false;
            while (!simEngine.isTerminal() && simEngine.getState().currentPlayer === playerId && friendlySteps < 4 && depth < maxDepth) {
                if (checkHardDeadline()) {
                    friendlyAborted = true;
                    break;
                }
                if (nodesExplored >= maxNodes) {
                    stopReason = 'node_limit';
                    friendlyAborted = true;
                    break;
                }
                const followActions = simEngine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
                if (followActions.length === 0) break;
                if (checkSoftDeadline()) {
                    friendlyAborted = true;
                    break;
                }
                const followAction = heuristicAi.getAction(simEngine, playerId, followActions);
                simEngine.step(followAction);
                nodesExplored++;
                depth++;
                friendlySteps++;
            }

            // 2. Opponent response simulation.
            if (!friendlyAborted && !simEngine.isTerminal() && simEngine.getState().currentPlayer !== playerId && depth < maxDepth) {
                reachedOpponent = true;
                turnHandover = true;
                const oppId = simEngine.getState().currentPlayer;
                for (let s = 0; s < 5 && !simEngine.isTerminal() && simEngine.getState().currentPlayer === oppId && depth < maxDepth; s++) {
                    if (checkHardDeadline()) {
                        friendlyAborted = true;
                        break;
                    }
                    if (nodesExplored >= maxNodes) {
                        stopReason = 'node_limit';
                        friendlyAborted = true;
                        break;
                    }
                    const oppActions = simEngine.getLegalActions(oppId).filter(a => a.type !== 'surrender');
                    if (oppActions.length === 0) break;
                    const attackAct = oppActions.find(a => a.type === 'attack');
                    let oppAct: Action;
                    if (attackAct) {
                        oppAct = attackAct;
                    } else {
                        if (checkSoftDeadline()) {
                            friendlyAborted = true;
                            break;
                        }
                        oppAct = heuristicAi.getAction(simEngine, oppId, oppActions);
                    }
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

            if (checkHardDeadline()) {
                shallowEvaluations++;
                usedShallowEvaluation = true;
            }
            // Leaf evaluation always happens for a started candidate, so a soft deadline
            // cannot abort a candidate without recording at least one real trace.
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
                oppAttackCovered,
                shallowEvaluation: usedShallowEvaluation
            });
            candidatesEvaluated++;

            if (leafScore > bestScore) {
                bestScore = leafScore;
                bestAction = cand;
            }
        }

        if (checkSoftDeadline()) {
            stopReason = 'timeout';
            break;
        }
    }

    if (stopReason === 'timeout') {
        wallClockExceeded = true;
    }

    let chosenAction: Action;
    if (bestAction !== null) {
        chosenAction = bestAction;
    } else {
        chosenAction = heuristicTopAction;
        bestScore = 0;
        deadlineFallbackCount++;
    }

    return {
        chosenAction,
        chosenActionCode: encodeAction(chosenAction),
        bestScore,
        totalNodes: nodesExplored,
        elapsedMs: elapsedMs(),
        budgetReason: stopReason,
        traces,
        wallClockExceeded,
        deadlineFallbackCount,
        candidatesEvaluated,
        shallowEvaluations
    };
}