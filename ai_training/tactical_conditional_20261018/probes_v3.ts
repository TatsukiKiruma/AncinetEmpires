import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { createDemoState } from '../../src/game/demo_map';
import { TacticalPathfinder } from '../../src/game/ai/tactical_pathfinding';
import { FEATURE_NAMES } from './tactics';
import { extractFeatures } from './complete_tactics';
import { ROOT, save } from './io';

const results: unknown[] = [];
const field = (row: number[], name: typeof FEATURE_NAMES[number]) => row[FEATURE_NAMES.indexOf(name)];
for (const kind of ['capture', 'kill'] as const) {
    const state = createDemoState();
    state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
    state.units[2].pos = { x: 1, y: 2 };
    state.units[3].pos = { x: 3, y: 2 };
    state.units[3].hp = kind === 'kill' ? 10 : 100;
    if (kind === 'capture') state.map.tiles[2][2] = { terrainId: 9, ownerId: null };
    const engine = new GameEngine(state);
    const action = { type: 'move', unitId: 'u3', to: { x: 2, y: 2 } } as const;
    const features = extractFeatures(engine, [action]);
    assert.ok(field(features.extra[0], kind === 'capture' ? 'followup_can_capture' : 'followup_can_kill') > 0);
    if (kind === 'kill') assert.ok(field(features.extra[0], 'followup_max_enemy_hp_loss') > 0);
    results.push({ kind, features: Object.fromEntries(FEATURE_NAMES.map((k, i) => [k, features.extra[0][i]])) });
}
const battle = path.join(ROOT, 'ai_training/sd64x3_phone_battles_20261016');
const findings = JSON.parse(fs.readFileSync(path.join(ROOT, 'ai_training/sd64x3_replay_analysis_20261017/findings.json'), 'utf8'));
for (const slot of [...new Set<string>(findings.movingThreatExamples.map((e: any) => e.slot))]) {
    const mapIndex = Number(slot.match(/m(\d)/)![1]);
    const engine = new GameEngine(JSON.parse(fs.readFileSync(path.join(battle, `initial/map-${mapIndex}.json`), 'utf8')));
    const rows = gunzipSync(fs.readFileSync(path.join(battle, `slots/${slot}/actions.jsonl.gz`))).toString().trim().split('\n').map(s => JSON.parse(s));
    for (const row of rows) {
        const example = findings.movingThreatExamples.find((e: any) => e.slot === slot && e.i === row.i);
        if (example) {
            const before = engine.getState();
            const feature = extractFeatures(engine, [row.action]).extra[0];
            const damage = field(feature, 'actor_moving_reply_damage') * 128;
            const lethal = field(feature, 'actor_moving_reply_lethal');
            assert.ok(damage >= example.legalReply.damage, `历史移动威胁未覆盖:${row.i}`);
            if (example.legalReply.lethal) assert.equal(lethal, 1);
            save(`probe-states/${slot}-${row.i}.json`, { state: before, actions: [row.action] });
            results.push({ kind: 'moving_threat', slot, i: row.i, oldRisk: example.modelImmediateRisk, newDamage: damage, newLethal: lethal, originalWitness: example.legalReply });
        }
        const applied = engine.step(row.action);
        assert.ok(!applied.info.includes('非法动作'));
        if (row.i >= Math.max(...findings.movingThreatExamples.filter((e: any) => e.slot === slot).map((e: any) => e.i))) break;
    }
}
// 地形代价夹具：三格山脉的最短路径代价高于几何距离。
const terrain = createDemoState();
terrain.map = { width: 4, height: 1, tiles: [[6, 3, 3, 3].map(t => ({ terrainId: t as 6 | 3, ownerId: null }))] };
terrain.units = [{ ...terrain.units[2], pos: { x: 0, y: 0 } }];
const pathCost = new TacticalPathfinder(terrain).cost(terrain.units[0], { x: 0, y: 0 }, { x: 3, y: 0 });
assert.ok(pathCost! > 3);
results.push({ kind: 'terrain_cost', manhattan: 3, pathCost });
save('feature-probes-v3.json', { passed: true, results });
console.log(JSON.stringify({ passed: true, cases: results.length, results }));
