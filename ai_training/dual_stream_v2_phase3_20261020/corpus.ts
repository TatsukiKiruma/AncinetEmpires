import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeEntries, replayEntries, streamNativeSegment, streamReplay, createLoaderStats, loadExclusions, type SourceSample } from './source_loader';
import { GzipLines } from './replay_io';
import { sha } from '../dual_stream_v2_phase1_20261020/io';
import { streamSparseNative } from './native_sparse';

const dir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'split-manifest-v2-stage3.json'), 'utf8'));
const excluded = loadExclusions(manifest), native = nativeEntries();
const replay = [...replayEntries(), ...manifest.newReplayEntries];
const lane = Number(process.argv[2] ?? 0), lanes = Number(process.argv[3] ?? 1);
const selected = manifest.parents.filter((_: any, i: number) => i % lanes === lane);
fs.mkdirSync(path.join(dir, 'corpus'), { recursive: true });
const writers = { train: new GzipLines(path.join(dir, `corpus/train-${lane}.jsonl.gz`), 30_000_000), dev: new GzipLines(path.join(dir, `corpus/dev-${lane}.jsonl.gz`), 10_000_000) };
const stats = createLoaderStats(), summaries: any[] = [];
for (const parent of selected) {
    const cap = parent.source === 'native' ? 56 : 128;
    const groups = new Map<string, Array<{ priority: string; sample: SourceSample }>>();
    const consume = async (source: AsyncGenerator<SourceSample>) => {
        for await (const sample of source) {
            const action = sample.legalActions[sample.targetIndex];
            const phase = sample.state.turn <= 5 ? 'opening' : sample.state.turn <= 15 ? 'middle' : 'late';
            const family = action.type === 'attack' ? 'attack' : action.type === 'capture' ? 'capture' : action.type.startsWith('recruit_') ? 'recruit' : ['heal', 'support', 'summon'].includes(action.type) ? 'support' : action.type === 'move' || action.type === 'post_attack_move' ? 'move' : 'finish';
            const key = `${phase}/${family}`;
            const priority = sha(`stage3-corpus:${parent.id}:${sample.macro}:${sample.subAction}:${sample.currentBeforeHash}`);
            if (!groups.has(key)) groups.set(key, []);
            const pool = groups.get(key)!;
            // 每个父局至多18个小蓄水池，内存不随轨迹长度增长。
            const perGroup = Math.ceil(cap / 6);
            if (pool.length < perGroup || priority < pool[pool.length - 1].priority) {
                pool.push({ priority, sample }); pool.sort((a, b) => a.priority.localeCompare(b.priority));
                if (pool.length > perGroup) pool.pop();
            }
        }
    };
    if (parent.source === 'native') {
        const entries = native.filter(e => e.parentId === parent.id);
        const indices = new Set([0, Math.floor((entries.length - 1) / 2), entries.length - 1]);
        for (const [i, entry] of entries.entries()) if (indices.has(i)) await consume(streamSparseNative(entry, excluded, stats));
    }
    else { const entry = replay.find(e => e.responseSha256 === parent.id); if (!entry) throw Error('来源索引缺失'); await consume(streamReplay(entry, excluded, stats)); }
    const chosen: SourceSample[] = [];
    const ordered = [...groups].sort(([a], [b]) => a.localeCompare(b));
    for (let depth = 0; chosen.length < cap; depth++) {
        let added = false;
        for (const [, pool] of ordered) if (pool[depth] && chosen.length < cap) { chosen.push(pool[depth].sample); added = true; }
        if (!added) break;
    }
    const writer = writers[parent.split as 'train' | 'dev'];
    let base: any, baseStrings: string[] = [];
    if (chosen.length) {
        base = chosen[0].state.map;
        baseStrings = base.tiles.flat().map((t: any) => JSON.stringify(t));
        await writer.line({ kind: 'map', id: `${parent.source}:${parent.id}`, map: base });
    }
    const distribution: Record<string, number> = {};
    for (const sample of chosen) {
        const { map, ...state } = sample.state;
        const patches: any[] = [];
        map.tiles.flat().forEach((tile, i) => { if (JSON.stringify(tile) !== baseStrings[i]) patches.push([i, tile]); });
        const { state: _state, legalActions: _legal, targetIndex: _target, ...label } = sample;
        await writer.line({ kind: 'sample', mapId: `${parent.source}:${parent.id}`, state, patches, label, configuredPlayers: parent.configuredPlayers });
        const key = `${sample.state.turn <= 5 ? 'opening' : sample.state.turn <= 15 ? 'middle' : 'late'}/${sample.legalActions[sample.targetIndex].type}`;
        distribution[key] = (distribution[key] ?? 0) + 1;
    }
    summaries.push({ id: parent.id, source: parent.source, split: parent.split, samples: chosen.length, valueSamples: chosen.filter(s => s.valueMask).length, originalValueEligible: native.some(e => e.parentId === parent.id && e.valueEligible), distribution });
    if (summaries.length % 10 === 0) {
        fs.writeFileSync(path.join(dir, `corpus-progress-${lane}.json`), JSON.stringify({ parents: summaries.length, selected: selected.length, samples: summaries.reduce((n, s) => n + s.samples, 0), stats }));
        console.error(JSON.stringify({ lane, parents: summaries.length, selected: selected.length }));
    }
}
for (const writer of Object.values(writers)) await writer.close();
fs.writeFileSync(path.join(dir, `corpus-receipt-${lane}.json`), JSON.stringify({ passed: true, lane, lanes, stats, summaries, files: Object.fromEntries(Object.entries(writers).map(([k, w]) => [k, { bytes: w.bytes, sha256: sha(fs.readFileSync(w.file)), lines: w.lines }])) }, null, 2));
