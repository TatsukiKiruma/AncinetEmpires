import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';
import { encodePlayerOrder } from '../../src/ai_runtime/dual_v2/player_order';
import { activeOutcomeTarget } from './value_target';
import { save } from './common';

const state: GameState = { turn: 5, currentPlayer: 0, winner: null,
    map: { width: 6, height: 6, tiles: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ terrainId: 6, ownerId: null }))) },
    players: [0, 1, 2, 3].map(id => ({ id, gold: 0, isAlive: id !== 2, commanderDeathCount: 0 })),
    units: [0, 1, 3].map((id, i) => ({ id: `commander-${id}`, ownerId: id, unitClass: 'commander', hp: 100, maxHp: 100, hasMoved: false, hasActed: false, pos: { x: i === 1 ? 5 : 0, y: i ? 5 : 0 } })),
    rules: { alliances: { 0: 0, 1: 1, 2: 0, 3: 1 } } };
const engine = new GameEngine(state); assert.ok(engine.getLegalActions(0).length > 1 && !engine.isTerminal());
const order = encodePlayerOrder(engine.getState()), outcome = activeOutcomeTarget(engine.getState(), order, 0);
assert.equal(outcome.valueMask, true); assert.equal(outcome.target.reduce((a, b) => a + b, 0), 1);
assert.equal(outcome.target[order.slotByPlayer.get(2)!], 0); assert.equal(outcome.target[order.slotByPlayer.get(0)!], 1);
const truncated = activeOutcomeTarget(engine.getState(), order, null); assert.equal(truncated.valueMask, false);
save('outcome-target-regression.json', { passed: true, eliminatedWinningAllyMasked: true, allianceWinMassPreserved: true, truncationDoesNotBecomeTerminal: true, source: '合法独立联盟夹具，不冒充真实对局' });
