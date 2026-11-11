import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR, STAGE3, corpus, sha, save } from './common';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';

/** 固定开发父局与语义重复态同时隔离，不能只依赖父局ID。 */
export async function fixedDevExclusions() {
    const files = Array.from({ length: 5 }, (_, i) => path.join(STAGE3, `corpus/dev-${i}.jsonl.gz`));
    const identity = sha([...files, path.resolve(DIR, '../data_acceptance_20261016/replay/core.ts')].map(f => sha(fs.readFileSync(f))).join(':'));
    const target = path.join(DIR, 'fixed-dev-exclusions.json.gz');
    if (fs.existsSync(target)) {
        const cached = JSON.parse(gunzipSync(fs.readFileSync(target)).toString());
        if (cached.identity === identity) return new Set<string>(cached.hashes);
    }
    const hashes = new Set<string>(); let samples = 0;
    for await (const row of corpus('dev')) {
        hashes.add(row.label.sourceBeforeHash); hashes.add(row.label.currentBeforeHash); hashes.add(ruleStateHash(row.state)); samples++;
    }
    const tmp = target + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, gzipSync(JSON.stringify({ identity, samples, hashes: [...hashes] }), { level: 9 })); fs.renameSync(tmp, target);
    save('fixed-dev-exclusion-receipt.json', { identity, samples, uniqueHashes: hashes.size, includesCanonicalStates: true });
    return hashes;
}
