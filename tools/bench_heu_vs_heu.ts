import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const MAPS = [
  '(2) Liberty Port.aem',
  '(2) Peak Island.aem',
  '(2) Icy Paths.aem',
  '(2) The Crossing.aem',
  '(2) Mourningstar.aem'
];

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const map of MAPS) {
  let p0Wins = 0;
  let p1Wins = 0;
  for (let g = 0; g < 4; g++) {
    const seed = 1000 + g * 37;
    const engine = new GameEngine(createAppApkSkirmishGameState(map, 'SD'));
    const h0 = new HeuristicAI(mulberry(seed + 1));
    const h1 = new HeuristicAI(mulberry(seed + 2));
    let steps = 0;
    while (engine.getState().winner === null && steps < 1200 && engine.getState().turn <= 100) {
      const s = engine.getState();
      const ai = s.currentPlayer === 0 ? h0 : h1;
      engine.step(ai.getAction(engine, s.currentPlayer));
      steps++;
    }
    const w = engine.getState().winner;
    if (w === 0) p0Wins++;
    else if (w === 1) p1Wins++;
  }
  console.log(`[Heu vs Heu] ${map}: P0=${p0Wins}, P1=${p1Wins}`);
}
