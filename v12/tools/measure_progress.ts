/**
 * T12-02 measurement (progress-reporting variant).
 *
 * Runs ONE arm/match with generous caps and prints a progress line every N
 * planner decisions, so a long run can be monitored without waiting for the
 * final JSON. Writes NO artifacts.
 *
 * Usage:
 *   node v12/tools/run-tool.mjs v12/tools/measure_progress.ts [arm] [map] [seed] [seat] [maxSteps] [maxTurns] [maxDecisions] [progressEvery]
 */
import { playArmMatch } from '../../tools/v11/ablation';
import { DEFAULT_RESIDUAL_OPTIONS } from '../../tools/v11/residual_policy';
import { readRanker } from '../../tools/v11/ranker_io';
import { zeroedRanker } from '../../tools/v11/ranker';

const [, , armArg = 'planner_residual', mapArg = '(2) Duel.aem', seedArg = '42', seatArg = '0',
    maxStepsArg = '4000', maxTurnsArg = '60', maxDecisionsArg = '240', everyArg = '10'] = process.argv;

const seed = Number(seedArg);
const seat = Number(seatArg);
const every = Number(everyArg);
const arm = armArg as 'heuristic' | 'planner' | 'planner_zeroed' | 'planner_residual';
const rankerFile = process.env.V11_RANKER_FILE ?? 'v11/out/ranker_weights/fit1_pair_all.json';
const weights = arm === 'planner_residual'
    ? readRanker(rankerFile)
    : arm === 'planner' || arm === 'planner_zeroed' ? zeroedRanker('pair') : null;

const t0 = Date.now();
let events = 0;
const result = playArmMatch({
    arm, mapName: mapArg, seed, seat, weights,
    maxTurns: Number(maxTurnsArg), maxAtomicSteps: Number(maxStepsArg),
    maxDecisionsPerMatch: Number(maxDecisionsArg),
    plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
    interventionSink: (e) => {
        events += 1;
        if (events % every === 0) {
            console.log(`[progress] decisions=${events} turn=${e.turn} elapsedSec=${((Date.now() - t0) / 1000).toFixed(1)} overridesSoFar=?`);
        }
    },
});
const elapsedMs = Date.now() - t0;

console.log(JSON.stringify({
    arm, map: mapArg, seed, seat,
    caps: { maxTurns: Number(maxTurnsArg), maxAtomicSteps: Number(maxStepsArg), maxDecisionsPerMatch: Number(maxDecisionsArg) },
    plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
    rankerAttached: weights !== null,
    elapsedMs, elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
    msPerDecision: result.decisionsMade ? Number((elapsedMs / result.decisionsMade).toFixed(1)) : null,
    result,
}, null, 2));
