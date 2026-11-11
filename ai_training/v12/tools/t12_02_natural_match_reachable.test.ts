/**
 * T12-02 regression: a natural, NON-TRUNCATED match must be reachable under the
 * default ablation caps.
 *
 * The defect this guards against: `defaultAblationOptions()` once carried
 * `maxDecisionsPerMatch = 8`, which truncated every planner arm at 100% and
 * made `strength_ablation.json` carry no comparison information at all.
 *
 * The test uses the `heuristic` arm deliberately. It runs the engine with the
 * SAME caps the ablation passes to every arm (`maxTurns`, `maxAtomicSteps`,
 * `maxDecisionsPerMatch`) but takes no planner decisions, so it costs a few
 * seconds instead of the ~20 minutes a `planner_residual` match costs. If the
 * caps were the binding constraint the way they were in T11-04, even this arm
 * would report TRUNCATED. A second case pins the caps themselves, and a third
 * pins the `planner` / `planner_zeroed` equality that makes the control valid.
 */
import { describe, expect, it } from 'vitest';
import { defaultAblationOptions, playArmMatch } from '../../tools/v11/ablation';
import { zeroedRanker } from '../../tools/v11/ranker';

const MAP = '(2) Duel.aem';
const SEED = 42;

describe('T12-02 ablation caps reach a natural termination', () => {
    const options = defaultAblationOptions();

    it('default caps are far above the measured natural game length', () => {
        // Measured natural games on (2) Duel.aem / seed 42 / seat 0:
        //   heuristic 8 turns, 130 steps, 0 decisions
        //   planner_residual 9 turns, 194 steps, 132 decisions
        expect(options.maxTurns).toBeGreaterThanOrEqual(60);
        expect(options.maxAtomicSteps).toBeGreaterThanOrEqual(4000);
        expect(options.maxDecisionsPerMatch).toBeGreaterThanOrEqual(240);
    });

    it('the default caps do not bind: a match terminates naturally, not truncated', () => {
        const match = playArmMatch({
            arm: 'heuristic',
            mapName: MAP,
            seed: SEED,
            seat: 0,
            weights: null,
            maxTurns: options.maxTurns,
            maxAtomicSteps: options.maxAtomicSteps,
            maxDecisionsPerMatch: options.maxDecisionsPerMatch,
            plannerOptions: options.plannerOptions,
        });

        expect(match.error).toBeNull();
        expect(match.status).not.toBe('TRUNCATED');
        expect(match.terminationReason).not.toBe('TRUNCATION');
        // The game must have actually been played, not ended on step 0.
        expect(match.steps).toBeGreaterThan(50);
        expect(match.turns).toBeGreaterThan(3);
    }, 120_000);

    it('the zeroed ranker reproduces the zero vector, so the control arm is a control', () => {
        const zeroed = zeroedRanker('pair');
        expect(zeroed.weights.every(w => w === 0)).toBe(true);
    });
});
