import { hasAbility } from '../../game/abilities';
import { areAlliedPlayers, isCommanderUnit } from '../../game/rule_config';
import { calculateArmyValue } from '../../game/env';
import { getLegalActions } from '../../game/rules';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { Action, GameState, Unit } from '../../game/types';
import { ReachabilityContext } from './reachability';
import { distance, hardTacticalContext, positionKey } from './hard_tactics';
import { auraPositionValue, hardAttackValue, hardHealValue, hardSupportValue } from './hard_combat';
import { canStillRecruitAtCastle, hardRecruitValue } from './hard_recruitment';

export function actionActor(a: Action): string | undefined {
    if ('unitId' in a) return a.unitId;
    if ('attackerId' in a) return a.attackerId;
    if ('healerId' in a) return a.healerId;
    if ('supporterId' in a) return a.supporterId;
    if ('summonerId' in a) return a.summonerId;
    return undefined;
}

export interface TacticalScore { prior: number; progress: number; risk: number; immediate: number; forbidden: boolean }

/** 所有移动候选均来自权威合法集合；投影只查询原规则，不调用clone或step。 */
export function tacticalActionPriors(state: GameState, legal: readonly Action[], context = new ReachabilityContext(state)): TacticalScore[] {
    const units = new Map(state.units.map(u => [u.id, u])), enemies = state.units.filter(u => u.hp > 0 && !areAlliedPlayers(state, state.currentPlayer, u.ownerId));
    const destinations = new Map<string, number[]>(), recruit = legal.some(a => a.type.startsWith('recruit_'));
    const hard = hardTacticalContext(state, context), recruitCache = new Map<string, number>(), supportCache = new Map<string, number>();
    const castleRecruit = new Map(hard.ownCastles.map(p => [positionKey(p), canStillRecruitAtCastle(state, p, legal)]));
    const results: TacticalScore[] = legal.map(() => ({ prior: 0, progress: 0, risk: 0, immediate: 0, forbidden: false }));
    const objectives = new Map<string, { x: number; y: number; weight: number }[]>();
    const enemyPlayers = state.players.filter(p => enemies.some(u => u.ownerId === p.id));
    const weakest = enemyPlayers.sort((a, b) => calculateArmyValue(state, a.id) - calculateArmyValue(state, b.id))[0]?.id;
    const attackScore = (view: GameState, u: Unit, targetId: string) => {
        const target = units.get(targetId)!;
        return hardAttackValue(view, u, target, hard);
    };
    const supportScore = (targetId: string) => {
        if (!supportCache.has(targetId)) supportCache.set(targetId, hardSupportValue(state, units.get(targetId)!, hard));
        return supportCache.get(targetId)!;
    };
    for (let i = 0; i < legal.length; i++) {
        const a = legal[i], r = results[i], id = actionActor(a), u = id ? units.get(id) : undefined;
        if (a.type === 'end_turn') { r.forbidden = recruit; r.prior = recruit ? -1e6 : -8; continue; }
        if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') { r.prior = hardRecruitValue(state, a, hard, recruitCache); r.immediate = r.prior; continue; }
        if (!u) continue;
        if (a.type === 'attack') r.immediate = attackScore(state, u, a.targetId);
        if (a.type === 'capture') r.immediate = getTileTerrainKey(state.map.tiles[u.pos.y][u.pos.x]) === 'castle' ? 120 : 14;
        if (a.type === 'repair') r.immediate = 7;
        if (a.type === 'heal') r.immediate = hardHealValue(state, units.get(a.targetId)!, hard);
        if (a.type === 'support') r.immediate = supportScore(a.targetId);
        if (a.type === 'summon') r.immediate = 5;
        if (a.type === 'move' || a.type === 'post_attack_move') {
            const projected = { ...u, pos: a.to, hasMoved: true }, view = { ...state, units: state.units.map(v => v.id === u.id ? projected : v) };
            const follow = getLegalActions(view, state.currentPlayer, { unitId: u.id, skipMovement: true, skipRecruitment: true });
            for (const f of follow) {
                if (f.type === 'capture') r.immediate = Math.max(r.immediate, getTileTerrainKey(state.map.tiles[a.to.y][a.to.x]) === 'castle' ? 120 : 14);
                if (f.type === 'attack') r.immediate = Math.max(r.immediate, attackScore(view, projected, f.targetId));
                if (f.type === 'heal') r.immediate = Math.max(r.immediate, hardHealValue(view, units.get(f.targetId)!, hard));
                if (f.type === 'support') r.immediate = Math.max(r.immediate, supportScore(f.targetId));
                if (f.type === 'summon') r.immediate = Math.max(r.immediate, 5);
            }
            if (!objectives.has(u.id)) {
                const goals: { x: number; y: number; weight: number }[] = [];
                const assigned = hard.assignments.get(u.id);
                if (assigned) goals.push({ ...assigned, weight: 1.5 });
                for (let y = 0; !assigned && y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
                    const tile = state.map.tiles[y][x], key = getTileTerrainKey(tile);
                    if ((key === 'castle' && hasAbility(u, 'castle_capturer') || key === 'town' && hasAbility(u, 'village_capturer')) && (tile.ownerId === null || !areAlliedPlayers(state, u.ownerId, tile.ownerId))) goals.push({ x, y, weight: key === 'castle' && tile.ownerId === weakest ? 2 : 1 });
                }
                // 集中追击指挥官、可斩杀残军和最弱敌方城堡，避免多人残局目标分散。
                if (!assigned) for (const e of enemies) if (isCommanderUnit(state, e) || e.hp <= 35) goals.push({ ...e.pos, weight: isCommanderUnit(state, e) ? 2.5 : 2 });
                const reachable = goals.filter(g => context.paths.cost(u, u.pos, g) !== null);
                objectives.set(u.id, reachable.length ? reachable : enemies.map(e => ({ ...e.pos, weight: 1 })));
            }
            let before = Infinity, after = Infinity;
            for (const goal of objectives.get(u.id)!) {
                before = Math.min(before, (context.paths.costToTarget(u, u.pos, goal) ?? Infinity) / goal.weight);
                after = Math.min(after, (context.paths.costToTarget(u, a.to, goal) ?? Infinity) / goal.weight);
            }
            r.progress = Number.isFinite(before) && Number.isFinite(after) ? before - after : 0;
            const threats = enemies.map(e => Math.min(u.hp, context.projectedDamage(e, projected))).sort((a, b) => b - a);
            r.risk = Math.min(u.hp, threats.slice(0, 3).reduce((s, d) => s + d, 0)) / Math.max(1, u.hp);
            const originTile = state.map.tiles[u.pos.y][u.pos.x];
            const clearCastle = getTileTerrainKey(originTile) === 'castle' && originTile.ownerId !== null && areAlliedPlayers(state, u.ownerId, originTile.ownerId);
            const castleKey = positionKey(u.pos), threatened = hard.threatenedOwnCastles.has(castleKey);
            const vacatesThreat = clearCastle && hard.immediateCastles.has(castleKey) && !state.units.some(v => v.id !== u.id && distance(v.pos, u.pos) === 0);
            r.prior = r.immediate + Math.max(-3, Math.min(5, r.progress)) * 1.3 - r.risk * (isCommanderUnit(state, u) ? 16 : 5)
                + (clearCastle && !threatened && castleRecruit.get(castleKey) ? 5 : 0) - (vacatesThreat ? castleRecruit.get(castleKey) ? 24 : 70 : 0) + auraPositionValue(view, projected);
            const landing = getTileTerrainKey(state.map.tiles[a.to.y][a.to.x]);
            if (landing === 'town' || landing === 'castle') {
                const hits = threats.slice(0, 2), total = hits.reduce((sum, d) => sum + d, 0);
                r.prior += (hits[0] ?? 0) >= u.hp ? 0 : total >= u.hp ? 1.5 : 4;
                if (!hasAbility(u, 'village_capturer') && hard.reservedVillages.has(positionKey(a.to))) r.prior -= 25;
            }
            const rows = destinations.get(u.id) ?? []; rows.push(i); destinations.set(u.id, rows);
        } else {
            r.prior = r.immediate;
            if (a.type === 'attack' && hard.threatenedOwnCastles.has(positionKey(u.pos)) && hard.threatSourcePositions.has(positionKey(units.get(a.targetId)!.pos))) r.prior += 24;
        }
    }
    for (let i = 0; i < legal.length; i++) {
        const a = legal[i]; if (a.type !== 'wait') continue;
        const u = units.get(a.unitId)!, tile = state.map.tiles[u.pos.y][u.pos.x];
        const moves = destinations.get(u.id) ?? [];
        const tactical = legal.some(f => actionActor(f) === u.id && (f.type === 'attack' || f.type === 'capture' || f.type === 'heal' || f.type === 'support'));
        const exit = getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && areAlliedPlayers(state, u.ownerId, tile.ownerId) && moves.length > 0;
        const useful = moves.some(j => results[j].risk < 1 && (results[j].progress > 0 || results[j].immediate > 0));
        const otherDefender = state.units.some(v => v.id !== u.id && v.hp > 0 && areAlliedPlayers(state, u.ownerId, v.ownerId) && distance(v.pos, u.pos) === 0);
        const defend = !otherDefender && getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && areAlliedPlayers(state, u.ownerId, tile.ownerId)
            && hard.threatenedOwnCastles.has(positionKey(u.pos)) && (!castleRecruit.get(positionKey(u.pos)) || hard.immediateCastles.has(positionKey(u.pos)));
        results[i].forbidden = Boolean(!defend && (exit && castleRecruit.get(positionKey(u.pos)) || !u.hasMoved && (useful || tactical)));
        results[i].prior = defend ? 25 : results[i].forbidden ? -1e6 : u.hasMoved ? 0 : -4;
    }
    return results;
}

/** 先按行动者和语义的最大分数选组，再在组内选落点；组分数不累加候选数量。 */
export function decodeTacticalGroups(logits: ArrayLike<number>, pointers: Int32Array, priors: readonly TacticalScore[], headBias: readonly number[] = []): { index: number; scores: Float64Array } {
    const scores = new Float64Array(logits.length), groups = new Map<string, number>();
    for (let i = 0; i < logits.length; i++) {
        const head = pointers[i * 5 + 2], group = `${pointers[i * 5]}:${head}`;
        scores[i] = logits[i] + (headBias[head] ?? 0) + priors[i].prior;
        const old = groups.get(group); if (old === undefined || scores[i] > scores[old]) groups.set(group, i);
    }
    let index = -1;
    for (const i of groups.values()) if (index < 0 || scores[i] > scores[index]) index = i;
    return { index, scores };
}
