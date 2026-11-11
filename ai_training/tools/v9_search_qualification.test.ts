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
    getFilteredCandidateActionsDetailed
} from './v7_heuristic_bounded_search';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { encodeAction } from '../src/game/env';
import { UNIT_CONFIGS } from '../src/game/units';
import { getReachablePositions } from '../src/game/map';

describe('V9-04: Bounded Search Candidate Quotas, Response Coverage, and Teacher Qualification', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    it('V9-04-A: Immediate victory strictly dominates non-terminal economic gains', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // Player 0 friendly soldier adjacent to 1-HP enemy commander at (4, 4)
        const friendly = state.units.find(u => u.ownerId === 0)!;
        const enemyComm = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;

        friendly.pos = { x: 4, y: 3 };
        friendly.hp = 100;
        friendly.hasMoved = false;
        friendly.hasActed = false;

        enemyComm.pos = { x: 4, y: 4 };
        enemyComm.hp = 1; // 1 HP guarantees kill

        // Remove other enemy units and enemy castle so eliminating commander ends game immediately
        state.units = [friendly, enemyComm];
        for (let y = 0; y < state.map.height; y++) {
            for (let x = 0; x < state.map.width; x++) {
                if (state.map.tiles[y][x].ownerId === 1) state.map.tiles[y][x].ownerId = null;
            }
        }
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 1000, maxNodes: 30 }
        });

        expect(result.chosenAction.type).toBe('attack');
        expect(result.bestScore).toBe(100000); // Terminal victory dominant
    });

    it('V9-04-B: Anti-starvation quota priority guarantees heuristic fill candidates even when spatial attempts to saturate', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const engine = new GameEngine(state);
        const heuristicAi = new HeuristicAI();

        // Mock spatial predictor that returns high logits for all legal actions
        const mockSpatial = {
            predict: (_t: any, cands: any[]) => ({
                actionLogits: new Float32Array(cands.map((_, i) => 100 - i)),
                actionProbabilities: new Float32Array(cands.length)
            })
        } as any;

        const detailed = getFilteredCandidateActionsDetailed(engine, 0, heuristicAi, mockSpatial, {
            maxTotal: 10,
            tacticalQuota: 4,
            topSpatialK: 6,
            heuristicQuota: 4
        });

        // 1. Structural counts verification
        expect(detailed.sourceCounts.heuristicTop).toBe(1);
        // Heuristic fill MUST NOT be starved by spatial (priority reversal in V9-04)
        expect(detailed.sourceCounts.heuristicFill).toBeGreaterThan(0);
        expect(detailed.sourceCounts.heuristicFill).toBeLessThanOrEqual(4);
        // Spatial fills leftover capacity
        expect(detailed.sourceCounts.spatial).toBeGreaterThan(0);
        expect(detailed.candidates.length).toBeLessThanOrEqual(10);
        expect(detailed.candidates.length).toBe(
            detailed.sourceCounts.heuristicTop +
            detailed.sourceCounts.tactical +
            detailed.sourceCounts.heuristicFill +
            detailed.sourceCounts.spatial
        );

        // 2. Non-tautological candidate composition check:
        // Confirm candidates contain BOTH top-1 heuristic and at least one non-top-1 heuristic action
        const hTop = heuristicAi.getAction(engine, 0);
        const hTopCode = encodeAction(hTop);
        const legal = engine.getLegalActions(0).filter(a => a.type !== 'surrender');
        const scores = heuristicAi.scoreCandidateActions(engine, 0, legal);
        scores.sort((a, b) => b.score - a.score);
        const nonTopHeuristic = scores.find(s => encodeAction(s.action) !== hTopCode);

        expect(detailed.candidates.some(c => encodeAction(c) === hTopCode)).toBe(true);
        if (nonTopHeuristic) {
            expect(detailed.candidates.some(c => encodeAction(c) === encodeAction(nonTopHeuristic.action))).toBe(true);
        }
    });

    it('V9-04-C: Chosen move never lands inside the enemy attack envelope (min/max range aware)', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const friendly = state.units.find(u => u.ownerId === 0)!;
        const enemy = state.units.find(u => u.ownerId === 1)!;

        friendly.hp = 15;
        friendly.pos = { x: 2, y: 2 };
        friendly.hasMoved = false;
        friendly.hasActed = false;

        // Archer config is minRange 2 / maxRange 3: distance 1 is its dead zone, 2..3 is lethal.
        enemy.unitClass = 'archer';
        enemy.hp = 100;
        enemy.pos = { x: 2, y: 4 };
        enemy.hasMoved = false;
        enemy.hasActed = false;

        state.units = [friendly, enemy];
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, { budget: { maxMs: 1500, maxNodes: 40 } });

        const archer = UNIT_CONFIGS['archer'];
        const insideEnvelope = (p: { x: number; y: number }) => {
            const d = Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y);
            return d >= archer.minRange && d <= archer.maxRange;
        };

        if (result.chosenAction.type === 'move') {
            expect(insideEnvelope((result.chosenAction as any).to)).toBe(false);
        }

        const insideTraces = result.traces.filter(t => t.action.type === 'move' && insideEnvelope((t.action as any).to));
        expect(insideTraces.length).toBeGreaterThan(0);
        for (const t of insideTraces) {
            expect(t.score).toBeLessThan(result.bestScore);
        }
    });

    it('V9-04-E: More than 4 pending friendly actions never produce a false turn-handover claim', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const base = state.units.find(u => u.ownerId === 0)!;
        const enemies = state.units.filter(u => u.ownerId === 1);

        const tiles = getReachablePositions(state, base.id)
            .filter(p => !(p.x === base.pos.x && p.y === base.pos.y))
            .slice(0, 6);
        const squad = tiles.map((p, i) => ({
            ...JSON.parse(JSON.stringify(base)),
            id: `squad_${i}`,
            pos: { x: p.x, y: p.y },
            hasMoved: false,
            hasActed: false
        }));
        expect(squad.length).toBeGreaterThan(4);

        state.units = [...squad, ...enemies];
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, { budget: { maxMs: 1500, maxNodes: 30 } });
        expect(result.traces.length).toBeGreaterThan(0);

        for (const t of result.traces) {
            if (!t.turnHandover) {
                expect(t.opponentSteps).toBe(0);
            } else {
                expect(t.reachedOpponent).toBe(true);
            }
        }
        expect(result.traces.every(t => !t.turnHandover)).toBe(true);
    });

    it('V9-04-F: Opponent response picks the most dangerous verifiable attack, not the first legal attack', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const commander = state.units.find(u => u.ownerId === 0)!;
        const enemyBase = JSON.parse(JSON.stringify(state.units.find(u => u.ownerId === 1)!));

        const tank = JSON.parse(JSON.stringify(commander));
        commander.unitClass = 'commander';
        commander.hp = 6;
        commander.pos = { x: 4, y: 4 };
        commander.hasMoved = true;
        commander.hasActed = true;
        commander.status = null;

        tank.id = 'tank_1';
        tank.unitClass = 'golem';
        tank.hp = 300;
        tank.pos = { x: 4, y: 8 };
        tank.hasMoved = true;
        tank.hasActed = true;
        tank.status = null;

        // The weak attacker is FIRST in unit order, so its attack is the first legal attack.
        const weak = { ...enemyBase, id: 'e_weak', unitClass: 'paladin', hp: 100, pos: { x: 4, y: 7 }, hasMoved: false, hasActed: false, status: null };
        const lethal = { ...enemyBase, id: 'e_lethal', unitClass: 'paladin', hp: 100, pos: { x: 4, y: 5 }, hasMoved: false, hasActed: false, status: null };

        state.units = [commander, tank, weak, lethal];
        state.players[0].gold = 0;
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, { budget: { maxMs: 2000, maxNodes: 40 } });

        expect(result.traces.length).toBeGreaterThan(0);
        const primary = result.traces.map(t => t.opponentChosenAction).filter(Boolean) as string[];
        expect(primary.length).toBeGreaterThan(0);
        expect(primary.some(code => code.includes('e_lethal') && code.includes(commander.id))).toBe(true);
        expect(primary.some(code => code.includes('e_weak'))).toBe(false);
        expect(result.traces.some(t => t.opponentPrimaryRule === 'most_dangerous_attack_probe')).toBe(true);
    });

    it('V9-04-G: Move-then-attack sequence is covered when no attack is legal at handover', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        const friendly = state.units.find(u => u.ownerId === 0)!;
        const enemy = state.units.find(u => u.ownerId === 1)!;

        friendly.hp = 20;
        friendly.pos = { x: 2, y: 1 };
        friendly.hasMoved = true;
        friendly.hasActed = true;

        // Archer at distance 4: no attack is legal at handover, it must move before it can shoot.
        enemy.unitClass = 'archer';
        enemy.hp = 100;
        enemy.pos = { x: 2, y: 5 };
        enemy.hasMoved = false;
        enemy.hasActed = false;

        state.units = [friendly, enemy];
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const result = runBoundedSearch(engine, 0, { budget: { maxMs: 2000, maxNodes: 40 } });

        const moveThenAttack = result.traces.filter(
            t => t.oppAttackCovered && t.opponentPrimaryRule === 'most_dangerous_move_probe'
        );
        expect(moveThenAttack.length).toBeGreaterThan(0);
    });

    it('V9-04-D: Search traces record reachedOpponent, turnHandover, depth, and structured sourceCounts', () => {
        const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        // Friendly unit can execute end_turn or advance to trigger opponent response
        const engine = new GameEngine(state);

        const result = runBoundedSearch(engine, 0, {
            budget: { maxMs: 1500, maxNodes: 40 }
        });

        expect(result.traces.length).toBeGreaterThan(0);
        expect(result.sourceCounts).toBeDefined();
        expect(result.sourceCounts!.heuristicTop).toBe(1);

        let hasTurnHandover = false;
        let hasReachedOpponent = false;

        for (const t of result.traces) {
            expect(typeof t.depthReached).toBe('number');
            expect(t.depthReached).toBeGreaterThanOrEqual(1);
            if (t.turnHandover) hasTurnHandover = true;
            if (t.reachedOpponent) hasReachedOpponent = true;
        }

        // With friendly steps allowed up to end_turn, at least one trace (e.g. end_turn) triggers turn handover
        expect(hasTurnHandover).toBe(true);
        expect(hasReachedOpponent).toBe(true);
    });
});
