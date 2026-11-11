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
    var _a;
    if (tile.apkTerrainId !== void 0) {
      return (tile.apkTerrainKind ?? ((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.kind)) === 5;
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
    var _a;
    tile.ownerId = null;
    if (tile.apkTerrainId === void 0) return;
    tile.apkOwnerCode = ((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.flagB) !== 0 ? 254 : 255;
    rewriteApkTerrainRaw(tile);
  }
  function isTileDestroyableForRules(tile) {
    var _a;
    if (tile.apkTerrainId !== void 0) {
      return (((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.linkedB) ?? -1) >= 0;
    }
    return getTileTerrainKey(tile) === "town";
  }
  function destroyTileForRules(tile) {
    var _a;
    if (tile.apkTerrainId !== void 0) {
      const destroyedApkTerrainId = ((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.linkedB) ?? -1;
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
    var _a;
    if (tile.apkTerrainId === void 0) return null;
    return ((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a[field]) ?? null;
  }
  function getTileDefenseBonus(tile) {
    var _a;
    return getApkTerrainValue(tile, "defenseBonus") ?? ((_a = getTileTerrainConfig(tile)) == null ? void 0 : _a.defenseBonus) ?? 0;
  }
  function getTileHealPerTurn(tile) {
    var _a;
    return getApkTerrainValue(tile, "healPerTurn") ?? ((_a = getTileTerrainConfig(tile)) == null ? void 0 : _a.healPerTurn) ?? 0;
  }
  function tileHealingRequiresFriendlyOwner(tile) {
    var _a;
    if (tile.apkTerrainId !== void 0) {
      return ((_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.flagB) !== 0;
    }
    return getTileTerrainConfig(tile).tags.includes("capturable");
  }
  function getTileMoveCost(tile) {
    var _a;
    return getApkTerrainValue(tile, "moveCost") ?? ((_a = getTileTerrainConfig(tile)) == null ? void 0 : _a.moveCost) ?? 1;
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
    var _a, _b;
    return ((_b = (_a = state.rules) == null ? void 0 : _a.teams) == null ? void 0 : _b[playerId]) ?? DEFAULT_RULE_CONFIG.teams[playerId] ?? {};
  }
  function getAllianceId(state, playerId) {
    var _a, _b;
    return ((_b = (_a = state.rules) == null ? void 0 : _a.alliances) == null ? void 0 : _b[playerId]) ?? DEFAULT_RULE_CONFIG.alliances[playerId] ?? playerId;
  }
  function areAlliedPlayers(state, playerA, playerB) {
    return getAllianceId(state, playerA) === getAllianceId(state, playerB);
  }
  function areEnemyPlayers(state, playerA, playerB) {
    return !areAlliedPlayers(state, playerA, playerB);
  }
  function isTeamEnabled(state, playerId) {
    var _a;
    return !(((_a = state.rules) == null ? void 0 : _a.disabledTeams) ?? DEFAULT_RULE_CONFIG.disabledTeams).includes(playerId);
  }
  function isActivePlayer(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    return !!(player == null ? void 0 : player.isAlive) && isTeamEnabled(state, playerId);
  }
  function getTurnPlayerIds(state) {
    return state.players.filter((player) => isActivePlayer(state, player.id)).map((player) => player.id).sort((a, b) => a - b);
  }
  function isCommanderUnit(state, unit, teamId) {
    var _a, _b;
    if (teamId !== void 0 && unit.ownerId !== teamId) return false;
    const commanderUnitId = ((_b = (_a = state.rules) == null ? void 0 : _a.commanderUnitIds) == null ? void 0 : _b[unit.ownerId]) ?? DEFAULT_RULE_CONFIG.commanderUnitIds[unit.ownerId];
    if (commanderUnitId !== void 0) {
      return unit.id === commanderUnitId;
    }
    return unit.unitClass === "commander";
  }
  function getCommanderUnit(state, playerId) {
    var _a, _b;
    const commanderUnitId = ((_b = (_a = state.rules) == null ? void 0 : _a.commanderUnitIds) == null ? void 0 : _b[playerId]) ?? DEFAULT_RULE_CONFIG.commanderUnitIds[playerId];
    if (commanderUnitId !== void 0) {
      return state.units.find((unit) => unit.id === commanderUnitId && unit.ownerId === playerId && unit.hp > 0) ?? null;
    }
    return state.units.find((unit) => unit.ownerId === playerId && unit.unitClass === "commander" && unit.hp > 0) ?? null;
  }
  function getUnitCost(state, playerId, unitClass) {
    var _a, _b;
    const prices = (_a = state.rules) == null ? void 0 : _a.prices, defaults = DEFAULT_RULE_CONFIG.prices;
    const priceOverride = prices && Object.prototype.propertyIsEnumerable.call(prices, unitClass) ? prices[unitClass] : defaults[unitClass];
    if (unitClass === "commander") {
      if (priceOverride === null || priceOverride === void 0 && getScalarRule(state, "commanderRecruitBaseCost") === null) return null;
      const baseCost = priceOverride ?? getScalarRule(state, "commanderRecruitBaseCost");
      const deathCount = ((_b = state.players.find((p) => p.id === playerId)) == null ? void 0 : _b.commanderDeathCount) ?? 0;
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
    const teamRules = getTeamRuleConfig(state, playerId);
    const unitLimit = teamRules.unitLimit ?? getScalarRule(state, "unitLimit");
    if (unitLimit !== void 0 && getCurrentUnitCount(state, playerId) >= unitLimit) {
      return false;
    }
    const populationLimit = teamRules.populationLimit ?? getScalarRule(state, "populationLimit");
    if (populationLimit !== void 0 && getCurrentPopulation(state, playerId) + unitConfig2.population > populationLimit) {
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
    return (config == null ? void 0 : config.abilities.includes(ability)) || false;
  }
  function isFlying(unit) {
    return hasAbility(unit, "flying");
  }
  function isUndead(unit) {
    return hasAbility(unit, "undead");
  }
  function terrainHasTag(terrain, tag) {
    var _a;
    if (typeof terrain === "number") {
      return ((_a = TERRAIN_CONFIG[terrain]) == null ? void 0 : _a.tags.includes(tag)) ?? false;
    }
    if (terrain.apkTerrainId !== void 0) {
      const apkConfig = getApkTerrainConfig(terrain.apkTerrainId);
      const apkIsLand = terrain.apkTerrainIsLand ?? (apkConfig ? apkConfig.flagA !== 0 : void 0);
      const apkKind = terrain.apkTerrainKind ?? (apkConfig == null ? void 0 : apkConfig.kind);
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
    var _a, _b;
    const baseMoveCost = tile.apkMoveCost ?? getTileMoveCost(tile);
    const kind = tile.apkTerrainKind ?? (tile.apkTerrainId === void 0 ? void 0 : (_a = getApkTerrainConfig(tile.apkTerrainId)) == null ? void 0 : _a.kind);
    const scripted = kind === void 0 ? void 0 : (_b = unit.apkMoveOverrides) == null ? void 0 : _b[kind];
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
    return calculateDamageAtHp(state, attackerId, defenderId, (attacker == null ? void 0 : attacker.hp) ?? 0);
  }
  function calculateDamageAtHp(state, attackerId, defenderId, extraAttackerHp, attackerOverride) {
    var _a, _b;
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
    const inspiredAttackBonus = ((_a = attacker.status) == null ? void 0 : _a.type) === "inspired" ? dist > 1 ? Math.trunc(getNumericRule(state, "inspiredAttackBonus") / 2) : getNumericRule(state, "inspiredAttackBonus") : 0;
    const isMagic = atkStats.attackType === "magic";
    const weakenedPenalty = dist > 1 ? Math.trunc(getNumericRule(state, "weakenedDefensePenalty") / 2) : getNumericRule(state, "weakenedDefensePenalty");
    const weakenedRangedDefenseAdjustment = ((_b = defender.status) == null ? void 0 : _b.type) === "weakened" ? 10 - weakenedPenalty : 0;
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
    var _a;
    const pendingId = state.pendingUnitId;
    const locked = Boolean(pendingId && ((_a = state.units.find((u) => u.id === pendingId)) == null ? void 0 : _a.apkPendingRecruitSource) !== "empty_castle");
    return state.units.filter((u) => u.ownerId === playerId && !u.hasActed && !u.apkStatic && (!locked || u.id === pendingId));
  }
  function getActionReadyUnitCount(state, playerId) {
    return isActivePlayer(state, playerId) ? actionReadyUnits(state, playerId).length : 0;
  }
  function getLegalActions(state, playerId, query = {}) {
    const actions = [];
    if (!isActivePlayer(state, playerId)) {
      return actions;
    }
    const pendingUnitId = state.pendingUnitId;
    const pendingUnit = pendingUnitId ? state.units.find((u) => u.id === pendingUnitId) : void 0;
    const canResolveEmptyCastlePendingWithTurnAction = (pendingUnit == null ? void 0 : pendingUnit.apkPendingRecruitSource) === "empty_castle";
    const pendingLocksUnitActions = Boolean(pendingUnitId && (pendingUnit == null ? void 0 : pendingUnit.apkPendingRecruitSource) !== "empty_castle");
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
    var _a, _b;
    return ((_b = (_a = state.apkScriptState) == null ? void 0 : _a.booleans) == null ? void 0 : _b[eventFiredKey(eventId)]) === true;
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
    var _a;
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
        const tile = (_a = state.map.tiles[effect.pos.y]) == null ? void 0 : _a[effect.pos.x];
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
    var _a;
    const configured = (_a = state.rules) == null ? void 0 : _a.campaignEvents;
    const events = configured ? JSON.parse(JSON.stringify(configured)) : [...DEFAULT_RULE_CONFIG.campaignEvents];
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
    return (status == null ? void 0 : status.type) === "poisoned" || (status == null ? void 0 : status.type) === "blinded" || (status == null ? void 0 : status.type) === "weakened";
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
      this.queryLegalCache = /* @__PURE__ */ new Map();
      this.movementCosts = /* @__PURE__ */ new Map();
      this.state = cloneGameState(initialState);
      if (options == null ? void 0 : options.unsafeBypassValidationForTests) {
        this.unsafeBypassValidationForTests = true;
      }
      if (options == null ? void 0 : options.disableAutoAdvanceWhenNoMeaningfulAction) {
        this.disableAutoAdvanceWhenNoMeaningfulAction = true;
      }
      this.ensureCurrentPlayerCanAct();
      if ((options == null ? void 0 : options.applyInitialTurnStart) && isActivePlayer(this.state, this.state.currentPlayer)) {
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
      var _a, _b, _c, _d, _e, _f, _g;
      if (this.executingStep || !Number.isFinite(playerId)) return getLegalActions(this.state, playerId, query);
      if (query === void 0 && ((_a = this.fullLegalCache) == null ? void 0 : _a.playerId) === playerId) return this.fullLegalCache.actions;
      let unitId, skipMovement = false, skipRecruitment = false, onlyAttacks = false, onlyOrdinaryMoves = false;
      if (query !== void 0) {
        if (query === null || typeof query !== "object") return getLegalActions(this.state, playerId, query);
        const prototype = Object.getPrototypeOf(query);
        const known = ["unitId", "skipMovement", "skipRecruitment", "onlyAttacks", "onlyOrdinaryMoves"];
        if (prototype !== null && prototype !== Object.prototype) return getLegalActions(this.state, playerId, query);
        const descriptors = Object.getOwnPropertyDescriptors(query), names = Object.getOwnPropertyNames(query);
        if (Object.getOwnPropertySymbols(query).length || names.some((k) => !known.includes(k) || !("value" in descriptors[k])) || known.some((k) => !Object.hasOwn(query, k) && k in query)) return getLegalActions(this.state, playerId, query);
        unitId = (_b = descriptors.unitId) == null ? void 0 : _b.value;
        const movement = (_c = descriptors.skipMovement) == null ? void 0 : _c.value, recruitment = (_d = descriptors.skipRecruitment) == null ? void 0 : _d.value, attacks = (_e = descriptors.onlyAttacks) == null ? void 0 : _e.value, ordinaryMoves = (_f = descriptors.onlyOrdinaryMoves) == null ? void 0 : _f.value;
        if (unitId !== void 0 && typeof unitId !== "string" || [movement, recruitment, attacks, ordinaryMoves].some((v) => v !== void 0 && typeof v !== "boolean")) return getLegalActions(this.state, playerId, query);
        skipMovement = movement === true;
        skipRecruitment = recruitment === true;
        onlyAttacks = attacks === true;
        onlyOrdinaryMoves = ordinaryMoves === true;
      }
      const full = unitId === void 0 && !skipMovement && !skipRecruitment && !onlyAttacks && !onlyOrdinaryMoves;
      if (full && ((_g = this.fullLegalCache) == null ? void 0 : _g.playerId) === playerId) return this.fullLegalCache.actions;
      const key = JSON.stringify([playerId, unitId === void 0 ? null : unitId, skipMovement, skipRecruitment, onlyAttacks, onlyOrdinaryMoves]);
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
    getActionReadyUnitCount(playerId) {
      return getActionReadyUnitCount(this.state, playerId);
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
      const incomeCommanderBase = getScalarRule(this.state, "incomeCommanderBase");
      const incomeCommanderGrowth = getScalarRule(this.state, "incomeCommanderGrowth");
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
          totalIncome += incomeCommanderBase + lvl * incomeCommanderGrowth;
        }
        nextPlayer.gold += totalIncome;
      }
      this.state.units.forEach((u) => {
        var _a;
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
          if (((_a = u.status) == null ? void 0 : _a.type) === "poisoned") {
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
      var _a, _b;
      if (this.isTerminal()) {
        return { state: this.getState(), reward: 0, done: true, info: "Game already ended" };
      }
      if (!this.unsafeBypassValidationForTests) {
        const moving = action.type === "move" || action.type === "post_attack_move";
        const skipRecruitment = action.type !== "recruit_to_castle" && action.type !== "recruit_and_deploy";
        const legalActions = ((_a = this.fullLegalCache) == null ? void 0 : _a.playerId) === this.state.currentPlayer ? this.fullLegalCache.actions : this.getCachedLegalActions(this.state.currentPlayer, moving ? { unitId: action.unitId, skipRecruitment, onlyOrdinaryMoves: action.type === "move" } : action.type === "attack" ? { unitId: action.attackerId, onlyAttacks: true } : { skipMovement: true, skipRecruitment });
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
        if ((unit == null ? void 0 : unit.pos.x) === to.x && unit.pos.y === to.y) return 0;
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
      const levelCap = getScalarRule(this.state, "levelCap");
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
            addExp(attacker, target.hp <= 0 ? KILL_EXP : ATTACK_EXP, levelCap);
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
                addExp(target, attacker.hp <= 0 ? KILL_EXP : ASSIST_EXP, levelCap);
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
                addExp(healer, 60, levelCap);
              }
            } else {
              target.hp += healVal;
            }
            if (target.hp > 0) {
              addExp(healer, 30, levelCap);
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
            addExp(summoner, 10, levelCap);
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
            addExp(supporter, 10, levelCap);
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
            const tile = (_b = this.state.map.tiles[target.y]) == null ? void 0 : _b[target.x];
            if (tile && isTileDestroyableForRules(tile)) {
              destroyTileForRules(tile);
              info = `Unit ${destroyer.id} destroyed town at ${target.x},${target.y}`;
              addExp(destroyer, 30, levelCap);
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
        if (standbyUnit == null ? void 0 : standbyUnit.hasActed) {
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
              addExp(standbyUnit, KILL_EXP * auraResult.killedUnits.length, levelCap);
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
      const ruleConfig = {
        defeatOnNoUnitsAndNoCastles: getScalarRule(this.state, "defeatOnNoUnitsAndNoCastles"),
        defeatOnNoUnits: getScalarRule(this.state, "defeatOnNoUnits"),
        defeatOnCommanderDeath: getScalarRule(this.state, "defeatOnCommanderDeath"),
        defeatOnNoCastles: getScalarRule(this.state, "defeatOnNoCastles")
      };
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
        if (this.getActionReadyUnitCount(this.state.currentPlayer) > 0) return;
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

  // ../src/game/env.ts
  function calculateArmyValue(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    const goldValue = (player == null ? void 0 : player.gold) ?? 0;
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

  // ../src/game/ai/tactical_evaluation.ts
  function posKey(pos) {
    return `${pos.x},${pos.y}`;
  }
  function samePos2(left, right) {
    return left.x === right.x && left.y === right.y;
  }
  function isNegativeStatus2(unit) {
    var _a, _b, _c;
    return ((_a = unit.status) == null ? void 0 : _a.type) === "poisoned" || ((_b = unit.status) == null ? void 0 : _b.type) === "blinded" || ((_c = unit.status) == null ? void 0 : _c.type) === "weakened";
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
      const gold = (player == null ? void 0 : player.gold) ?? 0;
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
      var _a;
      const config = UNIT_CONFIGS[unitClass];
      let score = 0;
      if (this.ownProfile.capturers <= 1 && config.abilities.includes("village_capturer")) score += 2600;
      if (this.ownProfile.castleCapturers === 0 && config.abilities.includes("castle_capturer")) score += 4500;
      if (this.ownProfile.healers === 0 && config.abilities.includes("healer")) score += this.woundedAllyCount() > 0 ? 2800 : 1400;
      if (this.ownProfile.ranged <= 1 && config.maxRange >= 2) score += 1400;
      if (this.ownProfile.magic <= 1 && config.attackType === "magic") score += 1300;
      if (this.ownProfile.destroyers === 0 && config.abilities.includes("destroyer") && this.enemyBuildingCount("town") >= 2) score += 1700;
      if (this.ownProfile.summoners === 0 && config.abilities.includes("summoner") && (((_a = this.state.graves) == null ? void 0 : _a.length) ?? 0) >= 2) score += 1600;
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
      var _a;
      return ((_a = this.state.map.tiles[pos.y]) == null ? void 0 : _a[pos.x]) ?? null;
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

  // ../src/game/ai/heuristic_ai.ts
  var HeuristicAI = class {
    constructor(rng) {
      this.rng = rng ?? Math.random;
    }
    getAction(engine, playerId, preparedActions) {
      var _a;
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
      return ((_a = this.pickBest(nonSurrenderActions)) == null ? void 0 : _a.action) ?? actions[0];
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
      const attackerHpAfter = Math.max(0, (attackerAfter == null ? void 0 : attackerAfter.hp) ?? 0);
      const hpLost = Math.max(0, attacker.hp - attackerHpAfter);
      const counterRiskMultiplier = isCommanderUnit(state, attacker) ? 2.8 : 1;
      const newTargetStatus = !target.status && (targetAfter == null ? void 0 : targetAfter.status) ? targetAfter.status.type : null;
      const newAttackerStatus = !attacker.status && (attackerAfter == null ? void 0 : attackerAfter.status) ? attackerAfter.status.type : null;
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
      var _a;
      const unit = this.getUnit(state, unitId);
      if (!unit) return -1e3;
      const tile = (_a = state.map.tiles[unit.pos.y]) == null ? void 0 : _a[unit.pos.x];
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
      var _a;
      const unit = this.getUnit(state, unitId);
      if (!unit) return -1e3;
      const tile = (_a = state.map.tiles[unit.pos.y]) == null ? void 0 : _a[unit.pos.x];
      const isEnemyOwned = (tile == null ? void 0 : tile.ownerId) !== null && (tile == null ? void 0 : tile.ownerId) !== void 0 && areEnemyPlayers(state, playerId, tile.ownerId);
      return 3600 + (isEnemyOwned ? 1600 : 0) + this.rng() * 20;
    }
    scoreMove(state, playerId, unitId, to, base) {
      var _a;
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
      const tile = (_a = state.map.tiles[to.y]) == null ? void 0 : _a[to.x];
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
      const playerGold = (player == null ? void 0 : player.gold) ?? 0;
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
      var _a;
      const unit = this.getUnit(state, unitId);
      if (!unit) return -1e3;
      const pressure = this.nearestEnemyPressure(state, playerId, unit.pos);
      const tile = (_a = state.map.tiles[unit.pos.y]) == null ? void 0 : _a[unit.pos.x];
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
      return (enemy == null ? void 0 : enemy.pos) ?? this.nearestGlobalObjectivePosition(state, playerId, unit.pos);
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
      var _a;
      const tile = (_a = state.map.tiles[pos.y]) == null ? void 0 : _a[pos.x];
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
      var _a;
      const tile = (_a = state.map.tiles[pos.y]) == null ? void 0 : _a[pos.x];
      if (!tile || tile.ownerId !== playerId || getTileTerrainConfig(tile).key !== "castle") return false;
      if (state.units.some((unit) => unit.hp > 0 && this.isSamePosition(unit.pos, pos))) return false;
      return this.enemyCommanderCanReachPosition(state, playerId, pos);
    }
    isGuardingOwnCastleAgainstCommander(state, playerId, unit) {
      var _a;
      if (unit.ownerId !== playerId || unit.hp <= 0) return false;
      const tile = (_a = state.map.tiles[unit.pos.y]) == null ? void 0 : _a[unit.pos.x];
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
      var _a;
      const tile = (_a = state.map.tiles[pos.y]) == null ? void 0 : _a[pos.x];
      return !!tile && getTileTerrainConfig(tile).key === "castle" && this.isUnfriendlyOwner(state, playerId, tile.ownerId);
    }
    isOwnCastleTile(state, playerId, pos) {
      var _a;
      const tile = (_a = state.map.tiles[pos.y]) == null ? void 0 : _a[pos.x];
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

  // ../src/game/ai/apk_like_ai.ts
  var APK_SPECIAL_ABILITIES = [
    "summoner",
    "healer",
    "cleansing_aura",
    "poisoner",
    "weakness_aura",
    "blinder",
    "supporter",
    "repairer",
    "castle_capturer",
    "village_capturer"
  ];
  var GRIM_REAPER_ABILITIES = ["death_reaper"];
  var ApkLikeAI = class {
    constructor(rng) {
      this.rng = rng ?? Math.random;
      this.heuristic = new HeuristicAI(() => this.rng());
    }
    getAction(engine, playerId, preparedActions) {
      const actions = preparedActions ?? engine.getLegalActions(playerId);
      if (actions.length === 0) return { type: "end_turn" };
      const state = engine.getState();
      const candidateActions = this.selectCandidateActions(state, actions, playerId);
      if (candidateActions.length === 0) return this.pickBestAction(engine, playerId, actions);
      return this.pickBestAction(engine, playerId, candidateActions);
    }
    selectCandidateActions(state, actions, playerId) {
      const pendingUnitId = state.pendingUnitId;
      if (pendingUnitId) {
        const pendingUnit = state.units.find((unit) => unit.id === pendingUnitId && unit.ownerId === playerId);
        if (pendingUnit) {
          const pendingActions = this.filterActionsByUnit(actions, pendingUnit.id);
          if (pendingActions.length > 0) return pendingActions;
        }
      }
      const actionUnitIds = /* @__PURE__ */ new Set();
      for (const action of actions) {
        const unitId = this.getActionUnitId(action);
        if (unitId) actionUnitIds.add(unitId);
      }
      const availableUnits = state.units.filter((unit) => unit.ownerId === playerId && !unit.apkStatic && actionUnitIds.has(unit.id)).sort((left, right) => this.compareUnits(state, left, right));
      for (const unit of availableUnits) {
        const unitActions = this.filterActionsByUnit(actions, unit.id);
        if (unitActions.length > 0) {
          return unitActions;
        }
      }
      const nonUnitActions = actions.filter((action) => this.isRecruitOrFinalAction(action));
      if (nonUnitActions.length > 0) return nonUnitActions;
      return [];
    }
    filterActionsByUnit(actions, unitId) {
      const matched = [];
      for (const action of actions) {
        if (this.getActionUnitId(action) === unitId) {
          matched.push(action);
        }
      }
      return matched;
    }
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
    isRecruitOrFinalAction(action) {
      return action.type === "recruit_to_castle" || action.type === "recruit_and_deploy" || action.type === "end_turn" || action.type === "surrender";
    }
    compareUnits(state, left, right) {
      const leftPriority = this.getUnitPriority(state, left);
      const rightPriority = this.getUnitPriority(state, right);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (left.hasMoved !== right.hasMoved) return left.hasMoved ? 1 : -1;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    }
    getUnitPriority(state, unit) {
      if (this.isCommanderOnOwnCastle(state, unit)) return 0;
      if (this.hasAbility(unit, APK_SPECIAL_ABILITIES)) return 1;
      if (this.hasAbility(unit, GRIM_REAPER_ABILITIES)) return 2;
      if (!unit.hasMoved) return 3;
      return 10;
    }
    isCommanderOnOwnCastle(state, unit) {
      var _a;
      if (!isCommanderUnit(state, unit, unit.ownerId)) return false;
      const tile = (_a = state.map.tiles[unit.pos.y]) == null ? void 0 : _a[unit.pos.x];
      if (!tile) return false;
      return getTileTerrainConfig(tile).key === "castle" && tile.ownerId === unit.ownerId;
    }
    hasAbility(unit, abilities) {
      return UNIT_CONFIGS[unit.unitClass].abilities.some((unitAbility) => abilities.includes(unitAbility));
    }
    pickBestAction(engine, playerId, actions) {
      var _a;
      const nonEndTurnActions = actions.filter((action) => action.type !== "surrender");
      const candidateActions = nonEndTurnActions.length > 0 ? nonEndTurnActions : actions;
      const scoredActions = this.heuristic.scoreCandidateActions(engine, playerId, candidateActions);
      let bestAction = ((_a = scoredActions[0]) == null ? void 0 : _a.action) ?? candidateActions[0];
      let bestScore = -Infinity;
      for (const { action, score: baseScore } of scoredActions) {
        const score = baseScore + (this.isAggressiveAction(action) ? this.rng() * 16 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestAction = action;
        } else if (score === bestScore && this.rng() < 0.2) {
          bestAction = action;
        }
      }
      return bestAction;
    }
    isAggressiveAction(action) {
      return action.type === "attack" || action.type === "capture" || action.type === "destroy_town" || action.type === "summon" || action.type === "heal";
    }
  };

  // ../src/ai_runtime/dual_v2/contract.ts
  var SCHEMA_ID = "dual-stream-v2-phase1-v1";
  var PLAYER_SLOTS = 6;
  var MAP_CHANNELS = 34;
  var ENTITY_DIM = 66;
  var RELATION_DIM = 16;
  var UNIT_CLASSES = ["soldier", "ghost", "mermaid", "archer", "slime", "water_elemental", "dark_mage", "witch", "paladin", "elf", "berserker", "wolf", "golem", "ice_elemental", "druid", "catapult", "wolf_archer", "dragon", "commander", "skeleton", "crystal"];
  var ACTION_HEADS = ["move", "attack", "capture", "repair", "wait", "recruit_to_castle", "recruit_and_deploy", "heal", "summon", "support", "destroy_town", "post_attack_move", "surrender", "end_turn", "destroy_town_target"];
  var ENTITY_FIELDS = { unit: 0, castle: 1, grave: 2, classStart: 3, slotStart: 24, self: 30, ally: 31, enemy: 32, x: 33, y: 34, nx: 35, ny: 36, dx: 37, dy: 38, hp: 39, maxHp: 40, armyValue: 41, level: 42, exp: 43, statusStart: 44, moved: 48, acted: 49, postMoved: 50, pending: 51, minRange: 52, maxRange: 53, move: 54, threat: 55, commander: 56, graveTurns: 57, aliveOwner: 58, movementRemaining: 59, healed: 60, supported: 61, static: 62, emptyCastlePending: 63, commanderCastlePending: 64, reserved: 65 };

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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 48 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 48 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 48 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 48 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 48 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 48 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 48 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 48 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 8 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 8 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 8 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 8 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 8 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 8 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 8 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 8 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 48 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 48 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 48 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 48 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 48 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 48 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 48 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 48 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 8 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 8 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 8 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 8 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 8 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 8 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 8 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 8 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 64 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 64 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 64 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 64 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 64 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 64 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 64 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 64 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 16 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 16 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 16 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 16 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 16 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 16 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 16 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 16 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 96 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 96 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 96 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 96 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 96 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 96 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 96 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 96 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 64 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 64 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 64 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 64 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 64 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 64 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 64 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 64 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 96 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 96 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 96 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 96 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 96 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 96 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 96 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 96 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 96 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 96 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 96 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 96 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 96 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 96 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 96 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 96 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 64 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 64 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 64 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 64 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 64 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 64 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 64 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 64 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 48 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 48 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 48 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 48 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 48 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 48 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 48 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 48 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 128 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 128 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 128 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 128 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 128 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 128 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 128 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 128 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 16 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 16 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 16 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 16 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 16 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 16 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 16 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 16 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 4 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 4 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 4 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 4 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 4 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 4 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 4 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 4 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 384 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 384 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 384 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 384 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 384 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 384 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 384 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 384 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 128 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 128 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 128 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 128 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 128 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 128 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 128 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 128 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 256 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 256 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 256 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 256 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 256 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 256 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 256 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 256 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 128 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 128 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 128 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 128 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 128 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 128 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 128 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 128 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 64 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 64 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 64 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 64 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 64 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 64 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 64 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 64 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 64 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 64 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 64 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 64 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 64 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 64 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 64 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 64 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 36 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 36 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 36 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 36 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 36 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 36 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 36 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 36 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 36 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 36 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 36 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 36 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 36 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 36 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 36 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 36 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + 0 + o + 0] = s00 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 0 + o + 1] = s01 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 0 + o + 2] = s02 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 0 + o + 3] = s03 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + 128 + o + 0] = s10 + ((bias == null ? void 0 : bias[o + 0]) ?? 0);
        y[yi + 128 + o + 1] = s11 + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + 128 + o + 2] = s12 + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + 128 + o + 3] = s13 + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
      y[r * 128 + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
      y[r * 128 + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
      y[r * 128 + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
      y[r * 128 + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
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
        y[yi + o] = a + ((bias == null ? void 0 : bias[o]) ?? 0);
        y[yi + o + 1] = b + ((bias == null ? void 0 : bias[o + 1]) ?? 0);
        y[yi + o + 2] = c + ((bias == null ? void 0 : bias[o + 2]) ?? 0);
        y[yi + o + 3] = d + ((bias == null ? void 0 : bias[o + 3]) ?? 0);
        y[yi + o + 4] = e + ((bias == null ? void 0 : bias[o + 4]) ?? 0);
        y[yi + o + 5] = f + ((bias == null ? void 0 : bias[o + 5]) ?? 0);
        y[yi + o + 6] = g + ((bias == null ? void 0 : bias[o + 6]) ?? 0);
        y[yi + o + 7] = h + ((bias == null ? void 0 : bias[o + 7]) ?? 0);
      }
      for (; o < output; o++) {
        let sum = 0;
        for (let k = 0; k < input; k++) sum += x[xi + k] * weight[o * input + k];
        y[yi + o] = sum + ((bias == null ? void 0 : bias[o]) ?? 0);
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
  function computeScalarValue(pVal, state, playerOrder, selfPlayer = playerOrder.playerIds[0]) {
    if (pVal.length !== 6 || playerOrder.playerIds[0] === null) throw Error("\u4EF7\u503C\u69FD\u4F4D\u4E0D\u5B8C\u6574");
    if (selfPlayer === null) throw Error("\u4EF7\u503C\u805A\u5408\u7F3A\u5C11\u641C\u7D22\u73A9\u5BB6");
    const selfAlliance = getAllianceId(state, selfPlayer), groups = /* @__PURE__ */ new Map();
    for (let s = 0; s < 6; s++) {
      const id = playerOrder.playerIds[s];
      if (id === null) continue;
      if (!Number.isFinite(pVal[s]) || pVal[s] < 0 || pVal[s] > 1) throw Error("\u4EF7\u503C\u6982\u7387\u65E0\u6548");
      const alliance = getAllianceId(state, id);
      groups.set(alliance, (groups.get(alliance) ?? 0) + pVal[s]);
    }
    const enemies = [...groups].filter(([id]) => id !== selfAlliance).map(([, value]) => value);
    return (groups.get(selfAlliance) ?? 0) - Math.max(0, ...enemies);
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
    var _a;
    if (manifest.model !== MODEL_ID || manifest.schema !== SCHEMA_ID || manifest.dtype !== "float32-le") throw Error("\u6A21\u578B\u6216\u8F93\u5165\u5951\u7EA6\u7248\u672C\u4E0D\u5339\u914D");
    const expected = expectedWeightShapes(), weights = {};
    let offset = 0;
    if (binary && binary.byteLength !== manifest.parameters * 4) throw Error("\u4E8C\u8FDB\u5236\u6743\u91CD\u957F\u5EA6\u9519\u8BEF");
    const view = binary ? new DataView(binary) : void 0;
    for (const tensor2 of manifest.tensors) {
      const shape = expected[tensor2.name];
      if (!shape || weights[tensor2.name] || JSON.stringify(shape) !== JSON.stringify(tensor2.shape) || tensor2.offset !== offset || tensor2.length !== shape.reduce((a, b) => a * b, 1)) throw Error(`\u6743\u91CD\u5F62\u72B6\u6216\u504F\u79FB\u9519\u8BEF\uFF1A${tensor2.name}`);
      if (!view && ((_a = tensor2.values) == null ? void 0 : _a.length) !== tensor2.length) throw Error("JSON\u5185\u5D4C\u6743\u91CD\u7F3A\u5931");
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

  // ../src/ai_runtime/dual_v2/entity_stream.ts
  function createEntityIndex(state) {
    const entities = [], units = /* @__PURE__ */ new Map(), castles = /* @__PURE__ */ new Map(), graves = /* @__PURE__ */ new Map();
    for (const u of state.units) if (u.hp > 0) {
      if (units.has(u.id)) throw Error("\u5355\u4F4DID\u91CD\u590D");
      units.set(u.id, entities.length);
      entities.push({ kind: "unit", id: u.id, ...u.pos, ownerId: u.ownerId });
    }
    for (let y = 0; y < state.map.height; y++) for (let x = 0; x < state.map.width; x++) {
      const tile = state.map.tiles[y][x];
      if (getTileTerrainKey(tile) === "castle" && tile.ownerId !== null && isActivePlayer(state, tile.ownerId) && areAlliedPlayers(state, state.currentPlayer, tile.ownerId)) {
        const idx = y * state.map.width + x;
        castles.set(idx, entities.length);
        entities.push({ kind: "castle", id: `castle:${idx}`, x, y, ownerId: tile.ownerId });
      }
    }
    for (const g of state.graves ?? []) {
      if (graves.has(g.id)) throw Error("\u5893\u7891ID\u91CD\u590D");
      graves.set(g.id, entities.length);
      entities.push({ kind: "grave", id: g.id, ...g.pos, ownerId: g.ownerId ?? null });
    }
    return { entities, units, castles, graves, globalActorIdx: entities.length };
  }
  function encodeEntityStream(state, order, context, spatial, index) {
    var _a, _b, _c, _d;
    const n = index.entities.length, tokens = new Float32Array(n * ENTITY_DIM), bias = new Float32Array(n * n * RELATION_DIM);
    const focus = ((_a = state.units.find((u) => u.hp > 0 && u.ownerId === state.currentPlayer && isCommanderUnit(state, u))) == null ? void 0 : _a.pos) ?? { x: (state.map.width - 1) / 2, y: (state.map.height - 1) / 2 };
    const graves = new Map((state.graves ?? []).map((g) => [g.id, g]));
    const allies = new Set(state.players.filter((p) => areAlliedPlayers(state, p.id, state.currentPlayer)).map((p) => p.id));
    for (const [i, e] of index.entities.entries()) {
      const t = tokens.subarray(i * ENTITY_DIM, (i + 1) * ENTITY_DIM), u = (_b = context.units.get(e.id)) == null ? void 0 : _b.unit;
      t[e.kind === "unit" ? ENTITY_FIELDS.unit : e.kind === "castle" ? ENTITY_FIELDS.castle : ENTITY_FIELDS.grave] = 1;
      const slot = e.ownerId === null ? void 0 : order.slotByPlayer.get(e.ownerId);
      if (slot !== void 0) t[ENTITY_FIELDS.slotStart + slot] = 1;
      t[ENTITY_FIELDS.self] = Number(e.ownerId === state.currentPlayer);
      t[ENTITY_FIELDS.ally] = Number(e.ownerId !== null && e.ownerId !== state.currentPlayer && allies.has(e.ownerId));
      t[ENTITY_FIELDS.enemy] = Number(e.ownerId !== null && !allies.has(e.ownerId));
      t[ENTITY_FIELDS.x] = e.x;
      t[ENTITY_FIELDS.y] = e.y;
      t[ENTITY_FIELDS.nx] = e.x / Math.max(1, state.map.width - 1);
      t[ENTITY_FIELDS.ny] = e.y / Math.max(1, state.map.height - 1);
      t[ENTITY_FIELDS.dx] = (e.x - focus.x) / state.map.width;
      t[ENTITY_FIELDS.dy] = (e.y - focus.y) / state.map.height;
      t[ENTITY_FIELDS.threat] = spatial[24 * context.area + e.y * state.map.width + e.x];
      t[ENTITY_FIELDS.aliveOwner] = Number(e.ownerId !== null && isActivePlayer(state, e.ownerId));
      if (e.kind === "grave") t[ENTITY_FIELDS.graveTurns] = (((_c = graves.get(e.id)) == null ? void 0 : _c.remainingTurns) ?? 0) / 10;
      if (!u) continue;
      const stats = getEffectiveStats(u);
      t[ENTITY_FIELDS.classStart + UNIT_CLASSES.indexOf(u.unitClass)] = 1;
      t[ENTITY_FIELDS.hp] = u.hp / stats.maxHp;
      t[ENTITY_FIELDS.maxHp] = stats.maxHp / 100;
      t[ENTITY_FIELDS.armyValue] = calculateArmyValue({ ...state, players: [], units: [u] }, u.ownerId) / 1e3;
      t[ENTITY_FIELDS.level] = (u.level ?? 0) / 9;
      t[ENTITY_FIELDS.exp] = (u.exp ?? 0) / 5e3;
      if (u.status) t[ENTITY_FIELDS.statusStart + ["poisoned", "inspired", "blinded", "weakened"].indexOf(u.status.type)] = 1 + (u.status.remainingTicks ?? u.status.remainingTurns ?? 0) / 10;
      t[ENTITY_FIELDS.moved] = Number(u.hasMoved);
      t[ENTITY_FIELDS.acted] = Number(u.hasActed);
      t[ENTITY_FIELDS.postMoved] = Number(Boolean(u.hasPostAttackMoved));
      t[ENTITY_FIELDS.pending] = Number(u.id === state.pendingUnitId);
      t[ENTITY_FIELDS.minRange] = stats.minRange / 10;
      t[ENTITY_FIELDS.maxRange] = stats.maxRange / 10;
      t[ENTITY_FIELDS.move] = stats.move / 20;
      t[ENTITY_FIELDS.commander] = Number(isCommanderUnit(state, u));
      t[ENTITY_FIELDS.movementRemaining] = (u.movementRemaining ?? stats.move) / 20;
      t[ENTITY_FIELDS.healed] = Number(Boolean(u.hasBeenHealedThisTurn));
      t[ENTITY_FIELDS.supported] = Number(Boolean(u.hasBeenSupportedThisTurn));
      t[ENTITY_FIELDS.static] = Number(Boolean(u.apkStatic));
      t[ENTITY_FIELDS.emptyCastlePending] = Number(u.apkPendingRecruitSource === "empty_castle");
      t[ENTITY_FIELDS.commanderCastlePending] = Number(u.apkPendingRecruitSource === "commander_castle");
    }
    for (let i = 0; i < n; i++) {
      const a = index.entities[i], reach = a.kind === "unit" ? context.units.get(a.id) : void 0, u = reach == null ? void 0 : reach.unit;
      const direct = /* @__PURE__ */ new Set(), healing = /* @__PURE__ */ new Set(), support = /* @__PURE__ */ new Set();
      if (u && (reach == null ? void 0 : reach.ready)) for (const action of getLegalActions(state, u.ownerId, { unitId: u.id, skipMovement: true, skipRecruitment: true })) {
        if (action.type === "attack") direct.add(action.targetId);
        if (action.type === "heal") healing.add(action.targetId);
        if (action.type === "support") support.add(action.targetId);
      }
      for (let j = 0; j < n; j++) {
        const b = index.entities[j], v = b.kind === "unit" ? (_d = context.units.get(b.id)) == null ? void 0 : _d.unit : void 0;
        const k = (i * n + j) * RELATION_DIM, distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const allied = a.ownerId !== null && b.ownerId !== null && areAlliedPlayers(state, a.ownerId, b.ownerId);
        const enemy = a.ownerId !== null && b.ownerId !== null && !allied;
        bias[k] = Number(a.ownerId !== null && a.ownerId === b.ownerId);
        bias[k + 1] = Number(allied);
        bias[k + 2] = Number(enemy);
        bias[k + 3] = Math.min(8, distance) / 8;
        const cost = u ? context.paths.cost(u, u.pos, { x: b.x, y: b.y }) : null;
        bias[k + 4] = cost === null ? 1 : Math.min(8, cost) / 9;
        bias[k + 5] = Number(cost !== null);
        bias[k + 6] = Number(direct.has(b.id));
        const projected = u && v && enemy ? context.projectedDamage(u, v) : 0;
        const tileIdx = b.y * state.map.width + b.x;
        bias[k + 7] = Number(Boolean(v && enemy && (reach == null ? void 0 : reach.ready) && (reach.bestOrigins[tileIdx * 2] >= 0 || reach.bestOrigins[tileIdx * 2 + 1] >= 0)));
        bias[k + 8] = v ? projected / Math.max(1, v.hp) : 0;
        bias[k + 9] = Number(Boolean(v && projected >= v.hp));
        bias[k + 10] = Number(healing.has(b.id));
        bias[k + 11] = Number(support.has(b.id));
        bias[k + 12] = Number(Boolean(u && v && allied && distance <= 2 && hasAbility(u, "attack_aura") && (!v.status || v.status.type === "inspired")));
        bias[k + 13] = Number(Boolean(u && v && allied && distance <= 2 && hasAbility(u, "cleansing_aura")));
        bias[k + 14] = Number(Boolean(u && v && enemy && distance <= 2 && hasAbility(u, "weakness_aura") && !hasAbility(v, "weakness_aura") && (!v.status || v.status.type === "weakened")));
        bias[k + 15] = Number(distance === 0);
      }
    }
    return { entityTokens: tokens, relationalBias: bias };
  }

  // ../src/ai_runtime/dual_v2/factored_actions.ts
  function requireIndex(value) {
    if (value === void 0) throw Error("\u52A8\u4F5C\u5F15\u7528\u5B9E\u4F53\u7F3A\u5931");
    return value;
  }
  function encodeFactoredActions(state, legalActions, index) {
    const pointers = [], sourceIndices = [], seen = /* @__PURE__ */ new Set();
    const actorMask = new Uint8Array(index.globalActorIdx + 1), tiles = /* @__PURE__ */ new Map(), rows = /* @__PURE__ */ new Map();
    for (const [source, a] of legalActions.entries()) {
      if (a.type === "surrender") continue;
      let actor = index.globalActorIdx, tile = -1, head = ACTION_HEADS.indexOf(a.type), cls = -1, target = -1;
      const tileIdx = (p) => {
        if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= state.map.width || p.y >= state.map.height) throw Error("\u52A8\u4F5C\u5750\u6807\u8D8A\u754C");
        return p.y * state.map.width + p.x;
      };
      if (a.type === "recruit_to_castle" || a.type === "recruit_and_deploy") {
        actor = requireIndex(index.castles.get(tileIdx(a.castlePos)));
        cls = UNIT_CLASSES.indexOf(a.unitClass);
        tile = tileIdx(a.type === "recruit_and_deploy" ? a.to : a.castlePos);
      } else if (a.type !== "end_turn") {
        const id = "unitId" in a ? a.unitId : "attackerId" in a ? a.attackerId : "healerId" in a ? a.healerId : "supporterId" in a ? a.supporterId : a.summonerId;
        actor = requireIndex(index.units.get(id));
        const entity = index.entities[actor];
        tile = entity.y * state.map.width + entity.x;
        if (a.type === "move" || a.type === "post_attack_move") tile = tileIdx(a.to);
        if (a.type === "attack" || a.type === "heal" || a.type === "support") {
          target = requireIndex(index.units.get(a.targetId));
          tile = tileIdx(index.entities[target]);
        }
        if (a.type === "summon") {
          target = requireIndex(index.graves.get(a.graveId));
          tile = tileIdx(a.spawnPos);
        }
        if (a.type === "destroy_town" && a.target !== void 0) {
          head = 14;
          tile = tileIdx(a.target);
        }
      }
      const tuple = [actor, tile, head, cls, target], key = tuple.join(":");
      if (seen.has(key)) throw Error("\u56E0\u5B50\u5316\u52A8\u4F5C\u6307\u9488\u78B0\u649E\u6216\u8F93\u5165\u52A8\u4F5C\u91CD\u590D");
      seen.add(key);
      const row = sourceIndices.length;
      pointers.push(...tuple);
      sourceIndices.push(source);
      actorMask[actor] = 1;
      if (!tiles.has(actor)) tiles.set(actor, /* @__PURE__ */ new Set());
      tiles.get(actor).add(tile);
      const prefix = `${actor}:${tile}`;
      if (!rows.has(prefix)) rows.set(prefix, []);
      rows.get(prefix).push(row);
    }
    return { pointers: Int32Array.from(pointers), sourceIndices: Int32Array.from(sourceIndices), actorMask, tilesByActor: new Map([...tiles].map(([actor, ts]) => [actor, Int32Array.from([...ts].sort((a, b) => a - b))])), rowsByActorTile: new Map([...rows].map(([key, rs]) => [key, Int32Array.from(rs)])) };
  }

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
      if (!(reach == null ? void 0 : reach.ready)) return 0;
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

  // ../src/ai_runtime/dual_v2/static_threat_map.ts
  function forDiamond(state, origin, radius, visit) {
    for (let dy = -radius; dy <= radius; dy++) {
      const y = origin.y + dy;
      if (y < 0 || y >= state.map.height) continue;
      const span = radius - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const x = origin.x + dx;
        if (x >= 0 && x < state.map.width) visit(y * state.map.width + x);
      }
    }
  }
  function encodeStaticThreatMap(state, order, context, tensor2) {
    const area = context.area;
    const nextEnemy = order.playerIds.find((id, slot) => slot > 0 && id !== null && order.active[slot] && !areAlliedPlayers(state, state.currentPlayer, id));
    const top1 = new Float32Array(area), top2 = new Float32Array(area), top3 = new Float32Array(area);
    const friend1 = new Float32Array(area), friend2 = new Float32Array(area);
    const friendControl = new Uint8Array(area), enemyControl = new Uint8Array(area);
    for (const reach of context.units.values()) {
      const u = reach.unit;
      if (!reach.ready) continue;
      const friendly = areAlliedPlayers(state, state.currentPlayer, u.ownerId);
      for (let idx = 0; idx < area; idx++) {
        if (reach.bestOrigins[idx * 2] < 0 && reach.bestOrigins[idx * 2 + 1] < 0) continue;
        const damage = reach.referenceDamage[idx];
        if (friendly) {
          friendControl[idx] = 1;
          if (damage > friend1[idx]) {
            friend2[idx] = friend1[idx];
            friend1[idx] = damage;
          } else if (damage > friend2[idx]) friend2[idx] = damage;
          if (hasAbility(u, "sharpshooter") || reach.bestOrigins[idx * 2 + 1] >= 0) tensor2[28 * area + idx] += 1;
        } else {
          enemyControl[idx] = 1;
          if (u.ownerId === nextEnemy) {
            tensor2[22 * area + idx] = Math.max(tensor2[22 * area + idx], damage);
            tensor2[23 * area + idx] += 1;
          }
          if (damage > top1[idx]) {
            top3[idx] = top2[idx];
            top2[idx] = top1[idx];
            top1[idx] = damage;
          } else if (damage > top2[idx]) {
            top3[idx] = top2[idx];
            top2[idx] = damage;
          } else if (damage > top3[idx]) top3[idx] = damage;
          if (hasAbility(u, "blinder")) tensor2[25 * area + idx] |= 1;
          if (hasAbility(u, "summoner")) tensor2[25 * area + idx] |= 4;
        }
      }
      const supportChannels = friendly ? [[29, hasAbility(u, "attack_aura") ? 2 : -1], [30, hasAbility(u, "cleansing_aura") ? 2 : -1], [31, hasAbility(u, "healer") ? 1 : -1], [32, hasAbility(u, "supporter") ? 2 : -1]] : [[25, hasAbility(u, "weakness_aura") ? 2 : -1]];
      for (const [channel, radius] of supportChannels) {
        if (radius < 0) continue;
        for (const origin of reach.origins) forDiamond(state, origin, radius, (idx) => {
          if (channel === 25) tensor2[channel * area + idx] |= 2;
          else tensor2[channel * area + idx] = 1;
        });
      }
    }
    for (let idx = 0; idx < area; idx++) {
      tensor2[24 * area + idx] = top1[idx] + top2[idx] + top3[idx];
      tensor2[26 * area + idx] = friend1[idx];
      tensor2[27 * area + idx] = friend1[idx] + friend2[idx];
      const x = idx % state.map.width, y = Math.floor(idx / state.map.width);
      const pass = (nx, ny) => nx >= 0 && ny >= 0 && nx < state.map.width && ny < state.map.height && tensor2[2 * area + ny * state.map.width + nx] <= 1 / 4;
      const h = Number(pass(x - 1, y)) + Number(pass(x + 1, y));
      const v = Number(pass(x, y - 1)) + Number(pass(x, y + 1));
      const choke = tensor2[2 * area + idx] <= 1 / 4 && h + v <= 2 && (h === 2 || v === 2);
      const frontline = friendControl[idx] && (enemyControl[idx] || [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < state.map.width && ny < state.map.height && enemyControl[ny * state.map.width + nx]));
      tensor2[33 * area + idx] = Number(choke) + 2 * Number(Boolean(frontline));
    }
  }

  // ../src/ai_runtime/dual_v2/spatial_stream.ts
  function encodeSpatialStream(state, order, context) {
    const { width, height, tiles } = state.map, area = width * height;
    const tensor2 = new Float32Array(MAP_CHANNELS * area);
    const probes = ["soldier", "mermaid", "ghost"].map((unitClass) => ({ id: "probe", ownerId: state.currentPlayer, unitClass, pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }));
    const terrainKeys = ["snow", "deep_water", "mountain", "hill", "island", "road", "forest", "damaged_town", "town", "castle", "camp", "temple", "special_1", "special_2", "special_3", "water_temple", "bridge"];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const idx = y * width + x, tile = tiles[y][x], config = getTileTerrainConfig(tile);
      tensor2[idx] = (terrainKeys.indexOf(config.key) + 1) / terrainKeys.length;
      tensor2[area + idx] = getTileDefenseBonus(tile) / 20;
      for (let k = 0; k < 3; k++) tensor2[(2 + k) * area + idx] = Math.min(4, getMoveCostForUnit(state, probes[k], tile)) / 4;
      if (config.tags.includes("building")) {
        tensor2[5 * area + idx] = 1;
        const slot = tile.ownerId === null ? void 0 : order.slotByPlayer.get(tile.ownerId);
        const channel = tile.ownerId === null || slot === void 0 ? 13 : slot === 0 ? 6 : areAlliedPlayers(state, state.currentPlayer, tile.ownerId) ? 7 : 7 + slot;
        tensor2[channel * area + idx] = 1;
      }
      tensor2[14 * area + idx] = Number(config.key === "damaged_town");
    }
    for (const grave of state.graves ?? []) {
      const idx = grave.pos.y * width + grave.pos.x;
      tensor2[15 * area + idx] = 1;
      tensor2[16 * area + idx] = grave.remainingTurns / 10;
    }
    const living = state.units.filter((u) => u.hp > 0);
    for (const u of [...living.filter((u2) => u2.id !== state.pendingUnitId), ...living.filter((u2) => u2.id === state.pendingUnitId)]) {
      const idx = u.pos.y * width + u.pos.x, slot = order.slotByPlayer.get(u.ownerId);
      tensor2[17 * area + idx] = slot === void 0 ? -1 : (slot + 1) / PLAYER_SLOTS;
      tensor2[18 * area + idx] = u.ownerId === state.currentPlayer ? 1 : areAlliedPlayers(state, state.currentPlayer, u.ownerId) ? 0.5 : -1;
      tensor2[19 * area + idx] = u.hp / Math.max(1, getEffectiveStats(u).maxHp);
      tensor2[20 * area + idx] = (2 * (u.level ?? 0) + Number(!u.hasActed)) / 20;
      tensor2[21 * area + idx] = Number(isCommanderUnit(state, u));
    }
    encodeStaticThreatMap(state, order, context, tensor2);
    return tensor2;
  }

  // ../src/ai_runtime/dual_v2/encoder.ts
  function encodeDualObservation(state, legalActions, sharedContext) {
    const { width, height, tiles } = state.map;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || tiles.length !== height || tiles.some((row) => row.length !== width)) throw Error("\u5730\u56FE\u77E9\u5F62\u5C3A\u5BF8\u65E0\u6548");
    for (const e of [...state.units.map((u) => u.pos), ...(state.graves ?? []).map((g) => g.pos)]) if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= width || e.y >= height) throw Error("\u5B9E\u4F53\u5750\u6807\u8D8A\u754C");
    const playerOrder = encodePlayerOrder(state), context = sharedContext ?? new ReachabilityContext(state), entityIndexMap = createEntityIndex(state);
    if (context.state !== state) throw Error("\u5BFB\u8DEF\u4E0A\u4E0B\u6587\u5FC5\u987B\u5C5E\u4E8E\u5F53\u524D\u5FEB\u7167");
    const spatialTensor = encodeSpatialStream(state, playerOrder, context), entities = encodeEntityStream(state, playerOrder, context, spatialTensor, entityIndexMap);
    return { schema: SCHEMA_ID, width, height, playerOrder, spatialTensor, ...entities, entityIndexMap, actions: encodeFactoredActions(state, legalActions, entityIndexMap) };
  }

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
    var _a;
    const units = new Map(state.units.map((u) => [u.id, u])), enemies = state.units.filter((u) => u.hp > 0 && !areAlliedPlayers(state, state.currentPlayer, u.ownerId));
    const destinations = /* @__PURE__ */ new Map(), recruit = legal.some((a) => a.type.startsWith("recruit_"));
    const results = legal.map(() => ({ prior: 0, progress: 0, risk: 0, immediate: 0, forbidden: false }));
    const objectives = /* @__PURE__ */ new Map();
    const enemyPlayers = state.players.filter((p) => enemies.some((u) => u.ownerId === p.id));
    const weakest = (_a = enemyPlayers.sort((a, b) => calculateArmyValue(state, a.id) - calculateArmyValue(state, b.id))[0]) == null ? void 0 : _a.id;
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
            if ((key === "castle" || key === "town") && (tile.ownerId === null || !areAlliedPlayers(state, u.ownerId, tile.ownerId))) goals.push({ x, y, weight: key === "castle" && tile.ownerId === weakest ? 2 : 1 });
          }
          for (const e of enemies) if (isCommanderUnit(state, e) || e.hp <= 35) goals.push({ ...e.pos, weight: isCommanderUnit(state, e) ? 2.5 : 2 });
          const reachable = goals.filter((g) => context.paths.cost(u, u.pos, g) !== null);
          objectives.set(u.id, reachable.length ? reachable : enemies.map((e) => ({ ...e.pos, weight: 1 })));
        }
        let before = Infinity, after = Infinity;
        for (const goal of objectives.get(u.id)) {
          before = Math.min(before, (context.paths.cost(u, u.pos, goal) ?? Infinity) / goal.weight);
          after = Math.min(after, (context.paths.cost(u, a.to, goal) ?? Infinity) / goal.weight);
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
  function decodeTacticalGroups(logits, pointers, priors, headBias = []) {
    const scores = new Float64Array(logits.length), groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < logits.length; i++) {
      const head = pointers[i * 5 + 2], group = `${pointers[i * 5]}:${head}`;
      scores[i] = logits[i] + (headBias[head] ?? 0) + priors[i].prior;
      const old = groups.get(group);
      if (old === void 0 || scores[i] > scores[old]) groups.set(group, i);
    }
    let index = -1;
    for (const i of groups.values()) if (index < 0 || scores[i] > scores[index]) index = i;
    return { index, scores };
  }

  // ../src/ai_runtime/dual_v2/multiplayer_leaf.ts
  function unitArmy(state, unit) {
    return calculateArmyValue({ ...state, units: [unit], players: state.players.map((p) => ({ ...p, gold: 0 })) }, unit.ownerId);
  }
  function multiplayerLedger(before, after, selfPlayer, recruitment) {
    const ledger = { net: 0, healingNet: 0, recruitCost: 0, recruitedArmy: 0, recruitSurplus: 0, validRecruits: 0, castles: 0, towns: 0, incomeNet: 0, enemyCastlesCaptured: 0, enemyCommanderKills: 0, enemyKills: 0, allyCommanderLost: 0 };
    const remaining = new Map(after.units.map((u) => [u.id, u]));
    for (const u of before.units) {
      const next = remaining.get(u.id), ally = areAlliedPlayers(before, selfPlayer, u.ownerId), sign = ally ? -1 : 1;
      const delta = unitArmy(before, u) - (next ? unitArmy(after, next) : 0);
      if (delta >= 0) ledger.net += sign * delta / 1024;
      else ledger.healingNet -= sign * -delta / 1024;
      if (!next || next.hp <= 0) {
        if (!ally) {
          ledger.enemyKills++;
          ledger.enemyCommanderKills += Number(isCommanderUnit(before, u));
        } else ledger.allyCommanderLost += Number(isCommanderUnit(before, u));
      }
    }
    ledger.recruitCost = before.players.reduce((s, p) => {
      var _a;
      return s + (areAlliedPlayers(before, selfPlayer, p.id) ? Math.max(0, p.gold - (((_a = after.players.find((q) => q.id === p.id)) == null ? void 0 : _a.gold) ?? p.gold)) : 0);
    }, 0);
    if (recruitment) ledger.recruitCost = recruitment.cost;
    const previousIds = new Set(before.units.map((u) => u.id));
    for (const u of after.units) if (!previousIds.has(u.id) && u.hp > 0 && areAlliedPlayers(before, selfPlayer, u.ownerId)) {
      const recruited = recruitment ? recruitment.unitIds.includes(u.id) : (getUnitCost(after, u.ownerId, u.unitClass) ?? 0) > 0;
      if (!recruitment || recruited) ledger.recruitedArmy += unitArmy(after, u);
      const tile = after.map.tiles[u.pos.y][u.pos.x];
      if (recruited && getTileTerrainKey(tile) !== "castle") ledger.validRecruits++;
    }
    ledger.recruitSurplus = Math.min(0, (ledger.recruitedArmy - ledger.recruitCost) / 1024);
    const ownerSign = (id) => id === null ? 0 : areAlliedPlayers(before, selfPlayer, id) ? 1 : -1;
    for (let y = 0; y < before.map.height; y++) for (let x = 0; x < before.map.width; x++) {
      const b = before.map.tiles[y][x], a = after.map.tiles[y][x], bk = getTileTerrainKey(b), ak = getTileTerrainKey(a);
      ledger.castles += Number(ak === "castle") * ownerSign(a.ownerId) - Number(bk === "castle") * ownerSign(b.ownerId);
      ledger.towns += Number(ak === "town") * ownerSign(a.ownerId) - Number(bk === "town") * ownerSign(b.ownerId);
      ledger.incomeNet += getTileIncome(after, a) * ownerSign(a.ownerId) - getTileIncome(before, b) * ownerSign(b.ownerId);
      ledger.enemyCastlesCaptured += Number(bk === "castle" && ownerSign(b.ownerId) < 0 && ak === "castle" && ownerSign(a.ownerId) > 0);
    }
    return ledger;
  }
  function ledgerScore(l) {
    return 3 * l.net + l.healingNet + l.recruitSurplus + 0.25 * l.validRecruits + 5 * l.castles + 2 * l.towns + l.incomeNet / 150 + 20 * l.enemyCommanderKills + l.enemyKills - 30 * l.allyCommanderLost;
  }

  // ../src/ai_runtime/dual_v2/value_calibration.ts
  function valueCalibrationFeatures(state, order) {
    const configured = state.players.filter((p) => isTeamEnabled(state, p.id)).length;
    const bucket = (configured <= 2 ? 0 : configured === 3 ? 1 : 2) * 3 + (state.turn <= 5 ? 0 : state.turn <= 15 ? 1 : 2);
    const army = order.playerIds.map((id) => id === null ? 0 : calculateArmyValue(state, id));
    const income = order.playerIds.map((id) => id === null ? 0 : state.map.tiles.flat().reduce((s, tile) => s + (tile.ownerId === id ? getTileIncome(state, tile) : 0), 0));
    const commander = order.playerIds.map((id) => state.units.filter((u) => u.ownerId === id && u.hp > 0 && isCommanderUnit(state, u)).length);
    const actionable = order.playerIds.map((id) => state.units.filter((u) => u.ownerId === id && u.hp > 0 && !u.hasActed).length);
    return { bucket, army, income, commander, actionable };
  }
  function calibrateValue(logits, active2, features, calibration) {
    var _a, _b;
    const c = calibration.buckets[features.bucket];
    if (!c || !Number.isFinite(c.temperature) || c.temperature <= 0 || !Number.isFinite(c.army) || !Number.isFinite(c.income)) throw Error("\u4EF7\u503C\u6821\u51C6\u53C2\u6570\u65E0\u6548");
    const aSum = features.army.reduce((s, x, i) => s + Math.max(0, x) * active2[i], 0);
    const iSum = features.income.reduce((s, x, i) => s + Math.max(0, x) * active2[i], 0);
    if (![c.commander ?? 0, c.actionable ?? 0, c.mixture ?? 0].every(Number.isFinite) || (c.mixture ?? 0) < 0 || (c.mixture ?? 0) > 1) throw Error("\u4EF7\u503C\u6DF7\u5408\u53C2\u6570\u65E0\u6548");
    const scores = new Float32Array(6), prior = new Float32Array(6);
    let max = -Infinity, priorMax = -Infinity;
    for (let i = 0; i < 6; i++) {
      scores[i] = active2[i] ? logits[i] / c.temperature + c.army * Math.max(0, features.army[i]) / Math.max(1e-12, aSum) + c.income * Math.max(0, features.income[i]) / Math.max(1e-12, iSum) : -1e9;
      const cmd = ((_a = features.commander) == null ? void 0 : _a[i]) ?? 0, actions = ((_b = features.actionable) == null ? void 0 : _b[i]) ?? 0;
      scores[i] += active2[i] ? (c.commander ?? 0) * cmd + (c.actionable ?? 0) * actions / Math.max(1, ...features.actionable ?? [1]) : 0;
      prior[i] = active2[i] ? c.army * Math.max(0, features.army[i]) / Math.max(1e-12, aSum) + c.income * Math.max(0, features.income[i]) / Math.max(1e-12, iSum) + (c.commander ?? 0) * cmd + (c.actionable ?? 0) * actions / Math.max(1, ...features.actionable ?? [1]) : -1e9;
      if (active2[i]) priorMax = Math.max(priorMax, prior[i]);
      if (active2[i]) max = Math.max(max, scores[i]);
    }
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      scores[i] = active2[i] ? Math.exp(scores[i] - max) : 0;
      sum += scores[i];
    }
    for (let i = 0; i < 6; i++) scores[i] = sum ? scores[i] / sum : 0;
    if (c.mixture) {
      let priorSum = 0;
      for (let i = 0; i < 6; i++) {
        prior[i] = active2[i] ? Math.exp(prior[i] - priorMax) : 0;
        priorSum += prior[i];
      }
      for (let i = 0; i < 6; i++) scores[i] = (1 - c.mixture) * scores[i] + c.mixture * prior[i] / Math.max(1e-12, priorSum);
    }
    return scores;
  }

  // ../src/ai_runtime/dual_v2/takeover_guard.ts
  function takeoverDecision(primary, candidate, margin = 0.35) {
    if (!primary.complete || !candidate.complete) return null;
    const noCommanderRegression = [...primary.health].every(([id, hp]) => (candidate.health.get(id) ?? 0) >= hp);
    if (!noCommanderRegression || candidate.lethalActors > primary.lethalActors || candidate.ledger.allyCommanderLost > primary.ledger.allyCommanderLost) return null;
    if ([...primary.health].some(([id, hp]) => (candidate.health.get(id) ?? 0) > hp) || candidate.lethalActors < primary.lethalActors || candidate.ledger.allyCommanderLost < primary.ledger.allyCommanderLost) return "veto";
    const p = primary.ledger, c = candidate.ledger;
    const event = c.enemyCommanderKills > p.enemyCommanderKills || c.enemyKills > p.enemyKills || c.castles > p.castles || c.towns > p.towns || c.validRecruits > p.validRecruits || candidate.supports > primary.supports && candidate.ledgerScore > primary.ledgerScore;
    if (event && candidate.score >= primary.score + margin) return "takeover";
    if (candidate.ledgerScore >= primary.ledgerScore + 0.2 && candidate.score >= primary.score + margin) return "takeover";
    return null;
  }

  // ../src/ai_runtime/dual_v2/turn_search_ai.ts
  var turnStateHash = (state) => JSON.stringify(state);
  var DualStreamTurnSearchAI = class {
    constructor(model, options = {}) {
      this.model = model;
      this.options = options;
      this.memory = { queue: [] };
      this.telemetry = { queued: false, nodes: 0, rootMs: 0, selectedUnits: 0, veto: false, takeover: false, witnesses: 0, retaliationComplete: 0, retaliationAttempts: 0, rootValue: 0 };
      this.deadline = 0;
      this.tierOneEnd = 0;
      this.nodes = 0;
    }
    ranked(engine, neural, actor) {
      const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer).filter((a) => a.type !== "surrender" && (actor === void 0 || actionActor(a) === actor));
      if (!legal.length) return [];
      const context = new ReachabilityContext(state), priors = tacticalActionPriors(state, legal, context);
      if (!neural) return legal.map((action, i) => ({ action, score: priors[i].prior, forbidden: priors[i].forbidden })).sort((a, b) => b.score - a.score);
      const observation = encodeDualObservation(state, legal, context), output = this.model.forward(observation);
      const decoded = decodeTacticalGroups(output.logits, observation.actions.pointers, priors, this.options.headBias);
      return legal.map((action, i) => ({ action, score: decoded.scores[i], forbidden: priors[i].forbidden })).sort((a, b) => b.score - a.score);
    }
    apply(branch, action) {
      if (this.nodes >= (this.options.maxNodes ?? 180) || performance.now() >= this.deadline) return null;
      const before = branch.engine.getState(), next = branch.engine.clone();
      const code = encodeAction(action), legal = next.getLegalActions(before.currentPlayer), actual = legal.find((a) => encodeAction(a) === code);
      if (!actual) return null;
      const result = next.step(actual);
      if (result.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u641C\u7D22\u63D0\u4EA4\u4E86\u975E\u6CD5\u52A8\u4F5C");
      this.nodes++;
      let recruitment = branch.recruitment ?? { cost: 0, unitIds: [] };
      if (actual.type === "recruit_to_castle" || actual.type === "recruit_and_deploy") {
        const previousIds = new Set(before.units.map((u) => u.id));
        recruitment = { cost: recruitment.cost + (getUnitCost(before, before.currentPlayer, actual.unitClass) ?? 0), unitIds: [...recruitment.unitIds, ...result.state.units.filter((u) => !previousIds.has(u.id) && u.ownerId === before.currentPlayer).map((u) => u.id)] };
      }
      return { ...branch, engine: next, recruitment, queue: [...branch.queue, { expectedStateHash: turnStateHash(before), action: actual }], actors: [...branch.actors] };
    }
    complete(branch, first, self) {
      var _a;
      const before = branch.engine.getState(), ids = new Set(before.units.map((u) => u.id));
      const initial = this.apply(branch, first);
      if (!initial) return [];
      let actor = actionActor(first);
      if (first.type.startsWith("recruit_")) actor = (_a = initial.engine.getState().units.find((u) => !ids.has(u.id) && u.ownerId === self)) == null ? void 0 : _a.id;
      if (actor) initial.actors.push(actor);
      let active2 = [initial], finished = [];
      for (let depth = 0; depth < 4 && active2.length && performance.now() < this.deadline; depth++) {
        const next = [];
        for (const b of active2) {
          if (performance.now() >= this.deadline) break;
          const state = b.engine.getState();
          const follow = state.currentPlayer === self && state.turn === before.turn && !b.engine.isTerminal() && actor ? this.ranked(b.engine, false, actor) : [];
          if (!follow.length) {
            finished.push(b);
            continue;
          }
          for (const f of follow.filter((f2) => !f2.forbidden).slice(0, 2)) {
            const child = this.apply(b, f.action);
            if (!child) continue;
            child.prior += Math.max(-10, Math.min(10, f.score)) * 0.04;
            next.push(child);
          }
        }
        active2 = next.slice(0, 4);
      }
      for (const b of active2) {
        const state = b.engine.getState();
        if (state.currentPlayer !== self || state.turn !== before.turn || b.engine.isTerminal() || !actor || !b.engine.getLegalActions(self).some((a) => actionActor(a) === actor)) finished.push(b);
      }
      return finished;
    }
    candidateRoots(engine, count, neural) {
      const ranked = this.ranked(engine, neural).filter((x) => !x.forbidden), chosen = ranked.slice(0, Math.max(1, count - 4));
      for (const type of ["attack", "capture", "support", "recruit_to_castle", "heal"]) {
        const candidate = ranked.find((x) => x.action.type === type);
        if (candidate && !chosen.includes(candidate) && chosen.length < count) chosen.push(candidate);
      }
      for (const candidate of ranked) if (chosen.length < count && !chosen.some((x) => actionActor(x.action) === actionActor(candidate.action))) chosen.push(candidate);
      for (const candidate of ranked) if (chosen.length < count && !chosen.includes(candidate)) chosen.push(candidate);
      return chosen;
    }
    retaliation(branch, self, rollout) {
      var _a, _b, _c;
      const initial = branch.engine.getState(), counter = branch.engine.clone(), actions = [];
      const commanders = new Map(initial.units.filter((u) => areAlliedPlayers(initial, self, u.ownerId) && isCommanderUnit(initial, u)).map((u) => [u.id, u.hp]));
      const plannedTurn = branch.queue.length ? JSON.parse(branch.queue[0].expectedStateHash).turn : initial.turn;
      if (initial.currentPlayer === self && initial.turn !== plannedTurn) return { penalty: 0, commanders, complete: true, lethalActors: 0 };
      let complete = counter.isTerminal();
      for (let turns = 0; turns < 7 && !counter.isTerminal(); turns++) {
        const state = counter.getState(), player = state.currentPlayer;
        if (turns > 0 && player === self) {
          complete = true;
          break;
        }
        const end = counter.getLegalActions(player).find((a) => a.type === "end_turn");
        if (player === self || areAlliedPlayers(state, self, player)) {
          if (!end) break;
          counter.step(end);
          actions.push(end);
          continue;
        }
        if (rollout) for (let unit = 0; unit < 2 && counter.getState().currentPlayer === player && !counter.isTerminal() && performance.now() < this.deadline - 120; unit++) {
          const first = this.candidateRoots(counter, 1, false)[0];
          if (!first) break;
          const prior = this.nodes;
          this.nodes = 0;
          const completed = this.complete({ engine: counter, queue: [], prior: 0, score: 0, actors: [] }, first.action, player);
          this.nodes = prior;
          const best = completed.sort((a, b) => ledgerScore(multiplayerLedger(state, b.engine.getState(), player, b.recruitment)) - ledgerScore(multiplayerLedger(state, a.engine.getState(), player, a.recruitment)))[0];
          if (!best) break;
          for (const q of best.queue) {
            counter.step(q.action);
            actions.push(q.action);
          }
        }
        const current = counter.getState();
        if (current.currentPlayer !== player || counter.isTerminal()) {
          if (current.currentPlayer === self || counter.isTerminal()) complete = true;
          continue;
        }
        const context = new ReachabilityContext(current);
        for (const [id, hp] of commanders) {
          const defender = current.units.find((u) => u.id === id);
          if (!defender) {
            commanders.set(id, 0);
            continue;
          }
          const hits = current.units.filter((u) => u.ownerId === player && !u.hasActed).map((u) => context.projectedDamage(u, defender)).sort((a, b) => b - a).slice(0, 3);
          commanders.set(id, Math.max(0, Math.min(hp, defender.hp) - hits.reduce((s, x) => s + x, 0)));
        }
        const finish = counter.getLegalActions(counter.getState().currentPlayer).find((a) => a.type === "end_turn");
        if (!finish) break;
        counter.step(finish);
        actions.push(finish);
      }
      const final = counter.getState();
      complete ||= counter.isTerminal() || final.currentPlayer === self && final.turn !== plannedTurn;
      for (const [id, hp] of commanders) commanders.set(id, Math.min(hp, ((_a = final.units.find((u) => u.id === id)) == null ? void 0 : _a.hp) ?? 0));
      if (actions.length) {
        (_c = (_b = this.options).onWitness) == null ? void 0 : _c.call(_b, { initial, actions, finalHash: turnStateHash(final), player: self });
        this.telemetry.witnesses++;
      }
      const threats = new ReachabilityContext(final);
      const lethalActors = [...new Set(branch.actors)].filter((id) => {
        const u = final.units.find((v) => v.id === id);
        if (!u) return true;
        return final.units.filter((e) => !areAlliedPlayers(final, self, e.ownerId)).map((e) => threats.projectedDamage(e, u)).sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0) >= u.hp;
      }).length;
      return { penalty: Math.max(0, -ledgerScore(multiplayerLedger(initial, final, self))), commanders, complete, lethalActors };
    }
    getAction(engine, playerId) {
      var _a;
      const start = performance.now(), state = engine.getState();
      if (state.currentPlayer !== playerId || engine.isTerminal()) throw Error("\u641C\u7D22\u53EA\u80FD\u4E3A\u5F53\u524D\u73A9\u5BB6\u884C\u52A8");
      const head = this.memory.queue[0];
      if (head && head.expectedStateHash === turnStateHash(state)) {
        const actor = actionActor(head.action);
        const queuedLegal = actor ? engine.getLegalActions(playerId, { unitId: actor, skipRecruitment: true }) : engine.getLegalActions(playerId);
        const actual = queuedLegal.find((a) => encodeAction(a) === encodeAction(head.action));
        if (actual) {
          this.memory.queue.shift();
          this.telemetry.queued = true;
          return actual;
        }
      }
      const legal = engine.getLegalActions(playerId).filter((a) => a.type !== "surrender");
      this.memory.queue = [];
      this.nodes = 0;
      this.telemetry = { queued: false, nodes: 0, rootMs: 0, selectedUnits: 0, veto: false, takeover: false, witnesses: 0, retaliationComplete: 0, retaliationAttempts: 0, rootValue: 0 };
      this.deadline = start + Math.min(800, this.options.budgetMs ?? 800);
      this.tierOneEnd = start + (this.deadline - start) * 0.61;
      if (legal.length === 1) return legal[0];
      const roots = this.candidateRoots(engine, 12, true);
      if (!roots.length) throw Error("\u6CA1\u6709\u53EF\u7528\u641C\u7D22\u5019\u9009");
      const root = { engine, queue: [], prior: 0, score: 0, actors: [] }, width = this.options.beamWidth ?? 6;
      let beam = [], primary;
      const cheapScore = (b) => ledgerScore(multiplayerLedger(state, b.engine.getState(), playerId, b.recruitment)) + b.prior;
      for (const [i, candidate] of roots.entries()) {
        if (performance.now() >= this.tierOneEnd) break;
        const complete = this.complete(root, candidate.action, playerId);
        for (const b of complete) {
          b.prior += Math.max(-10, Math.min(10, candidate.score)) * 0.08;
          b.score = cheapScore(b);
        }
        if (i === 0) primary = complete[0];
        beam.push(...complete);
      }
      beam.sort((a, b) => b.score - a.score);
      beam = beam.slice(0, width);
      for (let unit = 1; unit < (this.options.maxUnits ?? 3) && performance.now() < this.tierOneEnd && this.nodes < (this.options.maxNodes ?? 180); unit++) {
        const expanded = [...beam];
        for (const b of beam) {
          if (b.engine.isTerminal() || b.engine.getState().currentPlayer !== playerId || b.engine.getState().turn !== state.turn || performance.now() >= this.tierOneEnd) continue;
          for (const candidate of this.candidateRoots(b.engine, 8, false)) {
            for (const child of this.complete(b, candidate.action, playerId)) {
              child.prior += Math.max(-10, Math.min(10, candidate.score)) * 0.08;
              child.score = cheapScore(child);
              expanded.push(child);
            }
            if (this.nodes >= (this.options.maxNodes ?? 180) || performance.now() >= this.tierOneEnd) break;
          }
        }
        expanded.sort((a, b) => b.score - a.score);
        beam = expanded.slice(0, width);
      }
      if (primary && !beam.includes(primary)) beam.push(primary);
      let best = primary ?? beam[0], bestScore = -Infinity, decision = null;
      const evaluations = [];
      const ordered = primary ? [primary, ...beam.filter((b) => b !== primary)] : beam;
      for (const [i, b] of ordered.entries()) {
        if (performance.now() >= this.deadline - 120 && evaluations.length) break;
        const after = b.engine.getState();
        let value = 0;
        if (b.engine.isTerminal()) value = after.winner === -1 ? 0 : after.winner === getAllianceId(after, playerId) ? 1 : -1;
        else if (performance.now() < this.deadline - 40) {
          const observation = encodeDualObservation(after, b.engine.getLegalActions(after.currentPlayer).filter((a) => a.type !== "surrender")), output = this.model.forward(observation);
          const probs = this.options.valueCalibration ? calibrateValue(output.valueLogits, observation.playerOrder.active, valueCalibrationFeatures(after, observation.playerOrder), this.options.valueCalibration) : output.valueProbs;
          value = computeScalarValue(probs, after, observation.playerOrder, playerId);
        }
        const risk = this.retaliation(b, playerId, i < 3);
        for (const u of state.units) if (areAlliedPlayers(state, playerId, u.ownerId) && isCommanderUnit(state, u) && !risk.commanders.has(u.id)) risk.commanders.set(u.id, 0);
        this.telemetry.retaliationAttempts++;
        this.telemetry.retaliationComplete += Number(risk.complete);
        const ledger = multiplayerLedger(state, after, playerId, b.recruitment);
        evaluations.push({ branch: b, value, ledger, ledgerScore: ledgerScore(ledger), supports: b.queue.filter((q) => q.action.type === "support").length, lethalActors: risk.lethalActors, score: b.score + value * 2 - risk.penalty, health: risk.commanders, complete: risk.complete });
      }
      const baseline = evaluations.find((e) => e.branch === primary);
      bestScore = (baseline == null ? void 0 : baseline.score) ?? -Infinity;
      for (const e of evaluations) {
        if (!baseline || e === baseline) continue;
        const allowed = takeoverDecision(baseline, e, this.options.takeoverMargin ?? 0.35);
        if (allowed && (best === primary || e.score > bestScore)) {
          best = e.branch;
          bestScore = e.score;
          decision = allowed;
        }
      }
      if (!(best == null ? void 0 : best.queue.length)) return roots[0].action;
      this.memory.queue = best.queue.slice(1);
      this.telemetry.nodes = this.nodes;
      this.telemetry.rootMs = performance.now() - start;
      this.telemetry.selectedUnits = best.actors.length;
      this.telemetry.takeover = decision === "takeover";
      this.telemetry.veto = decision === "veto";
      this.telemetry.rootValue = ((_a = evaluations.find((e) => e.branch === best)) == null ? void 0 : _a.value) ?? 0;
      return best.queue[0].action;
    }
  };

  // dual_stream_v2_phase5_20261020/device_worker.ts
  var scope = globalThis;
  if (!scope.structuredClone) scope.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  if (!Object.hasOwn) Object.hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  var sha = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  var sorted = (x) => {
    const a = [...x].sort((a2, b) => a2 - b);
    return { count: a.length, p50: a[Math.max(0, Math.ceil(a.length * 0.5) - 1)] ?? null, p95: a[Math.max(0, Math.ceil(a.length * 0.95) - 1)] ?? null, max: a[a.length - 1] ?? null, total: a.reduce((s, v) => s + v, 0) };
  };
  function rngStream(seed) {
    let state = seed >>> 0, calls = 0;
    return { next() {
      state = state + 1831565813 >>> 0;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      calls++;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }, snapshot: () => ({ state, calls }) };
  }
  async function main(device) {
    let ioMs = 0;
    const post = async (kind, payload) => {
      const start = performance.now(), response = await fetch(`/record?device=${device}&kind=${kind}`, { method: "POST", body: JSON.stringify(payload) });
      if (!response.ok) throw Error(await response.text());
      ioMs += performance.now() - start;
    };
    const [plan, manifest, binary, head, value] = await Promise.all([
      fetch("/plan.json").then((r) => r.json()),
      fetch("/model.json").then((r) => r.json()),
      fetch("/model.bin").then((r) => r.arrayBuffer()),
      fetch("/head.json").then((r) => r.json()),
      fetch("/value.json").then((r) => r.json())
    ]);
    const model = new DualStreamModel(manifest, binary);
    await post("device", { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, startedAt: (/* @__PURE__ */ new Date()).toISOString(), modelSha256: await shaBytes(binary), planId: plan.id });
    const allStart = performance.now();
    for (let index = 0; index < plan.slots.length; index++) {
      const slot = plan.slots[index], initial = plan.states[slot.mapIndex], engine = new GameEngine(initial), witnesses = [];
      const policy = new DualStreamTurnSearchAI(model, { headBias: head.headBias, valueCalibration: value, onWitness: (w) => witnesses.push(w) });
      const rng = rngStream(slot.opponentSeed), opponent = new ApkLikeAI(rng.next);
      const times = { model: [], opponent: [], root: [], queue: [], unique: [] };
      await post("start", { index, slot, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
      let actions = 0, classification = "error", error = null, failedDecision = null;
      const start = performance.now(), ioStart = ioMs;
      try {
        while (true) {
          const state2 = engine.getState();
          if (engine.isTerminal()) {
            classification = state2.winner === -1 ? "natural_draw" : state2.winner === getAllianceId(state2, slot.seat) ? "natural_win" : "natural_loss";
            break;
          }
          if (actions >= plan.budgets.maxActions) {
            classification = "action_truncation";
            break;
          }
          if (performance.now() - start >= plan.budgets.maxWallMs) {
            classification = "wall_truncation";
            break;
          }
          const legal = engine.getLegalActions(state2.currentPlayer).filter((a) => a.type !== "surrender");
          if (!legal.length) throw Error("\u6CA1\u6709\u975E\u6295\u964D\u5408\u6CD5\u52A8\u4F5C");
          const side = slot.modelSeats.includes(state2.currentPlayer) ? "model" : "opponent", beforeHash = await sha(JSON.stringify(state2)), rngBefore = rng.snapshot();
          const t0 = performance.now();
          const action = side === "model" ? policy.getAction(engine, state2.currentPlayer) : opponent.getAction(engine, state2.currentPlayer, [...legal].sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0));
          const ms = performance.now() - t0, telemetry = side === "model" ? { ...policy.telemetry } : null;
          times[side].push(ms);
          if (telemetry) (telemetry.queued ? times.queue : legal.length > 1 ? times.root : times.unique).push(ms);
          const packed = witnesses.splice(0).map((w) => {
            const keys = Object.keys(w.initial), patches = [];
            for (let y = 0; y < initial.map.height; y++) for (let x = 0; x < initial.map.width; x++) if (JSON.stringify(initial.map.tiles[y][x]) !== JSON.stringify(w.initial.map.tiles[y][x])) patches.push([y * initial.map.width + x, w.initial.map.tiles[y][x]]);
            return { state: Object.fromEntries(keys.filter((k) => k !== "map").map((k) => [k, w.initial[k]])), mapIndex: keys.indexOf("map"), patches, actions: w.actions, finalHash: w.finalHash, player: w.player };
          });
          const row = { i: actions, side, player: state2.currentPlayer, ms, telemetry, beforeHash, rngBefore, rngAfter: rng.snapshot(), code: encodeAction(action) };
          if (ms > plan.budgets.maxDecisionMs || performance.now() - start >= plan.budgets.maxWallMs) {
            classification = ms > plan.budgets.maxDecisionMs ? "decision_timeout" : "wall_truncation";
            failedDecision = row;
            await post("step", { index, row: null, rejected: row, witnesses: packed, turn: state2.turn });
            break;
          }
          if (!legal.some((a) => encodeAction(a) === row.code)) throw Error("\u7B56\u7565\u52A8\u4F5C\u4E0D\u5728\u6743\u5A01\u5408\u6CD5\u96C6\u5408");
          const after = engine.step(action);
          if (after.info.includes("\u975E\u6CD5\u52A8\u4F5C") || after.info === "Game already ended") throw Error(after.info);
          row.afterHash = await sha(JSON.stringify(after.state));
          actions++;
          await post("step", { index, row, witnesses: packed, turn: after.state.turn });
          scope.postMessage({ index, actions, turn: after.state.turn, ms, side });
        }
      } catch (e) {
        error = { message: String(e), stack: e instanceof Error ? e.stack : null };
      }
      const state = engine.getState();
      const result = { index, slot, classification, actions, winner: state.winner, finalTurn: state.turn, finalHash: await sha(JSON.stringify(state)), failedDecision, error, wallMs: performance.now() - start, ioMs: ioMs - ioStart, times, latency: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, sorted(v)])), finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await post("result", result);
      scope.postMessage({ index, classification, completed: index + 1 });
    }
    await post("complete", { completed: plan.slots.length, wallMs: performance.now() - allStart, finishedAt: (/* @__PURE__ */ new Date()).toISOString() });
    scope.postMessage({ done: true });
  }
  async function shaBytes(value) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  scope.onmessage = (event) => main(event.data.device).catch(async (error) => {
    await fetch(`/record?device=${event.data.device}&kind=fatal`, { method: "POST", body: JSON.stringify({ error: String(error), stack: error.stack }) });
    scope.postMessage({ fatal: String(error) });
  });
})();
