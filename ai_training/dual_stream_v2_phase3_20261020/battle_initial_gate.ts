import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, isTeamEnabled } from '../../src/game/rule_config';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
const dir = path.dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'battle-plan.json'), 'utf8'));
const receipts = plan.maps.map((map: any) => {
    const initial = JSON.parse(fs.readFileSync(path.join(dir, map.path), 'utf8'));
    const engine = new GameEngine(initial), state = engine.getState(), clone = engine.clone();
    assert.equal(stateHash(initial), map.sha256); assert.equal(stateHash(state), map.sha256);
    assert.equal(stateHash(clone.getState()), map.sha256);
    const actions = engine.getLegalActions(state.currentPlayer).map(encodeAction);
    assert.equal(new Set(actions).size, actions.length);
    assert.deepEqual(clone.getLegalActions(state.currentPlayer).map(encodeAction), actions);
    return { map: map.name, initialHash: map.sha256, snapshotIncomeNotRepeated: true, cloneAndOrderedMaskExact: true,
        players: state.players.filter(p => isTeamEnabled(state, p.id)).map(p => ({ id: p.id, gold: p.gold, alliance: getAllianceId(state, p.id) })), actions: actions.length };
});
fs.writeFileSync(path.join(dir, 'battle-initial-gate.json'), JSON.stringify({ passed: true, maps: receipts.length, receipts }, null, 2));
