/**
 * V13/T13-06: with calibrated thresholds, is the search's choice better BY ITS OWN LEAF
 * than the heuristic's choice?
 *
 * This is a PROXY comparison and is labelled as one. The teacher's leaf is
 * `evaluatePositionHeuristic` after a bounded friendly rollout plus a bounded opposing
 * probe, so "better leaf" means "better according to the same static evaluation the
 * heuristic already maximises one ply deep". It is NOT a win-rate result and must not be
 * reported as one.
 *
 * What it does establish, cheaply: whether the calibrated kernel actually improves on the
 * heuristic's choice along its own objective, and by how much. If the leaf margin is
 * consistently positive, the kernel is doing something the heuristic is not; if it is zero,
 * the takeover is cosmetic.
 *
 * Paired comparison, per decision, on the SAME state and the SAME candidate leaves:
 *     leaf(searchChoice)  vs  leaf(heuristicChoice)
 * Because the heuristic's choice is one of the candidates, both leaves come from the same
 * evaluation function, so the comparison is apples-to-apples.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/teacher_leaf_gain.ts \
 *     --plan sd-normal --map "(2) Duel.aem" --seed 2026070501 --decisions 24
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createEvaluationState } from '../../tools/skirmish_evaluation_state';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function writeAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}

function mulberry(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function code(a: Action): string {
    try { return encodeAction(a); } catch { return JSON.stringify(a); }
}

const SEARCH_SEED = 2026070501;
// Calibrated config: forced takeover with a candidate set wide enough to matter.
const CALIBRATED = {
    topK: 64, oppProbeK: 6, friendlyRolloutSteps: 3,
    takeoverThreshold: 0, vetoMargin: 0, dangerLine: Number.POSITIVE_INFINITY,
} as const;

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(2) Duel.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '24'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/teacher_leaf_gain.json');
    const wallBudgetMs = Number(arg('--wall-budget-ms', '240000'));

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();

    const kernel = new BattleSearchAI(SEARCH_SEED, { ...CALIBRATED });
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const started = Date.now();
    const rows: any[] = [];
    let decisions = 0;
    let timeouts = 0;
    let better = 0;
    let equal = 0;
    let worse = 0;
    const gains: number[] = [];

    while (!engine.isTerminal() && decisions < maxDecisions) {
        if (Date.now() - started > wallBudgetMs) {
            timeouts++;
            break;
        }
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 2) {
            const heurAction = new HeuristicAI(mulberry(seed ^ 0x5bf03635)).getAction(engine, p, legal);
            const searchAction = kernel.getAction(engine, p, legal);
            // Score BOTH choices with the SAME candidate evaluator, from a fresh kernel so
            // neither is advantaged by stream position.
            const scorer = new BattleSearchAI(SEARCH_SEED, { ...CALIBRATED });
            const leafSearch = scorer.evaluateCandidate(engine, p, searchAction);
            const scorer2 = new BattleSearchAI(SEARCH_SEED, { ...CALIBRATED });
            const leafHeur = scorer2.evaluateCandidate(engine, p, heurAction);
            const gain = leafSearch - leafHeur;
            gains.push(gain);
            if (gain > 0) better++;
            else if (gain === 0) equal++;
            else worse++;

            rows.push({
                decision: decisions, turn: state.turn, playerId: p, legalCount: legal.length,
                searchAction: code(searchAction), heuristicAction: code(heurAction),
                sameAction: code(searchAction) === code(heurAction),
                leafOfSearchChoice: leafSearch, leafOfHeuristicChoice: leafHeur, gain,
            });
            decisions++;
        }
        engine.step(heuristic.getAction(engine, p, undefined) ?? ({ type: 'end_turn' } as Action));
    }

    gains.sort((a, b) => a - b);
    const report = {
        schema: 'v13_teacher_leaf_gain_1',
        generatedAt: new Date().toISOString(),
        status: timeouts ? 'BUDGET_EXHAUSTED' : 'DONE',
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        config: { ...CALIBRATED, searchSeed: SEARCH_SEED },
        decisionsProbed: decisions,
        pairedLeafOutcome: { searchBetter: better, equal, searchWorse: worse },
        leafGain: {
            min: gains[0] ?? null,
            p25: gains.length ? gains[Math.floor(gains.length * 0.25)] : null,
            median: gains.length ? gains[Math.floor(gains.length / 2)] : null,
            p75: gains.length ? gains[Math.floor(gains.length * 0.75)] : null,
            max: gains.length ? gains[gains.length - 1] : null,
        },
        wallClockMs: Date.now() - started,
        boundary: 'PROXY ONLY. Both leaves come from evaluatePositionHeuristic via the same '
            + 'bounded rollout, so this shows the kernel improves its own objective, NOT that it '
            + 'wins more games. A win-rate claim requires paired natural games.',
        rows,
    };
    writeAtomic(out, report);

    console.log(`[T13-06] status=${report.status} decisions=${decisions} wall=${report.wallClockMs}ms`);
    console.log(`[T13-06] search leaf better/equal/worse = ${better}/${equal}/${worse}`);
    console.log(`[T13-06] leaf gain min=${report.leafGain.min} p25=${report.leafGain.p25} ` +
        `median=${report.leafGain.median} p75=${report.leafGain.p75} max=${report.leafGain.max}`);
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
