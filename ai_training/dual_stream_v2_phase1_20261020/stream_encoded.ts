import path from 'node:path';
import { once } from 'node:events';
import { DIR, read } from './io';
import { createLoaderStats, encodeSample, streamDataset, type SourceSample } from './streaming_loader';
import { packTensorBatch } from './tensor_bridge';
import { SYMMETRIES } from './symmetry';

process.stdout.on('error', (error: NodeJS.ErrnoException) => { if (error.code === 'EPIPE') process.exit(0); else throw error; });

async function write(bytes: Uint8Array) { if (!process.stdout.write(bytes)) await once(process.stdout, 'drain'); }
async function main() {
    const args = process.argv.slice(2), option = (name: string, fallback: string) => { const idx = args.indexOf(name); return idx < 0 ? fallback : args[idx + 1]; };
    if (args.includes('--help')) { console.error('用法：stream_encoded.ts --split train|dev --limit 样本数 --batch-size 1至16 [--augment]；stdout为小端二进制帧，不写特征文件。'); return; }
    const split = option('--split', 'train'), limit = Number(option('--limit', 'Infinity')), batchSize = Number(option('--batch-size', '4'));
    if (!['train', 'dev'].includes(split) || !(limit > 0) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 16) throw Error('流式参数无效');
    const manifest = read(path.join(DIR, 'split-manifest-v2.json')), stats = createLoaderStats();
    let samples: SourceSample[] = [], total = 0, frames = 0;
    const flush = async () => {
        if (!samples.length) return;
        const encoded = samples.map((s, i) => encodeSample(s, args.includes('--augment') ? SYMMETRIES[(total - samples.length + i) % 4] : 'id'));
        const packed = packTensorBatch(encoded.map(s => s.observation), encoded.map(s => ({ target: s.target, policyMask: true, valueTarget: s.outcome.target, valueMask: s.outcome.valueMask, weight: s.weight })));
        const metadata = Buffer.from(JSON.stringify({ ...packed.metadata, sources: samples.map(s => ({ parentId: s.parentId, source: s.source, macro: s.macro, subAction: s.subAction, beforeHash: s.currentBeforeHash, sourceBeforeHash: s.sourceBeforeHash })) }));
        const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(packed.bytes.length, 4);
        await write(header); await write(metadata); await write(packed.bytes); frames++; samples = [];
    };
    for await (const sample of streamDataset(manifest, split as 'train' | 'dev', stats)) {
        samples.push(sample); total++;
        if (samples.length >= batchSize) await flush();
        if (total >= limit) break;
    }
    await flush(); console.error(JSON.stringify({ total, frames, stats, diskFeatureBytes: 0 }));
}
await main();
