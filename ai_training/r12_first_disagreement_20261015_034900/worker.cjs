var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ai_training/r8_pure_policy_stage_20261014_125300/research/common.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_crypto = __toESM(require("node:crypto"), 1);

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/terrain.ts
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/units.ts
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/apk_terrain.ts
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
var APPROXIMATE_SKIRMISH_APK_TERRAIN_IDS = /* @__PURE__ */ new Set([30, 31, 33, 80, 81, 82, 83]);
function getSkirmishMappingEvidence(apkTerrainId, projectTerrainId, confidence) {
  if (confidence === "unmapped" || projectTerrainId === null) return [];
  if (confidence === "confirmed") {
    if (apkTerrainId === 72) {
      return ["data_bin_values", "language_table_bridge_is_water", "texture_atlas"];
    }
    return ["data_bin_values", "language_table_building_description", "texture_atlas"];
  }
  if (confidence === "approximate") {
    if (apkTerrainId === 30) {
      return ["data_bin_values", "texture_atlas", "low_confidence_camp_semantics"];
    }
    if (apkTerrainId === 31 || apkTerrainId === 80) {
      return ["data_bin_values", "texture_atlas", "language_table_temple_description", "low_confidence_temple_semantics"];
    }
    if (apkTerrainId === 81 || apkTerrainId === 82) {
      return ["data_bin_values", "texture_atlas", "low_confidence_water_obstacle_semantics"];
    }
    if (apkTerrainId === 83) {
      return ["data_bin_values", "texture_atlas", "language_table_temple_description", "low_confidence_water_temple_semantics"];
    }
    return ["data_bin_values", "texture_atlas", "low_confidence_building_semantics"];
  }
  return ["data_bin_values", "texture_atlas", "skirmish_map_context"];
}
function getSkirmishApkTerrainMappingInfo(apkTerrainId) {
  const projectTerrainId = mapSkirmishApkTerrainId(apkTerrainId);
  const confidence = projectTerrainId === null ? "unmapped" : mapKnownApkTerrainId(apkTerrainId) !== null ? "confirmed" : APPROXIMATE_SKIRMISH_APK_TERRAIN_IDS.has(apkTerrainId) ? "approximate" : "atlas";
  return {
    apkTerrainId,
    projectTerrainId,
    confidence,
    evidence: getSkirmishMappingEvidence(apkTerrainId, projectTerrainId, confidence)
  };
}
function getApkTerrainConfig(apkTerrainId) {
  return APK_TERRAIN_BY_ID.get(apkTerrainId) ?? null;
}
function mapKnownApkTerrainId(apkTerrainId) {
  return HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT[apkTerrainId] ?? null;
}
function mapSkirmishApkTerrainId(apkTerrainId) {
  return SKIRMISH_APK_TERRAIN_TO_PROJECT[apkTerrainId] ?? null;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/terrain_rules.ts
function rewriteApkTerrainRaw(tile) {
  if (tile.apkTerrainId === void 0) return;
  const ownerCode = tile.apkOwnerCode ?? (tile.ownerId ?? 255);
  tile.apkTerrainRaw = tile.apkTerrainId << 12 | ownerCode;
}
function syncApkTerrainDefinition(tile) {
  if (tile.apkTerrainId === void 0) return;
  const config = getApkTerrainConfig(tile.apkTerrainId);
  if (config) {
    tile.apkTerrainKind = config.kind;
    tile.apkTerrainIsLand = config.isLand ?? config.flagA !== 0;
    tile.apkMoveCost = config.moveCost;
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
function getTileTerrainIdForRules(tile) {
  if (tile.apkTerrainId !== void 0) {
    return mapSkirmishApkTerrainId(tile.apkTerrainId) ?? tile.terrainId;
  }
  return tile.terrainId;
}
function getTileTerrainConfig(tile) {
  return TERRAIN_CONFIG[getTileTerrainIdForRules(tile)];
}
function getTileTerrainKey(tile) {
  return getTileTerrainConfig(tile).key;
}
function tileHasTerrainTag(tile, tag) {
  return getTileTerrainConfig(tile).tags.includes(tag);
}
function tileClearsNegativeStatusAtTurnStart(tile) {
  if (tile.apkTerrainId !== void 0) {
    return (tile.apkTerrainKind ?? getApkTerrainConfig(tile.apkTerrainId)?.kind) === 5;
  }
  return tileHasTerrainTag(tile, "cleanse");
}
function setTileTerrainForRules(tile, terrainId) {
  tile.terrainId = terrainId;
  if (tile.apkTerrainId === void 0) return;
  if (mapSkirmishApkTerrainId(tile.apkTerrainId) === terrainId) {
    rewriteApkTerrainRaw(tile);
    return;
  }
  const linkedApkTerrainId = getLinkedApkTerrainIdForProjectTerrain(tile.apkTerrainId, terrainId);
  if (linkedApkTerrainId !== null) {
    tile.apkTerrainId = linkedApkTerrainId;
    syncApkTerrainDefinition(tile);
    rewriteApkTerrainRaw(tile);
    return;
  }
  delete tile.apkTerrainId;
  delete tile.apkTerrainRaw;
  delete tile.apkOwnerCode;
  delete tile.apkTerrainKind;
  delete tile.apkTerrainIsLand;
  delete tile.apkMoveCost;
}
function setTileOwnerForRules(tile, ownerId) {
  tile.ownerId = ownerId;
  if (tile.apkTerrainId === void 0) return;
  tile.apkOwnerCode = ownerId ?? 255;
  rewriteApkTerrainRaw(tile);
}
function setTileOwnerAfterRepairForRules(tile) {
  tile.ownerId = null;
  if (tile.apkTerrainId === void 0) return;
  tile.apkOwnerCode = getApkTerrainConfig(tile.apkTerrainId)?.flagB !== 0 ? 254 : 255;
  rewriteApkTerrainRaw(tile);
}
function isTileDestroyableForRules(tile) {
  if (tile.apkTerrainId !== void 0) {
    return (getApkTerrainConfig(tile.apkTerrainId)?.linkedB ?? -1) >= 0;
  }
  return getTileTerrainKey(tile) === "town";
}
function destroyTileForRules(tile) {
  if (tile.apkTerrainId !== void 0) {
    const destroyedApkTerrainId = getApkTerrainConfig(tile.apkTerrainId)?.linkedB ?? -1;
    if (destroyedApkTerrainId >= 0) {
      tile.apkTerrainId = destroyedApkTerrainId;
      syncApkTerrainDefinition(tile);
      tile.terrainId = mapSkirmishApkTerrainId(destroyedApkTerrainId) ?? tile.terrainId;
      tile.ownerId = null;
      tile.apkOwnerCode = 255;
      rewriteApkTerrainRaw(tile);
      return;
    }
  }
  setTileTerrainForRules(tile, 8);
  setTileOwnerForRules(tile, null);
}
function getApkTerrainValue(tile, field) {
  if (tile.apkTerrainId === void 0) return null;
  return getApkTerrainConfig(tile.apkTerrainId)?.[field] ?? null;
}
function getTileDefenseBonus(tile) {
  return getApkTerrainValue(tile, "defenseBonus") ?? getTileTerrainConfig(tile)?.defenseBonus ?? 0;
}
function getTileHealPerTurn(tile) {
  return getApkTerrainValue(tile, "healPerTurn") ?? getTileTerrainConfig(tile)?.healPerTurn ?? 0;
}
function tileHealingRequiresFriendlyOwner(tile) {
  if (tile.apkTerrainId !== void 0) {
    return getApkTerrainConfig(tile.apkTerrainId)?.flagB !== 0;
  }
  return getTileTerrainConfig(tile).tags.includes("capturable");
}
function getTileMoveCost(tile) {
  return getApkTerrainValue(tile, "moveCost") ?? getTileTerrainConfig(tile)?.moveCost ?? 1;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/rule_config.ts
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
  return getRuleConfig(state).teams[playerId] ?? {};
}
function getAllianceId(state, playerId) {
  const rules = getRuleConfig(state);
  return rules.alliances[playerId] ?? playerId;
}
function areAlliedPlayers(state, playerA, playerB) {
  return getAllianceId(state, playerA) === getAllianceId(state, playerB);
}
function areEnemyPlayers(state, playerA, playerB) {
  return !areAlliedPlayers(state, playerA, playerB);
}
function isTeamEnabled(state, playerId) {
  return !getRuleConfig(state).disabledTeams.includes(playerId);
}
function isActivePlayer(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  return !!player?.isAlive && isTeamEnabled(state, playerId);
}
function getTurnPlayerIds(state) {
  return state.players.filter((player) => isActivePlayer(state, player.id)).map((player) => player.id).sort((a, b) => a - b);
}
function isCommanderUnit(state, unit, teamId) {
  if (teamId !== void 0 && unit.ownerId !== teamId) return false;
  const commanderUnitId = getRuleConfig(state).commanderUnitIds[unit.ownerId];
  if (commanderUnitId !== void 0) {
    return unit.id === commanderUnitId;
  }
  return unit.unitClass === "commander";
}
function getCommanderUnit(state, playerId) {
  const commanderUnitId = getRuleConfig(state).commanderUnitIds[playerId];
  if (commanderUnitId !== void 0) {
    return state.units.find((unit) => unit.id === commanderUnitId && unit.ownerId === playerId && unit.hp > 0) ?? null;
  }
  return state.units.find((unit) => unit.ownerId === playerId && unit.unitClass === "commander" && unit.hp > 0) ?? null;
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
  return state.units.filter((unit) => unit.ownerId === playerId).length;
}
function getCurrentPopulation(state, playerId) {
  return state.units.filter((unit) => unit.ownerId === playerId).reduce((sum, unit) => sum + UNIT_CONFIGS[unit.unitClass].population, 0);
}
function canRecruitUnitClass(state, playerId, unitClass) {
  const player = state.players.find((p) => p.id === playerId);
  const unitConfig2 = UNIT_CONFIGS[unitClass];
  const unitCost = getUnitCost(state, playerId, unitClass);
  if (!player || !unitConfig2 || unitCost === null) return false;
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
  if (populationLimit !== void 0 && getCurrentPopulation(state, playerId) + unitConfig2.population > populationLimit) {
    return false;
  }
  return true;
}
function getTileIncome(state, tile) {
  const rules = getRuleConfig(state);
  const key = getTileTerrainKey(tile);
  if (key === "town") return rules.incomeVillage;
  if (key === "castle") return rules.incomeCastle;
  return 0;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/abilities.ts
function hasAbility(unit, ability) {
  const config = UNIT_CONFIGS[unit.unitClass];
  return config?.abilities.includes(ability) || false;
}
function isFlying(unit) {
  return hasAbility(unit, "flying");
}
function isUndead(unit) {
  return hasAbility(unit, "undead");
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
function getMoveCostForUnit(state, unit, tile) {
  const baseMoveCost = tile.apkMoveCost ?? getTileMoveCost(tile);
  const kind = tile.apkTerrainKind ?? (tile.apkTerrainId === void 0 ? void 0 : getApkTerrainConfig(tile.apkTerrainId)?.kind);
  const scripted = kind === void 0 ? void 0 : unit.apkMoveOverrides?.[kind];
  if (scripted !== void 0 && scripted > 0) return scripted;
  if (isFlying(unit) || hasAbility(unit, "water_child") && isWaterTerrain(tile) || hasAbility(unit, "forest_child") && isForestTerrain(tile) || hasAbility(unit, "mountain_child") && isMountainTerrain(tile) || hasAbility(unit, "earth_child") && isLandTerrain(tile)) return 1;
  if (hasAbility(unit, "earth_child")) return baseMoveCost + 1;
  return baseMoveCost;
}
function getAttackBonus(state, attacker, defender) {
  let bonus = 0;
  const ruleConfig = getRuleConfig(state);
  const atkTile = state.map.tiles[attacker.pos.y][attacker.pos.x];
  if (hasAbility(attacker, "water_child") && isWaterTerrain(atkTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
  }
  if (hasAbility(attacker, "forest_child") && isForestTerrain(atkTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
  }
  if (hasAbility(attacker, "mountain_child") && isMountainTerrain(atkTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
  }
  return bonus;
}
function getDefenseBonus(state, attacker, defender) {
  let bonus = 0;
  const ruleConfig = getRuleConfig(state);
  const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
  if (hasAbility(defender, "water_child") && isWaterTerrain(defTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
  }
  if (hasAbility(defender, "forest_child") && isForestTerrain(defTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
  }
  if (hasAbility(defender, "mountain_child") && isMountainTerrain(defTile)) {
    bonus += ruleConfig.terrainChildCombatBonus;
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
function clearNegativeStatus(unit) {
  if (unit.status) {
    const type = unit.status.type;
    if (type === "poisoned" || type === "blinded" || type === "weakened") {
      delete unit.status;
    }
  }
}
function getEffectiveStats(unit) {
  const base = UNIT_CONFIGS[unit.unitClass];
  const level = unit.level ?? 0;
  const attackBonus = base.attackGrowth * level;
  const defBonus = base.defenseGrowth * level;
  const maxHpBonus = base.maxHpGrowth * level;
  const moveBonus = base.moveGrowth * level;
  let pDef = base.physicalDefense + defBonus;
  let mDef = base.magicDefense + defBonus;
  let maxHp = (unit.maxHp ?? 100) + maxHpBonus;
  let move = base.move + moveBonus;
  if (unit.status && unit.status.type === "weakened") {
    pDef -= 10;
    mDef -= 10;
    move = 1;
  }
  let minRange = base.minRange;
  let maxRange = base.maxRange;
  if (unit.status && unit.status.type === "blinded") {
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
function addExp(unit, amount, levelCap = 3) {
  if (unit.level === void 0) unit.level = 0;
  if (unit.exp === void 0) unit.exp = 0;
  if (unit.level >= levelCap && amount > 0) return false;
  unit.exp = clamp(unit.exp + amount, 0, MAX_EXP);
  let upgraded = false;
  let levelsGained = 0;
  while (unit.level < levelCap) {
    const nextLevel = unit.level + 1;
    const threshold = getExpThresholdForLevel(nextLevel);
    if (unit.exp >= threshold) {
      unit.level = nextLevel;
      upgraded = true;
      levelsGained += 1;
    } else {
      break;
    }
  }
  if (levelsGained > 0) {
    const config = UNIT_CONFIGS[unit.unitClass];
    const hpGain = config.maxHpGrowth * levelsGained;
    const moveGain = config.moveGrowth * levelsGained;
    if (hpGain !== 0) {
      unit.hp = clamp(unit.hp + hpGain, 1, 9999);
    }
    if (moveGain !== 0 && unit.movementRemaining !== void 0) {
      unit.movementRemaining = clamp(unit.movementRemaining + moveGain, 0, 99);
    }
  }
  return upgraded;
}
function projectExpOutcome(unit, expAmount, levelCap = 3) {
  const copy = {
    ...unit,
    pos: { ...unit.pos },
    status: unit.status ? { ...unit.status } : unit.status
  };
  const beforeLevel = copy.level ?? 0;
  const beforeHp = copy.hp;
  addExp(copy, expAmount, levelCap);
  const afterLevel = copy.level ?? 0;
  if (afterLevel === beforeLevel && copy.hp === beforeHp) return null;
  return { level: afterLevel, exp: copy.exp ?? 0, hp: copy.hp };
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/map.ts
function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function isWithinBounds(state, pos) {
  return pos.x >= 0 && pos.y >= 0 && pos.x < state.map.width && pos.y < state.map.height;
}
function getReachablePositions(state, unitId, customMaxMove) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const stats = getEffectiveStats(unit);
  let maxMove = customMaxMove !== void 0 ? customMaxMove : stats.move;
  if (unit.status && unit.status.type === "weakened") {
    maxMove = Math.min(maxMove, 1);
  }
  const reachable = /* @__PURE__ */ new Map();
  const queue = [];
  const startKey = `${unit.pos.x},${unit.pos.y}`;
  reachable.set(startKey, 0);
  queue.push({ pos: unit.pos, cost: 0 });
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
      if (occupyingUnit && areEnemyPlayers(state, unit.ownerId, occupyingUnit.ownerId)) {
        if (isFlying(unit) && !isFlying(occupyingUnit)) {
        } else {
          continue;
        }
      }
      const tile = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, unit, tile);
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
    if (x === unit.pos.x && y === unit.pos.y) {
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
function getMoveCostTo(state, unitId, to) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return 999;
  if (unit.pos.x === to.x && unit.pos.y === to.y) return 0;
  const stats = getEffectiveStats(unit);
  let maxMove = stats.move;
  if (unit.status && unit.status.type === "weakened") {
    maxMove = 1;
  }
  const reachable = /* @__PURE__ */ new Map();
  const queue = [];
  const startKey = `${unit.pos.x},${unit.pos.y}`;
  reachable.set(startKey, 0);
  queue.push({ pos: unit.pos, cost: 0 });
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
      if (occupyingUnit && areEnemyPlayers(state, unit.ownerId, occupyingUnit.ownerId)) {
        if (isFlying(unit) && !isFlying(occupyingUnit)) {
        } else {
          continue;
        }
      }
      const tile = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, unit, tile);
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
  const cost = reachable.get(`${to.x},${to.y}`);
  return cost !== void 0 ? cost : 999;
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
      const tile = state.map.tiles[ny][nx];
      const terrainCost = getMoveCostForUnit(state, virtualUnit, tile);
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/rules.ts
function hasAbility2(unitClass, ability) {
  return UNIT_CONFIGS[unitClass].abilities.includes(ability);
}
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
  const ruleConfig = getRuleConfig(state);
  const atkStats = UNIT_CONFIGS[attacker.unitClass];
  const defTile = state.map.tiles[defender.pos.y][defender.pos.x];
  const defTerrain = getTileTerrainConfig(defTile);
  const dist = getDistance(attacker.pos, defender.pos);
  let extraAttack = 0;
  if (hasAbility(attacker, "sharpshooter") && hasAbility(defender, "flying")) {
    extraAttack += ruleConfig.sharpshooterAttackBonus;
  }
  if (hasAbility(attacker, "destroyer") && defTerrain.key === "town") {
    extraAttack += ruleConfig.destroyerAttackBonus;
  }
  if (hasAbility(attacker, "flying") && isWaterTerrain(defTile) && !hasAbility(defender, "flying")) {
    extraAttack += ruleConfig.flyingWaterAttackBonus;
  }
  if (hasAbility(attacker, "death_reaper") && defender.status && (defender.status.type === "poisoned" || defender.status.type === "blinded" || defender.status.type === "weakened")) {
    extraAttack += ruleConfig.deathReaperAttackBonus;
  }
  const defBonus = isFlying(defender) ? 0 : getTileDefenseBonus(defTile);
  const abilityAtkBonus = getAttackBonus(state, projectedAttacker, defender);
  const abilityDefBonus = getDefenseBonus(state, projectedAttacker, defender);
  const inspiredAttackBonus = attacker.status?.type === "inspired" ? dist > 1 ? Math.trunc(ruleConfig.inspiredAttackBonus / 2) : ruleConfig.inspiredAttackBonus : 0;
  const isMagic = atkStats.attackType === "magic";
  const weakenedPenalty = dist > 1 ? Math.trunc(ruleConfig.weakenedDefensePenalty / 2) : ruleConfig.weakenedDefensePenalty;
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
function estimateCounterDamage(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target) return 0;
  const ruleConfig = getRuleConfig(state);
  const incoming = calculateDamage(state, attackerId, defenderId);
  const targetHpAfter = target.hp - incoming;
  if (targetHpAfter <= 0) return 0;
  const projected = JSON.parse(JSON.stringify(state));
  const projectedAttacker = projected.units.find((u) => u.id === attackerId);
  const projectedTarget = projected.units.find((u) => u.id === defenderId);
  if (!projectedAttacker || !projectedTarget) return 0;
  projectedTarget.hp = targetHpAfter;
  applyCombatStatusEffectsForProjection(attacker, projectedTarget);
  const outgoingExp = targetHpAfter <= 0 ? KILL_EXP : ATTACK_EXP;
  const beforeLevel = projectedAttacker.level ?? 0;
  const beforeMaxHp = projectedAttacker.maxHp ?? 100;
  const hpProjection = projectExpOutcome(projectedAttacker, outgoingExp, ruleConfig.levelCap);
  if (hpProjection) {
    projectedAttacker.level = hpProjection.level;
    projectedAttacker.exp = hpProjection.exp;
    projectedAttacker.hp = hpProjection.hp;
    const levelsGained = hpProjection.level - beforeLevel;
    if (levelsGained > 0) {
      projectedAttacker.maxHp = beforeMaxHp + UNIT_CONFIGS[projectedAttacker.unitClass].maxHpGrowth * levelsGained;
    }
  }
  if (!canCounterAttack(projected, attackerId, defenderId)) return 0;
  return calculateDamageAtHp(projected, defenderId, attackerId, targetHpAfter);
}
function estimateCounterDamageWithoutExpProjection(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target) return 0;
  const incoming = calculateDamage(state, attackerId, defenderId);
  const targetHpAfter = target.hp - incoming;
  if (targetHpAfter <= 0) return 0;
  const projected = JSON.parse(JSON.stringify(state));
  const projectedTarget = projected.units.find((u) => u.id === defenderId);
  if (!projectedTarget) return 0;
  projectedTarget.hp = targetHpAfter;
  applyCombatStatusEffectsForProjection(attacker, projectedTarget);
  if (!canCounterAttack(projected, attackerId, defenderId)) return 0;
  return calculateDamageAtHp(projected, defenderId, attackerId, targetHpAfter);
}
function applyCombatStatusEffectsForProjection(source, target) {
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
function getLegalActions(state, playerId) {
  const actions = [];
  if (!isActivePlayer(state, playerId)) {
    return actions;
  }
  const pendingUnitId = state.pendingUnitId;
  const pendingUnit = pendingUnitId ? state.units.find((u) => u.id === pendingUnitId) : void 0;
  const rules = getRuleConfig(state);
  const canResolveEmptyCastlePendingWithTurnAction = pendingUnit?.apkPendingRecruitSource === "empty_castle";
  const pendingLocksUnitActions = Boolean(pendingUnitId && pendingUnit?.apkPendingRecruitSource !== "empty_castle");
  let validUnits = state.units.filter((u) => u.ownerId === playerId && !u.hasActed && !u.apkStatic);
  if (pendingLocksUnitActions) {
    validUnits = validUnits.filter((u) => u.id === pendingUnitId);
  }
  let assaultUnits = state.units.filter(
    (u) => u.ownerId === playerId && u.hasActed && hasAbility(u, "assault_troop") && (u.movementRemaining ?? 0) > 0 && !u.hasPostAttackMoved && !u.apkStatic
  );
  if (pendingLocksUnitActions) {
    assaultUnits = assaultUnits.filter((u) => u.id === pendingUnitId);
  }
  const enemyUnits = state.units.filter((u) => areEnemyPlayers(state, u.ownerId, playerId));
  const sameTeamUnits = state.units.filter((u) => u.ownerId === playerId);
  for (const unit of assaultUnits) {
    const reachable = getReachablePositions(state, unit.id, unit.movementRemaining);
    for (const pos of reachable) {
      actions.push({ type: "post_attack_move", unitId: unit.id, to: pos });
    }
  }
  for (const unit of validUnits) {
    const eff = getEffectiveStats(unit);
    const tileUnder = state.map.tiles[unit.pos.y][unit.pos.x];
    const terrainConfig = getTileTerrainConfig(tileUnder);
    if (!unit.hasMoved) {
      const reachable = getReachablePositions(state, unit.id);
      for (const pos of reachable) {
        if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
          actions.push({ type: "move", unitId: unit.id, to: pos });
        }
      }
    }
    if (eff.maxRange > 0) {
      for (const enemy of enemyUnits) {
        if (inRange(unit.pos, enemy.pos, eff.minRange, eff.maxRange)) {
          actions.push({ type: "attack", attackerId: unit.id, targetId: enemy.id });
        }
      }
      if (hasAbility(unit, "destroyer")) {
        for (let y = 0; y < state.map.height; y++) {
          for (let x = 0; x < state.map.width; x++) {
            const targetTile = state.map.tiles[y][x];
            const occupied = state.units.some((u) => u.pos.x === x && u.pos.y === y);
            if (!occupied && isTileDestroyableForRules(targetTile) && inRange(unit.pos, { x, y }, eff.minRange, eff.maxRange)) {
              actions.push({ type: "destroy_town", unitId: unit.id, target: { x, y } });
            }
          }
        }
      }
    }
    if (hasAbility(unit, "healer")) {
      for (const target of state.units) {
        if (canHealTarget(state, unit, target)) {
          actions.push({ type: "heal", healerId: unit.id, targetId: target.id });
        }
      }
    }
    if (hasAbility(unit, "summoner") && state.graves) {
      for (const grave of state.graves) {
        if (inRange(unit.pos, grave.pos, eff.minRange, eff.maxRange)) {
          const hasUnitOnGrave = state.units.some((u) => u.pos.x === grave.pos.x && u.pos.y === grave.pos.y);
          if (!hasUnitOnGrave) {
            actions.push({ type: "summon", summonerId: unit.id, graveId: grave.id, spawnPos: { ...grave.pos } });
          }
        }
      }
    }
    if (hasAbility(unit, "supporter")) {
      for (const friend of sameTeamUnits) {
        if (friend.id !== unit.id && getDistance(unit.pos, friend.pos) <= 2) {
          const isFriendActed = friend.hasActed;
          const isExcluded = hasAbility(friend, "assault_troop") || hasAbility(friend, "castle_capturer") || hasAbility(friend, "supporter");
          const isLevelLesserOrEqual = (friend.level ?? 0) <= (unit.level ?? 0);
          const notSupportedYet = !friend.hasBeenSupportedThisTurn;
          if (isFriendActed && !isExcluded && isLevelLesserOrEqual && notSupportedYet) {
            actions.push({ type: "support", supporterId: unit.id, targetId: friend.id });
          }
        }
      }
    }
    const canCaptureOwner = tileUnder.ownerId === null || !areAlliedPlayers(state, tileUnder.ownerId, playerId);
    if (terrainConfig.key === "town" && canCaptureOwner && hasAbility(unit, "village_capturer")) {
      actions.push({ type: "capture", unitId: unit.id });
    }
    if (terrainConfig.key === "castle" && canCaptureOwner && hasAbility(unit, "castle_capturer")) {
      actions.push({ type: "capture", unitId: unit.id });
    }
    if (terrainConfig.key === "town" && hasAbility(unit, "destroyer")) {
      actions.push({ type: "destroy_town", unitId: unit.id });
    }
    if (terrainConfig.key === "damaged_town" && hasAbility(unit, "repairer")) {
      actions.push({ type: "repair", unitId: unit.id });
    }
    actions.push({ type: "wait", unitId: unit.id });
  }
  if (!pendingUnitId) {
    const recruitClasses = getRecruitableUnits(state, playerId).filter((c) => canRecruitUnitClass(state, playerId, c));
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainKey(tile) === "castle" && tile.ownerId === playerId) {
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/team_cleanup.ts
function destroyTeamForRules(state, teamId) {
  const player = state.players.find((entry) => entry.id === teamId);
  if (!player) return false;
  player.isAlive = false;
  for (const row of state.map.tiles) {
    for (const tile of row) {
      if (tile.ownerId === teamId) setTileOwnerAfterRepairForRules(tile);
    }
  }
  const removesPending = state.units.some((unit) => unit.id === state.pendingUnitId && unit.ownerId === teamId);
  state.units = state.units.filter((unit) => unit.ownerId !== teamId);
  if (removesPending) delete state.pendingUnitId;
  return true;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/apk_compat.ts
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/apk_stage.ts
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/campaign_events.ts
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
function matchesSelector(state, unit, selector) {
  if (!selector) return true;
  if (selector.teamId !== void 0 && unit.ownerId !== selector.teamId) return false;
  if (selector.unitId !== void 0 && unit.id !== selector.unitId) return false;
  if (selector.unitCode !== void 0 && unit.apkUnitCode !== selector.unitCode) return false;
  if (selector.unitClass !== void 0 && unit.unitClass !== selector.unitClass) return false;
  if (selector.commanderOfTeam !== void 0 && !isCommanderUnit(state, unit, selector.commanderOfTeam)) return false;
  if (selector.pos && !samePos(unit.pos, selector.pos)) return false;
  if (selector.area && !inArea(unit.pos, selector.area)) return false;
  return true;
}
function selectUnits(state, selector) {
  return state.units.filter((unit) => unit.hp > 0 && matchesSelector(state, unit, selector));
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
  if (state.units.some((unit2) => unit2.hp > 0 && samePos(unit2.pos, reinforcement.pos))) {
    return false;
  }
  const nextId = state.nextUnitId ?? 100;
  const unit = {
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
  unit.movementRemaining = getEffectiveStats(unit).move;
  state.nextUnitId = nextId + 1;
  state.units.push(unit);
  return true;
}
function applyEffect(state, effect) {
  switch (effect.type) {
    case "create_unit":
      return createUnitFromReinforcement(state, effect.unit) ? 1 : 0;
    case "reinforce":
      return effect.units.reduce((count, unit) => count + (createUnitFromReinforcement(state, unit) ? 1 : 0), 0);
    case "damage_units": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit) => {
        unit.hp -= effect.amount;
      });
      return targets.length;
    }
    case "change_unit_hp": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit) => {
        unit.hp += effect.delta;
      });
      return targets.length;
    }
    case "change_unit_team": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit) => {
        unit.ownerId = effect.teamId;
        if (effect.resetStatus) {
          delete unit.status;
        }
        unit.hasMoved = false;
        unit.hasActed = false;
        unit.movementRemaining = getEffectiveStats(unit).move;
      });
      return targets.length;
    }
    case "destroy_units": {
      const targets = selectUnits(state, effect.selector);
      targets.forEach((unit) => {
        unit.hp = 0;
      });
      return targets.length;
    }
    case "remove_units": {
      const ids = new Set(selectUnits(state, effect.selector).map((unit) => unit.id));
      const before = state.units.length;
      state.units = state.units.filter((unit) => !ids.has(unit.id));
      return before - state.units.length;
    }
    case "move_unit": {
      const targets = selectUnits(state, effect.selector);
      const unit = targets[0];
      if (!unit) return 0;
      if (effect.to.x < 0 || effect.to.y < 0 || effect.to.x >= state.map.width || effect.to.y >= state.map.height) return 0;
      if (state.units.some((other) => other.id !== unit.id && other.hp > 0 && samePos(other.pos, effect.to))) return 0;
      unit.pos = { ...effect.to };
      if (effect.endAction) {
        unit.hasMoved = true;
        unit.hasActed = true;
        unit.movementRemaining = 0;
      }
      return 1;
    }
    case "set_tile": {
      const tile = state.map.tiles[effect.pos.y]?.[effect.pos.x];
      if (!tile) return 0;
      if (effect.terrainId !== void 0) {
        setTileTerrainForRules(tile, effect.terrainId);
      }
      if (effect.ownerId !== void 0) {
        setTileOwnerForRules(tile, effect.ownerId);
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/engine.ts
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
    this.state = JSON.parse(JSON.stringify(initialState));
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
    return JSON.parse(JSON.stringify(this.state));
  }
  clone() {
    return new _GameEngine(this.state, {
      unsafeBypassValidationForTests: this.unsafeBypassValidationForTests,
      disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction
    });
  }
  getLegalActions(playerId) {
    return getLegalActions(this.state, playerId);
  }
  isTerminal() {
    return this.state.winner !== null;
  }
  getWinner() {
    return this.state.winner;
  }
  reset(config) {
    if (config) {
      this.state = JSON.parse(JSON.stringify(config));
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
    for (const unit of deadUnits) {
      if (!isCommanderUnit(this.state, unit)) continue;
      const player = this.state.players.find((p) => p.id === unit.ownerId);
      if (player) {
        player.commanderDeathCount += 1;
        player.commanderReserveLevel = unit.level ?? 0;
        player.commanderReserveExp = unit.exp ?? 0;
      }
    }
  }
  applyCappedRecovery(unit, maxHp, amount) {
    if (amount <= 0 || unit.hp >= maxHp) return;
    unit.hp = Math.min(maxHp, unit.hp + amount);
  }
  refreshMovementForCurrentStatus(unit) {
    unit.movementRemaining = getEffectiveStats(unit).move;
  }
  decayStatusAtTurnStart(unit) {
    if (!unit.status) return;
    const nextDuration = getStatusDuration(unit.status) - 1;
    if (nextDuration < 0) {
      delete unit.status;
      return;
    }
    setStatusDuration(unit.status, nextDuration);
  }
  applyTurnStartHpDelta(unit, maxHp, delta) {
    unit.hp = Math.max(0, Math.min(maxHp, unit.hp + delta));
  }
  shouldCreateGraveForDeadUnit(unit) {
    return !isCommanderUnit(this.state, unit) && !isUndead(unit);
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
    for (const unit of deadUnits) {
      if (this.shouldCreateGraveForDeadUnit(unit)) {
        this.createGraveAt(unit.pos, this.state.currentPlayer);
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
        const tile = this.state.map.tiles[y][x];
        if (tile.ownerId !== playerId || getTileTerrainKey(tile) !== "castle") continue;
        const occupyingEnemies = this.state.units.filter((unit) => unit.pos.x === x && unit.pos.y === y && areEnemyPlayers(this.state, unit.ownerId, playerId));
        for (const enemy of occupyingEnemies) {
          enemy.hp = Math.max(0, Math.min(getEffectiveStats(enemy).maxHp, enemy.hp - 50));
        }
      }
    }
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
      const commander = getCommanderUnit(this.state, playerId);
      if (commander) {
        const lvl = commander.level ?? 0;
        totalIncome += ruleConfig.incomeCommanderBase + lvl * ruleConfig.incomeCommanderGrowth;
      }
      nextPlayer.gold += totalIncome;
    }
    this.state.units.forEach((u) => {
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
        const canReceiveTerrainHeal = terrainHealPerTurn > 0 && (!tileHealingRequiresFriendlyOwner(tile) || tile.ownerId !== null && areAlliedPlayers(this.state, playerId, tile.ownerId));
        if (canReceiveTerrainHeal) {
          hpDelta += terrainHealPerTurn;
        }
        if (hasAbility(u, "water_child") && isWaterTerrain(tile)) {
          hpDelta += 10;
        }
        if (hasAbility(u, "forest_child") && isForestTerrain(tile)) {
          hpDelta += 10;
        }
        if (hasAbility(u, "mountain_child") && isMountainTerrain(tile)) {
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
  consumeGraveAtUnitPosition(unit, options = {}) {
    if (!this.state.graves) return;
    const graveIdx = this.state.graves.findIndex((g) => g.pos.x === unit.pos.x && g.pos.y === unit.pos.y);
    if (graveIdx === -1) return;
    const applyHpDelta = options.applyHpDelta ?? true;
    let hpDelta = 0;
    if (isUndead(unit)) {
      hpDelta = 10;
      if (applyHpDelta) {
        this.applyCappedRecovery(unit, getEffectiveStats(unit).maxHp, hpDelta);
      }
    } else if (!hasAbility(unit, "summoner")) {
      hpDelta = -10;
      if (applyHpDelta) {
        unit.hp += hpDelta;
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
  triggerAuras(unit, options = {}) {
    if (unit.hp <= 0) {
      return {
        deferredActingUnitHpDelta: 0,
        killedUnits: []
      };
    }
    let deferredActingUnitHpDelta = 0;
    const killedUnits = [];
    if (hasAbility(unit, "cleansing_aura")) {
      const level = unit.level ?? 0;
      const healVal = 10 + level * 5;
      this.state.units.forEach((u) => {
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
    if (hasAbility(unit, "attack_aura")) {
      this.state.units.forEach((u) => {
        if (u.hp > 0 && areAlliedPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
          if (!u.status || u.status.type === "inspired") {
            u.status = { type: "inspired", remainingTurns: 0 };
          }
        }
      });
    }
    if (hasAbility(unit, "weakness_aura")) {
      this.state.units.forEach((u) => {
        if (u.hp > 0 && areEnemyPlayers(this.state, unit.ownerId, u.ownerId) && getDistance(unit.pos, u.pos) <= 2) {
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
      const legalActions = getLegalActions(this.state, this.state.currentPlayer);
      const isLegal = legalActions.some((la) => areActionsEqual(la, action));
      if (!isLegal) {
        return {
          state: this.getState(),
          reward: 0,
          done: this.isTerminal(),
          info: `\u975E\u6CD5\u52A8\u4F5C\uFF1A\u5F53\u524D\u73A9\u5BB6\u65E0\u6CD5\u6267\u884C\u8BE5\u52A8\u4F5C`
        };
      }
    }
    const prevCurrentPlayer = this.state.currentPlayer;
    let reward = 0;
    let info = "";
    const ruleConfig = getRuleConfig(this.state);
    let standbyUnitId = null;
    switch (action.type) {
      case "move": {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          const cost = getMoveCostTo(this.state, unit.id, action.to);
          const eff = getEffectiveStats(unit);
          const remCur = unit.movementRemaining ?? eff.move;
          unit.movementRemaining = Math.max(0, remCur - cost);
          unit.pos = { ...action.to };
          unit.hasMoved = true;
          info = `Unit ${unit.id} moved to ${action.to.x},${action.to.y}`;
        }
        break;
      }
      case "post_attack_move": {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          const cost = getMoveCostTo(this.state, unit.id, action.to);
          unit.movementRemaining = Math.max(0, (unit.movementRemaining ?? 0) - cost);
          unit.pos = { ...action.to };
          unit.hasPostAttackMoved = true;
          unit.hasActed = true;
          standbyUnitId = unit.id;
          info = `Unit ${unit.id} post-attack moved to ${action.to.x},${action.to.y}`;
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
          const tile = this.state.map.tiles[target.y]?.[target.x];
          if (tile && isTileDestroyableForRules(tile)) {
            destroyTileForRules(tile);
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
        const unit = this.state.units.find((u) => u.id === action.unitId);
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
            type: "tile_occupied",
            pos: { ...unit.pos },
            ownerId: unit.ownerId,
            previousOwnerId
          });
        }
        break;
      }
      case "repair": {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          const tile = this.state.map.tiles[unit.pos.y][unit.pos.x];
          if (getTileTerrainKey(tile) === "damaged_town") {
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
      case "wait": {
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          unit.hasMoved = true;
          unit.hasActed = true;
          standbyUnitId = unit.id;
          info = `Unit ${unit.id} waited.`;
        }
        break;
      }
      case "recruit_to_castle": {
        const player = this.state.players.find((p) => p.id === this.state.currentPlayer);
        if (player && canRecruitUnitClass(this.state, this.state.currentPlayer, action.unitClass)) {
          const castleOccupant = this.state.units.find((unit) => unit.pos.x === action.castlePos.x && unit.pos.y === action.castlePos.y && unit.hp > 0);
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
      const standbyUnit = this.state.units.find((unit) => unit.id === standbyUnitId && unit.hp > 0);
      if (standbyUnit?.hasActed) {
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
      const hasCastle = this.state.map.tiles.some((row) => row.some((tile) => tile.ownerId === player.id && getTileTerrainKey(tile) === "castle"));
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/apk_skirmish_tile_usage.ts
var APK_SKIRMISH_TILE_USAGE = {
  "(4) Crossroads.aem": { 0: 21, 1: 11, 3: 1, 4: 2, 5: 1, 6: 11, 7: 1, 8: 2, 9: 1, 10: 1, 11: 11, 12: 1, 13: 2, 14: 2, 15: 15, 16: 17, 17: 24, 18: 20, 19: 14, 20: 14, 21: 11, 22: 2, 23: 4, 24: 2, 25: 4, 26: 2, 27: 4, 36: 4, 37: 4 },
  "(3) Frozen fields.aem": { 0: 20, 1: 8, 3: 4, 4: 3, 5: 2, 7: 2, 8: 3, 9: 5, 10: 3, 11: 3, 12: 2, 13: 4, 14: 3, 15: 9, 16: 8, 17: 43, 18: 29, 19: 17, 27: 3, 36: 6, 37: 3 },
  "(2) Icy Paths.aem": { 0: 4, 3: 6, 4: 2, 5: 2, 6: 9, 7: 3, 8: 4, 9: 6, 10: 4, 11: 8, 12: 2, 13: 5, 14: 2, 15: 23, 16: 17, 17: 24, 18: 23, 19: 15, 20: 16, 21: 16, 22: 3, 23: 1, 24: 3, 25: 1, 26: 3, 28: 4, 29: 4, 32: 1, 36: 10, 37: 4 },
  "(2) Liberty Port.aem": { 0: 9, 1: 3, 3: 7, 4: 3, 5: 3, 6: 2, 7: 3, 8: 3, 9: 6, 10: 2, 11: 3, 12: 3, 13: 2, 14: 3, 15: 19, 16: 13, 17: 19, 18: 10, 19: 11, 20: 7, 21: 12, 23: 3, 24: 4, 25: 4, 26: 3, 36: 9, 37: 3 },
  "(2) Mourningstar.aem": { 0: 4, 1: 4, 3: 1, 4: 2, 5: 1, 6: 2, 7: 1, 8: 1, 9: 1, 10: 1, 11: 2, 12: 1, 13: 1, 14: 2, 15: 9, 16: 3, 17: 10, 18: 8, 19: 4, 20: 8, 21: 12, 23: 1, 24: 3, 25: 1, 26: 3, 27: 2, 28: 6, 30: 2, 36: 8, 37: 2, 49: 2, 50: 2, 54: 1, 56: 1, 57: 1, 60: 1, 65: 1, 67: 2, 68: 2, 69: 1, 70: 1 },
  "(2) Peak Island.aem": { 0: 49, 1: 11, 3: 9, 4: 1, 5: 2, 6: 11, 7: 2, 8: 1, 9: 9, 10: 2, 11: 11, 12: 2, 13: 1, 14: 1, 15: 14, 16: 11, 17: 18, 18: 16, 19: 14, 20: 14, 21: 10, 23: 1, 24: 1, 25: 1, 26: 1, 27: 2, 36: 8, 37: 2 },
  "(4) Shadowlands.aem": { 0: 53, 1: 10, 3: 15, 4: 6, 5: 3, 6: 5, 7: 3, 8: 6, 9: 15, 10: 6, 11: 12, 12: 6, 13: 8, 14: 8, 15: 14, 16: 15, 17: 23, 18: 48, 19: 24, 20: 23, 21: 18, 23: 3, 24: 4, 25: 4, 26: 3, 27: 2, 36: 12, 37: 10, 74: 2 },
  "(4) Solitude.aem": { 0: 23, 1: 9, 3: 11, 4: 5, 5: 4, 6: 11, 7: 4, 8: 5, 9: 11, 10: 4, 11: 11, 12: 4, 13: 5, 14: 5, 15: 5, 16: 11, 17: 8, 18: 17, 19: 12, 20: 12, 21: 12, 22: 4, 23: 1, 24: 1, 25: 1, 26: 1, 28: 4, 29: 4, 36: 12, 37: 4, 42: 2, 43: 2 },
  "(2) The Crossing.aem": { 0: 22, 3: 15, 4: 2, 5: 1, 8: 1, 9: 15, 12: 1, 13: 1, 14: 2, 15: 1, 16: 9, 17: 8, 18: 12, 19: 10, 20: 6, 21: 18, 23: 2, 24: 3, 25: 2, 26: 3, 28: 6, 36: 6, 37: 4 },
  "(4) The Crucible.aem": { 0: 61, 1: 11, 3: 27, 5: 9, 6: 27, 7: 9, 9: 27, 10: 9, 11: 27, 12: 9, 15: 14, 16: 6, 17: 16, 18: 16, 19: 8, 20: 18, 21: 18, 22: 4, 28: 12, 29: 12, 31: 1, 36: 12, 37: 8 },
  "(4) Waterways.aem": { 0: 7, 1: 1, 3: 16, 4: 3, 5: 5, 6: 7, 7: 5, 8: 3, 9: 16, 10: 4, 11: 10, 12: 4, 13: 2, 14: 2, 15: 6, 16: 8, 17: 6, 18: 28, 19: 8, 20: 7, 21: 8, 23: 3, 24: 3, 25: 3, 26: 3, 27: 6, 28: 7, 31: 2, 36: 8, 37: 4, 39: 1, 50: 1, 51: 1, 52: 1, 53: 1, 54: 1, 55: 1, 56: 1, 57: 1, 58: 1, 59: 1, 60: 1, 61: 1, 64: 1, 65: 6, 66: 4, 67: 1, 68: 1, 69: 1, 70: 3 },
  "(4) Winterstorm.aem": { 1: 4, 3: 4, 4: 4, 6: 4, 8: 4, 9: 4, 11: 4, 13: 4, 14: 4, 15: 15, 16: 1, 17: 16, 18: 44, 19: 16, 20: 10, 21: 10, 22: 1, 31: 4, 36: 12, 37: 4 },
  "(4) classic 1.aem": { 3: 14, 5: 2, 6: 16, 7: 2, 9: 14, 10: 2, 11: 16, 12: 2, 15: 14, 16: 10, 17: 16, 18: 56, 19: 6, 20: 22, 21: 8, 23: 3, 24: 1, 25: 3, 26: 1, 28: 8, 29: 4, 36: 16, 37: 4 },
  "(3) classic 2.aem": { 0: 18, 3: 5, 4: 1, 5: 1, 7: 1, 8: 1, 9: 5, 10: 2, 11: 1, 12: 2, 13: 3, 14: 3, 15: 28, 16: 16, 17: 39, 18: 24, 19: 9, 20: 15, 21: 12, 23: 1, 24: 1, 25: 1, 26: 1, 27: 2, 36: 9, 37: 3 },
  "(2) Duel.aem": { 0: 67, 1: 6, 2: 7, 3: 7, 5: 3, 6: 7, 7: 5, 8: 2, 9: 7, 10: 5, 11: 7, 12: 3, 13: 2, 15: 7, 16: 4, 17: 6, 18: 4, 19: 4, 20: 2, 21: 2, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 36: 5, 37: 2 },
  "(2) Crossed swords.aem": { 0: 43, 1: 5, 2: 6, 3: 10, 4: 3, 5: 3, 6: 11, 7: 3, 8: 3, 9: 10, 10: 3, 11: 11, 12: 3, 13: 3, 14: 3, 15: 5, 16: 9, 17: 10, 18: 8, 19: 8, 20: 4, 21: 12, 22: 2, 23: 1, 24: 1, 25: 1, 26: 1, 29: 2, 36: 10, 37: 4 },
  "(4) Critical mass.aem": { 0: 91, 1: 14, 2: 11, 3: 1, 4: 5, 5: 6, 6: 1, 7: 6, 8: 5, 9: 1, 10: 6, 11: 1, 12: 6, 13: 5, 14: 5, 15: 4, 18: 4, 20: 10, 21: 10, 22: 5, 23: 1, 24: 1, 25: 1, 26: 1, 36: 20, 37: 4 },
  "(3) Midway.aem": { 0: 5, 1: 5, 2: 1, 3: 17, 4: 1, 5: 6, 6: 19, 7: 5, 9: 17, 10: 4, 11: 13, 12: 5, 14: 1, 15: 12, 16: 5, 17: 10, 18: 8, 19: 10, 20: 11, 21: 10, 23: 1, 24: 1, 25: 1, 26: 1, 28: 10, 29: 4, 36: 15, 37: 6 },
  "(2) Swamplands.aem": { 3: 4, 5: 4, 6: 4, 7: 4, 9: 4, 10: 4, 11: 4, 12: 4, 15: 2, 16: 2, 17: 2, 19: 4, 20: 4, 21: 4, 24: 1, 26: 1, 27: 1, 28: 16, 29: 16, 36: 13, 37: 2 },
  "(3) Glu.aem": { 0: 77, 1: 7, 2: 9, 3: 10, 4: 5, 5: 5, 6: 14, 7: 4, 8: 4, 9: 11, 10: 4, 11: 15, 12: 4, 13: 4, 14: 4, 15: 15, 16: 2, 17: 15, 18: 8, 19: 6, 20: 5, 21: 6, 22: 1, 29: 2, 36: 6, 37: 4 }
};

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/apk_manifest.ts
var APK_SKIRMISH_MAP_DATA = [
  {
    name: "(4) Crossroads.aem",
    width: 11,
    height: 19,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 1, x: 1, y: 3, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 9, y: 3, apkUnitId: 9, extra: 0 },
      { teamId: 3, x: 1, y: 15, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 9, y: 15, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    recommendedGold: 200
  },
  {
    name: "(3) Frozen fields.aem",
    width: 15,
    height: 12,
    author: null,
    playerIds: [0, 1, 2],
    initialUnits: [
      { teamId: 0, x: 2, y: 1, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 7, y: 10, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 13, y: 1, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1 },
    villageOwnerCounts: { N: 6 },
    recommendedGold: null
  },
  {
    name: "(2) Icy Paths.aem",
    width: 15,
    height: 15,
    author: null,
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 13, y: 13, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 1, y: 1, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, N: 2 },
    villageOwnerCounts: { "0": 2, "1": 2, N: 6 },
    recommendedGold: null
  },
  {
    name: "(2) Liberty Port.aem",
    width: 13,
    height: 13,
    author: null,
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 1, y: 1, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 11, y: 1, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, N: 1 },
    villageOwnerCounts: { N: 9 },
    recommendedGold: null
  },
  {
    name: "(2) Mourningstar.aem",
    width: 11,
    height: 11,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 2, y: 8, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 8, y: 2, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1 },
    villageOwnerCounts: { "0": 1, "1": 2, N: 5 },
    recommendedGold: 250
  },
  {
    name: "(2) Peak Island.aem",
    width: 15,
    height: 15,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 7, y: 3, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 7, y: 11, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1 },
    villageOwnerCounts: { "1": 2, N: 6 },
    recommendedGold: 300
  },
  {
    name: "(4) Shadowlands.aem",
    width: 19,
    height: 19,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 3, x: 16, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 9, y: 1, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 9, y: 15, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 2, y: 7, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1, N: 6 },
    villageOwnerCounts: { N: 12 },
    recommendedGold: 150
  },
  {
    name: "(4) Solitude.aem",
    width: 15,
    height: 15,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 0, x: 7, y: 2, apkUnitId: 9, extra: 0 },
      { teamId: 3, x: 12, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 2, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 7, y: 12, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { N: 12 },
    recommendedGold: 50
  },
  {
    name: "(2) The Crossing.aem",
    width: 15,
    height: 10,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 4, y: 5, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 12, y: 3, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, N: 2 },
    villageOwnerCounts: { "1": 3, N: 3 },
    recommendedGold: 150
  },
  {
    name: "(4) The Crucible.aem",
    width: 19,
    height: 19,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 0, x: 3, y: 6, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 6, y: 15, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 12, y: 3, apkUnitId: 9, extra: 0 },
      { teamId: 3, x: 15, y: 12, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1, N: 4 },
    villageOwnerCounts: { N: 12 },
    recommendedGold: 300
  },
  {
    name: "(4) Waterways.aem",
    width: 15,
    height: 15,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 0, x: 3, y: 2, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 11, y: 2, apkUnitId: 9, extra: 0 },
      { teamId: 3, x: 12, y: 12, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 2, y: 12, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { N: 8 },
    recommendedGold: 150
  },
  {
    name: "(4) Winterstorm.aem",
    width: 13,
    height: 13,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 3, x: 6, y: 0, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 6, y: 12, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 12, y: 6, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 0, y: 6, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { N: 12 },
    recommendedGold: 150
  },
  {
    name: "(4) classic 1.aem",
    width: 16,
    height: 15,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 3, x: 3, y: 13, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 1, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 14, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 12, y: 1, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { "0": 2, "1": 2, "2": 2, "3": 2, N: 8 },
    recommendedGold: 50
  },
  {
    name: "(3) classic 2.aem",
    width: 17,
    height: 12,
    author: null,
    playerIds: [0, 2, 3],
    initialUnits: [
      { teamId: 0, x: 15, y: 9, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 1, y: 9, apkUnitId: 9, extra: 0 },
      { teamId: 3, x: 8, y: 2, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { "0": 2, "2": 2, "3": 3, N: 2 },
    recommendedGold: null
  },
  {
    name: "(2) Duel.aem",
    width: 13,
    height: 13,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 1, x: 9, y: 6, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 4, y: 4, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1 },
    villageOwnerCounts: { "1": 1, N: 4 },
    recommendedGold: 200
  },
  {
    name: "(2) Crossed swords.aem",
    width: 11,
    height: 18,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 1, x: 4, y: 12, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 5, y: 2, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, N: 2 },
    villageOwnerCounts: { "0": 2, "1": 4, N: 4 },
    recommendedGold: 50
  },
  {
    name: "(4) Critical mass.aem",
    width: 15,
    height: 15,
    author: "youxing",
    playerIds: [0, 1, 2, 3],
    initialUnits: [
      { teamId: 3, x: 7, y: 2, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 12, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 2, y: 7, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 7, y: 12, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, "3": 1 },
    villageOwnerCounts: { "0": 2, "1": 2, "2": 2, "3": 2, N: 12 },
    recommendedGold: 50
  },
  {
    name: "(3) Midway.aem",
    width: 17,
    height: 12,
    author: null,
    playerIds: [0, 1, 2],
    initialUnits: [
      { teamId: 1, x: 15, y: 10, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 1, y: 10, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 8, y: 1, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, N: 3 },
    villageOwnerCounts: { N: 15 },
    recommendedGold: null
  },
  {
    name: "(2) Swamplands.aem",
    width: 10,
    height: 10,
    author: "youxing",
    playerIds: [0, 1],
    initialUnits: [
      { teamId: 0, x: 3, y: 9, apkUnitId: 0, extra: 0 },
      { teamId: 1, x: 6, y: 0, apkUnitId: 0, extra: 0 },
      { teamId: 1, x: 9, y: 0, apkUnitId: 0, extra: 0 },
      { teamId: 0, x: 2, y: 6, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 5, y: 5, apkUnitId: 9, extra: 0 },
      { teamId: 0, x: 0, y: 9, apkUnitId: 0, extra: 0 }
    ],
    castleOwnerCounts: { N: 2 },
    villageOwnerCounts: { "1": 2, N: 11 },
    recommendedGold: 50
  },
  {
    name: "(3) Glu.aem",
    width: 13,
    height: 19,
    author: null,
    playerIds: [0, 1, 2],
    initialUnits: [
      { teamId: 0, x: 3, y: 4, apkUnitId: 9, extra: 0 },
      { teamId: 2, x: 3, y: 14, apkUnitId: 9, extra: 0 },
      { teamId: 1, x: 9, y: 8, apkUnitId: 9, extra: 0 }
    ],
    castleOwnerCounts: { "0": 1, "1": 1, "2": 1, N: 1 },
    villageOwnerCounts: { N: 6 },
    recommendedGold: null
  }
];
function getRequiredTileUsage(name) {
  const usage = APK_SKIRMISH_TILE_USAGE[name];
  if (usage === void 0) {
    throw new Error(`\u7F3A\u5C11 APK skirmish \u5730\u56FE tile \u4F7F\u7528\u91CF: ${name}`);
  }
  return usage;
}
function getApkTerrainConfidenceReportFromUsage(usage) {
  const byConfidence = {
    confirmed: 0,
    atlas: 0,
    approximate: 0,
    unmapped: 0
  };
  const approximateTerrainIds = /* @__PURE__ */ new Set();
  const unmappedTerrainIds = /* @__PURE__ */ new Set();
  let tileCount = 0;
  let approximateTileCount = 0;
  let unmappedTileCount = 0;
  for (const [apkTerrainIdText, count = 0] of Object.entries(usage)) {
    const apkTerrainId = Number(apkTerrainIdText);
    const mappingInfo = getSkirmishApkTerrainMappingInfo(apkTerrainId);
    byConfidence[mappingInfo.confidence] += count;
    tileCount += count;
    if (mappingInfo.confidence === "approximate") {
      approximateTerrainIds.add(apkTerrainId);
      approximateTileCount += count;
    } else if (mappingInfo.confidence === "unmapped") {
      unmappedTerrainIds.add(apkTerrainId);
      unmappedTileCount += count;
    }
  }
  return {
    tileCount,
    byConfidence,
    approximateTerrainIds: [...approximateTerrainIds].sort((a, b) => a - b),
    approximateTileCount,
    unmappedTerrainIds: [...unmappedTerrainIds].sort((a, b) => a - b),
    unmappedTileCount
  };
}
var APK_SKIRMISH_MAP_MANIFEST = APK_SKIRMISH_MAP_DATA.map((entry) => {
  const tileUsage = getRequiredTileUsage(entry.name);
  const terrainConfidence = getApkTerrainConfidenceReportFromUsage(tileUsage);
  return {
    ...entry,
    initialUnitCount: entry.initialUnits.length,
    tileUsage,
    terrainConfidence,
    unmappedTerrainIds: terrainConfidence.unmappedTerrainIds,
    resourcePath: `assets/maps/${entry.name}`,
    tailTemplate: "zero_suffix_58"
  };
});

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/env.ts
function calculateArmyValue(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const goldValue = player?.gold ?? 0;
  const unitValue = state.units.filter((unit) => unit.ownerId === playerId && unit.hp > 0).reduce((sum, unit) => {
    const configuredCost = getUnitCost(state, playerId, unit.unitClass);
    const baseCost = configuredCost ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
    const hpRatio = Math.max(0, unit.hp) / Math.max(1, getEffectiveStats(unit).maxHp);
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/runtime/skirmish_action_semantics.ts
function posOrEmpty(position) {
  return position ? { x: position.x, y: position.y } : null;
}
function unitPos(units, unitId) {
  if (!unitId) return null;
  const unit = units.get(unitId);
  return unit ? { x: unit.x, y: unit.y } : null;
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
      const actorId = action.type === "attack" ? action.attackerId : action.type === "heal" ? action.healerId : action.supporterId;
      return {
        ...base,
        actorId,
        actorPos: unitPos(units, actorId),
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/tactical_pathfinding.ts
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
    for (const unit of state.units) {
      const index = this.index(unit.pos);
      if (unit.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit);
    }
  }
  index(pos) {
    return pos.y * this.state.map.width + pos.x;
  }
  cost(unit, from, target) {
    if (from.x === target.x && from.y === target.y) return 0;
    const { width, height } = this.state.map;
    if (target.x < 0 || target.y < 0 || target.x >= width || target.y >= height) return null;
    const key = `${unit.id}:${from.x},${from.y}`;
    let costs = this.distances.get(key);
    if (!costs) {
      costs = this.buildDistances(unit, from);
      this.distances.set(key, costs);
    }
    const cost = costs[this.index(target)];
    return Number.isFinite(cost) ? cost : null;
  }
  buildDistances(unit, from) {
    const { width, height, tiles } = this.state.map;
    const costs = new Float64Array(width * height).fill(Infinity);
    const start = this.index(from);
    costs[start] = 0;
    const queue = new MinHeap();
    queue.push({ index: start, cost: 0 });
    const flying = isFlying(unit);
    let current;
    while (current = queue.pop()) {
      if (current.cost > costs[current.index]) continue;
      const occupying = this.occupants.get(current.index);
      if (current.index !== start && occupying && !areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId) && !(flying && !isFlying(occupying))) continue;
      const x = current.index % width;
      const y = Math.floor(current.index / width);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const stepCost = getMoveCostForUnit(this.state, { ...unit, pos: { x, y } }, tiles[ny][nx]);
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/path_relations.ts
var PATH_COST_NORMALIZER = 40;
var ZERO_FEATURES = {
  reachableCapturableBuilding: 0,
  normalizedNearestCapturableCost: 0,
  normalizedCapturableCostReduction: 0
};
function normalizeCost(value) {
  return Math.max(0, Math.min(1, value / PATH_COST_NORMALIZER));
}
function canCaptureTerrain(unitClass, terrainKey) {
  return terrainKey === "town" && hasAbility2(unitClass, "village_capturer") || terrainKey === "castle" && hasAbility2(unitClass, "castle_capturer");
}
function capturableTargets(state, playerId, unitClass) {
  const targets = [];
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = state.map.tiles[y]?.[x];
      if (!tile || tile.ownerId === playerId) continue;
      if (canCaptureTerrain(unitClass, getTileTerrainKey(tile))) targets.push({ x, y });
    }
  }
  return targets;
}
function nearestCost(pathfinder, unit, from, targets) {
  let best = Infinity;
  for (const target of targets) {
    const cost = pathfinder.cost(unit, from, target);
    if (cost !== null && cost < best) best = cost;
  }
  return Number.isFinite(best) ? best : null;
}
function applicableAction(state, playerId, action) {
  if (action.type === "move" || action.type === "post_attack_move") {
    const unit = state.units.find((candidate) => candidate.id === action.unitId && candidate.ownerId === playerId);
    return unit ? { unit, before: unit.pos, after: action.to, isCapture: false } : null;
  }
  if (action.type === "recruit_and_deploy") {
    const unit = {
      id: `path-recruit-${action.unitClass}`,
      ownerId: playerId,
      unitClass: action.unitClass,
      pos: action.castlePos,
      hp: 100,
      maxHp: 100,
      hasMoved: false,
      hasActed: false
    };
    return { unit, before: action.castlePos, after: action.to, isCapture: false };
  }
  if (action.type === "capture") {
    const unit = state.units.find((candidate) => candidate.id === action.unitId && candidate.ownerId === playerId);
    return unit ? { unit, before: unit.pos, after: unit.pos, isCapture: true } : null;
  }
  return null;
}
function encodePathRelations(state, playerId, actions) {
  const pathfinder = new TacticalPathfinder(state);
  const targetsByClass = /* @__PURE__ */ new Map();
  return actions.map((action) => {
    const applicable = applicableAction(state, playerId, action);
    if (!applicable) return { ...ZERO_FEATURES };
    const { unit, before, after, isCapture } = applicable;
    let targets = targetsByClass.get(unit.unitClass);
    if (!targets) {
      targets = capturableTargets(state, playerId, unit.unitClass);
      targetsByClass.set(unit.unitClass, targets);
    }
    if (targets.length === 0) return { ...ZERO_FEATURES };
    if (isCapture && targets.some((target) => target.x === after.x && target.y === after.y)) {
      return {
        reachableCapturableBuilding: 1,
        normalizedNearestCapturableCost: 0,
        normalizedCapturableCostReduction: 0
      };
    }
    const afterCost = nearestCost(pathfinder, unit, after, targets);
    if (afterCost === null) return { ...ZERO_FEATURES };
    const beforeCost = nearestCost(pathfinder, unit, before, targets);
    const reduction = beforeCost === null ? 0 : Math.max(0, beforeCost - afterCost);
    return {
      reachableCapturableBuilding: 1,
      normalizedNearestCapturableCost: normalizeCost(afterCost),
      normalizedCapturableCostReduction: normalizeCost(reduction)
    };
  });
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/spatial_tensor_encoder.ts
var SPATIAL_TENSOR_CHANNELS = 26;
var SPATIAL_TENSOR_CHANNELS_V19 = 34;
var SPATIAL_TENSOR_CHANNELS_LEGACY = 24;
var SPATIAL_TENSOR_MAX_H = 20;
var SPATIAL_TENSOR_MAX_W = 20;
var GLOBAL_FEATURE_DIM_V1 = 16;
var GLOBAL_FEATURE_DIM_V2 = 20;
var ACTION_SEMANTIC_DIM_V1 = 24;
var ACTION_SEMANTIC_DIM_V2 = 32;
var ACTION_SEMANTIC_DIM_V3 = 53;
var ACTION_SEMANTIC_DIM_PATH3 = 56;
var ENCODER_SCHEMA_ID_V13 = "spatial24_global20_actionSemantics32_v13";
var ENCODER_SCHEMA_ID_V14 = "spatial26_global20_actionSemantics53_v14";
var ENCODER_SCHEMA_ID_V15 = "spatial26_global20_actionSemantics53_v15";
var ENCODER_SCHEMA_ID_V19 = "spatial34_global20_actionSemantics53_v19";
var ENCODER_SCHEMA_ID_V19_PATH3 = "spatial34_global20_actionSemantics56_v19_path3";
var ENCODER_SCHEMA_ID_V1 = "spatial24_global16_actionSemantics24_v1";
var SUPPORTED_ENCODER_SCHEMA_IDS = [
  ENCODER_SCHEMA_ID_V1,
  ENCODER_SCHEMA_ID_V13,
  ENCODER_SCHEMA_ID_V14,
  ENCODER_SCHEMA_ID_V15,
  ENCODER_SCHEMA_ID_V19,
  ENCODER_SCHEMA_ID_V19_PATH3
];
var ENCODER_SCHEMA_CHANNELS = {
  [ENCODER_SCHEMA_ID_V1]: SPATIAL_TENSOR_CHANNELS_LEGACY,
  [ENCODER_SCHEMA_ID_V13]: SPATIAL_TENSOR_CHANNELS_LEGACY,
  [ENCODER_SCHEMA_ID_V14]: SPATIAL_TENSOR_CHANNELS,
  [ENCODER_SCHEMA_ID_V15]: SPATIAL_TENSOR_CHANNELS,
  [ENCODER_SCHEMA_ID_V19]: SPATIAL_TENSOR_CHANNELS_V19,
  [ENCODER_SCHEMA_ID_V19_PATH3]: SPATIAL_TENSOR_CHANNELS_V19
};
var ENCODER_SCHEMA_SEMANTIC_DIM = {
  [ENCODER_SCHEMA_ID_V1]: ACTION_SEMANTIC_DIM_V1,
  [ENCODER_SCHEMA_ID_V13]: ACTION_SEMANTIC_DIM_V2,
  [ENCODER_SCHEMA_ID_V14]: ACTION_SEMANTIC_DIM_V3,
  [ENCODER_SCHEMA_ID_V15]: ACTION_SEMANTIC_DIM_V3,
  [ENCODER_SCHEMA_ID_V19]: ACTION_SEMANTIC_DIM_V3,
  [ENCODER_SCHEMA_ID_V19_PATH3]: ACTION_SEMANTIC_DIM_PATH3
};
var ENCODER_SCHEMA_SEMANTICS_VARIANT = {
  [ENCODER_SCHEMA_ID_V1]: "v1_legacy",
  [ENCODER_SCHEMA_ID_V13]: "v13_legacy",
  [ENCODER_SCHEMA_ID_V14]: "v14_no_exp_projection",
  [ENCODER_SCHEMA_ID_V15]: "v15_current",
  // V19 不修改攻击语义：反击/自杀风险仍按引擎完整结算顺序，与 v15 逐位相同。
  [ENCODER_SCHEMA_ID_V19]: "v15_current",
  // Path-3 只追加路径事实，原有 53 维仍使用 v15 的完整引擎结算语义。
  [ENCODER_SCHEMA_ID_V19_PATH3]: "v15_current"
};
function actionSemanticsVariantForSchema(schemaId) {
  const variant = ENCODER_SCHEMA_SEMANTICS_VARIANT[schemaId];
  if (!variant) {
    throw new Error(
      `\u672A\u77E5\u7684 encoder schema\uFF1A${schemaId}\u3002V15/T15-02 \u8981\u6C42\u663E\u5F0F\u5206\u6D3E\uFF0C\u4E0D\u63A5\u53D7\u6309\u7EF4\u5EA6\u731C\u6D4B\u517C\u5BB9\uFF1B\u5DF2\u77E5 schema \u4E3A ${SUPPORTED_ENCODER_SCHEMA_IDS.join(" / ")}\u3002`
    );
  }
  return variant;
}
var ACTION_TYPE_LIST = [
  "move",
  "attack",
  "capture",
  "repair",
  "wait",
  "recruit_to_castle",
  "recruit_and_deploy",
  "heal",
  "summon",
  "support",
  "destroy_town",
  "post_attack_move",
  "surrender",
  "end_turn"
];
var ACTION_UNIT_CLASS_LIST = [
  "soldier",
  "ghost",
  "mermaid",
  "archer",
  "slime",
  "water_elemental",
  "dark_mage",
  "witch",
  "paladin",
  "elf",
  "berserker",
  "wolf",
  "golem",
  "ice_elemental",
  "druid",
  "catapult",
  "wolf_archer",
  "dragon",
  "commander",
  "skeleton",
  "crystal"
];
var ACTION_UNIT_CLASS_DIM = ACTION_UNIT_CLASS_LIST.length;
var ACTION_UNIT_CLASS_SLOT_START = 32;
var ACTION_UNIT_CLASS_SLOT_END = ACTION_UNIT_CLASS_SLOT_START + ACTION_UNIT_CLASS_DIM;
function encodeUnitClassOneHot(semantics, unitClass) {
  const index = ACTION_UNIT_CLASS_LIST.indexOf(unitClass);
  if (index < 0) return;
  semantics[ACTION_UNIT_CLASS_SLOT_START + index] = 1;
}
function unitClassIndex(unitClass) {
  const index = ACTION_UNIT_CLASS_LIST.indexOf(unitClass);
  return index < 0 ? 0 : index;
}
function categorizeUnitClass(cls) {
  switch (cls) {
    case "soldier":
    case "skeleton":
      return 1;
    // 步兵
    case "archer":
    case "wolf_archer":
      return 2;
    // 弓手/远程
    case "ghost":
    case "dragon":
      return 3;
    // 飞行
    case "wolf":
    case "berserker":
      return 4;
    // 骑兵/野兽
    case "dark_mage":
    case "witch":
    case "druid":
      return 5;
    // 施法者
    case "catapult":
    case "golem":
      return 6;
    // 重装/攻城
    case "commander":
      return 7;
    // 指挥官
    default:
      return 1;
  }
}
function estimateCounterDamageForVariant(variant, state, attackerId, defenderId, estDmg) {
  if (variant === "v1_legacy" || variant === "v13_legacy") {
    const attacker = state.units.find((u) => u.id === attackerId);
    if (!attacker) return 0;
    void estDmg;
    const defender = state.units.find((u) => u.id === defenderId);
    if (!defender) return 0;
    const legacyEstDmg = calculateDamage(state, attackerId, defenderId);
    return defender.hp - legacyEstDmg > 0 ? calculateDamage(state, defenderId, attackerId) : 0;
  }
  if (variant === "v14_no_exp_projection") {
    return estimateCounterDamageWithoutExpProjection(state, attackerId, defenderId);
  }
  return estimateCounterDamage(state, attackerId, defenderId);
}
function encodeGameStateSpatial(state, playerId, version = "v2", options) {
  const H = SPATIAL_TENSOR_MAX_H;
  const W = SPATIAL_TENSOR_MAX_W;
  const C = options?.channels ?? SPATIAL_TENSOR_CHANNELS;
  if (C !== SPATIAL_TENSOR_CHANNELS && C !== SPATIAL_TENSOR_CHANNELS_LEGACY && C !== SPATIAL_TENSOR_CHANNELS_V19) {
    throw new Error(
      `encodeGameStateSpatial: \u4E0D\u652F\u6301\u7684\u901A\u9053\u6570 ${C}\uFF08\u4EC5\u652F\u6301 ${SPATIAL_TENSOR_CHANNELS_LEGACY} / ${SPATIAL_TENSOR_CHANNELS} / ${SPATIAL_TENSOR_CHANNELS_V19}\uFF09`
    );
  }
  const writeV19Channels = C >= SPATIAL_TENSOR_CHANNELS_V19;
  const tensor = new Float32Array(C * H * W);
  const mapW = state.map.width;
  const mapH = state.map.height;
  const alliance = getAllianceId(state, playerId);
  const setChannel = (ch, y, x, val) => {
    if (y < 0 || y >= H || x < 0 || x >= W) return;
    tensor[ch * (H * W) + y * W + x] = val;
  };
  for (let y = 0; y < mapH && y < H; y += 1) {
    for (let x = 0; x < mapW && x < W; x += 1) {
      const tile = state.map.tiles[y]?.[x];
      if (!tile) continue;
      setChannel(23, y, x, 1);
      const cfg = getTileTerrainConfig(tile);
      const key = getTileTerrainKey(tile);
      const defBonus = (cfg?.defenseBonus ?? 0) / 40;
      setChannel(7, y, x, defBonus);
      if (key === "road" || key === "bridge" || key === "snow") {
        setChannel(0, y, x, 1);
      } else if (key === "forest") {
        setChannel(1, y, x, 1);
      } else if (key === "mountain" || key === "hill") {
        setChannel(2, y, x, 1);
      } else if (key === "deep_water" || key === "water_temple") {
        setChannel(3, y, x, 1);
      } else if (key === "castle") {
        setChannel(4, y, x, 1);
      } else if (key === "town" || key === "damaged_town") {
        setChannel(5, y, x, 1);
      } else {
        setChannel(6, y, x, 1);
      }
      if (tile.ownerId !== null) {
        if (getAllianceId(state, tile.ownerId) === alliance) {
          setChannel(8, y, x, 1);
        } else if (areEnemyPlayers(state, playerId, tile.ownerId)) {
          setChannel(9, y, x, 1);
        }
      } else if (key === "town" || key === "castle" || key === "damaged_town") {
        setChannel(10, y, x, 1);
      }
    }
  }
  const aliveUnits = state.units.filter((u) => u.hp > 0);
  const ownUnits = aliveUnits.filter((u) => getAllianceId(state, u.ownerId) === alliance);
  const enemyUnits = aliveUnits.filter((u) => areEnemyPlayers(state, playerId, u.ownerId));
  for (const u of ownUnits) {
    const x = u.pos.x;
    const y = u.pos.y;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    setChannel(11, y, x, 1);
    setChannel(12, y, x, Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp))));
    setChannel(13, y, x, !u.hasActed ? 1 : 0);
    setChannel(14, y, x, categorizeUnitClass(u.unitClass) / 7);
    const stats = getEffectiveStats(u);
    setChannel(15, y, x, (stats.minRange ?? 1) / 5);
    setChannel(16, y, x, (stats.maxRange ?? 1) / 5);
    setChannel(17, y, x, isCommanderUnit(state, u) ? 1 : 0);
    if (C > SPATIAL_TENSOR_CHANNELS_LEGACY) {
      setChannel(24, y, x, u.hasMoved ? 1 : 0);
      setChannel(25, y, x, Math.max(0, Math.min(1, stats.attack / 200)));
    }
    if (writeV19Channels) {
      setChannel(27, y, x, unitClassIndex(u.unitClass) / ACTION_UNIT_CLASS_DIM);
      setChannel(32, y, x, u.hasMoved ? 0 : Math.max(0, Math.min(1, (stats.move ?? 0) / 8)));
      setChannel(33, y, x, (stats.physicalDefense ?? 0) / 60);
    }
  }
  for (const u of enemyUnits) {
    const x = u.pos.x;
    const y = u.pos.y;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    setChannel(18, y, x, 1);
    setChannel(19, y, x, Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp))));
    setChannel(20, y, x, categorizeUnitClass(u.unitClass) / 7);
    setChannel(22, y, x, isCommanderUnit(state, u) ? 1 : 0);
    const stats = getEffectiveStats(u);
    const maxR = stats.maxRange ?? 1;
    const minR = stats.minRange ?? 1;
    const move = u.hasMoved ? 0 : stats.move ?? 4;
    const threatDist = move + maxR;
    for (let dy = -threatDist; dy <= threatDist; dy += 1) {
      for (let dx = -threatDist; dx <= threatDist; dx += 1) {
        const tx = x + dx;
        const ty = y + dy;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && dist <= threatDist) {
          setChannel(21, ty, tx, 1);
        }
      }
    }
    if (writeV19Channels) {
      setChannel(26, y, x, unitClassIndex(u.unitClass) / ACTION_UNIT_CLASS_DIM);
      setChannel(28, y, x, (stats.physicalDefense ?? 0) / 60);
      setChannel(29, y, x, (stats.magicDefense ?? 0) / 60);
      setChannel(30, y, x, Math.max(0, Math.min(1, (stats.attack ?? 0) / 200)));
      const nextTurnThreatDist = (stats.move ?? 4) + maxR;
      for (let dy = -nextTurnThreatDist; dy <= nextTurnThreatDist; dy += 1) {
        for (let dx = -nextTurnThreatDist; dx <= nextTurnThreatDist; dx += 1) {
          const tx = x + dx;
          const ty = y + dy;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && dist <= nextTurnThreatDist) {
            setChannel(31, ty, tx, 1);
          }
        }
      }
    }
  }
  const dim = version === "v1" ? GLOBAL_FEATURE_DIM_V1 : GLOBAL_FEATURE_DIM_V2;
  const globals = new Float32Array(dim);
  const enemies = state.players.filter((p) => p.id !== playerId && areEnemyPlayers(state, playerId, p.id));
  const ownPlayer = state.players.find((p) => p.id === playerId);
  const ownGold = ownPlayer?.gold ?? 0;
  const bestEnemyGold = enemies.length ? Math.max(...enemies.map((p) => p.gold)) : 0;
  const ownArmy = calculateArmyValue(state, playerId);
  const enemyArmy = enemies.length ? Math.max(...enemies.map((p) => calculateArmyValue(state, p.id))) : 0;
  const allTiles = state.map.tiles.flat();
  const townCount = (filterFn) => allTiles.filter((t) => {
    const k = getTileTerrainKey(t);
    return (k === "town" || k === "castle") && filterFn(t);
  }).length;
  const ownTowns = townCount((t) => t.ownerId !== null && getAllianceId(state, t.ownerId) === alliance);
  const enemyTowns = townCount((t) => t.ownerId !== null && areEnemyPlayers(state, playerId, t.ownerId));
  const neutralTowns = townCount((t) => t.ownerId === null);
  globals[0] = state.turn / 50;
  globals[1] = ownGold / 1e3;
  globals[2] = bestEnemyGold / 1e3;
  globals[3] = (ownGold - bestEnemyGold) / 1e3;
  globals[4] = ownUnits.length / 10;
  globals[5] = enemyUnits.length / 10;
  globals[6] = ownArmy / 1e3;
  globals[7] = enemyArmy / 1e3;
  globals[8] = ownTowns / 10;
  globals[9] = enemyTowns / 10;
  globals[10] = neutralTowns / 10;
  globals[11] = ownUnits.some((u) => isCommanderUnit(state, u)) ? 1 : 0;
  globals[12] = enemyUnits.some((u) => isCommanderUnit(state, u)) ? 1 : 0;
  globals[13] = state.pendingUnitId ? 1 : 0;
  globals[14] = mapW / 20;
  globals[15] = mapH / 20;
  if (version === "v2") {
    const commCost = getUnitCost(state, playerId, "commander");
    const deathCount = ownPlayer?.commanderDeathCount ?? 0;
    globals[16] = Math.min(1, deathCount / 5);
    globals[17] = commCost !== null ? Math.min(1, commCost / 1e3) : 0;
    globals[18] = commCost !== null ? Math.min(1, Math.max(0, commCost - ownGold) / 1e3) : 0;
    let unoccupiedCastles = 0;
    for (let y = 0; y < mapH; y += 1) {
      for (let x = 0; x < mapW; x += 1) {
        const tile = state.map.tiles[y]?.[x];
        if (tile && getTileTerrainKey(tile) === "castle") {
          if (tile.ownerId !== null && getAllianceId(state, tile.ownerId) === alliance) {
            const isOccupied = state.units.some((u) => u.hp > 0 && u.pos.x === x && u.pos.y === y);
            if (!isOccupied) {
              unoccupiedCastles += 1;
            }
          }
        }
      }
    }
    globals[19] = Math.min(1, unoccupiedCastles / 5);
  }
  return {
    spatialTensor: tensor,
    globalFeatures: globals,
    mapWidth: mapW,
    mapHeight: mapH,
    subjectPlayerId: playerId,
    version,
    channels: C
  };
}
function encodeCandidateActionSpatial(state, playerId, action, version = "v2", variant = "v15_current") {
  const unitsMap = new Map(state.units.map((u) => [u.id, { id: u.id, x: u.pos.x, y: u.pos.y }]));
  const sem = getActionSemantics(action, unitsMap);
  const semDim = version === "v1" ? ACTION_SEMANTIC_DIM_V1 : ACTION_SEMANTIC_DIM_V3;
  const semantics = new Float32Array(semDim);
  const typeIdx = ACTION_TYPE_LIST.indexOf(action.type);
  if (typeIdx !== -1) semantics[typeIdx] = 1;
  let actorCoord = sem.actorPos;
  let landingCoord = sem.landingPos;
  let targetCoord = sem.targetPos;
  if (action.type === "recruit_to_castle" || action.type === "recruit_and_deploy") {
    actorCoord = action.castlePos;
    landingCoord = action.type === "recruit_and_deploy" ? action.to : action.castlePos;
    encodeUnitClassOneHot(semantics, action.unitClass);
  }
  if (action.type === "attack") {
    const attacker = state.units.find((u) => u.id === action.attackerId);
    const defender = state.units.find((u) => u.id === action.targetId);
    if (attacker && defender) {
      const estDmg = calculateDamage(state, attacker.id, defender.id);
      const estCounter = estimateCounterDamageForVariant(
        variant,
        state,
        attacker.id,
        defender.id,
        estDmg
      );
      semantics[14] = Math.min(1, estDmg / 100);
      semantics[15] = Math.min(1, estCounter / 100);
      semantics[16] = estDmg >= defender.hp ? 1 : 0;
      semantics[17] = estCounter >= attacker.hp ? 1 : 0;
      semantics[18] = isCommanderUnit(state, defender) ? 1 : 0;
      semantics[22] = isCommanderUnit(state, attacker) ? 1 : 0;
      semantics[23] = attacker.hp / Math.max(1, attacker.maxHp);
    }
  } else if (action.type === "capture") {
    semantics[19] = 1;
  } else if (action.type === "destroy_town") {
    semantics[19] = 0.5;
  }
  if (targetCoord && targetCoord.y >= 0 && targetCoord.y < state.map.height && targetCoord.x >= 0 && targetCoord.x < state.map.width) {
    const tile = state.map.tiles[targetCoord.y]?.[targetCoord.x];
    if (tile) {
      const cfg = getTileTerrainConfig(tile);
      semantics[20] = (cfg?.defenseBonus ?? 0) / 40;
    }
  }
  if (actorCoord && landingCoord) {
    const dist = Math.abs(actorCoord.x - landingCoord.x) + Math.abs(actorCoord.y - landingCoord.y);
    semantics[21] = Math.min(1, dist / 10);
  }
  if (version === "v2") {
    const ownPlayer = state.players.find((p) => p.id === playerId);
    const ownGold = ownPlayer?.gold ?? 0;
    const isRecruit = action.type === "recruit_to_castle" || action.type === "recruit_and_deploy";
    const isCommRecruit = isRecruit && action.unitClass === "commander";
    const cost = isRecruit ? getUnitCost(state, playerId, action.unitClass) ?? 0 : 0;
    const commAlive = state.units.some((u) => u.hp > 0 && u.ownerId === playerId && isCommanderUnit(state, u));
    semantics[24] = isRecruit ? categorizeUnitClass(action.unitClass) / 7 : 0;
    semantics[25] = isCommRecruit ? 1 : 0;
    semantics[26] = Math.min(1, cost / 1e3);
    semantics[27] = Math.max(0, (ownGold - cost) / 1e3);
    semantics[28] = commAlive ? 1 : 0;
    semantics[29] = isCommRecruit ? (ownPlayer?.commanderReserveLevel ?? 0) / 3 : 0;
    semantics[30] = isCommRecruit ? (ownPlayer?.commanderReserveExp ?? 0) / 100 : 0;
    semantics[31] = action.type === "recruit_and_deploy" || Boolean(state.pendingUnitId) ? 1 : 0;
  }
  return {
    actorCoord,
    landingCoord,
    targetCoord,
    semantics
  };
}
function encodeCandidateActionsSpatialForSchema(state, playerId, actions, version, schemaId) {
  const variant = actionSemanticsVariantForSchema(schemaId);
  const semanticDim = ENCODER_SCHEMA_SEMANTIC_DIM[schemaId];
  const base = actions.map((action) => encodeCandidateActionSpatial(state, playerId, action, version, variant));
  if (schemaId !== ENCODER_SCHEMA_ID_V19_PATH3) {
    return base.map((features3) => ({
      ...features3,
      semantics: features3.semantics.length === semanticDim ? features3.semantics : Float32Array.from(features3.semantics).slice(0, semanticDim)
    }));
  }
  if (version !== "v2") throw new Error("Path-3 schema \u53EA\u652F\u6301 v2 \u7F16\u7801");
  const relations = encodePathRelations(state, playerId, actions);
  return base.map((features3, index) => {
    const semantics = new Float32Array(ACTION_SEMANTIC_DIM_PATH3);
    semantics.set(features3.semantics);
    const relation = relations[index];
    semantics[53] = relation.reachableCapturableBuilding;
    semantics[54] = relation.normalizedNearestCapturableCost;
    semantics[55] = relation.normalizedCapturableCostReduction;
    return { ...features3, semantics };
  });
}

// ai_training/r8_pure_policy_stage_20261014_125300/research/common.ts
var MAPS = ["Duel", "Liberty Port", "Swamplands", "The Crossing", "Icy Paths", "Peak Island", "Crossed swords"].map((x) => `(2) ${x}.aem`);
var canonical = (v) => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
var hash = (v) => import_node_crypto.default.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(canonical(v))).digest("hex");
var fileHash = (p) => import_node_crypto.default.createHash("sha256").update(import_node_fs.default.readFileSync(p)).digest("hex");
var RNG = class {
  constructor(seed) {
    this.calls = 0;
    this.next = () => {
      this.calls++;
      let t = this.state = this.state + 1831565813 >>> 0;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    this.state = seed >>> 0;
  }
  snapshot() {
    return { state: this.state, calls: this.calls };
  }
};
function features(state, legal) {
  const enc = encodeGameStateSpatial(state, state.currentPlayer, "v2", { channels: 34 });
  const acts = encodeCandidateActionsSpatialForSchema(state, state.currentPlayer, legal, "v2", ENCODER_SCHEMA_ID_V19);
  const coord = (a) => a ? [a.x, a.y] : [-1, -1];
  return { spatial: Array.from(enc.spatialTensor), global: Array.from(enc.globalFeatures), candidateActorCoords: acts.map((a) => coord(a.actorCoord)), candidateLandingCoords: acts.map((a) => coord(a.landingCoord)), candidateTargetCoords: acts.map((a) => coord(a.targetCoord)), candidateSemantics: acts.map((a) => Array.from(a.semantics)) };
}
function inputHash(s) {
  const h = import_node_crypto.default.createHash("sha256");
  const floats = (a) => h.update(Buffer.from(new Float32Array(a).buffer));
  floats(s.spatial);
  floats(s.global);
  h.update(`candidates:${s.candidateSemantics.length};`);
  s.candidateSemantics.forEach((v, i) => {
    const a = s.candidateActorCoords[i], l = s.candidateLandingCoords[i], t = s.candidateTargetCoords[i];
    h.update(`[${a[0]},${a[1]}][${l[0]},${l[1]}][${t[0]},${t[1]}]:`);
    floats(v);
  });
  return h.digest("hex");
}
function strictStep(engine, original, action) {
  const codes = original.map(encodeAction);
  const code = encodeAction(action);
  if (!codes.includes(code)) throw Error("\u975E\u6CD5\u7B56\u7565\u52A8\u4F5C");
  const result = engine.step(structuredClone(original[codes.indexOf(code)]));
  if (result.info?.includes("\u975E\u6CD5\u52A8\u4F5C") || !Number.isFinite(result.reward) || result.done !== engine.isTerminal()) throw Error("\u5F15\u64CE\u62D2\u7EDD\u6216\u7ED3\u7B97\u5408\u540C\u4E0D\u7B26");
  return result;
}

// ai_training/r8_pure_policy_stage_20261014_125300/research/policy.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/tactical_evaluation.ts
function posKey(pos) {
  return `${pos.x},${pos.y}`;
}
function samePos2(left, right) {
  return left.x === right.x && left.y === right.y;
}
function isNegativeStatus2(unit) {
  return unit.status?.type === "poisoned" || unit.status?.type === "blinded" || unit.status?.type === "weakened";
}
function unitConfig(unitOrClass) {
  return UNIT_CONFIGS[typeof unitOrClass === "string" ? unitOrClass : unitOrClass.unitClass];
}
function hasUnitAbility(unitOrClass, ability) {
  return unitConfig(unitOrClass).abilities.includes(ability);
}
var RuleTacticalEvaluator = class {
  constructor(state, playerId) {
    this.state = state;
    this.playerId = playerId;
    this.reachableCache = /* @__PURE__ */ new Map();
    this.threatCache = /* @__PURE__ */ new Map();
    this.unitValueCache = /* @__PURE__ */ new Map();
    this.pathfinder = new TacticalPathfinder(state);
    this.ownUnits = state.units.filter((unit) => unit.ownerId === playerId && unit.hp > 0);
    this.enemyUnits = state.units.filter((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId));
    this.ownProfile = this.buildUnitProfile(this.ownUnits);
    this.enemyProfile = this.buildEnemyProfile(this.enemyUnits);
    this.mapProfile = this.buildMapProfile();
  }
  scoreAction(action) {
    switch (action.type) {
      case "move":
        return this.scoreMove(action.unitId, action.to, false);
      case "post_attack_move":
        return this.scoreMove(action.unitId, action.to, true);
      case "attack":
        return this.scoreAttack(action);
      case "capture":
        return this.scoreCapture(action.unitId);
      case "repair":
        return this.scoreRepair(action.unitId);
      case "heal":
        return this.scoreHeal(action);
      case "support":
        return this.scoreSupport(action);
      case "summon":
        return this.scoreSummon(action);
      case "destroy_town":
        return this.scoreDestroyTown(action.unitId);
      case "recruit_to_castle":
        return this.scoreRecruit(action.unitClass, action.castlePos, action.castlePos);
      case "recruit_and_deploy":
        return this.scoreRecruit(action.unitClass, action.castlePos, action.to);
      case "wait":
        return this.scoreWait(action.unitId);
      case "end_turn":
        return this.scoreEndTurn();
      case "surrender":
        return -1e5;
    }
  }
  hasHighValueRecruitOpportunity() {
    const player = this.state.players.find((item) => item.id === this.playerId);
    if (!player) return false;
    const remainingUnitSlots = this.remainingUnitSlots();
    const remainingPopulation = this.remainingPopulation();
    return player.gold >= 150 && (remainingUnitSlots === null || remainingUnitSlots > 0) && (remainingPopulation === null || remainingPopulation > 0) && this.ownUnits.length < 10;
  }
  scoreMove(unitId, to, postAttackMove) {
    const unit = this.getUnit(unitId);
    if (!unit) return -1e3;
    let score = 0;
    score += this.scoreTruePathProgress(unit, unit.pos, to);
    score += this.scoreRecoveryMove(unit, unit.pos, to);
    score += this.scoreMoveSafety(unit, unit.pos, to, postAttackMove);
    score += this.scoreTerrainFit(unit, to);
    score += this.scoreSkillPosition(unit, to);
    score += this.scoreZoneControl(unit, to);
    score += this.scoreFormation(unit, to);
    return score;
  }
  scoreAttack(action) {
    const attacker = this.getUnit(action.attackerId);
    const target = this.getUnit(action.targetId);
    if (!attacker || !target) return 0;
    const damage = Math.min(target.hp, calculateDamage(this.state, attacker.id, target.id));
    const targetValue = this.getUnitValue(target);
    const attackerValue = this.getUnitValue(attacker);
    let score = 0;
    if (damage >= target.hp) {
      score += 9500 + targetValue * 2;
      if (isCommanderUnit(this.state, target)) score += 6e3;
    }
    if (target.unitClass === "slime" && unitConfig(attacker).attackType === "magic") score += 1800;
    if (hasAbility(target, "flying") && hasAbility(attacker, "sharpshooter")) score += 2200;
    if (isUndead(target) && hasAbility(attacker, "healer")) score += 2200;
    const threatAfter = this.maxIncomingDamage(attacker, attacker.pos);
    if (attacker.hp <= threatAfter && damage < target.hp) {
      score -= Math.min(7e3, attackerValue * 4);
    }
    return score;
  }
  scoreCapture(unitId) {
    const unit = this.getUnit(unitId);
    if (!unit) return 0;
    const tile = this.tileAt(unit.pos);
    if (!tile) return 0;
    const key = getTileTerrainKey(tile);
    const enemyOwned = tile.ownerId !== null && areEnemyPlayers(this.state, this.playerId, tile.ownerId);
    const income = getTileIncome(this.state, tile);
    let score = enemyOwned ? 12500 : 10200;
    score += income * 24;
    if (key === "castle") {
      score += 7e3 + this.countEnemyOwnedCastles() * 1400;
      if (this.enemyUnits.length === 0 || this.isCleanupMode()) score += 9e3;
    }
    if (key === "town") score += 2500;
    return score;
  }
  scoreRepair(unitId) {
    const unit = this.getUnit(unitId);
    if (!unit) return 0;
    const tile = this.tileAt(unit.pos);
    if (!tile || getTileTerrainKey(tile) !== "damaged_town") return 0;
    return 2600 + getTileDefenseBonus(tile) * 80 + (this.isCleanupMode() ? 1800 : 0);
  }
  scoreHeal(action) {
    const healer = this.getUnit(action.healerId);
    const target = this.getUnit(action.targetId);
    if (!healer || !target) return 0;
    if (areEnemyPlayers(this.state, this.playerId, target.ownerId)) {
      if (!isUndead(target)) return 0;
      const healDamage = Math.floor(this.getHealAmount(healer) * 1.5);
      const targetValue = this.getUnitValue(target);
      let score2 = 12e3 + healDamage * 70 + targetValue * 3;
      if (healDamage >= target.hp) score2 += 18e3 + targetValue * 6;
      return score2;
    }
    const maxHp = getEffectiveStats(target).maxHp;
    const missingHp = Math.max(0, maxHp - target.hp);
    const hpRatio = target.hp / Math.max(1, maxHp);
    const threat = this.maxIncomingDamage(target, target.pos);
    let score = missingHp * 35 + this.getUnitValue(target) * 0.5;
    if (healer.unitClass === "paladin") {
      const noImmediateAttack = !this.canAnyEnemyBeAttackedFrom(healer, healer.pos);
      if (target.id === healer.id) {
        score += noImmediateAttack ? 8e3 : 500;
      } else {
        score += noImmediateAttack ? 22e3 + this.getUnitValue(target) * 0.7 : 1200;
        if (target.hp >= maxHp) score += noImmediateAttack ? 4e3 : 0;
      }
    }
    if (hpRatio <= 0.35) score += 18e3;
    if (target.hp <= threat && target.hp + 40 > threat) score += 6e3;
    if (isCommanderUnit(this.state, target)) score += 3e3;
    if (isNegativeStatus2(target)) score += 1200;
    return score;
  }
  scoreSupport(action) {
    const supporter = this.getUnit(action.supporterId);
    const target = this.getUnit(action.targetId);
    if (!supporter || !target) return 0;
    let score = this.getUnitValue(target) * 1.2 + getEffectiveStats(target).attack * 22;
    if (this.canAnyEnemyBeAttackedFrom(target, target.pos)) score += 15e3;
    if (hasAbility(target, "village_capturer") || hasAbility(target, "castle_capturer")) score += 1800;
    if (hasAbility(target, "healer") || hasAbility(target, "summoner") || hasAbility(target, "destroyer")) score += 1200;
    return score;
  }
  scoreSummon(action) {
    const summoner = this.getUnit(action.summonerId);
    if (!summoner) return 0;
    let score = 25e3;
    score += Math.max(0, 8 - this.nearestEnemyDistance(action.spawnPos)) * 260;
    score += Math.max(0, 10 - this.nearestObjectivePathTurnsForVirtual("skeleton", action.spawnPos)) * 220;
    if (this.isBridgeOrChoke(action.spawnPos)) score += 1800;
    if (this.enemyUnits.length <= 2 && this.isCleanupMode()) score -= 1200;
    return score;
  }
  scoreDestroyTown(unitId) {
    const unit = this.getUnit(unitId);
    if (!unit) return 0;
    const tile = this.tileAt(unit.pos);
    if (!tile || getTileTerrainKey(tile) !== "town") return 0;
    const enemyOwned = tile.ownerId !== null && areEnemyPlayers(this.state, this.playerId, tile.ownerId);
    if (tile.ownerId !== null && !enemyOwned) return -15e3;
    if (this.canAlliedCaptureTownThisTurn(unit.pos, unit.id)) return -24e3;
    return 3500 + (enemyOwned ? 16e3 : 1e3) + (this.isCleanupMode() ? 2500 : 0);
  }
  scoreRecruit(unitClass, castlePos, deployPos) {
    const cost = getUnitCost(this.state, this.playerId, unitClass);
    if (cost === null) return -1e3;
    let score = 0;
    score += this.scoreRecruitSlotsAndEconomy(unitClass, cost);
    score += this.scoreRecruitRoleNeed(unitClass);
    score += this.scoreRecruitCounter(unitClass);
    score += this.scoreRecruitTerrainFit(unitClass);
    score += this.scoreRecruitDeployment(unitClass, castlePos, deployPos);
    score += this.scoreRecruitDiversity(unitClass, cost);
    return score;
  }
  scoreWait(unitId) {
    const unit = this.getUnit(unitId);
    if (!unit) return 0;
    const auraScore = this.scoreSkillPosition(unit, unit.pos);
    const tile = this.tileAt(unit.pos);
    let score = auraScore;
    if (tile && getTileHealPerTurn(tile) > 0 && unit.hp < getEffectiveStats(unit).maxHp) score += 1400;
    if (this.isCleanupMode() && auraScore < 1500) score -= 2500;
    if (this.maxIncomingDamage(unit, unit.pos) >= unit.hp && !this.isGuardingCriticalCastle(unit)) score -= 4500;
    return score;
  }
  scoreEndTurn() {
    let score = 0;
    const readyUnits = this.ownUnits.filter((unit) => !unit.hasActed).length;
    if (readyUnits > 0) score -= 2e3 + readyUnits * 350;
    if (this.isCleanupMode() && this.hasUnresolvedEnemyBuildings()) score -= 4500;
    if (this.hasHighValueRecruitOpportunity()) score -= 1600;
    return score;
  }
  scoreTruePathProgress(unit, from, to) {
    const targets = this.getObjectiveTargetsForUnit(unit);
    if (targets.length === 0) return 0;
    let best = 0;
    for (const target of targets) {
      const beforeTurns = this.turnsToTarget(unit, from, target);
      const afterTurns = this.turnsToTarget(unit, to, target);
      if (beforeTurns === null || afterTurns === null) continue;
      const improvement = beforeTurns - afterTurns;
      const detourProgress = improvement > 0 && getDistance(to, target.pos) > getDistance(from, target.pos) ? target.priority * 1.5 : 0;
      const targetScore = improvement * target.priority * 3.6 + detourProgress - afterTurns * 80;
      if (targetScore > best) best = targetScore;
      if (afterTurns === 0) best += target.priority * 2;
    }
    return best;
  }
  scoreRecoveryMove(unit, from, to) {
    const maxHp = getEffectiveStats(unit).maxHp;
    const hpRatio = unit.hp / Math.max(1, maxHp);
    const needsRecovery = hpRatio <= 0.45 || isNegativeStatus2(unit);
    if (!needsRecovery) return 0;
    const healingTargets = this.getHealingTargets(unit);
    if (healingTargets.length === 0) return 0;
    const before = this.nearestTurnsToPositions(unit, from, healingTargets);
    const after = this.nearestTurnsToPositions(unit, to, healingTargets);
    if (before === null || after === null) return 0;
    let score = (before - after) * 2600;
    const tile = this.tileAt(to);
    if (tile && this.isUsefulRecoveryTileFor(unit, tile)) {
      score += 6500 + (maxHp - unit.hp) * 28;
    }
    const afterThreat = this.maxIncomingDamage(unit, to);
    if (afterThreat >= unit.hp && !this.isUsefulRecoveryTileFor(unit, tile)) score -= 5e3;
    return score;
  }
  scoreMoveSafety(unit, from, to, postAttackMove) {
    const beforeThreat = this.maxIncomingDamage(unit, from);
    const afterThreat = this.maxIncomingDamage(unit, to);
    const unitValue = this.getUnitValue(unit);
    const highValueMultiplier = isCommanderUnit(this.state, unit) ? 2.2 : Math.max(1, unitValue / 500);
    let score = (beforeThreat - afterThreat) * 32 * Math.min(2.4, highValueMultiplier);
    if (beforeThreat >= unit.hp && afterThreat < unit.hp) score += 7e3;
    if (afterThreat >= unit.hp && beforeThreat < unit.hp) score -= 7e3;
    if (postAttackMove && afterThreat < beforeThreat) score += 1800;
    const tile = this.tileAt(to);
    if (tile) score += getTileDefenseBonus(tile) * (isCommanderUnit(this.state, unit) ? 120 : 65);
    return score;
  }
  scoreTerrainFit(unitOrClass, pos) {
    const tile = this.tileAt(pos);
    if (!tile) return 0;
    let score = 0;
    if (hasUnitAbility(unitOrClass, "water_child") && isWaterTerrain(tile)) score += 1300;
    if (hasUnitAbility(unitOrClass, "forest_child") && isForestTerrain(tile)) score += 1050;
    if (hasUnitAbility(unitOrClass, "mountain_child") && isMountainTerrain(tile)) score += 1400;
    if (hasUnitAbility(unitOrClass, "mountain_child") && isMountainTerrain(tile) && this.nearestEnemyDistance(pos) <= 2) score += 4200;
    if (hasUnitAbility(unitOrClass, "flying") && this.mapProfile.waterTiles > this.mapProfile.totalTiles * 0.18) score += 350;
    return score;
  }
  scoreSkillPosition(unit, pos) {
    let score = 0;
    if (hasAbility(unit, "cleansing_aura")) score += this.scoreCleansingAuraAt(unit, pos);
    if (hasAbility(unit, "attack_aura")) score += this.scoreAttackAuraAt(unit, pos);
    if (hasAbility(unit, "weakness_aura")) score += this.scoreWeaknessAuraAt(unit, pos);
    if (hasAbility(unit, "summoner")) score += this.scoreSummonerPosition(unit, pos);
    if (hasAbility(unit, "healer")) score += this.scoreHealerPosition(unit, pos);
    if (hasAbility(unit, "supporter")) score += this.scoreSupporterPosition(unit, pos);
    if (hasAbility(unit, "destroyer")) score += this.scoreDestroyerPosition(unit, pos);
    return score;
  }
  scoreZoneControl(unit, pos) {
    let score = 0;
    if (this.isBridgeOrChoke(pos)) {
      score += 900;
      if (this.nearestEnemyDistance(pos) <= 4 || this.nearestObjectiveDistance(pos) <= 6) score += 1400;
    }
    if (this.isGuardingCriticalCastleAt(unit, pos)) score += 68e3;
    return score;
  }
  scoreFormation(unit, pos) {
    const allyDistance = this.nearestAllyDistance(unit, pos);
    const enemyDistance = this.nearestEnemyDistance(pos);
    let score = 0;
    if (allyDistance !== null && allyDistance <= 2) score += 450;
    if (allyDistance !== null && allyDistance >= 6 && enemyDistance <= 4 && this.getUnitValue(unit) >= 600) score -= 1400;
    if (this.isRangedUnit(unit) && enemyDistance <= 1) score -= 1400;
    if (!this.isRangedUnit(unit) && enemyDistance === 1 && this.maxIncomingDamage(unit, pos) < unit.hp) score += 500;
    return score;
  }
  scoreRecruitSlotsAndEconomy(unitClass, cost) {
    const player = this.state.players.find((item) => item.id === this.playerId);
    const gold = player?.gold ?? 0;
    const goldAfter = gold - cost;
    const remainingUnitSlots = this.remainingUnitSlots();
    const remainingPopulation = this.remainingPopulation();
    const config = UNIT_CONFIGS[unitClass];
    let score = 0;
    if (remainingUnitSlots !== null) {
      if (remainingUnitSlots >= 12 && this.ownUnits.length <= 4) {
        score += config.population <= 2 || cost <= 400 ? 2600 : -1200;
      } else if (remainingUnitSlots <= 3) {
        score += cost >= 600 ? 1300 : -500;
      } else {
        score += Math.min(remainingUnitSlots, 10) * 130;
      }
    }
    if (remainingPopulation !== null) {
      if (remainingPopulation >= 12 && config.population <= 2) score += 2200;
      if (remainingPopulation <= 5 && config.population >= 4) score += 900;
    }
    if (goldAfter >= 150 && this.ownUnits.length < 8 && cost >= 800) score -= 1300;
    if (goldAfter < 0) score -= 5e3;
    if (goldAfter >= 300 && cost <= 400) score += 500;
    return score;
  }
  scoreRecruitRoleNeed(unitClass) {
    const config = UNIT_CONFIGS[unitClass];
    let score = 0;
    if (this.ownProfile.capturers <= 1 && config.abilities.includes("village_capturer")) score += 2600;
    if (this.ownProfile.castleCapturers === 0 && config.abilities.includes("castle_capturer")) score += 4500;
    if (this.ownProfile.healers === 0 && config.abilities.includes("healer")) score += this.woundedAllyCount() > 0 ? 2800 : 1400;
    if (this.ownProfile.ranged <= 1 && config.maxRange >= 2) score += 1400;
    if (this.ownProfile.magic <= 1 && config.attackType === "magic") score += 1300;
    if (this.ownProfile.destroyers === 0 && config.abilities.includes("destroyer") && this.enemyBuildingCount("town") >= 2) score += 1700;
    if (this.ownProfile.summoners === 0 && config.abilities.includes("summoner") && (this.state.graves?.length ?? 0) >= 2) score += 1600;
    if (this.ownProfile.supporters === 0 && config.abilities.includes("supporter") && this.ownUnits.length >= 5) score += 1200;
    return score;
  }
  scoreRecruitCounter(unitClass) {
    const config = UNIT_CONFIGS[unitClass];
    let score = 0;
    if (this.enemyProfile.flying > 0 && config.abilities.includes("sharpshooter")) score += 2200 + this.enemyProfile.flying * 650;
    if (this.enemyProfile.dragons > 0 && (unitClass === "mermaid" || unitClass === "wolf_archer" || config.abilities.includes("sharpshooter"))) {
      score += 1800 + this.enemyProfile.dragons * 500;
    }
    if (this.enemyProfile.slimes > 0 && config.attackType === "magic") score += 2200 + this.enemyProfile.slimes * 550;
    if (this.enemyProfile.physicalAttackers >= 3) {
      if (unitClass === "slime" || unitClass === "golem") score += 2600 + this.enemyProfile.physicalAttackers * 420;
      if (config.maxRange >= 3) score += 1200 + this.enemyProfile.physicalAttackers * 220;
    }
    if (this.enemyProfile.magicAttackers >= 2 && config.magicDefense >= 20) score += 1200 + this.enemyProfile.magicAttackers * 200;
    if (this.enemyProfile.undead > 0 && (config.abilities.includes("healer") || unitClass === "elf")) score += 2200 + this.enemyProfile.undead * 500;
    if (this.enemyProfile.summoners > 0 && (config.move >= 6 || config.maxRange >= 3 || config.abilities.includes("assault_troop"))) {
      score += 1300 + this.enemyProfile.summoners * 350;
    }
    if (this.enemyProfile.lowMagicDefense >= 2 && config.attackType === "magic") score += 1e3 + this.enemyProfile.lowMagicDefense * 220;
    return Math.min(score, 6200);
  }
  scoreRecruitTerrainFit(unitClass) {
    const config = UNIT_CONFIGS[unitClass];
    const total = Math.max(1, this.mapProfile.totalTiles);
    let score = 0;
    if (this.mapProfile.waterTiles / total >= 0.18) {
      if (config.abilities.includes("water_child")) score += 2200;
      if (config.abilities.includes("flying")) score += 1e3;
    }
    if (this.mapProfile.mountainTiles / total >= 0.12 && config.abilities.includes("mountain_child")) score += 1600;
    if (this.mapProfile.forestTiles / total >= 0.12 && config.abilities.includes("forest_child")) score += 1400;
    if (this.mapProfile.bridgeTiles > 0 && (config.maxRange >= 3 || config.abilities.includes("flying"))) score += 950;
    return score;
  }
  scoreRecruitDeployment(unitClass, castlePos, deployPos) {
    const currentTurns = this.nearestObjectivePathTurnsForVirtual(unitClass, castlePos);
    const deployTurns = this.nearestObjectivePathTurnsForVirtual(unitClass, deployPos);
    let score = Math.max(0, currentTurns - deployTurns) * 450;
    score += this.scoreTerrainFit(unitClass, deployPos);
    if (this.maxIncomingDamageForClass(unitClass, deployPos) >= 100) score -= 1600;
    return score;
  }
  scoreRecruitDiversity(unitClass, cost) {
    const sameCount = this.ownUnits.filter((unit) => unit.unitClass === unitClass).length;
    let score = 0;
    if (sameCount >= 3) score -= sameCount * 450;
    if (unitClass === "dragon" && sameCount >= 1 && this.ownUnits.length < 8) score -= 1400;
    if (cost <= 400 && sameCount <= 1) score += 450;
    return score;
  }
  getObjectiveTargetsForUnit(unit) {
    const config = UNIT_CONFIGS[unit.unitClass];
    const targets = [];
    for (let y = 0; y < this.state.map.height; y += 1) {
      for (let x = 0; x < this.state.map.width; x += 1) {
        const pos = { x, y };
        const tile = this.state.map.tiles[y][x];
        const terrain = getTileTerrainConfig(tile);
        const unfriendly = this.isUnfriendlyOwner(tile.ownerId);
        if (!unfriendly) continue;
        if (terrain.key === "castle") {
          targets.push({
            pos,
            kind: "castle",
            priority: config.abilities.includes("castle_capturer") ? 3600 : 1200
          });
        } else if (terrain.key === "town") {
          targets.push({
            pos,
            kind: "town",
            priority: config.abilities.includes("village_capturer") ? 2500 : 900
          });
        }
      }
    }
    for (const enemy of this.enemyUnits) {
      targets.push({
        pos: enemy.pos,
        kind: "unit",
        priority: isCommanderUnit(this.state, enemy) ? 3200 : Math.max(900, this.getUnitValue(enemy))
      });
    }
    if (config.abilities.includes("repairer")) {
      for (let y = 0; y < this.state.map.height; y += 1) {
        for (let x = 0; x < this.state.map.width; x += 1) {
          const tile = this.state.map.tiles[y][x];
          if (getTileTerrainKey(tile) === "damaged_town" && (tile.ownerId === null || tile.ownerId === this.playerId)) {
            targets.push({ pos: { x, y }, kind: "damaged_town", priority: 1300 });
          }
        }
      }
    }
    return targets.sort((left, right) => right.priority - left.priority).slice(0, 12);
  }
  turnsToTarget(unit, from, target) {
    if (target.kind === "unit") {
      return this.turnsToAttackTarget(unit, from, target.pos);
    }
    const cost = this.pathCost(unit, from, target.pos);
    if (cost === null) return null;
    return Math.ceil(cost / Math.max(1, getEffectiveStats(unit).move));
  }
  turnsToAttackTarget(unit, from, targetPos) {
    const stats = getEffectiveStats(unit);
    if (getDistance(from, targetPos) >= stats.minRange && getDistance(from, targetPos) <= stats.maxRange) return 0;
    const attackTiles = this.positionsWithinRange(targetPos, stats.minRange, stats.maxRange).filter((pos) => isWithinBounds(this.state, pos));
    const turns = this.nearestTurnsToPositions(unit, from, attackTiles);
    return turns;
  }
  nearestTurnsToPositions(unit, from, targets) {
    let best = null;
    for (const target of targets) {
      const cost = this.pathCost(unit, from, target);
      if (cost === null) continue;
      const turns = Math.ceil(cost / Math.max(1, getEffectiveStats(unit).move));
      if (best === null || turns < best) best = turns;
    }
    return best;
  }
  pathCost(unit, from, target) {
    return this.pathfinder.cost(unit, from, target);
  }
  maxIncomingDamage(unit, pos) {
    const key = `${unit.id}:${posKey(pos)}`;
    const cached = this.threatCache.get(key);
    if (cached !== void 0) return cached;
    const nearestEnemies = [...this.enemyUnits].sort((left, right) => getDistance(left.pos, pos) - getDistance(right.pos, pos)).slice(0, 10);
    let maxDamage = 0;
    for (const enemy of nearestEnemies) {
      const positions = this.getReachableForThreat(enemy);
      for (const enemyPos of positions) {
        const stats = getEffectiveStats(enemy);
        const distance = getDistance(enemyPos, pos);
        if (distance < stats.minRange || distance > stats.maxRange) continue;
        maxDamage = Math.max(maxDamage, this.estimateDamageAt(enemy, enemyPos, unit, pos));
        if (maxDamage >= unit.hp) break;
      }
    }
    this.threatCache.set(key, maxDamage);
    return maxDamage;
  }
  maxIncomingDamageForClass(unitClass, pos) {
    const virtual = {
      id: "__virtual_recruit__",
      ownerId: this.playerId,
      unitClass,
      pos,
      hp: 100,
      maxHp: 100,
      hasMoved: false,
      hasActed: false
    };
    return this.maxIncomingDamage(virtual, pos);
  }
  getReachableForThreat(unit) {
    const key = `${unit.id}:threat`;
    const cached = this.reachableCache.get(key);
    if (cached) return cached;
    const positions = getReachablePositions(this.state, unit.id);
    this.reachableCache.set(key, positions);
    return positions;
  }
  estimateDamageAt(attacker, attackerPos, defender, defenderPos) {
    const cloned = JSON.parse(JSON.stringify(this.state));
    const clonedAttacker = cloned.units.find((unit) => unit.id === attacker.id);
    let clonedDefender = cloned.units.find((unit) => unit.id === defender.id);
    if (!clonedAttacker) return 0;
    if (!clonedDefender) {
      clonedDefender = { ...defender };
      cloned.units.push(clonedDefender);
    }
    clonedAttacker.pos = { ...attackerPos };
    clonedDefender.pos = { ...defenderPos };
    return calculateDamage(cloned, clonedAttacker.id, clonedDefender.id);
  }
  getHealingTargets(unit) {
    const targets = [];
    for (let y = 0; y < this.state.map.height; y += 1) {
      for (let x = 0; x < this.state.map.width; x += 1) {
        const tile = this.state.map.tiles[y][x];
        if (this.isUsefulRecoveryTileFor(unit, tile)) targets.push({ x, y });
      }
    }
    return targets;
  }
  isUsefulRecoveryTileFor(unit, tile) {
    if (!tile) return false;
    const ownerUseful = tile.ownerId === null || tile.ownerId === this.playerId || areAlliedPlayers(this.state, this.playerId, tile.ownerId);
    if (!ownerUseful) return false;
    return getTileHealPerTurn(tile) > 0 || isNegativeStatus2(unit) && tileClearsNegativeStatusAtTurnStart(tile) || hasAbility(unit, "water_child") && isWaterTerrain(tile) || hasAbility(unit, "forest_child") && isForestTerrain(tile) || hasAbility(unit, "mountain_child") && isMountainTerrain(tile);
  }
  scoreCleansingAuraAt(unit, pos) {
    let score = 0;
    for (const ally of this.ownUnits) {
      if (ally.id === unit.id || getDistance(pos, ally.pos) > 2) continue;
      if (isUndead(ally)) {
        score -= 1600;
        continue;
      }
      const missingHp = Math.max(0, getEffectiveStats(ally).maxHp - ally.hp);
      if (missingHp > 0) score += 650 + missingHp * 18;
      if (isNegativeStatus2(ally)) score += 2200;
    }
    return score;
  }
  scoreAttackAuraAt(unit, pos) {
    let score = 0;
    for (const ally of this.ownUnits) {
      if (ally.id === unit.id || getDistance(pos, ally.pos) > 2 || ally.status) continue;
      const canStillAct = !ally.hasActed;
      score += canStillAct ? 900 + getEffectiveStats(ally).attack * 12 : 300;
    }
    return score;
  }
  scoreWeaknessAuraAt(unit, pos) {
    let score = 0;
    for (const enemy of this.enemyUnits) {
      if (getDistance(pos, enemy.pos) > 2 || enemy.status || hasAbility(enemy, "weakness_aura")) continue;
      score += 1300 + this.getUnitValue(enemy) * 0.6;
    }
    return score;
  }
  scoreSummonerPosition(unit, pos) {
    const graves = this.state.graves ?? [];
    if (graves.length === 0) return 0;
    let score = 0;
    for (const grave of graves) {
      const before = getDistance(unit.pos, grave.pos);
      const after = getDistance(pos, grave.pos);
      if (after <= 2) score += 2600;
      score += Math.max(0, before - after) * 900;
    }
    return score;
  }
  scoreHealerPosition(unit, pos) {
    let score = 0;
    const paladinOverheal = unit.unitClass === "paladin" && !this.canAnyEnemyBeAttackedFrom(unit, pos);
    for (const ally of this.ownUnits) {
      if (ally.id === unit.id) continue;
      const missingHp = Math.max(0, getEffectiveStats(ally).maxHp - ally.hp);
      if (missingHp <= 0 && !isNegativeStatus2(ally) && !paladinOverheal) continue;
      const before = getDistance(unit.pos, ally.pos);
      const after = getDistance(pos, ally.pos);
      if (after <= 1) score += (paladinOverheal ? 3600 : 1800) + missingHp * 20;
      score += Math.max(0, before - after) * 500;
    }
    return score;
  }
  scoreSupporterPosition(unit, pos) {
    let score = 0;
    for (const ally of this.ownUnits) {
      if (ally.id === unit.id || !ally.hasActed || ally.hasBeenSupportedThisTurn) continue;
      const before = getDistance(unit.pos, ally.pos);
      const after = getDistance(pos, ally.pos);
      if (after <= 2) score += 1500 + this.getUnitValue(ally);
      score += Math.max(0, before - after) * 420;
    }
    return score;
  }
  scoreDestroyerPosition(unit, pos) {
    const towns = this.enemyBuildingPositions("town");
    if (towns.length === 0) return 0;
    const before = this.nearestTurnsToPositions(unit, unit.pos, towns);
    const after = this.nearestTurnsToPositions(unit, pos, towns);
    if (before === null || after === null) return 0;
    return Math.max(0, before - after) * 1200 + (after <= 1 ? 1600 : 0);
  }
  nearestObjectivePathTurnsForVirtual(unitClass, from) {
    const virtual = {
      id: `__virtual_${unitClass}_${posKey(from)}__`,
      ownerId: this.playerId,
      unitClass,
      pos: from,
      hp: 100,
      maxHp: 100,
      hasMoved: false,
      hasActed: false
    };
    const targets = this.getObjectiveTargetsForUnit(virtual);
    const turns = targets.map((target) => this.turnsToTarget(virtual, from, target)).filter((value) => value !== null);
    return turns.length > 0 ? Math.min(...turns) : 99;
  }
  canAnyEnemyBeAttackedFrom(unit, pos) {
    const stats = getEffectiveStats(unit);
    return this.enemyUnits.some((enemy) => {
      const distance = getDistance(pos, enemy.pos);
      return distance >= stats.minRange && distance <= stats.maxRange;
    });
  }
  getHealAmount(healer) {
    const level = healer.level ?? 0;
    return healer.unitClass === "paladin" ? 40 + level * 10 : 40;
  }
  canAlliedCaptureTownThisTurn(pos, ignoredUnitId) {
    const tile = this.tileAt(pos);
    if (!tile || getTileTerrainKey(tile) !== "town" || !this.isUnfriendlyOwner(tile.ownerId)) return false;
    return this.ownUnits.some((unit) => {
      if (unit.id === ignoredUnitId || unit.hasActed || !hasAbility(unit, "village_capturer")) return false;
      if (samePos2(unit.pos, pos)) return true;
      if (unit.hasMoved) return false;
      const cost = this.pathCost(unit, unit.pos, pos);
      return cost !== null && cost <= getEffectiveStats(unit).move;
    });
  }
  positionsWithinRange(center, minRange, maxRange) {
    const positions = [];
    for (let y = center.y - maxRange; y <= center.y + maxRange; y += 1) {
      for (let x = center.x - maxRange; x <= center.x + maxRange; x += 1) {
        const pos = { x, y };
        const distance = getDistance(center, pos);
        if (distance >= minRange && distance <= maxRange) positions.push(pos);
      }
    }
    return positions;
  }
  buildUnitProfile(units) {
    const profile = {
      capturers: 0,
      castleCapturers: 0,
      healers: 0,
      supporters: 0,
      summoners: 0,
      destroyers: 0,
      ranged: 0,
      magic: 0,
      physical: 0,
      antiAir: 0,
      durablePhysical: 0,
      fast: 0,
      flying: 0
    };
    for (const unit of units) {
      const config = UNIT_CONFIGS[unit.unitClass];
      if (config.abilities.includes("village_capturer")) profile.capturers += 1;
      if (config.abilities.includes("castle_capturer")) profile.castleCapturers += 1;
      if (config.abilities.includes("healer")) profile.healers += 1;
      if (config.abilities.includes("supporter")) profile.supporters += 1;
      if (config.abilities.includes("summoner")) profile.summoners += 1;
      if (config.abilities.includes("destroyer")) profile.destroyers += 1;
      if (config.maxRange >= 2) profile.ranged += 1;
      if (config.attackType === "magic") profile.magic += 1;
      if (config.attackType === "physical") profile.physical += 1;
      if (config.abilities.includes("sharpshooter")) profile.antiAir += 1;
      if (config.physicalDefense >= 25) profile.durablePhysical += 1;
      if (config.move >= 6) profile.fast += 1;
      if (config.abilities.includes("flying")) profile.flying += 1;
    }
    return profile;
  }
  buildEnemyProfile(units) {
    const profile = this.buildUnitProfile(units);
    profile.undead = 0;
    profile.lowMagicDefense = 0;
    profile.physicalAttackers = 0;
    profile.magicAttackers = 0;
    profile.dragons = 0;
    profile.slimes = 0;
    for (const unit of units) {
      const config = UNIT_CONFIGS[unit.unitClass];
      if (config.abilities.includes("undead")) profile.undead += 1;
      if (config.magicDefense <= 0) profile.lowMagicDefense += 1;
      if (config.attackType === "physical" && config.attack > 0) profile.physicalAttackers += 1;
      if (config.attackType === "magic" && config.attack > 0) profile.magicAttackers += 1;
      if (unit.unitClass === "dragon") profile.dragons += 1;
      if (unit.unitClass === "slime") profile.slimes += 1;
    }
    return profile;
  }
  buildMapProfile() {
    const profile = {
      waterTiles: 0,
      forestTiles: 0,
      mountainTiles: 0,
      bridgeTiles: 0,
      healingTiles: 0,
      totalTiles: this.state.map.width * this.state.map.height
    };
    for (const row of this.state.map.tiles) {
      for (const tile of row) {
        if (isWaterTerrain(tile)) profile.waterTiles += 1;
        if (isForestTerrain(tile)) profile.forestTiles += 1;
        if (isMountainTerrain(tile)) profile.mountainTiles += 1;
        if (getTileTerrainKey(tile) === "bridge") profile.bridgeTiles += 1;
        if (getTileHealPerTurn(tile) > 0) profile.healingTiles += 1;
      }
    }
    return profile;
  }
  remainingUnitSlots() {
    const rules = getRuleConfig(this.state);
    const teamRules = getTeamRuleConfig(this.state, this.playerId);
    const limit = teamRules.unitLimit ?? rules.unitLimit;
    return limit === void 0 ? null : Math.max(0, limit - getCurrentUnitCount(this.state, this.playerId));
  }
  remainingPopulation() {
    const rules = getRuleConfig(this.state);
    const teamRules = getTeamRuleConfig(this.state, this.playerId);
    const limit = teamRules.populationLimit ?? rules.populationLimit;
    return limit === void 0 ? null : Math.max(0, limit - getCurrentPopulation(this.state, this.playerId));
  }
  woundedAllyCount() {
    return this.ownUnits.filter((unit) => unit.hp < getEffectiveStats(unit).maxHp || isNegativeStatus2(unit)).length;
  }
  isCleanupMode() {
    const ownValue = this.ownUnits.reduce((sum, unit) => sum + this.getUnitValue(unit) * unit.hp / Math.max(1, getEffectiveStats(unit).maxHp), 0);
    const enemyValue = this.enemyUnits.reduce((sum, unit) => sum + this.getUnitValue(unit) * unit.hp / Math.max(1, getEffectiveStats(unit).maxHp), 0);
    return this.enemyUnits.length <= 4 || ownValue > enemyValue * 1.8 + 900;
  }
  hasUnresolvedEnemyBuildings() {
    return this.enemyBuildingCount("castle") + this.enemyBuildingCount("town") > 0;
  }
  enemyBuildingCount(kind) {
    return this.enemyBuildingPositions(kind).length;
  }
  enemyBuildingPositions(kind) {
    const positions = [];
    for (let y = 0; y < this.state.map.height; y += 1) {
      for (let x = 0; x < this.state.map.width; x += 1) {
        const tile = this.state.map.tiles[y][x];
        if (getTileTerrainKey(tile) === kind && this.isUnfriendlyOwner(tile.ownerId)) {
          positions.push({ x, y });
        }
      }
    }
    return positions;
  }
  countEnemyOwnedCastles() {
    return this.enemyBuildingCount("castle");
  }
  nearestEnemyDistance(pos) {
    if (this.enemyUnits.length === 0) return 99;
    return Math.min(...this.enemyUnits.map((unit) => getDistance(pos, unit.pos)));
  }
  nearestAllyDistance(unit, pos) {
    const distances = this.ownUnits.filter((ally) => ally.id !== unit.id).map((ally) => getDistance(pos, ally.pos));
    return distances.length > 0 ? Math.min(...distances) : null;
  }
  nearestObjectiveDistance(pos) {
    const positions = [
      ...this.enemyBuildingPositions("castle"),
      ...this.enemyBuildingPositions("town"),
      ...this.enemyUnits.map((unit) => unit.pos)
    ];
    if (positions.length === 0) return 99;
    return Math.min(...positions.map((target) => getDistance(pos, target)));
  }
  isRangedUnit(unit) {
    return getEffectiveStats(unit).maxRange >= 2;
  }
  isBridgeOrChoke(pos) {
    const tile = this.tileAt(pos);
    if (!tile) return false;
    if (getTileTerrainKey(tile) === "bridge") return true;
    const passableNeighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy })).filter((next) => isWithinBounds(this.state, next)).filter((next) => getTileTerrainConfig(this.state.map.tiles[next.y][next.x]).moveCost <= 2).length;
    return passableNeighbors <= 2 && this.nearestObjectiveDistance(pos) <= 8;
  }
  isGuardingCriticalCastle(unit) {
    return this.isGuardingCriticalCastleAt(unit, unit.pos);
  }
  isGuardingCriticalCastleAt(unit, pos) {
    const tile = this.tileAt(pos);
    if (!tile || tile.ownerId !== this.playerId || getTileTerrainKey(tile) !== "castle") return false;
    return this.enemyUnits.some((enemy) => isCommanderUnit(this.state, enemy, enemy.ownerId) && getReachablePositions(this.state, enemy.id).some((reachable) => samePos2(reachable, pos)) && unit.ownerId === this.playerId);
  }
  isUnfriendlyOwner(ownerId) {
    return ownerId === null || getAllianceId(this.state, ownerId) !== getAllianceId(this.state, this.playerId);
  }
  tileAt(pos) {
    return this.state.map.tiles[pos.y]?.[pos.x] ?? null;
  }
  getUnit(unitId) {
    return this.state.units.find((unit) => unit.id === unitId && unit.hp > 0);
  }
  getUnitValue(unit) {
    const cached = this.unitValueCache.get(unit.id);
    if (cached !== void 0) return cached;
    const value = getUnitCost(this.state, unit.ownerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
    this.unitValueCache.set(unit.id, value);
    return value;
  }
};

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/heuristic_ai.ts
var HeuristicAI = class {
  constructor(rng) {
    this.rng = rng ?? Math.random;
  }
  getAction(engine, playerId, preparedActions) {
    const actions = preparedActions ?? engine.getLegalActions(playerId);
    if (actions.length === 0) return { type: "end_turn" };
    const state = engine.getState();
    const tactics = new RuleTacticalEvaluator(state, playerId);
    const scoredActions = actions.map((action) => ({
      action,
      score: this.scoreAction(engine, state, playerId, action, tactics)
    }));
    const urgentAction = this.pickBest(scoredActions.filter((item) => item.score >= 5e4));
    if (urgentAction) return urgentAction.action;
    const nonSurrenderActions = scoredActions.filter(({ action }) => action.type !== "surrender");
    return this.pickBest(nonSurrenderActions)?.action ?? actions[0];
  }
  scoreCandidateAction(engine, playerId, action) {
    const state = engine.getState();
    return this.scoreAction(engine, state, playerId, action, new RuleTacticalEvaluator(state, playerId));
  }
  scoreCandidateActions(engine, playerId, actions) {
    const state = engine.getState();
    const tactics = new RuleTacticalEvaluator(state, playerId);
    return actions.map((action) => ({
      action,
      score: this.scoreAction(engine, state, playerId, action, tactics)
    }));
  }
  pickBest(items) {
    let bestItem = null;
    let bestScore = -Infinity;
    for (const item of items) {
      if (item.score > bestScore) {
        bestScore = item.score;
        bestItem = item;
      }
    }
    return bestItem;
  }
  scoreAction(engine, state, playerId, action, tactics) {
    let score;
    switch (action.type) {
      case "attack":
        score = this.scoreAttack(engine, state, playerId, action);
        break;
      case "capture":
        score = this.scoreCapture(state, playerId, action.unitId);
        break;
      case "repair":
        score = 4200 + this.rng() * 20;
        break;
      case "heal":
        score = this.scoreHeal(engine, state, playerId, action);
        break;
      case "support":
        score = this.scoreSupport(state, action.supporterId, action.targetId);
        break;
      case "summon":
        score = 2600 + this.scorePositionPressure(state, playerId, action.spawnPos) + this.rng() * 20;
        break;
      case "destroy_town":
        score = this.scoreDestroyTown(state, playerId, action.unitId);
        break;
      case "post_attack_move":
        score = this.scoreMove(state, playerId, action.unitId, action.to, 180);
        break;
      case "move":
        score = this.scoreMove(state, playerId, action.unitId, action.to, 260);
        break;
      case "recruit_to_castle":
        score = this.scoreRecruit(state, playerId, action.unitClass, action.castlePos, action.castlePos);
        break;
      case "recruit_and_deploy":
        score = this.scoreRecruit(state, playerId, action.unitClass, action.castlePos, action.to);
        break;
      case "wait":
        score = this.scoreWait(state, playerId, action.unitId);
        break;
      case "end_turn":
        score = -250;
        break;
      case "surrender":
        return -1e5;
    }
    return score + tactics.scoreAction(action);
  }
  scoreAttack(engine, state, playerId, action) {
    const attacker = this.getUnit(state, action.attackerId);
    const target = this.getUnit(state, action.targetId);
    if (!attacker || !target) return -1e3;
    const targetValue = this.getUnitValue(state, target);
    const attackerValue = this.getUnitValue(state, attacker);
    const damage = Math.min(target.hp, calculateDamage(state, attacker.id, target.id));
    const damageRatio = damage / Math.max(1, target.hp);
    const sim = engine.clone();
    sim.step(action);
    const afterState = sim.getState();
    const targetAfter = this.getUnit(afterState, target.id);
    const attackerAfter = this.getUnit(afterState, attacker.id);
    const killsTarget = !targetAfter || targetAfter.hp <= 0;
    const losesAttacker = !attackerAfter || attackerAfter.hp <= 0;
    const attackerHpAfter = Math.max(0, attackerAfter?.hp ?? 0);
    const hpLost = Math.max(0, attacker.hp - attackerHpAfter);
    const counterRiskMultiplier = isCommanderUnit(state, attacker) ? 2.8 : 1;
    const newTargetStatus = !target.status && targetAfter?.status ? targetAfter.status.type : null;
    const newAttackerStatus = !attacker.status && attackerAfter?.status ? attackerAfter.status.type : null;
    const targetOnOwnCastle = this.isOwnCastleTile(state, playerId, target.pos);
    let score = 5200 + targetValue * damageRatio * 8 + damage * 22;
    if (killsTarget) score += 15e3 + targetValue * 8;
    if (isCommanderUnit(state, target)) score += killsTarget ? 18e3 : 4500;
    if (targetOnOwnCastle) score += 6e3;
    if (newTargetStatus === "poisoned") score += targetValue * 0.7;
    if (newTargetStatus === "blinded") score += targetValue * 1.1;
    if (newTargetStatus === "weakened") score += targetValue * 0.8;
    if (newAttackerStatus === "poisoned") score -= attackerValue * 0.6;
    if (newAttackerStatus === "blinded") score -= attackerValue;
    if (newAttackerStatus === "weakened") score -= attackerValue * 0.7;
    score -= hpLost * attackerValue * counterRiskMultiplier / Math.max(1, getEffectiveStats(attacker).maxHp);
    if (losesAttacker) score -= attackerValue * (isCommanderUnit(state, attacker) ? 14 : 8) + 2200;
    if (attacker.hp < getEffectiveStats(attacker).maxHp * 0.35 && !killsTarget) score -= 900;
    return score + this.rng() * 30;
  }
  scoreCapture(state, playerId, unitId) {
    const unit = this.getUnit(state, unitId);
    if (!unit) return -1e3;
    const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
    if (!tile) return -1e3;
    const terrain = getTileTerrainConfig(tile);
    const isEnemyOwned = tile.ownerId !== null && areEnemyPlayers(state, playerId, tile.ownerId);
    const base = terrain.key === "castle" ? 18e3 : 16500;
    return base + (isEnemyOwned ? 2200 : 700) + this.rng() * 20;
  }
  scoreHeal(engine, state, playerId, action) {
    const target = this.getUnit(state, action.targetId);
    const healer = this.getUnit(state, action.healerId);
    if (!target || !healer) return -1e3;
    const sim = engine.clone();
    sim.step(action);
    const afterState = sim.getState();
    const targetAfter = this.getUnit(afterState, target.id);
    if (areEnemyPlayers(state, playerId, target.ownerId)) {
      const killed = !targetAfter || targetAfter.hp <= 0;
      return 4800 + (killed ? 9e3 : 0) + this.getUnitValue(state, target) * (killed ? 6 : 1) + this.rng() * 20;
    }
    const maxHp = getEffectiveStats(target).maxHp;
    const missingHp = Math.max(0, maxHp - target.hp);
    return 3200 + missingHp * 55 + this.getUnitValue(state, target) * 0.25 + this.rng() * 20;
  }
  scoreSupport(state, supporterId, targetId) {
    const target = this.getUnit(state, targetId);
    const supporter = this.getUnit(state, supporterId);
    if (!target || !supporter) return -1e3;
    return 3e3 + this.getUnitValue(state, target) * 0.8 + this.nearestEnemyPressure(state, target.ownerId, target.pos) + this.rng() * 20;
  }
  scoreDestroyTown(state, playerId, unitId) {
    const unit = this.getUnit(state, unitId);
    if (!unit) return -1e3;
    const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
    const isEnemyOwned = tile?.ownerId !== null && tile?.ownerId !== void 0 && areEnemyPlayers(state, playerId, tile.ownerId);
    return 3600 + (isEnemyOwned ? 1600 : 0) + this.rng() * 20;
  }
  scoreMove(state, playerId, unitId, to, base) {
    const unit = this.getUnit(state, unitId);
    if (!unit) return -1e3;
    const abilities = UNIT_CONFIGS[unit.unitClass].abilities;
    const canCaptureCastle = abilities.includes("castle_capturer");
    const strategicTarget = this.getStrategicTarget(state, playerId, unit);
    const objectiveBefore = this.nearestObjectiveDistance(state, playerId, unit, unit.pos);
    const objectiveAfter = this.nearestObjectiveDistance(state, playerId, unit, to);
    const strategicBefore = strategicTarget ? getDistance(unit.pos, strategicTarget) : null;
    const strategicAfter = strategicTarget ? getDistance(to, strategicTarget) : null;
    const castleBefore = this.nearestCastleObjectiveDistance(state, playerId, unit.pos);
    const castleAfter = this.nearestCastleObjectiveDistance(state, playerId, to);
    const enemyBefore = this.nearestEnemyDistance(state, playerId, unit.pos);
    const enemyAfter = this.nearestEnemyDistance(state, playerId, to);
    const objectiveImprovement = this.distanceImprovement(objectiveBefore, objectiveAfter);
    const strategicImprovement = this.distanceImprovement(strategicBefore, strategicAfter);
    const castleImprovement = this.distanceImprovement(castleBefore, castleAfter);
    const enemyImprovement = this.distanceImprovement(enemyBefore, enemyAfter);
    const tile = state.map.tiles[to.y]?.[to.x];
    const terrainBonus = tile ? getTileDefenseBonus(tile) * 70 : 0;
    const positionPressure = this.scorePositionPressure(state, playerId, to);
    const captureSetup = this.isCapturableTileForUnit(state, playerId, unit, to) ? 2400 : 0;
    const castleSetup = this.isUnfriendlyCastleTile(state, playerId, to) ? canCaptureCastle ? 5200 : -2400 : 0;
    const attackSetup = this.canThreatenEnemyFrom(state, playerId, unit, to) ? 1300 : 0;
    const castleDefenseSetup = this.isThreatenedOwnCastle(state, playerId, to) ? 68e3 : 0;
    const cleanupMode = this.isCleanupMode(state, playerId);
    const cleanupPressure = cleanupMode && strategicAfter !== null ? Math.max(0, 18 - strategicAfter) * 130 : 0;
    const commanderCastlePush = cleanupMode && canCaptureCastle && castleAfter !== null ? Math.max(0, 24 - castleAfter) * 190 : 0;
    const ownCastleBlockPenalty = this.isOwnCastleTile(state, playerId, to) && !this.isThreatenedOwnCastle(state, playerId, to) ? canCaptureCastle ? 0 : -900 : 0;
    return base + castleDefenseSetup + cleanupPressure + commanderCastlePush + objectiveImprovement * 620 + strategicImprovement * (cleanupMode ? 1100 : 720) + castleImprovement * (canCaptureCastle ? 980 : 180) + enemyImprovement * 340 + captureSetup + castleSetup + attackSetup + terrainBonus + ownCastleBlockPenalty + positionPressure - Math.max(0, objectiveAfter ?? 0) * 12 + this.rng() * 25;
  }
  scoreRecruit(state, playerId, unitClass, castlePos, deployPos) {
    const cost = getUnitCost(state, playerId, unitClass);
    if (cost === null) return -1e3;
    const player = state.players.find((p) => p.id === playerId);
    const playerGold = player?.gold ?? 0;
    const unitCount = state.units.filter((unit) => unit.ownerId === playerId).length;
    const goldAfterRecruit = playerGold - cost;
    const commanderCost = getUnitCost(state, playerId, "commander");
    const shouldRestoreCommander = !this.hasAliveCommander(state, playerId) && commanderCost !== null;
    const distanceToObjective = this.nearestGlobalObjectiveDistance(state, playerId, deployPos) ?? 0;
    const distanceToEnemy = this.nearestEnemyDistance(state, playerId, deployPos) ?? 0;
    if (this.isThreatenedOwnCastle(state, playerId, castlePos) && this.isSamePosition(castlePos, deployPos)) {
      return 72e3 - cost * 0.5 + this.rng() * 20;
    }
    if (shouldRestoreCommander && unitClass !== "commander") {
      return playerGold < commanderCost ? -45e3 + this.rng() * 10 : 300 + this.rng() * 10;
    }
    if (shouldRestoreCommander && unitClass === "commander") {
      const distanceToCastle = this.nearestCastleObjectiveDistance(state, playerId, deployPos) ?? distanceToObjective;
      return 56e3 + this.countEnemyOwnedCastles(state, playerId) * 500 + Math.max(0, 24 - distanceToCastle) * 130 + Math.max(0, goldAfterRecruit) * 0.04 + this.rng() * 20;
    }
    const classPriority = this.getRecruitClassPriority(unitClass);
    const recruitCostPressure = this.scoreRecruitCostPressure(state, playerId, unitClass, cost);
    const advancedRecruitBonus = this.scoreAdvancedRecruitBonus(state, playerId, unitClass);
    const counterRecruitBonus = this.scoreCounterRecruitBonus(state, playerId, unitClass);
    return 3600 + classPriority + cost * 2 + recruitCostPressure + advancedRecruitBonus + counterRecruitBonus + Math.min(unitCount, 14) * 90 + Math.max(0, 18 - distanceToObjective) * 35 + Math.max(0, 14 - distanceToEnemy) * 22 + Math.max(0, goldAfterRecruit) * 0.03 + (castlePos.x === deployPos.x && castlePos.y === deployPos.y ? 80 : 0) + this.rng() * 20;
  }
  scoreWait(state, playerId, unitId) {
    const unit = this.getUnit(state, unitId);
    if (!unit) return -1e3;
    const pressure = this.nearestEnemyPressure(state, playerId, unit.pos);
    const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
    const terrainBonus = tile ? getTileDefenseBonus(tile) * 35 : 0;
    const castleGuardBonus = this.isGuardingOwnCastleAgainstCommander(state, playerId, unit) ? 69e3 : 0;
    return 120 + castleGuardBonus + pressure + terrainBonus + (unit.ownerId === playerId ? 0 : -1e3) + this.rng() * 10;
  }
  getUnit(state, unitId) {
    return state.units.find((unit) => unit.id === unitId);
  }
  getUnitValue(state, unit) {
    return getUnitCost(state, unit.ownerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
  }
  getRecruitClassPriority(unitClass) {
    const priority = {
      soldier: 120,
      ghost: 180,
      mermaid: 220,
      slime: 260,
      archer: 320,
      dark_mage: 360,
      water_elemental: 420,
      paladin: 700,
      witch: 900,
      elf: 1200,
      berserker: 1300,
      druid: 1450,
      ice_elemental: 1500,
      golem: 1550,
      wolf: 1700,
      catapult: 2050,
      wolf_archer: 2400,
      dragon: 3100,
      commander: 2600
    };
    return priority[unitClass] ?? 0;
  }
  scoreRecruitCostPressure(state, playerId, unitClass, cost) {
    const ownUnits = state.units.filter((unit) => unit.ownerId === playerId && unit.hp > 0);
    const lowTierCount = this.countLowTierUnits(state, playerId);
    const population = UNIT_CONFIGS[unitClass].population;
    if (ownUnits.length <= 4 && lowTierCount < 3) {
      if (cost <= 400 && population <= 2) return 1800;
      if (cost >= 800 || population >= 4) return -2400;
    }
    if (ownUnits.length >= 8 && cost >= 800) return 1200;
    return 0;
  }
  scoreAdvancedRecruitBonus(state, playerId, unitClass) {
    const cost = getUnitCost(state, playerId, unitClass) ?? UNIT_CONFIGS[unitClass].cost ?? 0;
    const lowTierCount = this.countLowTierUnits(state, playerId);
    const isAdvanced = cost >= 500;
    const isCheapFiller = cost <= 300;
    if (isAdvanced && lowTierCount >= 4) {
      return 1400 + Math.min(lowTierCount, 6) * 180;
    }
    if (isCheapFiller && lowTierCount >= 4) {
      return -900;
    }
    return 0;
  }
  scoreCounterRecruitBonus(state, playerId, unitClass) {
    const enemies = state.units.filter((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId));
    let score = 0;
    for (const enemy of enemies) {
      const enemyAbilities = UNIT_CONFIGS[enemy.unitClass].abilities;
      const enemyValue = this.getUnitValue(state, enemy);
      if (enemyAbilities.includes("flying") && (unitClass === "archer" || unitClass === "wolf_archer")) {
        score += enemyValue * 1.4;
      }
      if (enemy.unitClass === "dragon" && (unitClass === "mermaid" || unitClass === "wolf_archer")) {
        score += 850;
      }
      if ((enemy.unitClass === "dark_mage" || enemy.unitClass === "witch") && (unitClass === "catapult" || unitClass === "paladin")) {
        score += 650;
      }
      if (enemy.unitClass === "wolf" && (unitClass === "wolf_archer" || unitClass === "druid" || unitClass === "catapult")) {
        score += 700;
      }
      if (enemy.unitClass === "golem" && (unitClass === "water_elemental" || unitClass === "paladin" || unitClass === "ice_elemental")) {
        score += 600;
      }
      if (enemyAbilities.includes("summoner") && (unitClass === "wolf" || unitClass === "wolf_archer")) {
        score += 500;
      }
    }
    return Math.min(score, 3600);
  }
  distanceImprovement(before, after) {
    if (before === null || after === null) return 0;
    return before - after;
  }
  isSamePosition(left, right) {
    return left.x === right.x && left.y === right.y;
  }
  nearestEnemyDistance(state, playerId, pos) {
    const distances = state.units.filter((unit) => areEnemyPlayers(state, playerId, unit.ownerId) && unit.hp > 0).map((unit) => getDistance(pos, unit.pos));
    return distances.length > 0 ? Math.min(...distances) : null;
  }
  nearestEnemyPressure(state, playerId, pos) {
    const distances = state.units.filter((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId)).map((unit) => getDistance(pos, unit.pos));
    const nearest = distances.length > 0 ? Math.min(...distances) : 99;
    return Math.max(0, 8 - nearest) * 90;
  }
  getStrategicTarget(state, playerId, unit) {
    const abilities = UNIT_CONFIGS[unit.unitClass].abilities;
    if (abilities.includes("supporter")) {
      const ally = this.getHighestValueSupportTarget(state, playerId, unit);
      if (ally) return ally.pos;
    }
    if (abilities.includes("castle_capturer")) {
      const castle = this.nearestEnemyCastlePosition(state, playerId, unit.pos);
      if (castle) return castle;
    }
    if (abilities.includes("village_capturer")) {
      const village = this.nearestCapturableVillagePosition(state, playerId, unit.pos);
      if (village) return village;
    }
    if (abilities.includes("repairer")) {
      const damagedTown = this.nearestDamagedTownPosition(state, playerId, unit.pos);
      if (damagedTown) return damagedTown;
    }
    if (abilities.includes("healer")) {
      const ally = this.getHighestValueHurtAlly(state, playerId, unit);
      if (ally) return ally.pos;
    }
    const enemy = this.getBestEnemyTarget(state, playerId, unit.pos);
    return enemy?.pos ?? this.nearestGlobalObjectivePosition(state, playerId, unit.pos);
  }
  getHighestValueSupportTarget(state, playerId, supporter) {
    let bestUnit = null;
    let bestScore = -Infinity;
    for (const unit of state.units) {
      if (unit.id === supporter.id || unit.ownerId !== playerId || unit.hp <= 0 || !unit.hasActed) continue;
      const score = this.getUnitValue(state, unit) + getEffectiveStats(unit).attack * 8;
      if (score > bestScore) {
        bestScore = score;
        bestUnit = unit;
      }
    }
    return bestUnit;
  }
  getHighestValueHurtAlly(state, playerId, healer) {
    let bestUnit = null;
    let bestScore = -Infinity;
    for (const unit of state.units) {
      if (unit.id === healer.id || unit.ownerId !== playerId || unit.hp <= 0) continue;
      const missingHp = getEffectiveStats(unit).maxHp - unit.hp;
      if (missingHp <= 0) continue;
      const score = this.getUnitValue(state, unit) * missingHp / Math.max(1, getEffectiveStats(unit).maxHp);
      if (score > bestScore) {
        bestScore = score;
        bestUnit = unit;
      }
    }
    return bestUnit;
  }
  getBestEnemyTarget(state, playerId, from) {
    let bestUnit = null;
    let bestScore = -Infinity;
    for (const enemy of state.units) {
      if (enemy.hp <= 0 || !areEnemyPlayers(state, playerId, enemy.ownerId)) continue;
      const enemyValue = this.getUnitValue(state, enemy);
      const hpRatio = enemy.hp / Math.max(1, getEffectiveStats(enemy).maxHp);
      const score = enemyValue * (1.4 - hpRatio * 0.35) + (isCommanderUnit(state, enemy) ? 5200 : 0) + (this.isOwnCastleTile(state, playerId, enemy.pos) ? 6e3 : 0) - getDistance(from, enemy.pos) * 85;
      if (score > bestScore) {
        bestScore = score;
        bestUnit = enemy;
      }
    }
    return bestUnit;
  }
  nearestObjectiveDistance(state, playerId, unit, pos) {
    const canCaptureVillage = UNIT_CONFIGS[unit.unitClass].abilities.includes("village_capturer");
    const canCaptureCastle = UNIT_CONFIGS[unit.unitClass].abilities.includes("castle_capturer");
    if (!canCaptureVillage && !canCaptureCastle) {
      return this.nearestEnemyDistance(state, playerId, pos) ?? this.nearestGlobalObjectiveDistance(state, playerId, pos);
    }
    const distances = [];
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        const terrain = getTileTerrainConfig(tile);
        const isTargetType = terrain.key === "town" && canCaptureVillage || terrain.key === "castle" && canCaptureCastle;
        if (!isTargetType || !this.isUnfriendlyOwner(state, playerId, tile.ownerId)) continue;
        distances.push(getDistance(pos, { x, y }));
      }
    }
    return distances.length > 0 ? Math.min(...distances) : this.nearestEnemyDistance(state, playerId, pos);
  }
  nearestGlobalObjectiveDistance(state, playerId, pos) {
    const distances = [];
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        const terrain = getTileTerrainConfig(tile);
        if ((terrain.key === "town" || terrain.key === "castle") && this.isUnfriendlyOwner(state, playerId, tile.ownerId)) {
          distances.push(getDistance(pos, { x, y }));
        }
      }
    }
    return distances.length > 0 ? Math.min(...distances) : this.nearestEnemyDistance(state, playerId, pos);
  }
  nearestGlobalObjectivePosition(state, playerId, pos) {
    let bestPos = null;
    let bestDistance = Infinity;
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        const terrain = getTileTerrainConfig(tile);
        if (terrain.key !== "town" && terrain.key !== "castle" || !this.isUnfriendlyOwner(state, playerId, tile.ownerId)) continue;
        const distance = getDistance(pos, { x, y });
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPos = { x, y };
        }
      }
    }
    return bestPos;
  }
  isCapturableTileForUnit(state, playerId, unit, pos) {
    const tile = state.map.tiles[pos.y]?.[pos.x];
    if (!tile) return false;
    const terrain = getTileTerrainConfig(tile);
    const abilities = UNIT_CONFIGS[unit.unitClass].abilities;
    const canCapture = terrain.key === "town" && abilities.includes("village_capturer") || terrain.key === "castle" && abilities.includes("castle_capturer");
    return canCapture && this.isUnfriendlyOwner(state, playerId, tile.ownerId);
  }
  canThreatenEnemyFrom(state, playerId, unit, pos) {
    const stats = getEffectiveStats(unit);
    return state.units.some((enemy) => enemy.hp > 0 && areEnemyPlayers(state, playerId, enemy.ownerId) && getDistance(pos, enemy.pos) >= stats.minRange && getDistance(pos, enemy.pos) <= stats.maxRange);
  }
  hasAliveCommander(state, playerId) {
    return state.units.some((unit) => unit.ownerId === playerId && unit.hp > 0 && isCommanderUnit(state, unit, playerId));
  }
  countEnemyOwnedCastles(state, playerId) {
    let count = 0;
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        if (tile.ownerId !== null && getTileTerrainConfig(tile).key === "castle" && areEnemyPlayers(state, playerId, tile.ownerId)) {
          count += 1;
        }
      }
    }
    return count;
  }
  countEnemyUnits(state, playerId) {
    return state.units.filter((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId)).length;
  }
  totalCombatValue(state, playerId) {
    return state.units.filter((unit) => unit.ownerId === playerId && unit.hp > 0).reduce((sum, unit) => sum + this.getUnitValue(state, unit) * Math.max(0, unit.hp) / Math.max(1, getEffectiveStats(unit).maxHp), 0);
  }
  totalEnemyCombatValue(state, playerId) {
    return state.units.filter((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId)).reduce((sum, unit) => sum + this.getUnitValue(state, unit) * Math.max(0, unit.hp) / Math.max(1, getEffectiveStats(unit).maxHp), 0);
  }
  isCleanupMode(state, playerId) {
    const enemyUnits = this.countEnemyUnits(state, playerId);
    const ownValue = this.totalCombatValue(state, playerId);
    const enemyValue = this.totalEnemyCombatValue(state, playerId);
    return enemyUnits <= 6 || ownValue > enemyValue * 1.8 + 900;
  }
  isThreatenedOwnCastle(state, playerId, pos) {
    const tile = state.map.tiles[pos.y]?.[pos.x];
    if (!tile || tile.ownerId !== playerId || getTileTerrainConfig(tile).key !== "castle") return false;
    if (state.units.some((unit) => unit.hp > 0 && this.isSamePosition(unit.pos, pos))) return false;
    return this.enemyCommanderCanReachPosition(state, playerId, pos);
  }
  isGuardingOwnCastleAgainstCommander(state, playerId, unit) {
    if (unit.ownerId !== playerId || unit.hp <= 0) return false;
    const tile = state.map.tiles[unit.pos.y]?.[unit.pos.x];
    if (!tile || tile.ownerId !== playerId || getTileTerrainConfig(tile).key !== "castle") return false;
    const stateWithoutGuard = {
      ...state,
      units: state.units.filter((candidate) => candidate.id !== unit.id)
    };
    return this.enemyCommanderCanReachPosition(stateWithoutGuard, playerId, unit.pos);
  }
  enemyCommanderCanReachPosition(state, playerId, pos) {
    return state.units.some((unit) => unit.hp > 0 && areEnemyPlayers(state, playerId, unit.ownerId) && isCommanderUnit(state, unit, unit.ownerId) && getReachablePositions(state, unit.id).some((reachable) => this.isSamePosition(reachable, pos)));
  }
  countLowTierUnits(state, playerId) {
    return state.units.filter((unit) => unit.ownerId === playerId && unit.hp > 0 && this.getUnitValue(state, unit) <= 300).length;
  }
  nearestEnemyCastlePosition(state, playerId, pos) {
    return this.nearestTerrainPosition(state, playerId, pos, "castle", true);
  }
  nearestCapturableVillagePosition(state, playerId, pos) {
    return this.nearestTerrainPosition(state, playerId, pos, "town", true);
  }
  nearestDamagedTownPosition(state, playerId, pos) {
    return this.nearestTerrainPosition(state, playerId, pos, "damaged_town", false);
  }
  nearestTerrainPosition(state, playerId, pos, terrainKey, requireUnfriendlyOwner) {
    let bestPos = null;
    let bestDistance = Infinity;
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainConfig(tile).key !== terrainKey) continue;
        if (requireUnfriendlyOwner && !this.isUnfriendlyOwner(state, playerId, tile.ownerId)) continue;
        if (!requireUnfriendlyOwner && tile.ownerId !== playerId && tile.ownerId !== null) continue;
        const distance = getDistance(pos, { x, y });
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPos = { x, y };
        }
      }
    }
    return bestPos;
  }
  nearestCastleObjectiveDistance(state, playerId, pos) {
    const distances = [];
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainConfig(tile).key === "castle" && this.isUnfriendlyOwner(state, playerId, tile.ownerId)) {
          distances.push(getDistance(pos, { x, y }));
        }
      }
    }
    return distances.length > 0 ? Math.min(...distances) : null;
  }
  isUnfriendlyCastleTile(state, playerId, pos) {
    const tile = state.map.tiles[pos.y]?.[pos.x];
    return !!tile && getTileTerrainConfig(tile).key === "castle" && this.isUnfriendlyOwner(state, playerId, tile.ownerId);
  }
  isOwnCastleTile(state, playerId, pos) {
    const tile = state.map.tiles[pos.y]?.[pos.x];
    return !!tile && tile.ownerId === playerId && getTileTerrainConfig(tile).key === "castle";
  }
  scorePositionPressure(state, playerId, pos) {
    const nearestEnemy = this.nearestEnemyDistance(state, playerId, pos) ?? 99;
    const nearestObjective = this.nearestGlobalObjectiveDistance(state, playerId, pos) ?? 99;
    return Math.max(0, 10 - nearestEnemy) * 55 + Math.max(0, 12 - nearestObjective) * 40;
  }
  isUnfriendlyOwner(state, playerId, ownerId) {
    return ownerId === null || getAllianceId(state, ownerId) !== getAllianceId(state, playerId);
  }
};

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/spatial_conv_net.ts
function conv2dForward(out, x, conv, H = SPATIAL_TENSOR_MAX_H, W_dim = SPATIAL_TENSOR_MAX_W, relu = false) {
  const C_in = conv.inChannels;
  const C_out = conv.outChannels;
  const HW = H * W_dim;
  const W = conv.weights;
  const B = conv.biases;
  for (let co = 0; co < C_out; co += 1) {
    const outBase = co * HW;
    const bias = B[co];
    out.fill(bias, outBase, outBase + HW);
    const wCoBase = co * C_in * 9;
    for (let ci = 0; ci < C_in; ci += 1) {
      const inBase = ci * HW;
      const wCiBase = wCoBase + ci * 9;
      for (let y = 0; y < H; y += 1) {
        for (let x_pos = 0; x_pos < W_dim; x_pos += 1) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky += 1) {
            const iy = y + ky;
            if (iy < 0 || iy >= H) continue;
            const inRowBase = inBase + iy * W_dim;
            const wRowBase = wCiBase + (ky + 1) * 3;
            for (let kx = -1; kx <= 1; kx += 1) {
              const ix = x_pos + kx;
              if (ix < 0 || ix >= W_dim) continue;
              sum += x[inRowBase + ix] * W[wRowBase + (kx + 1)];
            }
          }
          out[outBase + y * W_dim + x_pos] += sum;
        }
      }
    }
    if (relu) {
      for (let i = 0; i < HW; i += 1) {
        const idx = outBase + i;
        if (out[idx] < 0) out[idx] = 0;
      }
    }
  }
}
function denseForward(out, x, layer, activation = "linear") {
  const inDim = layer.inDim;
  const outDim = layer.outDim;
  const W = layer.weights;
  const B = layer.biases;
  for (let o = 0; o < outDim; o += 1) {
    let sum = B[o];
    const wBase = o * inDim;
    for (let i = 0; i < inDim; i += 1) {
      sum += W[wBase + i] * x[i];
    }
    if (activation === "relu") {
      out[o] = sum > 0 ? sum : 0;
    } else if (activation === "tanh") {
      out[o] = Math.tanh(sum);
    } else {
      out[o] = sum;
    }
  }
}
function globalAvgPool2D(out, x, channels = 32, H = SPATIAL_TENSOR_MAX_H, W = SPATIAL_TENSOR_MAX_W) {
  const HW = H * W;
  const scale = 1 / HW;
  for (let c = 0; c < channels; c += 1) {
    let sum = 0;
    const base = c * HW;
    for (let i = 0; i < HW; i += 1) {
      sum += x[base + i];
    }
    out[c] = sum * scale;
  }
}
function poolSpatialCoord(out, outOffset, Z, coord, channels = 32, H = SPATIAL_TENSOR_MAX_H, W = SPATIAL_TENSOR_MAX_W) {
  if (!coord || coord.x < 0 || coord.x >= W || coord.y < 0 || coord.y >= H) {
    out.fill(0, outOffset, outOffset + channels);
    return;
  }
  const HW = H * W;
  const tileOffset = coord.y * W + coord.x;
  for (let c = 0; c < channels; c += 1) {
    out[outOffset + c] = Z[c * HW + tileOffset];
  }
}
var SpatialResNetPredictor = class {
  constructor(weights) {
    this.weights = weights;
    this.isV2 = weights.version === "spatial-resnet-v2" || weights.polDense1.inDim > 120;
    this.numBlocks = weights.numBlocks ?? (weights.res3_1 ? 4 : 2);
    this.globalPolicyPool = weights.globalPolicyPool === true;
    this.spatialChannels = weights.stem.inChannels;
    {
      const trunkContribution = this.globalPolicyPool ? 96 + 32 : 96;
      const globalContribution = this.isV2 ? GLOBAL_FEATURE_DIM_V2 : GLOBAL_FEATURE_DIM_V1;
      const derived = weights.polDense1.inDim - trunkContribution - globalContribution;
      this.semanticDim = this.isV2 ? derived > 0 ? derived : ACTION_SEMANTIC_DIM_V2 : ACTION_SEMANTIC_DIM_V1;
    }
    if (this.globalPolicyPool && !this.isV2) {
      throw new Error("globalPolicyPool is only supported for spatial-resnet-v2 checkpoints");
    }
    if (typeof weights.encoderSchemaId !== "string" || weights.encoderSchemaId.length === 0) {
      throw new Error(
        "V15/T15-02 \u62D2\u7EDD\u52A0\u8F7D\u672A\u58F0\u660E encoderSchemaId \u7684\u6743\u91CD\uFF1A\u5F62\u72B6\u76F8\u540C\u7684 v14/v15 \u65E0\u6CD5\u9760\u7EF4\u5EA6\u533A\u5206\uFF0C\u5FC5\u987B\u663E\u5F0F\u58F0\u660E\u8F93\u5165\u8BED\u4E49\u8EAB\u4EFD\uFF08\u5386\u53F2\u68C0\u67E5\u70B9\u8BF7\u901A\u8FC7 loadSpatialResNetFromJson \u52A0\u8F7D\uFF0C\u5B83\u4F1A\u4E3A\u65E0\u58F0\u660E\u6743\u91CD\u8865\u4E0A v13 \u8EAB\u4EFD\uFF09\u3002"
      );
    }
    this.encoderSchemaId = weights.encoderSchemaId;
    this.semanticsVariant = actionSemanticsVariantForSchema(this.encoderSchemaId);
    const schemaChannels = ENCODER_SCHEMA_CHANNELS[this.encoderSchemaId];
    if (typeof schemaChannels === "number" && schemaChannels !== this.spatialChannels) {
      throw new Error(
        `V15/T15-02 schema/\u5F62\u72B6\u4E0D\u4E00\u81F4\uFF1Aschema ${this.encoderSchemaId} \u58F0\u660E ${schemaChannels} \u4E2A\u7A7A\u95F4\u901A\u9053\uFF0C\u4F46\u6743\u91CD stem \u671F\u671B ${this.spatialChannels}\u3002\u62D2\u7EDD\u52A0\u8F7D\u3002`
      );
    }
    const schemaSemanticDim = ENCODER_SCHEMA_SEMANTIC_DIM[this.encoderSchemaId];
    if (typeof schemaSemanticDim === "number" && schemaSemanticDim !== this.semanticDim) {
      throw new Error(
        `V15/T15-02 schema/\u5F62\u72B6\u4E0D\u4E00\u81F4\uFF1Aschema ${this.encoderSchemaId} \u58F0\u660E ${schemaSemanticDim} \u7EF4\u52A8\u4F5C\u8BED\u4E49\uFF0C\u4F46\u6743\u91CD polDense1 \u53CD\u63A8\u4E3A ${this.semanticDim}\u3002\u62D2\u7EDD\u52A0\u8F7D\u3002`
      );
    }
    const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
    this.bufStem = new Float32Array(32 * HW);
    this.bufRes1_1 = new Float32Array(32 * HW);
    this.bufRes1_2 = new Float32Array(32 * HW);
    this.bufRes2_1 = new Float32Array(32 * HW);
    this.bufRes2_2 = new Float32Array(32 * HW);
    if (this.numBlocks >= 4) {
      this.bufRes3_1 = new Float32Array(32 * HW);
      this.bufRes3_2 = new Float32Array(32 * HW);
      this.bufRes4_1 = new Float32Array(32 * HW);
    }
    this.bufZ = new Float32Array(32 * HW);
    this.bufGap = new Float32Array(32);
    this.bufValIn = new Float32Array(this.weights.valDense1.inDim);
    this.bufValH = new Float32Array(32);
    this.bufValOut = new Float32Array(1);
    this.bufPolIn = new Float32Array(this.weights.polDense1.inDim);
    this.bufPolH = new Float32Array(48);
    this.bufPolOut = new Float32Array(1);
  }
  predict(encodedState, candidateActions) {
    if (!encodedState || typeof encodedState !== "object") {
      throw new Error("SpatialResNetPredictor.predict: encodedState must be an object with spatialTensor and globalFeatures");
    }
    if (!encodedState.spatialTensor || !(encodedState.spatialTensor instanceof Float32Array || Array.isArray(encodedState.spatialTensor))) {
      throw new Error("SpatialResNetPredictor.predict: encodedState.spatialTensor is required and must be Float32Array or array");
    }
    if (!encodedState.globalFeatures || !(encodedState.globalFeatures instanceof Float32Array || Array.isArray(encodedState.globalFeatures))) {
      throw new Error("SpatialResNetPredictor.predict: encodedState.globalFeatures is required and must be Float32Array or array");
    }
    if (!Array.isArray(candidateActions)) {
      throw new Error("SpatialResNetPredictor.predict: candidateActions must be an array");
    }
    const expectedSpatialLen = this.spatialChannels * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
    if (encodedState.spatialTensor.length !== expectedSpatialLen) {
      throw new Error(`SpatialResNetPredictor.predict: invalid spatialTensor length ${encodedState.spatialTensor.length}, expected ${expectedSpatialLen}`);
    }
    const minGlobalLen = this.isV2 ? GLOBAL_FEATURE_DIM_V2 : GLOBAL_FEATURE_DIM_V1;
    if (encodedState.globalFeatures.length < minGlobalLen) {
      throw new Error(`SpatialResNetPredictor.predict: invalid globalFeatures length ${encodedState.globalFeatures.length}, expected at least ${minGlobalLen}`);
    }
    const spatialTensor = encodedState.spatialTensor instanceof Float32Array ? encodedState.spatialTensor : new Float32Array(encodedState.spatialTensor);
    const globalFeatures = encodedState.globalFeatures instanceof Float32Array ? encodedState.globalFeatures : new Float32Array(encodedState.globalFeatures);
    for (let i = 0; i < spatialTensor.length; i++) {
      if (!Number.isFinite(spatialTensor[i])) {
        throw new Error(`SpatialResNetPredictor.predict: spatialTensor contains non-finite value at index ${i}: ${spatialTensor[i]}`);
      }
    }
    for (let i = 0; i < globalFeatures.length; i++) {
      if (!Number.isFinite(globalFeatures[i])) {
        throw new Error(`SpatialResNetPredictor.predict: globalFeatures contains non-finite value at index ${i}: ${globalFeatures[i]}`);
      }
    }
    const expectedSemLen = this.semanticDim;
    for (let c = 0; c < candidateActions.length; c++) {
      const act = candidateActions[c];
      if (!act || typeof act !== "object") {
        throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} must be an object`);
      }
      if (!act.semantics) {
        throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} missing semantics`);
      }
      if (act.semantics.length !== expectedSemLen) {
        throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} semantics length ${act.semantics.length} != expected ${expectedSemLen}`);
      }
      for (let s = 0; s < expectedSemLen; s++) {
        if (!Number.isFinite(act.semantics[s])) {
          throw new Error(`SpatialResNetPredictor.predict: candidateAction at index ${c} semantics contains non-finite value at index ${s}: ${act.semantics[s]}`);
        }
      }
    }
    const HW = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
    conv2dForward(this.bufStem, spatialTensor, this.weights.stem, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
    conv2dForward(this.bufRes1_1, this.bufStem, this.weights.res1_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
    conv2dForward(this.bufRes1_2, this.bufRes1_1, this.weights.res1_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
    for (let i = 0; i < 32 * HW; i += 1) {
      const sum = this.bufRes1_2[i] + this.bufStem[i];
      this.bufRes1_2[i] = sum > 0 ? sum : 0;
    }
    if (this.numBlocks >= 4 && this.weights.res3_1 && this.weights.res3_2 && this.weights.res4_1 && this.weights.res4_2) {
      conv2dForward(this.bufRes2_1, this.bufRes1_2, this.weights.res2_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
      conv2dForward(this.bufRes2_2, this.bufRes2_1, this.weights.res2_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
      for (let i = 0; i < 32 * HW; i += 1) {
        const sum = this.bufRes2_2[i] + this.bufRes1_2[i];
        this.bufRes2_2[i] = sum > 0 ? sum : 0;
      }
      conv2dForward(this.bufRes3_1, this.bufRes2_2, this.weights.res3_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
      conv2dForward(this.bufRes3_2, this.bufRes3_1, this.weights.res3_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
      for (let i = 0; i < 32 * HW; i += 1) {
        const sum = this.bufRes3_2[i] + this.bufRes2_2[i];
        this.bufRes3_2[i] = sum > 0 ? sum : 0;
      }
      conv2dForward(this.bufRes4_1, this.bufRes3_2, this.weights.res4_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
      conv2dForward(this.bufZ, this.bufRes4_1, this.weights.res4_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
      for (let i = 0; i < 32 * HW; i += 1) {
        const sum = this.bufZ[i] + this.bufRes3_2[i];
        this.bufZ[i] = sum > 0 ? sum : 0;
      }
    } else {
      conv2dForward(this.bufRes2_1, this.bufRes1_2, this.weights.res2_1, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, true);
      conv2dForward(this.bufZ, this.bufRes2_1, this.weights.res2_2, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W, false);
      for (let i = 0; i < 32 * HW; i += 1) {
        const sum = this.bufZ[i] + this.bufRes1_2[i];
        this.bufZ[i] = sum > 0 ? sum : 0;
      }
    }
    globalAvgPool2D(this.bufGap, this.bufZ, 32, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W);
    this.bufValIn.set(this.bufGap, 0);
    const valGlobDim = this.weights.valDense1.inDim - 32;
    this.bufValIn.set(globalFeatures.subarray(0, valGlobDim), 32);
    denseForward(this.bufValH, this.bufValIn, this.weights.valDense1, "relu");
    denseForward(this.bufValOut, this.bufValH, this.weights.valDense2, "tanh");
    const value = this.bufValOut[0];
    let policyGapOffset = -1;
    if (this.globalPolicyPool) {
      policyGapOffset = this.isV2 ? 96 + this.semanticDim + GLOBAL_FEATURE_DIM_V2 : 96 + ACTION_SEMANTIC_DIM_V1;
      for (let i = 0; i < 32; i += 1) {
        this.bufPolIn[policyGapOffset + i] = this.bufGap[i];
      }
    }
    const logits = [];
    for (const act of candidateActions) {
      poolSpatialCoord(this.bufPolIn, 0, this.bufZ, act.actorCoord);
      poolSpatialCoord(this.bufPolIn, 32, this.bufZ, act.landingCoord);
      poolSpatialCoord(this.bufPolIn, 64, this.bufZ, act.targetCoord);
      const semArr = act.semantics instanceof Float32Array ? act.semantics : new Float32Array(act.semantics);
      if (this.isV2) {
        const semLen = Math.min(semArr.length, this.semanticDim);
        this.bufPolIn.set(semArr.subarray(0, semLen), 96);
        const globLen = Math.min(globalFeatures.length, GLOBAL_FEATURE_DIM_V2);
        this.bufPolIn.set(globalFeatures.subarray(0, globLen), 96 + this.semanticDim);
      } else {
        const semLen = Math.min(semArr.length, ACTION_SEMANTIC_DIM_V1);
        this.bufPolIn.set(semArr.subarray(0, semLen), 96);
      }
      denseForward(this.bufPolH, this.bufPolIn, this.weights.polDense1, "relu");
      denseForward(this.bufPolOut, this.bufPolH, this.weights.polDense2, "linear");
      logits.push(this.bufPolOut[0]);
    }
    if (logits.length === 0) {
      return {
        value,
        actionLogits: [],
        actionProbs: [],
        bestActionIndex: -1,
        spatialFeaturesZ: this.bufZ
      };
    }
    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - maxLogit));
    const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map((e) => e / sumExp);
    let bestIndex = 0;
    let bestLogit = logits[0];
    for (let i = 1; i < logits.length; i += 1) {
      if (logits[i] > bestLogit) {
        bestLogit = logits[i];
        bestIndex = i;
      }
    }
    for (let i = 0; i < logits.length; i++) {
      if (!Number.isFinite(logits[i])) {
        throw new Error(`SpatialResNetPredictor.predict: output logit at index ${i} is non-finite: ${logits[i]}`);
      }
    }
    if (!Number.isFinite(value)) {
      throw new Error(`SpatialResNetPredictor.predict: output value is non-finite: ${value}`);
    }
    return {
      value,
      actionLogits: logits,
      actionProbs: probs,
      bestActionIndex: bestIndex,
      spatialFeaturesZ: this.bufZ
    };
  }
};
function assertWeightsFinite(arr, name) {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      throw new Error(`SpatialResNetWeights: ${name} contains non-finite value at index ${i}: ${arr[i]}`);
    }
  }
}
function loadSpatialResNetFromJson(jsonStr, options) {
  const raw = JSON.parse(jsonStr);
  if (raw.version !== "spatial-resnet-v1" && raw.version !== "spatial-resnet-v2") {
    throw new Error(`Incompatible spatial model version: ${raw.version}`);
  }
  const declaredSchema = typeof raw.encoderSchemaId === "string" ? raw.encoderSchemaId : null;
  const inferredSchema = raw.version === "spatial-resnet-v1" ? ENCODER_SCHEMA_ID_V1 : ENCODER_SCHEMA_ID_V13;
  const effectiveSchema = declaredSchema ?? inferredSchema;
  const expected = options?.expectedEncoderSchemaId ?? null;
  if (expected !== null) {
    const legacyFamilyAccepted = declaredSchema === null && expected === ENCODER_SCHEMA_ID_V13 && inferredSchema === ENCODER_SCHEMA_ID_V1;
    if (effectiveSchema !== expected && !legacyFamilyAccepted) {
      throw new Error(
        `Spatial model encoder schema mismatch: checkpoint declares ${effectiveSchema}, runtime expects ${expected}. \u65E7\u6743\u91CD\u4E0D\u5F97\u9759\u9ED8\u52A0\u8F7D\u5230\u65B0\u8BED\u4E49\u8F93\u5165\u4E0A\uFF1B\u8BF7\u663E\u5F0F\u58F0\u660E expectedEncoderSchemaId \u6216\u91CD\u65B0\u5BFC\u51FA\u5339\u914D\u7684\u68C0\u67E5\u70B9\u3002`
      );
    }
  }
  if (declaredSchema !== null && !SUPPORTED_ENCODER_SCHEMA_IDS.includes(declaredSchema)) {
    throw new Error(`Unknown spatial encoder schema: ${declaredSchema}`);
  }
  const declaredChannels = raw.stem?.inChannels;
  const schemaChannels = ENCODER_SCHEMA_CHANNELS[effectiveSchema];
  if (typeof declaredChannels === "number" && typeof schemaChannels === "number" && declaredChannels !== schemaChannels) {
    throw new Error(
      `Spatial model channel count mismatch: checkpoint stem expects ${declaredChannels} channels, but encoder schema ${effectiveSchema} produces ${schemaChannels}. \u62D2\u7EDD\u52A0\u8F7D\uFF1A\u8BF7\u4F7F\u7528\u4E0E\u7F16\u7801\u5668 schema \u5339\u914D\u7684\u68C0\u67E5\u70B9\uFF08v13 \u4E3A 24 \u901A\u9053\uFF0Cv14 \u4E3A 26 \u901A\u9053\uFF09\u3002`
    );
  }
  const deserializeConv = (l, name) => {
    const weights = new Float32Array(l.weights);
    const biases = new Float32Array(l.biases);
    const expectedWeights = l.outChannels * l.inChannels * 9;
    if (weights.length !== expectedWeights) {
      throw new Error(
        `Spatial model layer ${name}: weight length ${weights.length} does not match outChannels*inChannels*9 = ${expectedWeights}. \u68C0\u67E5\u70B9\u5DF2\u635F\u574F\u6216\u5F62\u72B6\u58F0\u660E\u9519\u8BEF\u3002`
      );
    }
    if (biases.length !== l.outChannels) {
      throw new Error(
        `Spatial model layer ${name}: bias length ${biases.length} does not match outChannels ${l.outChannels}.`
      );
    }
    assertWeightsFinite(weights, `${name}.weights`);
    assertWeightsFinite(biases, `${name}.biases`);
    return {
      inChannels: l.inChannels,
      outChannels: l.outChannels,
      kernelSize: 3,
      padding: 1,
      weights,
      biases
    };
  };
  const deserializeDense = (l, name) => {
    const weights = new Float32Array(l.weights);
    const biases = new Float32Array(l.biases);
    if (weights.length !== l.inDim * l.outDim) {
      throw new Error(
        `Spatial model layer ${name}: weight length ${weights.length} does not match inDim*outDim = ${l.inDim * l.outDim}.`
      );
    }
    if (biases.length !== l.outDim) {
      throw new Error(
        `Spatial model layer ${name}: bias length ${biases.length} does not match outDim ${l.outDim}.`
      );
    }
    assertWeightsFinite(weights, `${name}.weights`);
    assertWeightsFinite(biases, `${name}.biases`);
    return {
      inDim: l.inDim,
      outDim: l.outDim,
      weights,
      biases
    };
  };
  const numBlocks = raw.numBlocks ?? (raw.res3_1 ? 4 : 2);
  const architectureId = raw.architectureId ?? (numBlocks === 4 ? "spatial_resnet_32ch_4res" : "spatial_resnet_32ch_2res");
  const result = {
    version: raw.version,
    numBlocks,
    architectureId,
    globalPolicyPool: raw.globalPolicyPool === true,
    stem: deserializeConv(raw.stem, "stem"),
    res1_1: deserializeConv(raw.res1_1, "res1_1"),
    res1_2: deserializeConv(raw.res1_2, "res1_2"),
    res2_1: deserializeConv(raw.res2_1, "res2_1"),
    res2_2: deserializeConv(raw.res2_2, "res2_2"),
    valDense1: deserializeDense(raw.valDense1, "valDense1"),
    valDense2: deserializeDense(raw.valDense2, "valDense2"),
    polDense1: deserializeDense(raw.polDense1, "polDense1"),
    polDense2: deserializeDense(raw.polDense2, "polDense2"),
    encoderSchemaId: effectiveSchema
  };
  if (numBlocks >= 4 && raw.res3_1 && raw.res3_2 && raw.res4_1 && raw.res4_2) {
    result.res3_1 = deserializeConv(raw.res3_1, "res3_1");
    result.res3_2 = deserializeConv(raw.res3_2, "res3_2");
    result.res4_1 = deserializeConv(raw.res4_1, "res4_1");
    result.res4_2 = deserializeConv(raw.res4_2, "res4_2");
  }
  return result;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/ai_training/v17/teachers/b100_policy.ts
var import_node_crypto2 = require("node:crypto");

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/ai_training/v15/tools/labeler_l1_v15.ts
function canonicalStateJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStateJson(v)).join(",")}]`;
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStateJson(obj[k])}`).join(",")}}`;
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/runtime/v7_heuristic_bounded_search.ts
function evaluatePositionHeuristic(state, rootPlayerId) {
  const rootAlliance = getAllianceId(state, rootPlayerId);
  if (state.winner !== null) {
    if (state.winner === rootAlliance) return 1e5;
    if (state.winner === -1) return 0;
    return -1e5;
  }
  let rootMaterial = 0;
  let enemyMaterial = 0;
  let rootCommanderAlive = false;
  let enemyCommanderAlive = false;
  let rootCommanderHp = 0;
  let enemyCommanderHp = 0;
  let rootCommanderPos = null;
  let enemyCommanderPos = null;
  const alliedUnits = [];
  const enemyUnits = [];
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    const isAllied = getAllianceId(state, u.ownerId) === rootAlliance;
    const cost = getUnitCost(state, u.ownerId, u.unitClass) ?? 200;
    const effectiveHpRatio = u.hp / 100;
    const value = cost * effectiveHpRatio;
    if (isAllied) {
      alliedUnits.push(u);
    } else {
      enemyUnits.push(u);
    }
    if (isCommanderUnit(state, u)) {
      if (isAllied) {
        rootCommanderAlive = true;
        rootCommanderHp = u.hp;
        rootCommanderPos = u.pos;
        rootMaterial += value + 600;
      } else {
        enemyCommanderAlive = true;
        enemyCommanderHp = u.hp;
        enemyCommanderPos = u.pos;
        enemyMaterial += value + 600;
      }
    } else {
      if (isAllied) {
        rootMaterial += value;
      } else {
        enemyMaterial += value;
      }
    }
  }
  let rootTerritory = 0;
  let enemyTerritory = 0;
  const targetBuildings = [];
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const tile = state.map.tiles[y][x];
      const tKey = getTileTerrainKey(tile);
      const isBuilding = tKey === "castle" || tKey === "town" || tKey === "damaged_town";
      if (!isBuilding) continue;
      if (tile.ownerId === null || getAllianceId(state, tile.ownerId) !== rootAlliance) {
        targetBuildings.push({ x, y });
      }
      if (tile.ownerId === null) continue;
      const isAllied = getAllianceId(state, tile.ownerId) === rootAlliance;
      const bVal = tKey === "castle" ? 500 : 150;
      if (isAllied) {
        rootTerritory += bVal;
      } else {
        enemyTerritory += bVal;
      }
    }
  }
  let rootGold = 0;
  let enemyGold = 0;
  for (const p of state.players) {
    const isAllied = getAllianceId(state, p.id) === rootAlliance;
    if (isAllied) {
      rootGold += p.gold;
    } else {
      enemyGold += p.gold;
    }
  }
  let commanderBonus = 0;
  if (!rootCommanderAlive) commanderBonus -= 1200;
  else if (rootCommanderHp < 35) commanderBonus -= 400;
  if (!enemyCommanderAlive) commanderBonus += 1200;
  else if (enemyCommanderHp < 35) commanderBonus += 400;
  let rootAdvanceBonus = 0;
  let enemyAdvanceBonus = 0;
  const enemyGoal = enemyCommanderPos ?? { x: state.map.width - 1, y: state.map.height - 1 };
  const rootGoal = rootCommanderPos ?? { x: 0, y: 0 };
  const maxBoardDist = state.map.width + state.map.height;
  for (const u of alliedUnits) {
    const distToGoal = Math.abs(u.pos.x - enemyGoal.x) + Math.abs(u.pos.y - enemyGoal.y);
    rootAdvanceBonus += Math.max(0, maxBoardDist - distToGoal) * 4;
  }
  for (const u of enemyUnits) {
    const distToGoal = Math.abs(u.pos.x - rootGoal.x) + Math.abs(u.pos.y - rootGoal.y);
    enemyAdvanceBonus += Math.max(0, maxBoardDist - distToGoal) * 4;
  }
  let tacticalThreatDelta = 0;
  if (rootCommanderAlive && rootCommanderPos) {
    for (const e of enemyUnits) {
      const d = Math.abs(e.pos.x - rootCommanderPos.x) + Math.abs(e.pos.y - rootCommanderPos.y);
      if (d <= 2) {
        tacticalThreatDelta -= 200;
      }
    }
  }
  if (enemyCommanderAlive && enemyCommanderPos) {
    for (const a of alliedUnits) {
      const d = Math.abs(a.pos.x - enemyCommanderPos.x) + Math.abs(a.pos.y - enemyCommanderPos.y);
      if (d <= 2) {
        tacticalThreatDelta += 200;
      }
    }
  }
  let captureBonus = 0;
  for (const u of alliedUnits) {
    const t = state.map.tiles[u.pos.y]?.[u.pos.x];
    const tKey = t ? getTileTerrainKey(t) : "";
    if (t && (tKey === "castle" || tKey === "town" || tKey === "damaged_town") && (t.ownerId === null || getAllianceId(state, t.ownerId) !== rootAlliance)) {
      captureBonus += 80;
    }
  }
  const rawScore = (rootMaterial - enemyMaterial) * 2 + (rootTerritory - enemyTerritory) * 1.5 + (rootGold - enemyGold) * 0.5 + commanderBonus + (rootAdvanceBonus - enemyAdvanceBonus) + tacticalThreatDelta + captureBonus;
  return Math.max(-49e3, Math.min(49e3, rawScore));
}

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/ai_training/v17/teachers/battle_search_b100.ts
function createB100Instrumentation() {
  return {
    catchIsAttackSafeStep: 0,
    catchIsAttackSafeLegal: 0,
    catchIsAttackSafeDamage: 0,
    catchCheapLeafStep: 0,
    catchEvaluateStep: 0,
    catchEvaluateLegal: 0,
    catchEvaluateRolloutStep: 0,
    catchProbeLegal: 0,
    catchProbeStep: 0,
    catchRepositionReach: 0,
    catchStaticAttackDamage: 0,
    getLegalActionsFailures: 0,
    catchGetActionLegal: 0,
    cloneCount: 0,
    stepCount: 0,
    heuristicCalls: 0,
    evaluateCalls: 0,
    cloneMs: 0,
    heuristicMs: 0,
    evaluateMs: 0
  };
}
var B100_CATCH_FIELDS = [
  "catchIsAttackSafeStep",
  "catchIsAttackSafeLegal",
  "catchIsAttackSafeDamage",
  "catchCheapLeafStep",
  "catchEvaluateStep",
  "catchEvaluateLegal",
  "catchEvaluateRolloutStep",
  "catchProbeLegal",
  "catchProbeStep",
  "catchRepositionReach",
  "catchStaticAttackDamage",
  "getLegalActionsFailures",
  "catchGetActionLegal"
];
function b100ExceptionTotal(inst) {
  let total = 0;
  for (const f of B100_CATCH_FIELDS) total += inst[f];
  return total;
}
function b100InstrumentationDelta(before, after) {
  const out = createB100Instrumentation();
  for (const key of Object.keys(out)) {
    out[key] = after[key] - before[key];
  }
  return out;
}
function emptyDiagnostics() {
  return {
    chosenActionCode: "",
    path: "not-run",
    candidateCount: 0,
    stageBCount: 0,
    cheapLeafValues: [],
    candidateActionCodes: [],
    stageBLeafValues: [],
    heuTopLeaf: null,
    bestLeaf: null,
    margin: null,
    takeoverGate: null,
    fired: {
      urgent: false,
      forcedWin: false,
      takeover: false,
      veto: false,
      follow: false,
      attackSafetyFallback: false
    }
  };
}
function mulberryDefault(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mulberryStateful(seed) {
  let a = seed >>> 0;
  const fn = (() => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  });
  fn.getState = () => a >>> 0;
  fn.setState = (state) => {
    a = state >>> 0;
  };
  return fn;
}
function rngStateHex(state) {
  return `0x${(state >>> 0).toString(16).padStart(8, "0")}`;
}
var BattleSearchAI = class {
  constructor(seedOrRng, options) {
    this.stats = { decisions: 0, urgentHits: 0, forcedWins: 0, takeovers: 0, vetos: 0, follows: 0 };
    /** V17：观测容器。 */
    this.inst = createB100Instrumentation();
    /** V17：最近一次决策的诊断。 */
    this.lastDiagnostics = emptyDiagnostics();
    if (typeof seedOrRng === "function") this.rng = seedOrRng;
    else this.rng = mulberryDefault(seedOrRng ?? 48879);
    this.heuristic = new HeuristicAI(this.rng);
    this.topK = options?.topK ?? 6;
    this.oppDepth = options?.oppDepth ?? 3;
    this.friendlyRolloutSteps = options?.friendlyRolloutSteps ?? 2;
    this.takeoverThreshold = options?.takeoverThreshold ?? 350;
    this.vetoMargin = options?.vetoMargin ?? 300;
    this.dangerLine = options?.dangerLine ?? -800;
    this.searchStartTurn = options?.searchStartTurn ?? 1;
    this.allowSurrender = options?.allowSurrender ?? false;
    this.instOn = options?.instrument !== false;
  }
  /* ---------------- V17 观测原语（不参与分支决策） ---------------- */
  bump(field, n = 1) {
    if (!this.instOn) return;
    this.inst[field] += n;
  }
  mark(field, t0) {
    if (!this.instOn) return;
    this.inst[field] += Date.now() - t0;
  }
  t0() {
    return this.instOn ? Date.now() : 0;
  }
  /** engine.clone() 的观测包装；除计数/计时外与直接调用完全等价。 */
  cloneEngine(engine) {
    this.bump("cloneCount");
    const t = this.t0();
    const clone = engine.clone();
    this.mark("cloneMs", t);
    return clone;
  }
  /** engine.step() 的观测包装；返回值照原样丢弃，异常照原样抛出。 */
  stepEngine(engine, action) {
    this.bump("stepCount");
    engine.step(action);
  }
  scoreWithHeuristic(engine, playerId, actions) {
    this.bump("heuristicCalls");
    const t = this.t0();
    const scored = this.heuristic.scoreCandidateActions(engine, playerId, actions);
    this.mark("heuristicMs", t);
    return scored;
  }
  chooseWithHeuristic(engine, playerId, actions) {
    this.bump("heuristicCalls");
    const t = this.t0();
    const action = this.heuristic.getAction(engine, playerId, actions);
    this.mark("heuristicMs", t);
    return action;
  }
  evaluateLeaf(state, playerId) {
    this.bump("evaluateCalls");
    const t = this.t0();
    const value = evaluatePositionHeuristic(state, playerId);
    this.mark("evaluateMs", t);
    return value;
  }
  /** 最近一次决策的可读诊断（未跑过决策时返回占位记录）。 */
  getLastDecisionDiagnostics() {
    return {
      ...this.lastDiagnostics,
      cheapLeafValues: [...this.lastDiagnostics.cheapLeafValues],
      candidateActionCodes: [...this.lastDiagnostics.candidateActionCodes],
      stageBLeafValues: [...this.lastDiagnostics.stageBLeafValues],
      fired: { ...this.lastDiagnostics.fired }
    };
  }
  getInstrumentation() {
    return { ...this.inst };
  }
  resetInstrumentation() {
    this.inst = createB100Instrumentation();
  }
  getAction(engine, playerId, preparedActions) {
    const diag = emptyDiagnostics();
    this.lastDiagnostics = diag;
    let legal;
    if (preparedActions !== void 0) {
      legal = preparedActions.slice();
    } else {
      try {
        legal = engine.getLegalActions(playerId).slice();
      } catch {
        this.bump("catchGetActionLegal");
        this.bump("getLegalActionsFailures");
        diag.path = "get-legal-failed";
        return { type: "end_turn" };
      }
    }
    if (legal.length === 0) {
      diag.path = "empty-legal";
      return { type: "end_turn" };
    }
    const nonSurrender = legal.filter((a) => a.type !== "surrender");
    let pool = this.allowSurrender ? legal : nonSurrender.length > 0 ? nonSurrender : legal;
    if (pool.length === 1) {
      diag.path = "single-pool";
      diag.candidateCount = 1;
      diag.candidateActionCodes = [this.actionCode(pool[0])];
      diag.chosenActionCode = this.actionCode(pool[0]);
      return pool[0];
    }
    const pendingId = engine.getState().pendingUnitId;
    if (pendingId) {
      const pendingUnit = engine.getState().units.find((u) => u.id === pendingId && u.ownerId === playerId);
      if (pendingUnit && !pendingUnit.hasActed && pendingUnit.hp > 0) {
        const pendingActions = pool.filter((a) => this.getActionUnitId(a) === pendingId);
        if (pendingActions.length > 0) {
          pool = pendingActions;
          if (pool.length === 1) {
            diag.path = "pending-single";
            diag.candidateCount = 1;
            diag.candidateActionCodes = [this.actionCode(pool[0])];
            diag.chosenActionCode = this.actionCode(pool[0]);
            return pool[0];
          }
        }
      }
    }
    this.stats.decisions += 1;
    const scored = this.scoreWithHeuristic(engine, playerId, pool);
    let urgentBest = null;
    for (const s of scored) {
      if (s.score >= 5e4 && (!urgentBest || s.score > urgentBest.score)) urgentBest = s;
    }
    if (urgentBest) {
      this.stats.urgentHits += 1;
      diag.fired.urgent = true;
      diag.path = "urgent";
      diag.chosenActionCode = this.actionCode(urgentBest.action);
      return urgentBest.action;
    }
    if (engine.getState().turn < this.searchStartTurn) {
      let best = scored[0];
      for (const s of scored) {
        if (s.score > best.score) best = s;
      }
      if (best.action.type === "surrender" && pool.length > 1) {
        const non = scored.filter((s) => s.action.type !== "surrender");
        if (non.length > 0) {
          best = non[0];
          for (const s of non) {
            if (s.score > best.score) best = s;
          }
        }
      }
      this.stats.follows += 1;
      diag.fired.follow = true;
      diag.path = "pre-search-follow";
      diag.chosenActionCode = this.actionCode(best.action);
      return best.action;
    }
    const ordered = [...scored].sort((a, b) => b.score - a.score);
    const candidates = this.buildTacticalCandidates(pool, ordered, engine.getState(), playerId);
    const heuTop = candidates[0];
    const cheapLeaf = candidates.map((c) => this.cheapLeafOf(engine, playerId, c.action));
    diag.candidateCount = candidates.length;
    diag.candidateActionCodes = candidates.map((c) => this.actionCode(c.action));
    diag.cheapLeafValues = cheapLeaf.slice();
    diag.stageBLeafValues = candidates.map(() => null);
    for (let i = 0; i < candidates.length; i++) {
      if (cheapLeaf[i] >= 1e5) {
        this.stats.forcedWins += 1;
        diag.fired.forcedWin = true;
        diag.path = "forced-win";
        diag.chosenActionCode = this.actionCode(candidates[i].action);
        return candidates[i].action;
      }
    }
    const orderByCheap = candidates.map((_, i) => i).sort((a, b) => cheapLeaf[b] - cheapLeaf[a]);
    const stageB = /* @__PURE__ */ new Set([0]);
    for (const i of orderByCheap) {
      if (stageB.size >= Math.min(4, candidates.length)) break;
      stageB.add(i);
    }
    diag.stageBCount = stageB.size;
    const leafByIndex = /* @__PURE__ */ new Map();
    const leafOf = (idx) => {
      const cached = leafByIndex.get(idx);
      if (cached !== void 0) return cached;
      const v = stageB.has(idx) ? this.evaluateCandidate(engine, playerId, candidates[idx].action) : cheapLeaf[idx];
      leafByIndex.set(idx, v);
      if (this.instOn) diag.stageBLeafValues[idx] = stageB.has(idx) ? v : null;
      return v;
    };
    const heuTopLeaf = leafOf(0) + this.phaseBonus(engine.getState(), playerId, candidates[0].action);
    diag.heuTopLeaf = heuTopLeaf;
    let bestIdx = 0;
    let bestLeaf = heuTopLeaf;
    for (let i = 1; i < candidates.length; i++) {
      const leaf = leafOf(i) + this.phaseBonus(engine.getState(), playerId, candidates[i].action);
      if (leaf > bestLeaf) {
        bestLeaf = leaf;
        bestIdx = i;
      }
    }
    diag.bestLeaf = bestLeaf;
    diag.margin = bestLeaf - heuTopLeaf;
    if (process.env.BATTLE_DEBUG === "1") {
      const st = engine.getState();
      const detail = candidates.map((c, i) => {
        const flag = (stageB.has(i) ? "B" : "A") + (i === 0 ? "(heu)" : "") + (i === bestIdx ? "(best)" : "");
        return `${c.action.type}${flag}:${Math.round(leafOf(i))}`;
      }).join(" ");
      console.error(`[DBG] T${st.turn} P${playerId} heuTopLeaf=${Math.round(heuTopLeaf)} bestLeaf=${Math.round(bestLeaf)} margin=${Math.round(bestLeaf - heuTopLeaf)} | ${detail}`);
    }
    const bestAction = candidates[bestIdx].action;
    const turn = engine.getState().turn;
    const gate = bestAction.type === "attack" && turn <= 8 ? 1500 : this.takeoverThreshold;
    diag.takeoverGate = gate;
    let chosen;
    if (bestLeaf >= heuTopLeaf + gate) {
      this.stats.takeovers += 1;
      diag.fired.takeover = true;
      chosen = bestAction;
    } else if (heuTopLeaf <= this.dangerLine && bestLeaf >= heuTopLeaf + this.vetoMargin) {
      this.stats.vetos += 1;
      diag.fired.veto = true;
      chosen = candidates[bestIdx].action;
    } else {
      this.stats.follows += 1;
      diag.fired.follow = true;
      chosen = heuTop.action;
    }
    const safe = this.isAttackSafe(engine, playerId, chosen);
    if (safe) {
      diag.path = diag.fired.takeover ? "takeover" : diag.fired.veto ? "veto" : "follow";
      diag.chosenActionCode = this.actionCode(chosen);
      return chosen;
    }
    const fallback = this.bestNonAttack(engine, playerId, candidates, leafOf);
    if (fallback) {
      this.stats.vetos += 1;
      diag.fired.veto = true;
      diag.fired.attackSafetyFallback = true;
      diag.path = "attack-unsafe-fallback";
      diag.chosenActionCode = this.actionCode(fallback);
      return fallback;
    }
    diag.path = "attack-unsafe-keep";
    diag.chosenActionCode = this.actionCode(chosen);
    return chosen;
  }
  /** 攻击是否安全：优势/杀指挥官直接放行； zicht 有利交换（杀掉价值相当或更高的目标）
   * 即使攻击者会死也放行（Crossing game1 全局零杀戮就是这么输的：安全检查把 1 换 1
   * 的好买卖全否了）；只否决“白送”（杀不掉还搭上自己）。
   */
  isAttackSafe(engine, playerId, action) {
    if (action.type !== "attack") return true;
    const state = engine.getState();
    if (this.materialRatio(state, playerId) > 1.25) return true;
    const target = state.units.find((u) => u.id === action.targetId);
    if (target && isCommanderUnit(state, target)) return true;
    const attackerBefore = state.units.find((u) => u.id === action.attackerId);
    const targetValue = target ? getUnitCost(state, target.ownerId, target.unitClass) ?? 200 : 0;
    const attackerValue = attackerBefore ? getUnitCost(state, attackerBefore.ownerId, attackerBefore.unitClass) ?? 200 : 99999;
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump("catchIsAttackSafeStep");
      return false;
    }
    const after = sim.getState();
    const targetAfter = after.units.find((u) => u.id === action.targetId);
    const targetDied = !targetAfter || targetAfter.hp <= 0;
    if (targetDied && targetValue >= attackerValue * 0.8) return true;
    const attacker = after.units.find((u) => u.id === action.attackerId);
    if (!attacker || attacker.hp <= 0) return false;
    try {
      const legal = sim.getLegalActions(playerId);
      if (legal.some((a) => a.type === "post_attack_move" && a.unitId === attacker.id)) return true;
    } catch {
      this.bump("catchIsAttackSafeLegal");
      this.bump("getLegalActionsFailures");
    }
    const allied = getAllianceId(after, playerId);
    let incoming = 0;
    for (const enemy of after.units) {
      if (enemy.hp <= 0 || getAllianceId(after, enemy.ownerId) === allied) continue;
      const stats = getEffectiveStats(enemy);
      if (!inRange(enemy.pos, attacker.pos, stats.minRange, stats.maxRange)) continue;
      try {
        incoming += Math.min(attacker.hp, calculateDamage(after, enemy.id, attacker.id));
      } catch {
        this.bump("catchIsAttackSafeDamage");
        continue;
      }
      if (incoming >= attacker.hp) return false;
    }
    return incoming < attacker.hp;
  }
  /** 受偷袭威胁的我方城堡：敌指挥官逼近（曼哈顿≤8）且城堡周边3格无我方守军。
   * 双条件缺一不可：半径≤5 会漏掉两回合走上来偷城（Crossing game1 T10 丢第二城堡教训）；
   * 无“无人防守”条件则会在指挥官中场游荡时全程误报，把部队钉死在城堡里（Peak game2 教训）。 */
  threatenedOwnCastles(state, playerId) {
    const enemyCommanders = [];
    for (const u of state.units) {
      if (u.hp <= 0 || u.ownerId === playerId) continue;
      if (getAllianceId(state, u.ownerId) === getAllianceId(state, playerId)) continue;
      if (isCommanderUnit(state, u)) enemyCommanders.push(u.pos);
    }
    if (enemyCommanders.length === 0) return [];
    const allied = getAllianceId(state, playerId);
    const out = [];
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const tile = state.map.tiles[y][x];
        if (getTileTerrainConfig(tile).key !== "castle") continue;
        if (tile.ownerId !== playerId) continue;
        const d = Math.min(...enemyCommanders.map((e) => Math.abs(e.x - x) + Math.abs(e.y - y)));
        if (d > 8) continue;
        let defended = false;
        for (const u of state.units) {
          if (u.hp <= 0 || getAllianceId(state, u.ownerId) !== allied) continue;
          if (Math.abs(u.pos.x - x) + Math.abs(u.pos.y - y) <= 3) {
            defended = true;
            break;
          }
        }
        if (!defended) out.push({ x, y });
      }
    }
    return out;
  }
  /** 候选中的最优非攻击动作（按叶子+局面修正），攻击被安全否决时的退路。 */
  bestNonAttack(engine, playerId, candidates, leafOf) {
    const state = engine.getState();
    let best = null;
    let bestValue = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i].action;
      if (a.type === "attack") continue;
      const v = leafOf(i) + this.phaseBonus(state, playerId, a);
      if (v > bestValue) {
        bestValue = v;
        best = a;
      }
    }
    return best;
  }
  /** 己方/敌方物质比（ commander 溢价 600，与叶子评估同口径）。 */
  materialRatio(state, playerId) {
    const allied = getAllianceId(state, playerId);
    let myMat = 0;
    let enemyMat = 0;
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      const cost = getUnitCost(state, u.ownerId, u.unitClass) ?? 200;
      const value = cost * (u.hp / 100) + (isCommanderUnit(state, u) ? 600 : 0);
      if (getAllianceId(state, u.ownerId) === allied) myMat += value;
      else enemyMat += value;
    }
    return myMat / Math.max(1, enemyMat);
  }
  /**
   * 局面导向修正（零模拟成本）：劣势不换子+不送（拉开距离）、
   * 开局抢扩张（向无主目标靠拢+占领）、优势压迫不拖延。
   * 返回加到叶子值上的修正分。
   */
  phaseBonus(state, playerId, action) {
    const allied = getAllianceId(state, playerId);
    const enemies = [];
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      if (getAllianceId(state, u.ownerId) !== allied) enemies.push(u.pos);
    }
    const ratio = this.materialRatio(state, playerId);
    const turn = state.turn;
    const behind = ratio < 0.85;
    const ahead = ratio > 1.25;
    switch (action.type) {
      case "attack": {
        const target = state.units.find((u) => u.id === action.targetId);
        if (target && isCommanderUnit(state, target)) {
          const threatened = this.threatenedOwnCastles(state, playerId);
          if (threatened.length > 0) {
            const d = Math.min(...threatened.map((c) => Math.abs(c.x - target.pos.x) + Math.abs(c.y - target.pos.y)));
            if (d <= 8) return 1500;
          }
        }
        if (behind) return -600;
        if (ahead) return 250;
        return 0;
      }
      case "capture": {
        let enemyCount = 0;
        for (const u of state.units) {
          if (u.hp > 0 && getAllianceId(state, u.ownerId) !== allied) enemyCount += 1;
        }
        if (enemyCount <= 3) return 1500;
        return (turn <= 8 ? 500 : 0) + (behind ? 250 : 0);
      }
      case "recruit_to_castle": {
        if (turn <= 3) {
          const commander = state.units.find(
            (u) => u.ownerId === playerId && u.hp > 0 && isCommanderUnit(state, u)
          );
          if (commander && commander.pos.x === action.castlePos.x && commander.pos.y === action.castlePos.y) {
            return -3e3;
          }
        }
      }
      // eslint-disable-next-line no-fallthrough
      case "recruit_and_deploy": {
        const me = state.players.find((p) => p.id === playerId);
        const gold = me?.gold ?? 0;
        const deployBonus = action.type === "recruit_and_deploy" && turn <= 4 ? 300 : 0;
        if (turn <= 2 && gold >= 150) {
          const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
          return 2e3 + Math.max(0, 300 - cost) * 5 + deployBonus;
        }
        if (gold >= 450) {
          const cost = getUnitCost(state, playerId, action.unitClass) ?? 999;
          if (cost >= 400 && cost <= 800) return 350 + deployBonus;
        }
        let myCount = 0;
        let enemyCount = 0;
        for (const u of state.units) {
          if (u.hp <= 0) continue;
          if (getAllianceId(state, u.ownerId) === allied) myCount += 1;
          else enemyCount += 1;
        }
        if (gold >= 250 && (turn <= 10 || ratio < 1.1 && myCount < enemyCount)) {
          return 600 + (behind ? 150 : 0) + deployBonus;
        }
        return behind ? 150 : 0;
      }
      case "wait":
      case "end_turn":
        return ahead ? -400 : 0;
      case "move":
      case "post_attack_move": {
        const unit = state.units.find((u) => u.id === action.unitId);
        if (!unit) return 0;
        if (enemies.length > 0) {
          const threatened = this.threatenedOwnCastles(state, playerId);
          if (threatened.length > 0 && threatened.some((c) => c.x === action.to.x && c.y === action.to.y)) {
            return 1500;
          }
        }
        if (enemies.length === 0) return 0;
        const manhattan = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
        const dBefore = Math.min(...enemies.map((e) => manhattan(unit.pos.x, unit.pos.y, e.x, e.y)));
        const dAfter = Math.min(...enemies.map((e) => manhattan(action.to.x, action.to.y, e.x, e.y)));
        let bonus = 0;
        if (behind) bonus += Math.max(-600, Math.min(600, (dAfter - dBefore) * 150));
        else if (ahead) bonus += Math.max(-400, Math.min(400, (dBefore - dAfter) * 80));
        {
          let alliesNear = 0;
          let enemiesNear = 0;
          for (const u of state.units) {
            if (u.hp <= 0 || u.id === unit.id) continue;
            const d = Math.abs(u.pos.x - action.to.x) + Math.abs(u.pos.y - action.to.y);
            if (d > 3) continue;
            if (getAllianceId(state, u.ownerId) === allied) alliesNear += 1;
            else enemiesNear += 1;
          }
          const abilities = UNIT_CONFIGS[unit.unitClass]?.abilities ?? [];
          const isCapturer = abilities.includes("village_capturer") || abilities.includes("castle_capturer");
          if (enemiesNear > alliesNear + 1) {
            bonus += behind ? -800 : -400;
          } else if (alliesNear === 0 && enemiesNear >= 1 && !isCapturer) {
            bonus += -700;
          } else if (alliesNear >= 2) {
            bonus += 400;
          }
        }
        if (turn <= 8) {
          const abilities = UNIT_CONFIGS[unit.unitClass]?.abilities ?? [];
          if (abilities.includes("village_capturer") || abilities.includes("castle_capturer")) {
            let objBefore = Infinity;
            let objAfter = Infinity;
            for (let y = 0; y < state.map.height; y++) {
              for (let x = 0; x < state.map.width; x++) {
                const tile = state.map.tiles[y][x];
                const key = getTileTerrainConfig(tile).key;
                if (key !== "town" && key !== "castle") continue;
                const owner = tile.ownerId;
                if (owner !== null && getAllianceId(state, owner) === allied) continue;
                if (key === "town" && !abilities.includes("village_capturer")) continue;
                if (key === "castle" && !abilities.includes("castle_capturer")) continue;
                objBefore = Math.min(objBefore, manhattan(unit.pos.x, unit.pos.y, x, y));
                objAfter = Math.min(objAfter, manhattan(action.to.x, action.to.y, x, y));
              }
            }
            if (objBefore !== Infinity) bonus += Math.max(-300, Math.min(300, (objBefore - objAfter) * 60));
          }
        }
        return Math.round(bonus);
      }
      default:
        return 0;
    }
  }
  /**
   * 战术覆盖候选集：heuTop 保底第一位，其余按 capture > 高分 attack >
   * 指挥官招募 > heuristic 顺序填充，上限 topK。拥挤残局也不漏关键招。
   */
  buildTacticalCandidates(pool, ordered, state, playerId) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    const push = (item) => {
      const key = this.actionCode(item.action);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    if (ordered.length === 0) return out;
    push(ordered[0]);
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      if (item.action.type === "capture") push(item);
    }
    let attacks = 0;
    for (const item of ordered) {
      if (out.length >= this.topK || attacks >= 3) break;
      if (item.action.type === "attack") {
        push(item);
        attacks += 1;
      }
    }
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      const a = item.action;
      if ((a.type === "recruit_to_castle" || a.type === "recruit_and_deploy") && a.unitClass === "commander") {
        push(item);
      }
    }
    {
      const turn = state.turn;
      if (turn <= 4) {
        let cheapest = null;
        let cheapestCost = Infinity;
        for (const item of ordered) {
          const a = item.action;
          if (a.type !== "recruit_to_castle" && a.type !== "recruit_and_deploy") continue;
          const cost = getUnitCost(state, playerId, a.unitClass) ?? Infinity;
          if (cost < cheapestCost || cost === cheapestCost && cheapest !== null && item.score > cheapest.score) {
            cheapestCost = cost;
            cheapest = item;
          }
        }
        if (cheapest && out.length < this.topK) push(cheapest);
      } else {
        for (const item of ordered) {
          if (out.length >= this.topK) break;
          const a = item.action;
          if (a.type === "recruit_to_castle" || a.type === "recruit_and_deploy") {
            push(item);
            break;
          }
        }
      }
    }
    for (const item of ordered) {
      if (out.length >= this.topK) break;
      push(item);
    }
    void pool;
    return out;
  }
  getStats() {
    return { ...this.stats };
  }
  resetStats() {
    this.stats = { decisions: 0, urgentHits: 0, forcedWins: 0, takeovers: 0, vetos: 0, follows: 0 };
  }
  /** A阶段便宜叶子：只模拟1步、直接叶子评估（无连动展开、无对手探测）。 */
  cheapLeafOf(engine, playerId, action) {
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump("catchCheapLeafStep");
      return -99999;
    }
    return this.evaluateLeaf(sim.getState(), playerId);
  }
  evaluateCandidate(engine, playerId, action) {
    const sim = this.cloneEngine(engine);
    try {
      this.stepEngine(sim, action);
    } catch {
      this.bump("catchEvaluateStep");
      return -99999;
    }
    if (sim.getState().winner !== null) {
      return this.evaluateLeaf(sim.getState(), playerId);
    }
    for (let i = 0; i < this.friendlyRolloutSteps; i++) {
      if (sim.getState().winner !== null) break;
      if (sim.getState().currentPlayer !== playerId) break;
      let follow;
      try {
        const legal = sim.getLegalActions(playerId).filter((a) => a.type !== "surrender");
        if (legal.length === 0) break;
        const nonEnd = legal.filter((a) => a.type !== "end_turn");
        if (nonEnd.length === 0) break;
        follow = this.chooseWithHeuristic(sim, playerId, nonEnd);
        if (follow.type === "end_turn") break;
      } catch {
        this.bump("catchEvaluateLegal");
        this.bump("getLegalActionsFailures");
        break;
      }
      try {
        this.stepEngine(sim, follow);
      } catch {
        this.bump("catchEvaluateRolloutStep");
        break;
      }
    }
    const after = sim.getState();
    if (after.winner !== null) {
      return this.evaluateLeaf(after, playerId);
    }
    if (after.currentPlayer === playerId) {
      return this.evaluateLeaf(after, playerId);
    }
    if (after.currentPlayer === playerId) {
      return this.evaluateLeaf(after, playerId);
    }
    const probed = this.probeOpponentFocusFire(sim, playerId, after.currentPlayer);
    if (this.materialRatio(after, playerId) < 1) {
      return probed - this.repositionCrowdPenalty(after, playerId);
    }
    return probed;
  }
  /** 动作归属单位（pending 过滤用；招募/终局动作返回 null）。 */
  getActionUnitId(action) {
    switch (action.type) {
      case "move":
      case "capture":
      case "repair":
      case "wait":
      case "destroy_town":
      case "post_attack_move":
        return action.unitId;
      case "attack":
        return action.attackerId;
      case "heal":
        return action.healerId;
      case "support":
        return action.supporterId;
      case "summon":
        return action.summonerId;
      default:
        return null;
    }
  }
  /**
   * 走位进人堆罚分：每个可被≥2个敌人（ present 站位或一动可达站位）纳入射程的我方单位，
   * 罚 700（指挥官 2500）。只在劣势时启用；顺风时接触战正常，不罚。
   */
  repositionCrowdPenalty(state, rootId) {
    const allied = getAllianceId(state, rootId);
    const mine = state.units.filter((u) => u.hp > 0 && getAllianceId(state, u.ownerId) === allied);
    if (mine.length === 0) return 0;
    const enemies = state.units.filter((u) => u.hp > 0 && getAllianceId(state, u.ownerId) !== allied).slice(0, 10);
    if (enemies.length === 0) return 0;
    const reachCache = /* @__PURE__ */ new Map();
    const reachOf = (enemyId) => {
      const cached = reachCache.get(enemyId);
      if (cached) return cached;
      let r = [];
      try {
        r = getReachablePositions(state, enemyId).slice(0, 20);
      } catch {
        this.bump("catchRepositionReach");
        r = [];
      }
      reachCache.set(enemyId, r);
      return r;
    };
    let penalty = 0;
    for (const m of mine) {
      let threateners = 0;
      for (const e of enemies) {
        const stats = getEffectiveStats(e);
        if (inRange(e.pos, m.pos, stats.minRange, stats.maxRange)) {
          threateners += 1;
        } else {
          const reach = reachOf(e.id);
          for (const dest of reach) {
            if (inRange(dest, m.pos, stats.minRange, stats.maxRange)) {
              threateners += 1;
              break;
            }
          }
        }
        if (threateners >= 2) break;
      }
      if (threateners >= 2) {
        penalty += isCommanderUnit(state, m) ? 2500 : 700;
      }
    }
    return penalty;
  }
  /** 无需模拟的静态攻击威胁分（杀招重奖，与 heuristic 击杀观一致）。 */
  staticAttackScore(state, attackerId, targetId) {
    const attacker = state.units.find((u) => u.id === attackerId);
    const target = state.units.find((u) => u.id === targetId);
    if (!attacker || !target || attacker.hp <= 0 || target.hp <= 0) return -Infinity;
    let dmg;
    try {
      dmg = Math.min(target.hp, calculateDamage(state, attackerId, targetId));
    } catch {
      this.bump("catchStaticAttackDamage");
      return -Infinity;
    }
    if (dmg <= 0) return -Infinity;
    const tVal = getUnitCost(state, target.ownerId, target.unitClass) ?? 200;
    const kill = dmg >= target.hp;
    let score = kill ? 12e3 + tVal * 6 : dmg * 25 + tVal * dmg / Math.max(1, target.hp);
    if (isCommanderUnit(state, target)) score += kill ? 18e3 : 4500;
    return score;
  }
  /**
   * 对手贪心集火线：每步取静态最危险攻击模拟，最深 oppDepth 步，
   * 全程取最坏叶子。能看穿“两下打死 u_11、三下打死 u_2”这类围殴。
   */
  probeOpponentFocusFire(sim, rootId, oppId) {
    const probe = this.cloneEngine(sim);
    let worst = this.evaluateLeaf(probe.getState(), rootId);
    for (let d = 0; d < this.oppDepth; d++) {
      const st = probe.getState();
      if (st.winner !== null || st.currentPlayer !== oppId) break;
      let actions;
      try {
        actions = probe.getLegalActions(oppId);
      } catch {
        this.bump("catchProbeLegal");
        this.bump("getLegalActionsFailures");
        break;
      }
      let best = null;
      let bestScore = -Infinity;
      for (const a of actions) {
        if (a.type !== "attack") continue;
        const s = this.staticAttackScore(st, a.attackerId, a.targetId);
        if (s > bestScore) {
          bestScore = s;
          best = a;
        }
      }
      if (!best || bestScore === -Infinity) break;
      try {
        this.stepEngine(probe, best);
      } catch {
        this.bump("catchProbeStep");
        break;
      }
      const leaf = this.evaluateLeaf(probe.getState(), rootId);
      if (leaf < worst) worst = leaf;
      if (worst <= -9e4) break;
    }
    return worst;
  }
  actionCode(action) {
    return encodeAction(action);
  }
};

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/ai_training/v17/teachers/b100_policy.ts
var B100_TEACHER_VERSION = "b100-v11-34bf5829";
var B100_V11_CONFIG = {
  topK: 6,
  oppDepth: 3,
  friendlyRolloutSteps: 1,
  takeoverThreshold: 350,
  vetoMargin: 300,
  dangerLine: -800,
  searchStartTurn: 1,
  allowSurrender: false,
  earlyAttackTakeoverGate: 1500,
  pendingFirst: true,
  twoStage: true,
  tacticalCandidates: true,
  attackSafetyCheck: true,
  favorableTradeAllowed: true,
  phaseBonusProfile: "b100-v11-source-phaseBonus-verbatim"
};
var B100_CONSTRUCTOR_FIELDS = [
  "topK",
  "oppDepth",
  "friendlyRolloutSteps",
  "takeoverThreshold",
  "vetoMargin",
  "dangerLine",
  "searchStartTurn",
  "allowSurrender"
];
var B100_FROZEN_SOURCE_FIELDS = [
  "earlyAttackTakeoverGate",
  "pendingFirst",
  "twoStage",
  "tacticalCandidates",
  "attackSafetyCheck",
  "favorableTradeAllowed",
  "phaseBonusProfile"
];
function resolveB100Config(overrides) {
  const resolved = { ...B100_V11_CONFIG };
  if (!overrides) return resolved;
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (value === void 0) continue;
    if (B100_FROZEN_SOURCE_FIELDS.includes(key)) {
      if (value !== B100_V11_CONFIG[key]) {
        throw new Error(
          `[B100] '${String(key)}' \u662F\u6E90\u7801\u786C\u7F16\u7801\u89C4\u5219\uFF08\u4E0D\u662F\u6784\u9020\u5668\u9009\u9879\uFF09\uFF0C\u51BB\u7ED3\u503C\u4E3A ${JSON.stringify(B100_V11_CONFIG[key])}\uFF1B\u8BF7\u6C42\u8986\u76D6\u4E3A ${JSON.stringify(value)} \u88AB\u62D2\u7EDD\u3002\u8981\u6539\u5B83\u5FC5\u987B\u6539\u6559\u5E08\u4EE3\u7801\u5E76\u6362 teacherVersion\u3002`
        );
      }
      continue;
    }
    if (!B100_CONSTRUCTOR_FIELDS.includes(key)) {
      throw new Error(`[B100] \u672A\u77E5\u914D\u7F6E\u5B57\u6BB5 '${String(key)}'\u3002`);
    }
    resolved[key] = value;
  }
  return resolved;
}
function deriveRngSeedR(teacherVersion, rootSeed, seat) {
  const material = `B100-R${teacherVersion}:${rootSeed}:${seat}`;
  return (0, import_node_crypto2.createHash)("sha256").update(material, "utf8").digest().readUInt32BE(0);
}
function deriveRngSeedQ(teacherVersion, queryKey, querySeed) {
  const material = `B100-Q${teacherVersion}:${queryKey}:${querySeed}`;
  return (0, import_node_crypto2.createHash)("sha256").update(material, "utf8").digest().readUInt32BE(0);
}
function b100StateFallbackKey(state, allowed) {
  const roundTripped = JSON.parse(JSON.stringify(state));
  const codes = allowed.map((a) => encodeAction(a)).sort();
  return `state:${(0, import_node_crypto2.createHash)("sha256").update(`${canonicalStateJson(roundTripped)}|${codes.join("\n")}`, "utf8").digest("hex")}`;
}
function makeCountingRng(initialState) {
  const base = mulberryStateful(initialState >>> 0);
  let calls = 0;
  const wrapper = (() => {
    calls += 1;
    return base();
  });
  wrapper.getState = () => base.getState();
  wrapper.setState = (state) => {
    base.setState(state);
  };
  return { fn: wrapper, calls: () => calls, resetCalls: () => {
    calls = 0;
  } };
}
function buildTeacherOptions(config) {
  const options = { instrument: true };
  for (const field of B100_CONSTRUCTOR_FIELDS) options[field] = config[field];
  return options;
}
function createB100Policy(options) {
  const variant = options.variant;
  if (variant !== "B100-R" && variant !== "B100-Q") {
    throw new Error(`[B100] \u672A\u77E5 variant '${String(variant)}'\uFF08\u53EA\u63A5\u53D7 'B100-R' | 'B100-Q'\uFF09\u3002`);
  }
  const teacherVersion = options.teacherVersion ?? B100_TEACHER_VERSION;
  const config = resolveB100Config(options.config);
  const querySeed = options.querySeed ?? 0;
  const decisions = [];
  let exceptions = 0;
  let decisionIndex = 0;
  const teacherOptions = buildTeacherOptions(config);
  let rCounter = null;
  let rTeacher = null;
  if (variant === "B100-R") {
    const initial = options.rngInitialState !== void 0 ? options.rngInitialState >>> 0 : deriveRngSeedR(teacherVersion, options.rootSeed, options.seat);
    rCounter = makeCountingRng(initial);
    rTeacher = new BattleSearchAI(rCounter.fn, teacherOptions);
  }
  const resolveQueryKey = (state, playerId, allowed) => {
    if (variant === "B100-Q" && options.queryKeyOverride !== void 0) {
      return { kind: "policy-input-key", key: options.queryKeyOverride };
    }
    if (options.inputKeyProvider) {
      try {
        const provided = options.inputKeyProvider(state, playerId, allowed);
        if (typeof provided === "string" && provided.length > 0) {
          return { kind: "policy-input-key", key: provided };
        }
        if (provided !== null && provided !== void 0) {
          throw new Error(`[B100] inputKeyProvider \u8FD4\u56DE\u4E86\u975E\u5B57\u7B26\u4E32\u975E null \u7684\u503C\uFF1A${JSON.stringify(provided)}`);
        }
      } catch (error) {
        exceptions += 1;
        console.warn(`[B100] inputKeyProvider \u629B\u9519\uFF0C\u56DE\u9000 state-fallback\uFF1A${error.message}`);
      }
    }
    return { kind: "state-fallback", key: b100StateFallbackKey(state, allowed) };
  };
  const policy2 = (context) => {
    const startedAt = Date.now();
    if (context.seat !== options.seat) {
      throw new Error(
        `[B100] \u5EA7\u4F4D\u4E0D\u4E00\u81F4\uFF1Ahandle.seat=${options.seat}\uFF0Ccontext.seat=${context.seat}\uFF1B\u62D2\u7EDD\u5728\u540C\u4E00\u5B9E\u4F8B\u4E0A\u6DF7\u7528\u4E24\u4E2A\u5EA7\u4F4D\uFF08\u4F1A\u6C61\u67D3\u9010\u5C40\u968F\u673A\u6D41\uFF09\u3002`
      );
    }
    const allowed = Array.from(context.allowed);
    const state = context.state;
    const playerId = context.playerId;
    const { kind: queryKeyKind, key: queryKey } = resolveQueryKey(state, playerId, allowed);
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)));
    const instBefore = variant === "B100-R" ? rTeacher.getInstrumentation() : createB100Instrumentation();
    let teacher;
    let rng = null;
    if (variant === "B100-R") {
      teacher = rTeacher;
      rng = rCounter;
      rng?.resetCalls();
    } else {
      const seed = deriveRngSeedQ(teacherVersion, queryKey, querySeed);
      rng = makeCountingRng(seed);
      teacher = new BattleSearchAI(rng.fn, teacherOptions);
    }
    const rngBefore = variant === "B100-R" && rng ? rng.fn.getState() : null;
    let action;
    let thrown = null;
    try {
      action = teacher.getAction(engine, playerId, allowed);
    } catch (error) {
      thrown = error;
      action = { type: "end_turn" };
    }
    const rngAfter = variant === "B100-R" && rng ? rng.fn.getState() : null;
    const instAfter = teacher.getInstrumentation();
    const instDelta = variant === "B100-R" ? b100InstrumentationDelta(instBefore, instAfter) : instAfter;
    const decisionExceptions = b100ExceptionTotal(instDelta);
    exceptions += decisionExceptions;
    const chosenActionCode = encodeAction(action);
    const chosenInAllowed = thrown === null && allowed.some((a) => encodeAction(a) === chosenActionCode);
    const diag = teacher.getLastDecisionDiagnostics();
    const record = {
      decisionIndex,
      turn: typeof state.turn === "number" ? state.turn : -1,
      playerId,
      allowedCount: allowed.length,
      chosenActionCode,
      chosenInAllowed,
      rngBeforeHex: variant === "B100-R" && rngBefore !== null ? rngStateHex(rngBefore) : null,
      rngAfterHex: variant === "B100-R" && rngAfter !== null ? rngStateHex(rngAfter) : null,
      rngCalls: variant === "B100-R" && rng ? rng.calls() : null,
      queryKeyKind,
      queryKey,
      querySeed: variant === "B100-Q" ? querySeed : null,
      internalExceptions: decisionExceptions,
      cloneCount: instDelta.cloneCount,
      stepCount: instDelta.stepCount,
      fired: {
        urgent: diag.fired.urgent,
        forcedWin: diag.fired.forcedWin,
        takeover: diag.fired.takeover,
        veto: diag.fired.veto,
        follow: diag.fired.follow
      },
      elapsedMs: Date.now() - startedAt
    };
    decisionIndex += 1;
    decisions.push(record);
    if (options.onDecision) options.onDecision(record);
    if (thrown !== null) {
      throw new Error(
        `[B100] ${variant} \u51B3\u7B56\u629B\u9519\uFF08decisionIndex=${record.decisionIndex}\uFF0Cturn=${record.turn}\uFF0CplayerId=${playerId}\uFF09\uFF1A${thrown?.message ?? String(thrown)}`
      );
    }
    if (!chosenInAllowed) {
      throw new Error(
        `[B100] ${variant} \u8FD4\u56DE\u7684\u52A8\u4F5C\u4E0D\u5728\u5F15\u64CE\u539F\u751F\u5408\u6CD5\u96C6\u5185\uFF1Achosen='${chosenActionCode}'\uFF0CallowedCount=${allowed.length}\u3002\u6309\u5408\u540C\u8BB0 chosenInAllowed=false \u5E76\u629B\u9519\uFF0C\u4E0D\u505A H0 \u56DE\u9000\u3002`
      );
    }
    return action;
  };
  return {
    policy: policy2,
    variant,
    teacherVersion,
    config,
    decisions,
    get exceptions() {
      return exceptions;
    },
    rngStateHex() {
      if (variant !== "B100-R" || !rCounter) return null;
      return rngStateHex(rCounter.fn.getState());
    },
    resetRng(state) {
      if (variant !== "B100-R" || !rCounter) {
        throw new Error("[B100] resetRng \u53EA\u5BF9 B100-R \u6709\u6548\u3002");
      }
      if (!Number.isInteger(state) || state < 0 || state > 4294967295) {
        throw new Error(`[B100] resetRng \u9700\u8981 uint32\uFF0C\u5B9E\u9645 ${String(state)}\u3002`);
      }
      rCounter.fn.setState(state >>> 0);
    }
  };
}

// ai_training/r8_pure_policy_stage_20261014_125300/research/policy.ts
function policy(cfg, seed, seat) {
  const rng = new RNG(seed);
  let handle;
  const weights = cfg.model ? loadSpatialResNetFromJson(import_node_fs2.default.readFileSync(cfg.model, "utf8")) : null;
  const predictor = weights ? new SpatialResNetPredictor(weights) : null;
  const ai = new HeuristicAI(rng.next);
  if (cfg.type === "b100") handle = createB100Policy({ variant: cfg.variant, rootSeed: seed, querySeed: seed, seat });
  const act = (state, legal) => {
    if (cfg.type === "hang") {
      while (true) {
      }
      ;
    }
    if (cfg.type === "slow") {
      const end = Date.now() + 2e3;
      while (Date.now() < end) {
      }
      ;
    }
    if (cfg.type === "illegal") return { type: "move", unitId: "\u4E0D\u5B58\u5728", to: { x: -999, y: -999 } };
    if (cfg.type === "mutate") {
      state.players[0].gold = 999999;
      legal.splice(0, legal.length, { type: "move", unitId: "\u4F2A\u9020", to: { x: -1, y: -1 } });
      return legal[0];
    }
    if (cfg.type === "surrender") return legal.find((x) => x.type === "surrender");
    if (cfg.type === "nan") throw Error("\u975E\u6709\u9650logits");
    if (cfg.type === "b100") return handle.policy({ state, playerId: seat, allowed: legal, seat, seed });
    if (predictor) {
      const channels = weights.stem.inChannels;
      const enc = encodeGameStateSpatial(state, seat, "v2", { channels });
      const feats = encodeCandidateActionsSpatialForSchema(state, seat, legal, "v2", channels === 26 ? "spatial26_global20_actionSemantics53_v15" : ENCODER_SCHEMA_ID_V19);
      const pred = predictor.predict(enc, feats);
      if (pred.actionLogits.length !== legal.length || pred.actionLogits.some((x) => !Number.isFinite(x)) || !Number.isFinite(pred.value)) throw Error("\u975E\u6709\u9650\u6216\u957F\u5EA6\u4E0D\u5339\u914Dlogits");
      let best = 0;
      for (let i = 1; i < legal.length; i++) if (pred.actionLogits[i] > pred.actionLogits[best]) best = i;
      return legal[best];
    }
    return ai.getAction(new GameEngine(state), seat, legal);
  };
  return { act, rng, diagnostics: () => handle ? { decision: handle.decisions.at(-1), exceptions: handle.exceptions, config: handle.config, rng: handle.rngStateHex() } : null };
}

// ai_training/r12_first_disagreement_20261015_034900/worker.ts
process.once("message", (cfg) => {
  const send = (x) => process.send?.(x);
  let steps = 0;
  try {
    const e = new GameEngine(structuredClone(cfg.initialState)), student = policy({ type: "model", model: cfg.candidate.model }, 1, cfg.candidateSeat), teacher = policy({ type: "heuristic" }, cfg.teacherSeed, cfg.candidateSeat), opp = policy({ type: "heuristic" }, 1, 1 - cfg.candidateSeat);
    Object.assign(opp.rng, cfg.opponentRng);
    if (cfg.teacherRng) Object.assign(teacher.rng, cfg.teacherRng);
    let handoffs = cfg.initialHandoffs ?? 0, returnedStudentDecisions = cfg.initialReturnedStudentDecisions ?? 0, teacherDecisions = cfg.initialTeacherDecisions ?? 0;
    send({ type: "ready", initialState: e.getState(), initialStateHash: hash(e.getState()), modelSha256: fileHash(cfg.candidate.model), opponentRng: opp.rng.snapshot(), teacherRng: teacher.rng.snapshot() });
    while (!e.isTerminal() && steps < cfg.maxSteps) {
      const state = e.getState(), player = state.currentPlayer, le = e.getLegalActions(player), role = player !== cfg.candidateSeat ? "opponent" : handoffs < cfg.referenceHandoffs ? "teacher" : "student";
      send({ type: "decision", step: steps, player });
      const before = hash(state), rngBefore = opp.rng.snapshot(), teacherRngBefore = teacher.rng.snapshot(), action = (role === "opponent" ? opp : role === "teacher" ? teacher : student).act(structuredClone(state), structuredClone(le));
      if (role === "student") returnedStudentDecisions++;
      if (role === "teacher") teacherDecisions++;
      const ih = steps % 25 === 0 ? inputHash(features(state, le)) : null;
      const result = strictStep(e, le, action);
      if (e.getState().currentPlayer !== player) handoffs++;
      send({ type: "step", step: steps, player, role, action, actionCode: encodeAction(action), legalCodes: le.map(encodeAction), beforeHash: before, afterHash: hash(e.getState()), reward: result.reward, done: result.done, info: result.info, rngBefore, rngAfter: opp.rng.snapshot(), teacherRngBefore, teacherRngAfter: teacher.rng.snapshot(), handoffs, inputHash: ih });
      steps++;
    }
    const winner = e.getWinner();
    send({ type: "result", steps, winner, outcome: !e.isTerminal() ? "step_truncated" : winner === cfg.candidateSeat ? "natural_win" : winner === -1 ? "rule_draw" : "natural_loss", finalStateHash: hash(e.getState()), returnedStudentDecisions, teacherDecisions, handoffs });
  } catch (e) {
    send({ type: "result", outcome: "error", steps, error: e.stack });
  }
  setTimeout(() => process.exit(0), 10);
});
