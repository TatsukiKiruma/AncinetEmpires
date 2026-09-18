import type { Action, Position } from '../src/game/types';

/** 语义层需要的最小单位快照，兼容 Observation 单位与 GameState 单位坐标 */
export interface SemanticUnitLike {
    id: string;
    x: number;
    y: number;
}

/**
 * 结构化动作的真实目标语义。
 * 每个字段独立描述一类位置，避免把行动者位置当作目标位置复用。
 * 缺省规则与引擎保持一致（见 src/game/engine.ts）：
 * destroy_town 的 target 缺省为行动者所在格。
 */
export interface ActionSemantics {
    actionType: string;
    actorId: string | null;
    /** 行动者单位当前所在格 */
    actorPos: Position | null;
    /** 被作用的目标单位 id（attack/heal/support） */
    targetUnitId: string | null;
    /** 动作实际作用的目标格；与 actorPos 分离 */
    targetPos: Position | null;
    /** 落地/部署目的地（move、summon、recruit_and_deploy） */
    landingPos: Position | null;
    /** 招募来源城堡格（recruit_to_castle、recruit_and_deploy） */
    sourceCastlePos: Position | null;
    /** 部署目的地（recruit_and_deploy 专用，与来源城堡分离） */
    deployPos: Position | null;
    /** 动作对象是否显式携带目标坐标（destroy_town 的 target 可选） */
    targetExplicit: boolean;
}

function posOrEmpty(position: Position | null | undefined): Position | null {
    return position ? { x: position.x, y: position.y } : null;
}

function unitPos(units: ReadonlyMap<string, SemanticUnitLike>, unitId: string | null | undefined): Position | null {
    if (!unitId) return null;
    const unit = units.get(unitId);
    return unit ? { x: unit.x, y: unit.y } : null;
}

export function getActionSemantics(
    action: Action,
    units: ReadonlyMap<string, SemanticUnitLike>
): ActionSemantics {
    const base: ActionSemantics = {
        actionType: action.type,
        actorId: null,
        actorPos: null,
        targetUnitId: null,
        targetPos: null,
        landingPos: null,
        sourceCastlePos: null,
        deployPos: null,
        targetExplicit: false
    };
    switch (action.type) {
        case 'move':
        case 'post_attack_move': {
            return {
                ...base,
                actorId: action.unitId,
                actorPos: unitPos(units, action.unitId),
                targetPos: posOrEmpty(action.to),
                landingPos: posOrEmpty(action.to),
                targetExplicit: true
            };
        }
        case 'attack':
        case 'heal':
        case 'support': {
            const actorId = action.type === 'attack'
                ? action.attackerId
                : action.type === 'heal' ? action.healerId : action.supporterId;
            return {
                ...base,
                actorId,
                actorPos: unitPos(units, actorId),
                targetUnitId: action.targetId,
                targetPos: unitPos(units, action.targetId),
                targetExplicit: true
            };
        }
        case 'capture':
        case 'repair':
        case 'wait': {
            const actorPos = unitPos(units, action.unitId);
            return {
                ...base,
                actorId: action.unitId,
                actorPos,
                // capture/repair/wait 作用在行动者所在格，目标格即行动者格
                targetPos: actorPos
            };
        }
        case 'destroy_town': {
            const actorPos = unitPos(units, action.unitId);
            const explicit = action.target !== undefined && action.target !== null;
            return {
                ...base,
                actorId: action.unitId,
                actorPos,
                // 引擎缺省语义：action.target ?? destroyer.pos
                targetPos: explicit ? posOrEmpty(action.target) : actorPos,
                targetExplicit: explicit
            };
        }
        case 'summon': {
            return {
                ...base,
                actorId: action.summonerId,
                actorPos: unitPos(units, action.summonerId),
                targetPos: posOrEmpty(action.spawnPos),
                landingPos: posOrEmpty(action.spawnPos),
                targetExplicit: true
            };
        }
        case 'recruit_to_castle': {
            return {
                ...base,
                sourceCastlePos: posOrEmpty(action.castlePos),
                targetPos: posOrEmpty(action.castlePos),
                targetExplicit: true
            };
        }
        case 'recruit_and_deploy': {
            return {
                ...base,
                sourceCastlePos: posOrEmpty(action.castlePos),
                deployPos: posOrEmpty(action.to),
                landingPos: posOrEmpty(action.to),
                targetPos: posOrEmpty(action.to),
                targetExplicit: true
            };
        }
        case 'surrender':
        case 'end_turn':
            return base;
        default:
            return base;
    }
}

function formatPos(position: Position | null): string {
    return position ? `${position.x},${position.y}` : '-';
}

/** 可读调试层：逐行描述动作语义，供审计日志与特征 token 使用 */
export function describeActionSemantics(
    action: Action,
    units: ReadonlyMap<string, SemanticUnitLike>
): string[] {
    const semantics = getActionSemantics(action, units);
    const lines = [`type:${semantics.actionType}`];
    if (semantics.actorId) lines.push(`actor:${semantics.actorId}@${formatPos(semantics.actorPos)}`);
    if (semantics.targetUnitId) lines.push(`targetUnit:${semantics.targetUnitId}@${formatPos(semantics.targetPos)}`);
    if (semantics.targetExplicit) lines.push(`targetTile:${formatPos(semantics.targetPos)}`);
    if (semantics.actionType === 'destroy_town') {
        lines.push(`destroyTownTarget:${semantics.targetExplicit ? 'explicit' : 'actor_default'}`);
    }
    if (semantics.sourceCastlePos) lines.push(`sourceCastle:${formatPos(semantics.sourceCastlePos)}`);
    if (semantics.deployPos) lines.push(`deploy:${formatPos(semantics.deployPos)}`);
    if (semantics.landingPos && semantics.landingPos !== semantics.deployPos) {
        lines.push(`landing:${formatPos(semantics.landingPos)}`);
    }
    return lines;
}
