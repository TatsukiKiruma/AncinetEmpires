/**
 * V11 T11-04: game-playing arms, intervention audit, strength ablation.
 *
 * Four arms, identical (map, seed, seat) blocks, opponent always the frozen
 * Heuristic baseline:
 *
 *   heuristic        : Heuristic plays the candidate seat
 *   planner          : residual planner with NO ranker attached
 *   planner_zeroed   : residual planner + zeroed ranker (learning neutered)
 *   planner_residual : residual planner + trained ranker
 *
 * `planner` and `planner_zeroed` must agree decision-for-decision; if they do
 * not, the "learning disabled" control is not a control.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT_DIR, RUN_ID, ensureDir, writeJson } from './common';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getLegalActions } from '../../src/game/rules';
import { getAllianceId } from '../../src/game/rule_config';
import { createApkSkirmishGameState, type ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import type { Action } from '../../src/game/types';
import { chooseAction, DEFAULT_RESIDUAL_OPTIONS, type ResidualPlannerOptions } from './residual_policy';
import { readRanker } from './ranker_io';
import { zeroedRanker, type RankerWeights } from './ranker';
import { v10SetupForSeed } from './replay';
import { BENCHMARK_MAPS } from '../v7_unified_evaluation';

export type AblationArm = 'heuristic' | 'planner' | 'planner_zeroed' | 'planner_residual';

export interface InterventionEvent {
    arm: AblationArm;
    matchId: string;
    mapName: string;
    seed: number;
    seat: number;
    turn: number;
    overridden: boolean;
    reason: string;
    margin: number;
    baseValue: number;
    chosenValue: number;
    candidatesConsidered: number;
    engineTransitions: number;
    chosenActionType: string;
}

export interface ArmMatchResult {
    arm: AblationArm;
    matchId: string;
    mapName: string;
    seed: number;
    seat: number;
    setupId: string;
    terminationReason: string;
    status: 'WIN' | 'LOSS' | 'DRAW' | 'TRUNCATED' | 'ERROR';
    steps: number;
    turns: number;
    overrides: number;
    decisionsMade: number;
    engineTransitions: number;
    error: string | null;
}

function setupFor(seed: number): ApkSkirmishSetupSelection {
    return v10SetupForSeed(seed);
}

export function playArmMatch(params: {
    arm: AblationArm;
    mapName: string;
    seed: number;
    seat: number;
    weights: RankerWeights | null;
    maxTurns: number;
    maxAtomicSteps: number;
    maxDecisionsPerMatch: number;
    plannerOptions: ResidualPlannerOptions;
    interventionSink?: (event: InterventionEvent) => void;
}): ArmMatchResult {
    const { arm, mapName, seed, seat } = params;
    const setup = setupFor(seed);
    const matchId = `${arm}_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}_s${seed}_seat${seat}`;
    const setupId = `g${setup.initialGold}_u${setup.unitLimit}_c${setup.levelCap}`;

    try {
        const state = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup });
        (state as any).mapName = mapName;
        const engine = new GameEngine(state);

        const rng = (() => {
            let s = (seed * 10007 + seat + 1) >>> 0;
            return () => {
                s = (s + 0x6D2B79F5) >>> 0;
                let t = Math.imul(s ^ (s >>> 15), 1 | s);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        })();
        const opponent = new HeuristicAI(rng);

        let steps = 0, decisionsMade = 0, overrides = 0, engineTransitions = 0;

        while (!engine.isTerminal() && steps < params.maxAtomicSteps && engine.getState().turn <= params.maxTurns) {
            const current = engine.getState();
            const curPlayer = current.currentPlayer;
            const legal = getLegalActions(current, curPlayer).filter(a => a.type !== 'surrender');

            if (legal.length === 0) {
                engine.step({ type: 'end_turn' } as Action);
                steps += 1;
                continue;
            }

            // Bounded work: stop consulting the planner once the cap is reached.
            // The match is then reported as TRUNCATED, never as a win or a loss.
            if (curPlayer === seat && arm !== 'heuristic' && decisionsMade >= params.maxDecisionsPerMatch) {
                break;
            }

            let action: Action;
            if (curPlayer === seat && arm !== 'heuristic') {
                const decision = chooseAction({
                    state: current,
                    mapName,
                    playerId: curPlayer,
                    step: steps,
                    labels: { episodeId: matchId, rootFamilyId: `root_${mapName}_s${seed}`, setupId, episodeOutcome: null },
                    weights: params.weights,
                    options: params.plannerOptions,
                });
                action = decision.action;
                decisionsMade += 1;
                if (decision.overridden) overrides += 1;
                engineTransitions += decision.engineTransitions;
                params.interventionSink?.({
                    arm, matchId, mapName, seed, seat,
                    turn: current.turn, overridden: decision.overridden, reason: decision.reason,
                    margin: decision.margin, baseValue: decision.baseValue, chosenValue: decision.chosenValue,
                    candidatesConsidered: decision.candidatesConsidered,
                    engineTransitions: decision.engineTransitions,
                    chosenActionType: action.type,
                });
            } else {
                action = opponent.getAction(engine, curPlayer, legal);
            }

            const legalNow = getLegalActions(engine.getState(), curPlayer).filter(a => a.type !== 'surrender');
            const usable = legalNow.some(a => JSON.stringify(a) === JSON.stringify(action)) ? action : legalNow[0];
            engine.step(usable);
            steps += 1;
        }

        const final = engine.getState();
        const terminal = engine.isTerminal();
        let status: ArmMatchResult['status'];
        let terminationReason: string;
        if (terminal) {
            const winner = final.winner;
            if (winner === null || winner < 0) {
                status = 'DRAW';
                terminationReason = 'NATURAL_DRAW';
            } else {
                const alliance = getAllianceId(final, seat);
                const won = winner === alliance || winner === seat;
                status = won ? 'WIN' : 'LOSS';
                terminationReason = won ? 'NATURAL_WIN' : 'NATURAL_LOSS';
            }
        } else {
            status = 'TRUNCATED';
            terminationReason = 'TRUNCATION';
        }

        return {
            arm, matchId, mapName, seed, seat, setupId, terminationReason, status,
            steps, turns: final.turn, overrides, decisionsMade, engineTransitions, error: null,
        };
    } catch (e: any) {
        return {
            arm, matchId, mapName, seed, seat, setupId,
            terminationReason: 'ENGINE_ERROR', status: 'ERROR',
            steps: 0, turns: 0, overrides: 0, decisionsMade: 0, engineTransitions: 0,
            error: String(e?.message ?? e),
        };
    }
}

export interface AblationOptions {
    maps?: string[];
    seeds?: number[];
    seats?: number[];
    maxTurns: number;
    maxAtomicSteps: number;
    /**
     * Safety cap on how many times the candidate seat consults the planner in
     * one match. NOT a normal-path budget - see `defaultAblationOptions`.
     *
     * When this binds, `playArmMatch` breaks out of the loop and the match is
     * reported as TRUNCATED, never as a win or a loss. Setting it below the
     * natural decision count of a match therefore destroys the arm comparison:
     * the T11-04 batch used 8, so all three planner arms truncated 100% and the
     * table carried no information.
     */
    maxDecisionsPerMatch: number;
    plannerOptions: ResidualPlannerOptions;
    rankerFile?: string | null;
}

/**
 * Default caps for a strength ablation.
 *
 * Calibration (T12-02, measured on `(2) Duel.aem`, seed 42, seat 0, with the
 * `DEFAULT_RESIDUAL_OPTIONS` comparison budget of 80 transitions x 3 candidates):
 *
 *   arm               turns  steps  decisions  termination
 *   heuristic             8    130          0  NATURAL_LOSS
 *   planner_zeroed        8    127         40  NATURAL_LOSS
 *   planner_residual      9    194        132  NATURAL_WIN
 *
 * The caps below are set well above every one of those measurements, so the
 * normal path is a naturally terminated match and a cap only fires on a
 * pathological game:
 *
 *   maxDecisionsPerMatch = 240   1.8x the largest observed decision count (132)
 *   maxAtomicSteps       = 4000  21x the largest observed step count (194)
 *   maxTurns             = 60    6.7x the largest observed turn count (9)
 *
 * Cost tradeoff, stated plainly: raising these caps is what makes the
 * truncation rate readable, and it is also what makes the run expensive. The
 * `planner_residual` arm is the only arm that pays for candidate comparisons
 * (it is the only arm whose ranker can score a non-baseline candidate above the
 * baseline, which is the gate that triggers a comparison): measured 9.9 s per
 * decision, so 22 minutes for that single 9-turn match. `planner` and
 * `planner_zeroed` share the zero weight vector, never pass that gate, and cost
 * ~0.18 s per decision. Narrow the run with the V11_ABLATION_MAPS /
 * V11_ABLATION_SEEDS / V11_ABLATION_SEATS variables rather than by lowering
 * these caps: lowering a cap reintroduces the truncation this calibration
 * exists to remove.
 */
export function defaultAblationOptions(): AblationOptions {
    return {
        maps: (process.env.V11_ABLATION_MAPS?.split('|')) ?? BENCHMARK_MAPS.map(m => m.name).slice(0, 4),
        seeds: (process.env.V11_ABLATION_SEEDS?.split(',').map(Number)) ?? [42, 1337, 2026],
        seats: (process.env.V11_ABLATION_SEATS?.split(',').map(Number).filter(Number.isFinite)) ?? [0, 1],
        maxTurns: Number(process.env.V11_ABLATION_MAX_TURNS ?? 60),
        maxAtomicSteps: Number(process.env.V11_ABLATION_MAX_STEPS ?? 4000),
        maxDecisionsPerMatch: Number(process.env.V11_ABLATION_MAX_DECISIONS ?? 240),
        plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
        rankerFile: process.env.V11_RANKER_FILE ?? path.join(OUT_DIR, 'ranker_weights', 'fit1_pair_all.json'),
    };
}

export function runStrengthAblation(options: AblationOptions): {
    ablation: Record<string, unknown>;
    interventions: Record<string, unknown>;
    files: string[];
} {
    ensureDir(OUT_DIR);
    const weights = options.rankerFile && fs.existsSync(options.rankerFile) ? readRanker(options.rankerFile) : null;
    const zeroed = zeroedRanker('pair');

    const events: InterventionEvent[] = [];
    const results: ArmMatchResult[] = [];
    // Four arms. The three planner arms all run the SAME comparison machinery with
    // the SAME budget; they differ only in the weight vector fed to the ranker:
    //
    //   heuristic        : Heuristic plays directly, no comparison at all
    //   planner          : comparison runs, ranker input is the zero vector
    //   planner_zeroed   : comparison runs, ranker input is the zero vector
    //   planner_residual : comparison runs, ranker input is the trained weights
    //
    // `planner` and `planner_zeroed` are therefore *intended* to be identical: they
    // are kept as two labels so the report can prove the equality rather than
    // assume it. An earlier revision passed `weights: null` for `planner`, which
    // made it short-circuit to the bare Heuristic action and silently collapse the
    // same-budget control into a duplicate of the `heuristic` arm.
    const arms: Array<{ arm: AblationArm; weights: RankerWeights | null }> = [
        { arm: 'heuristic', weights: null },
        { arm: 'planner', weights: zeroed },
        { arm: 'planner_zeroed', weights: zeroed },
        { arm: 'planner_residual', weights },
    ];

    for (const arm of arms) {
        for (const mapName of options.maps!) {
            for (const seed of options.seeds!) {
                for (const seat of options.seats!) {
                    results.push(playArmMatch({
                        arm: arm.arm, mapName, seed, seat, weights: arm.weights,
                        maxTurns: options.maxTurns, maxAtomicSteps: options.maxAtomicSteps,
                        maxDecisionsPerMatch: options.maxDecisionsPerMatch,
                        plannerOptions: options.plannerOptions,
                        interventionSink: e => events.push(e),
                    }));
                }
            }
        }
    }

    const armStats: Record<string, any> = {};
    for (const arm of arms) {
        const rows = results.filter(r => r.arm === arm.arm);
        const wins = rows.filter(r => r.status === 'WIN').length;
        const losses = rows.filter(r => r.status === 'LOSS').length;
        const draws = rows.filter(r => r.status === 'DRAW').length;
        const truncated = rows.filter(r => r.status === 'TRUNCATED').length;
        const errors = rows.filter(r => r.status === 'ERROR').length;
        const decisions = rows.reduce((n, r) => n + r.decisionsMade, 0);
        const overrides = rows.reduce((n, r) => n + r.overrides, 0);
        const transitions = rows.reduce((n, r) => n + r.engineTransitions, 0);
        armStats[arm.arm] = {
            matches: rows.length, wins, losses, draws, truncated, errors,
            naturalWinRate: wins + losses > 0 ? Number((wins / (wins + losses)).toFixed(4)) : 0,
            winRateAllMatches: rows.length ? Number((wins / rows.length).toFixed(4)) : 0,
            truncationRate: rows.length ? Number((truncated / rows.length).toFixed(4)) : 0,
            overrides, decisions,
            overrideShare: decisions ? Number((overrides / decisions).toFixed(4)) : 0,
            engineTransitions: transitions,
            transitionsPerDecision: decisions ? Number((transitions / decisions).toFixed(1)) : 0,
        };
    }

    const blockKey = (r: ArmMatchResult) => `${r.mapName}|${r.seed}|${r.seat}`;
    const byBlock = new Map<string, Map<AblationArm, ArmMatchResult>>();
    for (const r of results) {
        const m = byBlock.get(blockKey(r)) ?? new Map<AblationArm, ArmMatchResult>();
        m.set(r.arm, r);
        byBlock.set(blockKey(r), m);
    }
    const compare = (a: AblationArm, b: AblationArm) => {
        let aOnly = 0, bOnly = 0, bothWin = 0, bothNot = 0;
        for (const m of byBlock.values()) {
            const ra = m.get(a), rb = m.get(b);
            if (!ra || !rb) continue;
            const aw = ra.status === 'WIN', bw = rb.status === 'WIN';
            if (aw && bw) bothWin += 1;
            else if (aw) aOnly += 1;
            else if (bw) bOnly += 1;
            else bothNot += 1;
        }
        return {
            armA: a, armB: b, blocks: aOnly + bOnly + bothWin + bothNot,
            aOnlyWins: aOnly, bOnlyWins: bOnly, bothWin, bothNotWin: bothNot,
            discordant: aOnly + bOnly,
            note: 'Discordant pairs are the only ones that carry information about a difference.',
        };
    };

    let mismatch = 0;
    for (const [key, p] of byBlock) {
        const pl = p.get('planner'), ze = p.get('planner_zeroed');
        if (!pl || !ze) continue;
        // Compare behaviour, not only outcome: two arms can both lose while taking
        // different actions, and that difference is exactly what would confound the
        // ablation.
        if (pl.status !== ze.status
            || pl.overrides !== ze.overrides
            || pl.engineTransitions !== ze.engineTransitions
            || pl.decisionsMade !== ze.decisionsMade
            || pl.steps !== ze.steps) mismatch += 1;
    }

    // A planner arm that never runs the comparison would show zero transitions.
    // Record that explicitly so a collapsed arm cannot hide behind an outcome tie.
    const behaviourDistinct: Record<string, boolean> = {
        plannerRunsComparison: (armStats['planner']?.engineTransitions ?? 0) > 0,
        zeroedRunsComparison: (armStats['planner_zeroed']?.engineTransitions ?? 0) > 0,
        plannerDiffersFromHeuristic:
            (armStats['planner']?.decisions ?? 0) > 0
            && (armStats['planner']?.engineTransitions ?? 0) > 0,
    };

    const residual = armStats['planner_residual'];
    const planner = armStats['planner'];
    const learningAddsValue = residual && planner ? residual.naturalWinRate > planner.naturalWinRate : null;

    const ablation = {
        schema: 'v11_strength_ablation_1',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        protocol: {
            maps: options.maps, seeds: options.seeds, seats: options.seats,
            maxTurns: options.maxTurns, maxAtomicSteps: options.maxAtomicSteps,
            maxDecisionsPerMatch: options.maxDecisionsPerMatch,
            plannerOptions: options.plannerOptions,
            ranker: options.rankerFile ?? null,
            deterministic:
                'every arm replays identical (map, seed, seat) blocks; the residual arm seeds its continuation ' +
                'PRNG from the state hash, so a given decision is reproducible',
        },
        arms: armStats,
        behaviourDistinct,
        paired: [compare('planner_residual', 'planner'), compare('planner_residual', 'heuristic'), compare('planner', 'heuristic')],
        controlCheck: {
            plannerMatchesZeroed: mismatch === 0,
            mismatchBlocks: mismatch,
            note: mismatch === 0
                ? 'The zeroed-ranker arm reproduces the no-ranker arm exactly, so the learning-disabled control is valid.'
                : 'MISMATCH: the zeroed-ranker arm differs from the no-ranker arm, so the ablation is confounded.',
        },
        verdict: {
            summary: residual && planner
                ? `residual natural win rate ${(residual.naturalWinRate * 100).toFixed(1)}% vs planner ` +
                  `${(planner.naturalWinRate * 100).toFixed(1)}% and heuristic ${(armStats['heuristic'].naturalWinRate * 100).toFixed(1)}%`
                : 'insufficient arms completed',
            learningAddsValue,
            reason: learningAddsValue === true
                ? 'the residual arm scored above the identical-budget no-ranker arm'
                : learningAddsValue === false
                    ? 'the residual arm did not score above the identical-budget no-ranker arm; per the taskbook this is a non-promotion'
                    : 'not enough paired blocks to read the comparison',
        },
        caveats: [
            'Truncated matches are reported separately and are never counted as wins.',
            'The opponent is always the frozen Heuristic baseline, so this measures improvement against that opponent only.',
            'A difference on this many paired blocks is not a significance claim; discordant-pair counts are given so a reader can judge.',
        ],
    };

    const overridePairs: Record<string, number> = {};
    const refusalReasons: Record<string, number> = {};
    for (const e of events) {
        if (e.overridden) {
            overridePairs[`baseline->${e.chosenActionType}`] = (overridePairs[`baseline->${e.chosenActionType}`] ?? 0) + 1;
        } else {
            refusalReasons[e.reason] = (refusalReasons[e.reason] ?? 0) + 1;
        }
    }
    const byArm: Record<string, any> = {};
    for (const arm of arms) {
        const rows = events.filter(e => e.arm === arm.arm);
        const over = rows.filter(e => e.overridden);
        byArm[arm.arm] = {
            events: rows.length,
            overrides: over.length,
            overrideShare: rows.length ? Number((over.length / rows.length).toFixed(4)) : 0,
            meanMargin: over.length ? Number((over.reduce((n, e) => n + e.margin, 0) / over.length).toFixed(6)) : 0,
            transitions: rows.reduce((n, e) => n + e.engineTransitions, 0),
        };
    }

    const interventions = {
        schema: 'v11_intervention_audit_1',
        generatedAt: new Date().toISOString(),
        events: events.length,
        overrides: events.filter(e => e.overridden).length,
        refusals: events.filter(e => !e.overridden).length,
        overrideShare: events.length ? Number((events.filter(e => e.overridden).length / events.length).toFixed(4)) : 0,
        byArm,
        overrideActionTypePairs: overridePairs,
        refusalReasons,
        positiveMarginOverrides: events.filter(e => e.overridden && e.margin > 0).length,
        nonPositiveMarginOverrides: events.filter(e => e.overridden && e.margin <= 0).length,
        examples: events.filter(e => e.overridden).slice(0, 20),
        caveats: [
            'An override is only taken when the confirmed margin exceeds the pre-registered threshold; the threshold is in the protocol block.',
            'Refusals dominate whenever the module cannot confirm an improvement, which is the intended conservative behaviour.',
            'Margins come from bounded continuations, so a positive margin is evidence of an estimate, not of a proven gain.',
        ],
    };

    const files = {
        ablation: path.join(OUT_DIR, 'strength_ablation.json'),
        interventions: path.join(OUT_DIR, 'intervention_audit.json'),
    };
    writeJson(files.ablation, ablation);
    writeJson(files.interventions, interventions);
    return { ablation, interventions, files: Object.values(files) };
}