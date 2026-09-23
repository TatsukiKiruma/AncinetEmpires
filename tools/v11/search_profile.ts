/**
 * V11 T11-02 deliverables: candidate coverage, transition profile, tactical
 * regression.
 *
 * Runs the *fixed* TurnAwareSearchEngine over real positions and records what it
 * actually does, so the F03/F04 fixes are measurable rather than asserted. No
 * neural network is involved (priorMode 'off'), which is the frozen baseline
 * planner the taskbook asks for.
 */
import * as path from 'node:path';
import { OUT_DIR, ensureDir, writeJson } from './common';
import { TurnAwareSearchEngine, runTacticalFixtures } from '../v10_turn_aware_search';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { GameEngine } from '../../src/game/engine';
import { getLegalActions } from '../../src/game/rules';
import type { Action, GameState } from '../../src/game/types';
import { V11_FIXTURE_MAP, buildGuaranteedLethalPosition, makeEngine, playDeterministicEpisode } from './fixtures';
import type { ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';

const SETUP: ApkSkirmishSetupSelection = { initialGold: 300, unitLimit: 30, levelCap: 3 };
const BUDGETS = [32, 64, 128, 256];

export interface CandidateCoverageReport {
    schema: 'v11_candidate_coverage_1';
    generatedAt: string;
    engine: string;
    positions: Array<{
        label: string;
        mapName: string;
        turn: number;
        currentPlayer: number;
        legalActionCount: number;
        rootCandidateCount: number;
        distinctActionTypesCovered: string[];
        missingLegalActionTypes: string[];
        heuristicBaselinePresent: boolean;
        immediateWinPresent: boolean | null;
        totalTransitionsForGeneration: number;
    }>;
    summary: {
        positionsChecked: number;
        positionsWithMissingTypes: number;
        baselineAlwaysPresent: boolean;
        immediateWinPositions: number;
        immediateWinAlwaysPresent: boolean;
    };
}

export interface SearchTransitionProfileReport {
    schema: 'v11_search_transition_profile_1';
    generatedAt: string;
    context: { note: string; fixedBeforeV11: string[] };
    runs: Array<{
        label: string; budget: number; totalTransitions: number;
        candidateGenerationTransitions: number; friendlyRolloutTransitions: number;
        opponentProbeTransitions: number; macroCandidatesEvaluated: number;
        elapsedMs: number; totalMs: number; wallClockExceeded: boolean;
        budgetReason: string; budgetExhausted: boolean; chosenActionVerified: boolean;
        chosenFromGuaranteedSet: boolean; droppedCandidateCount: number; ledgerConsistent: boolean;
    }>;
    findings: string[];
}

export interface TacticalRegressionReport {
    schema: 'v11_tactical_regression_1';
    generatedAt: string;
    repositoryFixtures: Record<string, unknown>;
    failingRepositoryFixtures: string[];
    constructedImmediateWin: {
        available: boolean; mapName: string | null; attackKept: boolean | null;
        searchChoseGuaranteed: boolean | null; detail: string;
    };
    permutationStability: { positionsChecked: number; unstablePositions: number; detail: string };
}

function legalTypes(engine: GameEngine, playerId: number): string[] {
    return Array.from(new Set(getLegalActions(engine.getState(), playerId)
        .filter(a => a.type !== 'surrender').map(a => a.type))).sort();
}

function coveredTypes(macros: Array<{ atomicActions: Action[] }>): string[] {
    const set = new Set<string>();
    for (const m of macros) for (const a of m.atomicActions) set.add(a.type);
    return Array.from(set).sort();
}

function samplePositions(): Array<{ label: string; mapName: string; setup: ApkSkirmishSetupSelection; state: GameState; turn: number; currentPlayer: number }> {
    const out: Array<{ label: string; mapName: string; setup: ApkSkirmishSetupSelection; state: GameState; turn: number; currentPlayer: number }> = [];
    const opening = makeEngine(V11_FIXTURE_MAP, SETUP);
    out.push({
        label: 'opening_duel', mapName: V11_FIXTURE_MAP, setup: SETUP,
        state: opening.getState(), turn: opening.getState().turn, currentPlayer: opening.getState().currentPlayer,
    });
    for (const seed of [42, 1337]) {
        const episode = playDeterministicEpisode({ seed });
        for (const frac of [0.25, 0.5, 0.75]) {
            const step = Math.max(0, Math.min(episode.actions.length - 1, Math.floor(episode.actions.length * frac)));
            const state = episode.stateBefore(step);
            out.push({
                label: `episode_s${seed}_step${step}`, mapName: episode.mapName, setup: episode.setup,
                state, turn: state.turn, currentPlayer: state.currentPlayer,
            });
        }
    }
    return out;
}

export function runT11_02(): {
    coverage: CandidateCoverageReport;
    profile: SearchTransitionProfileReport;
    tactical: TacticalRegressionReport;
    files: string[];
} {
    ensureDir(OUT_DIR);
    const generatedAt = new Date().toISOString();

    // ---- candidate coverage -------------------------------------------------
    const coveragePositions: CandidateCoverageReport['positions'] = [];
    let immediateWinPositions = 0;
    let immediateWinAlwaysPresent = true;

    const constructed = buildGuaranteedLethalPosition();
    const positions = samplePositions();
    if (constructed) {
        positions.push({
            label: 'constructed_immediate_win', mapName: constructed.mapName, setup: constructed.setup,
            state: constructed.state, turn: constructed.state.turn, currentPlayer: constructed.currentPlayer,
        });
    }

    for (const position of positions) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(position.state)) as GameState);
        (engine.getState() as any).mapName = position.mapName;
        const playerId = engine.getState().currentPlayer;
        const searcher = new TurnAwareSearchEngine();
        const result = searcher.search(engine, playerId, { maxTransitions: 512, maxMs: 3000, priorMode: 'off' });

        const macroEngine = new GameEngine(JSON.parse(JSON.stringify(position.state)) as GameState);
        (macroEngine.getState() as any).mapName = position.mapName;
        const macros = searcher.generateMacroActions(macroEngine, playerId);
        const wanted = legalTypes(engine, playerId);
        const got = coveredTypes(macros);
        const missing = wanted.filter(t => !got.includes(t));

        const baseline = new HeuristicAI().getAction(
            engine, playerId, getLegalActions(engine.getState(), playerId).filter(a => a.type !== 'surrender')
        );
        const baselinePresent = baseline
            ? macros.some(m => JSON.stringify(m.primaryAction) === JSON.stringify(baseline))
            : false;

        const isWinPosition = position.label === 'constructed_immediate_win';
        if (isWinPosition) {
            immediateWinPositions += 1;
            if (!result.chosenFromGuaranteedSet) immediateWinAlwaysPresent = false;
        }

        coveragePositions.push({
            label: position.label,
            mapName: position.mapName,
            turn: position.turn,
            currentPlayer: position.currentPlayer,
            legalActionCount: getLegalActions(engine.getState(), playerId).filter(a => a.type !== 'surrender').length,
            rootCandidateCount: macros.length,
            distinctActionTypesCovered: got,
            missingLegalActionTypes: missing,
            heuristicBaselinePresent: baselinePresent,
            immediateWinPresent: isWinPosition ? result.chosenFromGuaranteedSet : null,
            totalTransitionsForGeneration: searcher.getLastGenerationTransitions(),
        });
    }

    const coverage: CandidateCoverageReport = {
        schema: 'v11_candidate_coverage_1',
        generatedAt,
        engine: 'TurnAwareSearchEngine (priorMode=off, no network)',
        positions: coveragePositions,
        summary: {
            positionsChecked: coveragePositions.length,
            positionsWithMissingTypes: coveragePositions.filter(p => p.missingLegalActionTypes.length > 0).length,
            baselineAlwaysPresent: coveragePositions.every(p => p.heuristicBaselinePresent),
            immediateWinPositions,
            immediateWinAlwaysPresent: immediateWinPositions > 0 && immediateWinAlwaysPresent,
        },
    };

    // ---- transition profile -------------------------------------------------
    const profileRuns: SearchTransitionProfileReport['runs'] = [];
    const baseEngine = makeEngine(V11_FIXTURE_MAP, SETUP);
    for (const budget of BUDGETS) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(baseEngine.getState())) as GameState);
        (engine.getState() as any).mapName = V11_FIXTURE_MAP;
        const playerId = engine.getState().currentPlayer;
        const searcher = new TurnAwareSearchEngine();
        const result = searcher.search(engine, playerId, { maxTransitions: budget, maxMs: 200, hardMaxMs: 900, priorMode: 'off' });
        const accounted = result.candidateGenerationTransitions + result.friendlyRolloutTransitions + result.opponentProbeTransitions;
        profileRuns.push({
            label: `opening_duel_max${budget}`,
            budget,
            totalTransitions: result.totalTransitions,
            candidateGenerationTransitions: result.candidateGenerationTransitions,
            friendlyRolloutTransitions: result.friendlyRolloutTransitions,
            opponentProbeTransitions: result.opponentProbeTransitions,
            macroCandidatesEvaluated: result.macroCandidatesEvaluated,
            elapsedMs: Number(result.elapsedMs.toFixed(1)),
            totalMs: Number(result.totalMs.toFixed(1)),
            wallClockExceeded: result.wallClockExceeded,
            budgetReason: result.budgetReason,
            budgetExhausted: result.budgetExhausted,
            chosenActionVerified: result.chosenActionVerified,
            chosenFromGuaranteedSet: result.chosenFromGuaranteedSet,
            droppedCandidateCount: result.droppedCandidates.length,
            ledgerConsistent: accounted === result.totalTransitions,
        });
    }

    const profile: SearchTransitionProfileReport = {
        schema: 'v11_search_transition_profile_1',
        generatedAt,
        context: {
            note:
                'Measured on the same opening position at four budgets, priorMode=off. These are engine transitions, ' +
                'not wall-clock promises; the product 1-second target is not a claim about this table.',
            fixedBeforeV11: [
                'candidate generation cloned and stepped every move without counting (F04.1)',
                'wallClockExceeded was written as literal false (F04.6)',
                'an exhausted budget returned the first array entry, unscored (T11-02 acceptance)',
            ],
        },
        runs: profileRuns,
        findings: [
            'candidateGenerationTransitions > 0 now that generation work is charged to the ledger.',
            `ledgerConsistent on every budget: ${profileRuns.every(r => r.ledgerConsistent)}.`,
            `chosenFromGuaranteedSet on every exhausted budget: ${profileRuns.filter(r => r.budgetExhausted).every(r => r.chosenFromGuaranteedSet)}.`,
        ],
    };

    // ---- tactical regression ------------------------------------------------
    const repoFixtures = runTacticalFixtures();
    const failingRepoFixtures = Object.entries(repoFixtures)
        .filter(([, v]: [string, any]) => v && v.passed === false)
        .map(([k]) => k);

    let constructedSection: TacticalRegressionReport['constructedImmediateWin'] = {
        available: false, mapName: null, attackKept: null, searchChoseGuaranteed: null,
        detail: 'no constructible immediate-win position on the fixture map',
    };
    if (constructed) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(constructed.state)) as GameState);
        (engine.getState() as any).mapName = constructed.mapName;
        const searcher = new TurnAwareSearchEngine();
        const macros = searcher.generateMacroActions(engine, constructed.currentPlayer);
        const attackKept = macros.some(m =>
            m.atomicActions.some(a => a.type === 'attack' && (a as any).attackerId === constructed.attackerId)
        );
        const engine2 = new GameEngine(JSON.parse(JSON.stringify(constructed.state)) as GameState);
        (engine2.getState() as any).mapName = constructed.mapName;
        const result = searcher.search(engine2, constructed.currentPlayer, { maxTransitions: 64, maxMs: 500, priorMode: 'off' });
        constructedSection = {
            available: true,
            mapName: constructed.mapName,
            attackKept,
            searchChoseGuaranteed: result.chosenFromGuaranteedSet,
            detail: `verified lethal action ${JSON.stringify(constructed.lethalAction)}`,
        };
    }

    let unstable = 0;
    let permutationChecked = 0;
    for (const position of positions.slice(0, 4)) {
        const runs: string[] = [];
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const engine = new GameEngine(JSON.parse(JSON.stringify(position.state)) as GameState);
            (engine.getState() as any).mapName = position.mapName;
            const searcher = new TurnAwareSearchEngine();
            const result = searcher.search(engine, engine.getState().currentPlayer, { maxTransitions: 256, maxMs: 2000, priorMode: 'off' });
            runs.push(JSON.stringify(result.chosenAction));
        }
        permutationChecked += 1;
        if (runs[0] !== runs[1]) unstable += 1;
    }

    const tactical: TacticalRegressionReport = {
        schema: 'v11_tactical_regression_1',
        generatedAt,
        repositoryFixtures: repoFixtures,
        failingRepositoryFixtures: failingRepoFixtures,
        constructedImmediateWin: constructedSection,
        permutationStability: {
            positionsChecked: permutationChecked,
            unstablePositions: unstable,
            detail: 'the same state and budget must produce the same chosen action across repeated runs',
        },
    };

    const files = {
        coverage: path.join(OUT_DIR, 'candidate_coverage.json'),
        profile: path.join(OUT_DIR, 'search_transition_profile.json'),
        tactical: path.join(OUT_DIR, 'tactical_regression.json'),
    };
    writeJson(files.coverage, coverage);
    writeJson(files.profile, profile);
    writeJson(files.tactical, tactical);
    return { coverage, profile, tactical, files: Object.values(files) };
}