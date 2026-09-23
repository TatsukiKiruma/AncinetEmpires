/**
 * Cross-process determinism proof for the T12-06 labels.
 *
 * `search_labels.ts --determinism K` re-evaluates the same decisions inside one
 * process. This tool closes the remaining gap: it compares two label files that
 * were produced by two SEPARATE node processes from the same episodes file, and
 * asserts that every shared decision has a bit-identical leaf vector, dQ vector
 * and engine-transition count once wall-clock fields are removed.
 *
 * Usage:
 *   node v11/tools/run-tool.mjs v12/tools/search_determinism_cross_process.ts \
 *     --a v12/out/labels/counterfactual_labels_v2_detA.jsonl \
 *     --b v12/out/labels/counterfactual_labels_v2_detB.jsonl \
 *     --out v12/out/labels/determinism_cross_process.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, readJsonl, sha256, writeJson } from '../../tools/v11/common';

function argValue(flag: string, fallback: string): string {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

/** Canonical form: everything the run must reproduce, with timing zeroed. */
function canonical(label: any): unknown {
    const copy = JSON.parse(JSON.stringify(label));
    copy.wallMs = -1;
    for (const leaf of copy.leaves ?? []) leaf.wallMs = -1;
    return copy;
}

function main(): void {
    const fileA = argValue('--a', 'v12/out/labels/counterfactual_labels_v2_detA.jsonl');
    const fileB = argValue('--b', 'v12/out/labels/counterfactual_labels_v2_detB.jsonl');
    const out = argValue('--out', 'v12/out/labels/determinism_cross_process.json');

    const a = readJsonl<any>(fileA);
    const b = readJsonl<any>(fileB);
    const byId = new Map<string, any>(b.map(l => [l.decisionId, l]));

    const checks = a.map(la => {
        const lb = byId.get(la.decisionId);
        if (!lb) {
            return { decisionId: la.decisionId, present: false, bitIdenticalIgnoringWallClock: false };
        }
        const hashA = sha256(JSON.stringify(canonical(la)));
        const hashB = sha256(JSON.stringify(canonical(lb)));
        return {
            decisionId: la.decisionId,
            present: true,
            bitIdenticalIgnoringWallClock: hashA === hashB,
            hashA,
            hashB,
            leafValuesA: la.leaves.map((l: any) => l.leaf),
            leafValuesB: lb.leaves.map((l: any) => l.leaf),
            deltaQsA: la.leaves.map((l: any) => l.deltaQ),
            deltaQsB: lb.leaves.map((l: any) => l.deltaQ),
            engineTransitionsA: la.engineTransitions,
            engineTransitionsB: lb.engineTransitions,
        };
    });

    const allBitIdentical = checks.length > 0 && checks.every(c => c.bitIdenticalIgnoringWallClock);
    writeJson(out, {
        schema: 'v12_determinism_cross_process_1',
        generatedAt: new Date().toISOString(),
        method:
            'two separate node processes loaded the same episodes file and evaluated the same decision ' +
            'points; every label record is hashed sha256 after zeroing wall-clock fields only ' +
            '(wallMs, leaves[].wallMs)',
        fileA,
        fileB,
        decisionsCompared: checks.length,
        decisionsMissingInB: checks.filter(c => !c.present).map(c => c.decisionId),
        checks,
        allBitIdentical,
    });

    console.log(`cross-process determinism: ${checks.length} decisions compared between ${fileA} and ${fileB}`);
    for (const c of checks) {
        console.log(`  ${c.decisionId} equal=${c.bitIdenticalIgnoringWallClock} ` +
            `dQ=${JSON.stringify(c.deltaQsA)} vs ${JSON.stringify(c.deltaQsB)}`);
    }
    console.log(`ALL BIT-IDENTICAL: ${allBitIdentical}`);
    console.log(`wrote ${out}`);
    if (!allBitIdentical) process.exitCode = 1;
}

if ((process.argv[1] ?? '').endsWith('search_determinism_cross_process.ts')) {
    ensureDir(path.dirname(argValue('--out', 'v12/out/labels/determinism_cross_process.json')));
    main();
}
