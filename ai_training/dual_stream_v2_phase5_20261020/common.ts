import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import type { GameState } from '../../src/game/types';
import { stateSnapshotEquals } from '../../src/game/state_equals';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '../..');
export const STAGE3 = path.resolve(DIR, '../dual_stream_v2_phase3_20261020');
export const STAGE4 = path.resolve(DIR, '../dual_stream_v2_phase4_20261020');
export const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(DIR, file), 'utf8'));
export const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function save(file: string, data: unknown) {
    const target = path.resolve(DIR, file);
    if (!target.startsWith(DIR + path.sep)) throw Error('阶段5输出越界');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, target);
}
export function restore(state: Record<string, any>, base: GameState['map'], patches: any[], mapIndex: number): GameState {
    const map = { ...base, tiles: base.tiles.map(row => row.slice()) };
    for (const [i, tile] of patches) map.tiles[Math.floor(i / map.width)][i % map.width] = tile;
    const keys = Object.keys(state);
    return Object.fromEntries([...keys.slice(0, mapIndex).map(k => [k, state[k]]), ['map', map], ...keys.slice(mapIndex).map(k => [k, state[k]])]) as GameState;
}
export function compact(state: GameState, base: GameState['map']) {
    const patches: any[] = [];
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x];
        if (!stateSnapshotEquals(tile, base.tiles[y][x])) patches.push([y * base.width + x, tile]);
    }
    return { state: Object.fromEntries(Object.entries(state).filter(([k]) => k !== 'map')), mapIndex: Object.keys(state).indexOf('map'), patches };
}
export async function* corpus(split: string) {
    for (let lane = 0; lane < 5; lane++) {
        let base: GameState['map'], mapIndex = -1, parent = '';
        for await (const row of gzipRows(fs.readFileSync(path.join(STAGE3, `corpus/${split}-${lane}.jsonl.gz`)))) {
            if (row.kind === 'map') { base = row.map; mapIndex = -1; parent = row.id; continue; }
            if (row.mapId !== parent) throw Error('基础池地图失配');
            if (mapIndex < 0) mapIndex = Array.from({ length: Object.keys(row.state).length + 1 }, (_, i) => i).find(i => stateHash(restore(row.state, base!, row.patches, i)) === row.label.currentBeforeHash) ?? -1;
            const state = restore(row.state, base!, row.patches, mapIndex);
            if (mapIndex < 0 || stateHash(state) !== row.label.currentBeforeHash) throw Error('基础池原态SHA不符');
            yield { ...row, state, id: `${row.label.parentId}:${row.label.macro}:${row.label.subAction}` };
        }
    }
}
