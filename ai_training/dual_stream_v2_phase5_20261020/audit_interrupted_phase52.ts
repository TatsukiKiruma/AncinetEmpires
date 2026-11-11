import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync, constants } from 'node:zlib';
import { DIR, read, save, restore, sha } from './common';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';

const arena = 'champion-search-arena', plan = read(arena + '/plan.json');
function rows(file: string) {
    const raw = fs.readFileSync(file);
    let plain: string, truncatedTail = false;
    try { plain = raw.length ? gunzipSync(raw).toString() : ''; }
    catch { plain = gunzipSync(raw, { finishFlush: constants.Z_SYNC_FLUSH }).toString(); truncatedTail = true; }
    const lines = plain.split('\n'); if (lines.at(-1)) truncatedTail = true; lines.pop();
    return { rows: lines.filter(Boolean).map(line => JSON.parse(line)), truncatedTail, sha256: sha(raw) };
}
const receipts = [];
for (const slot of plan.slots) {
    const prefix = `${arena}/battles/${slot.id}`, folder = path.join(DIR, prefix);
    if (!fs.existsSync(path.join(folder, 'started.json')) || fs.existsSync(path.join(folder, 'result.json'))) continue;
    const initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial);
    const actual = rows(path.join(folder, 'actions.jsonl.gz')), witnesses = rows(path.join(folder, 'witnesses.jsonl.gz'));
    for (const row of actual.rows) {
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
        assert.equal(stateHash(engine.step(action).state), row.afterHash);
    }
    let witnessActions = 0;
    for (const row of witnesses.rows) {
        const counter = new GameEngine(restore(row.state, initial.map, row.patches, row.mapIndex));
        for (const action of row.actions) {
            assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(action)));
            assert.ok(!counter.step(action).info.includes('非法动作')); witnessActions++;
        }
        assert.equal(stateHash(counter.getState()), row.finalSha256);
    }
    const receipt = { passed: true, actions: actual.rows.length, witnesses: witnesses.rows.length, witnessActions, classification: 'engineering_interrupted', actualTailIncomplete: actual.truncatedTail, witnessTailIncomplete: witnesses.truncatedTail, finalPersistedHash: stateHash(engine.getState()), completeGame: false, reason: process.env.PHASE52_STOP_REASON ?? '定向unitId查询保留全局动作，必须恢复actor语义过滤；全部已持久动作与见证通过strict' };
    save(prefix + '/INTERRUPTION_STRICT.json', receipt); receipts.push(receipt);
}
save('phase52-audit/initial-runtime-interruptions.json', { receipts, noNaturalResultInferred: true });
console.log(JSON.stringify(receipts));
