/** 生成时注入可选计算后端；只替换指定函数内的纯数值子项，默认CPU表达式保留。 */
import {injectHardNative} from './apk_hard_native_transform.mjs';
export function injectHardCompute(body) {
    const once = (source, before, after) => {
        if (source.split(before).length !== 2) throw Error('困难脚本后端注入锚点不是唯一：' + before.slice(0, 100));
        return source.replace(before, after);
    };
    body = once(body, 'const TEAM_POPULATION_LIMIT = 100;', 'const TEAM_POPULATION_LIMIT = environment.populationLimit ?? 100;');
    const start = body.indexOf('function calculateMovementScores(');
    const end = body.indexOf('\nfunction ', start + 10);
    if (start < 0 || end < 0) throw Error('缺少困难移动评分函数');
    let fn = body.slice(start, end);
    const hook = `
    // 只在可选后端启用时收集输入；所有位置来源仍由原困难脚本决定。
    const acceleratedMovement = hardAiAllyPositions && environment.movementBatch
        ? (() => {
            const assault = getActiveAiAssaultSnapshot(scoringTeamId);
            const enemies = Array.isArray(options.enemyDistancePositions) ? options.enemyDistancePositions
                : assault && Array.isArray(assault.assaultEnemyPositions) ? assault.assaultEnemyPositions : collectEnemyUnitPositions(scoringTeamId);
            const allies = Array.isArray(options.allyDistancePositions) ? options.allyDistancePositions
                : assault && Array.isArray(assault.assaultAllyPositions) ? assault.assaultAllyPositions : collectAllyUnitPositions(scoringTeamId);
            const castles = collectHardAiCastleDistancePositions(scoringTeamId, false);
            let relocated = false;
            const landingPositions = hardAiAllyPositions.filter(p => {
                if (!relocated && p.row === movementScoreOrigin.row && p.col === movementScoreOrigin.col) { relocated = true; return false; }
                return true;
            });
            const coordinates = ps => ps.map(p => [p.row, p.col]);
            const result = environment.movementBatch({
                positions: coordinates(reachablePositions),
                enemyPositions: coordinates([...enemies, ...collectHardAiCastleDistancePositions(scoringTeamId, true)]),
                allyPositions: coordinates([...allies, ...castles]),
                landingPositions: coordinates([...landingPositions, ...castles]),
                landingCount: landingPositions.length + castles.length + 1,
                defenses: reachablePositions.map(p => hardAiTerrainDefense(p.row, p.col, moveUnit)),
                unitValue: UnitValue, maxRange: moveUnit.maxRange,
                situation: Number.isFinite(hardAiSituation) ? hardAiSituation : null
            });
            for (const key of ['enemy', 'ally', 'landing']) {
                if (!Array.isArray(result[key]) || result[key].length !== reachablePositions.length || !result[key].every(Number.isFinite)) throw Error('困难计算后端返回无效向量：' + key);
            }
            if (environment.verifyMovementBatch) reachablePositions.forEach((p, index) => {
                const enemy = calculateEnemyDistance(p.row, p.col, unitTeam.id, options.enemyDistancePositions || null);
                const ally = calculateAllyDistance(p.row, p.col, unitTeam.id, options.allyDistancePositions || null);
                const landing = calculateHardAiLandingPositionScore(calculateHardAiLandingAllyDistance(p.row, p.col, scoringTeamId, movementScoreOrigin, hardAiAllyPositions), enemy, hardAiTerrainDefense(p.row, p.col, moveUnit), UnitValue, moveUnit.maxRange, hardAiSituation);
                for (const [key, expected] of Object.entries({enemy, ally, landing})) {
                    if (Math.abs(result[key][index] - expected) > 1e-10) throw Error('困难GPU数值与原表达式不一致：' + key + '/' + index + '/' + result[key][index] + '/' + expected);
                }
            });
            return result;
        })() : null;
`;
    fn = once(fn, '    for (let k = 0; k < reachablePositions.length; k++) {', hook + '    for (let k = 0; k < reachablePositions.length; k++) {');
    fn = once(fn, 'const enemyDistance = calculateEnemyDistance(i, j, unitTeam.id, options.enemyDistancePositions || null);', 'const enemyDistance = acceleratedMovement ? acceleratedMovement.enemy[k] : calculateEnemyDistance(i, j, unitTeam.id, options.enemyDistancePositions || null);');
    fn = once(fn, 'const allyDistance = calculateAllyDistance(i, j, unitTeam.id, options.allyDistancePositions || null);', 'const allyDistance = acceleratedMovement ? acceleratedMovement.ally[k] : calculateAllyDistance(i, j, unitTeam.id, options.allyDistancePositions || null);');
    fn = once(fn, 'if (hardAiAllyPositions) {\n            const landingAllyDistance', 'if (acceleratedMovement) {\n            score += acceleratedMovement.landing[k];\n        } else if (hardAiAllyPositions) {\n            const landingAllyDistance');
    body = body.slice(0, start) + fn + body.slice(end);
    const rangeStart = body.indexOf('function calculateMovementRange(');
    const rangeEnd = body.indexOf('\nfunction ', rangeStart + 10);
    let range = body.slice(rangeStart, rangeEnd);
    range = once(range, '    const queue = [];', `
    // 地形代价和阻挡仍由原脚本计算，GPU只接手确定性的图搜索。
    let acceleratedRange = null;
    if (environment.movementRange) {
        const prepared = environment.nativeCompute ? prepareHardNativeMovement(selectUnit,movingTeamId) : null;
        const costs = prepared ? prepared.costs : [], blocked = prepared ? prepared.blocked : [], terrainCosts = new Map();
        if (!prepared)
        for (let r = 0; r < appData.rows; r++) for (let c = 0; c < appData.cols; c++) {
            const terrain = appData.gridData[r][c].terrain;
            if (!terrainCosts.has(terrain)) terrainCosts.set(terrain, calculateMoveCost(r, c, selectUnit));
            costs.push(terrainCosts.get(terrain));
            blocked.push(isEnemyMovementBlocker(r, c, movingTeamId, selectUnit) ? 1 : 0);
        }
        const rangeKey = prepared ? prepared.key+'/'+row+','+col+','+UnitMove : null;
        const cachedRange = prepared && prepared.ranges.get(rangeKey);
        let packedRange = cachedRange;
        if(!packedRange) {
            acceleratedRange = environment.movementRange({rows:appData.rows, cols:appData.cols, row, col, move:UnitMove, costs, blocked});
            if(prepared){packedRange=packHardNativeRange(acceleratedRange);prepared.ranges.set(rangeKey,packedRange,packedRange.byteLength);}
        }
        // 仅内部只读威胁查询消费紧凑范围；普通调用仍返回独立对象。
        if(packedRange&&options.nativeRangeConsumer)return options.nativeRangeConsumer(packedRange);
        if(!acceleratedRange)acceleratedRange=unpackHardNativeRange(packedRange);
        if (!environment.verifyMovementBatch) return acceleratedRange;
    }
    const queue = [];`);
    range = once(range, '    return reachablePositions;', `
    if (acceleratedRange && JSON.stringify(acceleratedRange) !== JSON.stringify(reachablePositions)) throw Error('GPU移动范围的候选顺序或剩余移动力不同');
    return acceleratedRange || reachablePositions;`);
    return injectHardNative(body.slice(0, rangeStart) + range + body.slice(rangeEnd));
}
