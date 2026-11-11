import { hasAbility } from '../../game/abilities';
import { areAlliedPlayers } from '../../game/rule_config';
import type { GameState, Position } from '../../game/types';
import type { PlayerOrder } from './contract';
import { ReachabilityContext } from './reachability';

export function forDiamond(state: GameState, origin: Position, radius: number, visit: (idx: number) => void) {
    for (let dy = -radius; dy <= radius; dy++) {
        const y = origin.y + dy;
        if (y < 0 || y >= state.map.height) continue;
        const span = radius - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
            const x = origin.x + dx;
            if (x >= 0 && x < state.map.width) visit(y * state.map.width + x);
        }
    }
}

/** 只生成静态潜力场，不预测回合初恢复、伤亡、阻挡变化或多单位连招。 */
export function encodeStaticThreatMap(state: GameState, order: PlayerOrder, context: ReachabilityContext, tensor: Float32Array) {
    const area = context.area;
    const nextEnemy = order.playerIds.find((id, slot) => slot > 0 && id !== null && order.active[slot] && !areAlliedPlayers(state, state.currentPlayer, id));
    const top1 = new Float32Array(area), top2 = new Float32Array(area), top3 = new Float32Array(area);
    const friend1 = new Float32Array(area), friend2 = new Float32Array(area);
    const friendControl = new Uint8Array(area), enemyControl = new Uint8Array(area);
    for (const reach of context.units.values()) {
        const u = reach.unit;
        if (!reach.ready) continue;
        const friendly = areAlliedPlayers(state, state.currentPlayer, u.ownerId);
        for (let idx = 0; idx < area; idx++) {
            if (reach.bestOrigins[idx * 2] < 0 && reach.bestOrigins[idx * 2 + 1] < 0) continue;
            const damage = reach.referenceDamage[idx];
            if (friendly) {
                friendControl[idx] = 1;
                if (damage > friend1[idx]) { friend2[idx] = friend1[idx]; friend1[idx] = damage; }
                else if (damage > friend2[idx]) friend2[idx] = damage;
                if (hasAbility(u, 'sharpshooter') || reach.bestOrigins[idx * 2 + 1] >= 0) tensor[28 * area + idx] += 1;
            } else {
                enemyControl[idx] = 1;
                if (u.ownerId === nextEnemy) { tensor[22 * area + idx] = Math.max(tensor[22 * area + idx], damage); tensor[23 * area + idx] += 1; }
                if (damage > top1[idx]) { top3[idx] = top2[idx]; top2[idx] = top1[idx]; top1[idx] = damage; }
                else if (damage > top2[idx]) { top3[idx] = top2[idx]; top2[idx] = damage; }
                else if (damage > top3[idx]) top3[idx] = damage;
                if (hasAbility(u, 'blinder')) tensor[25 * area + idx] |= 1;
                if (hasAbility(u, 'summoner')) tensor[25 * area + idx] |= 4;
            }
        }
        const supportChannels: [number, number][] = friendly
            ? [[29, hasAbility(u, 'attack_aura') ? 2 : -1], [30, hasAbility(u, 'cleansing_aura') ? 2 : -1], [31, hasAbility(u, 'healer') ? 1 : -1], [32, hasAbility(u, 'supporter') ? 2 : -1]]
            : [[25, hasAbility(u, 'weakness_aura') ? 2 : -1]];
        for (const [channel, radius] of supportChannels) {
            if (radius < 0) continue;
            for (const origin of reach.origins) forDiamond(state, origin, radius, idx => {
                if (channel === 25) tensor[channel * area + idx] |= 2;
                else tensor[channel * area + idx] = 1;
            });
        }
    }
    for (let idx = 0; idx < area; idx++) {
        tensor[24 * area + idx] = top1[idx] + top2[idx] + top3[idx];
        tensor[26 * area + idx] = friend1[idx]; tensor[27 * area + idx] = friend1[idx] + friend2[idx];
        const x = idx % state.map.width, y = Math.floor(idx / state.map.width);
        const pass = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < state.map.width && ny < state.map.height && tensor[2 * area + ny * state.map.width + nx] <= 1 / 4;
        const h = Number(pass(x - 1, y)) + Number(pass(x + 1, y));
        const v = Number(pass(x, y - 1)) + Number(pass(x, y + 1));
        const choke = tensor[2 * area + idx] <= 1 / 4 && h + v <= 2 && (h === 2 || v === 2);
        const frontline = friendControl[idx] && (enemyControl[idx] || [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < state.map.width && ny < state.map.height && enemyControl[ny * state.map.width + nx]));
        tensor[33 * area + idx] = Number(choke) + 2 * Number(Boolean(frontline));
    }
}
