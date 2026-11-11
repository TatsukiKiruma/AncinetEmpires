import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeEntries, streamNativeSegment, createLoaderStats, loadExclusions, type SourceSample } from './source_loader';
import { GzipLines } from './replay_io';
import { sha } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'split-manifest-v2-stage3.json'), 'utf8'));
const summaries = [0, 1, 2, 3].flatMap(i => JSON.parse(fs.readFileSync(path.join(dir, `corpus-receipt-${i}.json`), 'utf8')).summaries);
const missing = summaries.filter(p => p.originalValueEligible && !p.valueSamples), excluded = loadExclusions(manifest), native = nativeEntries();
const writers = { train: new GzipLines(path.join(dir, 'corpus/train-4.jsonl.gz'), 2_000_000), dev: new GzipLines(path.join(dir, 'corpus/dev-4.jsonl.gz'), 2_000_000) };
const stats = createLoaderStats(), added: any[] = [], unavailable: string[] = [];
for (const parent of missing) {
    let found: SourceSample | null = null;
    for (const entry of native.filter(e => e.parentId === parent.id && e.valueEligible)) {
        for await (const sample of streamNativeSegment(entry, excluded, stats)) {
            if (sample.valueMask) { found = sample; break; }
            // 漂移后该分段不能重新获得可信value，转查下一独立恢复点。
            if (!sample.valueMask) break;
        }
        if (found) break;
    }
    if (!found) { unavailable.push(parent.id); continue; }
    const writer = writers[parent.split as 'train' | 'dev'], { map, ...state } = found.state;
    const { state: _state, legalActions: _legal, targetIndex: _target, ...label } = found;
    const entry = manifest.parents.find((p: any) => p.id === parent.id && p.source === 'native');
    await writer.line({ kind: 'map', id: `native:${parent.id}`, map });
    await writer.line({ kind: 'sample', mapId: `native:${parent.id}`, state, patches: [], label, configuredPlayers: entry.configuredPlayers });
    added.push({ ...parent, samples: 1, valueSamples: 1, supplemental: true });
}
for (const writer of Object.values(writers)) await writer.close();
fs.writeFileSync(path.join(dir, 'corpus-receipt-4.json'), JSON.stringify({ passed: true, stats, summaries: added, missingBefore: missing.map(p => p.id), unavailable, files: Object.fromEntries(Object.entries(writers).map(([k, w]) => [k, { bytes: w.bytes, sha256: sha(fs.readFileSync(w.file)), lines: w.lines }])) }, null, 2));
