/** 独立重放困难版评测轨迹，逐步复核合法动作、状态摘要和自然胜负。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/engine';
import { parseAppApkSkirmishMap } from '../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState } from '../src/game/apk_skirmish';
import { encodeAction } from '../src/game/env';
import type { Action } from '../src/game/types';

const directory = path.resolve('deliverables/original_apk_hard_20261021/arena');
const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const games: Array<{ id: string; actions: number; winner: number | null }> = [];

for (const game of summary.games) {
    const map = parseAppApkSkirmishMap(game.mapName);
    const engine = new GameEngine(createApkSkirmishGameState(map, { mode: 'SD', mapName: game.mapName }));
    const trace = fs.readFileSync(path.join(directory, game.traceFile), 'utf8').trim().split('\n').filter(Boolean)
        .map(line => JSON.parse(line) as { action: Action; playerId: number; beforeStateSha256: string; afterStateSha256: string });
    assert.equal(trace.length, game.steps, `${game.id} 轨迹步数`);
    for (const [index, entry] of trace.entries()) {
        const prefix = `${game.id} 第 ${index + 1} 步`;
        assert.equal(engine.getState().currentPlayer, entry.playerId, `${prefix} 行动玩家`);
        assert.equal(digest(engine.getState()), entry.beforeStateSha256, `${prefix} 前状态`);
        assert.ok(engine.getLegalActions(entry.playerId).some(action => encodeAction(action) === encodeAction(entry.action)), `${prefix} 非法动作`);
        const result = engine.step(entry.action);
        assert.equal(digest(result.state), entry.afterStateSha256, `${prefix} 后状态`);
    }
    assert.equal(engine.getState().winner, game.winner, `${game.id} 胜方`);
    assert.notEqual(engine.getState().winner, null, `${game.id} 必须自然结束`);
    games.push({ id: game.id, actions: trace.length, winner: game.winner });
}

const result = { passed: true, games: games.length, strictActions: games.reduce((sum, game) => sum + game.actions, 0),
    stateHashesVerified: games.reduce((sum, game) => sum + game.actions * 2, 0), results: games };
fs.writeFileSync(path.join(directory, 'strict-replay-verification.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
