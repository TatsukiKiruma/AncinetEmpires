// tactical_exit_20261019/guard_regressions.ts
import assert2 from "node:assert/strict";

// ../src/game/terrain.ts
var TERRAIN_CONFIG = {
  1: { key: "snow", name: "\u96EA\u5730", defenseBonus: 5, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["land"] },
  2: { key: "deep_water", name: "\u6C34\u91CC/\u6DF1\u6C34", defenseBonus: 0, moveCost: 3, healPerTurn: 0, incomePerTurn: 0, tags: ["water"] },
  3: { key: "mountain", name: "\u5C71\u8109", defenseBonus: 15, moveCost: 3, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "mountain"] },
  4: { key: "hill", name: "\u4E18\u9675", defenseBonus: 10, moveCost: 2, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "hill", "mountain"] },
  5: { key: "island", name: "\u5B64\u5C9B", defenseBonus: 10, moveCost: 3, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "water", "special"] },
  6: { key: "road", name: "\u9053\u8DEF", defenseBonus: 0, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "road"] },
  7: { key: "forest", name: "\u68EE\u6797", defenseBonus: 10, moveCost: 2, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "forest"] },
  8: { key: "damaged_town", name: "\u635F\u574F\u7684\u57CE\u9547", defenseBonus: 10, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["land", "building", "town", "damaged", "repairable"] },
  9: { key: "town", name: "\u57CE\u9547", defenseBonus: 15, moveCost: 1, healPerTurn: 20, incomePerTurn: 50, tags: ["land", "building", "town", "capturable", "income", "destructible"] },
  10: { key: "castle", name: "\u57CE\u5821", defenseBonus: 15, moveCost: 1, healPerTurn: 20, incomePerTurn: 100, tags: ["land", "building", "castle", "capturable", "income", "recruit_source"] },
  11: { key: "camp", name: "\u91CE\u5916\u8425\u5730", defenseBonus: 10, moveCost: 1, healPerTurn: 20, incomePerTurn: 0, tags: ["land", "building", "camp", "healing", "not_capturable", "not_recruit_source"] },
  12: { key: "temple", name: "\u795E\u5E99", defenseBonus: 10, moveCost: 1, healPerTurn: 20, incomePerTurn: 0, tags: ["land", "building", "temple", "healing", "cleanse"] },
  13: { key: "special_1", name: "\u7279\u6B8A\u5730\u5F621", defenseBonus: 5, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["special"] },
  14: { key: "special_2", name: "\u7279\u6B8A\u5730\u5F622", defenseBonus: 20, moveCost: 3, healPerTurn: 0, incomePerTurn: 0, tags: ["special"] },
  15: { key: "special_3", name: "\u7279\u6B8A\u5730\u5F623", defenseBonus: 10, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["special"] },
  16: { key: "water_temple", name: "\u6C34\u4E2D\u795E\u5E99", defenseBonus: 10, moveCost: 3, healPerTurn: 20, incomePerTurn: 0, tags: ["water", "building", "temple", "healing", "cleanse"] },
  17: { key: "bridge", name: "\u6865", defenseBonus: 0, moveCost: 1, healPerTurn: 0, incomePerTurn: 0, tags: ["water", "bridge", "road"] }
};

// ../src/game/units.ts
var UNIT_CONFIGS = {
  soldier: { key: "soldier", name: "\u58EB\u5175", cost: 150, attack: 55, attackType: "physical", physicalDefense: 5, magicDefense: 5, minRange: 1, maxRange: 1, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 1, abilities: ["village_capturer", "repairer"], upgrade: "" },
  ghost: { key: "ghost", name: "\u5E7D\u7075", cost: 200, attack: 50, attackType: "magic", physicalDefense: 5, magicDefense: 15, minRange: 1, maxRange: 1, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 1, population: 1, abilities: ["flying", "undead", "death_reaper"], upgrade: "" },
  mermaid: { key: "mermaid", name: "\u4EBA\u9C7C", cost: 200, attack: 40, attackType: "physical", physicalDefense: 0, magicDefense: 0, minRange: 1, maxRange: 2, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 1, abilities: ["village_capturer", "repairer", "water_child"], upgrade: "" },
  archer: { key: "archer", name: "\u5F13\u7BAD\u624B", cost: 250, attack: 45, attackType: "physical", physicalDefense: 5, magicDefense: 5, minRange: 2, maxRange: 3, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 1, abilities: ["sharpshooter"], upgrade: "" },
  slime: { key: "slime", name: "\u53F2\u83B1\u59C6", cost: 250, attack: 50, attackType: "magic", physicalDefense: 40, magicDefense: -10, minRange: 1, maxRange: 1, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 5, moveGrowth: 0, population: 1, abilities: ["self_repair"], upgrade: "" },
  water_elemental: { key: "water_elemental", name: "\u6C34\u5143\u7D20", cost: 300, attack: 60, attackType: "physical", physicalDefense: 15, magicDefense: 15, minRange: 1, maxRange: 1, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 1, abilities: ["water_child"], upgrade: "" },
  dark_mage: { key: "dark_mage", name: "\u9ED1\u9B54\u6CD5\u5E08", cost: 300, attack: 50, attackType: "magic", physicalDefense: 0, magicDefense: 20, minRange: 1, maxRange: 2, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 1, abilities: ["blinder"], upgrade: "" },
  witch: { key: "witch", name: "\u5973\u5DEB", cost: 400, attack: 45, attackType: "magic", physicalDefense: 0, magicDefense: 40, minRange: 1, maxRange: 2, move: 4, attackGrowth: 5, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 2, abilities: ["summoner"], upgrade: "" },
  paladin: { key: "paladin", name: "\u5723\u9A91\u58EB", cost: 400, attack: 50, attackType: "physical", physicalDefense: 10, magicDefense: 10, minRange: 1, maxRange: 1, move: 4, attackGrowth: 5, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 2, abilities: ["village_capturer", "healer"], upgrade: "" },
  elf: { key: "elf", name: "\u7CBE\u7075", cost: 500, attack: 55, attackType: "magic", physicalDefense: 20, magicDefense: 30, minRange: 1, maxRange: 2, move: 4, attackGrowth: 5, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 2, abilities: ["flying", "forest_child", "cleansing_aura"], upgrade: "" },
  berserker: { key: "berserker", name: "\u72C2\u6218\u58EB", cost: 500, attack: 70, attackType: "physical", physicalDefense: 20, magicDefense: 10, minRange: 1, maxRange: 1, move: 5, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 2, abilities: ["fighting_spirit", "counter_storm", "earth_child"], upgrade: "" },
  wolf: { key: "wolf", name: "\u72FC", cost: 600, attack: 75, attackType: "physical", physicalDefense: 20, magicDefense: 10, minRange: 1, maxRange: 1, move: 6, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 3, abilities: ["poisoner", "assault_troop", "earth_child"], upgrade: "" },
  golem: { key: "golem", name: "\u77F3\u5934\u4EBA", cost: 600, attack: 55, attackType: "physical", physicalDefense: 30, magicDefense: 10, minRange: 1, maxRange: 1, move: 5, attackGrowth: 5, defenseGrowth: 5, maxHpGrowth: 25, moveGrowth: 0, population: 3, abilities: ["ranged_defense", "mountain_child", "weakness_aura"], upgrade: "" },
  ice_elemental: { key: "ice_elemental", name: "\u51B0\u5143\u7D20", cost: 600, attack: 55, attackType: "magic", physicalDefense: 10, magicDefense: 20, minRange: 1, maxRange: 3, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 10, moveGrowth: 0, population: 3, abilities: ["water_child", "self_repair"], upgrade: "" },
  druid: { key: "druid", name: "\u5FB7\u9C81\u4F0A", cost: 600, attack: 40, attackType: "magic", physicalDefense: 0, magicDefense: 30, minRange: 1, maxRange: 2, move: 4, attackGrowth: 5, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 1, population: 3, abilities: ["attack_aura", "earth_child", "supporter"], upgrade: "" },
  catapult: { key: "catapult", name: "\u6295\u77F3\u8F66", cost: 800, attack: 60, attackType: "physical", physicalDefense: 5, magicDefense: 5, minRange: 3, maxRange: 5, move: 3, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 4, abilities: ["destroyer"], upgrade: "" },
  wolf_archer: { key: "wolf_archer", name: "\u72FC\u5C04\u624B", cost: 800, attack: 60, attackType: "physical", physicalDefense: 20, magicDefense: 10, minRange: 1, maxRange: 3, move: 6, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 4, abilities: ["sharpshooter", "forest_child", "assault_troop", "blinder"], upgrade: "" },
  dragon: { key: "dragon", name: "\u9F99", cost: 1e3, attack: 70, attackType: "magic", physicalDefense: 25, magicDefense: 25, minRange: 1, maxRange: 2, move: 6, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 5, abilities: ["flying", "melee_master", "ranged_defense", "assault_troop"], upgrade: "" },
  commander: { key: "commander", name: "\u6307\u6325\u5B98", cost: null, attack: 60, attackType: "physical", physicalDefense: 20, magicDefense: 20, minRange: 1, maxRange: 1, move: 4, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 1, population: 0, abilities: ["castle_capturer", "village_capturer", "repairer"], upgrade: "" },
  skeleton: { key: "skeleton", name: "\u9AB7\u9AC5", cost: null, attack: 40, attackType: "physical", physicalDefense: 5, magicDefense: 5, minRange: 1, maxRange: 1, move: 3, attackGrowth: 10, defenseGrowth: 5, maxHpGrowth: 0, moveGrowth: 0, population: 0, abilities: ["poisoner", "undead"], upgrade: "" },
  crystal: { key: "crystal", name: "\u6C34\u6676", cost: null, attack: 0, attackType: "magic", physicalDefense: 0, magicDefense: 0, minRange: 0, maxRange: 0, move: 0, attackGrowth: 0, defenseGrowth: 0, maxHpGrowth: 0, moveGrowth: 0, population: 0, abilities: [], upgrade: "" }
};

// ../src/game/apk_terrain.ts
var APK_TERRAIN_CONFIGS = [
  {
    "id": 0,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 1,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [
      2
    ],
    "graphicsType": 1
  },
  {
    "id": 2,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 3,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 4,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 5,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 6,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 7,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 8,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 9,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 10,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 11,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 12,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 13,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 14,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 15,
    "kind": 2,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 2,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 2,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000002",
    "variants": [],
    "graphicsType": 2
  },
  {
    "id": 16,
    "kind": 2,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 2,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 2,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000002",
    "variants": [],
    "graphicsType": 2
  },
  {
    "id": 17,
    "kind": 1,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 1,
    "linkedA": -1,
    "defenseBonus": 15,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000003",
    "variants": [],
    "graphicsType": 3
  },
  {
    "id": 18,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 5,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000000",
    "variants": [],
    "graphicsType": 0
  },
  {
    "id": 19,
    "kind": 1,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 1,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 2,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000003",
    "variants": [],
    "graphicsType": 3
  },
  {
    "id": 20,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 21,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 22,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 23,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 24,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 25,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 26,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 27,
    "kind": 4,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 4,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": 36,
    "flagC": 0,
    "tail": "0x00000006",
    "variants": [],
    "graphicsType": 6
  },
  {
    "id": 28,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000005",
    "variants": [],
    "graphicsType": 5
  },
  {
    "id": 29,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000005",
    "variants": [],
    "graphicsType": 5
  },
  {
    "id": 30,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 20,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 31,
    "kind": 5,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 5,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 20,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 32,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 5,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 33,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 20,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 34,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 5,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 35,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 36,
    "kind": 4,
    "isLand": true,
    "capturable": true,
    "flagA": 1,
    "variant": 4,
    "linkedA": -1,
    "defenseBonus": 15,
    "healPerTurn": 20,
    "moveCost": 1,
    "flagB": 1,
    "linkedB": 27,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000006",
    "variants": [],
    "graphicsType": 6
  },
  {
    "id": 37,
    "kind": 3,
    "isLand": true,
    "capturable": true,
    "flagA": 1,
    "variant": 3,
    "linkedA": 0,
    "defenseBonus": 15,
    "healPerTurn": 20,
    "moveCost": 1,
    "flagB": 1,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000007",
    "variants": [],
    "graphicsType": 7
  },
  {
    "id": 38,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 39,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 40,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 41,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 42,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 43,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 44,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 45,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 46,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 47,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 48,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 49,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 50,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 51,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 52,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 53,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 54,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 55,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 56,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 57,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 58,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 59,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 60,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 61,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 62,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 63,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 64,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 65,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 66,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 67,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 68,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 69,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 70,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 71,
    "kind": 0,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000001",
    "variants": [],
    "graphicsType": 1
  },
  {
    "id": 72,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 73,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 74,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 75,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 76,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 77,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 78,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 79,
    "kind": 0,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 0,
    "linkedA": -1,
    "defenseBonus": 0,
    "healPerTurn": 0,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000004",
    "variants": [],
    "graphicsType": 4
  },
  {
    "id": 80,
    "kind": 5,
    "isLand": true,
    "capturable": false,
    "flagA": 1,
    "variant": 5,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 20,
    "moveCost": 1,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  },
  {
    "id": 81,
    "kind": 1,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 1,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000003",
    "variants": [],
    "graphicsType": 3
  },
  {
    "id": 82,
    "kind": 1,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 1,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 0,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000003",
    "variants": [],
    "graphicsType": 3
  },
  {
    "id": 83,
    "kind": 5,
    "isLand": false,
    "capturable": false,
    "flagA": 0,
    "variant": 5,
    "linkedA": -1,
    "defenseBonus": 10,
    "healPerTurn": 20,
    "moveCost": 3,
    "flagB": 0,
    "linkedB": -1,
    "linkedC": -1,
    "flagC": 0,
    "tail": "0x00000008",
    "variants": [],
    "graphicsType": 8
  }
];
var APK_TERRAIN_BY_ID = new Map(
  APK_TERRAIN_CONFIGS.map((config) => [config.id, config])
);
var HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT = {
  27: 8,
  36: 9,
  37: 10,
  72: 17
};
var SKIRMISH_APK_TERRAIN_TO_PROJECT = {
  // 水面与海岸变体。APK 有大量水边自动拼接 tile，项目规则层统一按深水处理。
  0: 2,
  1: 2,
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
  8: 2,
  9: 2,
  10: 2,
  11: 2,
  12: 2,
  13: 2,
  14: 2,
  38: 2,
  39: 2,
  40: 2,
  41: 2,
  42: 2,
  43: 2,
  44: 2,
  45: 2,
  46: 2,
  47: 2,
  48: 2,
  49: 2,
  50: 2,
  51: 2,
  52: 2,
  53: 2,
  54: 2,
  55: 2,
  56: 2,
  57: 2,
  58: 2,
  59: 2,
  60: 2,
  61: 2,
  62: 2,
  63: 2,
  64: 2,
  65: 2,
  66: 2,
  67: 2,
  68: 2,
  69: 2,
  70: 2,
  71: 2,
  // 常规陆地。
  15: 7,
  16: 7,
  17: 3,
  18: 1,
  19: 4,
  20: 6,
  21: 6,
  22: 6,
  23: 6,
  24: 6,
  25: 6,
  26: 6,
  32: 1,
  34: 1,
  35: 15,
  73: 6,
  74: 6,
  75: 6,
  76: 6,
  77: 6,
  78: 6,
  79: 6,
  // 桥和木桥变体。APK 文案明确桥也按水面地形处理。
  28: 17,
  29: 17,
  72: 17,
  // 非收入治疗建筑。t30/t31 已实测；t80 按 OPENCODE 反编译确认的特殊村庄/神庙混合语义处理。
  30: 11,
  31: 12,
  33: 14,
  80: 12,
  // 水域特殊 tile。OPENCODE 确认为水面障碍，不能套用神庙净化语义。
  81: 2,
  82: 2,
  // t83 是水中治疗平台，有 healPerTurn=20，不提供神庙净化。
  83: 16,
  ...HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT
};
function getApkTerrainConfig(apkTerrainId) {
  return APK_TERRAIN_BY_ID.get(apkTerrainId) ?? null;
}
function mapSkirmishApkTerrainId(apkTerrainId) {
  return SKIRMISH_APK_TERRAIN_TO_PROJECT[apkTerrainId] ?? null;
}

// ../src/game/terrain_rules.ts
function rewriteApkTerrainRaw(tile2) {
  if (tile2.apkTerrainId === void 0) return;
  const ownerCode = tile2.apkOwnerCode ?? (tile2.ownerId ?? 255);
  tile2.apkTerrainRaw = tile2.apkTerrainId << 12 | ownerCode;
}
function syncApkTerrainDefinition(tile2) {
  if (tile2.apkTerrainId === void 0) return;
  const config = getApkTerrainConfig(tile2.apkTerrainId);
  if (config) {
    tile2.apkTerrainKind = config.kind;
    tile2.apkTerrainIsLand = config.isLand ?? config.flagA !== 0;
    tile2.apkMoveCost = config.moveCost;
  }
}
function getLinkedApkTerrainIdForProjectTerrain(apkTerrainId, terrainId) {
  const config = getApkTerrainConfig(apkTerrainId);
  if (!config) return null;
  const candidates = [config.linkedB, config.linkedC, config.linkedA];
  for (const candidate of candidates) {
    if (candidate < 0) continue;
    if (mapSkirmishApkTerrainId(candidate) === terrainId) {
      return candidate;
    }
  }
  return null;
}
function getTileTerrainIdForRules(tile2) {
  if (tile2.apkTerrainId !== void 0) {
    return mapSkirmishApkTerrainId(tile2.apkTerrainId) ?? tile2.terrainId;
  }
  return tile2.terrainId;
}
function getTileTerrainConfig(tile2) {
  return TERRAIN_CONFIG[getTileTerrainIdForRules(tile2)];
}
function getTileTerrainKey(tile2) {
  return getTileTerrainConfig(tile2).key;
}
function tileHasTerrainTag(tile2, tag) {
  return getTileTerrainConfig(tile2).tags.includes(tag);
}
function tileClearsNegativeStatusAtTurnStart(tile2) {
  if (tile2.apkTerrainId !== void 0) {
    return (tile2.apkTerrainKind ?? getApkTerrainConfig(tile2.apkTerrainId)?.kind) === 5;
  }
  return tileHasTerrainTag(tile2, "cleanse");
}
function setTileTerrainForRules(tile2, terrainId) {
  tile2.terrainId = terrainId;
  if (tile2.apkTerrainId === void 0) return;
  if (mapSkirmishApkTerrainId(tile2.apkTerrainId) === terrainId) {
    rewriteApkTerrainRaw(tile2);
    return;
  }
  const linkedApkTerrainId = getLinkedApkTerrainIdForProjectTerrain(tile2.apkTerrainId, terrainId);
  if (linkedApkTerrainId !== null) {
    tile2.apkTerrainId = linkedApkTerrainId;
    syncApkTerrainDefinition(tile2);
    rewriteApkTerrainRaw(tile2);
    return;
  }
  delete tile2.apkTerrainId;
  delete tile2.apkTerrainRaw;
  delete tile2.apkOwnerCode;
  delete tile2.apkTerrainKind;
  delete tile2.apkTerrainIsLand;
  delete tile2.apkMoveCost;
}
function setTileOwnerForRules(tile2, ownerId) {
  tile2.ownerId = ownerId;
  if (tile2.apkTerrainId === void 0) return;
  tile2.apkOwnerCode = ownerId ?? 255;
  rewriteApkTerrainRaw(tile2);
}
function setTileOwnerAfterRepairForRules(tile2) {
  tile2.ownerId = null;
  if (tile2.apkTerrainId === void 0) return;
  tile2.apkOwnerCode = getApkTerrainConfig(tile2.apkTerrainId)?.flagB !== 0 ? 254 : 255;
  rewriteApkTerrainRaw(tile2);
}
function isTileDestroyableForRules(tile2) {
  if (tile2.apkTerrainId !== void 0) {
    return (getApkTerrainConfig(tile2.apkTerrainId)?.linkedB ?? -1) >= 0;
  }
  return getTileTerrainKey(tile2) === "town";
}
function destroyTileForRules(tile2) {
  if (tile2.apkTerrainId !== void 0) {
    const destroyedApkTerrainId = getApkTerrainConfig(tile2.apkTerrainId)?.linkedB ?? -1;
    if (destroyedApkTerrainId >= 0) {
      tile2.apkTerrainId = destroyedApkTerrainId;
      syncApkTerrainDefinition(tile2);
      tile2.terrainId = mapSkirmishApkTerrainId(destroyedApkTerrainId) ?? tile2.terrainId;
      tile2.ownerId = null;
      tile2.apkOwnerCode = 255;
      rewriteApkTerrainRaw(tile2);
      return;
    }
  }
  setTileTerrainForRules(tile2, 8);
  setTileOwnerForRules(tile2, null);
}
function getApkTerrainValue(tile2, field) {
  if (tile2.apkTerrainId === void 0) return null;
  return getApkTerrainConfig(tile2.apkTerrainId)?.[field] ?? null;
}
function getTileDefenseBonus(tile2) {
  return getApkTerrainValue(tile2, "defenseBonus") ?? getTileTerrainConfig(tile2)?.defenseBonus ?? 0;
}
function getTileHealPerTurn(tile2) {
  return getApkTerrainValue(tile2, "healPerTurn") ?? getTileTerrainConfig(tile2)?.healPerTurn ?? 0;
}
function tileHealingRequiresFriendlyOwner(tile2) {
  if (tile2.apkTerrainId !== void 0) {
    return getApkTerrainConfig(tile2.apkTerrainId)?.flagB !== 0;
  }
  return getTileTerrainConfig(tile2).tags.includes("capturable");
}
function getTileMoveCost(tile2) {
  return getApkTerrainValue(tile2, "moveCost") ?? getTileTerrainConfig(tile2)?.moveCost ?? 1;
}

// ../src/game/rule_config.ts
var DEFAULT_RULE_CONFIG = {
  initialGold: void 0,
  incomeVillage: 50,
  incomeCastle: 100,
  incomeCommanderBase: 50,
  incomeCommanderGrowth: 25,
  levelCap: 3,
  destroyerAttackBonus: 10,
  flyingWaterAttackBonus: 10,
  deathReaperAttackBonus: 20,
  inspiredAttackBonus: 10,
  sharpshooterAttackBonus: 10,
  terrainChildCombatBonus: 10,
  weakenedDefensePenalty: 10,
  unitLimit: void 0,
  populationLimit: void 0,
  recruitableUnits: void 0,
  prices: {},
  commanderRecruitBaseCost: null,
  commanderRecruitCostGrowth: 100,
  allowSurrender: false,
  allowPendingRecruitEndTurn: false,
  allowPendingRecruitSurrender: false,
  commanderCastleRecruitUsesPending: false,
  defeatOnNoUnitsAndNoCastles: true,
  defeatOnNoUnits: false,
  defeatOnCommanderDeath: false,
  defeatOnNoCastles: false,
  alliances: {},
  disabledTeams: [],
  commanderUnitIds: {},
  campaignEvents: [],
  teams: {}
};
function getNumericRule(state, key) {
  return state.rules && Object.prototype.propertyIsEnumerable.call(state.rules, key) ? state.rules[key] : DEFAULT_RULE_CONFIG[key];
}
function getRuleConfig(state) {
  const rules = state.rules ?? {};
  return {
    ...DEFAULT_RULE_CONFIG,
    ...rules,
    prices: {
      ...DEFAULT_RULE_CONFIG.prices,
      ...rules.prices ?? {}
    },
    alliances: {
      ...DEFAULT_RULE_CONFIG.alliances,
      ...rules.alliances ?? {}
    },
    disabledTeams: [...rules.disabledTeams ?? DEFAULT_RULE_CONFIG.disabledTeams],
    commanderUnitIds: {
      ...DEFAULT_RULE_CONFIG.commanderUnitIds,
      ...rules.commanderUnitIds ?? {}
    },
    campaignEvents: rules.campaignEvents ? JSON.parse(JSON.stringify(rules.campaignEvents)) : [...DEFAULT_RULE_CONFIG.campaignEvents],
    teams: {
      ...DEFAULT_RULE_CONFIG.teams,
      ...rules.teams ?? {}
    }
  };
}
function getTeamRuleConfig(state, playerId) {
  return state.rules?.teams?.[playerId] ?? DEFAULT_RULE_CONFIG.teams[playerId] ?? {};
}
function getAllianceId(state, playerId) {
  return state.rules?.alliances?.[playerId] ?? DEFAULT_RULE_CONFIG.alliances[playerId] ?? playerId;
}
function areAlliedPlayers(state, playerA, playerB) {
  return getAllianceId(state, playerA) === getAllianceId(state, playerB);
}
function areEnemyPlayers(state, playerA, playerB) {
  return !areAlliedPlayers(state, playerA, playerB);
}
function isTeamEnabled(state, playerId) {
  return !(state.rules?.disabledTeams ?? DEFAULT_RULE_CONFIG.disabledTeams).includes(playerId);
}
function isActivePlayer(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  return !!player?.isAlive && isTeamEnabled(state, playerId);
}
function getTurnPlayerIds(state) {
  return state.players.filter((player) => isActivePlayer(state, player.id)).map((player) => player.id).sort((a, b) => a - b);
}
function isCommanderUnit(state, unit2, teamId) {
  if (teamId !== void 0 && unit2.ownerId !== teamId) return false;
  const commanderUnitId = state.rules?.commanderUnitIds?.[unit2.ownerId] ?? DEFAULT_RULE_CONFIG.commanderUnitIds[unit2.ownerId];
  if (commanderUnitId !== void 0) {
    return unit2.id === commanderUnitId;
  }
  return unit2.unitClass === "commander";
}
function getCommanderUnit(state, playerId) {
  const commanderUnitId = state.rules?.commanderUnitIds?.[playerId] ?? DEFAULT_RULE_CONFIG.commanderUnitIds[playerId];
  if (commanderUnitId !== void 0) {
    return state.units.find((unit2) => unit2.id === commanderUnitId && unit2.ownerId === playerId && unit2.hp > 0) ?? null;
  }
  return state.units.find((unit2) => unit2.ownerId === playerId && unit2.unitClass === "commander" && unit2.hp > 0) ?? null;
}
function getUnitCost(state, playerId, unitClass) {
  const rules = getRuleConfig(state);
  const priceOverride = rules.prices[unitClass];
  if (unitClass === "commander") {
    if (priceOverride === null || priceOverride === void 0 && rules.commanderRecruitBaseCost === null) return null;
    const baseCost = priceOverride ?? rules.commanderRecruitBaseCost;
    const deathCount = state.players.find((p) => p.id === playerId)?.commanderDeathCount ?? 0;
    return baseCost + deathCount * rules.commanderRecruitCostGrowth;
  }
  if (priceOverride !== void 0) return priceOverride;
  return UNIT_CONFIGS[unitClass].cost;
}
function getRecruitableUnits(state, playerId) {
  const rules = getRuleConfig(state);
  const teamRules = getTeamRuleConfig(state, playerId);
  const configuredUnits = teamRules.recruitableUnits ?? rules.recruitableUnits ?? Object.keys(UNIT_CONFIGS);
  const units = getCommanderUnit(state, playerId) === null && getUnitCost(state, playerId, "commander") !== null ? ["commander", ...configuredUnits] : configuredUnits;
  return [...new Set(units)].filter((unitClass) => getUnitCost(state, playerId, unitClass) !== null);
}
function getCurrentUnitCount(state, playerId) {
  return state.units.filter((unit2) => unit2.ownerId === playerId).length;
}
function getCurrentPopulation(state, playerId) {
  return state.units.filter((unit2) => unit2.ownerId === playerId).reduce((sum, unit2) => sum + UNIT_CONFIGS[unit2.unitClass].population, 0);
}
function canRecruitUnitClass(state, playerId, unitClass) {
  const player = state.players.find((p) => p.id === playerId);
  const unitConfig = UNIT_CONFIGS[unitClass];
  const unitCost = getUnitCost(state, playerId, unitClass);
  if (!player || !unitConfig || unitCost === null) return false;
  if (!isActivePlayer(state, playerId)) return false;
  if (player.gold < unitCost) return false;
  if (unitClass === "commander") {
    const hasAliveCommander = getCommanderUnit(state, playerId) !== null;
    if (hasAliveCommander) return false;
  }
  const recruitableUnits = getRecruitableUnits(state, playerId);
  if (!recruitableUnits.includes(unitClass)) return false;
  const rules = getRuleConfig(state);
  const teamRules = getTeamRuleConfig(state, playerId);
  const unitLimit = teamRules.unitLimit ?? rules.unitLimit;
  if (unitLimit !== void 0 && getCurrentUnitCount(state, playerId) >= unitLimit) {
    return false;
  }
  const populationLimit = teamRules.populationLimit ?? rules.populationLimit;
  if (populationLimit !== void 0 && getCurrentPopulation(state, playerId) + unitConfig.population > populationLimit) {
    return false;
  }
  return true;
}
function getTileIncome(state, tile2) {
  const key = getTileTerrainKey(tile2);
  if (key === "town") return getNumericRule(state, "incomeVillage");
  if (key === "castle") return getNumericRule(state, "incomeCastle");
  return 0;
}

// ../src/game/abilities.ts
function hasAbility(unit2, ability) {
  const config = UNIT_CONFIGS[unit2.unitClass];
  return config?.abilities.includes(ability) || false;
}
function isFlying(unit2) {
  return hasAbility(unit2, "flying");
}
function isUndead(unit2) {
  return hasAbility(unit2, "undead");
}
function terrainHasTag(terrain, tag) {
  if (typeof terrain === "number") {
    return TERRAIN_CONFIG[terrain]?.tags.includes(tag) ?? false;
  }
  if (terrain.apkTerrainId !== void 0) {
    const apkConfig = getApkTerrainConfig(terrain.apkTerrainId);
    const apkIsLand = terrain.apkTerrainIsLand ?? (apkConfig ? apkConfig.flagA !== 0 : void 0);
    const apkKind = terrain.apkTerrainKind ?? apkConfig?.kind;
    if (tag === "water" && apkIsLand !== void 0) {
      return !apkIsLand;
    }
    if (tag === "land" && apkIsLand !== void 0) {
      return apkIsLand;
    }
    if (tag === "forest" && apkKind !== void 0) {
      return apkKind === 2;
    }
    if (tag === "mountain" && apkKind !== void 0) {
      return apkKind === 1;
    }
  }
  return tileHasTerrainTag(terrain, tag);
}
function isWaterTerrain(terrain) {
  return terrainHasTag(terrain, "water");
}
function isMountainTerrain(terrain) {
  return terrainHasTag(terrain, "mountain");
}
function isForestTerrain(terrain) {
  return terrainHasTag(terrain, "forest");
}
function isLandTerrain(terrain) {
  return terrainHasTag(terrain, "land");
}
function getMoveCostForUnit(state, unit2, tile2) {
  const baseMoveCost = tile2.apkMoveCost ?? getTileMoveCost(tile2);
  const kind = tile2.apkTerrainKind ?? (tile2.apkTerrainId === void 0 ? void 0 : getApkTerrainConfig(tile2.apkTerrainId)?.kind);
  const scripted = kind === void 0 ? void 0 : unit2.apkMoveOverrides?.[kind];
  if (scripted !== void 0 && scripted > 0) return scripted;
  if (isFlying(unit2) || hasAbility(unit2, "water_child") && isWaterTerrain(tile2) || hasAbility(unit2, "forest_child") && isForestTerrain(tile2) || hasAbility(unit2, "mountain_child") && isMountainTerrain(tile2) || hasAbility(unit2, "earth_child") && isLandTerrain(tile2)) return 1;
  if (hasAbility(unit2, "earth_child")) return baseMoveCost + 1;
  return baseMoveCost;
}
function getAttackBonus(state, attacker, defender) {
  let bonus = 0;
  const atkTile = state.map.tiles[attacker.pos.y][attacker.pos.x];
  if (hasAbility(attacker, "water_child") && isWaterTerrain(atkTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  if (hasAbility(attacker, "forest_child") && isForestTerrain(atkTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  if (hasAbility(attacker, "mountain_child") && isMountainTerrain(atkTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  return bonus;
}
function getDefenseBonus(state, attacker, defender) {
  let bonus = 0;
  const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
  if (hasAbility(defender, "water_child") && isWaterTerrain(defTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  if (hasAbility(defender, "forest_child") && isForestTerrain(defTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  if (hasAbility(defender, "mountain_child") && isMountainTerrain(defTile)) {
    bonus += getNumericRule(state, "terrainChildCombatBonus");
  }
  return bonus;
}
function getFinalDamageMultiplier(state, attacker, defender, distance) {
  let multiplier = 1;
  if (hasAbility(attacker, "melee_master") && !hasAbility(defender, "melee_master") && distance === 1) {
    multiplier *= 1.5;
  }
  if (hasAbility(defender, "ranged_defense") && distance > 1) {
    multiplier *= 0.5;
  }
  return multiplier;
}
function clearNegativeStatus(unit2) {
  if (unit2.status) {
    const type = unit2.status.type;
    if (type === "poisoned" || type === "blinded" || type === "weakened") {
      delete unit2.status;
    }
  }
}
function getEffectiveStats(unit2) {
  const base = UNIT_CONFIGS[unit2.unitClass];
  const level = unit2.level ?? 0;
  const attackBonus = base.attackGrowth * level;
  const defBonus = base.defenseGrowth * level;
  const maxHpBonus = base.maxHpGrowth * level;
  const moveBonus = base.moveGrowth * level;
  let pDef = base.physicalDefense + defBonus;
  let mDef = base.magicDefense + defBonus;
  let maxHp = (unit2.maxHp ?? 100) + maxHpBonus;
  let move = base.move + moveBonus;
  if (unit2.status && unit2.status.type === "weakened") {
    pDef -= 10;
    mDef -= 10;
    move = 1;
  }
  let minRange = base.minRange;
  let maxRange = base.maxRange;
  if (unit2.status && unit2.status.type === "blinded") {
    minRange = 0;
    maxRange = 0;
  }
  return {
    attack: base.attack + attackBonus,
    physicalDefense: pDef,
    magicDefense: mDef,
    maxHp,
    move,
    minRange,
    maxRange
  };
}
function getExpThresholdForLevel(level) {
  if (level <= 0) return 0;
  return (level + 1) * 100 * level / 2;
}
var ATTACK_EXP = 30;
var ASSIST_EXP = 10;
var KILL_EXP = 60;
var MAX_EXP = 99999;
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function addExp(unit2, amount, levelCap = 3) {
  if (unit2.level === void 0) unit2.level = 0;
  if (unit2.exp === void 0) unit2.exp = 0;
  if (unit2.level >= levelCap && amount > 0) return false;
  unit2.exp = clamp(unit2.exp + amount, 0, MAX_EXP);
  let upgraded = false;
  let levelsGained = 0;
  while (unit2.level < levelCap) {
    const nextLevel = unit2.level + 1;
    const threshold = getExpThresholdForLevel(nextLevel);
    if (unit2.exp >= threshold) {
      unit2.level = nextLevel;
      upgraded = true;
      levelsGained += 1;
    } else {
      break;
    }
  }
  if (levelsGained > 0) {
    const config = UNIT_CONFIGS[unit2.unitClass];
    const hpGain = config.maxHpGrowth * levelsGained;
    const moveGain = config.moveGrowth * levelsGained;
    if (hpGain !== 0) {
      unit2.hp = clamp(unit2.hp + hpGain, 1, 9999);
    }
    if (moveGain !== 0 && unit2.movementRemaining !== void 0) {
      unit2.movementRemaining = clamp(unit2.movementRemaining + moveGain, 0, 99);
    }
  }
  return upgraded;
}

// ../src/game/map.ts
function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function isWithinBounds(state, pos) {
  return pos.x >= 0 && pos.y >= 0 && pos.x < state.map.width && pos.y < state.map.height;
}
function getReachablePositions(state, unitId, customMaxMove) {
  const unit2 = state.units.find((u) => u.id === unitId);
  if (!unit2) return [];
  const stats = getEffectiveStats(unit2);
  let maxMove = customMaxMove !== void 0 ? customMaxMove : stats.move;
  if (unit2.status && unit2.status.type === "weakened") {
    maxMove = Math.min(maxMove, 1);
  }
  const reachable = /* @__PURE__ */ new Map();
  const queue = [];
  const startKey = `${unit2.pos.x},${unit2.pos.y}`;
  reachable.set(startKey, 0);
  queue.push({ pos: unit2.pos, cost: 0 });
  const unitsMap = /* @__PURE__ */ new Map();
  for (const u of state.units) {
    unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
  }
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    if (cur.cost > reachable.get(`${cur.pos.x},${cur.pos.y}`)) continue;
    for (const [dx, dy] of dirs) {
      const nx = cur.pos.x + dx;
      const ny = cur.pos.y + dy;
      const nPos = { x: nx, y: ny };
      const nKey = `${nx},${ny}`;
      if (!isWithinBounds(state, nPos)) continue;
      const occupyingUnit = unitsMap.get(nKey);
      if (occupyingUnit && areEnemyPlayers(state, unit2.ownerId, occupyingUnit.ownerId)) {
        if (isFlying(unit2) && !isFlying(occupyingUnit)) {
        } else {
          continue;
        }
      }
      const tile2 = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, unit2, tile2);
      const nextCost = cur.cost + terrainCost;
      if (nextCost <= maxMove) {
        const existingCost = reachable.get(nKey);
        if (existingCost === void 0 || nextCost < existingCost) {
          reachable.set(nKey, nextCost);
          queue.push({ pos: nPos, cost: nextCost });
        }
      }
    }
  }
  const validPositions = [];
  for (const key of reachable.keys()) {
    const [x, y] = key.split(",").map(Number);
    const pos = { x, y };
    if (x === unit2.pos.x && y === unit2.pos.y) {
      validPositions.push(pos);
      continue;
    }
    if (unitsMap.has(key)) {
      continue;
    }
    validPositions.push(pos);
  }
  return validPositions;
}
function getMovementCosts(state, unitId) {
  const unit2 = state.units.find((u) => u.id === unitId);
  if (!unit2) return /* @__PURE__ */ new Map();
  const stats = getEffectiveStats(unit2);
  let maxMove = stats.move;
  if (unit2.status && unit2.status.type === "weakened") {
    maxMove = 1;
  }
  const reachable = /* @__PURE__ */ new Map();
  const queue = [];
  const startKey = `${unit2.pos.x},${unit2.pos.y}`;
  reachable.set(startKey, 0);
  queue.push({ pos: unit2.pos, cost: 0 });
  const unitsMap = /* @__PURE__ */ new Map();
  for (const u of state.units) {
    unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
  }
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    if (cur.cost > reachable.get(`${cur.pos.x},${cur.pos.y}`)) continue;
    for (const [dx, dy] of dirs) {
      const nx = cur.pos.x + dx;
      const ny = cur.pos.y + dy;
      const nPos = { x: nx, y: ny };
      const nKey = `${nx},${ny}`;
      if (!isWithinBounds(state, nPos)) continue;
      const occupyingUnit = unitsMap.get(nKey);
      if (occupyingUnit && areEnemyPlayers(state, unit2.ownerId, occupyingUnit.ownerId)) {
        if (isFlying(unit2) && !isFlying(occupyingUnit)) {
        } else {
          continue;
        }
      }
      const tile2 = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, unit2, tile2);
      const nextCost = cur.cost + terrainCost;
      if (nextCost <= maxMove) {
        const existingCost = reachable.get(nKey);
        if (existingCost === void 0 || nextCost < existingCost) {
          reachable.set(nKey, nextCost);
          queue.push({ pos: nPos, cost: nextCost });
        }
      }
    }
  }
  return reachable;
}
function getRecruitDeployPositions(state, ownerId, unitClass, castlePos) {
  const stats = UNIT_CONFIGS[unitClass];
  let maxMove = stats.move;
  const virtualUnit = {
    id: "virtual_recruit",
    ownerId,
    unitClass,
    pos: { ...castlePos },
    hp: 100,
    maxHp: 100,
    hasMoved: false,
    hasActed: false
  };
  const reachable = /* @__PURE__ */ new Map();
  const queue = [];
  const startKey = `${castlePos.x},${castlePos.y}`;
  reachable.set(startKey, 0);
  queue.push({ pos: castlePos, cost: 0 });
  const unitsMap = /* @__PURE__ */ new Map();
  for (const u of state.units) {
    unitsMap.set(`${u.pos.x},${u.pos.y}`, u);
  }
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    if (cur.cost > reachable.get(`${cur.pos.x},${cur.pos.y}`)) continue;
    for (const [dx, dy] of dirs) {
      const nx = cur.pos.x + dx;
      const ny = cur.pos.y + dy;
      const nPos = { x: nx, y: ny };
      const nKey = `${nx},${ny}`;
      if (!isWithinBounds(state, nPos)) continue;
      const occupyingUnit = unitsMap.get(nKey);
      if (occupyingUnit && areEnemyPlayers(state, ownerId, occupyingUnit.ownerId)) {
        if (isFlying(virtualUnit) && !isFlying(occupyingUnit)) {
        } else {
          continue;
        }
      }
      const tile2 = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, virtualUnit, tile2);
      const nextCost = cur.cost + terrainCost;
      if (nextCost <= maxMove) {
        const existingCost = reachable.get(nKey);
        if (existingCost === void 0 || nextCost < existingCost) {
          reachable.set(nKey, nextCost);
          queue.push({ pos: nPos, cost: nextCost });
        }
      }
    }
  }
  const validPositions = [];
  for (const key of reachable.keys()) {
    const [x, y] = key.split(",").map(Number);
    if (x === castlePos.x && y === castlePos.y) {
      continue;
    }
    if (unitsMap.has(key)) {
      continue;
    }
    validPositions.push({ x, y });
  }
  return validPositions;
}

// ../src/game/rules.ts
function calculateDamage(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  return calculateDamageAtHp(state, attackerId, defenderId, attacker?.hp ?? 0);
}
function calculateDamageAtHp(state, attackerId, defenderId, extraAttackerHp, attackerOverride) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const defender = state.units.find((u) => u.id === defenderId);
  if (!attacker || !defender) return 0;
  const projectedAttacker = attackerOverride ? {
    ...attacker,
    level: attackerOverride.level ?? attacker.level,
    maxHp: attackerOverride.maxHp ?? attacker.maxHp
  } : attacker;
  const effAtk = getEffectiveStats(projectedAttacker);
  const effDef = getEffectiveStats(defender);
  const atkStats = UNIT_CONFIGS[attacker.unitClass];
  const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
  const defTerrain = getTileTerrainConfig(defTile);
  const dist = getDistance(attacker.pos, defender.pos);
  let extraAttack = 0;
  if (hasAbility(attacker, "sharpshooter") && hasAbility(defender, "flying")) {
    extraAttack += getNumericRule(state, "sharpshooterAttackBonus");
  }
  if (hasAbility(attacker, "destroyer") && defTerrain.key === "town") {
    extraAttack += getNumericRule(state, "destroyerAttackBonus");
  }
  if (hasAbility(attacker, "flying") && isWaterTerrain(defTile) && !hasAbility(defender, "flying")) {
    extraAttack += getNumericRule(state, "flyingWaterAttackBonus");
  }
  if (hasAbility(attacker, "death_reaper") && defender.status && (defender.status.type === "poisoned" || defender.status.type === "blinded" || defender.status.type === "weakened")) {
    extraAttack += getNumericRule(state, "deathReaperAttackBonus");
  }
  const defBonus = isFlying(defender) ? 0 : getTileDefenseBonus(defTile);
  const abilityAtkBonus = getAttackBonus(state, projectedAttacker, defender);
  const abilityDefBonus = getDefenseBonus(state, projectedAttacker, defender);
  const inspiredAttackBonus = attacker.status?.type === "inspired" ? dist > 1 ? Math.trunc(getNumericRule(state, "inspiredAttackBonus") / 2) : getNumericRule(state, "inspiredAttackBonus") : 0;
  const isMagic = atkStats.attackType === "magic";
  const weakenedPenalty = dist > 1 ? Math.trunc(getNumericRule(state, "weakenedDefensePenalty") / 2) : getNumericRule(state, "weakenedDefensePenalty");
  const weakenedRangedDefenseAdjustment = defender.status?.type === "weakened" ? 10 - weakenedPenalty : 0;
  const actualDefenderDefense = (isMagic ? effDef.magicDefense : effDef.physicalDefense) + weakenedRangedDefenseAdjustment;
  const rawDamage = Math.max(0, effAtk.attack + abilityAtkBonus + extraAttack + inspiredAttackBonus - (actualDefenderDefense + defBonus + abilityDefBonus));
  const isFightingSpirit = hasAbility(projectedAttacker, "fighting_spirit");
  let finalDamage = isFightingSpirit ? rawDamage : Math.trunc(rawDamage * extraAttackerHp / effAtk.maxHp);
  const finalMultiplier = getFinalDamageMultiplier(state, projectedAttacker, defender, dist);
  finalDamage = Math.floor(finalDamage * finalMultiplier);
  return Math.max(0, finalDamage);
}
function inRange(pos1, pos2, minRange, maxRange) {
  const dist = getDistance(pos1, pos2);
  return dist >= minRange && dist <= maxRange;
}
function canCounterAttack(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target) return false;
  if (target.hp <= 0) return false;
  const targetStats = getEffectiveStats(target);
  const distance = getDistance(target.pos, attacker.pos);
  const isCounterStorm = hasAbility(target, "counter_storm") && distance <= 2;
  const canNormalCounter = distance === 1 && inRange(
    target.pos,
    attacker.pos,
    targetStats.minRange,
    targetStats.maxRange
  );
  return isCounterStorm || canNormalCounter;
}
function counterDamageOnResolvedState(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target) return 0;
  if (!canCounterAttack(state, attackerId, defenderId)) return 0;
  return calculateDamageAtHp(state, defenderId, attackerId, target.hp);
}
function canHealTarget(state, healer, target) {
  if (getDistance(healer.pos, target.pos) > 1) return false;
  const range = getEffectiveStats(healer);
  if (healer.id !== target.id && !inRange(healer.pos, target.pos, range.minRange, range.maxRange)) return false;
  if (isUndead(target)) {
    return true;
  }
  const notPoisoned = !(target.status && target.status.type === "poisoned");
  const targetCanReceiveHealing = target.hp <= getEffectiveStats(target).maxHp;
  return areAlliedPlayers(state, healer.ownerId, target.ownerId) && notPoisoned && targetCanReceiveHealing;
}
function appendAttackActions(actions, unit2, enemies, stats) {
  if (stats.maxRange > 0) for (const enemy of enemies) {
    if (inRange(unit2.pos, enemy.pos, stats.minRange, stats.maxRange)) {
      actions.push({ type: "attack", attackerId: unit2.id, targetId: enemy.id });
    }
  }
}
function getLegalActions(state, playerId, query = {}) {
  const actions = [];
  if (!isActivePlayer(state, playerId)) {
    return actions;
  }
  const pendingUnitId = state.pendingUnitId;
  const pendingUnit = pendingUnitId ? state.units.find((u) => u.id === pendingUnitId) : void 0;
  const canResolveEmptyCastlePendingWithTurnAction = pendingUnit?.apkPendingRecruitSource === "empty_castle";
  const pendingLocksUnitActions = Boolean(pendingUnitId && pendingUnit?.apkPendingRecruitSource !== "empty_castle");
  let validUnits = state.units.filter((u) => u.ownerId === playerId && !u.hasActed && !u.apkStatic);
  if (query.unitId !== void 0) validUnits = validUnits.filter((u) => u.id === query.unitId);
  if (pendingLocksUnitActions) {
    validUnits = validUnits.filter((u) => u.id === pendingUnitId);
  }
  const enemyUnits = state.units.filter((u) => areEnemyPlayers(state, u.ownerId, playerId));
  if (query.onlyAttacks) {
    for (const unit2 of validUnits) appendAttackActions(actions, unit2, enemyUnits, getEffectiveStats(unit2));
    return actions;
  }
  const rules = getRuleConfig(state);
  let assaultUnits = state.units.filter(
    (u) => u.ownerId === playerId && u.hasActed && hasAbility(u, "assault_troop") && (u.movementRemaining ?? 0) > 0 && !u.hasPostAttackMoved && !u.apkStatic
  );
  if (query.unitId !== void 0) assaultUnits = assaultUnits.filter((u) => u.id === query.unitId);
  if (pendingLocksUnitActions) {
    assaultUnits = assaultUnits.filter((u) => u.id === pendingUnitId);
  }
  const sameTeamUnits = state.units.filter((u) => u.ownerId === playerId);
  for (const unit2 of query.skipMovement ? [] : assaultUnits) {
    const reachable = getReachablePositions(state, unit2.id, unit2.movementRemaining);
    for (const pos of reachable) {
      actions.push({ type: "post_attack_move", unitId: unit2.id, to: pos });
    }
  }
  for (const unit2 of validUnits) {
    const eff = getEffectiveStats(unit2);
    const tileUnder = state.map.tiles[unit2.pos.y][unit2.pos.x];
    const terrainConfig = getTileTerrainConfig(tileUnder);
    if (!unit2.hasMoved && !query.skipMovement) {
      const reachable = getReachablePositions(state, unit2.id);
      for (const pos of reachable) {
        if (pos.x !== unit2.pos.x || pos.y !== unit2.pos.y) {
          actions.push({ type: "move", unitId: unit2.id, to: pos });
        }
      }
    }
    if (eff.maxRange > 0) {
      appendAttackActions(actions, unit2, enemyUnits, eff);
      if (hasAbility(unit2, "destroyer")) {
        for (let y = 0; y < state.map.height; y++) {
          for (let x = 0; x < state.map.width; x++) {
            const targetTile = state.map.tiles[y][x];
            const occupied = state.units.some((u) => u.pos.x === x && u.pos.y === y);
            if (!occupied && isTileDestroyableForRules(targetTile) && inRange(unit2.pos, { x, y }, eff.minRange, eff.maxRange)) {
              actions.push({ type: "destroy_town", unitId: unit2.id, target: { x, y } });
            }
          }
        }
      }
    }
    if (hasAbility(unit2, "healer")) {
      for (const target of state.units) {
        if (canHealTarget(state, unit2, target)) {
          actions.push({ type: "heal", healerId: unit2.id, targetId: target.id });
        }
      }
    }
    if (hasAbility(unit2, "summoner") && state.graves) {
      for (const grave of state.graves) {
        if (inRange(unit2.pos, grave.pos, eff.minRange, eff.maxRange)) {
          const hasUnitOnGrave = state.units.some((u) => u.pos.x === grave.pos.x && u.pos.y === grave.pos.y);
          if (!hasUnitOnGrave) {
            actions.push({ type: "summon", summonerId: unit2.id, graveId: grave.id, spawnPos: { ...grave.pos } });
          }
        }
      }
    }
    if (hasAbility(unit2, "supporter")) {
      for (const friend of sameTeamUnits) {
        if (friend.id !== unit2.id && getDistance(unit2.pos, friend.pos) <= 2) {
          const isFriendActed = friend.hasActed;
          const isExcluded = hasAbility(friend, "assault_troop") || hasAbility(friend, "castle_capturer") || hasAbility(friend, "supporter");
          const isLevelLesserOrEqual = (friend.level ?? 0) <= (unit2.level ?? 0);
          const notSupportedYet = !friend.hasBeenSupportedThisTurn;
          if (isFriendActed && !isExcluded && isLevelLesserOrEqual && notSupportedYet) {
            actions.push({ type: "support", supporterId: unit2.id, targetId: friend.id });
          }
        }
      }
    }
    const canCaptureOwner = tileUnder.ownerId === null || !areAlliedPlayers(state, tileUnder.ownerId, playerId);
    if (terrainConfig.key === "town" && canCaptureOwner && hasAbility(unit2, "village_capturer")) {
      actions.push({ type: "capture", unitId: unit2.id });
    }
    if (terrainConfig.key === "castle" && canCaptureOwner && hasAbility(unit2, "castle_capturer")) {
      actions.push({ type: "capture", unitId: unit2.id });
    }
    if (terrainConfig.key === "town" && hasAbility(unit2, "destroyer")) {
      actions.push({ type: "destroy_town", unitId: unit2.id });
    }
    if (terrainConfig.key === "damaged_town" && hasAbility(unit2, "repairer")) {
      actions.push({ type: "repair", unitId: unit2.id });
    }
    actions.push({ type: "wait", unitId: unit2.id });
  }
  if (!pendingUnitId && !query.skipRecruitment) {
    const recruitClasses = getRecruitableUnits(state, playerId).filter((c) => canRecruitUnitClass(state, playerId, c));
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const tile2 = state.map.tiles[y][x];
        if (getTileTerrainKey(tile2) === "castle" && tile2.ownerId === playerId) {
          const occupant = state.units.find((u) => u.pos.x === x && u.pos.y === y);
          if (!occupant) {
            for (const c of recruitClasses) {
              actions.push({ type: "recruit_to_castle", unitClass: c, castlePos: { x, y } });
            }
          } else if (occupant.ownerId === playerId && isCommanderUnit(state, occupant, playerId)) {
            if (rules.commanderCastleRecruitUsesPending) {
              for (const c of recruitClasses) {
                actions.push({ type: "recruit_to_castle", unitClass: c, castlePos: { x, y } });
              }
              continue;
            }
            for (const c of recruitClasses) {
              const validSpawns = getRecruitDeployPositions(state, playerId, c, { x, y });
              for (const to of validSpawns) {
                actions.push({ type: "recruit_and_deploy", unitClass: c, castlePos: { x, y }, to });
              }
            }
          }
        }
      }
    }
  }
  if (!pendingUnitId || canResolveEmptyCastlePendingWithTurnAction) {
    if (rules.allowSurrender && (!pendingUnitId || rules.allowPendingRecruitSurrender)) {
      actions.push({ type: "surrender" });
    }
    if (!pendingUnitId || rules.allowPendingRecruitEndTurn) {
      actions.push({ type: "end_turn" });
    }
  }
  return actions;
}

// ../src/game/team_cleanup.ts
function destroyTeamForRules(state, teamId) {
  const player = state.players.find((entry) => entry.id === teamId);
  if (!player) return false;
  player.isAlive = false;
  for (const row of state.map.tiles) {
    for (const tile2 of row) {
      if (tile2.ownerId === teamId) setTileOwnerAfterRepairForRules(tile2);
    }
  }
  const removesPending = state.units.some((unit2) => unit2.id === state.pendingUnitId && unit2.ownerId === teamId);
  state.units = state.units.filter((unit2) => unit2.ownerId !== teamId);
  if (removesPending) delete state.pendingUnitId;
  return true;
}

// ../src/game/apk_compat.ts
var APK_UNIT_ID_TO_CLASS = {
  0: "soldier",
  1: "archer",
  2: "water_elemental",
  3: "witch",
  4: "elf",
  5: "wolf",
  6: "golem",
  7: "catapult",
  8: "dragon",
  9: "commander",
  10: "skeleton",
  11: "crystal",
  12: "paladin",
  13: "berserker",
  14: "ghost",
  15: "dark_mage",
  16: "wolf_archer",
  17: "ice_elemental",
  18: "slime",
  19: "mermaid",
  20: "druid"
};
var APK_UNIT_CLASS_TO_ID = Object.fromEntries(
  Object.entries(APK_UNIT_ID_TO_CLASS).map(([apkUnitId, unitClass]) => [unitClass, Number(apkUnitId)])
);
var APK_STATUS_ID_TO_TYPE = {
  1: "poisoned",
  2: "inspired",
  3: "blinded",
  4: "weakened"
};
var APK_STATUS_TYPE_TO_ID = Object.fromEntries(
  Object.entries(APK_STATUS_ID_TO_TYPE).map(([apkStatusId, statusType]) => [statusType, Number(apkStatusId)])
);
var APK_ABILITY_ID_TO_TYPE = {
  0: "village_capturer",
  1: "castle_capturer",
  2: "repairer",
  3: "flying",
  4: "sharpshooter",
  5: "destroyer",
  6: "summoner",
  7: "healer",
  8: "poisoner",
  9: "undead",
  10: "melee_master",
  11: "ranged_defense",
  12: "water_child",
  13: "forest_child",
  14: "mountain_child",
  15: "fighting_spirit",
  16: "counter_storm",
  17: "self_repair",
  18: "attack_aura",
  19: "cleansing_aura",
  20: "weakness_aura",
  21: "assault_troop",
  22: "earth_child",
  23: "blinder",
  24: "supporter",
  25: "death_reaper"
};
var APK_ABILITY_TYPE_TO_ID = Object.fromEntries(
  Object.entries(APK_ABILITY_ID_TO_TYPE).map(([apkAbilityId, ability]) => [ability, Number(apkAbilityId)])
);

// ../src/game/apk_stage.ts
function ensureRules(state) {
  state.rules ??= {};
  return state.rules;
}
function ensureScriptState(state) {
  state.apkScriptState ??= {};
  return state.apkScriptState;
}
function normalizeScriptName(name) {
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  return normalized === "" ? null : normalized;
}
function moveCurrentPlayerIfDisabled(state) {
  if (isActivePlayer(state, state.currentPlayer)) return;
  const nextPlayerId = getTurnPlayerIds(state)[0];
  if (nextPlayerId !== void 0) {
    state.currentPlayer = nextPlayerId;
  }
}
function getAliveAllianceIds(state) {
  return [...new Set(state.players.filter((player) => isActivePlayer(state, player.id)).map((player) => getAllianceId(state, player.id)))];
}
function putBoolean(state, name, value) {
  const normalized = normalizeScriptName(name);
  if (!normalized || typeof value !== "boolean") return false;
  const scriptState = ensureScriptState(state);
  scriptState.booleans ??= {};
  scriptState.booleans[normalized] = value;
  return true;
}
function putInteger(state, name, value) {
  const normalized = normalizeScriptName(name);
  if (!normalized || !Number.isInteger(value)) return false;
  const scriptState = ensureScriptState(state);
  scriptState.integers ??= {};
  scriptState.integers[normalized] = value;
  return true;
}
function syncChangeGold(state, teamId, delta) {
  const player = state.players.find((entry) => entry.id === teamId);
  if (!player || !Number.isInteger(delta)) return false;
  player.gold = Math.max(0, player.gold + delta);
  return true;
}
function syncSetCurrentTeam(state, teamId) {
  if (!isActivePlayer(state, teamId)) return false;
  state.currentPlayer = teamId;
  return true;
}
function syncDisableTeam(state, teamId) {
  if (!state.players.some((player) => player.id === teamId)) return false;
  const rules = ensureRules(state);
  const disabledTeams = new Set(rules.disabledTeams ?? []);
  disabledTeams.add(teamId);
  rules.disabledTeams = [...disabledTeams].sort((a, b) => a - b);
  moveCurrentPlayerIfDisabled(state);
  return true;
}
function syncRestoreTeam(state, teamId) {
  if (!state.players.some((player) => player.id === teamId)) return false;
  const rules = ensureRules(state);
  rules.disabledTeams = (rules.disabledTeams ?? []).filter((id) => id !== teamId);
  return true;
}
function syncDestroyTeam(state, teamId) {
  if (!destroyTeamForRules(state, teamId)) return false;
  moveCurrentPlayerIfDisabled(state);
  return true;
}
function syncGameOver(state, allianceId) {
  if (!Number.isInteger(allianceId) || !getAliveAllianceIds(state).includes(allianceId)) {
    return false;
  }
  state.winner = allianceId;
  return true;
}
function syncSetAlliance(state, teamId, allianceId) {
  if (!state.players.some((player) => player.id === teamId) || !Number.isInteger(allianceId) || allianceId < 0) {
    return false;
  }
  const rules = ensureRules(state);
  rules.alliances ??= {};
  rules.alliances[teamId] = allianceId;
  return true;
}

// ../src/game/campaign_events.ts
function ensureScriptState2(state) {
  state.apkScriptState ??= {};
  state.apkScriptState.booleans ??= {};
  return state.apkScriptState;
}
function eventFiredKey(eventId) {
  return `#campaignEvent:${eventId}`;
}
function markEventFired(state, eventId) {
  const scriptState = ensureScriptState2(state);
  scriptState.booleans[eventFiredKey(eventId)] = true;
}
function wasEventFired(state, eventId) {
  return state.apkScriptState?.booleans?.[eventFiredKey(eventId)] === true;
}
function inArea(pos, area) {
  return pos.x >= area.minX && pos.x <= area.maxX && pos.y >= area.minY && pos.y <= area.maxY;
}
function samePos(left, right) {
  return left.x === right.x && left.y === right.y;
}
function matchesSelector(state, unit2, selector) {
  if (!selector) return true;
  if (selector.teamId !== void 0 && unit2.ownerId !== selector.teamId) return false;
  if (selector.unitId !== void 0 && unit2.id !== selector.unitId) return false;
  if (selector.unitCode !== void 0 && unit2.apkUnitCode !== selector.unitCode) return false;
  if (selector.unitClass !== void 0 && unit2.unitClass !== selector.unitClass) return false;
  if (selector.commanderOfTeam !== void 0 && !isCommanderUnit(state, unit2, selector.commanderOfTeam)) return false;
  if (selector.pos && !samePos(unit2.pos, selector.pos)) return false;
  if (selector.area && !inArea(unit2.pos, selector.area)) return false;
  return true;
}
function selectUnits(state, selector) {
  return state.units.filter((unit2) => unit2.hp > 0 && matchesSelector(state, unit2, selector));
}
function triggerMatches(state, trigger, runtimeEvent) {
  if (trigger.type !== runtimeEvent.type) return false;
  switch (trigger.type) {
    case "turn_start": {
      if (runtimeEvent.type !== "turn_start") return false;
      if (trigger.playerId !== void 0 && trigger.playerId !== runtimeEvent.playerId) return false;
      if (trigger.turn !== void 0 && trigger.turn !== runtimeEvent.turn) return false;
      if (trigger.minTurn !== void 0 && runtimeEvent.turn < trigger.minTurn) return false;
      if (trigger.maxTurn !== void 0 && runtimeEvent.turn > trigger.maxTurn) return false;
      if (trigger.everyTurns !== void 0) {
        if (trigger.everyTurns <= 0 || runtimeEvent.turn % trigger.everyTurns !== 0) return false;
      }
      return true;
    }
    case "unit_standby": {
      return runtimeEvent.type === "unit_standby" && matchesSelector(state, runtimeEvent.unit, trigger.selector);
    }
    case "unit_destroyed": {
      return runtimeEvent.type === "unit_destroyed" && matchesSelector(state, runtimeEvent.unit, trigger.selector);
    }
    case "tile_occupied": {
      if (runtimeEvent.type !== "tile_occupied") return false;
      if (trigger.pos && !samePos(trigger.pos, runtimeEvent.pos)) return false;
      if (trigger.ownerId !== void 0 && trigger.ownerId !== runtimeEvent.ownerId) return false;
      if (trigger.previousOwnerId !== void 0 && trigger.previousOwnerId !== runtimeEvent.previousOwnerId) return false;
      return true;
    }
  }
}
function createUnitFromReinforcement(state, reinforcement) {
  if (!UNIT_CONFIGS[reinforcement.unitClass]) return false;
  if (!state.players.some((player) => player.id === reinforcement.teamId)) return false;
  if (reinforcement.pos.x < 0 || reinforcement.pos.y < 0 || reinforcement.pos.x >= state.map.width || reinforcement.pos.y >= state.map.height) {
    return false;
  }
  if (state.units.some((unit3) => unit3.hp > 0 && samePos(unit3.pos, reinforcement.pos))) {
    return false;
  }
  const nextId = state.nextUnitId ?? 100;
  const unit2 = {
    id: `u_${nextId}`,
    ownerId: reinforcement.teamId,
    unitClass: reinforcement.unitClass,
    pos: { ...reinforcement.pos },
    hp: reinforcement.hp ?? 100,
    maxHp: 100,
    hasMoved: false,
    hasActed: reinforcement.hasActed ?? false,
    level: reinforcement.level ?? 0,
    exp: 0,
    apkUnitCode: reinforcement.code,
    apkUnitHead: reinforcement.head,
    apkStatic: reinforcement.static,
    apkTargeted: reinforcement.targeted
  };
  unit2.movementRemaining = getEffectiveStats(unit2).move;
  state.nextUnitId = nextId + 1;
  state.units.push(unit2);
  return true;
}
function applyEffect(state, effect) {
  switch (effect.type) {
    case "create_unit":
      return createUnitFromReinforcement(state, effect.unit) ? 1 : 0;
    case "reinforce":
      return effect.units.reduce((count, unit2) => count + (createUnitFromReinforcement(state, unit2) ? 1 : 0), 0);
    case "damage_units": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit2) => {
        unit2.hp -= effect.amount;
      });
      return targets.length;
    }
    case "change_unit_hp": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit2) => {
        unit2.hp += effect.delta;
      });
      return targets.length;
    }
    case "change_unit_team": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit2) => {
        unit2.ownerId = effect.teamId;
        if (effect.resetStatus) {
          delete unit2.status;
        }
        unit2.hasMoved = false;
        unit2.hasActed = false;
        unit2.movementRemaining = getEffectiveStats(unit2).move;
      });
      return targets.length;
    }
    case "destroy_units": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit2) => {
        unit2.hp = 0;
      });
      return targets.length;
    }
    case "remove_units": {
      const ids = new Set(selectUnits(state, effect.selector).map((unit2) => unit2.id));
      const before = state.units.length;
      state.units = state.units.filter((unit2) => !ids.has(unit2.id));
      return before - state.units.length;
    }
    case "move_unit": {
      const targets = selectUnits(state, effect.selector);
      const unit2 = targets[0];
      if (!unit2) return 0;
      if (effect.to.x < 0 || effect.to.y < 0 || effect.to.x >= state.map.width || effect.to.y >= state.map.height) return 0;
      if (state.units.some((other) => other.id !== unit2.id && other.hp > 0 && samePos(other.pos, effect.to))) return 0;
      unit2.pos = { ...effect.to };
      if (effect.endAction) {
        unit2.hasMoved = true;
        unit2.hasActed = true;
        unit2.movementRemaining = 0;
      }
      return 1;
    }
    case "set_tile": {
      const tile2 = state.map.tiles[effect.pos.y]?.[effect.pos.x];
      if (!tile2) return 0;
      if (effect.terrainId !== void 0) {
        setTileTerrainForRules(tile2, effect.terrainId);
      }
      if (effect.ownerId !== void 0) {
        setTileOwnerForRules(tile2, effect.ownerId);
      }
      return 1;
    }
    case "restore_team":
      return syncRestoreTeam(state, effect.teamId) ? 1 : 0;
    case "disable_team":
      return syncDisableTeam(state, effect.teamId) ? 1 : 0;
    case "destroy_team":
      return syncDestroyTeam(state, effect.teamId) ? 1 : 0;
    case "set_alliance":
      return syncSetAlliance(state, effect.teamId, effect.allianceId) ? 1 : 0;
    case "game_over":
      return syncGameOver(state, effect.allianceId) ? 1 : 0;
    case "set_boolean":
      return putBoolean(state, effect.key, effect.value) ? 1 : 0;
    case "set_integer":
      return putInteger(state, effect.key, effect.value) ? 1 : 0;
    case "change_gold":
      return syncChangeGold(state, effect.teamId, effect.delta) ? 1 : 0;
    case "set_current_team":
      return syncSetCurrentTeam(state, effect.teamId) ? 1 : 0;
  }
}
function applyCampaignEvents(state, runtimeEvent) {
  const events = getRuleConfig(state).campaignEvents;
  const result = {
    firedEventIds: [],
    effectCount: 0
  };
  for (const event of events) {
    if (event.enabled === false || event.effects.length === 0) continue;
    if (event.once !== false && wasEventFired(state, event.id)) continue;
    if (!triggerMatches(state, event.trigger, runtimeEvent)) continue;
    let appliedEffects = 0;
    for (const effect of event.effects) {
      appliedEffects += applyEffect(state, effect);
    }
    if (event.once !== false) {
      markEventFired(state, event.id);
    }
    result.firedEventIds.push(event.id);
    result.effectCount += appliedEffects;
  }
  return result;
}

// ../src/game/clone_state.ts
function cloneJson(value) {
  if (value === null || typeof value !== "object") {
    return typeof value === "number" && !Number.isFinite(value) ? null : value;
  }
  if (Array.isArray(value)) return value.map((item) => item === void 0 ? null : cloneJson(item));
  const result = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item !== void 0) {
      if (key === "__proto__") Object.defineProperty(result, key, { value: cloneJson(item), enumerable: true, writable: true, configurable: true });
      else result[key] = cloneJson(item);
    }
  }
  return result;
}
function cloneGameState(state) {
  const copy = { ...state };
  copy.players = state.players.map((player) => ({ ...player }));
  copy.units = state.units.map((unit2) => {
    const cloned = { ...unit2, pos: { ...unit2.pos } };
    if (unit2.status) cloned.status = { ...unit2.status };
    if (unit2.apkMoveOverrides) cloned.apkMoveOverrides = { ...unit2.apkMoveOverrides };
    return cloned;
  });
  copy.map = { ...state.map, tiles: state.map.tiles.map((row) => row.map((tile2) => ({ ...tile2 }))) };
  if (state.graves) copy.graves = state.graves.map((grave) => ({ ...grave, pos: { ...grave.pos } }));
  if (state.rules) copy.rules = cloneJson(state.rules);
  if (state.metadata) copy.metadata = cloneJson(state.metadata);
  if (state.apkScriptState) copy.apkScriptState = cloneJson(state.apkScriptState);
  return copy;
}

// ../src/game/engine.ts
function isSamePos(p1, p2) {
  if (!p1 || !p2) return p1 === p2;
  return p1.x === p2.x && p1.y === p2.y;
}
function isNegativeStatus(status) {
  return status?.type === "poisoned" || status?.type === "blinded" || status?.type === "weakened";
}
function getStatusDuration(status) {
  return status.type === "poisoned" ? status.remainingTicks ?? status.remainingTurns ?? 0 : status.remainingTurns ?? status.remainingTicks ?? 0;
}
function setStatusDuration(status, duration) {
  if (status.type === "poisoned") {
    status.remainingTicks = duration;
    delete status.remainingTurns;
    return;
  }
  status.remainingTurns = duration;
  delete status.remainingTicks;
}
function areActionsEqual(a1, a2) {
  if (a1.type !== a2.type) return false;
  switch (a1.type) {
    case "move": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitId === m2.unitId && isSamePos(m1.to, m2.to);
    }
    case "post_attack_move": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitId === m2.unitId && isSamePos(m1.to, m2.to);
    }
    case "attack": {
      const m1 = a1;
      const m2 = a2;
      return m1.attackerId === m2.attackerId && m1.targetId === m2.targetId;
    }
    case "heal": {
      const m1 = a1;
      const m2 = a2;
      return m1.healerId === m2.healerId && m1.targetId === m2.targetId;
    }
    case "support": {
      const m1 = a1;
      const m2 = a2;
      return m1.supporterId === m2.supporterId && m1.targetId === m2.targetId;
    }
    case "summon": {
      const m1 = a1;
      const m2 = a2;
      return m1.summonerId === m2.summonerId && m1.graveId === m2.graveId && isSamePos(m1.spawnPos, m2.spawnPos);
    }
    case "destroy_town": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitId === m2.unitId && isSamePos(m1.target, m2.target);
    }
    case "capture":
    case "repair":
    case "wait": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitId === m2.unitId;
    }
    case "recruit_to_castle": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitClass === m2.unitClass && isSamePos(m1.castlePos, m2.castlePos);
    }
    case "recruit_and_deploy": {
      const m1 = a1;
      const m2 = a2;
      return m1.unitClass === m2.unitClass && isSamePos(m1.castlePos, m2.castlePos) && isSamePos(m1.to, m2.to);
    }
    case "end_turn":
    case "surrender":
      return true;
    default:
      return false;
  }
}
var GameEngine = class _GameEngine {
  constructor(initialState, options) {
    this.unsafeBypassValidationForTests = false;
    this.disableAutoAdvanceWhenNoMeaningfulAction = false;
    this.executingStep = false;
    this.movementCosts = /* @__PURE__ */ new Map();
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
        applyCampaignEvents(this.state, { type: "unit_destroyed", unit: deadUnit });
      }
      this.checkWinConditions();
      this.ensureCurrentPlayerCanAct(true);
    }
  }
  getState() {
    return cloneGameState(this.state);
  }
  clone() {
    const branch = new _GameEngine(this.state, {
      unsafeBypassValidationForTests: this.unsafeBypassValidationForTests,
      disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction
    });
    if (branch.state.currentPlayer === this.state.currentPlayer && branch.state.turn === this.state.turn) {
      branch.fullLegalCache = this.fullLegalCache;
      branch.movementCosts = this.movementCosts;
    }
    return branch;
  }
  getLegalActions(playerId, query) {
    if (query !== void 0 || this.executingStep) return getLegalActions(this.state, playerId, query);
    if (this.fullLegalCache?.playerId !== playerId) {
      this.fullLegalCache = { playerId, actions: getLegalActions(this.state, playerId) };
    }
    return structuredClone(this.fullLegalCache.actions);
  }
  isTerminal() {
    return this.state.winner !== null;
  }
  getWinner() {
    return this.state.winner;
  }
  reset(config) {
    if (config) {
      this.fullLegalCache = void 0;
      this.executingStep = false;
      this.movementCosts = /* @__PURE__ */ new Map();
      this.state = cloneGameState(config);
      this.ensureCurrentPlayerCanAct();
    } else {
      throw new Error("Config missing on reset.");
    }
    return this.getState();
  }
  getNextTurnPlayer(prevPlayerId) {
    const playerIds = getTurnPlayerIds(this.state);
    if (playerIds.length === 0) {
      return { playerId: null, wrapped: false };
    }
    const currentIndex = playerIds.indexOf(prevPlayerId);
    if (currentIndex === -1) {
      const nextHigher = playerIds.find((id) => id > prevPlayerId);
      const nextPlayerId = nextHigher ?? playerIds[0];
      return { playerId: nextPlayerId, wrapped: nextPlayerId <= prevPlayerId };
    }
    const nextIndex = (currentIndex + 1) % playerIds.length;
    return { playerId: playerIds[nextIndex], wrapped: nextIndex === 0 };
  }
  ensureCurrentPlayerCanAct(applyTurnStart = false) {
    for (let guard = 0; guard < this.state.players.length && !this.isTerminal(); guard++) {
      if (isActivePlayer(this.state, this.state.currentPlayer)) return;
      const nextTurn = this.getNextTurnPlayer(this.state.currentPlayer);
      if (nextTurn.playerId === null) return;
      this.state.currentPlayer = nextTurn.playerId;
      if (!applyTurnStart) return;
      if (nextTurn.wrapped) this.state.turn += 1;
      delete this.state.pendingUnitId;
      this.startTurnForPlayer(nextTurn.playerId);
      const deadUnits = this.removeDeadUnits();
      for (const deadUnit of deadUnits) {
        applyCampaignEvents(this.state, { type: "unit_destroyed", unit: deadUnit });
      }
      this.checkWinConditions();
    }
  }
  recordCommanderDeaths(deadUnits) {
    for (const unit2 of deadUnits) {
      if (!isCommanderUnit(this.state, unit2)) continue;
      const player = this.state.players.find((p) => p.id === unit2.ownerId);
      if (player) {
        player.commanderDeathCount += 1;
        player.commanderReserveLevel = unit2.level ?? 0;
        player.commanderReserveExp = unit2.exp ?? 0;
      }
    }
  }
  applyCappedRecovery(unit2, maxHp, amount) {
    if (amount <= 0 || unit2.hp >= maxHp) return;
    unit2.hp = Math.min(maxHp, unit2.hp + amount);
  }
  refreshMovementForCurrentStatus(unit2) {
    unit2.movementRemaining = getEffectiveStats(unit2).move;
  }
  decayStatusAtTurnStart(unit2) {
    if (!unit2.status) return;
    const nextDuration = getStatusDuration(unit2.status) - 1;
    if (nextDuration < 0) {
      delete unit2.status;
      return;
    }
    setStatusDuration(unit2.status, nextDuration);
  }
  applyTurnStartHpDelta(unit2, maxHp, delta) {
    unit2.hp = Math.max(0, Math.min(maxHp, unit2.hp + delta));
  }
  shouldCreateGraveForDeadUnit(unit2) {
    return !isCommanderUnit(this.state, unit2) && !isUndead(unit2);
  }
  createGraveAt(pos, ownerId) {
    this.state.graves = this.state.graves || [];
    const existingGrave = this.state.graves.find((g) => g.pos.x === pos.x && g.pos.y === pos.y);
    if (existingGrave) {
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
  createGravesForDeadUnits(deadUnits) {
    for (const unit2 of deadUnits) {
      if (this.shouldCreateGraveForDeadUnit(unit2)) {
        this.createGraveAt(unit2.pos, this.state.currentPlayer);
      }
    }
  }
  tickGravesForPlayer(playerId) {
    if (!this.state.graves) return;
    this.state.graves = this.state.graves.map((grave) => {
      const ownerId = grave.ownerId ?? playerId;
      if (ownerId !== playerId) return grave;
      return {
        ...grave,
        ownerId,
        remainingTurns: grave.remainingTurns - 1
      };
    }).filter((grave) => grave.remainingTurns >= 0);
  }
  removeDeadUnits() {
    const deadUnits = this.state.units.filter((u) => u.hp <= 0);
    this.recordCommanderDeaths(deadUnits);
    this.createGravesForDeadUnits(deadUnits);
    this.state.units = this.state.units.filter((u) => u.hp > 0);
    return deadUnits;
  }
  startTurnForPlayer(playerId) {
    const ruleConfig = getRuleConfig(this.state);
    const nextPlayer = this.state.players.find((p) => p.id === playerId);
    this.tickGravesForPlayer(playerId);
    for (let y = 0; y < this.state.map.height; y++) {
      for (let x = 0; x < this.state.map.width; x++) {
        const tile2 = this.state.map.tiles[y][x];
        if (tile2.ownerId !== playerId || getTileTerrainKey(tile2) !== "castle") continue;
        const occupyingEnemies = this.state.units.filter((unit2) => unit2.pos.x === x && unit2.pos.y === y && areEnemyPlayers(this.state, unit2.ownerId, playerId));
        for (const enemy of occupyingEnemies) {
          enemy.hp = Math.max(0, Math.min(getEffectiveStats(enemy).maxHp, enemy.hp - 50));
        }
      }
    }
    if (nextPlayer) {
      let totalIncome = 0;
      for (let y = 0; y < this.state.map.height; y++) {
        for (let x = 0; x < this.state.map.width; x++) {
          const tile2 = this.state.map.tiles[y][x];
          if (tile2.ownerId === playerId) {
            const income = getTileIncome(this.state, tile2);
            totalIncome += income;
          }
        }
      }
      const commander = getCommanderUnit(this.state, playerId);
      if (commander) {
        const lvl = commander.level ?? 0;
        totalIncome += ruleConfig.incomeCommanderBase + lvl * ruleConfig.incomeCommanderGrowth;
      }
      nextPlayer.gold += totalIncome;
    }
    this.state.units.forEach((u) => {
      if (u.ownerId === playerId) {
        const tile2 = this.state.map.tiles[u.pos.y][u.pos.x];
        if (u.status) {
          if (isNegativeStatus(u.status) && tileClearsNegativeStatusAtTurnStart(tile2)) {
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
        const terrainHealPerTurn = getTileHealPerTurn(tile2);
        const canReceiveTerrainHeal = terrainHealPerTurn > 0 && (!tileHealingRequiresFriendlyOwner(tile2) || tile2.ownerId !== null && areAlliedPlayers(this.state, playerId, tile2.ownerId));
        if (canReceiveTerrainHeal) {
          hpDelta += terrainHealPerTurn;
        }
        if (hasAbility(u, "water_child") && isWaterTerrain(tile2)) {
          hpDelta += 10;
        }
        if (hasAbility(u, "forest_child") && isForestTerrain(tile2)) {
          hpDelta += 10;
        }
        if (hasAbility(u, "mountain_child") && isMountainTerrain(tile2)) {
          hpDelta += 10;
        }
        if (u.status?.type === "poisoned") {
          hpDelta = isUndead(u) ? hpDelta + 10 : -10;
        }
        if (hasAbility(u, "self_repair")) {
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
    applyCampaignEvents(this.state, { type: "turn_start", playerId, turn: this.state.turn });
  }
  consumeGraveAtUnitPosition(unit2, options = {}) {
    if (!this.state.graves) return;
    const graveIdx = this.state.graves.findIndex((g) => g.pos.x === unit2.pos.x && g.pos.y === unit2.pos.y);
    if (graveIdx === -1) return;
    const applyHpDelta = options.applyHpDelta ?? true;
    let hpDelta = 0;
    if (isUndead(unit2)) {
      hpDelta = 10;
      if (applyHpDelta) {
        this.applyCappedRecovery(unit2, getEffectiveStats(unit2).maxHp, hpDelta);
      }
    } else if (!hasAbility(unit2, "summoner")) {
      hpDelta = -10;
      if (applyHpDelta) {
        unit2.hp += hpDelta;
      }
    }
    this.state.graves.splice(graveIdx, 1);
    return hpDelta;
  }
  applyCombatStatusEffects(source, target) {
    if (target.hp <= 0) return;
    if (hasAbility(source, "poisoner") && !hasAbility(target, "poisoner")) {
      if (!target.status || target.status.type === "poisoned") {
        target.status = { type: "poisoned", remainingTicks: 2 };
      }
    }
    if (hasAbility(source, "blinder") && !hasAbility(target, "blinder")) {
      if (!target.status || target.status.type === "blinded") {
        target.status = { type: "blinded", remainingTurns: 1 };
      }
    }
  }
  triggerAuras(unit2, options = {}) {
    if (unit2.hp <= 0) {
      return {
        deferredActingUnitHpDelta: 0,
        killedUnits: []
      };
    }
    let deferredActingUnitHpDelta = 0;
    const killedUnits = [];
    if (hasAbility(unit2, "cleansing_aura")) {
      const level = unit2.level ?? 0;
      const healVal = 10 + level * 5;
      this.state.units.forEach((u) => {
        if (u.hp <= 0 || getDistance(unit2.pos, u.pos) > 2) return;
        const isEnemy = areEnemyPlayers(this.state, unit2.ownerId, u.ownerId);
        const stats = getEffectiveStats(u);
        if (!isEnemy && isNegativeStatus(u.status)) {
          clearNegativeStatus(u);
          if (!u.hasActed) {
            this.refreshMovementForCurrentStatus(u);
          }
        }
        if (u.hp <= stats.maxHp) {
          if (isUndead(u)) {
            if (options.deferActingUnitCleansingHpDelta && u.id === unit2.id) {
              deferredActingUnitHpDelta -= healVal;
            } else {
              const hpBefore = u.hp;
              u.hp = Math.max(0, u.hp - healVal);
              if (hpBefore > 0 && u.hp <= 0) {
                killedUnits.push({ ...u, pos: { ...u.pos } });
              }
            }
          } else if (!isEnemy) {
            if (options.deferActingUnitCleansingHpDelta && u.id === unit2.id) {
              deferredActingUnitHpDelta += healVal;
            } else {
              this.applyCappedRecovery(u, stats.maxHp, healVal);
            }
          }
        }
      });
    }
    if (hasAbility(unit2, "attack_aura")) {
      this.state.units.forEach((u) => {
        if (u.hp > 0 && areAlliedPlayers(this.state, unit2.ownerId, u.ownerId) && getDistance(unit2.pos, u.pos) <= 2) {
          if (!u.status || u.status.type === "inspired") {
            u.status = { type: "inspired", remainingTurns: 0 };
          }
        }
      });
    }
    if (hasAbility(unit2, "weakness_aura")) {
      this.state.units.forEach((u) => {
        if (u.hp > 0 && areEnemyPlayers(this.state, unit2.ownerId, u.ownerId) && getDistance(unit2.pos, u.pos) <= 2) {
          if (!hasAbility(u, "weakness_aura") && (!u.status || u.status.type === "weakened")) {
            u.status = { type: "weakened", remainingTurns: 1 };
            this.refreshMovementForCurrentStatus(u);
          }
        }
      });
    }
    return { deferredActingUnitHpDelta, killedUnits };
  }
  step(action) {
    if (this.isTerminal()) {
      return { state: this.getState(), reward: 0, done: true, info: "Game already ended" };
    }
    if (!this.unsafeBypassValidationForTests) {
      const moving = action.type === "move" || action.type === "post_attack_move";
      const skipRecruitment = action.type !== "recruit_to_castle" && action.type !== "recruit_and_deploy";
      const legalActions2 = this.fullLegalCache?.playerId === this.state.currentPlayer ? this.fullLegalCache.actions : getLegalActions(this.state, this.state.currentPlayer, moving ? { unitId: action.unitId, skipRecruitment } : action.type === "attack" ? { unitId: action.attackerId, onlyAttacks: true } : { skipMovement: true, skipRecruitment });
      const isLegal = legalActions2.some((la) => areActionsEqual(la, action));
      if (!isLegal) {
        return {
          state: this.getState(),
          reward: 0,
          done: this.isTerminal(),
          info: `\u975E\u6CD5\u52A8\u4F5C\uFF1A\u5F53\u524D\u73A9\u5BB6\u65E0\u6CD5\u6267\u884C\u8BE5\u52A8\u4F5C`
        };
      }
    }
    this.fullLegalCache = void 0;
    this.executingStep = true;
    const beforeMovementCosts = this.movementCosts;
    this.movementCosts = /* @__PURE__ */ new Map();
    const movementCost = (unitId, to) => {
      const unit2 = this.state.units.find((u) => u.id === unitId);
      if (unit2?.pos.x === to.x && unit2.pos.y === to.y) return 0;
      let costs = beforeMovementCosts.get(unitId);
      if (!costs) {
        costs = getMovementCosts(this.state, unitId);
        beforeMovementCosts.set(unitId, costs);
      }
      return costs.get(`${to.x},${to.y}`) ?? 999;
    };
    const prevCurrentPlayer = this.state.currentPlayer;
    let reward = 0;
    let info = "";
    const ruleConfig = getRuleConfig(this.state);
    let standbyUnitId = null;
    switch (action.type) {
      case "move": {
        const unit2 = this.state.units.find((u) => u.id === action.unitId);
        if (unit2) {
          const cost = movementCost(unit2.id, action.to);
          const eff = getEffectiveStats(unit2);
          const remCur = unit2.movementRemaining ?? eff.move;
          unit2.movementRemaining = Math.max(0, remCur - cost);
          unit2.pos = { ...action.to };
          unit2.hasMoved = true;
          info = `Unit ${unit2.id} moved to ${action.to.x},${action.to.y}`;
        }
        break;
      }
      case "post_attack_move": {
        const unit2 = this.state.units.find((u) => u.id === action.unitId);
        if (unit2) {
          const cost = movementCost(unit2.id, action.to);
          unit2.movementRemaining = Math.max(0, (unit2.movementRemaining ?? 0) - cost);
          unit2.pos = { ...action.to };
          unit2.hasPostAttackMoved = true;
          unit2.hasActed = true;
          standbyUnitId = unit2.id;
          info = `Unit ${unit2.id} post-attack moved to ${action.to.x},${action.to.y}`;
        }
        break;
      }
      case "attack": {
        const attacker = this.state.units.find((u) => u.id === action.attackerId);
        const target = this.state.units.find((u) => u.id === action.targetId);
        if (attacker && target) {
          if (hasAbility(attacker, "assault_troop") && attacker.movementRemaining === void 0) {
            attacker.movementRemaining = getEffectiveStats(attacker).move;
          }
          const dmg = calculateDamage(this.state, attacker.id, target.id);
          target.hp -= dmg;
          info = `Unit ${attacker.id} attacked ${target.id} for ${dmg} dmg.`;
          reward += dmg * 0.1;
          this.applyCombatStatusEffects(attacker, target);
          addExp(attacker, target.hp <= 0 ? KILL_EXP : ATTACK_EXP, ruleConfig.levelCap);
          let canCounter = false;
          if (target.hp > 0) {
            canCounter = canCounterAttack(this.state, attacker.id, target.id);
          }
          if (target.hp > 0) {
            if (canCounter) {
              const counterDmg = counterDamageOnResolvedState(this.state, attacker.id, target.id);
              attacker.hp -= counterDmg;
              info += ` Target counterattacked for ${counterDmg} dmg.`;
              this.applyCombatStatusEffects(target, attacker);
              addExp(target, attacker.hp <= 0 ? KILL_EXP : ASSIST_EXP, ruleConfig.levelCap);
            }
          } else {
          }
          attacker.hasMoved = true;
          const waitsForPostAttackMove = hasAbility(attacker, "assault_troop") && (attacker.movementRemaining ?? 0) > 0 && !attacker.hasPostAttackMoved;
          if (waitsForPostAttackMove) {
            attacker.hasActed = true;
          } else {
            attacker.hasActed = true;
          }
          standbyUnitId = waitsForPostAttackMove ? null : attacker.id;
        }
        break;
      }
      case "heal": {
        const healer = this.state.units.find((u) => u.id === action.healerId);
        const target = this.state.units.find((u) => u.id === action.targetId);
        if (healer && target) {
          const level = healer.level ?? 0;
          const healVal = healer.unitClass === "paladin" ? 40 + level * 10 : 40;
          let hpDelta = healVal;
          target.hasBeenHealedThisTurn = true;
          if (isUndead(target)) {
            hpDelta = -Math.floor(healVal * 3 / 2);
            target.hp = Math.max(0, target.hp + hpDelta);
            if (target.hp <= 0 && !hasAbility(healer, "undead")) {
              addExp(healer, 60, ruleConfig.levelCap);
            }
          } else {
            target.hp += healVal;
          }
          if (target.hp > 0) {
            addExp(healer, 30, ruleConfig.levelCap);
          }
          healer.hasMoved = true;
          healer.hasActed = true;
          standbyUnitId = healer.id;
          info = `Healer ${healer.id} changed ${target.id} HP by ${hpDelta}.`;
        }
        break;
      }
      case "summon": {
        const summoner = this.state.units.find((u) => u.id === action.summonerId);
        if (summoner) {
          const level = summoner.level ?? 0;
          const nextId = this.state.nextUnitId ?? 100;
          const newUnitId = `u_${nextId}`;
          this.state.nextUnitId = nextId + 1;
          this.state.units.push({
            id: newUnitId,
            ownerId: summoner.ownerId,
            unitClass: "skeleton",
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
            this.state.graves = this.state.graves.filter((g) => g.id !== action.graveId);
          }
          addExp(summoner, 10, ruleConfig.levelCap);
          summoner.hasMoved = true;
          summoner.hasActed = true;
          standbyUnitId = summoner.id;
          info = `Summoner ${summoner.id} summoned skeleton at ${action.spawnPos.x},${action.spawnPos.y}.`;
        }
        break;
      }
      case "support": {
        const supporter = this.state.units.find((u) => u.id === action.supporterId);
        const target = this.state.units.find((u) => u.id === action.targetId);
        if (supporter && target) {
          target.hasActed = false;
          target.hasMoved = false;
          target.movementRemaining = getEffectiveStats(target).move;
          target.hasBeenSupportedThisTurn = true;
          addExp(supporter, 10, ruleConfig.levelCap);
          supporter.hasMoved = true;
          supporter.hasActed = true;
          standbyUnitId = supporter.id;
          info = `Supporter ${supporter.id} reset action state of ${target.id}.`;
        }
        break;
      }
      case "destroy_town": {
        const destroyer = this.state.units.find((u) => u.id === action.unitId);
        if (destroyer) {
          const target = action.target ?? destroyer.pos;
          const tile2 = this.state.map.tiles[target.y]?.[target.x];
          if (tile2 && isTileDestroyableForRules(tile2)) {
            destroyTileForRules(tile2);
            info = `Unit ${destroyer.id} destroyed town at ${target.x},${target.y}`;
            addExp(destroyer, 30, ruleConfig.levelCap);
          }
          destroyer.hasMoved = true;
          destroyer.hasActed = true;
          standbyUnitId = destroyer.id;
        }
        break;
      }
      case "capture": {
        const unit2 = this.state.units.find((u) => u.id === action.unitId);
        if (unit2) {
          const tile2 = this.state.map.tiles[unit2.pos.y][unit2.pos.x];
          const previousOwnerId = tile2.ownerId;
          setTileOwnerForRules(tile2, unit2.ownerId);
          info = `Unit ${unit2.id} captured terrain at ${unit2.pos.x},${unit2.pos.y}`;
          reward += 10;
          unit2.hasMoved = true;
          unit2.hasActed = true;
          standbyUnitId = unit2.id;
          applyCampaignEvents(this.state, {
            type: "tile_occupied",
            pos: { ...unit2.pos },
            ownerId: unit2.ownerId,
            previousOwnerId
          });
        }
        break;
      }
      case "repair": {
        const unit2 = this.state.units.find((u) => u.id === action.unitId);
        if (unit2) {
          const tile2 = this.state.map.tiles[unit2.pos.y][unit2.pos.x];
          if (getTileTerrainKey(tile2) === "damaged_town") {
            setTileTerrainForRules(tile2, 9);
            setTileOwnerAfterRepairForRules(tile2);
            info = `Unit ${unit2.id} repaired town at ${unit2.pos.x},${unit2.pos.y}`;
            reward += 5;
          }
          unit2.hasMoved = true;
          unit2.hasActed = true;
          standbyUnitId = unit2.id;
        }
        break;
      }
      case "wait": {
        const unit2 = this.state.units.find((u) => u.id === action.unitId);
        if (unit2) {
          unit2.hasMoved = true;
          unit2.hasActed = true;
          standbyUnitId = unit2.id;
          info = `Unit ${unit2.id} waited.`;
        }
        break;
      }
      case "recruit_to_castle": {
        const player = this.state.players.find((p) => p.id === this.state.currentPlayer);
        if (player && canRecruitUnitClass(this.state, this.state.currentPlayer, action.unitClass)) {
          const castleOccupant = this.state.units.find((unit2) => unit2.pos.x === action.castlePos.x && unit2.pos.y === action.castlePos.y && unit2.hp > 0);
          const pendingSource = castleOccupant && castleOccupant.ownerId === this.state.currentPlayer && isCommanderUnit(this.state, castleOccupant, this.state.currentPlayer) ? "commander_castle" : "empty_castle";
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
            level: action.unitClass === "commander" ? player.commanderReserveLevel ?? 0 : 0,
            exp: action.unitClass === "commander" ? player.commanderReserveExp ?? 0 : 0,
            apkPendingRecruitSource: pendingSource
          });
          this.state.pendingUnitId = newUnitId;
          info = `\u62DB\u52DF\u5355\u4F4D\u8FDB\u5165\u5F85\u884C\u52A8\u72B6\u6001 at ${action.castlePos.x},${action.castlePos.y}`;
          reward += 1;
        } else {
          info = "\u62DB\u52DF\u5931\u8D25\uFF1A\u4E0D\u6EE1\u8DB3\u5F53\u524D\u89C4\u5219\u9650\u5236";
        }
        break;
      }
      case "recruit_and_deploy": {
        const player = this.state.players.find((p) => p.id === this.state.currentPlayer);
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
            level: action.unitClass === "commander" ? player.commanderReserveLevel ?? 0 : 0,
            exp: action.unitClass === "commander" ? player.commanderReserveExp ?? 0 : 0,
            apkPendingRecruitSource: "commander_castle"
          });
          this.state.pendingUnitId = newUnitId;
          standbyUnitId = newUnitId;
          info = `\u62DB\u52DF\u5355\u4F4D\u5DF2\u90E8\u7F72\uFF0C\u7B49\u5F85\u5B8C\u6210\u884C\u52A8 at ${action.to.x},${action.to.y}`;
          reward += 1;
        } else {
          info = "\u62DB\u52DF\u5931\u8D25\uFF1A\u4E0D\u6EE1\u8DB3\u5F53\u524D\u89C4\u5219\u9650\u5236";
        }
        break;
      }
      case "surrender": {
        const player = this.state.players.find((p) => p.id === this.state.currentPlayer);
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
      case "end_turn": {
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
      const standbyUnit = this.state.units.find((unit2) => unit2.id === standbyUnitId && unit2.hp > 0);
      if (standbyUnit?.hasActed) {
        if (hasAbility(standbyUnit, "assault_troop")) standbyUnit.hasPostAttackMoved = true;
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
            addExp(standbyUnit, KILL_EXP * auraResult.killedUnits.length, ruleConfig.levelCap);
          }
          applyCampaignEvents(this.state, { type: "unit_standby", unit: { ...standbyUnit, pos: { ...standbyUnit.pos } } });
        }
      }
    }
    const deadUnits = this.removeDeadUnits();
    if (deadUnits.length > 0) {
      for (const deadUnit of deadUnits) {
        applyCampaignEvents(this.state, { type: "unit_destroyed", unit: deadUnit });
      }
      info += ` Unit(s) died.`;
      reward += deadUnits.length * 10;
    }
    if (this.state.pendingUnitId) {
      const pendingUnit = this.state.units.find((u) => u.id === this.state.pendingUnitId);
      if (!pendingUnit || pendingUnit.hasActed || action.type === "end_turn" || action.type === "surrender") {
        delete this.state.pendingUnitId;
      }
    }
    this.checkWinConditions();
    if (!this.isTerminal()) {
      this.ensureCurrentPlayerCanAct(true);
      if (!this.disableAutoAdvanceWhenNoMeaningfulAction) {
        this.ensureCurrentPlayerHasMeaningfulAction();
      }
    }
    this.executingStep = false;
    this.fullLegalCache = void 0;
    return {
      state: this.getState(),
      reward,
      done: this.isTerminal(),
      info
    };
  }
  checkWinConditions() {
    if (this.state.winner !== null) return;
    const ruleConfig = getRuleConfig(this.state);
    for (const player of this.state.players) {
      if (!isActivePlayer(this.state, player.id)) continue;
      const hasUnits = this.state.units.some((u) => u.ownerId === player.id && u.hp > 0);
      const hasCommander = getCommanderUnit(this.state, player.id) !== null;
      const hasCastle = this.state.map.tiles.some((row) => row.some((tile2) => tile2.ownerId === player.id && getTileTerrainKey(tile2) === "castle"));
      const hasNoUnitsAndNoCastles = !hasUnits && !hasCastle;
      if (ruleConfig.defeatOnNoUnitsAndNoCastles && hasNoUnitsAndNoCastles || ruleConfig.defeatOnNoUnits && !hasUnits || ruleConfig.defeatOnCommanderDeath && !hasCommander || ruleConfig.defeatOnNoCastles && !hasCastle) {
        destroyTeamForRules(this.state, player.id);
      }
    }
    const alivePlayers = this.state.players.filter((p) => isActivePlayer(this.state, p.id));
    const aliveAlliances = [...new Set(alivePlayers.map((player) => getAllianceId(this.state, player.id)))];
    if (aliveAlliances.length === 1) {
      this.state.winner = aliveAlliances[0];
    } else if (aliveAlliances.length === 0) {
      this.state.winner = -1;
    }
  }
  ensureCurrentPlayerHasMeaningfulAction() {
    let guard = 0;
    while (!this.isTerminal() && guard < this.state.players.length) {
      const immediate = this.getLegalActions(this.state.currentPlayer, { skipMovement: true, skipRecruitment: true });
      if (immediate.some((action) => action.type !== "end_turn" && action.type !== "surrender")) return;
      const actions = this.getLegalActions(this.state.currentPlayer);
      const hasMeaningfulAction = actions.some((action) => action.type !== "end_turn" && action.type !== "surrender");
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
        applyCampaignEvents(this.state, { type: "unit_destroyed", unit: deadUnit });
      }
      this.checkWinConditions();
      this.ensureCurrentPlayerCanAct(true);
      guard += 1;
    }
  }
};

// ../src/game/env.ts
function calculateArmyValue(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const goldValue = player?.gold ?? 0;
  const unitValue = state.units.filter((unit2) => unit2.ownerId === playerId && unit2.hp > 0).reduce((sum, unit2) => {
    const configuredCost = getUnitCost(state, playerId, unit2.unitClass);
    const baseCost = configuredCost ?? UNIT_CONFIGS[unit2.unitClass].cost ?? 0;
    const hpRatio = Math.max(0, unit2.hp) / Math.max(1, getEffectiveStats(unit2).maxHp);
    return sum + baseCost * hpRatio + 1;
  }, 0);
  return goldValue + unitValue;
}
function encodeAction(action) {
  switch (action.type) {
    case "move":
      return `move:${action.unitId}:${action.to.x},${action.to.y}`;
    case "post_attack_move":
      return `post_attack_move:${action.unitId}:${action.to.x},${action.to.y}`;
    case "attack":
      return `attack:${action.attackerId}:${action.targetId}`;
    case "heal":
      return `heal:${action.healerId}:${action.targetId}`;
    case "support":
      return `support:${action.supporterId}:${action.targetId}`;
    case "summon":
      return `summon:${action.summonerId}:${action.graveId}:${action.spawnPos.x},${action.spawnPos.y}`;
    case "recruit_to_castle":
      return `recruit_to_castle:${action.unitClass}:${action.castlePos.x},${action.castlePos.y}`;
    case "recruit_and_deploy":
      return `recruit_and_deploy:${action.unitClass}:${action.castlePos.x},${action.castlePos.y}:${action.to.x},${action.to.y}`;
    case "capture":
      return `capture:${action.unitId}`;
    case "repair":
      return `repair:${action.unitId}`;
    case "destroy_town":
      return action.target ? `destroy_town:${action.unitId}:${action.target.x},${action.target.y}` : `destroy_town:${action.unitId}`;
    case "wait":
      return `wait:${action.unitId}`;
    case "surrender":
      return `surrender`;
    case "end_turn":
      return `end_turn`;
    default:
      return `unknown`;
  }
}
function decodeAction(code) {
  if (typeof code !== "string" || code.length === 0) return null;
  const parts = code.split(":");
  const type = parts[0];
  const parsePos = (token) => {
    if (typeof token !== "string") return null;
    const pieces = token.split(",");
    if (pieces.length !== 2) return null;
    const x = Number(pieces[0]);
    const y = Number(pieces[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
    return { x, y };
  };
  const isUnitClass = (token) => typeof token === "string" && Object.prototype.hasOwnProperty.call(UNIT_CONFIGS, token);
  switch (type) {
    case "move": {
      if (parts.length !== 3 || !parts[1]) return null;
      const to = parsePos(parts[2]);
      return to ? { type: "move", unitId: parts[1], to } : null;
    }
    case "post_attack_move": {
      if (parts.length !== 3 || !parts[1]) return null;
      const to = parsePos(parts[2]);
      return to ? { type: "post_attack_move", unitId: parts[1], to } : null;
    }
    case "attack": {
      if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
      return { type: "attack", attackerId: parts[1], targetId: parts[2] };
    }
    case "heal": {
      if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
      return { type: "heal", healerId: parts[1], targetId: parts[2] };
    }
    case "support": {
      if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
      return { type: "support", supporterId: parts[1], targetId: parts[2] };
    }
    case "summon": {
      if (parts.length !== 4 || !parts[1] || !parts[2]) return null;
      const spawnPos = parsePos(parts[3]);
      return spawnPos ? { type: "summon", summonerId: parts[1], graveId: parts[2], spawnPos } : null;
    }
    case "recruit_to_castle": {
      if (parts.length !== 3 || !isUnitClass(parts[1])) return null;
      const castlePos = parsePos(parts[2]);
      return castlePos ? { type: "recruit_to_castle", unitClass: parts[1], castlePos } : null;
    }
    case "recruit_and_deploy": {
      if (parts.length !== 4 || !isUnitClass(parts[1])) return null;
      const castlePos = parsePos(parts[2]);
      const to = parsePos(parts[3]);
      return castlePos && to ? { type: "recruit_and_deploy", unitClass: parts[1], castlePos, to } : null;
    }
    case "capture": {
      if (parts.length !== 2 || !parts[1]) return null;
      return { type: "capture", unitId: parts[1] };
    }
    case "repair": {
      if (parts.length !== 2 || !parts[1]) return null;
      return { type: "repair", unitId: parts[1] };
    }
    case "destroy_town": {
      if (parts.length === 2 && parts[1]) return { type: "destroy_town", unitId: parts[1] };
      if (parts.length !== 3 || !parts[1]) return null;
      const target = parsePos(parts[2]);
      return target ? { type: "destroy_town", unitId: parts[1], target } : null;
    }
    case "wait": {
      if (parts.length !== 2 || !parts[1]) return null;
      return { type: "wait", unitId: parts[1] };
    }
    case "surrender":
      return parts.length === 1 ? { type: "surrender" } : null;
    case "end_turn":
      return parts.length === 1 ? { type: "end_turn" } : null;
    default:
      return null;
  }
}

// ../src/game/ai/tactical_pathfinding.ts
var MinHeap = class {
  constructor() {
    this.items = [];
  }
  push(entry) {
    let index = this.items.length;
    this.items.push(entry);
    while (index > 0) {
      const parent = index - 1 >> 1;
      if (this.items[parent].cost <= entry.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = entry;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (!last || this.items.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child += 1;
      if (this.items[child].cost >= last.cost) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return first;
  }
};
var TacticalPathfinder = class {
  constructor(state) {
    this.state = state;
    this.occupants = /* @__PURE__ */ new Map();
    this.distances = /* @__PURE__ */ new Map();
    for (const unit2 of state.units) {
      const index = this.index(unit2.pos);
      if (unit2.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit2);
    }
  }
  index(pos) {
    return pos.y * this.state.map.width + pos.x;
  }
  cost(unit2, from, target) {
    if (from.x === target.x && from.y === target.y) return 0;
    const { width, height } = this.state.map;
    if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
    const key = `${unit2.id}:${from.x},${from.y}`;
    let costs = this.distances.get(key);
    if (!costs) {
      costs = this.buildDistances(unit2, from);
      this.distances.set(key, costs);
    }
    const cost = costs[this.index(target)];
    return Number.isFinite(cost) ? cost : null;
  }
  buildDistances(unit2, from) {
    const { width, height, tiles } = this.state.map;
    const costs = new Float64Array(width * height).fill(Infinity);
    const start = this.index(from);
    costs[start] = 0;
    const queue = new MinHeap();
    queue.push({ index: start, cost: 0 });
    const flying = isFlying(unit2);
    let current;
    while (current = queue.pop()) {
      if (current.cost > costs[current.index]) continue;
      const occupying = this.occupants.get(current.index);
      if (current.index !== start && occupying && !areAlliedPlayers(this.state, unit2.ownerId, occupying.ownerId) && !(flying && !isFlying(occupying))) continue;
      const x = current.index % width;
      const y = Math.floor(current.index / width);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const stepCost = getMoveCostForUnit(this.state, { ...unit2, pos: { x, y } }, tiles[ny][nx]);
        if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
        const nextCost = current.cost + stepCost;
        const next = ny * width + nx;
        if (nextCost < costs[next]) {
          costs[next] = nextCost;
          queue.push({ index: next, cost: nextCost });
        }
      }
    }
    return costs;
  }
};

// tactical_scale_20261018/path_cache.ts
var ReverseFinder = class {
  constructor(state, unit2) {
    this.state = state;
    this.unit = unit2;
    this.distances = /* @__PURE__ */ new Map();
  }
  nearest(unit2, targets) {
    const { width: w, height: h, tiles } = this.state.map;
    const key = targets.map((p) => p.y * w + p.x).join(",");
    let distances = this.distances.get(key);
    if (!distances) {
      distances = new Float64Array(w * h).fill(Infinity);
      const blocked = /* @__PURE__ */ new Set(), occupants = /* @__PURE__ */ new Set();
      for (const other of this.state.units) {
        const index = other.pos.y * w + other.pos.x;
        if (other.hp <= 0 || occupants.has(index)) continue;
        occupants.add(index);
        if (!areAlliedPlayers(this.state, unit2.ownerId, other.ownerId) && !(isFlying(unit2) && !isFlying(other))) blocked.add(index);
      }
      const queue = [];
      for (const p of targets) if (p.x >= 0 && p.y >= 0 && p.x < w && p.y < h) {
        const index = p.y * w + p.x;
        if (distances[index] !== 0) {
          distances[index] = 0;
          queue.push(index);
        }
      }
      const pending = new Set(queue);
      for (let offset = 0; offset < queue.length; offset++) {
        const index = queue[offset];
        pending.delete(index);
        const x = index % w, y = Math.floor(index / w);
        const step = getMoveCostForUnit(this.state, this.unit, tiles[y][x]);
        if (!Number.isFinite(step) || step >= 999999) continue;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = x + dx, ny = y + dy, next = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked.has(next)) continue;
          const value2 = distances[index] + step;
          if (value2 < distances[next]) {
            distances[next] = value2;
            if (!pending.has(next)) {
              pending.add(next);
              queue.push(next);
            }
          }
        }
      }
      this.distances.set(key, distances);
    }
    const value = distances[unit2.pos.y * w + unit2.pos.x];
    return Number.isFinite(value) ? value : null;
  }
};
var PathCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
  }
  finder(state, unit2) {
    const positions = new Set(state.units.filter((u) => u.hp > 0).map((u) => `${u.pos.x},${u.pos.y}`));
    if (positions.size !== state.units.filter((u) => u.hp > 0).length) {
      const fallback = new TacticalPathfinder(state);
      return { nearest: (actor, targets) => {
        const costs = targets.map((p) => fallback.cost(actor, actor.pos, p)).filter((v) => v !== null);
        return costs.length ? Math.min(...costs) : null;
      } };
    }
    const key = JSON.stringify([
      state.map,
      state.rules,
      unit2.ownerId,
      unit2.unitClass,
      unit2.apkMoveOverrides,
      state.units.filter((u) => u.id !== unit2.id && u.hp > 0).map((u) => [u.pos, u.ownerId, isFlying(u)])
    ]);
    let finder = this.cache.get(key);
    if (!finder) {
      finder = new ReverseFinder(state, unit2);
      this.cache.set(key, finder);
    }
    return finder;
  }
};

// tactical_scale_20261018/threat.ts
var THREAT_AUDIT = { calls: 0, exhaustiveFallbacks: 0, auraFallbacks: 0, settlementFallbacks: 0 };
var moveCache = /* @__PURE__ */ new Map();
var positiveCosts = /* @__PURE__ */ new Map();
var geometries = /* @__PURE__ */ new Map();
var stateGeometry = /* @__PURE__ */ new WeakMap();
function beginThreatScope() {
  moveCache = /* @__PURE__ */ new Map();
  positiveCosts = /* @__PURE__ */ new Map();
  geometries = /* @__PURE__ */ new Map();
  stateGeometry = /* @__PURE__ */ new WeakMap();
}
function cachedMoves(engine, state, enemy) {
  let geometry2 = stateGeometry.get(state);
  if (geometry2 === void 0) {
    const encoded = JSON.stringify([state.map, state.rules]);
    geometry2 = geometries.get(encoded);
    if (geometry2 === void 0) {
      geometry2 = geometries.size;
      geometries.set(encoded, geometry2);
    }
    stateGeometry.set(state, geometry2);
  }
  const costKey = JSON.stringify([geometry2, enemy.unitClass, enemy.apkMoveOverrides]);
  let positive = positiveCosts.get(costKey);
  if (positive === void 0) {
    positive = state.map.tiles.every((row) => row.every((tile2) => getMoveCostForUnit(state, enemy, tile2) >= 1));
    positiveCosts.set(costKey, positive);
  }
  const distance = Math.max(getEffectiveStats(enemy).move, enemy.movementRemaining ?? 0);
  const occupants = state.units.filter((u) => !positive || Math.abs(u.pos.x - enemy.pos.x) + Math.abs(u.pos.y - enemy.pos.y) <= distance).map((u) => [u.id, u.ownerId, u.pos, u.unitClass]);
  const key = JSON.stringify([
    geometry2,
    state.currentPlayer,
    state.pendingUnitId,
    state.units.find((u) => u.id === state.pendingUnitId),
    state.players.map((p) => [p.id, p.isAlive]),
    enemy,
    occupants
  ]);
  let actions = moveCache.get(key);
  if (!actions) {
    actions = engine.getLegalActions(state.currentPlayer, { unitId: enemy.id, skipRecruitment: true }).filter((a) => a.type === "move");
    moveCache.set(key, actions);
  }
  return actions;
}
function movingThreatExhaustive(engine, targets) {
  const initial = engine.getState();
  const result = new Map(targets.map((t) => [t.id, { damage: 0, lethal: 0, immediate: 0, witness: null }]));
  if (engine.isTerminal() || !targets.length) return result;
  const affected = (attacker, x, y) => {
    const stats = getEffectiveStats(attacker);
    return targets.some((t) => {
      const d = Math.abs(t.pos.x - x) + Math.abs(t.pos.y - y);
      return areEnemyPlayers(initial, attacker.ownerId, t.ownerId) && d >= stats.minRange && d <= stats.maxRange;
    });
  };
  const check = (branch, id, move = null) => {
    const state = branch.getState();
    if (state.currentPlayer !== initial.currentPlayer || branch.isTerminal()) return;
    for (const attack of branch.getLegalActions(state.currentPlayer, { unitId: id, onlyAttacks: true })) {
      if (attack.type !== "attack") continue;
      const target = targets.find((t) => t.id === attack.targetId);
      if (!target) continue;
      const value = result.get(target.id);
      const hit = branch.clone().step(attack);
      if (hit.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u7A77\u4E3E\u5A01\u80C1\u653B\u51FB\u975E\u6CD5");
      const remaining = hit.state.units.find((u) => u.id === target.id)?.hp ?? 0;
      const damage = Math.max(0, target.hp - remaining);
      if (!move) value.immediate = Math.max(value.immediate, damage);
      if (damage > value.damage) {
        value.damage = damage;
        value.lethal = Number(damage >= target.hp);
        value.witness = { move, attack };
      }
    }
  };
  for (const enemy of initial.units) {
    if (enemy.ownerId !== initial.currentPlayer || enemy.hasActed || enemy.apkStatic || !targets.some((t) => areEnemyPlayers(initial, enemy.ownerId, t.ownerId))) continue;
    if (affected(enemy, enemy.pos.x, enemy.pos.y)) check(engine, enemy.id);
    if (enemy.hasMoved) continue;
    const stats = getEffectiveStats(enemy);
    if (targets.every((t) => Math.abs(t.pos.x - enemy.pos.x) + Math.abs(t.pos.y - enemy.pos.y) > stats.move + stats.maxRange)) continue;
    const moves = cachedMoves(engine, initial, enemy).filter((a) => a.type === "move" && affected(enemy, a.to.x, a.to.y));
    for (const move of moves) {
      const branch = engine.clone();
      if (branch.step(move).info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u654C\u65B9\u79FB\u52A8\u5A01\u80C1\u5019\u9009\u975E\u6CD5");
      check(branch, enemy.id, move);
    }
  }
  return result;
}
function movingThreat(engine, targets) {
  THREAT_AUDIT.calls++;
  const state = engine.getState();
  const result = new Map(targets.map((t) => [t.id, { damage: 0, lethal: 0, immediate: 0, witness: null }]));
  if (engine.isTerminal() || !targets.length) return result;
  const activeUnits = engine.getLegalActions(state.currentPlayer, { skipMovement: true, skipRecruitment: true }).filter((a) => a.type === "wait");
  if (activeUnits.length <= 1 || state.pendingUnitId) {
    THREAT_AUDIT.exhaustiveFallbacks++;
    THREAT_AUDIT.settlementFallbacks++;
    return movingThreatExhaustive(engine, targets);
  }
  if (targets.some(isUndead) && state.units.some((u) => u.ownerId === state.currentPlayer && hasAbility(u, "cleansing_aura"))) {
    THREAT_AUDIT.exhaustiveFallbacks++;
    THREAT_AUDIT.auraFallbacks++;
    return movingThreatExhaustive(engine, targets);
  }
  for (const enemy of state.units) {
    if (enemy.ownerId !== state.currentPlayer || enemy.hasActed || enemy.apkStatic) continue;
    const stats = getEffectiveStats(enemy);
    const relevant = targets.filter((t) => areEnemyPlayers(state, enemy.ownerId, t.ownerId) && Math.abs(t.pos.x - enemy.pos.x) + Math.abs(t.pos.y - enemy.pos.y) <= Math.max(stats.move, enemy.movementRemaining ?? 0) + stats.maxRange);
    if (!relevant.length) continue;
    const legal = cachedMoves(engine, state, enemy);
    const moves = legal.filter((a) => a.type === "move");
    for (const move of [null, ...moves]) {
      const pos = move?.to ?? enemy.pos;
      if (!relevant.some((t) => {
        const d = Math.abs(t.pos.x - pos.x) + Math.abs(t.pos.y - pos.y);
        return d >= stats.minRange && d <= stats.maxRange;
      })) continue;
      const projected = move ? { ...state, units: state.units.map((u) => u.id === enemy.id ? { ...u, pos, hasMoved: true } : u) } : state;
      for (const attack of getLegalActions(projected, state.currentPlayer, { unitId: enemy.id, onlyAttacks: true })) {
        if (attack.type !== "attack") continue;
        const target = relevant.find((t) => t.id === attack.targetId);
        if (!target) continue;
        const damage = Math.min(target.hp, calculateDamage(projected, enemy.id, target.id));
        const value = result.get(target.id);
        if (!move) value.immediate = Math.max(value.immediate, damage);
        if (damage > value.damage) Object.assign(value, { damage, lethal: Number(damage >= target.hp), witness: { move, attack } });
      }
    }
  }
  for (const target of targets) {
    const value = result.get(target.id);
    if (!value.witness) continue;
    const witness = value.witness;
    const branch = engine.clone();
    if (witness.move && branch.step(witness.move).info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u6700\u5927\u5A01\u80C1\u79FB\u52A8\u89C1\u8BC1\u975E\u6CD5");
    const hit = branch.step(witness.attack);
    if (hit.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u6700\u5927\u5A01\u80C1\u653B\u51FB\u89C1\u8BC1\u975E\u6CD5");
    const remaining = hit.state.units.find((u) => u.id === target.id)?.hp ?? 0;
    if (Math.abs(target.hp - remaining - value.damage) > 1e-9) {
      THREAT_AUDIT.exhaustiveFallbacks++;
      THREAT_AUDIT.settlementFallbacks++;
      return movingThreatExhaustive(engine, targets);
    }
  }
  return result;
}
function nextOpponent(engine, player) {
  const branch = engine.clone();
  let state = branch.getState();
  if (!branch.isTerminal() && state.currentPlayer === player) {
    const end = branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }).find((a) => a.type === "end_turn");
    if (!end) return { branch, known: false };
    branch.step(end);
    state = branch.getState();
  }
  return { branch, known: branch.isTerminal() || areEnemyPlayers(state, player, state.currentPlayer) };
}

// tactical_scale_20261018/tactics.ts
var FEATURE_NAMES = [
  "followup_max_enemy_hp_loss",
  "followup_can_kill",
  "followup_can_capture",
  "followup_can_heal_or_summon",
  "actor_moving_reply_damage",
  "actor_moving_reply_lethal",
  "moving_reply_known",
  "commander_moving_reply_damage",
  "commander_moving_reply_lethal",
  "capture_path_before",
  "capture_path_after",
  "capture_path_gain",
  "capture_path_known",
  "enemy_path_before",
  "enemy_path_after",
  "enemy_path_gain",
  "enemy_path_known",
  "recruit_same_class_count",
  "recruit_can_capture",
  "recruit_move",
  "recruit_range",
  "recruit_flying"
];
var NEW_KEYS = FEATURE_NAMES.map((k) => "tactic_v2." + k);
function actorId(action, before, after) {
  for (const name of ["unitId", "attackerId", "healerId", "supporterId", "summonerId"]) {
    if (name in action) return action[name];
  }
  if (action.type.startsWith("recruit_")) return after.units.find((u) => !before.units.some((v) => v.id === u.id))?.id;
}

// tactical_exit_20261019/focus_threat.ts
var cache = /* @__PURE__ */ new WeakMap();
var movesCache = /* @__PURE__ */ new Map();
var geometry = /* @__PURE__ */ new Map();
var positiveCosts2 = /* @__PURE__ */ new Map();
var stateGeometry2 = /* @__PURE__ */ new WeakMap();
var FOCUS_AUDIT = { calls: 0, byTarget: /* @__PURE__ */ new Map() };
function beginFocusScope() {
  cache = /* @__PURE__ */ new WeakMap();
  movesCache = /* @__PURE__ */ new Map();
  geometry = /* @__PURE__ */ new Map();
  positiveCosts2 = /* @__PURE__ */ new Map();
  stateGeometry2 = /* @__PURE__ */ new WeakMap();
  FOCUS_AUDIT.calls = 0;
  FOCUS_AUDIT.byTarget.clear();
}
function geometryCosts(s, unit2) {
  let geom = stateGeometry2.get(s);
  if (geom === void 0) {
    const encoded = JSON.stringify([s.map, s.rules]);
    geom = geometry.get(encoded);
    if (geom === void 0) {
      geom = geometry.size;
      geometry.set(encoded, geom);
    }
    stateGeometry2.set(s, geom);
  }
  const costKey = JSON.stringify([geom, unit2.unitClass, unit2.apkMoveOverrides]);
  let positive = positiveCosts2.get(costKey);
  if (positive === void 0) {
    positive = s.map.tiles.every((row) => row.every((t) => getMoveCostForUnit(s, unit2, t) >= 1));
    positiveCosts2.set(costKey, positive);
  }
  return { geom, positive };
}
function legalMoves(engine, unit2, s) {
  const distance = Math.max(getEffectiveStats(unit2).move, unit2.movementRemaining ?? 0), { geom, positive } = geometryCosts(s, unit2);
  const occupants = s.units.filter((u) => !positive || Math.abs(u.pos.x - unit2.pos.x) + Math.abs(u.pos.y - unit2.pos.y) <= distance).map((u) => [u.id, u.ownerId, u.pos, u.unitClass]);
  const key = JSON.stringify([geom, s.currentPlayer, s.pendingUnitId, s.units.find((u) => u.id === s.pendingUnitId), s.players.map((p) => [p.id, p.isAlive]), unit2, occupants]);
  let moves = movesCache.get(key);
  if (!moves) {
    moves = engine.getLegalActions(s.currentPlayer, { unitId: unit2.id, skipRecruitment: true }).filter((a) => a.type === "move");
    movesCache.set(key, moves);
  }
  return moves;
}
function proposals(engine, target, used, snapshot) {
  const s = snapshot ?? engine.getState(), out = [];
  for (const unit2 of s.units) {
    if (unit2.ownerId !== s.currentPlayer || unit2.hasActed || unit2.apkStatic || used.has(unit2.id)) continue;
    const st = getEffectiveStats(unit2), distance = Math.abs(unit2.pos.x - target.pos.x) + Math.abs(unit2.pos.y - target.pos.y);
    if (distance > Math.max(st.move, unit2.movementRemaining ?? 0) + st.maxRange && geometryCosts(s, unit2).positive) continue;
    const moves = unit2.hasMoved ? [] : legalMoves(engine, unit2, s);
    let best;
    for (const move of [null, ...moves]) {
      const pos = move && move.type === "move" ? move.to : unit2.pos, d = Math.abs(pos.x - target.pos.x) + Math.abs(pos.y - target.pos.y);
      if (d < st.minRange || d > st.maxRange) continue;
      const projectedUnit = move ? { ...unit2, pos, hasMoved: true } : unit2, pending = s.units.find((u) => u.id === s.pendingUnitId);
      const units = [projectedUnit, ...target.id === unit2.id ? [] : [target], ...pending && pending.id !== unit2.id && pending.id !== target.id ? [pending] : []];
      const projected = { ...s, units };
      const attack = getLegalActions(projected, s.currentPlayer, { unitId: unit2.id, onlyAttacks: true }).find((a) => a.type === "attack" && a.targetId === target.id);
      if (!attack) continue;
      const damage = Math.min(target.hp, calculateDamage(projected, unit2.id, target.id)), key = (move ? encodeAction(move) : "") + "|" + encodeAction(attack);
      if (!best || damage > best.damage || damage === best.damage && key < best.key) best = { id: unit2.id, damage, move, attack, key };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.damage - a.damage || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function focusThreat(engine, targetId, snapshot) {
  FOCUS_AUDIT.calls++;
  FOCUS_AUDIT.byTarget.set(targetId, (FOCUS_AUDIT.byTarget.get(targetId) ?? 0) + 1);
  const initial = snapshot ?? engine.getState(), target = initial.units.find((u) => u.id === targetId);
  if (target && !engine.isTerminal()) {
    const reachable = initial.units.some((u) => {
      if (u.ownerId !== initial.currentPlayer || u.hasActed || u.apkStatic) return false;
      const st = getEffectiveStats(u), distance = Math.abs(u.pos.x - target.pos.x) + Math.abs(u.pos.y - target.pos.y);
      return distance <= Math.max(st.move, u.movementRemaining ?? 0) + st.maxRange || !geometryCosts(initial, u).positive;
    });
    if (!reachable) {
      let encoded2;
      return { damage: 0, lethal: 0, relaxed: 0, attackers: 0, single: 0, witness: [], get afterHashInput() {
        return encoded2 ??= JSON.stringify(initial);
      } };
    }
  }
  let states2 = cache.get(initial);
  if (!states2) {
    states2 = /* @__PURE__ */ new Map();
    cache.set(initial, states2);
  }
  const prior = states2.get(targetId);
  if (prior) return prior;
  let encoded;
  const out = { damage: 0, lethal: 0, relaxed: 0, attackers: 0, single: 0, witness: [], get afterHashInput() {
    return encoded ??= JSON.stringify(initial);
  } };
  if (!target || engine.isTerminal()) {
    states2.set(targetId, out);
    return out;
  }
  const used = /* @__PURE__ */ new Set(), player = initial.currentPlayer;
  const first = proposals(engine, target, used, initial);
  out.single = first[0]?.damage ?? 0;
  out.relaxed = first.slice(0, 3).reduce((s, p) => s + p.damage, 0);
  if (!first.length) {
    states2.set(targetId, out);
    return out;
  }
  const branch = engine.clone();
  let state = initial;
  for (let i = 0; i < 3 && !branch.isTerminal() && state.currentPlayer === player; i++) {
    const live = state.units.find((u) => u.id === targetId);
    if (!live) break;
    const p = (i === 0 ? first : proposals(branch, live, used, state))[0];
    if (!p) break;
    if (p.move) {
      const result2 = branch.step(p.move);
      if (result2.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u96C6\u706B\u79FB\u52A8\u89C1\u8BC1\u975E\u6CD5");
      state = result2.state;
      out.witness.push(p.move);
    }
    if (branch.isTerminal() || state.currentPlayer !== player) break;
    const attack = branch.getLegalActions(player, { unitId: p.id, onlyAttacks: true }).find((a) => encodeAction(a) === encodeAction(p.attack));
    if (!attack) break;
    const result = branch.step(attack);
    if (result.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u96C6\u706B\u653B\u51FB\u89C1\u8BC1\u975E\u6CD5");
    state = result.state;
    out.witness.push(attack);
    used.add(p.id);
    out.attackers++;
  }
  const remaining = state.units.find((u) => u.id === targetId)?.hp ?? 0;
  out.damage = Math.max(0, target.hp - remaining);
  out.lethal = Number(!state.units.some((u) => u.id === targetId));
  states2.set(targetId, out);
  return out;
}

// ../src/game/ai/runtime/skirmish_action_semantics.ts
function posOrEmpty(position) {
  return position ? { x: position.x, y: position.y } : null;
}
function unitPos(units, unitId) {
  if (!unitId) return null;
  const unit2 = units.get(unitId);
  return unit2 ? { x: unit2.x, y: unit2.y } : null;
}
function getActionSemantics(action, units) {
  const base = {
    actionType: action.type,
    actorId: null,
    actorPos: null,
    targetUnitId: null,
    targetPos: null,
    landingPos: null,
    sourceCastlePos: null,
    deployPos: null,
    targetExplicit: false
  };
  switch (action.type) {
    case "move":
    case "post_attack_move": {
      return {
        ...base,
        actorId: action.unitId,
        actorPos: unitPos(units, action.unitId),
        targetPos: posOrEmpty(action.to),
        landingPos: posOrEmpty(action.to),
        targetExplicit: true
      };
    }
    case "attack":
    case "heal":
    case "support": {
      const actorId3 = action.type === "attack" ? action.attackerId : action.type === "heal" ? action.healerId : action.supporterId;
      return {
        ...base,
        actorId: actorId3,
        actorPos: unitPos(units, actorId3),
        targetUnitId: action.targetId,
        targetPos: unitPos(units, action.targetId),
        targetExplicit: true
      };
    }
    case "capture":
    case "repair":
    case "wait": {
      const actorPos = unitPos(units, action.unitId);
      return {
        ...base,
        actorId: action.unitId,
        actorPos,
        // capture/repair/wait 作用在行动者所在格，目标格即行动者格
        targetPos: actorPos
      };
    }
    case "destroy_town": {
      const actorPos = unitPos(units, action.unitId);
      const explicit = action.target !== void 0 && action.target !== null;
      return {
        ...base,
        actorId: action.unitId,
        actorPos,
        // 引擎缺省语义：action.target ?? destroyer.pos
        targetPos: explicit ? posOrEmpty(action.target) : actorPos,
        targetExplicit: explicit
      };
    }
    case "summon": {
      return {
        ...base,
        actorId: action.summonerId,
        actorPos: unitPos(units, action.summonerId),
        targetPos: posOrEmpty(action.spawnPos),
        landingPos: posOrEmpty(action.spawnPos),
        targetExplicit: true
      };
    }
    case "recruit_to_castle": {
      return {
        ...base,
        sourceCastlePos: posOrEmpty(action.castlePos),
        targetPos: posOrEmpty(action.castlePos),
        targetExplicit: true
      };
    }
    case "recruit_and_deploy": {
      return {
        ...base,
        sourceCastlePos: posOrEmpty(action.castlePos),
        deployPos: posOrEmpty(action.to),
        landingPos: posOrEmpty(action.to),
        targetPos: posOrEmpty(action.to),
        targetExplicit: true
      };
    }
    case "surrender":
    case "end_turn":
      return base;
    default:
      return base;
  }
}

// ../src/ai_runtime/sd_v1/observation.ts
var CLASSES = "soldier ghost mermaid archer slime water_elemental dark_mage witch paladin elf berserker wolf golem ice_elemental druid catapult wolf_archer dragon commander skeleton crystal".split(" ");
var ACTIONS = "move attack capture repair wait recruit_to_castle recruit_and_deploy heal summon support destroy_town post_attack_move surrender end_turn".split(" ");
var RULES = "initialGold incomeVillage incomeCastle incomeCommanderBase incomeCommanderGrowth levelCap destroyerAttackBonus flyingWaterAttackBonus deathReaperAttackBonus inspiredAttackBonus sharpshooterAttackBonus terrainChildCombatBonus weakenedDefensePenalty unitLimit populationLimit recruitableUnits prices commanderRecruitBaseCost commanderRecruitCostGrowth allowSurrender allowPendingRecruitEndTurn allowPendingRecruitSurrender commanderCastleRecruitUsesPending defeatOnNoUnitsAndNoCastles defeatOnNoUnits defeatOnCommanderDeath defeatOnNoCastles alliances disabledTeams commanderUnitIds campaignEvents teams".split(" ");
function known(value, names, scope) {
  for (const key of Object.keys(value)) if (!names.includes(key)) throw Error(`\u672A\u77E5${scope}\u5B57\u6BB5:${key}`);
}
function flatten(value, prefix = "", out = {}) {
  if (value === void 0) return out;
  if (value === null || typeof value !== "object") {
    if (!["number", "string", "boolean"].includes(typeof value) && value !== null) throw Error("\u4E0D\u53EF\u7F16\u7801\u5B57\u6BB5");
    if (typeof value === "number" && !Number.isFinite(value)) throw Error("\u975E\u6709\u9650\u8F93\u5165");
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    out[prefix + ".length"] = value.length;
    for (const item of value) {
      if (typeof item !== "string" && typeof item !== "number") throw Error("\u9996\u8F6E\u4E0D\u652F\u6301\u590D\u6742\u89C4\u5219\u6570\u7EC4");
      out[`${prefix}.item.${item}`] = true;
    }
  } else {
    out[prefix + ".present"] = true;
    for (const key of Object.keys(value).sort()) flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}
function observe(state, legal) {
  known(state, "turn currentPlayer map units players winner graves nextUnitId nextGraveId pendingUnitId rules metadata apkScriptState".split(" "), "\u72B6\u6001");
  known(state.rules ?? {}, RULES, "\u89C4\u5219");
  if (state.rules?.campaignEvents?.length) throw Error("\u9996\u8F6E\u62D2\u7EDD\u6218\u5F79\u4E8B\u4EF6");
  if (Object.values(state.apkScriptState ?? {}).some((v) => Object.keys(v).length)) throw Error("\u9996\u8F6E\u62D2\u7EDD\u975E\u7A7A\u811A\u672C\u53D8\u91CF");
  if (state.map.width > 32 || state.map.height > 32) throw Error("\u9996\u8F6E\u5730\u56FE\u8303\u56F4\u8D85\u9650");
  const mentioned = /* @__PURE__ */ new Set([state.currentPlayer, ...state.players.map((p) => p.id), ...state.units.map((u) => u.ownerId), ...state.map.tiles.flat().flatMap((t) => t.ownerId == null ? [] : [t.ownerId]), ...(state.graves ?? []).flatMap((g) => g.ownerId == null ? [] : [g.ownerId]), ...state.rules?.disabledTeams ?? []]);
  for (const field of ["teams", "alliances", "commanderUnitIds"]) for (const id of Object.keys(state.rules?.[field] ?? {})) mentioned.add(Number(id));
  const ids = [state.currentPlayer, ...[...mentioned].filter((x) => x !== state.currentPlayer).sort((a, b) => a - b)];
  const owner = (id) => id == null ? null : ids.indexOf(id) < 0 ? (() => {
    throw Error("\u672A\u77E5\u5F52\u5C5E");
  })() : ids.indexOf(id);
  const alliances = ids.map((id) => state.rules?.alliances?.[id] ?? id);
  const ally = (id) => alliances.indexOf(id);
  const tokens = [], groups = [];
  const push = (kind, data, group) => {
    const i = tokens.length;
    tokens.push({ kind, ...flatten(data) });
    groups.push(group);
    return i;
  };
  const rules = { ...state.rules };
  for (const field of ["teams", "alliances"]) if (rules[field]) rules[field] = Object.fromEntries(Object.entries(rules[field]).map(([id, value]) => [owner(Number(id)), field === "alliances" ? ally(value) : value]));
  if (state.rules?.disabledTeams) rules.disabledTeams = state.rules.disabledTeams.map((id) => owner(id));
  delete rules.commanderUnitIds;
  delete rules.campaignEvents;
  push("global", { turn: state.turn, width: state.map.width, height: state.map.height, winner: state.winner == null ? null : state.winner === -1 ? -1 : ally(state.winner), rules }, 0);
  for (const p of state.players) {
    known(p, "id gold isAlive commanderDeathCount commanderReserveLevel commanderReserveExp".split(" "), "\u73A9\u5BB6");
    push("player", { ...p, id: owner(p.id), alliance: ally(state.rules?.alliances?.[p.id] ?? p.id), commanderConfigured: state.rules?.commanderUnitIds?.[p.id] !== void 0 }, 0);
  }
  const tiles = [];
  for (let y = 0; y < state.map.height; y++) {
    tiles[y] = [];
    for (let x = 0; x < state.map.width; x++) {
      const t = state.map.tiles[y][x];
      known(t, "terrainId ownerId apkTerrainId apkTerrainRaw apkOwnerCode apkTerrainKind apkTerrainIsLand apkMoveCost".split(" "), "\u5730\u5F62");
      const { apkTerrainRaw: _raw, apkOwnerCode: _ownerCode, ...rest } = t;
      tiles[y][x] = push("tile", { ...rest, ownerId: owner(t.ownerId), x, y }, 1);
    }
  }
  const unitRefs = /* @__PURE__ */ new Map(), graveRefs = /* @__PURE__ */ new Map();
  for (const u of state.units) {
    known(u, "id ownerId unitClass pos hp maxHp hasMoved hasActed status level exp movementRemaining hasPostAttackMoved hasBeenHealedThisTurn hasBeenSupportedThisTurn apkPendingRecruitSource apkUnitId apkUnitExtra apkUnitCode apkStatic apkTargeted apkUnitHead apkMoveOverrides".split(" "), "\u5355\u4F4D");
    if (!CLASSES.includes(u.unitClass)) throw Error("\u672A\u77E5\u5175\u79CD");
    const { id: _id, apkUnitId: _apkId, apkUnitExtra: _extra, apkUnitCode: _code, apkUnitHead: _head, ...rest } = u;
    unitRefs.set(u.id, push("unit", { ...rest, ownerId: owner(u.ownerId), pending: state.pendingUnitId === u.id, commander: isCommanderUnit(state, u) }, 2));
  }
  for (const g of state.graves ?? []) {
    known(g, "id pos remainingTurns ownerId".split(" "), "\u5893\u7891");
    const { id: _id, ...rest } = g;
    graveRefs.set(g.id, push("grave", { ...rest, ownerId: owner(g.ownerId) }, 3));
  }
  if (state.pendingUnitId && !unitRefs.has(state.pendingUnitId)) throw Error("\u60AC\u7A7Apending\u5F15\u7528");
  const units = new Map(state.units.map((u) => [u.id, { id: u.id, ...u.pos }]));
  const ordered = legal.map((action) => ({ action, code: encodeAction(action) })).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  if (ordered.some((v, i) => v.code === "unknown" || i > 0 && v.code === ordered[i - 1].code)) throw Error("\u5019\u9009\u52A8\u4F5C\u7801\u975E\u53CC\u5C04");
  const candidates = [], refs = [];
  for (const { action } of ordered) {
    const s = getActionSemantics(action, units);
    const pos = s.landingPos ?? s.targetPos ?? s.sourceCastlePos;
    candidates.push(flatten({ type: action.type, unitClass: "unitClass" in action ? action.unitClass : null, actorPos: s.actorPos, targetPos: s.targetPos, landingPos: s.landingPos, sourceCastlePos: s.sourceCastlePos, deployPos: s.deployPos, targetExplicit: s.targetExplicit }));
    const ref = (map, id) => id === null ? -1 : map.has(id) ? map.get(id) : (() => {
      throw Error("\u60AC\u7A7A\u52A8\u4F5C\u5F15\u7528");
    })();
    refs.push([ref(unitRefs, s.actorId), action.type === "summon" ? ref(graveRefs, action.graveId) : ref(unitRefs, s.targetUnitId), pos ? tiles[pos.y][pos.x] : -1]);
  }
  return { tokens, groups, candidates, refs, codes: ordered.map((v) => v.code) };
}

// sd64x3_phone_20261016/spatial.ts
var REL_KEYS = "actor_present focus_present target_present actor_hp actor_hp_fraction target_hp target_hp_fraction actor_level target_level other_source_distance other_focus_distance own_focus_distance other_approach other_near2_count own_near2_count other_near4_count own_near4_count other_near2_hp own_near2_hp nonown_castle_source_distance nonown_castle_focus_distance nonown_town_source_distance nonown_town_focus_distance own_castle_focus_distance focus_own focus_other focus_neutral focus_castle focus_town focus_move_cost target_other source_focus_distance".split(" ").map((k) => "rel32." + k);
function augment(x, s) {
  if (s.hidden !== 64 || s.candidate.keys.length !== s.baseCandidateCount + 42) throw Error("\u7A7A\u95F4schema\u8EAB\u4EFD\u4E0D\u7B26");
  const keys = new Map(s.token.keys.map((k, i) => [k, i]));
  const value = (r, key) => {
    const index = keys.get(key);
    if (index === void 0) throw Error("\u7A7A\u95F4\u57FA\u7840\u5B57\u6BB5\u7F3A\u5931:" + key);
    return r.find(([i]) => i === index)?.[1] ?? 0;
  };
  const entities = x.tokens.map((t, i) => {
    const unit2 = x.groups[i] === 2 || x.groups[i] === 3;
    const owner = value(t, "ownerId:null") ? null : Math.round(value(t, "ownerId:number") * 128);
    const raw2 = Math.round(value(t, "apkTerrainId:number") * 128), project = Math.round(value(t, "terrainId:number") * 128);
    const hasApkTerrain = t.some(([k]) => k === keys.get("apkTerrainId:present"));
    const terrain = hasApkTerrain && raw2 in s.terrainMap ? s.terrainMap[raw2] : project;
    return {
      index: i,
      x: Math.round(value(t, unit2 ? "pos.x:number" : "x:number") * 32),
      y: Math.round(value(t, unit2 ? "pos.y:number" : "y:number") * 32),
      owner,
      hp: value(t, "hp:number") * 128,
      maxHp: value(t, "maxHp:number") * 128,
      level: value(t, "level:number") * 128,
      castle: s.castleTerrain.includes(terrain),
      town: s.townTerrain.includes(terrain),
      moveCost: value(t, "apkMoveCost:number") * 128
    };
  });
  const units = entities.filter((_, i) => x.groups[i] === 2), tiles = entities.filter((_, i) => x.groups[i] === 1);
  const own = units.filter((u) => u.owner === 0), other = units.filter((u) => u.owner !== 0);
  const nc = tiles.filter((t) => t.castle && t.owner !== 0), nt = tiles.filter((t) => t.town && t.owner !== 0), oc = tiles.filter((t) => t.castle && t.owner === 0);
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const nearest = (p, list) => p && list.length ? Math.min(...list.map((q) => dist(p, q))) / 64 : 1;
  const near = (p, list, r) => p ? list.filter((q) => dist(p, q) <= r) : [];
  const candidates = x.candidates.map((candidate, i) => {
    if (candidate.some(([k]) => k >= s.baseCandidateCount)) throw Error("\u7A7A\u95F4\u7279\u5F81\u4E0D\u80FD\u91CD\u590D\u6DFB\u52A0");
    const refs = x.refs[i], a = refs[0] >= 0 ? entities[refs[0]] : void 0, b = refs[1] >= 0 ? entities[refs[1]] : void 0, d = refs[2] >= 0 ? entities[refs[2]] : void 0;
    const ownOthers = own.filter((u) => u.index !== a?.index), e2 = near(d, other, 2), a2 = near(d, ownOthers, 2);
    const v = [
      Number(!!a),
      Number(!!d),
      Number(!!b),
      (a?.hp ?? 0) / 128,
      a?.maxHp ? a.hp / a.maxHp : 0,
      (b?.hp ?? 0) / 128,
      b?.maxHp ? b.hp / b.maxHp : 0,
      (a?.level ?? 0) / 8,
      (b?.level ?? 0) / 8,
      nearest(a, other),
      nearest(d, other),
      nearest(d, ownOthers),
      a && d ? nearest(a, other) - nearest(d, other) : 0,
      e2.length / 32,
      a2.length / 32,
      near(d, other, 4).length / 32,
      near(d, ownOthers, 4).length / 32,
      e2.reduce((n, u) => n + u.hp, 0) / 4096,
      a2.reduce((n, u) => n + u.hp, 0) / 4096,
      nearest(a, nc),
      nearest(d, nc),
      nearest(a, nt),
      nearest(d, nt),
      nearest(d, oc),
      Number(d?.owner === 0),
      Number(!!d && d.owner !== null && d.owner !== 0),
      Number(!!d && d.owner === null),
      Number(!!d?.castle),
      Number(!!d?.town),
      (d?.moveCost ?? 0) / 16,
      Number(!!b && b.owner !== null && b.owner !== 0),
      a && d ? dist(a, d) / 64 : 0
    ];
    if (v.length !== 32 || v.some((n) => !Number.isFinite(n))) throw Error("\u7A7A\u95F4\u7279\u5F81\u957F\u5EA6\u6216\u6570\u503C\u975E\u6CD5");
    return [...candidate, ...v.map((value2, j) => [s.baseCandidateCount + j, Math.fround(value2)])];
  });
  return { ...x, candidates };
}

// sd64x3_phone_20261016/model.ts
function fields(record) {
  const out = [];
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    out.push([`${key}:present`, 1]);
    if (v === null) out.push([`${key}:null`, 1]);
    else if (typeof v === "number") out.push([`${key}:number`, v / (/gold|income|Cost|prices|exp/i.test(key) ? 1024 : /(?:^|\.)[xy]$|width|height/.test(key) ? 32 : 128)]);
    else out.push([`${key}=${String(v)}`, 1]);
  }
  return out;
}
function encodeBase(packet, schema) {
  const part = (records, spec) => {
    const lookup = new Map(spec.keys.map((key, i) => [key, i]));
    return records.map((record) => fields(record).map(([key, value]) => {
      const index = lookup.get(key);
      if (index === void 0) throw Error(`schema\u62D2\u7EDD\u672A\u77E5\u7279\u5F81:${key}`);
      return [index, Math.fround(value)];
    }).sort((a, b) => a[0] - b[0]));
  };
  return { tokens: part(packet.tokens, schema.token), groups: packet.groups, candidates: part(packet.candidates, { keys: schema.candidate.keys.slice(0, schema.baseCandidateCount) }), refs: packet.refs, codes: packet.codes };
}
function encode(packet, schema, tactics) {
  const x = augment(encodeBase(packet, schema), schema);
  if (tactics.length !== x.candidates.length || tactics.some((v) => v.length !== 10 || v.some((z) => !Number.isFinite(z)))) throw Error("\u6218\u672F\u5019\u9009\u5408\u540C\u9519\u8BEF");
  return { ...x, candidates: x.candidates.map((v, i) => [...v, ...tactics[i].map((z, k) => [schema.baseCandidateCount + 32 + k, Math.fround(z)])]) };
}

// tactical_scale_20261018/encoding.ts
function observationState(state) {
  if (state.rules?.populationLimit === void 0) return state;
  const copy = structuredClone(state), rules = copy.rules;
  if (rules.unitLimit !== void 0 || rules.allowZeroPopulationRecruitAtLimit !== true) throw Error("\u65E7schema\u6295\u5F71\u524D\u63D0\u4E0D\u6EE1\u8DB3");
  rules.unitLimit = rules.populationLimit;
  delete rules.populationLimit;
  delete rules.allowZeroPopulationRecruitAtLimit;
  for (const team of Object.values(rules.teams ?? {})) {
    if (team.populationLimit !== void 0) {
      if (team.unitLimit !== void 0) throw Error("\u961F\u4F0D\u4E0A\u9650\u542B\u6DF7");
      team.unitLimit = team.populationLimit;
      delete team.populationLimit;
    }
  }
  return copy;
}
function encodeFeatures(packet, oldSchema, features) {
  const x = encode(packet, oldSchema, features.old);
  const offset = oldSchema.candidate.keys.length;
  return { ...x, candidates: x.candidates.map((row, i) => [...row, ...features.extra[i].map((v, j) => [offset + j, v])]) };
}

// tactical_value_search_20261018/value_model.ts
function valueLayout(input, hidden = 64) {
  const b = input * hidden, n = b + hidden, o = n + 2 * hidden;
  return { input, hidden, b, n, o, ob: o + hidden, count: o + hidden + 1 };
}
function forwardValue(input, weights, target = 0, gradient = false) {
  const l = valueLayout(input.length), h = l.hidden, w = weights;
  const residual = w.length === l.count + 6;
  if (w.length !== l.count && !residual) throw Error("\u4EF7\u503C\u5934\u5F62\u72B6\u4E0D\u7B26");
  const z = w.slice(l.b, l.n);
  for (let i = 0; i < input.length; i++) for (let j = 0; j < h; j++) z[j] += input[i] * w[i * h + j];
  const mean = z.reduce((a2, b) => a2 + b, 0) / h, inverse = 1 / Math.sqrt(z.reduce((a2, b) => a2 + (b - mean) ** 2, 0) / h + 1e-5);
  const norm2 = z.map((v) => (v - mean) * inverse), a = norm2.map((v, j) => Math.max(0, v * w[l.n + j] + w[l.n + h + j]));
  const phase = input.slice(input.length - 8, input.length - 5), army = input.at(-1), skip = residual ? [...phase.map((v) => v * army), ...phase] : [];
  const logit = a.reduce((s, v, j) => s + v * w[l.o + j], w[l.ob]) + skip.reduce((s, v, j) => s + v * w[l.count + j], 0);
  const value = Math.tanh(logit), loss = (value - target) ** 2;
  const dw = gradient ? Array(w.length).fill(0) : [];
  if (gradient) {
    const dv = 2 * (value - target) * (1 - value * value);
    dw[l.ob] = dv;
    skip.forEach((v, j) => dw[l.count + j] = dv * v);
    const dn = a.map((v, j) => {
      dw[l.o + j] = dv * v;
      const d = dv * w[l.o + j] * Number(v > 0);
      dw[l.n + j] = d * norm2[j];
      dw[l.n + h + j] = d;
      return d * w[l.n + j];
    });
    const avg = dn.reduce((s, v) => s + v, 0) / h, dot = dn.reduce((s, v, j) => s + v * norm2[j], 0) / h;
    const dz = dn.map((v, j) => inverse * (v - avg - norm2[j] * dot));
    for (let j = 0; j < h; j++) {
      dw[l.b + j] = dz[j];
      for (let i = 0; i < input.length; i++) dw[i * h + j] = input[i] * dz[j];
    }
  }
  return { value, loss, gradient: dw };
}

// tactical_exit_20261019/value_state.ts
var VALUE_KEYS = ["own", "enemy"].flatMap((side) => ["gold", "units", "hp", "commander_hp", "commanders", "income", "towns", "castles", "army", "ready", "focus_damage", "focus_lethal", "single_damage", "focus_relaxed"].map((k) => side + "." + k));
var SUMMARY_KEYS = [...VALUE_KEYS, "turn", "phase.opening", "phase.middle", "phase.late", "can_still_recruit", "has_free_attack", "risk_known.own", "risk_known.enemy"];
var STATE_VALUE_AUDIT = { attackWitnessSteps: 0 };
var emptyRisk = () => ({ damage: 0, lethal: 0, relaxed: 0, attackers: 0, single: 0, witness: [], afterHashInput: "" });
function economy(s, id) {
  const units = s.units.filter((u) => u.ownerId === id), commanders = units.filter((u) => isCommanderUnit(s, u, id)), rules = getRuleConfig(s);
  let towns = 0, castles = 0, income = commanders.reduce((n, u) => n + rules.incomeCommanderBase + (u.level ?? 0) * rules.incomeCommanderGrowth, 0);
  for (const row of s.map.tiles) for (const t of row) if (t.ownerId === id) {
    const k = getTileTerrainKey(t);
    towns += Number(k === "town");
    castles += Number(k === "castle");
    income += getTileIncome(s, t);
  }
  return { gold: s.players.find((p) => p.id === id)?.gold ?? 0, units, commanders, towns, castles, income, army: calculateArmyValue(s, id) };
}
function opponentSnapshot(engine, player, snapshot) {
  const branch = engine.clone();
  let state = snapshot ?? engine.getState();
  if (!branch.isTerminal() && state.currentPlayer === player) {
    const end = branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }).find((a) => a.type === "end_turn");
    if (!end) return { branch, state, known: false };
    state = branch.step(end).state;
  }
  return { branch, state, known: branch.isTerminal() || areEnemyPlayers(state, player, state.currentPlayer) };
}
function commanderRisks(engine, prepared = [], snapshot) {
  const s = snapshot ?? engine.getState(), out = [...prepared];
  if (!prepared.length) beginFocusScope();
  for (const p of s.players) {
    const commanders = s.units.filter((u) => u.ownerId === p.id && isCommanderUnit(s, u, p.id));
    if (!commanders.length) continue;
    const reply = s.currentPlayer === p.id ? opponentSnapshot(engine, p.id, s) : { branch: engine, state: s, known: true };
    const after = reply.state;
    for (const u of commanders) {
      if (out.some((r2) => r2.id === u.id)) continue;
      const present = after.units.some((v) => v.id === u.id);
      const r = present && reply.known && !reply.branch.isTerminal() ? focusThreat(reply.branch, u.id, after) : emptyRisk();
      out.push({ id: u.id, owner: p.id, known: reply.known, risk: present ? r : { ...r, damage: u.hp, lethal: 1 } });
    }
  }
  return out;
}
function stateSummary(engine, providedRisks, snapshot) {
  STATE_VALUE_AUDIT.attackWitnessSteps = 0;
  const s = snapshot ?? engine.getState(), own = s.currentPlayer, enemy = s.players.find((p) => p.id !== own).id, risks = providedRisks ?? commanderRisks(engine, [], s), out = [];
  for (const id of [own, enemy]) {
    const e = economy(s, id), r = risks.filter((v) => v.owner === id);
    out.push(
      e.gold / 1024,
      e.units.length / 32,
      e.units.reduce((n, u) => n + u.hp, 0) / 4096,
      e.commanders.reduce((n, u) => n + u.hp, 0) / 128,
      e.commanders.length,
      e.income / 512,
      e.towns / 32,
      e.castles / 32,
      e.army / 1024,
      e.units.filter((u) => !u.hasActed).length / 32,
      Math.max(0, ...r.map((v) => v.risk.damage)) / 128,
      Math.max(0, ...r.map((v) => v.risk.lethal)),
      Math.max(0, ...r.map((v) => v.risk.single)) / 128,
      Math.max(0, ...r.map((v) => v.risk.relaxed)) / 128
    );
  }
  const global = engine.getLegalActions(own, { skipMovement: true });
  const canRecruit = global.some((a) => a.type.startsWith("recruit_"));
  const freeAttack = global.some((a) => {
    if (a.type !== "attack" || calculateDamage(s, a.attackerId, a.targetId) <= 0) return false;
    STATE_VALUE_AUDIT.attackWitnessSteps++;
    const old2 = s.units.find((u) => u.id === a.attackerId), after = engine.clone().step(a).state;
    return (after.units.find((u) => u.id === old2.id)?.hp ?? 0) >= old2.hp;
  });
  out.push(Math.min(s.turn, 100) / 100, Number(s.turn <= 5), Number(s.turn > 5 && s.turn <= 15), Number(s.turn > 15), Number(canRecruit), Number(freeAttack), Number(risks.filter((v) => v.owner === own).every((v) => v.known)), Number(risks.filter((v) => v.owner === enemy).every((v) => v.known)));
  return out.map(Math.fround);
}
var embeddingCaches = /* @__PURE__ */ new WeakMap();
var tokenCaches = /* @__PURE__ */ new WeakMap();
function stateTokens(s, oldSchema) {
  const packet = observe(observationState(s), []);
  let cache2 = tokenCaches.get(oldSchema);
  if (!cache2) {
    cache2 = { lookup: new Map(oldSchema.token.keys.map((k, i) => [k, i])), rows: /* @__PURE__ */ new Map() };
    tokenCaches.set(oldSchema, cache2);
  }
  const tokens = packet.tokens.map((record) => {
    const key = JSON.stringify(record);
    let row = cache2.rows.get(key);
    if (!row) {
      row = fields(record).map(([key2, v]) => {
        const i = cache2.lookup.get(key2);
        if (i === void 0) throw Error("\u672A\u77E5\u72B6\u6001\u7279\u5F81:" + key2);
        return [i, Math.fround(v)];
      }).sort((a, b) => a[0] - b[0]);
      if (cache2.rows.size > 16e3) cache2.rows.clear();
      cache2.rows.set(key, row);
    }
    return row;
  });
  return { tokens, groups: packet.groups, candidates: [], refs: [], codes: [] };
}
function pooledContext(x, model2) {
  const h = model2.schema.hidden, w = model2.weights, eb = model2.schema.token.keys.length * h, context = Array(4 * h + 4).fill(0), counts = [0, 0, 0, 0];
  let cache2 = embeddingCaches.get(model2);
  if (!cache2) {
    cache2 = /* @__PURE__ */ new Map();
    embeddingCaches.set(model2, cache2);
  }
  x.tokens.forEach((token, t) => {
    const key = JSON.stringify(token);
    let e = cache2.get(key);
    if (!e) {
      e = w.slice(eb, eb + h);
      for (const [i, v] of token) for (let j = 0; j < h; j++) e[j] += v * w[i * h + j];
      e = e.map((v) => Math.max(0, v));
      if (cache2.size > 16e3) cache2.clear();
      cache2.set(key, e);
    }
    const g = x.groups[t];
    counts[g]++;
    for (let j = 0; j < h; j++) context[g * h + j] += e[j];
  });
  for (let g = 0; g < 4; g++) {
    for (let j = 0; j < h; j++) context[g * h + j] /= Math.max(1, counts[g]);
    context[4 * h + g] = counts[g] / 1024;
  }
  return context;
}
function valueInput(context, summary) {
  return [...context, ...summary, summary[8] - summary[22]];
}
function evaluateValue(engine, model2, oldSchema, risks) {
  const s = engine.getState(), context = pooledContext(stateTokens(s, oldSchema), model2), summary = stateSummary(engine, risks, s);
  return forwardValue(valueInput(context, summary), model2.valueWeights).value;
}

// tactical_exit_20261019/leaf.ts
function unitArmy(s, id) {
  return calculateArmyValue(s, id) - (s.players.find((p) => p.id === id)?.gold ?? 0);
}
function ledger(before, after, player) {
  const enemy = before.players.find((p) => p.id !== player).id;
  const loss = (id) => {
    let damage = 0, recovered = 0;
    for (const u of before.units.filter((u2) => u2.ownerId === id)) {
      const retained = after.units.find((v) => v.id === u.id), old2 = unitArmy({ ...before, units: [u] }, id), next = retained ? unitArmy({ ...after, units: [retained] }, id) : 0;
      damage += Math.max(0, old2 - next);
      recovered += Math.max(0, next - old2);
    }
    return { damage, recovered };
  };
  const own = loss(player), other = loss(enemy), ownLoss = own.damage, enemyLoss = other.damage;
  const added = after.units.filter((u) => u.ownerId === player && !before.units.some((v) => v.id === u.id));
  const recruitedValue = unitArmy({ ...after, units: added }, player);
  const goldSpent = Math.max(0, (before.players.find((p) => p.id === player)?.gold ?? 0) - (after.players.find((p) => p.id === player)?.gold ?? 0));
  const recruitSurplus = Math.min(0, recruitedValue - added.length - goldSpent);
  let castles = 0, towns = 0, enemyCastlesCaptured = 0, captures = 0;
  before.map.tiles.forEach((row, y) => row.forEach((tile2, x) => {
    const next = after.map.tiles[y][x], key = getTileTerrainKey(tile2), nextKey = getTileTerrainKey(next);
    const change = (kind, id) => Number(nextKey === kind && next.ownerId === id) - Number(key === kind && tile2.ownerId === id);
    castles += change("castle", player) - change("castle", enemy);
    towns += change("town", player) - change("town", enemy);
    enemyCastlesCaptured += Number(key === "castle" && nextKey === "castle" && tile2.ownerId === enemy && next.ownerId === player);
    captures += Number((nextKey === "castle" || nextKey === "town") && tile2.ownerId !== player && next.ownerId === player);
  }));
  const dead = (id) => before.units.filter((u) => u.ownerId === id && !after.units.some((v) => v.id === u.id));
  const ownDead = dead(player), enemyDead = dead(enemy);
  return {
    net: (enemyLoss - ownLoss + recruitSurplus) / 1024,
    enemyLoss,
    ownLoss,
    healingNet: own.recovered - other.recovered,
    recruitedValue,
    goldSpent,
    recruitSurplus,
    castles,
    towns,
    captures,
    recruits: added.length,
    enemyCastlesCaptured,
    enemyKills: enemyDead.length,
    enemyCommanderKills: enemyDead.filter((u) => isCommanderUnit(before, u, enemy)).length,
    ownCommanderLost: ownDead.filter((u) => isCommanderUnit(before, u, player)).length
  };
}
function retaliation(engine, player, actor) {
  const before = engine.getState(), reply = opponentSnapshot(engine, player, before), s = reply.state, out = [];
  beginFocusScope();
  if (!reply.known) return { known: false, risks: out };
  const targets = before.units.filter((u) => u.ownerId === player && (u.id === actor || isCommanderUnit(before, u, player)));
  beginThreatScope();
  const singles = reply.branch.isTerminal() ? /* @__PURE__ */ new Map() : movingThreat(reply.branch, s.units.filter((u) => targets.some((v) => v.id === u.id)));
  for (const u of targets) {
    const live = s.units.find((v) => v.id === u.id);
    let r;
    if (live && !reply.branch.isTerminal()) r = focusThreat(reply.branch, u.id, s);
    const single = singles.get(u.id), useSingle = !!single && (single.lethal > (r?.lethal ?? 0) || single.damage > (r?.damage ?? 0));
    const sw = single?.witness;
    out.push({ id: u.id, commander: isCommanderUnit(before, u, player), hp: u.hp, army: unitArmy({ ...before, units: [u] }, player), damage: !live ? u.hp : Math.max(r?.damage ?? 0, single?.damage ?? 0), lethal: !live ? 1 : Math.max(r?.lethal ?? 0, single?.lethal ?? 0), witness: useSingle && sw ? [...sw.move ? [sw.move] : [], sw.attack] : r?.witness ?? [], replyState: s, focus: r });
  }
  return { known: true, risks: out };
}
function evaluateLeaf(before, engine, player, actor, model2, oldSchema, actorStart) {
  const after = engine.getState(), events = ledger(before, after, player), naturalWin = after.winner !== null && after.winner === getAllianceId(after, player);
  const danger = after.winner === null ? retaliation(engine, player, actor) : { known: true, risks: [] };
  const commanderLethal = events.ownCommanderLost > 0 || danger.risks.some((r) => r.commander && !!r.lethal), actorRisk = danger.risks.find((r) => r.id === actor);
  const actorUnit = actorStart ?? before.units.find((u) => u.id === actor), actorLost = !!actorUnit && !after.units.some((u) => u.id === actorUnit.id);
  const actorLethal = actorLost || !!actorRisk?.lethal, exposure = danger.risks.reduce((n, r) => n + r.damage / Math.max(1, r.hp) * r.army / 1024, 0);
  const fullActorValue = actorUnit ? unitArmy({ ...before, units: [{ ...actorUnit, hp: getEffectiveStats(actorUnit).maxHp }] }, player) - 1 : 0;
  const highValueActor = !!actorUnit && (isCommanderUnit(before, actorUnit, player) || isCommanderUnit(after, actorUnit, player) || actorUnit.unitClass === "commander" || fullActorValue >= 200);
  const prepared = danger.risks.filter((r) => r.commander && r.focus).map((r) => ({ id: r.id, owner: player, known: danger.known, risk: r.focus }));
  const value = after.winner !== null ? naturalWin ? 1 : after.winner === -1 ? 0 : -1 : evaluateValue(engine, model2, oldSchema, commanderRisks(engine, prepared)) * (after.currentPlayer === player ? 1 : -1);
  const tactical = events.net + 0.05 * events.healingNet / 1024 + 0.18 * events.castles + 0.09 * events.towns + 0.5 * (events.enemyCommanderKills - events.ownCommanderLost);
  const score = after.winner !== null ? value * 10 : value * 0.25 + tactical - 0.25 * exposure - 1.5 * Number(commanderLethal) - 0.35 * Number(actorLethal);
  return { score, value, tactical, exposure, naturalWin, commanderLethal, actorLethal, actorLost, highValueActor, riskKnown: danger.known, risks: danger.risks, ...events };
}

// tactical_value_search_20261018/action_groups.ts
function groupKey(a) {
  const actor = a.unitId ?? a.attackerId ?? a.healerId ?? a.summonerId ?? a.supporterId;
  return (actor !== void 0 ? `unit:${actor}` : a.castlePos ? `castle:${a.castlePos.x},${a.castlePos.y}` : "global") + "|" + a.type;
}

// tactical_exit_20261019/combined_tactics.ts
var FEATURE_NAMES2 = [
  "followup_max_enemy_hp_loss",
  "followup_can_kill",
  "followup_can_capture",
  "followup_can_heal_or_summon",
  "actor_moving_reply_damage",
  "actor_moving_reply_lethal",
  "moving_reply_known",
  "commander_moving_reply_damage",
  "commander_moving_reply_lethal",
  "capture_path_before",
  "capture_path_after",
  "capture_path_gain",
  "capture_path_known",
  "enemy_path_before",
  "enemy_path_after",
  "enemy_path_gain",
  "enemy_path_known",
  "recruit_same_class_count",
  "recruit_can_capture",
  "recruit_move",
  "recruit_range",
  "recruit_flying"
];
var NEW_KEYS2 = FEATURE_NAMES2.map((k) => "tactic_v2." + k);
function actorId2(action, before, after) {
  for (const name of ["unitId", "attackerId", "healerId", "supporterId", "summonerId"]) {
    if (name in action) return action[name];
  }
  if (action.type.startsWith("recruit_")) return after.units.find((u) => !before.units.some((v) => v.id === u.id))?.id;
}
function extractFeatures(engine, actions) {
  const before = engine.getState(), player = before.currentPlayer;
  const original = JSON.stringify(before);
  const hp = (s, own) => s.units.filter((u) => areAlliedPlayers(s, u.ownerId, player) === own).reduce((n, u) => n + u.hp, 0);
  const count = (s, own) => s.units.filter((u) => areAlliedPlayers(s, u.ownerId, player) === own).length;
  beginThreatScope();
  beginFocusScope();
  const pathBefore = new TacticalPathfinder(before), paths = new PathCache();
  const aura = enemiesNeedCorrection(before);
  const ownCommanders = before.units.filter((u) => u.ownerId === player && isCommanderUnit(before, u, player)).map((u) => u.id);
  const enemies = before.units.filter((u) => areEnemyPlayers(before, player, u.ownerId));
  const tiles = before.map.tiles.flatMap((row, y) => row.flatMap((tile2, x) => {
    const key = getTileTerrainKey(tile2);
    return (key === "town" || key === "castle") && (tile2.ownerId === null || areEnemyPlayers(before, player, tile2.ownerId)) ? [{ tile: tile2, x, y }] : [];
  }));
  const nearest = (finder, unit2, positions) => {
    let best = Infinity;
    for (const pos of positions) {
      const cost = finder.cost(unit2, unit2.pos, pos);
      if (cost !== null) best = Math.min(best, cost);
    }
    return Number.isFinite(best) ? best : null;
  };
  const fallbackBefore = THREAT_AUDIT.exhaustiveFallbacks;
  const stats = { candidates: actions.length, stepMs: 0, followupMs: 0, threatMs: 0, pathMs: 0, exhaustiveFallbacks: 0 };
  const old2 = [], extra = [], focus = [];
  const global = engine.getLegalActions(player, { skipMovement: true }), canRecruit = global.some((a) => a.type.startsWith("recruit_"));
  const freeAttack = global.some((a) => {
    if (a.type !== "attack" || calculateDamage(before, a.attackerId, a.targetId) <= 0) return false;
    const b = engine.clone(), u = before.units.find((u2) => u2.id === a.attackerId);
    b.step(a);
    return (b.getState().units.find((v) => v.id === u.id)?.hp ?? 0) >= u.hp;
  });
  for (const action of actions) {
    const stepStart = performance.now();
    const branch = engine.clone(), applied = branch.step(action);
    stats.stepMs += performance.now() - stepStart;
    if (applied.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u7279\u5F81\u8F93\u5165\u4E0D\u662F\u6743\u5A01\u5408\u6CD5\u52A8\u4F5C:" + encodeAction(action));
    const after = applied.state, id = actorId2(action, before, after);
    const actor = after.units.find((u) => u.id === id), previous = before.units.find((u) => u.id === id);
    const followupStart = performance.now();
    let followDamage = 0, followKill = 0, followCapture = 0, followSkill = 0;
    if (actor && !actor.hasActed && after.currentPlayer === player && !branch.isTerminal()) {
      for (const follow of branch.getLegalActions(player, { unitId: actor.id, skipMovement: true, skipRecruitment: true })) {
        if (follow.type === "capture") followCapture = 1;
        if (follow.type === "heal" || follow.type === "summon") followSkill = 1;
        if (follow.type === "attack") {
          const hit = branch.clone().step(follow).state;
          followDamage = Math.max(followDamage, hp(after, false) - hp(hit, false));
          followKill = Math.max(followKill, Number(count(hit, false) < count(after, false)));
        }
      }
    }
    let captured = 0;
    before.map.tiles.forEach((row, y) => row.forEach((tile2, x) => {
      if (tile2.ownerId !== player && after.map.tiles[y][x].ownerId === player) captured++;
    }));
    const afterLegal = after.currentPlayer === player && !branch.isTerminal() ? branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }) : [];
    const supports = afterLegal.filter((a) => (a.type === "heal" || a.type === "support") && a.targetId === id).length;
    stats.followupMs += performance.now() - followupStart;
    const threatStart = performance.now();
    const reply = nextOpponent(branch, player), replyState = reply.branch.getState();
    const targets = replyState.units.filter((u) => u.id === id || ownCommanders.includes(u.id));
    const current = replyState.units.filter((u) => u.ownerId === replyState.currentPlayer);
    const full = aura && current.some((u) => hasAbility(u, "cleansing_aura")) && current.some(isUndead);
    const risks = reply.known ? full ? movingThreatExhaustive(reply.branch, targets) : movingThreat(reply.branch, targets) : /* @__PURE__ */ new Map();
    const actorRisk = id ? risks.get(id) : void 0;
    const focusActor = reply.known && id && replyState.units.some((u) => u.id === id) ? focusThreat(reply.branch, id, replyState) : null;
    const focusCommanders = reply.known ? ownCommanders.filter((id2) => replyState.units.some((u) => u.id === id2)).map((id2) => id2 === actor?.id && focusActor ? focusActor : focusThreat(reply.branch, id2, replyState)) : [];
    focus.push([focusActor?.damage ?? 0, focusActor?.lethal ?? 0, focusActor?.relaxed ?? 0, focusActor?.attackers ?? 0, Math.max(0, ...focusCommanders.map((r) => r.damage)), Math.max(0, ...focusCommanders.map((r) => r.lethal)), Math.max(0, ...focusCommanders.map((r) => r.relaxed)), Number(reply.known), Number(canRecruit), Number(freeAttack)].map((v, i) => Math.fround([0, 2, 4, 6].includes(i) ? v / 128 : i === 3 ? v / 3 : v)));
    const immediateActor = full && reply.known && !reply.branch.isTerminal() ? replyState.units.find((u) => u.id === id) : actor;
    const commanderRisk = ownCommanders.map((c) => risks.get(c)).filter(Boolean);
    const cmdDamage = Math.max(0, ...commanderRisk.map((r) => r.damage));
    const cmdLethal = Math.max(0, ...commanderRisk.map((r) => r.lethal));
    stats.threatMs += performance.now() - threatStart;
    const pathStart = performance.now();
    old2.push([
      (hp(before, false) - hp(after, false)) / 128,
      (hp(before, true) - hp(after, true)) / 128,
      (count(before, false) - count(after, false)) / 16,
      (count(before, true) - count(after, true)) / 16,
      captured / 16,
      ((after.players.find((p) => p.id === player)?.gold ?? 0) - (before.players.find((p) => p.id === player)?.gold ?? 0)) / 1024,
      (actorRisk?.immediate ?? 0) / 128,
      Number(!!immediateActor && (actorRisk?.immediate ?? 0) >= immediateActor.hp),
      Number(reply.known),
      supports / 16
    ].map(Math.fround));
    let cb = null, ca = null, eb = null, ea = null;
    if (actor) {
      const pathAfter = paths.finder(after, actor);
      const capturable = tiles.filter((t) => getTileTerrainKey(t.tile) === "castle" ? hasAbility(actor, "castle_capturer") : hasAbility(actor, "village_capturer"));
      ca = pathAfter.nearest(actor, capturable);
      ea = pathAfter.nearest(actor, enemies.map((u) => u.pos));
      if (previous) {
        cb = nearest(pathBefore, previous, capturable);
        eb = nearest(pathBefore, previous, enemies.map((u) => u.pos));
      }
    }
    const recruit = action.type.startsWith("recruit_") && actor;
    extra.push([
      followDamage / 128,
      followKill,
      followCapture,
      followSkill,
      (actorRisk?.damage ?? 0) / 128,
      actorRisk?.lethal ?? 0,
      Number(reply.known),
      cmdDamage / 128,
      cmdLethal,
      (cb ?? 64) / 64,
      (ca ?? 64) / 64,
      cb !== null && ca !== null ? (cb - ca) / 64 : 0,
      Number(cb !== null && ca !== null),
      (eb ?? 64) / 64,
      (ea ?? 64) / 64,
      eb !== null && ea !== null ? (eb - ea) / 64 : 0,
      Number(eb !== null && ea !== null),
      recruit ? before.units.filter((u) => u.ownerId === player && u.unitClass === actor.unitClass).length / 32 : 0,
      recruit ? Number(hasAbility(actor, "village_capturer") || hasAbility(actor, "castle_capturer")) : 0,
      recruit ? getEffectiveStats(actor).move / 16 : 0,
      recruit ? getEffectiveStats(actor).maxRange / 8 : 0,
      recruit ? Number(hasAbility(actor, "flying")) : 0
    ].map(Math.fround));
    stats.pathMs += performance.now() - pathStart;
  }
  if (JSON.stringify(engine.getState()) !== original) throw Error("\u7279\u5F81\u63D0\u53D6\u6539\u5199\u539F\u59CB\u72B6\u6001");
  stats.exhaustiveFallbacks = THREAT_AUDIT.exhaustiveFallbacks - fallbackBefore;
  if (extra.some((v) => v.length !== NEW_KEYS2.length || v.some((n) => !Number.isFinite(n)))) throw Error("\u65B0\u7279\u5F81\u5F62\u72B6/\u6570\u503C\u975E\u6CD5");
  return { old: old2, extra, focus, stats };
}
function enemiesNeedCorrection(s) {
  const e = s.units.filter((u) => areEnemyPlayers(s, s.currentPlayer, u.ownerId));
  return e.some((u) => hasAbility(u, "cleansing_aura")) && e.some(isUndead);
}

// tactical_exit_20261019/encode.ts
function encodePolicy(engine, legal, old2) {
  engine.getLegalActions(engine.getState().currentPlayer);
  const packet = observe(observationState(engine.getState()), legal), actions = packet.codes.map((c) => decodeAction(c)), features = extractFeatures(engine, actions), base = encodeFeatures(packet, old2, features), focus = features.focus;
  return { ...base, candidates: base.candidates.map((r, i) => [...r, ...focus[i].map((v, j) => [141 + j, v])]), actionGroups: actions.map(groupKey), focus, actions, extra: features.extra };
}

// tactical_scale_20261018/model.ts
function offsets(s) {
  const h = s.hidden, f = s.token.keys.length, c = s.candidate.keys.length, k = 4 * h + 4, d = k + 3 * h + c;
  const eb = f * h, pw = eb + h, pb = pw + d * h, w2 = pb + h, b2 = w2 + h * h, w3 = b2 + h, b3 = w3 + h * h, ow = b3 + h, ob = ow + h, vw = ob + 1;
  return { h, f, c, k, d, eb, pw, pb, w2, b2, w3, b3, ow, ob, vw, count: vw + k + 1 };
}
function stableBest(z) {
  if (!z.length || z.some((v) => !Number.isFinite(v))) throw Error("\u7A7A\u5019\u9009\u6216\u975E\u6709\u9650logit");
  let best = 0;
  for (let i = 1; i < z.length; i++) if (z[i] > z[best] + 1e-10) best = i;
  return best;
}

// tactical_exit_20261019/group_model.ts
function layout(schema) {
  const o = offsets(schema), n2 = o.count, n3 = n2 + 2 * o.h, gw = n3 + 2 * o.h;
  return { ...o, n2, n3, gw, gb: gw + o.h, count: gw + o.h + 1 };
}
var relu = (a) => a.map((v) => Math.max(0, v));
function linear(x, w, start, bias, h) {
  const y = w.slice(bias, bias + h);
  for (let i = 0; i < x.length; i++) for (let j = 0; j < h; j++) y[j] += x[i] * w[start + i * h + j];
  return y;
}
function norm(x, w, start) {
  const h = x.length, mean = x.reduce((a, b) => a + b, 0) / h;
  const inverse = 1 / Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / h + 1e-5);
  const normalized = x.map((v) => (v - mean) * inverse);
  return { normalized, inverse, out: normalized.map((v, j) => v * w[start + j] + w[start + h + j]) };
}
function forwardGroup(x, model2, gradient = false) {
  const o = layout(model2.schema), h = o.h, w = model2.weights;
  if (!["sd-value-search-v4"].includes(model2.schema.version) || w.length !== o.count) throw Error("\u5206\u5C42\u6A21\u578B\u5F62\u72B6\u9519\u8BEF");
  const embedding = x.tokens.map((token) => {
    const e = w.slice(o.eb, o.pw);
    for (const [i, v] of token) for (let j = 0; j < h; j++) e[j] += v * w[i * h + j];
    return relu(e);
  });
  const ctx = Array(o.k).fill(0), counts = [0, 0, 0, 0];
  embedding.forEach((e, i) => {
    const g = x.groups[i];
    counts[g]++;
    for (let j = 0; j < h; j++) ctx[g * h + j] += e[j];
  });
  for (let g = 0; g < 4; g++) {
    for (let j = 0; j < h; j++) ctx[g * h + j] /= Math.max(1, counts[g]);
    ctx[4 * h + g] = counts[g] / 1024;
  }
  const common = linear(ctx, w, o.pw, o.pb, h), roles = /* @__PURE__ */ new Map();
  const cache2 = x.candidates.map((candidate, a) => {
    const input = [...ctx, ...x.refs[a].flatMap((ref) => ref < 0 ? Array(h).fill(0) : embedding[ref]), ...Array(o.c).fill(0)];
    for (const [i, v] of candidate) input[o.k + 3 * h + i] = v;
    let projected;
    if (gradient) projected = linear(input, w, o.pw, o.pb, h);
    else {
      projected = [...common];
      x.refs[a].forEach((ref, role) => {
        if (ref < 0) return;
        const key = `${role}:${ref}`;
        let values = roles.get(key);
        if (!values) {
          values = Array(h).fill(0);
          for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) values[j] += embedding[ref][i] * w[o.pw + (o.k + role * h + i) * h + j];
          roles.set(key, values);
        }
        for (let j = 0; j < h; j++) projected[j] += values[j];
      });
      for (const [i, v] of candidate) for (let j = 0; j < h; j++) projected[j] += v * w[o.pw + (o.k + 3 * h + i) * h + j];
    }
    const first = relu(projected);
    const z2 = linear(first, w, o.w2, o.b2, h), ln2 = norm(z2, w, o.n2), second = relu(first.map((v, j) => v + ln2.out[j]));
    const z3 = linear(second, w, o.w3, o.b3, h), ln3 = norm(z3, w, o.n3), third = relu(second.map((v, j) => v + ln3.out[j]));
    return { input, first, second, third, ln2, ln3 };
  });
  const logits = cache2.map((c) => c.third.reduce((s, v, j) => s + v * w[o.ow + j], w[o.ob]));
  const names = [...new Set(x.actionGroups)], groupIndexes = x.actionGroups.map((g) => names.indexOf(g)), sizes = names.map((g) => x.actionGroups.filter((k) => k === g).length);
  const groupLogits = names.map((_, g) => cache2.reduce((s, c, i) => s + (groupIndexes[i] === g ? c.third.reduce((t, v, j) => t + v * w[o.gw + j], 0) / sizes[g] : 0), w[o.gb]));
  const types = ["wait", "end_turn", "attack", "recruit", "capture"];
  const groupType = (name) => name.split("|")[1].startsWith("recruit_") ? "recruit" : name.split("|")[1];
  const biases = model2.schema.groupTypeBias ?? [0, 0, 0, 0, 0];
  names.forEach((name, g) => {
    const t = types.indexOf(groupType(name));
    if (t >= 0) groupLogits[g] += biases[t];
  });
  const chosenGroup = stableBest(groupLogits), members = logits.map((_, i) => i).filter((i) => groupIndexes[i] === chosenGroup);
  const best = members[stableBest(members.map((i) => logits[i]))];
  let value = w[o.vw + o.k];
  for (let i = 0; i < o.k; i++) value += ctx[i] * w[o.vw + i];
  const out = { logits, groupLogits, groupNames: names, best, context: ctx, value: Math.tanh(value) };
  if (!gradient) return { ...out, loss: 0, gradient: [] };
  const target = x.target, targetGroup = groupIndexes[target];
  const softmax = (z) => {
    const m = Math.max(...z), p = z.map((v) => Math.exp(v - m)), s = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / s);
  };
  const gp = softmax(groupLogits), within = logits.map((v, i) => groupIndexes[i] === targetGroup ? v : -Infinity), wp = softmax(within);
  const loss = -Math.log(gp[targetGroup]) - Math.log(wp[target]);
  gp[targetGroup]--;
  wp[target]--;
  const dw = Array(w.length).fill(0), dctx = Array(o.k).fill(0), de = embedding.map(() => Array(h).fill(0));
  function backwardLinear(input, dy, start, bias) {
    const dx = Array(input.length).fill(0);
    for (let j = 0; j < h; j++) dw[bias + j] += dy[j];
    for (let i = 0; i < input.length; i++) for (let j = 0; j < h; j++) {
      dw[start + i * h + j] += input[i] * dy[j];
      dx[i] += w[start + i * h + j] * dy[j];
    }
    return dx;
  }
  function backwardNorm(ln, dy, start) {
    const dz = dy.map((v, j) => v * w[start + j]), mean = dz.reduce((a, b) => a + b, 0) / h, dot = dz.reduce((a, b, j) => a + b * ln.normalized[j], 0) / h;
    for (let j = 0; j < h; j++) {
      dw[start + j] += dy[j] * ln.normalized[j];
      dw[start + h + j] += dy[j];
    }
    return dz.map((v, j) => ln.inverse * (v - mean - ln.normalized[j] * dot));
  }
  cache2.forEach((c, a) => {
    const groupDerivative = gp[groupIndexes[a]] / sizes[groupIndexes[a]], atomDerivative = wp[a];
    dw[o.gb] += groupDerivative;
    dw[o.ob] += atomDerivative;
    let dh = c.third.map((v, j) => {
      dw[o.ow + j] += atomDerivative * v;
      dw[o.gw + j] += groupDerivative * v;
      return (atomDerivative * w[o.ow + j] + groupDerivative * w[o.gw + j]) * Number(v > 0);
    });
    const second = backwardLinear(c.second, backwardNorm(c.ln3, dh, o.n3), o.w3, o.b3).map((v, j) => (v + dh[j]) * Number(c.second[j] > 0));
    dh = backwardLinear(c.first, backwardNorm(c.ln2, second, o.n2), o.w2, o.b2).map((v, j) => (v + second[j]) * Number(c.first[j] > 0));
    const di = backwardLinear(c.input, dh, o.pw, o.pb);
    for (let i = 0; i < o.k; i++) dctx[i] += di[i];
    x.refs[a].forEach((ref, role) => {
      if (ref >= 0) for (let j = 0; j < h; j++) de[ref][j] += di[o.k + role * h + j];
    });
  });
  embedding.forEach((e, t) => {
    const g = x.groups[t];
    for (let j = 0; j < h; j++) {
      const dz = (de[t][j] + dctx[g * h + j] / Math.max(1, counts[g])) * Number(e[j] > 0);
      dw[o.eb + j] += dz;
      for (const [i, v] of x.tokens[t]) dw[i * h + j] += v * dz;
    }
  });
  for (const type of types) dw.push(gp.reduce((sum, v, g) => sum + (groupType(names[g]) === type ? v : 0), 0));
  return { ...out, loss, gradient: dw };
}

// tactical_exit_20261019/policy_runtime.ts
function infer(engine, legal, model2, oldSchema) {
  const x = encodePolicy(engine, legal, oldSchema), out = forwardGroup(x, model2), prior = Array(x.codes.length).fill(0);
  const logSoftmax = (z) => {
    const m = Math.max(...z), s = m + Math.log(z.reduce((n, v) => n + Math.exp(v - m), 0));
    return z.map((v) => v - s);
  };
  const gp = logSoftmax(out.groupLogits);
  out.groupNames.forEach((name, g) => {
    const members = x.actionGroups.map((_, i) => i).filter((i) => x.actionGroups[i] === name), wp = logSoftmax(members.map((i) => out.logits[i]));
    members.forEach((i, j) => prior[i] = gp[g] + wp[j]);
  });
  return { x, out, prior };
}
var legalActions = (engine) => engine.getLegalActions(engine.getState().currentPlayer).filter((a) => a.type !== "surrender").sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : 1);

// tactical_exit_20261019/model_battle_search_ai.ts
var ModelBattleSearchAI = class {
  constructor(model2, oldSchema, options = {}) {
    this.model = model2;
    this.oldSchema = oldSchema;
    this.lastDecision = null;
    this.nodes = 0;
    this.options = { topK: options.topK ?? 6, maxFollowNodes: options.maxFollowNodes ?? 24, takeoverThreshold: options.takeoverThreshold ?? 0.12, vetoMargin: options.vetoMargin ?? 0.03 };
  }
  step(engine, a) {
    this.nodes++;
    const result = engine.step(a);
    if (result.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u540C\u5355\u4F4D\u641C\u7D22\u5206\u652F\u975E\u6CD5:" + encodeAction(a));
    return result.state;
  }
  evaluateCandidate(engine, player, action, index = -1) {
    const before = engine.getState(), plan = [];
    let branch = engine.clone(), freeAttacks = 0;
    const countFree = (s, a, after) => {
      if (a.type !== "attack") return 0;
      const actor = s.units.find((u) => u.id === a.attackerId), next = after.units.find((u) => u.id === a.attackerId);
      return Number(!!actor && !!next && next.hp >= actor.hp && calculateDamage(s, a.attackerId, a.targetId) > 0);
    };
    let current = this.step(branch, action);
    freeAttacks += countFree(before, action, current);
    const id = actorId(action, before, current), actorStart = current.units.find((u) => u.id === id) ?? before.units.find((u) => u.id === id);
    let followNodes = 0;
    const finishAllowed = action.type !== "recruit_to_castle" || actorStart?.apkPendingRecruitSource === "empty_castle";
    for (let depth = 0; depth < 2 && id && finishAllowed && !branch.isTerminal(); depth++) {
      const s = current, unit2 = s.units.find((u) => u.id === id);
      if (s.currentPlayer !== player || !unit2) break;
      const follow = branch.getLegalActions(player, { unitId: id, skipRecruitment: true }).filter((a) => ["attack", "capture", "heal", "summon", "destroy_town", "repair", "support", "wait", "post_attack_move"].includes(a.type));
      let best;
      const stays = (a) => a.type === "wait" || a.type === "post_attack_move" && a.to.x === unit2.pos.x && a.to.y === unit2.pos.y;
      follow.sort((a, b) => Number(stays(b)) - Number(stays(a)) || (encodeAction(a) < encodeAction(b) ? -1 : 1));
      for (const a of follow) {
        if (followNodes >= this.options.maxFollowNodes) break;
        const b = branch.clone(), after = this.step(b, a);
        followNodes++;
        const events = ledger(s, after, player), ready = (v) => v.units.filter((u) => u.ownerId === player && !u.hasActed).length;
        let score = events.net + 0.05 * events.healingNet / 1024 + (events.goldSpent === 0 ? 0.03 * events.recruitedValue / 1024 : 0) + 0.025 * (ready(after) - ready(s)) / 32 + 0.18 * events.castles + 0.09 * events.towns + 0.5 * events.enemyCommanderKills;
        if (a.type === "post_attack_move") {
          const reply = nextOpponent(b, player), target = reply.branch.getState().units.find((u) => u.id === id);
          beginThreatScope();
          if (reply.known && target && !reply.branch.isTerminal()) score -= 1e-3 * (movingThreat(reply.branch, [target]).get(id)?.damage ?? 0);
        }
        if (!best || score > best.score + 1e-10) best = { action: a, engine: b, state: after, score };
      }
      if (!best) break;
      const old2 = current;
      plan.push({ state: JSON.stringify(old2), action: best.action });
      branch = best.engine;
      current = best.state;
      freeAttacks += countFree(old2, best.action, current);
    }
    const leaf = evaluateLeaf(before, branch, player, id, this.model, this.oldSchema, actorStart);
    const incomplete = !!id && !branch.isTerminal() && current.currentPlayer === player && branch.getLegalActions(player, { unitId: id, skipRecruitment: true }).some((a) => actorId(a, current, current) === id);
    return { ...leaf, index, action, actor: id, plan, state: current, freeAttacks, nodes: followNodes + 1, complete: !incomplete };
  }
  getAction(engine, player, actions = legalActions(engine), prepared, memory = {}) {
    this.nodes = 0;
    const before = engine.getState(), queue = memory.queue?.[0];
    if (queue && queue.state === JSON.stringify(before) && actions.some((a) => encodeAction(a) === encodeAction(queue.action))) {
      memory.queue.shift();
      this.lastDecision = { preferred: encodeAction(queue.action), selected: encodeAction(queue.action), reason: "\u5DF2\u9A8C\u8BC1\u540C\u5355\u4F4D\u8FDE\u52A8", triggered: false, changed: false, planCommitted: true, nodes: 0, branchPolicyCalls: 0, traces: [] };
      return queue.action;
    }
    delete memory.queue;
    const root = prepared ?? infer(engine, actions, this.model, this.oldSchema), primaryIndex = root.out.best, traces = [];
    const priorOrder = root.prior.map((_, i) => i).sort((a, b) => root.prior[b] - root.prior[a] || a - b);
    let indexes = [primaryIndex, ...priorOrder.filter((i) => i !== primaryIndex)].slice(0, this.options.topK);
    const finish = (index, reason) => {
      const selected3 = traces.find((v) => v.index === index), intervention = index !== primaryIndex || !!selected3?.naturalWin;
      const planCommitted = !!(intervention && selected3?.complete && selected3.plan.length);
      if (planCommitted) memory.queue = selected3.plan;
      this.lastDecision = {
        preferred: root.x.codes[primaryIndex],
        selected: root.x.codes[index],
        reason,
        triggered: traces.length > 0,
        changed: index !== primaryIndex,
        planCommitted,
        nodes: this.nodes,
        branchPolicyCalls: 0,
        traces: traces.map((v) => ({ ...v, state: void 0, plan: v.plan.map((p) => ({ action: p.action })), risks: v.risks.map((r) => ({ ...r, replyState: void 0, focus: void 0 })) }))
      };
      return root.x.actions[index];
    };
    if (actions.length === 1) return finish(primaryIndex, "\u552F\u4E00\u5408\u6CD5\u52A8\u4F5C");
    const selected2 = root.x.actions[primaryIndex], f = root.x.focus[primaryIndex];
    const dangerous = !!f[1] || !!f[5], closing = selected2.type === "wait" || selected2.type === "end_turn";
    const preferredActor = actorId(selected2, before, before);
    const ownCommanders = new Set(before.units.filter((u) => u.ownerId === player && isCommanderUnit(before, u, player)).map((u) => u.id));
    const safeRoot = (i) => !!root.x.focus[i][7] && !root.x.focus[i][1] && !root.x.focus[i][5];
    const sameIntent = (a) => preferredActor ? actorId(a, before, before) === preferredActor : "castlePos" in selected2 && "castlePos" in a && a.castlePos.x === selected2.castlePos.x && a.castlePos.y === selected2.castlePos.y;
    const safeCommander = !!f[5] ? priorOrder.filter((i) => ownCommanders.has(actorId(root.x.actions[i], before, before) ?? "") && safeRoot(i)).slice(0, 1) : [];
    const safeSameActor = dangerous ? priorOrder.filter((i) => sameIntent(root.x.actions[i]) && safeRoot(i)).slice(0, safeCommander.length ? 1 : 2) : [];
    const eventRanks = [];
    const eventRank = (i) => {
      if (eventRanks[i] !== void 0) return eventRanks[i];
      const a = root.x.actions[i], features = root.x.extra[i];
      if (a.type === "attack") {
        const target = before.units.find((u) => u.id === a.targetId);
        if (target && calculateDamage(before, a.attackerId, a.targetId) >= target.hp) return eventRanks[i] = isCommanderUnit(before, target, target.ownerId) ? 6 : 4;
      }
      if (a.type === "capture") return eventRanks[i] = 5;
      if (a.type === "move" && (!!features[1] || !!features[2])) return eventRanks[i] = 4;
      if (a.type === "recruit_to_castle" && before.units.some((u) => u.pos.x === a.castlePos.x && u.pos.y === a.castlePos.y)) return eventRanks[i] = 0;
      if (a.type.startsWith("recruit_")) return eventRanks[i] = 2;
      return eventRanks[i] = 0;
    };
    const eventCandidates = closing ? priorOrder.filter((i) => i !== primaryIndex && eventRank(i) > 0).sort((a, b) => eventRank(b) - eventRank(a) || root.prior[b] - root.prior[a] || a - b) : [];
    const represented = /* @__PURE__ */ new Set(), events = eventCandidates.filter((i) => {
      const a = root.x.actions[i], kind = a.type.startsWith("recruit_") ? "recruit" : a.type;
      if (represented.has(kind)) return false;
      represented.add(kind);
      return true;
    }).slice(0, 3);
    indexes = [.../* @__PURE__ */ new Set([primaryIndex, ...safeCommander, ...safeSameActor, ...events, ...indexes])].slice(0, this.options.topK);
    const opportunity = indexes.some((i) => {
      const a = root.x.actions[i], c = root.x.extra[i];
      return ["attack", "capture", "recruit_to_castle", "recruit_and_deploy"].includes(a.type) || a.type === "move" && (!!c[0] || !!c[1] || !!c[2]);
    });
    if (!dangerous && !closing && !opportunity) return finish(primaryIndex, "\u975E\u5173\u952E\u5C40\u9762\u4FDD\u7559\u7B56\u7565");
    const primary = this.evaluateCandidate(engine, player, selected2, primaryIndex);
    traces.push(primary);
    if (primary.naturalWin) return finish(primaryIndex, "\u9ED8\u8BA4\u52A8\u4F5C\u81EA\u7136\u83B7\u80DC");
    if (!primary.complete) return finish(primaryIndex, "\u5F53\u524D\u5355\u4F4D\u9700\u7EE7\u7EED\u90E8\u7F72\u6216\u8D85\u51FA\u8FDE\u52A8\u9884\u7B97\uFF0C\u4FDD\u7559\u7B56\u7565\u9ED8\u8BA4");
    for (const i of indexes) {
      if (i !== primaryIndex) traces.push(this.evaluateCandidate(engine, player, root.x.actions[i], i));
    }
    const wins = traces.filter((v) => v.naturalWin);
    if (wins.length) return finish(wins[0].index, "Takeover\u81EA\u7136\u83B7\u80DC");
    const safe = (v) => v.complete && v.riskKnown && !v.commanderLethal && !v.actorLethal;
    const ranked = [...traces].sort((a, b) => b.score - a.score || indexes.indexOf(a.index) - indexes.indexOf(b.index));
    if (primary.commanderLethal || primary.actorLethal && primary.highValueActor) {
      const safer = ranked.find((v) => safe(v) && v.tactical >= primary.tactical - 0.15);
      if (safer && safer.index !== primaryIndex) return finish(safer.index, "Veto\u53EF\u91CD\u653E\u81F4\u6B7B\u98CE\u9669");
    }
    const candidate = ranked.find((v) => v.index !== primaryIndex && safe(v) && (v.enemyCommanderKills > primary.enemyCommanderKills || v.enemyCastlesCaptured > primary.enemyCastlesCaptured || closing && (v.recruits > primary.recruits || v.captures > primary.captures || v.enemyKills > primary.enemyKills || v.freeAttacks > primary.freeAttacks && v.net > 0) || v.tactical > primary.tactical + this.options.takeoverThreshold && v.score > primary.score + this.options.vetoMargin));
    if (candidate) return finish(candidate.index, "Takeover\u5B9E\u9645\u6218\u672F\u6536\u76CA");
    return finish(primaryIndex, "\u672A\u8FBE\u63A5\u7BA1\u6216\u5426\u51B3\u6761\u4EF6");
  }
};

// tactical_exit_20261019/audit_search_risks.ts
import assert from "node:assert/strict";
function auditSearchRisks(engine, search) {
  const counts = { branches: 0, targets: 0, witnessActions: 0, lethalWitnesses: 0 };
  const step = (branch, action) => {
    assert.ok(branch.getLegalActions(branch.getState().currentPlayer).some((a) => encodeAction(a) === encodeAction(action)), "\u98CE\u9669\u89C1\u8BC1\u52A8\u4F5C\u5FC5\u987B\u5C5E\u4E8E\u6743\u5A01\u5B8C\u6574\u5408\u6CD5\u96C6\u5408");
    assert.ok(!branch.step(action).info.includes("\u975E\u6CD5\u52A8\u4F5C"));
  };
  for (const trace of search?.traces ?? []) {
    const branch = engine.clone(), player = branch.getState().currentPlayer;
    step(branch, trace.action);
    counts.branches++;
    for (const follow of trace.plan ?? []) step(branch, follow.action);
    const reply = opponentSnapshot(branch, player);
    assert.ok(reply.known || !(trace.risks ?? []).length, "\u672A\u77E5\u6295\u5F71\u4E0D\u80FD\u8BB0\u5F55\u5DF2\u77E5\u81F4\u6B7B\u98CE\u9669");
    for (const risk of trace.risks ?? []) {
      counts.targets++;
      const start = reply.state.units.find((u) => u.id === risk.id), attack = reply.branch.clone();
      for (const action of risk.witness ?? []) {
        step(attack, action);
        counts.witnessActions++;
      }
      const end = attack.getState().units.find((u) => u.id === risk.id);
      const actualDamage = start ? Math.max(0, start.hp - (end?.hp ?? 0)) : risk.hp;
      assert.ok(Math.abs(actualDamage - risk.damage) < 1e-9, `\u98CE\u9669\u635F\u8840\u4E0D\u7B26\uFF1A${risk.id} ${actualDamage}/${risk.damage}`);
      assert.equal(Number(!end), risk.lethal, "\u98CE\u9669\u81F4\u6B7B\u6807\u8BB0\u5FC5\u987B\u7531\u540C\u4E00\u89C1\u8BC1\u590D\u73B0");
      counts.lethalWitnesses += Number(!!risk.lethal);
    }
  }
  return counts;
}

// tactical_exit_20261019/io.ts
import fs from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// tactical_value_search_20261018/io.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
var DIR = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.resolve(DIR, "../..");

// tactical_exit_20261019/io.ts
var DIR2 = path2.dirname(fileURLToPath2(import.meta.url));
var read = (n) => JSON.parse(fs.readFileSync(path2.resolve(DIR2, n), "utf8").replace(/^\uFEFF/, ""));
function save(n, x) {
  const p = path2.resolve(DIR2, n);
  if (!p.startsWith(DIR2 + path2.sep)) throw Error("\u8F93\u51FA\u8D8A\u754C");
  fs.mkdirSync(path2.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(x));
}

// tactical_exit_20261019/guard_regressions.ts
var states = read("browser-states.json");
var raw = states[0].state;
var all = states.flatMap((v) => v.state.units);
var model = read("teacher-model.json");
var old = read("old-schema.json");
var tile = (kind) => raw.map.tiles.flat().find((t) => getTileTerrainKey(t) === kind);
var unit = (kind, id, ownerId, x, y, hp = 100) => ({ ...all.find((u) => u.unitClass === kind), id, ownerId, pos: { x, y }, hp, level: 0, hasMoved: false, hasActed: false, hasPostAttackMoved: false, apkStatic: false });
function fixture() {
  const s = structuredClone(raw);
  s.map = { width: 12, height: 12, tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({ ...tile("road"), ownerId: null }))) };
  s.map.tiles[0][0] = { ...tile("castle"), ownerId: 0 };
  s.map.tiles[11][11] = { ...tile("castle"), ownerId: 1 };
  s.players.forEach((p) => {
    p.gold = 0;
    p.isAlive = true;
  });
  s.currentPlayer = 0;
  s.pendingUnitId = void 0;
  s.winner = null;
  s.units = [unit("commander", "\u5DF1\u65B9\u6307\u6325\u5B98", 0, 0, 0), unit("commander", "\u654C\u65B9\u6307\u6325\u5B98", 1, 11, 11)];
  return s;
}
function preferred(e, select, alternative) {
  const legal = legalActions(e), root = infer(e, legal, model, old), index = root.x.actions.findIndex(select);
  assert2.ok(index >= 0);
  root.out.best = index;
  root.prior = root.prior.map((_, i) => i === index ? 0 : alternative(root.x.actions[i]) ? -1 : -1e3 - i);
  return { legal, root };
}
var cases = {
  recruit() {
    const s = fixture();
    s.players[0].gold = 500;
    s.units[0].pos = { x: 1, y: 0 };
    const e = new GameEngine(s), p = preferred(e, (a) => a.type === "wait" && a.unitId === "\u5DF1\u65B9\u6307\u6325\u5B98", (a) => a.type === "recruit_to_castle" && a.unitClass === "soldier");
    const ai = new ModelBattleSearchAI(model, old), memory = {}, action = ai.getAction(e, 0, p.legal, p.root, memory);
    assert2.equal(action.type, "recruit_to_castle");
    assert2.ok(ai.lastDecision.changed);
    assert2.ok(!memory.queue?.length, "\u65B0\u5175\u5B58\u5728\u672A\u5C55\u5F00\u7684\u5408\u6CD5\u90E8\u7F72move\u65F6\uFF0C\u4E0D\u80FD\u63D0\u4EA4\u7EAFwait\u8BA1\u5212");
    const oldIds = new Set(e.getState().units.map((u) => u.id));
    e.step(action);
    const born = e.getState().units.find((u) => !oldIds.has(u.id));
    assert2.ok(e.getLegalActions(0, { unitId: born.id }).some((a) => a.type === "move"));
    return { selected: encodeAction(action), deploymentMovePreserved: true };
  },
  combat() {
    const s = fixture();
    s.map.tiles[0][1] = { ...tile("town"), ownerId: 1 };
    s.units.push({ ...unit("soldier", "\u5DF1\u65B9\u6218\u58EB", 0, 8, 8, 20), hasMoved: true }, unit("soldier", "\u654C\u65B9\u6B8B\u5175", 1, 9, 8, 1), unit("soldier", "\u654C\u65B9\u540E\u536B", 1, 9, 9), unit("soldier", "\u654C\u65B9\u63F4\u5175", 1, 10, 8));
    const e = new GameEngine(s), p = preferred(e, (a) => a.type === "attack" && a.attackerId === "\u5DF1\u65B9\u6218\u58EB" && a.targetId === "\u654C\u65B9\u6B8B\u5175", (a) => a.type === "move" && a.unitId === "\u5DF1\u65B9\u6307\u6325\u5B98" && a.to.x === 1 && a.to.y === 0), ai = new ModelBattleSearchAI(model, old), action = ai.getAction(e, 0, p.legal, p.root, {});
    assert2.equal(encodeAction(action), p.root.x.codes[p.root.out.best], "\u666E\u901A\u5360\u6751\u4E0D\u80FD\u4EE5\u66F4\u4F4E\u771F\u5B9E\u6218\u6597\u51C0\u503C\u63A5\u7BA1\u786E\u5B9A\u7684\u6B63\u51C0\u503C\u653B\u51FB");
    return { selected: encodeAction(action), reason: ai.lastDecision.reason };
  },
  protection() {
    const s = fixture();
    s.map.tiles[0][1] = { ...tile("town"), ownerId: 1 };
    s.units.push({ ...unit("archer", "\u53D7\u5A01\u80C1\u5F13\u624B", 0, 8, 8, 10), hasMoved: true }, unit("soldier", "\u654C\u65B9\u7532", 1, 9, 8), unit("soldier", "\u654C\u65B9\u4E59", 1, 8, 9));
    const e = new GameEngine(s), p = preferred(e, (a) => a.type === "wait" && a.unitId === "\u53D7\u5A01\u80C1\u5F13\u624B", (a) => a.type === "move" && a.unitId === "\u5DF1\u65B9\u6307\u6325\u5B98" && a.to.x === 1 && a.to.y === 0), ai = new ModelBattleSearchAI(model, old);
    ai.getAction(e, 0, p.legal, p.root, {});
    assert2.notEqual(ai.lastDecision.reason, "Veto\u53EF\u91CD\u653E\u81F4\u6B7B\u98CE\u9669", "\u539F\u9AD8\u4EF7\u5355\u4F4D\u4ECD\u81F4\u6B7B\u65F6\uFF0C\u4E0D\u80FD\u6362\u89C2\u5BDF\u76EE\u6807\u5BA3\u79F0Veto\u907F\u9669");
    const audit = auditSearchRisks(e, ai.lastDecision);
    assert2.ok(audit.lethalWitnesses > 0);
    return { reason: ai.lastDecision.reason, audit };
  }
};
var selected = process.argv[2] ? [process.argv[2]] : Object.keys(cases);
var results = Object.fromEntries(selected.map((k) => [k, cases[k]()]));
if (!process.argv[2]) save("guard-regression-gate.json", { passed: true, results });
console.log({ passed: true, results });
