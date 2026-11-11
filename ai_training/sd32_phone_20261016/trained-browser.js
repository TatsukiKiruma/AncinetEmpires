(() => {
  // ai_training/sd32_phone_20261016/spatial.ts
  var REL_KEYS = "actor_present focus_present target_present actor_hp actor_hp_fraction target_hp target_hp_fraction actor_level target_level other_source_distance other_focus_distance own_focus_distance other_approach other_near2_count own_near2_count other_near4_count own_near4_count other_near2_hp own_near2_hp nonown_castle_source_distance nonown_castle_focus_distance nonown_town_source_distance nonown_town_focus_distance own_castle_focus_distance focus_own focus_other focus_neutral focus_castle focus_town focus_move_cost target_other source_focus_distance".split(" ").map((k) => "rel32." + k);
  function augment(x, s) {
    if (s.hidden !== 32 || s.candidate.keys.length !== s.baseCandidateCount + 32) throw Error("\u7A7A\u95F4schema\u8EAB\u4EFD\u4E0D\u7B26");
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

  // ai_training/sd32_phone_20261016/model.ts
  function parameterCount(s) {
    const h = s.hidden, input = 4 * h + 4 + 3 * h + s.candidate.keys.length;
    return s.token.keys.length * h + h + input * h + h + h + 1 + (4 * h + 4) + 1;
  }
  function forward(x, s, w) {
    if (w.length !== parameterCount(s)) throw Error("\u6743\u91CD\u957F\u5EA6\u4E0D\u7B26");
    const h = s.hidden, f = s.token.keys.length, c = s.candidate.keys.length, ctxN = 4 * h + 4;
    const embedBias = f * h, policyW = embedBias + h, inputN = ctxN + 3 * h + c;
    const policyBias = policyW + inputN * h, outW = policyBias + h, outBias = outW + h, valueW = outBias + 1;
    const emb = x.tokens.map((token) => Array.from({ length: h }, (_, j) => {
      let z = w[embedBias + j];
      for (const [i, v] of token) z += v * w[i * h + j];
      return Math.max(0, z);
    }));
    const counts = [0, 0, 0, 0], ctx = Array(ctxN).fill(0);
    for (let i = 0; i < emb.length; i++) {
      const g = x.groups[i];
      counts[g]++;
      for (let j = 0; j < h; j++) ctx[g * h + j] += emb[i][j];
    }
    for (let g = 0; g < 4; g++) {
      for (let j = 0; j < h; j++) ctx[g * h + j] /= Math.max(1, counts[g]);
      ctx[4 * h + g] = counts[g] / 1024;
    }
    const logits = x.candidates.map((candidate, k) => {
      const input = [...ctx, ...x.refs[k].flatMap((ref) => ref < 0 ? Array(h).fill(0) : emb[ref]), ...Array(c).fill(0)];
      for (const [i, v] of candidate) input[ctxN + 3 * h + i] = v;
      let score = w[outBias];
      for (let j = 0; j < h; j++) {
        let z = w[policyBias + j];
        for (let i = 0; i < inputN; i++) z += input[i] * w[policyW + i * h + j];
        score += Math.max(0, z) * w[outW + j];
      }
      return score;
    });
    let value = w[valueW + ctxN];
    for (let i = 0; i < ctxN; i++) value += ctx[i] * w[valueW + i];
    const best = logits.reduce((b, z, i) => z > logits[b] + 1e-10 ? i : b, 0);
    return { logits, value: Math.tanh(value), best };
  }

  // ai_training/sd32_phone_20261016/trained_browser.ts
  async function lines(n) {
    const r = await fetch("/" + n);
    return (await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text()).trim().split("\n").map((v) => JSON.parse(v));
  }
  async function main() {
    try {
      const model = await (await fetch("/candidate.json")).json(), base = await lines("probe-base.jsonl.gz"), refs = await lines("trained-reference.jsonl.gz");
      if (base.length !== 1024 || refs.length !== 1024) throw Error("\u63A2\u9488\u6570\u91CF\u4E0D\u7B26");
      let logitsMaxError = 0, valueMaxError = 0, candidates = 0;
      for (let i = 0; i < base.length; i++) {
        const actual = forward(augment(base[i], model.schema), model.schema, model.weights), expected = refs[i];
        if (actual.best !== expected.best || actual.logits.length !== expected.logits.length) throw Error("\u8BAD\u7EC3\u540E\u5019\u9009\u6216argmax\u4E0D\u4E00\u81F4");
        actual.logits.forEach((z, j) => {
          logitsMaxError = Math.max(logitsMaxError, Math.abs(z - expected.logits[j]));
        });
        valueMaxError = Math.max(valueMaxError, Math.abs(actual.value - expected.value));
        candidates += actual.logits.length;
      }
      if (logitsMaxError > 1e-8 || valueMaxError > 1e-8) throw Error("\u8BAD\u7EC3\u540E\u524D\u5411\u8BEF\u5DEE\u8D8A\u754C");
      await fetch("/complete", { method: "POST", body: JSON.stringify({ passed: true, browserPassed: true, trainedCheckpointBrowserPassed: true, rows: 1024, candidates, logitsMaxError, valueMaxError, bestEpoch: model.bestEpoch, stableArgmaxAllEqual: true, optimizerUpdates: 0, userAgent: navigator.userAgent }) });
    } catch (e) {
      await fetch("/complete", { method: "POST", body: JSON.stringify({ browserPassed: false, error: String(e) }) });
    }
  }
  main();
})();
