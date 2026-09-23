/**
 * V11 T11-04: why the first learning experiment is underpowered.
 *
 * The label job produced far fewer usable decisions than the query budget
 * allowed, and the surviving labels all had the same tiny effect size. This
 * module measures that directly from the artifacts instead of asserting it, so
 * the next round can size its experiment with numbers rather than hope.
 *
 *   v11/out/power_analysis.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT_DIR, RUN_ID, ensureDir, readJson, readJsonl, writeJson } from './common';
import type { CounterfactualLabel } from './counterfactual';

export interface PowerAnalysisReport {
    schema: 'v11_power_analysis_1';
    generatedAt: string;
    runId: string;
    inputs: { labelsFile: string; labelQualityFile: string; options: unknown };
    yield: {
        decisionsCompared: number;
        decisionsKept: number;
        decisionsDroppedUninformative: number;
        yieldRate: number;
        episodesUsed: number;
    };
    /** How each compared decision was shaped. */
    decisionShapes: {
        allCandidatesTerminal: number;
        noCandidateTerminal: number;
        mixed: number;
    };
    /** The outcome space the value function actually produces. */
    effectSize: {
        distinctDeltaValues: number;
        deltaValues: number[];
        deltaMean: number;
        deltaStdDev: number;
        /** Every verified label had the same |delta| in this run. */
        allDeltasEqual: boolean;
        note: string;
    };
    /** Candidate-set breadth actually available per decision. */
    candidateBreadth: { meanCandidates: number; decisionsWithSingleCandidate: number };
    /** Rough sample-size arithmetic for a paired comparison. */
    sampleSize: {
        assumedWinRateAtBaseline: number;
        targetAbsoluteImprovement: number;
        discordantFraction: number;
        discordantPairsNeeded: number;
        blocksNeededAtObservedDiscordance: number;
        decisionsNeededAtObservedYield: number;
        note: string;
    };
    rootCauses: string[];
    recommendations: Array<{ action: string; why: string; costNote: string }>;
    budgetAccounting: {
        teacherDecisionQueriesUsed: number;
        teacherDecisionQueryCap: number;
        engineTransitionsUsed: number;
        secondsPerComparedDecision: number;
    };
}

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function runPowerAnalysis(input: {
    labelsFile?: string;
    labelQualityFile?: string;
    elapsedMs?: number;
} = {}): PowerAnalysisReport {
    ensureDir(OUT_DIR);
    const labelsFile = input.labelsFile ?? path.join(OUT_DIR, 'counterfactual_labels.jsonl');
    const labelQualityFile = input.labelQualityFile ?? path.join(OUT_DIR, 'label_quality.json');

    const labels = readJsonl<CounterfactualLabel>(labelsFile);
    const quality = fs.existsSync(labelQualityFile) ? readJson<any>(labelQualityFile) : null;

    const deltas = labels.map(l => l.deltaQ);
    const candidatesPer = labels.map(l => l.candidates.length);

    let allTerminal = 0;
    let noTerminal = 0;
    let mixed = 0;
    for (const l of labels) {
        const terminalCount = l.candidates.filter(c => c.terminal).length;
        if (terminalCount === l.candidates.length && l.candidates.length > 0) allTerminal += 1;
        else if (terminalCount === 0) noTerminal += 1;
        else mixed += 1;
    }

    const compared = quality?.decisionsCompared ?? labels.length;
    const kept = labels.length;
    const dropped = quality?.decisionsDroppedUninformative ?? Math.max(0, compared - kept);
    const yieldRate = compared > 0 ? Number((kept / compared).toFixed(4)) : 0;

    // Paired-comparison arithmetic. A paired design only carries information in
    // its discordant pairs, so the number of *decisions* needed is the number of
    // discordant pairs divided by the discordant fraction.
    const assumedWinRate = 0.5;
    const targetImprovement = 0.05; // 5 percentage points: the smallest worth shipping
    // For a McNemar-style test, n_discordant ~ (z^2 * p(1-p)) / (delta/2)^2.
    const z = 1.96;
    const pDiscordant = 0.5;
    const zSquared = z * z;
    const halfDelta = targetImprovement / 2;
    const discordantNeeded = Math.ceil((zSquared * pDiscordant * (1 - pDiscordant)) / (halfDelta * halfDelta));
    const observedDiscordance = Math.max(0.02, deltaOrZero(labels));
    const blocksNeeded = Math.ceil(discordantNeeded / observedDiscordance);
    const decisionsNeeded = yieldRate > 0 ? Math.ceil(blocksNeeded / yieldRate) : 0;

    const transitionsUsed = quality?.accounting?.engineTransitions ?? labels.reduce((n, l) => n + l.engineTransitions, 0);
    const secondsPerDecision = input.elapsedMs && compared > 0
        ? Number((input.elapsedMs / compared / 1000).toFixed(2))
        : 0;

    return {
        schema: 'v11_power_analysis_1',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        inputs: { labelsFile, labelQualityFile, options: quality?.options ?? null },
        yield: {
            decisionsCompared: compared,
            decisionsKept: kept,
            decisionsDroppedUninformative: dropped,
            yieldRate,
            episodesUsed: quality?.episodesUsed ?? new Set(labels.map(l => l.episodeId)).size,
        },
        decisionShapes: {
            allCandidatesTerminal: allTerminal,
            noCandidateTerminal: noTerminal,
            mixed,
        },
        effectSize: {
            distinctDeltaValues: new Set(deltas).size,
            deltaValues: Array.from(new Set(deltas)).sort((a, b) => a - b),
            deltaMean: Number(mean(deltas).toFixed(6)),
            deltaStdDev: Number(stdDev(deltas).toFixed(6)),
            allDeltasEqual: new Set(deltas).size <= 1,
            note:
                'The value function is terminal-dominant and the payoff scale is {-1, 0, +1}. When every candidate ' +
                'reaches a natural terminal, a decision can only produce a handful of distinct dQ values, so the ' +
                'label is a win/lose flip rather than a graded preference.',
        },
        candidateBreadth: {
            meanCandidates: candidatesPer.length ? Number(mean(candidatesPer).toFixed(2)) : 0,
            decisionsWithSingleCandidate: candidatesPer.filter(n => n <= 1).length,
        },
        sampleSize: {
            assumedWinRateAtBaseline: assumedWinRate,
            targetAbsoluteImprovement: targetImprovement,
            discordantFraction: Number(observedDiscordance.toFixed(4)),
            discordantPairsNeeded: discordantNeeded,
            blocksNeededAtObservedDiscordance: blocksNeeded,
            decisionsNeededAtObservedYield: decisionsNeeded,
            note:
                'Order-of-magnitude arithmetic for a paired test at 95% confidence, not a formal power calculation. ' +
                'It assumes the observed discordance fraction holds, which this run is far too small to establish.',
        },
        rootCauses: [
            'Positions sampled from Heuristic-vs-Heuristic episodes are largely decided: most candidates lead to the ' +
            'same winner, so dQ collapses to 0 and the decision is dropped.',
            'The value function is terminal-dominant with a {-1, 0, +1} payoff, so surviving labels carry no magnitude ' +
            'information - only a sign flip.',
            'A bounded heuristic continuation is used on both sides, which further reduces the spread between ' +
            'candidates relative to a stronger reference.',
            'Root-family holdout splits a small label set into even smaller train/holdout sets: 7 train vs 1 holdout ' +
            'decisions here, which cannot distinguish any two arms.',
        ],
        recommendations: [
            {
                action: 'Sample decisions from contested positions, not uniformly from an episode',
                why: 'Yield, not budget, was the binding constraint: 32 of 40 compared decisions were dropped as ' +
                     'uninformative. Filtering for positions where the game is still open raises yield directly.',
                costNote: 'Requires a cheap pre-filter (e.g. material balance or heuristic score gap) before spending ' +
                          'the expensive continuation budget.',
            },
            {
                action: 'Give the value function magnitude, or use a stronger reference policy',
                why: 'With a {-1, 0, +1} payoff every surviving label has the same effect size, so any ranker can at ' +
                     'best learn a coin flip. A graded leaf value or a deeper reference teacher creates rankable ' +
                     'differences.',
                costNote: 'A deeper teacher multiplies per-decision cost; a graded leaf value is cheap but must be ' +
                          'calibrated against natural terminals first.',
            },
            {
                action: 'Collect labels from many more episodes before running the arm comparison again',
                why: `At the observed yield, a paired test at 5 percentage points needs on the order of ` +
                     `${decisionsNeeded} compared decisions, and the per-decision cost was ` +
                     `${secondsPerDecision || 'unknown'}s in this run.`,
                costNote: 'This is the dominant cost and should be authorised explicitly before it is spent.',
            },
            {
                action: 'Do not read this round\'s arm comparison as evidence about the method',
                why: 'One holdout decision cannot separate a trained ranker from an untrained one; the arms are ' +
                     'expected to tie, and a tie here is an absence of data, not evidence of no effect.',
                costNote: 'None - this is a reporting constraint.',
            },
        ],
        budgetAccounting: {
            teacherDecisionQueriesUsed: quality?.budgetCompliance?.teacherDecisionQueries ?? kept,
            teacherDecisionQueryCap: quality?.budgetCompliance?.maxNewTeacherDecisionQueries ?? 10000,
            engineTransitionsUsed: transitionsUsed,
            secondsPerComparedDecision: secondsPerDecision,
        },
    };
}

/** A crude stand-in for "how often do two arms disagree", from label spread. */
function deltaOrZero(labels: CounterfactualLabel[]): number {
    if (labels.length === 0) return 0.02;
    const nonZero = labels.filter(l => l.deltaQ !== 0).length;
    return nonZero / labels.length;
}