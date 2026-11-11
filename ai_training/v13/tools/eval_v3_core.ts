/**
 * V13/T13-02: pure classification and determinism core for the v3 evaluation
 * protocol. Kept separate from `eval_paired_v3.ts` so it can be unit tested without
 * executing the harness entry point.
 *
 * The decisive rule here is D13-07: `state.winner === -1` is a REAL DRAW in this
 * engine (src/game/engine.ts:991), not a truncation. The old protocol used
 * `capped = winner === null`, which also had no bucket for an engine error.
 */

/** V13/C2: every game must land in exactly one of these. */
export type OutcomeKind =
    | 'NATURAL_WIN'
    | 'NATURAL_LOSS'
    | 'NATURAL_DRAW'
    | 'STEP_LIMIT'
    | 'PLY_LIMIT'
    | 'WALL_TIMEOUT'
    | 'CANCELLED'
    | 'POLICY_ERROR'
    | 'ENGINE_ERROR';

const UNDECIDED: ReadonlySet<OutcomeKind> = new Set<OutcomeKind>([
    'STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED',
]);
const ERRORS: ReadonlySet<OutcomeKind> = new Set<OutcomeKind>(['POLICY_ERROR', 'ENGINE_ERROR']);

/** Undecided: the harness stopped the game before the rules did. Not a loss. */
export function isUndecided(kind: OutcomeKind): boolean {
    return UNDECIDED.has(kind);
}

/** An error is never a draw, a loss or a truncation. */
export function isError(kind: OutcomeKind): boolean {
    return ERRORS.has(kind);
}

/** A natural verdict is one the RULES produced, not one the harness imposed. */
export function isNatural(kind: OutcomeKind): boolean {
    return kind === 'NATURAL_WIN' || kind === 'NATURAL_LOSS' || kind === 'NATURAL_DRAW';
}

export interface OutcomeInputs {
    engineError: string | null;
    policyError: string | null;
    cancelled: boolean;
    wallTimeout: boolean;
    winner: number | null;
    winnerAlliance: number | null;
    candidateAlliance: number | null;
    steps: number;
    maxSteps: number;
    plies: number;
    maxPlies: number | null;
}

export function classifyOutcome(opts: OutcomeInputs): OutcomeKind {
    if (opts.cancelled) return 'CANCELLED';
    if (opts.policyError) return 'POLICY_ERROR';
    if (opts.engineError) return 'ENGINE_ERROR';
    if (opts.winner !== null) {
        if (opts.winner === -1) return 'NATURAL_DRAW';
        return opts.candidateAlliance !== null && opts.winner === opts.candidateAlliance
            ? 'NATURAL_WIN'
            : 'NATURAL_LOSS';
    }
    if (opts.wallTimeout) return 'WALL_TIMEOUT';
    if (opts.maxPlies !== null && opts.plies >= opts.maxPlies) return 'PLY_LIMIT';
    if (opts.steps >= opts.maxSteps) return 'STEP_LIMIT';
    // The loop exited without a rule verdict and without hitting a declared budget.
    // Labelling that a truncation would hide a harness defect.
    return 'ENGINE_ERROR';
}

/** Deterministic PRNG. Never Math.random. */
export function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Deterministic, independent, seat-stable stream.
 *
 * The seat mixes in through its own constant, so seat parity, policy assignment and
 * seed choice are not the same variable. That was the V12 confound where
 * `|episodeSeed| % 2` decided where the heuristic sat
 * (tools/skirmish_training_runner.ts:1028 vs tools/sd_training_state_generator.ts:157).
 */
export function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}
