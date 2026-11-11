import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { getAllianceId } from '../../../src/game/rule_config';

const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
const engine = new GameEngine(state);

console.log("Initial winner:", engine.getState().winner);
console.log("isTerminal:", engine.isTerminal());

// Player 0 surrenders
engine.step({ type: 'surrender' });

console.log("After P0 surrender:");
console.log("isTerminal:", engine.isTerminal());
console.log("winner playerId:", engine.getWinner());
console.log("winner alliance:", engine.getWinner() !== null ? getAllianceId(engine.getState(), engine.getWinner()!) : null);
