import { Action, GameState, StepResult, Unit, Position, UnitClass } from './types';
import { getLegalActions, calculateDamage, inRange } from './rules';
import { UNIT_CONFIGS, TERRAIN_CONFIG } from './constants';
import { hasAbility, isWaterTerrain, isForestTerrain, isMountainTerrain, isUndead, getEffectiveStats, addExp, clearNegativeStatus } from './abilities';
import { getMoveCostTo, getDistance } from './map';
import { areAlliedPlayers, areEnemyPlayers, canRecruitUnitClass, getAllianceId, getCommanderUnit, getRuleConfig, getTerrainIncome, getTurnPlayerIds, getUnitCost, isActivePlayer, isCommanderUnit, isFriendlyOrNeutralOwner } from './rule_config';
import { getTileHealPerTurn } from './terrain_rules';

function isSamePos(p1?: Position, p2?: Position): boolean {
    if (!p1 || !p2) return p1 === p2;
    return p1.x === p2.x && p1.y === p2.y;
}

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
        case 'capture':
        case 'repair':
        case 'destroy_town':
        case 'wait': {
            const m1 = a1 as { type: 'capture' | 'repair' | 'destroy_town' | 'wait'; unitId: string };
            const m2 = a2 as { type: 'capture' | 'repair' | 'destroy_town' | 'wait'; unitId: string };
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
}

export class GameEngine {
    private state: GameState;
    private unsafeBypassValidationForTests: boolean = false;

    constructor(initialState: GameState, options?: GameEngineOptions) {
        this.state = JSON.parse(JSON.stringify(initialState)); // deep copy
        if (options?.unsafeBypassValidationForTests) {
            this.unsafeBypassValidationForTests = true;
        }
        this.ensureCurrentPlayerCanAct();
    }

    public getState(): GameState {
        // Return a deep copy to prevent external mutation
        return JSON.parse(JSON.stringify(this.state));
    }

    public clone(): GameEngine {
        return new GameEngine(this.state, { unsafeBypassValidationForTests: this.unsafeBypassValidationForTests });
    }

    public getLegalActions(playerId: number): Action[] {
        return getLegalActions(this.state, playerId);
    }

    public isTerminal(): boolean {
        return this.state.winner !== null;
    }

    public getWinner(): number | null {
        return this.state.winner;
    }

    public reset(config?: GameState): GameState {
        if (config) {
            this.state = JSON.parse(JSON.stringify(config));
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

    private ensureCurrentPlayerCanAct() {
        if (isActivePlayer(this.state, this.state.currentPlayer)) return;
        const nextTurn = this.getNextTurnPlayer(this.state.currentPlayer);
        if (nextTurn.playerId !== null) {
            this.state.currentPlayer = nextTurn.playerId;
        }
    }

    private recordCommanderDeaths(deadUnits: Unit[]) {
        for (const unit of deadUnits) {
            if (!isCommanderUnit(this.state, unit)) continue;
            const player = this.state.players.find(p => p.id === unit.ownerId);
            if (player) {
                player.commanderDeathCount += 1;
            }
        }
    }

    private consumeGraveAtUnitPosition(unit: Unit) {
        if (!this.state.graves) return;

        const graveIdx = this.state.graves.findIndex(g => g.pos.x === unit.pos.x && g.pos.y === unit.pos.y);
        if (graveIdx === -1) return;

        if (isUndead(unit)) {
            unit.hp = Math.min(getEffectiveStats(unit).maxHp, unit.hp + 10);
        } else if (!hasAbility(unit, 'summoner')) {
            // APK 文案确认召唤师摧毁墓碑不会损失生命值。
            unit.hp -= 10;
        }

        this.state.graves.splice(graveIdx, 1);
    }

    private triggerAuras(unit: Unit) {
        if (unit.hp <= 0) return;
        
        // 1. 净化光环 (cleansing_aura)
        if (hasAbility(unit, 'cleansing_aura')) {
            const level = unit.level ?? 0;
            const healVal = 10 + level * 5; // 精灵升级后净化光环回血+5
            
            this.state.units.forEach(u => {
                if (u.id !== unit.id && areAlliedPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
                    if (isUndead(u)) {
                        u.hp = Math.max(0, u.hp - healVal);
                    } else {
                        const maxHp = getEffectiveStats(u).maxHp;
                        u.hp = Math.min(maxHp, u.hp + healVal);
                        clearNegativeStatus(u);
                    }
                }
            });
        }
        
        // 2. 攻击光环 (attack_aura)
        if (hasAbility(unit, 'attack_aura')) {
            this.state.units.forEach(u => {
                if (u.id !== unit.id && areAlliedPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
                    if (!u.status) {
                        u.status = { type: 'inspired', remainingTurns: 1 };
                    }
                }
            });
        }
        
        // 3. 虚弱光环 (weakness_aura)
        if (hasAbility(unit, 'weakness_aura')) {
            this.state.units.forEach(u => {
                if (areEnemyPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
                    if (!hasAbility(u, 'weakness_aura') && !u.status) {
                        u.status = { type: 'weakened', remainingTurns: 1 };
                    }
                }
            });
        }
    }

    public step(action: Action): StepResult {
        if (this.isTerminal()) {
            return { state: this.getState(), reward: 0, done: true, info: 'Game already ended' };
        }

        // 合法性校验
        if (!this.unsafeBypassValidationForTests) {
            const legalActions = getLegalActions(this.state, this.state.currentPlayer);
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

        const prevCurrentPlayer = this.state.currentPlayer;
        
        let reward = 0;
        let info = '';
        const ruleConfig = getRuleConfig(this.state);

        switch (action.type) {
            case 'move': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    // 记录单次移动消耗，并为突击部队扣减剩余移动资源
                    const cost = getMoveCostTo(this.state, unit.id, action.to);
                    const eff = getEffectiveStats(unit);
                    const remCur = unit.movementRemaining ?? eff.move;
                    unit.movementRemaining = Math.max(0, remCur - cost);

                    unit.pos = { ...action.to };
                    unit.hasMoved = true;
                    info = `Unit ${unit.id} moved to ${action.to.x},${action.to.y}`;

                    this.consumeGraveAtUnitPosition(unit);
                }
                break;
            }
            case 'post_attack_move': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const cost = getMoveCostTo(this.state, unit.id, action.to);
                    unit.movementRemaining = Math.max(0, (unit.movementRemaining ?? 0) - cost);
                    unit.pos = { ...action.to };
                    unit.hasPostAttackMoved = true;
                    unit.hasActed = true;

                    this.consumeGraveAtUnitPosition(unit);
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

                    // 经验值：攻击者获得 30 经验
                    addExp(attacker, 30, ruleConfig.levelCap);

                    // 被动状态附加（反击不触发中毒和致盲）
                    if (target.hp > 0 && !target.status) {
                        if (hasAbility(attacker, 'poisoner') && !hasAbility(target, 'poisoner')) {
                            target.status = { type: 'poisoned', remainingTicks: 2 };
                        } else if (hasAbility(attacker, 'blinder') && !hasAbility(target, 'blinder')) {
                            target.status = { type: 'blinded' };
                        }
                    }
                    
                    // 如果被攻击方存活，则可能反击
                    if (target.hp > 0) {
                        const targetStats = getEffectiveStats(target);
                        const isCounterStorm = hasAbility(target, 'counter_storm') && getDistance(target.pos, attacker.pos) <= 2;
                        const canCounter = isCounterStorm || inRange(target.pos, attacker.pos, targetStats.minRange, targetStats.maxRange);

                        if (canCounter) {
                            const counterDmg = calculateDamage(this.state, target.id, attacker.id);
                            attacker.hp -= counterDmg;
                            info += ` Target counterattacked for ${counterDmg} dmg.`;

                            // 经验值：反击者获得 10 经验
                            addExp(target, 10, ruleConfig.levelCap);

                            // 如果反击导致攻击者死亡
                            if (attacker.hp <= 0) {
                                addExp(target, 60, ruleConfig.levelCap); // 击杀经验 +60
                                
                                // 生成墓碑（若非亡灵）
                                if (!isUndead(attacker)) {
                                    this.state.graves = this.state.graves || [];
                                    if (!this.state.graves.some(g => g.pos.x === attacker.pos.x && g.pos.y === attacker.pos.y)) {
                                        const ngId = this.state.nextGraveId ?? 100;
                                        this.state.graves.push({
                                            id: `g_${ngId}`,
                                            pos: { ...attacker.pos },
                                            remainingTurns: 2
                                        });
                                        this.state.nextGraveId = ngId + 1;
                                    }
                                }
                            }
                        }
                    } else {
                        // 主动攻击导致击杀：获得 60 经验
                        addExp(attacker, 60, ruleConfig.levelCap);

                        // 生成墓碑（若非亡灵）
                        if (!isUndead(target)) {
                            this.state.graves = this.state.graves || [];
                            if (!this.state.graves.some(g => g.pos.x === target.pos.x && g.pos.y === target.pos.y)) {
                                const ngId = this.state.nextGraveId ?? 100;
                                this.state.graves.push({
                                    id: `g_${ngId}`,
                                    pos: { ...target.pos },
                                    remainingTurns: 2
                                });
                                this.state.nextGraveId = ngId + 1;
                            }
                        }
                    }
                    
                    attacker.hasMoved = true;
                    // 如果是具有 assault_troop 特性的突击部队，在还有移动力且没在攻击后移动过时，暂不动 Acted，由 post_attack_move 去触发.
                    if (hasAbility(attacker, 'assault_troop') && (attacker.movementRemaining ?? 0) > 0 && !attacker.hasPostAttackMoved) {
                        attacker.hasActed = true; // 依然是 Action 结束，只要合法动作里可以找出它
                    } else {
                        attacker.hasActed = true;
                    }
                }
                break;
            }
            case 'heal': {
                const healer = this.state.units.find(u => u.id === action.healerId);
                const target = this.state.units.find(u => u.id === action.targetId);
                if (healer && target) {
                    const level = healer.level ?? 0;
                    const healVal = healer.unitClass === 'paladin' ? (40 + level * 10) : 40;
                    
                    if (isUndead(target)) {
                        target.hp = Math.max(0, target.hp - healVal);
                        if (target.hp <= 0 && !hasAbility(healer, 'undead')) {
                            addExp(healer, 60, ruleConfig.levelCap); // 击杀经验
                        }
                    } else {
                        // APK 明确治疗师治疗可以突破目标最大血量；普通地形/光环回复仍保留上限。
                        target.hp += healVal;
                        target.hasBeenHealedThisTurn = true;
                    }
                    
                    // 经验
                    addExp(healer, 30, ruleConfig.levelCap);
                    
                    healer.hasMoved = true;
                    healer.hasActed = true;
                    info = `Healer ${healer.id} healed ${target.id} for ${healVal} points.`;
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
                        hasMoved: true,
                        hasActed: true,
                        level,
                        exp: 0
                    });
                    
                    if (this.state.graves) {
                        this.state.graves = this.state.graves.filter(g => g.id !== action.graveId);
                    }
                    
                    // 经验
                    addExp(summoner, 10, ruleConfig.levelCap);
                    
                    summoner.hasMoved = true;
                    summoner.hasActed = true;
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
                    target.hasBeenSupportedThisTurn = true;
                    
                    // 经验
                    addExp(supporter, 10, ruleConfig.levelCap);
                    
                    supporter.hasMoved = true;
                    supporter.hasActed = true;
                    info = `Supporter ${supporter.id} reset action state of ${target.id}.`;
                }
                break;
            }
            case 'destroy_town': {
                const destroyer = this.state.units.find(u => u.id === action.unitId);
                if (destroyer) {
                    const tile = this.state.map.tiles[destroyer.pos.y][destroyer.pos.x];
                    if (tile.terrainId === 9) { // 城镇
                        tile.terrainId = 8; // 损坏城镇
                        tile.ownerId = null; // 无主中立
                        info = `Unit ${destroyer.id} destroyed town at ${destroyer.pos.x},${destroyer.pos.y}`;
                        
                        // 经验
                        addExp(destroyer, 30, ruleConfig.levelCap);
                    }
                    
                    destroyer.hasMoved = true;
                    destroyer.hasActed = true;
                }
                break;
            }
            case 'capture': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const tile = this.state.map.tiles[unit.pos.y][unit.pos.x];
                    tile.ownerId = unit.ownerId;
                    info = `Unit ${unit.id} captured terrain at ${unit.pos.x},${unit.pos.y}`;
                    reward += 10;
                    unit.hasMoved = true;
                    unit.hasActed = true;
                }
                break;
            }
            case 'repair': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    const tile = this.state.map.tiles[unit.pos.y][unit.pos.x];
                    if (TERRAIN_CONFIG[tile.terrainId].key === 'damaged_town') {
                        const townEntry = Object.entries(TERRAIN_CONFIG).find(([_, c]) => c.key === 'town');
                        if (townEntry) {
                            tile.terrainId = parseInt(townEntry[0]) as import('./terrain').TerrainId;
                            tile.ownerId = unit.ownerId; 
                            info = `Unit ${unit.id} repaired town at ${unit.pos.x},${unit.pos.y}`;
                            reward += 5;
                        }
                    }
                    unit.hasMoved = true;
                    unit.hasActed = true;
                }
                break;
            }
            case 'wait': {
                const unit = this.state.units.find(u => u.id === action.unitId);
                if (unit) {
                    unit.hasMoved = true;
                    unit.hasActed = true;
                    this.triggerAuras(unit);
                    info = `Unit ${unit.id} waited.`;
                }
                break;
            }
            case 'recruit_to_castle': {
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
                        pos: { ...action.castlePos },
                        hp: 100,
                        maxHp: 100,
                        hasMoved: false, 
                        hasActed: false,
                        level: 0,
                        exp: 0
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
                        level: 0,
                        exp: 0
                    });
                    this.state.pendingUnitId = newUnitId;
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
                    player.isAlive = false;
                    delete this.state.pendingUnitId;
                    info = `Player ${prevCurrentPlayer} surrendered.`;
                }
                break;
            }
            case 'end_turn': {
                const prevPlayerId = this.state.currentPlayer;
                this.state.units.forEach(u => {
                    const hasTurnStatus = u.status
                        && (
                            u.status.type === 'weakened'
                            || u.status.type === 'inspired'
                            || (u.status.type === 'blinded' && u.status.remainingTurns !== undefined)
                        );
                    if (u.ownerId === prevPlayerId && hasTurnStatus && u.status) {
                        const remainingTurns = u.status.remainingTurns ?? 0;
                        if (remainingTurns <= 1) {
                            delete u.status;
                        } else {
                            u.status.remainingTurns = remainingTurns - 1;
                        }
                    }
                });

                // 墓碑减少时常
                if (this.state.graves) {
                    this.state.graves = this.state.graves.map(g => ({
                        ...g,
                        remainingTurns: g.remainingTurns - 1
                    })).filter(g => g.remainingTurns > 0);
                }

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
                const nextPlayer = this.state.players.find(p => p.id === nextPlayerId);

                // 金币收益结算
                if (nextPlayer) {
                    let totalIncome = 0;
                    for (let y = 0; y < this.state.map.height; y++) {
                        for (let x = 0; x < this.state.map.width; x++) {
                           const tile = this.state.map.tiles[y][x];
                           if (tile.ownerId === nextPlayerId) {
                               const income = getTerrainIncome(this.state, tile.terrainId);
                               totalIncome += income;
                           }
                        }
                    }
                    
                    // 指挥官存活收入由 APK 规则配置驱动；脚本可把任意己方单位指定为指挥官。
                    const commander = getCommanderUnit(this.state, nextPlayerId);
                    if (commander) {
                        const lvl = commander.level ?? 0;
                        totalIncome += ruleConfig.incomeCommanderBase + lvl * ruleConfig.incomeCommanderGrowth;
                    }

                    nextPlayer.gold += totalIncome;
                }
                
                // 重置行动状态 && 结算回血与状态
                this.state.units.forEach(u => {
                    if (u.ownerId === nextPlayerId) {
                        u.hasMoved = false;
                        u.hasActed = false;
                        u.hasBeenHealedThisTurn = false;
                        u.hasBeenSupportedThisTurn = false;
                        u.hasPostAttackMoved = false;
                        
                        const eff = getEffectiveStats(u);
                        u.movementRemaining = eff.move;

                        // 1. 状态结算 (首当其冲是中毒扣血)
                        let isPoisonDead = false;
                        if (u.status && u.status.type === 'poisoned') {
                            const remainingTicks = u.status.remainingTicks ?? 0;
                            if (remainingTicks > 0) {
                                // 扣血或若为亡灵则回血 10
                                if (isUndead(u)) {
                                    u.hp = Math.min(eff.maxHp, u.hp + 10);
                                } else {
                                    u.hp -= 10;
                                    if (u.hp <= 0) {
                                        isPoisonDead = true;
                                    }
                                }
                                u.status.remainingTicks = remainingTicks - 1;
                            } else {
                                // 第三次己方回合开始时状态消除，该回合不扣血
                                delete u.status;
                            }
                        }

                        // 如果因中毒致死，普通单位立即死亡，不再结算后续回复。
                        // APK 自我修复文案明确“不论是否中毒”都会在回合开始回复 25% HP，
                        // 因此中毒把自我修复单位扣到 0 以下时，仍先给它一次自我修复机会。
                        if (isPoisonDead) {
                            if (hasAbility(u, 'self_repair')) {
                                u.hp = Math.min(eff.maxHp, u.hp + Math.floor(eff.maxHp * 0.25));
                                if (u.hp > 0) {
                                    return;
                                }
                            }

                            u.hp = 0; // 确保致死并被 filter 级联清除
                            return;
                        }

                        const tile = this.state.map.tiles[u.pos.y][u.pos.x];
                        const tConfig = TERRAIN_CONFIG[tile.terrainId];

                        // 神庙类地形在回合开始清除负面状态，APK 文案未限定只能是陆地神庙。
                        if (tConfig.tags.includes('cleanse')) {
                            clearNegativeStatus(u);
                            // 若清除了 weakened，可能恢复移动力，重新更新 movementRemaining
                            const updatedEff = getEffectiveStats(u);
                            u.movementRemaining = updatedEff.move;
                        }

                        // 中毒期间普通地形回复及地形回血失效（自我修复不受影响）
                        const isCurrentlyPoisoned = u.status && u.status.type === 'poisoned';

                        let healAmount = 0;
                        
                        // 2. 地形回复
                        const terrainHealPerTurn = getTileHealPerTurn(tile);
                        if (!isCurrentlyPoisoned && isFriendlyOrNeutralOwner(this.state, nextPlayerId, tile.ownerId) && terrainHealPerTurn > 0) {
                            healAmount += terrainHealPerTurn;
                        }
                        
                        // 3. 水之子/森林之子/山之子地形回血
                        if (!isCurrentlyPoisoned) {
                            if (hasAbility(u, 'water_child') && isWaterTerrain(tile.terrainId)) {
                                healAmount += 10;
                            }
                            if (hasAbility(u, 'forest_child') && isForestTerrain(tile.terrainId)) {
                                healAmount += 10;
                            }
                            if (hasAbility(u, 'mountain_child') && isMountainTerrain(tile.terrainId)) {
                                healAmount += 10;
                            }
                        }
                        
                        // 4. 自自我修复
                        if (hasAbility(u, 'self_repair')) {
                            healAmount += Math.floor(eff.maxHp * 0.25);
                        }
                        
                        if (healAmount > 0) {
                            u.hp = Math.min(eff.maxHp, u.hp + healAmount);
                        }
                    }
                });

                info = `Player ${prevCurrentPlayer} ended turn. Turn passed to P${nextPlayerId}.`;
                break;
            }
        }

        this.checkWinConditions();

        const preLen = this.state.units.length;
        const deadUnits = this.state.units.filter(u => u.hp <= 0);
        this.recordCommanderDeaths(deadUnits);
        this.state.units = this.state.units.filter(u => u.hp > 0);
        if (this.state.units.length < preLen) {
            info += ` Unit(s) died.`;
            reward += (preLen - this.state.units.length) * 10; 
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
            this.ensureCurrentPlayerCanAct();
        }

        return {
            state: this.getState(),
            reward: reward,
            done: this.isTerminal(),
            info: info
        };
    }

    private checkWinConditions() {
        if (this.state.winner !== null) return;
        const ruleConfig = getRuleConfig(this.state);

        for (const player of this.state.players) {
            if (!isActivePlayer(this.state, player.id)) continue;
            const hasUnits = this.state.units.some(u => u.ownerId === player.id && u.hp > 0);
            const hasCommander = getCommanderUnit(this.state, player.id) !== null;
            const hasCastle = this.state.map.tiles.some(row => row.some(tile => (
                tile.ownerId === player.id && TERRAIN_CONFIG[tile.terrainId].key === 'castle'
            )));
            const hasNoUnitsAndNoCastles = !hasUnits && !hasCastle;

            if (
                (ruleConfig.defeatOnNoUnitsAndNoCastles && hasNoUnitsAndNoCastles)
                || (ruleConfig.defeatOnNoUnits && !hasUnits)
                || (ruleConfig.defeatOnCommanderDeath && !hasCommander)
                || (ruleConfig.defeatOnNoCastles && !hasCastle)
            ) {
                player.isAlive = false;
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
}
