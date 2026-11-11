/**
 * V11 T11-04 deliverable driver: counterfactual labels, label quality, residual
 * ranker curves.
 *
 * Operates only on the replay-provable V11 pool produced by `run.ts collect`.
 * Honesty rules enforced here:
 *   - only decisions belonging to the episode's subject seat are sampled (a
 *     seat-0 recording replays BOTH sides, so sampling every step would label the
 *     opponent's moves as if they were the candidate's own choices);
 *   - dQ is always relative to the Heuristic baseline a0 in the SAME state;
 *   - labels are graded and the grade travels with every statistic;
 *   - the ranker is evaluated on root families it never trained on;
 *   - the "learning disabled" arm is a zeroed ranker, not a re-implementation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT_DIR, RUN_ID, ensureDir, readJsonl, sha256, writeJson, writeJsonl } from './common';
import { GameEngine } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';
import {
    DEFAULT_COUNTERFACTUAL_OPTIONS,
    compareDecision,
    sampleDecisionSteps,
    type CounterfactualLabel,
    type CounterfactualOptions,
    type DecisionPoint,
    type LabelQuality,
} from './counterfactual';
import {
    buildTrainingRows,
    scoreCandidate,
    trainRanker,
    zeroedRanker,
    type RankerWeights,
    type TrainingRow,
} from './ranker';
import { saveRanker } from './ranker_io';
import { readTrajectory, resolveInitialSnapshot, replayEpisode, v10SetupForSeed, type EpisodeFileRecord } from './replay';
import { defaultEpisodesFile, partitionRootFamily } from './replay_validation';

const OOD_MAPS = ['(2) Liberty Port.aem'];

export interface CounterfactualJobOptions {
    episodesFile?: string;
    decisionsPerEpisode: number;
    maxEpisodes: number;
    options: CounterfactualOptions;
    labelsFile?: string;
    /** Keep only decisions whose candidates actually separate. */
    keepOnlyDiscriminating: boolean;
    minStepFraction: number;
    maxStepFraction: number;
}

export function defaultJobOptions(): CounterfactualJobOptions {
    return {
        episodesFile: process.env.V11_EPISODES_FILE ?? defaultEpisodesFile(),
        decisionsPerEpisode: Number(process.env.V11_DECISIONS_PER_EPISODE ?? 3),
        maxEpisodes: Number(process.env.V11_CF_EPISODES ?? 16),
        options: DEFAULT_COUNTERFACTUAL_OPTIONS,
        keepOnlyDiscriminating: process.env.V11_KEEP_ALL_DECISIONS !== '1',
        minStepFraction: Number(process.env.V11_MIN_STEP_FRACTION ?? 0.08),
        maxStepFraction: Number(process.env.V11_MAX_STEP_FRACTION ?? 0.92),
    };
}

interface LoadedEpisode {
    record: EpisodeFileRecord;
    mapName: string;
    setupId: string;
    actions: ReturnType<typeof readTrajectory> extends null ? never : NonNullable<ReturnType<typeof readTrajectory>>['actions'];
    snapshot: NonNullable<ReturnType<typeof resolveInitialSnapshot>['snapshot']>;
}

/** Load episodes whose replay validates; anything else is skipped, not guessed. */
export function loadValidatedEpisodes(
    episodesFile: string,
    maxEpisodes: number
): { loaded: LoadedEpisode[]; skipped: Array<{ episodeId: string; reason: string }> } {
    const episodes = readJsonl<EpisodeFileRecord>(episodesFile);
    const loaded: LoadedEpisode[] = [];
    const skipped: Array<{ episodeId: string; reason: string }> = [];

    for (const ep of episodes) {
        if (loaded.length >= maxEpisodes) break;
        const trajectory = (() => {
            try { return readTrajectory(ep.trajectoryLogPath); } catch { return null; }
        })();
        if (!trajectory || !trajectory.actions.length) {
            skipped.push({ episodeId: ep.episodeId, reason: 'TRAJECTORY_MISSING' });
            continue;
        }
        const setup = trajectory.setupSelection ?? v10SetupForSeed(Number(ep.seed));
        const resolution = resolveInitialSnapshot({
            mapName: ep.mapName,
            recordedSnapshot: trajectory.initialSnapshot,
            recordedInitialStateHash: trajectory.recordedInitialStateHash,
            setup,
            subjectSeat: trajectory.candidateSeat ?? ep.candidateSeat ?? 0,
        });
        if (!resolution.snapshot) {
            skipped.push({ episodeId: ep.episodeId, reason: `SNAPSHOT_UNPROVEN: ${resolution.reason}` });
            continue;
        }
        const validation = replayEpisode(ep.episodeId, ep.mapName, trajectory.actions, resolution.snapshot, resolution.provenance, {
            hashEveryNSteps: 25,
        });
        if (!validation.ok) {
            skipped.push({ episodeId: ep.episodeId, reason: `${validation.failureCode}@${validation.failureStep}` });
            continue;
        }
        loaded.push({
            record: ep, mapName: ep.mapName, setupId: resolution.snapshot.setupId,
            actions: trajectory.actions, snapshot: resolution.snapshot,
        });
    }
    return { loaded, skipped };
}

/**
 * Replay an episode and emit the sampled decision points with the state they
 * were taken in. Only the subject seat's decisions are eligible.
 */
export function sampleDecisionPoints(episode: LoadedEpisode, options: CounterfactualJobOptions): DecisionPoint[] {
    const engine = new GameEngine(JSON.parse(JSON.stringify(episode.snapshot.state)) as GameState);
    (engine.getState() as any).mapName = episode.mapName;

    const totalSteps = episode.actions.length;
    const subjectSeat = episode.snapshot.subjectSeat ?? 0;
    const lo = Math.max(1, Math.floor(totalSteps * options.minStepFraction));
    const hi = Math.min(totalSteps - 1, Math.ceil(totalSteps * options.maxStepFraction));
    const eligible: number[] = [];
    for (let i = lo; i <= hi; i += 1) {
        if (episode.actions[i].player === subjectSeat) eligible.push(i);
    }
    const chosen = sampleDecisionSteps(eligible.length, {
        decisionsPerEpisode: options.decisionsPerEpisode,
        seed: 0xC0FFEE ^ Number(episode.record.seed),
    }).map(idx => eligible[idx]);
    const stepIndices = new Set(chosen);

    const points: DecisionPoint[] = [];
    for (let i = 0; i < totalSteps; i += 1) {
        const state = engine.getState();
        const curPlayer = state.currentPlayer;
        if (stepIndices.has(i) && !engine.isTerminal() && curPlayer === subjectSeat) {
            const progress = totalSteps > 0 ? i / totalSteps : 0;
            const stage: 'OPENING' | 'MIDGAME' | 'ENDGAME' =
                progress <= 0.3 ? 'OPENING' : progress > 0.7 ? 'ENDGAME' : 'MIDGAME';
            points.push({
                decisionId: `${episode.record.episodeId}#${i}`,
                episodeId: episode.record.episodeId,
                rootFamilyId: episode.record.rootFamilyId,
                mapName: episode.mapName,
                mapLabel: (episode.record as any).mapLabel ?? episode.mapName,
                setupId: episode.setupId,
                seed: Number(episode.record.seed),
                step: i,
                turn: state.turn,
                stage,
                subjectPlayer: curPlayer,
                stateHash: sha256(JSON.stringify(state)),
                state: JSON.parse(JSON.stringify(state)) as GameState,
                episodeOutcome: episode.record.z ?? null,
                candidateCategories: [],
            });
        }
        engine.step(episode.actions[i].action);
    }
    return points;
}

export interface CounterfactualJobResult {
    labels: CounterfactualLabel[];
    uninformative: Array<{ decisionId: string; reason: string; deltaQ: number }>;
    skipped: Array<{ episodeId: string; reason: string }>;
    files: string[];
}

export function runCounterfactualJob(options: CounterfactualJobOptions): CounterfactualJobResult {
    ensureDir(OUT_DIR);
    const episodesFile = options.episodesFile ?? defaultEpisodesFile();
    const labelsFile = options.labelsFile ?? path.join(OUT_DIR, 'counterfactual_labels.jsonl');

    const { loaded, skipped } = loadValidatedEpisodes(episodesFile, options.maxEpisodes);
    const labels: CounterfactualLabel[] = [];
    const uninformative: CounterfactualJobResult['uninformative'] = [];

    for (const episode of loaded) {
        for (const point of sampleDecisionPoints(episode, options)) {
            const label = compareDecision(point, options.options);
            if (label.labelQuality === 'UNINFORMATIVE') {
                uninformative.push({ decisionId: label.decisionId, reason: label.labelReason, deltaQ: label.deltaQ });
                if (options.keepOnlyDiscriminating) continue;
            }
            labels.push(label);
        }
    }

    writeJsonl(labelsFile, labels);
    return { labels, uninformative, skipped, files: [labelsFile] };
}

// ---------------------------------------------------------------------------
// label quality
// ---------------------------------------------------------------------------

export interface LabelQualityReport {
    schema: 'v11_label_quality_1';
    generatedAt: string;
    runId: string;
    episodesFile: string;
    options: CounterfactualOptions;
    decisions: number;
    decisionsCompared: number;
    decisionsDroppedUninformative: number;
    uninformativeExamples: Array<{ decisionId: string; reason: string }>;
    episodesUsed: number;
    episodesSkipped: number;
    skipped: Array<{ episodeId: string; reason: string }>;
    byQuality: Record<string, number>;
    byRootFamily: Record<string, number>;
    deltaDistribution: { positive: number; zero: number; negative: number; mean: number; median: number; p90: number; max: number };
    baselineIsVerifiedErrorCount: number;
    baselineIsVerifiedErrorRate: number;
    immediateWinAvailable: number;
    terminalEvidenceShare: number;
    candidatesPerDecision: { mean: number; min: number; max: number };
    accounting: { teacherDecisions: number; engineTransitions: number; engineTransitionsPerDecision: number };
    budgetCompliance: {
        maxFormalFits: number; fitsUsed: number;
        maxNewTeacherDecisionQueries: number; teacherDecisionQueries: number;
        withinBudget: boolean; note: string;
    };
    caveats: string[];
}

function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
    return sorted[idx];
}

export function buildLabelQualityReport(
    labels: CounterfactualLabel[],
    meta: {
        episodesFile: string;
        episodesUsed: number;
        skipped: Array<{ episodeId: string; reason: string }>;
        options: CounterfactualOptions;
        fitsUsed: number;
        uninformative?: Array<{ decisionId: string; reason: string; deltaQ: number }>;
    }
): LabelQualityReport {
    const byQuality: Record<string, number> = {};
    const byRootFamily: Record<string, number> = {};
    for (const l of labels) {
        byQuality[l.labelQuality] = (byQuality[l.labelQuality] ?? 0) + 1;
        byRootFamily[l.rootFamilyId] = (byRootFamily[l.rootFamilyId] ?? 0) + 1;
    }
    const deltas = labels.map(l => l.deltaQ).sort((a, b) => a - b);
    const trans = labels.reduce((n, l) => n + l.engineTransitions, 0);
    const candidateCounts = labels.map(l => l.candidates.length);
    const terminalEvidence = labels.filter(l => l.candidates.some(c => c.terminal)).length;
    const teacherDecisions = labels.reduce((n, l) => n + l.teacherDecisions, 0);
    const uninformative = meta.uninformative ?? [];
    const MAX_TEACHER = 10000;

    return {
        schema: 'v11_label_quality_1',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        episodesFile: meta.episodesFile,
        options: meta.options,
        decisions: labels.length,
        decisionsCompared: labels.length + uninformative.length,
        decisionsDroppedUninformative: uninformative.length,
        uninformativeExamples: uninformative.slice(0, 10).map(u => ({ decisionId: u.decisionId, reason: u.reason })),
        episodesUsed: meta.episodesUsed,
        episodesSkipped: meta.skipped.length,
        skipped: meta.skipped,
        byQuality,
        byRootFamily,
        deltaDistribution: {
            positive: labels.filter(l => l.deltaQ > 0).length,
            zero: labels.filter(l => l.deltaQ === 0).length,
            negative: labels.filter(l => l.deltaQ < 0).length,
            mean: deltas.length ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(6)) : 0,
            median: quantile(deltas, 0.5),
            p90: quantile(deltas, 0.9),
            max: deltas.length ? deltas[deltas.length - 1] : 0,
        },
        baselineIsVerifiedErrorCount: labels.filter(l => l.baselineIsVerifiedError).length,
        baselineIsVerifiedErrorRate: labels.length
            ? Number((labels.filter(l => l.baselineIsVerifiedError).length / labels.length).toFixed(4))
            : 0,
        immediateWinAvailable: labels.filter(l => l.immediateWinAvailable).length,
        terminalEvidenceShare: labels.length ? Number((terminalEvidence / labels.length).toFixed(4)) : 0,
        candidatesPerDecision: {
            mean: candidateCounts.length ? Number((candidateCounts.reduce((a, b) => a + b, 0) / candidateCounts.length).toFixed(2)) : 0,
            min: candidateCounts.length ? Math.min(...candidateCounts) : 0,
            max: candidateCounts.length ? Math.max(...candidateCounts) : 0,
        },
        accounting: {
            teacherDecisions: teacherDecisions,
            engineTransitions: trans,
            engineTransitionsPerDecision: labels.length ? Number((trans / labels.length).toFixed(1)) : 0,
        },
        budgetCompliance: {
            maxFormalFits: 4,
            fitsUsed: meta.fitsUsed,
            maxNewTeacherDecisionQueries: MAX_TEACHER,
            teacherDecisionQueries: teacherDecisions,
            withinBudget: meta.fitsUsed <= 4 && teacherDecisions <= MAX_TEACHER,
            note:
                'The taskbook caps *decision-level* queries, not probe count. Probes inside one decision are ' +
                'reported separately as engineTransitions so a large probe count cannot hide inside "1 query". ' +
                `Compared decisions include the ${uninformative.length} dropped as uninformative.`,
        },
        caveats: [
            'A PROXY label means no candidate reached a natural terminal inside the continuation budget; it is an estimate.',
            'baselineIsVerifiedErrorRate is the share of decisions where the Heuristic baseline demonstrably discards an immediate win.',
            'These labels come from bounded heuristic continuation, not from an optimal solver, and are not "true Q".',
        ],
    };
}

// ---------------------------------------------------------------------------
// residual ranker curves (held out by root family)
// ---------------------------------------------------------------------------

export interface RankerEvaluation {
    arm: string;
    decisions: number;
    exactBestRate: number;
    meanDeltaVsBaseline: number;
    meanRegret: number;
    harmfulRate: number;
    beneficialRate: number;
    keptBaselineRate: number;
}

export interface ResidualRankerCurvesReport {
    schema: 'v11_residual_ranker_curves_1';
    generatedAt: string;
    holdoutStrategy: string;
    fits: Array<{
        fitId: string;
        kind: 'pair' | 'delta';
        minQuality: LabelQuality[];
        shuffleSeed: number | null;
        epochs: number;
        learningRate: number;
        trainDecisions: number;
        holdoutDecisions: number;
        trainLossTail: number[];
        evaluations: RankerEvaluation[];
        weightsFile: string | null;
    }>;
    bestFit: { fitId: string; reason: string } | null;
    caveats: string[];
}

/** Deterministic, never-fitted weights: the "no information" control. */
function fixedUntrainedWeights(kind: 'pair' | 'delta'): RankerWeights {
    const base = zeroedRanker(kind);
    let s = 0x51ED270B;
    const next = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { ...base, weights: base.weights.map(() => Number(((next() - 0.5) * 0.1).toFixed(8))) };
}

function evaluateArm(params: {
    arm: string;
    decisions: TrainingRow[][];
    scoreOf: (row: TrainingRow) => number;
    alwaysBaseline?: boolean;
}): RankerEvaluation {
    let exactBest = 0, beneficial = 0, harmful = 0, keptBaseline = 0, deltaSum = 0, regretSum = 0, n = 0;
    for (const rows of params.decisions) {
        if (rows.length === 0) continue;
        const baseline = rows.find(r => r.isBaseline) ?? rows[0];
        const bestValue = Math.max(...rows.map(r => r.value));
        let chosen = baseline;
        if (!params.alwaysBaseline) {
            let bestScore = -Infinity;
            for (const r of rows) {
                const s = params.scoreOf(r);
                if (s > bestScore) { bestScore = s; chosen = r; }
            }
        }
        n += 1;
        if (chosen.value === bestValue) exactBest += 1;
        const delta = chosen.value - baseline.value;
        deltaSum += delta;
        regretSum += bestValue - chosen.value;
        if (delta > 1e-9) beneficial += 1;
        else if (delta < -1e-9) harmful += 1;
        else keptBaseline += 1;
    }
    return {
        arm: params.arm,
        decisions: n,
        exactBestRate: n ? Number((exactBest / n).toFixed(4)) : 0,
        meanDeltaVsBaseline: n ? Number((deltaSum / n).toFixed(6)) : 0,
        meanRegret: n ? Number((regretSum / n).toFixed(6)) : 0,
        harmfulRate: n ? Number((harmful / n).toFixed(4)) : 0,
        beneficialRate: n ? Number((beneficial / n).toFixed(4)) : 0,
        keptBaselineRate: n ? Number((keptBaseline / n).toFixed(4)) : 0,
    };
}

export function runRankerCurves(labels: CounterfactualLabel[], weightsDir: string): ResidualRankerCurvesReport {
    ensureDir(weightsDir);

    const roots = Array.from(new Set(labels.map(l => l.rootFamilyId))).sort();
    const oodRoots = new Set(roots.filter(r => labels.some(l => l.rootFamilyId === r && OOD_MAPS.includes(l.mapName))));
    const nonOodRoots = roots.filter(r => !oodRoots.has(r));
    const valRoots = new Set(nonOodRoots.filter(r => partitionRootFamily(r) === 'val_id'));
    const trainRoots = new Set(nonOodRoots.filter(r => partitionRootFamily(r) === 'train'));

    const inRoots = (l: CounterfactualLabel, set: Set<string>) => set.has(l.rootFamilyId);
    const trainLabels = labels.filter(l => inRoots(l, trainRoots));
    const holdoutLabels = labels.filter(l => inRoots(l, valRoots));
    const oodLabels = labels.filter(l => inRoots(l, oodRoots));

    const toDecisions = (rows: TrainingRow[]) => {
        const map = new Map<string, TrainingRow[]>();
        for (const r of rows) {
            const list = map.get(r.decisionId) ?? [];
            list.push(r);
            map.set(r.decisionId, list);
        }
        return Array.from(map.values());
    };

    const ALL: LabelQuality[] = ['VERIFIED_IMMEDIATE_WIN', 'VERIFIED_NATURAL', 'PROXY'];
    const VERIFIED: LabelQuality[] = ['VERIFIED_IMMEDIATE_WIN', 'VERIFIED_NATURAL'];
    const configs: Array<{ fitId: string; kind: 'pair' | 'delta'; minQuality: LabelQuality[]; shuffleSeed: number | null }> = [
        { fitId: 'fit1_pair_all', kind: 'pair', minQuality: ALL, shuffleSeed: null },
        { fitId: 'fit2_delta_all', kind: 'delta', minQuality: ALL, shuffleSeed: null },
        { fitId: 'fit3_pair_verified_only', kind: 'pair', minQuality: VERIFIED, shuffleSeed: null },
        { fitId: 'fit4_pair_label_shuffled', kind: 'pair', minQuality: ALL, shuffleSeed: 20260924 },
    ];

    const fits: ResidualRankerCurvesReport['fits'] = [];
    for (const cfg of configs) {
        const trainRows = buildTrainingRows(trainLabels, cfg.shuffleSeed ?? undefined);
        const holdoutRows = buildTrainingRows(holdoutLabels);
        const oodRows = buildTrainingRows(oodLabels);

        const weights = trainRanker(trainRows, {
            kind: cfg.kind, epochs: 300, learningRate: 0.5, l2: 1e-3, minQuality: cfg.minQuality,
        });
        const weightsFile = path.join(weightsDir, `${cfg.fitId}.json`);
        saveRanker(weightsFile, weights);

        const holdoutDecisions = toDecisions(holdoutRows);
        const oodDecisions = toDecisions(oodRows);
        const untrained = fixedUntrainedWeights(cfg.kind);

        fits.push({
            fitId: cfg.fitId,
            kind: cfg.kind,
            minQuality: cfg.minQuality,
            shuffleSeed: cfg.shuffleSeed,
            epochs: 300,
            learningRate: 0.5,
            trainDecisions: toDecisions(trainRows).length,
            holdoutDecisions: holdoutDecisions.length,
            trainLossTail: weights.trainLoss.slice(-5),
            evaluations: [
                evaluateArm({ arm: 'holdout_always_baseline', decisions: holdoutDecisions, scoreOf: () => 0, alwaysBaseline: true }),
                evaluateArm({ arm: 'holdout_untrained_weights', decisions: holdoutDecisions, scoreOf: r => scoreCandidate(untrained, r.features) }),
                evaluateArm({ arm: 'holdout_trained_ranker', decisions: holdoutDecisions, scoreOf: r => scoreCandidate(weights, r.features) }),
                evaluateArm({ arm: 'holdout_oracle_upper_bound', decisions: holdoutDecisions, scoreOf: r => r.value }),
                evaluateArm({ arm: 'ood_trained_ranker', decisions: oodDecisions, scoreOf: r => scoreCandidate(weights, r.features) }),
                evaluateArm({ arm: 'ood_always_baseline', decisions: oodDecisions, scoreOf: () => 0, alwaysBaseline: true }),
            ],
            weightsFile,
        });
    }

    const best = fits
        .filter(f => f.shuffleSeed === null)
        .map(f => ({ fitId: f.fitId, delta: f.evaluations.find(e => e.arm === 'holdout_trained_ranker')?.meanDeltaVsBaseline ?? 0 }))
        .sort((a, b) => b.delta - a.delta)[0];

    return {
        schema: 'v11_residual_ranker_curves_1',
        generatedAt: new Date().toISOString(),
        holdoutStrategy:
            'root-family holdout: holdout roots come from the reserved val_id bucket, train roots from train. ' +
            'OOD roots are the held-out Liberty Port map. No decision is split across sets.',
        fits,
        bestFit: best ? { fitId: best.fitId, reason: `highest mean dQ vs baseline on holdout (${best.delta})` } : null,
        caveats: [
            'holdout_oracle_upper_bound is an oracle over the SAME candidate set; it is an upper bound, not achievable.',
            'holdout_untrained_weights is the "no information" control: the identical candidate set, an unfitted model.',
            'A PROXY-heavy label set can make a ranker look better than it is; cross-check the label quality mix.',
        ],
    };
}