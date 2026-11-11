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
function getScalarRule(state, key) {
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
function isCommanderUnit(state, unit, teamId) {
  if (teamId !== void 0 && unit.ownerId !== teamId) return false;
  const commanderUnitId = state.rules?.commanderUnitIds?.[unit.ownerId] ?? DEFAULT_RULE_CONFIG.commanderUnitIds[unit.ownerId];
  if (commanderUnitId !== void 0) {
    return unit.id === commanderUnitId;
  }
  return unit.unitClass === "commander";
}
function getCommanderUnit(state, playerId) {
  const commanderUnitId = state.rules?.commanderUnitIds?.[playerId] ?? DEFAULT_RULE_CONFIG.commanderUnitIds[playerId];
  if (commanderUnitId !== void 0) {
    return state.units.find((unit) => unit.id === commanderUnitId && unit.ownerId === playerId && unit.hp > 0) ?? null;
  }
  return state.units.find((unit) => unit.ownerId === playerId && unit.unitClass === "commander" && unit.hp > 0) ?? null;
}
function getUnitCost(state, playerId, unitClass) {
  const prices = state.rules?.prices, defaults = DEFAULT_RULE_CONFIG.prices;
  const priceOverride = prices && Object.prototype.propertyIsEnumerable.call(prices, unitClass) ? prices[unitClass] : defaults[unitClass];
  if (unitClass === "commander") {
    if (priceOverride === null || priceOverride === void 0 && getScalarRule(state, "commanderRecruitBaseCost") === null) return null;
    const baseCost = priceOverride ?? getScalarRule(state, "commanderRecruitBaseCost");
    const deathCount = state.players.find((p) => p.id === playerId)?.commanderDeathCount ?? 0;
    return baseCost + deathCount * getScalarRule(state, "commanderRecruitCostGrowth");
  }
  if (priceOverride !== void 0) return priceOverride;
  return UNIT_CONFIGS[unitClass].cost;
}
function getRecruitableUnits(state, playerId) {
  const teamRules = getTeamRuleConfig(state, playerId);
  const configuredUnits = teamRules.recruitableUnits ?? getScalarRule(state, "recruitableUnits") ?? Object.keys(UNIT_CONFIGS);
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
  const teamRules = getTeamRuleConfig(state, playerId);
  const unitLimit = teamRules.unitLimit ?? getScalarRule(state, "unitLimit");
  if (unitLimit !== void 0 && getCurrentUnitCount(state, playerId) >= unitLimit) {
    return false;
  }
  const populationLimit = teamRules.populationLimit ?? getScalarRule(state, "populationLimit");
  if (populationLimit !== void 0 && getCurrentPopulation(state, playerId) + unitConfig.population > populationLimit) {
    return false;
  }
  return true;
}
function getTileIncome(state, tile) {
  const key = getTileTerrainKey(tile);
  if (key === "town") return getNumericRule(state, "incomeVillage");
  if (key === "castle") return getNumericRule(state, "incomeCastle");
  return 0;
}

// ../src/game/abilities.ts
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

// ../src/game/map.ts
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
function getMovementCosts(state, unitId) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return /* @__PURE__ */ new Map();
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
function appendAttackActions(actions, unit, enemies, stats) {
  if (stats.maxRange > 0) for (const enemy of enemies) {
    if (inRange(unit.pos, enemy.pos, stats.minRange, stats.maxRange)) {
      actions.push({ type: "attack", attackerId: unit.id, targetId: enemy.id });
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
    for (const unit of validUnits) appendAttackActions(actions, unit, enemyUnits, getEffectiveStats(unit));
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
  for (const unit of query.skipMovement ? [] : assaultUnits) {
    const reachable = getReachablePositions(state, unit.id, unit.movementRemaining);
    for (const pos of reachable) {
      actions.push({ type: "post_attack_move", unitId: unit.id, to: pos });
    }
  }
  for (const unit of validUnits) {
    const eff = getEffectiveStats(unit);
    const tileUnder = state.map.tiles[unit.pos.y][unit.pos.x];
    const terrainConfig = getTileTerrainConfig(tileUnder);
    if (!unit.hasMoved && !query.skipMovement) {
      const reachable = getReachablePositions(state, unit.id);
      for (const pos of reachable) {
        if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
          actions.push({ type: "move", unitId: unit.id, to: pos });
        }
      }
    }
    if (eff.maxRange > 0) {
      appendAttackActions(actions, unit, enemyUnits, eff);
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
  if (!pendingUnitId && !query.skipRecruitment) {
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

// ../src/game/team_cleanup.ts
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
  copy.units = state.units.map((unit) => {
    const cloned = { ...unit, pos: { ...unit.pos } };
    if (unit.status) cloned.status = { ...unit.status };
    if (unit.apkMoveOverrides) cloned.apkMoveOverrides = { ...unit.apkMoveOverrides };
    return cloned;
  });
  copy.map = { ...state.map, tiles: state.map.tiles.map((row) => row.map((tile) => ({ ...tile }))) };
  if (state.graves) copy.graves = state.graves.map((grave) => ({ ...grave, pos: { ...grave.pos } }));
  if (state.rules) copy.rules = cloneJson(state.rules);
  if (state.metadata) copy.metadata = cloneJson(state.metadata);
  if (state.apkScriptState) copy.apkScriptState = cloneJson(state.apkScriptState);
  return copy;
}

// ../src/game/engine.ts
function cloneLegalActions(actions) {
  let positions;
  const unusual = Symbol();
  const copyPosition = (pos) => {
    if (Object.getPrototypeOf(pos) !== Object.prototype || Object.keys(pos).length !== 2 || !Object.hasOwn(pos, "x") || !Object.hasOwn(pos, "y") || Object.getOwnPropertySymbols(pos).length) throw unusual;
    positions ??= /* @__PURE__ */ new Map();
    let copy = positions.get(pos);
    if (!copy) {
      copy = { ...pos };
      positions.set(pos, copy);
    }
    return copy;
  };
  try {
    return actions.map((action) => {
      switch (action.type) {
        case "move":
        case "post_attack_move":
          return { ...action, to: copyPosition(action.to) };
        case "recruit_to_castle":
          return { ...action, castlePos: copyPosition(action.castlePos) };
        case "recruit_and_deploy":
          return { ...action, castlePos: copyPosition(action.castlePos), to: copyPosition(action.to) };
        case "summon":
          return { ...action, spawnPos: copyPosition(action.spawnPos) };
        case "destroy_town":
          return action.target ? { ...action, target: copyPosition(action.target) } : { ...action };
        default:
          return { ...action };
      }
    });
  } catch (error) {
    if (error === unusual) return structuredClone(actions);
    throw error;
  }
}
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
  state;
  unsafeBypassValidationForTests = false;
  disableAutoAdvanceWhenNoMeaningfulAction = false;
  fullLegalCache;
  executingStep = false;
  queryLegalCache = /* @__PURE__ */ new Map();
  movementCosts = /* @__PURE__ */ new Map();
  constructor(initialState, options) {
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
      branch.queryLegalCache = this.queryLegalCache;
      branch.movementCosts = this.movementCosts;
    }
    return branch;
  }
  getCachedLegalActions(playerId, query) {
    if (this.executingStep || !Number.isFinite(playerId)) return getLegalActions(this.state, playerId, query);
    if (query === void 0 && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
    let unitId, skipMovement = false, skipRecruitment = false, onlyAttacks = false;
    if (query !== void 0) {
      if (query === null || typeof query !== "object") return getLegalActions(this.state, playerId, query);
      const prototype = Object.getPrototypeOf(query);
      const known = ["unitId", "skipMovement", "skipRecruitment", "onlyAttacks"];
      if (prototype !== null && prototype !== Object.prototype) return getLegalActions(this.state, playerId, query);
      const descriptors = Object.getOwnPropertyDescriptors(query), names = Object.getOwnPropertyNames(query);
      if (Object.getOwnPropertySymbols(query).length || names.some((k) => !known.includes(k) || !("value" in descriptors[k])) || known.some((k) => !Object.hasOwn(query, k) && k in query)) return getLegalActions(this.state, playerId, query);
      unitId = descriptors.unitId?.value;
      const movement = descriptors.skipMovement?.value, recruitment = descriptors.skipRecruitment?.value, attacks = descriptors.onlyAttacks?.value;
      if (unitId !== void 0 && typeof unitId !== "string" || [movement, recruitment, attacks].some((v) => v !== void 0 && typeof v !== "boolean")) return getLegalActions(this.state, playerId, query);
      skipMovement = movement === true;
      skipRecruitment = recruitment === true;
      onlyAttacks = attacks === true;
    }
    const full = unitId === void 0 && !skipMovement && !skipRecruitment && !onlyAttacks;
    if (full && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
    const key = JSON.stringify([playerId, unitId === void 0 ? null : unitId, skipMovement, skipRecruitment, onlyAttacks]);
    let actions = this.queryLegalCache.get(key);
    if (!actions) {
      actions = cloneLegalActions(getLegalActions(this.state, playerId, query));
      this.queryLegalCache.set(key, actions);
    }
    if (full) this.fullLegalCache = { playerId, actions };
    return actions;
  }
  getLegalActions(playerId, query) {
    return cloneLegalActions(this.getCachedLegalActions(playerId, query));
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
      this.queryLegalCache = /* @__PURE__ */ new Map();
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
      const moving = action.type === "move" || action.type === "post_attack_move";
      const skipRecruitment = action.type !== "recruit_to_castle" && action.type !== "recruit_and_deploy";
      const legalActions = this.fullLegalCache?.playerId === this.state.currentPlayer ? this.fullLegalCache.actions : this.getCachedLegalActions(this.state.currentPlayer, moving ? { unitId: action.unitId, skipRecruitment } : action.type === "attack" ? { unitId: action.attackerId, onlyAttacks: true } : { skipMovement: true, skipRecruitment });
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
    this.fullLegalCache = void 0;
    this.queryLegalCache = /* @__PURE__ */ new Map();
    this.executingStep = true;
    const beforeMovementCosts = this.movementCosts;
    this.movementCosts = /* @__PURE__ */ new Map();
    const movementCost = (unitId, to) => {
      const unit = this.state.units.find((u) => u.id === unitId);
      if (unit?.pos.x === to.x && unit.pos.y === to.y) return 0;
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
        const unit = this.state.units.find((u) => u.id === action.unitId);
        if (unit) {
          const cost = movementCost(unit.id, action.to);
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
          const cost = movementCost(unit.id, action.to);
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
      const immediate = this.getCachedLegalActions(this.state.currentPlayer, { skipMovement: true, skipRecruitment: true });
      if (immediate.some((action) => action.type !== "end_turn" && action.type !== "surrender")) return;
      const actions = this.getCachedLegalActions(this.state.currentPlayer);
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
export {
  GameEngine,
  cloneLegalActions
};
