/**
 * 无封顶回合评估：新模型（BattleSearchAI） vs HeuristicAI
 * - 地图：默认 Duel（createDefaultAppGameState）
 * - 无封顶： safety 设 600 回合，但只要终局早于 safety 即视为自然终局；
 *   若触发 safety 则判为未分胜负（不计胜）。
 * - 交替先后手，固定种子可复现。
 * 用法： node --openssl-legacy-provider --import tsx tools/train_battle_eval_uncapped.ts [--games 20] [--seed 1001] [--safety 600] [--topK 12] [--oppK 8]
 */
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`${name} 需要数值`);
  return v;
}

function playOne(opts: { gameIndex: number; seed: number; safetyTurns: number; topK: number; oppK: number; newGoesFirst: boolean }): {
  winner: number | null; winnerPolicy: string | null; turns: number; steps: number; ms: number; capped: boolean;
} {
  const engine = new GameEngine(createDefaultAppGameState());
  const hSeedBase = opts.seed + opts.gameIndex * 100003;
  // 新模型执 P0 还是 P1 交替；heuristic 用独立 rng 流
  const newAI = new BattleSearchAI(hSeedBase + 777, { topK: opts.topK, oppProbeK: opts.oppK });
  const heuAI = new HeuristicAI(mulberry(hSeedBase + 999));
  // 给新模型不同对局不同 rng：BattleSearchAI 内部 heuristic 抖动用派生流
  const policyOf = (pid: number): string => {
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
  let winnerPolicy: string | null = null;
  if (st.winner !== null && st.winner !== -1) {
    winnerPolicy = policyOf(st.winner);
  } else if (st.winner === -1) {
    winnerPolicy = 'draw';
  }
  return { winner: st.winner, winnerPolicy, turns: st.turn, steps, ms: Date.now() - t0, capped };
}

async function main() {
  const games = parseArg('--games', 20);
  const seed = parseArg('--seed', 1001);
  const safety = parseArg('--safety', 600);
  const topK = parseArg('--topK', 12);
  const oppK = parseArg('--oppK', 8);
  let newWins = 0;
  let heuWins = 0;
  let draws = 0;
  console.log(`评估配置: games=${games} seed=${seed} safety=${safety} topK=${topK} oppK=${oppK} 地图=Duel无封顶`);
  for (let i = 0; i < games; i++) {
    // 交替先后手：偶数局新模型先手(P0)，奇数局后手(P1)
    const newGoesFirst = i % 2 === 0;
    const r = playOne({ gameIndex: i, seed, safetyTurns: safety, topK, oppK, newGoesFirst });
    if (r.winnerPolicy === 'new') newWins++;
    else if (r.winnerPolicy === 'heuristic') heuWins++;
    else draws++;
    console.log(`局 ${i + 1}/${games} 先手=${newGoesFirst ? 'new' : 'heuristic'} 胜者=${r.winnerPolicy ?? 'none'}(P${r.winner}) 回合=${r.turns} 步=${r.steps} 耗时=${r.ms}ms ${r.capped ? '[SAFETY截断]' : '[自然终局]'} 累计 new:${newWins} heu:${heuWins} draw:${draws}`);
  }
  console.log(`最终: new胜 ${newWins}/${games}， heuristic胜 ${heuWins}， 平/截断 ${draws}。${newWins > 15 ? '达标(>15)' : '未达标'}`);
  if (newWins <= 15) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
