import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { getLegalActions } from '../../../src/game/rules';
import { createRecordExpansionOptions, expandApkReplayRecordToProjectActions } from '../../../src/game/apk_replay';
import type { GameState } from '../../../src/game/types';
import { readNativeConfig, readNativeSnapshot, readNativeStateFrames } from '../../../ai_training/data_acceptance_20261016/native_reader/reader';
import { comparableState, differences, json, nativeRecord, projectSnapshot } from '../../../ai_training/data_acceptance_20261016/phone/projection';
import { semanticActionCodes } from '../../../ai_training/data_acceptance_20261016/phone/semantic_actions';

export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export interface Job { parentId: string; attemptId: string; map: string; seed: number; maxActions: number }
export interface NativeAction { parentId: string; attemptId: string; index: number; ai_seed: number; path: string; fields: Record<string, number | string> }

export function canonicalProjection(state: GameState) {
  const result = comparableState(state);
  // 联盟编号只是标签；按其成员的最小队伍号规范化，保留联盟分组与赢家含义。
  const aliases = new Map<number, number>();
  for (const player of result.players) aliases.set(player.alliance, Math.min(aliases.get(player.alliance) ?? player.id, player.id));
  for (const player of result.players) player.alliance = aliases.get(player.alliance)!;
  if (result.winner !== null && result.winner >= 0) result.winner = aliases.get(result.winner) ?? result.winner;
  return result;
}

export function validateActions(actions: NativeAction[], job: Job, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || actions.length !== expected) throw Error('动作数量不一致或为空');
  for (const [i, row] of actions.entries()) {
    if (row.parentId !== job.parentId || row.attemptId !== job.attemptId || row.index !== i || row.ai_seed !== job.seed + i * 104729 || row.path !== 'hard_js_primary') throw Error(`动作身份/序号/种子/路径不一致：${i}`);
    if (!row.fields || Object.keys(row.fields).sort().join(',') !== 'a,b,c,d,e,f,g,h,i,j') throw Error(`原生动作字段不完整：${i}`);
    for (const key of 'abcdefghi') if (!Number.isInteger(row.fields[key])) throw Error(`原生整数字段无效：${i}/${key}`);
  }
}

export function compareProjectedStates(actual: GameState, expected: GameState, label: string): void {
  const diff = differences(canonicalProjection(actual), canonicalProjection(expected));
  if (diff.length) throw Error(label + '：' + json(diff));
  const left = semanticActionCodes(actual, getLegalActions(actual, actual.currentPlayer));
  const right = semanticActionCodes(expected, getLegalActions(expected, expected.currentPlayer));
  if (json(left) !== json(right)) throw Error(label + '：完整投影合法动作集合不一致');
}

export function verifyProject(directory: string, planPath: string) {
  const native = path.join(directory, 'native');
  const request = JSON.parse(readFileSync(path.join(directory, 'request.json'), 'utf8'));
  const job = request.job as Job;
  const result = JSON.parse(readFileSync(path.join(native, 'result.json'), 'utf8'));
  if (result.parentId !== job.parentId || result.attemptId !== job.attemptId || result.map !== job.map || result.seed !== job.seed) throw Error('结果与请求身份不一致');
  const configBytes = readFileSync(path.join(native, 'config.bin'));
  const config = readNativeConfig(configBytes);
  if (!config || config.e !== BigInt(job.seed) || config.f !== 'SD') throw Error('原生配置seed或模式不一致');
  const initialBytes = readFileSync(path.join(native, 'initial.bin'));
  const initial = readNativeSnapshot(initialBytes), final = readNativeSnapshot(readFileSync(path.join(native, 'final.bin')));
  const initialState = projectSnapshot(initial, configBytes, job.map);
  const planBytes = readFileSync(planPath), plan = JSON.parse(planBytes.toString('utf8'));
  const planned = (plan.starts as { map: string; state: GameState }[]).find(s => s.map === job.map);
  if (!planned) throw Error('冻结计划中没有此官方地图');
  // 冻结计划已保存结算过开局收益的完整默认态；禁止重复进行回合开始结算。
  compareProjectedStates(initialState, planned.state, '原生初态与冻结计划不同');
  const raw = gunzipSync(readFileSync(path.join(native, 'actions.jsonl.gz'))).toString('utf8');
  const actions = raw.trim() ? raw.trim().split('\n').map(line => JSON.parse(line) as NativeAction) : [];
  validateActions(actions, job, result.actions);
  const frames = gunzipSync(readFileSync(path.join(native, 'states.bin.gz')));
  const offsets: { offset: number; bytes: number }[] = [];
  for (const frame of readNativeStateFrames(frames)) offsets.push({ offset: frame.offset + 4, bytes: frame.byteLength });
  if (offsets.length !== actions.length) throw Error('前态帧数与动作数不一致');
  const frame = (i: number) => readNativeSnapshot(frames.subarray(offsets[i].offset, offsets[i].offset + offsets[i].bytes));
  if (sha(frames.subarray(offsets[0].offset, offsets[0].offset + offsets[0].bytes)) !== sha(initialBytes)) throw Error('initial与第一帧完整原始快照不同');
  const engine = new GameEngine(initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
  compareProjectedStates(engine.getState(), initialState, '引擎构造改变初态');
  const records = actions.map(a => nativeRecord(a.fields));
  let atomicActions = 0;
  for (let i = 0; i < records.length; i++) {
    compareProjectedStates(engine.getState(), projectSnapshot(frame(i), configBytes, job.map), `第${i}步前态`);
    const expanded = expandApkReplayRecordToProjectActions(records[i], engine.getState(), createRecordExpansionOptions(records, i, {
      allowAmbiguousRecruitDeployFirstMatch: false,
      onNotice: notice => { throw Error('严格验收拒绝跳过/替换/歧义：' + json(notice)); },
    }));
    if (!expanded.length) throw Error(`第${i}步没有可执行的原子动作`);
    for (const action of expanded) {
      const state = engine.getState(), code = encodeAction(action);
      if (engine.isTerminal() || !getLegalActions(state, state.currentPlayer).some(a => encodeAction(a) === code)) throw Error(`第${i}步动作不在权威合法集合中：${code}`);
      const stepped = engine.step(action);
      if (stepped.info.includes('非法动作') || stepped.info === 'Game already ended') throw Error(`第${i}步执行被拒绝：${stepped.info}`);
      atomicActions++;
    }
    compareProjectedStates(engine.getState(), projectSnapshot(i + 1 < records.length ? frame(i + 1) : final, configBytes, job.map), `第${i}步后态`);
  }
  const expectedFinal = projectSnapshot(final, configBytes, job.map);
  compareProjectedStates(engine.getState(), expectedFinal, '最终态');
  const p = final.components.e;
  if (!p || !p.i || !p.k || result.winnerMask !== p.h || result.naturalEnd !== (p.h >= 0)) throw Error('自然结果与完整原生终态不一致');
  const activeTeams = p.i.flatMap((type, i) => type !== 0 && type !== 5 ? [i] : []);
  const survivorAlliances = [...new Set(activeTeams.map(team => p.k![team]))];
  const reliableNaturalOutcome = p.h >= 0 && survivorAlliances.length === 1 && survivorAlliances[0] === p.h && !result.truncationReason;
  if (result.naturalEnd && !reliableNaturalOutcome) throw Error('原生自然赢家与唯一存活联盟不一致');
  return { projectStrictVerified: true, initialPlanMatched: true, validationBypassed: false, forced: false,
    parentId: job.parentId, attemptId: job.attemptId, checkedMacros: records.length, atomicActions,
    planSha256: sha(planBytes), initialProjectionSha256: sha(json(canonicalProjection(initialState))),
    finalProjectionSha256: sha(json(canonicalProjection(expectedFinal))), reliableNaturalOutcome,
    winnerAlliance: p.h >= 0 ? p.h : null, survivorTeams: activeTeams,
    coverage: { allMacroBeforeAfterStates: true, finalState: true, projectedLegalSets: true, nativeCandidateOracle: false,
      projectProjectionOnly: true, nativeFullSnapshotReplayRequiredSeparately: true } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, plan, output] = process.argv.slice(2);
  try { const report = verifyProject(path.resolve(directory), path.resolve(plan)); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) { writeFileSync(output, JSON.stringify({ projectStrictVerified: false, initialPlanMatched: false, error: String(error) }, null, 2) + '\n', { flag: 'wx' }); process.exitCode = 2; }
}
