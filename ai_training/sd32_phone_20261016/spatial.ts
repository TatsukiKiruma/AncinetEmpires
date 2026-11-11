import type { Encoded, Schema, Sparse } from './model';
export const REL_KEYS = 'actor_present focus_present target_present actor_hp actor_hp_fraction target_hp target_hp_fraction actor_level target_level other_source_distance other_focus_distance own_focus_distance other_approach other_near2_count own_near2_count other_near4_count own_near4_count other_near2_hp own_near2_hp nonown_castle_source_distance nonown_castle_focus_distance nonown_town_source_distance nonown_town_focus_distance own_castle_focus_distance focus_own focus_other focus_neutral focus_castle focus_town focus_move_cost target_other source_focus_distance'.split(' ').map(k => 'rel32.' + k);

/** 只描述几何和输入属性；曼哈顿距离不等同可达性或攻击威胁，不另写规则。 */
export function augment(x: Encoded, s: Schema): Encoded {
  if (s.hidden !== 32 || s.candidate.keys.length !== s.baseCandidateCount + 32) throw Error('空间schema身份不符');
  const keys = new Map(s.token.keys.map((k, i) => [k, i]));
  const value = (r: Sparse, key: string) => { const index = keys.get(key); if (index === undefined) throw Error('空间基础字段缺失:' + key); return r.find(([i]) => i === index)?.[1] ?? 0; };
  type Entity = { index: number; x: number; y: number; owner: number | null; hp: number; maxHp: number; level: number; castle: boolean; town: boolean; moveCost: number };
  const entities: Entity[] = x.tokens.map((t, i) => {
    const unit = x.groups[i] === 2 || x.groups[i] === 3;
    const owner = value(t, 'ownerId:null') ? null : Math.round(value(t, 'ownerId:number') * 128);
    const raw = Math.round(value(t, 'apkTerrainId:number') * 128), project = Math.round(value(t, 'terrainId:number') * 128);
    const hasApkTerrain = t.some(([k]) => k === keys.get('apkTerrainId:present'));
    const terrain = hasApkTerrain && raw in s.terrainMap ? s.terrainMap[raw] : project;
    return { index: i, x: Math.round(value(t, unit ? 'pos.x:number' : 'x:number') * 32), y: Math.round(value(t, unit ? 'pos.y:number' : 'y:number') * 32), owner,
      hp: value(t, 'hp:number') * 128, maxHp: value(t, 'maxHp:number') * 128, level: value(t, 'level:number') * 128,
      castle: s.castleTerrain.includes(terrain), town: s.townTerrain.includes(terrain), moveCost: value(t, 'apkMoveCost:number') * 128 };
  });
  const units = entities.filter((_, i) => x.groups[i] === 2), tiles = entities.filter((_, i) => x.groups[i] === 1);
  const own = units.filter(u => u.owner === 0), other = units.filter(u => u.owner !== 0);
  const nc = tiles.filter(t => t.castle && t.owner !== 0), nt = tiles.filter(t => t.town && t.owner !== 0), oc = tiles.filter(t => t.castle && t.owner === 0);
  const dist = (a: Entity, b: Entity) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const nearest = (p: Entity | undefined, list: Entity[]) => p && list.length ? Math.min(...list.map(q => dist(p, q))) / 64 : 1;
  const near = (p: Entity | undefined, list: Entity[], r: number) => p ? list.filter(q => dist(p, q) <= r) : [];
  const candidates = x.candidates.map((candidate, i) => {
    if (candidate.some(([k]) => k >= s.baseCandidateCount)) throw Error('空间特征不能重复添加');
    const refs = x.refs[i], a = refs[0] >= 0 ? entities[refs[0]] : undefined, b = refs[1] >= 0 ? entities[refs[1]] : undefined, d = refs[2] >= 0 ? entities[refs[2]] : undefined;
    const ownOthers = own.filter(u => u.index !== a?.index), e2 = near(d, other, 2), a2 = near(d, ownOthers, 2);
    const v = [Number(!!a), Number(!!d), Number(!!b), (a?.hp ?? 0) / 128, a?.maxHp ? a.hp / a.maxHp : 0,
      (b?.hp ?? 0) / 128, b?.maxHp ? b.hp / b.maxHp : 0, (a?.level ?? 0) / 8, (b?.level ?? 0) / 8,
      nearest(a, other), nearest(d, other), nearest(d, ownOthers), a && d ? nearest(a, other) - nearest(d, other) : 0,
      e2.length / 32, a2.length / 32, near(d, other, 4).length / 32, near(d, ownOthers, 4).length / 32,
      e2.reduce((n, u) => n + u.hp, 0) / 4096, a2.reduce((n, u) => n + u.hp, 0) / 4096,
      nearest(a, nc), nearest(d, nc), nearest(a, nt), nearest(d, nt), nearest(d, oc), Number(d?.owner === 0),
      Number(!!d && d.owner !== null && d.owner !== 0), Number(!!d && d.owner === null), Number(!!d?.castle), Number(!!d?.town),
      (d?.moveCost ?? 0) / 16, Number(!!b && b.owner !== null && b.owner !== 0), a && d ? dist(a, d) / 64 : 0];
    if (v.length !== 32 || v.some(n => !Number.isFinite(n))) throw Error('空间特征长度或数值非法');
    return [...candidate, ...v.map((value, j) => [s.baseCandidateCount + j, Math.fround(value)] as [number, number])];
  });
  return { ...x, candidates };
}
