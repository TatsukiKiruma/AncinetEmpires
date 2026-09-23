/**
 * V11 T11-04: the residual planner used by the game-playing arms.
 *
 * Two stages, one candidate set, evaluated ONCE per decision:
 *
 *   stage 1  base planner  : a0 = frozen Heuristic action
 *   stage 2  residual      : build a SMALL candidate set, evaluate each candidate
 *                            under the shared policy / PRNG / budget, score them
 *                            with the ranker, and override a0 only when the
 *                            module has positive evidence.
 *
 * Why one pass matters: an earlier revision compared the candidate set twice
 * (once to score the ranker's proposal, once to confirm the margin). That cost
 * 17 seconds per decision and made the arm comparison quadratic in game length.
 * The counterfactual values needed for the decision are the SAME values the
 * ranker is trained on, so the comparison is performed once and reused.
 *
 * The arms differ in exactly one input - whether a trained ranker is attached:
 *
 *   arm "planner"          : weights = null            -> base planner only
 *   arm "planner_zeroed"   : weights = zeroed ranker   -> must equal "planner"
 *   arm "planner+residual" : weights = trained ranker  -> gated overrides
 *
 * A zeroed ranker yields an all-zero score vector, so no candidate can beat the
 * baseline score and the arm reproduces the no-ranker arm decision-for-decision.
 * That equality is checked explicitly in the ablation report.
 */
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getLegalActions } from '../../src/game/rules';
import type { Action, GameState } from '../../src/game/types';
import { compareDecision, decisionContext, type CounterfactualOptions, type DecisionPoint } from './counterfactual';
import { featurize, scoreCandidate, type RankerWeights } from './ranker';
import { canonicalStateSha256 } from '../../src/game/state_snapshot';
import { V11_HASH } from './replay';
import { fixedRng, seedFromHash } from './counterfactual';

export interface ResidualPlannerOptions {
    searchTransitions: number;
    searchMaxMs: number;
    /** Cost of the single per-decision candidate comparison. */
    compareOptions: CounterfactualOptions;
    /** Minimum confirmed margin before the baseline may be overridden. */
    minDelta: number;
    maxCandidates: number;
}

export const DEFAULT_RESIDUAL_OPTIONS: ResidualPlannerOptions = {
    searchTransitions: Number(process.env.V11_SEARCH_TRANSITIONS ?? 48),
    searchMaxMs: Number(process.env.V11_SEARCH_MAX_MS ?? 250),
    compareOptions: {
        continuationBudget: Number(process.env.V11_CONFIRM_BUDGET ?? 80),
        maxCandidates: Number(process.env.V11_CONFIRM_CANDIDATES ?? 3),
        continuationSeed: Number(process.env.V11_CONTINUATION_SEED ?? 20260924),
    },
    minDelta: Number(process.env.V11_MIN_DELTA ?? 0.02),
    maxCandidates: Number(process.env.V11_CONFIRM_CANDIDATES ?? 3),
};

export interface PlannerDecision {
    action: Action;
    overridden: boolean;
    reason: string;
    margin: number;
    baseValue: number;
    chosenValue: number;
    candidatesConsidered: number;
    engineTransitions: number;
    learningDisabled: boolean;
}

/** Choose an action in `state` for `playerId`. Deterministic per (state, weights). */
export function chooseAction(params: {
    state: GameState;
    mapName: string;
    playerId: number;
    step: number;
    labels: { episodeId: string; rootFamilyId: string; setupId: string; episodeOutcome: number | null };
    weights: RankerWeights | null;
    options?: ResidualPlannerOptions;
}): PlannerDecision {
    const options = params.options ?? DEFAULT_RESIDUAL_OPTIONS;
    const { state, mapName, playerId } = params;

    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    (engine.getState() as any).mapName = mapName;
    const legal = getLegalActions(engine.getState(), playerId).filter(a => a.type !== 'surrender');

    // A deterministic stream for every heuristic this decision constructs.
    // `new HeuristicAI()` alone would default to Math.random and make two runs of
    // the same decision disagree - the defect that confounded the first ablation.
    const decisionSeed = seedFromHash(canonicalStateSha256(engine.getState(), playerId, V11_HASH), 0x5EED);

    // ---- stage 1: frozen base planner -------------------------------------
    const baseAction: Action = legal.length === 0
        ? ({ type: 'end_turn' } as Action)
        : new HeuristicAI(fixedRng(decisionSeed)).getAction(engine, playerId, legal);

    if (!params.weights || legal.length === 0) {
        return {
            action: baseAction,
            overridden: false,
            reason: params.weights ? 'no legal action' : 'learning module disabled (no ranker attached)',
            margin: 0, baseValue: 0, chosenValue: 0, candidatesConsidered: 0,
            engineTransitions: 0, learningDisabled: !params.weights,
        };
    }

    // ---- stage 2: ONE candidate comparison, reused for scoring and margin ---
    const stateHash = canonicalStateSha256(engine.getState(), playerId, V11_HASH);
    const progress = Math.min(1, engine.getState().turn / 25);
    const stage: 'OPENING' | 'MIDGAME' | 'ENDGAME' = progress <= 0.3 ? 'OPENING' : progress > 0.7 ? 'ENDGAME' : 'MIDGAME';
    const point: DecisionPoint = {
        decisionId: `${params.labels.episodeId}_live_${params.step}`,
        episodeId: params.labels.episodeId,
        rootFamilyId: params.labels.rootFamilyId,
        mapName, mapLabel: mapName,
        setupId: params.labels.setupId,
        seed: 0,
        step: params.step,
        turn: engine.getState().turn,
        stage,
        subjectPlayer: playerId,
        stateHash,
        state: engine.getState(),
        episodeOutcome: params.labels.episodeOutcome,
        candidateCategories: [],
    };

    const label = compareDecision(point, {
        ...options.compareOptions,
        maxCandidates: options.maxCandidates,
        // Seeded from the state, so this decision's candidates are scored on the
        // same streams on every run.
        continuationSeed: decisionSeed,
    });

    const context = decisionContext(point.state, playerId, stage, legal.length);
    const scored = label.candidates.map(c => ({
        candidate: c,
        score: scoreCandidate(params.weights!, featurize({
            isBaseline: c.isBaseline ? 1 : 0,
            category: c.category,
            heuristicActionScore: c.heuristicActionScore,
            actionType: c.actionTypes[0] ?? 'end_turn',
            isChain: c.actionTypes.length > 1 ? 1 : 0,
            chainLength: c.actionTypes.length,
            turn: context.turn,
            stage: context.stage,
            legalActionCount: context.legalActionCount,
            playerGold: context.playerGold,
            playerUnitCount: context.playerUnitCount,
            enemyUnitCount: context.enemyUnitCount,
            commanderHpFraction: context.commanderHpFraction,
            enemyCommanderHpFraction: context.enemyCommanderHpFraction,
        })),
    }));

    const baselineEntry = scored.find(s => s.candidate.isBaseline);
    const baselineScore = baselineEntry ? baselineEntry.score : 0;
    const baselineValue = baselineEntry ? baselineEntry.candidate.value : 0;

    // Gate 1: the module must rank a non-baseline candidate strictly above a0.
    // A zeroed ranker produces an all-zero vector, so this never fires for the
    // learning-disabled control.
    const proposed = scored
        .filter(s => !s.candidate.isBaseline && s.candidate.evaluated && s.score > baselineScore)
        .sort((a, b) => b.score - a.score)[0];

    if (!proposed) {
        return {
            action: baseAction, overridden: false,
            reason: 'module proposed no candidate above the baseline',
            margin: 0, baseValue: baselineValue, chosenValue: baselineValue,
            candidatesConsidered: scored.length,
            engineTransitions: label.engineTransitions,
            learningDisabled: false,
        };
    }

    // Gate 2: the SAME comparison must confirm a real margin.
    const margin = proposed.candidate.value - baselineValue;
    const confirmed = margin > options.minDelta;
    const selected = confirmed ? proposed : baselineEntry;
    const action: Action = selected ? (JSON.parse(selected.candidate.actionJson) as Action) : baseAction;

    const legalNow = getLegalActions(engine.getState(), playerId).filter(a => a.type !== 'surrender');
    const isLegal = legalNow.some(a => JSON.stringify(a) === JSON.stringify(action));

    return {
        action: isLegal ? action : baseAction,
        overridden: confirmed && isLegal && !(selected?.candidate.isBaseline ?? true),
        reason: !confirmed
            ? `module proposal not confirmed (margin=${margin.toFixed(4)} <= ${options.minDelta})`
            : isLegal
                ? `confirmed improvement margin=${margin.toFixed(4)}`
                : 'module proposal was not engine-legal; kept baseline',
        margin: Number(margin.toFixed(6)),
        baseValue: baselineValue,
        chosenValue: selected ? selected.candidate.value : baselineValue,
        candidatesConsidered: scored.length,
        engineTransitions: label.engineTransitions,
        learningDisabled: false,
    };
}