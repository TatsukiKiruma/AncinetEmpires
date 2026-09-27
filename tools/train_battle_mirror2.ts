/** Heuristic 内战基线（分地图）：node ... train_battle_mirror2.ts --map liberty --games 2 --seed 1001 */
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';

const MAPS: Record<string, () => GameState> = {
  duel: () => createDefaultAppGameState(),
  liberty: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'),
  peak: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD')
};
function arg(name: string, fb: string): string {
  const i = process.argv.indexOf(name);
  return i < 0 ? fb : process.argv[i + 1] ?? fb;
}
function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mapKey = arg('--map', 'duel').toLowerCase();
const games = Number(arg('--games', '2'));
const seed = Number(arg('--seed', '1001'));
const safety = 600;
for (let i = 0; i < games; i++) {
  const t0 = Date.now();
  const engine = new GameEngine(MAPS[mapKey]());
  const swap = process.argv.includes('--swap');
  const hBase = seed + i * 100003;
  const ai0 = new HeuristicAI(mulberry(hBase + (swap ? 1000 : 999)));
  const ai1 = new HeuristicAI(mulberry(hBase + (swap ? 999 : 1000)));
  let steps = 0;
  while (engine.getState().winner === null && steps < safety * 80 && engine.getState().turn <= safety) {
    const s = engine.getState();
    engine.step((s.currentPlayer === 0 ? ai0 : ai1).getAction(engine, s.currentPlayer));
    steps++;
  }
  console.log(`mirror ${mapKey} 局${i + 1} winner=P${engine.getState().winner} turns=${engine.getState().turn} steps=${steps} ms=${Date.now() - t0}`);
}
