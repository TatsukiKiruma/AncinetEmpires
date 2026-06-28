import { GameState, RuleConfig, TeamRuleConfig, UnitClass } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { TerrainId } from './terrain';

export const DEFAULT_RULE_CONFIG = {
    incomeVillage: 50,
    incomeCastle: 100,
    incomeCommanderBase: 0,
    incomeCommanderGrowth: 25,
    levelCap: 3,
    prices: {},
    commanderRecruitBaseCost: null,
    commanderRecruitCostGrowth: 100,
    defeatOnNoUnits: true,
    defeatOnCommanderDeath: false,
    defeatOnNoCastles: false,
    teams: {}
} satisfies Required<RuleConfig>;

export function getRuleConfig(state: GameState): Required<RuleConfig> {
    const rules = state.rules ?? {};
    return {
        ...DEFAULT_RULE_CONFIG,
        ...rules,
        prices: {
            ...DEFAULT_RULE_CONFIG.prices,
            ...(rules.prices ?? {})
        },
        teams: {
            ...DEFAULT_RULE_CONFIG.teams,
            ...(rules.teams ?? {})
        }
    };
}

export function getTeamRuleConfig(state: GameState, playerId: number): TeamRuleConfig {
    return getRuleConfig(state).teams[playerId] ?? {};
}

export function getUnitCost(state: GameState, playerId: number, unitClass: UnitClass): number | null {
    const rules = getRuleConfig(state);
    const priceOverride = rules.prices[unitClass];
    if (priceOverride !== undefined) return priceOverride;

    if (unitClass === 'commander') {
        if (rules.commanderRecruitBaseCost === null) return null;
        const deathCount = state.players.find(p => p.id === playerId)?.commanderDeathCount ?? 0;
        return rules.commanderRecruitBaseCost + deathCount * rules.commanderRecruitCostGrowth;
    }

    return UNIT_CONFIGS[unitClass].cost;
}

export function getRecruitableUnits(state: GameState, playerId: number): UnitClass[] {
    const teamRules = getTeamRuleConfig(state, playerId);
    const configuredUnits = teamRules.recruitableUnits
        ?? (Object.keys(UNIT_CONFIGS) as UnitClass[]);

    return [...new Set(configuredUnits)]
        .filter(unitClass => getUnitCost(state, playerId, unitClass) !== null);
}

export function getCurrentUnitCount(state: GameState, playerId: number): number {
    return state.units.filter(unit => unit.ownerId === playerId).length;
}

export function getCurrentPopulation(state: GameState, playerId: number): number {
    return state.units
        .filter(unit => unit.ownerId === playerId)
        .reduce((sum, unit) => sum + UNIT_CONFIGS[unit.unitClass].population, 0);
}

export function canRecruitUnitClass(state: GameState, playerId: number, unitClass: UnitClass): boolean {
    const player = state.players.find(p => p.id === playerId);
    const unitConfig = UNIT_CONFIGS[unitClass];
    const unitCost = getUnitCost(state, playerId, unitClass);
    if (!player || !unitConfig || unitCost === null) return false;
    if (player.gold < unitCost) return false;

    if (unitClass === 'commander') {
        const hasAliveCommander = state.units.some(unit => unit.ownerId === playerId && unit.unitClass === 'commander' && unit.hp > 0);
        if (hasAliveCommander) return false;
    }

    const recruitableUnits = getRecruitableUnits(state, playerId);
    if (!recruitableUnits.includes(unitClass)) return false;

    const teamRules = getTeamRuleConfig(state, playerId);
    if (teamRules.unitLimit !== undefined && getCurrentUnitCount(state, playerId) >= teamRules.unitLimit) {
        return false;
    }

    if (teamRules.populationLimit !== undefined && getCurrentPopulation(state, playerId) + unitConfig.population > teamRules.populationLimit) {
        return false;
    }

    return true;
}

export function getTerrainIncome(state: GameState, terrainId: TerrainId): number {
    const terrainConfig = TERRAIN_CONFIG[terrainId];
    if (!terrainConfig) return 0;

    const rules = getRuleConfig(state);
    if (terrainConfig.key === 'town') return rules.incomeVillage;
    if (terrainConfig.key === 'castle') return rules.incomeCastle;

    return terrainConfig.incomePerTurn || 0;
}
