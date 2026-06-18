import { Tile } from './terrain';

export interface Position {
    x: number;
    y: number;
}

export type UnitClass = 'soldier' | 'ghost' | 'mermaid' | 'archer' | 'slime' | 'water_elemental' | 'dark_mage' | 'witch' | 'paladin' | 'elf' | 'berserker' | 'wolf' | 'golem' | 'ice_elemental' | 'druid' | 'catapult' | 'wolf_archer' | 'dragon' | 'commander' | 'skeleton';
export type Ability = string;

export type StatusType = "poisoned" | "blinded" | "weakened";

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
    attackAuraActive?: boolean; // 下一回合是否有攻击光环加成
}

export interface PlayerState {
    id: number;
    gold: number;
    isAlive: boolean; // 如果指挥官死亡或大本营被占领，变为false
    commanderDeathCount: number; // 指挥官死亡次数
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
}

/** 动作必须是结构化对象 */
export type Action =
    | { type: 'move'; unitId: string; to: Position }
    | { type: 'attack'; attackerId: string; targetId: string }
    | { type: 'capture'; unitId: string }
    | { type: 'repair'; unitId: string }
    | { type: 'wait'; unitId: string }
    | { type: 'recruit'; unitClass: UnitClass; castlePos: Position; spawnPos: Position } 
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
    info: any;
}
