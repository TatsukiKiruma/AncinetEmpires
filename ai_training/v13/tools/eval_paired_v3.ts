/**
 * V13/T13-02: paired-seat evaluation, protocol v3.
 *
 * This is a new entry point rather than a patch of `v12/tools/eval_paired_seats.ts`,
 * because the taskbook requires one protocol instead of one protocol per script and
 * the old one had six specific defects that are each fixed here:
 *
 *  1. IDENTITY. The old tool injected weights with `setDefaultSpatialWeights` and then
 *     reported `checkpointSha256` from the STATIC registry, so telemetry described a
 *     weight file that was not the one executing. v3 computes the real SHA-256 of the
 *     bytes it loaded and carries that hash with the predictor.
 *
 *  2. MIRROR COUNTING. The old tool replayed the identical all-heuristic mirror once
 *     per candidate seat, so 2 seeds x 4 seats produced 8 mirror ROWS built from 2
 *     distinct games, and those rows were then read as 8 independent observations.
 *     v3 caches one mirror per (scenario, seed, maxSteps) and references it by
 *     `mirrorId`; `independentMirrorGames` reports the real count.
 *
 *  3. OUTCOME CLASSIFICATION. The old tool used `capped = winner === null`. The engine
 *     also uses `winner === -1` for a real draw (`src/game/engine.ts:991`), so a
 *     natural draw was reported as a truncation. v3 classifies NATURAL_WIN /
 *     NATURAL_LOSS / NATURAL_DRAW / STEP_LIMIT / PLY_LIMIT / WALL_TIMEOUT / CANCELLED
 *     / POLICY_ERROR / ENGINE_ERROR separately and never folds an error into a draw.
 *
 *  4. UNDECIDED HONESTY. Undecided games are not losses. v3 reports the planned game
 *     count, the executed count, the naturally finished count, and win-rate bounds
 *     under both "all undecided would have been wins" and "all undecided would have
 *     been losses", instead of quietly dropping them.
 *
 *  5. SELF-TEST. The old self-test only checked `delta === 0`, which also holds when
 *     both arms diverge identically. v3 compares per-step action digests, terminal
 *     winner, step count, turn and trajectory digest between the two arms.
 *
 *  6. NO HIDDEN FALLBACK. `allowInteractiveFallback` is forced off and every fallback
 *     is counted and reported; a fallback is never silently absorbed into a win rate.
 *
 * Usage:
 *   node --openssl-legacy-provider v13/tools/run-tool.mjs v13/tools/eval_paired_v3.ts \
 *     --candidate heuristic --scenario "SDPLAN:sd-normal:(4) Crossroads.aem" \
 *     --seeds 2026070501,2026070502 --max-steps 20000 \
 *     --out v13/out/<runId>/T13-05/paired_heuristic.json
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import {
    getSpatialAiActionSync,
    setSpatialPredictorIdentity,
} from '../../src/game/ai/spatial_neural_adapter';
import { loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { getAllianceId } from '../../src/game/rule_config';
import type { Action } from '../../src/game/types';
import {
    classifyOutcome,
    isError,
    isNatural,
    isUndecided,
    streamFor,
    type OutcomeKind,
} from './eval_v3_core';

export { classifyOutcome, isError, isNatural, isUndecided, streamFor };
export type { OutcomeKind };

/**
 * Re-read a mirror (or candidate) record from a named seat's perspective.
 *
 * This is pure derivation over an already-recorded game: it changes WHO the result is
 * about, never what happened. Keeping it explicit is what stops a per-seat derivation
 * from being mistaken for a per-seat observation.
 */
export function viewOutcomeForSeat(
    raw: OutcomeKind,
    winnerAllianceId: number | null,
    viewedAllianceId: number | null,
): OutcomeKind {
    if (isError(raw) || isUndecided(raw)) return raw;
    if (raw === 'NATURAL_DRAW') return 'NATURAL_DRAW';
    if (viewedAllianceId === null || winnerAllianceId === null) return raw;
    return winnerAllianceId === viewedAllianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS';
}

function mirrorViewOutcome(raw: OutcomeKind, winnerAllianceId: number | null, viewedAllianceId: number | null): OutcomeKind {
    return viewOutcomeForSeat(raw, winnerAllianceId, viewedAllianceId);
}

function mirrorViewWon(raw: OutcomeKind, winnerAllianceId: number | null, viewedAllianceId: number | null): boolean {
    return viewOutcomeForSeat(raw, winnerAllianceId, viewedAllianceId) === 'NATURAL_WIN';
}

/**
 * delta = (candidate won its seat) - (the heuristic would have won that same seat).
 * Both terms are alliance comparisons against the SAME seat.
 */
export function deltaOf(
    candidate: { outcomeKind: OutcomeKind; winnerAllianceId: number | null; candidateAllianceId: number | null },
    mirror: { outcomeKind: OutcomeKind; winnerAllianceId: number | null },
    mirrorAllianceId: number | null,
): number {
    const candWon = candidate.outcomeKind === 'NATURAL_WIN' ? 1 : 0;
    const mirrorWon = mirrorViewWon(mirror.outcomeKind, mirror.winnerAllianceId, mirrorAllianceId) ? 1 : 0;
    return candWon - mirrorWon;
}

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN = 'training_configs/sd_training_plan_20260705.json';



function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Atomic write: an evaluator must never read a half-written result file. */
function writeJsonAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}



function digestActions(parts: string[]): string {
    return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

function actionKey(action: Action): string {
    // encodeAction is the engine's own canonical code (see planning.ts legalCodes).
    const anyAction = action as any;
    const fields = [
        action.type,
        anyAction.unitId ?? '',
        anyAction.attackerId ?? '',
        anyAction.targetId ?? '',
        anyAction.to ? `${anyAction.to.x},${anyAction.to.y}` : '',
        anyAction.target ? `${anyAction.target.x},${anyAction.target.y}` : '',
    ];
    return fields.join('|');
}

export interface GameRecord {
    runId: string;
    codeCommit: string;
    scenarioId: string;
    mapHash: string | null;
    baseRootId: string;
    seed: number;
    maxSteps: number;
    maxPlies: number | null;
    candidateSeat: number | null;
    /** Which seat's result this record reports; defined for BOTH arms. */
    viewedSeat: number | null;
    arm: 'CANDIDATE' | 'MIRROR';
    mirrorId: string | null;
    requestedPolicyId: string;
    actualPolicyId: string;
    checkpointSha256: string | null;
    encoderSchema: string;
    candidateSchema: string;
    outcomeKind: OutcomeKind;
    winnerPlayerId: number | null;
    winnerAllianceId: number | null;
    candidateAllianceId: number | null;
    steps: number;
    plies: number;
    turns: number;
    fallbackCount: number;
    deadlineMissCount: number;
    engineTransitions: number;
    candidateDecisions: number;
    latencyMs: { p50: number | null; p95: number | null; p99: number | null; max: number | null };
    trajectoryDigest: string;
    actionDigest: string;
    error: string | null;
    wallMs: number;
}

interface PlayResult {
    record: GameRecord;
    /** Non-null only for a self-test pair, where the two arms must match exactly. */
    stepKeys: string[];
}

async function playOne(opts: {
    runId: string;
    codeCommit: string;
    envFactory: any;
    scenarioId: string;
    seed: number;
    candidateSeat: number | null;
    maxSteps: number;
    maxPlies: number | null;
    candidateIsModel: boolean;
    requestedPolicyId: string;
    checkpointSha256: string | null;
    wallTimeoutMs: number;
    /** Fault injection: the candidate deliberately returns an illegal action. */
    injectIllegalAction?: boolean;
    /** Fault injection: stop after this many steps and report STEP_LIMIT. */
    forceStepCap?: number;
    /** Mirror arm only: which seat's result this mirror reports. */
    viewedSeatHint?: number | null;
}): Promise<PlayResult> {
    const {
        runId, codeCommit, envFactory, scenarioId, seed, candidateSeat, maxSteps,
        maxPlies, candidateIsModel, requestedPolicyId, checkpointSha256,
        wallTimeoutMs, injectIllegalAction, forceStepCap,
    } = opts;
    const viewedSeatHint = opts.viewedSeatHint ?? null;

    const baseRootId = `${scenarioId}#seed=${seed}`;
    const fakeEpisode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: scenarioId.split(':').pop(), resourcePath: '' },
        seed, maxPlies: maxPlies ?? 1200, maxSteps: maxSteps,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;

    const env = await envFactory.createEnv(fakeEpisode);
    env.reset(seed);
    const engine = env.getEngine();

    // One deterministic HeuristicAI per seat, built from a stream that depends only
    // on (seed, seat) - identical between the candidate arm and the mirror arm.
    const playerIds: number[] = engine.getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const seatAi = new Map<number, HeuristicAI>();
    for (const s of playerIds) seatAi.set(s, new HeuristicAI(streamFor(seed, s)));

    const stepCap = forceStepCap ?? maxSteps;
    let steps = 0;
    let fallbacks = 0;
    let deadlineMisses = 0;
    let candidateDecisions = 0;
    let engineError: string | null = null;
    let policyError: string | null = null;
    let cancelled = false;
    let wallTimeout = false;
    const latencies: number[] = [];
    const stepKeys: string[] = [];
    const startedAt = Date.now();

    while (!engine.isTerminal() && steps < stepCap) {
        if (Date.now() - startedAt > wallTimeoutMs) { wallTimeout = true; break; }
        const state = engine.getState();
        const p = state.currentPlayer;
        let action: Action | null = null;
        try {
            if (candidateSeat !== null && p === candidateSeat) {
                if (injectIllegalAction) {
                    action = { type: 'end_turn' } as Action;
                    if (steps === 0) {
                        action = { type: 'move', unitId: '__nonexistent__', to: { x: -99, y: -99 } } as any;
                    }
                } else if (candidateIsModel) {
                    const res = getSpatialAiActionSync(engine, p, {
                        deadlineMs: 1000,
                        allowInteractiveFallback: false,
                    });
                    action = res.action;
                    latencies.push(res.e2eMs ?? res.latencyMs);
                    if ((res as any).fallbackUsed) fallbacks++;
                    if ((res as any).deadlineMiss) deadlineMisses++;
                } else {
                    action = (seatAi.get(p) as HeuristicAI).getAction(engine, p, undefined);
                }
                candidateDecisions++;
            } else {
                action = (seatAi.get(p) as HeuristicAI).getAction(engine, p, undefined);
            }
        } catch (err) {
            policyError = err instanceof Error ? err.message : String(err);
            break;
        }
        if (!action) { policyError = 'policy returned no action'; break; }
        stepKeys.push(`P${p}:${actionKey(action)}`);
        try {
            engine.step(action);
        } catch (err) {
            engineError = err instanceof Error ? err.message : String(err);
            break;
        }
        steps++;
    }

    const state = engine.getState();
    const winnerPlayerId = state.winner === null || state.winner === -1 ? null : state.winner;
    const winnerAllianceId = state.winner === null ? null : state.winner;
    // `state.winner` is an ALLIANCE id (src/game/types.ts:248). Resolve the candidate's
    // own alliance so "did the candidate win" is an alliance comparison, not a
    // seat-index comparison.
    // The VIEWED alliance: the alliance whose result this arm reports. For the candidate
    // arm that is the candidate's own seat alliance; for the mirror arm it is the
    // alliance of the seat being compared. Both arms must be judged from a named
    // perspective, otherwise the mirror arm falls through classifyOutcome with a null
    // perspective and is scored NATURAL_LOSS purely because that branch requires a
    // non-null viewer. (The self-test caught exactly that, which is why the field is
    // explicit rather than implied.)
    const viewedSeat = candidateSeat ?? viewedSeatHint;
    const viewedAllianceId = viewedSeat === null ? null : getAllianceId(state, viewedSeat);
    const arm: 'CANDIDATE' | 'MIRROR' = candidateSeat === null ? 'MIRROR' : 'CANDIDATE';
    const playerCount = Math.max(1, playerIds.length);
    const currentIndex = Math.max(0, playerIds.indexOf(state.currentPlayer));
    const plies = Math.max(0, state.turn - 1) * playerCount + currentIndex + 1;

    const sorted = latencies.slice().sort((a, b) => a - b);
    const pct = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);

    const outcomeKind = classifyOutcome({
        engineError, policyError, cancelled, wallTimeout,
        winner: state.winner,
        winnerAlliance: winnerAllianceId,
        candidateAlliance: viewedAllianceId,
        steps: steps < stepCap ? steps : stepCap,
        maxSteps: stepCap,
        plies,
        maxPlies,
    });

    const record: GameRecord = {
        runId,
        codeCommit,
        scenarioId,
        mapHash: null,
        baseRootId,
        seed,
        maxSteps: stepCap,
        maxPlies,
        candidateSeat,
        mirrorId: candidateSeat === null ? `${scenarioId}#seed=${seed}#maxSteps=${stepCap}` : null,
        requestedPolicyId,
        actualPolicyId: requestedPolicyId,
        checkpointSha256,
        encoderSchema: 'spatial-v2/24x20x20+g20',
        candidateSchema: 'candidate-6field/v1',
        outcomeKind,
        winnerPlayerId,
        winnerAllianceId,
        candidateAllianceId: viewedAllianceId,
        viewedSeat,
        arm,
        steps,
        plies,
        turns: state.turn,
        fallbackCount: fallbacks,
        deadlineMissCount: deadlineMisses,
        engineTransitions: steps,
        candidateDecisions,
        latencyMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted.length ? sorted[sorted.length - 1] : null },
        trajectoryDigest: digestActions(stepKeys),
        actionDigest: digestActions(stepKeys.slice(0, 64)),
        error: engineError ?? policyError,
        wallMs: Date.now() - startedAt,
    };
    return { record, stepKeys };
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v13_20260924_t13');
    const candidateArg = arg('--candidate', 'heuristic');
    const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(4) Crossroads.aem');
    const seeds = arg('--seeds', '2026070501,2026070502').split(',').map(Number).filter(Number.isFinite);
    const seatsArg = arg('--seats', '');
    const maxSteps = Number(arg('--max-steps', '20000'));
    const maxPlies = arg('--max-plies', '') ? Number(arg('--max-plies', '0')) : null;
    const wallTimeoutMs = Number(arg('--wall-timeout-ms', '900000'));
    const out = arg('--out', `v13/out/${runId}/T13-05/paired_v3.json`);
    const selfTest = process.argv.includes('--selftest');
    const faultInject = arg('--fault-inject', '');
    const codeCommit = arg('--code-commit', '');

    const candidateIsModel = candidateArg !== 'heuristic';
    let checkpointSha256: string | null = null;
    if (candidateIsModel) {
        if (!fs.existsSync(candidateArg)) {
            throw new Error(`candidate checkpoint not found: ${candidateArg}`);
        }
        // V13/T13-02 fix #1: hash the bytes actually loaded, and hand that identity to
        // the adapter so telemetry can never describe a different weight file.
        checkpointSha256 = sha256File(candidateArg);
        const weights = loadSpatialResNetFromJson(fs.readFileSync(candidateArg, 'utf8'));
        setSpatialPredictorIdentity({
            policyId: 'spatial_v2_experimental',
            predictor: undefined as any,
            weights,
            checkpointPath: candidateArg,
            checkpointSha256,
            source: 'direct_file_load',
        });
    }

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN);
    // Discover the real seats from the engine rather than hard-coding 0..3, so a
    // 2-player map is not evaluated as if it had four seats.
    const probe = await envFactory.createEnv({
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: scenarioId.split(':').pop(), resourcePath: '' },
        seed: seeds[0] ?? 1, maxPlies: maxPlies ?? 1200, maxSteps,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any);
    probe.reset(seeds[0] ?? 1);
    const allSeats: number[] = probe.getEngine().getState().players
        .map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const seats = seatsArg ? seatsArg.split(',').map(Number).filter(Number.isFinite) : allSeats;
    const allianceOfSeat = new Map<number, number>();
    for (const s of allSeats) allianceOfSeat.set(s, getAllianceId(probe.getEngine().getState(), s));

    console.log(`[v3] runId=${runId} candidate=${candidateArg} model=${candidateIsModel}`);
    if (checkpointSha256) console.log(`[v3] checkpointSha256=${checkpointSha256}  <- real file digest`);
    console.log(`[v3] scenario=${scenarioId} seats=[${seats}] seeds=[${seeds}] maxSteps=${maxSteps} maxPlies=${maxPlies}`);
    console.log(`[v3] alliances by seat: ${JSON.stringify(Object.fromEntries(allianceOfSeat))}`);

    // ------------------------------------------------------------------ mirrors
    // V13/T13-02 fix #2: ONE mirror per (scenario, seed, maxSteps). Every seat arm in
    // that seed references the same mirrorId, so a repeated mirror can never be
    // counted as an extra independent observation.
    const mirrorCache = new Map<string, PlayResult>();
    const mirrorOrder: string[] = [];
    // Mirrors are ALWAYS played, including under --selftest. Skipping them there would
    // make the self-test vacuous: with `--candidate heuristic` the two arms coincide by
    // construction, and playing both is exactly what proves that coincidence. (An
    // earlier version of this tool skipped them and reported allDeltasZero=false on a
    // technically-identical pair, which is how the gap was found.)
    {
        for (const seed of seeds) {
            const id = `${scenarioId}#seed=${seed}#maxSteps=${maxSteps}`;
            if (mirrorCache.has(id)) continue;
            const res = await playOne({
                runId, codeCommit, envFactory, scenarioId, seed, candidateSeat: null,
                maxSteps, maxPlies, candidateIsModel: false, requestedPolicyId: 'heuristic',
                checkpointSha256: null, wallTimeoutMs,
            });
            mirrorCache.set(id, res);
            mirrorOrder.push(id);
            console.log(`[v3] mirror ${id} -> ${res.record.outcomeKind} winner=${res.record.winnerAllianceId} steps=${res.record.steps} turn=${res.record.turns}`);
        }
    }

    // --------------------------------------------------------------- candidates
    const rows: any[] = [];
    const gameRecords: GameRecord[] = [];
    const expectedSeatArms = seeds.length * seats.length;
    for (const seed of seeds) {
        const mirrorId = `${scenarioId}#seed=${seed}#maxSteps=${maxSteps}`;
        for (const seat of seats) {
            const cand = await playOne({
                runId, codeCommit, envFactory, scenarioId, seed, candidateSeat: seat,
                maxSteps, maxPlies, candidateIsModel,
                requestedPolicyId: candidateIsModel ? 'spatial_v2_experimental' : 'heuristic',
                checkpointSha256, wallTimeoutMs,
                injectIllegalAction: faultInject === 'illegal-action',
                forceStepCap: faultInject === 'step-cap' ? Math.max(1, Math.min(5, maxSteps)) : undefined,
            });
            const mirror = mirrorCache.get(mirrorId);
            gameRecords.push(cand.record);
            if (mirror) gameRecords.push(mirror.record);

            const candAlliance = cand.record.candidateAllianceId;
            const candWin = cand.record.outcomeKind === 'NATURAL_WIN';
            // The mirror's "would the heuristic have won this seat" is an ALLIANCE
            // comparison too, so seat->alliance mapping cannot create a phantom delta.
            const mirrorAlliance = allianceOfSeat.get(seat) ?? seat;
            const mirrorWin = mirror
                ? (mirror.record.outcomeKind === 'NATURAL_WIN' && mirror.record.winnerAllianceId === mirrorAlliance)
                : null;

            rows.push({
                seed, seat, candidateAllianceId: candAlliance, mirrorAllianceId: mirrorAlliance,
                mirrorId: mirror ? mirrorId : null,
                candidate: cand.record,
                mirror: mirror ? mirror.record : null,
                // The mirror game is played ONCE per (scenario, seed) and its verdict is
                // derived per seat here. That derivation is a calculation on an existing
                // observation, not a new observation, so it must never be counted as one.
                mirrorView: mirror ? {
                    viewedSeat: seat,
                    viewedAllianceId: mirrorAlliance,
                    outcomeKind: mirrorViewOutcome(mirror.record.outcomeKind, mirror.record.winnerAllianceId, mirrorAlliance),
                    won: mirrorViewWon(mirror.record.outcomeKind, mirror.record.winnerAllianceId, mirrorAlliance),
                } : null,
                delta: mirror ? deltaOf(cand.record, mirror.record, mirrorAlliance) : null,
            });
            console.log(`[v3] seed=${seed} seat=P${seat} | CAND ${cand.record.outcomeKind} winner=${cand.record.winnerAllianceId} steps=${cand.record.steps} | ` +
                `MIRROR ${mirror ? mirror.record.outcomeKind : 'n/a'} winner=${mirror ? mirror.record.winnerAllianceId : 'n/a'} | delta=${rows[rows.length - 1].delta}`);
        }
    }

    // --------------------------------------------------------------- aggregation
    // Undecided and errored games are reported as raw counts, never as losses.
    const natural = (r: any) => isNatural(r.outcomeKind);
    const perSeat: Record<string, any> = {};
    for (const seat of seats) {
        const rs = rows.filter(r => r.seat === seat);
        const cNatural = rs.filter(r => natural(r.candidate));
        const cWins = cNatural.filter(r => r.candidate.outcomeKind === 'NATURAL_WIN').length;
        const cLosses = cNatural.filter(r => r.candidate.outcomeKind === 'NATURAL_LOSS').length;
        const cDraws = cNatural.filter(r => r.candidate.outcomeKind === 'NATURAL_DRAW').length;
        const undecided = rs.length - cNatural.length;
        perSeat[`P${seat}`] = {
            plannedGames: rs.length,
            naturalGames: cNatural.length,
            naturalWins: cWins,
            naturalLosses: cLosses,
            naturalDraws: cDraws,
            undecided,
            errors: rs.filter(r => isError(r.candidate.outcomeKind)).length,
            naturalWinRate: cNatural.length ? cWins / cNatural.length : null,
            // Bounds: an undecided game is not a loss.
            winRateLowerBoundAllUndecidedLose: rs.length ? cWins / rs.length : null,
            winRateUpperBoundAllUndecidedWin: rs.length ? (cWins + undecided) / rs.length : null,
            candidateFallbacks: rs.reduce((a, r) => a + r.candidate.fallbackCount, 0),
            candidateDeadlineMisses: rs.reduce((a, r) => a + r.candidate.deadlineMissCount, 0),
            candidateP50Ms: median(rs.map(r => r.candidate.latencyMs.p50).filter((x: any) => x !== null)),
            candidateP95Ms: median(rs.map(r => r.candidate.latencyMs.p95).filter((x: any) => x !== null)),
            mirrorWinRate: rs.length
                ? rs.filter(r => r.mirrorView && r.mirrorView.won).length / rs.length
                : null,
        };
    }

    const candNatural = rows.filter(r => natural(r.candidate));
    const totalCandWins = candNatural.filter(r => r.candidate.outcomeKind === 'NATURAL_WIN').length;
    const totalMirrorSeatWins = rows.filter(r => r.mirrorView && r.mirrorView.won).length;

    const outcomeTally = (pick: (r: any) => OutcomeKind) => {
        const tally: Record<string, number> = {};
        for (const r of rows) {
            const k = pick(r);
            tally[k] = (tally[k] ?? 0) + 1;
        }
        return tally;
    };

    const report: any = {
        schema: 'v13_paired_seat_eval_3',
        generatedAt: new Date().toISOString(),
        runId,
        codeCommit: codeCommit || null,
        candidate: candidateArg,
        candidateIsModel,
        checkpointSha256,
        identityProvenance: candidateIsModel
            ? {
                source: 'direct_file_load',
                path: candidateArg,
                sha256: checkpointSha256,
                note: 'this digest is computed from the bytes passed to loadSpatialResNetFromJson; '
                    + 'it is NOT read back from the static registry',
            }
            : { source: 'heuristic_baseline', path: null, sha256: null },
        protocol: {
            schema: 'v13_eval_protocol_3',
            scenarioId,
            seeds,
            seats,
            allSeats,
            alliancesBySeat: Object.fromEntries(allianceOfSeat),
            maxSteps,
            maxPlies,
            wallTimeoutMs,
            arms: 'CANDIDATE (candidate at `seat`, heuristic elsewhere) vs MIRROR (heuristic at every seat)',
            mirrorPolicy: 'one cached mirror per (scenario, seed, maxSteps); seats share it by mirrorId',
            rng: 'per-seat deterministic stream mulberry(hash(seed, seat)); identical across arms; never Math.random',
            pairedBy: '(seed, seat); the only difference between arms is who occupies `seat`',
            fallbackPolicy: 'allowInteractiveFallback=false; fallbacks are counted and reported, never absorbed',
            outcomeTaxonomy: ['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW', 'STEP_LIMIT', 'PLY_LIMIT',
                'WALL_TIMEOUT', 'CANCELLED', 'POLICY_ERROR', 'ENGINE_ERROR'],
            drawSemantics: 'winner===-1 is a natural draw, NOT a truncation (D13-07)',
            winnerSemantics: 'state.winner is an ALLIANCE id; candidate win/loss is an alliance comparison',
        },
        accounting: {
            plannedSeatArms: expectedSeatArms,
            executedSeatArms: rows.length,
            independentMirrorGames: mirrorOrder.length,
            mirrorRowsReferencingAMirror: rows.filter(r => r.mirror !== null).length,
            independenceWarning: 'seat arms within one seed share a single mirror game; '
                + 'independentMirrorGames (not the row count) is the number of independent '
                + 'all-heuristic observations',
            naturalFinishedSeatArms: candNatural.length,
            undecidedSeatArms: rows.length - candNatural.length,
            errorSeatArms: rows.filter(r => isError(r.candidate.outcomeKind)).length,
        },
        outcomeTally: {
            candidate: outcomeTally(r => r.candidate.outcomeKind),
            mirrorRaw: outcomeTally(r => (r.mirror ? r.mirror.outcomeKind : 'STEP_LIMIT')),
            mirrorViewedFromEachSeat: outcomeTally(r => (r.mirrorView ? r.mirrorView.outcomeKind : 'STEP_LIMIT')),
        },
        perSeat,
        overall: {
            games: rows.length,
            candidateWins: totalCandWins,
            candidateNaturalWinRate: candNatural.length ? totalCandWins / candNatural.length : null,
            candidateWinRateLowerBoundAllUndecidedLose: rows.length ? totalCandWins / rows.length : null,
            candidateWinRateUpperBoundAllUndecidedWin: rows.length
                ? (totalCandWins + (rows.length - candNatural.length)) / rows.length : null,
            mirrorSeatWins: totalMirrorSeatWins,
            deltaOverNaturalGames: candNatural.length
                ? (totalCandWins - totalMirrorSeatWins) / candNatural.length : null,
        },
        rows,
        caveats: [
            'This is a development reading, not a confirmation experiment.',
            'Undecided games are reported as bounds, never as losses.',
            'A delta over one seat arm is noise; report the independent-root count.',
        ],
    };

    if (selfTest) {
        // V13/T13-02 fix #5: compare full trajectories, not just delta === 0.
        // `--candidate heuristic` makes the two arms the same policy, so every
        // observable must match exactly.
        const mismatches: any[] = [];
        for (const r of rows) {
            if (!r.mirror) continue;
            const c = r.candidate, m = r.mirror;
            // Structural fields are perspective-free: they must match byte for byte.
            for (const f of ['winnerAllianceId', 'steps', 'plies', 'turns', 'trajectoryDigest', 'actionDigest']) {
                if (c[f] !== m[f]) {
                    mismatches.push({ seed: r.seed, seat: r.seat, field: f, candidate: c[f], mirror: m[f] });
                }
            }
            // `outcomeKind` is a PERSPECTIVE. The mirror record is stored uncalibrated
            // (its own viewer is the raw winner), so comparing it to the candidate's
            // perspective directly would always mismatch. Re-derive the mirror's verdict
            // for this seat and compare that.
            const mirrorViewed = viewOutcomeForSeat(m.outcomeKind, m.winnerAllianceId, r.mirrorAllianceId);
            if (c.outcomeKind !== mirrorViewed) {
                mismatches.push({
                    seed: r.seed, seat: r.seat, field: 'outcomeKind(viewed)',
                    candidate: c.outcomeKind, mirror: mirrorViewed,
                    mirrorRaw: m.outcomeKind,
                });
            }
        }
        report.selfTest = {
            expectation: 'with --candidate heuristic both arms run the same policy on the same streams; '
                + 'winner, steps, plies, turns and full trajectory digest must be identical, and the '
                + 'mirror verdict re-derived for the candidate seat must equal the candidate verdict',
            comparedFields: ['winnerAllianceId', 'steps', 'plies', 'turns', 'trajectoryDigest',
                'actionDigest', 'outcomeKind(viewed for the candidate seat)'],
            mismatches,
            identical: mismatches.length === 0,
            allDeltasZero: rows.every(r => r.delta === 0),
        };
        console.log(`[v3] SELF-TEST identical=${report.selfTest.identical} mismatches=${mismatches.length} allDeltasZero=${report.selfTest.allDeltasZero}`);
    }

    if (faultInject) {
        report.faultInjection = {
            kind: faultInject,
            expectation: faultInject === 'illegal-action'
                ? 'an illegal engine action must surface as ENGINE_ERROR or POLICY_ERROR, never as a draw or a loss'
                : 'a forced step cap must surface as STEP_LIMIT, never as NATURAL_LOSS',
            observed: outcomeTally(r => r.candidate.outcomeKind),
            classifiedCorrectly: faultInject === 'illegal-action'
                ? rows.every(r => isError(r.candidate.outcomeKind))
                : rows.every(r => r.candidate.outcomeKind === 'STEP_LIMIT'),
        };
        console.log(`[v3] FAULT-INJECT ${faultInject} classifiedCorrectly=${report.faultInjection.classifiedCorrectly}`);
    }

    writeJsonAtomic(out, report);

    // Full per-game records in the C3 schema, one JSON object per line.
    const recordsPath = out.replace(/\.json$/, '.games.jsonl');
    fs.mkdirSync(path.dirname(recordsPath), { recursive: true });
    const tmpRecords = `${recordsPath}.tmp`;
    fs.writeFileSync(tmpRecords, gameRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    fs.renameSync(tmpRecords, recordsPath);

    console.log();
    console.log('[v3] per seat: seat | candW/natural | mirrorW | fallbacks | p50');
    for (const seat of seats) {
        const s = perSeat[`P${seat}`];
        console.log(`  P${seat} | ${s.naturalWins}/${s.naturalGames} | ${s.mirrorWinRate === null ? 'n/a' : s.mirrorWinRate.toFixed(2)} | ${s.candidateFallbacks} | ${s.candidateP50Ms ?? 'n/a'}ms`);
    }
    console.log(`[v3] overall candidate ${totalCandWins}/${candNatural.length} natural, mirror ${totalMirrorSeatWins}/${rows.length}, delta ${report.overall.deltaOverNaturalGames}`);
    console.log(`[v3] independent mirror games = ${mirrorOrder.length} (rows referencing a mirror = ${report.accounting.mirrorRowsReferencingAMirror})`);
    console.log(`[v3] wrote ${out}`);
    console.log(`[v3] wrote ${recordsPath}`);
}

function median(values: number[]): number | null {
    if (!values.length) return null;
    const v = values.slice().sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });



