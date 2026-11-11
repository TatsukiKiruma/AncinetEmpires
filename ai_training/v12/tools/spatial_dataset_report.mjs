/**
 * T12-04 dataset report for the produced spatial v2 dataset.
 *
 * Independently re-derives `episodeKey -> LAST non-null outcome.winnerAfter` from
 * the SOURCE pool (baseline_dataset.jsonl) and then verifies, sample by sample,
 * that the produced dataset's `valueTarget` is exactly
 *   finalWinner === playerId ? +1 : -1   when the episode terminated
 *   null                                 when the episode never terminated (censored)
 *
 * Usage: node v12/tools/spatial_dataset_report.mjs [datasetPath] [sourcePath]
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const ROOT = process.cwd();
const DATASET = process.argv[2] ?? 'training_runs/spatial_dataset/spatial_v2_full_pool.jsonl';
const SOURCE = process.argv[3] ?? 'training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl';

const SCENARIO_RE = /"scenario"\s*:\s*\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")/;
const SEED_RE = /"seed"\s*:\s*(-?\d+)/;
const EPISODE_INDEX_RE = /"episodeIndex"\s*:\s*(-?\d+)/;
const WINNER_RE = /"winnerAfter"\s*:\s*(null|-?\d+)/;

/** Cheap independent re-derivation (deliberately does NOT reuse converter code). */
function refOf(line) {
    const head = line.length > 1200 ? line.slice(0, 1200) : line;
    const sm = SCENARIO_RE.exec(head), se = SEED_RE.exec(head), em = EPISODE_INDEX_RE.exec(head);
    if (!sm || !se || !em) return null;
    let id; try { id = JSON.parse(sm[1]); } catch { return null; }
    const oi = line.lastIndexOf('"outcome"');
    let winner = undefined;
    if (oi >= 0) {
        const wm = WINNER_RE.exec(line.slice(oi));
        if (!wm) return null;
        winner = wm[1] === 'null' ? null : Number(wm[1]);
    }
    return { key: `${id}#${se[1]}#${em[1]}`, winner };
}

// ---- 1. independent re-derivation of episode final winners from the source pool ----
const refFinals = new Map();
const refEpisodes = new Set();
let srcLines = 0, srcRefFail = 0;
{
    const t = Date.now();
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(ROOT, SOURCE), { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        srcLines++;
        const r = refOf(line);
        if (!r) { srcRefFail++; continue; }
        refEpisodes.add(r.key);
        if (r.winner !== null && r.winner !== undefined) refFinals.set(r.key, r.winner);
    }
    console.log(`[source] ${SOURCE}: ${srcLines} lines, ${refEpisodes.size} episodes, ${refFinals.size} terminated, refFail=${srcRefFail} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

// ---- 2. walk the produced dataset ----
const dsAbs = path.join(ROOT, DATASET);
const dsBytes = fs.statSync(dsAbs).size;
const perEpisode = new Map(); // rootFamilyId -> {n, values:Set, steps:Set, nullCount, pos, neg}
let total = 0, parseFail = 0, emptyRoot = 0, missingRoot = 0;
let valueNonNull = 0, valueNull = 0, valuePos = 0, valueNeg = 0, valueOther = 0;
let missingStep = 0, missingTurn = 0, missingPlayer = 0, missingEpisodeId = 0;
let rootNeEpisodeId = 0, duplicateSampleIds = 0;
let valueMismatchVsSource = 0, valueNonNullOnCensoredEpisode = 0, valueNullOnTerminatedEpisode = 0;
const mismatchExamples = [];
const sampleIds = new Set();
let maxCandidates = 0, minCandidates = Infinity;
let tensorLenMismatch = 0, globalLenMismatch = 0, labelOutOfRange = 0;
const keySignatures = new Map();

{
    const t = Date.now();
    const rl = readline.createInterface({ input: fs.createReadStream(dsAbs, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        total++;
        let s;
        try { s = JSON.parse(line); } catch { parseFail++; continue; }
        keySignatures.set(Object.keys(s).join(','), (keySignatures.get(Object.keys(s).join(',')) ?? 0) + 1);

        if (!('rootFamilyId' in s)) missingRoot++;
        else if (s.rootFamilyId === null || s.rootFamilyId === '') emptyRoot++;
        if (s.episodeId === null || s.episodeId === undefined || s.episodeId === '') missingEpisodeId++;
        if (s.step === null || s.step === undefined) missingStep++;
        if (s.turn === null || s.turn === undefined) missingTurn++;
        if (s.playerId === null || s.playerId === undefined) missingPlayer++;
        if (s.rootFamilyId !== s.episodeId) rootNeEpisodeId++;
        if (sampleIds.has(s.sampleId)) duplicateSampleIds++; else sampleIds.add(s.sampleId);

        const c = s.candidateActions ?? [];
        if (c.length > maxCandidates) maxCandidates = c.length;
        if (c.length < minCandidates) minCandidates = c.length;
        if (s.targetActionIndex < 0 || s.targetActionIndex >= c.length) labelOutOfRange++;
        if (!Array.isArray(s.spatialTensor) || s.spatialTensor.length !== 24 * 20 * 20) tensorLenMismatch++;
        if (!Array.isArray(s.globalFeatures)) globalLenMismatch++;

        const root = s.rootFamilyId;
        let agg = perEpisode.get(root);
        if (!agg) { agg = { n: 0, nullCount: 0, pos: 0, neg: 0, steps: new Set() }; perEpisode.set(root, agg); }
        agg.n++;
        agg.steps.add(s.step);
        const v = s.valueTarget;
        if (v === null || v === undefined) { valueNull++; agg.nullCount++; }
        else {
            valueNonNull++;
            if (v === 1) { valuePos++; agg.pos++; } else if (v === -1) { valueNeg++; agg.neg++; } else valueOther++;
        }

        // ---- value-target correctness vs the independent source re-derivation ----
        const finalWinner = refFinals.get(root);
        if (finalWinner === undefined) {
            if (v !== null && v !== undefined) {
                valueNonNullOnCensoredEpisode++;
                if (mismatchExamples.length < 5) mismatchExamples.push({ sampleId: s.sampleId, root, got: v, expected: null, why: 'episode has no terminal winner in source' });
            }
        } else {
            const expected = finalWinner === s.playerId ? 1 : -1;
            if (v === null || v === undefined) {
                valueNullOnTerminatedEpisode++;
                if (mismatchExamples.length < 5) mismatchExamples.push({ sampleId: s.sampleId, root, got: null, expected, why: 'episode terminated in source' });
            } else if (v !== expected) {
                valueMismatchVsSource++;
                if (mismatchExamples.length < 5) mismatchExamples.push({ sampleId: s.sampleId, root, got: v, expected, finalWinner, playerId: s.playerId });
            }
        }
    }
    console.log(`[dataset] ${DATASET}: ${total} lines (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

const episodeSizes = [...perEpisode.values()].map(a => a.n).sort((a, b) => a - b);
const q = (p) => episodeSizes.length ? episodeSizes[Math.min(episodeSizes.length - 1, Math.floor(p * episodeSizes.length))] : null;

// Inconsistency: an episode must not have BOTH null and non-null valueTargets.
const mixedEpisodes = [...perEpisode.entries()].filter(([, a]) => a.nullCount > 0 && (a.pos + a.neg) > 0).map(([k]) => k);
// An episode must not have both +1 and -1.
const splitSignEpisodes = [...perEpisode.entries()].filter(([, a]) => a.pos > 0 && a.neg > 0).map(([k]) => k);

const episodesWithNonNullValue = [...perEpisode.values()].filter(a => a.pos + a.neg > 0).length;
const episodesCensored = perEpisode.size - episodesWithNonNullValue;

const report = {
    headline: {
        rowsAreNotTrajectories: 'one episode contributes 200-3000 decision rows; episode counts are the meaningful diversity measure',
        distinctEpisodes: perEpisode.size,
        episodesWithTerminalWinner: episodesWithNonNullValue,
        episodesCensored: episodesCensored,
        samples: total,
        samplesWithNonNullValueTarget: valueNonNull,
        rowsPerEpisode: {
            min: episodeSizes[0] ?? null,
            median: episodeSizes.length ? episodeSizes[Math.floor(episodeSizes.length / 2)] : null,
            max: episodeSizes[episodeSizes.length - 1] ?? null,
            mean: episodeSizes.length ? +(total / episodeSizes.length).toFixed(1) : null,
        },
    },
    generatedAtUtc: new Date().toISOString(),
    dataset: DATASET,
    datasetBytes: dsBytes,
    datasetBytesGiB: +(dsBytes / 1024 ** 3).toFixed(3),
    sourcePool: SOURCE,
    totals: {
        samples: total,
        parseFailures: parseFail,
        uniqueRootFamilyIds: perEpisode.size,
        episodes: perEpisode.size,
        duplicateSampleIds,
        distinctSampleIds: sampleIds.size,
    },
    episodeIdentity: {
        rootFamilyIdFieldAbsent: missingRoot,
        rootFamilyIdEmpty: emptyRoot,
        episodeIdEmptyOrAbsent: missingEpisodeId,
        rootFamilyIdNotEqualToEpisodeId: rootNeEpisodeId,
        rootFamilyIdNonEmptyPct: total ? +(100 * (total - missingRoot - emptyRoot) / total).toFixed(4) : null,
    },
    freeFields: { stepNull: missingStep, turnNull: missingTurn, playerIdNull: missingPlayer },
    valueTarget: {
        nonNull: valueNonNull,
        null: valueNull,
        nonNullPct: total ? +(100 * valueNonNull / total).toFixed(3) : null,
        plusOne: valuePos,
        minusOne: valueNeg,
        otherValue: valueOther,
        episodesWithAtLeastOneNonNullValue: episodesWithNonNullValue,
        episodesEntirelyCensored_nullValue: episodesCensored,
        episodesWithBothNullAndNonNull: mixedEpisodes.length,
        episodesWithBothPlusAndMinusOne: splitSignEpisodes.length,
    },
    episodeSizeSamples: {
        min: episodeSizes[0] ?? null,
        p25: q(0.25), median: q(0.5), p75: q(0.75),
        max: episodeSizes[episodeSizes.length - 1] ?? null,
        mean: episodeSizes.length ? +(total / episodeSizes.length).toFixed(1) : null,
    },
    structuralChecks: {
        candidateActionsMin: Number.isFinite(minCandidates) ? minCandidates : null,
        candidateActionsMax: maxCandidates,
        targetActionIndexOutOfRange: labelOutOfRange,
        spatialTensorWrongLength: tensorLenMismatch,
        globalFeaturesNotArray: globalLenMismatch,
        keySignatures: [...keySignatures.entries()].map(([keys, count]) => ({ keys, count })),
    },
    independentValueVerification: {
        method: 're-derived episodeKey -> LAST non-null outcome.winnerAfter directly from the source pool, then compared against every emitted (rootFamilyId, playerId, valueTarget) triple',
        sourceLinesScanned: srcLines,
        sourceExtractionFailures: srcRefFail,
        sourceEpisodes: refEpisodes.size,
        sourceEpisodesWithTerminalWinner: refFinals.size,
        samplesWhereValueDisagreesWithSource: valueMismatchVsSource,
        samplesWithNonNullValueOnCensoredEpisode: valueNonNullOnCensoredEpisode,
        samplesWithNullValueOnTerminatedEpisode: valueNullOnTerminatedEpisode,
        everyNonNullValueExplainedByTerminatedEpisode: (valueMismatchVsSource + valueNonNullOnCensoredEpisode) === 0,
        everyCensoredEpisodeSampleIsNull: valueNullOnTerminatedEpisode === 0,
        mismatchExamples,
    },
};

const out = path.join(ROOT, 'v12/out/spatial/T12-04_dataset_report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nwrote ${out}`);
