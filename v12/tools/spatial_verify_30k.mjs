/**
 * T12-03 cheap re-verification of the CURRENT spatial datasets.
 *
 * Verifies (without a full JSON.parse of the 772 MB file where avoidable) that
 * spatial_train_scaled_30k.jsonl really is missing episode identity fields and
 * really is ~100% null valueTarget.
 *
 * Usage: node v12/tools/spatial_verify_30k.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
    'training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl',
    'training_runs/spatial_dataset/spatial_train_25ep.jsonl',
    'training_runs/spatial_dataset/spatial_pilot_01.jsonl',
];

const WANT = ['sampleId', 'episodeId', 'rootFamilyId', 'step', 'turn', 'playerId', 'spatialTensor', 'globalFeatures', 'targetActionIndex', 'candidateActions', 'valueTarget'];

async function scan(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return { path: rel, missing: true };
    const stat = fs.statSync(abs);
    const rl = readline.createInterface({ input: fs.createReadStream(abs, { encoding: 'utf8' }), crlfDelay: Infinity });
    const keyCounts = new Map();
    let lines = 0, bad = 0, valueNonNull = 0, emptyRoot = 0, missingRoot = 0, emptyEp = 0;
    const rootSet = new Set();
    for await (const line of rl) {
        if (!line.trim()) continue;
        lines++;
        let o;
        try { o = JSON.parse(line); } catch { bad++; continue; }
        const ks = Object.keys(o);
        const sig = ks.join(',');
        keyCounts.set(sig, (keyCounts.get(sig) ?? 0) + 1);
        if (o.valueTarget !== null && o.valueTarget !== undefined) valueNonNull++;
        if (!('rootFamilyId' in o)) missingRoot++;
        else if (o.rootFamilyId === null || o.rootFamilyId === '') emptyRoot++;
        else rootSet.add(o.rootFamilyId);
        if ('episodeId' in o && (o.episodeId === null || o.episodeId === '')) emptyEp++;
    }
    return {
        path: rel,
        bytes: stat.size,
        mtimeUtc: stat.mtimeUtc ?? stat.mtime.toISOString(),
        lines,
        parseErrors: bad,
        valueTargetNonNull: valueNonNull,
        valueTargetNullPct: lines ? +(100 * (lines - valueNonNull) / lines).toFixed(3) : null,
        rootFamilyIdAbsent: missingRoot,
        rootFamilyIdEmpty: emptyRoot,
        rootFamilyIdDistinct: rootSet.size,
        episodeIdEmpty: emptyEp,
        keySignatures: [...keyCounts.entries()].map(([sig, n]) => ({ keys: sig, count: n })),
        keySignatureCount: keyCounts.size,
    };
}

const out = { generatedAtUtc: new Date().toISOString(), schemaWanted: WANT, files: [] };
for (const f of FILES) {
    const r = await scan(f);
    out.files.push(r);
    console.log(`--- ${f}`);
    if (r.missing) { console.log('  MISSING'); continue; }
    console.log(`  bytes=${r.bytes} lines=${r.lines} parseErrors=${r.parseErrors}`);
    console.log(`  valueTarget non-null = ${r.valueTargetNonNull} (null pct = ${r.valueTargetNullPct}%)`);
    console.log(`  rootFamilyId absent=${r.rootFamilyIdAbsent} empty=${r.rootFamilyIdEmpty} distinct=${r.rootFamilyIdDistinct}`);
    console.log(`  keySignatureCount=${r.keySignatureCount}`);
    for (const s of r.keySignatures) console.log(`    [${s.count}] ${s.keys}`);
}
fs.mkdirSync(path.join(ROOT, 'v12/out/spatial'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'v12/out/spatial/T12-03_input_verification.json'), JSON.stringify(out, null, 2));
console.log('\nwrote v12/out/spatial/T12-03_input_verification.json');
