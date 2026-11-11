import { calculateArmyValue } from '../../game/env';
import { getTileIncome, isTeamEnabled, isCommanderUnit } from '../../game/rule_config';
import type { GameState } from '../../game/types';
import type { PlayerOrder } from './contract';

export interface ValueCalibration { buckets: { temperature: number; army: number; income: number; commander?: number; actionable?: number; mixture?: number; armyShareMix?: number }[] }
export interface ValueFeatures { bucket: number; army: readonly number[]; income: readonly number[]; commander?: readonly number[]; actionable?: readonly number[] }
export function valueCalibrationFeatures(state: GameState, order: PlayerOrder) {
    const configured = state.players.filter(p => isTeamEnabled(state, p.id)).length;
    const bucket = (configured <= 2 ? 0 : configured === 3 ? 1 : 2) * 3 + (state.turn <= 5 ? 0 : state.turn <= 15 ? 1 : 2);
    const army = order.playerIds.map(id => id === null ? 0 : calculateArmyValue(state, id));
    const income = order.playerIds.map(id => id === null ? 0 : state.map.tiles.flat().reduce((s, tile) => s + (tile.ownerId === id ? getTileIncome(state, tile) : 0), 0));
    const commander = order.playerIds.map(id => state.units.filter(u => u.ownerId === id && u.hp > 0 && isCommanderUnit(state, u)).length);
    const actionable = order.playerIds.map(id => state.units.filter(u => u.ownerId === id && u.hp > 0 && !u.hasActed).length);
    return { bucket, army, income, commander, actionable };
}

/** 温度和两种占比跳连均由训练集拟合；非活跃槽严格清零。 */
export function calibrateValue(logits: ArrayLike<number>, active: ArrayLike<number>, features: ValueFeatures, calibration: ValueCalibration): Float32Array {
    const c = calibration.buckets[features.bucket];
    if (!c || !Number.isFinite(c.temperature) || c.temperature <= 0 || !Number.isFinite(c.army) || !Number.isFinite(c.income)) throw Error('价值校准参数无效');
    const aSum = features.army.reduce((s, x, i) => s + Math.max(0, x) * active[i], 0);
    const iSum = features.income.reduce((s, x, i) => s + Math.max(0, x) * active[i], 0);
    if (![c.commander ?? 0, c.actionable ?? 0, c.mixture ?? 0].every(Number.isFinite) || (c.mixture ?? 0) < 0 || (c.mixture ?? 0) > 1) throw Error('价值混合参数无效');
    const scores = new Float32Array(6), prior = new Float32Array(6); let max = -Infinity, priorMax = -Infinity;
    for (let i = 0; i < 6; i++) {
        scores[i] = active[i] ? logits[i] / c.temperature + c.army * Math.max(0, features.army[i]) / Math.max(1e-12, aSum) + c.income * Math.max(0, features.income[i]) / Math.max(1e-12, iSum) : -1e9;
        // 新字段缺省时严格保持历史模型算子；新模型可混入权威态势先验。
        const cmd = features.commander?.[i] ?? 0, actions = features.actionable?.[i] ?? 0;
        scores[i] += active[i] ? (c.commander ?? 0) * cmd + (c.actionable ?? 0) * actions / Math.max(1, ...features.actionable ?? [1]) : 0;
        prior[i] = active[i] ? c.army * Math.max(0, features.army[i]) / Math.max(1e-12, aSum) + c.income * Math.max(0, features.income[i]) / Math.max(1e-12, iSum) + (c.commander ?? 0) * cmd + (c.actionable ?? 0) * actions / Math.max(1, ...features.actionable ?? [1]) : -1e9;
        if (active[i]) priorMax = Math.max(priorMax, prior[i]);
        if (active[i]) max = Math.max(max, scores[i]);
    }
    let sum = 0;
    for (let i = 0; i < 6; i++) { scores[i] = active[i] ? Math.exp(scores[i] - max) : 0; sum += scores[i]; }
    for (let i = 0; i < 6; i++) scores[i] = sum ? scores[i] / sum : 0;
    if (c.mixture) {
        let priorSum = 0;
        for (let i = 0; i < 6; i++) { prior[i] = active[i] ? Math.exp(prior[i] - priorMax) : 0; priorSum += prior[i]; }
        for (let i = 0; i < 6; i++) scores[i] = (1 - c.mixture) * scores[i] + c.mixture * prior[i] / Math.max(1e-12, priorSum);
    }
    // 预登记的军力保底混合只读取当前状态，不读取开发标签。
    if (c.armyShareMix) {
        if (!Number.isFinite(c.armyShareMix) || c.armyShareMix < 0 || c.armyShareMix > 1) throw Error('军力混合参数无效');
        const count = Array.from(active).reduce((s, x) => s + Number(Boolean(x)), 0);
        for (let i = 0; i < 6; i++) {
            const share = aSum > 0 ? Math.max(0, features.army[i]) * active[i] / aSum : active[i] / Math.max(1, count);
            scores[i] = (1 - c.armyShareMix) * scores[i] + c.armyShareMix * share;
        }
    }
    return scores;
}
