/**
 * V11/T11-01: canonical initial-state snapshot.
 *
 * A recorded match is only replayable as *evidence* if the exact state it
 * started from is recoverable. The V10 corpus did not persist this, so none of
 * its 454 episodes could be revalidated — every non-default setup variant was
 * silently replayed under default settings.
 *
 * This module is the single source of truth for that snapshot, shared by the
 * match runner (which writes it) and the V11 replay validator (which reads it).
 * It lives in `src/game` rather than `tools/` so the evaluation harness does not
 * have to depend on V11 tooling.
 *
 * Deliberately free of Node built-ins so it stays bundleable for the browser
 * client; hashing is injected through `SnapshotHashFns`.
 */
import type { GameState } from './types';
import type { ApkSkirmishSetupSelection } from './apk_skirmish';

export const V11_INITIAL_SNAPSHOT_SCHEMA = 'v11_initial_snapshot_1';

export interface SnapshotHashFns {
    /** sha256 hex of a UTF-8 string. */
    sha256Hex(text: string): string;
}

export interface InitialSnapshot {
    schema: typeof V11_INITIAL_SNAPSHOT_SCHEMA;
    mapName: string;
    mode: string;
    setup: ApkSkirmishSetupSelection | null;
    setupId: string;
    /** Seat the behavioural hash was computed for (a match records one candidate seat). */
    subjectSeat: number;
    /** Deterministic hash over the behavioural fields of the initial state. */
    initialStateHash: string;
    rulesHash: string;
    /** sha256 over the canonical JSON of the initial state. */
    stateSha256: string;
    state: GameState;
}

/**
 * Canonical JSON: deterministic key order, so two structurally identical values
 * serialise identically regardless of construction order.
 */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/**
 * Behavioural payload of a state: everything that describes the position, and
 * nothing that describes how it was loaded.
 *
 * Mirrors the field set of `tools/v7_training_pipeline.ts::getBehavioralStateHash`
 * so the same physical position always yields the same payload. `metadata` is
 * excluded because the APK import path attaches parsed-map statistics that are
 * not part of the position.
 */
export function behavioralSnapshotPayload(state: GameState, subjectPlayerId: number): string {
    const s = state as any;
    const mapName = s.mapName ?? s.metadata?.apkMapName ?? s.metadata?.mapName ?? 'unknown_map';
    const players = (state.players ?? [])
        .map((p: any) => [
            p.id, p.gold, p.commanderDeathCount ?? 0, p.isAlive ? 1 : 0,
            p.commanderReserveLevel ?? p.reserveLevel ?? 0,
            p.commanderReserveExp ?? p.reserveExp ?? 0,
            p.reserveGold ?? 0,
        ].join(':'))
        .sort()
        .join(';');
    const units = (state.units ?? [])
        .filter((u: any) => u.hp > 0)
        .map((u: any) => [
            u.ownerId, u.unitClass, `${u.pos?.x},${u.pos?.y}`, u.hp,
            u.hasMoved ? 1 : 0, u.hasActed ? 1 : 0, u.status ?? 'normal',
            u.level ?? 0, u.exp ?? 0, u.hasBeenSupportedThisTurn ? 1 : 0,
            u.hasBeenHealedThisTurn ? 1 : 0,
        ].join(':'))
        .sort()
        .join(';');
    const buildings: string[] = [];
    const tiles = state.map?.tiles ?? [];
    for (let y = 0; y < (state.map?.height ?? 0); y += 1) {
        for (let x = 0; x < (state.map?.width ?? 0); x += 1) {
            const tile: any = tiles[y]?.[x];
            if (!tile) continue;
            const key = tile.terrain ?? tile.type ?? 'unknown';
            if (key === 'castle' || key === 'town' || key === 'damaged_town') {
                buildings.push(`${x},${y}:${key}:${tile.ownerId ?? 'null'}`);
            }
        }
    }
    return canonicalJson({
        mapName,
        turn: state.turn,
        currentPlayer: state.currentPlayer,
        pendingUnitId: state.pendingUnitId ?? 'none',
        winner: state.winner ?? 'none',
        subject: subjectPlayerId,
        players,
        units,
        buildings: buildings.sort().join(';'),
        rules: (state as any).rules ?? null,
    });
}

export function canonicalStateSha256(state: GameState, subjectPlayerId: number, hash: SnapshotHashFns): string {
    return hash.sha256Hex(behavioralSnapshotPayload(state, subjectPlayerId));
}

export function setupIdOf(setup?: ApkSkirmishSetupSelection | null): string {
    if (!setup) return 'default';
    const gold = setup.initialGold ?? 'default';
    const limit = setup.unitLimit ?? 'default';
    const cap = setup.levelCap ?? 'default';
    return `g${gold}_u${limit}_c${cap}`;
}

export function rulesHashOf(state: GameState, hash: SnapshotHashFns): string {
    return hash.sha256Hex(JSON.stringify((state as any).rules ?? null));
}

/**
 * Normalise a state for snapshotting: attach the map name explicitly (the match
 * runner sets it after construction) and drop non-positional metadata.
 */
export function normalizeStateForSnapshot(state: GameState, mapName: string): GameState {
    const clone: any = JSON.parse(JSON.stringify(state));
    clone.mapName = mapName;
    delete clone.metadata;
    return clone as GameState;
}

export function buildInitialSnapshot(
    state: GameState,
    mapName: string,
    setup: ApkSkirmishSetupSelection | null | undefined,
    subjectSeat: number,
    hash: SnapshotHashFns
): InitialSnapshot {
    const normalized = normalizeStateForSnapshot(state, mapName);
    return {
        schema: V11_INITIAL_SNAPSHOT_SCHEMA,
        mapName,
        mode: 'SD',
        setup: setup ?? null,
        setupId: setupIdOf(setup),
        subjectSeat,
        initialStateHash: canonicalStateSha256(normalized, subjectSeat, hash),
        rulesHash: rulesHashOf(normalized, hash),
        stateSha256: hash.sha256Hex(JSON.stringify(normalized)),
        state: normalized,
    };
}

/**
 * Verify a snapshot against its own recorded hashes. A snapshot that fails this
 * check is evidence of corruption, not a close-enough starting point.
 */
export function verifyInitialSnapshot(
    snapshot: InitialSnapshot,
    hash: SnapshotHashFns,
    mapName?: string
): { ok: boolean; reason: string | null } {
    const normalized = normalizeStateForSnapshot(snapshot.state, mapName ?? snapshot.mapName);
    const stateSha = hash.sha256Hex(JSON.stringify(normalized));
    if (stateSha !== snapshot.stateSha256) {
        return { ok: false, reason: `stateSha256 mismatch: ${stateSha} != ${snapshot.stateSha256}` };
    }
    const behavioural = canonicalStateSha256(normalized, snapshot.subjectSeat ?? 0, hash);
    if (behavioural !== snapshot.initialStateHash) {
        return { ok: false, reason: `initialStateHash mismatch: ${behavioural} != ${snapshot.initialStateHash}` };
    }
    return { ok: true, reason: null };
}
