import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { createDefaultAppGameState } from '../src/game/default_state';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync, type SupportedSpatialPolicy } from '../src/game/ai/spatial_neural_adapter';
import { getAiAction, type SupportedAiPolicy } from '../src/game/ai/neural_ai_adapter';

const MAPS: Record<string, () => any> = {
  duel: () => createDefaultAppGameState(),
  liberty: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'),
  peak: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD'),
  icy: () => createAppApkSkirmishGameState('(2) Icy Paths.aem', 'SD'),
  crossing: () => createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD'),
  mourning: () => createAppApkSkirmishGameState('(2) Mourningstar.aem', 'SD')
};

const policy = (process.argv[2] as any) || 'spatial_v2_experimental';
const mapName = (process.argv[3] || 'liberty').toLowerCase();
const p0Policy = process.argv[4] || 'model'; // 'model' or 'heuristic'
const maxTurns = Number(process.argv[5] || '100');

console.log(`Testing Policy: ${policy} on map: ${mapName} (P0: ${p0Policy}) maxTurns: ${maxTurns}`);

const makeState = MAPS[mapName];
if (!makeState) throw new Error(`Unknown map: ${mapName}`);

const engine = new GameEngine(makeState());
const heu = new HeuristicAI();

let lastTurn = -1;
let steps = 0;
const t0 = Date.now();

while (engine.getState().winner === null && steps < maxTurns * 80 && engine.getState().turn <= maxTurns) {
  const s = engine.getState();
  if (s.turn !== lastTurn) {
    lastTurn = s.turn;
    const u0 = s.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
    const u1 = s.units.filter(u => u.ownerId === 1 && u.hp > 0).length;
    console.log(`[T${s.turn}] gold=${s.players[0].gold}/${s.players[1].gold} units=${u0}/${u1} steps=${steps} (${Date.now() - t0}ms)`);
  }

  const isModelTurn = (p0Policy === 'model' && s.currentPlayer === 0) || (p0Policy !== 'model' && s.currentPlayer === 1);
  let action: any;
  if (isModelTurn) {
    if (policy.startsWith('spatial_')) {
      const res = getSpatialAiActionSync(engine, s.currentPlayer, { policy: policy as SupportedSpatialPolicy, allowInteractiveFallback: false });
      action = res.action;
    } else {
      const res = getAiAction(policy as SupportedAiPolicy, engine, s.currentPlayer, { allowInteractiveFallback: false });
      action = res.action;
    }
  } else {
    action = heu.getAction(engine, s.currentPlayer);
  }

  engine.step(action);
  steps++;
}

const finalState = engine.getState();
const winner = finalState.winner;
console.log(`Finished: winner=P${winner} in ${finalState.turn} turns, ${steps} steps (${Date.now() - t0}ms)`);

