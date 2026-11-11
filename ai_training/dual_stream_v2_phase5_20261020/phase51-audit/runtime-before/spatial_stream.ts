import { getEffectiveStats, getMoveCostForUnit } from '../../game/abilities';
import { areAlliedPlayers, isCommanderUnit } from '../../game/rule_config';
import { getTileDefenseBonus, getTileTerrainConfig } from '../../game/terrain_rules';
import type { GameState, Unit } from '../../game/types';
import { PLAYER_SLOTS, MAP_CHANNELS, type PlayerOrder } from './contract';
import { ReachabilityContext } from './reachability';
import { encodeStaticThreatMap } from './static_threat_map';

export function encodeSpatialStream(state: GameState, order: PlayerOrder, context: ReachabilityContext): Float32Array {
    const { width, height, tiles } = state.map, area = width * height;
    const tensor = new Float32Array(MAP_CHANNELS * area);
    const probes = ['soldier', 'mermaid', 'ghost'].map(unitClass => ({ id: 'probe', ownerId: state.currentPlayer, unitClass, pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false } as Unit));
    const terrainKeys = ['snow', 'deep_water', 'mountain', 'hill', 'island', 'road', 'forest', 'damaged_town', 'town', 'castle', 'camp', 'temple', 'special_1', 'special_2', 'special_3', 'water_temple', 'bridge'];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const idx = y * width + x, tile = tiles[y][x], config = getTileTerrainConfig(tile);
        tensor[idx] = (terrainKeys.indexOf(config.key) + 1) / terrainKeys.length;
        tensor[area + idx] = getTileDefenseBonus(tile) / 20;
        for (let k = 0; k < 3; k++) tensor[(2 + k) * area + idx] = Math.min(4, getMoveCostForUnit(state, probes[k], tile)) / 4;
        if (config.tags.includes('building')) {
            tensor[5 * area + idx] = 1;
            const slot = tile.ownerId === null ? undefined : order.slotByPlayer.get(tile.ownerId);
            const channel = tile.ownerId === null || slot === undefined ? 13 : slot === 0 ? 6 : areAlliedPlayers(state, state.currentPlayer, tile.ownerId) ? 7 : 7 + slot;
            tensor[channel * area + idx] = 1;
        }
        tensor[14 * area + idx] = Number(config.key === 'damaged_town');
    }
    for (const grave of state.graves ?? []) {
        const idx = grave.pos.y * width + grave.pos.x;
        tensor[15 * area + idx] = 1; tensor[16 * area + idx] = grave.remainingTurns / 10;
    }
    // 堆叠招募以pending新兵优先；完整堆叠信息仍在实体流内。
    const living = state.units.filter(u => u.hp > 0);
    for (const u of [...living.filter(u => u.id !== state.pendingUnitId), ...living.filter(u => u.id === state.pendingUnitId)]) {
        const idx = u.pos.y * width + u.pos.x, slot = order.slotByPlayer.get(u.ownerId);
        tensor[17 * area + idx] = slot === undefined ? -1 : (slot + 1) / PLAYER_SLOTS;
        tensor[18 * area + idx] = u.ownerId === state.currentPlayer ? 1 : areAlliedPlayers(state, state.currentPlayer, u.ownerId) ? 0.5 : -1;
        tensor[19 * area + idx] = u.hp / Math.max(1, getEffectiveStats(u).maxHp);
        // 低位编码行动资格；等级由整数部分精确恢复。
        tensor[20 * area + idx] = (2 * (u.level ?? 0) + Number(!u.hasActed)) / 20;
        tensor[21 * area + idx] = Number(isCommanderUnit(state, u));
    }
    encodeStaticThreatMap(state, order, context, tensor);
    return tensor;
}
