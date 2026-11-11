import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { streamReplay, createLoaderStats, loadExclusions } from './source_loader';
const dir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'split-manifest-v2-stage3.json'), 'utf8'));
const excluded = loadExclusions(manifest), receipts: any[] = [];
for (const entry of manifest.newReplayEntries) {
    const stats = createLoaderStats(); let policy = 0, weight = 0;
    for await (const sample of streamReplay(entry, excluded, stats)) {
        assert.equal(sample.valueMask, false); policy++; weight += sample.weight;
    }
    assert.equal(stats.currentStateDrift, 0); assert.equal(stats.currentRuleRejected, 0);
    receipts.push({ responseSha256: entry.responseSha256, policy, macroWeight: weight, stats, passed: true });
    fs.writeFileSync(path.join(dir, 'new-replay-stream-audit.json'), JSON.stringify({ passed: receipts.length === 41, completed: receipts.length, receipts }, null, 2));
}
