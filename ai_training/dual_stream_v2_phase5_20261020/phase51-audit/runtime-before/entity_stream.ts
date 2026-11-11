import { getEffectiveStats, hasAbility } from '../../game/abilities';
import { calculateArmyValue } from '../../game/env';
import { areAlliedPlayers, isActivePlayer, isCommanderUnit } from '../../game/rule_config';
import { getLegalActions } from '../../game/rules';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { GameState, Unit } from '../../game/types';
import { ENTITY_DIM, ENTITY_FIELDS as F, RELATION_DIM, UNIT_CLASSES, type EntityIndexMap, type EntityRef, type PlayerOrder } from './contract';
import { ReachabilityContext } from './reachability';

export function createEntityIndex(state: GameState): EntityIndexMap {
    const entities: EntityRef[] = [], units = new Map<string, number>(), castles = new Map<number, number>(), graves = new Map<string, number>();
    for (const u of state.units) if (u.hp > 0) {
        if (units.has(u.id)) throw Error('单位ID重复');
        units.set(u.id, entities.length); entities.push({ kind: 'unit', id: u.id, ...u.pos, ownerId: u.ownerId });
    }
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && isActivePlayer(state, tile.ownerId) && areAlliedPlayers(state, state.currentPlayer, tile.ownerId)) {
            const idx = y * state.map.width + x;
            castles.set(idx, entities.length); entities.push({ kind: 'castle', id: `castle:${idx}`, x, y, ownerId: tile.ownerId });
        }
    }
    for (const g of state.graves ?? []) {
        if (graves.has(g.id)) throw Error('墓碑ID重复');
        graves.set(g.id, entities.length); entities.push({ kind: 'grave', id: g.id, ...g.pos, ownerId: g.ownerId ?? null });
    }
    return { entities, units, castles, graves, globalActorIdx: entities.length };
}

export function encodeEntityStream(state: GameState, order: PlayerOrder, context: ReachabilityContext, spatial: Float32Array, index: EntityIndexMap) {
    const n = index.entities.length, tokens = new Float32Array(n * ENTITY_DIM), bias = new Float32Array(n * n * RELATION_DIM);
    const focus = state.units.find(u => u.hp > 0 && u.ownerId === state.currentPlayer && isCommanderUnit(state, u))?.pos ?? { x: (state.map.width - 1) / 2, y: (state.map.height - 1) / 2 };
    const graves = new Map((state.graves ?? []).map(g => [g.id, g]));
    const allies = new Set(state.players.filter(p => areAlliedPlayers(state, p.id, state.currentPlayer)).map(p => p.id));
    for (const [i, e] of index.entities.entries()) {
        const t = tokens.subarray(i * ENTITY_DIM, (i + 1) * ENTITY_DIM), u = context.units.get(e.id)?.unit;
        t[e.kind === 'unit' ? F.unit : e.kind === 'castle' ? F.castle : F.grave] = 1;
        const slot = e.ownerId === null ? undefined : order.slotByPlayer.get(e.ownerId);
        if (slot !== undefined) t[F.slotStart + slot] = 1;
        t[F.self] = Number(e.ownerId === state.currentPlayer); t[F.ally] = Number(e.ownerId !== null && e.ownerId !== state.currentPlayer && allies.has(e.ownerId)); t[F.enemy] = Number(e.ownerId !== null && !allies.has(e.ownerId));
        t[F.x] = e.x; t[F.y] = e.y; t[F.nx] = e.x / Math.max(1, state.map.width - 1); t[F.ny] = e.y / Math.max(1, state.map.height - 1);
        t[F.dx] = (e.x - focus.x) / state.map.width; t[F.dy] = (e.y - focus.y) / state.map.height;
        t[F.threat] = spatial[24 * context.area + e.y * state.map.width + e.x];
        t[F.aliveOwner] = Number(e.ownerId !== null && isActivePlayer(state, e.ownerId));
        if (e.kind === 'grave') t[F.graveTurns] = (graves.get(e.id)?.remainingTurns ?? 0) / 10;
        if (!u) continue;
        const stats = getEffectiveStats(u);
        t[F.classStart + UNIT_CLASSES.indexOf(u.unitClass)] = 1;
        t[F.hp] = u.hp / stats.maxHp; t[F.maxHp] = stats.maxHp / 100;
        // 直接复用权威军力折算，金币置零且只计当前实体。
        t[F.armyValue] = calculateArmyValue({ ...state, players: [], units: [u] }, u.ownerId) / 1000;
        t[F.level] = (u.level ?? 0) / 9; t[F.exp] = (u.exp ?? 0) / 5000;
        if (u.status) t[F.statusStart + ['poisoned', 'inspired', 'blinded', 'weakened'].indexOf(u.status.type)] = 1 + (u.status.remainingTicks ?? u.status.remainingTurns ?? 0) / 10;
        t[F.moved] = Number(u.hasMoved); t[F.acted] = Number(u.hasActed); t[F.postMoved] = Number(Boolean(u.hasPostAttackMoved)); t[F.pending] = Number(u.id === state.pendingUnitId);
        t[F.minRange] = stats.minRange / 10; t[F.maxRange] = stats.maxRange / 10; t[F.move] = stats.move / 20; t[F.commander] = Number(isCommanderUnit(state, u));
        t[F.movementRemaining] = (u.movementRemaining ?? stats.move) / 20; t[F.healed] = Number(Boolean(u.hasBeenHealedThisTurn)); t[F.supported] = Number(Boolean(u.hasBeenSupportedThisTurn)); t[F.static] = Number(Boolean(u.apkStatic));
        t[F.emptyCastlePending] = Number(u.apkPendingRecruitSource === 'empty_castle'); t[F.commanderCastlePending] = Number(u.apkPendingRecruitSource === 'commander_castle');
    }
    for (let i = 0; i < n; i++) {
        const a = index.entities[i], reach = a.kind === 'unit' ? context.units.get(a.id) : undefined, u = reach?.unit;
        // 定向权威查询仅提取实体关系；不用于生成静态热力图或引擎模拟。
        const direct = new Set<string>(), healing = new Set<string>(), support = new Set<string>();
        if (u && reach?.ready) for (const action of getLegalActions(state, u.ownerId, { unitId: u.id, skipMovement: true, skipRecruitment: true })) {
            if (action.type === 'attack') direct.add(action.targetId);
            if (action.type === 'heal') healing.add(action.targetId);
            if (action.type === 'support') support.add(action.targetId);
        }
        for (let j = 0; j < n; j++) {
            const b = index.entities[j], v = b.kind === 'unit' ? context.units.get(b.id)?.unit : undefined;
            const k = (i * n + j) * RELATION_DIM, distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            const allied = a.ownerId !== null && b.ownerId !== null && areAlliedPlayers(state, a.ownerId, b.ownerId);
            const enemy = a.ownerId !== null && b.ownerId !== null && !allied;
            bias[k] = Number(a.ownerId !== null && a.ownerId === b.ownerId); bias[k + 1] = Number(allied); bias[k + 2] = Number(enemy);
            bias[k + 3] = Math.min(8, distance) / 8;
            const cost = u ? context.paths.cost(u, u.pos, { x: b.x, y: b.y }) : null;
            bias[k + 4] = cost === null ? 1 : Math.min(8, cost) / 9; bias[k + 5] = Number(cost !== null);
            bias[k + 6] = Number(direct.has(b.id));
            const projected = u && v && enemy ? context.projectedDamage(u, v) : 0;
            const tileIdx = b.y * state.map.width + b.x;
            bias[k + 7] = Number(Boolean(v && enemy && reach?.ready && (reach.bestOrigins[tileIdx * 2] >= 0 || reach.bestOrigins[tileIdx * 2 + 1] >= 0)));
            bias[k + 8] = v ? projected / Math.max(1, v.hp) : 0; bias[k + 9] = Number(Boolean(v && projected >= v.hp));
            bias[k + 10] = Number(healing.has(b.id)); bias[k + 11] = Number(support.has(b.id));
            bias[k + 12] = Number(Boolean(u && v && allied && distance <= 2 && hasAbility(u, 'attack_aura') && (!v.status || v.status.type === 'inspired')));
            bias[k + 13] = Number(Boolean(u && v && allied && distance <= 2 && hasAbility(u, 'cleansing_aura')));
            bias[k + 14] = Number(Boolean(u && v && enemy && distance <= 2 && hasAbility(u, 'weakness_aura') && !hasAbility(v, 'weakness_aura') && (!v.status || v.status.type === 'weakened')));
            bias[k + 15] = Number(distance === 0);
        }
    }
    return { entityTokens: tokens, relationalBias: bias };
}
