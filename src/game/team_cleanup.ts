import { GameState } from './types';
import { setTileOwnerAfterRepairForRules } from './terrain_rules';

/** APK SyncDestroyTeam：淘汰队伍并中立化领地，移除单位而不产生墓碑。 */
export function destroyTeamForRules(state: GameState, teamId: number): boolean {
    const player = state.players.find(entry => entry.id === teamId);
    if (!player) return false;
    player.isAlive = false;
    for (const row of state.map.tiles) {
        for (const tile of row) {
            if (tile.ownerId === teamId) setTileOwnerAfterRepairForRules(tile);
        }
    }
    const removesPending = state.units.some(unit => unit.id === state.pendingUnitId && unit.ownerId === teamId);
    state.units = state.units.filter(unit => unit.ownerId !== teamId);
    if (removesPending) delete state.pendingUnitId;
    return true;
}
