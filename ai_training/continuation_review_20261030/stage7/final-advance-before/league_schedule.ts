import assert from 'node:assert/strict';
import { createAppApkSkirmishGameState, getAppApkSkirmishMapOptions } from '../../../src/game/apk_skirmish_map_assets';
import { GameEngine } from '../../../src/game/engine';
import { mulberry32 } from '../../../src/game/env';
import type { GameState } from '../../../src/game/types';

type Players = 2 | 3 | 4;
export type Role = 'candidate' | 'C1' | 'hard';
type Kind = 'hard' | 'C1' | 'mixed';
export type Cut = { state: GameState; sourceGame: string; sourceStep: number; generation: number; players: Players };
const maps = getAppApkSkirmishMapOptions();
const playerCounts = [2, 3, 4] as const;
const counts: Record<Players, Record<Kind, number>> = { 2: { hard: 3, C1: 2, mixed: 0 }, 3: { hard: 4, C1: 3, mixed: 2 }, 4: { hard: 3, C1: 2, mixed: 1 } };
export function shuffle<T>(items: T[], rng: () => number) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

/** 20 局块固定人数与阵容边际，轮转地图及候选席位；中盘只来自上一代训练。 */
export function leagueBlock(generation: number, block: number, cuts: Cut[], masterSeed: number) {
    const rng = mulberry32(masterSeed + generation * 1000003 + block * 1009);
    const planned = playerCounts.flatMap(players => {
        const options = maps.filter(m => m.playerCount === players);
        assert(options.length > 0);
        const plan = (Object.keys(counts[players]) as Kind[]).flatMap(kind => Array<Kind>(counts[players][kind]).fill(kind));
        return shuffle(plan, rng).map((kind, k) => {
            const ordinal = block * plan.length + k;
            const map = options[ordinal % options.length].name;
            const gameId = `gen${generation}-${players}p-${ordinal}`;
            const seed = Math.floor(rng() * 2 ** 32);
            const state = new GameEngine(createAppApkSkirmishGameState(map)).getState();
            const ids = state.players.filter(p => p.isAlive).map(p => p.id).sort((a, b) => a - b);
            assert.equal(ids.length, players);
            const cycle = Math.floor(ordinal / options.length), rotation = shuffle(ids, mulberry32(masterSeed + options.findIndex(x => x.name === map) + players * 97));
            const candidate = rotation[cycle % ids.length];
            const rivals = shuffle(ids.filter(id => id !== candidate), rng);
            const roles: Record<number, Role> = { [candidate]: 'candidate' };
            rivals.forEach((id, j) => { roles[id] = kind === 'mixed' ? j === 0 ? 'C1' : 'hard' : kind; });
            return { generation, gameId, players, kind, map, seed, state, roles, candidate, cut: null as Omit<Cut, 'state'> | null };
        });
    });
    if (generation > 1 && cuts.length && block > 0) {
        assert(cuts.every(c => c.generation === generation - 1 && /^gen\d+-[234]p-\d+$/.test(c.sourceGame)), '中盘起点来源不是上一代训练');
        // 第一块保留标准开局以覆盖官方地图；第二块补足第一块的中盘配额。
        const needed = block === 1 ? 12 : 6;
        const eligible = planned.filter(p => cuts.some(c => c.players === p.players && c.state.players.every(x => x.isAlive)));
        assert(eligible.length >= needed, '上一代健康的中盘起点不足');
        for (const row of shuffle(eligible, rng).slice(0, needed)) {
            const pool = cuts.filter(c => c.players === row.players && c.state.players.every(x => x.isAlive));
            const { state, ...identity } = pool[Math.floor(rng() * pool.length)];
            assert.deepEqual(state.players.map(p => p.id).sort((a, b) => a - b), Object.keys(row.roles).map(Number).sort((a, b) => a - b));
            row.state = state; row.cut = identity; row.map = state.metadata?.apkMapName ?? row.map;
        }
    }
    return shuffle(planned, rng);
}

export function officialMaps() { return maps.filter(m => playerCounts.includes(m.playerCount as Players)); }
