import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { evaluatePositionHeuristic } from './v7_heuristic_bounded_search';
import { Action, GameState } from '../src/game/types';
import { getAllianceId } from '../src/game/rule_config';

const MAPS: Record<string, string> = {
  liberty: '(2) Liberty Port.aem',
  peak: '(2) Peak Island.aem',
  icy: '(2) Icy Paths.aem',
  crossing: '(2) The Crossing.aem',
  mourning: '(2) Mourningstar.aem'
};

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TrainingSample {
  sampleId: string;
  mapName: string;
  turn: number;
  playerId: number;
  stateVec: number[];
  candidateActions: number[][]; // Array of 45-dim vectors
  targetActionIndex: number;
  valueTarget: number; // in [-1, 1]
}

async function main() {
  const outDir = path.resolve('training_runs/model_training_5maps');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dataset_5maps.jsonl');

  console.log(`[DataGen] Generating 5-map dataset at ${outPath}...`);
  const t0 = Date.now();

  const outStream = fs.createWriteStream(outPath, { encoding: 'utf8' });
  let totalSamples = 0;
  let matchCount = 0;

  // 2 matches per map (10 matches total)
  for (const [mapKey, mapFile] of Object.entries(MAPS)) {
    console.log(`  Simulating matches for map: ${mapKey} (${mapFile})...`);
    for (let m = 0; m < 2; m++) {
      matchCount++;
      const seed = 5000 + matchCount * 137;
      const engine = new GameEngine(createAppApkSkirmishGameState(mapFile, 'SD'));
      const h0 = new HeuristicAI(mulberry(seed + 1));
      const h1 = new HeuristicAI(mulberry(seed + 2));

      interface StepRecord {
        playerId: number;
        turn: number;
        stateVec: number[];
        candVecs: number[][];
        targetIndex: number;
        posScore: number;
      }
      const matchSteps: StepRecord[] = [];

      let steps = 0;
      while (engine.getState().winner === null && steps < 300 && engine.getState().turn <= 35) {
        const s = engine.getState();
        const curPlayer = s.currentPlayer;
        const legal = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
        if (legal.length === 0) break;

        const ai = curPlayer === 0 ? h0 : h1;
        const expertAction = ai.getAction(engine, curPlayer, legal);

        // Find index of chosen action
        let targetIndex = legal.findIndex(a => JSON.stringify(a) === JSON.stringify(expertAction));
        if (targetIndex === -1) targetIndex = 0;

        const stateVec = Array.from(encodeGameState(s, curPlayer));
        const candVecs = legal.map(a => Array.from(encodeGameActionV2(s, curPlayer, a)));
        const rawScore = evaluatePositionHeuristic(s, curPlayer);

        matchSteps.push({
          playerId: curPlayer,
          turn: s.turn,
          stateVec,
          candVecs,
          targetIndex,
          posScore: rawScore
        });

        engine.step(expertAction);
        steps++;
      }

      const finalState = engine.getState();
      const winner = finalState.winner;

      // Assign calibrated valueTarget to each step
      for (let sIdx = 0; sIdx < matchSteps.length; sIdx++) {
        const step = matchSteps[sIdx];
        const isWinner = winner !== null && winner !== -1 && winner === step.playerId;
        const isLoser = winner !== null && winner !== -1 && winner !== step.playerId;

        // Terminal outcome + position heuristic blend
        let valTarget = Math.tanh(step.posScore / 2500); // smooth [-1, 1]
        if (isWinner) {
          const discount = Math.pow(0.98, matchSteps.length - 1 - sIdx);
          valTarget = 0.5 * valTarget + 0.5 * discount;
        } else if (isLoser) {
          const discount = Math.pow(0.98, matchSteps.length - 1 - sIdx);
          valTarget = 0.5 * valTarget - 0.5 * discount;
        }
        valTarget = Math.max(-1.0, Math.min(1.0, valTarget));

        const sample: TrainingSample = {
          sampleId: `s_${mapKey}_m${m}_step${sIdx}`,
          mapName: mapKey,
          turn: step.turn,
          playerId: step.playerId,
          stateVec: step.stateVec,
          candidateActions: step.candVecs,
          targetActionIndex: step.targetIndex,
          valueTarget: Number(valTarget.toFixed(4))
        };

        outStream.write(JSON.stringify(sample) + '\n');
        totalSamples++;
      }
      console.log(`    Match ${m + 1}/2 on ${mapKey} done: ${matchSteps.length} steps recorded (winner=P${winner}, turn=${finalState.turn})`);
    }
  }

  await new Promise(resolve => outStream.end(resolve));
  console.log(`[DataGen] Done! Generated ${totalSamples} samples across ${matchCount} matches in ${Date.now() - t0}ms`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
