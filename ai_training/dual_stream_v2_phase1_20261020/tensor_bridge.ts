import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ENTITY_DIM, MAP_CHANNELS, PLAYER_SLOTS, POINTER_DIM, RELATION_DIM, type DualObservation } from '../../src/ai_runtime/dual_v2/contract';
import { DIR, save, sha } from './io';

export interface BridgeLabel { target: number; policyMask: boolean; valueTarget: Float32Array; valueMask: boolean; weight: number }
export function packTensorBatch(observations: DualObservation[], labels: BridgeLabel[]) {
    if (os.endianness() !== 'LE') throw Error('桥接协议要求小端；大端主机需显式转换');
    const arrays: any[] = [], parts: Buffer[] = []; let offset = 0;
    const add = (batch: number, name: string, data: Float32Array | Int32Array | Uint8Array, shape: number[]) => {
        const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        arrays.push({ batch, name, dtype: data instanceof Float32Array ? '<f4' : data instanceof Int32Array ? '<i4' : '|u1', shape, offset, bytes: bytes.length, sha256: sha(bytes) });
        parts.push(bytes); offset += bytes.length;
    };
    observations.forEach((x, b) => {
        const n = x.entityIndexMap.entities.length, a = x.actions.sourceIndices.length;
        add(b, 'spatial', x.spatialTensor, [MAP_CHANNELS, x.height, x.width]); add(b, 'entities', x.entityTokens, [n, ENTITY_DIM]); add(b, 'relations', x.relationalBias, [n, n, RELATION_DIM]);
        add(b, 'players', x.playerOrder.features, [PLAYER_SLOTS, 11]); add(b, 'active', x.playerOrder.active, [PLAYER_SLOTS]); add(b, 'pointers', x.actions.pointers, [a, POINTER_DIM]); add(b, 'sourceIndices', x.actions.sourceIndices, [a]); add(b, 'actorMask', x.actions.actorMask, [n + 1]);
        const label = labels[b];
        add(b, 'valueTarget', label.valueTarget, [PLAYER_SLOTS]); add(b, 'valueMask', Uint8Array.of(Number(label.valueMask)), [1]); add(b, 'policyTarget', Int32Array.of(label.target), [1]); add(b, 'policyMask', Uint8Array.of(Number(label.policyMask)), [1]); add(b, 'weight', Float32Array.of(label.weight), [1]);
        const prefixTiles = Int32Array.from([...x.actions.tilesByActor].flatMap(([actor, tiles]) => [...tiles].flatMap(tile => [actor, tile])));
        add(b, 'prefixTileMask', prefixTiles, [prefixTiles.length / 2, 2]);
    });
    const bytes = Buffer.concat(parts);
    return { bytes, metadata: { protocol: 'dual-v2-le-typedarrays-v1', batches: observations.length, totalBytes: bytes.length, sha256: sha(bytes), arrays } };
}
export function writeBridgeFixture(observations: DualObservation[], labels: BridgeLabel[]) {
    const { bytes, metadata } = packTensorBatch(observations, labels);
    fs.writeFileSync(path.join(DIR, 'bridge-fixture.bin'), bytes);
    save('bridge-fixture.json', metadata);
}
