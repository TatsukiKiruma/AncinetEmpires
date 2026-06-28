import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { GameState, RuleConfig, UnitClass, UnitLevel } from './types';

function ensureRules(state: GameState): RuleConfig {
    state.rules ??= {};
    return state.rules;
}

function isNonNegativeInteger(value: number): boolean {
    return Number.isInteger(value) && value >= 0;
}

function toLevelCap(value: number): UnitLevel | null {
    if (!Number.isInteger(value) || value < 0 || value > 9) return null;
    return value as UnitLevel;
}

function mapApkUnitId(apkUnitId: number): UnitClass | null {
    return APK_UNIT_ID_TO_CLASS[apkUnitId] ?? null;
}

export function ruleSetIncomeVillage(state: GameState, income: number): boolean {
    if (!isNonNegativeInteger(income)) return false;
    ensureRules(state).incomeVillage = income;
    return true;
}

export function ruleSetIncomeCastle(state: GameState, income: number): boolean {
    if (!isNonNegativeInteger(income)) return false;
    ensureRules(state).incomeCastle = income;
    return true;
}

export function ruleSetIncomeCommanderBase(state: GameState, income: number): boolean {
    if (!isNonNegativeInteger(income)) return false;
    ensureRules(state).incomeCommanderBase = income;
    return true;
}

export function ruleSetIncomeCommanderGrowth(state: GameState, growth: number): boolean {
    if (!isNonNegativeInteger(growth)) return false;
    ensureRules(state).incomeCommanderGrowth = growth;
    return true;
}

export function ruleSetLevelCap(state: GameState, levelCap: number): boolean {
    const cap = toLevelCap(levelCap);
    if (cap === null) return false;
    ensureRules(state).levelCap = cap;
    return true;
}

export function ruleSetUnitPrice(state: GameState, apkUnitId: number, price: number): boolean {
    const unitClass = mapApkUnitId(apkUnitId);
    if (!unitClass || !isNonNegativeInteger(price)) return false;
    const rules = ensureRules(state);
    rules.prices ??= {};
    rules.prices[unitClass] = price;
    return true;
}

export function ruleSetPrices(state: GameState, apkPrices: Partial<Record<number, number>>): boolean {
    const entries = Object.entries(apkPrices).map(([apkUnitId, price]) => ({
        apkUnitId: Number(apkUnitId),
        price
    }));

    if (entries.some(entry => !Number.isInteger(entry.apkUnitId) || entry.price === undefined)) {
        return false;
    }
    if (entries.some(entry => !mapApkUnitId(entry.apkUnitId) || !isNonNegativeInteger(entry.price as number))) {
        return false;
    }

    const rules = ensureRules(state);
    rules.prices ??= {};
    for (const entry of entries) {
        const unitClass = mapApkUnitId(entry.apkUnitId)!;
        rules.prices[unitClass] = entry.price as number;
    }
    return true;
}
