// tactical_conditional_20261018/model.ts
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
function decode(logits, groups, decoder) {
  const best = stableBest(logits);
  if (decoder === "direct" || decoder === "group_max") return best;
  const max = logits[best], masses = /* @__PURE__ */ new Map();
  logits.forEach((v, i) => masses.set(groups[i], (masses.get(groups[i]) ?? 0) + Math.exp(v - max)));
  let selected = "", mass = -1;
  for (const [group, value] of masses) if (value > mass + 1e-10) {
    selected = group;
    mass = value;
  }
  let chosen = -1;
  logits.forEach((v, i) => {
    if (groups[i] === selected && (chosen < 0 || v > logits[chosen] + 1e-10)) chosen = i;
  });
  return chosen;
}
function forward(x, model) {
  const s = model.schema, w = model.weights, o = offsets(s), h = o.h;
  if (s.version !== "sd-tactical-conditional-pc-v3" || h !== 64 || w.length !== o.count) throw Error("\u6A21\u578Bschema\u6216\u6743\u91CD\u5F62\u72B6\u4E0D\u7B26");
  const ctx = new Float64Array(o.k), counts = [0, 0, 0, 0];
  const embedding = x.tokens.map((token, i) => {
    const e = Float64Array.from(w.slice(o.eb, o.pw));
    for (const [index, value2] of token) for (let j = 0; j < h; j++) e[j] += value2 * w[index * h + j];
    for (let j = 0; j < h; j++) {
      e[j] = Math.max(0, e[j]);
      ctx[x.groups[i] * h + j] += e[j];
    }
    counts[x.groups[i]]++;
    return e;
  });
  for (let g = 0; g < 4; g++) {
    for (let j = 0; j < h; j++) ctx[g * h + j] /= Math.max(1, counts[g]);
    ctx[4 * h + g] = counts[g] / 1024;
  }
  const common = Float64Array.from(w.slice(o.pb, o.w2));
  for (let i = 0; i < ctx.length; i++) for (let j = 0; j < h; j++) common[j] += ctx[i] * w[o.pw + i * h + j];
  const roleCache = /* @__PURE__ */ new Map();
  const logits = x.candidates.map((candidate, a) => {
    const first = new Float64Array(common);
    for (let role = 0; role < 3; role++) {
      const ref = x.refs[a][role];
      if (ref < 0) continue;
      const key = `${role}:${ref}`;
      let projection = roleCache.get(key);
      if (!projection) {
        projection = new Float64Array(h);
        for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) projection[j] += embedding[ref][i] * w[o.pw + (o.k + role * h + i) * h + j];
        roleCache.set(key, projection);
      }
      for (let j = 0; j < h; j++) first[j] += projection[j];
    }
    for (const [i, v] of candidate) {
      if (s.featureMode === "legacy" && i >= s.oldCandidateCount) continue;
      if (s.featureMode === "legacy" && x.codes[a].startsWith("recruit_") && [s.oldCandidateCount - 4, s.oldCandidateCount - 3, s.oldCandidateCount - 1].includes(i)) continue;
      for (let j = 0; j < h; j++) first[j] += v * w[o.pw + (o.k + 3 * h + i) * h + j];
    }
    for (let j = 0; j < h; j++) first[j] = Math.max(0, first[j]);
    let hidden = first;
    for (const [matrix, bias] of [[o.w2, o.b2], [o.w3, o.b3]]) {
      const next = new Float64Array(h);
      for (let j = 0; j < h; j++) {
        let z = w[bias + j];
        for (let i = 0; i < h; i++) z += hidden[i] * w[matrix + i * h + j];
        next[j] = Math.max(0, z);
      }
      hidden = next;
    }
    let score = w[o.ob];
    for (let j = 0; j < h; j++) score += hidden[j] * w[o.ow + j];
    return score;
  });
  let value = w[o.vw + o.k];
  for (let i = 0; i < o.k; i++) value += ctx[i] * w[o.vw + i];
  return { logits, value: Math.tanh(value), best: stableBest(logits) };
}

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
  const target2 = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target2) return false;
  if (target2.hp <= 0) return false;
  const targetStats = getEffectiveStats(target2);
  const distance = getDistance(target2.pos, attacker.pos);
  const isCounterStorm = hasAbility(target2, "counter_storm") && distance <= 2;
  const canNormalCounter = distance === 1 && inRange(
    target2.pos,
    attacker.pos,
    targetStats.minRange,
    targetStats.maxRange
  );
  return isCounterStorm || canNormalCounter;
}
function counterDamageOnResolvedState(state, attackerId, defenderId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target2 = state.units.find((u) => u.id === defenderId);
  if (!attacker || !target2) return 0;
  if (!canCounterAttack(state, attackerId, defenderId)) return 0;
  return calculateDamageAtHp(state, defenderId, attackerId, target2.hp);
}
function canHealTarget(state, healer, target2) {
  if (getDistance(healer.pos, target2.pos) > 1) return false;
  const range = getEffectiveStats(healer);
  if (healer.id !== target2.id && !inRange(healer.pos, target2.pos, range.minRange, range.maxRange)) return false;
  if (isUndead(target2)) {
    return true;
  }
  const notPoisoned = !(target2.status && target2.status.type === "poisoned");
  const targetCanReceiveHealing = target2.hp <= getEffectiveStats(target2).maxHp;
  return areAlliedPlayers(state, healer.ownerId, target2.ownerId) && notPoisoned && targetCanReceiveHealing;
}
function getLegalActions(state, playerId, query = {}) {
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
  if (query.unitId !== void 0) validUnits = validUnits.filter((u) => u.id === query.unitId);
  if (pendingLocksUnitActions) {
    validUnits = validUnits.filter((u) => u.id === pendingUnitId);
  }
  let assaultUnits = state.units.filter(
    (u) => u.ownerId === playerId && u.hasActed && hasAbility(u, "assault_troop") && (u.movementRemaining ?? 0) > 0 && !u.hasPostAttackMoved && !u.apkStatic
  );
  if (query.unitId !== void 0) assaultUnits = assaultUnits.filter((u) => u.id === query.unitId);
  if (pendingLocksUnitActions) {
    assaultUnits = assaultUnits.filter((u) => u.id === pendingUnitId);
  }
  const enemyUnits = state.units.filter((u) => areEnemyPlayers(state, u.ownerId, playerId));
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
      for (const target2 of state.units) {
        if (canHealTarget(state, unit, target2)) {
          actions.push({ type: "heal", healerId: unit.id, targetId: target2.id });
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
  getLegalActions(playerId, query) {
    return getLegalActions(this.state, playerId, query);
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
  applyCombatStatusEffects(source, target2) {
    if (target2.hp <= 0) return;
    if (hasAbility(source, "poisoner") && !hasAbility(target2, "poisoner")) {
      if (!target2.status || target2.status.type === "poisoned") {
        target2.status = { type: "poisoned", remainingTicks: 2 };
      }
    }
    if (hasAbility(source, "blinder") && !hasAbility(target2, "blinder")) {
      if (!target2.status || target2.status.type === "blinded") {
        target2.status = { type: "blinded", remainingTurns: 1 };
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
      const legalActions = getLegalActions(this.state, this.state.currentPlayer, moving ? { unitId: action.unitId, skipRecruitment } : { skipMovement: true, skipRecruitment });
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
        const target2 = this.state.units.find((u) => u.id === action.targetId);
        if (attacker && target2) {
          if (hasAbility(attacker, "assault_troop") && attacker.movementRemaining === void 0) {
            attacker.movementRemaining = getEffectiveStats(attacker).move;
          }
          const dmg = calculateDamage(this.state, attacker.id, target2.id);
          target2.hp -= dmg;
          info = `Unit ${attacker.id} attacked ${target2.id} for ${dmg} dmg.`;
          reward += dmg * 0.1;
          this.applyCombatStatusEffects(attacker, target2);
          addExp(attacker, target2.hp <= 0 ? KILL_EXP : ATTACK_EXP, ruleConfig.levelCap);
          let canCounter = false;
          if (target2.hp > 0) {
            canCounter = canCounterAttack(this.state, attacker.id, target2.id);
          }
          if (target2.hp > 0) {
            if (canCounter) {
              const counterDmg = counterDamageOnResolvedState(this.state, attacker.id, target2.id);
              attacker.hp -= counterDmg;
              info += ` Target counterattacked for ${counterDmg} dmg.`;
              this.applyCombatStatusEffects(target2, attacker);
              addExp(target2, attacker.hp <= 0 ? KILL_EXP : ASSIST_EXP, ruleConfig.levelCap);
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
        const target2 = this.state.units.find((u) => u.id === action.targetId);
        if (healer && target2) {
          const level = healer.level ?? 0;
          const healVal = healer.unitClass === "paladin" ? 40 + level * 10 : 40;
          let hpDelta = healVal;
          target2.hasBeenHealedThisTurn = true;
          if (isUndead(target2)) {
            hpDelta = -Math.floor(healVal * 3 / 2);
            target2.hp = Math.max(0, target2.hp + hpDelta);
            if (target2.hp <= 0 && !hasAbility(healer, "undead")) {
              addExp(healer, 60, ruleConfig.levelCap);
            }
          } else {
            target2.hp += healVal;
          }
          if (target2.hp > 0) {
            addExp(healer, 30, ruleConfig.levelCap);
          }
          healer.hasMoved = true;
          healer.hasActed = true;
          standbyUnitId = healer.id;
          info = `Healer ${healer.id} changed ${target2.id} HP by ${hpDelta}.`;
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
        const target2 = this.state.units.find((u) => u.id === action.targetId);
        if (supporter && target2) {
          target2.hasActed = false;
          target2.hasMoved = false;
          target2.movementRemaining = getEffectiveStats(target2).move;
          target2.hasBeenSupportedThisTurn = true;
          addExp(supporter, 10, ruleConfig.levelCap);
          supporter.hasMoved = true;
          supporter.hasActed = true;
          standbyUnitId = supporter.id;
          info = `Supporter ${supporter.id} reset action state of ${target2.id}.`;
        }
        break;
      }
      case "destroy_town": {
        const destroyer = this.state.units.find((u) => u.id === action.unitId);
        if (destroyer) {
          const target2 = action.target ?? destroyer.pos;
          const tile = this.state.map.tiles[target2.y]?.[target2.x];
          if (tile && isTileDestroyableForRules(tile)) {
            destroyTileForRules(tile);
            info = `Unit ${destroyer.id} destroyed town at ${target2.x},${target2.y}`;
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
      const target2 = parsePos(parts[2]);
      return target2 ? { type: "destroy_town", unitId: parts[1], target: target2 } : null;
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

// ../src/game/ai/runtime/skirmish_action_semantics.ts
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
      const actorId2 = action.type === "attack" ? action.attackerId : action.type === "heal" ? action.healerId : action.supporterId;
      return {
        ...base,
        actorId: actorId2,
        actorPos: unitPos(units, actorId2),
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
    for (const unit of state.units) {
      const index = this.index(unit.pos);
      if (unit.hp > 0 && !this.occupants.has(index)) this.occupants.set(index, unit);
    }
  }
  index(pos) {
    return pos.y * this.state.map.width + pos.x;
  }
  cost(unit, from, target2) {
    if (from.x === target2.x && from.y === target2.y) return 0;
    const { width, height } = this.state.map;
    if (target2.x < 0 || target2.y < 0 || target2.x >= width || target2.y >= height) return null;
    const key = `${unit.id}:${from.x},${from.y}`;
    let costs = this.distances.get(key);
    if (!costs) {
      costs = this.buildDistances(unit, from);
      this.distances.set(key, costs);
    }
    const cost = costs[this.index(target2)];
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

// tactical_conditional_20261018/threat.ts
var THREAT_AUDIT = { calls: 0, exhaustiveFallbacks: 0, auraFallbacks: 0, settlementFallbacks: 0 };
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
    for (const attack of branch.getLegalActions(state.currentPlayer, { unitId: id, skipMovement: true, skipRecruitment: true })) {
      if (attack.type !== "attack") continue;
      const target2 = targets.find((t) => t.id === attack.targetId);
      if (!target2) continue;
      const value = result.get(target2.id);
      const hit = branch.clone().step(attack);
      if (hit.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u7A77\u4E3E\u5A01\u80C1\u653B\u51FB\u975E\u6CD5");
      const remaining = hit.state.units.find((u) => u.id === target2.id)?.hp ?? 0;
      const damage = Math.max(0, target2.hp - remaining);
      if (!move) value.immediate = Math.max(value.immediate, damage);
      if (damage > value.damage) {
        value.damage = damage;
        value.lethal = Number(damage >= target2.hp);
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
    const moves = engine.getLegalActions(initial.currentPlayer, { unitId: enemy.id, skipRecruitment: true }).filter((a) => a.type === "move" && affected(enemy, a.to.x, a.to.y));
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
    const legal = engine.getLegalActions(state.currentPlayer, { unitId: enemy.id, skipRecruitment: true });
    const moves = legal.filter((a) => a.type === "move");
    for (const move of [null, ...moves]) {
      const pos = move?.to ?? enemy.pos;
      if (!relevant.some((t) => {
        const d = Math.abs(t.pos.x - pos.x) + Math.abs(t.pos.y - pos.y);
        return d >= stats.minRange && d <= stats.maxRange;
      })) continue;
      const projected = move ? { ...state, units: state.units.map((u) => u.id === enemy.id ? { ...u, pos, hasMoved: true } : u) } : state;
      for (const attack of getLegalActions(projected, state.currentPlayer, { unitId: enemy.id, skipMovement: true, skipRecruitment: true })) {
        if (attack.type !== "attack") continue;
        const target2 = relevant.find((t) => t.id === attack.targetId);
        if (!target2) continue;
        const damage = Math.min(target2.hp, calculateDamage(projected, enemy.id, target2.id));
        const value = result.get(target2.id);
        if (!move) value.immediate = Math.max(value.immediate, damage);
        if (damage > value.damage) Object.assign(value, { damage, lethal: Number(damage >= target2.hp), witness: { move, attack } });
      }
    }
  }
  for (const target2 of targets) {
    const value = result.get(target2.id);
    if (!value.witness) continue;
    const witness = value.witness;
    const branch = engine.clone();
    if (witness.move && branch.step(witness.move).info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u6700\u5927\u5A01\u80C1\u79FB\u52A8\u89C1\u8BC1\u975E\u6CD5");
    const hit = branch.step(witness.attack);
    if (hit.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u6700\u5927\u5A01\u80C1\u653B\u51FB\u89C1\u8BC1\u975E\u6CD5");
    const remaining = hit.state.units.find((u) => u.id === target2.id)?.hp ?? 0;
    if (Math.abs(target2.hp - remaining - value.damage) > 1e-9) {
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

// tactical_conditional_20261018/tactics.ts
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
function extractFeatures(engine, actions) {
  const before = engine.getState(), player = before.currentPlayer;
  const original = JSON.stringify(before);
  const hp = (s, own) => s.units.filter((u) => areAlliedPlayers(s, u.ownerId, player) === own).reduce((n, u) => n + u.hp, 0);
  const count = (s, own) => s.units.filter((u) => areAlliedPlayers(s, u.ownerId, player) === own).length;
  const pathBefore = new TacticalPathfinder(before);
  const ownCommanders = before.units.filter((u) => u.ownerId === player && isCommanderUnit(before, u, player)).map((u) => u.id);
  const enemies = before.units.filter((u) => areEnemyPlayers(before, player, u.ownerId));
  const tiles = before.map.tiles.flatMap((row, y) => row.flatMap((tile, x) => {
    const key = getTileTerrainKey(tile);
    return (key === "town" || key === "castle") && (tile.ownerId === null || areEnemyPlayers(before, player, tile.ownerId)) ? [{ tile, x, y }] : [];
  }));
  const nearest = (finder, unit, positions) => {
    let best = Infinity;
    for (const pos of positions) {
      const cost = finder.cost(unit, unit.pos, pos);
      if (cost !== null) best = Math.min(best, cost);
    }
    return Number.isFinite(best) ? best : null;
  };
  const fallbackBefore = THREAT_AUDIT.exhaustiveFallbacks;
  const stats = { candidates: actions.length, stepMs: 0, followupMs: 0, threatMs: 0, pathMs: 0, exhaustiveFallbacks: 0 };
  const old = [], extra = [];
  for (const action of actions) {
    const stepStart = performance.now();
    const branch = engine.clone(), applied = branch.step(action);
    stats.stepMs += performance.now() - stepStart;
    if (applied.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("\u7279\u5F81\u8F93\u5165\u4E0D\u662F\u6743\u5A01\u5408\u6CD5\u52A8\u4F5C:" + encodeAction(action));
    const after = applied.state, id = actorId(action, before, after);
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
    before.map.tiles.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.ownerId !== player && after.map.tiles[y][x].ownerId === player) captured++;
    }));
    const afterLegal = after.currentPlayer === player && !branch.isTerminal() ? branch.getLegalActions(player, { skipMovement: true, skipRecruitment: true }) : [];
    const supports = afterLegal.filter((a) => (a.type === "heal" || a.type === "support") && a.targetId === id).length;
    stats.followupMs += performance.now() - followupStart;
    const threatStart = performance.now();
    const reply = nextOpponent(branch, player), replyState = reply.branch.getState();
    const targets = replyState.units.filter((u) => u.id === id || ownCommanders.includes(u.id));
    const risks = reply.known ? movingThreat(reply.branch, targets) : /* @__PURE__ */ new Map();
    const actorRisk = id ? risks.get(id) : void 0;
    const commanderRisk = ownCommanders.map((c) => risks.get(c)).filter(Boolean);
    const cmdDamage = Math.max(0, ...commanderRisk.map((r) => r.damage));
    const cmdLethal = Math.max(0, ...commanderRisk.map((r) => r.lethal));
    stats.threatMs += performance.now() - threatStart;
    const pathStart = performance.now();
    old.push([
      (hp(before, false) - hp(after, false)) / 128,
      (hp(before, true) - hp(after, true)) / 128,
      (count(before, false) - count(after, false)) / 16,
      (count(before, true) - count(after, true)) / 16,
      captured / 16,
      ((after.players.find((p) => p.id === player)?.gold ?? 0) - (before.players.find((p) => p.id === player)?.gold ?? 0)) / 1024,
      (actorRisk?.immediate ?? 0) / 128,
      Number(!!actor && (actorRisk?.immediate ?? 0) >= actor.hp),
      Number(reply.known),
      supports / 16
    ].map(Math.fround));
    let cb = null, ca = null, eb = null, ea = null;
    if (actor) {
      const pathAfter = new TacticalPathfinder(after);
      const capturable = tiles.filter((t) => getTileTerrainKey(t.tile) === "castle" ? hasAbility(actor, "castle_capturer") : hasAbility(actor, "village_capturer"));
      ca = nearest(pathAfter, actor, capturable);
      ea = nearest(pathAfter, actor, enemies.map((u) => u.pos));
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
  if (extra.some((v) => v.length !== NEW_KEYS.length || v.some((n) => !Number.isFinite(n)))) throw Error("\u65B0\u7279\u5F81\u5F62\u72B6/\u6570\u503C\u975E\u6CD5");
  return { old, extra, stats };
}

// tactical_conditional_20261018/complete_tactics.ts
function requiresAuraCorrection(state) {
  const enemies = state.units.filter((u) => areEnemyPlayers(state, state.currentPlayer, u.ownerId));
  return enemies.some((u) => hasAbility(u, "cleansing_aura")) && enemies.some(isUndead);
}
function correctAuraFeatures(engine, actions, features) {
  const before = engine.getState(), player = before.currentPlayer;
  if (!requiresAuraCorrection(before)) return { branches: 0, changed: 0 };
  const commanders = before.units.filter((u) => u.ownerId === player && isCommanderUnit(before, u, player)).map((u) => u.id);
  let branches = 0, changed = 0;
  actions.forEach((action, index) => {
    const branch = engine.clone(), result = branch.step(action);
    if (result.info.includes("\u975E\u6CD5\u52A8\u4F5C")) throw Error("v3\u6821\u6B63\u8F93\u5165\u975E\u6CD5");
    const id = actorId(action, before, result.state), reply = nextOpponent(branch, player);
    if (!reply.known || reply.branch.isTerminal()) return;
    const s = reply.branch.getState(), current = s.units.filter((u) => u.ownerId === s.currentPlayer);
    if (!current.some((u) => hasAbility(u, "cleansing_aura")) || !current.some(isUndead)) return;
    const targets = s.units.filter((u) => u.id === id || commanders.includes(u.id));
    const risks = movingThreatExhaustive(reply.branch, targets);
    const actor = id ? risks.get(id) : void 0, actorUnit = s.units.find((u) => u.id === id);
    const commander = commanders.map((c) => risks.get(c)).filter(Boolean);
    const replacements = [[4, (actor?.damage ?? 0) / 128], [5, actor?.lethal ?? 0], [7, Math.max(0, ...commander.map((r) => r.damage)) / 128], [8, Math.max(0, ...commander.map((r) => r.lethal))]];
    const immediate = Math.fround((actor?.immediate ?? 0) / 128), immediateLethal = Number(!!actorUnit && (actor?.immediate ?? 0) >= actorUnit.hp);
    if (replacements.some(([i, value]) => features.extra[index][i] !== Math.fround(value)) || features.old[index][6] !== immediate || features.old[index][7] !== immediateLethal) changed++;
    for (const [i, value] of replacements) features.extra[index][i] = Math.fround(value);
    features.old[index][6] = immediate;
    features.old[index][7] = immediateLethal;
    branches++;
  });
  return { branches, changed };
}
function extractFeatures2(engine, actions) {
  const features = extractFeatures(engine, actions);
  const correction = correctAuraFeatures(engine, actions, features);
  return { ...features, stats: { ...features.stats, auraCorrection: correction } };
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
    const unit = x.groups[i] === 2 || x.groups[i] === 3;
    const owner = value(t, "ownerId:null") ? null : Math.round(value(t, "ownerId:number") * 128);
    const raw = Math.round(value(t, "apkTerrainId:number") * 128), project = Math.round(value(t, "terrainId:number") * 128);
    const hasApkTerrain = t.some(([k]) => k === keys.get("apkTerrainId:present"));
    const terrain = hasApkTerrain && raw in s.terrainMap ? s.terrainMap[raw] : project;
    return {
      index: i,
      x: Math.round(value(t, unit ? "pos.x:number" : "x:number") * 32),
      y: Math.round(value(t, unit ? "pos.y:number" : "y:number") * 32),
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

// tactical_conditional_20261018/encoding.ts
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

// tactical_conditional_20261018/browser.ts
var target = document.getElementById("result");
try {
  const name = new URL(location.href).searchParams.get("model") ?? "initial";
  if (!/^(initial|legacy|new|conditional|best)$/.test(name)) throw Error("\u6A21\u578B\u540D\u79F0\u975E\u6CD5");
  const load = async (path) => {
    const r = await fetch(path);
    if (!r.ok) throw Error("\u8BFB\u53D6\u5931\u8D25:" + path);
    const text = await r.text(), bytes = new TextEncoder().encode(text);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((v) => v.toString(16).padStart(2, "0")).join("");
    return { data: JSON.parse(text), sha256 };
  };
  const [modelFile, inputFile, referenceFile, stateFile, oldSchemaFile] = await Promise.all([load(`model-${name}.json`), load("parity-inputs.json"), load(`python-parity-${name}.json`), load("browser-states.json"), load("old-schema.json")]);
  const model = modelFile.data, inputs = inputFile.data, reference = referenceFile.data, states = stateFile.data, oldSchema = oldSchemaFile.data;
  let maxLogitError = 0, maxValueError = 0, argmax = true, decoderParity = true;
  let encodingMismatches = 0;
  const started = performance.now();
  inputs.forEach((x, i) => {
    const item = states[i], engine = new GameEngine(item.state), actions = item.codes.map(decodeAction);
    const packet = observe(observationState(item.state), actions);
    const actualInput = encodeFeatures(packet, oldSchema, extractFeatures2(engine, packet.codes.map(decodeAction)));
    for (const key of ["tokens", "groups", "candidates", "refs", "codes"]) if (JSON.stringify(actualInput[key]) !== JSON.stringify(x[key])) encodingMismatches++;
    const actual = forward(actualInput, model), expected = reference.out[i];
    actual.logits.forEach((z, j) => maxLogitError = Math.max(maxLogitError, Math.abs(z - expected.logits[j])));
    maxValueError = Math.max(maxValueError, Math.abs(actual.value - expected.value));
    argmax &&= actual.best === expected.best;
    for (const decoder of ["direct", "group_mass", "group_max"]) decoderParity &&= decode(actual.logits, x.actionGroups, decoder) === expected.decoded[decoder];
  });
  const passed = maxLogitError < 1e-8 && maxValueError < 1e-8 && argmax && decoderParity && encodingMismatches === 0;
  target.textContent = JSON.stringify({
    passed,
    name,
    probes: inputs.length,
    maxLogitError,
    maxValueError,
    stableArgmax: argmax,
    decoderParity,
    encodingMismatches,
    rawStateFeaturesRecomputed: true,
    modelFileSha256: modelFile.sha256,
    inputFileSha256: inputFile.sha256,
    stateFileSha256: stateFile.sha256,
    ms: performance.now() - started,
    userAgent: navigator.userAgent
  }, null, 2);
  document.title = passed ? "\u6D4F\u89C8\u5668\u524D\u5411\u4E00\u81F4\u6027\u901A\u8FC7" : "\u6D4F\u89C8\u5668\u524D\u5411\u4E00\u81F4\u6027\u5931\u8D25";
} catch (e) {
  target.textContent = JSON.stringify({ passed: false, error: String(e) });
  document.title = "\u6D4F\u89C8\u5668\u6821\u9A8C\u9519\u8BEF";
}
