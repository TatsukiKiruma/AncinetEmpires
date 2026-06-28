export type TerrainId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

export interface Tile {
    terrainId: TerrainId;
    ownerId: number | null; // 归属玩家ID，null表示中立
    apkTerrainId?: number;  // APK .aem 原始 tile ID，仅导入 APK 地图时存在
    apkTerrainRaw?: number; // APK .aem 原始 4 字节地形记录
    apkOwnerCode?: number;  // APK .aem 原始归属码，0..7 为队伍，0xfe/0xff 为中立
}

export const TERRAIN_CONFIG: Record<TerrainId, { key: string; name: string; defenseBonus: number; moveCost: number; healPerTurn: number; incomePerTurn: number; tags: string[] }> = {
  1:  { key: "snow",          name: "雪地",       defenseBonus: 5,  moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land"] },
  2:  { key: "deep_water",    name: "水里/深水",  defenseBonus: 0,  moveCost: 3, healPerTurn: 0,  incomePerTurn: 0,   tags: ["water"] },
  3:  { key: "mountain",      name: "山脉",       defenseBonus: 15, moveCost: 3, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "mountain"] },
  4:  { key: "hill",          name: "丘陵",       defenseBonus: 10, moveCost: 2, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "hill", "mountain"] },
  5:  { key: "island",        name: "孤岛",       defenseBonus: 10, moveCost: 3, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "water", "special"] },
  6:  { key: "road",          name: "道路",       defenseBonus: 0,  moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "road"] },
  7:  { key: "forest",        name: "森林",       defenseBonus: 10, moveCost: 2, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "forest"] },
  8:  { key: "damaged_town",  name: "损坏的城镇", defenseBonus: 10, moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["land", "building", "town", "damaged", "repairable"] },
  9:  { key: "town",          name: "城镇",       defenseBonus: 15, moveCost: 1, healPerTurn: 20, incomePerTurn: 50,  tags: ["land", "building", "town", "capturable", "income", "destructible"] },
  10: { key: "castle",        name: "城堡",       defenseBonus: 15, moveCost: 1, healPerTurn: 20, incomePerTurn: 100, tags: ["land", "building", "castle", "capturable", "income", "recruit_source"] },
  11: { key: "camp",          name: "野外营地",   defenseBonus: 10, moveCost: 1, healPerTurn: 20, incomePerTurn: 0,   tags: ["land", "building", "camp", "healing", "not_capturable", "not_recruit_source"] },
  12: { key: "temple",        name: "神庙",       defenseBonus: 10, moveCost: 1, healPerTurn: 20, incomePerTurn: 0,   tags: ["land", "building", "temple", "healing", "cleanse"] },
  13: { key: "special_1",     name: "特殊地形1",  defenseBonus: 5,  moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["special"] },
  14: { key: "special_2",     name: "特殊地形2",  defenseBonus: 20, moveCost: 3, healPerTurn: 0,  incomePerTurn: 0,   tags: ["special"] },
  15: { key: "special_3",     name: "特殊地形3",  defenseBonus: 10, moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["special"] },
  16: { key: "water_temple",  name: "水中神庙",   defenseBonus: 10, moveCost: 3, healPerTurn: 20, incomePerTurn: 0,   tags: ["water", "building", "temple", "healing", "cleanse"] },
  17: { key: "bridge",        name: "桥",         defenseBonus: 0,  moveCost: 1, healPerTurn: 0,  incomePerTurn: 0,   tags: ["water", "bridge", "road"] },
};
