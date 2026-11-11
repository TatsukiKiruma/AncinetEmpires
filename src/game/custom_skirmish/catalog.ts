import { getApkTerrainConfig, mapSkirmishApkTerrainId } from '../apk_terrain';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { GameEngine } from '../engine';
import type { Tile } from '../terrain';
import type { GameState, Unit } from '../types';
import { frostBridges } from './frost-bridges';
import { mirrorBay } from './mirror-bay';
import { ridgeOutposts } from './ridge-outposts';
import { crossroadsFour } from './crossroads-four';
import { doublePasses } from './double-passes';
import { lakeGates } from './lake-gates';
import { outerKeeps } from './outer-keeps';
import { threeForks } from './three-forks';
import { tideHarbors } from './tide-harbors';
import type { CustomSkirmishMap } from './types';

export const CUSTOM_SKIRMISH_MAPS: readonly CustomSkirmishMap[] = [
    frostBridges, ridgeOutposts, mirrorBay,
    threeForks, tideHarbors, outerKeeps,
    crossroadsFour, lakeGates, doublePasses
];

// 直接使用已核对的 APK 地形 ID，移动、防御与回血仍由公共引擎读取。
const terrainLegend: Readonly<Record<string, readonly [number, number | null]>> = {
    '.': [18, null],
    '-': [20, null],
    '~': [0, null],
    '=': [28, null],
    '|': [29, null],
    f: [15, null],
    h: [19, null],
    m: [17, null],
    v: [36, null],
    r: [27, null],
    c: [37, null],
    a: [36, 0],
    b: [36, 1],
    d: [36, 2],
    e: [36, 3],
    A: [37, 0],
    B: [37, 1],
    C: [37, 2],
    D: [37, 3]
};

function decodeTile(symbol: string): Tile {
    const [apkTerrainId, ownerId] = terrainLegend[symbol] ?? [];
    const terrainId = mapSkirmishApkTerrainId(apkTerrainId);
    const config = getApkTerrainConfig(apkTerrainId);
    if (terrainId == null || !config || ownerId === undefined) {
        throw new Error(`未知试作地图地形：${symbol}`);
    }
    const apkOwnerCode = ownerId ?? (config.capturable ? 0xfe : 0xff);
    return { terrainId, ownerId, apkTerrainId, apkOwnerCode, apkTerrainRaw: (apkTerrainId << 12) | apkOwnerCode };
}

export function createCustomSkirmishState(map: CustomSkirmishMap, currentPlayer = 0): GameState {
    const height = map.rows.length;
    const width = map.rows[0]?.length ?? 0;
    if (width === 0 || map.rows.some(row => row.length !== width)) {
        throw new Error(`试作地图行宽不一致：${map.label}`);
    }
    const tiles = map.rows.map(row => Array.from(row, decodeTile));
    const teamIds = map.commanders.map(([team]) => team);
    const teams = new Set<number>(teamIds);
    const starts = new Set(map.commanders.map(([, x, y]) => `${x},${y}`));
    if (teams.size < 2 || teams.size !== map.commanders.length || !teams.has(currentPlayer)
        || starts.size !== map.commanders.length
        || map.commanders.some(([, x, y]) => !tiles[y]?.[x])
        || tiles.some(row => row.some(tile => tile.ownerId !== null && !teams.has(tile.ownerId)))) {
        throw new Error(`试作地图的队伍或出生点无效：${map.label}`);
    }
    const units: Unit[] = map.commanders.map(([ownerId, x, y]) => ({
        id: `custom_commander_${ownerId}`,
        unitClass: 'commander',
        ownerId,
        pos: { x, y },
        hp: 100,
        maxHp: 100,
        hasMoved: false,
        hasActed: false,
        level: 0,
        exp: 0
    }));
    const state: GameState = {
        turn: 1,
        currentPlayer,
        map: { width, height, tiles },
        units,
        players: teamIds.map(id => ({ id, gold: map.startingGold, isAlive: true, commanderDeathCount: 0 })),
        winner: null,
        rules: getApkSkirmishRuleConfig('SD', { initialGold: map.startingGold }),
        metadata: { source: 'custom_skirmish', customSkirmishMapId: map.id, recommendedGold: map.startingGold }
    };
    return new GameEngine(state, { applyInitialTurnStart: true }).getState();
}
