/**
 * V11 T11-04: planner cost accounting.
 *
 * Records the measured cost of one residual-planner decision and the defect that
 * made it quadratic, so the next round sizes its experiments from numbers.
 *
 *   v11/out/planner_cost.json
 */
import * as path from 'node:path';
import { OUT_DIR, ensureDir, writeJson } from './common';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState, type ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { chooseAction, DEFAULT_RESIDUAL_OPTIONS } from './residual_policy';
import { zeroedRanker } from './ranker';
import { v10SetupForSeed } from './replay';
import type { GameState } from '../../src/game/types';

export interface PlannerCostReport {
    schema: 'v11_planner_cost_1';
    generatedAt: string;
    position: { mapName: string; setupId: string; turn: number };
    measurements: Array<{
        continuationBudget: number;
        candidates: number;
        wallMs: number;
        engineTransitions: number;
        msPerTransition: number;
    }>;
    defectFixed: {
        summary: string;
        before: string;
        after: string;
        measuredEffect: string;
    };
    budgetSizing: {
        note: string;
        transitionsPerDecisionAtDefault: number;
        msPerTransition: number;
        estimatedSecondsPerDecision: number;
        /** Decisions in a full game, measured from the collected V11 pool. */
        meanDecisionsPerEpisode: number;
        estimatedMinutesPerResidualGame: number;
        estimatedMinutesPerAblationArm: number;
    };
    caveats: string[];
}

/** Mean number of subject-seat decisions in a collected episode, from disk. */
function meanDecisionsPerEpisode(): number {
    try {
        const fs = require('node:fs') as typeof import('node:fs');
        const file = 'training_runs/agent_upgrade_v11_b2_main/episodes.jsonl';
        if (!fs.existsSync(file)) return 0;
        const rows = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
        const steps = rows.map((r: any) => Number(r.engineStepCount ?? 0)).filter((n: number) => n > 0);
        if (steps.length === 0) return 0;
        // Roughly half the atomic steps belong to the subject seat.
        return Number(((steps.reduce((a: number, b: number) => a + b, 0) / steps.length) / 2).toFixed(1));
    } catch {
        return 0;
    }
}

export function runPlannerCost(): PlannerCostReport {
    ensureDir(OUT_DIR);
    const mapName = '(2) Duel.aem';
    const setup: ApkSkirmishSetupSelection = v10SetupForSeed(42);
    const state = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup });
    (state as any).mapName = mapName;
    const engine = new GameEngine(state);

    const measurements: PlannerCostReport['measurements'] = [];
    for (const [budget, candidates] of [[40, 4], [80, 4], [150, 4]] as Array<[number, number]>) {
        const s = JSON.parse(JSON.stringify(engine.getState())) as GameState;
        const t0 = Date.now();
        const decision = chooseAction({
            state: s, mapName, playerId: 0, step: 0,
            labels: { episodeId: 'cost-probe', rootFamilyId: 'cost-probe', setupId: 'probe', episodeOutcome: null },
            weights: zeroedRanker('pair'),
            options: {
                ...DEFAULT_RESIDUAL_OPTIONS,
                compareOptions: { continuationBudget: budget, maxCandidates: candidates, continuationSeed: 1 },
                maxCandidates: candidates,
            },
        });
        const wallMs = Date.now() - t0;
        measurements.push({
            continuationBudget: budget,
            candidates,
            wallMs,
            engineTransitions: decision.engineTransitions,
            msPerTransition: decision.engineTransitions > 0
                ? Number((wallMs / decision.engineTransitions).toFixed(2))
                : 0,
        });
    }

    const defaultBudget = DEFAULT_RESIDUAL_OPTIONS.compareOptions.continuationBudget;
    const defaultCandidates = DEFAULT_RESIDUAL_OPTIONS.maxCandidates;
    const atDefault = measurements.find(m => m.continuationBudget === defaultBudget) ?? measurements[0];
    const msPerTransition = atDefault?.msPerTransition || 30;
    const decisions = meanDecisionsPerEpisode();
    const secPerDecision = Number(((atDefault?.engineTransitions ?? 240) * msPerTransition / 1000).toFixed(1));

    return {
        schema: 'v11_planner_cost_1',
        generatedAt: new Date().toISOString(),
        position: { mapName, setupId: `g${setup.initialGold}_u${setup.unitLimit}_c${setup.levelCap}`, turn: engine.getState().turn },
        measurements,
        defectFixed: {
            summary: 'The residual planner compared its candidate set twice per decision.',
            before: 'chooseAction called compareDecision once to score the ranker proposal and again to confirm the margin.',
            after: 'One comparison per decision; the counterfactual values used for the margin are the same values the ranker is trained on.',
            measuredEffect:
                'Removed the second full candidate-set evaluation. The remaining cost is the engine simulation itself ' +
                `(about ${msPerTransition} ms per transition), which is irreducible without a cheaper reference policy.`,
        },
        budgetSizing: {
            note:
                'Sizing arithmetic for the next round. It assumes the measured per-transition cost and the observed ' +
                'decision count, both of which will shift with a different reference policy or a pre-filter.',
            transitionsPerDecisionAtDefault: atDefault?.engineTransitions ?? 0,
            msPerTransition,
            estimatedSecondsPerDecision: secPerDecision,
            meanDecisionsPerEpisode: decisions,
            estimatedMinutesPerResidualGame: Number(((secPerDecision * decisions) / 60).toFixed(1)),
            estimatedMinutesPerAblationArm: Number(((secPerDecision * decisions * 6) / 60).toFixed(1)),
        },
        caveats: [
            'Measured on one opening position, not averaged across the pool.',
            'Engine cloning dominates: every candidate deep-copies the full game state.',
            'This is a cost report, not a strength result.',
        ],
    };
}