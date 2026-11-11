import type { GameState } from '../../game/types';
import { getAllianceId, isActivePlayer, isCommanderUnit } from '../../game/rule_config';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { PlayerOrder } from '../dual_v2/contract';

export type ValueMode = 'maxn_ffa' | 'zero_sum_margin';
export interface ValueOptions { valueMode?: ValueMode; antiLeaderBeta?: number }

/** 联盟是否出局以权威引擎已结算的玩家存活标志为准，不在搜索器另写败北规则。 */
export function allianceAlive(state: GameState, self: number): boolean {
    const alliance = getAllianceId(state, self);
    return state.players.some(p => getAllianceId(state, p.id) === alliance && isActivePlayer(state, p.id));
}

export function searchTerminal(state: GameState, self: number): number | undefined {
    if (state.winner !== null) return state.winner === -1 ? 0 : state.winner === getAllianceId(state, self) ? 1 : -1;
    return allianceAlive(state, self) ? undefined : -1;
}

/** 固定敌方相对分配时严格递增；二联盟直接使用零和边界，避免浮点残差产生惩罚。 */
export function maxnUtility(self: number, maxEnemy: number, alliances: number, beta = .25): number {
    if (![self, maxEnemy, beta].every(Number.isFinite) || self < 0 || self > 1 || maxEnemy < 0 || maxEnemy > 1 || beta < 0 || beta > 1 || !Number.isInteger(alliances) || alliances < 1) throw Error('多人效用参数无效');
    if (alliances <= 2 || self === 0 || self === 1) return 2 * self - 1;
    return 2 * self - 1 - beta * self * Math.max(0, maxEnemy - (1 - self) / (alliances - 1));
}

export function computeScalarValue(pVal: ArrayLike<number>, state: GameState, order: PlayerOrder, self = order.playerIds[0], options: ValueOptions = {}): number {
    if (self === null || pVal.length !== 6) throw Error('价值槽位不完整');
    const terminal = searchTerminal(state, self);
    if (terminal !== undefined) return terminal;
    const groups = new Map<number, number>(), selfAlliance = getAllianceId(state, self);
    for (let s = 0; s < 6; s++) {
        if (!Number.isFinite(pVal[s]) || pVal[s] < 0 || pVal[s] > 1) throw Error('价值概率无效');
        const id = order.playerIds[s];
        if (id === null || !isActivePlayer(state, id)) continue;
        const alliance = getAllianceId(state, id);
        groups.set(alliance, (groups.get(alliance) ?? 0) + pVal[s]);
    }
    const own = Math.min(1, groups.get(selfAlliance) ?? 0), enemy = Math.min(1, Math.max(0, ...[...groups].filter(([id]) => id !== selfAlliance).map(([, p]) => p)));
    const value = options.valueMode === 'zero_sum_margin' ? own - enemy : maxnUtility(own, enemy, groups.size, options.antiLeaderBeta);
    // 生存但模型概率下溢为零时，仍严格高于已出局的精确负一。
    return Math.max(-1 + 1e-9, Math.min(1, value));
}

export function survivalStatus(initial: GameState, final: GameState, self: number) {
    const alliance = getAllianceId(initial, self), own = (id: number | null) => id !== null && getAllianceId(initial, id) === alliance;
    const won = final.winner === alliance;
    const castles = final.map.tiles.flat().filter(t => own(t.ownerId) && getTileTerrainKey(t) === 'castle').length;
    const commanderDied = initial.units.some(u => own(u.ownerId) && u.hp > 0 && isCommanderUnit(initial, u) && !final.units.some(v => v.id === u.id && v.hp > 0));
    const eliminated = !allianceAlive(final, self);
    return { won, castles, commanderDied, eliminated, unsafe: !won && (eliminated || castles === 0), safe: won || (!eliminated && castles > 0 && !commanderDied) };
}

export interface SurvivalCandidate { responseComplete: boolean; unsafe: boolean; safe: boolean; vetoed?: boolean }
/** 只有完整反扑见证能触发末城否决；未验证轨迹不能冒充安全替代项。 */
export function applySurvivalVeto<T extends SurvivalCandidate>(candidates: T[]): void {
    const alternative = candidates.some(c => c.responseComplete && c.safe);
    for (const c of candidates) c.vetoed = alternative && c.responseComplete && c.unsafe;
}
