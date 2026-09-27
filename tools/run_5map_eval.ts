import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI, type BattleSearchOptions } from '../src/game/ai/battle_search_ai';

export const MAP_CONFIGS: Record<string, { label: string; make: () => GameState }> = {
  liberty: { label: '(2) Liberty Port.aem', make: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD') },
  peak: { label: '(2) Peak Island.aem', make: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD') },
  icy: { label: '(2) Icy Paths.aem', make: () => createAppApkSkirmishGameState('(2) Icy Paths.aem', 'SD') },
  crossing: { label: '(2) The Crossing.aem', make: () => createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD') },
  mourning: { label: '(2) Mourningstar.aem', make: () => createAppApkSkirmishGameState('(2) Mourningstar.aem', 'SD') },
  duel: { label: '(2) Duel.aem', make: () => createDefaultAppGameState() }
};

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatchResult {
  map: string;
  gameIndex: number;
  newGoesFirst: boolean;
  winner: number | null;
  winnerPolicy: 'new' | 'heuristic' | 'draw';
  turns: number;
  steps: number;
  ms: number;
  capped: boolean;
  stats: string;
}

export function playSingleMatch(opts: {
  mapName: string;
  gameIndex: number;
  seed: number;
  safetyTurns: number;
  newGoesFirst: boolean;
  aiOptions?: BattleSearchOptions;
  customAI?: (seed: number) => { getAction: (engine: GameEngine, playerId: number) => any; getStats?: () => any };
}): MatchResult {
  const mapEntry = MAP_CONFIGS[opts.mapName];
  if (!mapEntry) throw new Error(`Unknown map: ${opts.mapName}`);

  const engine = new GameEngine(mapEntry.make());
  const hSeedBase = opts.seed + opts.gameIndex * 100003;
  const newAI = opts.customAI
    ? opts.customAI(hSeedBase + 777)
    : new BattleSearchAI(hSeedBase + 777, opts.aiOptions ?? {
        topK: 6,
        oppDepth: 3,
        friendlyRolloutSteps: 1,
        takeoverThreshold: 350,
        vetoMargin: 300,
        dangerLine: -800,
        searchStartTurn: 1
      });
  const heuAI = new HeuristicAI(mulberry(hSeedBase + 999));

  const policyOf = (pid: number): 'new' | 'heuristic' => {
    const newPid = opts.newGoesFirst ? 0 : 1;
    return pid === newPid ? 'new' : 'heuristic';
  };

  const t0 = Date.now();
  let steps = 0;
  const maxSteps = opts.safetyTurns * 80;

  while (engine.getState().winner === null && steps < maxSteps && engine.getState().turn <= opts.safetyTurns) {
    const s = engine.getState();
    const pol = policyOf(s.currentPlayer);
    const action = pol === 'new' ? newAI.getAction(engine, s.currentPlayer) : heuAI.getAction(engine, s.currentPlayer);
    engine.step(action);
    steps++;
  }

  const st = engine.getState();
  const capped = st.winner === null;
  let winnerPolicy: 'new' | 'heuristic' | 'draw' = 'draw';
  if (st.winner !== null && st.winner !== -1) {
    winnerPolicy = policyOf(st.winner);
  }

  const stats = (newAI as any).getStats ? JSON.stringify((newAI as any).getStats()) : '';
  return {
    map: opts.mapName,
    gameIndex: opts.gameIndex,
    newGoesFirst: opts.newGoesFirst,
    winner: st.winner,
    winnerPolicy,
    turns: st.turn,
    steps,
    ms: Date.now() - t0,
    capped,
    stats
  };
}

import { TrainedNeuralModelAI } from '../src/game/ai/trained_neural_model_ai';

async function main() {
  const args = process.argv.slice(2);
  const mapFilter = args.find(a => a.startsWith('--map='))?.split('=')[1]?.toLowerCase();
  const gamesPerMap = Number(args.find(a => a.startsWith('--games='))?.split('=')[1] ?? 4);
  const seed = Number(args.find(a => a.startsWith('--seed='))?.split('=')[1] ?? 1001);
  const useNeural = args.includes('--ai=neural') || true; // Always use neural AI

  const targetMaps = mapFilter ? [mapFilter] : ['liberty', 'peak', 'icy', 'crossing', 'mourning'];

  console.log(`=== 20-Game Evaluation Suite (5 Maps x ${gamesPerMap} Games) ===`);
  console.log(`Maps: ${targetMaps.join(', ')} | Seed: ${seed} | AI: ${useNeural ? 'TrainedNeuralModelAI' : 'BattleSearchAI'}`);

  // Pre-load model once
  const neuralAI = useNeural ? new TrainedNeuralModelAI() : null;

  let totalNewWins = 0;
  let totalHeuWins = 0;
  let totalDraws = 0;
  const allResults: MatchResult[] = [];

  for (const mapName of targetMaps) {
    console.log(`\n--- Map: ${MAP_CONFIGS[mapName].label} ---`);
    let mapNewWins = 0;
    for (let g = 0; g < gamesPerMap; g++) {
      const newGoesFirst = g % 2 === 0;
      const res = playSingleMatch({
        mapName,
        gameIndex: g,
        seed,
        safetyTurns: 600,
        newGoesFirst,
        customAI: neuralAI ? (_seed: number) => neuralAI : undefined
      });
      allResults.push(res);
      if (res.winnerPolicy === 'new') {
        mapNewWins++;
        totalNewWins++;
      } else if (res.winnerPolicy === 'heuristic') {
        totalHeuWins++;
      } else {
        totalDraws++;
      }
      console.log(`  [${mapName}] Game ${g + 1} (${newGoesFirst ? 'P0/first' : 'P1/second'}): winner=${res.winnerPolicy} (P${res.winner}) in ${res.turns} turns, ${res.steps} steps (${res.ms}ms)`);
    }
    console.log(`  Map score: ${mapNewWins}/${gamesPerMap}`);
  }

  const totalGames = allResults.length;
  console.log(`\n========================================`);
  console.log(`FINAL RESULT: New: ${totalNewWins}/${totalGames} | Heuristic: ${totalHeuWins}/${totalGames} | Draws: ${totalDraws}`);
  console.log(`Target: > 18 / 20 wins (${totalNewWins >= 19 ? 'SUCCESS >= 19!' : 'NOT YET MET'})`);
  console.log(`========================================`);

  if (totalGames === 20 && totalNewWins <= 18) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run_5map_eval.ts')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

