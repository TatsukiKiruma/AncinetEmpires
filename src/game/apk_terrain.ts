import { TerrainId } from './terrain';

export interface ApkTerrainConfig {
    id: number;
    kind: number;
    flagA: number;
    variant: number;
    linkedA: number;
    defenseBonus: number;
    healPerTurn: number;
    moveCost: number;
    flagB: number;
    linkedB: number;
    linkedC: number;
    flagC: number;
    tail: string;
}

export const APK_TERRAIN_RECORD_SIZE = 40;
export const APK_TERRAIN_COUNT = 84;

// 来自 aer-release-4.2.5.1 的 data.bin。字段名中 flag/linked 的业务语义仍需反编译校准，
// 但 defenseBonus/healPerTurn/moveCost 已可稳定用于规则对齐。
export const APK_TERRAIN_CONFIGS = [
    { id: 0, kind: 0, flagA: 0, variant: -1, linkedA: 0, defenseBonus: 0, healPerTurn: 3, moveCost: 16777215, flagB: 255, linkedB: -1, linkedC: 0, flagC: 0, tail: '0x00000001' },
    { id: 1, kind: 0, flagA: 0, variant: -1, linkedA: 0, defenseBonus: 0, healPerTurn: 3, moveCost: 16777215, flagB: 255, linkedB: -1, linkedC: 0, flagC: 1, tail: '0x00000002' },
    { id: 2, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 3, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 4, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 5, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 6, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 7, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 8, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 9, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 10, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 11, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 12, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 13, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 14, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 15, kind: 1, flagA: 1, variant: 2, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 2, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 16, kind: 2, flagA: 1, variant: 2, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 2, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 17, kind: 2, flagA: 1, variant: 1, linkedA: -1, defenseBonus: 15, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 18, kind: 3, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 5, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 19, kind: 0, flagA: 1, variant: 1, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 2, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 20, kind: 3, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 21, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 22, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 23, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 24, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 25, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 26, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 27, kind: 4, flagA: 1, variant: 4, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: 36, flagC: 0, tail: '0x00000000' },
    { id: 28, kind: 6, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 29, kind: 5, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 30, kind: 5, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 10, healPerTurn: 20, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 31, kind: 8, flagA: 1, variant: 5, linkedA: -1, defenseBonus: 10, healPerTurn: 20, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 32, kind: 8, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 5, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 33, kind: 8, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 20, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 34, kind: 8, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 5, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 35, kind: 8, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 36, kind: 8, flagA: 1, variant: 4, linkedA: -1, defenseBonus: 15, healPerTurn: 20, moveCost: 1, flagB: 1, linkedB: 27, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 37, kind: 6, flagA: 1, variant: 3, linkedA: 0, defenseBonus: 15, healPerTurn: 20, moveCost: 1, flagB: 1, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 38, kind: 7, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 39, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 40, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 41, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 42, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 43, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 44, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 45, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 46, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 47, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 48, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 49, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 50, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 51, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 52, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 53, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 54, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 55, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 56, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 57, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 58, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 59, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 60, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 61, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 62, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 63, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 64, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 65, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 66, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 67, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 68, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 69, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 70, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 71, kind: 1, flagA: 0, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 72, kind: 1, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 73, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 74, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 75, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 76, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 77, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 78, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 79, kind: 4, flagA: 1, variant: 0, linkedA: -1, defenseBonus: 0, healPerTurn: 0, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 80, kind: 4, flagA: 1, variant: 5, linkedA: -1, defenseBonus: 10, healPerTurn: 20, moveCost: 1, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 81, kind: 8, flagA: 0, variant: 1, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 82, kind: 3, flagA: 0, variant: 1, linkedA: -1, defenseBonus: 10, healPerTurn: 0, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
    { id: 83, kind: 3, flagA: 0, variant: 5, linkedA: -1, defenseBonus: 10, healPerTurn: 20, moveCost: 3, flagB: 0, linkedB: -1, linkedC: -1, flagC: 0, tail: '0x00000000' },
] as const satisfies readonly ApkTerrainConfig[];

const APK_TERRAIN_BY_ID = new Map<number, ApkTerrainConfig>(
    APK_TERRAIN_CONFIGS.map(config => [config.id, config])
);

export const HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT = {
    27: 8,
    36: 9,
    37: 10,
    72: 17
} satisfies Partial<Record<number, TerrainId>>;

// 用于把 APK 内置 skirmish 地图导入训练环境的规则近似映射。
// 高可信建筑仍保留在 HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT；这里额外按
// data.bin 的防御/移动/回血数值、atlas 外观和 skirmish 地图上下文归并贴图变体。
export const SKIRMISH_APK_TERRAIN_TO_PROJECT = {
    // 水面与海岸变体。APK 有大量水边自动拼接 tile，项目规则层统一按深水处理。
    0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2,
    38: 2, 39: 2, 40: 2, 41: 2, 42: 2, 43: 2, 44: 2, 45: 2, 46: 2, 47: 2, 48: 2, 49: 2, 50: 2, 51: 2,
    52: 2, 53: 2, 54: 2, 55: 2, 56: 2, 57: 2, 58: 2, 59: 2, 60: 2, 61: 2, 62: 2, 63: 2, 64: 2, 65: 2,
    66: 2, 67: 2, 68: 2, 69: 2, 70: 2, 71: 2,

    // 常规陆地。
    15: 7,
    16: 7,
    17: 3,
    18: 1,
    19: 4,
    20: 6,
    21: 6, 22: 6, 23: 6, 24: 6, 25: 6, 26: 6,
    32: 1,
    34: 1,
    35: 15,
    73: 6, 74: 6, 75: 6, 76: 6, 77: 6, 78: 6, 79: 6,

    // 桥和木桥变体。APK 文案明确桥也按水面地形处理。
    28: 17,
    29: 17,
    72: 17,

    // 非收入治疗建筑。具体是营地还是神庙仍需反编译/实测；训练规则先保留回血能力。
    30: 11,
    31: 12,
    33: 14,
    80: 11,
    81: 16,
    82: 16,
    83: 16,

    ...HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT,
} satisfies Partial<Record<number, TerrainId>>;

export function getApkTerrainConfig(apkTerrainId: number): ApkTerrainConfig | null {
    return APK_TERRAIN_BY_ID.get(apkTerrainId) ?? null;
}

export function mapKnownApkTerrainId(apkTerrainId: number): TerrainId | null {
    return HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT[apkTerrainId] ?? null;
}

export function mapSkirmishApkTerrainId(apkTerrainId: number): TerrainId | null {
    return SKIRMISH_APK_TERRAIN_TO_PROJECT[apkTerrainId] ?? null;
}

export function getKnownApkTerrainIdsForProject(terrainId: TerrainId): number[] {
    return Object.entries(HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT)
        .filter(([, projectTerrainId]) => projectTerrainId === terrainId)
        .map(([apkTerrainId]) => Number(apkTerrainId))
        .sort((a, b) => a - b);
}

export function getSkirmishApkTerrainIdsForProject(terrainId: TerrainId): number[] {
    return Object.entries(SKIRMISH_APK_TERRAIN_TO_PROJECT)
        .filter(([, projectTerrainId]) => projectTerrainId === terrainId)
        .map(([apkTerrainId]) => Number(apkTerrainId))
        .sort((a, b) => a - b);
}
