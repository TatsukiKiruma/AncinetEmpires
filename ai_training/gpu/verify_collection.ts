/** 独立严格重放项目采集轨迹，不加载神经网络；截断始终不计自然结束。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';

const directory = path.resolve(process.argv[2]);
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const results = [];
for (const name of fs.readdirSync(directory).filter(n => /^game-\d+\.json$/.test(n))) {
    const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    const engine = new GameEngine(record.initial, { applyInitialTurnStart: false });
    const lines = gunzipSync(fs.readFileSync(path.join(directory, name.replace('.json', '.jsonl.gz')))).toString().trim().split('\n');
    let steps = 0;
    for (const line of lines) {
        const row = JSON.parse(line), state = engine.getState();
        if (row.step !== steps || row.before !== hash(state) || !engine.hasLegalAction(state.currentPlayer, row.action)) throw Error(`${name}第${steps}步严格合法性或前态不符`);
        if (hash(engine.step(row.action).state) !== row.after) throw Error(`${name}第${steps}步后态不符`);
        steps++;
    }
    if (steps !== record.steps || engine.getState().winner !== record.winner || record.natural !== (engine.getState().winner !== null)) throw Error(`${name}终局分类不符`);
    results.push({ id: record.id, steps, natural: record.natural, passed: true });
}
if (!results.length) throw Error('没有可验证对局');
fs.writeFileSync(path.join(directory, 'STRICT_REPLAY.json'), JSON.stringify({ passed: true, games: results.length, results }, null, 2));
console.log(JSON.stringify({ passed: true, games: results.length }));
