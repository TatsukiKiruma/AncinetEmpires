/** headcheck：学生在自己态上，policy 给 teacher 动作排第几？value 能否区分 teacher/学生动作结果？
 * 用法：... learn_duel_headcheck.ts --map mourning --seed 1001 --game 3 --states 25
 */
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { Action, GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';
import { LearnedDuelAI, buildLearnedCoverSet } from '../src/game/ai/learned_duel_ai';
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
const nStates = Number(arg('--states', '25'));
const hBase = seed + gameIdx * 100003;
const learned = new LearnedDuelAI(undefined, { mode: 'policy' });
const heu = new HeuristicAI(mulberry(hBase + 999));
const net = getDefaultLearnedDuelNet();
const teacher = new BattleSearchAI(hBase + 777, {
  topK: 6, oppDepth: 3, friendlyRolloutSteps: 1,
  takeoverThreshold: 350, vetoMargin: 300, dangerLine: -800, searchStartTurn: 1
});
const newFirst = gameIdx % 2 === 0;

const engine = new GameEngine(MAP_TABLE[mapKey]());
interface Rec { pid: number; state: GameState; legal: Action[]; chosen: Action; }
const recs: Rec[] = [];
let steps = 0;
while (engine.getState().winner === null && steps < 600 * 80 && engine.getState().turn <= 600) {
  const st = engine.getState();
  const isNew = (st.currentPlayer === 0) === newFirst;
  const legal = engine.getLegalActions(st.currentPlayer).filter(a => a.type !== 'surrender');
  const action = legal.length === 0 ? { type: 'end_turn' } as Action
    : isNew ? learned.getAction(engine, st.currentPlayer, legal)
    : heu.getAction(engine, st.currentPlayer, legal);
  if (isNew && legal.length > 0) recs.push({ pid: st.currentPlayer, state: st, legal: legal.slice(), chosen: action });
  engine.step(action);
  steps += 1;
}
console.log(`game turns=${engine.getState().turn} winner=P${engine.getState().winner} studentStates=${recs.length}`);

const heuCover = new HeuristicAI(mulberry(hBase + 7777));
let rankSum = 0;
let rankN = 0;
let top1 = 0;
let top8 = 0;
let coverHit8 = 0;
let coverHit16 = 0;
let valGood = 0;
let valN = 0;
for (const r of recs.slice(0, nStates)) {
  const e = new GameEngine(r.state);
  const tChoice = teacher.getAction(e, r.pid, r.legal);
  const scores = net.policyScores(r.state, r.pid, r.legal);
  const order = r.legal.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const tCode = codeOf(tChoice);
  const rank = order.findIndex(i => codeOf(r.legal[i]) === tCode) + 1;
  rankSum += rank;
  rankN += 1;
  if (rank === 1) top1 += 1;
  if (rank <= 8) top8 += 1;
  // cover 召回：teacher 动作是否在 cover8/cover16 里
  const e2 = new GameEngine(r.state);
  const hScored = heuCover.scoreCandidateActions(e2, r.pid, r.legal);
  const cov8 = buildLearnedCoverSet(r.legal, hScored, 8).map(codeOf);
  const cov16 = buildLearnedCoverSet(r.legal, hScored, 16).map(codeOf);
  if (cov8.includes(tCode)) coverHit8 += 1;
  if (cov16.includes(tCode)) coverHit16 += 1;
  // value：比较 teacher 动作后 vs 学生动作后的行动方胜率
  const simT = new GameEngine(r.state);
  const simS = new GameEngine(r.state);
  try { simT.step(tChoice); } catch { /* skip */ }
  try { simS.step(r.chosen); } catch { /* skip */ }
  const vT = net.valueOf(simT.getState(), r.pid);
  const vS = net.valueOf(simS.getState(), r.pid);
  if (vT > vS) valGood += 1;
  valN += 1;
  if (rankN <= 8) {
    console.log(`T? learned=${codeOf(r.chosen).slice(0, 45)} teacher=${tCode.slice(0, 45)} policyRank=${rank}/${r.legal.length} vT=${vT.toFixed(3)} vS=${vS.toFixed(3)}`);
  }
}
console.log(`POLICY rank of teacher choice: avg=${(rankSum / Math.max(1, rankN)).toFixed(2)} top1=${top1}/${rankN} top8recall=${top8}/${rankN}`);
console.log(`COVER recall of teacher choice: cover8=${coverHit8}/${rankN} cover16=${coverHit16}/${rankN}`);
console.log(`VALUE prefers teacher-result over student-result: ${valGood}/${valN}`);
