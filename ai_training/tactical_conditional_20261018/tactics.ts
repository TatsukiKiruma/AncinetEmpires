import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getEffectiveStats, hasAbility } from '../../src/game/abilities';
import { areEnemyPlayers, areAlliedPlayers, isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { TacticalPathfinder } from '../../src/game/ai/tactical_pathfinding';
import type { Action, GameState, Unit } from '../../src/game/types';
import { movingThreat, nextOpponent, THREAT_AUDIT } from './threat';

export const FEATURE_NAMES = [
    'followup_max_enemy_hp_loss', 'followup_can_kill', 'followup_can_capture', 'followup_can_heal_or_summon',
    'actor_moving_reply_damage', 'actor_moving_reply_lethal', 'moving_reply_known',
    'commander_moving_reply_damage', 'commander_moving_reply_lethal',
    'capture_path_before', 'capture_path_after', 'capture_path_gain', 'capture_path_known',
    'enemy_path_before', 'enemy_path_after', 'enemy_path_gain', 'enemy_path_known',
    'recruit_same_class_count', 'recruit_can_capture', 'recruit_move', 'recruit_range', 'recruit_flying',
] as const;
export const NEW_KEYS = FEATURE_NAMES.map(k => 'tactic_v2.' + k);

export function actorId(action: Action, before: GameState, after: GameState): string | undefined {
    for (const name of ['unitId', 'attackerId', 'healerId', 'supporterId', 'summonerId'] as const) {
        if (name in action) return (action as unknown as Record<string, string>)[name];
    }
    if (action.type.startsWith('recruit_')) return after.units.find(u => !before.units.some(v => v.id === u.id))?.id;
}

/** 新特征与旧10维均通过同一权威分支生成；旧列维持原先的一步/原地风险语义。 */
export function extractFeatures(engine: GameEngine, actions: readonly Action[]) {
    const before = engine.getState(), player = before.currentPlayer;
    const original = JSON.stringify(before);
    const hp = (s: GameState, own: boolean) => s.units.filter(u => (areAlliedPlayers(s, u.ownerId, player)) === own).reduce((n, u) => n + u.hp, 0);
    const count = (s: GameState, own: boolean) => s.units.filter(u => (areAlliedPlayers(s, u.ownerId, player)) === own).length;
    const pathBefore = new TacticalPathfinder(before);
    const ownCommanders = before.units.filter(u => u.ownerId === player && isCommanderUnit(before, u, player)).map(u => u.id);
    const enemies = before.units.filter(u => areEnemyPlayers(before, player, u.ownerId));
    const tiles = before.map.tiles.flatMap((row, y) => row.flatMap((tile, x) => {
        const key = getTileTerrainKey(tile);
        return (key === 'town' || key === 'castle') && (tile.ownerId === null || areEnemyPlayers(before, player, tile.ownerId)) ? [{ tile, x, y }] : [];
    }));
    const nearest = (finder: TacticalPathfinder, unit: Unit, positions: { x: number; y: number }[]) => {
        let best = Infinity;
        for (const pos of positions) { const cost = finder.cost(unit, unit.pos, pos); if (cost !== null) best = Math.min(best, cost); }
        return Number.isFinite(best) ? best : null;
    };
    const fallbackBefore = THREAT_AUDIT.exhaustiveFallbacks;
    const stats = { candidates: actions.length, stepMs: 0, followupMs: 0, threatMs: 0, pathMs: 0, exhaustiveFallbacks: 0 };
    const old: number[][] = [], extra: number[][] = [];
    for (const action of actions) {
        const stepStart = performance.now();
        const branch = engine.clone(), applied = branch.step(action);
        stats.stepMs += performance.now() - stepStart;
        if (applied.info.includes('非法动作')) throw Error('特征输入不是权威合法动作:' + encodeAction(action));
        const after = applied.state, id = actorId(action, before, after);
        const actor = after.units.find(u => u.id === id), previous = before.units.find(u => u.id === id);
        const followupStart = performance.now();
        let followDamage = 0, followKill = 0, followCapture = 0, followSkill = 0;
        if (actor && !actor.hasActed && after.currentPlayer === player && !branch.isTerminal()) {
            for (const follow of branch.getLegalActions(player, { unitId: actor.id, skipMovement: true, skipRecruitment: true })) {
                if (follow.type === 'capture') followCapture = 1;
                if (follow.type === 'heal' || follow.type === 'summon') followSkill = 1;
                if (follow.type === 'attack') {
                    const hit = branch.clone().step(follow).state;
                    followDamage = Math.max(followDamage, hp(after, false) - hp(hit, false));
                    followKill = Math.max(followKill, Number(count(hit, false) < count(after, false)));
                }
            }
        }
        let captured = 0;
        before.map.tiles.forEach((row, y) => row.forEach((tile, x) => { if (tile.ownerId !== player && after.map.tiles[y][x].ownerId === player) captured++; }));
        const afterLegal = after.currentPlayer === player && !branch.isTerminal() ? branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }) : [];
        const supports = afterLegal.filter(a => (a.type === 'heal' || a.type === 'support') && a.targetId === id).length;
        stats.followupMs += performance.now() - followupStart;
        const threatStart = performance.now();
        const reply = nextOpponent(branch, player), replyState = reply.branch.getState();
        const targets = replyState.units.filter(u => u.id === id || ownCommanders.includes(u.id));
        const risks = reply.known ? movingThreat(reply.branch, targets) : new Map();
        const actorRisk = id ? risks.get(id) : undefined;
        const commanderRisk = ownCommanders.map(c => risks.get(c)).filter(Boolean);
        const cmdDamage = Math.max(0, ...commanderRisk.map(r => r!.damage));
        const cmdLethal = Math.max(0, ...commanderRisk.map(r => r!.lethal));
        stats.threatMs += performance.now() - threatStart;
        const pathStart = performance.now();
        old.push([(hp(before, false) - hp(after, false)) / 128, (hp(before, true) - hp(after, true)) / 128,
            (count(before, false) - count(after, false)) / 16, (count(before, true) - count(after, true)) / 16,
            captured / 16, ((after.players.find(p => p.id === player)?.gold ?? 0) - (before.players.find(p => p.id === player)?.gold ?? 0)) / 1024,
            (actorRisk?.immediate ?? 0) / 128, Number(!!actor && (actorRisk?.immediate ?? 0) >= actor.hp), Number(reply.known), supports / 16].map(Math.fround));
        let cb: number | null = null, ca: number | null = null, eb: number | null = null, ea: number | null = null;
        if (actor) {
            const pathAfter = new TacticalPathfinder(after);
            const capturable = tiles.filter(t => getTileTerrainKey(t.tile) === 'castle' ? hasAbility(actor, 'castle_capturer') : hasAbility(actor, 'village_capturer'));
            ca = nearest(pathAfter, actor, capturable);
            ea = nearest(pathAfter, actor, enemies.map(u => u.pos));
            if (previous) { cb = nearest(pathBefore, previous, capturable); eb = nearest(pathBefore, previous, enemies.map(u => u.pos)); }
        }
        const recruit = action.type.startsWith('recruit_') && actor;
        extra.push([followDamage / 128, followKill, followCapture, followSkill,
            (actorRisk?.damage ?? 0) / 128, actorRisk?.lethal ?? 0, Number(reply.known), cmdDamage / 128, cmdLethal,
            (cb ?? 64) / 64, (ca ?? 64) / 64, cb !== null && ca !== null ? (cb - ca) / 64 : 0, Number(cb !== null && ca !== null),
            (eb ?? 64) / 64, (ea ?? 64) / 64, eb !== null && ea !== null ? (eb - ea) / 64 : 0, Number(eb !== null && ea !== null),
            recruit ? before.units.filter(u => u.ownerId === player && u.unitClass === actor.unitClass).length / 32 : 0,
            recruit ? Number(hasAbility(actor, 'village_capturer') || hasAbility(actor, 'castle_capturer')) : 0,
            recruit ? getEffectiveStats(actor).move / 16 : 0, recruit ? getEffectiveStats(actor).maxRange / 8 : 0,
            recruit ? Number(hasAbility(actor, 'flying')) : 0].map(Math.fround));
        stats.pathMs += performance.now() - pathStart;
    }
    if (JSON.stringify(engine.getState()) !== original) throw Error('特征提取改写原始状态');
    stats.exhaustiveFallbacks = THREAT_AUDIT.exhaustiveFallbacks - fallbackBefore;
    if (extra.some(v => v.length !== NEW_KEYS.length || v.some(n => !Number.isFinite(n)))) throw Error('新特征形状/数值非法');
    return { old, extra, stats };
}
