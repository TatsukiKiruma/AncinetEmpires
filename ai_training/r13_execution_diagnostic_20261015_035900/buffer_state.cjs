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

// ai_training/r13_execution_diagnostic_20261015_035900/buffer_state.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_strict = __toESM(require("node:assert/strict"), 1);

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
function getApkTerrainValue(tile, field) {
  if (tile.apkTerrainId === void 0) return null;
  return getApkTerrainConfig(tile.apkTerrainId)?.[field] ?? null;
}
function getTileDefenseBonus(tile) {
  return getApkTerrainValue(tile, "defenseBonus") ?? getTileTerrainConfig(tile)?.defenseBonus ?? 0;
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
function isCommanderUnit(state, unit, teamId) {
  if (teamId !== void 0 && unit.ownerId !== teamId) return false;
  const commanderUnitId = getRuleConfig(state).commanderUnitIds[unit.ownerId];
  if (commanderUnitId !== void 0) {
    return unit.id === commanderUnitId;
  }
  return unit.unitClass === "commander";
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

// ai_training/r8_pure_policy_stage_20261014_125300/frozen/src/game/abilities.ts
function hasAbility(unit, ability) {
  const config = UNIT_CONFIGS[unit.unitClass];
  return config?.abilities.includes(ability) || false;
}
function isFlying(unit) {
  return hasAbility(unit, "flying");
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
    return base.map((features) => ({
      ...features,
      semantics: features.semantics.length === semanticDim ? features.semantics : Float32Array.from(features.semantics).slice(0, semanticDim)
    }));
  }
  if (version !== "v2") throw new Error("Path-3 schema \u53EA\u652F\u6301 v2 \u7F16\u7801");
  const relations = encodePathRelations(state, playerId, actions);
  return base.map((features, index) => {
    const semantics = new Float32Array(ACTION_SEMANTIC_DIM_PATH3);
    semantics.set(features.semantics);
    const relation = relations[index];
    semantics[53] = relation.reachableCapturableBuilding;
    semantics[54] = relation.normalizedNearestCapturableCost;
    semantics[55] = relation.normalizedCapturableCostReduction;
    return { ...features, semantics };
  });
}

// ai_training/r8_pure_policy_stage_20261014_125300/research/common.ts
var MAPS = ["Duel", "Liberty Port", "Swamplands", "The Crossing", "Icy Paths", "Peak Island", "Crossed swords"].map((x) => `(2) ${x}.aem`);
var canonical = (v) => v === null || typeof v !== "object" ? v : Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
var hash = (v) => import_node_crypto.default.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(canonical(v))).digest("hex");
var fileHash = (p) => import_node_crypto.default.createHash("sha256").update(import_node_fs.default.readFileSync(p)).digest("hex");

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
  for (let o2 = 0; o2 < outDim; o2 += 1) {
    let sum = B[o2];
    const wBase = o2 * inDim;
    for (let i = 0; i < inDim; i += 1) {
      sum += W[wBase + i] * x[i];
    }
    if (activation === "relu") {
      out[o2] = sum > 0 ? sum : 0;
    } else if (activation === "tanh") {
      out[o2] = Math.tanh(sum);
    } else {
      out[o2] = sum;
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

// ai_training/r13_execution_diagnostic_20261015_035900/buffer_state.ts
var o = import_node_path.default.dirname(process.argv[1]);
var fsx = JSON.parse(import_node_fs2.default.readFileSync(import_node_path.default.join(o, "fixtures.json"), "utf8")).rows;
var rows = [];
for (const model of [...new Set(fsx.map((f) => f.model))]) {
  const group = fsx.filter((f) => f.model === model), a = group[0], b = group.find((f) => hash(f.state) !== hash(a.state));
  (0, import_strict.default)(b);
  const weights = loadSpatialResNetFromJson(import_node_fs2.default.readFileSync(model, "utf8")), p = new SpatialResNetPredictor(weights), run = (f) => p.predict(encodeGameStateSpatial(f.state, f.state.currentPlayer, "v2", { channels: weights.stem.inChannels }), encodeCandidateActionsSpatialForSchema(f.state, f.state.currentPlayer, f.legal, "v2", ENCODER_SCHEMA_ID_V19)), first = [...run(a).actionLogits];
  run(b);
  const last = run(a), delta = Math.max(...first.map((x, i) => Math.abs(x - last.actionLogits[i])));
  rows.push({ model, sha256: fileHash(model), fixtureA: { stage: a.stage, step: a.step, stateHash: hash(a.state) }, fixtureB: { stage: b.stage, step: b.step, stateHash: hash(b.state) }, maxLogitDelta: delta, passed: delta === 0 });
}
import_node_fs2.default.writeFileSync(import_node_path.default.join(o, "cross_state_buffer_audit.json"), JSON.stringify({ rows, passed: rows.every((x) => x.passed) }, null, 2), { flag: "wx" });
console.log(rows.map((x) => ({ sha: x.sha256, delta: x.maxLogitDelta })));
