import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync, constants } from 'node:zlib';
import { DIR, read, save } from './common';
import { sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { turnStateHash } from '../../src/ai_runtime/dual_v2/turn_search_ai';

// 用户停止时只审计已落盘完整行，未完成对局不补造终局。
const arena = 'generations/gen_01/arena', plan = read(arena + '/plan.json');
const prefixes: any[] = [];
function rows(file: string) {
    const raw = fs.readFileSync(file); let truncatedTail = false, plain: string;
    try { plain = raw.length ? gunzipSync(raw).toString('utf8') : ''; }
    catch { plain = gunzipSync(raw, { finishFlush: constants.Z_SYNC_FLUSH }).toString('utf8'); truncatedTail = true; }
    const lines = plain.split('\n');
    if (lines[lines.length - 1]) truncatedTail = true;
    lines.pop();
    return { rows: lines.filter(Boolean).map(s => JSON.parse(s)), truncatedTail, sha256: sha(raw), bytes: raw.length };
}
for (const slot of plan.slots) {
    const folder = path.join(DIR, arena, 'battles', slot.id);
    if (!fs.existsSync(path.join(folder, 'started.json')) || fs.existsSync(path.join(folder, 'result.json'))) continue;
    const initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial);
    const actual = rows(path.join(folder, 'actions.jsonl.gz')), witness = rows(path.join(folder, 'witnesses.jsonl.gz'));
    for (const row of actual.rows) {
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code);
        assert.ok(action && action.type !== 'surrender');
        const out = engine.step(action); assert.ok(!out.info.includes('非法动作'));
        assert.equal(stateHash(out.state), row.afterHash);
    }
    let witnessActions = 0;
    for (const w of witness.rows) {
        const map = { ...initial.map, tiles: initial.map.tiles.map((r: any[]) => r.slice()) };
        for (const [index, tile] of w.patches ?? []) map.tiles[Math.floor(index / map.width)][index % map.width] = tile;
        const keys = Object.keys(w.state), state = Object.fromEntries([...keys.slice(0, w.mapIndex).map(k => [k, w.state[k]]), ['map', map], ...keys.slice(w.mapIndex).map(k => [k, w.state[k]])]);
        const counter = new GameEngine(state);
        for (const action of w.actions) {
            assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(action)));
            assert.ok(!counter.step(action).info.includes('非法动作')); witnessActions++;
        }
        assert.equal(sha(turnStateHash(counter.getState())), w.finalSha256 ?? sha(w.finalHash));
    }
    const receipt = { slot: slot.id, classification: 'user_interrupted', passed: true, actions: actual.rows.length, witnesses: witness.rows.length, witnessActions, actualLog: { ...actual, rows: undefined }, witnessLog: { ...witness, rows: undefined }, finalPersistedHash: stateHash(engine.getState()), completeGame: false, auditedAt: new Date().toISOString() };
    save(path.join(arena, 'battles', slot.id, 'USER_STOP_STRICT.json'), receipt); prefixes.push(receipt);
}
const results = plan.slots.map((s: any) => path.join(DIR, arena, 'battles', s.id, 'result.json')).filter((f: string) => fs.existsSync(f)).map((f: string) => read(f));
const stopped = { reason: '用户要求先停止，转手机先、电脑后的同10槽计时验证', stoppedAt: new Date().toISOString(), stoppedProcessTree: [41552, 24696, 19424, 26252, 31816, 45084], completedSlots: results.length, pureCompleted: results.filter((r: any) => r.slot.mode === 'pure').length, searchCompleted: results.filter((r: any) => r.slot.mode === 'turn_search').length, interrupted: prefixes, currentChampionGeneration: read('league-state.json').championGeneration };
save('USER_STOP_FOR_DEVICE_COMPARISON.json', stopped);
save('pipeline-status-before-device-comparison.json', read('pipeline-status.json'));
save('pipeline-status.json', { stage: 'user-stopped-for-device-comparison', pids: [], stoppedAt: stopped.stoppedAt });
save('TASK_STATE.json', { ...read('TASK_STATE.json'), status: 'user_stopped_for_device_comparison', gen01Stage: 'incomplete_arena_preserved', phoneThenPcSlots: 10, stoppedAt: stopped.stoppedAt });
console.log(JSON.stringify(stopped));
