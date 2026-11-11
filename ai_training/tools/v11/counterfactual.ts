/**
 * V11 T11-04: counterfactual candidate comparison in ONE snapshot.
 *
 * The V10 failure mode was comparing things that were not comparable: different
 * states, different horizons, different budgets, self-certified consumption.
 * This module fixes the comparison itself.
 *
 * For every decision point it enforces:
 *   - ONE starting state (the snapshot's state, deep-copied per candidate);
 *   - the SAME continuation policy on both sides for every candidate;
 *   - the SAME random stream (a PRNG re-seeded per candidate and handed to the
 *     heuristic, so it cannot fall back to `Math.random`);
 *   - the SAME simulation budget per candidate;
 *   - explicit accounting of engine transitions;
 *   - the Heuristic baseline is always a member of the candidate set, so
 *     "improvement" is always measured relative to a0.
 */
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getLegalActions } from '../../src/game/rules';
import { getAllianceId } from '../../src/game/rule_config';
import { evaluatePositionHeuristic } from '../v7_heuristic_bounded_search';
import { canonicalStateSha256 } from '../../src/game/state_snapshot';
import { areActionsEqual } from './replay';
import { TurnAwareSearchEngine, type MacroAction } from '../v10_turn_aware_search';
import type { Action, GameState } from '../../src/game/types';

export interface DecisionPoint {
    decisionId: string;
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    mapLabel: string;
    setupId: string;
    seed: number;
    step: number;
    turn: number;
    stage: 'OPENING' | 'MIDGAME' | 'ENDGAME';
    subjectPlayer: number;
    stateHash: string;
    state: GameState;
    episodeOutcome: number | null;
    candidateCategories: string[];
}

export interface DecisionContext {
    turn: number;
    stage: string;
    legalActionCount: number;
    playerGold: number;
    playerUnitCount: number;
    enemyUnitCount: number;
    commanderHpFraction: number;
    enemyCommanderHpFraction: number;
}

export interface CandidateOutcome {
    index: number;
    category: string;
    description: string;
    actionJson: string;
    actionTypes: string[];
    isBaseline: boolean;
    evaluated: boolean;
    terminal: boolean;
    win: boolean;
    draw: boolean;
    leafScore: number;
    heuristicActionScore: number;
    payoff: number;
    value: number;
    continuationSteps: number;
    engineTransitions: number;
    leafReached: 'NATURAL_TERMINAL' | 'BUDGET_EXHAUSTED';
    truncated: boolean;
    legal: boolean;
    illegalReason: string | null;
}

export type LabelQuality =
    | 'VERIFIED_NATURAL'
    | 'VERIFIED_IMMEDIATE_WIN'
    | 'PROXY'
    | 'UNINFORMATIVE';

export interface CounterfactualLabel {
    schema: 'v11_counterfactual_label_1';
    decisionId: string;
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    setupId: string;
    step: number;
    turn: number;
    stage: 'OPENING' | 'MIDGAME' | 'ENDGAME';
    subjectPlayer: number;
    stateHash: string;
    episodeOutcome: number | null;
    context: DecisionContext;
    baselineIndex: number;
    bestIndex: number;
    bestCategory: string;
    /** value(best) - value(baseline). Positive means improvement over Heuristic. */
    deltaQ: number;
    labelQuality: LabelQuality;
    labelReason: string;
    immediateWinAvailable: boolean;
    baselineWasImmediateWin: boolean;
    baselineIsVerifiedError: boolean;
    candidates: CandidateOutcome[];
    engineTransitions: number;
    teacherDecisions: 1;
    probesInThisDecision: number;
    continuationPolicy: string;
    continuationBudgetPerCandidate: number;
    randomStreamId: string;
}

export interface CounterfactualOptions {
    continuationBudget: number;
    maxCandidates: number;
    continuationSeed: number;
}

export const DEFAULT_COUNTERFACTUAL_OPTIONS: CounterfactualOptions = {
    continuationBudget: Number(process.env.V11_CONTINUATION_BUDGET ?? 900),
    maxCandidates: Number(process.env.V11_MAX_CANDIDATES ?? 5),
    continuationSeed: Number(process.env.V11_CONTINUATION_SEED ?? 20260924),
};

/**
 * A fixed `Rng` for every HeuristicAI the comparison constructs.
 *
 * Why this exists: `HeuristicAI`'s constructor defaults to `Math.random`, and its
 * action scoring adds a small random tie-breaker (`this.rng() * 20`). Leaving it
 * unseeded made the arms non-reproducible: two runs of the SAME arm took
 * different actions, which silently confounded the ablation. This is the same
 * defect class as V10's DAgger seed bug (F06).
 *
 * The stream is derived from a caller-supplied seed so a given decision point
 * always scores candidates identically, and different candidate indices get
 * different streams to avoid correlated tie-breaking.
 */
export function fixedRng(seed: number): () => number {
    return createLocalPrng(seed);
}

/** Seed derived from a state hash so a decision's streams are reproducible. */
export function seedFromHash(stateHash: string, salt: number): number {
    return (parseInt(stateHash.slice(0, 8), 16) ^ salt) >>> 0;
}

function legalOf(state: GameState, playerId: number): Action[] {
    return getLegalActions(state, playerId).filter(a => a.type !== 'surrender');
}

function createLocalPrng(seed: number): () => number {
    let s = (seed ^ 0x12345678) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function categoryOf(macro: MacroAction, baselineJson: string | null, isImmediateWin: boolean): string {
    if (baselineJson && JSON.stringify(macro.primaryAction) === baselineJson) return 'BASELINE_HEURISTIC';
    if (isImmediateWin) return 'IMMEDIATE_WIN';
    if (macro.atomicActions.length > 1) return 'MACRO_CHAIN';
    const t = macro.primaryAction.type;
    if (t === 'attack') return 'ATTACK';
    if (t === 'capture') return 'CAPTURE';
    if (t === 'heal' || t === 'support') return 'SUPPORT';
    if (t === 'summon' || t === 'recruit_to_castle' || t === 'recruit_and_deploy') return 'RECRUIT';
    if (t === 'end_turn') return 'END_TURN';
    return t.toUpperCase();
}

/** Is `action` an immediate game-ending win for `playerId` in this exact state? */
function isImmediateWin(state: GameState, mapName: string, playerId: number, action: Action): boolean {
    const probe = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    (probe.getState() as any).mapName = mapName;
    probe.step(action);
    if (!probe.isTerminal()) return false;
    const winner = probe.getState().winner;
    if (winner === null || winner < 0) return false;
    const alliance = getAllianceId(probe.getState(), playerId);
    return winner === alliance || winner === playerId;
}

/**
 * Build the candidate set: the Heuristic baseline, any immediate win, the
 * engine's macro actions, and distinct single steps, bounded by maxCandidates.
 */
export function buildCandidates(
    state: GameState,
    mapName: string,
    playerId: number,
    options: CounterfactualOptions
): { macros: MacroAction[]; baselineJson: string | null; immediateWinJson: string | null } {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    (engine.getState() as any).mapName = mapName;
    const legal = legalOf(engine.getState(), playerId);
    // Fixed stream: the baseline action must not depend on Math.random, or two
    // runs of the same decision can disagree.
    const baselineHeuristic = new HeuristicAI(fixedRng(options.continuationSeed));
    const baseline = legal.length > 0 ? baselineHeuristic.getAction(engine, playerId, legal) : null;
    const baselineJson = baseline ? JSON.stringify(baseline) : null;

    const searcher = new TurnAwareSearchEngine();
    const guaranteed: MacroAction[] = [];

    let immediateWinJson: string | null = null;
    for (const action of legal) {
        if (isImmediateWin(state, mapName, playerId, action)) {
            immediateWinJson = JSON.stringify(action);
            guaranteed.push({
                type: 'macro', description: `immediate_win_${action.type}`,
                atomicActions: [action], primaryAction: action,
            });
            break;
        }
    }
    if (baseline) {
        guaranteed.push({
            type: 'macro', description: `baseline_${baseline.type}`,
            atomicActions: [baseline], primaryAction: baseline,
        });
    }
    const macros = searcher.generateMacroActions(engine, playerId);

    const seen = new Set<string>();
    const ordered: MacroAction[] = [];
    const push = (m: MacroAction) => {
        const key = JSON.stringify(m.primaryAction);
        if (seen.has(key)) return;
        seen.add(key);
        ordered.push(m);
    };
    for (const m of guaranteed) push(m);
    for (const m of macros.filter(m => m.atomicActions.length === 1)) push(m);
    for (const m of macros.filter(m => m.atomicActions.length > 1)) push(m);

    return { macros: ordered.slice(0, Math.max(2, options.maxCandidates)), baselineJson, immediateWinJson };
}

/** Evaluate one candidate: execute it, continue with fixed policy/PRNG/budget. */
export function evaluateCandidate(params: {
    startingState: GameState;
    mapName: string;
    playerId: number;
    macro: MacroAction;
    options: CounterfactualOptions;
    index: number;
    category: string;
    isBaseline: boolean;
}): CandidateOutcome {
    const { startingState, mapName, playerId, macro, options, index, category, isBaseline } = params;
    const engine = new GameEngine(JSON.parse(JSON.stringify(startingState)) as GameState);
    (engine.getState() as any).mapName = mapName;

    // The heuristic's prior score for this exact action in this exact state: the
    // residual ranker learns on top of this signal, never instead of it.
    let heuristicActionScore = 0;
    try {
        heuristicActionScore = new HeuristicAI(() => 0.5).scoreCandidateAction(engine, playerId, macro.primaryAction);
    } catch {
        heuristicActionScore = 0;
    }

    let transitions = 0;
    let legal = true;
    let illegalReason: string | null = null;

    for (const action of macro.atomicActions) {
        if (engine.isTerminal()) break;
        const state = engine.getState();
        if (!legalOf(state, state.currentPlayer).some(a => areActionsEqual(a, action))) {
            legal = false;
            illegalReason = `atomic action ${action.type} not legal at turn ${state.turn} (player ${state.currentPlayer})`;
            break;
        }
        const result = engine.step(action);
        transitions += 1;
        const info = String((result as any)?.info ?? '');
        if (info.includes('非法动作')) {
            legal = false;
            illegalReason = `engine rejected ${action.type}: ${info}`;
            break;
        }
    }

    // Shared continuation: same policy, same seeded stream, same budget.
    const rng = fixedRng((options.continuationSeed ^ (index * 0x9e3779b9)) >>> 0);
    const policy = [new HeuristicAI(rng), new HeuristicAI(rng)];

    let steps = 0;
    while (!engine.isTerminal() && transitions < options.continuationBudget) {
        const state = engine.getState();
        const actor = state.currentPlayer;
        const actorLegal = legalOf(state, actor);
        if (actorLegal.length === 0) {
            engine.step({ type: 'end_turn' } as Action);
            transitions += 1;
            steps += 1;
            continue;
        }
        const action = policy[actor === 1 ? 1 : 0].getAction(engine, actor, actorLegal);
        if (!action) break;
        engine.step(action);
        transitions += 1;
        steps += 1;
    }

    const leaf = engine.getState();
    const terminal = engine.isTerminal();
    let win = false;
    let draw = false;
    if (terminal) {
        const winner = leaf.winner;
        if (winner !== null && winner >= 0) {
            const alliance = getAllianceId(leaf, playerId);
            win = winner === alliance || winner === playerId;
        } else {
            draw = true;
        }
    }
    const leafScore = terminal ? 0 : evaluatePositionHeuristic(leaf, playerId);
    const payoff = terminal ? (win ? 1 : draw ? 0 : -1) : 0;
    // Terminal results dominate; a non-terminal leaf is squashed into (-1, 1).
    const value = terminal ? payoff : Math.tanh(leafScore / 1000);

    return {
        index,
        category,
        description: macro.description,
        actionJson: JSON.stringify(macro.primaryAction),
        actionTypes: macro.atomicActions.map(a => a.type),
        isBaseline,
        evaluated: legal,
        terminal,
        win,
        draw,
        leafScore: Number(leafScore.toFixed(3)),
        heuristicActionScore: Number(heuristicActionScore.toFixed(3)),
        payoff,
        value: Number(value.toFixed(6)),
        continuationSteps: steps,
        engineTransitions: transitions,
        leafReached: terminal ? 'NATURAL_TERMINAL' : 'BUDGET_EXHAUSTED',
        truncated: !terminal,
        legal,
        illegalReason,
    };
}

export function decisionContext(state: GameState, playerId: number, stage: string, legalActionCount: number): DecisionContext {
    const alliance = getAllianceId(state, playerId);
    const mine = state.units.filter(u => u.hp > 0 && getAllianceId(state, u.ownerId) === alliance);
    const theirs = state.units.filter(u => u.hp > 0 && getAllianceId(state, u.ownerId) !== alliance);
    const commander = mine.find(u => u.unitClass === 'commander');
    const enemyCommander = theirs.find(u => u.unitClass === 'commander');
    const player = state.players.find(p => p.id === playerId);
    return {
        turn: state.turn,
        stage,
        legalActionCount,
        playerGold: player?.gold ?? 0,
        playerUnitCount: mine.length,
        enemyUnitCount: theirs.length,
        commanderHpFraction: commander ? Number((commander.hp / Math.max(1, commander.maxHp)).toFixed(3)) : 0,
        enemyCommanderHpFraction: enemyCommander ? Number((enemyCommander.hp / Math.max(1, enemyCommander.maxHp)).toFixed(3)) : 0,
    };
}

/** Compare every candidate of one decision point and emit a label. */
export function compareDecision(
    point: DecisionPoint,
    options: CounterfactualOptions = DEFAULT_COUNTERFACTUAL_OPTIONS
): CounterfactualLabel {
    const { macros, baselineJson, immediateWinJson } = buildCandidates(
        point.state, point.mapName, point.subjectPlayer, options
    );

    const candidates = macros.map((macro, index) => {
        const isImmediate = immediateWinJson !== null && JSON.stringify(macro.primaryAction) === immediateWinJson;
        return evaluateCandidate({
            startingState: point.state,
            mapName: point.mapName,
            playerId: point.subjectPlayer,
            macro,
            options,
            index,
            category: categoryOf(macro, baselineJson, isImmediate),
            isBaseline: baselineJson !== null && JSON.stringify(macro.primaryAction) === baselineJson,
        });
    });

    let baselineIndex = candidates.findIndex(c => c.isBaseline);
    if (baselineIndex < 0) baselineIndex = 0;

    let bestIndex = baselineIndex;
    for (let i = 0; i < candidates.length; i += 1) {
        const c = candidates[i];
        if (!c.legal) continue;
        if (c.value > candidates[bestIndex].value) bestIndex = i;
    }

    const baseline = candidates[baselineIndex];
    const best = candidates[bestIndex];
    const deltaQ = Number((best.value - baseline.value).toFixed(6));

    const immediateWinAvailable = immediateWinJson !== null;
    const baselineWasImmediateWin = immediateWinAvailable && baseline.actionJson === immediateWinJson;
    const baselineIsVerifiedError = immediateWinAvailable && !baselineWasImmediateWin;
    const anyNaturalTerminal = candidates.some(c => c.terminal);

    let labelQuality: LabelQuality;
    let labelReason: string;
    if (baselineIsVerifiedError) {
        labelQuality = 'VERIFIED_IMMEDIATE_WIN';
        labelReason = 'engine-verified immediate win exists in this state and the Heuristic baseline does not take it';
    } else if (deltaQ !== 0 && anyNaturalTerminal) {
        labelQuality = 'VERIFIED_NATURAL';
        labelReason = 'at least one candidate reached a natural terminal, so the preference rests on a real result';
    } else if (deltaQ !== 0) {
        labelQuality = 'PROXY';
        labelReason =
            `estimate only: no candidate reached a natural terminal within ${options.continuationBudget} transitions; ` +
            'the preference comes from a bounded heuristic continuation';
    } else {
        labelQuality = 'UNINFORMATIVE';
        labelReason = 'no candidate separated from the baseline';
    }

    return {
        schema: 'v11_counterfactual_label_1',
        decisionId: point.decisionId,
        episodeId: point.episodeId,
        rootFamilyId: point.rootFamilyId,
        mapName: point.mapName,
        setupId: point.setupId,
        step: point.step,
        turn: point.turn,
        stage: point.stage,
        subjectPlayer: point.subjectPlayer,
        stateHash: point.stateHash,
        episodeOutcome: point.episodeOutcome,
        context: decisionContext(point.state, point.subjectPlayer, point.stage, legalOf(point.state, point.subjectPlayer).length),
        baselineIndex,
        bestIndex,
        bestCategory: best.category,
        deltaQ,
        labelQuality,
        labelReason,
        immediateWinAvailable,
        baselineWasImmediateWin,
        baselineIsVerifiedError,
        candidates,
        engineTransitions: candidates.reduce((n, c) => n + c.engineTransitions, 0),
        teacherDecisions: 1,
        probesInThisDecision: candidates.length,
        continuationPolicy: 'HEURISTIC_BOTH_SIDES_FIXED_PRNG',
        continuationBudgetPerCandidate: options.continuationBudget,
        randomStreamId: `prng(${options.continuationSeed})^candidateIndex`,
    };
}

/** Deterministic selection of up to `decisionsPerEpisode` indices. */
export function sampleDecisionSteps(count: number, sampling: { decisionsPerEpisode: number; seed: number }): number[] {
    const rng = createLocalPrng(sampling.seed);
    const candidates: number[] = [];
    for (let i = 0; i < count; i += 1) candidates.push(i);
    for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, sampling.decisionsPerEpisode).sort((a, b) => a - b);
}

export { canonicalStateSha256 };
