import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { sha } from '../stage1/io';

/** 从真实初态重放完整动作序列，独立核对抽样前态与回合边界。 */
const folder = process.argv[2];
let games = 0, samples = 0;
for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.json.gz'))) {
    const row = JSON.parse(gunzipSync(fs.readFileSync(path.join(folder, name))).toString());
    if (!row.initial) throw Error('缺少可重放初态');
    const engine = new GameEngine(row.initial, {applyInitialTurnStart: false});
    let boundary = true;
    for (let i = 0; i < row.actions.length; i++) {
        const state = engine.getState();
        for (const sample of row.samples.filter((r: any) => r.step === i)) {
            if (sha(JSON.stringify(sample.state)) !== sha(JSON.stringify(state)) || sample.boundary !== boundary) throw Error('抽样前态或边界不一致');
            samples++;
        }
        const action = engine.getLegalActions(state.currentPlayer).find(a => encodeAction(a) === row.actions[i]);
        if (!action) throw Error('回放动作非法');
        const next = engine.step(action).state;
        boundary = next.currentPlayer !== state.currentPlayer || next.turn !== state.turn;
    }
    if (engine.getState().winner !== row.winner) throw Error('终局赢家不一致');
    if (row.eligible && (!row.natural || row.winner === null || row.winner === -1 || row.samples.length !== 12 || row.samples.filter((r: any) => r.boundary).length < 6)) throw Error('自然胜负与抽样合同失败');
    games++;
}
if (!games) throw Error('没有完整收据可核验');
console.log(JSON.stringify({passed: true, games, samples}));
