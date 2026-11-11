import { estimateCounterDamage } from '../../game/rules';
import type { GameState, Unit } from '../../game/types';

/** 权威反击预测只读取交战双方及其地形；稀疏视图避免序列化整张地图。 */
export function retaliationCounterDamage(state: GameState, attacker: Unit, defender: Unit): number {
    const tiles: GameState['map']['tiles'] = [];
    for (const unit of [attacker, defender]) {
        const row = tiles[unit.pos.y] ?? [];
        row[unit.pos.x] = state.map.tiles[unit.pos.y][unit.pos.x]; tiles[unit.pos.y] = row;
    }
    return estimateCounterDamage({ ...state, units: [attacker, defender], map: { ...state.map, tiles } }, attacker.id, defender.id);
}
