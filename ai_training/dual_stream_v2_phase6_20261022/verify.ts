/** 不调用AI的独立strict实际动作与反扑见证复核。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
const folder = path.resolve(process.argv[2]), summary = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf8'));
const hash = (s: unknown) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
let actions = 0, witnesses = 0, witnessActions = 0;
for (const game of summary.games) {
    const base = path.join(folder, game.id), engine = new GameEngine(JSON.parse(fs.readFileSync(path.join(base,'initial.json'),'utf8')));
    for (const line of fs.readFileSync(path.join(base,'actions.jsonl'),'utf8').trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line); assert.equal(hash(engine.getState()),row.beforeHash);
        assert.ok(engine.getLegalActions(row.playerId).some(a=>encodeAction(a)===encodeAction(row.action)));
        engine.step(row.action); assert.equal(hash(engine.getState()),row.afterHash); actions++;
    }
    assert.equal(hash(engine.getState()),game.finalSha256); assert.equal(engine.getState().winner,game.winner);
    const witnessPath = path.join(base,'witnesses.jsonl.gz');
    if (fs.existsSync(witnessPath)) for (const line of gunzipSync(fs.readFileSync(witnessPath)).toString('utf8').trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line), replay = new GameEngine(row.initial);
        for (const action of row.actions) {
            assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)));
            replay.step(action); witnessActions++;
        }
        assert.equal(hash(replay.getState()),row.finalSha256); witnesses++;
    }
}
const receipt = {passed:true,games:summary.games.length,actions,witnesses,witnessActions,summarySha256:hash(fs.readFileSync(path.join(folder,'summary.json'),'utf8'))};
fs.writeFileSync(path.join(folder,'independent-strict-replay.json'),JSON.stringify(receipt,null,2)); console.log(JSON.stringify(receipt));
