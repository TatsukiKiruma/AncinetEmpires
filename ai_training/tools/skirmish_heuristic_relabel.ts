import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { GameEngine } from '../src/game/engine';
import {
    calculateArmyValue,
    type EnvStepResult,
    type LegalActionEntry
} from '../src/game/env';
import { getAllianceId, getTurnPlayerIds } from '../src/game/rule_config';
import type { GameState } from '../src/game/types';

export type HeuristicRelabelMode = 'none' | 'heuristic' | 'fast-rollout';

export interface HeuristicRelabelOptions {
    mode: HeuristicRelabelMode;
    policies: readonly string[];
    minScoreMargin: number;
    rolloutDepth: number;
    rolloutCandidates: number;
    rolloutWeight: number;
}

export interface RelabelCandidateScore {
    entry: LegalActionEntry;
    teacherScore: number;
    rolloutValue: number | null;
    combinedScore: number;
}

export interface HeuristicRelabelDecision {
    entry: LegalActionEntry;
    originalEntry: LegalActionEntry;
    relabeled: boolean;
    method: HeuristicRelabelMode;
    scoreMargin: number;
    candidates: RelabelCandidateScore[];
}

function getAllianceArmyValue(state: GameState, allianceId: number): number {
    return getTurnPlayerIds(state)
        .filter(playerId => getAllianceId(state, playerId) === allianceId)
        .reduce((sum, playerId) => sum + calculateArmyValue(state, playerId), 0);
}

function evaluateAllianceAdvantage(state: GameState, allianceId: number): number {
    if (state.winner === allianceId) return 1_000_000;
    if (state.winner !== null && state.winner !== -1) return -1_000_000;
    const ownValue = getAllianceArmyValue(state, allianceId);
    const enemyValues = [...new Set(
        getTurnPlayerIds(state)
            .map(playerId => getAllianceId(state, playerId))
            .filter(candidateAlliance => candidateAlliance !== allianceId)
    )].map(candidateAlliance => getAllianceArmyValue(state, candidateAlliance));
    return ownValue - Math.max(0, ...enemyValues);
}

function runFastRollout(
    state: GameState,
    rootPlayerId: number,
    firstAction: LegalActionEntry,
    depth: number
): number {
    const engine = new GameEngine(state);
    const rootAllianceId = getAllianceId(state, rootPlayerId);
    const initialAdvantage = evaluateAllianceAdvantage(state, rootAllianceId);
    engine.step(firstAction.action);
    const policy = new HeuristicAI(() => 0);

    for (let ply = 1; ply < Math.max(1, depth) && !engine.isTerminal(); ply += 1) {
        const currentState = engine.getState();
        const legalActions = engine.getLegalActions(currentState.currentPlayer);
        if (legalActions.length === 0) break;
        const action = policy.getAction(engine, currentState.currentPlayer, legalActions);
        engine.step(action);
    }
    return evaluateAllianceAdvantage(engine.getState(), rootAllianceId) - initialAdvantage;
}

function scoreCandidates(result: EnvStepResult, playerId: number): RelabelCandidateScore[] {
    const entries = result.legalActionEntries.filter(entry => (
        entry.fixedActionIndex !== null && entry.action.type !== 'surrender'
    ));
    const candidates = entries.length > 0
        ? entries
        : result.legalActionEntries.filter(entry => entry.fixedActionIndex !== null);
    const teacher = new HeuristicAI(() => 0);
    const scored = teacher.scoreCandidateActions(
        new GameEngine(result.state),
        playerId,
        candidates.map(entry => entry.action)
    );
    return candidates.map((entry, index) => ({
        entry,
        teacherScore: scored[index]?.score ?? Number.NEGATIVE_INFINITY,
        rolloutValue: null,
        combinedScore: scored[index]?.score ?? Number.NEGATIVE_INFINITY
    }));
}

export function chooseHeuristicTrainingLabel(
    result: EnvStepResult,
    originalActionCode: string,
    policy: string,
    options: HeuristicRelabelOptions
): HeuristicRelabelDecision | null {
    const originalEntry = result.legalActionEntries.find(entry => (
        entry.code === originalActionCode && entry.fixedActionIndex !== null
    ));
    if (!originalEntry) return null;

    const candidates = scoreCandidates(result, result.state.currentPlayer);
    const originalCandidate = candidates.find(candidate => candidate.entry.code === originalActionCode);
    if (!originalCandidate) return null;
    if (options.mode === 'none' || !options.policies.includes(policy)) {
        return {
            entry: originalEntry,
            originalEntry,
            relabeled: false,
            method: 'none',
            scoreMargin: 0,
            candidates
        };
    }

    if (options.mode === 'fast-rollout') {
        const rolloutCandidates = [...candidates]
            .sort((left, right) => right.teacherScore - left.teacherScore)
            .slice(0, Math.max(1, options.rolloutCandidates));
        if (!rolloutCandidates.includes(originalCandidate)) {
            rolloutCandidates.push(originalCandidate);
        }
        for (const candidate of rolloutCandidates) {
            candidate.rolloutValue = runFastRollout(
                result.state,
                result.state.currentPlayer,
                candidate.entry,
                options.rolloutDepth
            );
            candidate.combinedScore = candidate.teacherScore
                + candidate.rolloutValue * options.rolloutWeight;
        }
    }

    const evaluatedCandidates = options.mode === 'fast-rollout'
        ? candidates.filter(candidate => candidate.rolloutValue !== null)
        : candidates;
    const best = evaluatedCandidates.reduce((currentBest, candidate) => (
        candidate.combinedScore > currentBest.combinedScore ? candidate : currentBest
    ), originalCandidate);
    const scoreMargin = best.combinedScore - originalCandidate.combinedScore;
    const shouldRelabel = (
        best.entry.code !== originalActionCode
        && scoreMargin >= Math.max(0, options.minScoreMargin)
    );
    return {
        entry: shouldRelabel ? best.entry : originalEntry,
        originalEntry,
        relabeled: shouldRelabel,
        method: options.mode,
        scoreMargin,
        candidates
    };
}
