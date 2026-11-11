import { TacticalPathfinder } from './tactical_pathfinding';
import { hasAbility } from '../rules';
import { getTileTerrainKey } from '../terrain_rules';
import type { Action, GameState, Position, Unit, UnitClass } from '../types';

/** 20×20 地图上保留差异且限制极端值的公开归一化常数。 */
export const PATH_COST_NORMALIZER = 40;

/** 可直接追加到候选语义末尾的三个规则特征。 */
export interface PathRelationFeatures {
    /** 候选落点之后，是否仍有该单位规则上可占且路径可达的非己方建筑。 */
    reachableCapturableBuilding: number;
    /** 候选落点到最近可占建筑的真实移动代价，除以 40 后截断到 [0,1]。 */
    normalizedNearestCapturableCost: number;
    /** 本手令最近可占建筑代价减少多少，除以 40 后截断到 [0,1]；走远时为 0。 */
    normalizedCapturableCostReduction: number;
}

const ZERO_FEATURES: PathRelationFeatures = {
    reachableCapturableBuilding: 0,
    normalizedNearestCapturableCost: 0,
    normalizedCapturableCostReduction: 0,
};

function normalizeCost(value: number): number {
    return Math.max(0, Math.min(1, value / PATH_COST_NORMALIZER));
}

/** 与 rules.getLegalActions 的 capture 分支使用同一能力与地形规则。 */
function canCaptureTerrain(unitClass: UnitClass, terrainKey: string): boolean {
    return (terrainKey === 'town' && hasAbility(unitClass, 'village_capturer'))
        || (terrainKey === 'castle' && hasAbility(unitClass, 'castle_capturer'));
}

function capturableTargets(state: GameState, playerId: number, unitClass: UnitClass): Position[] {
    const targets: Position[] = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            // 与合法 capture 规则一致：中立或非本玩家所有即可，不自行引入联盟判断。
            if (!tile || tile.ownerId === playerId) continue;
            if (canCaptureTerrain(unitClass, getTileTerrainKey(tile))) targets.push({ x, y });
        }
    }
    return targets;
}

function nearestCost(
    pathfinder: TacticalPathfinder,
    unit: Unit,
    from: Position,
    targets: readonly Position[],
): number | null {
    let best = Infinity;
    for (const target of targets) {
        const cost = pathfinder.cost(unit, from, target);
        if (cost !== null && cost < best) best = cost;
    }
    return Number.isFinite(best) ? best : null;
}

interface ApplicableAction {
    unit: Unit;
    before: Position;
    after: Position;
    isCapture: boolean;
}

function applicableAction(state: GameState, playerId: number, action: Action): ApplicableAction | null {
    if (action.type === 'move' || action.type === 'post_attack_move') {
        const unit = state.units.find((candidate) => candidate.id === action.unitId && candidate.ownerId === playerId);
        return unit ? { unit, before: unit.pos, after: action.to, isCapture: false } : null;
    }
    if (action.type === 'recruit_and_deploy') {
        // 路径规则只读取兵种、阵营、位置与移动覆盖；新招募单位没有 APK 单位级覆盖。
        const unit: Unit = {
            id: `path-recruit-${action.unitClass}`,
            ownerId: playerId,
            unitClass: action.unitClass,
            pos: action.castlePos,
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
        };
        return { unit, before: action.castlePos, after: action.to, isCapture: false };
    }
    if (action.type === 'capture') {
        const unit = state.units.find((candidate) => candidate.id === action.unitId && candidate.ownerId === playerId);
        return unit ? { unit, before: unit.pos, after: unit.pos, isCapture: true } : null;
    }
    // attack/heal/support/wait/end_turn/recruit_to_castle 等没有新的落点，统一返回零。
    return null;
}

/** 离线计算一个状态的全部候选；路径器在状态内复用缓存，不读取 H0 分数或搜索结果。 */
export function encodePathRelations(
    state: GameState,
    playerId: number,
    actions: readonly Action[],
): PathRelationFeatures[] {
    const pathfinder = new TacticalPathfinder(state);
    const targetsByClass = new Map<UnitClass, Position[]>();

    return actions.map((action) => {
        const applicable = applicableAction(state, playerId, action);
        if (!applicable) return { ...ZERO_FEATURES };
        const { unit, before, after, isCapture } = applicable;
        let targets = targetsByClass.get(unit.unitClass);
        if (!targets) {
            targets = capturableTargets(state, playerId, unit.unitClass);
            targetsByClass.set(unit.unitClass, targets);
        }
        if (targets.length === 0) return { ...ZERO_FEATURES };

        // 合法 capture 已站在一个规则上可占的非己方建筑上，动作类型本身表达“立即占领”。
        if (isCapture && targets.some((target) => target.x === after.x && target.y === after.y)) {
            return {
                reachableCapturableBuilding: 1,
                normalizedNearestCapturableCost: 0,
                normalizedCapturableCostReduction: 0,
            };
        }

        const afterCost = nearestCost(pathfinder, unit, after, targets);
        if (afterCost === null) return { ...ZERO_FEATURES };
        const beforeCost = nearestCost(pathfinder, unit, before, targets);
        const reduction = beforeCost === null ? 0 : Math.max(0, beforeCost - afterCost);
        return {
            reachableCapturableBuilding: 1,
            normalizedNearestCapturableCost: normalizeCost(afterCost),
            normalizedCapturableCostReduction: normalizeCost(reduction),
        };
    });
}
