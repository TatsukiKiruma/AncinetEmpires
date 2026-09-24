/**
 * V13/T13-02: real regression tests for the v3 evaluation core.
 *
 * These run through the repository's in-process TypeScript runner, because the
 * sandbox denies the child-process spawn that vitest/esbuild needs. The runner is the
 * same one the v12 tools use, so this is a real execution of the real module, not a
 * re-implementation. The test asserts on `eval_v3_core.ts`, the exact code the
 * evaluation harness imports.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_v3_core.test.ts
 *
 * Exit code 0 = all assertions passed.
 */
import * as assert from 'node:assert/strict';
import {
    classifyOutcome,
    isError,
    isNatural,
    isUndecided,
    streamFor,
    type OutcomeInputs,
    type OutcomeKind,
} from './eval_v3_core';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        console.log(`  FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const base: OutcomeInputs = {
    engineError: null,
    policyError: null,
    cancelled: false,
    wallTimeout: false,
    winner: null,
    winnerAlliance: null,
    candidateAlliance: 0,
    steps: 10,
    maxSteps: 100,
    plies: 10,
    maxPlies: null,
};

const kind = (over: Partial<OutcomeInputs>): OutcomeKind => classifyOutcome({ ...base, ...over });

console.log('[T13-02] eval_v3_core classification tests');

test('candidate alliance winning is NATURAL_WIN', () => {
    assert.equal(kind({ winner: 2, winnerAlliance: 2, candidateAlliance: 2 }), 'NATURAL_WIN');
});

test('another alliance winning is NATURAL_LOSS', () => {
    assert.equal(kind({ winner: 3, winnerAlliance: 3, candidateAlliance: 2 }), 'NATURAL_LOSS');
});

test('the comparison is on ALLIANCES, not seat ids', () => {
    assert.equal(kind({ winner: 7, winnerAlliance: 7, candidateAlliance: 7 }), 'NATURAL_WIN');
    assert.equal(kind({ winner: 0, winnerAlliance: 0, candidateAlliance: 5 }), 'NATURAL_LOSS');
});

test('winner === -1 is a natural draw, NOT a truncation (D13-07)', () => {
    const k = kind({ winner: -1, winnerAlliance: -1 });
    assert.equal(k, 'NATURAL_DRAW');
    assert.equal(isNatural(k), true);
    assert.equal(isUndecided(k), false);
    assert.equal(isError(k), false);
});

test('a step cap with no winner is STEP_LIMIT', () => {
    assert.equal(kind({ winner: null, steps: 100, maxSteps: 100 }), 'STEP_LIMIT');
});

test('a ply cap is PLY_LIMIT and wins over STEP_LIMIT', () => {
    assert.equal(kind({ winner: null, steps: 5, maxSteps: 100, plies: 1200, maxPlies: 1200 }), 'PLY_LIMIT');
});

test('a wall-clock stop is WALL_TIMEOUT', () => {
    assert.equal(kind({ winner: null, wallTimeout: true }), 'WALL_TIMEOUT');
});

test('a cancellation is CANCELLED', () => {
    assert.equal(kind({ winner: null, cancelled: true }), 'CANCELLED');
});

test('an engine error is never folded into a draw or a limit', () => {
    const k = kind({ winner: null, engineError: 'illegal action', steps: 100, maxSteps: 100 });
    assert.equal(k, 'ENGINE_ERROR');
    assert.equal(isError(k), true);
    assert.equal(isUndecided(k), false);
    assert.equal(isNatural(k), false);
});

test('a policy error is never folded into a draw or a limit', () => {
    assert.equal(kind({ winner: null, policyError: 'no action', steps: 100, maxSteps: 100 }), 'POLICY_ERROR');
});

test('a rule verdict wins even when a budget was also exhausted', () => {
    assert.equal(
        kind({ winner: 1, winnerAlliance: 1, candidateAlliance: 1, steps: 100, maxSteps: 100 }),
        'NATURAL_WIN',
    );
});

test('an exit with no verdict and no budget reached is an engine-side failure', () => {
    assert.equal(kind({ winner: null, steps: 3, maxSteps: 100, maxPlies: null }), 'ENGINE_ERROR');
});

test('the taxonomy partitions cleanly', () => {
    const all: OutcomeKind[] = [
        'NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW', 'STEP_LIMIT', 'PLY_LIMIT',
        'WALL_TIMEOUT', 'CANCELLED', 'POLICY_ERROR', 'ENGINE_ERROR',
    ];
    for (const k of all) {
        const buckets = [isNatural(k), isUndecided(k), isError(k)].filter(Boolean).length;
        assert.ok(buckets <= 1, `${k} landed in ${buckets} buckets`);
    }
    assert.deepEqual(all.filter(isNatural), ['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW']);
    assert.deepEqual(all.filter(isUndecided), ['STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED']);
    assert.deepEqual(all.filter(isError), ['POLICY_ERROR', 'ENGINE_ERROR']);
});

console.log('[T13-02] stream determinism tests');

test('streamFor is deterministic for a given (seed, seat)', () => {
    const a = Array.from({ length: 5 }, () => streamFor(2026070501, 2)());
    const b = Array.from({ length: 5 }, () => streamFor(2026070501, 2)());
    assert.deepEqual(a, b);
});

test('streamFor differs across seats and across seeds', () => {
    const seat0 = Array.from({ length: 4 }, () => streamFor(2026070501, 0)());
    const seat1 = Array.from({ length: 4 }, () => streamFor(2026070501, 1)());
    const otherSeed = Array.from({ length: 4 }, () => streamFor(2026070502, 0)());
    assert.notDeepEqual(seat0, seat1, 'seats must not share a stream');
    assert.notDeepEqual(seat0, otherSeed, 'seeds must not share a stream');
});

test('every stream value is in [0, 1)', () => {
    const rng = streamFor(2026070501, 3);
    for (let i = 0; i < 2000; i++) {
        const v = rng();
        assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
});

test('seat parity is NOT the same variable as seed parity', () => {
    // The V12 confound: |seed| % 2 decided seat assignment. Here seat and seed are
    // independent inputs, so an even seed with an odd seat is a real, distinct stream.
    const evenSeedOddSeat = streamFor(2026070502, 3)();
    const evenSeedEvenSeat = streamFor(2026070502, 0)();
    assert.notEqual(evenSeedOddSeat, evenSeedEvenSeat);
});

console.log();
if (failures.length) {
    console.error(`[T13-02] FAILED ${failures.length}/${passed + failures.length}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`[T13-02] PASSED ${passed}/${passed}`);
