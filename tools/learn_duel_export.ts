/**
 * 蒸馏数据导出：teacher（BattleSearchAI v11 快照参数）vs HeuristicAI，或 heuristic 内战。
 * - 5 张图无封顶（safety 600），teacher 颜色交替，种子可复现。
 * - 记录 teacher 每个决策：state 向量(356) + 候选动作向量(45, 选中放首位+至多11个负例) + 结局标注。
 * - mirror 模式只记 state+结局（价值头批量数据），每隔 thin 步记一条。
 * 用法示例：
 *   node --openssl-legacy-provider --import tsx tools/learn_duel_export.ts --maps liberty,peak --seeds 3001,3002 --colors both --out training_runs/learn_duel/teacher_01.jsonl
 *   node --openssl-legacy-provider --import tsx tools/learn_duel_export.ts --maps liberty,peak,icy,crossing,mourning --seeds 4001,4002,4003,4004 --mirror --thin 3 --out training_runs/learn_duel/mirror_01.jsonl
 */
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { createDefaultAppGameState } from '../src/game/default_state';
import type { Action, GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchAI } from '../src/game/ai/battle_search_ai';
import { LearnedDuelAI } from '../src/game/ai/learned_duel_ai';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { EXTRA_DIM, extraActionFeatures } from './learn_duel_extra_features';
import { encodeAction } from '../src/game/env';
import { getAllianceId } from '../src/game/rule_config';

void EXTRA_DIM;

const MAP_TABLE: Record<string, () => GameState> = {
  duel: () => createDefaultAppGameState(),
  liberty: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'),
  peak: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD'),
  icy: () => createAppApkSkirmishGameState('(2) Icy Paths.aem', 'SD'),
  crossing: () => createAppApkSkirmishGameState('(2) The Crossing.aem', 'SD'),
  mourning: () => createAppApkSkirmishGameState('(2) Mourningstar.aem', 'SD')
};

// v11 teacher 快照参数（与 docs/training/battle_ai/models/battle_search_v11.json 一致）
const TEACHER_OPTIONS = {
  topK: 6,
  oppDepth: 3,
  friendlyRolloutSteps: 1,
  takeoverThreshold: 350,
  vetoMargin: 300,
  dangerLine: -800,
  searchStartTurn: 1
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1] ?? fallback;
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

/** 59 维候选编码：45 维动作语义 + 14 维关系事实。 */
function encodeCand(state: GameState, pid: number, action: Action): number[] {
  return round4([
    ...Array.from(encodeGameActionV2(state, pid, action)),
    ...extraActionFeatures(state, pid, action)
  ]);
}

/**
 * 训练候选构造（与推理 cover 集同分布，上限12）：
 * teacher选中首位 + 全部 capture + 按分 top 攻击(≤4) + 指挥官招募 + 最优招募 +
 * heuristic 顺序填充 + 随机补齐。
 */
function buildTrainCandidates(
  scored: Array<{ action: Action; score: number }>,
  legal: Action[],
  chosen: Action,
  rng: () => number
): Action[] {
  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const picked: Action[] = [chosen];
  const seen = new Set([codeOf(chosen)]);
  const push = (a: Action): void => {
    const c = codeOf(a);
    if (seen.has(c)) return;
    seen.add(c);
    picked.push(a);
  };
  for (const s of ordered) {
    if (picked.length >= 12) break;
    if (s.action.type === 'capture') push(s.action);
  }
  let attacks = 0;
  for (const s of ordered) {
    if (picked.length >= 12 || attacks >= 4) break;
    if (s.action.type === 'attack') {
      push(s.action);
      attacks += 1;
    }
  }
  for (const s of ordered) {
    if (picked.length >= 12) break;
    const a = s.action;
    if ((a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy')
      && (a as { unitClass?: string }).unitClass === 'commander') {
      push(a);
    }
  }
  for (const s of ordered) {
    if (picked.length >= 12) break;
    const a = s.action;
    if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') {
      push(a);
      break;
    }
  }
  for (const s of ordered) {
    if (picked.length >= 12) break;
    push(s.action);
  }
  const rest = legal.filter(a => !seen.has(codeOf(a)));
  for (let k = rest.length - 1; k > 0; k -= 1) {
    const j = Math.floor(rng() * (k + 1));
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  for (const a of rest) {
    if (picked.length >= 12) break;
    push(a);
  }
  return picked;
}

const round4 = (xs: ArrayLike<number>): number[] => Array.from(xs, v => Math.round(Number(v) * 1e4) / 1e4);

interface PendingSample {
  map: string;
  seed: number;
  turn: number;
  playerId: number;
  policy: string;
  state: number[];
  codes: string[];
  cands: number[][];
  choice: number;
}

async function main() {
  const maps = arg('--maps', 'liberty,peak,icy,crossing,mourning').split(',').map(s => s.trim().toLowerCase()).filter(s => MAP_TABLE[s]);
  const seeds = arg('--seeds', '3001,3002').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
  const colors = arg('--colors', 'both').toLowerCase(); // p0 | p1 | both
  const mirror = process.argv.includes('--mirror');
  const dagger = process.argv.includes('--dagger');
  const selfplay = process.argv.includes('--selfplay');
  const thin = Number(arg('--thin', '3'));
  const safety = Number(arg('--safety', '600'));
  const outFile = path.resolve(arg('--out', 'training_runs/learn_duel/export.jsonl'));
  if (maps.length === 0 || seeds.length === 0) throw new Error('maps/seeds 为空');
  await mkdir(path.dirname(outFile), { recursive: true });

  let totalGames = 0;
  let totalSamples = 0;
  let teacherWins = 0;
  let teacherLosses = 0;
  for (const map of maps) {
    for (const seed of seeds) {
      const colorList = colors === 'both' ? [true, false] : [colors === 'p0'];
      for (const teacherFirst of colorList) {
        const hBase = seed * 1000003 + maps.indexOf(map) * 1009 + (teacherFirst ? 11 : 977);
        const teacher = new BattleSearchAI(hBase + 777, TEACHER_OPTIONS);
        // DAgger：学生（当前 learned policy）执 teacher 色，heuristic 执另一色；
        // 学生访问态赛后由 teacher 重标注。
        // 自博弈：学生双方互弈（seat nets 自动按座位选网），记录双方自己动作+结局（on-policy RL 数据）。
        const student = dagger || selfplay ? new LearnedDuelAI(undefined, { mode: 'policy', seed: hBase + 778 }) : null;
        const studentB = selfplay ? new LearnedDuelAI(undefined, { mode: 'policy', seed: hBase + 779 }) : null;
        const heuA = new HeuristicAI(mulberry(hBase + 999));
        const heuB = new HeuristicAI(mulberry(hBase + 1000));
        const scorer = new HeuristicAI(mulberry(hBase + 4242));
        const engine = new GameEngine(MAP_TABLE[map]());
        const pending: PendingSample[] = [];
        const daggerRaw: Array<{ map: string; seed: number; turn: number; playerId: number; snap: GameState; legal: Action[] }> = [];
        let steps = 0;
        let stepNo = 0;
        const maxSteps = safety * 80;
        const policyOf = (pid: number): string => {
          if (mirror) return 'heuristic';
          if (selfplay) return pid === 0 ? 'studentA' : 'studentB';
          const learnerPid = teacherFirst ? 0 : 1;
          if (pid !== learnerPid) return 'heuristic';
          return dagger ? 'student' : 'battle';
        };
        while (engine.getState().winner === null && steps < maxSteps && engine.getState().turn <= safety) {
          const st = engine.getState();
          const pid = st.currentPlayer;
          const pol = policyOf(pid);
          stepNo += 1;
          // 单次决策：选中即执行，避免 teacher 双倍搜索成本与记录/执行 skew。
          const legal = engine.getLegalActions(pid).filter(a => a.type !== 'surrender');
          const action: Action = legal.length === 0
            ? { type: 'end_turn' }
            : pol === 'battle'
              ? teacher.getAction(engine, pid, legal)
              : pol === 'student'
                ? student!.getAction(engine, pid, legal)
                : pol === 'studentA'
                  ? student!.getAction(engine, pid, legal)
                  : pol === 'studentB'
                    ? studentB!.getAction(engine, pid, legal)
                    : (pid === 0 ? heuA : heuB).getAction(engine, pid, legal);
          // 自博弈：记录双方 states+自己动作（on-policy），候选照 cover 式构造
          if (selfplay && legal.length > 0) {
            const scored = scorer.scoreCandidateActions(engine, pid, legal);
            const picked = buildTrainCandidates(scored, legal, action, mulberry(hBase + stepNo * 131));
            pending.push({
              map, seed: hBase, turn: st.turn, playerId: pid, policy: 'selfplay',
              state: round4(encodeGameState(st, pid)),
              codes: picked.map(codeOf),
              cands: picked.map(a => encodeCand(st, pid, a)),
              choice: 0
            });
          }
          // DAgger：只记录学生态快照（内存），赛后统一由 teacher 重标注
          if (dagger && pol === 'student' && legal.length > 0) {
            daggerRaw.push({
              map, seed: hBase, turn: st.turn, playerId: pid,
              snap: JSON.parse(JSON.stringify(st)) as GameState,
              legal: legal.map(a => JSON.parse(JSON.stringify(a)) as Action)
            });
          }
          if (legal.length > 0 && (pol === 'battle' || (mirror && stepNo % thin === 0))) {
            {
              if (pol === 'battle') {
                // 候选：cover 式构造（与推理同分布，上限12）+ 59 维编码
                const scored = scorer.scoreCandidateActions(engine, pid, legal);
                const picked = buildTrainCandidates(scored, legal, action, mulberry(hBase + stepNo * 31));
                pending.push({
                  map, seed: hBase, turn: st.turn, playerId: pid, policy: 'battle',
                  state: round4(encodeGameState(st, pid)),
                  codes: picked.map(codeOf),
                  cands: picked.map(a => encodeCand(st, pid, a)),
                  choice: 0
                });
              } else {
                pending.push({
                  map, seed: hBase, turn: st.turn, playerId: pid, policy: 'heuristic',
                  state: round4(encodeGameState(st, pid)),
                  codes: [], cands: [], choice: -1
                });
              }
            }
          }
          // 执行已选动作（单次决策，无 skew）
          engine.step(action);
          steps += 1;
        }
        const end = engine.getState();
        const w = end.winner;
        let outcome: 1 | -1 | 0 = 0;
        // 结局从对局视角标注（teacher 视角；mirror 则从 P0 视角）
        const refPid = mirror ? 0 : (teacherFirst ? 0 : 1);
        if (w !== null && w !== -1) {
          outcome = getAllianceId(end, refPid) === w ? 1 : -1;
        }
        if (!mirror) {
          if (outcome === 1) teacherWins += 1;
          else if (outcome === -1) teacherLosses += 1;
        }
        // DAgger 重标注：teacher 对每个学生态给出正确动作，构造 BC 样本（policy:'dagger'）
        if (dagger) {
          const pairLines: string[] = [];
          for (const raw of daggerRaw) {
            const e = new GameEngine(raw.snap);
            let label: Action;
            try {
              label = teacher.getAction(e, raw.playerId, raw.legal);
            } catch {
              continue;
            }
            // 成对价值样本：学生实际动作 vs teacher 动作的结果态（同一学生态，teacher 结果应更好）
            try {
              const eS = new GameEngine(raw.snap);
              const studentAct = student!.getAction(eS, raw.playerId, raw.legal);
              const simT = new GameEngine(raw.snap);
              const simS = new GameEngine(raw.snap);
              simT.step(label);
              simS.step(studentAct);
              if (codeOf(studentAct) !== codeOf(label)) {
                pairLines.push(JSON.stringify({
                  kind: 'value_pair', version: 1,
                  map: raw.map, seed: raw.seed, turn: raw.turn, playerId: raw.playerId,
                  stateT: round4(encodeGameState(simT.getState(), raw.playerId)),
                  stateS: round4(encodeGameState(simS.getState(), raw.playerId))
                }) + '\n');
              }
            } catch {
              // 模拟失败则跳过 pair，只保留 BC 样本
            }
            const scored = scorer.scoreCandidateActions(e, raw.playerId, raw.legal);
            const picked = buildTrainCandidates(scored, raw.legal, label, mulberry(hBase + raw.turn * 31));
            pending.push({
              map: raw.map, seed: raw.seed, turn: raw.turn, playerId: raw.playerId, policy: 'dagger',
              state: round4(encodeGameState(raw.snap, raw.playerId)),
              codes: picked.map(codeOf),
              cands: picked.map(a => encodeCand(raw.snap, raw.playerId, a)),
              choice: 0
            });
          }
          if (pairLines.length > 0) {
            const pairFile = outFile.replace(/\.jsonl$/, '.pairs.jsonl');
            await appendFile(pairFile, pairLines.join(''), 'utf8');
          }
        }
        // 每个样本顺手算好行动方视角结局（省去事后 relabel；与 learn_duel_relabel.py 口径一致）
        const lines = pending.map(p => {
          const acting: 1 | -1 | 0 = w === null || w === -1
            ? 0
            : (getAllianceId(end, p.playerId) === w ? 1 : -1);
          return JSON.stringify({ ...p, outcome, refPid, outcomeActing: acting }) + '\n';
        }).join('');
        if (lines) await appendFile(outFile, lines, 'utf8');
        totalGames += 1;
        totalSamples += pending.length;
        console.log(`done map=${map} seed=${seed} learnerFirst=${teacherFirst} dagger=${dagger} winner=P${w} turns=${end.turn} steps=${steps} samples=${pending.length} outcome=${outcome}`);
      }
    }
  }
  console.log(`EXPORT DONE games=${totalGames} samples=${totalSamples} teacher W/L=${teacherWins}/${teacherLosses} -> ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
