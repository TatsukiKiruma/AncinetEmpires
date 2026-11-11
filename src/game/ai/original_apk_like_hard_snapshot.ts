/** 补丁 APK ResourcePackHardAi.createSnapshot 的项目状态适配；坐标按桥接协议转为一基。 */
import type { GameState, UnitClass } from '../types';
import type { Tile } from '../terrain';
import { getAllianceId, getCommanderUnit, getUnitCost, isActivePlayer, isCommanderUnit } from '../rule_config';
import { getExpThresholdForLevel } from '../abilities';
import { getTileTerrainKey } from '../terrain_rules';

export const APK_HARD_TEAM_IDS = ['blue', 'red', 'green', 'black', 'purple', 'orange'] as const;

export const APK_HARD_UNIT_IDS: Partial<Record<UnitClass, string>> = {
    soldier: 'infantry', archer: 'archer', water_elemental: 'waterelement', witch: 'witch',
    elf: 'elf', wolf: 'wolf', golem: 'rock', catapult: 'catapult', dragon: 'dragon',
    commander: 'commander', skeleton: 'skeleton', paladin: 'healer', berserker: 'rampage',
    ghost: 'ghost', dark_mage: 'mage', wolf_archer: 'wolfshoot', ice_elemental: 'ice',
    slime: 'Slime', mermaid: 'mermaid', druid: 'druid',
};

const STATUS_NAMES = { poisoned: '中毒', inspired: '鼓舞', blinded: '致盲', weakened: '虚弱' } as const;

/** 保留 Java 桥接的原始地形分类，包括 tile 0 被归为水域的边界。 */
export function apkHardTerrainName(tile: Tile): string {
    const id = tile.apkTerrainId;
    if (id !== undefined) {
        if (id === 0 || (id >= 1 && id <= 14) || (id >= 38 && id <= 71)) return 'water';
        if (id === 15 || id === 16) return 'forest';
        if (id === 17) return 'mountain';
        if (id === 19) return 'hill';
        if ((id >= 20 && id <= 26) || (id >= 72 && id <= 79)) return 'road';
        return ({ 27: 'rundown', 28: 'bridge', 29: 'bridge', 30: 'bathtub', 31: 'temple',
            32: 'leftwing', 33: 'airport', 34: 'rightwing', 35: 'tail', 36: 'house',
            37: 'castle', 80: 'temple', 81: 'waterstone', 82: 'waterstone', 83: 'watertemple' } as Record<number, string>)[id] ?? 'plain';
    }
    return ({ town: 'house', damaged_town: 'rundown', deep_water: 'water', snow: 'plain',
        island: 'waterstone', camp: 'bathtub', water_temple: 'watertemple', special_1: 'leftwing',
        special_2: 'airport', special_3: 'tail' } as Record<string, string>)[getTileTerrainKey(tile)]
        ?? getTileTerrainKey(tile);
}

export function buildApkHardSnapshot(state: GameState, playerId: number, matchKey: string, previousActionAccepted: boolean) {
    if (!APK_HARD_TEAM_IDS[playerId]) throw new Error(`困难 APK 不支持队伍编号 ${playerId}`);
    const units = state.units.filter(unit => unit.hp > 0).map(unit => {
        const type = APK_HARD_UNIT_IDS[unit.unitClass];
        // APK 桥接遇到水晶也会报错并退回 Java AI，不用其他兵种冒充。
        if (!type || !APK_HARD_TEAM_IDS[unit.ownerId]) throw new Error(`困难 APK 快照不支持单位 ${unit.unitClass}`);
        const level = unit.level ?? 0;
        return {
            r: unit.pos.y + 1, c: unit.pos.x + 1, type, team: APK_HARD_TEAM_IDS[unit.ownerId],
            level, hp: unit.hp, exp: Math.max(0, (unit.exp ?? 0) - getExpThresholdForLevel(level)),
            status: unit.status ? STATUS_NAMES[unit.status.type] : '无',
            statusTurns: unit.status?.remainingTicks ?? unit.status?.remainingTurns ?? 0,
            standby: unit.hasActed || !!unit.apkStatic, supported: !!unit.hasBeenSupportedThisTurn,
            registeredCommander: isCommanderUnit(state, unit),
        };
    });
    const teams = APK_HARD_TEAM_IDS.map((id, teamId) => {
        const player = state.players.find(item => item.id === teamId);
        const commander = getCommanderUnit(state, teamId);
        const level = commander?.level ?? player?.commanderReserveLevel ?? 0;
        const exp = commander?.exp ?? player?.commanderReserveExp ?? 0;
        return {
            id, alliance: getAllianceId(state, teamId),
            playerType: !isActivePlayer(state, teamId) ? 0 : teamId === playerId ? 3 : 2,
            gold: player?.gold ?? 0, commanderPrice: getUnitCost(state, teamId, 'commander') ?? 0,
            commanderLevel: level, commanderExp: Math.max(0, exp - getExpThresholdForLevel(level)),
        };
    });
    const terrainOwners: Array<{ r: number; c: number; owner: string }> = [];
    const terrain = state.map.tiles.map((row, y) => row.map((tile, x) => {
        const name = apkHardTerrainName(tile);
        if ((name === 'house' || name === 'castle') && tile.ownerId !== null && APK_HARD_TEAM_IDS[tile.ownerId]) {
            terrainOwners.push({ r: y + 1, c: x + 1, owner: APK_HARD_TEAM_IDS[tile.ownerId] });
        }
        return name;
    }));
    return {
        map: { rows: state.map.height, cols: state.map.width }, terrain, terrainOwners, units, teams,
        tombstones: (state.graves ?? []).map(grave => ({
            r: grave.pos.y + 1, c: grave.pos.x + 1, rounds: grave.remainingTurns,
            team: APK_HARD_TEAM_IDS[grave.ownerId ?? playerId] ?? APK_HARD_TEAM_IDS[playerId],
        })),
        moveMode: { currentTeam: APK_HARD_TEAM_IDS[playerId], round: Math.max(1, state.turn) },
        turnNumber: state.turn, matchKey, previousActionAccepted,
    };
}
