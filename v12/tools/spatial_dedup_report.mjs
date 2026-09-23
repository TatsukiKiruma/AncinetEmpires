/**
 * T12-04 dedup / overlap analysis.
 *
 * Sample key := `(scenario.id, seed, step)` serialised as `${scenarioId}|${seed}|${step}`.
 *
 * The 7.27 GB baseline_dataset.jsonl must NOT be loaded into memory: we stream it
 * line by line and only retain the key string. ~230k key strings total is a few MB.
 *
 * For speed the three key fields are pulled out of the first 1024 bytes of each
 * line (they are always within the first ~600 bytes, verified below by a
 * JSON.parse cross-check on a random sample). `winnerAfter` lives at the very end
 * of the line, so it is read from the line tail.
 *
 * Usage: node v12/tools/spatial_dedup_report.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = 'training_runs/agent_upgrade_20260919_01/baseline_dataset';
const PARTS = Array.from({ length: 9 }, (_, i) => `${DIR}/dataset_part_0${i}.jsonl`);
const PVP = `${DIR}/dataset_part_pvp.jsonl`;
const BIG = `${DIR}/baseline_dataset.jsonl`;

const HEAD_CHARS = 1024;

function parseKeyFromHead(head) {
    // scenario.id  -> locate `"scenario":{` then take the balanced-ish first object
    const si = head.indexOf('"scenario":');
    if (si < 0) return null;
    const braceStart = head.indexOf('{', si);
    const braceEnd = head.indexOf('}', braceStart);
    if (braceStart < 0 || braceEnd < 0) return null;
    let scenarioId;
    try { scenarioId = JSON.parse(head.slice(braceStart, braceEnd + 1)).id; } catch { return null; }
    const seedM = /"seed":(-?\d+)/.exec(head);
    const stepM = /"step":(-?\d+)/.exec(head);
    const epM = /"episodeIndex":(-?\d+)/.exec(head);
    if (!seedM || !stepM || scenarioId === undefined || scenarioId === null) return null;
    return { scenarioId: String(scenarioId), seed: seedM[1], step: stepM[1], episodeIndex: epM ? epM[1] : null };
}

function tailWinner(line) {
    const tail = line.slice(Math.max(0, line.length - 160));
    const m = /"winnerAfter":(null|-?\d+)/.exec(tail);
    if (!m) return { found: false, winner: null };
    return { found: true, winner: m[1] === 'null' ? null : Number(m[1]) };
}

async function scanFile(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return { path: rel, missing: true };
    const bytes = fs.statSync(abs).size;
    const keys = new Set();
    const episodeKeys = new Set();          // scenarioId|seed|episodeIndex
    const episodeFinalWinner = new Map();   // episode key -> last non-null winnerAfter
    let lines = 0, keyFail = 0, winnerMissing = 0, terminated = 0;
    let checked = 0, checkedMismatch = 0;

    const rl = readline.createInterface({ input: fs.createReadStream(abs, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        lines++;
        const k = parseKeyFromHead(line.slice(0, HEAD_CHARS));
        if (!k) { keyFail++; continue; }
        keys.add(`${k.scenarioId}|${k.seed}|${k.step}`);
        if (k.episodeIndex !== null) {
            const ek = `${k.scenarioId}|${k.seed}|${k.episodeIndex}`;
            episodeKeys.add(ek);
            const w = tailWinner(line);
            if (!w.found) winnerMissing++;
            else if (w.winner !== null) {
                terminated++;
                episodeFinalWinner.set(ek, w.winner);
            }
        }
        // cross-check the fast extractor against a real JSON.parse on a sparse sample
        if (lines % 2000 === 1) {
            try {
                const o = JSON.parse(line);
                checked++;
                const okId = String(o.scenario?.id) === k.scenarioId;
                const okSeed = String(o.seed) === k.seed;
                const okStep = String(o.step) === k.step;
                const w2 = o.outcome?.winnerAfter ?? null;
                const okW = (w2 === null ? null : Number(w2)) === tailWinner(line).winner;
                if (!(okId && okSeed && okStep && okW)) checkedMismatch++;
            } catch { checkedMismatch++; }
        }
    }
    return {
        path: rel, missing: false, bytes, lines,
        uniqueKeys: keys.size, duplicateKeyLines: lines - keys.size,
        keyExtractionFailures: keyFail,
        episodes: episodeKeys.size,
        stepsWithTerminalOutcome: terminated,
        linesWhereWinnerFieldMissing: winnerMissing,
        episodesWithFinalWinner: episodeFinalWinner.size,
        _keys: keys, _eps: episodeKeys, _final: episodeFinalWinner,
        jsonParseCrossCheck: { checked, mismatches: checkedMismatch },
    };
}

const t0 = Date.now();
const partResults = [];
for (const p of PARTS) {
    const r = await scanFile(p);
    partResults.push(r);
    console.log(`[parts] ${path.basename(p)} lines=${r.lines ?? '-'} unique=${r.uniqueKeys ?? '-'} eps=${r.episodes ?? '-'} finalWin=${r.episodesWithFinalWinner ?? '-'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
const pvpResult = await scanFile(PVP);
console.log(`[pvp] lines=${pvpResult.lines} unique=${pvpResult.uniqueKeys} eps=${pvpResult.episodes} finalWin=${pvpResult.episodesWithFinalWinner} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
const bigResult = await scanFile(BIG);
console.log(`[baseline_dataset] lines=${bigResult.lines} unique=${bigResult.uniqueKeys} eps=${bigResult.episodes} finalWin=${bigResult.episodesWithFinalWinner} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// ---- overlap maths ----
const partsUnion = new Set();
for (const r of partResults) if (r._keys) for (const k of r._keys) partsUnion.add(k);
const pvpKeys = pvpResult._keys ?? new Set();
const bigKeys = bigResult._keys ?? new Set();

const overlap = (a, b) => { let n = 0; const it = a.size < b.size ? a : b; const other = a.size < b.size ? b : a; for (const k of it) if (other.has(k)) n++; return n; };

const bigVsParts = overlap(bigKeys, partsUnion);
const bigVsPvp = overlap(bigKeys, pvpKeys);
const partsVsPvp = overlap(partsUnion, pvpKeys);

const partsNotInBig = [...partsUnion].filter(k => !bigKeys.has(k)).length;
const bigNotInParts = [...bigKeys].filter(k => !partsUnion.has(k)).length;
const pvpNotInBig = [...pvpKeys].filter(k => !bigKeys.has(k)).length;

const unionAll = new Set([...bigKeys, ...partsUnion, ...pvpKeys]);

const report = {
    generatedAtUtc: new Date().toISOString(),
    keyDefinition: '(scenario.id, seed, step) serialised as `${scenarioId}|${seed}|${step}`',
    method: 'streaming readline; key fields extracted from first 1024 bytes of each line; winnerAfter from last 160 bytes; cross-checked against JSON.parse on a sparse sample',
    elapsedSeconds: +((Date.now() - t0) / 1000).toFixed(1),
    files: [...partResults, pvpResult, bigResult].map(({ _keys, _eps, _final, ...rest }) => rest),
    union: {
        partsUnionUniqueKeys: partsUnion.size,
        pvpUniqueKeys: pvpKeys.size,
        bigUniqueKeys: bigKeys.size,
        allFilesUniqueKeys: unionAll.size,
    },
    overlap: {
        baseline_vs_parts_union_sharedKeys: bigVsParts,
        baseline_vs_parts_union_partKeysNotInBaseline: partsNotInBig,
        baseline_vs_parts_union_extraKeysOnlyInBaseline: bigNotInParts,
        baseline_is_superset_of_parts_union: partsNotInBig === 0,
        baseline_vs_pvp_sharedKeys: bigVsPvp,
        pvpKeysNotInBaseline: pvpNotInBig,
        parts_union_vs_pvp_sharedKeys: partsVsPvp,
    },
    episodesWithFinalWinnerOverall: (() => {
        const m = new Map();
        for (const r of [...partResults, pvpResult, bigResult]) if (r._final) for (const [k, v] of r._final) m.set(k, v);
        return m.size;
    })(),
    episodesOverall: (() => {
        const s = new Set();
        for (const r of [...partResults, pvpResult, bigResult]) if (r._eps) for (const k of r._eps) s.add(k);
        return s.size;
    })(),
};

fs.mkdirSync(path.join(ROOT, 'v12/out/spatial'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'v12/out/spatial/T12-04_dedup_report.json'), JSON.stringify(report, null, 2));
console.log('\n' + JSON.stringify(report.overlap, null, 2));
console.log('\nwrote v12/out/spatial/T12-04_dedup_report.json');
