import { EvaluationRunner } from '../research/eval_runner';

const runner = new EvaluationRunner();
console.log("=== Testing Single Match: P1 vs HeuristicAI (Corrected surrender & winner) ===");

const res = runner.runSingleMatch(
    0,
    '(2) Duel.aem',
    { type: 'p1', id: 'P1_champion' },
    { type: 'heuristic', id: 'frozen_heuristic' },
    20261014,
    { maxSteps: 3000, maxWallSeconds: 300 }
);

console.log("Result:");
console.log("  Steps:", res.totalSteps);
console.log("  Handoffs:", res.totalHandoffs);
console.log("  IsTruncated:", res.isTruncated, "Reason:", res.truncationReason);
console.log("  WinnerAlliance:", res.winnerAlliance);
console.log("  Elapsed:", res.elapsedWallSeconds.toFixed(2), "s");
console.log("  First 10 actions:", res.actionCodes.slice(0, 10));
console.log("  Last 5 actions:", res.actionCodes.slice(-5));
