/**
 * 指挥官重招募与决策诊断工具 (v6 Commander Diagnostic Funnel)
 *
 * 按照 v6 任务书 C62 规范：
 * 提供纯函数 explainCommanderRecruitment(state, playerId)，
 * 逐层定位为何“金币足够却不重招募”：
 * 规则层 (Rule) -> 候选层 (Candidate) -> 模型层 (Model/Policy) -> 执行层 (Execution)
 */

import type { GameState, Position, Action, UnitClass } from '../types';
import {
    getRuleConfig,
    getUnitCost,
    getCommanderUnit,
    isActivePlayer,
    getRecruitableUnits,
    canRecruitUnitClass,
    getCurrentUnitCount,
    getCurrentPopulation
} from '../rule_config';
import { UNIT_CONFIGS } from '../constants';
import { getLegalActions } from '../rules';
import { createHash } from 'node:crypto';

export type CommanderRecruitReasonCode =
    | 'MODE_DISABLED'
    | 'NATURAL_TERMINAL'
    | 'INACTIVE_PLAYER'
    | 'NOT_CURRENT_TURN'
    | 'COMMANDER_ALREADY_PRESENT'
    | 'INSUFFICIENT_GOLD'
    | 'UNIT_LIMIT'
    | 'POPULATION_RULE_BLOCK'
    | 'NO_OWN_CASTLE'
    | 'CASTLE_OCCUPIED'
    | 'PENDING_LOCK'
    | 'RECRUIT_LIST_DISABLED'
    | 'LEGAL_GENERATION_MISMATCH'
    | 'FILTER_DROPPED'
    | 'POLICY_REJECTED'
    | 'EXECUTION_REJECTED'
    | 'STALE_RESULT'
    | 'LOAD_FALLBACK'
    | 'REASON_UNKNOWN';

export interface CommanderRecruitExplanation {
    mode: string;
    rulesHash: string;
    stateHash: string;
    playerId: number;
    isCurrentPlayer: boolean;
    engineTerminal: boolean;
    isActivePlayer: boolean;
    commanderPresent: boolean;
    commanderDeathCount: number;
    reserveLevel: number | null;
    reserveExp: number | null;
    commanderRecruitPrice: number | null;
    gold: number;
    goldGap: number;
    unitCount: number;
    unitLimit: number | null;
    population: number;
    populationLimit: number | null;
    commanderPopulation: number;
    ownedCastles: Position[];
    castleOccupants: Array<{ castlePos: Position; occupantUnitId: string | null; occupantOwnerId: number | null }>;
    pendingUnitId: string | null;
    recruitableClassAllowed: boolean;
    legalCommanderActionCodes: string[];
    canRecruitByRule: boolean;
    reasons: CommanderRecruitReasonCode[];
}

export function computeStateHash(state: GameState): string {
    const raw = JSON.stringify({
        turn: state.turn,
        currentPlayer: state.currentPlayer,
        units: state.units.map(u => ({ id: u.id, x: u.pos.x, y: u.pos.y, hp: u.hp, owner: u.ownerId })),
        players: state.players.map(p => ({ id: p.id, gold: p.gold, deaths: p.commanderDeathCount })),
        pending: state.pendingUnitId ?? null,
        winner: state.winner
    });
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

export function computeRulesHash(rules: any): string {
    return createHash('sha256').update(JSON.stringify(rules ?? {})).digest('hex').substring(0, 16);
}

export function explainCommanderRecruitment(
    state: GameState,
    playerId: number
): CommanderRecruitExplanation {
    const rules = getRuleConfig(state);
    const rulesHash = computeRulesHash(state.rules);
    const stateHash = computeStateHash(state);
    const player = state.players.find(p => p.id === playerId);
    const gold = player?.gold ?? 0;
    const isCurrentPlayer = state.currentPlayer === playerId;
    const engineTerminal = state.winner !== null;
    const active = isActivePlayer(state, playerId);
    const commander = getCommanderUnit(state, playerId);
    const commanderPresent = commander !== null;
    const deathCount = player?.commanderDeathCount ?? 0;
    const price = getUnitCost(state, playerId, 'commander');
    const goldGap = price !== null ? Math.max(0, price - gold) : 0;
    const unitCount = getCurrentUnitCount(state, playerId);
    const unitLimit = rules.unitLimit ?? null;
    const population = getCurrentPopulation(state, playerId);
    const populationLimit = rules.populationLimit ?? null;
    const commanderPopulation = UNIT_CONFIGS.commander.population; // 0

    // 寻找己方占领的所有城堡
    const ownedCastles: Position[] = [];
    const castleOccupants: Array<{ castlePos: Position; occupantUnitId: string | null; occupantOwnerId: number | null }> = [];
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            if (tile && tile.ownerId === playerId) {
                // 检查是否为城堡
                const isCastle = tile.terrainId === 10 || (tile as any).ruleTerrainId === 10 || (tile as any).terrainKey === 'castle';
                if (isCastle) {
                    const pos: Position = { x, y };
                    ownedCastles.push(pos);
                    const occupant = state.units.find(u => u.hp > 0 && u.pos.x === x && u.pos.y === y);
                    castleOccupants.push({
                        castlePos: pos,
                        occupantUnitId: occupant?.id ?? null,
                        occupantOwnerId: occupant?.ownerId ?? null
                    });
                }
            }
        }
    }

    const recruitableUnits = getRecruitableUnits(state, playerId);
    const recruitableClassAllowed = recruitableUnits.includes('commander');
    const canRecruit = canRecruitUnitClass(state, playerId, 'commander');

    // 获取合法动作
    const allLegal = getLegalActions(state, playerId);
    const commanderActions = allLegal.filter(
        a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && (a as any).unitClass === 'commander'
    );
    const legalCommanderActionCodes = commanderActions.map(a => JSON.stringify(a));

    const reasons: CommanderRecruitReasonCode[] = [];

    if (rules.commanderRecruitBaseCost === null && rules.prices['commander'] === undefined) {
        reasons.push('MODE_DISABLED');
    }
    if (engineTerminal) {
        reasons.push('NATURAL_TERMINAL');
    }
    if (!active) {
        reasons.push('INACTIVE_PLAYER');
    }
    if (!isCurrentPlayer) {
        reasons.push('NOT_CURRENT_TURN');
    }
    if (commanderPresent) {
        reasons.push('COMMANDER_ALREADY_PRESENT');
    }
    if (price !== null && gold < price) {
        reasons.push('INSUFFICIENT_GOLD');
    }
    if (unitLimit !== null && unitCount >= unitLimit) {
        reasons.push('UNIT_LIMIT');
    }
    if (populationLimit !== null && population + commanderPopulation > populationLimit) {
        reasons.push('POPULATION_RULE_BLOCK');
    }
    if (ownedCastles.length === 0) {
        reasons.push('NO_OWN_CASTLE');
    } else if (castleOccupants.every(c => c.occupantUnitId !== null)) {
        reasons.push('CASTLE_OCCUPIED');
    }
    if (state.pendingUnitId) {
        reasons.push('PENDING_LOCK');
    }
    if (!recruitableClassAllowed) {
        if (!reasons.includes('MODE_DISABLED')) {
            reasons.push('RECRUIT_LIST_DISABLED');
        }
    }
    if (canRecruit && legalCommanderActionCodes.length === 0) {
        reasons.push('LEGAL_GENERATION_MISMATCH');
    }

    const mode = (state.rules as any)?.mode ?? ((state.metadata as any)?.mode || (price !== null ? 'SD' : 'DEMO_OR_SO'));

    return {
        mode,
        rulesHash,
        stateHash,
        playerId,
        isCurrentPlayer,
        engineTerminal,
        isActivePlayer: active,
        commanderPresent,
        commanderDeathCount: deathCount,
        reserveLevel: (player as any)?.commanderReserveLevel ?? null,
        reserveExp: (player as any)?.commanderReserveExp ?? null,
        commanderRecruitPrice: price,
        gold,
        goldGap,
        unitCount,
        unitLimit,
        population,
        populationLimit,
        commanderPopulation,
        ownedCastles,
        castleOccupants,
        pendingUnitId: state.pendingUnitId ?? null,
        recruitableClassAllowed,
        legalCommanderActionCodes,
        canRecruitByRule: canRecruit && legalCommanderActionCodes.length > 0,
        reasons
    };
}
