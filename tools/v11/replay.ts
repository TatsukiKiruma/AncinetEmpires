/**
 * V11 T11-01: single shared replay + snapshot sampling module.
 *
 * The V10 value extractor, pipeline and loss-ablation tool each re-implemented
 * replay with slightly different (and wrong) rules. This is the only replay
 * implementation the V11 pipeline uses.
 *
 * Hard rules enforced here:
 *  - An initial snapshot must be provenance-checked. A snapshot reconstructed
 *    from map+setup is trusted only when its behavioural state hash equals the
 *    hash recorded at collection time; otherwise the episode is quarantined and
 *    never silently replayed under guessed settings.
 *  - Legality is verified per step against the current legal set, and the
 *    engine's acceptance result is inspected. `engine.step` returns a failure
 *    `info` string instead of throwing, so absence of exceptions proves nothing.
 *  - Samples are committed only after the whole replay validates (episode
 *    transaction). A failed episode never leaves prefix samples behind.
 *  - tensor/globals/candidates/turn/stateHash of a sample all come from ONE
 *    `engine.getState()` result. This is the F01 fix.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import type { Action, GameState } from '../../src/game/types';
import { createAppApkSkirmishGameState, parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState, type ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';
import { getLegalActions } from '../../src/game/rules';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import {
    buildInitialSnapshot as buildSharedSnapshot,
    canonicalStateSha256,
    setupIdOf,
    verifyInitialSnapshot,
    type InitialSnapshot,
    type SnapshotHashFns,
} from '../../src/game/state_snapshot';
import { sha256 } from './common';

export type { InitialSnapshot };

/** The single hashing implementation every V11 snapshot comparison uses. */
export const V11_HASH: SnapshotHashFns = { sha256Hex: sha256 };

export const V11_ENCODER_SCHEMA = 'spatial-v2/24x20x20+g20';

/**
 * Structural action equality. Mirrors src/game/engine.ts::areActionsEqual
 * (module-private there) so replay legality uses the engine's own notion of
 * "the same action".
 */
export function areActionsEqual(a1: Action, a2: Action): boolean {
    if (!a1 || !a2 || a1.type !== a2.type) return false;
    const samePos = (p1: any, p2: any) => !!p1 && !!p2 && p1.x === p2.x && p1.y === p2.y;
    const A = a1 as any;
    const B = a2 as any;
    switch (a1.type) {
        case 'move':
        case 'post_attack_move':
            return A.unitId === B.unitId && samePos(A.to, B.to);
        case 'attack':
            return A.attackerId === B.attackerId && A.targetId === B.targetId;
        case 'heal':
            return A.healerId === B.healerId && A.targetId === B.targetId;
        case 'support':
            return A.supporterId === B.supporterId && A.targetId === B.targetId;
        case 'capture':
        case 'destroy_town':
        case 'repair':
        case 'summon':
            return A.unitId === B.unitId && (B.targetId === undefined || A.targetId === B.targetId);
        default:
            return JSON.stringify(a1) === JSON.stringify(a2);
    }
}

/** The five setup variants used by the v10 collectors (provenance checks only). */
export const V10_SETUP_VARIANTS: ApkSkirmishSetupSelection[] = [
    { initialGold: 300, unitLimit: 30, levelCap: 3 },
    { initialGold: 400, unitLimit: 40, levelCap: 4 },
    { initialGold: 500, unitLimit: 50, levelCap: 5 },
    { initialGold: 600, unitLimit: 60, levelCap: 6 },
    { initialGold: 700, unitLimit: 70, levelCap: 7 },
];

/** Mirrors tools/v10fix/collectors.ts::setupForSeed for provenance reconstruction. */
export function v10SetupForSeed(seed: number): ApkSkirmishSetupSelection {
    const idx = Math.abs(seed - 9001) % V10_SETUP_VARIANTS.length;
    return V10_SETUP_VARIANTS[idx];
}

export function setupId(setup?: ApkSkirmishSetupSelection | null): string {
    return setupIdOf(setup);
}

export function rulesHashOf(state: GameState): string {
    return sha256(JSON.stringify(state.rules ?? null));
}

export function buildInitialSnapshot(
    state: GameState,
    mapName: string,
    setup?: ApkSkirmishSetupSelection | null,
    subjectSeat: number = 0
): InitialSnapshot {
    return buildSharedSnapshot(state, mapName, setup ?? null, subjectSeat, V11_HASH);
}

/**
 * Rebuild the initial state for a recorded collection episode. When the setup is
 * unknown we reconstruct with the default and let the hash check decide: a
 * mismatch means "cannot prove", not "close enough".
 */
export function reconstructInitialSnapshot(
    mapName: string,
    setup?: ApkSkirmishSetupSelection | null,
    subjectSeat: number = 0
): InitialSnapshot {
    const state = setup
        ? createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup })
        : createAppApkSkirmishGameState(mapName, 'SD');
    (state as any).mapName = mapName;
    return buildInitialSnapshot(state, mapName, setup ?? null, subjectSeat);
}

export type SnapshotProvenance = 'RECORDED_SNAPSHOT' | 'RECONSTRUCTED_HASH_VERIFIED' | 'UNKNOWN_NOT_PROVEN';

export interface SnapshotResolution {
    provenance: SnapshotProvenance;
    snapshot: InitialSnapshot | null;
    reason: string | null;
    expectedHash: string | null;
    observedHash: string | null;
}

export function resolveInitialSnapshot(params: {
    mapName: string;
    recordedSnapshot?: InitialSnapshot | null;
    recordedInitialStateHash?: string | null;
    setup?: ApkSkirmishSetupSelection | null;
    subjectSeat?: number;
}): SnapshotResolution {
    const { mapName, recordedSnapshot, recordedInitialStateHash, setup } = params;
    const subjectSeat = params.subjectSeat ?? recordedSnapshot?.subjectSeat ?? 0;

    if (recordedSnapshot && recordedSnapshot.state) {
        const integrity = verifyInitialSnapshot(recordedSnapshot, V11_HASH, mapName);
        if (!integrity.ok) {
            return {
                provenance: 'UNKNOWN_NOT_PROVEN',
                snapshot: null,
                reason: `recorded snapshot failed its own integrity check: ${integrity.reason}`,
                expectedHash: recordedSnapshot.stateSha256,
                observedHash: null,
            };
        }
        return {
            provenance: 'RECORDED_SNAPSHOT',
            snapshot: recordedSnapshot,
            reason: null,
            expectedHash: recordedSnapshot.initialStateHash,
            observedHash: recordedSnapshot.initialStateHash,
        };
    }

    const rebuilt = reconstructInitialSnapshot(mapName, setup ?? undefined, subjectSeat);
    if (!recordedInitialStateHash) {
        return {
            provenance: 'UNKNOWN_NOT_PROVEN',
            snapshot: null,
            reason: 'no recorded snapshot and no recorded initialStateHash to verify reconstruction against',
            expectedHash: null,
            observedHash: rebuilt.initialStateHash,
        };
    }
    if (rebuilt.initialStateHash !== recordedInitialStateHash) {
        return {
            provenance: 'UNKNOWN_NOT_PROVEN',
            snapshot: null,
            reason:
                `reconstructed initial state hash mismatch: expected ${recordedInitialStateHash}, observed ${rebuilt.initialStateHash}. ` +
                `Setup ${rebuilt.setupId} is not the collection setup, so replay under it is not evidence.`,
            expectedHash: recordedInitialStateHash,
            observedHash: rebuilt.initialStateHash,
        };
    }
    return {
        provenance: 'RECONSTRUCTED_HASH_VERIFIED',
        snapshot: rebuilt,
        reason: null,
        expectedHash: recordedInitialStateHash,
        observedHash: rebuilt.initialStateHash,
    };
}

export interface RecordedActionStep {
    step: number;
    player: number;
    action: Action;
    ms?: number;
}

export type ReplayFailureCode =
    | 'SNAPSHOT_UNPROVEN'
    | 'TERMINAL_BEFORE_HISTORY_END'
    | 'ILLEGAL_ACTION'
    | 'STEP_NOT_ACCEPTED'
    | 'STATE_HASH_MISMATCH'
    | 'TRUNCATED_WITHOUT_REASON';

export interface ReplayValidation {
    episodeId: string;
    ok: boolean;
    provenance: SnapshotProvenance;
    setupId: string;
    mapName: string;
    totalRecordedSteps: number;
    stepsReplayed: number;
    hashChecksPerformed: number;
    failureCode: ReplayFailureCode | null;
    failureStep: number | null;
    failureDetail: string | null;
    terminationReason: string | null;
    naturalTerminal: boolean;
    steps: ReplayStepResult[];
}

export interface ReplayStepResult {
    step: number;
    player: number;
    actionType: string;
    turn: number;
    stateHash: string;
    subjectPlayer: number;
}

export interface ReplayOptions {
    hashEveryNSteps?: number;
    maxSteps?: number;
    stopAtTerminal?: boolean;
}

/**
 * Strict episode replay. Never throws for data-level problems, and never returns
 * partial sample data.
 */
export function replayEpisode(
    episodeId: string,
    mapName: string,
    actions: RecordedActionStep[],
    snapshot: InitialSnapshot,
    provenance: SnapshotProvenance,
    options: ReplayOptions = {}
): ReplayValidation {
    const hashEvery = Math.max(1, options.hashEveryNSteps ?? 1);
    const limit = Math.min(actions.length, options.maxSteps ?? actions.length);
    const steps: ReplayStepResult[] = [];

    const base: ReplayValidation = {
        episodeId,
        ok: false,
        provenance,
        setupId: snapshot.setupId,
        mapName,
        totalRecordedSteps: actions.length,
        stepsReplayed: 0,
        hashChecksPerformed: 0,
        failureCode: null,
        failureStep: null,
        failureDetail: null,
        terminationReason: null,
        naturalTerminal: false,
        steps,
    };

    const engine = new GameEngine(JSON.parse(JSON.stringify(snapshot.state)) as GameState);
    (engine.getState() as any).mapName = mapName;

    // Hash convention: this episode's subject seat, for every state it passes
    // through. Hashing with the per-step `currentPlayer` instead would make the
    // value depend on who is to move, so a seat-1 recording could never reproduce
    // the hash computed at collection time with subjectSeat = 1.
    const hashSubject = snapshot.subjectSeat ?? 0;
    const liveInitialHash = canonicalStateSha256(engine.getState(), hashSubject, V11_HASH);
    if (liveInitialHash !== snapshot.initialStateHash) {
        return {
            ...base,
            failureCode: 'STATE_HASH_MISMATCH',
            failureStep: -1,
            failureDetail:
                `engine did not rebuild the recorded initial state for subjectSeat ${hashSubject}: ` +
                `${liveInitialHash} != ${snapshot.initialStateHash}`,
        };
    }

    for (let i = 0; i < limit; i += 1) {
        const recorded = actions[i];
        const state = engine.getState();

        if (engine.isTerminal()) {
            return {
                ...base,
                stepsReplayed: i,
                failureCode: 'TERMINAL_BEFORE_HISTORY_END',
                failureStep: i,
                failureDetail: `engine reached terminal state at step ${i} but ${limit - i} recorded actions remain`,
            };
        }

        const curPlayer = state.currentPlayer;
        const legals = getLegalActions(state, curPlayer);
        if (!legals.some(la => areActionsEqual(la, recorded.action))) {
            return {
                ...base,
                stepsReplayed: i,
                failureCode: 'ILLEGAL_ACTION',
                failureStep: i,
                failureDetail:
                    `recorded action ${JSON.stringify(recorded.action)} is not in the legal set of the current state ` +
                    `(turn ${state.turn}, currentPlayer ${curPlayer}, ${legals.length} legal actions)`,
            };
        }

        const result = engine.step(recorded.action);
        const info = String((result as any)?.info ?? '');
        if (info.includes('非法动作') || info.includes('illegal')) {
            return {
                ...base,
                stepsReplayed: i,
                failureCode: 'STEP_NOT_ACCEPTED',
                failureStep: i,
                failureDetail: `engine rejected a step it reported as legal: ${info}`,
            };
        }
        if (recorded.player !== curPlayer) {
            return {
                ...base,
                stepsReplayed: i,
                failureCode: 'STEP_NOT_ACCEPTED',
                failureStep: i,
                failureDetail: `recorded acting player ${recorded.player} != engine currentPlayer ${curPlayer} at step ${i}`,
            };
        }

        const after = engine.getState();
        steps.push({
            step: i,
            player: curPlayer,
            actionType: recorded.action.type,
            turn: after.turn,
            stateHash: canonicalStateSha256(after, hashSubject, V11_HASH),
            subjectPlayer: curPlayer,
        });

        if ((i + 1) % hashEvery === 0 || i === limit - 1) {
            base.hashChecksPerformed += 1;
        }

        if (options.stopAtTerminal !== false && engine.isTerminal() && i + 1 < limit) {
            return {
                ...base,
                stepsReplayed: i + 1,
                failureCode: 'TERMINAL_BEFORE_HISTORY_END',
                failureStep: i + 1,
                failureDetail: `engine terminal after step ${i}; ${limit - (i + 1)} recorded actions remain`,
            };
        }
    }

    return {
        ...base,
        ok: true,
        stepsReplayed: limit,
        naturalTerminal: engine.isTerminal(),
        terminationReason: engine.isTerminal()
            ? ((engine.getState() as any).winner === 0 ? 'NATURAL_WIN_OR_LOSS_SEAT0' : 'NATURAL_TERMINAL')
            : null,
    };
}

// ---------------------------------------------------------------------------
// Snapshot-aligned sample extraction (the F01 fix, shared by all callers)
// ---------------------------------------------------------------------------

export interface V11AlignedValueSample {
    sampleId: string;
    rootFamilyId: string;
    episodeId: string;
    step: number;
    mapName: string;
    stage: 'OPENING' | 'MIDGAME' | 'ENDGAME';
    turn: number;
    subjectPlayer: number;
    currentPlayer: number;
    stateHash: string;
    encoderSchema: string;
    actionListHash: string;
    terminationReason: string;
    policyLossMask: boolean;
    valueLossMask: boolean;
    valueTarget: number | null;
    targetActionIndex: number;
    spatialTensor: number[];
    globalFeatures: number[];
    candidateActions: Array<{
        actorCoord: unknown;
        landingCoord: unknown;
        targetCoord: unknown;
        semantics: number[];
    }>;
    snapshotProvenance: SnapshotProvenance;
    setupId: string;
}

export interface AlignmentResult {
    samples: V11AlignedValueSample[];
    validation: ReplayValidation;
    committed: boolean;
}

export interface AlignOptions extends ReplayOptions {
    maxSamplesPerEpisode?: number;
    openingFraction?: number;
    endgameFraction?: number;
}

/**
 * Replay an episode and emit samples whose tensor, globals, candidate features,
 * turn and hash all come from the same `engine.getState()` result (F01),
 * committed transactionally (F01b).
 */
export function extractAlignedValueSamples(params: {
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    actions: RecordedActionStep[];
    snapshot: InitialSnapshot;
    provenance: SnapshotProvenance;
    valueTarget: number | null;
    terminationReason: string;
    policyLabelAllowed: boolean;
    options?: AlignOptions;
}): AlignmentResult {
    const {
        episodeId, rootFamilyId, mapName, actions, snapshot, provenance,
        valueTarget, terminationReason, policyLabelAllowed,
    } = params;
    const options = params.options ?? {};
    const maxSamples = Math.max(1, options.maxSamplesPerEpisode ?? 16);
    const openingFraction = options.openingFraction ?? 0.30;
    const endgameFraction = options.endgameFraction ?? 0.70;

    const validation = replayEpisode(episodeId, mapName, actions, snapshot, provenance, options);
    if (!validation.ok) {
        return { samples: [], validation, committed: false };
    }

    const engine = new GameEngine(JSON.parse(JSON.stringify(snapshot.state)) as GameState);
    (engine.getState() as any).mapName = mapName;

    const totalSteps = actions.length;
    const stride = Math.max(1, Math.floor(totalSteps / maxSamples));
    const sampleIndices = new Set<number>();
    for (let s = 0; s < totalSteps; s += stride) {
        sampleIndices.add(s);
        if (sampleIndices.size >= maxSamples) break;
    }

    const samples: V11AlignedValueSample[] = [];
    for (let i = 0; i < totalSteps; i += 1) {
        const cur = engine.getState();
        const curPlayer = cur.currentPlayer;

        if (sampleIndices.has(i) && !engine.isTerminal()) {
            const legals = getLegalActions(cur, curPlayer).filter(a => a.type !== 'surrender');
            if (legals.length > 0) {
                const targetIdx = legals.findIndex(a => areActionsEqual(a, actions[i].action));
                if (targetIdx !== -1) {
                    const progress = totalSteps > 0 ? i / totalSteps : 0;
                    const stage: 'OPENING' | 'MIDGAME' | 'ENDGAME' =
                        progress <= openingFraction ? 'OPENING' : progress > endgameFraction ? 'ENDGAME' : 'MIDGAME';

                    // F01 fix: every field below derives from `cur`, the same state
                    // object that produced `legals` and `curPlayer`.
                    const encSpatial = encodeGameStateSpatial(cur, curPlayer, 'v2');
                    const candSpatial = legals.map(a => encodeCandidateActionSpatial(cur, curPlayer, a, 'v2'));

                    samples.push({
                        sampleId: `v11_val_${episodeId}_s${i}`,
                        rootFamilyId,
                        episodeId,
                        step: i,
                        mapName,
                        stage,
                        turn: cur.turn,
                        subjectPlayer: curPlayer,
                        currentPlayer: curPlayer,
                        stateHash: canonicalStateSha256(cur, curPlayer, V11_HASH),
                        encoderSchema: V11_ENCODER_SCHEMA,
                        actionListHash: sha256(JSON.stringify(legals.map(a => JSON.stringify(a)))),
                        terminationReason,
                        // A truncated/censored episode still teaches *what was
                        // played* while teaching nothing about the outcome.
                        policyLossMask: policyLabelAllowed,
                        valueLossMask: valueTarget !== null,
                        valueTarget,
                        targetActionIndex: targetIdx,
                        spatialTensor: Array.from(encSpatial.spatialTensor),
                        globalFeatures: Array.from(encSpatial.globalFeatures),
                        candidateActions: candSpatial.map(c => ({
                            actorCoord: c.actorCoord,
                            landingCoord: c.landingCoord,
                            targetCoord: c.targetCoord,
                            semantics: Array.from(c.semantics),
                        })),
                        snapshotProvenance: provenance,
                        setupId: snapshot.setupId,
                    });
                }
            }
        }

        engine.step(actions[i].action);
    }

    return { samples, validation, committed: true };
}

export interface EpisodeFileRecord {
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    seed: number;
    candidateSeat: number;
    candidatePolicy: string;
    opponentPolicy: string;
    terminationReason: string;
    winnerSeat: number | null;
    candidateOutcome: string;
    z: number | null;
    isCensored: boolean;
    trajectoryLogPath: string;
    engineStepCount?: number;
    turns?: number;
}

export interface TrajectoryContents {
    actions: RecordedActionStep[];
    initialSnapshot: InitialSnapshot | null;
    recordedInitialStateHash: string | null;
    setupSelection: ApkSkirmishSetupSelection | null;
    seed: number | null;
    candidateSeat: number | null;
}

/**
 * Read a recorded trajectory, including the initial snapshot when the run that
 * produced it persisted one (V11 recordings do; V10 recordings do not).
 */
export function readTrajectory(trajectoryLogPath: string): TrajectoryContents | null {
    if (!trajectoryLogPath) return null;
    const resolved = path.isAbsolute(trajectoryLogPath) ? trajectoryLogPath : path.resolve(trajectoryLogPath);
    if (!fs.existsSync(resolved)) return null;
    const traj = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (!Array.isArray(traj?.actionHistory)) return null;
    return {
        actions: traj.actionHistory.map((a: any) => ({
            step: Number(a.step ?? 0),
            player: Number(a.player ?? 0),
            action: a.action as Action,
            ms: a.ms,
        })),
        initialSnapshot: (traj?.initialSnapshot ?? null) as InitialSnapshot | null,
        // Prefer the snapshot's own hash. The legacy `initialStateHash` field is
        // the V7 internal behavioral hash, a different value space that must never
        // be compared against a V11 snapshot hash.
        recordedInitialStateHash: traj?.initialSnapshot?.initialStateHash ?? traj?.initialStateHash ?? null,
        setupSelection: (traj?.setupSelection ?? null) as ApkSkirmishSetupSelection | null,
        seed: typeof traj?.seed === 'number' ? traj.seed : null,
        candidateSeat: typeof traj?.candidateSeat === 'number' ? traj.candidateSeat : null,
    };
}

export function readTrajectoryActions(trajectoryLogPath: string): RecordedActionStep[] | null {
    return readTrajectory(trajectoryLogPath)?.actions ?? null;
}
