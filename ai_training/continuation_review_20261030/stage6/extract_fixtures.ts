import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';

// 仅重放已完成开发局，逐步核对前后态和权威合法性，不访问封存数据。
const here = path.dirname(fileURLToPath(import.meta.url));
const source = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/development-v2/C1';
const targets: [string, number][] = [['p2-3-s1', 25], ['p2-6-s1', 93], ['p4-18-s0', 43], ['p3-10-s2', 51]];
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const folder = path.join(here, 'diagnostic-fixtures');
fs.mkdirSync(folder, {recursive: true});
const receipts = [];
for (const [id, step] of targets) {
    const dir = path.join(source, id, id);
    const initialBytes = fs.readFileSync(path.join(dir, 'INITIAL.json'));
    const stepsBytes = fs.readFileSync(path.join(dir, 'steps.jsonl.gz'));
    const initial = JSON.parse(initialBytes.toString());
    const engine = new GameEngine(initial.state, initial.engineOptions);
    const rows = gunzipSync(stepsBytes).toString().trim().split('\n').map(line => JSON.parse(line));
    for (let i = 0; i <= step; i++) {
        const row = rows[i], state = engine.getState();
        if (row.step !== i || digest(JSON.stringify(state)) !== row.before || !engine.hasLegalAction(state.currentPlayer, row.action)) throw Error(`开发回放前态或合法性不符：${id}/${i}`);
        if (i === step) {
            const fixture = {id, step, state, engineOptions: initial.engineOptions, recordedAction: row.action, before: row.before, source: dir, initialSha256: digest(initialBytes), stepsSha256: digest(stepsBytes), trainingAllowed: false};
            const file = `${id}_step${step}.json`, bytes = JSON.stringify(fixture, null, 2) + '\n';
            fs.writeFileSync(path.join(folder, file), bytes, {flag: 'wx'});
            receipts.push({id, step, file, sha256: digest(bytes), verifiedSteps: i, gold: state.players.find(p => p.id === state.currentPlayer)?.gold});
        }
        engine.step(row.action);
        if (digest(JSON.stringify(engine.getState())) !== row.after) throw Error(`开发回放后态不符：${id}/${i}`);
    }
}
fs.writeFileSync(path.join(here, 'FIXTURE_EXTRACTION.json'), JSON.stringify({passed: true, sealedAccess: 0, receipts}, null, 2), {flag: 'wx'});
console.log(JSON.stringify(receipts));
