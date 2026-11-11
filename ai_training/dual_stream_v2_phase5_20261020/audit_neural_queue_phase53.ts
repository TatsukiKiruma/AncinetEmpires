import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';

const arena = 'generations/gen_03/arena', plan = read(arena + '/plan.json');
const bytes = fs.readFileSync(path.join(DIR, plan.modelPrefix + '.bin'));
const model = new DualStreamModel(read(plan.modelPrefix + '.json'), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const pure = new DualStreamPureAI(model, { tactical: true, headBias: read(plan.calibrationPrefix + '/head-calibration.json').headBias });
const probes: any[] = [];
for (const slot of plan.slots.filter((s: any) => s.mode === 'turn_search')) {
    const prefix = path.join(DIR, arena, 'battles', slot.id);
    if (!fs.existsSync(path.join(prefix, 'result.json'))) continue;
    const engine = new GameEngine(read(plan.maps[slot.mapIndex].path)); let samples = 0;
    for await (const row of gzipRows(fs.readFileSync(path.join(prefix, 'actions.jsonl.gz')))) {
        const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
        const t = row.telemetry;
        if (samples < 12 && t?.queued && !t.takeover && !t.veto) {
            const expected = encodeAction(pure.getAction(engine, state.currentPlayer));
            probes.push({ slot: slot.id, step: row.i, beforeHash: row.beforeHash, actual: row.code, expected, matches: row.code === expected }); samples++;
        }
        const action = engine.getLegalActions(state.currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action); engine.step(action);
        if (samples >= 12) break;
    }
    if (probes.length >= 240) break;
}
const result = { tested: probes.length, mismatches: probes.filter(p => !p.matches).length, probes, modelSha256: sha(bytes), note: '验证默认队列是否逐步等同真实纯策略，不使用对局胜负选参数' };
save('phase53-audit/neural-queue-identity-audit.json', result);
console.log(JSON.stringify({ tested: result.tested, mismatches: result.mismatches }));
