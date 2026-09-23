/**
 * T12-04 headline metric: GLOBAL DISTINCT EPISODES after dedup.
 *
 * Rows are a misleading proxy for trajectory diversity: one episode contributes
 * 200-3,000 decision rows, so the ~97k rows in the raw pool are only a few dozen
 * distinct trajectories. This script measures the episode key
 * (scenario.id, seed, source.episodeIndex) directly for every input file, the
 * global union, and the subset/superset relations, then prepends a `headline`
 * block to v12/out/spatial/T12-04_dedup_report.json.
 *
 * Usage: node v12/tools/spatial_episode_dedup.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = 'training_runs/agent_upgrade_20260919_01/baseline_dataset';
const PARTS = Array.from({ length: 9 }, (_, i) => `${DIR}/dataset_part_0${i}.jsonl`);
const PVP = `${DIR}/dataset_part_pvp.jsonl`;
const BIG = `${DIR}/baseline_dataset.jsonl`;
const ALL = [...PARTS, PVP, BIG];

const RE_ID = /"scenario"\s*:\s*\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")/;
const RE_SEED = /"seed"\s*:\s*(-?\d+)/;
const RE_EP = /"episodeIndex"\s*:\s*(-?\d+)/;
const RE_WIN = /"winnerAfter"\s*:\s*(null|-?\d+)/;

function refOf(line) {
    const head = line.length > 1200 ? line.slice(0, 1200) : line;
    const sm = RE_ID.exec(head), se = RE_SEED.exec(head), em = RE_EP.exec(head);
    if (!sm || !se || !em) return null;
    let id; try { id = JSON.parse(sm[1]); } catch { return null; }
    const oi = line.lastIndexOf('"outcome"');
    let winner = undefined;
    if (oi >= 0) {
        const wm = RE_WIN.exec(line.slice(oi));
        if (!wm) return null;
        winner = wm[1] === 'null' ? null : Number(wm[1]);
    }
    return { epKey: `${id}#${se[1]}#${em[1]}`, srcKey: `${id}#${se[1]}`, winner };
}

async function scan(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return { path: rel, missing: true };
    const rows = { total: 0, extractionFailures: 0 };
    const eps = new Map();          // epKey -> rows
    const finals = new Map();       // epKey -> last non-null winner
    const srcKeys = new Set();      // (scenario.id, seed)
    const rl = readline.createInterface({ input: fs.createReadStream(abs, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        rows.total++;
        const r = refOf(line);
        if (!r) { rows.extractionFailures++; continue; }
        eps.set(r.epKey, (eps.get(r.epKey) ?? 0) + 1);
        srcKeys.add(r.srcKey);
        if (r.winner !== null && r.winner !== undefined) finals.set(r.epKey, r.winner);
    }
    return {
        path: rel, missing: false,
        bytes: fs.statSync(abs).size,
        rows: rows.total,
        extractionFailures: rows.extractionFailures,
        distinctEpisodes: eps.size,
        distinctScenarioSeedPairs: srcKeys.size,
        episodesWithTerminalWinner: finals.size,
        episodesCensored: eps.size - finals.size,
        rowsPerEpisode: { min: Math.min(...eps.values()), max: Math.max(...eps.values()), mean: +(rows.total / eps.size).toFixed(1) },
        _eps: eps, _finals: finals,
    };
}

const results = [];
for (const f of ALL) {
    const r = await scan(f);
    results.push(r);
    if (!r.missing) {
        console.log(
            `${path.basename(f).padEnd(26)} rows=${String(r.rows).padStart(6)} ` +
            `distinctEpisodes=${String(r.distinctEpisodes).padStart(3)} ` +
            `terminated=${String(r.episodesWithTerminalWinner).padStart(3)} censored=${String(r.episodesCensored).padStart(2)} ` +
            `rows/ep=${r.rowsPerEpisode.mean}`
        );
    }
}

// ---- global unions ----
const globalEps = new Map();      // epKey -> rows, over ALL files
const globalFinals = new Map();
for (const r of results) {
    if (r.missing) continue;
    for (const [k, n] of r._eps) globalEps.set(k, (globalEps.get(k) ?? 0) + n);
    for (const [k, v] of r._finals) globalFinals.set(k, v);
}

const partsEps = new Map(), pvpEps = new Map(), bigEps = new Map();
for (const r of results) {
    if (r.missing) continue;
    const base = path.basename(r.path);
    const target = base === 'dataset_part_pvp.jsonl' ? pvpEps : (base === 'baseline_dataset.jsonl' ? bigEps : partsEps);
    for (const [k, n] of r._eps) target.set(k, (target.get(k) ?? 0) + n);
}
const keysOf = m => new Set(m.keys());
const pE = keysOf(partsEps), vE = keysOf(pvpEps), bE = keysOf(bigEps);
const overlapCount = (a, b) => { let n = 0; for (const k of a) if (b.has(k)) n++; return n; };

const rel = (sub, sup, subName, supName) => {
    const shared = overlapCount(sub, sup);
    const onlySub = sub.size - shared;
    const onlySup = sup.size - shared;
    let relation;
    if (shared === 0) relation = `DISJOINT (no shared episode keys)`;
    else if (onlySub === 0 && onlySup === 0) relation = 'identical';
    else if (onlySub === 0) relation = `${supName} is a strict SUPERSET of ${subName}`;
    else if (onlySup === 0) relation = `${subName} is a strict SUPERSET of ${supName}`;
    else relation = 'PARTIAL overlap';
    return { relation, [`${subName}Episodes`]: sub.size, [`${supName}Episodes`]: sup.size, shared, onlyInThis: onlySub, onlyInOther: onlySup };
};

const rowsPerEpisodeAll = [...globalEps.values()].sort((a, b) => a - b);

// what the fixed converter actually produced (baseline only, deduped)
const produced = JSON.parse(fs.readFileSync(path.join(ROOT, 'v12/out/spatial/T12-04_dataset_report.json'), 'utf8'));

const headline = {
    why: 'Rows per episode are 200-3,000, so row counts massively overstate trajectory diversity. Episode keys are the unit that matters for the grouped train/val split.',
    episodeKeyDefinition: '(scenario.id, seed, source.episodeIndex) = `${scenarioId}#${seed}#${episodeIndex}`',
    rawPool: {
        filesScanned: ALL.length,
        totalRowsAcrossFiles: results.reduce((a, r) => a + (r.rows ?? 0), 0),
        sumOfPerFileDistinctEpisodes: results.reduce((a, r) => a + (r.distinctEpisodes ?? 0), 0),
        GLOBAL_DISTINCT_EPISODES_AFTER_DEDUP: globalEps.size,
        GLOBAL_EPISODES_WITH_TERMINAL_WINNER: globalFinals.size,
        GLOBAL_EPISODES_CENSORED: globalEps.size - globalFinals.size,
        duplicateEpisodeKeyAppearances: results.reduce((a, r) => a + (r.distinctEpisodes ?? 0), 0) - globalEps.size,
        rowsPerEpisodeAcrossAllFilesWithDuplicates: {
            note: 'These counts SUM rows for a key over every file it appears in, so they double-count the duplicated pool. The deduplicated distribution is dedupedPool.rowsPerEpisode.',
            min: rowsPerEpisodeAll[0], median: rowsPerEpisodeAll[Math.floor(rowsPerEpisodeAll.length / 2)],
            max: rowsPerEpisodeAll[rowsPerEpisodeAll.length - 1],
            mean: +(results.reduce((a, r) => a + (r.rows ?? 0), 0) / globalEps.size).toFixed(1),
        },
    },
    dedupedPool: {
        note: 'baseline_dataset.jsonl alone is a byte-exact superset of the other 10 files, so the deduplicated pool is that file. The converter produced spatial_v2_full_pool.jsonl from it with dedupeSamples on.',
        distinctEpisodes: produced.totals.episodes,
        samples: produced.totals.samples,
        episodesWithTerminalWinner: produced.valueTarget.episodesWithAtLeastOneNonNullValue,
        episodesCensored: produced.valueTarget.episodesEntirelyCensored_nullValue,
        rowsPerEpisode: produced.episodeSizeSamples,
    },
    episodeKeyRelations: {
        partsUnion_vs_baseline: rel(pE, bE, 'partsUnion', 'baselineDataset'),
        pvp_vs_baseline: rel(vE, bE, 'pvp', 'baselineDataset'),
        partsUnion_vs_pvp: rel(pE, vE, 'partsUnion', 'pvp'),
        partsUnion_plus_pvp_vs_baseline: rel(new Set([...pE, ...vE]), bE, 'partsPlusPvp', 'baselineDataset'),
        partsPlusPvpEpisodeSum: pE.size + vE.size,
        baselineEpisodes: bE.size,
    },
    perFile: results.map(({ _eps, _finals, ...rest }) => rest),
};

const reportPath = path.join(ROOT, 'v12/out/spatial/T12-04_dedup_report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const patched = { ...report, headline }; // `headline` LAST: an older report already carries a `headline` key
fs.writeFileSync(reportPath, JSON.stringify(patched, null, 2));

console.log('\n=== GLOBAL DEDUP (episode keys) ===');
console.log(JSON.stringify(headline.rawPool, null, 2));
console.log(JSON.stringify(headline.episodeKeyRelations, null, 2));
console.log(`\npatched ${reportPath}`);
