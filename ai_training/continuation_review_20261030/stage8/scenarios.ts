import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { getAppApkSkirmishMapOptions, createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { CUSTOM_SKIRMISH_MAPS, createCustomSkirmishState } from '../../../src/game/custom_skirmish/catalog';
import { getApkSkirmishRuleConfig } from '../../../src/game/apk_skirmish';
import { getTileTerrainKey } from '../../../src/game/terrain_rules';
import type { GameState } from '../../../src/game/types';

export type Role = 'candidate' | 'C1' | 'hard';
export const counts = [2, 3, 4, 5, 6] as const;
export function aliveSeats(state: GameState) {
    const ids = state.players.filter(p => p.isAlive).map(p => p.id).sort((a, b) => a - b);
    assert(ids.length >= 2 && ids.length <= 6 && new Set(ids).size === ids.length);
    assert(ids.every(id => Number.isInteger(id) && id >= 0 && id < 6));
    assert(ids.includes(state.currentPlayer), '当前玩家必须存活');
    return ids;
}

/** 仅训练使用的五/六方试作场景，明确标记来源，不伪称官方地图。 */
export function prototype(players: number): GameState {
    assert(players === 5 || players === 6);
    const template = createCustomSkirmishState(CUSTOM_SKIRMISH_MAPS[0]);
    const tile = (kind: string) => structuredClone(template.map.tiles.flat().find(t => getTileTerrainKey(t) === kind)!);
    const plain = tile('snow'), castle = tile('castle'), town = tile('town');
    const road = tile('road'), forest = tile('forest'), mountain = tile('mountain');
    assert(plain && castle && town);
    // 五方采用左右镜像的五角环，六方保持原六角环；均为21×21。
    const positions = players === 5 ? [[10, 2], [18, 8], [15, 17], [5, 17], [2, 8]]
        : [[3, 3], [10, 2], [17, 3], [17, 17], [10, 18], [3, 17]];
    const state = structuredClone(template);
    state.map = { width: 21, height: 21, tiles: Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => structuredClone(plain))) };
    const place = (x: number, y: number, source: typeof plain) => {
        const ownerCode = ['castle', 'town'].includes(getTileTerrainKey(source)) ? 254 : 255;
        state.map.tiles[y][x] = { ...source, ownerId: null, apkOwnerCode: ownerCode,
            apkTerrainRaw: (source.apkTerrainId! << 12) | ownerCode };
    };
    // 中央十字与侧翼环路保持镜像对称，所有起点连入道路网。
    for (let i = 2; i <= 18; i++) { place(10, i, road); place(i, 10, road); }
    for (let i = 5; i <= 15; i++) {
        place(i, 5, road); place(i, 15, road); place(5, i, road); place(15, i, road);
    }
    for (const [sx, sy] of positions) {
        for (let x = Math.min(sx, 10); x <= Math.max(sx, 10); x++) place(x, sy, road);
        for (let y = Math.min(sy, 10); y <= Math.max(sy, 10); y++) place(10, y, road);
    }
    for (const [x, y] of [[6,6],[7,6],[6,7],[8,7]]) for (const mx of [x,20-x]) for (const my of [y,20-y])
        if (getTileTerrainKey(state.map.tiles[my][mx]) !== 'road') place(mx, my, x === 8 ? mountain : forest);
    for (const [x,y] of [[8,10],[12,10],[10,8],[10,12],[3,10],[17,10],[10,5],[10,15]]) place(x,y,town);
    place(10,10,castle);
    state.players = Array.from({ length: players }, (_, id) => ({ id, gold: 200, isAlive: true, commanderDeathCount: 0 }));
    state.units = state.players.map(p => ({ ...structuredClone(template.units[0]), id: `s8_commander_${p.id}`, ownerId: p.id,
        pos: { x: positions[p.id][0], y: positions[p.id][1] }, hasMoved: false, hasActed: false }));
    for (const unit of state.units) {
        const { x, y } = unit.pos;
        state.map.tiles[y][x] = { ...castle, ownerId: unit.ownerId, apkOwnerCode: unit.ownerId, apkTerrainRaw: (castle.apkTerrainId! << 12) | unit.ownerId };
        const ty = y < 10 ? y + 2 : y - 2;
        state.map.tiles[ty][x] = { ...town, ownerId: null, apkOwnerCode: 254, apkTerrainRaw: (town.apkTerrainId! << 12) | 254 };
    }
    state.turn = 1; state.currentPlayer = 0; state.winner = null;
    state.metadata = { source: 'custom_skirmish', customSkirmishMapId: `stage8-ring-${players}`, recommendedGold: 200 };
    return new GameEngine(state, { applyInitialTurnStart: true }).getState();
}

export function scenarioPool() {
    const official = getAppApkSkirmishMapOptions().map(m => ({ id: m.name, source: 'official', players: m.playerCount,
        create: () => createAppApkSkirmishGameState(m.name) }));
    const custom = CUSTOM_SKIRMISH_MAPS.map(m => ({ id: m.id, source: 'prototype', players: m.commanders.length,
        create: () => createCustomSkirmishState(m) }));
    const extended = [5, 6].map(players => ({ id: `stage8-ring-${players}`, source: 'prototype', players, create: () => prototype(players) }));
    return [...official, ...custom, ...extended];
}

export function economy(state: GameState, gold: number | null, population: number): GameState {
    const s = structuredClone(state);
    // 工厂已发首回合收入，调整金币只加差额，避免重复结算。
    const recommended = s.rules?.initialGold ?? s.metadata?.recommendedGold ?? 200;
    if (gold !== null) for (const p of s.players) p.gold += gold - Number(recommended);
    s.rules = { ...s.rules!, ...getApkSkirmishRuleConfig('SD', { initialGold: gold ?? Number(recommended), unitLimit: population === 25 ? 30 : population }), unitLimit: population };
    return s;
}

/** 每五个席位槽恰有一个锚点，跨块均匀轮转；C1 通道路由绑定 K1。 */
export function rolesFor(ids: number[], offset: number): Record<number, Role> {
    return Object.fromEntries(ids.map((id, i) => [id, (offset + i) % 5 ? 'candidate' : Math.floor((offset + i) / 5) % 2 ? 'C1' : 'hard']));
}

export function schedule(generation: number, block: number, split: 'train' | 'dev' = 'train') {
    const pool = scenarioPool();
    let seatOffset = block * 81;
    return counts.flatMap(players => {
        const maps = pool.filter(m => m.players === players);
        return [null, 300, 500, 1000].map((gold, band) => {
            const ordinal = block * 4 + band;
            const map = maps[ordinal % maps.length];
            const population = [25, 30, 40, 50][(band + Math.floor(block / maps.length)) % 4];
            const state = economy(map.create(), gold, population), ids = aliveSeats(state);
            const roles = rolesFor(ids, seatOffset); seatOffset += ids.length;
            return { generation, gameId: `s8-${split}-g${generation}-b${block}-${players}p-${band}`, players, kind: 'league',
                map: map.id, mapSource: map.source, gold, population, seed: 2026111008 + generation * 100003 + ordinal * 101 + players * 13 + (split === 'dev' ? 9000000 : 0),
                state, roles, candidate: ids.find(id => roles[id] === 'candidate')!, cut: null, split };
        });
    });
}

export function migrateCut(state: GameState, roles: Record<number, Role>) {
    const ids = aliveSeats(state), previous = Object.keys(roles).map(Number).sort((a, b) => a - b);
    assert.equal(ids.length, previous.length);
    return Object.fromEntries(previous.map((id, i) => [ids[i], roles[id]]));
}


