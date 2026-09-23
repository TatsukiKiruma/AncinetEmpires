/**
 * T12-04 supplementary evidence: are the shared keys the SAME RECORDS?
 *
 * The dedup report shows the key sets partition exactly
 * (|parts| + |pvp| = 22,830 + 25,884 = 48,714 = |baseline|, disjoint).
 * Key-set arithmetic alone does not prove the *contents* match, so this script
 * hashes every line (sha1 of the raw line text) keyed by (scenario.id, seed, step)
 * for the parts + pvp, then re-streams baseline_dataset.jsonl and compares.
 *
 * Memory: 48,714 key -> sha1 entries (a few MB). The 7.27 GB file is streamed.
 *
 * Usage: node v12/tools/spatial_pool_identity_check.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DIR = 'training_runs/agent_upgrade_20260919_01/baseline_dataset';
const PARTS = Array.from({ length: 9 }, (_, i) => `${DIR}/dataset_part_0${i}.jsonl`);
const PVP = `${DIR}/dataset_part_pvp.jsonl`;
const BIG = `${DIR}/baseline_dataset.jsonl`;

const SCENARIO_RE = /"scenario"\s*:\s*\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")/;
const SEED_RE = /"seed"\s*:\s*(-?\d+)/;
const STEP_RE = /"step"\s*:\s*(-?\d+)/;

function keyOf(line) {
    const head = line.length > 1200 ? line.slice(0, 1200) : line;
    const sm = SCENARIO_RE.exec(head), se = SEED_RE.exec(head), st = STEP_RE.exec(head);
    if (!sm || !se || !st) return null;
    let id; try { id = JSON.parse(sm[1]); } catch { return null; }
    return `${id}|${se[1]}|${st[1]}`;
}
const sha1 = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex');

async function hashFile(rel, map) {
    const abs = path.join(ROOT, rel);
    const rl = readline.createInterface({ input: fs.createReadStream(abs, { encoding: 'utf8' }), crlfDelay: Infinity });
    let lines = 0, noKey = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        lines++;
        const k = keyOf(line);
        if (!k) { noKey++; continue; }
        const h = sha1(line);
        if (map.has(k)) map.get(k).push(h); else map.set(k, [h]);
    }
    return { lines, noKey };
}

const sideMap = new Map();
const perFile = [];
for (const f of [...PARTS, PVP]) {
    const r = await hashFile(f, sideMap);
    perFile.push({ file: f, ...r });
    console.log(`[side] ${path.basename(f)} lines=${r.lines} noKey=${r.noKey}`);
}

const bigMap = new Map();
const bigStats = await hashFile(BIG, bigMap);
console.log(`[big] lines=${bigStats.lines} noKey=${bigStats.noKey}`);

let sameHash = 0, diffHash = 0, keyOnlyInBig = 0, multiHashKeys = 0;
const diffExamples = [];
for (const [k, hashes] of sideMap) {
    if (hashes.length > 1) multiHashKeys++;
    const b = bigMap.get(k);
    if (!b) { diffHash++; if (diffExamples.length < 5) diffExamples.push({ key: k, reason: 'key absent from baseline_dataset.jsonl' }); continue; }
    if (b[0] === hashes[0]) sameHash++;
    else { diffHash++; if (diffExamples.length < 5) diffExamples.push({ key: k, side: hashes[0], big: b[0], reason: 'sha1 mismatch' }); }
}
for (const k of bigMap.keys()) if (!sideMap.has(k)) keyOnlyInBig++;

const result = {
    generatedAtUtc: new Date().toISOString(),
    method: 'sha1 of the raw JSONL line text, keyed by (scenario.id, seed, step)',
    sideFiles: perFile,
    baselineDataset: { file: BIG, ...bigStats },
    comparison: {
        keysChecked: sideMap.size,
        identicalLineSha1: sameHash,
        mismatchedOrMissing: diffHash,
        keysOnlyInBaseline: keyOnlyInBig,
        sideKeysWithDuplicateHashes: multiHashKeys,
        allSideRecordsByteIdenticalInBaseline: diffHash === 0,
        mismatchExamples: diffExamples
    },
};

const reportPath = path.join(ROOT, 'v12/out/spatial/T12-04_dedup_report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
report.contentIdentityCheck = result;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('\n' + JSON.stringify(result.comparison, null, 2));
console.log(`\npatched ${reportPath} with .contentIdentityCheck`);
