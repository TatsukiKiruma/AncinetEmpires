(() => {
  // ai_training/sd64x3_phone_20261016/spatial.ts
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

  // ai_training/sd64x3_phone_20261016/augment.ts
  function augment2(base, schema) {
    if (base.tactics.length !== base.candidates.length || base.tactics.some((v) => v.length !== 10 || v.some((z) => !Number.isFinite(z)))) throw Error("\u6218\u672F\u4FA7\u8F66\u4E0D\u5B8C\u6574");
    const x = augment(base, schema), { tactics, ...rest } = x;
    return { ...rest, candidates: x.candidates.map((v, i) => [...v, ...tactics[i].map((z, k) => [schema.baseCandidateCount + 32 + k, Math.fround(z)])]) };
  }

  // ai_training/sd64x3_phone_20261016/model.ts
  function parameterCount(s) {
    const h = s.hidden, input = 4 * h + 4 + 3 * h + s.candidate.keys.length;
    return s.token.keys.length * h + h + input * h + h + 2 * (h * h + h) + h + 1 + (4 * h + 4) + 1;
  }
  function forward(x, s, w) {
    if (w.length !== parameterCount(s)) throw Error("\u6743\u91CD\u957F\u5EA6\u4E0D\u7B26");
    const h = s.hidden, f = s.token.keys.length, c = s.candidate.keys.length, ctxN = 4 * h + 4;
    const embedBias = f * h, policyW = embedBias + h, inputN = ctxN + 3 * h + c;
    const policyBias = policyW + inputN * h, w2 = policyBias + h, b2 = w2 + h * h, w3 = b2 + h, b3 = w3 + h * h, outW = b3 + h, outBias = outW + h, valueW = outBias + 1;
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
      let z = Array.from({ length: h }, (_, j) => {
        let v = w[policyBias + j];
        for (let i = 0; i < inputN; i++) v += input[i] * w[policyW + i * h + j];
        return Math.max(0, v);
      });
      for (const [offset, bias] of [[w2, b2], [w3, b3]]) z = Array.from({ length: h }, (_, j) => {
        let v = w[bias + j];
        for (let i = 0; i < h; i++) v += z[i] * w[offset + i * h + j];
        return Math.max(0, v);
      });
      let score = w[outBias];
      for (let j = 0; j < h; j++) score += z[j] * w[outW + j];
      return score;
    });
    let value = w[valueW + ctxN];
    for (let i = 0; i < ctxN; i++) value += ctx[i] * w[valueW + i];
    const best = logits.reduce((b, z, i) => z > logits[b] + 1e-10 ? i : b, 0);
    return { logits, value: Math.tanh(value), best };
  }

  // ai_training/sd64x3_phone_20261016/check_shared.ts
  function check(base, encoded, reference, schema, initial, gradient) {
    let logitsMaxError = 0, valueMaxError = 0, candidates = 0;
    if (base.length !== 128 || reference.length !== base.length) throw Error("\u63A2\u9488\u6570\u91CF\u4E0D\u7B26");
    for (let i = 0; i < base.length; i++) {
      const x = augment2(base[i], schema);
      if (JSON.stringify(x) !== JSON.stringify(encoded[i])) throw Error("\u7A7A\u95F4\u7F16\u7801\u4E0D\u4E00\u81F4");
      const r = forward(x, schema, initial), e = reference[i];
      if (r.best !== e.best || r.logits.length !== e.logits.length) throw Error("\u7A33\u5B9Aargmax\u6216\u5019\u9009\u6570\u4E0D\u4E00\u81F4");
      r.logits.forEach((z, j) => {
        logitsMaxError = Math.max(logitsMaxError, Math.abs(z - e.logits[j]));
      });
      valueMaxError = Math.max(valueMaxError, Math.abs(r.value - e.value));
      candidates += r.logits.length;
    }
    if (logitsMaxError > 1e-8 || valueMaxError > 1e-8) throw Error("\u524D\u5411\u8BEF\u5DEE\u8D8A\u754C");
    const row = encoded[0], top = gradient.map((g, i) => ({ a: Math.abs(g), i })).sort((a, b) => b.a - a.a).slice(0, 24).map((v) => v.i);
    const indices = [.../* @__PURE__ */ new Set([...top, ...Array.from({ length: 24 }, (_, i) => Math.floor(i * (initial.length - 1) / 23))])];
    const loss = (weights) => {
      const z = forward(row, schema, weights).logits, m = Math.max(...z);
      return (Math.log(z.reduce((n, v) => n + Math.exp(v - m), 0)) + m - z[row.target]) * row.weight;
    };
    let gradientMaxError = 0;
    for (const i of indices) {
      const w = [...initial];
      w[i] += 1e-6;
      const a = loss(w);
      w[i] -= 2e-6;
      const b = loss(w);
      gradientMaxError = Math.max(gradientMaxError, Math.abs((a - b) / 2e-6 - gradient[i]));
    }
    if (gradientMaxError > 1e-7) throw Error("\u6709\u9650\u5DEE\u5206\u68AF\u5EA6\u8D8A\u754C");
    const unknown = structuredClone(base[0]);
    unknown.candidates[0].push([schema.baseCandidateCount, 1]);
    let rejected = false;
    try {
      augment2(unknown, schema);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error("\u7A7A\u95F4\u7279\u5F81\u91CD\u590D\u6DFB\u52A0\u672A\u62D2\u7EDD");
    return { passed: true, rows: base.length, candidates, logitsMaxError, valueMaxError, stableArgmaxAllEqual: true, gradientFiniteDifferenceParameters: indices.length, gradientMaxError, optimizerUpdates: 0 };
  }

  // ai_training/sd64x3_phone_20261016/browser.ts
  async function lines(n) {
    const r = await fetch("/" + n);
    return (await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text()).trim().split("\n").map((v) => JSON.parse(v));
  }
  async function main() {
    try {
      const json = async (n) => (await fetch("/" + n)).json();
      const result = check(await lines("probe-base.jsonl.gz"), await lines("probe-encoded.jsonl.gz"), await lines("reference.jsonl.gz"), await json("schema.json"), await json("initial.json"), await json("reference-gradient.json"));
      await fetch("/complete", { method: "POST", body: JSON.stringify({ ...result, browserPassed: true, userAgent: navigator.userAgent }) });
    } catch (e) {
      await fetch("/complete", { method: "POST", body: JSON.stringify({ browserPassed: false, error: String(e) }) });
    }
  }
  main();
})();
