import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const oldPath = path.resolve(dir, '../tactical_exit_20261019/final-battle-plan.json');
const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
fs.mkdirSync(path.join(dir, 'battle-initial'), { recursive: true });
const maps = old.maps.map((m: any, index: number) => {
    const bytes = fs.readFileSync(m.path), state = JSON.parse(bytes.toString());
    assert.equal(stateHash(state), m.sha256);
    const name = `battle-initial/map-${index}.json`; fs.writeFileSync(path.join(dir, name), bytes);
    return { ...m, path: name, inheritedPath: m.path, fileSha256: sha(bytes) };
});
const slots = old.slots.filter((s: any) => s.model === 'pure' && (s.panel === 'expanded' || ['heuristic', 'apk_like'].includes(s.opponent))).map((s: any) => ({ ...s, id: s.id.replace('pure', 'dual_v2_stage3_pure'), historicalId: s.id, model: 'dual_v2_stage3_pure', panel: s.panel ?? 'fixed', modelSeats: [s.seat] }));
assert.equal(slots.length, 40);
for (const [name, allied] of [['(3) Frozen fields.aem', false], ['(4) Crossroads.aem', false], ['(4) Crossroads.aem', true]] as const) {
    const state = createAppApkSkirmishGameState(name);
    if (allied) state.rules = { ...state.rules, alliances: { 0: 10, 1: 20, 2: 10, 3: 20 } };
    const index = maps.length, file = `battle-initial/map-${index}.json`, text = JSON.stringify(state);
    fs.writeFileSync(path.join(dir, file), text);
    maps.push({ name: name + (allied ? ' 2v2' : ' FFA'), path: file, index, sha256: stateHash(state), fileSha256: sha(text), inheritedPath: null });
    const n = name.startsWith('(3)') ? 3 : 4, count = allied || n === 3 ? 4 : 8;
    for (let i = 0; i < count; i++) slots.push({ id: `multi-${allied ? '2v2' : n + 'ffa'}-${i}`, model: 'dual_v2_stage3_pure', mapIndex: index, seat: i % n, modelSeats: allied ? i % 2 ? [1, 3] : [0, 2] : [i % n], opponent: allied || i < count / 2 ? 'heuristic' : 'apk_like', opponentSeed: 2026102030 + i, panel: allied ? '2v2' : `${n}ffa` });
}
assert.equal(slots.length, 56);
fs.writeFileSync(path.join(dir, 'battle-plan.json'), JSON.stringify({ model: 'dual_v2_stage3_pure', frozenBeforeBattles: true, inheritedPlanSha256: sha(fs.readFileSync(oldPath)), maps, slots, budgets: { maxActions: 2000, maxWallMs: 600000, maxDecisionMs: 30000 }, independentEvaluation: false }, null, 2));
