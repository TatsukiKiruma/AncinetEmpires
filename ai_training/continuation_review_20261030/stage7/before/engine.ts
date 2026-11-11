import { Action, GameState, StepResult, Unit, Position, UnitClass, UnitStatus } from './types';
import { getLegalActions, getActionReadyUnitCount, calculateDamage, inRange, canCounterAttack, counterDamageOnResolvedState, type LegalActionQuery } from './rules';
import { UNIT_CONFIGS } from './constants';
import { hasAbility, isWaterTerrain, isForestTerrain, isMountainTerrain, isUndead, getEffectiveStats, addExp, clearNegativeStatus, ATTACK_EXP, ASSIST_EXP, KILL_EXP } from './abilities';
import { getMovementCosts, getDistance } from './map';
import { areAlliedPlayers, areEnemyPlayers, canRecruitUnitClass, getAllianceId, getCommanderUnit, getScalarRule, getTileIncome, getTurnPlayerIds, getUnitCost, isActivePlayer, isCommanderUnit } from './rule_config';
import { destroyTileForRules, getTileHealPerTurn, getTileTerrainKey, isTileDestroyableForRules, setTileOwnerAfterRepairForRules, setTileOwnerForRules, setTileTerrainForRules, tileClearsNegativeStatusAtTurnStart, tileHealingRequiresFriendlyOwner } from './terrain_rules';
import { applyCampaignEvents } from './campaign_events';
import { getExpThresholdForLevel } from './abilities';
import { destroyTeamForRules } from './team_cleanup';
import { cloneGameState } from './clone_state';
import { gameStateEquals } from './state_equals';

/** 权威动作仅含标量和位置；保留列表内位置别名，同时隔离调用者与引擎状态。 */
function cloneLegalActions(actions: Action[]): Action[] {
    let positions: Map<Position, Position> | undefined;
    const unusual = Symbol();
    const copyPosition = (pos: Position): Position => {
        // 非常规扩展位置交回通用复制，保留原有行为。
        if (Object.getPrototypeOf(pos) !== Object.prototype || Object.keys(pos).length !== 2
            || !Object.hasOwn(pos, 'x') || !Object.hasOwn(pos, 'y') || Object.getOwnPropertySymbols(pos).length) throw unusual;
        positions ??= new Map();
        let copy = positions.get(pos);
        if (!copy) { copy = { ...pos }; positions.set(pos, copy); }
        return copy;
    };
    try {
        return actions.map(action => {
            switch (action.type) {
                case 'move': case 'post_attack_move': return { ...action, to: copyPosition(action.to) };
                case 'recruit_to_castle': return { ...action, castlePos: copyPosition(action.castlePos) };
                case 'recruit_and_deploy': return { ...action, castlePos: copyPosition(action.castlePos), to: copyPosition(action.to) };
                case 'summon': return { ...action, spawnPos: copyPosition(action.spawnPos) };
                case 'destroy_town': return action.target ? { ...action, target: copyPosition(action.target) } : { ...action };
                default: return { ...action };
            }
        });
    } catch (error) {
        if (error === unusual) return structuredClone(actions);
        throw error;
    }
}

function isSamePos(p1?: Position, p2?: Position): boolean {
    if (!p1 || !p2) return p1 === p2;
    return p1.x === p2.x && p1.y === p2.y;
}

function isNegativeStatus(status?: UnitStatus): boolean {
    return status?.type === 'poisoned' || status?.type === 'blinded' || status?.type === 'weakened';
}

function getStatusDuration(status: UnitStatus): number {
    return status.type === 'poisoned'
        ? (status.remainingTicks ?? status.remainingTurns ?? 0)
        : (status.remainingTurns ?? status.remainingTicks ?? 0);
}

function setStatusDuration(status: UnitStatus, duration: number): void {
    if (status.type === 'poisoned') {
        status.remainingTicks = duration;
        delete status.remainingTurns;
        return;
    }

    status.remainingTurns = duration;
    delete status.remainingTicks;
}

// V15/T15-02：经验常量移到 abilities.ts，供反击预测（rules.estimateCounterDamage）共用，
// 避免预测路径与引擎各写一份 30/60 而在规则改动后漂移。数值未变。

function areActionsEqual(a1: Action, a2: Action): boolean {
    if (a1.type !== a2.type) return false;
    switch (a1.type) {
        case 'move': {
            const m1 = a1 as { type: 'move'; unitId: string; to: Position };
            const m2 = a2 as { type: 'move'; unitId: string; to: Position };
            return m1.unitId === m2.unitId && isSamePos(m1.to, m2.to);
        }
        case 'post_attack_move': {
            const m1 = a1 as { type: 'post_attack_move'; unitId: string; to: Position };
            const m2 = a2 as { type: 'post_attack_move'; unitId: string; to: Position };
            return m1.unitId === m2.unitId && isSamePos(m1.to, m2.to);
        }
        case 'attack': {
            const m1 = a1 as { type: 'attack'; attackerId: string; targetId: string };
            const m2 = a2 as { type: 'attack'; attackerId: string; targetId: string };
            return m1.attackerId === m2.attackerId && m1.targetId === m2.targetId;
        }
        case 'heal': {
            const m1 = a1 as { type: 'heal'; healerId: string; targetId: string };
            const m2 = a2 as { type: 'heal'; healerId: string; targetId: string };
            return m1.healerId === m2.healerId && m1.targetId === m2.targetId;
        }
        case 'support': {
            const m1 = a1 as { type: 'support'; supporterId: string; targetId: string };
            const m2 = a2 as { type: 'support'; supporterId: string; targetId: string };
            return m1.supporterId === m2.supporterId && m1.targetId === m2.targetId;
        }
        case 'summon': {
            const m1 = a1 as { type: 'summon'; summonerId: string; graveId: string; spawnPos: Position };
            const m2 = a2 as { type: 'summon'; summonerId: string; graveId: string; spawnPos: Position };
            return m1.summonerId === m2.summonerId && m1.graveId === m2.graveId && isSamePos(m1.spawnPos, m2.spawnPos);
        }
        case 'destroy_town': {
            const m1 = a1 as { type: 'destroy_town'; unitId: string; target?: Position };
            const m2 = a2 as { type: 'destroy_town'; unitId: string; target?: Position };
            return m1.unitId === m2.unitId && isSamePos(m1.target, m2.target);
        }
        case 'capture':
        case 'repair':
        case 'wait': {
            const m1 = a1 as { type: 'capture' | 'repair' | 'wait'; unitId: string };
            const m2 = a2 as { type: 'capture' | 'repair' | 'wait'; unitId: string };
            return m1.unitId === m2.unitId;
        }
        case 'recruit_to_castle': {
            const m1 = a1 as { type: 'recruit_to_castle'; unitClass: UnitClass; castlePos: Position; };
            const m2 = a2 as { type: 'recruit_to_castle'; unitClass: UnitClass; castlePos: Position; };
            return m1.unitClass === m2.unitClass && isSamePos(m1.castlePos, m2.castlePos);
        }
        case 'recruit_and_deploy': {
            const m1 = a1 as { type: 'recruit_and_deploy'; unitClass: UnitClass; castlePos: Position; to: Position };
            const m2 = a2 as { type: 'recruit_and_deploy'; unitClass: UnitClass; castlePos: Position; to: Position };
            return m1.unitClass === m2.unitClass && isSamePos(m1.castlePos, m2.castlePos) && isSamePos(m1.to, m2.to);
        }
        case 'end_turn':
        case 'surrender':
            return true;
        default:
            return false;
    }
}

export interface GameEngineOptions {
    unsafeBypassValidationForTests?: boolean;
    disableAutoAdvanceWhenNoMeaningfulAction?: boolean;
    applyInitialTurnStart?: boolean;
}

export class GameEngine {
    private state: GameState;
    private unsafeBypassValidationForTests: boolean = false;
    private disableAutoAdvanceWhenNoMeaningfulAction: boolean = false;
    private fullLegalCache?: { playerId: number; actions: Action[] };
    private executingStep = false;
    private queryLegalCache = new Map<string, Action[]>();
    private movementCosts = new Map<string, Map<string, number>>();

    constructor(initialState: GameState, options?: GameEngineOptions) {
        this.state = cloneGameState(initialState);
        if (options?.unsafeBypassValidationForTests) {
            this.unsafeBypassValidationForTests = true;
        }
        if (options?.disableAutoAdvanceWhenNoMeaningfulAction) {
            this.disableAutoAdvanceWhenNoMeaningfulAction = true;
        }
        this.ensureCurrentPlayerCanAct();
        if (options?.applyInitialTurnStart && isActivePlayer(this.state, this.state.currentPlayer)) {
            this.startTurnForPlayer(this.state.currentPlayer);
            const deadUnits = this.removeDeadUnits();
            for (const deadUnit of deadUnits) {
                applyCampaignEvents(this.state, { type: 'unit_destroyed', unit: deadUnit });
            }
            this.checkWinConditions();
            this.ensureCurrentPlayerCanAct(true);
        }
    }

    public getState(): GameState {
        // 返回隔离快照，外部修改不能污染引擎或其他分支。
        return cloneGameState(this.state);
    }

    /** 只读比较完整预期快照，供已经验证的计划快返使用，不向调用方暴露内部引用。 */
    public matchesState(expected: GameState): boolean {
        return gameStateEquals(this.state, expected);
    }

    /** 复用权威合法集合及动作比较器，只返回布尔值，避免为验证单步复制整个菜单。 */
    public hasLegalAction(playerId: number, action: Action): boolean {
        const actor = 'unitId' in action ? action.unitId : 'attackerId' in action ? action.attackerId : 'healerId' in action ? action.healerId : 'supporterId' in action ? action.supporterId : 'summonerId' in action ? action.summonerId : undefined;
        // 已有完整集合时直接复用；冷缓存只查询该动作涉及的单位和动作类别。
        const query = this.fullLegalCache?.playerId === playerId ? undefined : actor
            ? { unitId: actor, skipMovement: action.type !== 'move' && action.type !== 'post_attack_move', skipRecruitment: true }
            : { skipMovement: true };
        for (const candidate of this.getCachedLegalActions(playerId, query)) if (areActionsEqual(candidate, action)) return true;
        return false;
    }

    public clone(): GameEngine {
        const branch = new GameEngine(this.state, {
            unsafeBypassValidationForTests: this.unsafeBypassValidationForTests,
            disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction
        });
        // 克隆初态相同，复用私有合法集合；对外返回的动作始终独立复制。
        if (branch.state.currentPlayer === this.state.currentPlayer && branch.state.turn === this.state.turn) {
            branch.fullLegalCache = this.fullLegalCache;
            branch.queryLegalCache = this.queryLegalCache;
            branch.movementCosts = this.movementCosts;
        }
        return branch;
    }

    private getCachedLegalActions(playerId: number, query?: LegalActionQuery): Action[] {
        // 执行中的中间态不进入缓存；非常规参数保持原权威函数的完整语义。
        if (this.executingStep || !Number.isFinite(playerId)) return getLegalActions(this.state, playerId, query);
        if (query === undefined && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
        let unitId: string | undefined, skipMovement = false, skipRecruitment = false, onlyAttacks = false, onlyOrdinaryMoves = false;
        if (query !== undefined) {
            if (query === null || typeof query !== 'object') return getLegalActions(this.state, playerId, query);
            const prototype = Object.getPrototypeOf(query);
            const known = ['unitId', 'skipMovement', 'skipRecruitment', 'onlyAttacks', 'onlyOrdinaryMoves'];
            if (prototype !== null && prototype !== Object.prototype) return getLegalActions(this.state, playerId, query);
            const descriptors = Object.getOwnPropertyDescriptors(query), names = Object.getOwnPropertyNames(query);
            if (Object.getOwnPropertySymbols(query).length || names.some(k => !known.includes(k) || !('value' in descriptors[k])) || known.some(k => !Object.hasOwn(query, k) && k in query)) return getLegalActions(this.state, playerId, query);
            unitId = descriptors.unitId?.value;
            const movement = descriptors.skipMovement?.value, recruitment = descriptors.skipRecruitment?.value, attacks = descriptors.onlyAttacks?.value, ordinaryMoves = descriptors.onlyOrdinaryMoves?.value;
            if (unitId !== undefined && typeof unitId !== 'string' || [movement, recruitment, attacks, ordinaryMoves].some(v => v !== undefined && typeof v !== 'boolean')) return getLegalActions(this.state, playerId, query);
            skipMovement = movement === true; skipRecruitment = recruitment === true; onlyAttacks = attacks === true; onlyOrdinaryMoves = ordinaryMoves === true;
        }
        const full = unitId === undefined && !skipMovement && !skipRecruitment && !onlyAttacks && !onlyOrdinaryMoves;
        if (full && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
        const key = JSON.stringify([playerId, unitId === undefined ? null : unitId, skipMovement, skipRecruitment, onlyAttacks, onlyOrdinaryMoves]);
        let actions = this.queryLegalCache.get(key);
        if (!actions) {
            // 私有副本也不引用可变GameState坐标；同初态克隆可延迟填充并共享结果。
            actions = cloneLegalActions(getLegalActions(this.state, playerId, query));
            this.queryLegalCache.set(key, actions);
        }
        if (full) this.fullLegalCache = { playerId, actions };
        return actions;
    }

    public getLegalActions(playerId: number, query?: LegalActionQuery): Action[] {
        // 返回值独立，调用者改写数组或落点不能污染其他查询或分支。
        return cloneLegalActions(this.getCachedLegalActions(playerId, query));
    }

    public getActionReadyUnitCount(playerId: number): number {
        return getActionReadyUnitCount(this.state, playerId);
    }

    public isTerminal(): boolean {
        return this.state.winner !== null;
    }

    public getWinner(): number | null {
        return this.state.winner;
    }

    public reset(config?: GameState): GameState {
        if (config) {
            this.fullLegalCache = undefined;
            this.queryLegalCache = new Map();
            this.executingStep = false;
            this.movementCosts = new Map();
            this.state = cloneGameState(config);
            this.ensureCurrentPlayerCanAct();
        } else {
            throw new Error('Config missing on reset.');
        }
        return this.getState();
    }

    private getNextTurnPlayer(prevPlayerId: number): { playerId: number | null; wrapped: boolean } {
        const playerIds = getTurnPlayerIds(this.state);
        if (playerIds.length === 0) {
            return { playerId: null, wrapped: false };
        }

        const currentIndex = playerIds.indexOf(prevPlayerId);
        if (currentIndex === -1) {
            const nextHigher = playerIds.find(id => id > prevPlayerId);
            const nextPlayerId = nextHigher ?? playerIds[0];
            return { playerId: nextPlayerId, wrapped: nextPlayerId <= prevPlayerId };
        }

        const nextIndex = (currentIndex + 1) % playerIds.length;
        return { playerId: playerIds[nextIndex], wrapped: nextIndex === 0 };
    }

    private ensureCurrentPlayerCanAct(applyTurnStart = false) {
        // 快照构造与 reset 只校正当前队伍，不能重复发放收益；实际淘汰换人必须走完整回合开始。
        for (let guard = 0; guard < this.state.players.length && !this.isTerminal(); guard++) {
            if (isActivePlayer(this.state, this.state.currentPlayer)) return;
            const nextTurn = this.getNextTurnPlayer(this.state.currentPlayer);
            if (nextTurn.playerId === null) return;
            this.state.currentPlayer = nextTurn.playerId;
            if (!applyTurnStart) return;

            // APK C0598o.AsyncNextTurn 排队 TURN_END / TURN_START / POST_TURN_START；
            // C0600q.m4292i 负责跨轮计数，C0595l.m4447c / m4472a 负责收益和单位重置。
            if (nextTurn.wrapped) this.state.turn += 1;
            delete this.state.pendingUnitId;
            this.startTurnForPlayer(nextTurn.playerId);
            const deadUnits = this.removeDeadUnits();
            for (const deadUnit of deadUnits) {
                applyCampaignEvents(this.state, { type: 'unit_destroyed', unit: deadUnit });
            }
            this.checkWinConditions();
        }
    }

    private recordCommanderDeaths(deadUnits: Unit[]) {
        for (const unit of deadUnits) {
            if (!isCommanderUnit(this.state, unit)) continue;
            const player = this.state.players.find(p => p.id === unit.ownerId);
            if (player) {
                player.commanderDeathCount += 1;
                player.commanderReserveLevel = unit.level ?? 0;
                player.commanderReserveExp = unit.exp ?? 0;
            }
        }
    }

    private applyCappedRecovery(unit: Unit, maxHp: number, amount: number) {
        if (amount <= 0 || unit.hp >= maxHp) return;
        unit.hp = Math.min(maxHp, unit.hp + amount);
    }

    private refreshMovementForCurrentStatus(unit: Unit) {
        unit.movementRemaining = getEffectiveStats(unit).move;
    }

    private decayStatusAtTurnStart(unit: Unit) {
        if (!unit.status) return;

        const nextDuration = getStatusDuration(unit.status) - 1;
        if (nextDuration < 0) {
            delete unit.status;
            return;
        }

        setStatusDuration(unit.status, nextDuration);
    }

    private applyTurnStartHpDelta(unit: Unit, maxHp: number, delta: number) {
        unit.hp = Math.max(0, Math.min(maxHp, unit.hp + delta));
    }

    private shouldCreateGraveForDeadUnit(unit: Unit): boolean {
        return !isCommanderUnit(this.state, unit) && !isUndead(unit);
    }

    private createGraveAt(pos: Position, ownerId: number) {
        this.state.graves = this.state.graves || [];
        const existingGrave = this.state.graves.find(g => g.pos.x === pos.x && g.pos.y === pos.y);
        if (existingGrave) {
            // APK C0595l.m4454a → C0607b.m4234a：死亡会覆盖同格墓碑的计数与计时玩家。
            existingGrave.remainingTurns = 1;
            existingGrave.ownerId = ownerId;
            return;
        }

        const ngId = this.state.nextGraveId ?? 100;
        this.state.graves.push({
            id: `g_${ngId}`,
            pos: { ...pos },
            remainingTurns: 1,
            ownerId
        });
        this.state.nextGraveId = ngId + 1;
    }

    private createGravesForDeadUnits(deadUnits: Unit[]) {
        for (const unit of deadUnits) {
            if (this.shouldCreateGraveForDeadUnit(unit)) {
                this.createGraveAt(unit.pos, this.state.currentPlayer);
            }
        }
    }

    private tickGravesForPlayer(playerId: number) {
        if (!this.state.graves) return;

        this.state.graves = this.state.graves
            .map(grave => {
                const ownerId = grave.ownerId ?? playerId;
                if (ownerId !== playerId) return grave;
                return {
                    ...grave,
                    ownerId,
                    remainingTurns: grave.remainingTurns - 1
                };
            })
            .filter(grave => grave.remainingTurns >= 0);
    }

    private removeDeadUnits(): Unit[] {
        const deadUnits = this.state.units.filter(u => u.hp <= 0);
        this.recordCommanderDeaths(deadUnits);
        this.createGravesForDeadUnits(deadUnits);
        this.state.units = this.state.units.filter(u => u.hp > 0);
        return deadUnits;
    }

    private startTurnForPlayer(playerId: number) {
        const incomeCommanderBase = getScalarRule(this.state, 'incomeCommanderBase');
        const incomeCommanderGrowth = getScalarRule(this.state, 'incomeCommanderGrowth');
        const nextPlayer = this.state.players.find(p => p.id === playerId);

        // APK C0595l.m4447c -> C0607b.m4222c：只递减当前队伍拥有的墓碑覆盖层。
        this.tickGravesForPlayer(playerId);

        // APK skirmish 实测：敌军站在己方城堡上时，城堡拥有者回合开始会对该敌军造成 50 伤害。
        for (let y = 0; y < this.state.map.height; y++) {
            for (let x = 0; x < this.state.map.width; x++) {
                const tile = this.state.map.tiles[y][x];
                if (tile.ownerId !== playerId || getTileTerrainKey(tile) !== 'castle') continue;

                const occupyingEnemies = this.state.units.filter(unit => (
                    unit.pos.x === x
                    && unit.pos.y === y
                    && areEnemyPlayers(this.state, unit.ownerId, playerId)
                ));
                for (const enemy of occupyingEnemies) {
                    // APK C0595l.m4472a 经 C0600q.m4307f 结算：扣血后夹取到有效生命上限。
                    // 超额治疗后的敌军也必须夹取；不能只减 50 后保留超额生命。
                    enemy.hp = Math.max(0, Math.min(getEffectiveStats(enemy).maxHp, enemy.hp - 50));
                }
            }
        }

        // 金币收益结算
        if (nextPlayer) {
            let totalIncome = 0;
            for (let y = 0; y < this.state.map.height; y++) {
                for (let x = 0; x < this.state.map.width; x++) {
                   const tile = this.state.map.tiles[y][x];
                   if (tile.ownerId === playerId) {
                       const income = getTileIncome(this.state, tile);
                       totalIncome += income;
                   }
                }
            }

            // 指挥官存活收入由 APK 规则配置驱动；脚本可把任意己方单位指定为指挥官。
            const commander = getCommanderUnit(this.state, playerId);
            if (commander) {
                const lvl = commander.level ?? 0;
                totalIncome += incomeCommanderBase + lvl * incomeCommanderGrowth;
            }

            nextPlayer.gold += totalIncome;
        }

        // APK C0595l.m4472a：先处理神庙/状态衰减，再重置行动状态并统一结算 HP delta。
        this.state.units.forEach(u => {
            if (u.ownerId === playerId) {
                const tile = this.state.map.tiles[u.pos.y][u.pos.x];

                if (u.status) {
                    if (isNegativeStatus(u.status) && tileClearsNegativeStatusAtTurnStart(tile)) {
                        delete u.status;
                    } else {
                        this.decayStatusAtTurnStart(u);
                    }
                }

                u.hasMoved = false;
                u.hasActed = false;
                u.hasBeenHealedThisTurn = false;
                u.hasBeenSupportedThisTurn = false;
                u.hasPostAttackMoved = false;

                const eff = getEffectiveStats(u);
                u.movementRemaining = eff.move;

                let hpDelta = 0;

                const terrainHealPerTurn = getTileHealPerTurn(tile);
                const canReceiveTerrainHeal = terrainHealPerTurn > 0 && (
                    !tileHealingRequiresFriendlyOwner(tile)
                    || (tile.ownerId !== null && areAlliedPlayers(this.state, playerId, tile.ownerId))
                );
                if (canReceiveTerrainHeal) {
                    hpDelta += terrainHealPerTurn;
                }

                if (hasAbility(u, 'water_child') && isWaterTerrain(tile)) {
                    hpDelta += 10;
                }
                if (hasAbility(u, 'forest_child') && isForestTerrain(tile)) {
                    hpDelta += 10;
                }
                if (hasAbility(u, 'mountain_child') && isMountainTerrain(tile)) {
                    hpDelta += 10;
                }

                if (u.status?.type === 'poisoned') {
                    hpDelta = isUndead(u) ? hpDelta + 10 : -10;
                }

                if (hasAbility(u, 'self_repair')) {
                    hpDelta += Math.floor(eff.maxHp * 0.25);
                }

                if (u.hp > eff.maxHp) {
                    hpDelta -= u.hp - eff.maxHp;
                }

                if (hpDelta !== 0 || u.hp > eff.maxHp) {
                    this.applyTurnStartHpDelta(u, eff.maxHp, hpDelta);
                }
            }
        });

        applyCampaignEvents(this.state, { type: 'turn_start', playerId, turn: this.state.turn });
    }

    private consumeGraveAtUnitPosition(unit: Unit, options: { applyHpDelta?: boolean } = {}) {
        if (!this.state.graves) return;

        const graveIdx = this.state.graves.findIndex(g => g.pos.x === unit.pos.x && g.pos.y === unit.pos.y);
        if (graveIdx === -1) return;

        const applyHpDelta = options.applyHpDelta ?? true;
        let hpDelta = 0;
        if (isUndead(unit)) {
            hpDelta = 10;
            if (applyHpDelta) {
                this.applyCappedRecovery(unit, getEffectiveStats(unit).maxHp, hpDelta);
            }
        } else if (!hasAbility(unit, 'summoner')) {
            // APK 文案确认召唤师摧毁墓碑不会损失生命值。
            hpDelta = -10;
            if (applyHpDelta) {
                unit.hp += hpDelta;
            }
        }

        this.state.graves.splice(graveIdx, 1);
        return hpDelta;
    }

    private applyCombatStatusEffects(source: Unit, target: Unit) {
        if (target.hp <= 0) return;

        // APK 反编译确认攻击与反击共用同一套状态附加：先中毒，再致盲。
        // force=false 语义为：无状态或同状态可刷新，不覆盖已有不同状态。
        if (hasAbility(source, 'poisoner') && !hasAbility(target, 'poisoner')) {
            if (!target.status || target.status.type === 'poisoned') {
                target.status = { type: 'poisoned', remainingTicks: 2 };
            }
        }

        if (hasAbility(source, 'blinder') && !hasAbility(target, 'blinder')) {
            if (!target.status || target.status.type === 'blinded') {
                target.status = { type: 'blinded', remainingTurns: 1 };
            }
        }
    }

    private triggerAuras(unit: Unit, options: { deferActingUnitCleansingHpDelta?: boolean } = {}) {
        if (unit.hp <= 0) {
            return {
                deferredActingUnitHpDelta: 0,
                killedUnits: [] as Unit[]
            };
        }

        let deferredActingUnitHpDelta = 0;
        const killedUnits: Unit[] = [];
        
        // 1. 净化光环 (cleansing_aura)
        if (hasAbility(unit, 'cleansing_aura')) {
            const level = unit.level ?? 0;
            const healVal = 10 + level * 5; // 精灵升级后净化光环回血+5
            
            this.state.units.forEach(u => {
                if (u.hp <= 0 || getDistance(unit.pos, u.pos) > 2) return;

                const isEnemy = areEnemyPlayers(this.state, unit.ownerId, u.ownerId);
                const stats = getEffectiveStats(u);

                if (!isEnemy && isNegativeStatus(u.status)) {
                    clearNegativeStatus(u);
                    if (!u.hasActed) {
                        this.refreshMovementForCurrentStatus(u);
                    }
                }

                if (u.hp <= stats.maxHp) {
                    if (isUndead(u)) {
                        if (options.deferActingUnitCleansingHpDelta && u.id === unit.id) {
                            deferredActingUnitHpDelta -= healVal;
                        } else {
                            const hpBefore = u.hp;
                            u.hp = Math.max(0, u.hp - healVal);
                            if (hpBefore > 0 && u.hp <= 0) {
                                killedUnits.push({ ...u, pos: { ...u.pos } });
                            }
                        }
                    } else if (!isEnemy) {
                        if (options.deferActingUnitCleansingHpDelta && u.id === unit.id) {
                            deferredActingUnitHpDelta += healVal;
                        } else {
                            this.applyCappedRecovery(u, stats.maxHp, healVal);
                        }
                    }
                }
            });
        }
        
        // 2. 攻击光环 (attack_aura)
        if (hasAbility(unit, 'attack_aura')) {
            this.state.units.forEach(u => {
                if (u.hp > 0 && areAlliedPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
                    if (!u.status || u.status.type === 'inspired') {
                        // APK 规则参数 f1269H=0：鼓舞在当前行动序列有效，下次该单位回合开始即清除。
                        u.status = { type: 'inspired', remainingTurns: 0 };
                    }
                }
            });
        }
        
        // 3. 虚弱光环 (weakness_aura)
        if (hasAbility(unit, 'weakness_aura')) {
            this.state.units.forEach(u => {
                if (u.hp > 0 && areEnemyPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
                    if (!hasAbility(u, 'weakness_aura') && (!u.status || u.status.type === 'weakened')) {
                        u.status = { type: 'weakened', remainingTurns: 1 };
                        this.refreshMovementForCurrentStatus(u);
                    }
                }
            });
        }

        return { deferredActingUnitHpDelta, killedUnits };
    }

    public step(action: Action): StepResult {
        if (this.isTerminal()) {
            return { state: this.getState(), reward: 0, done: true, info: 'Game already ended' };
        }

        // 合法性校验
        if (!this.unsafeBypassValidationForTests) {
            const moving = action.type === 'move' || action.type === 'post_attack_move';
            const skipRecruitment = action.type !== 'recruit_to_castle' && action.type !== 'recruit_and_deploy';
            const legalActions = this.fullLegalCache?.playerId === this.state.currentPlayer ? this.fullLegalCache.actions : this.getCachedLegalActions(this.state.currentPlayer, moving ? { unitId: action.unitId, skipRecruitment, onlyOrdinaryMoves: action.type === 'move' }
                : action.type === 'attack' ? { unitId: action.attackerId, onlyAttacks: true }
                : { skipMovement: true, skipRecruitment });
            const isLegal = legalActions.some(la => areActionsEqual(la, action));

            if (!isLegal) {
                return {
                    state: this.getState(),
                    reward: 0,
                    done: this.isTerminal(),
                    info: `非法动作：当前玩家无法执行该动作`
                };
            }
        }

        this.fullLegalCache = undefined;
        this.queryLegalCache = new Map();
        this.executingStep = true;
        // 路径表只属于动作前状态；首次分支填表，之后同初态克隆只读复用。
        const beforeMovementCosts = this.movementCosts;
        this.movementCosts = new Map();
        const movementCost = (unitId: string, to: Position) => {
            const unit = this.state.units.find(u => u.id === unitId);
            if (unit?.pos.x === to.x && unit.pos.y === to.y) return 0;
            let costs = beforeMovementCosts.get(unitId);
            if (!costs) { costs = getMovementCosts(this.state, unitId); beforeMovementCosts.set(unitId, costs); }
            return costs.get(`${to.x},${to.y}`) ?? 999;
        };
        const prevCurrentPlayer = this.state.currentPlayer;
        
        let reward = 0;
        let info = '';
        const levelCap = getScalarRule(this.state, 'levelCap');
        let standbyUnitId: string | null = null;

        switch (action.type) {
            case 'move': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    // 记录单次移动消耗，并为突击部队扣减剩余移动资源
                    const cost = movementCost(unit.id, action.to);
                    const eff = getEffectiveStats(unit);
                    const remCur = unit.movementRemaining ?? eff.move;
                    unit.movementRemaining = Math.max(0, remCur - cost);

                    unit.pos = { ...action.to };
                    unit.hasMoved = true;
                    info = `Unit ${unit.id} moved to ${action.to.x},${action.to.y}`;
                }
                break;
            }
            case 'post_attack_move': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const cost = movementCost(unit.id, action.to);
                    unit.movementRemaining = Math.max(0, (unit.movementRemaining ?? 0) - cost);
                    unit.pos = { ...action.to };
                    unit.hasPostAttackMoved = true;
                    unit.hasActed = true;

                    standbyUnitId = unit.id;
                    info = `Unit ${unit.id} post-attack moved to ${action.to.x},${action.to.y}`;
                }
                break;
            }
            case 'attack': {
                const attacker = this.state.units.find(u => u.id === action.attackerId);
                const target = this.state.units.find(u => u.id === action.targetId);
                if (attacker && target) {
                    // 如果是具有 assault_troop 特性的突击部队，在攻击前如果还没初始化 movementRemaining，应按有效移动力初始化
                    if (hasAbility(attacker, 'assault_troop') && attacker.movementRemaining === undefined) {
                        attacker.movementRemaining = getEffectiveStats(attacker).move;
                    }

                    const dmg = calculateDamage(this.state, attacker.id, target.id);
                    target.hp -= dmg;
                    info = `Unit ${attacker.id} attacked ${target.id} for ${dmg} dmg.`;
                    reward += dmg * 0.1; 

                    this.applyCombatStatusEffects(attacker, target);

                    // APK 主动攻击经验：未击杀为 30，击杀时改用击杀经验 60，不与普通攻击经验叠加。
                    addExp(attacker, target.hp <= 0 ? KILL_EXP : ATTACK_EXP, levelCap);

                    let canCounter = false;
                    if (target.hp > 0) {
                        // APK 反编译确认 ATTACK 先附加状态，COUNTER_ATTACK 后检查反击。
                        // 因此本次致盲会阻止普通反击；反击风暴只看能力与距离。
                        // V14/T14-03：判定收敛到 rules.canCounterAttack，编码器与引擎共用同一实现。
                        canCounter = canCounterAttack(this.state, attacker.id, target.id);
                    }
                    
                    // 如果被攻击方存活，则可能反击
                    if (target.hp > 0) {
                        if (canCounter) {
                            // V14/T14-03：反击伤害与编码器/搜索用的预测共用同一套 rules 公式。
                            // 此处 target.hp 已经是受击后的值，因此走 resolved-state 入口。
                            const counterDmg = counterDamageOnResolvedState(this.state, attacker.id, target.id);
                            attacker.hp -= counterDmg;
                            info += ` Target counterattacked for ${counterDmg} dmg.`;
                            this.applyCombatStatusEffects(target, attacker);

                            // APK 反击经验：未击杀为助攻 10，击杀时改用击杀经验 60。
                            addExp(target, attacker.hp <= 0 ? KILL_EXP : ASSIST_EXP, levelCap);
                        }
                    } else {
                        // 主动攻击击杀经验已在反击判定前发放。
                    }
                    
                    attacker.hasMoved = true;
                    const waitsForPostAttackMove = hasAbility(attacker, 'assault_troop') && (attacker.movementRemaining ?? 0) > 0 && !attacker.hasPostAttackMoved;
                    // 如果是具有 assault_troop 特性的突击部队，在还有移动力且没在攻击后移动过时，暂不动 Acted，由 post_attack_move 去触发.
                    if (waitsForPostAttackMove) {
                        attacker.hasActed = true; // 依然是 Action 结束，只要合法动作里可以找出它
                    } else {
                        attacker.hasActed = true;
                    }
                    standbyUnitId = waitsForPostAttackMove ? null : attacker.id;
                }
                break;
            }
            case 'heal': {
                const healer = this.state.units.find(u => u.id === action.healerId);
                const target = this.state.units.find(u => u.id === action.targetId);
                if (healer && target) {
                    const level = healer.level ?? 0;
                    const healVal = healer.unitClass === 'paladin' ? (40 + level * 10) : 40;
                    let hpDelta = healVal;
                    
                    target.hasBeenHealedThisTurn = true;
                    if (isUndead(target)) {
                        // APK 反编译 C0600q.m4312e：治疗亡灵时变为 1.5 倍伤害。
                        hpDelta = -Math.floor((healVal * 3) / 2);
                        target.hp = Math.max(0, target.hp + hpDelta);
                        if (target.hp <= 0 && !hasAbility(healer, 'undead')) {
                            addExp(healer, 60, levelCap); // 击杀经验
                        }
                    } else {
                        // APK 明确治疗师治疗可以突破目标最大血量；普通地形/光环回复仍保留上限。
                        target.hp += healVal;
                    }
                    
                    if (target.hp > 0) {
                        addExp(healer, 30, levelCap);
                    }
                    
                    healer.hasMoved = true;
                    healer.hasActed = true;
                    standbyUnitId = healer.id;
                    info = `Healer ${healer.id} changed ${target.id} HP by ${hpDelta}.`;
                }
                break;
            }
            case 'summon': {
                const summoner = this.state.units.find(u => u.id === action.summonerId);
                if (summoner) {
                    const level = summoner.level ?? 0;
                    const nextId = this.state.nextUnitId ?? 100;
                    const newUnitId = `u_${nextId}`;
                    this.state.nextUnitId = nextId + 1;
                    
                    this.state.units.push({
                        id: newUnitId,
                        ownerId: summoner.ownerId,
                        unitClass: 'skeleton',
                        pos: { ...action.spawnPos },
                        hp: 100,
                        maxHp: 100,
                        // APK m4369a -> m4282j -> m4379A：召唤物创建后处于未移动、未行动状态。
                        hasMoved: false,
                        hasActed: false,
                        level,
                        exp: getExpThresholdForLevel(level)
                    });
                    
                    if (this.state.graves) {
                        this.state.graves = this.state.graves.filter(g => g.id !== action.graveId);
                    }
                    
                    // 经验
                    addExp(summoner, 10, levelCap);
                    
                    summoner.hasMoved = true;
                    summoner.hasActed = true;
                    standbyUnitId = summoner.id;
                    info = `Summoner ${summoner.id} summoned skeleton at ${action.spawnPos.x},${action.spawnPos.y}.`;
                }
                break;
            }
            case 'support': {
                const supporter = this.state.units.find(u => u.id === action.supporterId);
                const target = this.state.units.find(u => u.id === action.targetId);
                if (supporter && target) {
                    target.hasActed = false;
                    target.hasMoved = false;
                    target.movementRemaining = getEffectiveStats(target).move;
                    target.hasBeenSupportedThisTurn = true;
                    
                    // 经验
                    addExp(supporter, 10, levelCap);
                    
                    supporter.hasMoved = true;
                    supporter.hasActed = true;
                    standbyUnitId = supporter.id;
                    info = `Supporter ${supporter.id} reset action state of ${target.id}.`;
                }
                break;
            }
            case 'destroy_town': {
                const destroyer = this.state.units.find(u => u.id === action.unitId);
                if (destroyer) {
                    const target = action.target ?? destroyer.pos;
                    const tile = this.state.map.tiles[target.y]?.[target.x];
                    if (tile && isTileDestroyableForRules(tile)) {
                        destroyTileForRules(tile);
                        info = `Unit ${destroyer.id} destroyed town at ${target.x},${target.y}`;
                        
                        // 经验
                        addExp(destroyer, 30, levelCap);
                    }
                    
                    destroyer.hasMoved = true;
                    destroyer.hasActed = true;
                    standbyUnitId = destroyer.id;
                }
                break;
            }
            case 'capture': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const tile = this.state.map.tiles[unit.pos.y][unit.pos.x];
                    const previousOwnerId = tile.ownerId;
                    setTileOwnerForRules(tile, unit.ownerId);
                    info = `Unit ${unit.id} captured terrain at ${unit.pos.x},${unit.pos.y}`;
                    reward += 10;
                    unit.hasMoved = true;
                    unit.hasActed = true;
                    standbyUnitId = unit.id;
                    applyCampaignEvents(this.state, {
                        type: 'tile_occupied',
                        pos: { ...unit.pos },
                        ownerId: unit.ownerId,
                        previousOwnerId
                    });
                }
                break;
            }
            case 'repair': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const tile = this.state.map.tiles[unit.pos.y][unit.pos.x];
                    if (getTileTerrainKey(tile) === 'damaged_town') {
                        setTileTerrainForRules(tile, 9);
                        setTileOwnerAfterRepairForRules(tile);
                        info = `Unit ${unit.id} repaired town at ${unit.pos.x},${unit.pos.y}`;
                        reward += 5;
                    }
                    unit.hasMoved = true;
                    unit.hasActed = true;
                    standbyUnitId = unit.id;
                }
                break;
            }
            case 'wait': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    unit.hasMoved = true;
                    unit.hasActed = true;
                    standbyUnitId = unit.id;
                    info = `Unit ${unit.id} waited.`;
                }
                break;
            }
            case 'recruit_to_castle': {
                const player = this.state.players.find(p => p.id === this.state.currentPlayer);
                if (player && canRecruitUnitClass(this.state, this.state.currentPlayer, action.unitClass)) {
                    const castleOccupant = this.state.units.find(unit => (
                        unit.pos.x === action.castlePos.x
                        && unit.pos.y === action.castlePos.y
                        && unit.hp > 0
                    ));
                    const pendingSource = castleOccupant
                        && castleOccupant.ownerId === this.state.currentPlayer
                        && isCommanderUnit(this.state, castleOccupant, this.state.currentPlayer)
                        ? 'commander_castle'
                        : 'empty_castle';
                    const cost = getUnitCost(this.state, this.state.currentPlayer, action.unitClass) ?? 0;
                    player.gold -= cost;
                    const nextId = this.state.nextUnitId ?? 100;
                    const newUnitId = `u_${nextId}`;
                    this.state.nextUnitId = nextId + 1;
                    this.state.units.push({
                        id: newUnitId,
                        ownerId: this.state.currentPlayer,
                        unitClass: action.unitClass,
                        pos: { ...action.castlePos },
                        hp: 100,
                        maxHp: 100,
                        hasMoved: false, 
                        hasActed: false,
                        level: action.unitClass === 'commander' ? (player.commanderReserveLevel ?? 0) : 0,
                        exp: action.unitClass === 'commander' ? (player.commanderReserveExp ?? 0) : 0,
                        apkPendingRecruitSource: pendingSource
                    });
                    this.state.pendingUnitId = newUnitId;
                    info = `招募单位进入待行动状态 at ${action.castlePos.x},${action.castlePos.y}`;
                    reward += 1; 
                } else {
                    info = '招募失败：不满足当前规则限制';
                }
                break;
            }
            case 'recruit_and_deploy': {
                const player = this.state.players.find(p => p.id === this.state.currentPlayer);
                if (player && canRecruitUnitClass(this.state, this.state.currentPlayer, action.unitClass)) {
                    const cost = getUnitCost(this.state, this.state.currentPlayer, action.unitClass) ?? 0;
                    player.gold -= cost;
                    const nextId = this.state.nextUnitId ?? 100;
                    const newUnitId = `u_${nextId}`;
                    this.state.nextUnitId = nextId + 1;
                    this.state.units.push({
                        id: newUnitId,
                        ownerId: this.state.currentPlayer,
                        unitClass: action.unitClass,
                        pos: { ...action.to },
                        hp: 100,
                        maxHp: 100,
                        hasMoved: true, 
                        hasActed: false,
                        movementRemaining: 0,
                        level: action.unitClass === 'commander' ? (player.commanderReserveLevel ?? 0) : 0,
                        exp: action.unitClass === 'commander' ? (player.commanderReserveExp ?? 0) : 0,
                        apkPendingRecruitSource: 'commander_castle'
                    });
                    this.state.pendingUnitId = newUnitId;
                    standbyUnitId = newUnitId;
                    info = `招募单位已部署，等待完成行动 at ${action.to.x},${action.to.y}`;
                    reward += 1; 
                } else {
                    info = '招募失败：不满足当前规则限制';
                }
                break;
            }
            case 'surrender': {
                const player = this.state.players.find(p => p.id === this.state.currentPlayer);
                if (player) {
                    destroyTeamForRules(this.state, prevCurrentPlayer);
                    info = `Player ${prevCurrentPlayer} surrendered. Units removed and buildings neutralized.`;
                }

                const nextTurn = this.getNextTurnPlayer(prevCurrentPlayer);
                if (nextTurn.playerId !== null) {
                    this.state.currentPlayer = nextTurn.playerId;
                    if (nextTurn.wrapped) {
                        this.state.turn += 1;
                    }
                    this.startTurnForPlayer(nextTurn.playerId);
                    info += ` Turn passed to P${nextTurn.playerId}.`;
                }
                break;
            }
            case 'end_turn': {
                const prevPlayerId = this.state.currentPlayer;

                const nextTurn = this.getNextTurnPlayer(prevPlayerId);
                if (nextTurn.playerId === null) {
                    info = `Player ${prevCurrentPlayer} ended turn. No active team remains.`;
                    break;
                }

                this.state.currentPlayer = nextTurn.playerId;
                if (nextTurn.wrapped) {
                    this.state.turn += 1;
                }
                
                const nextPlayerId = this.state.currentPlayer;
                this.startTurnForPlayer(nextPlayerId);

                info = `Player ${prevCurrentPlayer} ended turn. Turn passed to P${nextPlayerId}.`;
                break;
            }
        }

        if (standbyUnitId) {
            const standbyUnit = this.state.units.find(unit => unit.id === standbyUnitId && unit.hp > 0);
            if (standbyUnit?.hasActed) {
                // 原生 STANDBY 经 m4436g 锁定突击行动；直接收尾不能再进入攻击后移动阶段。
                // 尚有攻击后移动的主动攻击不会设置 standbyUnitId，继续保留二次移动资格。
                if (hasAbility(standbyUnit, 'assault_troop')) standbyUnit.hasPostAttackMoved = true;
                // APK C0595l.m4442d 会把行动单位自身的净化回血与墓碑效果汇总后统一夹取；
                // 即使汇总 delta 为 0，也会经 C0600q.m4307f 把行动单位 HP 夹到最大生命。
                const auraResult = this.triggerAuras(standbyUnit, {
                    deferActingUnitCleansingHpDelta: true
                });
                const graveHpDelta = this.consumeGraveAtUnitPosition(standbyUnit, {
                    applyHpDelta: false
                }) ?? 0;
                this.applyTurnStartHpDelta(
                    standbyUnit,
                    getEffectiveStats(standbyUnit).maxHp,
                    auraResult.deferredActingUnitHpDelta + graveHpDelta
                );
                if (standbyUnit.hp > 0) {
                    if (auraResult.killedUnits.length > 0) {
                        // APK C0595l.m4442d：后处理光环造成击杀时，行动单位仍存活则获得击杀经验。
                        addExp(standbyUnit, KILL_EXP * auraResult.killedUnits.length, levelCap);
                    }
                    applyCampaignEvents(this.state, { type: 'unit_standby', unit: { ...standbyUnit, pos: { ...standbyUnit.pos } } });
                }
            }
        }

        // 先结算死亡与墓碑，再执行队伍清理，避免淘汰吞掉指挥官死亡记录。
        const deadUnits = this.removeDeadUnits();
        if (deadUnits.length > 0) {
            for (const deadUnit of deadUnits) {
                applyCampaignEvents(this.state, { type: 'unit_destroyed', unit: deadUnit });
            }
            info += ` Unit(s) died.`;
            reward += deadUnits.length * 10;
        }

        // 清理 pendingUnitId：如果指定的单位已经执行完动作(hasActed) 或 死亡(不存在)，或者当前回合结束了，或它是非法状态
        if (this.state.pendingUnitId) {
            const pendingUnit = this.state.units.find(u => u.id === this.state.pendingUnitId);
            if (!pendingUnit || pendingUnit.hasActed || action.type === 'end_turn' || action.type === 'surrender') {
                delete this.state.pendingUnitId;
            }
        }

        this.checkWinConditions();
        if (!this.isTerminal()) {
            // APK SD/SO 控制脚本在当前队伍被摧毁且未终局时会 AsyncNextTurn。
            this.ensureCurrentPlayerCanAct(true);
            if (!this.disableAutoAdvanceWhenNoMeaningfulAction) {
                this.ensureCurrentPlayerHasMeaningfulAction();
            }
        }

        this.executingStep = false;
        this.fullLegalCache = undefined;
        return {
            state: this.getState(),
            reward: reward,
            done: this.isTerminal(),
            info: info
        };
    }

    private checkWinConditions() {
        if (this.state.winner !== null) return;
        const ruleConfig = {
            defeatOnNoUnitsAndNoCastles: getScalarRule(this.state, 'defeatOnNoUnitsAndNoCastles'),
            defeatOnNoUnits: getScalarRule(this.state, 'defeatOnNoUnits'),
            defeatOnCommanderDeath: getScalarRule(this.state, 'defeatOnCommanderDeath'),
            defeatOnNoCastles: getScalarRule(this.state, 'defeatOnNoCastles')
        };

        for (const player of this.state.players) {
            if (!isActivePlayer(this.state, player.id)) continue;
            const hasUnits = this.state.units.some(u => u.ownerId === player.id && u.hp > 0);
            const hasCommander = getCommanderUnit(this.state, player.id) !== null;
            const hasCastle = this.state.map.tiles.some(row => row.some(tile => (
                tile.ownerId === player.id && getTileTerrainKey(tile) === 'castle'
            )));
            const hasNoUnitsAndNoCastles = !hasUnits && !hasCastle;

            if (
                (ruleConfig.defeatOnNoUnitsAndNoCastles && hasNoUnitsAndNoCastles)
                || (ruleConfig.defeatOnNoUnits && !hasUnits)
                || (ruleConfig.defeatOnCommanderDeath && !hasCommander)
                || (ruleConfig.defeatOnNoCastles && !hasCastle)
            ) {
                destroyTeamForRules(this.state, player.id);
            }
        }

        const alivePlayers = this.state.players.filter(p => isActivePlayer(this.state, p.id));
        const aliveAlliances = [...new Set(alivePlayers.map(player => getAllianceId(this.state, player.id)))];
        if (aliveAlliances.length === 1) {
            this.state.winner = aliveAlliances[0];
        } else if (aliveAlliances.length === 0) {
            this.state.winner = -1; // Draw
        }
    }

    private ensureCurrentPlayerHasMeaningfulAction() {
        let guard = 0;
        while (!this.isTerminal() && guard < this.state.players.length) {
            // 可待机或执行技能的单位已足以阻止自动换手，无需先枚举移动与招募。
            if (this.getActionReadyUnitCount(this.state.currentPlayer) > 0) return;
            const actions = this.getCachedLegalActions(this.state.currentPlayer);
            const hasMeaningfulAction = actions.some(action => action.type !== 'end_turn' && action.type !== 'surrender');
            if (hasMeaningfulAction) return;

            const nextTurn = this.getNextTurnPlayer(this.state.currentPlayer);
            if (nextTurn.playerId === null || nextTurn.playerId === this.state.currentPlayer) return;
            this.state.currentPlayer = nextTurn.playerId;
            if (nextTurn.wrapped) {
                this.state.turn += 1;
            }
            this.startTurnForPlayer(nextTurn.playerId);
            const deadUnits = this.removeDeadUnits();
            for (const deadUnit of deadUnits) {
                applyCampaignEvents(this.state, { type: 'unit_destroyed', unit: deadUnit });
            }
            this.checkWinConditions();
            this.ensureCurrentPlayerCanAct(true);
            guard += 1;
        }
    }
}
