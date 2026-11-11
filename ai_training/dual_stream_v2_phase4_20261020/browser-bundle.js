(() => {
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
  function isTileDestroyableForRules(tile) {
    if (tile.apkTerrainId !== void 0) {
      return (getApkTerrainConfig(tile.apkTerrainId)?.linkedB ?? -1) >= 0;
    }
    return getTileTerrainKey(tile) === "town";
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
  function estimateCounterDamage(state, attackerId, defenderId) {
    const attacker = state.units.find((u) => u.id === attackerId);
    const target = state.units.find((u) => u.id === defenderId);
    if (!attacker || !target) return 0;
    const levelCap = getScalarRule(state, "levelCap");
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
    const hpProjection = projectExpOutcome(projectedAttacker, outgoingExp, levelCap);
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
  function appendOrdinaryMoves(actions, state, unit) {
    if (unit.hasMoved) return;
    for (const pos of getReachablePositions(state, unit.id)) {
      if (pos.x !== unit.pos.x || pos.y !== unit.pos.y) {
        actions.push({ type: "move", unitId: unit.id, to: pos });
      }
    }
  }
  function appendAttackActions(actions, unit, enemies, stats) {
    if (stats.maxRange > 0) for (const enemy of enemies) {
      if (inRange(unit.pos, enemy.pos, stats.minRange, stats.maxRange)) {
        actions.push({ type: "attack", attackerId: unit.id, targetId: enemy.id });
      }
    }
  }
  function actionReadyUnits(state, playerId) {
    const pendingId = state.pendingUnitId;
    const locked = Boolean(pendingId && state.units.find((u) => u.id === pendingId)?.apkPendingRecruitSource !== "empty_castle");
    return state.units.filter((u) => u.ownerId === playerId && !u.hasActed && !u.apkStatic && (!locked || u.id === pendingId));
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
    let validUnits = actionReadyUnits(state, playerId);
    if (query.unitId !== void 0) validUnits = validUnits.filter((u) => u.id === query.unitId);
    if (query.onlyOrdinaryMoves) {
      if (!query.onlyAttacks && !query.skipMovement) for (const unit of validUnits) appendOrdinaryMoves(actions, state, unit);
      return actions;
    }
    const enemyUnits = state.units.filter((u) => areEnemyPlayers(state, u.ownerId, playerId));
    if (query.onlyAttacks) {
      for (const unit of validUnits) appendAttackActions(actions, unit, enemyUnits, getEffectiveStats(unit));
      return actions;
    }
    const rules = {
      commanderCastleRecruitUsesPending: getScalarRule(state, "commanderCastleRecruitUsesPending"),
      allowSurrender: getScalarRule(state, "allowSurrender"),
      allowPendingRecruitSurrender: getScalarRule(state, "allowPendingRecruitSurrender"),
      allowPendingRecruitEndTurn: getScalarRule(state, "allowPendingRecruitEndTurn")
    };
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
      if (!query.skipMovement) appendOrdinaryMoves(actions, state, unit);
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

  // ../src/game/env.ts
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

  // ../src/ai_runtime/dual_v2/value_calibration.ts
  function valueCalibrationFeatures(state, order) {
    const configured = state.players.filter((p) => isTeamEnabled(state, p.id)).length;
    const bucket = (configured <= 2 ? 0 : configured === 3 ? 1 : 2) * 3 + (state.turn <= 5 ? 0 : state.turn <= 15 ? 1 : 2);
    const army = order.playerIds.map((id) => id === null ? 0 : calculateArmyValue(state, id));
    const income = order.playerIds.map((id) => id === null ? 0 : state.map.tiles.flat().reduce((s, tile) => s + (tile.ownerId === id ? getTileIncome(state, tile) : 0), 0));
    return { bucket, army, income };
  }
  function calibrateValue(logits, active2, features, calibration) {
    const c = calibration.buckets[features.bucket];
    if (!c || !Number.isFinite(c.temperature) || c.temperature <= 0 || !Number.isFinite(c.army) || !Number.isFinite(c.income)) throw Error("\u4EF7\u503C\u6821\u51C6\u53C2\u6570\u65E0\u6548");
    const aSum = features.army.reduce((s, x, i) => s + Math.max(0, x) * active2[i], 0);
    const iSum = features.income.reduce((s, x, i) => s + Math.max(0, x) * active2[i], 0);
    const scores = new Float32Array(6);
    let max = -Infinity;
    for (let i = 0; i < 6; i++) {
      scores[i] = active2[i] ? logits[i] / c.temperature + c.army * Math.max(0, features.army[i]) / Math.max(1e-12, aSum) + c.income * Math.max(0, features.income[i]) / Math.max(1e-12, iSum) : -1e9;
      if (active2[i]) max = Math.max(max, scores[i]);
    }
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      scores[i] = active2[i] ? Math.exp(scores[i] - max) : 0;
      sum += scores[i];
    }
    for (let i = 0; i < 6; i++) scores[i] = sum ? scores[i] / sum : 0;
    return scores;
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
      this.terrainCosts = /* @__PURE__ */ new Map();
      this.needsMovementFallback = state.units.some((u) => u.hp <= 0) || new Set(state.units.map((u) => this.index(u.pos))).size !== state.units.length;
      for (const unit of state.units) {
        const index = this.index(unit.pos);
        if (unit.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit);
      }
    }
    /** 共享最短路表的可停留格查询；复杂堆叠仍使用原权威查询保留最后占位语义。 */
    reachablePositions(unit, maxMove) {
      if (this.needsMovementFallback) return getReachablePositions(this.state, unit.id, maxMove);
      const key = `${unit.id}:${unit.pos.x},${unit.pos.y}`;
      let costs = this.distances.get(key);
      if (!costs) {
        costs = this.buildDistances(unit, unit.pos);
        this.distances.set(key, costs);
      }
      const result = [], start = this.index(unit.pos), width = this.state.map.width;
      for (let idx = 0; idx < costs.length; idx++) if (costs[idx] <= maxMove && (idx === start || !this.occupants.has(idx))) result.push({ x: idx % width, y: Math.floor(idx / width) });
      return result;
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
      const terrainKey = JSON.stringify([unit.unitClass, unit.apkMoveOverrides ?? null]);
      let terrainCosts = this.terrainCosts.get(terrainKey);
      if (!terrainCosts) {
        terrainCosts = new Float64Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) terrainCosts[y * width + x] = getMoveCostForUnit(this.state, unit, tiles[y][x]);
        this.terrainCosts.set(terrainKey, terrainCosts);
      }
      let maxStep = 0;
      for (const cost of terrainCosts) {
        if (!Number.isInteger(cost) || cost < 0 || cost > 32) {
          maxStep = -1;
          break;
        }
        maxStep = Math.max(maxStep, cost);
      }
      if (maxStep >= 0) {
        const buckets = Array.from({ length: maxStep + 1 }, () => []);
        const blocked = new Uint8Array(width * height);
        for (const [index, occupying] of this.occupants) if (!areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId) && !(flying && !isFlying(occupying))) blocked[index] = 1;
        buckets[0].push(start);
        let pending = 1, distance = 0;
        while (pending > 0) {
          const bucket = buckets[distance % buckets.length];
          if (!bucket.length) {
            distance++;
            continue;
          }
          const index = bucket.pop();
          pending--;
          if (costs[index] !== distance || index !== start && blocked[index]) continue;
          const x = index % width;
          for (let direction = 0; direction < 4; direction++) {
            if (direction === 0 && index + width >= costs.length || direction === 1 && index < width || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
            const next = index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
            const nextCost = distance + terrainCosts[next];
            if (nextCost < costs[next]) {
              costs[next] = nextCost;
              buckets[nextCost % buckets.length].push(next);
              pending++;
            }
          }
        }
        return costs;
      }
      let current;
      while (current = queue.pop()) {
        if (current.cost > costs[current.index]) continue;
        const occupying = this.occupants.get(current.index);
        if (current.index !== start && occupying && !areAlliedPlayers(this.state, unit.ownerId, occupying.ownerId) && !(flying && !isFlying(occupying))) continue;
        const x = current.index % width;
        const y = Math.floor(current.index / width);
        for (let direction = 0; direction < 4; direction++) {
          if (direction === 0 && y + 1 >= height || direction === 1 && y === 0 || direction === 2 && x + 1 >= width || direction === 3 && x === 0) continue;
          const next = current.index + (direction === 0 ? width : direction === 1 ? -width : direction === 2 ? 1 : -1);
          const stepCost = terrainCosts[next];
          if (!Number.isFinite(stepCost) || stepCost >= 999999) continue;
          const nextCost = current.cost + stepCost;
          if (nextCost < costs[next]) {
            costs[next] = nextCost;
            queue.push({ index: next, cost: nextCost });
          }
        }
      }
      return costs;
    }
  };

  // ../src/ai_runtime/dual_v2/reachability.ts
  var ReachabilityContext = class {
    constructor(state) {
      this.state = state;
      this.units = /* @__PURE__ */ new Map();
      this.area = state.map.width * state.map.height;
      this.paths = new TacticalPathfinder(state);
      const categories = /* @__PURE__ */ new Map(), tileCategories = new Int32Array(this.area);
      for (let idx = 0; idx < this.area; idx++) {
        const tile = state.map.tiles[Math.floor(idx / state.map.width)][idx % state.map.width];
        const key = `${getTileDefenseBonus(tile)}:${getTileTerrainKey(tile) === "town"}:${isWaterTerrain(tile)}`;
        if (!categories.has(key)) categories.set(key, categories.size);
        tileCategories[idx] = categories.get(key);
      }
      const pending = state.units.find((u) => u.id === state.pendingUnitId);
      for (const unit of state.units) {
        if (unit.hp <= 0) continue;
        const self = unit.ownerId === state.currentPlayer;
        const locked = self && pending && pending.apkPendingRecruitSource !== "empty_castle" && pending.id !== unit.id;
        const ready = isActivePlayer(state, unit.ownerId) && !unit.apkStatic && !locked && (!self || !unit.hasActed);
        const origins = ready && (!self || !unit.hasMoved) ? this.paths.reachablePositions(unit, getEffectiveStats(unit).move) : [unit.pos];
        const bestOrigins = new Int32Array(this.area * 2).fill(-1);
        const bestBonus = new Float32Array(this.area * 2).fill(-Infinity);
        const referenceDamage = new Float32Array(this.area);
        const reach = { unit, ready: Boolean(ready), origins, bestOrigins, referenceDamage };
        this.units.set(unit.id, reach);
        if (!ready) continue;
        const stats = getEffectiveStats(unit);
        if (stats.maxRange <= 0) continue;
        const attacker = { ...unit, pos: { ...unit.pos } };
        const defender = { id: "\0dual-reference", ownerId: -999, unitClass: "soldier", pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false };
        const view = { ...state, units: [attacker, defender] };
        const damageCache = /* @__PURE__ */ new Map();
        for (const origin of origins) {
          attacker.pos = origin;
          const bonus = getAttackBonus(view, attacker, defender);
          let cachedDamage = damageCache.get(bonus);
          if (!cachedDamage) {
            cachedDamage = new Float64Array(categories.size * 2).fill(NaN);
            damageCache.set(bonus, cachedDamage);
          }
          const originIdx = origin.y * state.map.width + origin.x;
          for (let dy = -stats.maxRange; dy <= stats.maxRange; dy++) {
            const y = origin.y + dy;
            if (y < 0 || y >= state.map.height) continue;
            const span = stats.maxRange - Math.abs(dy);
            for (let dx = -span; dx <= span; dx++) {
              const distance = Math.abs(dx) + Math.abs(dy), x = origin.x + dx;
              if (distance < stats.minRange || x < 0 || x >= state.map.width) continue;
              const tileIdx = y * state.map.width + x, group = distance === 1 ? 0 : 1, k = tileIdx * 2 + group;
              if (bonus <= bestBonus[k]) continue;
              bestBonus[k] = bonus;
              bestOrigins[k] = originIdx;
              defender.pos = { x, y };
              const key = tileCategories[tileIdx] * 2 + group;
              let damage = cachedDamage[key];
              if (Number.isNaN(damage)) {
                damage = calculateDamage(view, attacker.id, defender.id);
                cachedDamage[key] = damage;
              }
              referenceDamage[tileIdx] = Math.max(referenceDamage[tileIdx], damage / 100);
            }
          }
        }
      }
    }
    projectedDamage(attacker, defender) {
      const reach = this.units.get(attacker.id);
      if (!reach?.ready) return 0;
      const idx = (defender.pos.y * this.state.map.width + defender.pos.x) * 2;
      let damage = 0;
      for (let group = 0; group < 2; group++) {
        const origin = reach.bestOrigins[idx + group];
        if (origin < 0) continue;
        const projected = { ...attacker, pos: { x: origin % this.state.map.width, y: Math.floor(origin / this.state.map.width) } };
        damage = Math.max(damage, calculateDamage({ ...this.state, units: [projected, defender] }, projected.id, defender.id));
      }
      return damage;
    }
  };

  // ../src/ai_runtime/dual_v2/tactical_prior.ts
  function actionActor(a) {
    if ("unitId" in a) return a.unitId;
    if ("attackerId" in a) return a.attackerId;
    if ("healerId" in a) return a.healerId;
    if ("supporterId" in a) return a.supporterId;
    if ("summonerId" in a) return a.summonerId;
    return void 0;
  }
  function tacticalActionPriors(state, legal, context = new ReachabilityContext(state)) {
    const units = new Map(state.units.map((u) => [u.id, u])), enemies = state.units.filter((u) => u.hp > 0 && !areAlliedPlayers(state, state.currentPlayer, u.ownerId));
    const destinations = /* @__PURE__ */ new Map(), recruit = legal.some((a) => a.type.startsWith("recruit_"));
    const results = legal.map(() => ({ prior: 0, progress: 0, risk: 0, immediate: 0, forbidden: false }));
    const objectives = /* @__PURE__ */ new Map();
    const attackScore = (view, u, targetId) => {
      const target = units.get(targetId);
      const damage = Math.min(target.hp, calculateDamage(view, u.id, target.id));
      const cost = getUnitCost(state, target.ownerId, target.unitClass) ?? 300;
      return damage / 100 * Math.max(0.4, cost / 400) + (damage >= target.hp ? isCommanderUnit(state, target) ? 9 : 2 : 0) - estimateCounterDamage(view, u.id, target.id) / 100;
    };
    for (let i = 0; i < legal.length; i++) {
      const a = legal[i], r = results[i], id = actionActor(a), u = id ? units.get(id) : void 0;
      if (a.type === "end_turn") {
        r.forbidden = recruit;
        r.prior = recruit ? -1e6 : -8;
        continue;
      }
      if (a.type.startsWith("recruit_")) {
        r.prior = 3;
        continue;
      }
      if (!u) continue;
      if (a.type === "attack") r.immediate = attackScore(state, u, a.targetId) * 3;
      if (a.type === "capture") r.immediate = getTileTerrainKey(state.map.tiles[u.pos.y][u.pos.x]) === "castle" ? 16 : 9;
      if (a.type === "repair") r.immediate = 7;
      if (a.type === "heal") r.immediate = 3;
      if (a.type === "support") r.immediate = 4;
      if (a.type === "move" || a.type === "post_attack_move") {
        const projected = { ...u, pos: a.to, hasMoved: true }, view = { ...state, units: state.units.map((v) => v.id === u.id ? projected : v) };
        const follow = getLegalActions(view, state.currentPlayer, { unitId: u.id, skipMovement: true, skipRecruitment: true });
        for (const f of follow) {
          if (f.type === "capture") r.immediate = Math.max(r.immediate, getTileTerrainKey(state.map.tiles[a.to.y][a.to.x]) === "castle" ? 16 : 9);
          if (f.type === "attack") r.immediate = Math.max(r.immediate, attackScore(view, projected, f.targetId) * 3);
          if (f.type === "heal") r.immediate = Math.max(r.immediate, 3);
          if (f.type === "support") r.immediate = Math.max(r.immediate, 4);
        }
        if (!objectives.has(u.id)) {
          const goals = [];
          for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x], key = getTileTerrainKey(tile);
            if ((key === "castle" || key === "town") && (tile.ownerId === null || !areAlliedPlayers(state, u.ownerId, tile.ownerId))) goals.push({ x, y });
          }
          const reachable = goals.filter((g) => context.paths.cost(u, u.pos, g) !== null);
          objectives.set(u.id, reachable.length ? reachable : enemies.map((e) => e.pos));
        }
        let before = Infinity, after = Infinity;
        for (const goal of objectives.get(u.id)) {
          before = Math.min(before, context.paths.cost(u, u.pos, goal) ?? Infinity);
          after = Math.min(after, context.paths.cost(u, a.to, goal) ?? Infinity);
        }
        r.progress = Number.isFinite(before) && Number.isFinite(after) ? before - after : 0;
        const threats = enemies.map((e) => Math.min(u.hp, context.projectedDamage(e, projected))).sort((a2, b) => b - a2);
        r.risk = Math.min(u.hp, threats.slice(0, 3).reduce((s, d) => s + d, 0)) / Math.max(1, u.hp);
        const originTile = state.map.tiles[u.pos.y][u.pos.x];
        const clearCastle = getTileTerrainKey(originTile) === "castle" && originTile.ownerId !== null && areAlliedPlayers(state, u.ownerId, originTile.ownerId);
        r.prior = r.immediate + Math.max(-3, Math.min(5, r.progress)) * 1.3 - r.risk * (isCommanderUnit(state, u) ? 12 : 3) + (clearCastle ? 5 : 0);
        const rows = destinations.get(u.id) ?? [];
        rows.push(i);
        destinations.set(u.id, rows);
      } else r.prior = r.immediate;
    }
    for (let i = 0; i < legal.length; i++) {
      const a = legal[i];
      if (a.type !== "wait") continue;
      const u = units.get(a.unitId), tile = state.map.tiles[u.pos.y][u.pos.x];
      const moves = destinations.get(u.id) ?? [];
      const tactical = legal.some((f) => actionActor(f) === u.id && (f.type === "attack" || f.type === "capture" || f.type === "heal" || f.type === "support"));
      const exit = getTileTerrainKey(tile) === "castle" && tile.ownerId !== null && areAlliedPlayers(state, u.ownerId, tile.ownerId) && moves.length > 0;
      const useful = moves.some((j) => results[j].risk < 1 && (results[j].progress > 0 || results[j].immediate > 0));
      results[i].forbidden = Boolean(exit || !u.hasMoved && (useful || tactical));
      results[i].prior = results[i].forbidden ? -1e6 : u.hasMoved ? 0 : -4;
    }
    return results;
  }

  // ../src/ai_runtime/dual_v2/contract.ts
  var SCHEMA_ID = "dual-stream-v2-phase1-v1";
  var PLAYER_SLOTS = 6;

  // ../src/ai_runtime/dual_v2/player_order.ts
  function encodePlayerOrder(state) {
    const enabled = state.players.filter((p) => isTeamEnabled(state, p.id)).map((p) => p.id);
    if (enabled.length > PLAYER_SLOTS) throw Error("\u53CC\u6D41\u5951\u7EA6\u6700\u591A\u652F\u63016\u4E2A\u542F\u7528\u73A9\u5BB6");
    const turn = getTurnPlayerIds(state), current = state.currentPlayer;
    const start = turn.indexOf(current);
    const rotated = start < 0 ? turn : [...turn.slice(start), ...turn.slice(0, start)];
    const ids = [.../* @__PURE__ */ new Set([current, ...rotated, ...enabled.sort((a, b) => a - b)])];
    if (ids.length > PLAYER_SLOTS) throw Error("\u5F53\u524D\u73A9\u5BB6\u4E0E\u542F\u7528\u73A9\u5BB6\u65E0\u6CD5\u653E\u51656\u4E2A\u69FD");
    const playerIds = Array.from({ length: PLAYER_SLOTS }, (_, i) => ids[i] ?? null);
    const slotByPlayer = new Map(ids.map((id, slot) => [id, slot]));
    const features = new Float32Array(PLAYER_SLOTS * 11), active2 = new Uint8Array(PLAYER_SLOTS);
    for (const [slot, id] of ids.entries()) {
      const player = state.players.find((p) => p.id === id);
      if (!player) throw Error("\u5F53\u524D\u884C\u52A8\u73A9\u5BB6\u4E0D\u5B58\u5728");
      const living = state.units.filter((u) => u.ownerId === id && u.hp > 0);
      const ally = getAllianceId(state, current) === getAllianceId(state, id);
      active2[slot] = Number(isActivePlayer(state, id));
      features.set([active2[slot], active2[slot] ? rotated.indexOf(id) / (PLAYER_SLOTS - 1) : -1, Number(id === current), Number(ally && id !== current), Number(!ally), player.gold / 1e4, living.length / 100, calculateArmyValue(state, id) / 1e4, living.filter((u) => isCommanderUnit(state, u)).length, (player.commanderReserveLevel ?? 0) / 9, Number(player.isAlive)], slot * 11);
    }
    return { playerIds, slotByPlayer, features, active: active2 };
  }

  // dual_stream_v2_phase4_20261020/pipeline_eval.ts
  function pipelineOutput(input, out, headBias, config) {
    const legal = getLegalActions(input.state, input.state.currentPlayer), prior = tacticalActionPriors(input.state, legal), order = encodePlayerOrder(input.state);
    const scores = Float64Array.from(out.logits, (x, i) => x + headBias[input.heads[i]] + prior[input.sourceIndices[i]].prior);
    return { scores, valueProbs: calibrateValue(out.valueLogits, order.active, valueCalibrationFeatures(input.state, order), config) };
  }

  // ../src/ai_runtime/dual_v2/tensor_workspace.ts
  var TensorWorkspace = class {
    constructor() {
      this.blocks = [];
      this.cursor = 0;
    }
    reset() {
      this.cursor = 0;
    }
    allocate(length, clear) {
      const index = this.cursor++;
      let block = this.blocks[index];
      if (!block || block.length < length) this.blocks[index] = block = new Float32Array(length);
      const result = block.length === length ? block : block.subarray(0, length);
      if (clear) result.fill(0);
      return result;
    }
  };
  var active;
  function tensor(length, clear = true) {
    return active ? active.allocate(length, clear) : new Float32Array(length);
  }
  function withTensorWorkspace(workspace, run) {
    const previous = active;
    active = workspace;
    workspace.reset();
    try {
      return run();
    } finally {
      active = previous;
    }
  }

  // ../src/ai_runtime/dual_v2/matrix_kernels.ts
  function matrix306x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 306, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 306;
        for (let k = 0; k < 306; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 306 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 306;
      for (let k = 0; k < 306; k++, wi += 4) {
        const v = x[r * 306 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix48x8(x, rows, w, bias) {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 48, yi = r * 8;
      for (let o = 0; o < 8; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 48 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
      for (let k = 0; k < 48; k++, wi += 4) {
        const v = x[r * 48 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 8 + o] = a + (bias?.[o] ?? 0);
      y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix8x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 8, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 8 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
      for (let k = 0; k < 8; k++, wi += 4) {
        const v = x[r * 8 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x8(x, rows, w, bias) {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 8;
      for (let o = 0; o < 8; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 8 + o] = a + (bias?.[o] ?? 0);
      y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix8x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 8, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 8 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
      for (let k = 0; k < 8; k++, wi += 4) {
        const v = x[r * 8 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix96x16(x, rows, w, bias) {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 96, yi = r * 16;
      for (let o = 0; o < 16; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 96 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
      for (let k = 0; k < 96; k++, wi += 4) {
        const v = x[r * 96 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 16 + o] = a + (bias?.[o] ?? 0);
      y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix48x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 48, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 48 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
      for (let k = 0; k < 48; k++, wi += 4) {
        const v = x[r * 48 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix66x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 66, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 66;
        for (let k = 0; k < 66; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 66 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 66;
      for (let k = 0; k < 66; k++, wi += 4) {
        const v = x[r * 66 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix96x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 96, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 96 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
      for (let k = 0; k < 96; k++, wi += 4) {
        const v = x[r * 96 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix130x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 130, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 130;
        for (let k = 0; k < 130; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 130 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 130;
      for (let k = 0; k < 130; k++, wi += 4) {
        const v = x[r * 130 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x16(x, rows, w, bias) {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 16;
      for (let o = 0; o < 16; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 16 + o] = a + (bias?.[o] ?? 0);
      y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x4(x, rows, w, bias) {
    const y = tensor(rows * 4, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 4;
      for (let o = 0; o < 4; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 4 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 4 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 4 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 4 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 4; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 4 + o] = a + (bias?.[o] ?? 0);
      y[r * 4 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 4 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 4 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x384(x, rows, w, bias) {
    const y = tensor(rows * 384, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 384;
      for (let o = 0; o < 384; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 384 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 384 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 384 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 384 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 384; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 384 + o] = a + (bias?.[o] ?? 0);
      y[r * 384 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 384 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 384 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x256(x, rows, w, bias) {
    const y = tensor(rows * 256, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 256;
      for (let o = 0; o < 256; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 256 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 256 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 256 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 256 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 256; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 256 + o] = a + (bias?.[o] ?? 0);
      y[r * 256 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 256 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 256 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix256x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 256, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 256;
        for (let k = 0; k < 256; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 256 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 256;
      for (let k = 0; k < 256; k++, wi += 4) {
        const v = x[r * 256 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x36(x, rows, w, bias) {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 36;
      for (let o = 0; o < 36; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 36 + o] = a + (bias?.[o] ?? 0);
      y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x36(x, rows, w, bias) {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 36;
      for (let o = 0; o < 36; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 36 + o] = a + (bias?.[o] ?? 0);
      y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix459x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 459, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 459;
        for (let k = 0; k < 459; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 459 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 459;
      for (let k = 0; k < 459; k++, wi += 4) {
        const v = x[r * 459 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  var MATRIX_KERNELS = { "306:48": matrix306x48, "48:8": matrix48x8, "8:48": matrix8x48, "64:8": matrix64x8, "8:64": matrix8x64, "96:16": matrix96x16, "16:96": matrix16x96, "48:64": matrix48x64, "64:96": matrix64x96, "66:96": matrix66x96, "96:64": matrix96x64, "64:48": matrix64x48, "130:128": matrix130x128, "16:16": matrix16x16, "16:4": matrix16x4, "128:384": matrix128x384, "128:128": matrix128x128, "128:256": matrix128x256, "256:128": matrix256x128, "128:64": matrix128x64, "64:64": matrix64x64, "128:36": matrix128x36, "64:36": matrix64x36, "459:128": matrix459x128 };

  // ../src/ai_runtime/dual_v2/tensor_ops.ts
  var packedMatrices = /* @__PURE__ */ new WeakMap();
  var packedFourMatrices = /* @__PURE__ */ new WeakMap();
  function packedWeight(weight, input, output, cache) {
    let packed = cache ? packedMatrices.get(weight) : void 0;
    if (packed) return packed;
    packed = cache ? new Float32Array(Math.floor(output / 8) * input * 8) : tensor(Math.floor(output / 8) * input * 8);
    for (let o = 0; o + 7 < output; o += 8) for (let k = 0; k < input; k++) for (let j = 0; j < 8; j++) packed[o * input + k * 8 + j] = weight[(o + j) * input + k];
    if (cache) packedMatrices.set(weight, packed);
    return packed;
  }
  function linear(x, rows, input, weight, output, bias, cache = true) {
    const kernel = MATRIX_KERNELS[`${input}:${output}`];
    if (kernel) {
      let packed2 = cache ? packedFourMatrices.get(weight) : void 0;
      if (!packed2) {
        packed2 = cache ? new Float32Array(weight.length) : tensor(weight.length);
        for (let o = 0; o < output; o += 4) for (let k = 0; k < input; k++) for (let j = 0; j < 4; j++) packed2[o * input + k * 4 + j] = weight[(o + j) * input + k];
        if (cache) packedFourMatrices.set(weight, packed2);
      }
      return kernel(x, rows, packed2, bias);
    }
    const y = tensor(rows * output, false);
    const packed = packedWeight(weight, input, output, cache);
    for (let r = 0; r < rows; r++) {
      const xi = r * input, yi = r * output;
      let o = 0;
      for (; o + 7 < output; o += 8) {
        let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0;
        let wi = o * input;
        for (let k = 0; k < input; k++, wi += 8) {
          const v = x[xi + k];
          if (v === 0) continue;
          a += v * packed[wi];
          b += v * packed[wi + 1];
          c += v * packed[wi + 2];
          d += v * packed[wi + 3];
          e += v * packed[wi + 4];
          f += v * packed[wi + 5];
          g += v * packed[wi + 6];
          h += v * packed[wi + 7];
        }
        y[yi + o] = a + (bias?.[o] ?? 0);
        y[yi + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[yi + o + 2] = c + (bias?.[o + 2] ?? 0);
        y[yi + o + 3] = d + (bias?.[o + 3] ?? 0);
        y[yi + o + 4] = e + (bias?.[o + 4] ?? 0);
        y[yi + o + 5] = f + (bias?.[o + 5] ?? 0);
        y[yi + o + 6] = g + (bias?.[o + 6] ?? 0);
        y[yi + o + 7] = h + (bias?.[o + 7] ?? 0);
      }
      for (; o < output; o++) {
        let sum = 0;
        for (let k = 0; k < input; k++) sum += x[xi + k] * weight[o * input + k];
        y[yi + o] = sum + (bias?.[o] ?? 0);
      }
    }
    return y;
  }
  function norm(x, rows, channels, weight, bias, groups = 0, relu = false) {
    const y = tensor(x.length, false);
    if (!groups) {
      for (let row = 0; row < rows; row++) {
        const base = row * channels;
        let mean = 0, square = 0;
        for (let c = 0; c < channels; c++) {
          const v = x[base + c];
          mean += v;
          square += v * v;
        }
        mean /= channels;
        const inv = 1 / Math.sqrt(Math.max(0, square / channels - mean * mean) + 1e-5);
        for (let c = 0; c < channels; c++) {
          const v = (x[base + c] - mean) * inv * weight[c] + bias[c];
          y[base + c] = relu ? Math.max(0, v) : v;
        }
      }
    } else {
      const size = channels / groups;
      for (let g = 0; g < groups; g++) {
        let mean = 0, square = 0;
        for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) {
          const v = x[r * channels + c];
          mean += v;
          square += v * v;
        }
        mean /= rows * size;
        const inv = 1 / Math.sqrt(Math.max(0, square / (rows * size) - mean * mean) + 1e-5);
        for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) {
          const v = (x[r * channels + c] - mean) * inv * weight[c] + bias[c];
          y[r * channels + c] = relu ? Math.max(0, v) : v;
        }
      }
    }
    return y;
  }
  function add(x, y, scale = 1, relu = false) {
    const out = tensor(x.length, false);
    for (let i = 0; i < out.length; i++) {
      const v = x[i] + scale * y[i];
      out[i] = relu ? Math.max(0, v) : v;
    }
    return out;
  }
  function pool(x, height, width, channels) {
    const h = Math.ceil(height / 2), w = Math.ceil(width / 2), out = tensor(h * w * channels, false);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) for (let c = 0; c < channels; c++) {
      let sum = 0, count = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (2 * y + dy < height && 2 * xx + dx < width) {
        sum += x[((2 * y + dy) * width + 2 * xx + dx) * channels + c];
        count++;
      }
      out[(y * w + xx) * channels + c] = sum / count;
    }
    return out;
  }
  function upsample(x, sourceWidth, height, width, channels) {
    const out = tensor(height * width * channels, false);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) {
      const src = (Math.floor(y / 2) * sourceWidth + Math.floor(xx / 2)) * channels;
      out.set(x.subarray(src, src + channels), (y * width + xx) * channels);
    }
    return out;
  }
  function depthwise(x, height, width, channels, weight, bias) {
    const out = tensor(x.length, false);
    const stride = (width + 2) * channels, padded = tensor((height + 2) * stride);
    for (let y = 0; y < height; y++) padded.set(x.subarray(y * width * channels, (y + 1) * width * channels), (y + 1) * stride + channels);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) for (let c = 0; c < channels; c++) {
      const i = y * stride + xx * channels + c, wi = c * 9;
      let sum = padded[i] * weight[wi];
      sum += padded[i + channels] * weight[wi + 1];
      sum += padded[i + 2 * channels] * weight[wi + 2];
      sum += padded[i + stride] * weight[wi + 3];
      sum += padded[i + stride + channels] * weight[wi + 4];
      sum += padded[i + stride + 2 * channels] * weight[wi + 5];
      sum += padded[i + 2 * stride] * weight[wi + 6];
      sum += padded[i + 2 * stride + channels] * weight[wi + 7];
      sum += padded[i + 2 * stride + 2 * channels] * weight[wi + 8];
      out[(y * width + xx) * channels + c] = sum + bias[c];
    }
    return out;
  }
  function softmax(x, mask) {
    const out = tensor(x.length);
    let max = -Infinity, sum = 0;
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) max = Math.max(max, x[i]);
    if (!Number.isFinite(max)) throw Error("\u6982\u7387\u5206\u5E03\u6CA1\u6709\u6709\u6548\u5019\u9009");
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) {
      out[i] = Math.exp(x[i] - max);
      sum += out[i];
    }
    for (let i = 0; i < x.length; i++) out[i] /= sum;
    return out;
  }

  // ../src/ai_runtime/dual_v2/spatial_model.ts
  function spatialForward(input, weights) {
    const { height: h, width: w } = input, area = h * w;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const normalization = (x, rows, c, key, relu = true) => norm(x, rows, c, weights[key + ".weight"], weights[key + ".bias"], 8, relu);
    const block = (x, hh, ww, c, key) => {
      const rank = c === 96 ? 16 : 8;
      let z3 = normalization(dense(x, hh * ww, c, rank, key + ".reduce"), hh * ww, rank, key + ".norm1");
      z3 = normalization(depthwise(z3, hh, ww, rank, weights[key + ".depth.weight"], weights[key + ".depth.bias"]), hh * ww, rank, key + ".norm2");
      return add(x, normalization(dense(z3, hh * ww, rank, c, key + ".expand"), hh * ww, c, key + ".norm3", false), 0.5, true);
    };
    const patches = tensor(area * 306);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 34; c++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w) patches[(y * w + x) * 306 + c * 9 + (dy + 1) * 3 + dx + 1] = input.spatialTensor[c * area + (y + dy) * w + x + dx];
    }
    let z0 = normalization(dense(patches, area, 306, 48, "map.stem"), area, 48, "map.stem_norm");
    z0 = block(block(z0, h, w, 48, "map.stage0.0"), h, w, 48, "map.stage0.1");
    const h1 = Math.ceil(h / 2), w1 = Math.ceil(w / 2), h2 = Math.ceil(h1 / 2), w2 = Math.ceil(w1 / 2);
    let z1 = dense(pool(z0, h, w, 48), h1 * w1, 48, 64, "map.down1");
    z1 = block(block(z1, h1, w1, 64, "map.stage1.0"), h1, w1, 64, "map.stage1.1");
    let z2 = dense(pool(z1, h1, w1, 64), h2 * w2, 64, 96, "map.down2");
    z2 = block(block(z2, h2, w2, 96, "map.stage2.0"), h2, w2, 96, "map.stage2.1");
    const context = dense(input.playerOrder.features, 1, 66, 96, "map.context");
    for (let i = 0; i < z2.length; i++) z2[i] += context[i % 96];
    let z = block(add(dense(upsample(z2, w2, h1, w1, 96), h1 * w1, 96, 64, "map.up1"), z1), h1, w1, 64, "map.decode1");
    z = block(add(dense(upsample(z, w1, h, w, 64), area, 64, 48, "map.up0"), z0), h, w, 48, "map.decode0");
    const map = dense(z, area, 48, 64, "map.out"), pooled = tensor(64);
    for (let c = 0; c < 64; c++) {
      let sum = 0;
      for (let tile = 0; tile < area; tile++) sum += map[tile * 64 + c];
      pooled[c] = sum / area;
    }
    return { map, pooled };
  }

  // ../src/ai_runtime/dual_v2/attention.ts
  function relationalAttention(qkv, tokens, entities, bias) {
    const out = tensor(tokens * 128);
    for (let head = 0; head < 4; head++) {
      const q = tensor(tokens * 32), k = tensor(tokens * 32), vTranspose = tensor(tokens * 32);
      for (let i = 0; i < tokens; i++) for (let c = 0; c < 32; c++) {
        q[i * 32 + c] = qkv[i * 384 + head * 32 + c];
        k[i * 32 + c] = qkv[i * 384 + 128 + head * 32 + c];
        vTranspose[c * tokens + i] = qkv[i * 384 + 256 + head * 32 + c];
      }
      const scores = linear(q, tokens, 32, k, tokens, void 0, false);
      for (let i = 0; i < tokens; i++) {
        let max = -Infinity, sum = 0;
        for (let j = 0; j < tokens; j++) {
          const idx = i * tokens + j;
          scores[idx] = Math.fround(scores[idx] / Math.sqrt(32)) + (i < entities && j < entities ? bias[(i * entities + j) * 4 + head] : 0);
          max = Math.max(max, scores[idx]);
        }
        for (let j = 0; j < tokens; j++) {
          const idx = i * tokens + j;
          scores[idx] = Math.exp(scores[idx] - max);
          sum += scores[idx];
        }
        for (let j = 0; j < tokens; j++) scores[i * tokens + j] /= sum;
      }
      const attended = linear(scores, tokens, tokens, vTranspose, 32, void 0, false);
      for (let i = 0; i < tokens; i++) out.set(attended.subarray(i * 32, (i + 1) * 32), i * 128 + head * 32);
    }
    return out;
  }

  // ../src/ai_runtime/dual_v2/entity_model.ts
  function entityForward(input, map, pooled, weights) {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const normalization = (x, rows, key, relu = false) => norm(x, rows, 128, weights[key + ".weight"], weights[key + ".bias"], 0, relu);
    const tokens = tensor(n * 130), relations = tensor(input.relationalBias.length);
    for (let i = 0; i < relations.length; i++) relations[i] = Math.max(-4, Math.min(4, input.relationalBias[i]));
    for (let i = 0; i < n; i++) {
      const raw = input.entityTokens.subarray(i * 66, (i + 1) * 66), tile = raw[34] * input.width + raw[33];
      for (let c = 0; c < 66; c++) tokens[i * 130 + c] = Math.max(-4, Math.min(4, raw[c] * (c === 33 || c === 34 ? 1 / 64 : 1)));
      tokens.set(map.subarray(tile * 64, (tile + 1) * 64), i * 130 + 66);
    }
    let ent = tensor(t * 128);
    ent.set(normalization(dense(tokens, n, 130, 128, "entity_proj"), n, "entity_norm", true));
    const global = tensor(130);
    global.set(pooled);
    global.set(input.playerOrder.features, 64);
    ent.set(normalization(dense(global, 1, 130, 128, "global_proj"), 1, "global_norm", true), n * 128);
    const hiddenRel = dense(relations, n * n, 16, 16, "rel1");
    for (let i = 0; i < hiddenRel.length; i++) hiddenRel[i] = Math.max(0, hiddenRel[i]);
    const bias = dense(hiddenRel, n * n, 16, 4, "rel2");
    for (let layer = 0; layer < 2; layer++) {
      const key = `blocks.${layer}`, qkv = dense(normalization(ent, t, key + ".ln1"), t, 128, 384, key + ".qkv");
      const attended = relationalAttention(qkv, t, n, bias);
      ent = add(ent, dense(attended, t, 128, 128, key + ".proj"));
      const ff = dense(normalization(ent, t, key + ".ln2"), t, 128, 256, key + ".ff1");
      for (let i = 0; i < ff.length; i++) ff[i] = Math.max(0, ff[i]);
      ent = add(ent, dense(ff, t, 256, 128, key + ".ff2"));
    }
    return { entities: ent, relations };
  }

  // ../src/ai_runtime/dual_v2/policy_model.ts
  function policyForward(input, ent, map, relations, weights) {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1, area = input.width * input.height;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const ptr = input.actions.pointers, tileRows = new Int32Array(area).fill(-1), usedTiles = [];
    for (let a = 0; a < ptr.length; a += 5) {
      const tile = ptr[a + 1];
      if (tile >= 0 && tileRows[tile] < 0) {
        tileRows[tile] = usedTiles.length;
        usedTiles.push(tile);
      }
    }
    const tileFeatures = tensor(usedTiles.length * 64);
    for (let i = 0; i < usedTiles.length; i++) tileFeatures.set(map.subarray(usedTiles[i] * 64, (usedTiles[i] + 1) * 64), i * 64);
    const who = dense(ent, t, 128, 1, "who"), query = dense(ent, t, 128, 64, "tile_q"), keys = dense(tileFeatures, usedTiles.length, 64, 64, "tile_k");
    const semanticEntity = dense(ent, t, 128, 36, "what_entity"), semanticTile = dense(keys, usedTiles.length, 64, 36, "what_tile");
    const logits = tensor(ptr.length / 5), headIndex = { 1: 0, 7: 1, 8: 2, 9: 3 };
    const targetQueries = /* @__PURE__ */ new Map(), targetKeys = /* @__PURE__ */ new Map();
    const projectTarget = (entity, hi, kind, cache) => {
      const id = entity * 4 + hi;
      let result = cache.get(id);
      if (!result) {
        const key = `target_${kind}`;
        result = linear(ent.subarray(entity * 128, (entity + 1) * 128), 1, 128, weights[key + ".weight"].subarray(hi * 64 * 128, (hi + 1) * 64 * 128), 64, weights[key + ".bias"].subarray(hi * 64, (hi + 1) * 64));
        cache.set(id, result);
      }
      return result;
    };
    for (let a = 0; a < logits.length; a++) {
      const actor = ptr[a * 5], tile = ptr[a * 5 + 1], head = ptr[a * 5 + 2], cls = ptr[a * 5 + 3], target = ptr[a * 5 + 4];
      const tileRow = tile >= 0 ? tileRows[tile] : -1;
      let where = 0, targetScore = 0;
      if (tileRow >= 0) {
        for (let c = 0; c < 64; c++) where += query[actor * 64 + c] * keys[tileRow * 64 + c];
        where = Math.fround(where) / 8;
      }
      let what = Math.fround(semanticEntity[actor * 36 + head] + (tileRow >= 0 ? semanticTile[tileRow * 36 + head] : 0));
      if (cls >= 0) what = Math.fround(what + Math.fround(semanticEntity[actor * 36 + 15 + cls] + (tileRow >= 0 ? semanticTile[tileRow * 36 + 15 + cls] : 0)));
      if (target >= 0) {
        const hi = headIndex[head];
        let dot = 0, rel = 0;
        const tq = projectTarget(actor, hi, "q", targetQueries), tk = projectTarget(target, hi, "k", targetKeys);
        for (let c = 0; c < 64; c++) dot += tq[c] * tk[c];
        if (actor < n && target < n) for (let c = 0; c < 16; c++) rel += weights.target_rel[hi * 16 + c] * relations[(actor * n + target) * 16 + c];
        targetScore = Math.fround(Math.fround(dot) / 8 + Math.fround(rel));
      }
      logits[a] = Math.fround(Math.fround(Math.fround(who[actor] + where) + what) + targetScore) + weights.headBias[head];
    }
    const prior = softmax(logits), actorPrior = tensor(t), conditionalPrior = tensor(prior.length);
    const marginal = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) marginal[ptr[a * 5]] += prior[a];
    for (let actor = 0; actor < t; actor++) actorPrior[actor] = marginal[actor];
    const actorMax = tensor(t).fill(-Infinity), actorSum = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) {
      const actor = ptr[a * 5];
      actorMax[actor] = Math.max(actorMax[actor], logits[a]);
    }
    for (let a = 0; a < prior.length; a++) {
      const actor = ptr[a * 5];
      conditionalPrior[a] = Math.exp(logits[a] - actorMax[actor]);
      actorSum[actor] += conditionalPrior[a];
    }
    for (let a = 0; a < prior.length; a++) conditionalPrior[a] /= actorSum[ptr[a * 5]];
    return { logits, actorPrior, conditionalPrior };
  }

  // ../src/ai_runtime/dual_v2/value_model.ts
  function valueForward(input, ent, pooled, weights) {
    const n = input.entityIndexMap.globalActorIdx, vectors = tensor(6 * 459);
    let armySum = 0;
    for (let s = 0; s < 6; s++) {
      const base = s * 459, mean = new Float64Array(128), max = tensor(128).fill(-Infinity);
      let count = 0;
      for (let i = 0; i < n; i++) if (input.entityTokens[i * 66] > 0.5 && input.entityTokens[i * 66 + 24 + s] > 0.5) {
        for (let c = 0; c < 128; c++) {
          const v = ent[i * 128 + c];
          mean[c] += v;
          max[c] = Math.max(max[c], v);
        }
        count++;
      }
      vectors.set(input.playerOrder.features.subarray(s * 11, (s + 1) * 11), base);
      for (let c = 0; c < 128; c++) {
        vectors[base + 11 + c] = count ? mean[c] / count : 0;
        vectors[base + 139 + c] = count ? max[c] : 0;
      }
      vectors.set(ent.subarray(n * 128), base + 267);
      vectors.set(pooled, base + 395);
      armySum += Math.max(0, input.playerOrder.features[s * 11 + 7]) * input.playerOrder.active[s];
    }
    const hidden = linear(vectors, 6, 459, weights["value1.weight"], 128, weights["value1.bias"]);
    const normalized = norm(hidden, 6, 128, weights["value_norm.weight"], weights["value_norm.bias"], 0, true);
    const valueLogits = linear(normalized, 6, 128, weights["value2.weight"], 1, weights["value2.bias"]);
    for (let s = 0; s < 6; s++) valueLogits[s] = input.playerOrder.active[s] ? valueLogits[s] + weights.army_scale[0] * Math.max(0, input.playerOrder.features[s * 11 + 7]) / Math.max(1e-12, armySum) : -1e9;
    return { valueLogits, valueProbs: softmax(valueLogits, input.playerOrder.active) };
  }

  // ../src/ai_runtime/dual_v2/model_weights.ts
  var MODEL_ID = "dual-stream-v2-phase2-v1";
  function expectedWeightShapes() {
    const shapes = {};
    const dense = (name, input, output, kernel = 0, bias = true) => {
      shapes[name + ".weight"] = kernel ? [output, input, kernel, kernel] : [output, input];
      if (bias) shapes[name + ".bias"] = [output];
    };
    const normalization = (name, channels) => {
      shapes[name + ".weight"] = [channels];
      shapes[name + ".bias"] = [channels];
    };
    const block = (name, c) => {
      const r = c === 96 ? 16 : 8;
      dense(name + ".reduce", c, r, 1);
      normalization(name + ".norm1", r);
      shapes[name + ".depth.weight"] = [r, 1, 3, 3];
      shapes[name + ".depth.bias"] = [r];
      normalization(name + ".norm2", r);
      dense(name + ".expand", r, c, 1);
      normalization(name + ".norm3", c);
    };
    dense("map.stem", 34, 48, 3);
    normalization("map.stem_norm", 48);
    for (const [stage, c] of [48, 64, 96].entries()) for (let i = 0; i < 2; i++) block(`map.stage${stage}.${i}`, c);
    dense("map.down1", 48, 64, 1);
    dense("map.down2", 64, 96, 1);
    dense("map.context", 66, 96);
    dense("map.up1", 96, 64, 1);
    block("map.decode1", 64);
    dense("map.up0", 64, 48, 1);
    block("map.decode0", 48);
    dense("map.out", 48, 64, 1);
    dense("entity_proj", 130, 128);
    normalization("entity_norm", 128);
    dense("global_proj", 130, 128);
    normalization("global_norm", 128);
    dense("rel1", 16, 16);
    dense("rel2", 16, 4);
    for (let i = 0; i < 2; i++) {
      const b = `blocks.${i}`;
      normalization(b + ".ln1", 128);
      dense(b + ".qkv", 128, 384);
      dense(b + ".proj", 128, 128);
      normalization(b + ".ln2", 128);
      dense(b + ".ff1", 128, 256);
      dense(b + ".ff2", 256, 128);
    }
    dense("who", 128, 1);
    dense("tile_q", 128, 64);
    dense("tile_k", 64, 64, 1);
    dense("what_entity", 128, 36);
    dense("what_tile", 64, 36, 0, false);
    dense("target_q", 128, 256);
    dense("target_k", 128, 256);
    shapes.target_rel = [4, 16];
    shapes.headBias = [15];
    dense("value1", 459, 128);
    normalization("value_norm", 128);
    dense("value2", 128, 1);
    shapes.army_scale = [1];
    return shapes;
  }
  function loadModelWeights(manifest, binary) {
    if (manifest.model !== MODEL_ID || manifest.schema !== SCHEMA_ID || manifest.dtype !== "float32-le") throw Error("\u6A21\u578B\u6216\u8F93\u5165\u5951\u7EA6\u7248\u672C\u4E0D\u5339\u914D");
    const expected = expectedWeightShapes(), weights = {};
    let offset = 0;
    if (binary && binary.byteLength !== manifest.parameters * 4) throw Error("\u4E8C\u8FDB\u5236\u6743\u91CD\u957F\u5EA6\u9519\u8BEF");
    const view = binary ? new DataView(binary) : void 0;
    for (const tensor2 of manifest.tensors) {
      const shape = expected[tensor2.name];
      if (!shape || weights[tensor2.name] || JSON.stringify(shape) !== JSON.stringify(tensor2.shape) || tensor2.offset !== offset || tensor2.length !== shape.reduce((a, b) => a * b, 1)) throw Error(`\u6743\u91CD\u5F62\u72B6\u6216\u504F\u79FB\u9519\u8BEF\uFF1A${tensor2.name}`);
      if (!view && tensor2.values?.length !== tensor2.length) throw Error("JSON\u5185\u5D4C\u6743\u91CD\u7F3A\u5931");
      const data = new Float32Array(tensor2.length);
      for (let i = 0; i < data.length; i++) {
        data[i] = view ? view.getFloat32((offset + i) * 4, true) : tensor2.values[i];
        if (!Number.isFinite(data[i])) throw Error("\u6A21\u578B\u5305\u542B\u975E\u6709\u9650\u6743\u91CD");
      }
      weights[tensor2.name] = data;
      offset += tensor2.length;
    }
    if (offset !== manifest.parameters || Object.keys(weights).length !== Object.keys(expected).length) throw Error("\u6A21\u578B\u6743\u91CD\u4E0D\u5B8C\u6574");
    return weights;
  }

  // ../src/ai_runtime/dual_v2/model_runtime.ts
  var DualStreamModel = class {
    constructor(manifest, binary) {
      this.workspace = new TensorWorkspace();
      this.weights = loadModelWeights(manifest, binary);
    }
    forward(input) {
      const n = input.entityIndexMap.globalActorIdx, area = input.width * input.height;
      if (input.schema !== SCHEMA_ID || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 6 || input.height < 6 || input.width > 64 || input.height > 64) throw Error("\u6A21\u578B\u4EC5\u652F\u63016\u81F364\u7684\u77E9\u5F62\u5730\u56FE\u4E0E\u51BB\u7ED3\u8F93\u5165\u5951\u7EA6");
      if (input.spatialTensor.length !== area * 34 || input.entityTokens.length !== n * 66 || input.relationalBias.length !== n * n * 16 || input.playerOrder.features.length !== 66 || input.playerOrder.active.length !== 6 || input.actions.actorMask.length !== n + 1 || !input.actions.pointers.length || input.actions.pointers.length % 5) throw Error("\u6A21\u578B\u8F93\u5165\u5F20\u91CF\u5F62\u72B6\u9519\u8BEF");
      for (const data of [input.spatialTensor, input.entityTokens, input.relationalBias, input.playerOrder.features]) for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) throw Error("\u6A21\u578B\u8F93\u5165\u5305\u542B\u975E\u6709\u9650\u6570\u503C");
      for (let i = 0; i < n; i++) {
        const x = input.entityTokens[i * 66 + 33], y = input.entityTokens[i * 66 + 34];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= input.width || y >= input.height) throw Error("\u5B9E\u4F53\u7A7A\u95F4\u91C7\u6837\u5750\u6807\u8D8A\u754C");
      }
      const p = input.actions.pointers;
      for (let a = 0; a < p.length; a += 5) if (p[a] < 0 || p[a] > n || !input.actions.actorMask[p[a]] || p[a + 1] < -1 || p[a + 1] >= area || p[a + 2] < 0 || p[a + 2] >= 15 || p[a + 3] < -1 || p[a + 3] >= 21 || p[a + 4] < -1 || p[a + 4] >= n || p[a + 4] >= 0 && ![1, 7, 8, 9].includes(p[a + 2])) throw Error("\u5408\u6CD5\u52A8\u4F5C\u6307\u9488\u8D8A\u754C");
      return withTensorWorkspace(this.workspace, () => {
        const spatial = spatialForward(input, this.weights), entity = entityForward(input, spatial.map, spatial.pooled, this.weights);
        const out = { ...policyForward(input, entity.entities, spatial.map, entity.relations, this.weights), ...valueForward(input, entity.entities, spatial.pooled, this.weights) };
        return { logits: out.logits.slice(), actorPrior: out.actorPrior.slice(), conditionalPrior: out.conditionalPrior.slice(), valueLogits: out.valueLogits.slice(), valueProbs: out.valueProbs.slice() };
      });
    }
  };

  // dual_stream_v2_phase4_20261020/browser.ts
  var argmax = (x) => {
    let best = 0;
    for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i;
    return best;
  };
  async function main() {
    const prefix = new URL(location.href).searchParams.get("prefix") ?? "dual-v2-stage4-pure";
    const [manifest, weights, meta, bytes, reference, node] = await Promise.all([
      fetch(`/${prefix}.json`).then((r) => r.json()),
      fetch(`/${prefix}.bin`).then((r) => r.arrayBuffer()),
      fetch("/samples.json").then((r) => r.json()),
      fetch("/samples.bin").then((r) => r.arrayBuffer()),
      fetch(`/${prefix}-torch-reference.json`).then((r) => r.json()),
      fetch(`/${prefix}-node-output.json`).then((r) => r.json())
    ]);
    const model = new DualStreamModel(manifest, weights), arrays = Array.from({ length: meta.batches }, () => ({}));
    for (const e of meta.arrays) {
      const raw = bytes.slice(e.offset, e.offset + e.bytes);
      arrays[e.batch][e.name] = e.dtype === "<f4" ? new Float32Array(raw) : e.dtype === "<i4" ? new Int32Array(raw) : new Uint8Array(raw);
    }
    let maxLogit = 0, maxActor = 0, maxValue = 0, maxNode = 0;
    const [pipelineInputs, pipelineReference, finalBias, finalConfig] = await Promise.all([fetch("/pipeline-inputs.json").then((r) => r.json()), fetch("/pipeline-reference.json").then((r) => r.json()), fetch("/head-calibration.json").then((r) => r.json()), fetch("/value-config.json").then((r) => r.json())]);
    let pipelineError = 0, pipelineArgmax = true;
    const receipts = arrays.map((a, i) => {
      const source = meta.sources[i], n = a.entities.length / 66;
      const observation = {
        schema: "dual-stream-v2-phase1-v1",
        width: source.width,
        height: source.height,
        spatialTensor: a.spatial,
        entityTokens: a.entities,
        relationalBias: a.relations,
        playerOrder: { features: a.players, active: a.active, playerIds: [], slotByPlayer: /* @__PURE__ */ new Map() },
        entityIndexMap: { globalActorIdx: n, entities: [], units: /* @__PURE__ */ new Map(), castles: /* @__PURE__ */ new Map(), graves: /* @__PURE__ */ new Map() },
        actions: { pointers: a.pointers, actorMask: a.actorMask, sourceIndices: new Int32Array(a.pointers.length / 5), tilesByActor: /* @__PURE__ */ new Map(), rowsByActorTile: /* @__PURE__ */ new Map() }
      };
      const out = model.forward(observation);
      let logitError = 0, actorError = 0, valueError = 0, nodeError = 0;
      const final = pipelineOutput(pipelineInputs[i], out, finalBias.headBias, finalConfig);
      for (const key of ["scores", "valueProbs"]) for (let j = 0; j < final[key].length; j++) pipelineError = Math.max(pipelineError, Math.abs(final[key][j] - pipelineReference[i][key][j]));
      pipelineArgmax &&= argmax([...final.scores]) === argmax(pipelineReference[i].scores) && argmax(final.valueProbs) === argmax(pipelineReference[i].valueProbs);
      for (let j = 0; j < out.logits.length; j++) logitError = Math.max(logitError, Math.abs(out.logits[j] - reference[i].logits[j]));
      for (let j = 0; j < out.actorPrior.length; j++) actorError = Math.max(actorError, Math.abs(out.actorPrior[j] - reference[i].actorPrior[j]));
      for (let j = 0; j < 6; j++) valueError = Math.max(valueError, Math.abs(out.valueProbs[j] - reference[i].valueProbs[j]));
      for (const key of ["logits", "actorPrior", "valueProbs"]) for (let j = 0; j < out[key].length; j++) nodeError = Math.max(nodeError, Math.abs(out[key][j] - node[i][key][j]));
      maxLogit = Math.max(maxLogit, logitError);
      maxActor = Math.max(maxActor, actorError);
      maxValue = Math.max(maxValue, valueError);
      maxNode = Math.max(maxNode, nodeError);
      return { ...source, logitError, actorError, valueError, nodeError, actionMatch: argmax(out.logits) === argmax(reference[i].logits) && argmax(out.logits) === argmax(node[i].logits), actorMatch: argmax(out.actorPrior) === argmax(reference[i].actorPrior) && argmax(out.actorPrior) === argmax(node[i].actorPrior) };
    });
    let calibratedError = 0;
    const valueInputs = await fetch("/value-parity-inputs.json").then((r) => r.json());
    const config = await fetch("/value-config.json").then((r) => r.json());
    for (const row of valueInputs) {
      const result = calibrateValue(row.logits, row.active, row.features, config);
      for (let s = 0; s < 6; s++) calibratedError = Math.max(calibratedError, Math.abs(result[s] - row.expected[s]));
    }
    return { pipelineError, pipelineArgmax, finalPipelineOriginalStates: 89, calibratedError, calibratedSamples: valueInputs.length, passed: pipelineError < 1e-5 && pipelineArgmax && calibratedError < 1e-5 && maxLogit < 1e-6 && maxActor < 1e-6 && maxValue < 1e-6 && maxNode < 1e-6 && receipts.every((r) => r.actionMatch && r.actorMatch), prefix, userAgent: navigator.userAgent, maxLogit, maxActor, maxValue, maxNode, receipts };
  }
  main().catch((error) => ({ passed: false, error: String(error), stack: error.stack })).then((result) => fetch("/complete", { method: "POST", body: JSON.stringify(result) }));
})();
