import type { Action, GameState, Position } from '../../game/types';
import { ACTION_HEADS, POINTER_DIM, UNIT_CLASSES, type EntityIndexMap, type FactoredActions } from './contract';

function requireIndex(value: number | undefined): number {
    if (value === undefined) throw Error('动作引用实体缺失');
    return value;
}
export function encodeFactoredActions(state: GameState, legalActions: readonly Action[], index: EntityIndexMap): FactoredActions {
    const pointers: number[] = [], sourceIndices: number[] = [], seen = new Set<string>();
    const actorMask = new Uint8Array(index.globalActorIdx + 1), tiles = new Map<number, Set<number>>(), rows = new Map<string, number[]>();
    for (const [source, a] of legalActions.entries()) {
        if (a.type === 'surrender') continue;
        let actor = index.globalActorIdx, tile = -1, head: number = ACTION_HEADS.indexOf(a.type), cls = -1, target = -1;
        const tileIdx = (p: Position) => {
            if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= state.map.width || p.y >= state.map.height) throw Error('动作坐标越界');
            return p.y * state.map.width + p.x;
        };
        if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
            actor = requireIndex(index.castles.get(tileIdx(a.castlePos))); cls = UNIT_CLASSES.indexOf(a.unitClass); tile = tileIdx(a.type === 'recruit_and_deploy' ? a.to : a.castlePos);
        } else if (a.type !== 'end_turn') {
            const id = 'unitId' in a ? a.unitId : 'attackerId' in a ? a.attackerId : 'healerId' in a ? a.healerId : 'supporterId' in a ? a.supporterId : a.summonerId;
            actor = requireIndex(index.units.get(id)); const entity = index.entities[actor]; tile = entity.y * state.map.width + entity.x;
            if (a.type === 'move' || a.type === 'post_attack_move') tile = tileIdx(a.to);
            if (a.type === 'attack' || a.type === 'heal' || a.type === 'support') {
                target = requireIndex(index.units.get(a.targetId)); tile = tileIdx(index.entities[target]);
            }
            if (a.type === 'summon') { target = requireIndex(index.graves.get(a.graveId)); tile = tileIdx(a.spawnPos); }
            if (a.type === 'destroy_town' && a.target !== undefined) { head = 14; tile = tileIdx(a.target); }
        }
        const tuple = [actor, tile, head, cls, target], key = tuple.join(':');
        if (seen.has(key)) throw Error('因子化动作指针碰撞或输入动作重复'); seen.add(key);
        const row = sourceIndices.length; pointers.push(...tuple); sourceIndices.push(source); actorMask[actor] = 1;
        if (!tiles.has(actor)) tiles.set(actor, new Set()); tiles.get(actor)!.add(tile);
        const prefix = `${actor}:${tile}`; if (!rows.has(prefix)) rows.set(prefix, []); rows.get(prefix)!.push(row);
    }
    return { pointers: Int32Array.from(pointers), sourceIndices: Int32Array.from(sourceIndices), actorMask, tilesByActor: new Map([...tiles].map(([actor, ts]) => [actor, Int32Array.from([...ts].sort((a, b) => a - b))])), rowsByActorTile: new Map([...rows].map(([key, rs]) => [key, Int32Array.from(rs)])) };
}

/** 不保存原始候选对象；完全从语义指针及实体索引重建权威动作。 */
export function decodeFactoredAction(state: GameState, index: EntityIndexMap, tuple: ArrayLike<number>): Action {
    if (tuple.length !== POINTER_DIM || Array.from(tuple).some(v => !Number.isInteger(v))) throw Error('指针形状或整数类型错误');
    const [actor, tile, head, cls, target] = Array.from(tuple), type = ACTION_HEADS[head];
    if (!type || type === 'surrender') throw Error('无效动作语义');
    if (type === 'end_turn') {
        if (actor !== index.globalActorIdx || tile !== -1 || cls !== -1 || target !== -1) throw Error('全局动作指针错误');
        return { type };
    }
    if (actor < 0 || actor >= index.entities.length || tile < 0 || tile >= state.map.width * state.map.height) throw Error('动作指针越界');
    const e = index.entities[actor], pos = { x: tile % state.map.width, y: Math.floor(tile / state.map.width) };
    if (type === 'recruit_to_castle' || type === 'recruit_and_deploy') {
        if (e.kind !== 'castle' || !UNIT_CLASSES[cls] || target !== -1) throw Error('招募指针错误');
        const common = { unitClass: UNIT_CLASSES[cls], castlePos: { x: e.x, y: e.y } };
        return type === 'recruit_to_castle' ? { type, ...common } : { type, ...common, to: pos };
    }
    if (e.kind !== 'unit' || cls !== -1) throw Error('单位动作指针错误');
    if (type === 'attack' || type === 'heal' || type === 'support' || type === 'summon') {
        const t = index.entities[target]; if (!t || t.kind !== (type === 'summon' ? 'grave' : 'unit')) throw Error('目标实体指针错误');
        if (type === 'attack') return { type, attackerId: e.id, targetId: t.id };
        if (type === 'heal') return { type, healerId: e.id, targetId: t.id };
        if (type === 'support') return { type, supporterId: e.id, targetId: t.id };
        return { type, summonerId: e.id, graveId: t.id, spawnPos: pos };
    }
    if (target !== -1) throw Error('无目标动作包含多余引用');
    if (type === 'move' || type === 'post_attack_move') return { type, unitId: e.id, to: pos };
    if (type === 'destroy_town_target') return { type: 'destroy_town', unitId: e.id, target: pos };
    return { type, unitId: e.id };
}
