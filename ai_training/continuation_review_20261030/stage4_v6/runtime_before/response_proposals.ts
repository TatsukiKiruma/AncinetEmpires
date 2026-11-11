import type { Action, GameState } from '../../game/types';
import { areAlliedPlayers } from '../../game/rule_config';
import { hasAbility } from '../../game/abilities';
import { getTileTerrainKey } from '../../game/terrain_rules';
import { actionActor } from '../dual_v2/tactical_prior';

/** 敌席用自身网络预筛移动行动者；即时战术、招募、结束回合和城堡相关行动者始终保留。 */
export function responseActionIndices(state: GameState, legal: readonly Action[], scores: ArrayLike<number>, actors = 2): number[] {
    const maxima = new Map<string, number>(), units = new Map(state.units.map(u => [u.id, u]));
    legal.forEach((a, i) => { const actor = actionActor(a); if (actor) maxima.set(actor, Math.max(maxima.get(actor) ?? -Infinity, scores[i])); });
    const selected = new Set([...maxima].sort((a, b) => b[1] - a[1]).slice(0, actors).map(([id]) => id));
    for (const u of state.units) if (u.ownerId === state.currentPlayer) {
        const tile = state.map.tiles[u.pos.y][u.pos.x];
        if (getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && areAlliedPlayers(state, u.ownerId, tile.ownerId)) selected.add(u.id);
    }
    for (const a of legal) if (a.type === 'move') {
        const tile = state.map.tiles[a.to.y][a.to.x], unit = units.get(a.unitId)!;
        if (getTileTerrainKey(tile) === 'castle' && (tile.ownerId === null || !areAlliedPlayers(state, state.currentPlayer, tile.ownerId)) && hasAbility(unit, 'castle_capturer')) selected.add(a.unitId);
    }
    return legal.flatMap((a, i) => a.type !== 'move' && a.type !== 'post_attack_move' || selected.has(actionActor(a)!) ? [i] : []);
}
