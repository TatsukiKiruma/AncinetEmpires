import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import type { Action, GameState } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { DIR, save } from './common';
import { DurableLog } from './durable_log';
import { extractGame } from './expert_extraction';

const folder = fs.mkdtempSync(path.join(DIR, 'atomic-fixture-'));
try {
    const initial: GameState = { turn: 1, currentPlayer: 0, winner: null,
        map: { width: 6, height: 6, tiles: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ terrainId: 6, ownerId: null }))) },
        players: [0, 1].map(id => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 })),
        units: [
            { id: 'a', ownerId: 0, unitClass: 'soldier', hp: 100, maxHp: 100, hasMoved: false, hasActed: false, pos: { x: 0, y: 0 } },
            { id: 'b', ownerId: 0, unitClass: 'soldier', hp: 100, maxHp: 100, hasMoved: false, hasActed: false, pos: { x: 1, y: 1 } },
            { id: 'own', ownerId: 0, unitClass: 'commander', hp: 100, maxHp: 100, hasMoved: false, hasActed: false, pos: { x: 0, y: 5 } },
            { id: 'enemy', ownerId: 1, unitClass: 'commander', hp: 1, maxHp: 100, hasMoved: false, hasActed: false, pos: { x: 2, y: 1 } },
        ] };
    const slot = { id: 'fixture', initialPath: path.join(folder, 'initial.json'), parentId: '合法独立测试夹具', prefix: 'fixture', configuredPlayers: 2 };
    save(slot.initialPath, initial);
    const prefix = path.join(folder, 'games', slot.id), writer = new DurableLog(path.join(prefix, 'actions.jsonl.gz')), engine = new GameEngine(initial);
    const moves: Action[] = [{ type: 'move', unitId: 'a', to: { x: 0, y: 1 } }, { type: 'move', unitId: 'b', to: { x: 2, y: 0 } }, { type: 'attack', attackerId: 'b', targetId: 'enemy' }];
    for (let i = 0; i < moves.length; i++) {
        const beforeHash = stateHash(engine.getState()), code = encodeAction(moves[i]);
        const legal = engine.getLegalActions(0).find(a => encodeAction(a) === code); assert.ok(legal, `夹具动作${i}必须合法`);
        const out = engine.step(legal);
        await writer.line({ i, code, player: 0, beforeHash, afterHash: stateHash(out.state), teacher: true, championTeacher: true, telemetry: { takeover: true, veto: false, queued: i > 0, rootValue: .5, retaliationAttempts: 1 } });
    }
    await writer.close(); assert.equal(engine.getState().winner, 0);
    save(path.join(prefix, 'result.json'), { actions: 3, winner: 0 });
    save(path.join(prefix, 'strict-replay.json'), { passed: true, actions: 3, witnessActions: 0 });
    // 第一步与默认动作相同；队列第二步改写默认斩杀，第三步又与默认斩杀相同。
    const reference = { getAction(e: GameEngine) { return e.getState().units.find(u => u.id === 'a')!.hasMoved ? moves[2] : moves[0]; } };
    const receipt = await extractGame(slot, path.relative(DIR, folder), new Set(), reference as unknown as Parameters<typeof extractGame>[3]);
    const samples = []; for await (const row of gzipRows(fs.readFileSync(path.join(prefix, 'samples.jsonl.gz')))) samples.push(row);
    assert.deepEqual(samples.map(s => s.quality), [1., 1.5, 1.]);
    assert.deepEqual(samples.map(s => s.rootMask), [true, false, false]);
    assert.equal(receipt.corrections, 1); assert.equal(receipt.correctedQueuedActions, 1); assert.equal(receipt.unchangedPlanOverrides, 2);
    save('phase51-audit/atomic-extraction-regression.json', { passed: true, weights: samples.map(s => s.quality), rootMask: samples.map(s => s.rootMask), actualActions: 3, correctionCount: 1, correctedQueuedActions: 1, source: '权威引擎验证的合法独立夹具；参考策略为测试替身，不作为模型棋力证据' });
} finally {
    assert.ok(path.resolve(folder).startsWith(DIR + path.sep) && path.basename(folder).startsWith('atomic-fixture-'));
    fs.rmSync(folder, { recursive: true });
}
