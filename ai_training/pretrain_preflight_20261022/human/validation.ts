import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { validateApkReplay } from '../../../src/game/apk_replay';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { decryptApkResourceBytes } from '../../../tools/apk_resource_crypto';
import { parseApkUnitRecordsFromDecryptedDataBin } from '../../../tools/apk_unit_report';
import { parseApkTerrainSection } from '../../../tools/apk_terrain_parser';
import { ENGINE_OPTIONS, controller, digest, privateIdentity, ruleStateHash, stepLabels, stepStrict, strictExpand } from '../../data_acceptance_20261016/replay/core';
import { stateHash } from '../../dual_stream_v2_phase1_20261020/io';
import { ROOT, readJson, relative, sha } from './io';
import type { Fingerprint } from './lineage';

export const parserOptions = (mode: 'SD' | 'SO') => ({ inputs: [], rootDir: '', outPath: null, json: false, mode, maxRecords: 100000,
  offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: false, allowAmbiguousRecruit: false,
  strictTerrain: true, forceExecuteReplayActions: false, rejectInformationLoss: true });

export async function parse(file: string) {
  let parsed = await parseRemoteReplay(file, parserOptions('SD'));
  if (parsed.config.scenarioCode === 'SO') parsed = await parseRemoteReplay(file, parserOptions('SO'));
  return parsed;
}

export function fingerprint(parsed: Awaited<ReturnType<typeof parse>>): Fingerprint {
  const initialStateHash = ruleStateHash(parsed.initialState), rawActionIdentity = digest(parsed.actions);
  return { initialStateHash, rawActionIdentity, macroHashes: parsed.actions.map(record => digest(record)),
    fullContentIdentity: digest({ initialStateHash, rawActionIdentity }) };
}

export async function loadBaseline() {
  const dataPath = path.join(ROOT, 'APK/_analysis/unpack/assets/data.bin');
  const configPath = path.join(ROOT, 'docs/apk-analysis/real-replay-audit-20261013/config-differences.json');
  const raw = await readFile(dataPath), decrypted = decryptApkResourceBytes(raw.subarray(17));
  const units = parseApkUnitRecordsFromDecryptedDataBin(decrypted).records;
  const terrains = parseApkTerrainSection(decrypted).configs;
  const configBytes = await readFile(configPath), config = await readJson(configPath);
  const rules = config.find((row: any) => row.scenario === 'SD')?.rules;
  if (units.length !== 21 || terrains.length !== 84 || !rules) throw Error('本地APK原始资源或历史规则参考数量不符');
  return { units, terrains, rules, evidence: { checked: true, dataBin: relative(dataPath), dataBinSha256: sha(raw), unitCount: units.length,
    terrainCount: terrains.length, ruleReference: relative(configPath), ruleReferenceSha256: sha(configBytes) } };
}

export function compareBaseline(parsed: Awaited<ReturnType<typeof parse>>, baseline: Awaited<ReturnType<typeof loadBaseline>>) {
  const differences: any[] = [], missing: any[] = [];
  const unitFields = ['cost', 'population', 'attackElement', 'defenseShift', 'baseAttack', 'attackGrowth', 'baseDefense', 'defenseGrowth',
    'baseMaxHp', 'maxHpGrowth', 'baseMove', 'moveGrowth', 'maxRange', 'minRange', 'abilityIds', 'recruitableFlag', 'flagR'];
  const terrainFields: Record<string, string> = { isLand: 'isLand', kind: 'kind', variant: 'linkedA', defenseBonus: 'defenseBonus',
    healPerTurn: 'healPerTurn', moveCost: 'moveCost', capturableFlag: 'capturable', destroyedTileId: 'linkedB', repairTileId: 'linkedC', linkedTileIds: 'variants', sortOrder: 'graphicsType' };
  const same = (a: unknown, b: unknown) => digest(a) === digest(b);
  for (const unit of parsed.config.unitDefinitions) {
    const original: any = baseline.units.find(row => row.id === unit.apkUnitId);
    if (!original) { differences.push({ kind: 'unit', id: unit.apkUnitId, field: 'definition' }); continue; }
    for (const field of unitFields) {
      const expected = ['recruitableFlag', 'flagR'].includes(field) ? Boolean(original[field]) : original[field];
      if (!same((unit as any)[field], expected)) differences.push({ kind: 'unit', id: unit.apkUnitId, field, expected, actual: (unit as any)[field] });
    }
  }
  for (const row of baseline.units) if (!parsed.config.unitDefinitions.some(unit => unit.apkUnitId === row.id)) missing.push({ kind: 'unit', id: row.id });
  for (const terrain of parsed.config.terrainDefinitions) {
    const original: any = baseline.terrains.find(row => row.id === terrain.apkTerrainId);
    if (!original) { differences.push({ kind: 'terrain', id: terrain.apkTerrainId, field: 'definition' }); continue; }
    for (const [field, key] of Object.entries(terrainFields)) {
      const expected = field === 'linkedTileIds' ? (original[key] ?? []) : original[key];
      if (!same((terrain as any)[field], expected)) differences.push({ kind: 'terrain', id: terrain.apkTerrainId, field, expected, actual: (terrain as any)[field] });
    }
  }
  for (const row of baseline.terrains) if (!parsed.config.terrainDefinitions.some(terrain => terrain.apkTerrainId === row.id)) missing.push({ kind: 'terrain', id: row.id });
  // 等级上限是已支持的房间参数；其余可见规则变化沿用历史隔离口径。
  for (const [field, actual] of Object.entries(parsed.config.rules)) if (field !== 'f1279h' && !same(actual, baseline.rules[field])) differences.push({ kind: 'rule', field, expected: baseline.rules[field], actual });
  return { passed: differences.length === 0 && missing.length === 0, differences, missing };
}

export function strictReplay(parsed: Awaited<ReturnType<typeof parse>>, excluded: ReadonlySet<string>) {
  const identity = privateIdentity(parsed.gameObjectBytes), engine = new GameEngine(parsed.initialState, ENGINE_OPTIONS);
  let state = engine.getState(), atomic = 0, macros = 0, policy = 0, humanPolicy = 0, eligible = 0, humanEligible = 0, trivial = 0, excludedRows = 0;
  let firstTerminal: any = null, failure: any = null, currentMacro = 0, currentSubAction = 0, prefixPolicy = 0, prefixHumanPolicy = 0;
  const atoms: any[] = [];
  const surrenders: any[] = [];
  try {
    if (identity.players.some(player => player.type !== parsed.config.playerTypes[player.seat])) throw Error('玩家控制者字段不一致');
    if (ruleStateHash(state) !== ruleStateHash(engine.clone().getState())) throw Error('初次收益或克隆状态不一致');
    if (parsed.topRemainingBytes || parsed.replayArray.remainingBytes) throw Error('响应结构未完整消费');
    if (parsed.stateSummary.unmappedTerrainIds.length || parsed.stateSummary.approximateTerrainIds.length) throw Error('地形映射未达到精确资格');
    for (let macro = 0; macro < parsed.actions.length; macro++) {
      currentMacro = macro; currentSubAction = 0;
      const actions = strictExpand(parsed.actions, macro, state);
      if (!actions.length && parsed.actions[macro].eventType !== 'GAME_START') throw Error('无法解释的零原子macro');
      for (let subAction = 0; subAction < actions.length; subAction++) {
        currentSubAction = subAction;
        const action = actions[subAction], before = state, who = controller(before, identity, parsed.config.playerTypes);
        const legal = engine.getLegalActions(before.currentPlayer), strict = stepStrict(engine, before, action);
        state = strict.result.state;
        const isTrivial = !legal.some(candidate => candidate.type !== 'surrender' && candidate.type !== 'end_turn');
        const isExcluded = excluded.has(stateHash(before)) || excluded.has(ruleStateHash(before));
        const prefixPolicyEligible = !['surrender', 'end_turn'].includes(action.type) && !isTrivial && !isExcluded;
        if (prefixPolicyEligible) { prefixPolicy++; if (who.type === 1) prefixHumanPolicy++; }
        atoms.push({ kind: 'atomic', atomic, macro, subAction, action, actionCode: strict.actionCode, candidateIndex: strict.candidateIndex,
          candidateCount: strict.candidateCount, candidateHash: strict.candidateHash, beforeHash: ruleStateHash(before), afterHash: ruleStateHash(state),
          sourceStateHash: stateHash(before), macroAtomicCount: actions.length, macroRecordHash: digest(parsed.actions[macro]),
          controller: who, prefixPolicyEligible, valueMask: false, returnMask: false, nativeOutcomeVerified: false });
        if (stepLabels(action).policyMask) {
          policy++; if (who.type === 1) humanPolicy++;
          if (isTrivial) trivial++;
          else if (isExcluded) excludedRows++;
          else { eligible++; if (who.type === 1) humanEligible++; }
        }
        if (action.type === 'surrender') surrenders.push({ atomic, macro, seat: who.seat, terminalAfter: state.winner !== null });
        if (!firstTerminal && state.winner !== null) firstTerminal = { atomic, macro, subAction, actionType: action.type, winner: state.winner };
        atomic++;
      }
      macros++;
    }
    if (ruleStateHash(state) !== ruleStateHash(engine.clone().getState())) throw Error('最终克隆状态不一致');
  } catch (error) { failure = { message: error instanceof Error ? error.message : String(error), completedMacros: macros, atomic,
    macro: currentMacro, subAction: currentSubAction, eventType: parsed.actions[currentMacro]?.eventType ?? null, beforeStateHash: ruleStateHash(state) }; }
  const success = failure === null && macros === parsed.actions.length;
  return { success, fullyConsumed: success, forced: false, completedMacros: macros, totalMacros: parsed.actions.length,
    atomicActions: atomic, prefixPolicyActions: policy, prefixEligiblePolicyActions: prefixPolicy, prefixEligibleHumanPolicyActions: prefixHumanPolicy,
    policyActions: success ? policy : 0, humanPolicyActions: success ? humanPolicy : 0,
    eligiblePolicyActions: success ? eligible : 0, eligibleHumanPolicyActions: success ? humanEligible : 0,
    trivialPolicyActions: trivial, excludedPreviouslyConsumedStates: excludedRows, failure,
    finalStateHash: ruleStateHash(state), finalTurn: state.turn,
    outcome: { projectWinner: state.winner, firstTerminal, surrenders,
      projectCategory: state.winner === null ? 'incomplete_prefix' : firstTerminal?.actionType === 'surrender' ? 'seat_surrender_terminal' : 'rule_terminal_non_surrender',
      nativeOutcomeVerified: false, reliableNaturalTerminal: false, valueMask: false, returnMask: false,
      reason: '没有APK逐状态及原生终局证据；CLOSED与项目winner均不足以开放Value标签' },
    evidence: { terminalIgnored: 0, informationLossAllowed: false, ambiguousFirstMatchAllowed: false, nativeStateCompared: false }, atoms };
}

export function forcedReplay(parsed: Awaited<ReturnType<typeof parse>>) {
  try {
    const result = validateApkReplay(parsed.initialState, parsed.actions, { forceExecuteReplayActions: true, rejectInformationLoss: false,
      expansionOptions: { allowAmbiguousRecruitDeployFirstMatch: false } });
    return { executed: true, forced: true, success: result.success, finalWinner: result.finalState.winner,
      expandedActionCount: result.expandedActionCount, firstError: result.firstError, executedRecordCount: result.executedRecordCount,
      firstFailure: result.steps.find(step => step.error) ?? null, evidence: result.evidence,
      terminalIgnored: result.steps.filter(step => step.info === 'Game already ended').length, trainingAdmissionEvidence: false };
  } catch (error) { return { executed: true, forced: true, success: false, error: error instanceof Error ? error.message : String(error), trainingAdmissionEvidence: false }; }
}
