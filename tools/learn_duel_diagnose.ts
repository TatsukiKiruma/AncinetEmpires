/** 诊断学习型AI崩溃：复现指定对局，记录 learned 每个决策，并用 teacher 重标注前 N 个学生态。
 * 用法：... learn_duel_diagnose.ts --map mourning --seed 1001 --game 3 --bot policy --teacher-n 25
 */
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { Action, GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';
import { LearnedDuelAI } from '../src/game/ai/learned_duel_ai';
import { getDefaultLearnedDuelNet } from '../src/game/ai/learned_duel_net';
import { encodeAction } from '../src/game/env';

const MAP_TABLE: Record<string, () => GameState> = {
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
const codeOf = (a: Action): string => {
  try { return encodeAction(a); } catch { return a.type; }
};

const mapKey = arg('--map', 'mourning').toLowerCase();
const seed = Number(arg('--seed', '1001'));
const gameIdx = Number(arg('--game', '3')) - 1;
const bot = arg('--bot', 'policy');
const teacherN = Number(arg('--teacher-n', '25'));
const hBase = seed + gameIdx * 100003;
const learned = new LearnedDuelAI(undefined, bot === 'vsearch'
  ? { mode: 'value-search', topK: 6, replyProbeMax: 3 }
  : { mode: 'policy' });
const heu = new HeuristicAI(mulberry(hBase + 999));
const net = getDefaultLearnedDuelNet();
const newFirst = gameIdx % 2 === 0;

const engine = new GameEngine(MAP_TABLE[mapKey]());
interface Rec { turn: number; pid: number; state: GameState; legal: Action[]; chosen: Action; }
const recs: Rec[] = [];
const histLearned = new Map<string, number>();
const histHeu = new Map<string, number>();
let steps = 0;
while (engine.getState().winner === null && steps < 600 * 80 && engine.getState().turn <= 600) {
  const st = engine.getState();
  const isNew = (st.currentPlayer === 0) === newFirst;
  const legal = engine.getLegalActions(st.currentPlayer).filter(a => a.type !== 'surrender');
  const action = legal.length === 0 ? { type: 'end_turn' } as Action
    : isNew ? learned.getAction(engine, st.currentPlayer, legal)
    : heu.getAction(engine, st.currentPlayer, legal);
  const hist = isNew ? histLearned : histHeu;
  hist.set(action.type, (hist.get(action.type) ?? 0) + 1);
  if (isNew && legal.length > 0) recs.push({ turn: st.turn, pid: st.currentPlayer, state: st, legal: legal.slice(), chosen: action });
  engine.step(action);
  steps += 1;
}
const end = engine.getState();
console.log(`END winner=P${end.winner} turns=${end.turn} steps=${steps} learnedDecisions=${recs.length}`);
console.log('learned action hist:', JSON.stringify([...histLearned.entries()]));
console.log('heuristic action hist:', JSON.stringify([...histHeu.entries()]));

// teacher 重标注前 teacherN 个学生态；teacherB 用不同 rng 流，测 teacher 自 agreement（标签噪声上限）
const teacher = new BattleSearchAI(hBase + 777, {
  topK: 6, oppDepth: 3, friendlyRolloutSteps: 1,
  takeoverThreshold: 350, vetoMargin: 300, dangerLine: -800, searchStartTurn: 1
});
const teacherB = new BattleSearchAI(hBase + 31337, {
  topK: 6, oppDepth: 3, friendlyRolloutSteps: 1,
  takeoverThreshold: 350, vetoMargin: 300, dangerLine: -800, searchStartTurn: 1
});
const heuScorer = new HeuristicAI(mulberry(hBase + 4242));
let agree = 0;
let total = 0;
let selfAgree = 0;
for (const r of recs.slice(0, teacherN)) {
  const e = new GameEngine(r.state);
  const tChoice = teacher.getAction(e, r.pid, r.legal);
  const eB = new GameEngine(r.state);
  const tChoiceB = teacherB.getAction(eB, r.pid, r.legal);
  if (codeOf(tChoice) === codeOf(tChoiceB)) selfAgree += 1;
  const lScores = net.policyScores(r.state, r.pid, r.legal);
  const lBest = r.legal[lScores.indexOf(Math.max(...lScores))];
  const hScored = heuScorer.scoreCandidateActions(e, r.pid, r.legal);
  const hBest = [...hScored].sort((a, b) => b.score - a.score)[0].action;
  const a = codeOf(r.chosen) === codeOf(tChoice);
  if (a) agree += 1;
  total += 1;
  const v = net.valueOf(r.state, r.pid).toFixed(3);
  console.log(`T${r.turn} learned=${codeOf(r.chosen).slice(0, 60)} teacher=${codeOf(tChoice).slice(0, 60)} heu=${codeOf(hBest).slice(0, 60)} agree=${a} value=${v}`);
}
console.log(`AGREEMENT learned-vs-teacher: ${agree}/${total} = ${(agree / Math.max(1, total)).toFixed(3)}`);
console.log(`TEACHER SELF-agreement (diff rng): ${selfAgree}/${total} = ${(selfAgree / Math.max(1, total)).toFixed(3)}`);
