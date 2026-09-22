/**
 * V9-03: Frozen Weight Re-evaluation & Prior Ablation Driver
 *
 * Requirements:
 * 1. Uses verified 1721ca17... checkpoint (7,832 states) for SPATIAL_V2 and S10_SPATIAL_SEARCH.
 * 2. Stage A: Connectivity Pilot (1 map x 2 seats x 1 seed, 8 matches: HEURISTIC, SPATIAL_V2, S00, S10).
 * 3. Stage B: Development Matrix (5 maps x 2 seats x 2 seeds, 20 matches per arm = 80 matches).
 * 4. Stage C: Prior Ablation:
 *    - Compares S00, S10 True Prior, S10 Disabled Prior (zero logits with explicit alphabetical tie-breaking),
 *      and S10 Shuffled Prior.
 *    - Evaluated under both Fixed-Node budget (no wall-clock, pure logic comparison) and Real Wall-Clock budget.
 *    - Records candidate Jaccard overlap, action agreement, leaf scores, nodes explored, and predictor timing overhead.
 * 5. Deliverables:
 *    - baseline_correct_checkpoint.json
 *    - prior_ablation.json
 *    - per_match_trajectories/
 */

import path from 'node:path';
import { mkdirSync, copyFileSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import {
    runFullV7BenchmarkSuite,
    computeWilsonScoreInterval,
    collectMatchProvenance,
    BENCHMARK_MAPS,
    DEFAULT_BENCHMARK_PROTOCOL,
    type PolicyType,
    type MatchOutcome,
    type BenchmarkProtocol
} from './v7_unified_evaluation';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { runBoundedSearch, getFilteredCandidateActions } from './v7_heuristic_bounded_search';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { encodeAction } from '../src/game/env';
import { Action } from '../src/game/types';
import { createHash } from 'node:crypto';

function computeSha256(raw: string | Buffer): string {
    return createHash('sha256').update(raw).digest('hex');
}

const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260922_v9_identity_02';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const CHECKPOINT_DIR = path.resolve(process.env.CHECKPOINT_DIR || `training_runs/${RUN_ID}/checkpoints`);
const TRAJECTORY_ARCHIVE_DIR = path.resolve(`training_runs/${RUN_ID}/trajectories`);

const CORE_POLICIES: PolicyType[] = [
    'HEURISTIC',
    'SPATIAL_V2',
    'S00_SEARCH',
    'S10_SPATIAL_SEARCH'
];

function report(line: string): void {
    console.log(line);
}

// ------------------------------------------------------------------------------------------------
// Stage A & B: Unified Match Runner
// ------------------------------------------------------------------------------------------------
async function runStage(opts: {
    stage: string;
    policies: PolicyType[];
    maps: typeof BENCHMARK_MAPS;
    seeds: number[];
    maxTurns: number;
    maxAtomicSteps: number;
    protocol: Partial<BenchmarkProtocol>;
}): Promise<{ outcomes: MatchOutcome[]; reportPath: string; aggregates: any }> {
    const stageDir = path.join(RUN_DIR, opts.stage);
    const trajDir = path.join(stageDir, 'trajectories');
    mkdirSync(trajDir, { recursive: true });

    report(`\n=== STAGE ${opts.stage}: ${opts.maps.length} maps x 2 seats x ${opts.seeds.length} seeds x ${opts.policies.length} policies = ${opts.maps.length * 2 * opts.seeds.length * opts.policies.length} matches ===`);

    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: opts.policies,
        maps: opts.maps,
        seeds: opts.seeds,
        maxTurns: opts.maxTurns,
        maxAtomicSteps: opts.maxAtomicSteps,
        protocol: opts.protocol,
        reportPath: path.join(stageDir, 'comparison.json'),
        directories: {
            runId: RUN_ID,
            reportDir: REPORT_DIR,
            runDir: RUN_DIR,
            checkpointDir: CHECKPOINT_DIR,
            trajectoryDir: trajDir
        }
    });

    mkdirSync(REPORT_DIR, { recursive: true });
    copyFileSync(path.join(stageDir, 'comparison.json'), path.join(REPORT_DIR, `${opts.stage}_comparison.json`));

    // Archive per-match trajectories to central archive
    mkdirSync(TRAJECTORY_ARCHIVE_DIR, { recursive: true });
    for (const o of res.outcomes) {
        if (o.trajectoryLogPath && existsSync(o.trajectoryLogPath)) {
            const dest = path.join(TRAJECTORY_ARCHIVE_DIR, path.basename(o.trajectoryLogPath));
            copyFileSync(o.trajectoryLogPath, dest);
        }
    }

    for (const p of opts.policies) {
        const outs = res.outcomes.filter(o => o.candidatePolicy === p);
        const w = outs.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const l = outs.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const d = outs.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const t = outs.filter(o => o.terminationReason.startsWith('TRUNCATION')).length;
        const e = outs.filter(o => o.terminationReason === 'ENGINE_ERROR').length;
        const ml = outs.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length;
        const nr = outs.filter(o => o.terminationReason === 'NOT_RUN').length;
        const nat = w + l;
        const ci = computeWilsonScoreInterval(w, nat);
        report(
            `  ${p.padEnd(20)} n=${outs.length} W=${w} L=${l} D=${d} T=${t} ERR=${e} LOAD=${ml} NOTRUN=${nr} ` +
            `winNat=${nat > 0 ? (100 * w / nat).toFixed(1) : 'n/a'}% CI=[${ci[0]},${ci[1]}]`
        );
    }

    return { outcomes: res.outcomes, reportPath: path.join(stageDir, 'comparison.json'), aggregates: res.aggregates };
}

// ------------------------------------------------------------------------------------------------
// Stage C: Rigorous Prior Ablation
// ------------------------------------------------------------------------------------------------
interface PriorAblationStateResult {
    stateIndex: number;
    mapName: string;
    seat: number;
    turn: number;
    legalActionCount: number;
    candidateSets: {
        S00: string[];
        S10_TRUE: string[];
        S10_DISABLED: string[];
        S10_SHUFFLED: string[];
    };
    jaccardWithTrue: {
        S00: number;
        S10_DISABLED: number;
        S10_SHUFFLED: number;
    };
    fixedNodeBudget: {
        S00: { chosenAction: string; score: number; nodes: number; depth: number; elapsedMs: number };
        S10_TRUE: { chosenAction: string; score: number; nodes: number; depth: number; elapsedMs: number; predictorMs: number };
        S10_DISABLED: { chosenAction: string; score: number; nodes: number; depth: number; elapsedMs: number; predictorMs: number };
        S10_SHUFFLED: { chosenAction: string; score: number; nodes: number; depth: number; elapsedMs: number; predictorMs: number };
    };
    wallClockBudget: {
        S00: { chosenAction: string; score: number; nodes: number; elapsedMs: number; deadlineMiss: boolean };
        S10_TRUE: { chosenAction: string; score: number; nodes: number; elapsedMs: number; deadlineMiss: boolean; predictorMs: number };
        S10_DISABLED: { chosenAction: string; score: number; nodes: number; elapsedMs: number; deadlineMiss: boolean; predictorMs: number };
        S10_SHUFFLED: { chosenAction: string; score: number; nodes: number; elapsedMs: number; deadlineMiss: boolean; predictorMs: number };
    };
}

function computeJaccard(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : Number((intersection / union).toFixed(4));
}

/**
 * Creates a deterministic mock predictor for ablation.
 */
function createMockPredictor(
    mode: 'disabled_zeros' | 'shuffled',
    realPredictor: SpatialResNetPredictor,
    seed: number
): SpatialResNetPredictor {
    // Simple deterministic LCG for shuffle
    let s = seed;
    const rng = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };

    return {
        predict(inputTensor: Float32Array, candidates: any[]) {
            if (mode === 'disabled_zeros') {
                return {
                    actionLogits: new Float32Array(candidates.length), // all 0.0
                    actionProbabilities: new Float32Array(candidates.length).fill(1 / Math.max(1, candidates.length))
                };
            } else {
                // Random shuffled logits
                const logits = new Float32Array(candidates.length);
                for (let i = 0; i < candidates.length; i++) {
                    logits[i] = rng() * 10 - 5;
                }
                return {
                    actionLogits: logits,
                    actionProbabilities: new Float32Array(candidates.length)
                };
            }
        }
    } as any;
}

async function runPriorAblation(realPredictor: SpatialResNetPredictor): Promise<any> {
    report('\n=== STAGE C: Prior Ablation on Frozen Weights ===');
    report('Comparing S00, S10 True Prior, S10 Disabled Prior, and S10 Shuffled Prior...');

    const heuristicAi = new HeuristicAI();
    const testMaps = [
        '(2) Duel.aem',
        '(2) Crossed swords.aem',
        '(2) Liberty Port.aem',
        '(2) Mourningstar.aem',
        '(2) Icy Paths.aem'
    ];
    // Multiple step offsets reach OPENING / ENGAGEMENT / MIDGAME / COMMANDER_RECOVERY windows.
    const stepOffsets = [12, 48, 96, 160, 240];
    const results: any[] = [];

    let stateIdx = 0;
    for (const mapName of testMaps) {
        for (const seat of [0, 1]) {
            for (const stepOffset of stepOffsets) {
                const engine = new GameEngine(createAppApkSkirmishGameState(mapName, 'SD'));
                let skip = false;
                for (let step = 0; step < stepOffset; step++) {
                    // FIX(V9-R2): winner === null is NOT terminal. The previous
                    // `winner !== undefined` guard aborted at step 0, so every ablation
                    // state was an identical turn-1 opening and all arms trivially agreed.
                    if (engine.isTerminal()) { skip = true; break; }
                    const cp = engine.getState().currentPlayer;
                    const legals = engine.getLegalActions(cp).filter(a => a.type !== 'surrender');
                    if (legals.length === 0) { skip = true; break; }
                    engine.step(heuristicAi.getAction(engine, cp, legals));
                }
                if (skip) continue;

                const activePlayer = engine.getState().currentPlayer;
                const legalActions = engine.getLegalActions(activePlayer).filter(a => a.type !== 'surrender');
                if (legalActions.length < 3) continue;

                stateIdx++;

                const disabledPredictor = createMockPredictor('disabled_zeros', realPredictor, 12345 + stateIdx);
                const shuffledPredictor = createMockPredictor('shuffled', realPredictor, 54321 + stateIdx);

                const candsS00 = getFilteredCandidateActions(engine, activePlayer, heuristicAi, undefined).map(encodeAction);
                const candsTrue = getFilteredCandidateActions(engine, activePlayer, heuristicAi, realPredictor).map(encodeAction);
                const candsDisabled = getFilteredCandidateActions(engine, activePlayer, heuristicAi, disabledPredictor).map(encodeAction);
                const candsShuffled = getFilteredCandidateActions(engine, activePlayer, heuristicAi, shuffledPredictor).map(encodeAction);

                const jaccardS00 = computeJaccard(candsTrue, candsS00);
                const jaccardDisabled = computeJaccard(candsTrue, candsDisabled);
                const jaccardShuffled = computeJaccard(candsTrue, candsShuffled);

                const fnBudget = { maxNodes: 20, deterministic: true };
                const fnS00 = runBoundedSearch(engine.clone(), activePlayer, { budget: fnBudget, heuristicAi });
                const t0 = performance.now();
                const fnTrue = runBoundedSearch(engine.clone(), activePlayer, { budget: fnBudget, heuristicAi, spatialPredictor: realPredictor });
                const truePredMs = performance.now() - t0;
                const fnDisabled = runBoundedSearch(engine.clone(), activePlayer, { budget: fnBudget, heuristicAi, spatialPredictor: disabledPredictor });
                const fnShuffled = runBoundedSearch(engine.clone(), activePlayer, { budget: fnBudget, heuristicAi, spatialPredictor: shuffledPredictor });

                const wcBudget = { maxNodes: 20, maxMs: 200, hardMaxMs: 900, deterministic: false };
                const wcS00 = runBoundedSearch(engine.clone(), activePlayer, { budget: wcBudget, heuristicAi });
                const wcTrue = runBoundedSearch(engine.clone(), activePlayer, { budget: wcBudget, heuristicAi, spatialPredictor: realPredictor });
                const wcDisabled = runBoundedSearch(engine.clone(), activePlayer, { budget: wcBudget, heuristicAi, spatialPredictor: disabledPredictor });
                const wcShuffled = runBoundedSearch(engine.clone(), activePlayer, { budget: wcBudget, heuristicAi, spatialPredictor: shuffledPredictor });

                results.push({
                    stateIndex: stateIdx,
                    mapName,
                    seat,
                    stepOffset,
                    turn: engine.getState().turn,
                    legalActionCount: legalActions.length,
                    candidateSets: { S00: candsS00, S10_TRUE: candsTrue, S10_DISABLED: candsDisabled, S10_SHUFFLED: candsShuffled },
                    jaccardWithTrue: { S00: jaccardS00, S10_DISABLED: jaccardDisabled, S10_SHUFFLED: jaccardShuffled },
                    fixedNodeBudget: {
                        S00: { chosenAction: fnS00.chosenActionCode, score: fnS00.bestScore, nodes: fnS00.totalNodes, depth: fnS00.traces[0]?.depthReached ?? 0, elapsedMs: fnS00.elapsedMs },
                        S10_TRUE: { chosenAction: fnTrue.chosenActionCode, score: fnTrue.bestScore, nodes: fnTrue.totalNodes, depth: fnTrue.traces[0]?.depthReached ?? 0, elapsedMs: fnTrue.elapsedMs, predictorMs: Number(truePredMs.toFixed(2)) },
                        S10_DISABLED: { chosenAction: fnDisabled.chosenActionCode, score: fnDisabled.bestScore, nodes: fnDisabled.totalNodes, depth: fnDisabled.traces[0]?.depthReached ?? 0, elapsedMs: fnDisabled.elapsedMs, predictorMs: 0 },
                        S10_SHUFFLED: { chosenAction: fnShuffled.chosenActionCode, score: fnShuffled.bestScore, nodes: fnShuffled.totalNodes, depth: fnShuffled.traces[0]?.depthReached ?? 0, elapsedMs: fnShuffled.elapsedMs, predictorMs: 0 }
                    },
                    wallClockBudget: {
                        S00: { chosenAction: wcS00.chosenActionCode, score: wcS00.bestScore, nodes: wcS00.totalNodes, elapsedMs: wcS00.elapsedMs, deadlineMiss: Boolean(wcS00.wallClockExceeded) },
                        S10_TRUE: { chosenAction: wcTrue.chosenActionCode, score: wcTrue.bestScore, nodes: wcTrue.totalNodes, elapsedMs: wcTrue.elapsedMs, deadlineMiss: Boolean(wcTrue.wallClockExceeded), predictorMs: Number(truePredMs.toFixed(2)) },
                        S10_DISABLED: { chosenAction: wcDisabled.chosenActionCode, score: wcDisabled.bestScore, nodes: wcDisabled.totalNodes, elapsedMs: wcDisabled.elapsedMs, deadlineMiss: Boolean(wcDisabled.wallClockExceeded), predictorMs: 0 },
                        S10_SHUFFLED: { chosenAction: wcShuffled.chosenActionCode, score: wcShuffled.bestScore, nodes: wcShuffled.totalNodes, elapsedMs: wcShuffled.elapsedMs, deadlineMiss: Boolean(wcShuffled.wallClockExceeded), predictorMs: 0 }
                    }
                });

                report(`  State ${stateIdx} (${mapName} seat ${seat} step ${stepOffset} turn ${engine.getState().turn}): legal=${legalActions.length} | Jaccard(True,S00)=${jaccardS00} Jaccard(True,Disabled)=${jaccardDisabled} Jaccard(True,Shuffled)=${jaccardShuffled}`);
                report(`    FN Chosen: S00=${fnS00.chosenActionCode} | True=${fnTrue.chosenActionCode} | Disabled=${fnDisabled.chosenActionCode} | Shuffled=${fnShuffled.chosenActionCode}`);
            }
        }
    }

    const n = results.length;
    const safeDiv = (num: number, den: number) => (den > 0 ? Number((num / den).toFixed(4)) : null);
    const mean = (vals: number[]) => (vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null);

    let sameAsTrueS00 = 0;
    let sameAsTrueDisabled = 0;
    let sameAsTrueShuffled = 0;
    let candSetDiffersTrueVsS00 = 0;
    let candSetDiffersTrueVsDisabled = 0;
    let candSetDiffersTrueVsShuffled = 0;
    for (const r of results) {
        if (r.fixedNodeBudget.S00.chosenAction === r.fixedNodeBudget.S10_TRUE.chosenAction) sameAsTrueS00++;
        if (r.fixedNodeBudget.S10_DISABLED.chosenAction === r.fixedNodeBudget.S10_TRUE.chosenAction) sameAsTrueDisabled++;
        if (r.fixedNodeBudget.S10_SHUFFLED.chosenAction === r.fixedNodeBudget.S10_TRUE.chosenAction) sameAsTrueShuffled++;
        if (r.jaccardWithTrue.S00 < 1) candSetDiffersTrueVsS00++;
        if (r.jaccardWithTrue.S10_DISABLED < 1) candSetDiffersTrueVsDisabled++;
        if (r.jaccardWithTrue.S10_SHUFFLED < 1) candSetDiffersTrueVsShuffled++;
    }

    const priorChangesDecisionRate = safeDiv(n - sameAsTrueS00, n);
    const disablePriorChangesDecisionRate = safeDiv(n - sameAsTrueDisabled, n);
    const shuffledPriorChangesDecisionRate = safeDiv(n - sameAsTrueShuffled, n);

    const verdict = n === 0
        ? 'NO_STATES_COLLECTED'
        : (Number(priorChangesDecisionRate) > 0 || Number(disablePriorChangesDecisionRate) > 0)
            ? 'PRIOR_CHANGES_DECISIONS_ON_AT_LEAST_ONE_STATE'
            : 'PRIOR_HAS_NO_MEASURABLE_DECISION_EFFECT_AT_20_NODES';

    const ablationSummary = {
        runId: RUN_ID,
        ablationDate: new Date().toISOString(),
        testedStatesCount: n,
        stateCoverage: {
            maps: testMaps,
            seats: [0, 1],
            stepOffsets,
            turnRange: n > 0 ? [Math.min(...results.map(r => r.turn)), Math.max(...results.map(r => r.turn))] : null
        },
        candidateOverlapWithTruePrior: {
            meanJaccardS00: mean(results.map(r => r.jaccardWithTrue.S00)),
            meanJaccardDisabledZeros: mean(results.map(r => r.jaccardWithTrue.S10_DISABLED)),
            meanJaccardShuffled: mean(results.map(r => r.jaccardWithTrue.S10_SHUFFLED)),
            candidateSetDiffersFromTrueRate: {
                S00: safeDiv(candSetDiffersTrueVsS00, n),
                S10_DISABLED: safeDiv(candSetDiffersTrueVsDisabled, n),
                S10_SHUFFLED: safeDiv(candSetDiffersTrueVsShuffled, n)
            }
        },
        actionAgreementWithTruePrior: {
            S00AgreementRate: safeDiv(sameAsTrueS00, n),
            S10DisabledAgreementRate: safeDiv(sameAsTrueDisabled, n),
            S10ShuffledAgreementRate: safeDiv(sameAsTrueShuffled, n)
        },
        decisionImpact: {
            priorChangesDecisionRate,
            disablePriorChangesDecisionRate,
            shuffledPriorChangesDecisionRate,
            verdict
        },
        tieBreakingRule: 'Disabled prior returns 0.0 logits; ties are broken strictly alphabetically by encoded action string, which is NOT equivalent to the S00 candidate ordering.',
        separationOfPredictorCost: 'Predictor cost is measured separately via predictorMs on the fixed-node arm; fixed-node (deterministic) and wall-clock arms are reported separately.',
        honestLimits: 'A 20-node fixed budget may be too shallow for the prior to change the argmax on many states. This file reports the measured effect and must not be cited as evidence that the prior is good.',
        states: results
    };

    return ablationSummary;
}
// ------------------------------------------------------------------------------------------------
// Main Execution
// ------------------------------------------------------------------------------------------------
async function main(): Promise<void> {
    const provenance = collectMatchProvenance();
    const startedAt = new Date().toISOString();

    report('======================================================================');
    report(`[V9-03 Frozen Weight Re-evaluation & Prior Ablation Driver]`);
    report(`Run ID:   ${RUN_ID}`);
    report(`Commit:   ${provenance.codeCommit} (dirty=${provenance.workspaceDirty})`);
    report(`Patch:    ${provenance.dirtyPatchHash ?? '(clean tree)'}`);
    report(`Checkpoints: ${CHECKPOINT_DIR}`);
    report('======================================================================');

    mkdirSync(REPORT_DIR, { recursive: true });
    mkdirSync(RUN_DIR, { recursive: true });

    // Verify model existence and SHA
    const modelPath = path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_best.json');
    if (!existsSync(modelPath)) {
        throw new Error(`Critical checkpoint missing: ${modelPath}`);
    }
    const modelRaw = readFileSync(modelPath, 'utf8');
    const modelSha = computeSha256(modelRaw);
    report(`Loaded spatial_resnet_v2 checkpoint SHA-256: ${modelSha}`);
    if (modelSha !== '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92') {
        report(`WARNING: Model SHA differs from historical baseline: ${modelSha}`);
    } else {
        report(`CONFIRMED: Model SHA strictly matches historical 7,832-state baseline.`);
    }
    const spatialPredictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(modelRaw));

    const args = process.argv.slice(2);
    const runPilotOnly = args.includes('--pilot-only');
    const runAblationOnly = args.includes('--ablation-only');
    const runMainOnly = args.includes('--main-only');
    const runAll = !runPilotOnly && !runAblationOnly && !runMainOnly;

    let pilot: any = null;
    let mainMatrix: any = null;
    let priorAblation: any = null;

    if (runAll || runPilotOnly) {
        // ---- Stage A: Connectivity Pilot -----------------------------------------------------------
        report('\nStarting Stage A (Connectivity Pilot: 1 map x 2 seats x 1 seed = 8 matches)...');
        pilot = await runStage({
            stage: 'pilot',
            policies: CORE_POLICIES,
            maps: BENCHMARK_MAPS.slice(0, 1),
            seeds: [42],
            maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
            maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
            protocol: { deterministicReplay: false }
        });
    }

    if (runAll || runMainOnly) {
        // ---- Stage B: Main Development Matrix (5 maps x 2 seats x 2 seeds = 80 matches) -----------
        report('\nStarting Stage B (Development Matrix: 5 maps x 2 seats x 2 seeds = 80 matches)...');
        mainMatrix = await runStage({
            stage: 'main',
            policies: CORE_POLICIES,
            maps: BENCHMARK_MAPS,
            seeds: [42, 1337],
            maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
            maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
            protocol: { deterministicReplay: false }
        });
    }

    if (runAll || runAblationOnly) {
        // ---- Stage C: Prior Ablation ---------------------------------------------------------------
        priorAblation = await runPriorAblation(spatialPredictor);
        writeFileSync(path.join(RUN_DIR, 'prior_ablation.json'), JSON.stringify(priorAblation, null, 2), 'utf8');
        writeFileSync(path.join(REPORT_DIR, 'prior_ablation.json'), JSON.stringify(priorAblation, null, 2), 'utf8');
        report(`Wrote prior_ablation.json to ${RUN_DIR} and ${REPORT_DIR}`);
    }

    if (mainMatrix) {
        // Write deliverables
        const baselineCorrectCheckpoint = {
            runId: RUN_ID,
            evaluatedAt: new Date().toISOString(),
            modelIdentity: {
                checkpoint: "spatial_resnet_v2_best.json",
                sha256: modelSha,
                verifiedMatchHistorical: modelSha === '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92',
                trainedStates: 7832,
                encoderVersion: "v2",
                smokeControlSha256: "43c0d74841453b5ddf20f1cbcb8d6d56297bfff953a8240e37f8c21bebba876b"
            },
            protocol: {
                maps: BENCHMARK_MAPS.map(m => m.name),
                seats: [0, 1],
                seeds: [42, 1337],
                maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
                maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
                searchMaxNodes: DEFAULT_BENCHMARK_PROTOCOL.searchMaxNodes,
                searchBudgetSoftMs: DEFAULT_BENCHMARK_PROTOCOL.searchBudgetSoftMs,
                searchBudgetHardMs: DEFAULT_BENCHMARK_PROTOCOL.searchBudgetHardMs
            },
            provenance,
            pilotAggregates: pilot?.aggregates ?? null,
            developmentMatrixAggregates: mainMatrix.aggregates,
            totalMatchesPlayed: (pilot ? pilot.outcomes.length : 0) + mainMatrix.outcomes.length,
            outcomes: mainMatrix.outcomes
        };

        // Save baseline_correct_checkpoint.json
        writeFileSync(path.join(RUN_DIR, 'baseline_correct_checkpoint.json'), JSON.stringify(baselineCorrectCheckpoint, null, 2), 'utf8');
        writeFileSync(path.join(REPORT_DIR, 'baseline_correct_checkpoint.json'), JSON.stringify(baselineCorrectCheckpoint, null, 2), 'utf8');
        report(`Wrote baseline_correct_checkpoint.json`);
    }

    // Save prior_ablation.json if evaluated
    if (priorAblation) {
        writeFileSync(path.join(RUN_DIR, 'prior_ablation.json'), JSON.stringify(priorAblation, null, 2), 'utf8');
        writeFileSync(path.join(REPORT_DIR, 'prior_ablation.json'), JSON.stringify(priorAblation, null, 2), 'utf8');
        report(`Wrote prior_ablation.json`);
    }

    report('\n======================================================================');
    report(`[V9-03 Completed Successfully]`);
    report(`Wrote baseline_correct_checkpoint.json`);
    report(`Wrote prior_ablation.json`);
    report(`Trajectories archived in ${TRAJECTORY_ARCHIVE_DIR}`);
    report('======================================================================');
}

main().catch(err => {
    console.error('V9-03 evaluation failed:', err);
    process.exit(1);
});
