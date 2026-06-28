import { Tile } from './terrain';

export interface Position {
    x: number;
    y: number;
}

export type UnitClass = 'soldier' | 'ghost' | 'mermaid' | 'archer' | 'slime' | 'water_elemental' | 'dark_mage' | 'witch' | 'paladin' | 'elf' | 'berserker' | 'wolf' | 'golem' | 'ice_elemental' | 'druid' | 'catapult' | 'wolf_archer' | 'dragon' | 'commander' | 'skeleton' | 'crystal';
export type Ability = 'village_capturer' | 'castle_capturer' | 'repairer' | 'flying' | 'undead' | 'death_reaper' | 'water_child' | 'sharpshooter' | 'self_repair' | 'blinder' | 'summoner' | 'healer' | 'cleansing_aura' | 'fighting_spirit' | 'counter_storm' | 'earth_child' | 'poisoner' | 'ranged_defense' | 'mountain_child' | 'weakness_aura' | 'attack_aura' | 'supporter' | 'destroyer' | 'forest_child' | 'assault_troop' | 'melee_master';

export type StatusType = "poisoned" | "inspired" | "blinded" | "weakened";

export interface UnitStatus {
  type: StatusType;
  remainingTicks?: number;
  remainingTurns?: number;
}

export interface Grave {
    id: string;
    pos: Position;
    remainingTurns: number;
}

export interface Unit {
    id: string;      // 单位唯一ID
    ownerId: number; // 归属玩家ID
    unitClass: UnitClass; // 兵种
    pos: Position;   // 当前位置
    hp: number;      // 当前血量
    maxHp: number;   // 最大血量
    hasMoved: boolean; // 本回合是否已移动
    hasActed: boolean; // 本回合是否已行动
    status?: UnitStatus; // 单位状态
    level?: 0 | 1 | 2 | 3; // 经验等级
    exp?: number;          // 经验值
    movementRemaining?: number; // 突击部队剩余移动力
    hasPostAttackMoved?: boolean; // 突击部队是否执行了攻击后移动
    hasBeenHealedThisTurn?: boolean; // 本回合是否被治疗过
    hasBeenSupportedThisTurn?: boolean; // 本回合是否被支援过
}

export interface PlayerState {
    id: number;
    gold: number;
    isAlive: boolean; // 如果指挥官死亡或大本营被占领，变为false
    commanderDeathCount: number; // 指挥官死亡次数
}

export type LevelCap = 0 | 1 | 2 | 3;

export interface TeamRuleConfig {
    unitLimit?: number;          // 队伍单位数量上限
    populationLimit?: number;    // 队伍人口上限
    recruitableUnits?: UnitClass[]; // 队伍允许招募的单位列表
}

export interface RuleConfig {
    incomeVillage?: number;          // 村庄每回合收入
    incomeCastle?: number;           // 城堡每回合收入
    incomeCommanderBase?: number;    // 指挥官存活基础收入
    incomeCommanderGrowth?: number;  // 指挥官每级收入成长
    levelCap?: LevelCap;             // 等级上限
    teams?: Record<number, TeamRuleConfig>;
}

export interface GameState {
    turn: number;            // 游戏总回合数
    currentPlayer: number;   // 当前行动的玩家ID (例如 0, 1)
    map: {
        width: number;
        height: number;
        tiles: Tile[][]; // 二维数组, tiles[y][x]
    };
    units: Unit[];           // 场上所有单位
    players: PlayerState[];  // 玩家状态
    winner: number | null;   // 获胜玩家ID, 游戏未结束则为null
    graves?: Grave[];        // 墓碑中立列表
    nextUnitId?: number;     // 确定性单位ID计数
    nextGraveId?: number;    // 确定性墓碑ID计数
    pendingUnitId?: string;  // 当前待处理单位ID (例如刚从城堡招募出来，必须优先行动)
    rules?: RuleConfig;      // APK/关卡层可覆盖的规则配置
}

/** 动作必须是结构化对象 */
export type Action =
    | { type: 'move'; unitId: string; to: Position }
    | { type: 'attack'; attackerId: string; targetId: string }
    | { type: 'capture'; unitId: string }
    | { type: 'repair'; unitId: string }
    | { type: 'wait'; unitId: string }
    | { type: 'recruit_to_castle'; unitClass: UnitClass; castlePos: Position } 
    | { type: 'recruit_and_deploy'; unitClass: UnitClass; castlePos: Position; to: Position } 
    | { type: 'heal'; healerId: string; targetId: string }
    | { type: 'summon'; summonerId: string; graveId: string; spawnPos: Position }
    | { type: 'support'; supporterId: string; targetId: string }
    | { type: 'destroy_town'; unitId: string }
    | { type: 'post_attack_move'; unitId: string; to: Position }
    | { type: 'end_turn' };

export interface StepResult {
    state: GameState;
    reward: number;
    done: boolean;
    info: string;
}
