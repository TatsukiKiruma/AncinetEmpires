import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { packetRows } from './verify';
import { digest, canonical, SCHEMA } from './core';
import { OUT, ROOT, fileSha, sourceIdentity, mutable, guardFree, outputBytes } from './io';

// 全量压缩/结构审计不再次枚举全部合法动作；合法动作和候选顺序已由生产转换逐步检查。
const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
const summary = JSON.parse(await readFile(path.join(OUT, 'summary.json'), 'utf8'));
if (summary.status !== 'COMPLETE' || summary.completed !== manifest.uniqueResponses || summary.pending.length) throw Error('转换未完整结束，不能发布全量完整性验收');
if ((await sourceIdentity()).hash !== manifest.source.hash) throw Error('完整性审计前源码身份不符');
for (const [file, hash] of Object.entries(manifest.converterHashes)) if (await fileSha(path.join(OUT, file)) !== hash) throw Error('转换器文件与冻结身份不同');
const results = [];
let sourcePathsVerified = 0;
for (const input of manifest.inputs) {
  await guardFree();
  for (const f of input.paths) { if (await fileSha(path.join(ROOT, f)) !== input.sha256) throw Error('封存前原始响应身份变化'); sourcePathsVerified++; }
  const receipt = JSON.parse(await readFile(path.join(OUT, 'receipts', `${input.sha256}.json`), 'utf8'));
  const file = path.join(OUT, receipt.packet.path);
  if (await fileSha(file) !== receipt.packet.sha256) throw Error('分片压缩SHA与receipt不符');
  let header: any = null, footer: any = null, macro = -1, atomic = 0, expectedSub = 0, seenSub = 0, policyRows = 0, chain: string | null = null, lines = 0;
  const rawHash = createHash('sha256'); rawHash.update('[');
  for await (const row of packetRows(file)) {
    lines++;
    if (footer) throw Error('footer之后存在记录');
    if (row.kind === 'game') {
      if (header || row.schema !== SCHEMA || row.responseSha256 !== input.sha256 || row.sourceHash !== manifest.source.hash || row.converterIdentity !== manifest.converterIdentity) throw Error('分片头身份错误');
      header = row; chain = row.effectiveInitialStateHash; continue;
    }
    if (row.kind === 'macro') {
      if (!header || row.macro !== macro + 1 || seenSub !== expectedSub || row.beforeHash !== chain) throw Error('macro归属或状态hash链错误');
      macro++; expectedSub = row.atomicCount; seenSub = 0;
      if (macro) rawHash.update(','); rawHash.update(canonical(row.record)); continue;
    }
    if (row.kind === 'atomic') {
      if (!header || row.atomic !== atomic || row.macro !== macro || row.subAction !== seenSub || row.beforeHash !== chain || !/^[a-f0-9]{64}$/.test(row.afterHash)) throw Error('原子序号、状态hash链或macro归属错误');
      if (!Number.isInteger(row.candidateIndex) || !Number.isInteger(row.candidateCount) || row.candidateIndex < 0 || row.candidateIndex >= row.candidateCount || !/^[a-f0-9]{64}$/.test(row.candidateHash)) throw Error('候选索引、数量或hash格式错误');
      if (row.labels.valueMask !== false || row.labels.returnMask !== false || row.labels.nativeOutcomeVerified !== false || row.labels.policyMask !== (row.action.type !== 'surrender')) throw Error('原生结果未知或投降mask被错误开放');
      if (row.controller.seat !== row.currentPlayerBefore) throw Error('控制者席位与规则当前玩家不符');
      if (row.labels.policyMask) policyRows++;
      atomic++; seenSub++; chain = row.afterHash; continue;
    }
    if (row.kind === 'end') { footer = row; continue; }
    throw Error(`未完成或未知分片类型:${row.kind}`);
  }
  rawHash.update(']');
  if (!footer || footer.accepted !== receipt.accepted || footer.atomicActions !== atomic || receipt.atomicActions !== atomic || lines !== receipt.packet.lines) throw Error('footer、receipt或行数不一致');
  if (header && (footer.finalStateHash !== chain || receipt.finalStateHash !== chain)) throw Error('最终规则态hash不一致');
  if (footer.outcome.nativeOutcomeVerified !== false || footer.outcome.valueMask !== false || footer.outcome.returnMask !== false || footer.evidence.forced !== false || footer.evidence.terminalIgnored !== 0) throw Error('终局标签或严格证据错误');
  if (receipt.accepted) {
    if (!header || !footer.fullyConsumed || macro + 1 !== header.records || seenSub !== expectedSub || policyRows !== receipt.policyRows || footer.policyRows !== policyRows || rawHash.digest('hex') !== header.rawActionIdentity) throw Error('合格整局消费数或原始macro身份不一致');
    const parsed = await parseRemoteReplay(path.join(ROOT, input.paths[0]), { inputs: [], rootDir: '', outPath: null, json: false,
      mode: header.mode, maxRecords: 100000, offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true,
      allowAmbiguousRecruit: false, strictTerrain: true, forceExecuteReplayActions: false });
    if (digest(parsed.actions) !== header.rawActionIdentity) throw Error('分片macro与原始响应重新解码不一致');
  } else if (receipt.policyRows !== 0 || footer.policyRows !== 0 || !receipt.rejection) throw Error('拒绝前缀被默许进入整局训练');
  results.push({ responseSha256: input.sha256, accepted: receipt.accepted, lines, atomicActions: atomic, policyRows: receipt.policyRows,
    opaqueEmbeddedObjectIdHash: header?.identity?.gameIdHash ?? null, headerLineageValue: header?.lineage ?? null,
    headerLineageSemantics: 'opaque_embedded_identifier_not_proven_api_game_id', responseSchemaVersion: header?.responseSchemaVersion ?? null,
    mode: header?.mode ?? null, scenario: header?.scenario ?? receipt.scenario ?? null,
    configuredActiveTeamIds: header?.activePlayers ?? null,
    configuredPlayerCount: Array.isArray(header?.activePlayers) ? header.activePlayers.length : null,
    configuredPlayerTypes: header?.playerTypes ?? null, alliances: header?.alliances ?? null,
    rawActionIdentity: header?.rawActionIdentity ?? null, originalMacroRecords: header?.records ?? receipt.totalMacros,
    initialSeedIdentity: header ? digest({ initialState: header.initialState, seed: header.seed }) : null,
    sourcePaths: input.paths, packetPath: receipt.packet.path, gzipSha256: receipt.packet.sha256, passed: true });
}
const sourceAfter = await sourceIdentity();
if (sourceAfter.hash !== manifest.source.hash) throw Error('完整性审计后源码身份变化');
for (const [file, hash] of Object.entries(manifest.converterHashes)) if (await fileSha(path.join(OUT, file)) !== hash) throw Error('审计后转换器文件与冻结身份不同');
await mutable(path.join(OUT, 'integrity-report.json'), { at: new Date().toISOString(), schema: SCHEMA, sourceHash: manifest.source.hash,
  sourceStable: true, responsePathsVerified: sourcePathsVerified, uniqueResponsesVerified: results.length,
  gzipIntegrityAndReceiptPassed: results.length, accepted: results.filter(r => r.accepted).length, rejected: results.filter(r => !r.accepted).length,
  scope: '全部压缩SHA/CRC、receipt、流结构/状态hash链、mask、原始macro重解码；不冒充额外全量独立规则重放',
  auditorScriptSha256: await fileSha(path.join(OUT, 'integrity.ts')), outputBytes: await outputBytes(), results });
console.log(JSON.stringify({ verified: results.length, accepted: results.filter(r => r.accepted).length, sourcePathsVerified }));
