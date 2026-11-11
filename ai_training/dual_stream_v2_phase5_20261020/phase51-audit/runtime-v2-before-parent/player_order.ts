import { calculateArmyValue } from '../../game/env';
import { getAllianceId, getTurnPlayerIds, isActivePlayer, isCommanderUnit, isTeamEnabled } from '../../game/rule_config';
import type { GameState } from '../../game/types';
import { PLAYER_SLOTS, type OutcomeTarget, type PlayerOrder } from './contract';

export function encodePlayerOrder(state: GameState): PlayerOrder {
    const enabled = state.players.filter(p => isTeamEnabled(state, p.id)).map(p => p.id);
    if (enabled.length > PLAYER_SLOTS) throw Error('双流契约最多支持6个启用玩家');
    const turn = getTurnPlayerIds(state), current = state.currentPlayer;
    const start = turn.indexOf(current);
    const rotated = start < 0 ? turn : [...turn.slice(start), ...turn.slice(0, start)];
    const ids = [...new Set([current, ...rotated, ...enabled.sort((a, b) => a - b)])];
    if (ids.length > PLAYER_SLOTS) throw Error('当前玩家与启用玩家无法放入6个槽');
    const playerIds: (number | null)[] = Array.from({ length: PLAYER_SLOTS }, (_, i) => ids[i] ?? null);
    const slotByPlayer = new Map(ids.map((id, slot) => [id, slot]));
    const features = new Float32Array(PLAYER_SLOTS * 11), active = new Uint8Array(PLAYER_SLOTS);
    for (const [slot, id] of ids.entries()) {
        const player = state.players.find(p => p.id === id);
        if (!player) throw Error('当前行动玩家不存在');
        const living = state.units.filter(u => u.ownerId === id && u.hp > 0);
        const ally = getAllianceId(state, current) === getAllianceId(state, id);
        active[slot] = Number(isActivePlayer(state, id));
        features.set([active[slot], active[slot] ? rotated.indexOf(id) / (PLAYER_SLOTS - 1) : -1, Number(id === current), Number(ally && id !== current), Number(!ally), player.gold / 10000, living.length / 100, calculateArmyValue(state, id) / 10000, living.filter(u => isCommanderUnit(state, u)).length, (player.commanderReserveLevel ?? 0) / 9, Number(player.isAlive)], slot * 11);
    }
    return { playerIds, slotByPlayer, features, active };
}

/** 使用观测前态的槽映射，终局状态不能重新旋转标签。 */
export function encodeOutcomeTarget(state: GameState, order: PlayerOrder, valueMask: boolean, winner: number | null = state.winner): OutcomeTarget {
    const target = new Float32Array(PLAYER_SLOTS);
    if (!valueMask || winner === null) return { target, valueMask: false };
    let slots = order.playerIds.flatMap((id, slot) => id !== null && (winner === -1 ? isActivePlayer(state, id) : isTeamEnabled(state, id) && getAllianceId(state, id) === winner) ? [slot] : []);
    // 同时淘汰导致无人存活的规则平局，在原参与方均分，避免凭空指定赢家。
    if (winner === -1 && !slots.length) slots = order.playerIds.flatMap((id, slot) => id !== null && isTeamEnabled(state, id) ? [slot] : []);
    if (!slots.length) throw Error('终局赢家或平局没有对应槽位');
    for (const slot of slots) target[slot] = 1 / slots.length;
    return { target, valueMask: true };
}

export function aggregateAllianceValue(state: GameState, order: PlayerOrder, target: ArrayLike<number>): number {
    const self = order.playerIds[0];
    if (self === null) throw Error('价值聚合缺少观测前态行动方');
    return order.playerIds.reduce<number>((sum, id, slot) => sum + (id !== null && getAllianceId(state, id) === getAllianceId(state, self) ? target[slot] : 0), 0);
}
