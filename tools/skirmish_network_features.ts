/**
 * T10 紧凑网络特征编码：网格空间分箱 + 单位实体表 + 全局经济/规则量 + 动作语义。
 *
 * 设计（任务书 T10 执行详情 2/3）：
 *   - 地图经固定 4×4 空间分箱聚合（通道×bin），地图尺寸变化天然由分箱比例吸收（等价 padding）；
 *   - 同格多单位（stacked/pending）在实体表与网格密度里各自独立计入，不互相覆盖；
 *   - 实体表按威胁值排序取前 K 己/敌各一列，槽位缺失置零并记录有效数（置换不变）；
 *   - 严禁泄漏：不读 seed/metadata/玩家名/教师分数/标签位置/对局文件名；单位只按
 *     (视角相对阵营, 坐标, 数值属性) 参与，ID 字符串不进入任何特征；
 *   - 所有量均为可解释引擎量（金币、军值、地形归属、getEffectiveStats），不改规则公式。
 */
import type { Action, GameState, Position, Unit } from '../src/game/types';
import { areEnemyPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { getEffectiveStats } from '../src/game/abilities';
import { getTileTerrainKey, tileHasTerrainTag } from '../src/game/terrain_rules';
import { getDistance } from '../src/game/map';
import { calculateArmyValue } from '../src/game/env';
import { getActionSemantics, type SemanticUnitLike } from './skirmish_action_semantics';

export const STATE_FEATURE_DIM = 356;
export const STATE_ENCODER_VERSION = 'state-v2';
export const ACTION_FEATURE_DIM_V1 = 32;
export const ACTION_FEATURE_DIM_V2 = 45;
export const ACTION_FEATURE_DIM = ACTION_FEATURE_DIM_V2;
export const ACTION_ENCODER_VERSION = 'action-v2';

/** 全局段布局：[0..19]；其中 [3] = (subject − bestEnemy) 金币差 /1000（视角翻转位）。 */
const GLOBAL_DIM = 20;
/** 网格段：4×4 bin × 6 通道。 */
const GRID_BINS = 4;
const GRID_CHANNELS = 6;
const GRID_DIM = GRID_BINS * GRID_BINS * GRID_CHANNELS;
/** 实体段：敌我各 10 槽 × 12 维。 */
const ENTITY_SLOTS = 10;
const ENTITY_DIM = 12;
const ENTITY_BLOCK = ENTITY_SLOTS * ENTITY_DIM;
/** 动作类型 one-hot 段。 */
const ACTION_TYPES = [
    'move', 'attack', 'capture', 'repair', 'wait',
    'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon',
    'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn'
] as const;

export const UNIT_CLASS_ORDER = [
    'soldier', 'ghost', 'mermaid', 'archer', 'slime', 'water_elemental', 'dark_mage', 'witch',
    'paladin', 'elf', 'berserker', 'wolf', 'golem', 'ice_elemental', 'druid', 'catapult',
    'wolf_archer', 'dragon', 'commander', 'skeleton', 'crystal'
] as const;

function writeGlobal(out: Float64Array, o: number, state: GameState, playerId: number): void {
    const alliance = getAllianceId(state, playerId);
    const enemies = state.players.filter(p => p.id !== playerId && areEnemyPlayers(state, playerId, p.id));
    const goldOf = (pid: number) => state.players.find(p => p.id === pid)?.gold ?? 0;
    const bestEnemyGold = enemies.length ? Math.max(...enemies.map(p => p.gold)) : 0;
    const ownTerr = state.map.tiles.flat().filter(t => t.ownerId !== null && !areEnemyPlayers(state, playerId, t.ownerId)).length;
    const enemyTerr = state.map.tiles.flat().filter(t => t.ownerId !== null && areEnemyPlayers(state, playerId, t.ownerId)).length;
    const totalTerr = Math.max(1, state.map.width * state.map.height);
    const ownArmy = calculateArmyValue(state, playerId);
    const enemyArmy = enemies.length ? Math.max(...enemies.map(p => calculateArmyValue(state, p.id))) : 0;
    const aliveUnits = state.units.filter(u => u.hp > 0);
    const ownUnits = aliveUnits.filter(u => getAllianceId(state, u.ownerId) === alliance);
    const enemyUnits = aliveUnits.filter(u => areEnemyPlayers(state, playerId, u.ownerId));
    const terrain = (u: Unit) => state.map.tiles[u.pos.y]?.[u.pos.x];
    const countKey = (list: Unit[], key: string) => list.filter(u => { const t = terrain(u); return t && getTileTerrainKey(t) === key; }).length;
    const commanderAlive = (ids: number[]) => ids.some(pid => state.units.some(u => u.ownerId === pid && u.hp > 0 && u.unitClass === 'commander'));
    const enemyIds = enemies.map(p => p.id);
    out[o + 0] = state.turn / 50;
    out[o + 1] = goldOf(playerId) / 1000;
    out[o + 2] = bestEnemyGold / 1000;
    out[o + 3] = (goldOf(playerId) - bestEnemyGold) / 1000;
    out[o + 4] = ownUnits.length / 10;
    out[o + 5] = enemyUnits.length / 10;
    out[o + 6] = ownArmy / 1000;
    out[o + 7] = enemyArmy / 1000;
    out[o + 8] = ownTerr / totalTerr;
    out[o + 9] = enemyTerr / totalTerr;
    out[o + 10] = countKey(ownUnits, 'castle') / 4;
    out[o + 11] = countKey(enemyUnits, 'castle') / 4;
    out[o + 12] = countKey(ownUnits, 'town') / 6;
    out[o + 13] = countKey(enemyUnits, 'town') / 6;
    out[o + 14] = commanderAlive([playerId]) ? 1 : 0;
    out[o + 15] = enemyIds.length ? (enemyIds.filter(id => commanderAlive([id])).length / enemyIds.length) : 0;
    out[o + 16] = state.currentPlayer === playerId ? 1 : 0;
    out[o + 17] = enemies.filter(p => !p.isAlive).length / Math.max(1, enemies.length);
    out[o + 18] = (state.pendingUnitId ? 1 : 0);
    out[o + 19] = (state.map.width + state.map.height) / 40;
}

function writeGrid(out: Float64Array, o: number, state: GameState, playerId: number): void {
    const alliance = getAllianceId(state, playerId);
    const binW = Math.max(1, Math.ceil(state.map.width / GRID_BINS));
    const binH = Math.max(1, Math.ceil(state.map.height / GRID_BINS));
    const bins = Array.from({ length: GRID_BINS * GRID_BINS }, () => new Float64Array(GRID_CHANNELS));
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const bi = Math.min(GRID_BINS - 1, Math.floor(x / binW));
            const bj = Math.min(GRID_BINS - 1, Math.floor(y / binH));
            const cell = bins[bj * GRID_BINS + bi];
            const tile = state.map.tiles[y][x];
            const key = getTileTerrainKey(tile);
            const area = Math.max(1, binW * binH);
            if (tileHasTerrainTag(tile, 'water')) cell[5] += 1 / area;
            if (tile.ownerId !== null) {
                const enemyTile = areEnemyPlayers(state, playerId, tile.ownerId);
                if (key === 'castle') cell[enemyTile ? 3 : 2] += 1;
                else if (key === 'town' && !enemyTile) cell[2] += 0.5;
                else if (key === 'town' && enemyTile) cell[4] += 0.5;
            } else if (key === 'castle' || key === 'town') {
                cell[4] += 0.5; // 中立目标（可占领价值）
            }
        }
    }
    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const bi = Math.min(GRID_BINS - 1, Math.floor(u.pos.x / binW));
        const bj = Math.min(GRID_BINS - 1, Math.floor(u.pos.y / binH));
        const cell = bins[bj * GRID_BINS + bi];
        if (getAllianceId(state, u.ownerId) === alliance) cell[0] += u.hp / 100;
        else if (areEnemyPlayers(state, playerId, u.ownerId)) cell[1] += u.hp / 100;
    }
    for (const cell of bins) {
        for (let c = 0; c < GRID_CHANNELS; c += 1) out[o++] = cell[c] / 4;
    }
}

interface EntityRow { score: number; y: number; x: number; rel: number; unit: Unit }

function entityRows(state: GameState, playerId: number, alliance: number, enemySide: boolean): EntityRow[] {
    const rows: EntityRow[] = [];
    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const isEnemy = enemySide ? areEnemyPlayers(state, playerId, u.ownerId) : getAllianceId(state, u.ownerId) === alliance;
        if (!isEnemy) continue;
        const stats = getEffectiveStats(u);
        rows.push({
            score: stats.attack * (u.hp / Math.max(1, u.maxHp)) + (u.unitClass === 'commander' ? 100 : 0),
            y: u.pos.y, x: u.pos.x,
            rel: enemySide ? 1 : 0,
            unit: u
        });
    }
    // 稳定排序：威胁值 → 阵营相对 → 坐标 → 兵种序 → 等级 → 经验 → 剩余血量 → ID 兜底（置换不变的关键）
    rows.sort((a, b) =>
        (b.score - a.score) ||
        (a.rel - b.rel) ||
        (a.y - b.y) ||
        (a.x - b.x) ||
        ((UNIT_CLASS_ORDER as readonly string[]).indexOf(a.unit.unitClass) - (UNIT_CLASS_ORDER as readonly string[]).indexOf(b.unit.unitClass)) ||
        ((b.unit.level ?? 0) - (a.unit.level ?? 0)) ||
        ((b.unit.exp ?? 0) - (a.unit.exp ?? 0)) ||
        (b.unit.hp - a.unit.hp) ||
        (a.unit.id < b.unit.id ? -1 : 1)
    );
    return rows;
}

function writeEntities(out: Float64Array, o: number, state: GameState, playerId: number, start: number): number {
    const alliance = getAllianceId(state, playerId);
    let cursor = start;
    for (const enemySide of [false, true]) {
        const rows = entityRows(state, playerId, alliance, enemySide);
        for (let slot = 0; slot < ENTITY_SLOTS; slot += 1) {
            const row = rows[slot];
            if (!row) { cursor += ENTITY_DIM; continue; }
            const u = row.unit;
            const stats = getEffectiveStats(u);
            out[cursor + 0] = u.pos.x / Math.max(1, state.map.width - 1);
            out[cursor + 1] = u.pos.y / Math.max(1, state.map.height - 1);
            out[cursor + 2] = u.hp / Math.max(1, u.maxHp);
            out[cursor + 3] = stats.attack / 20;
            out[cursor + 4] = stats.physicalDefense / 20;
            out[cursor + 5] = stats.move / 10;
            out[cursor + 6] = stats.maxRange / 5;
            out[cursor + 7] = (UNIT_CLASS_ORDER as readonly string[]).indexOf(u.unitClass) / UNIT_CLASS_ORDER.length;
            out[cursor + 8] = (u.level ?? 0) / 9;
            out[cursor + 9] = u.unitClass === 'commander' ? 1 : 0;
            out[cursor + 10] = u.hasActed ? 0 : 1;
            out[cursor + 11] = (u.status ? 1 : 0) / 4;
            cursor += ENTITY_DIM;
        }
    }
    return cursor;
}

export function encodeGameState(state: GameState, playerId: number): Float64Array {
    const out = new Float64Array(STATE_FEATURE_DIM);
    let o = 0;
    writeGlobal(out, o, state, playerId); o += GLOBAL_DIM;
    writeGrid(out, o, state, playerId); o += GRID_DIM;
    writeEntities(out, o, state, playerId, o);
    return out;
}

/** V1 遗留动作编码（32 维）：保留作历史基线与对照，含 F01 中的目标/招募落点折叠问题。 */
export function encodeGameActionV1(state: GameState, playerId: number, action: Action): Float64Array {
    const out = new Float64Array(ACTION_FEATURE_DIM_V1);
    let o = 0;
    const ti = (ACTION_TYPES as readonly string[]).indexOf(action.type);
    if (ti >= 0) out[o + ti] = 1;
    o += ACTION_TYPES.length + 1; // 15
    if (action.type === 'surrender') return out;

    const alliance = getAllianceId(state, playerId);
    const aliveEnemies = state.units.filter(u => u.hp > 0 && areEnemyPlayers(state, playerId, u.ownerId));
    const objectives: Position[] = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y][x];
            const key = getTileTerrainKey(tile);
            if (key !== 'castle' && key !== 'town') continue;
            if (tile.ownerId === null || areEnemyPlayers(state, playerId, tile.ownerId)) objectives.push({ x, y });
        }
    }
    const nearestEnemy = (p: Position) => aliveEnemies.length ? Math.min(...aliveEnemies.map(u => getDistance(p, u.pos))) : 99;
    const nearestObjective = (p: Position) => objectives.length ? Math.min(...objectives.map(u => getDistance(p, u))) : 99;
    const unitById = new Map(state.units.filter(u => u.hp > 0).map(u => [u.id, u]));

    const actorId = 'unitId' in action ? action.unitId
        : 'attackerId' in action ? action.attackerId
        : 'healerId' in action ? action.healerId
        : 'summonerId' in action ? action.summonerId
        : 'supporterId' in action ? action.supporterId : null;
    const actor = actorId ? unitById.get(actorId) ?? null : null;
    if (actor) {
        const stats = getEffectiveStats(actor);
        out[o + 0] = 1;
        out[o + 1] = actor.hp / Math.max(1, actor.maxHp);
        out[o + 2] = stats.attack / 20;
        out[o + 3] = stats.move / 10;
    }
    o += 4; // [15..18] actor 段

    const dest: Position | null =
        action.type === 'move' || action.type === 'post_attack_move' ? action.to
        : action.type === 'summon' ? action.spawnPos
        : action.type === 'recruit_and_deploy' ? action.to
        : action.type === 'recruit_to_castle' ? action.castlePos
        : actor ? actor.pos : null;
    if (actor && dest) {
        const before = Math.min(nearestEnemy(actor.pos), nearestObjective(actor.pos));
        const after = Math.min(nearestEnemy(dest), nearestObjective(dest));
        out[o + 0] = (before - after) / 10;
        out[o + 1] = nearestEnemy(dest) / 10;
        out[o + 2] = getDistance(actor.pos, dest) / 10;
        const reach = actor ? getEffectiveStats(actor).maxRange : 1;
        out[o + 3] = nearestEnemy(dest) <= Math.max(1, reach) ? 1 : 0;
        out[o + 4] = dest.x / Math.max(1, state.map.width - 1);
        out[o + 5] = dest.y / Math.max(1, state.map.height - 1);
    }
    o += 6; // [19..24]

    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        out[o + 0] = (UNIT_CLASS_ORDER as readonly string[]).indexOf(action.unitClass) / UNIT_CLASS_ORDER.length;
        const price = state.rules?.prices?.[action.unitClass] ?? null;
        out[o + 1] = (typeof price === 'number' ? price : 0) / 1000;
        out[o + 2] = (state.players.find(p => p.id === playerId)?.gold ?? 0) / 1000;
    }
    o += 3; // [25..27]

    const targetId = 'targetId' in action ? action.targetId : null;
    const target = targetId ? unitById.get(targetId) ?? null : null;
    if (target) {
        const stats = getEffectiveStats(target);
        out[o + 0] = areEnemyPlayers(state, playerId, target.ownerId) ? 1 : 0;
        out[o + 1] = target.hp / Math.max(1, target.maxHp);
        out[o + 2] = stats.attack / 20;
    }
    o += 3; // [28..30]

    out[o] = alliance === getAllianceId(state, state.currentPlayer) ? 1 : 0; // [31]
    return out;
}

/**
 * V2 语义感知动作编码（45 维）：
 * 调用共享 getActionSemantics，为行动者坐标、落地格、目标格、来源城堡分别编码归一化坐标并配备存在掩码；
 * 消除招募动作缺少坐标、destroy_town 未读目标、不同敌方单位数值碰撞等关键歧义。
 */
export function encodeGameActionV2(state: GameState, playerId: number, action: Action): Float64Array {
    const out = new Float64Array(ACTION_FEATURE_DIM_V2);
    let o = 0;

    // [0..14] 类型 one-hot (15 dims)
    const ti = (ACTION_TYPES as readonly string[]).indexOf(action.type);
    if (ti >= 0) out[o + ti] = 1;
    o += ACTION_TYPES.length + 1; // 15
    if (action.type === 'surrender') return out;

    const alliance = getAllianceId(state, playerId);
    const aliveEnemies = state.units.filter(u => u.hp > 0 && areEnemyPlayers(state, playerId, u.ownerId));
    const objectives: Position[] = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y][x];
            const key = getTileTerrainKey(tile);
            if (key !== 'castle' && key !== 'town') continue;
            if (tile.ownerId === null || areEnemyPlayers(state, playerId, tile.ownerId)) objectives.push({ x, y });
        }
    }
    const nearestEnemy = (p: Position) => aliveEnemies.length ? Math.min(...aliveEnemies.map(u => getDistance(p, u.pos))) : 99;
    const nearestObjective = (p: Position) => objectives.length ? Math.min(...objectives.map(u => getDistance(p, u))) : 99;

    const unitMap = new Map<string, SemanticUnitLike>(
        state.units.filter(u => u.hp > 0).map(u => [u.id, { id: u.id, x: u.pos.x, y: u.pos.y }])
    );
    const sem = getActionSemantics(action, unitMap);

    const unitById = new Map(state.units.filter(u => u.hp > 0).map(u => [u.id, u]));
    const actor = sem.actorId ? unitById.get(sem.actorId) ?? null : null;
    const target = sem.targetUnitId ? unitById.get(sem.targetUnitId) ?? null : null;

    // [15..18] actor 段 (4 dims): [presence, hp, attack, move]
    if (actor) {
        const stats = getEffectiveStats(actor);
        out[o + 0] = 1;
        out[o + 1] = actor.hp / Math.max(1, actor.maxHp);
        out[o + 2] = stats.attack / 20;
        out[o + 3] = stats.move / 10;
    }
    o += 4;

    // [19..22] 推进/战术段 (4 dims): 与老版几何段前 4 维对齐保持 progressIdx=19
    const startPos: Position | null = sem.actorPos ?? sem.sourceCastlePos ?? sem.landingPos;
    const endPos: Position | null = sem.landingPos ?? sem.targetPos ?? sem.actorPos;
    if (startPos && endPos) {
        const before = Math.min(nearestEnemy(startPos), nearestObjective(startPos));
        const after = Math.min(nearestEnemy(endPos), nearestObjective(endPos));
        out[o + 0] = (before - after) / 10; // progress
        out[o + 1] = nearestEnemy(endPos) / 10;
        out[o + 2] = getDistance(startPos, endPos) / 10;
        const reach = actor ? (getEffectiveStats(actor).maxRange || 1) : 1;
        out[o + 3] = nearestEnemy(endPos) <= reach ? 1 : 0;
    }
    o += 4;

    // [23..34] 结构化空间坐标段（4 个关键格 × [presence, normX, normY]，12 dims）
    const normW = Math.max(1, state.map.width - 1);
    const normH = Math.max(1, state.map.height - 1);
    const writePos = (p: Position | null) => {
        if (p) {
            out[o + 0] = 1;
            out[o + 1] = p.x / normW;
            out[o + 2] = p.y / normH;
        }
        o += 3;
    };
    writePos(sem.actorPos);        // [23..25]
    writePos(sem.landingPos);      // [26..28]
    writePos(sem.targetPos);       // [29..31]
    writePos(sem.sourceCastlePos); // [32..34]

    // [35..38] 招募段 (4 dims): [isRecruit, classOrder, price/1000, remGoldAfter/1000]
    if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
        out[o + 0] = 1;
        out[o + 1] = (UNIT_CLASS_ORDER as readonly string[]).indexOf(action.unitClass) / UNIT_CLASS_ORDER.length;
        const cost = getUnitCost(state, playerId, action.unitClass);
        const price = typeof cost === 'number' ? cost : (state.rules?.prices?.[action.unitClass] ?? 0);
        out[o + 2] = (price || 0) / 1000;
        const currentGold = state.players.find(p => p.id === playerId)?.gold ?? 0;
        out[o + 3] = Math.max(0, currentGold - (price || 0)) / 1000;
    }
    o += 4;

    // [39..42] 目标单位段 (4 dims): [hasTarget, isEnemy, hp, attack]
    if (target) {
        const stats = getEffectiveStats(target);
        out[o + 0] = 1;
        out[o + 1] = areEnemyPlayers(state, playerId, target.ownerId) ? 1 : 0;
        out[o + 2] = target.hp / Math.max(1, target.maxHp);
        out[o + 3] = stats.attack / 20;
    }
    o += 4;

    // [43] 行动者指挥官身份 (1 dim)
    out[o + 0] = actor && isCommanderUnit(state, actor) ? 1 : 0;
    o += 1;

    // [44] 阵营轮次位 (1 dim)
    out[o + 0] = alliance === getAllianceId(state, state.currentPlayer) ? 1 : 0;
    o += 1;

    return out;
}

export function encodeGameAction(state: GameState, playerId: number, action: Action): Float64Array {
    return encodeGameActionV2(state, playerId, action);
}
