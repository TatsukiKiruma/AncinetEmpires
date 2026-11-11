import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync, constants } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { turnStateHash } from '../../src/ai_runtime/dual_v2/turn_search_ai';
const dir = import.meta.dirname, plan = JSON.parse(fs.readFileSync(path.join(dir, 'battle-plan.json'), 'utf8'));
const rows = (file: string) => {
    const text = gunzipSync(fs.readFileSync(file), { finishFlush: constants.Z_SYNC_FLUSH }).toString('utf8');
    return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(x => JSON.parse(x));
};
const receipts = [];
for (const entry of fs.readdirSync(path.join(dir, 'battle-attempt01'), { withFileTypes: true }).filter(x => x.isDirectory())) {
    const root = path.join(dir, 'battle-attempt01', entry.name), started = JSON.parse(fs.readFileSync(path.join(root, 'started.json'), 'utf8'));
    const initial = JSON.parse(fs.readFileSync(path.join(dir, plan.maps[started.slot.mapIndex].path), 'utf8')), engine = new GameEngine(initial);
    let actions = 0, witnesses = 0, witnessActions = 0;
    for (const row of rows(path.join(root, 'actions.jsonl.gz'))) {
        assert.equal(stateHash(engine.getState()), row.beforeHash);
        const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
        assert.equal(stateHash(engine.step(action).state), row.afterHash); actions++;
    }
    for (const w of rows(path.join(root, 'witnesses.jsonl.gz'))) {
        const replay = new GameEngine(w.initial);
        for (const a of w.actions) { assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(b => encodeAction(b) === encodeAction(a))); replay.step(a); witnessActions++; }
        assert.equal(turnStateHash(replay.getState()), w.finalHash); witnesses++;
    }
    receipts.push({ id: entry.name, recordedPrefixStrictPassed: true, actions, witnesses, witnessActions, unflushedTailUnknown: true, fullRunStrictPassed: false });
}
fs.writeFileSync(path.join(dir, 'interrupted-attempt-audit.json'), JSON.stringify({ passed: false, reason: '进程在见证大小保护后异常退出；完整记录前缀通过，未flush尾部不能恢复或宣称通过', receipts }, null, 2));
console.log(JSON.stringify(receipts));
