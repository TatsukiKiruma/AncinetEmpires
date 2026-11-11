import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import type { Action, GameState } from '../../../src/game/types';
import { SCHEMA, ENGINE_OPTIONS, canonical, ruleStateHash, strictExpand, stepStrict, controller, stepLabels } from './core';
import { OUT, fileSha, sourceIdentity, mutable } from './io';

export async function* packetRows(file: string) {
  const compressed = createReadStream(file), unzip = createGunzip();
  compressed.on('error', e => unzip.destroy(e));
  const lines = createInterface({ input: compressed.pipe(unzip), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 2 * 1024 ** 2) throw Error('训练候选行超过2MiB，拒绝异常schema');
    if (line) yield JSON.parse(line);
  }
}
export async function verifyRows(rows: AsyncIterable<any>) {
  let header: any = null, engine: GameEngine | null = null, state: GameState | null = null;
  let macro = -1, atomic = 0, sub = 0, policyRows = 0, end: any = null;
  let expected: Action[] = []; const macroHash = createHash('sha256'); macroHash.update('[');
  for await (const row of rows) {
    if (end) throw Error('终止footer后仍有记录');
    if (row.kind === 'game') {
      if (header || row.schema !== SCHEMA || canonical(row.engineOptions) !== canonical(ENGINE_OPTIONS)) throw Error('初态schema或初次收益配置不符');
      header = row; engine = new GameEngine(row.initialState, row.engineOptions); state = engine.getState();
      if (ruleStateHash(state) !== row.effectiveInitialStateHash) throw Error('初次收益或有效初态哈希不一致');
      continue;
    }
    if (!header || !engine || !state) throw Error('动作流缺少初态');
    if (row.kind === 'macro') {
      if (sub !== expected.length || row.macro !== macro + 1 || row.beforeHash !== ruleStateHash(state)) throw Error('macro顺序、归属或前态断链');
      macro++; if (macro) macroHash.update(','); macroHash.update(canonical(row.record));
      expected = strictExpand([row.record], 0, state); sub = 0;
      if (row.atomicCount !== expected.length) throw Error('macro展开数量不同');
      continue;
    }
    if (row.kind === 'atomic') {
      if (row.atomic !== atomic || row.macro !== macro || row.subAction !== sub || !expected[sub] || canonical(row.action) !== canonical(expected[sub])) throw Error('原子动作与macro展开不一致');
      const before = state;
      if (row.beforeHash !== ruleStateHash(before)) throw Error('动作前规则态哈希不一致');
      const exact = stepStrict(engine, before, row.action);
      for (const k of ['actionCode', 'candidateIndex', 'candidateCount', 'candidateHash'] as const) if (row[k] !== exact[k]) throw Error(`有序候选验收失败:${k}`);
      if (canonical(row.controller) !== canonical(controller(before, header.identity, header.playerTypes))) throw Error('控制者或联盟映射不一致');
      if (canonical(row.labels) !== canonical(stepLabels(row.action))) throw Error('标签mask越权或与投降语义不符');
      state = exact.result.state;
      if (row.afterHash !== ruleStateHash(state) || row.currentPlayerBefore !== before.currentPlayer || row.turnBefore !== before.turn || row.currentPlayerAfter !== state.currentPlayer || row.turnAfter !== state.turn) throw Error('动作后规则态或回合边界不一致');
      if (row.labels.policyMask) policyRows++;
      sub++; atomic++; continue;
    }
    if (row.kind === 'end') {
      end = row; macroHash.update(']');
      if (!row.accepted || !row.fullyConsumed || sub !== expected.length || macro + 1 !== header.records || row.completedMacros !== header.records || row.atomicActions !== atomic || row.policyRows !== policyRows || row.finalStateHash !== ruleStateHash(state)) throw Error('整局资格、消费数量或终态不一致');
      if (macroHash.digest('hex') !== header.rawActionIdentity) throw Error('原始macro内容身份不一致');
      if (row.outcome.valueMask !== false || row.outcome.returnMask !== false || row.outcome.nativeOutcomeVerified !== false || row.outcome.projectWinner !== state.winner || row.evidence.terminalIgnored !== 0 || row.evidence.forced !== false) throw Error('结果标签或严格验收证据不符');
      continue;
    }
    throw Error(`未知流记录:${row.kind}`);
  }
  if (!end || !header || !state) throw Error('gzip虽可解压但缺少整局footer');
  return { responseSha256: header.responseSha256, macros: macro + 1, atomicActions: atomic, policyRows, finalStateHash: ruleStateHash(state), nativeValueEligible: false };
}
async function main() {
  const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if ((await sourceIdentity()).hash !== manifest.source.hash) throw Error('当前源码身份与候选包不匹配');
  const summary = JSON.parse(await readFile(path.join(OUT, 'summary.json'), 'utf8'));
  const sampleAt = process.argv.indexOf('--sample'), all = process.argv.includes('--all');
  if (sampleAt < 0 && !all) throw Error('必须明确--sample 数量或--all，禁止默认启动昂贵复验');
  const chosen = all ? summary.acceptedGames : summary.acceptedGames.slice(0, Number(process.argv[sampleAt + 1]));
  const results = [];
  for (const r of chosen) {
    const file = path.join(OUT, r.packet.path);
    if (await fileSha(file) !== r.packet.sha256) throw Error('压缩分片SHA不符');
    results.push(await verifyRows(packetRows(file)));
  }
  await mutable(path.join(OUT, all ? 'reader-verification-all.json' : 'reader-verification-sample.json'), { at: new Date().toISOString(), scope: all ? 'all_accepted' : 'explicit_sample', games: results.length, results });
  console.log(JSON.stringify({ verifiedGames: results.length, atomicActions: results.reduce((n, r) => n + r.atomicActions, 0) }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
