import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { DualObservation } from '../../src/ai_runtime/dual_v2/contract';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export const read = (name: string) => JSON.parse(fs.readFileSync(path.resolve(DIR, name), 'utf8').replace(/^\uFEFF/, ''));
export const save = (name: string, value: unknown) => fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2) + '\n');
export function hydrate(arrays: Record<string, ArrayLike<number>>, width: number, height: number): DualObservation {
    const n = arrays.entities.length / 66;
    return { schema: 'dual-stream-v2-phase1-v1', width, height, spatialTensor: Float32Array.from(arrays.spatial), entityTokens: Float32Array.from(arrays.entities), relationalBias: Float32Array.from(arrays.relations),
        playerOrder: { features: Float32Array.from(arrays.players), active: Uint8Array.from(arrays.active), playerIds: [], slotByPlayer: new Map() },
        entityIndexMap: { globalActorIdx: n, entities: [], units: new Map(), castles: new Map(), graves: new Map() },
        actions: { pointers: Int32Array.from(arrays.pointers), actorMask: Uint8Array.from(arrays.actorMask), sourceIndices: new Int32Array(arrays.pointers.length / 5), tilesByActor: new Map(), rowsByActorTile: new Map() } };
}
export function loadObservations() {
    const meta = read('samples.json'), bytes = fs.readFileSync(path.join(DIR, 'samples.bin'));
    if (sha(bytes) !== meta.sha256) throw Error('抽样张量SHA不符');
    const batches: Record<string, Float32Array | Int32Array | Uint8Array>[] = Array.from({ length: meta.batches }, () => ({}));
    for (const e of meta.arrays) {
        const raw = bytes.subarray(e.offset, e.offset + e.bytes), copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        if (sha(raw) !== e.sha256) throw Error('抽样数组SHA不符');
        batches[e.batch][e.name] = e.dtype === '<f4' ? new Float32Array(copy) : e.dtype === '<i4' ? new Int32Array(copy) : new Uint8Array(copy);
    }
    return { meta, batches, observations: batches.map((x, i) => hydrate(x, meta.sources[i].width, meta.sources[i].height)) };
}
