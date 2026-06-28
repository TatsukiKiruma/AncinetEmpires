import { GameState, RuleConfig, TeamRuleConfig, Unit, UnitClass } from './types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './constants';
import { TerrainId } from './terrain';

export const DEFAULT_RULE_CONFIG = {
    initialGold: undefined,
    incomeVillage: 50,
    incomeCastle: 100,
    incomeCommanderBase: 0,
    incomeCommanderGrowth: 25,
    levelCap: 3,
    unitLimit: undefined,
    populationLimit: undefined,
    recruitableUnits: undefined,
    prices: {},
    commanderRecruitBaseCost: null,
    commanderRecruitCostGrowth: 100,
    defeatOnNoUnitsAndNoCastles: true,
    defeatOnNoUnits: false,
    defeatOnCommanderDeath: false,
    defeatOnNoCastles: false,
    alliances: {},
    disabledTeams: [],
    commanderUnitIds: {},
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
        alliances: {
            ...DEFAULT_RULE_CONFIG.alliances,
            ...(rules.alliances ?? {})
        },
        disabledTeams: [...(rules.disabledTeams ?? DEFAULT_RULE_CONFIG.disabledTeams)],
        commanderUnitIds: {
            ...DEFAULT_RULE_CONFIG.commanderUnitIds,
            ...(rules.commanderUnitIds ?? {})
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

export function getAllianceId(state: GameState, playerId: number): number {
    const rules = getRuleConfig(state);
    return rules.alliances[playerId] ?? playerId;
}

export function areAlliedPlayers(state: GameState, playerA: number, playerB: number): boolean {
    return getAllianceId(state, playerA) === getAllianceId(state, playerB);
}

export function areEnemyPlayers(state: GameState, playerA: number, playerB: number): boolean {
    return !areAlliedPlayers(state, playerA, playerB);
}

export function isFriendlyOrNeutralOwner(state: GameState, playerId: number, ownerId: number | null): boolean {
    return ownerId === null || areAlliedPlayers(state, playerId, ownerId);
}

export function isTeamEnabled(state: GameState, playerId: number): boolean {
    return !getRuleConfig(state).disabledTeams.includes(playerId);
}

export function isActivePlayer(state: GameState, playerId: number): boolean {
    const player = state.players.find(p => p.id === playerId);
    return !!player?.isAlive && isTeamEnabled(state, playerId);
}

export function getTurnPlayerIds(state: GameState): number[] {
    return state.players
        .filter(player => isActivePlayer(state, player.id))
        .map(player => player.id)
        .sort((a, b) => a - b);
}

export function isCommanderUnit(state: GameState, unit: Unit, teamId?: number): boolean {
    if (teamId !== undefined && unit.ownerId !== teamId) return false;

    const commanderUnitId = getRuleConfig(state).commanderUnitIds[unit.ownerId];
    if (commanderUnitId !== undefined) {
        return unit.id === commanderUnitId;
    }

    return unit.unitClass === 'commander';
}

export function getCommanderUnit(state: GameState, playerId: number): Unit | null {
    const commanderUnitId = getRuleConfig(state).commanderUnitIds[playerId];
    if (commanderUnitId !== undefined) {
        return state.units.find(unit => unit.id === commanderUnitId && unit.ownerId === playerId && unit.hp > 0) ?? null;
    }

    return state.units.find(unit => unit.ownerId === playerId && unit.unitClass === 'commander' && unit.hp > 0) ?? null;
}

export function applyInitialRuleConfig(state: GameState): GameState {
    const rules = getRuleConfig(state);
    for (const player of state.players) {
        const initialGold = rules.teams[player.id]?.initialGold ?? rules.initialGold;
        if (initialGold !== undefined) {
            player.gold = initialGold;
        }
    }
    return state;
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
    const rules = getRuleConfig(state);
    const teamRules = getTeamRuleConfig(state, playerId);
    const configuredUnits = teamRules.recruitableUnits
        ?? rules.recruitableUnits
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
    if (!isActivePlayer(state, playerId)) return false;
    if (player.gold < unitCost) return false;

    if (unitClass === 'commander') {
        const hasAliveCommander = getCommanderUnit(state, playerId) !== null;
        if (hasAliveCommander) return false;
    }

    const recruitableUnits = getRecruitableUnits(state, playerId);
    if (!recruitableUnits.includes(unitClass)) return false;

    const rules = getRuleConfig(state);
    const teamRules = getTeamRuleConfig(state, playerId);
    const unitLimit = teamRules.unitLimit ?? rules.unitLimit;
    if (unitLimit !== undefined && getCurrentUnitCount(state, playerId) >= unitLimit) {
        return false;
    }

    const populationLimit = teamRules.populationLimit ?? rules.populationLimit;
    if (populationLimit !== undefined && getCurrentPopulation(state, playerId) + unitConfig.population > populationLimit) {
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
