/**
 * V13/T13-06: why does a forced takeover miss a free capture? Two mutually exclusive causes.
 *
 * `tactical_soundness.ts` measured IMMEDIATE_CAPTURE at 17.6-23.1% for the calibrated kernel
 * against 100% for the heuristic. The previous round attributed that to a "noise maximiser"
 * (a stochastic leaf plus a maximum over many candidates). Inspecting
 * `evaluatePositionHeuristic` shows it contains NO rng call at all - it is deterministic. So
 * that explanation is wrong and is corrected here.
 *
 * The two remaining possibilities are distinguishable with one measurement:
 *
 *   (A) SELECTION FAILURE. The capture's leaf is at least as good as everything else, but the
 *       forced-takeover argmax does not return it - i.e. the wrapper or the kernel picks
 *       wrongly.
 *   (B) LEAF DISAGREEMENT. The capture's leaf is genuinely LOWER than some other candidate's,
 *       so the kernel is faithfully maximising a leaf that undervalues capturing. The kernel is
 *       then doing its job and the LEAF is the defect.
 *
 * For every decision where a free capture exists this reports:
 *   - leaf(capture), leaf(best non-capture), and the signed difference
 *   - whether the capture is the argmax
 *   - whether two fresh kernel instances agree on each leaf (determinism)
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/capture_leaf_probe.ts \
 *     --plan sd-normal --map "(2) Duel.aem" --seed 2026070501 --decisions 200
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createEvaluationState } from '../../tools/skirmish_evaluation_state';
import { encodeAction } from '../../src/game/env';
import { mulberry, codeOf } from './tactical_core';
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

const SEED = 2026070501;
const KERNEL = { topK: 16, oppProbeK: 6, friendlyRolloutSteps: 3, takeoverThreshold: 0,
                 vetoMargin: 0, dangerLine: Number.POSITIVE_INFINITY } as const;

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(2) Duel.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '200'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/capture_leaf_probe.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();
    const kernel = new BattleSearchAI(SEED, { ...KERNEL });
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const rows: any[] = [];
    let decisions = 0;
    let captureDecisions = 0;
    let captureIsArgmax = 0;
    let captureLeafLower = 0;
    let captureLeafHigherOrEqual = 0;
    let determinismMismatches = 0;
    let captureTakenByHeuristic = 0;
    const margins: number[] = [];

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 2) {
            const captures = legal.filter(a => a.type === 'capture');
            if (captures.length) {
                captureDecisions++;
                const heurAction = new HeuristicAI(mulberry(seed ^ 0x5bf03635)).getAction(engine, p, legal);
                if (heurAction.type === 'capture') captureTakenByHeuristic++;

                // Same bounded candidate set the wrapper uses.
                const scored = (kernel as any).heuristic.scoreCandidateActions(engine, p, legal);
                const ordered = [...scored].sort((a: any, b: any) => b.score - a.score);
                const pool: Action[] = ordered.slice(0, Math.min(KERNEL.topK, ordered.length))
                    .map((c: any) => c.action);

                const leafOf = (action: Action, fresh: boolean) => {
                    const k = fresh ? new BattleSearchAI(SEED, { ...KERNEL }) : kernel;
                    return k.evaluateCandidate(engine, p, action);
                };
                // Determinism: two fresh kernels must agree.
                const capA = leafOf(captures[0], true);
                const capB = leafOf(captures[0], true);
                if (capA !== capB) determinismMismatches++;

                const capLeaf = capA;
                const nonCapture = pool.filter(a => a.type !== 'capture');
                if (!nonCapture.length) {
                    rows.push({ turn: state.turn, captureLeaf: capLeaf, bestNonCaptureLeaf: null,
                                note: 'no non-capture candidate in the bounded set' });
                } else {
                    const scoredLeaves = nonCapture.map(a => ({ code: codeOf(a), leaf: leafOf(a, true) }));
                    scoredLeaves.sort((a, b) => b.leaf - a.leaf);
                    const best = scoredLeaves[0];
                    const margin = capLeaf - best.leaf;
                    margins.push(margin);
                    const isArgmax = capLeaf >= best.leaf;
                    if (isArgmax) captureIsArgmax++; else captureLeafLower++;
                    if (isArgmax) captureLeafHigherOrEqual++;
                    rows.push({
                        turn: state.turn,
                        captureAction: codeOf(captures[0]),
                        captureLeaf: capLeaf,
                        bestNonCaptureAction: best.code,
                        bestNonCaptureLeaf: best.leaf,
                        captureMinusBestNonCapture: margin,
                        captureIsArgmax: isArgmax,
                        heuristicTookCapture: heurAction.type === 'capture',
                        poolSize: pool.length,
                    });
                }
            }
            decisions++;
        }
        engine.step(heuristic.getAction(engine, p, undefined) ?? ({ type: 'end_turn' } as Action));
    }

    margins.sort((a, b) => a - b);
    const report: any = {
        schema: 'v13_capture_leaf_probe_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        kernelConfig: { ...KERNEL, seed: SEED },
        decisionsScanned: decisions,
        decisionsWithAFreeCapture: captureDecisions,
        leafDeterminism: {
            mismatchesAcrossFreshKernels: determinismMismatches,
            note: 'evaluatePositionHeuristic contains no rng call, so a mismatch here would mean '
                + 'the rollout consumed an rng - it should be zero',
        },
        verdict: {
            captureIsArgmax: captureIsArgmax,
            captureLeafIsLowerThanSomeOtherCandidate: captureLeafLower,
            heuristicTookTheCapture: captureTakenByHeuristic,
        },
        marginCaptureMinusBestNonCapture: {
            min: margins[0] ?? null,
            median: margins.length ? margins[Math.floor(margins.length / 2)] : null,
            max: margins.length ? margins[margins.length - 1] : null,
        },
        interpretation: {
            ifCaptureIsArgmaxMostly: 'SELECTION is fine and the LEAF is the defect: the kernel '
                + 'maximises faithfully but the leaf ranks a position after capturing below a '
                + 'position without it',
            ifCaptureIsArgmaxRarely: 'the wrapper or kernel is not returning the argmax it computed',
        },
        rows,
        supersedes: {
            claim: "'forced takeover over a stochastic static leaf is a noise maximiser' (round 4)",
            why: 'evaluatePositionHeuristic has no rng call; this probe measures determinism '
                 + 'directly across fresh kernels',
            status: 'SUPERSEDED pending this probe result',
        },
    };
    writeAtomic(out, report);

    console.log(`[capture] decisions=${decisions} withFreeCapture=${captureDecisions}`);
    console.log(`[capture] leaf determinism mismatches = ${determinismMismatches}`);
    console.log(`[capture] capture IS argmax: ${captureIsArgmax}/${captureDecisions}`);
    console.log(`[capture] capture leaf lower: ${captureLeafLower}/${captureDecisions}`);
    console.log(`[capture] heuristic took the capture: ${captureTakenByHeuristic}/${captureDecisions}`);
    console.log(`[capture] margin (capture - bestNonCapture): min=${report.marginCaptureMinusBestNonCapture.min} ` +
        `median=${report.marginCaptureMinusBestNonCapture.median} max=${report.marginCaptureMinusBestNonCapture.max}`);
    console.log(`[capture] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
