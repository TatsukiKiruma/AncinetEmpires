import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { OUT, mutable, sourceIdentity, fileSha, outputBytes } from './io';
import { hasPolicyRows, pureSurrender, PURE_SURRENDER_POLICY } from './release_contract';

const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
const summary = JSON.parse(await readFile(path.join(OUT, 'summary.json'), 'utf8'));
const integrity = JSON.parse(await readFile(path.join(OUT, 'integrity-report.json'), 'utf8'));
const families = JSON.parse(await readFile(path.join(OUT, 'families.json'), 'utf8'));
if (summary.status !== 'COMPLETE' || summary.completed !== manifest.uniqueResponses || integrity.uniqueResponsesVerified !== manifest.uniqueResponses) throw Error('全量转换或完整性验收尚未结束');
if ((await sourceIdentity()).hash !== manifest.source.hash) throw Error('汇总前公共源码身份变化');
const receipts = await Promise.all(manifest.inputs.map(async (r: any) => JSON.parse(await readFile(path.join(OUT, 'receipts', `${r.sha256}.json`), 'utf8'))));
const accepted = receipts.filter(r => r.accepted);
const integrityByResponse = new Map(integrity.results.map((r: any) => [r.responseSha256, r]));
const configuredCount = (r: any) => (integrityByResponse.get(r.responseSha256) as any).configuredPlayerTypes.filter((t: number) => t > 0).length;
const playerConfigChecks = integrity.results.map((r: any) => {
  if (!Array.isArray(r.configuredPlayerTypes) || r.configuredPlayerTypes.some((t: number) => ![0, 1, 2].includes(t))) throw Error('本批配置玩家类型超出已核实的空席/真人/电脑范围');
  const configured = r.configuredPlayerTypes.map((t: number, i: number) => t > 0 ? i : -1).filter((i: number) => i >= 0);
  if (JSON.stringify(configured) !== JSON.stringify(r.configuredActiveTeamIds)) throw Error('本批导入器队伍集合与实际配置不同，须分开验收');
  return { responseSha256: r.responseSha256, configuredEnabledTeamIds: configured, configuredPlayerCount: configured.length,
    configuredPlayerTypes: r.configuredPlayerTypes, scenario: r.scenario, importerTeamIdsMatchConfigured: true };
});
await mutable(path.join(OUT, 'player-config-verification.json'), { at: new Date().toISOString(),
  integrityReportSha256: await fileSha(path.join(OUT, 'integrity-report.json')), passed: true,
  definition: '按实际配置playerTypes>0启用席位；另核对本批导入器teamIds集合一致，不从地图名推断', results: playerConfigChecks });
const firstProduct = accepted.filter(r => r.scenario === 'SD' && configuredCount(r) === 2);
const apiFamilies = new Map(families.families.flatMap((f: any) => f.responses.map((r: any) => [r.responseSha256, f.apiGameIdHash])));
const lineageFields = (r: any) => ({ opaqueEmbeddedObjectIdHash: r.lineage, apiGameIdHash: apiFamilies.get(r.responseSha256) ?? null,
  apiFamilyProof: apiFamilies.has(r.responseSha256) ? 'download_report_id_bound_to_response_sha256' : 'unknown', independentEvaluationLineageAccepted: false });
const sum = (rows: any[], key: string) => rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);
const count = (rows: any[], key: string) => Object.fromEntries([...new Set(rows.map(r => String(r[key])))].map(k => [k, rows.filter(r => String(r[key]) === k).length]));
const mergeCounts = (key: string) => {
  const totals: Record<string, number> = {}, games: Record<string, number> = {};
  for (const r of accepted) for (const [name, n] of Object.entries(r.counts[key] as Record<string, number>)) { totals[name] = (totals[name] ?? 0) + n; if (n) games[name] = (games[name] ?? 0) + 1; }
  return { actions: totals, games };
};
const final = { at: new Date().toISOString(), schema: manifest.schema, sourceHash: manifest.source.hash,
  countingUnit: 'unique_response_sha256_not_independent_games', independentGameCount: null,
  familyIdentity: { identifiedApiFamilies: families.identifiedApiFamilies, unknownApiFamilyResponses: families.unknownApiFamilyResponses,
    knownApiIdDifferentResponseVersions: families.knownApiIdDifferentResponseVersions, metadataSnapshot: families.metadataSnapshot,
    opaqueHeaderCorrection: families.opaqueHeaderCorrection, sidecar: 'families.json' },
  converterIdentity: manifest.converterIdentity, aggregateScriptSha256: await fileSha(path.join(OUT, 'aggregate.ts')),
  scope: '本次真实响应全部转换；合格policy候选全用于未来训练候选，不从此库保留最终验收集',
  rawPaths: manifest.responsePaths, uniqueResponses: manifest.uniqueResponses, completeReceipts: receipts.length,
  totalInputMacros: sum(receipts, 'totalMacros'), totalExecutedMacros: sum(receipts, 'completedMacros'),
  acceptedGames: accepted.length, rejectedGames: receipts.length - accepted.length, acceptedMacros: sum(accepted, 'totalMacros'),
  acceptedAtomicActions: sum(accepted, 'atomicActions'), acceptedPolicyRows: sum(accepted, 'policyRows'),
  policyLabelEligibleGames: accepted.filter(hasPolicyRows).length, policyLabelEligibleRows: sum(accepted, 'policyRows'),
  zeroPolicySourceGames: accepted.filter(r => !hasPolicyRows(r)).length, pureSurrenderSourceGames: accepted.filter(pureSurrender).length,
  maskedSurrenderRows: accepted.reduce((n, r) => n + (r.counts.actions.surrender ?? 0), 0),
  mixedSurrenderPrefixSources: accepted.filter(r => hasPolicyRows(r) && (r.counts.actions.surrender ?? 0) > 0).length,
  pureSurrenderPolicy: PURE_SURRENDER_POLICY,
  modelSchemaAccepted: false, policyGateSatisfied: false, trainingAuthorized: false,
  nativeIntermediateStateCompared: false, nativeJavaCandidateOracleCompared: false,
  modelSchemaStatus: '待具体网络的完整状态/观测编码、候选特征、有序语义与TS/Python前向验收；不能直接接旧34通道模型',
  firstProductTwoPlayerSD: { sourceTraces: firstProduct.length, policySources: firstProduct.filter(hasPolicyRows).length,
    policyRows: sum(firstProduct, 'policyRows'), atomicActions: sum(firstProduct, 'atomicActions'), valueRows: 0 },
  rejectedPrefixAtomicActions: sum(receipts.filter(r => !r.accepted), 'atomicActions'),
  originalNativeOutcomeValueEligibleRows: 0, valueMask: false, returnMask: false,
  acceptedByScenario: count(accepted, 'scenario'), projectOutcomes: count(accepted.map(r => r.outcome), 'projectCategory'),
  projectWinners: count(accepted.map(r => r.outcome), 'projectWinner'), acceptedWithSeatSurrender: accepted.filter(r => r.outcome.seatSurrenders.length).length,
  seatSurrenderEvents: accepted.reduce((n, r) => n + r.outcome.seatSurrenders.length, 0), personalAccountExitVerifiedGames: 0,
  actions: mergeCounts('actions'), macroEvents: mergeCounts('macroEvents'), actorClasses: mergeCounts('actorClasses'), controllers: mergeCounts('controllers'),
  compressedPacketBytes: sum(receipts.map(r => r.packet), 'bytes'), directoryBytes: await outputBytes(), workerElapsedMs: sum(receipts, 'elapsedMs'),
  acceptedRejectionsNeverMixed: true, allAcceptedStrictWithoutForced: accepted.every(r => r.evidence.forced === false && r.evidence.terminalIgnored === 0 && r.fullyConsumed),
  independentEvaluation: { generatedGames: 0, trainingHoldoutFromThisCorpus: 0, protocolOnly: true,
    requirements: ['新增原始父局血缘且未进入训练/开发/教师选择', '地图分布与座位/联盟预注册；已知地图新父局与未见地图主张分开', '冻结模型和源码后一次性评测', '自然终局、投降、截断与运行错误分开', '公平每决策和整局预算，报告胜率区间及动作效率'] },
  rejected: receipts.filter(r => !r.accepted).map(r => ({ responseSha256: r.responseSha256, scenario: r.scenario, totalMacros: r.totalMacros,
    completedMacros: r.completedMacros, atomicActions: r.atomicActions, rejection: r.rejection, packet: r.packet })),
  qualification: '通过当前TS规则态/严格原子动作/候选顺序和全部压缩完整性验收的policy候选；不冒充APK全状态等价、原生value真值或具体模型编码器验收' };
Object.assign(final, { sourceAdmission: receipts.map(r => ({ responseSha256: r.responseSha256, ...lineageFields(r),
  configuredPlayerCount: configuredCount(r), scenario: r.scenario,
  sourceTraceAccepted: r.accepted, policyLabelEligible: hasPolicyRows(r), policyRows: r.policyRows, modelSchemaAccepted: false, policyGateSatisfied: false,
  assignedPartition: r.accepted ? 'train' : 'quarantine', trainingAuthorized: false, valueLabelEligible: false })) });
await mutable(path.join(OUT, 'final-summary.json'), final);
await mutable(path.join(OUT, 'policy-release-index.json'), { at: final.at, schema: 'replay_policy_release_v1', sourceHash: manifest.source.hash,
  converterIdentity: manifest.converterIdentity, policyContract: PURE_SURRENDER_POLICY,
  nativeIntermediateStateCompared: false, nativeJavaCandidateOracleCompared: false,
  modelSchemaAccepted: false, policyGateSatisfied: false, trainingAuthorized: false, valueMask: false, returnMask: false,
  qualification: '仅来源层policy标签候选索引；不是已通过具体网络输入验收的训练数据',
  requiredRowFilter: 'policyRecordEligible(row, receipt.accepted): kind=atomic且action.type!=surrender且labels.policyMask=true',
  candidateSources: accepted.filter(hasPolicyRows).map(r => ({ responseSha256: r.responseSha256, ...lineageFields(r), packet: r.packet, policyRows: r.policyRows, assignedPartition: 'train',
    configuredPlayerCount: configuredCount(r), scenario: r.scenario })),
  emptyPolicySources: accepted.filter(r => !hasPolicyRows(r)).map(r => ({ responseSha256: r.responseSha256, assignedPartition: 'train', sourceTraceAccepted: true,
    reason: pureSurrender(r) ? 'PURE_SURRENDER_POLICY' : 'NO_UNMASKED_POLICY_ROWS', policyRows: 0 })),
  quarantineSources: receipts.filter(r => !r.accepted).map(r => ({ responseSha256: r.responseSha256, assignedPartition: 'quarantine', policyRows: 0, reason: r.rejection })) });
console.log(JSON.stringify({ accepted: final.acceptedGames, rejected: final.rejectedGames, atomic: final.acceptedAtomicActions, policy: final.acceptedPolicyRows, MiB: final.compressedPacketBytes / 1024 ** 2 }));
