import { readFile, mkdir, readdir, rename, unlink, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { GameEngine } from '../../src/game/engine';
import { parseRemoteReplay } from '../../tools/apk_game_get_validate';
import { parseMaybeEncryptedC1270o } from '../../tools/apk_game_get_report';
import type { GameState, Action } from '../../src/game/types';
import { SCHEMA, ENGINE_OPTIONS, digest, ruleStateHash, privateIdentity, strictExpand, stepStrict, controller, stepLabels } from '../data_acceptance_20261016/replay/core';
import { OUT, ROOT, MAX_OUTPUT_BYTES, MIN_FREE_BYTES, PauseError, walk, fileSha, sourceIdentity, immutable, mutable, guard, guardFree, GzipLines } from './replay_io';

type InputRow = { sha256: string; paths: string[]; bytes: number; mtime: string };
type Receipt = Record<string, any>;
const receiptPath = (sha: string) => path.join(OUT, 'receipts', `${sha}.json`);
const options = (mode: 'SD' | 'SO') => ({ inputs: [], rootDir: '', outPath: null, json: false, mode, maxRecords: 100000,
  offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true, allowAmbiguousRecruit: false,
  strictTerrain: true, forceExecuteReplayActions: false, rejectInformationLoss: true });

export async function initialize() {
  for (const d of ['receipts', 'accepted', 'rejected', 'attempts']) await mkdir(path.join(OUT, d), { recursive: true });
  const source = await sourceIdentity();
  const paths = (await Promise.all(['mitm_replay', 'cloud'].map(d => walk(path.join(ROOT, 'captures', d), n => /^game_get_.*\.bin$/i.test(n))))).flat().sort();
  const bySha = new Map<string, InputRow>();
  for (const file of paths) {
    const sha256 = await fileSha(file), s = await stat(file), rel = path.relative(ROOT, file).replaceAll('\\', '/');
    const existing = bySha.get(sha256);
    if (existing) existing.paths.push(rel); else bySha.set(sha256, { sha256, paths: [rel], bytes: s.size, mtime: s.mtime.toISOString() });
  }
  const inputs = [...bySha.values()];
  const converterFiles = ['core.ts', 'io.ts', 'convert.ts', 'verify.ts', 'core.test.ts'];
  const converterHashes = Object.fromEntries(await Promise.all(converterFiles.map(async f => [f, await fileSha(path.join(OUT, f))])));
  const manifest = { schema: SCHEMA, createdAt: new Date().toISOString(), source, sourceInputIdentity: digest(inputs.map(r => ({ sha256: r.sha256, paths: r.paths, bytes: r.bytes }))),
    responsePaths: paths.length, uniqueResponses: inputs.length, converterHashes, converterIdentity: digest(converterHashes),
    limits: { minimumFreeBytes: MIN_FREE_BYTES, maximumOutputBytes: MAX_OUTPUT_BYTES, workers: 1 },
    nativeVersionVerified: false, nativeStateCompared: false, nativeOutcomeVerified: false, valueMask: false, returnMask: false,
    independentEvaluation: '本次不生成评测对局；所有合格真实数据供未来训练候选，另建从未消费的评测协议', inputs };
  const file = path.join(OUT, 'manifest.json');
  try {
    const previous = JSON.parse(await readFile(file, 'utf8'));
    if (previous.source.hash !== source.hash || previous.source.node !== source.node || previous.sourceInputIdentity !== manifest.sourceInputIdentity || previous.converterIdentity !== manifest.converterIdentity) {
      throw new PauseError('源码、运行时、转换器或响应身份变化；拒绝在旧manifest上恢复');
    }
    return previous as typeof manifest;
  } catch (e: any) { if (e.code !== 'ENOENT') throw e; await immutable(file, manifest); return manifest; }
}
async function resumeReceipt(input: InputRow, sourceHash: string): Promise<Receipt | null> {
  try {
    const r = JSON.parse(await readFile(receiptPath(input.sha256), 'utf8'));
    if (r.sourceHash !== sourceHash || r.responseSha256 !== input.sha256 || await fileSha(path.join(OUT, r.packet.path)) !== r.packet.sha256) throw new PauseError('恢复receipt身份或压缩包哈希不符');
    return r;
  } catch (e: any) { if (e.code === 'ENOENT') return null; throw e; }
}
function actorClass(state: GameState, action: Action): string | null {
  const a = action as any; const id = a.unitId ?? a.attackerId ?? a.healerId ?? a.summonerId ?? a.supporterId;
  return state.units.find(u => u.id === id)?.unitClass ?? a.unitClass ?? null;
}
export async function convertOne(input: InputRow, manifest: Awaited<ReturnType<typeof initialize>>): Promise<Receipt> {
  const resumed = await resumeReceipt(input, manifest.source.hash); if (resumed) return resumed;
  const startedAt = new Date().toISOString(), begin = performance.now(), budget = await guard();
  if ((await sourceIdentity()).hash !== manifest.source.hash) throw new PauseError('动作转换前公共源码身份变化');
  const sourcePath = path.join(ROOT, input.paths[0]);
  if (await fileSha(sourcePath) !== input.sha256) throw new PauseError('原始响应SHA变化');
  const existingAttempts = (await readdir(path.join(OUT, 'attempts'))).filter(n => n.startsWith(input.sha256)).length;
  const temporary = path.join(OUT, 'attempts', `${input.sha256}.attempt-${String(existingAttempts + 1).padStart(3, '0')}.jsonl.gz`);
  const writer = new GzipLines(temporary, MAX_OUTPUT_BYTES - budget.outputBytes - 1024 ** 2);
  let macro = 0, subAction = 0, atomic = 0, completedMacros = 0, policyRows = 0;
  let state: GameState | null = null, stateHash: string | null = null, firstTerminal: any = null;
  let parsed: Awaited<ReturnType<typeof parseRemoteReplay>> | null = null;
  let identity: ReturnType<typeof privateIdentity> | null = null;
  let rejection: any = null, emptyMacros = 0;
  const counts = { actions: {} as Record<string, number>, macroEvents: {} as Record<string, number>, actorClasses: {} as Record<string, number>, controllers: {} as Record<string, number> };
  const seatSurrenders: any[] = [];
  try {
    const raw = await readFile(sourcePath); const top = parseMaybeEncryptedC1270o(raw);
    parsed = await parseRemoteReplay(sourcePath, options('SD'));
    if (parsed.config.scenarioCode === 'SO') parsed = await parseRemoteReplay(sourcePath, options('SO'));
    if (parsed.sha256 !== input.sha256 || parsed.topRemainingBytes !== 0 || parsed.replayArray.remainingBytes !== 0) throw Error('原始身份或结构完整消费失败');
    if (parsed.stateSummary.unmappedTerrainIds.length || parsed.stateSummary.approximateTerrainIds.length) throw Error('地形映射未达到严格精确资格');
    identity = privateIdentity(parsed.gameObjectBytes);
    if (identity.players.some(p => p.type !== parsed!.config.playerTypes[p.seat])) throw Error('玩家控制者字段不一致');
    const engine = new GameEngine(parsed.initialState, ENGINE_OPTIONS);
    state = engine.getState(); stateHash = ruleStateHash(state);
    if (ruleStateHash(engine.clone().getState()) !== stateHash) throw Error('初始收益或克隆规则态不一致');
    const { metadata, ...initialRulesState } = parsed.initialState;
    await writer.line({ kind: 'game', schema: SCHEMA, responseSha256: input.sha256, lineage: identity.gameIdHash ?? input.sha256,
      sourceHash: manifest.source.hash, converterIdentity: manifest.converterIdentity, responseSchemaVersion: top.parsed.version,
      sourcePaths: input.paths, identity, scenario: parsed.config.scenarioCode, mode: parsed.config.scenarioCode === 'SO' ? 'SO' : 'SD',
      roomStatus: parsed.config.status, roomType: parsed.config.roomType, records: parsed.actions.length, seed: parsed.config.seed.toString(),
      playerTypes: parsed.config.playerTypes, alliances: parsed.config.allianceByTeam, activePlayers: parsed.stateSummary.activeTeamIds,
      mapIdentity: digest(parsed.config.map), currentStep: parsed.config.currentStep, replaySplitIndex: parsed.config.replaySplitIndex,
      rawActionIdentity: digest(parsed.actions), initialState: initialRulesState, initialMetadata: metadata,
      engineOptions: ENGINE_OPTIONS, effectiveInitialStateHash: stateHash,
      requirements: { wholeGameReceiptAccepted: true, policyTeacherOptimal: false, nativeOutcomeVerified: false },
      hashSemantics: { state: 'sha256(canonical(all GameState fields except metadata)); arrays ordered', candidates: 'sha256(canonical(ordered encodeAction codes)); no sort' } });
    for (macro = 0; macro < parsed.actions.length; macro++) {
      const record = parsed.actions[macro]; counts.macroEvents[record.eventType] = (counts.macroEvents[record.eventType] ?? 0) + 1;
      const actions = strictExpand(parsed.actions, macro, state);
      if (!actions.length && record.eventType !== 'GAME_START') throw Error('拒绝未解释的零原子动作macro');
      if (!actions.length) emptyMacros++;
      await writer.line({ kind: 'macro', macro, record, atomicCount: actions.length, beforeHash: stateHash });
      for (subAction = 0; subAction < actions.length; subAction++) {
        const action = actions[subAction], before = state, beforeHash = stateHash, who = controller(before, identity, parsed.config.playerTypes);
        const cl = actorClass(before, action), strict = stepStrict(engine, before, action);
        state = strict.result.state; stateHash = ruleStateHash(state);
        const labels = stepLabels(action);
        await writer.line({ kind: 'atomic', atomic, macro, subAction, action, actionCode: strict.actionCode,
          candidateIndex: strict.candidateIndex, candidateCount: strict.candidateCount, candidateHash: strict.candidateHash,
          beforeHash, afterHash: stateHash, currentPlayerBefore: before.currentPlayer, turnBefore: before.turn,
          currentPlayerAfter: state.currentPlayer, turnAfter: state.turn, controller: who, actorClass: cl,
          deterministicChoice: strict.candidateCount === 1, labels });
        if (labels.policyMask) policyRows++;
        counts.actions[action.type] = (counts.actions[action.type] ?? 0) + 1;
        counts.controllers[String(who.type)] = (counts.controllers[String(who.type)] ?? 0) + 1;
        if (cl) counts.actorClasses[cl] = (counts.actorClasses[cl] ?? 0) + 1;
        if (action.type === 'surrender') seatSurrenders.push({ atomic, macro, ...who, terminalAfter: state.winner !== null,
          eliminatedSeats: before.players.filter(p => p.isAlive && !state!.players.find(x => x.id === p.id)?.isAlive).map(p => p.id),
          accountExitVerified: false });
        if (!firstTerminal && state.winner !== null) firstTerminal = { atomic, macro, subAction, actionType: action.type, winner: state.winner };
        atomic++;
        if (atomic % 250 === 0) {
          const freeBytes = await guardFree();
          await mutable(path.join(OUT, 'status.json'), { status: 'RUNNING', updatedAt: new Date().toISOString(), pid: process.pid,
            responseSha256: input.sha256, file: input.paths[0], macro, totalMacros: parsed.actions.length, atomic, compressedBytes: writer.bytes, freeBytes });
        }
      }
      completedMacros++;
    }
    if (ruleStateHash(engine.getState()) !== stateHash || ruleStateHash(engine.clone().getState()) !== stateHash) throw Error('最终规则态或克隆不一致');
    if (!['SD', 'SO'].includes(parsed.config.scenarioCode ?? '')) rejection = { code: 'unsupported_scenario', message: 'SR/mod或未知场景隔离，不作为标准规则整局训练候选', macro: null, subAction: null };
  } catch (e) {
    if (e instanceof PauseError) {
      await writer.line({ kind: 'pause', macro, subAction, atomic, completedMacros, reason: e.message, accepted: false });
      await writer.close(); throw e;
    }
    rejection = { code: 'strict_or_schema_failure', message: e instanceof Error ? e.message : String(e), macro, subAction, atomic };
  }
  const accepted = rejection === null && parsed !== null && completedMacros === parsed.actions.length;
  const outcome = { projectWinner: state?.winner ?? null, nativeWinner: null, nativeOutcomeVerified: false, valueMask: false, returnMask: false,
    projectCategory: state?.winner === null || !state ? 'incomplete_prefix' : firstTerminal?.actionType === 'surrender' ? 'seat_surrender_terminal' : 'rule_terminal_non_surrender',
    firstTerminal, seatSurrenders, personalAccountExitVerified: false, surrenderEarlierInGame: seatSurrenders.length > 0 };
  await writer.line({ kind: 'end', accepted, fullyConsumed: accepted, records: parsed?.actions.length ?? null, completedMacros,
    atomicActions: atomic, policyRows: accepted ? policyRows : 0, prefixPolicyRows: policyRows, finalStateHash: stateHash, rejection, outcome,
    evidence: { forced: false, rejectInformationLoss: true, allowAmbiguousFirstMatch: false, terminalIgnored: 0,
      stateHashChain: true, orderedCandidateIndexVerified: true, nativeStateCompared: false } });
  await writer.close();
  const sourceAfter = await sourceIdentity();
  if (sourceAfter.hash !== manifest.source.hash || await fileSha(sourcePath) !== input.sha256) throw new PauseError('转换后源码或响应身份变化，产物留在attempts且不予接纳');
  const relative = `${accepted ? 'accepted' : 'rejected'}/${input.sha256}.jsonl.gz`;
  await rename(temporary, path.join(OUT, relative));
  const packet = { path: relative, sha256: await fileSha(path.join(OUT, relative)), bytes: (await stat(path.join(OUT, relative))).size, lines: writer.lines };
  const receipt: Receipt = { schema: SCHEMA, responseSha256: input.sha256, sourceHash: manifest.source.hash, sourceStable: true,
    converterIdentity: manifest.converterIdentity, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - begin,
    sourcePaths: input.paths, lineage: identity?.gameIdHash ?? input.sha256, scenario: parsed?.config.scenarioCode ?? null,
    accepted, fullyConsumed: parsed !== null && completedMacros === parsed.actions.length, totalMacros: parsed?.actions.length ?? null,
    completedMacros, atomicActions: atomic, emptyMacros, policyRows: accepted ? policyRows : 0, prefixPolicyRows: policyRows,
    finalStateHash: stateHash, finalTurn: state?.turn ?? null, rejection, outcome, counts, packet,
    evidence: { forced: false, skipped: 0, replaced: 0, ambiguous: 0, terminalIgnored: 0, nativeStateCompared: false, nativeOutcomeVerified: false } };
  await immutable(receiptPath(input.sha256), receipt);
  console.log(JSON.stringify({ response: input.sha256, file: input.paths[0], accepted, records: receipt.totalMacros, completedMacros,
    atomic, compressedBytes: packet.bytes, elapsedMs: Math.round(receipt.elapsedMs), reason: rejection?.message ?? null }));
  return receipt;
}
export async function summarize(manifest: Awaited<ReturnType<typeof initialize>>, status: string) {
  const all: Receipt[] = [];
  for (const input of manifest.inputs) { const r = await resumeReceipt(input, manifest.source.hash); if (r) all.push(r); }
  const accepted = all.filter(r => r.accepted), sum = (rs: Receipt[], k: string) => rs.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const source = await sourceIdentity();
  const summary = { schema: SCHEMA, updatedAt: new Date().toISOString(), status, sourceHash: manifest.source.hash,
    sourceStableAtSummary: source.hash === manifest.source.hash, inputUnique: manifest.inputs.length, completed: all.length,
    accepted: accepted.length, rejected: all.length - accepted.length, pending: manifest.inputs.filter((i: InputRow) => !all.some(r => r.responseSha256 === i.sha256)).map((i: InputRow) => ({ responseSha256: i.sha256, file: i.paths[0] })),
    acceptedMacroRecords: sum(accepted, 'totalMacros'), acceptedAtomicActions: sum(accepted, 'atomicActions'), acceptedPolicyRows: sum(accepted, 'policyRows'),
    valueEligibleRows: 0, nativeOutcomeVerifiedGames: 0, bytes: sum(all.map(r => r.packet), 'bytes'), totalElapsedMs: sum(all, 'elapsedMs'),
    acceptedGames: accepted.map(r => ({ responseSha256: r.responseSha256, lineage: r.lineage, scenario: r.scenario, packet: r.packet, policyRows: r.policyRows })),
    rejectedGames: all.filter(r => !r.accepted).map(r => ({ responseSha256: r.responseSha256, scenario: r.scenario, rejection: r.rejection, completedMacros: r.completedMacros, atomicActions: r.atomicActions, packet: r.packet })),
    labels: { valueMask: false, returnMask: false, projectOutcomeDiagnosticOnly: true, policyRequiresAcceptedWholeGame: true, surrenderPolicyMask: false },
    independentEvaluation: { generated: false, reservationOnly: true }, limits: manifest.limits };
  await mutable(path.join(OUT, 'summary.json'), summary);
  return summary;
}

