import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseRemoteReplay } from '../../../tools/apk_game_get_validate';
import { canonical, sha256 } from './core';
import { ROOT, OUT, fileSha, mutable, sourceIdentity } from './io';

const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
const integrity = JSON.parse(await readFile(path.join(OUT, 'integrity-report.json'), 'utf8'));
if (integrity.uniqueResponsesVerified !== manifest.uniqueResponses || (await sourceIdentity()).hash !== manifest.source.hash) throw Error('完整性或源码身份尚未验收');
const metadataPath = 'captures/cloud/20260918_053030/download_report.json';
const metadataReadAt = new Date().toISOString(), metadataBytes = await readFile(path.join(ROOT, metadataPath));
const metadataHash = sha256(metadataBytes), metadataStat = await stat(path.join(ROOT, metadataPath));
const firstMetadataIdentity = JSON.parse(await readFile(path.join(OUT, 'metadata-identity.json'), 'utf8'));
if (firstMetadataIdentity.sha256 !== metadataHash || firstMetadataIdentity.bytes !== metadataBytes.length) throw Error('下载metadata与首次固化身份不同');
const downloaderEvidence = [
  { path: 'tools/aeii_download_finished.py', expectedSha256: '8119ad8856fa443613cccabacc4118769541dd23f3ea5d966d0f0e0c1827e49c',
    lines: [79, 80, 92, 99, 106, 108, 109], meaning: '列表对象id经同一game_id变量传入/api/game_get请求和download_report.id；文件名为该ID的SHA256前24位' },
  { path: 'tools/mitm_aeii_token_capture.py', expectedSha256: '6a5a467bfdde3f0641a828001e96222feb9b0cc3b618d1bad1cd5abb6b5d0a47',
    lines: [15, 17], meaning: 'load_helpers读取mitm_aeii_replay_dump.py实现' },
  { path: 'tools/mitm_aeii_replay_dump.py', expectedSha256: '26aa1c48592e4d02a3921d4ea5c45237267fdf985253c15518dcff5f0e252205',
    lines: [253, 258], meaning: 'encode_game_get_request将game_id写入请求i字段' },
];
for (const row of downloaderEvidence) if (await fileSha(path.join(ROOT, row.path)) !== row.expectedSha256) throw Error('下载器证据源码身份发生变化');
const downloads = JSON.parse(metadataBytes.toString('utf8')).downloads;
const byResponse = new Map(integrity.results.map((r: any) => [r.responseSha256, r]));
const apiBindings = [];
for (const row of downloads) {
  if (typeof row.id !== 'string' || typeof row.sha256 !== 'string') throw Error('下载清单缺少可证API ID或响应SHA');
  const input = manifest.inputs.find((r: any) => r.sha256 === row.sha256);
  if (!input || input.bytes !== row.bytes) throw Error('下载清单响应身份与本次输入不符');
  if (row.file !== `game_get_${sha256(Buffer.from(row.id, 'utf8')).slice(0, 24)}.bin`) throw Error('下载文件名与源码的API ID散列规则不同');
  apiBindings.push({ apiGameIdHash: sha256(Buffer.from(row.id, 'utf8')), responseSha256: row.sha256,
    sourcePaths: input.paths, declaredBytes: row.bytes, metadataPath, metadataSha256: metadataHash });
}
const byApi = new Map<string, any[]>();
for (const row of apiBindings) byApi.set(row.apiGameIdHash, [...(byApi.get(row.apiGameIdHash) ?? []), row]);
const prefixRelations = [];
for (const [apiGameIdHash, bindings] of byApi) {
  const unique = [...new Set(bindings.map(r => r.responseSha256))];
  for (let i = 0; i < unique.length; i++) for (let j = i + 1; j < unique.length; j++) {
    const pair = [];
    for (const sha of [unique[i], unique[j]]) {
      const row: any = byResponse.get(sha), file = row.sourcePaths[0];
      const parsed = await parseRemoteReplay(path.join(ROOT, file), { inputs: [], rootDir: '', outPath: null, json: false, mode: row.mode,
        maxRecords: 100000, offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true,
        allowAmbiguousRecruit: false, strictTerrain: true, forceExecuteReplayActions: false });
      pair.push(parsed.actions);
    }
    let common = 0;
    while (common < Math.min(pair[0].length, pair[1].length) && canonical(pair[0][common]) === canonical(pair[1][common])) common++;
    prefixRelations.push({ apiGameIdHash, leftResponseSha256: unique[i], rightResponseSha256: unique[j], commonMacroPrefix: common,
      relation: common === pair[0].length && common === pair[1].length ? 'identical_macro_stream' : common === pair[0].length ? 'left_prefix_of_right' : common === pair[1].length ? 'right_prefix_of_left' : 'divergent_macro_stream' });
  }
}
const boundShas = new Set(apiBindings.map(r => r.responseSha256));
const unknown = integrity.results.filter((r: any) => !boundShas.has(r.responseSha256));
const contentGroups = (key: string) => {
  const groups = new Map<string, any[]>();
  for (const row of integrity.results) if (row[key]) groups.set(row[key], [...(groups.get(row[key]) ?? []), row]);
  return [...groups].filter(([, rs]) => rs.length > 1).map(([hash, rs]) => ({ hash, responses: rs.map(r => r.responseSha256), doesNotProveSameApiGame: true }));
};
const embeddedApiMatches = apiBindings.filter(b => (byResponse.get(b.responseSha256) as any).opaqueEmbeddedObjectIdHash === b.apiGameIdHash).length;
const report = { at: new Date().toISOString(), sourceHash: manifest.source.hash, countingUnit: 'unique_response_sha256_not_independent_games',
  rawPaths: manifest.responsePaths, uniqueResponses: manifest.uniqueResponses,
  exactResponseAliases: manifest.inputs.filter((r: any) => r.paths.length > 1).map((r: any) => ({ responseSha256: r.sha256, paths: r.paths, relation: 'same_response_bytes_and_same_macro_stream' })),
  extraAliasPaths: manifest.responsePaths - manifest.uniqueResponses,
  metadataSnapshot: { path: metadataPath, sha256: metadataHash, bytes: metadataBytes.length, mtime: metadataStat.mtime.toISOString(), firstSnapshotAt: firstMetadataIdentity.capturedAt, readAt: metadataReadAt, downloads: downloads.length },
  downloaderEvidence, downloaderEvidenceReadAt: metadataReadAt,
  filenameSemantics: 'cloud文件名game_get_<24hex>.bin中的24hex是API ID的SHA256截断，不等于原API ID；145条均按下载器规则核对',
  apiMappedResponses: boundShas.size, identifiedApiFamilies: byApi.size, unknownApiFamilyResponses: unknown.length,
  knownApiIdDifferentResponseVersions: [...byApi].filter(([, rs]) => new Set(rs.map(r => r.responseSha256)).size > 1).length,
  sameApiVersionScope: '仅限有download_report API ID映射的响应；July未知映射，不能排除跨批同父局不同版本',
  opaqueEmbeddedObjectIdDistinct: new Set(integrity.results.map((r: any) => r.opaqueEmbeddedObjectIdHash).filter(Boolean)).size,
  embeddedObjectIdMatchesKnownApiId: embeddedApiMatches,
  opaqueHeaderCorrection: '冻结header.identity.gameIdHash与receipt.lineage保留旧字段名，侧车称opaqueEmbeddedObjectIdHash；cloud逐响应与实际API请求ID的hash核对，July无API元数据映射保持unknown，不能泛化为全部父局证明',
  independentGameCount: null, independentGameCountStatus: '未证实；API标识组、唯一响应与统计独立完整对局不可互换',
  prefixRelations,
  families: [...byApi].map(([apiGameIdHash, rows]) => ({ apiGameIdHash, proof: 'download_report.id_hash_bound_to_response_sha256',
    metadataSha256: metadataHash, responses: [...new Set(rows.map(r => r.responseSha256))].map(sha => {
      const r: any = byResponse.get(sha); return { responseSha256: sha, sourcePaths: r.sourcePaths, responseSchemaVersion: r.responseSchemaVersion,
        originalMacroRecords: r.originalMacroRecords, rawActionIdentity: r.rawActionIdentity, initialSeedIdentity: r.initialSeedIdentity,
        opaqueEmbeddedObjectIdHash: r.opaqueEmbeddedObjectIdHash, sourceTraceAccepted: r.accepted };
    }) })),
  unknownFamilies: unknown.map((r: any) => ({ responseSha256: r.responseSha256, sourcePaths: r.sourcePaths,
    opaqueEmbeddedObjectIdHash: r.opaqueEmbeddedObjectIdHash, rawActionIdentity: r.rawActionIdentity, originalMacroRecords: r.originalMacroRecords,
    apiFamilyStatus: 'unknown', independentEvaluationLineageAccepted: false })),
  crossResponseExactMacroContent: contentGroups('rawActionIdentity'), crossResponseExactInitialSeed: contentGroups('initialSeedIdentity'),
  futureEvaluation: '本库全部合格来源归属train；谱系未知来源不能作为将来严格独立评测的证明或独立评测样本' };
if (await fileSha(path.join(ROOT, metadataPath)) !== metadataHash) throw Error('下载metadata在读取期间改变');
for (const row of downloaderEvidence) if (await fileSha(path.join(ROOT, row.path)) !== row.expectedSha256) throw Error('下载器证据源码在读取期间变化');
await mutable(path.join(OUT, 'families.json'), report);
console.log(JSON.stringify({ responses: report.uniqueResponses, apiFamilies: report.identifiedApiFamilies, unknown: report.unknownApiFamilyResponses, independentGameCount: null }));
