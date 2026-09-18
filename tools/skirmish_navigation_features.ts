import type { Observation } from '../src/game/env';
import { getMoveCostForUnit, isFlying } from '../src/game/abilities';
import type { Action, GameState, Unit, UnitClass } from '../src/game/types';
import type { Tile } from '../src/game/terrain';

type Snapshot = Observation['units'][number];
type Goal = 'castle' | 'income' | 'attack';
export type NavigationTarget = { kind: 'castle'; x: number; y: number } | { kind: 'attack'; unitId: string };
type Token = [string, number];

/** 仅缓存同一个不可变 observation；新动作的 observation 自动得到新缓存。 */
const contexts = new WeakMap<Observation, NavigationContext>();
class NavigationContext {
    private fields = new Map<string, Float64Array>();
    private occupants = new Map<number, Snapshot[]>();
    private tiles: Tile[];
    private state: GameState;
    constructor(private observation: Observation) {
        const o = observation;
        this.tiles = new Array(o.mapWidth * o.mapHeight);
        for (const t of o.tiles) this.tiles[t.y * o.mapWidth + t.x] = {
            terrainId: t.terrainId as Tile['terrainId'], ownerId: t.ownerId, apkTerrainId: t.apkTerrainId,
            apkTerrainKind: t.apkTerrainConfig?.kind, apkTerrainIsLand: t.apkTerrainConfig ? t.apkTerrainConfig.flagA !== 0 : undefined,
            apkMoveCost: t.moveCost,
        };
        for (const u of o.units.filter(u => u.hp > 0)) {
            const key = u.y * o.mapWidth + u.x;
            const list = this.occupants.get(key) ?? [];
            list.push(u); this.occupants.set(key, list);
        }
        // 公共移动成本目前只读取单位与地形；提供规则上下文以便后续规则扩展。
        this.state = { turn: o.turn, currentPlayer: o.currentPlayer, winner: null, units: [], players: [],
            rules: { alliances: o.rules.alliances }, map: { width: o.mapWidth, height: o.mapHeight,
                tiles: Array.from({ length: o.mapHeight }, (_, y) => this.tiles.slice(y * o.mapWidth, (y + 1) * o.mapWidth)) } };
    }
    private allied(a: number, b: number) {
        return a === b || (this.observation.rules.alliances[a] ?? a) === (this.observation.rules.alliances[b] ?? b);
    }
    field(actor: Snapshot, goal: Goal, target?: NavigationTarget): Float64Array {
        const key = `${actor.id}:${goal}:${target ? JSON.stringify(target) : ''}`;
        const existing = this.fields.get(key);
        if (existing) return existing;
        const o = this.observation;
        const unit: Unit = { id: actor.id, ownerId: actor.ownerId, unitClass: actor.unitClass as UnitClass, pos: { x: actor.x, y: actor.y },
            hp: actor.hp, maxHp: actor.maxHp, hasMoved: actor.hasMoved, hasActed: actor.hasActed, apkMoveOverrides: actor.apkMoveOverrides };
        const flying = isFlying(unit);
        const blocked = (index: number) => (this.occupants.get(index) ?? []).some(u => u.id !== actor.id && !this.allied(actor.ownerId, u.ownerId) && !(flying && !u.abilities.includes('flying')));
        const canStop = (index: number) => !(this.occupants.get(index) ?? []).some(u => u.id !== actor.id);
        const goals = new Set<number>();
        if (goal === 'attack') {
            if (actor.maxRange > 0) for (const enemy of o.units.filter(u => u.hp > 0 && !this.allied(actor.ownerId, u.ownerId))) {
                if (target?.kind === 'attack' && enemy.id !== target.unitId) continue;
                for (let dy = -actor.maxRange; dy <= actor.maxRange; dy++) for (let dx = -actor.maxRange; dx <= actor.maxRange; dx++) {
                    const range = Math.abs(dx) + Math.abs(dy);
                    const x = enemy.x + dx, y = enemy.y + dy;
                    if (range < actor.minRange || range > actor.maxRange || x < 0 || y < 0 || x >= o.mapWidth || y >= o.mapHeight) continue;
                    const index = y * o.mapWidth + x;
                    if (canStop(index) && getMoveCostForUnit(this.state, unit, this.tiles[index]) < 999999) goals.add(index);
                }
            }
        } else {
            for (const t of o.tiles) {
                if (target?.kind === 'castle' && (t.x !== target.x || t.y !== target.y)) continue;
                if (t.ownerId !== null && this.allied(actor.ownerId, t.ownerId)) continue;
                const castle = t.terrainTags.includes('castle');
                const capturable = t.terrainTags.includes('capturable');
                const allowed = castle ? actor.abilities.includes('castle_capturer') : actor.abilities.includes('village_capturer');
                const index = t.y * o.mapWidth + t.x;
                if (capturable && allowed && (goal === 'castle' ? castle && (target !== undefined || t.ownerId !== null) : !castle) && canStop(index)) goals.add(index);
            }
        }
        const costs = new Float64Array(this.tiles.length).fill(Infinity);
        const heap: Array<[number, number]> = [];
        const push = (entry: [number, number]) => {
            let i = heap.length; heap.push(entry);
            while (i > 0) { const p = (i - 1) >> 1; if (heap[p][1] <= entry[1]) break; heap[i] = heap[p]; i = p; }
            heap[i] = entry;
        };
        const pop = () => {
            const first = heap[0], last = heap.pop()!;
            if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c+1][1] < heap[c][1]) c++; if (heap[c][1] >= last[1]) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
            return first;
        };
        for (const index of goals) { costs[index] = 0; push([index, 0]); }
        // 反向多源 Dijkstra：逆向边仍收取正向进入当前格的代价。
        while (heap.length) {
            const [index, cost] = pop();
            if (cost !== costs[index] || blocked(index)) continue;
            const enterCost = getMoveCostForUnit(this.state, unit, this.tiles[index]);
            if (!Number.isFinite(enterCost) || enterCost < 0 || enterCost >= 999999) continue;
            const x = index % o.mapWidth, y = Math.floor(index / o.mapWidth);
            for (const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= o.mapWidth || ny >= o.mapHeight) continue;
                const next = ny * o.mapWidth + nx;
                if (blocked(next)) continue;
                const value = cost + enterCost;
                if (value < costs[next]) { costs[next] = value; push([next, value]); }
            }
        }
        this.fields.set(key, costs);
        return costs;
    }
}

/** 单一持续目标使用相同移动规则；不改变已导出的 v4 默认特征。 */
export function navigationTargetCosts(observation: Observation, actorId: string, target: NavigationTarget): Float64Array | null {
    const actor = observation.units.find(u => u.id === actorId && u.hp > 0);
    if (!actor) return null;
    let context = contexts.get(observation);
    if (!context) { context = new NavigationContext(observation); contexts.set(observation, context); }
    return context.field(actor, target.kind, target);
}

export function navigationFeatureTokens(observation: Observation, action: Action): Token[] {
    let context = contexts.get(observation);
    if (!context) { context = new NavigationContext(observation); contexts.set(observation, context); }
    const tokens: Token[] = [];
    const id = 'unitId' in action ? action.unitId : 'attackerId' in action ? action.attackerId : null;
    const actor = observation.units.find(u => u.id === id);
    if (!actor) return tokens;
    const destination = 'to' in action ? action.to : { x: actor.x, y: actor.y };
    const phase = observation.turn >= 80 ? 'late' : 'early';
    for (const goal of ['castle', 'income', 'attack'] as const) {
        const field = context.field(actor, goal);
        const before = field[actor.y * observation.mapWidth + actor.x];
        const after = field[destination.y * observation.mapWidth + destination.x];
        const prefix = `nav:${goal}:${action.type}`;
        const reachable = Number.isFinite(after);
        tokens.push([`${prefix}:reachable:${reachable}`, 1]);
        if (!reachable) continue;
        const move = Math.max(1, actor.move);
        const turns = after / move;
        const band = [0, 1, 2, 4, 8, 16].findIndex(t => turns <= t);
        tokens.push([`${prefix}:turns:${band < 0 ? 6 : band}`, 1]);
        tokens.push([`${prefix}:ready:${after === 0}`, 1]);
        if (Number.isFinite(before) && (action.type === 'move' || action.type === 'post_attack_move')) {
            const progress = Math.max(-2, Math.min(2, (before - after) / move));
            tokens.push([`${prefix}:progress`, progress], [`${prefix}:${phase}:progress`, progress], [`${prefix}:${actor.unitClass}:progress`, progress]);
            tokens.push([`${prefix}:direction:${Math.sign(progress)}`, 1]);
        }
    }
    return tokens;
}
