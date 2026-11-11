import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, restore, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { metricsTracker } from './battle';

// 工程停止可能发生在result落盘和strict收据之间；补充收据另存，归档原件不写入。
const arena = read('phase52-audit/runtime-freeze.json').archive, plan = read(arena + '/plan.json');
for (const slot of plan.slots) {
    const prefix = `${arena}/battles/${slot.id}`;
    if (!fs.existsSync(path.join(DIR, prefix, 'result.json')) || fs.existsSync(path.join(DIR, prefix, 'strict-replay.json'))) continue;
    const result = read(prefix + '/result.json'), initial = read(plan.maps[slot.mapIndex].path), engine = new GameEngine(initial), tracker = metricsTracker(slot.modelSeats);
    let actions = 0, witnessActions = 0, witnesses = 0;
    const log = fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz'));
    for await (const row of gzipRows(log)) {
        const before = engine.getState(); assert.equal(stateHash(before), row.beforeHash);
        const legal = engine.getLegalActions(before.currentPlayer), action = legal.find(a => encodeAction(a) === row.code); assert.ok(action);
        const out = engine.step(action); assert.ok(!out.info.includes('非法动作')); assert.equal(stateHash(out.state), row.afterHash);
        tracker.apply(before, legal, action, out.state); actions++;
    }
    assert.equal(actions, result.actions); assert.equal(stateHash(engine.getState()), result.finalHash); assert.deepEqual(tracker.metrics, result.metrics);
    for await (const w of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'witnesses.jsonl.gz')))) {
        const counter = new GameEngine(restore(w.state, initial.map, w.patches, w.mapIndex));
        for (const action of w.actions) {
            assert.ok(counter.getLegalActions(counter.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(action)));
            assert.ok(!counter.step(action).info.includes('非法动作')); witnessActions++;
        }
        assert.equal(stateHash(counter.getState()), w.finalSha256); witnesses++;
    }
    save(`phase52-audit/archive-strict/${slot.id}.json`, { passed: true, actions, witnessActions, witnesses, finalHash: result.finalHash, logSha256: sha(log), source: prefix, archiveBytesUnchanged: true });
    console.log(JSON.stringify({ slot: slot.id, actions, witnessActions, passed: true }));
}
