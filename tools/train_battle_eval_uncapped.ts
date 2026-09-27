/**
 * 无封顶回合评估：新模型（BattleSearchAI） vs HeuristicAI
 * - 地图：--map duel | liberty | peak（默认 duel；liberty=(2) Liberty Port, peak=(2) Peak Island）
 * - 无封顶： safety 设 600 回合，但只要终局早于 safety 即视为自然终局；
 *   若触发 safety 则判为未分胜负（不计胜）。
 * - 交替先后手，固定种子可复现。
 * 用法： node --openssl-legacy-provider --import tsx tools/train_battle_eval_uncapped.ts [--games 20] [--seed 1001] [--map duel]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { GameEngine } from '../src/game/engine';
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';

function gitHead(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseStringArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1] ?? fallback;
}

const MAP_TABLE: Record<string, { label: string; make: () => GameState }> = {
  duel: { label: '(2) Duel.aem', make: () => createDefaultAppGameState() },
  liberty: { label: '(2) Liberty Port.aem', make: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD') },
  peak: { label: '(2) Peak Island.aem', make: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD') },
  icy: { label: '(2) Icy Paths.aem', make: () => createAppApkSkirmishGameState('(2) Icy Paths.aem', 'SD') },
  crossing: { label: '(2) The Crossing.aem', make: () => createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD') },
  mourning: { label: '(2) Mourningstar.aem', make: () => createAppApkSkirmishGameState('(2) Mourningstar.aem', 'SD') },
  swords: { label: '(2) Crossed swords.aem', make: () => createAppApkSkirmishGameState('(2) Crossed swords.aem', 'SD') },
  swamp: { label: '(2) Swamplands.aem', make: () => createAppApkSkirmishGameState('(2) Swamplands.aem', 'SD') }
};

function parseMapName(): string {
  const i = process.argv.indexOf('--map');
  const v = (i >= 0 ? process.argv[i + 1] ?? 'duel' : 'duel').toLowerCase();
  if (!MAP_TABLE[v]) throw new Error(`--map 只能是 ${Object.keys(MAP_TABLE).join('、')}，收到 ${v}`);
  return v;
}

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

function playOne(opts: { gameIndex: number; seed: number; safetyTurns: number; topK: number; oppK: number; rollout: number; takeover: number; veto: number; danger: number; searchStart: number; newGoesFirst: boolean; makeState: () => GameState }): {
  winner: number | null; winnerPolicy: string | null; turns: number; steps: number; ms: number; capped: boolean; stats: string;
} {
  const engine = new GameEngine(opts.makeState());
  const hSeedBase = opts.seed + opts.gameIndex * 100003;
  // 新模型执 P0 还是 P1 交替；heuristic 用独立 rng 流
  const newAI = new BattleSearchAI(hSeedBase + 777, {
    topK: opts.topK,
    oppDepth: opts.oppK,
    friendlyRolloutSteps: opts.rollout,
    takeoverThreshold: opts.takeover,
    vetoMargin: opts.veto,
    dangerLine: opts.danger,
    searchStartTurn: opts.searchStart
  });
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
  const s = newAI.getStats();
  const stats = `dec=${s.decisions} urg=${s.urgentHits} win=${s.forcedWins} take=${s.takeovers} veto=${s.vetos} follow=${s.follows}`;
  return { winner: st.winner, winnerPolicy, turns: st.turn, steps, ms: Date.now() - t0, capped, stats };
}

async function main() {
  const games = parseArg('--games', 20);
  const seed = parseArg('--seed', 1001);
  const safety = parseArg('--safety', 600);
  const topK = parseArg('--topK', 8);
  const oppK = parseArg('--oppK', 6);
  const rollout = parseArg('--rollout', 3);
  const takeover = parseArg('--takeover', 350);
  const veto = parseArg('--veto', 300);
  const danger = parseArg('--danger', -800);
  const searchStart = parseArg('--searchStart', 1);
  const onlyRaw = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] ?? '' : '';
  const only = onlyRaw.split(',').map(x => Number(x.trim())).filter(x => Number.isInteger(x) && x >= 1);
  const indices = only.length > 0 ? only.map(x => x - 1) : Array.from({ length: games }, (_, i) => i);
  const mapKey = parseMapName();
  const mapEntry = MAP_TABLE[mapKey];
  let newWins = 0;
  let heuWins = 0;
  let draws = 0;
  const outFile = parseStringArg('--out', '');
  console.log(`评估配置: games=${indices.length} seed=${seed} safety=${safety} topK=${topK} oppDepth=${oppK} rollout=${rollout} takeover=${takeover} veto=${veto} danger=${danger} searchStart=${searchStart} 地图=${mapEntry.label}无封顶`);
  const records: Array<Record<string, unknown>> = [];
  for (const i of indices) {
    // 交替先后手：偶数局新模型先手(P0)，奇数局后手(P1)
    const newGoesFirst = i % 2 === 0;
    const r = playOne({ gameIndex: i, seed, safetyTurns: safety, topK, oppK, rollout, takeover, veto, danger, searchStart, newGoesFirst, makeState: mapEntry.make });
    if (r.winnerPolicy === 'new') newWins++;
    else if (r.winnerPolicy === 'heuristic') heuWins++;
    else draws++;
    console.log(`局 ${i + 1} 先手=${newGoesFirst ? 'new' : 'heuristic'} 胜者=${r.winnerPolicy ?? 'none'}(P${r.winner}) 回合=${r.turns} 步=${r.steps} 耗时=${r.ms}ms ${r.capped ? '[SAFETY截断]' : '[自然终局]'} [${r.stats}] 累计 new:${newWins} heu:${heuWins} draw:${draws}`);
    records.push({
      game: i + 1,
      gameIndex: i,
      seed: seed + i * 100003,
      newGoesFirst,
      firstPolicy: newGoesFirst ? 'new' : 'heuristic',
      winner: r.winner,
      winnerPolicy: r.winnerPolicy,
      turns: r.turns,
      steps: r.steps,
      ms: r.ms,
      capped: r.capped,
      newStats: r.stats
    });
  }
  console.log(`最终: new胜 ${newWins}/${indices.length}， heuristic胜 ${heuWins}， 平/截断 ${draws}。`);
  if (outFile) {
    const payload = {
      kind: 'battle_ai_eval',
      version: 1,
      generatedAt: new Date().toISOString(),
      gitHead: gitHead(),
      model: 'BattleSearchAI',
      opponent: 'HeuristicAI',
      config: {
        map: mapKey, mapLabel: mapEntry.label, seed, safetyTurns: safety,
        topK, oppDepth: oppK, rollout, takeover, veto, danger, searchStart,
        uncapped: true
      },
      summary: { games: indices.length, newWins, heuWins, draws },
      records
    };
    const resolved = path.resolve(outFile);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`已保存对局数据: ${resolved}`);
  }
  if (only.length === 0 && newWins <= 15) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
