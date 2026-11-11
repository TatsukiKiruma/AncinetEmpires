/**
 * T12-03/T12-04 regression self-check for the converter's episode-identity and
 * value-label plumbing.
 *
 * Deliberately self-checking rather than vitest: `vitest.v11.config.mjs` has
 * `include: ['tools/**\/*.test.ts', 'src/**\/*.test.ts']`, so a test living under
 * `v12/tools/` would not be collected, and modifying the shared v11 vitest config
 * is out of scope for this task. This script therefore asserts directly and exits
 * non-zero on the first failure.
 *
 * Run:
 *   node v12/tools/spatial_run_tool.mjs v12/tools/spatial_converter_selfcheck.ts
 *
 * Scope note (honest): these are UNIT checks of the pure helpers plus the
 * overwrite guard. The two-pass value-broadcast behaviour is NOT unit-tested here;
 * it is verified end-to-end on the real 48,714-sample run by
 * `v12/tools/spatial_dataset_report.mjs` (independent re-derivation from the
 * source pool) - see v12/out/spatial/T12-04_dataset_report.json.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    episodeKeyFor,
    sampleDedupKeyFor,
    extractEpisodeRef,
    convertArchiveToSpatial
} from '../../tools/convert_archive_to_spatial';

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
    if (cond) {
        passed++;
        console.log(`  ok   ${name}`);
    } else {
        failures.push(`${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
        console.log(`  FAIL ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
    }
}

console.log('episodeKeyFor / sampleDedupKeyFor');
check('episode key is the readable scenario#seed#episodeIndex form',
    episodeKeyFor('SDPLAN:sd-normal:(4) Crossroads.aem', 2026070503, 0) === 'SDPLAN:sd-normal:(4) Crossroads.aem#2026070503#0',
    episodeKeyFor('SDPLAN:sd-normal:(4) Crossroads.aem', 2026070503, 0));
check('episode key is deterministic', episodeKeyFor('m', 7, 3) === episodeKeyFor('m', 7, 3));
check('episode key differs per episodeIndex', episodeKeyFor('m', 7, 3) !== episodeKeyFor('m', 7, 4));
check('episode key differs per seed', episodeKeyFor('m', 7, 3) !== episodeKeyFor('m', 8, 3));
check('episode key differs per scenario', episodeKeyFor('m1', 7, 3) !== episodeKeyFor('m2', 7, 3));
check('episode key rejects missing scenario', episodeKeyFor(undefined, 7, 3) === null);
check('episode key rejects missing seed', episodeKeyFor('m', null, 3) === null);
check('episode key rejects missing episodeIndex', episodeKeyFor('m', 7, undefined) === null);
check('dedup key uses pipes and ignores episodeIndex',
    sampleDedupKeyFor('SDPLAN:x', 5, 42) === 'SDPLAN:x|5|42', sampleDedupKeyFor('SDPLAN:x', 5, 42));
check('dedup key rejects missing step', sampleDedupKeyFor('m', 5, null) === null);

console.log('\nextractEpisodeRef — cheap path');
const base = {
    kind: 'skirmish_dataset_sample',
    source: { inputFile: 'x.jsonl', episodeIndex: 4, stepIndex: 9 },
    scenario: { id: 'SDPLAN:map:(2) Foo.aem', mode: 'SD' },
    seed: 123456,
    step: 77,
    turn: 12,
    playerId: 0,
    outcome: { reward: 0, done: false, winnerAfter: null, illegal: false }
};
const terminated = { ...base, outcome: { reward: 1, done: true, winnerAfter: 1, illegal: false } };
const censored = base;
const noOutcome = { ...base };
delete (noOutcome as any).outcome;

const rT = extractEpisodeRef(JSON.stringify(terminated));
check('terminated line -> episodeKey', rT?.episodeKey === 'SDPLAN:map:(2) Foo.aem#123456#4', rT?.episodeKey);
check('terminated line -> winnerAfter is the player id', rT?.winnerAfter === 1, rT?.winnerAfter);
check('terminated line -> dedup key', rT?.sampleKey === 'SDPLAN:map:(2) Foo.aem|123456|77', rT?.sampleKey);
check('terminated line -> did NOT need the JSON.parse fallback', rT?.viaFallback === false);

const rC = extractEpisodeRef(JSON.stringify(censored));
check('non-terminal line -> winnerAfter is null (not undefined)', rC?.winnerAfter === null, rC?.winnerAfter);
check('non-terminal line still carries the episode key', rC?.episodeKey === 'SDPLAN:map:(2) Foo.aem#123456#4');

const rN = extractEpisodeRef(JSON.stringify(noOutcome));
check('line without an outcome object -> winnerAfter undefined', rN?.winnerAfter === undefined, rN?.winnerAfter);
check('line without an outcome object -> hadOutcomeField false', rN?.hadOutcomeField === false);

console.log('\nextractEpisodeRef — JSON.parse fallback path');
// Push `scenario` beyond the 1,200-byte cheap-scan window so the cheap path must bail.
const padded = { filler: 'z'.repeat(4000), ...base };
check('cheap path bails, fallback still recovers the episode key',
    extractEpisodeRef(JSON.stringify(padded))?.episodeKey === 'SDPLAN:map:(2) Foo.aem#123456#4');
check('fallback is flagged as viaFallback',
    extractEpisodeRef(JSON.stringify(padded))?.viaFallback === true);
check('malformed JSON returns null rather than throwing', extractEpisodeRef('{"kind":') === null);

console.log('\nLAST non-null winnerAfter wins (the pass-1 rule)');
// Reproduce the pass-1 accumulation rule over a synthetic episode: the map write is
// unconditional for non-null winners and lines are consumed in file order.
const lines = [
    { ...base, outcome: { winnerAfter: null } },
    { ...base, outcome: { winnerAfter: 0 } },
    { ...base, outcome: { winnerAfter: null } }
];
const finals = new Map<string, number>();
for (const l of lines) {
    const r = extractEpisodeRef(JSON.stringify(l));
    if (r?.episodeKey && r.winnerAfter !== null && r.winnerAfter !== undefined) finals.set(r.episodeKey, r.winnerAfter);
}
check('a later null does not erase an earlier non-null winner',
    finals.get('SDPLAN:map:(2) Foo.aem#123456#4') === 0, [...finals.entries()]);

console.log('\noverwrite guard');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spatial-guard-'));
const existing = path.join(tmpDir, 'already-here.jsonl');
fs.writeFileSync(existing, 'sentinel');
let threw = false;
let message = '';
try {
    await convertArchiveToSpatial({ inputFiles: [], outputFile: existing });
} catch (e: any) {
    threw = true;
    message = String(e?.message ?? e);
}
check('refuses to overwrite an existing output', threw, message);
check('the existing file is byte-untouched', fs.readFileSync(existing, 'utf8') === 'sentinel');
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log('ALL SELF-CHECKS PASSED');
