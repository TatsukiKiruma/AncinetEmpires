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

// ai_training/r11_onpolicy_multifamily_20261015_030800/audit_onpolicy.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_zlib = require("node:zlib");

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
  const player = state.players.find((p2) => p2.id === playerId);
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
    const deathCount = state.players.find((p2) => p2.id === playerId)?.commanderDeathCount ?? 0;
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
  const player = state.players.find((p2) => p2.id === playerId);
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
      const player = this.state.players.find((p2) => p2.id === unit.ownerId);
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
    const nextPlayer = this.state.players.find((p2) => p2.id === playerId);
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
        const player = this.state.players.find((p2) => p2.id === this.state.currentPlayer);
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
        const player = this.state.players.find((p2) => p2.id === this.state.currentPlayer);
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
        const player = this.state.players.find((p2) => p2.id === this.state.currentPlayer);
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
    const alivePlayers = this.state.players.filter((p2) => isActivePlayer(this.state, p2.id));
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
  const player = state.players.find((p2) => p2.id === playerId);
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
  const enemies = state.players.filter((p2) => p2.id !== playerId && areEnemyPlayers(state, playerId, p2.id));
  const ownPlayer = state.players.find((p2) => p2.id === playerId);
  const ownGold = ownPlayer?.gold ?? 0;
  const bestEnemyGold = enemies.length ? Math.max(...enemies.map((p2) => p2.gold)) : 0;
  const ownArmy = calculateArmyValue(state, playerId);
  const enemyArmy = enemies.length ? Math.max(...enemies.map((p2) => calculateArmyValue(state, p2.id))) : 0;
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
    const ownPlayer = state.players.find((p2) => p2.id === playerId);
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
    return base.map((features2) => ({
      ...features2,
      semantics: features2.semantics.length === semanticDim ? features2.semantics : Float32Array.from(features2.semantics).slice(0, semanticDim)
    }));
  }
  if (version !== "v2") throw new Error("Path-3 schema \u53EA\u652F\u6301 v2 \u7F16\u7801");
  const relations = encodePathRelations(state, playerId, actions);
  return base.map((features2, index) => {
    const semantics = new Float32Array(ACTION_SEMANTIC_DIM_PATH3);
    semantics.set(features2.semantics);
    const relation = relations[index];
    semantics[53] = relation.reachableCapturableBuilding;
    semantics[54] = relation.normalizedNearestCapturableCost;
    semantics[55] = relation.normalizedCapturableCostReduction;
    return { ...features2, semantics };
  });
}

// ai_training/r8_pure_policy_stage_20261014_125300/research/common.ts
var MAPS = ["Duel", "Liberty Port", "Swamplands", "The Crossing", "Icy Paths", "Peak Island", "Crossed swords"].map((x) => `(2) ${x}.aem`);
var canonical = (v) => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
var hash = (v) => import_node_crypto.default.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(canonical(v))).digest("hex");
var fileHash = (p2) => import_node_crypto.default.createHash("sha256").update(import_node_fs.default.readFileSync(p2)).digest("hex");
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

// ai_training/r11_onpolicy_multifamily_20261015_030800/audit_onpolicy.ts
var o = import_node_path.default.dirname(process.argv[1]);
var p = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "protocol.json"), "utf8"));
var roots = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "visited_roots.json"), "utf8")).rows;
var branches = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "branch_results.json"), "utf8")).rows;
var all = [];
var cache = /* @__PURE__ */ new Map();
var transitions = 0;
var probes = 0;
function replay(stem, scope) {
  const r = JSON.parse(import_node_fs2.default.readFileSync(stem + ".json", "utf8")), ev = import_node_fs2.default.readFileSync(stem + ".jsonl", "utf8").trim().split("\n").map(JSON.parse), ready = ev.find((x) => x.type === "ready"), e = new GameEngine(ready.initialState), signature = [];
  import_strict.default.equal(hash(e.getState()), r.initialStateHash);
  if (r.candidate?.type === "model") {
    import_strict.default.equal(ready.modelSha256, p.parentSha256);
    import_strict.default.equal(r.loadedModelSha256, p.parentSha256);
  }
  if (r.opponentRng) import_strict.default.deepEqual(ready.opponentRng, r.opponentRng);
  if (r.teacherRng) import_strict.default.deepEqual(ready.teacherRng, r.teacherRng);
  else if (r.referenceHandoffs !== void 0) import_strict.default.deepEqual(ready.teacherRng, { state: r.teacherSeed >>> 0, calls: 0 });
  let h = r.initialHandoffs ?? 0, students = 0, teachers = 0, opp = ready.opponentRng, teacher = ready.teacherRng;
  const steps = ev.filter((x) => x.type === "step");
  import_strict.default.equal(steps.length, r.steps);
  for (const t of steps) {
    const state = e.getState(), le = e.getLegalActions(state.currentPlayer);
    import_strict.default.equal(state.currentPlayer, t.player);
    import_strict.default.equal(hash(state), t.beforeHash);
    import_strict.default.deepEqual(le.map(encodeAction), t.legalCodes);
    if (t.role) {
      const role = t.player !== r.candidateSeat ? "opponent" : h < r.referenceHandoffs ? "teacher" : "student";
      import_strict.default.equal(t.role, role);
      import_strict.default.deepEqual(t.rngBefore, opp);
      import_strict.default.deepEqual(t.teacherRngBefore, teacher);
      if (role !== "opponent") import_strict.default.deepEqual(t.rngBefore, t.rngAfter);
      if (role !== "teacher") import_strict.default.deepEqual(t.teacherRngBefore, t.teacherRngAfter);
      students += Number(role === "student");
      teachers += Number(role === "teacher");
      opp = t.rngAfter;
      teacher = t.teacherRngAfter;
    }
    if (t.inputHash && (t.role || t.step % 50 === 0)) {
      import_strict.default.equal(inputHash(features(state, le)), t.inputHash);
      probes++;
    }
    const result = strictStep(e, le, t.action);
    import_strict.default.equal(result.reward, t.reward);
    import_strict.default.equal(result.done, t.done);
    import_strict.default.equal(result.info, t.info);
    import_strict.default.equal(hash(e.getState()), t.afterHash);
    if (e.getState().currentPlayer !== t.player) h++;
    if (t.role) import_strict.default.equal(t.handoffs, h);
    signature.push(t.beforeHash + "|" + t.actionCode + "|" + t.afterHash);
    transitions++;
  }
  import_strict.default.equal(hash(e.getState()), r.finalStateHash);
  if (r.outcome.startsWith("natural_")) {
    (0, import_strict.default)(e.isTerminal());
    import_strict.default.equal(e.getWinner(), r.winner);
    import_strict.default.equal(r.outcome, r.winner === r.candidateSeat ? "natural_win" : "natural_loss");
  }
  if (r.outcome === "step_truncated") (0, import_strict.default)(!e.isTerminal());
  if (r.returnedStudentDecisions !== void 0) import_strict.default.equal(r.returnedStudentDecisions, students + (r.initialReturnedStudentDecisions ?? 0));
  if (r.teacherDecisions !== void 0) import_strict.default.equal(r.teacherDecisions, teachers + (r.initialTeacherDecisions ?? 0));
  const row = { scope, caseIndex: r.caseIndex, familyId: r.familyId, referenceHandoffs: r.referenceHandoffs, outcome: r.outcome, steps: r.steps, rootStep: r.rootStep, returnedStudentDecisions: students + (r.initialReturnedStudentDecisions ?? 0), teacherDecisions: teachers + (r.initialTeacherDecisions ?? 0), trajectoryHash: hash(signature), initialStateHash: r.initialStateHash, finalStateHash: r.finalStateHash, wallSeconds: r.elapsedWallSeconds, observedWinnerAtCut: e.isTerminal() ? e.getWinner() : null };
  all.push(row);
  cache.set(import_node_path.default.resolve(stem).toLowerCase(), { r, ready, endState: e.getState(), last: steps.at(-1), row, signature });
  return row;
}
var originals = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "original_results.json"), "utf8")).rows;
for (const r of originals) replay(import_node_path.default.join(o, "original", `game_${r.gameIndex}`), "original_student_training_only");
for (const r of branches) {
  const root = roots.find((x) => x.caseIndex === r.caseIndex);
  import_strict.default.equal(r.initialStateHash, hash(root.state));
  const row = replay(import_node_path.default.join(o, "branches", `case_${r.caseIndex}_h${r.referenceHandoffs}`), "registered_finite_rollin");
  const expected = r.outcome === "natural_win" && row.returnedStudentDecisions > 0 && row.teacherDecisions > 0;
  import_strict.default.equal(r.eligibleTerminalImprovement, expected);
  import_strict.default.equal(root.originalOutcome, "natural_loss");
}
for (const file of import_node_fs2.default.readdirSync(import_node_path.default.join(o, "controls")).filter((x) => x.endsWith(".json"))) replay(import_node_path.default.join(o, "controls", file.slice(0, -5)), "operational_or_timing_control");
var extended = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "censoring_continuation_results.json"), "utf8")).rows;
for (const r of extended) {
  const old = cache.get(import_node_path.default.resolve(r.originalTrace.slice(0, -6)).toLowerCase());
  (0, import_strict.default)(old);
  import_strict.default.equal(hash(old.endState), r.initialStateHash);
  import_strict.default.deepEqual(r.opponentRng, old.last.rngAfter);
  import_strict.default.deepEqual(r.teacherRng, old.last.teacherRngAfter);
  import_strict.default.equal(r.initialHandoffs, old.last.handoffs);
  import_strict.default.equal(r.initialReturnedStudentDecisions, old.row.returnedStudentDecisions);
  import_strict.default.equal(r.initialTeacherDecisions, old.row.teacherDecisions);
  (0, import_strict.default)(r.initialHandoffs >= r.referenceHandoffs);
  const row = replay(import_node_path.default.join(o, "continued", r.id), "extended_censoring_diagnostic");
  import_strict.default.equal(row.teacherDecisions, r.initialTeacherDecisions);
  import_strict.default.equal(r.combinedSteps, r.priorSteps + r.steps);
  (0, import_strict.default)(r.combinedSteps <= old.r.maxSteps);
}
var positive = branches.filter((r) => r.eligibleTerminalImprovement);
var families = [...new Set(positive.map((r) => r.familyId))];
var maps = [...new Set(positive.map((r) => r.mapName))];
var seats = [...new Set(positive.map((r) => r.candidateSeat))];
var gate = families.length >= p.minimumImprovedFamilies && maps.length >= p.minimumMaps && seats.length >= p.minimumSeats;
var course = [];
var seen = /* @__PURE__ */ new Map();
for (const r of positive) {
  const stem = import_node_path.default.join(o, "branches", `case_${r.caseIndex}_h${r.referenceHandoffs}`), ev = import_node_fs2.default.readFileSync(stem + ".jsonl", "utf8").trim().split("\n").map(JSON.parse), e = new GameEngine(ev.find((x) => x.type === "ready").initialState);
  for (const t of ev.filter((x) => x.type === "step")) {
    const state = e.getState(), le = e.getLegalActions(state.currentPlayer);
    if (state.currentPlayer === r.candidateSeat) {
      const f = features(state, le), ih = inputHash(f), sh = hash(state);
      if (!seen.has(ih)) seen.set(ih, /* @__PURE__ */ new Set());
      seen.get(ih).add(sh);
      course.push({ ...f, stateJson: structuredClone(state), stateHash: sh, inputHash: ih, actionCodes: le.map(encodeAction), targetActionIndex: le.map(encodeAction).indexOf(t.actionCode), familyId: r.familyId, caseIndex: r.caseIndex, playerId: r.candidateSeat, role: t.role, stepIndex: r.rootStep + t.step, sourceProtocol: "registered60s finite teacher then actual student natural win", notTrained: true });
    }
    strictStep(e, le, t.action);
  }
}
var aliases = [...seen].filter(([k, v]) => v.size > 1).map(([inputHash2, s]) => ({ inputHash: inputHash2, fullStates: s.size }));
verifyOrWrite(import_node_path.default.join(o, "registered_candidate_courses.jsonl.gz"), (0, import_node_zlib.gzipSync)(course.map((s) => JSON.stringify(s)).join("\n") + "\n"));
var protectedFiles = JSON.parse(import_node_fs2.default.readFileSync("ai_training/r9_decision_chain_stage_20261014_225400/protection_before.json", "utf8"));
for (const x of protectedFiles) import_strict.default.equal(fileHash(x.path), x.sha256);
import_strict.default.equal(fileHash(p.parentModel), p.parentSha256);
var dataGate = { passed: gate, requiredFamilies: p.minimumImprovedFamilies, observedFamilies: families.length, requiredMaps: p.minimumMaps, observedMaps: maps.length, requiredSeats: p.minimumSeats, observedSeats: seats.length, families, maps, seats, courseRows: course.length, uniqueInputs: seen.size, aliases, trainingStarted: false, reason: gate ? "Family threshold met; separate data isolation still required" : "Below preregistered family/map/seat gate; no training; diagnostic extensions cannot change registered gate" };
verifyOrWrite(import_node_path.default.join(o, "data_gate.json"), JSON.stringify(dataGate, null, 2));
verifyOrWrite(import_node_path.default.join(o, "replay_audit.json"), JSON.stringify({ passed: true, episodeOrSegmentCount: all.length, transitions, inputHashProbes: probes, protectedFiles: protectedFiles.length, continuationBoundariesExact: true, noExtraAtomicBudget: true, rows: all }, null, 2));
console.log({ episodesAndSegments: all.length, transitions, probes, dataGate });
function verifyOrWrite(p2, b) {
  const buffer = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (import_node_fs2.default.existsSync(p2)) import_strict.default.deepEqual(import_node_fs2.default.readFileSync(p2), buffer);
  else import_node_fs2.default.writeFileSync(p2, buffer, { flag: "wx" });
}
