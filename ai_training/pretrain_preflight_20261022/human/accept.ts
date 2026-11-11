import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../../data_acceptance_20261016/replay/core';
import { loadExclusions } from '../../dual_stream_v2_phase3_20261020/source_loader';
import { sourceIdentity } from '../../dual_stream_v2_phase3_20261020/replay_io';
import { DIR, ROOT, json, readJson, relative, save, sha } from './io';
import { historicalRelations, historicalRoots, inventory, macroRelation, type Fingerprint } from './lineage';
import { compareBaseline, fingerprint, forcedReplay, loadBaseline, parse, strictReplay } from './validation';
import { sealPrefix } from './prefix';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法：node ai_training/run.mjs node --openssl-legacy-provider --import tsx pretrain_preflight_20261022/human/accept.ts [--raw <目录>]');
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--raw')) throw Error('只接受 --raw <目录>');
  const rawDir = args.length ? path.resolve(args[1]) : path.join(DIR, 'raw');
  const at = new Date().toISOString(), runId = at.replaceAll(':', '-').replaceAll('.', '-'), runDir = path.join(DIR, 'runs', runId);
  const downloadPath = path.join(rawDir, 'download_report.json'), downloadBytes = await readFile(downloadPath), download = await readJson(downloadPath);
  const publicSource = await sourceIdentity();
  const toolFiles = ['io.ts', 'lineage.ts', 'validation.ts', 'prefix.ts', 'accept.ts', 'acceptance.test.ts'].map(name => path.join(DIR, name));
  const supportingFiles = ['ai_training/data_acceptance_20261016/replay/core.ts', 'ai_training/dual_stream_v2_phase3_20261020/source_loader.ts',
    'ai_training/dual_stream_v2_phase1_20261020/io.ts', 'tools/aeii_download_finished.py', 'tools/aeii_download_history.py',
    'tools/apk_unit_report.ts', 'tools/apk_terrain_parser.ts'].map(name => path.join(ROOT, name));
  const toolHashes = Object.fromEntries(await Promise.all([...toolFiles, ...supportingFiles].map(async file => [relative(file), sha(await readFile(file))])));
  const history = await inventory(historicalRoots()), current = await inventory([rawDir], [downloadPath]);
  const identity = { publicSource, toolHashes, toolIdentity: digest(toolHashes), historyIdentity: history.identity,
    rawIdentity: current.identity, downloadReportSha256: sha(downloadBytes), node: process.version };
  await save(path.join(runDir, 'source-identity.json'), identity, true);
  await save(path.join(runDir, 'history-inventory.json'), history, true);
  await save(path.join(runDir, 'raw-inventory.json'), current, true);

  const historyFingerprints = new Map<string, Fingerprint>(), currentFingerprints = new Map<string, Fingerprint>();
  const historicalParseErrors: any[] = [], items: any[] = [];
  let baseline: Awaited<ReturnType<typeof loadBaseline>> | null = null, baselineError: string | null = null;
  let exclusion: any = { checked: false, reason: '没有新增响应，无需载入排重状态' }, excluded = new Set<string>();
  if (current.responses.length) {
    try { baseline = await loadBaseline(); } catch (error) { baselineError = error instanceof Error ? error.message : String(error); }
    const splitPath = path.join(ROOT, 'ai_training/dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json');
    const splitBytes = await readFile(splitPath), manifest = await readJson(splitPath);
    excluded = loadExclusions(manifest);
    exclusion = { checked: true, manifest: relative(splitPath), manifestSha256: sha(splitBytes), uniqueStates: excluded.size, sha256: manifest.exclusion.sha256,
      meaning: '沿用阶段3已消费评测状态排重；不把本轮样本登记为独立最终评测' };
    // 只解码历史响应以比较语义内容，不重写历史验收或宣称历史规则重新验收通过。
    for (const old of history.responses) {
      try {
        const parsed = await parse(path.join(ROOT, old.paths[0]));
        if (parsed.sha256 !== old.sha256) throw Error('历史响应在盘点后变化');
        historyFingerprints.set(old.sha256, fingerprint(parsed));
      }
      catch (error) { historicalParseErrors.push({ responseSha256: old.sha256, error: error instanceof Error ? error.message : String(error) }); }
    }
  }
  for (const response of current.responses) {
    const item: any = { responseSha256: response.sha256, bytes: response.bytes, sourcePaths: response.paths, bindings: response.bindings,
      history: historicalRelations(response, history.responses), accepted: false, selected: false, reasons: [] };
    try {
      const file = path.join(ROOT, response.paths[0]), parsed = await parse(file);
      if (parsed.sha256 !== response.sha256) throw Error('解析响应SHA与实存响应不一致');
      const content = fingerprint(parsed); currentFingerprints.set(response.sha256, content);
      item.content = { initialStateHash: content.initialStateHash, rawActionIdentity: content.rawActionIdentity, fullContentIdentity: content.fullContentIdentity };
      item.history.identicalContent = [...historyFingerprints].filter(([, old]) => old.fullContentIdentity === content.fullContentIdentity).map(([hash]) => hash);
      item.history.parentStreamRelations = [...new Set([...item.history.sameHostApiParent, ...item.history.sameApiIdAcrossHosts])]
        .map(hash => ({ responseSha256: hash, ...(historyFingerprints.has(hash) ? macroRelation(historyFingerprints.get(hash)!, content) : { relation: 'historical_decode_unknown' }) }));
      item.scenario = parsed.config.scenarioCode; item.roomStatus = parsed.config.status;
      item.configuredPlayerCount = parsed.stateSummary.activeTeamIds.length;
      item.humanSeats = parsed.stateSummary.activeTeamIds.filter(id => parsed.config.playerTypes[id] === 1);
      item.onlySurrender = parsed.actions.every(record => ['GAME_START', 'NEXT_TURN', 'SURRENDER'].includes(record.eventType));
      item.macroRecords = parsed.actions.length;
      item.baseline = baseline ? compareBaseline(parsed, baseline) : { passed: false, error: baselineError };
      item.forced = forcedReplay(parsed);
      const strict = strictReplay(parsed, excluded), { atoms, ...strictSummary } = strict;
      item.strict = strictSummary;
      if (!strict.success && atoms.length) {
        const packet = await sealPrefix(path.join(runDir, 'prefix', `${response.sha256}.jsonl.gz`), parsed, atoms, strict.failure, excluded);
        item.prefix = { ...packet, path: relative(packet.path), wholeReplayAccepted: false, tailQuarantine: strict.failure };
      }
      if (!['SD', 'SO'].includes(item.scenario)) item.reasons.push('非标准SD/SO场景');
      if (!item.baseline.passed) item.reasons.push('原版资源配置不符或未核验');
      if (!item.strict.success || !item.strict.fullyConsumed) item.reasons.push('strict未完整无损消费');
      if (item.humanSeats.length < 2) item.reasons.push('少于两名真人玩家');
      if (item.onlySurrender || !item.strict.eligiblePolicyActions) item.reasons.push('没有合格策略动作');
      const parentKeys = new Set(response.bindings.map(binding => binding.parentKey));
      if (parentKeys.size !== 1) item.reasons.push('缺少唯一可证API父局映射');
      if (item.history.exactResponse.length) item.reasons.push('与历史响应SHA重复');
      if (item.history.sameHostApiParent.length) item.reasons.push('与历史host及API父局ID重复');
      if (item.history.sameApiIdAcrossHosts.length) item.reasons.push('与历史其他域名API父局ID重复，保守隔离');
      if (item.history.identicalContent.length) item.reasons.push('与历史初态及宏动作内容重复');
      item.accepted = item.reasons.length === 0;
      item.prefixReasons = item.reasons.filter((reason: string) => !['strict未完整无损消费', '没有合格策略动作'].includes(reason));
      if (!item.prefix?.passed || !item.prefix.eligiblePolicyActions) item.prefixReasons.push('没有独立重建核验通过的非end/surrender策略前缀');
      item.prefixCandidate = item.prefixReasons.length === 0;
    } catch (error) { item.reasons.push(error instanceof Error ? error.message : String(error)); }
    items.push(item);
    console.log(json({ completed: items.length, total: current.responses.length, responseSha256: response.sha256, strict: item.strict?.success ?? false,
      forced: item.forced?.success ?? false, policyCandidate: item.accepted, reasons: item.reasons }).trim());
  }
  const sameRunRelations: any[] = [], byParent = new Map<string, any[]>();
  for (const item of items) if (item.accepted || item.prefixCandidate) {
    const key = item.bindings[0].parentKey;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  const selectedContent = new Set<string>();
  for (const [parentKey, versions] of [...byParent].sort(([a], [b]) => a.localeCompare(b))) {
    let divergent = false;
    for (let i = 0; i < versions.length; i++) for (let j = i + 1; j < versions.length; j++) {
      const relation = macroRelation(currentFingerprints.get(versions[i].responseSha256)!, currentFingerprints.get(versions[j].responseSha256)!);
      sameRunRelations.push({ parentKey, leftResponseSha256: versions[i].responseSha256, rightResponseSha256: versions[j].responseSha256, ...relation });
      if (['different_initial_state', 'divergent_macro_stream'].includes(relation.relation)) divergent = true;
    }
    versions.sort((a, b) => b.strict.atomicActions - a.strict.atomicActions || a.responseSha256.localeCompare(b.responseSha256));
    for (let i = 0; i < versions.length; i++) {
      const item = versions[i];
      if (divergent) item.reasons.push('同父局响应分叉，整组隔离');
      else if (i > 0) item.reasons.push('同父局旧版本或相同宏流别名，不重复累计策略动作');
      else if (selectedContent.has(item.content.fullContentIdentity)) item.reasons.push('本次其它父局具有相同初态及宏流，不重复累计');
      else { item.selected = true; selectedContent.add(item.content.fullContentIdentity); }
    }
  }
  for (const item of items) await save(path.join(runDir, 'items', `${item.responseSha256}.json`), item, true);
  const selected = items.filter(item => item.selected && item.accepted), selectedPrefixes = items.filter(item => item.selected && item.prefixCandidate);
  const historyUnbound = history.responses.filter(response => !response.bindings.length).length;
  const sum = (key: string) => selected.reduce((n, item) => n + Number(item.strict[key] ?? 0), 0);
  const bindings = current.responses.flatMap(response => response.bindings);
  const counts = { downloadedResponsesDeclared: download.downloads?.length ?? 0, actualRawResponseFiles: current.files,
    uniqueRawResponses: current.responses.length, extraRawAliases: current.files - current.responses.length,
    responsesWithVerifiedApiBinding: current.responses.filter(response => response.bindings.length).length,
    provedApiParentsInDownload: new Set(bindings.map(binding => binding.parentKey)).size,
    historicalUniqueResponses: history.responses.length, historicalVerifiedApiParents: new Set(history.responses.flatMap(response => response.bindings.map(binding => binding.parentKey))).size,
    historicalResponsesWithoutApiProof: historyUnbound, historicalExactResponseDuplicates: items.filter(item => item.history.exactResponse.length).length,
    historicalSameHostParentDuplicates: items.filter(item => item.history.sameHostApiParent.length).length,
    historicalCrossHostIdMatches: items.filter(item => item.history.sameApiIdAcrossHosts.length).length,
    historicalIdenticalContentDuplicates: items.filter(item => item.history.identicalContent?.length).length,
    forcedPassedResponses: items.filter(item => item.forced?.success).length, strictPassedResponses: items.filter(item => item.strict?.success).length,
    newQualifiedResponsesBeforeParentDedup: items.filter(item => item.accepted).length, wholeReplayAdmittedParents: selected.length,
    prefixCandidateResponsesBeforeParentDedup: items.filter(item => item.prefixCandidate).length, selectedPrefixPolicyParents: selectedPrefixes.length,
    selectedNewPolicyParents: selected.length + selectedPrefixes.length,
    independentNewParentsVersusEntireHistory: historyUnbound || historicalParseErrors.length ? null : selected.length + selectedPrefixes.length,
    newQualifiedWholePolicyActions: sum('eligiblePolicyActions'), newQualifiedPrefixPolicyActions: selectedPrefixes.reduce((n, item) => n + item.prefix.eligiblePolicyActions, 0),
    newQualifiedPolicyActions: sum('eligiblePolicyActions') + selectedPrefixes.reduce((n, item) => n + item.prefix.eligiblePolicyActions, 0),
    newQualifiedHumanControllerPolicyActions: sum('eligibleHumanPolicyActions') + selectedPrefixes.reduce((n, item) => n + item.prefix.eligibleHumanPolicyActions, 0),
    strictVerifiedPrefixAtomicActions: selectedPrefixes.reduce((n, item) => n + item.prefix.atomicActions, 0),
    selectedStrictAtomicActions: sum('atomicActions'), selectedStrictNonSurrenderActions: sum('policyActions'),
    excludedPreviouslyConsumedPolicyStates: sum('excludedPreviouslyConsumedStates') + selectedPrefixes.reduce((n, item) => n + item.strict.excludedPreviouslyConsumedStates, 0),
    trivialPolicyActions: sum('trivialPolicyActions') + selectedPrefixes.reduce((n, item) => n + item.strict.trivialPolicyActions, 0),
    projectRuleTerminalNonSurrenderParents: selected.filter(item => item.strict.outcome.projectCategory === 'rule_terminal_non_surrender').length,
    projectSurrenderTerminalParents: selected.filter(item => item.strict.outcome.projectCategory === 'seat_surrender_terminal').length,
    projectIncompletePrefixParents: selected.filter(item => item.strict.outcome.projectCategory === 'incomplete_prefix').length,
    reliableNaturalTerminalParents: 0, valueEligibleActions: 0 };
  const sourceAfter = await sourceIdentity();
  if (sourceAfter.hash !== publicSource.hash || sha(await readFile(downloadPath)) !== identity.downloadReportSha256) throw Error('验收期间公共源码或下载报告变化，不能封存本次结论');
  if ((await inventory(historicalRoots())).identity !== history.identity) throw Error('验收期间历史原始响应或下载清单变化，不能封存排重结论');
  for (const response of current.responses) for (const file of response.paths) if (sha(await readFile(path.join(ROOT, file))) !== response.sha256) throw Error('验收期间原始响应变化');
  for (const [file, expected] of Object.entries(toolHashes)) if (sha(await readFile(path.join(ROOT, file))) !== expected) throw Error('验收期间工具源码变化');
  const status = !current.responses.length && (!download.complete || download.errors?.length) ? 'download_blocked_no_actual_new_response'
    : !current.responses.length ? 'no_actual_new_response_in_this_download' : 'new_responses_audited';
  const index = { schema: 'human_pretrain_preflight_20261022_v1', generatedAt: new Date().toISOString(), status, run: relative(runDir), identity,
    download: { path: relative(downloadPath), host: download.host, complete: download.complete, tlsVerified: download.tls_verified, pages: download.pages,
      errors: download.errors ?? [], historySkipped: download.skipped_verified_history?.length ?? 0,
      scope: '本次账号可见的已结束对局列表，不代表全服务器私有数据或全服务器无新增对局' }, counts,
    baseline: baseline?.evidence ?? { checked: false, reason: baselineError ?? '没有实际响应，未运行原始资源检查' }, exclusion,
    historicalCoverage: { inventory: relative(path.join(runDir, 'history-inventory.json')), invalidBindings: history.invalidBindings,
      parsedForContentDedup: historyFingerprints.size, parseErrors: historicalParseErrors,
      independence: 'host+API ID绑定证明API父局标识分组；历史无API映射响应及跨域迁移不允许冒称统计独立整局' },
    invalidNewBindings: current.invalidBindings, sameRunRelations, items,
    selectedPolicySources: selected.map(item => ({ responseSha256: item.responseSha256, paths: item.sourcePaths, parentKey: item.bindings[0].parentKey,
      host: item.bindings[0].host, apiIdHash: item.bindings[0].apiIdHash, scenario: item.scenario, policyActions: item.strict.eligiblePolicyActions,
      valueMask: false, returnMask: false, nativeOutcomeVerified: false, trainingStarted: false })),
    selectedPrefixPolicySources: selectedPrefixes.map(item => ({ responseSha256: item.responseSha256, paths: item.sourcePaths, parentKey: item.bindings[0].parentKey,
      host: item.bindings[0].host, apiIdHash: item.bindings[0].apiIdHash, scenario: item.scenario, packet: item.prefix,
      wholeReplayAccepted: false, trainingStarted: false, tailQuarantined: true, valueMask: false, returnMask: false })),
    labels: { valueMask: false, returnMask: false, nativeOutcomeVerified: false, forcedAdmitsPolicy: false,
      wholeReplayRequiresStrictComplete: true, prefixPolicyRequiresIndependentStrictMappingAndStateChain: true, historicalAndSameParentAliasesCountOnce: true },
    limitations: ['strict只证明保存的动作前缀兼容当前权威规则，不能证明APK逐状态等价或不存在运行时MOD。',
      'forced单独执行并记录，不替代strict策略准入；不通过放宽全局规则接纳分歧样本。',
      'CLOSED不证明自然胜负；项目规则终局与可信APK自然终局分别计数，本次没有原生终局见证，Value始终关闭。',
      '早期无API元数据的历史响应无法全量证明跨批父局独立；不能用唯一SHA、内嵌不透明ID或内容差异替代父局证明。',
      '只验收本次独立目录的新增数据，没有启动训练或改写历史目录。'] };
  const markdown = `# 真人新增数据验收\n\n生成时间：${index.generatedAt}。状态：\`${status}\`。\n\n` +
    `本次下载声明${counts.downloadedResponsesDeclared}份响应；实存${counts.actualRawResponseFiles}份文件、${counts.uniqueRawResponses}份唯一SHA；可核对host/API ID的父局标识${counts.provedApiParentsInDownload}个。下载完成=${download.complete}，TLS验证=${download.tls_verified}。\n\n` +
    `历史实存唯一响应${counts.historicalUniqueResponses}份；同SHA重复${counts.historicalExactResponseDuplicates}，同host/API父局重复${counts.historicalSameHostParentDuplicates}，跨host同API标识${counts.historicalCrossHostIdMatches}，初态与宏流内容相同${counts.historicalIdenticalContentDuplicates}。\n\n` +
    `forced通过${counts.forcedPassedResponses}/${counts.uniqueRawResponses}，strict完整无损通过${counts.strictPassedResponses}/${counts.uniqueRawResponses}，完整回放准入${counts.wholeReplayAdmittedParents}组。独立重建核验后的前缀准入${counts.selectedPrefixPolicyParents}组、${counts.strictVerifiedPrefixAtomicActions}个原子；前缀合格策略动作${counts.newQualifiedPrefixPolicyActions}，完整回放合格策略动作${counts.newQualifiedWholePolicyActions}，合计${counts.newQualifiedPolicyActions}（真人控制者${counts.newQualifiedHumanControllerPolicyActions}）。前缀策略已剔除end_turn、surrender、平凡决策和阶段3已消费评测状态。\n\n` +
    `| 响应SHA前12位 | forced | strict首个隔离边界（0起） | 已验证前缀原子 | 前缀合格策略 | 原因 |\n|---|---:|---|---:|---:|---|\n` +
    items.map(item => `| ${item.responseSha256.slice(0, 12)} | ${item.forced?.success ?? false} | macro=${item.strict?.failure?.macro ?? '-'}, sub=${item.strict?.failure?.subAction ?? '-'}, atomic=${item.strict?.failure?.atomic ?? '-'} | ${item.prefix?.atomicActions ?? 0} | ${item.prefix?.eligiblePolicyActions ?? 0} | ${(item.strict?.failure?.message ?? item.reasons.join('；')).replaceAll('|', '/')} |`).join('\n') + '\n\n' +
    `可证明与全部历史独立的新增父局数：${counts.independentNewParentsVersusEntireHistory === null ? '未知' : counts.independentNewParentsVersusEntireHistory}。历史${historyUnbound}份响应缺少API父局证明；解码失败${historicalParseErrors.length}份。可证API父局分组与统计独立完整对局不能互换。\n\n` +
    `项目规则非投降终局${counts.projectRuleTerminalNonSurrenderParents}组、投降终局${counts.projectSurrenderTerminalParents}组、未终局前缀${counts.projectIncompletePrefixParents}组。可信APK自然终局父局${counts.reliableNaturalTerminalParents}；Value合格动作${counts.valueEligibleActions}。所有Value/return mask=false。\n\n` +
    (status === 'download_blocked_no_actual_new_response' ? `下载受阻：${(download.errors ?? []).join('；')}。没有实际新响应，不能据此声称服务器没有新对局。\n\n` : '') +
    `逐响应结果、源码/资源/输入SHA、历史身份和隔离原因见[索引](HUMAN_DATA_INDEX.json)及本次[runs证据](${relative(runDir).replace('ai_training/pretrain_preflight_20261022/', '')}/source-identity.json)。\n\n` +
    `命令（项目根目录）：\n\n\`\`\`powershell\nnode ai_training/run.mjs node --openssl-legacy-provider --import tsx pretrain_preflight_20261022/human/accept.ts\nnode ai_training/run.mjs node --openssl-legacy-provider --import tsx --test pretrain_preflight_20261022/human/acceptance.test.ts\n\`\`\`\n\n` +
    index.limitations.map(line => `- ${line}`).join('\n') + '\n';
  await save(path.join(runDir, 'result.json'), index, true);
  const prefixIndex = { schema: 'human_strict_prefix_policy_index_v1', generatedAt: index.generatedAt, run: index.run,
    sourceIdentity: identity, entries: index.selectedPrefixPolicySources, counts: { parents: selectedPrefixes.length,
      verifiedAtoms: counts.strictVerifiedPrefixAtomicActions, policyActions: counts.newQualifiedPrefixPolicyActions },
    filters: { excludeEndTurn: true, excludeSurrender: true, excludeTrivial: true, excludeHistoricalEvaluationStates: true },
    valueMask: false, returnMask: false, nativeOutcomeVerified: false, wholeReplayAdmittedParents: counts.wholeReplayAdmittedParents };
  await save(path.join(runDir, 'prefix-index.json'), prefixIndex, true);
  await save(path.join(DIR, 'PREFIX_POLICY_INDEX.json'), prefixIndex);
  await save(path.join(runDir, 'REPORT.md'), markdown, true);
  await save(path.join(DIR, '..', 'HUMAN_DATA_INDEX.json'), index);
  await save(path.join(DIR, '..', 'HUMAN_DATA_REPORT.md'), markdown);
  console.log(json({ status, counts, index: relative(path.join(DIR, '..', 'HUMAN_DATA_INDEX.json')) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
