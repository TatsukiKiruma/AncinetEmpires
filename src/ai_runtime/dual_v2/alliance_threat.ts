import { areAlliedPlayers, getAllianceId } from '../../game/rule_config';
import type { GameState, Unit } from '../../game/types';
import type { ReachabilityContext } from './reachability';

/** 同一敌方联盟取前三次伤害，各敌对联盟之间取最大值。 */
export function strongestAllianceDamage(state: GameState, self: number, defender: Unit, context: Pick<ReachabilityContext, 'projectedDamage'>): number {
    const alliances = new Map<number, number[]>();
    for (const enemy of state.units) {
        if (enemy.hp <= 0 || areAlliedPlayers(state, self, enemy.ownerId)) continue;
        const alliance = getAllianceId(state, enemy.ownerId);
        const hits = alliances.get(alliance) ?? [];
        hits.push(context.projectedDamage(enemy, defender));
        hits.sort((a, b) => b - a);
        if (hits.length > 3) hits.length = 3;
        alliances.set(alliance, hits);
    }
    let maximum = 0;
    for (const hits of alliances.values()) maximum = Math.max(maximum, hits.reduce((sum, damage) => sum + damage, 0));
    return maximum;
}
