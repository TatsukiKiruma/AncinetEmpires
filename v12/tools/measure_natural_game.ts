/**
 * T12-02 measurement: how long is a NATURAL game, and what does one planner
 * decision actually cost?
 *
 * This script writes NOTHING. It only prints measurements, so it is safe to run
 * before choosing the new ablation defaults.
 *
 * Usage:
 *   node v11/tools/run-tool.mjs v12/tools/measure_natural_game.ts [arm] [map] [seed] [seat] [maxSteps] [maxTurns] [maxDecisions]
 */
import { playArmMatch } from '../../tools/v11/ablation';
import { DEFAULT_RESIDUAL_OPTIONS } from '../../tools/v11/residual_policy';
import { readRanker } from '../../tools/v11/ranker_io';
import { zeroedRanker } from '../../tools/v11/ranker';

const [, , armArg = 'heuristic', mapArg = '(2) Duel.aem', seedArg = '42', seatArg = '0',
    maxStepsArg = '20000', maxTurnsArg = '200', maxDecisionsArg = '100000'] = process.argv;

const seed = Number(seedArg);
const seat = Number(seatArg);
const maxAtomicSteps = Number(maxStepsArg);
const maxTurns = Number(maxTurnsArg);
const maxDecisionsPerMatch = Number(maxDecisionsArg);

const arm = armArg as 'heuristic' | 'planner' | 'planner_zeroed' | 'planner_residual';
const rankerFile = process.env.V11_RANKER_FILE ?? 'v11/out/ranker_weights/fit1_pair_all.json';
const weights = arm === 'planner_residual'
    ? readRanker(rankerFile)
    : arm === 'planner' ? zeroedRanker('pair') : null;

const t0 = Date.now();
const result = playArmMatch({
    arm, mapName: mapArg, seed, seat, weights,
    maxTurns, maxAtomicSteps, maxDecisionsPerMatch,
    plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
});
const elapsedMs = Date.now() - t0;

console.log(JSON.stringify({
    arm, map: mapArg, seed, seat,
    caps: { maxTurns, maxAtomicSteps, maxDecisionsPerMatch },
    plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
    rankerAttached: weights !== null,
    elapsedMs,
    elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
    msPerDecision: result.decisionsMade ? Number((elapsedMs / result.decisionsMade).toFixed(1)) : null,
    msPerTransition: result.engineTransitions ? Number((elapsedMs / result.engineTransitions).toFixed(2)) : null,
    result,
}, null, 2));
