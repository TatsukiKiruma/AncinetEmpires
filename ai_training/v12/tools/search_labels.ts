/**
 * T12-06 + T12-07 driver: continuous proxy-Q labels from BattleSearchAI v3, plus
 * the high-information-decision prescreen.
 *
 * WHY THIS EXISTS
 * ---------------
 * The v11 batch-2 label set collapsed: 40 decisions were compared, 8 kept
 * (yieldRate 0.20), and every kept label had the SAME value, dQ = 2
 * (distinctDeltaValues = 1, allDeltasEqual = true). The cause was the payoff
 * space: a terminal-dominant {-1, 0, +1} payoff squashed through tanh(). When
 * every candidate reaches the same natural winner, the delta is constant and no
 * ranker can learn from it.
 *
 * WHAT THIS DOES
 * --------------
 * It replaces the label with BattleSearchAI v3's own maximin leaf value: a
 * continuous score in the hundreds/thousands, with +/-100000 for natural
 * terminals. For one decision point:
 *
 *     dQ(a) = leaf(a) - leaf(a0),    leaf = ai.evaluateCandidate(...)
 *
 * where a0 is the Heuristic top choice (what BattleSearchAI returns by default)
 * and every leaf comes from a FRESH, independently seeded BattleSearchAI. That
 * makes each leaf a pure function of (state, playerId, action, seed): order
 * independent, and bit-identical when the same decision is evaluated twice.
 *
 * HONESTY BOUNDARY (repeated in every artifact this writes)
 * --------------------------------------------------------
 * Q_ref here is a *proxy reference* from a bounded heuristic maximin search,
 * keyed to the `evaluatePositionHeuristic` score scale. It is NOT a win
 * probability, NOT calibrated, and NOT optimal Q. It must not be added raw to
 * HeuristicAI scores (same units, wildly different semantics) without
 * normalisation.
 *
 * POSITION RECONSTRUCTION IS REUSED, NOT REIMPLEMENTED
 * ---------------------------------------------------
 * Decision positions come from `tools/v11/labels.ts` (`loadValidatedEpisodes` +
 * `sampleDecisionPoints`), i.e. exactly the verified replay-provable machinery
 * the v11 batch-2 labels used. This tool never builds a position by hand.
 *
 * USAGE
 * -----
 *   node v11/tools/run-tool.mjs v12/tools/search_labels.ts [--key value ...]
 *
 *   --episodes <n>         episodes to load from the front of the episodes file (default 32)
 *   --per-episode <n>      sampled decisions per episode, uniform plan (default 2)
 *   --min-frac <f>         sampling band, lower (default 0.08, same as v11)
 *   --max-frac <f>         sampling band, upper (default 0.92, same as v11)
 *   --plan uniform|ids     how to choose decision points (default uniform)
 *   --ids-file <path>      JSON array / JSONL of decisionIds, for --plan ids
 *   --episodes-file <p>    episodes.jsonl (default: v11 replay pool default)
 *   --limit <n>            hard cap on compared decisions, 0 = no cap (default 0)
 *   --max-candidates <n>   candidates leaf-evaluated per decision (default 6)
 *   --top-k <n>            heuristic ordering breadth (default 10 = v3 default)
 *   --seed <n>             label seed base (default 20260924)
 *   --policy-check <n>     run the REAL BattleSearchAI.getAction on the first n
 *                          decisions and compare with the reconstruction (default 0)
 *   --determinism <n>      re-evaluate the first n decisions and compare (default 0)
 *   --footing-ids-file <p> decisionIds of the previous batch, for same-footing yield
 *   --tag <name>           run tag; non-"main" tags suffix the output filenames
 *   --out-dir <path>       output directory (default v12/out/labels)
 *   --quiet                only print the final summary block
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { encodeAction } from '../../src/game/env';
import { fixedRng, seedFromHash, type DecisionPoint } from '../../tools/v11/counterfactual';
import {
    defaultJobOptions,
    loadValidatedEpisodes,
    sampleDecisionPoints,
    type CounterfactualJobOptions,
} from '../../tools/v11/labels';
import { defaultEpisodesFile } from '../../tools/v11/replay_validation';
import { ensureDir, appendJsonl, readJson, readJsonl, sha256, writeJson, writeJsonl } from '../../tools/v11/common';
import type { Action } from '../../src/game/types';
import {
    SEARCH_V3_DEFAULTS,
    classifyPolicyBranch,
    exactValueCounts,
    histogram,
    inMarginBand,
    isDangerous,
    isNonDegenerate,
    ratio,
    renderBar,
    summarize,
    type Histogram,
    type NumericSummary,
    type PolicyBranch,
} from './search_prescreen';

// ---------------------------------------------------------------------------
// engine-transition instrumentation
// ---------------------------------------------------------------------------

/**
 * Count engine transitions consumed inside `evaluateCandidate`.
 *
 * `GameEngine.clone()` returns `new GameEngine(...)`, so a subclass counter
 * cannot see the clones. Wrapping the prototype method is the only way to count
 * the clones' steps too. The wrapper only increments a counter and delegates;
 * it changes no behaviour and touches no RNG.
 */
let stepCount = 0;
let stepCounterInstalled = false;

export function installStepCounter(): void {
    if (stepCounterInstalled) return;
    const proto = GameEngine.prototype as unknown as { step: (action: Action) => unknown };
    const original = proto.step;
    proto.step = function patchedStep(this: GameEngine, action: Action) {
        stepCount += 1;
        return original.call(this, action);
    };
    stepCounterInstalled = true;
}

export function resetStepCount(): void { stepCount = 0; }
export function readStepCount(): number { return stepCount; }

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------

export interface SearchLabelConfig {
    episodesFile: string;
    maxEpisodes: number;
    decisionsPerEpisode: number;
    minStepFraction: number;
    maxStepFraction: number;
    plan: 'uniform' | 'ids';
    idsFile: string | null;
    limit: number;
    maxCandidates: number;
    topK: number;
    seedBase: number;
    policyCheck: number;
    determinism: number;
    footingIdsFile: string | null;
    outDir: string;
    tag: string;
    quiet: boolean;
    /** Search knobs, recorded in every provenance string. */
    oppProbeK: number;
    friendlyRolloutSteps: number;
    takeoverThreshold: number;
    vetoMargin: number;
    dangerLine: number;
}

export function defaultSearchLabelConfig(): SearchLabelConfig {
    return {
        episodesFile: process.env.V12_EPISODES_FILE ?? defaultEpisodesFile(),
        maxEpisodes: 32,
        decisionsPerEpisode: 2,
        minStepFraction: 0.08,
        maxStepFraction: 0.92,
        plan: 'uniform',
        idsFile: null,
        limit: 0,
        maxCandidates: 6,
        topK: SEARCH_V3_DEFAULTS.topK,
        seedBase: 20260924,
        policyCheck: 0,
        determinism: 0,
        footingIdsFile: null,
        outDir: 'v12/out/labels',
        tag: 'main',
        quiet: false,
        oppProbeK: SEARCH_V3_DEFAULTS.oppProbeK,
        friendlyRolloutSteps: SEARCH_V3_DEFAULTS.friendlyRolloutSteps,
        takeoverThreshold: SEARCH_V3_DEFAULTS.takeoverThreshold,
        vetoMargin: SEARCH_V3_DEFAULTS.vetoMargin,
        dangerLine: SEARCH_V3_DEFAULTS.dangerLine,
    };
}

export function provenanceString(cfg: SearchLabelConfig): string {
    return `proxy_reference:battle_search_ai_v3:maximin_leaf(${cfg.oppProbeK},${cfg.friendlyRolloutSteps})`;
}

// ---------------------------------------------------------------------------
// label types
// ---------------------------------------------------------------------------

export type SearchLabelQuality = 'PROXY_TERMINAL' | 'PROXY_CONTINUOUS' | 'DEGENERATE';

export interface CandidateLeaf {
    index: number;
    actionCode: string;
    actionJson: string;
    actionType: string;
    heuristicScore: number;
    leaf: number;
    deltaQ: number;
    stepFailed: boolean;
    terminalBand: boolean;
    forcedWin: boolean;
    engineTransitions: number;
    wallMs: number;
    seed: number;
}

export interface SearchLabel {
    schema: 'v12_search_label_1';
    decisionId: string;
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    mapLabel: string;
    setupId: string;
    seed: number;
    step: number;
    turn: number;
    stage: string;
    subjectPlayer: number;
    stateHash: string;
    episodeOutcome: number | null;
    /** The Heuristic top choice = BattleSearchAI v3's default action. */
    baselineActionCode: string;
    baselineActionType: string;
    bestActionCode: string;
    /** What v3 would actually return here, reconstructed from its branch order. */
    policyActionCode: string;
    policyBranch: PolicyBranch;
    baselineLeaf: number;
    bestLeaf: number;
    /** bestLeaf - baselineLeaf, non-negative by construction. */
    margin: number;
    /** dQ of the best candidate == margin. The decision-level label. */
    deltaQ: number;
    distinctLeafValues: number;
    distinctDeltaValues: number;
    allCandidatesTie: boolean;
    terminalDominated: boolean;
    forcedWinAvailable: boolean;
    dangerousBaseline: boolean;
    labelQuality: SearchLabelQuality;
    heuristicTopScore: number;
    heuristicSecondScore: number | null;
    heuristicScoreGap: number | null;
    legalActionCount: number;
    evaluatedCandidateCount: number;
    leaves: CandidateLeaf[];
    engineTransitions: number;
    wallMs: number;
    seeds: { decisionSeed: number; orderingSeed: number };
    search: {
        topK: number; maxCandidates: number; oppProbeK: number; friendlyRolloutSteps: number;
        takeoverThreshold: number; vetoMargin: number; dangerLine: number;
    };
    provenance: string;
}

// ---------------------------------------------------------------------------
// the evaluation itself
// ---------------------------------------------------------------------------

function maxBy<T>(items: T[], score: (t: T) => number): T {
    let best = items[0];
    for (const item of items) if (score(item) > score(best)) best = item;
    return best;
}

/**
 * Evaluate one decision point: find a0, leaf-evaluate every candidate, emit the
 * continuous label. Pure with respect to the point: two calls with the same
 * (point, cfg) produce identical leaf values, transitions and dQ.
 */
export function evaluateDecisionPoint(point: DecisionPoint, cfg: SearchLabelConfig): SearchLabel {
    const t0 = Date.now();
    const engine = new GameEngine(point.state);
    const playerId = point.subjectPlayer;
    const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');

    const decisionSeed = seedFromHash(point.stateHash, cfg.seedBase);
    const orderingSeed = (decisionSeed ^ 0x5bf03635) >>> 0;
    const scorer = new HeuristicAI(fixedRng(orderingSeed));
    const scored = scorer.scoreCandidateActions(engine, playerId, legal);

    let urgentBest: { action: Action; score: number } | null = null;
    for (const s of scored) {
        if (s.score >= 50000 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }

    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const evaluated = ordered.slice(0, Math.min(cfg.maxCandidates, ordered.length));
    const a0 = evaluated[0];

    const leaves: CandidateLeaf[] = evaluated.map((cand, index) => {
        const candidateSeed = (decisionSeed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
        const ai = new BattleSearchAI(candidateSeed, {
            topK: cfg.topK,
            oppProbeK: cfg.oppProbeK,
            friendlyRolloutSteps: cfg.friendlyRolloutSteps,
            takeoverThreshold: cfg.takeoverThreshold,
            vetoMargin: cfg.vetoMargin,
            dangerLine: cfg.dangerLine,
            allowSurrender: false,
        });
        resetStepCount();
        const lt = Date.now();
        const leaf = ai.evaluateCandidate(engine, playerId, cand.action);
        const wallMs = Date.now() - lt;
        const transitions = readStepCount();
        return {
            index,
            actionCode: ai.actionCode(cand.action),
            actionJson: JSON.stringify(cand.action),
            actionType: cand.action.type,
            heuristicScore: Number(cand.score.toFixed(3)),
            leaf: Number(leaf.toFixed(6)),
            deltaQ: 0, // filled below: leaf - baselineLeaf
            stepFailed: leaf === SEARCH_V3_DEFAULTS.stepFailureSentinel,
            terminalBand: Math.abs(leaf) >= SEARCH_V3_DEFAULTS.terminalBand,
            forcedWin: leaf >= 100000,
            engineTransitions: transitions,
            wallMs,
            seed: candidateSeed,
        };
    });

    const baselineLeaf = leaves[0].leaf;
    for (const l of leaves) l.deltaQ = Number((l.leaf - baselineLeaf).toFixed(6));

    const best = maxBy(leaves, l => l.leaf);
    const margin = Number((best.leaf - baselineLeaf).toFixed(6));
    const distinctLeafValues = new Set(leaves.map(l => l.leaf)).size;
    const terminalDominated = leaves.some(l => l.terminalBand);
    const anyForcedWin = leaves.some(l => l.forcedWin);

    const policyBranch = classifyPolicyBranch({
        urgent: urgentBest !== null,
        baselineLeaf, bestLeaf: best.leaf, anyForcedWin,
        takeoverThreshold: cfg.takeoverThreshold,
        vetoMargin: cfg.vetoMargin,
        dangerLine: cfg.dangerLine,
    });

    // Exactly the branch order inside BattleSearchAI.getAction.
    let policyActionCode: string;
    if (policyBranch === 'URGENT' && urgentBest) {
        policyActionCode = encodeAction(urgentBest.action);
    } else if (policyBranch === 'FORCED_WIN') {
        const firstWin = [...leaves].sort((a, b) => a.index - b.index).find(l => l.forcedWin);
        policyActionCode = firstWin ? firstWin.actionCode : encodeAction(a0.action);
    } else if (policyBranch === 'TAKEOVER' || policyBranch === 'VETO') {
        policyActionCode = best.actionCode;
    } else {
        policyActionCode = encodeAction(a0.action);
    }

    const labelQuality: SearchLabelQuality =
        distinctLeafValues <= 1 ? 'DEGENERATE'
            : terminalDominated ? 'PROXY_TERMINAL'
                : 'PROXY_CONTINUOUS';

    return {
        schema: 'v12_search_label_1',
        decisionId: point.decisionId,
        episodeId: point.episodeId,
        rootFamilyId: point.rootFamilyId,
        mapName: point.mapName,
        mapLabel: point.mapLabel,
        setupId: point.setupId,
        seed: point.seed,
        step: point.step,
        turn: point.turn,
        stage: point.stage,
        subjectPlayer: playerId,
        stateHash: point.stateHash,
        episodeOutcome: point.episodeOutcome,
        baselineActionCode: encodeAction(a0.action),
        baselineActionType: a0.action.type,
        bestActionCode: best.actionCode,
        policyActionCode,
        policyBranch,
        baselineLeaf,
        bestLeaf: best.leaf,
        margin,
        deltaQ: margin,
        distinctLeafValues,
        // Subtracting the constant baselineLeaf preserves distinctness exactly.
        distinctDeltaValues: distinctLeafValues,
        allCandidatesTie: distinctLeafValues <= 1,
        terminalDominated,
        forcedWinAvailable: anyForcedWin,
        dangerousBaseline: isDangerous(baselineLeaf, cfg.dangerLine),
        labelQuality,
        heuristicTopScore: Number(a0.score.toFixed(3)),
        heuristicSecondScore: ordered.length > 1 ? Number(ordered[1].score.toFixed(3)) : null,
        heuristicScoreGap: ordered.length > 1 ? Number((ordered[0].score - ordered[1].score).toFixed(3)) : null,
        legalActionCount: legal.length,
        evaluatedCandidateCount: leaves.length,
        leaves,
        engineTransitions: leaves.reduce((n, l) => n + l.engineTransitions, 0),
        wallMs: Date.now() - t0,
        seeds: { decisionSeed, orderingSeed },
        search: {
            topK: cfg.topK, maxCandidates: cfg.maxCandidates, oppProbeK: cfg.oppProbeK,
            friendlyRolloutSteps: cfg.friendlyRolloutSteps,
            takeoverThreshold: cfg.takeoverThreshold, vetoMargin: cfg.vetoMargin, dangerLine: cfg.dangerLine,
        },
        provenance: provenanceString(cfg),
    };
}

/** Everything except wall-clock timing, for bit-identical comparisons. */
export function stripTiming(label: SearchLabel): unknown {
    const clone = JSON.parse(JSON.stringify(label)) as SearchLabel;
    clone.wallMs = -1;
    for (const l of clone.leaves) l.wallMs = -1;
    return clone;
}

export function labelHash(label: SearchLabel): string {
    return sha256(JSON.stringify(stripTiming(label)));
}

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

function readDecisionIdList(file: string): string[] {
    const raw = fs.readFileSync(file, 'utf8').trim();
    const parseItem = (item: unknown): string =>
        typeof item === 'string' ? item : String((item as { decisionId?: string }).decisionId ?? '');
    if (raw.startsWith('[')) {
        return (JSON.parse(raw) as unknown[]).map(parseItem).filter(Boolean);
    }
    if (raw.startsWith('{')) {
        // Accept the v12 batch-2 recovery report as well as a bare label record.
        const obj = JSON.parse(raw) as {
            decisionId?: string;
            recovered?: { decisionIds?: string[] };
        };
        const list = obj.recovered?.decisionIds;
        if (Array.isArray(list)) return list.map(String).filter(Boolean);
        return [String(obj.decisionId ?? '')].filter(Boolean);
    }
    return raw.split('\n').filter(l => l.trim().length > 0).map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('{')) {
            const obj = JSON.parse(trimmed) as { decisionId?: string };
            return String(obj.decisionId ?? '');
        }
        return trimmed.replace(/^"|"$/g, '');
    }).filter(Boolean);
}

export interface PlanResult {
    points: DecisionPoint[];
    wanted: string[];
    missing: string[];
    episodesUsed: number;
    episodesSkipped: Array<{ episodeId: string; reason: string }>;
    loadedEpisodeIds: string[];
}

/** Build the decision-point plan, reusing the v11 sampling machinery verbatim. */
export function buildPlan(cfg: SearchLabelConfig): PlanResult {
    const { loaded, skipped } = loadValidatedEpisodes(cfg.episodesFile, cfg.maxEpisodes);
    const base = defaultJobOptions();

    if (cfg.plan === 'uniform') {
        const jobOptions: CounterfactualJobOptions = {
            ...base,
            episodesFile: cfg.episodesFile,
            decisionsPerEpisode: cfg.decisionsPerEpisode,
            maxEpisodes: cfg.maxEpisodes,
            minStepFraction: cfg.minStepFraction,
            maxStepFraction: cfg.maxStepFraction,
        };
        const points: DecisionPoint[] = [];
        for (const episode of loaded) {
            for (const p of sampleDecisionPoints(episode, jobOptions)) {
                points.push(p);
                if (cfg.limit > 0 && points.length >= cfg.limit) break;
            }
            if (cfg.limit > 0 && points.length >= cfg.limit) break;
        }
        return {
            points,
            wanted: points.map(p => p.decisionId),
            missing: [],
            episodesUsed: loaded.length,
            episodesSkipped: skipped,
            loadedEpisodeIds: loaded.map(e => e.record.episodeId),
        };
    }

    const wanted = readDecisionIdList(cfg.idsFile as string);
    const wantedSet = new Set(wanted);
    const wantedEpisodes = new Set(wanted.map(id => id.split('#')[0]));
    // Every eligible step of the episode, then filter to the requested ids. This
    // reuses `sampleDecisionPoints` rather than re-implementing the replay loop.
    const allOptions: CounterfactualJobOptions = {
        ...base,
        episodesFile: cfg.episodesFile,
        decisionsPerEpisode: Number.MAX_SAFE_INTEGER,
        maxEpisodes: cfg.maxEpisodes,
        minStepFraction: 0,
        maxStepFraction: 1,
    };
    const points: DecisionPoint[] = [];
    const found = new Set<string>();
    for (const episode of loaded) {
        if (!wantedEpisodes.has(episode.record.episodeId)) continue;
        const all = sampleDecisionPoints(episode, allOptions);
        for (const p of all) {
            if (!wantedSet.has(p.decisionId)) continue;
            points.push(p);
            found.add(p.decisionId);
            if (cfg.limit > 0 && points.length >= cfg.limit) break;
        }
        if (cfg.limit > 0 && points.length >= cfg.limit) break;
    }
    // Preserve the caller's order.
    points.sort((a, b) => wanted.indexOf(a.decisionId) - wanted.indexOf(b.decisionId));
    return {
        points,
        wanted,
        missing: wanted.filter(id => !found.has(id)),
        episodesUsed: loaded.length,
        episodesSkipped: skipped,
        loadedEpisodeIds: loaded.map(e => e.record.episodeId),
    };
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

const PREVIOUS_BATCH = {
    decisionsCompared: 40,
    decisionsKept: 8,
    yieldRate: 0.2,
    distinctDeltaValues: 1,
    secondsPerComparedDecision: 54.46,
    sources: [
        'v11/out/label_quality.json',
        'v11/out/power_analysis.json',
        'v11/V11_BATCH2_REPORT.md',
    ],
};

export interface PrescreenPredicateReport {
    id: string;
    definition: string;
    evaluableBeforeSearch: boolean;
    kept: number;
    total: number;
    keptNonDegenerate: number;
    allNonDegenerate: number;
    yieldRateInside: number;
    yieldRateOutside: number;
    precision: { numerator: number; denominator: number; value: number };
    recall: { numerator: number; denominator: number; value: number };
    wallMsInside: number;
    wallMsOutside: number;
    wallMsPerKeptDecision: number;
    note: string;
}

function predicateReport(params: {
    id: string;
    definition: string;
    evaluableBeforeSearch: boolean;
    labels: SearchLabel[];
    keep: (l: SearchLabel) => boolean;
    note: string;
}): PrescreenPredicateReport {
    const { labels, keep } = params;
    const inside = labels.filter(keep);
    const outside = labels.filter(l => !keep(l));
    const allNonDegenerate = labels.filter(l => isNonDegenerate(l.distinctLeafValues)).length;
    const keptNonDegenerate = inside.filter(l => isNonDegenerate(l.distinctLeafValues)).length;
    const wallInside = inside.reduce((n, l) => n + l.wallMs, 0);
    const wallOutside = outside.reduce((n, l) => n + l.wallMs, 0);
    return {
        id: params.id,
        definition: params.definition,
        evaluableBeforeSearch: params.evaluableBeforeSearch,
        kept: inside.length,
        total: labels.length,
        keptNonDegenerate,
        allNonDegenerate,
        yieldRateInside: inside.length ? Number((keptNonDegenerate / inside.length).toFixed(6)) : 0,
        yieldRateOutside: outside.length
            ? Number((outside.filter(l => isNonDegenerate(l.distinctLeafValues)).length / outside.length).toFixed(6))
            : 0,
        precision: ratio(keptNonDegenerate, inside.length),
        recall: ratio(keptNonDegenerate, allNonDegenerate),
        wallMsInside: wallInside,
        wallMsOutside: wallOutside,
        wallMsPerKeptDecision: inside.length ? Number((wallInside / inside.length).toFixed(1)) : 0,
        note: params.note,
    };
}

export interface RunArtifacts {
    labelsFile: string;
    qualityFile: string;
    prescreenFile: string;
    determinismFile: string | null;
    labels: SearchLabel[];
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): SearchLabelConfig {
    const cfg = defaultSearchLabelConfig();
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        const val = argv[i + 1];
        const next = () => { i += 1; return val; };
        switch (key) {
            case '--episodes': cfg.maxEpisodes = Number(next()); break;
            case '--per-episode': cfg.decisionsPerEpisode = Number(next()); break;
            case '--min-frac': cfg.minStepFraction = Number(next()); break;
            case '--max-frac': cfg.maxStepFraction = Number(next()); break;
            case '--plan': cfg.plan = next() as SearchLabelConfig['plan']; break;
            case '--ids-file': cfg.idsFile = next(); break;
            case '--episodes-file': cfg.episodesFile = next(); break;
            case '--limit': cfg.limit = Number(next()); break;
            case '--max-candidates': cfg.maxCandidates = Number(next()); break;
            case '--top-k': cfg.topK = Number(next()); break;
            case '--seed': cfg.seedBase = Number(next()); break;
            case '--policy-check': cfg.policyCheck = Number(next()); break;
            case '--determinism': cfg.determinism = Number(next()); break;
            case '--footing-ids-file': cfg.footingIdsFile = next(); break;
            case '--out-dir': cfg.outDir = next(); break;
            case '--tag': cfg.tag = next(); break;
            case '--quiet': cfg.quiet = true; break;
            default:
                if (key.startsWith('--')) throw new Error(`unknown flag ${key}`);
        }
    }
    if (cfg.plan === 'ids' && !cfg.idsFile) throw new Error('--plan ids requires --ids-file');
    return cfg;
}

function suffix(tag: string): string {
    return tag === 'main' ? '' : `_${tag}`;
}

export function runSearchLabels(cfg: SearchLabelConfig): RunArtifacts {
    installStepCounter();
    ensureDir(cfg.outDir);
    const log = (msg: string) => { if (!cfg.quiet) console.log(msg); };

    log(`[plan] ${cfg.plan} episodes<=${cfg.maxEpisodes} perEpisode=${cfg.decisionsPerEpisode} ` +
        `candidates<=${cfg.maxCandidates} seed=${cfg.seedBase}`);
    const planT0 = Date.now();
    const plan = buildPlan(cfg);
    const planMs = Date.now() - planT0;
    log(`[plan] loaded ${plan.episodesUsed} episodes (${plan.episodesSkipped.length} skipped), ` +
        `${plan.points.length} decision points in ${(planMs / 1000).toFixed(1)}s` +
        (plan.wanted.length !== plan.points.length ? `, ${plan.missing.length} requested ids missing` : ''));

    const labels: SearchLabel[] = [];
    const skippedDecisions: Array<{ decisionId: string; reason: string }> = [];
    // Crash insurance: append each label as it is produced, then overwrite with the
    // single canonical file at the end.
    const partialFile = path.join(cfg.outDir, `counterfactual_labels_v2${suffix(cfg.tag)}.partial.jsonl`);
    if (fs.existsSync(partialFile)) fs.rmSync(partialFile);
    const evalT0 = Date.now();
    for (const point of plan.points) {
        if (point.state.currentPlayer !== point.subjectPlayer) {
            skippedDecisions.push({ decisionId: point.decisionId, reason: 'SUBJECT_NOT_TO_MOVE' });
            continue;
        }
        const legal = new GameEngine(point.state).getLegalActions(point.subjectPlayer)
            .filter(a => a.type !== 'surrender');
        if (legal.length < 2) {
            skippedDecisions.push({ decisionId: point.decisionId, reason: `SINGLE_LEGAL_ACTION(${legal.length})` });
            continue;
        }
        const label = evaluateDecisionPoint(point, cfg);
        labels.push(label);
        appendJsonl(partialFile, [label]);
        if (!cfg.quiet && labels.length % 10 === 0) {
            const elapsed = (Date.now() - evalT0) / 1000;
            log(`[search] ${labels.length} decisions, ${elapsed.toFixed(0)}s elapsed, ` +
                `${(elapsed / labels.length).toFixed(2)}s/decision`);
        }
    }
    if (fs.existsSync(partialFile)) fs.rmSync(partialFile);
    const evalMs = Date.now() - evalT0;
    log(`[search] compared ${labels.length} decisions in ${(evalMs / 1000).toFixed(1)}s ` +
        `(${labels.length ? (evalMs / labels.length / 1000).toFixed(2) : 'n/a'}s/decision)`);

    // ---- determinism -------------------------------------------------------
    let determinismFile: string | null = null;
    let determinismPass: boolean | null = null;
    if (cfg.determinism > 0) {
        const pointById = new Map(plan.points.map(p => [p.decisionId, p]));
        const checks = labels.slice(0, cfg.determinism).map(first => {
            const point = pointById.get(first.decisionId);
            if (!point) return { decisionId: first.decisionId, error: 'POINT_NOT_FOUND' };
            const second = evaluateDecisionPoint(point, cfg);
            const hashA = labelHash(first);
            const hashB = labelHash(second);
            return {
                decisionId: first.decisionId,
                hashA,
                hashB,
                bitIdenticalIgnoringWallClock: hashA === hashB,
                leafValuesA: first.leaves.map(l => l.leaf),
                leafValuesB: second.leaves.map(l => l.leaf),
                deltaQsA: first.leaves.map(l => l.deltaQ),
                deltaQsB: second.leaves.map(l => l.deltaQ),
                engineTransitionsA: first.engineTransitions,
                engineTransitionsB: second.engineTransitions,
            };
        });
        determinismPass = checks.every(c => (c as { bitIdenticalIgnoringWallClock?: boolean }).bitIdenticalIgnoringWallClock === true);
        log(`[determinism] ${checks.length} decisions re-evaluated a second time: ` +
            `${determinismPass ? 'BIT-IDENTICAL (wall clock excluded)' : 'MISMATCH'}`);
        for (const c of checks) {
            const cc = c as { decisionId: string; bitIdenticalIgnoringWallClock?: boolean; deltaQsA?: number[]; deltaQsB?: number[] };
            log(`[determinism]   ${cc.decisionId} equal=${cc.bitIdenticalIgnoringWallClock} ` +
                `dQ=${JSON.stringify(cc.deltaQsA)} vs ${JSON.stringify(cc.deltaQsB)}`);
        }
        determinismFile = path.join(cfg.outDir, `determinism_check${suffix(cfg.tag)}.json`);
        writeJson(determinismFile, {
            schema: 'v12_determinism_check_1',
            generatedAt: new Date().toISOString(),
            method:
                'the same decision points are evaluated a second time by a freshly constructed ' +
                'BattleSearchAI per candidate (same seeds); records are compared by sha256 after ' +
                'zeroing wall-clock fields only',
            wallClockFieldsExcluded: ['wallMs', 'leaves[].wallMs'],
            checks,
            allBitIdentical: determinismPass,
        });
    }

    // ---- policy check ------------------------------------------------------
    const policyChecks: Array<Record<string, unknown>> = [];
    if (cfg.policyCheck > 0) {
        const pointById = new Map(plan.points.map(p => [p.decisionId, p]));
        for (const label of labels.slice(0, cfg.policyCheck)) {
            const point = pointById.get(label.decisionId);
            if (!point) continue;
            const engine = new GameEngine(point.state);
            const pool = engine.getLegalActions(point.subjectPlayer).filter(a => a.type !== 'surrender');
            const ai = new BattleSearchAI(seedFromHash(point.stateHash, cfg.seedBase), {
                topK: cfg.topK, oppProbeK: cfg.oppProbeK, friendlyRolloutSteps: cfg.friendlyRolloutSteps,
                takeoverThreshold: cfg.takeoverThreshold, vetoMargin: cfg.vetoMargin, dangerLine: cfg.dangerLine,
            });
            const t0 = Date.now();
            const real = ai.getAction(engine, point.subjectPlayer, pool);
            const realCode = ai.actionCode(real);
            policyChecks.push({
                decisionId: label.decisionId,
                realPolicyActionCode: realCode,
                heuristicTopActionCode: label.baselineActionCode,
                reconstructedPolicyActionCode: label.policyActionCode,
                realMatchesHeuristicTop: realCode === label.baselineActionCode,
                realMatchesReconstruction: realCode === label.policyActionCode,
                branch: label.policyBranch,
                wallMs: Date.now() - t0,
            });
        }
        const agreeTop = policyChecks.filter(c => c.realMatchesHeuristicTop === true).length;
        const agreeRecon = policyChecks.filter(c => c.realMatchesReconstruction === true).length;
        log(`[policy-check] ${policyChecks.length} decisions: real getAction == heuristic top ` +
            `${agreeTop}/${policyChecks.length}; real == reconstructed ${agreeRecon}/${policyChecks.length}`);
    }

    // ---- aggregates --------------------------------------------------------
    const decisionDeltaQ = labels.map(l => l.deltaQ);
    const nonDegenerate = labels.filter(l => isNonDegenerate(l.distinctLeafValues));
    const nonDegenerateDeltaQ = nonDegenerate.map(l => l.deltaQ);
    const nonZeroDeltaQ = labels.filter(l => l.deltaQ !== 0).map(l => l.deltaQ);
    const candidateDeltaQ: number[] = [];
    for (const l of labels) for (const c of l.leaves) if (c.index !== 0) candidateDeltaQ.push(c.deltaQ);

    const sfx = suffix(cfg.tag);
    const labelsFile = path.join(cfg.outDir, `counterfactual_labels_v2${sfx}.jsonl`);
    const qualityFile = path.join(cfg.outDir, `label_quality_v2${sfx}.json`);
    const prescreenFile = path.join(cfg.outDir, `decision_prescreen${sfx}.json`);
    // For the canonical (main) run, also emit the exact filenames the task asks for.
    const canonicalLabels = path.join(cfg.outDir, 'counterfactual_labels_v2.jsonl');
    const canonicalQuality = path.join(cfg.outDir, 'label_quality_v2.json');
    const canonicalPrescreen = path.join(cfg.outDir, 'decision_prescreen.json');

    writeJsonl(labelsFile, labels);

    // ---- same-footing comparison ------------------------------------------
    // Computed before the reports so the recovered batch-2 subset travels with
    // every artifact that quotes a yield rate.
    let sameFooting: Record<string, unknown> | null = null;
    if (cfg.footingIdsFile && fs.existsSync(cfg.footingIdsFile)) {
        const footingIds = readDecisionIdList(cfg.footingIdsFile);
        const footingSet = new Set(footingIds);
        const inFooting = labels.filter(l => footingSet.has(l.decisionId));
        const previousKeptIds = fs.existsSync('v11/out/counterfactual_labels.jsonl')
            ? readJsonl<{ decisionId: string }>('v11/out/counterfactual_labels.jsonl').map(l => l.decisionId)
            : [];
        const previousKeptSet = new Set(previousKeptIds);
        const previouslyKeptHere = labels.filter(l => previousKeptSet.has(l.decisionId));
        sameFooting = {
            footingIdsFile: cfg.footingIdsFile,
            footingDecisionsRequested: footingIds.length,
            footingDecisionsCompared: inFooting.length,
            footingMissing: footingIds.filter(id => !labels.some(l => l.decisionId === id)),
            footingNonDegenerate: inFooting.filter(l => isNonDegenerate(l.distinctLeafValues)).length,
            footingYieldRate: ratio(inFooting.filter(l => isNonDegenerate(l.distinctLeafValues)).length, inFooting.length).value,
            footingNonZeroDeltaQ: inFooting.filter(l => l.deltaQ !== 0).length,
            footingYieldRateNonZeroDeltaQ: ratio(inFooting.filter(l => l.deltaQ !== 0).length, inFooting.length).value,
            footingDistinctDeltaValues: summarize(inFooting.map(l => l.deltaQ)).distinct,
            footingDistinctDeltaValuesNonZero: summarize(inFooting.filter(l => l.deltaQ !== 0).map(l => l.deltaQ)).distinct,
            footingHistogram: histogram(inFooting.map(l => l.deltaQ), 20),
            previousBatchKeptIds: previousKeptIds.length,
            previouslyKeptDecisionsReproduced: previouslyKeptHere.length,
            previouslyKeptNewDeltaQ: previouslyKeptHere.map(l => ({
                decisionId: l.decisionId, deltaQ: l.deltaQ, distinctLeafValues: l.distinctLeafValues,
                labelQuality: l.labelQuality,
            })),
            note:
                'The batch-2 label file published 8 kept decision ids; the 40 compared decision ids were ' +
                'recovered by matching the published ids against deterministic re-samples of the same ' +
                'episodes file (see b2_recovered_decision_ids.json). Decisions listed in ' +
                '`footingMissing` were not reproducible in this run.',
        };
    }

    const branchCounts: Record<string, number> = {};
    const qualityCounts: Record<string, number> = {};
    const byRootFamily: Record<string, number> = {};
    const byMap: Record<string, number> = {};
    for (const l of labels) {
        branchCounts[l.policyBranch] = (branchCounts[l.policyBranch] ?? 0) + 1;
        qualityCounts[l.labelQuality] = (qualityCounts[l.labelQuality] ?? 0) + 1;
        byRootFamily[l.rootFamilyId] = (byRootFamily[l.rootFamilyId] ?? 0) + 1;
        byMap[l.mapName] = (byMap[l.mapName] ?? 0) + 1;
    }

    const deltaSummary = summarize(decisionDeltaQ);
    const nonDegenerateSummary = summarize(nonDegenerateDeltaQ);
    const nonZeroSummary = summarize(nonZeroDeltaQ);
    const candidateSummary = summarize(candidateDeltaQ);
    const totalTransitions = labels.reduce((n, l) => n + l.engineTransitions, 0);
    const totalLeafEvals = labels.reduce((n, l) => n + l.leaves.length, 0);
    const totalWallMs = labels.reduce((n, l) => n + l.wallMs, 0);

    const qualityReport = {
        schema: 'v12_label_quality_2',
        generatedAt: new Date().toISOString(),
        tag: cfg.tag,
        provenance: provenanceString(cfg),
        config: {
            episodesFile: cfg.episodesFile,
            maxEpisodes: cfg.maxEpisodes,
            decisionsPerEpisode: cfg.decisionsPerEpisode,
            minStepFraction: cfg.minStepFraction,
            maxStepFraction: cfg.maxStepFraction,
            plan: cfg.plan,
            idsFile: cfg.idsFile,
            limit: cfg.limit,
            maxCandidates: cfg.maxCandidates,
            topK: cfg.topK,
            seedBase: cfg.seedBase,
            search: {
                oppProbeK: cfg.oppProbeK, friendlyRolloutSteps: cfg.friendlyRolloutSteps,
                takeoverThreshold: cfg.takeoverThreshold, vetoMargin: cfg.vetoMargin, dangerLine: cfg.dangerLine,
            },
        },
        sample: {
            episodesUsed: plan.episodesUsed,
            episodesSkipped: plan.episodesSkipped.length,
            skippedEpisodes: plan.episodesSkipped,
            decisionPointsPlanned: plan.points.length,
            decisionsCompared: labels.length,
            decisionsSkipped: skippedDecisions.length,
            skippedDecisions,
            planMs,
        },
        yield: {
            decisionsKeptNonDegenerate: nonDegenerate.length,
            decisionsDroppedDegenerate: labels.length - nonDegenerate.length,
            yieldRate: ratio(nonDegenerate.length, labels.length).value,
            fractionAllCandidatesTie: ratio(labels.length - nonDegenerate.length, labels.length).value,
            // The batch-2 criterion: a label was kept only when some candidate beat
            // the baseline, i.e. dQ != 0. This is the like-for-like number.
            decisionsWithNonZeroDeltaQ: nonZeroDeltaQ.length,
            yieldRateNonZeroDeltaQ: ratio(nonZeroDeltaQ.length, labels.length).value,
            marginZeroBreakdown: {
                allCandidatesTie: labels.length - nonDegenerate.length,
                baselineAlreadyBest: nonDegenerate.filter(l => l.deltaQ === 0).length,
                totalMarginZero: labels.filter(l => l.deltaQ === 0).length,
            },
            criterionNote:
                'Two different criteria are reported because they answer different questions. ' +
                '(a) "non-degenerate" = the candidate leaves are not all equal; this is what the T12-07 ' +
                'prescreen asks for. (b) "dQ != 0" = some candidate beats the heuristic baseline; this is ' +
                'exactly the v11 batch-2 keep rule, so it is the like-for-like comparison against 20%. ' +
                'A decision whose candidates differ but whose baseline is already the maximin-best one has ' +
                'dQ = 0 and would have been dropped by batch-2 as uninformative, even though it now carries ' +
                'a graded candidate ordering.',
        },
        effectSize: {
            headline: 'decision-level dQ = bestLeaf - leaf(a0)',
            distinctDeltaValues: deltaSummary.distinct,
            allDeltasEqual: deltaSummary.distinct <= 1,
            deltaValuesExact: exactValueCounts(decisionDeltaQ, 6, 40),
            summaryAll: deltaSummary,
            histogramAll: histogram(decisionDeltaQ, 20),
            summaryNonDegenerateOnly: nonDegenerateSummary,
            histogramNonDegenerateOnly: histogram(nonDegenerateDeltaQ, 20),
            summaryNonZeroOnly: nonZeroSummary,
            histogramNonZeroOnly: histogram(nonZeroDeltaQ, 20),
            distinctDeltaValuesNonZero: nonZeroSummary.distinct,
            candidateLevelPooled: {
                note: 'all non-baseline candidate dQ values pooled across every decision; this is the ' +
                    'raw signal a ranker would train on',
                summary: candidateSummary,
                histogram: histogram(candidateDeltaQ, 20),
            },
        },
        labelQualityMix: qualityCounts,
        branchMix: branchCounts,
        byRootFamily,
        byMap,
        candidateBreadth: {
            legalActions: summarize(labels.map(l => l.legalActionCount)),
            evaluatedCandidates: summarize(labels.map(l => l.evaluatedCandidateCount)),
            decisionsWithSingleEvaluatedCandidate: labels.filter(l => l.evaluatedCandidateCount <= 1).length,
        },
        cost: {
            wallMsTotal: totalWallMs,
            searchSecondsTotal: Number((totalWallMs / 1000).toFixed(2)),
            secondsPerComparedDecision: labels.length ? Number((totalWallMs / labels.length / 1000).toFixed(3)) : null,
            leafEvalsTotal: totalLeafEvals,
            secondsPerLeafEval: totalLeafEvals ? Number((totalWallMs / totalLeafEvals / 1000).toFixed(3)) : null,
            engineTransitionsTotal: totalTransitions,
            engineTransitionsPerDecision: labels.length ? Number((totalTransitions / labels.length).toFixed(1)) : 0,
            engineTransitionsPerLeafEval: totalLeafEvals ? Number((totalTransitions / totalLeafEvals).toFixed(1)) : 0,
        },
        comparisonToPreviousBatch: {
            previous: PREVIOUS_BATCH,
            thisRun: {
                decisionsCompared: labels.length,
                distinctDeltaValues: deltaSummary.distinct,
                distinctDeltaValuesNonZero: nonZeroSummary.distinct,
                yieldRate: ratio(nonDegenerate.length, labels.length).value,
                yieldRateNonZeroDeltaQ: ratio(nonZeroDeltaQ.length, labels.length).value,
                secondsPerComparedDecision: labels.length ? Number((totalWallMs / labels.length / 1000).toFixed(3)) : null,
                valueScale: 'evaluatePositionHeuristic units (hundreds..thousands, +/-100000 terminals)',
                previousValueScale: 'tanh of a {-1,0,+1} terminal payoff, range [-1, 1]',
            },
            comparability:
                'Same episodes file and the SAME v11 sampling machinery. Whether the sampled positions ' +
                'coincide with the batch-2 positions is reported separately under sameFooting.',
        },
        sameFooting,
        invocation: `node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs ` +
            `v12/tools/search_labels.ts ${process.argv.slice(2).join(' ')}`,
        verificationBoundary: [
            'Q_ref is a PROXY REFERENCE from a bounded heuristic maximin search, NOT a win probability.',
            'It is NOT calibrated against natural terminals and NOT optimal Q.',
            'It is keyed to the evaluatePositionHeuristic score scale and must NOT be added raw to ' +
                'heuristic scores; any combination requires normalisation and calibration first.',
            'A DEGENERATE decision (every candidate leaf equal) carries no ranking information and is dropped.',
        ],
    };
    writeJson(qualityFile, qualityReport);

    // ---- prescreen ---------------------------------------------------------
    const labels_ = labels;
    const predicates: PrescreenPredicateReport[] = [
        predicateReport({
            id: 'margin_band',
            definition: `0 < |margin| < takeoverThreshold(${cfg.takeoverThreshold})`,
            evaluableBeforeSearch: false,
            labels: labels_,
            keep: l => inMarginBand(l.margin, cfg.takeoverThreshold),
            note: 'margin is the same quantity the search computes to decide a takeover, so this band is ' +
                '"the search almost overrode but did not". It is only available AFTER the leaves exist.',
        }),
        predicateReport({
            id: 'margin_band_or_danger',
            definition: `0 < |margin| < takeoverThreshold(${cfg.takeoverThreshold}) OR baselineLeaf <= dangerLine(${cfg.dangerLine})`,
            evaluableBeforeSearch: false,
            labels: labels_,
            keep: l => inMarginBand(l.margin, cfg.takeoverThreshold) || l.dangerousBaseline,
            note: 'adds the danger flag BattleSearchAI already evaluates internally.',
        }),
        predicateReport({
            id: 'heuristic_score_gap_nonzero',
            definition: 'heuristic top-1 score != heuristic top-2 score (cheap, pre-search)',
            evaluableBeforeSearch: true,
            labels: labels_,
            keep: l => l.heuristicScoreGap !== null && l.heuristicScoreGap !== 0,
            note: 'only requires HeuristicAI.scoreCandidateActions, i.e. no search at all.',
        }),
        predicateReport({
            id: 'candidate_count_at_least_3',
            definition: 'at least 3 legal non-surrender actions (cheap, pre-search)',
            evaluableBeforeSearch: true,
            labels: labels_,
            keep: l => l.legalActionCount >= 3,
            note: 'a decision with 2 legal actions has at most 2 distinct leaves; breadth is a hard ceiling ' +
                'on the number of distinct dQ values.',
        }),
    ];

    const prescreenReport = {
        schema: 'v12_decision_prescreen_1',
        generatedAt: new Date().toISOString(),
        tag: cfg.tag,
        decisionsCompared: labels.length,
        baselineYield: {
            definition: 'a decision yields iff its candidates do not all share one leaf value',
            nonDegenerate: nonDegenerate.length,
            total: labels.length,
            yieldRate: ratio(nonDegenerate.length, labels.length).value,
            previousBatchYieldRate: PREVIOUS_BATCH.yieldRate,
            absoluteChange: Number((ratio(nonDegenerate.length, labels.length).value - PREVIOUS_BATCH.yieldRate).toFixed(6)),
            // Like-for-like with v11 batch-2, whose keep rule was "some candidate beat the baseline".
            nonZeroDeltaQ: nonZeroDeltaQ.length,
            yieldRateNonZeroDeltaQ: ratio(nonZeroDeltaQ.length, labels.length).value,
            absoluteChangeNonZeroDeltaQ:
                Number((ratio(nonZeroDeltaQ.length, labels.length).value - PREVIOUS_BATCH.yieldRate).toFixed(6)),
            criterionNote:
                'The v11 batch-2 keep rule was "some candidate separated from the baseline", i.e. dQ != 0, ' +
                'which is the `yieldRateNonZeroDeltaQ` row. The `yieldRate` row is the weaker ' +
                '"candidates do not all tie" criterion that the T12-07 prescreen is stated against. ' +
                'Both are reported so the comparison cannot be read as one number doing two jobs.',
        },
        predicates,
        branchMix: {
            reconstructedExternally: branchCounts,
            note:
                'BattleSearchAI v3 at HEAD (9c6c1ab) exposes NO `stats` field: `decisions / urgentHits / ' +
                'forcedWins / takeovers / vetos / follows` do not exist in src/game/ai/battle_search_ai.ts. ' +
                'The counts below are reconstructed externally, from the same thresholds and the same ' +
                'branch order, over the leaves this run measured; they are not read from an internal counter.',
            perBranch: Object.entries(branchCounts).map(([branch, count]) => {
                const subset = labels.filter(l => l.policyBranch === branch);
                return {
                    branch,
                    count,
                    nonDegenerate: subset.filter(l => isNonDegenerate(l.distinctLeafValues)).length,
                    yieldRate: ratio(subset.filter(l => isNonDegenerate(l.distinctLeafValues)).length, subset.length).value,
                    meanMargin: subset.length ? Number((subset.reduce((n, l) => n + l.margin, 0) / subset.length).toFixed(3)) : 0,
                    wallMsTotal: subset.reduce((n, l) => n + l.wallMs, 0),
                };
            }),
        },
        sameFooting,
        policyCheck: {
            requested: cfg.policyCheck,
            checked: policyChecks.length,
            realMatchesHeuristicTop: ratio(
                policyChecks.filter(c => c.realMatchesHeuristicTop === true).length, policyChecks.length).value,
            realMatchesReconstruction: ratio(
                policyChecks.filter(c => c.realMatchesReconstruction === true).length, policyChecks.length).value,
            mismatches: policyChecks.filter(c => c.realMatchesReconstruction !== true),
            method:
                'a fresh BattleSearchAI(seed=seedFromHash(stateHash)) runs the real getAction on the same ' +
                'state; its returned action code is compared with the heuristic top and with this tool\'s ' +
                'external branch reconstruction',
        },
        wallClock: {
            allDecisionsMs: labels.reduce((n, l) => n + l.wallMs, 0),
            note:
                'The margin/danger predicates need the leaf values, so they cannot skip the search itself. ' +
                'What they save is the downstream cost (continuation, ranking, fitting) on decisions that ' +
                'are dropped. `wallMsOutside` on a margin-band predicate is therefore the search cost that a ' +
                'PREVIOUS-ROUND band would have avoided, and `wallMsPerKeptDecision` is the search cost of ' +
                'the decisions a kept-only workflow would still pay.',
        },
        determinism: determinismPass === null ? { checked: false } : {
            checked: true,
            decisions: Math.min(cfg.determinism, labels.length),
            allBitIdenticalIgnoringWallClock: determinismPass,
            file: determinismFile,
        },
        verificationBoundary: qualityReport.verificationBoundary,
    };
    writeJson(prescreenFile, prescreenReport);

    if (cfg.tag === 'main') {
        writeJsonl(canonicalLabels, labels);
        writeJson(canonicalQuality, qualityReport);
        writeJson(canonicalPrescreen, prescreenReport);
    }

    // ---- stdout ------------------------------------------------------------
    const dq = decisionDeltaQ;
    const h = histogram(dq, 20);
    const maxCount = h.bins.reduce((m, b) => Math.max(m, b.count), 0);
    console.log('');
    console.log('============================================================');
    console.log(`  v12 continuous proxy-Q labels  (tag=${cfg.tag})`);
    console.log('============================================================');
    console.log(`provenance        : ${provenanceString(cfg)}`);
    console.log(`episodes loaded   : ${plan.episodesUsed}  (skipped ${plan.episodesSkipped.length})`);
    console.log(`decisions compared: ${labels.length}   (planned ${plan.points.length}, skipped ${skippedDecisions.length})`);
    console.log(`leaf evaluations  : ${totalLeafEvals}`);
    console.log(`search cost       : ${(totalWallMs / 1000).toFixed(1)}s total, ` +
        `${labels.length ? (totalWallMs / labels.length / 1000).toFixed(2) : 'n/a'}s/decision, ` +
        `${totalLeafEvals ? (totalWallMs / totalLeafEvals / 1000).toFixed(2) : 'n/a'}s/leaf-eval`);
    console.log(`engine transitions: ${totalTransitions} (${labels.length ? (totalTransitions / labels.length).toFixed(1) : 0}/decision)`);
    console.log('');
    console.log(`distinct dQ values (decision level) : ${deltaSummary.distinct}   ` +
        `[previous batch: ${PREVIOUS_BATCH.distinctDeltaValues}]`);
    console.log(`  ... over dQ != 0 only (batch-2 keep rule): ${nonZeroSummary.distinct}`);
    console.log(`yield rate (non-degenerate)         : ${(ratio(nonDegenerate.length, labels.length).value * 100).toFixed(1)}%   ` +
        `[previous batch: ${(PREVIOUS_BATCH.yieldRate * 100).toFixed(1)}%]`);
    console.log(`yield rate (dQ != 0, same rule as batch-2): ${(ratio(nonZeroDeltaQ.length, labels.length).value * 100).toFixed(1)}%   ` +
        `[previous batch: ${(PREVIOUS_BATCH.yieldRate * 100).toFixed(1)}%]`);
    console.log(`all candidates tie                  : ${labels.length - nonDegenerate.length}/${labels.length}`);
    console.log('');
    console.log(`dQ summary (all ${dq.length} decisions): min=${deltaSummary.min} max=${deltaSummary.max} ` +
        `mean=${deltaSummary.mean} sd=${deltaSummary.stdDev} median=${deltaSummary.median}`);
    console.log(`dQ summary (non-degenerate only, n=${nonDegenerate.length}): min=${nonDegenerateSummary.min} ` +
        `max=${nonDegenerateSummary.max} mean=${nonDegenerateSummary.mean} sd=${nonDegenerateSummary.stdDev}`);
    console.log(`dQ summary (dQ != 0 only, n=${nonZeroSummary.count}): min=${nonZeroSummary.min} ` +
        `max=${nonZeroSummary.max} mean=${nonZeroSummary.mean} sd=${nonZeroSummary.stdDev} distinct=${nonZeroSummary.distinct}`);
    console.log(`pooled candidate dQ (n=${candidateSummary.count}): distinct=${candidateSummary.distinct} ` +
        `min=${candidateSummary.min} max=${candidateSummary.max} mean=${candidateSummary.mean}`);
    console.log('');
    console.log('dQ histogram (20 bins over [min,max])');
    h.bins.forEach(b => {
        console.log(`  [${String(b.lo).padStart(10)}, ${String(b.hi).padStart(10)})  ${String(b.count).padStart(4)}  ${renderBar(b.count, maxCount)}`);
    });
    console.log('');
    console.log('exact dQ values (top 10 by count)');
    exactValueCounts(dq, 6, 10).forEach(v => console.log(`  ${String(v.value).padStart(12)}  x${v.count}`));
    console.log('');
    console.log(`label quality mix : ${JSON.stringify(qualityCounts)}`);
    console.log(`policy branch mix : ${JSON.stringify(branchCounts)}`);
    console.log('');
    console.log('prescreen predicates');
    for (const p of predicates) {
        console.log(`  ${p.id.padEnd(28)} kept ${String(p.kept).padStart(3)}/${p.total}  ` +
            `yieldIn=${(p.yieldRateInside * 100).toFixed(1)}% yieldOut=${(p.yieldRateOutside * 100).toFixed(1)}%  ` +
            `precision=${(p.precision.value * 100).toFixed(1)}% recall=${(p.recall.value * 100).toFixed(1)}%  ` +
            `preSearch=${p.evaluableBeforeSearch}`);
    }
    if (policyChecks.length > 0) {
        console.log('');
        console.log(`policy check      : real getAction == heuristic top ` +
            `${policyChecks.filter(c => c.realMatchesHeuristicTop === true).length}/${policyChecks.length}; ` +
            `real == reconstruction ${policyChecks.filter(c => c.realMatchesReconstruction === true).length}/${policyChecks.length}`);
    }
    if (determinismPass !== null) {
        console.log('');
        console.log(`determinism       : ${determinismPass ? 'PASS (bit-identical, wall clock excluded)' : 'FAIL'}`);
    }
    if (sameFooting) {
        console.log('');
        console.log(`same-footing      : ${sameFooting.footingDecisionsCompared}/${sameFooting.footingDecisionsRequested} ` +
            `batch-2 decisions reproduced, yield ${((sameFooting.footingYieldRate as number) * 100).toFixed(1)}%, ` +
            `distinct dQ ${sameFooting.footingDistinctDeltaValues}`);
        console.log(`                    ${sameFooting.previouslyKeptDecisionsReproduced}/${sameFooting.previousBatchKeptIds} ` +
            'previously-kept batch-2 decisions present in this run');
    }
    console.log('');
    console.log(`wrote ${labelsFile}`);
    console.log(`wrote ${qualityFile}`);
    console.log(`wrote ${prescreenFile}`);
    if (cfg.tag === 'main') {
        console.log(`wrote ${canonicalLabels} (canonical copy)`);
        console.log(`wrote ${canonicalQuality} (canonical copy)`);
        console.log(`wrote ${canonicalPrescreen} (canonical copy)`);
    }

    return { labelsFile, qualityFile, prescreenFile, determinismFile, labels };
}

/** Read back a label file (used by the report builder and by ad-hoc analysis). */
export function readSearchLabels(file: string): SearchLabel[] {
    return readJsonl<SearchLabel>(file);
}

export function readJsonReport<T>(file: string): T {
    return readJson<T>(file);
}

// Entry point. `run-tool.mjs` rewrites argv to [node, <resolved tool path>, ...args].
if ((process.argv[1] ?? '').endsWith('search_labels.ts')) {
    runSearchLabels(parseArgs(process.argv.slice(2)));
}
