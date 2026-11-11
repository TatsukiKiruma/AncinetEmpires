import type { Action, GameState, UnitClass } from '../../game/types';

export const SCHEMA_ID = 'dual-stream-v2-phase1-v1';
export const PLAYER_SLOTS = 6;
export const MAP_CHANNELS = 34;
export const ENTITY_DIM = 66;
export const RELATION_DIM = 16;
export const POINTER_DIM = 5;
export const UNIT_CLASSES: readonly UnitClass[] = ['soldier', 'ghost', 'mermaid', 'archer', 'slime', 'water_elemental', 'dark_mage', 'witch', 'paladin', 'elf', 'berserker', 'wolf', 'golem', 'ice_elemental', 'druid', 'catapult', 'wolf_archer', 'dragon', 'commander', 'skeleton', 'crystal'];
// 保留投降语义编号但不输出其训练指针；显式摧城目标单设语义，保留可选字段。
export const ACTION_HEADS = ['move', 'attack', 'capture', 'repair', 'wait', 'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon', 'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn', 'destroy_town_target'] as const;
export const SPATIAL_CHANNEL_NAMES = ['terrain_category', 'defense', 'land_cost', 'water_cost', 'flying_cost', 'building', 'building_self', 'building_ally', 'building_enemy_slot1', 'building_enemy_slot2', 'building_enemy_slot3', 'building_enemy_slot4', 'building_enemy_slot5', 'building_neutral', 'damaged_town', 'grave', 'grave_turns', 'unit_slot', 'unit_relation', 'unit_hp', 'unit_level_ready', 'unit_commander', 'next_enemy_max_damage', 'next_enemy_count', 'all_enemies_top3_damage', 'enemy_debuff_bits', 'friendly_max_damage', 'friendly_top2_damage', 'friendly_ranged_count', 'friendly_inspire', 'friendly_cleansing', 'friendly_heal', 'friendly_support', 'chokepoint_frontline_bits'] as const;
export const ENTITY_FIELDS = { unit: 0, castle: 1, grave: 2, classStart: 3, slotStart: 24, self: 30, ally: 31, enemy: 32, x: 33, y: 34, nx: 35, ny: 36, dx: 37, dy: 38, hp: 39, maxHp: 40, armyValue: 41, level: 42, exp: 43, statusStart: 44, moved: 48, acted: 49, postMoved: 50, pending: 51, minRange: 52, maxRange: 53, move: 54, threat: 55, commander: 56, graveTurns: 57, aliveOwner: 58, movementRemaining: 59, healed: 60, supported: 61, static: 62, emptyCastlePending: 63, commanderCastlePending: 64, reserved: 65 } as const;
export const RELATION_NAMES = ['same_owner', 'allied', 'enemy', 'manhattan_bucket', 'path_cost_bucket', 'path_reachable', 'direct_attack', 'move_attack', 'damage_hp_ratio', 'can_one_shot', 'heal', 'support', 'inspire', 'cleansing', 'weakness', 'same_tile'] as const;
export interface PlayerOrder {
    playerIds: (number | null)[];
    slotByPlayer: Map<number, number>;
    // [6, 11]：active、顺位距离、self、ally、enemy、金币、单位数、军力、指挥官、预备役、存活。
    features: Float32Array;
    active: Uint8Array;
}
export interface EntityRef { kind: 'unit' | 'castle' | 'grave'; id: string; x: number; y: number; ownerId: number | null }
export interface EntityIndexMap {
    entities: EntityRef[];
    units: Map<string, number>;
    castles: Map<number, number>;
    graves: Map<string, number>;
    globalActorIdx: number;
}
export interface FactoredActions {
    // [A,5]：actor、tile、语义头、招募兵种（无则-1）、目标实体（无则-1）。
    pointers: Int32Array;
    sourceIndices: Int32Array;
    actorMask: Uint8Array;
    tilesByActor: Map<number, Int32Array>;
    rowsByActorTile: Map<string, Int32Array>;
}
export interface DualObservation {
    schema: typeof SCHEMA_ID;
    width: number;
    height: number;
    playerOrder: PlayerOrder;
    spatialTensor: Float32Array;
    entityTokens: Float32Array;
    relationalBias: Float32Array;
    entityIndexMap: EntityIndexMap;
    actions: FactoredActions;
}
export interface OutcomeTarget { target: Float32Array; valueMask: boolean }
export type Encoder = (state: GameState, legalActions: readonly Action[]) => DualObservation;
