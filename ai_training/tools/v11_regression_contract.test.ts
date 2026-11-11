/**
 * V11 regression contract (T11-00 / T11-01 / T11-02).
 *
 * Every assertion drives a real repository module. The tests are written against
 * the *fixed* contract and were first observed failing on the pre-fix
 * implementation; the observed failures are recorded in
 * v11/out/regression_cases.json.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import type { Action, GameState } from '../src/game/types';
import { getLegalActions } from '../src/game/rules';
import type { ApkSkirmishSetupSelection } from '../src/game/apk_skirmish';
import {
    V11_ENCODER_SCHEMA,
    buildInitialSnapshot,
    extractAlignedValueSamples,
    reconstructInitialSnapshot,
    replayEpisode,
    resolveInitialSnapshot,
    v10SetupForSeed,
} from './v11/replay';
import { TurnAwareSearchEngine, runTacticalFixtures } from './v10_turn_aware_search';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import {
    V11_FIXTURE_MAP,
    buildGuaranteedLethalPosition,
    detectLethalRootAction,
    makeEngine,
    playDeterministicEpisode,
} from './v11/fixtures';

const SETUP_DEFAULT: ApkSkirmishSetupSelection = { initialGold: 300, unitLimit: 30, levelCap: 3 };

describe('T11-01 / F01: value samples are aligned to the current engine state', () => {
    it('reports the real turn and candidate list of each sampled state', () => {
        const episode = playDeterministicEpisode({ seed: 42 });
        expect(episode.actions.length).toBeGreaterThan(10);
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const { samples, validation, committed } = extractAlignedValueSamples({
            episodeId: 'fixture_episode_42',
            rootFamilyId: 'root_fixture_42',
            mapName: episode.mapName,
            actions: episode.actions,
            snapshot,
            provenance: 'RECONSTRUCTED_HASH_VERIFIED',
            valueTarget: 1,
            terminationReason: 'FIXTURE',
            policyLabelAllowed: true,
            options: { maxSamplesPerEpisode: 8, hashEveryNSteps: 5 },
        });
        expect(validation.ok).toBe(true);
        expect(committed).toBe(true);
        expect(samples.length).toBeGreaterThan(0);

        // The defect: every sample carried the opening turn and opening board.
        for (const sample of samples) {
            expect(sample.turn).toBe(episode.stateBefore(sample.step).turn);
        }
        const openingTurn = episode.stateBefore(0).turn;
        expect(samples.filter(s => s.turn === openingTurn).length).toBeLessThan(samples.length);
    });

    it('the subject player of a sample is the player who actually acted', () => {
        const episode = playDeterministicEpisode({ seed: 2026 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const { samples } = extractAlignedValueSamples({
            episodeId: 'fixture_episode_2026',
            rootFamilyId: 'root_fixture_2026',
            mapName: episode.mapName,
            actions: episode.actions,
            snapshot,
            provenance: 'RECONSTRUCTED_HASH_VERIFIED',
            valueTarget: -1,
            terminationReason: 'FIXTURE',
            policyLabelAllowed: true,
            options: { maxSamplesPerEpisode: 8 },
        });
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples) {
            expect(sample.subjectPlayer).toBe(episode.actions[sample.step].player);
            expect(sample.encoderSchema).toBe(V11_ENCODER_SCHEMA);
        }
    });
});

describe('T11-01 / F01b: an episode is an all-or-nothing transaction', () => {
    it('a mid-episode illegal action publishes zero samples', () => {
        const episode = playDeterministicEpisode({ seed: 4242 });
        expect(episode.actions.length).toBeGreaterThan(20);
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);

        const broken = episode.actions.map(a => ({ ...a }));
        const injectAt = Math.floor(broken.length / 2);
        broken[injectAt] = {
            ...broken[injectAt],
            action: { type: 'attack', attackerId: '__no_such_unit__', targetId: '__no_such_target__' } as unknown as Action,
        };

        const { samples, validation, committed } = extractAlignedValueSamples({
            episodeId: 'fixture_episode_broken',
            rootFamilyId: 'root_fixture_broken',
            mapName: episode.mapName,
            actions: broken,
            snapshot,
            provenance: 'RECONSTRUCTED_HASH_VERIFIED',
            valueTarget: 1,
            terminationReason: 'FIXTURE',
            policyLabelAllowed: true,
            options: { maxSamplesPerEpisode: 8 },
        });

        expect(committed).toBe(false);
        expect(samples).toEqual([]);
        expect(validation.ok).toBe(false);
        expect(validation.failureStep).toBe(injectAt);
        expect(validation.failureCode).toBe('ILLEGAL_ACTION');
        // The pre-fix extractor kept every prefix sample after `continue`.
        expect(validation.steps.length).toBe(injectAt);
    });

    it('the intact episode commits its samples', () => {
        const episode = playDeterministicEpisode({ seed: 4242 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const { samples, validation, committed } = extractAlignedValueSamples({
            episodeId: 'fixture_episode_intact',
            rootFamilyId: 'root_fixture_intact',
            mapName: episode.mapName,
            actions: episode.actions,
            snapshot,
            provenance: 'RECONSTRUCTED_HASH_VERIFIED',
            valueTarget: 1,
            terminationReason: 'FIXTURE',
            policyLabelAllowed: true,
            options: { maxSamplesPerEpisode: 8 },
        });
        expect(committed).toBe(true);
        expect(validation.ok).toBe(true);
        expect(samples.length).toBeGreaterThan(0);
    });
});

describe('T11-01 / F02: replay inspects engine acceptance, not just exceptions', () => {
    it('rejects a recorded action that is not in the legal set', () => {
        const episode = playDeterministicEpisode({ seed: 42 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const broken = episode.actions.map(a => ({ ...a }));
        broken[5] = {
            ...broken[5],
            action: { type: 'attack', attackerId: '__no_such_unit__', targetId: '__no_such_target__' } as unknown as Action,
        };
        const validation = replayEpisode('broken_5', episode.mapName, broken, snapshot, 'RECONSTRUCTED_HASH_VERIFIED');
        expect(validation.ok).toBe(false);
        expect(validation.failureCode).toBe('ILLEGAL_ACTION');
        expect(validation.failureStep).toBe(5);
        expect(validation.steps.length).toBe(5);
    });

    it('a genuine episode validates end to end', () => {
        const episode = playDeterministicEpisode({ seed: 42 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const validation = replayEpisode('intact', episode.mapName, episode.actions, snapshot, 'RECONSTRUCTED_HASH_VERIFIED');
        expect(validation.ok).toBe(true);
        expect(validation.stepsReplayed).toBe(episode.actions.length);
        expect(validation.hashChecksPerformed).toBeGreaterThan(0);
        expect(validation.naturalTerminal).toBe(episode.terminal);
    });

    it('a tampered snapshot is refused before any action is stepped', () => {
        const episode = playDeterministicEpisode({ seed: 42 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const tampered = JSON.parse(JSON.stringify(snapshot));
        tampered.state.players[0].gold += 50;
        const validation = replayEpisode('tampered', episode.mapName, episode.actions, tampered, 'RECORDED_SNAPSHOT');
        expect(validation.ok).toBe(false);
        expect(validation.failureCode).toBe('STATE_HASH_MISMATCH');
    });
});

describe('T11-01 / F02b: setup variants must be reconstructed, not assumed', () => {
    it('each of the five collector setup variants yields a distinct initial hash', () => {
        const hashes = new Set<string>();
        for (let seed = 9001; seed <= 9005; seed += 1) {
            hashes.add(reconstructInitialSnapshot(V11_FIXTURE_MAP, v10SetupForSeed(seed)).initialStateHash);
        }
        expect(hashes.size).toBe(5);
    });

    it('a non-default-setup recording cannot be proven with the default setup', () => {
        const setup: ApkSkirmishSetupSelection = { initialGold: 700, unitLimit: 70, levelCap: 7 };
        const engine = makeEngine(V11_FIXTURE_MAP, setup);
        const realSnapshot = buildInitialSnapshot(engine.getState(), V11_FIXTURE_MAP, setup);

        const wrong = resolveInitialSnapshot({
            mapName: V11_FIXTURE_MAP,
            recordedInitialStateHash: realSnapshot.initialStateHash,
            setup: undefined,
        });
        expect(wrong.provenance).toBe('UNKNOWN_NOT_PROVEN');
        expect(wrong.snapshot).toBeNull();
        expect(wrong.reason).toContain('mismatch');

        const right = resolveInitialSnapshot({
            mapName: V11_FIXTURE_MAP,
            recordedInitialStateHash: realSnapshot.initialStateHash,
            setup,
        });
        expect(right.provenance).toBe('RECONSTRUCTED_HASH_VERIFIED');
    });

    it('a recorded snapshot is trusted only after its own integrity check', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const snapshot = buildInitialSnapshot(engine.getState(), V11_FIXTURE_MAP, SETUP_DEFAULT);
        expect(resolveInitialSnapshot({ mapName: V11_FIXTURE_MAP, recordedSnapshot: snapshot }).provenance)
            .toBe('RECORDED_SNAPSHOT');

        const corrupted = JSON.parse(JSON.stringify(snapshot));
        corrupted.state.turn = 99;
        expect(resolveInitialSnapshot({ mapName: V11_FIXTURE_MAP, recordedSnapshot: corrupted }).provenance)
            .toBe('UNKNOWN_NOT_PROVEN');
    });
});

describe('T11-02 / F03: root candidate generation keeps base legal actions', () => {
    it('a moved unit that can attack immediately still has that attack as a root candidate', () => {
        const lethal = buildGuaranteedLethalPosition();
        expect(lethal).not.toBeNull();
        expect(detectLethalRootAction(lethal!.state, lethal!.mapName)).toBe(true);

        const engine = new GameEngine(JSON.parse(JSON.stringify(lethal!.state)) as GameState);
        (engine.getState() as any).mapName = lethal!.mapName;
        const searcher = new TurnAwareSearchEngine();
        const macros = searcher.generateMacroActions(engine, lethal!.currentPlayer);

        const attackPrimaries = macros.map(m => m.primaryAction).filter(a => a.type === 'attack');
        expect(attackPrimaries.length).toBeGreaterThan(0);
        expect(attackPrimaries.some(a => (a as any).attackerId === lethal!.attackerId)).toBe(true);

        const result = searcher.search(engine, lethal!.currentPlayer, { maxTransitions: 32, maxMs: 500, priorMode: 'off' });
        expect(result.chosenFromGuaranteedSet || result.chosenActionVerified).toBe(true);
    });

    it('generates a root candidate for every action type the engine offers', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const player = engine.getState().currentPlayer;
        const legals = getLegalActions(engine.getState(), player).filter(a => a.type !== 'surrender');
        const searcher = new TurnAwareSearchEngine();
        const macros = searcher.generateMacroActions(engine, player);

        const covered = new Set<string>();
        for (const m of macros) for (const a of m.atomicActions) covered.add(a.type);
        for (const a of legals) expect(covered.has(a.type)).toBe(true);
    });

    it('never drops the heuristic baseline action from the root candidate set', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const player = engine.getState().currentPlayer;
        const legals = getLegalActions(engine.getState(), player).filter(a => a.type !== 'surrender');
        const baseline = new HeuristicAI().getAction(engine, player, legals);
        expect(baseline).toBeTruthy();

        const searcher = new TurnAwareSearchEngine();
        const macros = searcher.generateMacroActions(engine, player);
        expect(macros.map(m => JSON.stringify(m.primaryAction))).toContain(JSON.stringify(baseline));
    });

    it('survives the repository tactical fixtures', () => {
        const results = runTacticalFixtures();
        const failing = Object.entries(results).filter(([, v]: [string, any]) => v && v.passed === false);
        expect(failing.map(([k]) => k)).toEqual([]);
    });
});

describe('T11-02 / F03b: macro follow-ups stay on the unit that moved', () => {
    it('a chained macro only ever acts with the unit it moved', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const player = engine.getState().currentPlayer;
        const searcher = new TurnAwareSearchEngine();
        const macros = searcher.generateMacroActions(engine, player);
        const chained = macros.filter(m => m.atomicActions.length > 1);
        expect(chained.length).toBeGreaterThan(0);

        for (const macro of chained) {
            const movedUnitId = (macro.atomicActions[0] as any).unitId;
            expect(movedUnitId).toBeTruthy();
            for (const follow of macro.atomicActions.slice(1)) {
                const actorId = (follow as any).unitId ?? (follow as any).attackerId
                    ?? (follow as any).healerId ?? (follow as any).supporterId ?? (follow as any).casterId;
                if (actorId === undefined) continue;
                expect(actorId).toBe(movedUnitId);
            }
        }
    });
});

describe('T11-02 / F04: budget accounting and comparable leaf horizons', () => {
    it('counts the engine transitions burned while generating candidates', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const searcher = new TurnAwareSearchEngine();
        const result = searcher.search(engine, engine.getState().currentPlayer, {
            maxTransitions: 128, maxMs: 300, priorMode: 'off',
        });
        const moveCount = getLegalActions(engine.getState(), engine.getState().currentPlayer)
            .filter(a => a.type === 'move').length;
        expect(moveCount).toBeGreaterThan(0);
        expect(result.candidateGenerationTransitions).toBeGreaterThanOrEqual(moveCount);
        expect(result.totalTransitions).toBeGreaterThanOrEqual(result.candidateGenerationTransitions);
    });

    it('reports honest timeout fields instead of hard-coding false', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const searcher = new TurnAwareSearchEngine();
        const result = searcher.search(engine, engine.getState().currentPlayer, {
            maxTransitions: 4, maxMs: 300, priorMode: 'off',
        });
        const spentMs = Number(result.totalMs ?? 0);
        expect(result.wallClockExceeded).toBe(spentMs >= 300);
        expect(['transition_limit', 'wall_clock_timeout', 'completed']).toContain(result.budgetReason);
    });

    it('returns a verified baseline action when the budget is exhausted', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const player = engine.getState().currentPlayer;
        const legals = getLegalActions(engine.getState(), player).filter(a => a.type !== 'surrender');
        const searcher = new TurnAwareSearchEngine();
        const result = searcher.search(engine, player, { maxTransitions: 1, maxMs: 1, priorMode: 'off' });
        expect(result.chosenAction).toBeTruthy();
        expect(legals.some(a => JSON.stringify(a) === JSON.stringify(result.chosenAction))).toBe(true);
        expect(result.budgetExhausted).toBe(true);
        expect(result.chosenActionVerified).toBe(true);
    });
});

describe('T11-01: truncated episodes keep policy labels but lose value targets', () => {
    it('masks the value target while keeping the policy label', () => {
        const episode = playDeterministicEpisode({ seed: 42, maxSteps: 12 });
        const snapshot = buildInitialSnapshot(episode.initialState, episode.mapName, episode.setup);
        const { samples } = extractAlignedValueSamples({
            episodeId: 'fixture_truncated',
            rootFamilyId: 'root_fixture_truncated',
            mapName: episode.mapName,
            actions: episode.actions,
            snapshot,
            provenance: 'RECONSTRUCTED_HASH_VERIFIED',
            valueTarget: null,
            terminationReason: 'TRUNCATION_STEP_LIMIT',
            policyLabelAllowed: true,
            options: { maxSamplesPerEpisode: 5 },
        });
        expect(samples.length).toBeGreaterThan(0);
        for (const s of samples) {
            expect(s.valueTarget).toBeNull();
            expect(s.valueLossMask).toBe(false);
            expect(s.policyLossMask).toBe(true);
            expect(s.terminationReason).toBe('TRUNCATION_STEP_LIMIT');
        }
    });
});

describe('T11-00: fixtures expose the minimum failure set', () => {
    it('constructs an engine-verified immediate-win position', () => {
        const constructed = buildGuaranteedLethalPosition();
        expect(constructed).not.toBeNull();
        expect(constructed!.lethalAction.type).toBe('attack');
        expect(detectLethalRootAction(constructed!.state, constructed!.mapName)).toBe(true);
    });

    it('the engine really does deep-copy its initial state', () => {
        const engine = makeEngine(V11_FIXTURE_MAP, SETUP_DEFAULT);
        const before = JSON.stringify(engine.getState());
        const legals = getLegalActions(engine.getState(), engine.getState().currentPlayer);
        engine.step(legals[0]);
        expect(JSON.stringify(engine.getState())).not.toBe(before);
        const snapshot = engine.getState();
        snapshot.turn += 100;
        expect(engine.getState().turn).not.toBe(snapshot.turn);
    });
});
