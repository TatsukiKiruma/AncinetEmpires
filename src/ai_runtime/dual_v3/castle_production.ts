import type { Action, GameState } from '../../game/types';
import { areAlliedPlayers, isCommanderUnit } from '../../game/rule_config';
import { getLegalActions } from '../../game/rules';
import { getTileTerrainKey } from '../../game/terrain_rules';
import { actionActor } from '../dual_v2/tactical_prior';
import type { ReachabilityContext } from '../dual_v2/reachability';
import { hasAbility } from '../../game/abilities';

/** 募兵资格与价格交给权威规则；只在唯一可生产城堡被非指挥官占用时施加软惩罚。 */
export function castleProductionPenalties(state: GameState, actions: readonly Action[], context: ReachabilityContext): Float32Array {
    const out = new Float32Array(actions.length);
    const castles = state.map.tiles.flatMap((row, y) => row.flatMap((tile, x) => tile.ownerId === state.currentPlayer && getTileTerrainKey(tile) === 'castle' ? [{x, y}] : []));
    const same = (a: {x: number; y: number}, b: {x: number; y: number}) => a.x === b.x && a.y === b.y;
    const empty = castles.filter(p => !state.units.some(u => u.hp > 0 && same(u.pos, p)));
    if (empty.length > 1) return out;
    const enemies = state.units.filter(u => u.hp > 0 && !areAlliedPlayers(state, state.currentPlayer, u.ownerId));
    const production = new Map<string, boolean>();
    for (const p of castles) {
        const view = {...state, pendingUnitId: undefined, units: state.units.filter(u => !same(u.pos, p))};
        production.set(`${p.x},${p.y}`, getLegalActions(view, state.currentPlayer, {skipMovement: true}).some(a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && same(a.castlePos, p)));
    }
    actions.forEach((a, i) => {
        const u = state.units.find(v => v.id === actionActor(a));
        if (!u || isCommanderUnit(state, u)) return;
        const moving = a.type === 'move' || a.type === 'post_attack_move';
        if (!moving && a.type !== 'wait' && a.type !== 'attack') return;
        const pos = moving ? a.to : u.pos;
        const castle = castles.find(p => same(pos, p));
        if (!castle || !production.get(`${pos.x},${pos.y}`)) return;
        if (empty.some(p => !same(p, pos))) return;
        // 敌方夺城单位下一次行动可达且没有同格替代守军时，保留防守例外。
        const threat = enemies.some(e => hasAbility(e, 'castle_capturer') && context.units.get(e.id)?.origins.some(p => same(p, pos)));
        const defender = state.units.some(v => v.id !== u.id && v.hp > 0 && areAlliedPlayers(state, u.ownerId, v.ownerId) && same(v.pos, pos));
        if (threat && !defender) return;
        // 原地攻击若仍可后移，不提前视为断产；移动进入城堡的再移动能力同样保留。
        const viewUnit = moving ? {...u, pos, hasMoved: true} : {...u, hasActed: a.type === 'attack' ? true : u.hasActed};
        const view = {...state, units: state.units.map(v => v.id === u.id ? viewUnit : v)};
        if ((moving || a.type === 'attack') && getLegalActions(view, state.currentPlayer, {unitId: u.id, skipRecruitment: true}).some(f => f.type === 'post_attack_move' && !same(f.to, pos))) return;
        if (!moving) {
            const legal = getLegalActions(state, state.currentPlayer, {unitId: u.id, skipRecruitment: true});
            const safeExit = legal.some(f => (f.type === 'move' || f.type === 'post_attack_move') && !same(f.to, pos) && enemies.reduce((sum, e) => sum + context.projectedDamage(e, {...u, pos: f.to}), 0) < u.hp);
            if (!safeExit) return;
        }
        out[i] = -40;
    });
    return out;
}
