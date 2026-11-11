/**
 * T12-07 helper: the high-information-decision prescreen, and the descriptive
 * statistics the T12-06 / T12-07 reports are built from.
 *
 * Everything in this module is pure: no engine, no filesystem, no clock. That
 * keeps the prescreen predicate auditable on its own, independently of the
 * expensive search that produces its inputs.
 *
 * Terminology used throughout (and in the report):
 *   leaf(a)  = BattleSearchAI v3's maximin leaf for candidate `a`, i.e. the
 *              worst-case (over the opponent's most dangerous replies) value of
 *              `evaluatePositionHeuristic`, a continuous score in the
 *              hundreds/thousands, with +/-100000 reserved for natural
 *              terminals. This is what the taskbook calls the *proxy reference*
 *              Q_ref. It is NOT a win probability and NOT optimal Q.
 *   a0       = the Heuristic top choice, which is what BattleSearchAI returns by
 *              default (it only overrides on takeover / veto).
 *   margin   = bestLeaf - leaf(a0)  (non-negative by construction, because
 *              bestLeaf is the max over a candidate set that contains a0).
 *   dQ(a)    = leaf(a) - leaf(a0).
 *
 * The mission's prescreen band is written `0 < |margin| < takeoverThreshold`.
 * Because margin cannot go negative here, |margin| == margin; the module keeps
 * the absolute-value form so the predicate stays correct if a future caller
 * passes a signed margin.
 */

/** BattleSearchAI v3 defaults, copied verbatim from the class constructor. */
export const SEARCH_V3_DEFAULTS = {
    topK: 10,
    oppProbeK: 6,
    friendlyRolloutSteps: 3,
    takeoverThreshold: 1200,
    vetoMargin: 800,
    dangerLine: -1500,
    /** evaluatePositionHeuristic reserves +/-100000 for terminals and bounds
     *  non-terminal scores to [-49000, 49000], so this band is unambiguous. */
    terminalBand: 90000,
    /** evaluateCandidate's sentinel for "the action threw / was rejected". */
    stepFailureSentinel: -99999,
} as const;

/** What BattleSearchAI v3 would do in this state, reconstructed from its own
 *  branch order in `getAction` (urgent -> forced win -> takeover -> veto -> follow). */
export type PolicyBranch = 'URGENT' | 'FORCED_WIN' | 'TAKEOVER' | 'VETO' | 'FOLLOW';

export const POLICY_BRANCHES: readonly PolicyBranch[] = ['URGENT', 'FORCED_WIN', 'TAKEOVER', 'VETO', 'FOLLOW'];

export interface BranchInput {
    /** The heuristic produced an action scoring >= 50000 (getAction returns it immediately). */
    urgent: boolean;
    /** leaf(a0) */
    baselineLeaf: number;
    /** max over the evaluated candidate set of leaf(a) */
    bestLeaf: number;
    /** any evaluated candidate leaf sits in the terminal band (>= 100000). */
    anyForcedWin: boolean;
    takeoverThreshold: number;
    vetoMargin: number;
    dangerLine: number;
}

/**
 * Reconstruct the branch BattleSearchAI v3 takes, from the same thresholds and
 * the same ordering the class uses. This is an *external reconstruction*: v3 at
 * HEAD exposes no counter, so nothing here reads internal state.
 */
export function classifyPolicyBranch(input: BranchInput): PolicyBranch {
    if (input.urgent) return 'URGENT';
    if (input.anyForcedWin) return 'FORCED_WIN';
    if (input.bestLeaf >= input.baselineLeaf + input.takeoverThreshold) return 'TAKEOVER';
    if (input.baselineLeaf <= input.dangerLine && input.bestLeaf >= input.baselineLeaf + input.vetoMargin) return 'VETO';
    return 'FOLLOW';
}

/** The targeted band: the search almost overrode but did not. */
export function inMarginBand(margin: number, takeoverThreshold: number): boolean {
    const magnitude = Math.abs(margin);
    return magnitude > 0 && magnitude < takeoverThreshold;
}

/** The "danger" flag: the heuristic's own top choice already looks lost. */
export function isDangerous(baselineLeaf: number, dangerLine: number): boolean {
    return baselineLeaf <= dangerLine;
}

/** A decision carries information for a ranker iff its candidates do not all tie. */
export function isNonDegenerate(distinctLeafValues: number): boolean {
    return distinctLeafValues > 1;
}

// ---------------------------------------------------------------------------
// descriptive statistics
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation (divides by n, not n-1). */
export function stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const m = mean(values);
    return Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length);
}

export function quantile(sortedValues: number[], q: number): number {
    if (sortedValues.length === 0) return 0;
    const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.round(q * (sortedValues.length - 1))));
    return sortedValues[idx];
}

export interface NumericSummary {
    count: number;
    distinct: number;
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    median: number;
    p10: number;
    p90: number;
}

export function summarize(values: number[], digits = 6): NumericSummary {
    const sorted = [...values].sort((a, b) => a - b);
    const distinct = new Set(values.map(v => Number(v.toFixed(digits)))).size;
    const round = (v: number) => Number(v.toFixed(digits));
    return {
        count: values.length,
        distinct,
        min: sorted.length ? round(sorted[0]) : 0,
        max: sorted.length ? round(sorted[sorted.length - 1]) : 0,
        mean: round(mean(values)),
        stdDev: round(stdDev(values)),
        median: round(quantile(sorted, 0.5)),
        p10: round(quantile(sorted, 0.1)),
        p90: round(quantile(sorted, 0.9)),
    };
}

export interface Histogram {
    binCount: number;
    lo: number;
    hi: number;
    width: number;
    bins: Array<{ lo: number; hi: number; count: number }>;
}

/** Fixed-width histogram over [min, max]. A constant input collapses to one bin. */
export function histogram(values: number[], binCount = 20, digits = 3): Histogram {
    if (values.length === 0) return { binCount: 0, lo: 0, hi: 0, width: 0, bins: [] };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (hi === lo) {
        return {
            binCount: 1, lo: Number(lo.toFixed(digits)), hi: Number(hi.toFixed(digits)), width: 0,
            bins: [{ lo: Number(lo.toFixed(digits)), hi: Number(hi.toFixed(digits)), count: values.length }],
        };
    }
    const width = (hi - lo) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
        lo: Number((lo + i * width).toFixed(digits)),
        hi: Number((lo + (i + 1) * width).toFixed(digits)),
        count: 0,
    }));
    for (const v of values) {
        const idx = Math.min(binCount - 1, Math.floor((v - lo) / width));
        bins[idx].count += 1;
    }
    return { binCount, lo: Number(lo.toFixed(digits)), hi: Number(hi.toFixed(digits)), width: Number(width.toFixed(digits)), bins };
}

/** Exact value -> count, most frequent first (ties broken by value). */
export function exactValueCounts(values: number[], digits = 6, limit = 40): Array<{ value: number; count: number }> {
    const counts = new Map<number, number>();
    for (const v of values) {
        const key = Number(v.toFixed(digits));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => (b.count - a.count) || (a.value - b.value))
        .slice(0, limit);
}

export interface Ratio {
    numerator: number;
    denominator: number;
    value: number;
}

export function ratio(numerator: number, denominator: number, digits = 6): Ratio {
    return { numerator, denominator, value: denominator > 0 ? Number((numerator / denominator).toFixed(digits)) : 0 };
}

/** Bedrock ASCII bar chart, so the raw histogram survives in a text report. */
export function renderBar(count: number, maxCount: number, width = 40): string {
    if (maxCount <= 0) return '';
    return '#'.repeat(Math.max(count > 0 ? 1 : 0, Math.round((count / maxCount) * width)));
}
