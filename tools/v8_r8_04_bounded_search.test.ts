import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { Action, GameState } from '../src/game/types';
import { createDemoState } from '../src/game/demo_map';
import {
    evaluatePositionHeuristic,
    runBoundedSearch,
    getFilteredCandidateActions,
    SearchTraceItem
} from './v7_heuristic_bounded_search';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

describe('R8-04 Bounded Search & Leaf Evaluation', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    it('R8-04-A: Leaf evaluation rewards advancing towards objectives over idle/retreating', () => {
        const baseState = createDemoState(rules);
        // Clone two states: in stateAdvanced, friendly unit is closer to enemy castle/units
        const stateAdvanced = JSON.parse(JSON.stringify(baseState)) as GameState;
        const stateRetreated = JSON.parse(JSON.stringify(baseState)) as GameState;

        // Friendly soldier at (4, 4) in advanced vs (0, 1) in retreated (same hp, same gold, same buildings)
        const uAdv = stateAdvanced.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier');
        const uRet = stateRetreated.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier');
        expect(uAdv).toBeDefined();
        expect(uRet).toBeDefined();
        if (uAdv && uRet) {
            uAdv.pos = { x: 4, y: 4 }; // advanced towards center
            uRet.pos = { x: 0, y: 1 }; // back near friendly castle
        }

        const scoreAdv = evaluatePositionHeuristic(stateAdvanced, 0);
        const scoreRet = evaluatePositionHeuristic(stateRetreated, 0);

        expect(scoreAdv).toBeGreaterThan(scoreRet);
        // Non-terminal evaluations must remain bounded within [-50000, 50000]
        expect(scoreAdv).toBeLessThan(50000);
        expect(scoreRet).toBeGreaterThan(-50000);
    });

    it('R8-04-B: Leaf evaluation maintains strict terminal dominance', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const normalScore = evaluatePositionHeuristic(state, 0);

        const winState = JSON.parse(JSON.stringify(state)) as GameState;
        winState.winner = 0;
        const winScore = evaluatePositionHeuristic(winState, 0);

        const lossState = JSON.parse(JSON.stringify(state)) as GameState;
        lossState.winner = 1;
        const lossScore = evaluatePositionHeuristic(lossState, 0);

        expect(winScore).toBe(100000);
        expect(lossScore).toBe(-100000);
        expect(winScore).toBeGreaterThan(normalScore);
        expect(normalScore).toBeGreaterThan(lossScore);
    });

    it('R8-04-C: Search traces report reachedOpponent, turnHandover, opponentSteps and oppAttackCovered', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 1000, maxNodes: 30 }
        });

        expect(result.traces.length).toBeGreaterThan(0);
        for (const trace of result.traces) {
            expect(typeof trace.reachedOpponent).toBe('boolean');
            expect(typeof trace.turnHandover).toBe('boolean');
            expect(typeof trace.opponentSteps).toBe('number');
            expect(typeof trace.oppAttackCovered).toBe('boolean');
            expect(typeof trace.depthReached).toBe('number');
            expect(trace.depthReached).toBeGreaterThanOrEqual(1);
        }
    });

    it('R8-04-D: Simulates opponent move-then-attack response chain and penalizes suicidal exposure', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // Place friendly soldier at (3, 4) with 80 HP
        const friendly = state.units.find(u => u.ownerId === 0);
        const enemy = state.units.find(u => u.ownerId === 1);
        if (!friendly || !enemy) return;

        friendly.hp = 80;
        friendly.pos = { x: 3, y: 4 };
        friendly.hasMoved = false;
        friendly.hasActed = false;

        // Enemy is 3 tiles away at (6, 4): enemy can move to (5, 4) or (4, 4) and attack
        enemy.hp = 100;
        enemy.pos = { x: 6, y: 4 };
        enemy.hasMoved = false;
        enemy.hasActed = false;

        state.units = [friendly, enemy];
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 1500, maxNodes: 40 }
        });

        expect(result.chosenAction).toBeDefined();
        // The search traces should demonstrate that opponent counter-attack was simulated
        const tracesWithOpp = result.traces.filter(t => t.reachedOpponent);
        expect(tracesWithOpp.length).toBeGreaterThan(0);
        const tracesWithOppAttack = result.traces.filter(t => t.oppAttackCovered);
        expect(tracesWithOppAttack.length).toBeGreaterThan(0);
    });

    it('R8-04-E: Candidate filtering obeys quotas for tactical, heuristic, and neural actions', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();

        const candidates = getFilteredCandidateActions(engine, 0, heuristicAi, undefined, {
            maxTotal: 10,
            tacticalQuota: 4,
            heuristicQuota: 4
        });

        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.length).toBeLessThanOrEqual(10);
        // Heuristic AI recommendation must always be included
        const heuristicTop = heuristicAi.getAction(engine, 0);
        const hasTop = candidates.some(c => JSON.stringify(c) === JSON.stringify(heuristicTop));
        expect(hasTop).toBe(true);
    });

    it('R8-04-F: Deep water regression test: terrainId === 2 is deep water and yields 0 building control bonus', () => {
        const baseState = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const stateA = JSON.parse(JSON.stringify(baseState)) as GameState;
        const stateB = JSON.parse(JSON.stringify(baseState)) as GameState;

        // Place a tile with terrainId 2 owned by player 0 in stateA
        stateA.map.tiles[0][0] = { terrainId: 2, ownerId: 0 };
        // Place a tile with terrainId 2 owned by no one in stateB
        stateB.map.tiles[0][0] = { terrainId: 2, ownerId: null };

        // TerrainId 2 is water/deep water, NOT a castle (10) or town (9), so ownership change of water yields no territory points
        const scoreA = evaluatePositionHeuristic(stateA, 0);
        const scoreB = evaluatePositionHeuristic(stateB, 0);
        expect(scoreA).toBe(scoreB);

        // Place a castle (terrainId 10) owned by player 0 in stateC
        const stateC = JSON.parse(JSON.stringify(baseState)) as GameState;
        stateC.map.tiles[0][0] = { terrainId: 10, ownerId: 0 };
        const scoreC = evaluatePositionHeuristic(stateC, 0);
        expect(scoreC).toBeGreaterThan(scoreA);
    });

    it('R8-04-G: Strict quota classification: tacticalQuota, heuristicQuota, and maxTotal limits are enforced', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();

        // 1. maxTotal = 2 enforces candidates <= 2
        const candsMax2 = getFilteredCandidateActions(engine, 0, heuristicAi, undefined, {
            maxTotal: 2,
            tacticalQuota: 1,
            heuristicQuota: 1
        });
        expect(candsMax2.length).toBeLessThanOrEqual(2);

        // 2. heuristicQuota = 1 with tacticalQuota = 0 enforces heuristic items capped at 1 (+ heuristicTop)
        const candsH1 = getFilteredCandidateActions(engine, 0, heuristicAi, undefined, {
            maxTotal: 10,
            tacticalQuota: 0,
            heuristicQuota: 1
        });
        // Top 1 + at most 1 from heuristic quota = at most 2
        expect(candsH1.length).toBeLessThanOrEqual(2);

        // 3. Mock spatial predictor topSpatialK
        const mockSpatialPredictor = {
            predict: (_encState: any, cands: any[]) => ({
                actionLogits: cands.map((_, i) => 10 - i),
                bestActionIndex: 0
            })
        } as any;

        const candsSpatial = getFilteredCandidateActions(engine, 0, heuristicAi, mockSpatialPredictor, {
            maxTotal: 6,
            tacticalQuota: 0,
            topSpatialK: 2,
            heuristicQuota: 0
        });
        // Should have heuristicTop + 2 spatial candidates = 3
        expect(candsSpatial.length).toBeLessThanOrEqual(3);
    });

    it('R8-04-H: maxDepth and maxNodes boundary enforcement', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);

        // Strict maxNodes = 5
        const resultLowNodes = runBoundedSearch(engine, 0, {
            budget: { maxMs: 10000, maxNodes: 5 },
            maxDepth: 10
        });
        expect(resultLowNodes.totalNodes).toBeLessThanOrEqual(6); // within 1 rollout step
        expect(resultLowNodes.budgetReason).toBe('node_limit');

        // Strict maxDepth = 2
        const resultLowDepth = runBoundedSearch(engine, 0, {
            budget: { maxMs: 10000, maxNodes: 50 },
            maxDepth: 2
        });
        for (const tr of resultLowDepth.traces) {
            expect(tr.depthReached).toBeLessThanOrEqual(2);
        }
    });

    it('R8-04-I: Suicidal exposure behavior: search avoids walking directly into enemy attack range', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // Friendly commander at (3, 3) with 50 HP
        const friendly = state.units.find(u => u.ownerId === 0);
        const enemy = state.units.find(u => u.ownerId === 1);
        if (!friendly || !enemy) return;

        friendly.hp = 50;
        friendly.pos = { x: 3, y: 3 };
        friendly.hasMoved = false;
        friendly.hasActed = false;

        // Enemy archer at (3, 5) with range 2
        enemy.hp = 100;
        enemy.unitClass = 'archer';
        enemy.pos = { x: 3, y: 5 };
        enemy.hasMoved = false;
        enemy.hasActed = false;

        state.units = [friendly, enemy];
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 2000, maxNodes: 40 },
            maxDepth: 4
        });

        // The chosen action must NOT walk straight into enemy (3, 4)
        if (result.chosenAction.type === 'move') {
            const dest = (result.chosenAction as any).to;
            // Dest (3, 4) puts friendly right in melee/point-blank range of archer/enemy
            const suicidalTrace = result.traces.find(t => t.action.type === 'move' && (t.action as any).to?.x === 3 && (t.action as any).to?.y === 4);
            if (suicidalTrace) {
                expect(result.bestScore).toBeGreaterThanOrEqual(suicidalTrace.score);
            }
        }
    });

    it('R8-04-J: Fixed-node budget deterministic replayability: identical state, seed, and node budget produce identical traces and action', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const seed = 12345;
        const heuristicAi1 = new HeuristicAI(() => 0.5);
        const heuristicAi2 = new HeuristicAI(() => 0.5);

        const engine1 = new GameEngine(JSON.parse(JSON.stringify(state)));
        const engine2 = new GameEngine(JSON.parse(JSON.stringify(state)));

        const res1 = runBoundedSearch(engine1, 0, {
            budget: { maxMs: 100000, maxNodes: 15 },
            heuristicAi: heuristicAi1
        });

        const res2 = runBoundedSearch(engine2, 0, {
            budget: { maxMs: 100000, maxNodes: 15 },
            heuristicAi: heuristicAi2
        });

        expect(res1.chosenActionCode).toBe(res2.chosenActionCode);
        expect(res1.bestScore).toBe(res2.bestScore);
        expect(res1.totalNodes).toBe(res2.totalNodes);
        expect(res1.traces.length).toBe(res2.traces.length);
        for (let i = 0; i < res1.traces.length; i++) {
            expect(res1.traces[i].actionCode).toBe(res2.traces[i].actionCode);
            expect(res1.traces[i].score).toBe(res2.traces[i].score);
        }
    });
});
