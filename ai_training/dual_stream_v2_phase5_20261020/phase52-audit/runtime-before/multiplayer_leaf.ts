import { calculateArmyValue } from '../../game/env';
import { areAlliedPlayers, getTileIncome, getUnitCost, isCommanderUnit } from '../../game/rule_config';
import { getTileTerrainKey } from '../../game/terrain_rules';
import type { GameState, Unit } from '../../game/types';

export function unitArmy(state: GameState, unit: Unit): number { return calculateArmyValue({ ...state, units: [unit], players: state.players.map(p => ({ ...p, gold: 0 })) }, unit.ownerId); }
export interface RecruitmentTrace { cost: number; unitIds: readonly string[] }
export function multiplayerLedger(before: GameState, after: GameState, selfPlayer: number, recruitment?: RecruitmentTrace) {
    const ledger = { net: 0, healingNet: 0, recruitCost: 0, recruitedArmy: 0, recruitSurplus: 0, validRecruits: 0, castles: 0, towns: 0, incomeNet: 0, enemyCastlesCaptured: 0, enemyCommanderKills: 0, enemyKills: 0, allyCommanderLost: 0 };
    const remaining = new Map(after.units.map(u => [u.id, u]));
    for (const u of before.units) {
        const next = remaining.get(u.id), ally = areAlliedPlayers(before, selfPlayer, u.ownerId), sign = ally ? -1 : 1;
        const delta = unitArmy(before, u) - (next ? unitArmy(after, next) : 0);
        if (delta >= 0) ledger.net += sign * delta / 1024;
        else ledger.healingNet -= sign * -delta / 1024;
        if (!next || next.hp <= 0) {
            if (!ally) { ledger.enemyKills++; ledger.enemyCommanderKills += Number(isCommanderUnit(before, u)); }
            else ledger.allyCommanderLost += Number(isCommanderUnit(before, u));
        }
    }
    // 新兵将金币转换为军力；只扣留存军力不足支出的差额，不能将全价重复计为战损。
    ledger.recruitCost = before.players.reduce((s, p) => s + (areAlliedPlayers(before, selfPlayer, p.id) ? Math.max(0, p.gold - (after.players.find(q => q.id === p.id)?.gold ?? p.gold)) : 0), 0);
    if (recruitment) ledger.recruitCost = recruitment.cost;
    const previousIds = new Set(before.units.map(u => u.id));
    for (const u of after.units) if (!previousIds.has(u.id) && u.hp > 0 && areAlliedPlayers(before, selfPlayer, u.ownerId)) {
        const recruited = recruitment ? recruitment.unitIds.includes(u.id) : (getUnitCost(after, u.ownerId, u.unitClass) ?? 0) > 0;
        if (!recruitment || recruited) ledger.recruitedArmy += unitArmy(after, u);
        const tile = after.map.tiles[u.pos.y][u.pos.x];
        // 免费召唤物不冒充同一分支中的付费招募产能。
        if (recruited && getTileTerrainKey(tile) !== 'castle') ledger.validRecruits++;
    }
    ledger.recruitSurplus = Math.min(0, (ledger.recruitedArmy - ledger.recruitCost) / 1024);
    const ownerSign = (id: number | null) => id === null ? 0 : areAlliedPlayers(before, selfPlayer, id) ? 1 : -1;
    for (let y = 0; y < before.map.height; y++) for (let x = 0; x < before.map.width; x++) {
        const b = before.map.tiles[y][x], a = after.map.tiles[y][x], bk = getTileTerrainKey(b), ak = getTileTerrainKey(a);
        ledger.castles += Number(ak === 'castle') * ownerSign(a.ownerId) - Number(bk === 'castle') * ownerSign(b.ownerId);
        ledger.towns += Number(ak === 'town') * ownerSign(a.ownerId) - Number(bk === 'town') * ownerSign(b.ownerId);
        ledger.incomeNet += getTileIncome(after, a) * ownerSign(a.ownerId) - getTileIncome(before, b) * ownerSign(b.ownerId);
        ledger.enemyCastlesCaptured += Number(bk === 'castle' && ownerSign(b.ownerId) < 0 && ak === 'castle' && ownerSign(a.ownerId) > 0);
    }
    return ledger;
}

export function ledgerScore(l: ReturnType<typeof multiplayerLedger>): number {
    return 3 * l.net + l.healingNet + l.recruitSurplus + .25 * l.validRecruits + 5 * l.castles + 2 * l.towns + l.incomeNet / 150 + 20 * l.enemyCommanderKills + l.enemyKills - 30 * l.allyCommanderLost;
}
