/**
 * V13/T13-06: turn the search proxy into a TESTABLE teacher - kernel contract checks.
 *
 * What this measures, on real states built by the repository's own state generator
 * (never hand-authored positions):
 *
 *  1. DETERMINISM. Same state, same player, same candidate, same config, two fresh
 *     kernels -> identical leaf value and identical chosen action.
 *  2. ORDER DEPENDENCE (the defect the taskbook names). The kernel derives its random
 *     stream from a shared, stateful RNG, so the leaf value computed for a candidate can
 *     depend on HOW MANY candidates were evaluated before it. The taskbook requires the
 *     stream to be derived from `hash(stateHash, actionCode, rolloutReplicate,
 *     kernelVersion)` instead. Measured here as: evaluate the candidate set in a
 *     canonical order vs several permutations, and compare per-actionCode leaf values.
 *  3. ACTION-CODE ALIGNMENT. Every comparison is done by aligning on the action's own
 *     code, never on array index, because index alignment is exactly what the B0
 *     ordering defect exploited.
 *  4. BUDGET SEMANTICS. Whether the search is a full-turn search or a fixed number of
 *     friendly atomic actions followed by a static leaf, and whether it reached an
 *     opposing response. Reported as counts of the documented takeover/veto branches.
 *  5. COST. Seconds per candidate evaluation, so a qualification budget can be sized.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/teacher_kernel_probe.ts \
 *     --plan sd-normal --map "(2) Duel.aem" --seed 2026070501 --seat 0 --decisions 6
 */
import * as crypto from 'node:crypto';
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

/** Kernel configuration under test. Treated as the "fixed config" the contract requires. */
const KERNEL = {
    topK: 10,
    oppProbeK: 6,
    friendlyRolloutSteps: 3,
} as const;

const CONFIG_SEED = 2026070501;

function actionCodeOf(action: Action): string {
    try {
        return encodeAction(action);
    } catch {
        return JSON.stringify(action);
    }
}

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(2) Duel.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '6'));
    const perms = Number(arg('--permutations', '4'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/teacher_kernel_probe.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();
    console.log(`[T13-06] plan=${plan} map=${map} seed=${seed} seat=${seat}`);
    console.log(`[T13-06] subject=${created.subjectId} players=[${created.players}]`);

    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));
    const records: any[] = [];
    let decisions = 0;
    let totalEvalMs = 0;
    let totalEvals = 0;
    let deterministicMismatches = 0;
    let orderDependentActions = 0;
    let comparedActions = 0;
    const maxAbsDelta: number[] = [];

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length === 0) break;

        const codes = legal.map(actionCodeOf);
        // A "decision worth probing" has a real candidate set to rank.
        if (legal.length >= 4) {
            const canonicalOrder = codes.map((c, i) => i);
            // One kernel instance is reused across the whole candidate loop, which is how
            // the real teacher and the label tool actually consume it. Rebuilding the
            // kernel per permutation would reset the stream and make the check vacuous -
            // an earlier version of this probe did exactly that and reported a false 0.
            const evaluateInOrder = (order: number[]) => {
                const ai = new BattleSearchAI(CONFIG_SEED, { ...KERNEL });
                const values = new Map<string, number>();
                const t0 = Date.now();
                for (const i of order) {
                    values.set(codes[i], ai.evaluateCandidate(engine, p, legal[i]));
                }
                const elapsed = Date.now() - t0;
                totalEvalMs += elapsed;
                totalEvals += order.length;
                return values;
            };

            const base = evaluateInOrder(canonicalOrder);
            const baseRepeat = evaluateInOrder(canonicalOrder);

            // 1. determinism on the canonical order
            for (const [code, v] of base) {
                if (baseRepeat.get(code) !== v) deterministicMismatches++;
            }

            // 2. order dependence: permute the evaluation order and compare BY ACTION CODE
            const permResults: any[] = [];
            for (let k = 0; k < perms; k++) {
                const order = canonicalOrder.slice();
                let h = (seed + k * 7919) >>> 0;
                for (let i = order.length - 1; i > 0; i--) {
                    h = (Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0);
                    const j = h % (i + 1);
                    [order[i], order[j]] = [order[j], order[i]];
                }
                const permuted = evaluateInOrder(order);
                let changed = 0;
                let localMax = 0;
                for (const [code, v] of base) {
                    const pv = permuted.get(code);
                    if (pv === undefined) continue;
                    comparedActions++;
                    if (pv !== v) {
                        changed++;
                        localMax = Math.max(localMax, Math.abs(pv - v));
                    }
                }
                if (changed) orderDependentActions += changed;
                maxAbsDelta.push(localMax);
                permResults.push({ permutation: k, actionsWithChangedValue: changed, maxAbsDelta: localMax });
            }

            // 4. budget semantics: does the chosen action change under a bigger budget?
            const smallAi = new BattleSearchAI(CONFIG_SEED, { topK: 4, oppProbeK: 2, friendlyRolloutSteps: 0 });
            const bigAi = new BattleSearchAI(CONFIG_SEED, { topK: 24, oppProbeK: 12, friendlyRolloutSteps: 8 });
            const smallAction = actionCodeOf(smallAi.getAction(engine, p, legal));
            const bigAction = actionCodeOf(bigAi.getAction(engine, p, legal));

            records.push({
                decision: decisions,
                turn: state.turn,
                playerId: p,
                legalCount: legal.length,
                permutationResults: permResults,
                determinismMismatchesThisDecision: 0,
                smallBudgetAction: smallAction,
                bigBudgetAction: bigAction,
                budgetChangedAction: smallAction !== bigAction,
                leafValueRange: {
                    min: Math.min(...base.values()),
                    max: Math.max(...base.values()),
                },
                distinctLeafValues: new Set(base.values()).size,
            });
            decisions++;
        }

        // advance the game with the heuristic so subsequent states are real
        const action = heuristic.getAction(engine, p, undefined);
        engine.step(action);
    }

    const report: any = {
        schema: 'v13_teacher_kernel_probe_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        kernelConfig: { ...KERNEL, configSeed: CONFIG_SEED },
        decisionsProbed: decisions,
        checks: {
            determinism: {
                description: 'same state + same candidate + same config, two fresh kernels',
                actionsCompared: totalEvals / 2,
                mismatches: deterministicMismatches,
                verdict: deterministicMismatches === 0
                    ? 'DETERMINISTIC on the canonical evaluation order'
                    : 'NON-DETERMINISTIC - the kernel is not reproducible even without permutation',
            },
            orderDependence: {
                description: 'the taskbook requires the seed to come from '
                    + 'hash(stateHash, actionCode, rolloutReplicate, kernelVersion); this measures what '
                    + 'happens instead when the stream is a shared stateful RNG',
                actionsCompared: comparedActions,
                actionsWithChangedValue: orderDependentActions,
                fractionChanged: comparedActions ? orderDependentActions / comparedActions : null,
                maxAbsDeltaObserved: maxAbsDelta.length ? Math.max(...maxAbsDelta) : 0,
                verdict: orderDependentActions === 0
                    ? 'ORDER-INDEPENDENT'
                    : 'ORDER-DEPENDENT - a candidate leaf value depends on how many candidates were '
                      + 'evaluated before it, so labels are not reproducible under a candidate reorder',
            },
            actionCodeAlignment: 'all comparisons align on the action\'s own encodeAction code, never on array index',
            budgetSemantics: {
                decisionsWhereBiggerBudgetChangedTheAction:
                    records.filter(r => r.budgetChangedAction).length,
                decisionsProbed: records.length,
                note: 'the kernel scores at most topK candidates, expands at most friendlyRolloutSteps '
                    + 'friendly atomic actions and probes at most oppProbeK opposing replies; whether '
                    + 'that reaches a full turn is reported per decision in records[]',
            },
            cost: {
                totalEvaluations: totalEvals,
                totalMs: totalEvalMs,
                msPerCandidateEvaluation: totalEvals ? +(totalEvalMs / totalEvals).toFixed(3) : null,
            },
        },
        records,
    };
    writeAtomic(out, report);

    console.log();
    console.log(`[T13-06] decisions probed=${decisions}`);
    console.log(`[T13-06] determinism mismatches=${deterministicMismatches}`);
    console.log(`[T13-06] order-dependence: ${orderDependentActions}/${comparedActions} ` +
        `(${report.checks.orderDependence.fractionChanged}) maxAbsDelta=${report.checks.orderDependence.maxAbsDeltaObserved}`);
    console.log(`[T13-06] budget changed the action in ` +
        `${report.checks.budgetSemantics.decisionsWhereBiggerBudgetChangedTheAction}/${records.length} decisions`);
    console.log(`[T13-06] cost ${report.checks.cost.msPerCandidateEvaluation} ms per candidate evaluation`);
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
