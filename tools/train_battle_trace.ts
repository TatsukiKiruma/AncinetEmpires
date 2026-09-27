/** 单局流程追踪：每回合记录双方军力/金币/地盘/单位数。用法：... train_battle_trace.ts --map liberty --seed 1001 --game 1 --p0 new|heuristic */
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';
import { getUnitCost } from '../src/game/rule_config';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getTileTerrainKey } from '../src/game/terrain_rules';

const MAPS: Record<string, () => GameState> = {
  duel: () => createDefaultAppGameState(),
  liberty: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'),
  peak: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD'),
  icy: () => createAppApkSkirmishGameState('(2) Icy Paths.aem', 'SD'),
  crossing: () => createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD'),
  mourning: () => createAppApkSkirmishGameState('(2) Mourningstar.aem', 'SD')
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
function army(st: GameState, pid: number): number {
  return st.units.filter(u => u.ownerId === pid && u.hp > 0)
    .reduce((s, u) => s + (getUnitCost(st, u.ownerId, u.unitClass) ?? UNIT_CONFIGS[u.unitClass]?.cost ?? 200), 0);
}
function terr(st: GameState, pid: number): { castle: number; town: number } {
  let castle = 0; let town = 0;
  for (const row of st.map.tiles) for (const t of row) {
    if ((t as { ownerId: number | null }).ownerId === pid) {
      const k = getTileTerrainKey(t as never);
      if (k === 'castle') castle++;
      else if (k === 'town' || k === 'damaged_town') town++;
    }
  }
  return { castle, town };
}
const mapKey = arg('--map', 'liberty').toLowerCase();
const seed = Number(arg('--seed', '1001'));
const gameIdx = Number(arg('--game', '1')) - 1;
const p0kind = arg('--p0', 'new');
const hBase = seed + gameIdx * 100003;
const swap = process.argv.includes('--swap');
const newAI = new BattleSearchAI(hBase + 777, { topK: 6, oppDepth: 3, friendlyRolloutSteps: 1, takeoverThreshold: 350, vetoMargin: 300, dangerLine: -800 });
const heuH = new HeuristicAI(mulberry(hBase + (swap ? 1000 : 999)));
const heuA = new HeuristicAI(mulberry(hBase + (swap ? 999 : 1000)));
const engine = new GameEngine(MAPS[mapKey]());
let lastTurn = -1;
console.log('turn cur P0army/P1army P0gold/P1gold P0terr(c/t)/P1terr units0/units1');
let steps = 0;
while (engine.getState().winner === null && steps < 600 * 80 && engine.getState().turn <= 600) {
  const s = engine.getState();
  if (s.turn !== lastTurn) {
    lastTurn = s.turn;
    const t0 = terr(s, 0); const t1 = terr(s, 1);
    const u0 = s.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
    const u1 = s.units.filter(u => u.ownerId === 1 && u.hp > 0).length;
    console.log(`T${s.turn} cur=P${s.currentPlayer} army=${army(s, 0)}/${army(s, 1)} gold=${s.players[0].gold}/${s.players[1].gold} terr=${t0.castle}+${t0.town}/${t1.castle}+${t1.town} units=${u0}/${u1}`);
  }
  const pol = s.currentPlayer === 0 ? p0kind : 'heuristic';
  const ai = pol === 'new' ? newAI : (s.currentPlayer === 0 ? heuH : heuA);
  const action = ai.getAction(engine, s.currentPlayer);
  if (process.argv.includes('--actions') && s.turn >= Number(arg('--from', '1'))) {
    console.log(`  T${s.turn} P${s.currentPlayer} ${JSON.stringify(action)}`);
  }
  engine.step(action);
  steps++;
}
console.log(`END winner=P${engine.getState().winner} turns=${engine.getState().turn} steps=${steps}`);
console.log('newAI stats', JSON.stringify(newAI.getStats()));
