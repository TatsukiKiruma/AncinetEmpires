/** 只读取既有文件并做算术统计；禁止导入引擎、模型或任何设备工具。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../..');
const evidence = new Map();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function read(p) {
  const full = path.resolve(ROOT, p), b = fs.readFileSync(full);
  evidence.set(path.relative(ROOT, full).replaceAll('\\', '/'), { sha256: sha(b), bytes: b.length });
  return b;
}
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const lines = p => read(p).toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2) + '\n');
function stats(a) {
  a = a.filter(Number.isFinite).sort((x, y) => x - y);
  const q = f => a[Math.max(0, Math.ceil(a.length * f) - 1)] ?? null;
  return { n: a.length, mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, p50: q(.5), p95: q(.95), max: q(1) };
}
function counts(a) { const r = {}; for (const x of a) r[x] = (r[x] ?? 0) + 1; return r; }
function wilson(w, n) {
  const z = 1.959963984540054, p = w / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [c - h, c + h];
}
const trainRoot = 'ai_training/phone_2m_continue414_20261027';
const receipt = json(`${trainRoot}/SYNC_2414.json`);
const receiptChecks = receipt.files.map(f => ({ path: f.relativePath, expected: f.sha256, actual: sha(read(f.local)) }));
write('DELIVERY_CHECK.json', { scope: '本地46文件逐字节摘要；不是手机查询、规则检查或重放', count: receiptChecks.length, passed: receiptChecks.every(x => x.expected === x.actual), files: receiptChecks });
const meta = json(`${trainRoot}/completion/job/output/final.json`);
const bin = read(`${trainRoot}/completion/job/output/final.bin`);
const tensorStats = meta.tensors.map(t => {
  let sq = 0, maximum = 0, nonfinite = 0;
  for (let i = 0; i < t.length; i++) { const v = bin.readFloatLE((t.offset + i) * 4); if (!Number.isFinite(v)) nonfinite++; else { sq += v * v; maximum = Math.max(maximum, Math.abs(v)); } }
  return { name: t.name, shape: t.shape, parameters: t.length, l2: Math.sqrt(sq), maxAbs: maximum, nonfinite };
});
write('WEIGHT_METADATA.json', { model: meta.model, architecture: meta.architecture, parameters: meta.parameters, bytes: bin.length, summedTensorParameters: tensorStats.reduce((a, b) => a + b.parameters, 0), nonfinite: tensorStats.reduce((a, b) => a + b.nonfinite, 0), inferenceExecuted: false, tensors: tensorStats });

const stageDefs = [
  ['100', 'phone_2m_scratch100_20261024/completion/output'],
  ['1000', 'phone_2m_continue900_20261024/completion/job/output'],
  ['2000', 'phone_2m_continue1000_20261025/completion/job/output'],
  ['2414', 'phone_2m_continue414_20261027/completion/job/output'],
];
function lossSummary(rows) {
  const samples = rows.reduce((n, r) => n + (r.samples ?? r.batchSamples), 0);
  const avg = key => rows.reduce((s, r) => s + r[key] * (r.samples ?? r.batchSamples), 0) / samples;
  return { updates: rows.length, samples, policyLossSampleWeighted: avg('policyLoss'), valueLossSampleWeighted: avg('valueLoss'), gradientNorm: stats(rows.map(r => r.gradientNorm)), clipFraction: rows.filter(r => r.gradientNorm > 1).length / rows.length, nextLrFirst: rows[0]?.nextLearningRate, nextLrLast: rows.at(-1)?.nextLearningRate };
}
const learning = stageDefs.map(([stage, p]) => {
  const all = lines(`ai_training/${p}/METRICS.jsonl`), steps = new Map();
  const duplicateDetails = [];
  for (const r of all) {
    const key = r.globalStep ?? r.global_step, old = steps.get(key);
    if (old) duplicateDetails.push({ globalStep:key, sameLoss:old.policyLoss===r.policyLoss&&old.valueLoss===r.valueLoss, sameCursor:old.cursor===r.cursor });
    steps.set(key, r);
  }
  const rows = [...steps.values()].sort((a, b) => (a.globalStep ?? a.global_step) - (b.globalStep ?? b.global_step));
  const complete = json(`ai_training/${p}/COMPLETE.json`);
  return { stage, logRows: all.length, duplicateGlobalSteps: all.length - rows.length, duplicateDetails, firstStep: rows[0].globalStep ?? rows[0].global_step, lastStep: rows.at(-1).globalStep ?? rows.at(-1).global_step, ...lossSummary(rows), first1000: lossSummary(rows.slice(0, 1000)), last1000: lossSummary(rows.slice(-1000)), deciles: Array.from({length:10}, (_,i) => lossSummary(rows.slice(Math.floor(i*rows.length/10), Math.floor((i+1)*rows.length/10)))), complete };
});
write('LEARNING_CURVE.json', { warning: '逐批训练中损失，不是固定权重开发曲线；各段来源/学习率/实现及恢复时段不同。重复step若存在取最后记录，仅用于描述。', stages: learning });
const split = json('ai_training/phone_2m_scratch100_20261024/SPLIT.json');
const plan = json(`${trainRoot}/PLAN.json`);
const protocol = json(`${trainRoot}/PROTOCOL.json`);
const data = {};
for (const side of ['train', 'dev']) {
  const rows = split[side]; const results = [], missing = [];
  for (const r of rows) {
    const p = path.join(r.directory, 'result.json');
    if (!fs.existsSync(p)) { missing.push(r.parentId); continue; }
    const x = json(p); results.push({ parentId: r.parentId, map: r.map, naturalEnd: x.naturalEnd, truncationReason: x.truncationReason, winner: x.winnerAlliance ?? x.winnerMask });
  }
  data[side] = { representatives: rows.length, maps: counts(rows.map(r => r.map)), expectedAtomicPositions: rows.every(r=>Number.isFinite(r.intendedAtomicPositions)) ? rows.reduce((n,r) => n + r.intendedAtomicPositions,0) : null, macroCounts: stats(rows.map(r => r.actions)), existingProjectStatus: counts(rows.map(r => r.existingProjectStatus)), missingResults: missing, naturalResults: counts(results.map(r => `${r.naturalEnd}/${r.truncationReason ?? 'none'}`)), winnerIdentities: counts(results.map(r => r.winner)) };
}
write('DATA_INVENTORY.json', { sourceParents: split.sourceParents, traceGroups: split.uniqueTraceGroups, excludedGroups: split.excludedGroups.length, excludedParents: split.excludedGroups.reduce((n,r)=>n+r.parentIds.length,0), splitSha256: sha(read('ai_training/phone_2m_scratch100_20261024/SPLIT.json')), data, referenceTotalUpdates: protocol.referenceTotalUpdates, completedStep: learning.at(-1).lastStep, schedulerFraction: learning.at(-1).lastStep/protocol.referenceTotalUpdates, finalSegmentParents: plan.inputs.length });

const arenas = {};
for (const [kind, dir] of [['direct','phone_2414_arena_20261027'], ['search','phone_2414_search_arena_20261027']]) {
  const base = `ai_training/${dir}`, p = json(`${base}/PLAN.json`), identity = json(`${base}/IDENTITY.json`), source = json(`${base}/SOURCE_MANIFEST.json`);
  const runtimeChecks = Object.entries(identity.runtimeFiles).map(([f, expected]) => ({ file: f, expected, actual: sha(read(`${base}/${f}`)) }));
  const sourceChecks = source.files.map(f => ({ file: f.path, expected: f.sha256, actual: fs.existsSync(path.join(ROOT, f.path)) ? sha(read(f.path)) : null }));
  const matches = p.matches.map(slot => {
    const prefix = `${base}/results/matches/${slot.id}`, result = json(`${prefix}/result.json`), logs = lines(`${prefix}/steps.jsonl`);
    const model = logs.filter(r => r.side === 'model'), roots = model.filter(r => r.searchTelemetry && !r.searchTelemetry.queued), queues = model.filter(r => r.searchTelemetry?.queued);
    return { slot, result, initialSha256: sha(read(`${prefix}/initial.json`)), savedRows: logs.length, stepCountMatches: logs.length === result.steps, savedActions: counts(model.map(r => r.action.type)), modelRows: model, roots, queues };
  });
  const buckets = {};
  for (const opponent of ['hard','simple']) {
    const group = matches.filter(m => m.slot.opponent === opponent), model = group.flatMap(m => m.modelRows), roots = group.flatMap(m => m.roots), queues = group.flatMap(m => m.queues);
    const sum = (a,k) => a.reduce((n,r)=>n+(r[k]??0),0), tel = roots.map(r=>r.searchTelemetry);
    const wins = group.filter(m => m.result.classification === 'model_win').length;
    buckets[opponent] = { outcomes: counts(group.map(m=>m.result.classification)), first: counts(group.filter(m=>m.slot.seat===0).map(m=>m.result.classification)), second: counts(group.filter(m=>m.slot.seat===1).map(m=>m.result.classification)), descriptiveWilson95: wilson(wins,group.length), modelMs: stats(model.map(r=>r.totalMs)), totalWallMs: sum(group.map(m=>m.result),'wallMs'), savedActionTypes: counts(model.map(r=>r.action.type)), candidates: stats(model.map(r=>r.candidates)), rootCount: roots.length, queueCount: queues.length, rootMs: stats(roots.map(r=>r.totalMs)), queueMs: stats(queues.map(r=>r.totalMs)), nodes: stats(tel.map(r=>r.nodes)), networkCalls: stats(roots.map(r=>r.networkCalls)), networkCallsTotal: sum(model,'networkCalls'), forwardMsTotal: sum(model,'forwardMs'), rootOver780: roots.filter(r=>r.totalMs>780).length, rootOver1000: roots.filter(r=>r.totalMs>1000).length, selectedUnits: counts(tel.map(r=>r.selectedUnits)), plannedFinalists: counts(tel.map(r=>r.plannedFinalists)), comparedCount: counts(tel.map(r=>r.comparedUnits.length)), budgetSkippedCandidates: sum(tel,'budgetSkippedCandidates'), takeovers: tel.filter(r=>r.takeover).length, vetoes: tel.filter(r=>r.veto).length, retaliationAttempts: sum(tel,'retaliationAttempts'), retaliationComplete: sum(tel,'retaliationComplete'), zeroRootValue: tel.filter(r=>r.rootValue===0).length, nonzeroRootValue: stats(tel.filter(r=>r.rootValue!==0).map(r=>r.rootValue)), terminalRows: group.map(m=>({id:m.slot.id,terminal:m.result.terminal,error:m.result.error})) };
  }
  arenas[kind] = { plan:p, identity, runtimeChecks, sourceChecks, matches: matches.map(({modelRows, roots, queues, ...m})=>m), buckets };
  // 无搜索日志没有networkCalls字段，缺失不能报告为零次前向。
  if (kind === 'direct') for (const b of Object.values(buckets)) b.networkCallsTotal = null;
}
const paired = {};
for (const opponent of ['hard','simple']) {
  const before = arenas.direct.matches.filter(m=>m.slot.opponent===opponent), after = arenas.search.matches.filter(m=>m.slot.opponent===opponent);
  const rows = before.map(a=> { const b=after.find(b=>b.slot.id===a.slot.id); return { id:a.slot.id, sameSlot:JSON.stringify(a.slot)===JSON.stringify(b.slot), sameInitial:a.initialSha256===b.initialSha256, before:a.result.classification, after:b.result.classification }; });
  const improved=rows.filter(r=>r.before==='model_loss'&&r.after==='model_win').length, regressed=rows.filter(r=>r.before==='model_win'&&r.after==='model_loss').length;
  let probability=0, choose=1, n=improved+regressed;
  for(let i=0;i<=Math.min(improved,regressed);i++){ if(i>0)choose=choose*(n-i+1)/i;probability+=choose/(2**n); }
  paired[opponent]={rows,improved,regressed,unchanged:rows.length-improved-regressed,descriptiveExactMcNemarTwoSided:Math.min(1,2*probability),warning:'固定开发面板，样本/地图相关；p值仅作算术描述，不是独立泛化证明'};
}
const shared = arenas.direct.sourceChecks.filter(a=>arenas.search.sourceChecks.some(b=>b.file===a.file));
write('ARENA_STATIC.json', { arenas, paired, sharedSourceCount:shared.length, sharedManifestDifferences:shared.filter(a=>a.expected!==arenas.search.sourceChecks.find(b=>b.file===a.file).expected), replayExecuted:false, causalLimit:'只能核对保存结果及身份，不能从动作日志恢复未保存候选分数、原始value概率或全部搜索树' });
for (const p of [
  'AGENTS.md', 'ai_training/AGENTS.md', 'ai_training/README.md', 'ai_training/status/CURRENT.md',
  'docs/environment/interface.md', 'docs/apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md',
  'ai_training/phone_2m_scratch100_20261024/select.py', 'ai_training/phone_2m_scratch100_20261024/REFERENCE_ORDER.json',
  'ai_training/phone_2m_continue1000_20261025/encoder_stream.ts',
  'ai_training/phone_2m_continue900_20261024/repairs/03/REPAIR_REPORT.json',
  'src/ai_runtime/dual_v3/value_target.ts', 'src/ai_runtime/dual_v3/search_policy.ts',
  'ai_training/human_data_inventory_20261027/REPORT.md',
  'ai_training/human_2m_conversion_20261027/REPORT.md', 'ai_training/human_2m_conversion_20261027/SUMMARY.json',
  'ai_training/human_2m_conversion_20261027/STATE_IDENTITY_ISOLATION.json',
  'ai_training/human_training_decision_20261027/REPORT.md', 'ai_training/human_training_decision_20261027/PROPOSAL.json',
  'ai_training/human_training_decision_20261027/EXPOSURE.json', 'ai_training/human_training_decision_20261027/TWO_PLAYER_DETAIL.json',
  'ai_training/hard_curriculum3000_plan_20261027/REPORT.md', 'ai_training/hard_curriculum3000_execution_20261027/LATEST_SYNC.json',
  'ai_training/hard_curriculum3000_execution_20261027/samsung-v1/REPORT.md',
  'ai_training/phone_2414_search_arena_20261027/COMPARISON_IDENTITY.json',
  'ai_training/phone_2414_search_arena_20261027/REPORT.md', 'ai_training/phone_2414_arena_20261027/REPORT.md',
]) read(p);
write('EVIDENCE_MANIFEST.json', { capturedUtc:new Date().toISOString(), files:[...evidence].map(([p,x])=>({path:p,...x})), execution:{ staticFilesOnly:true, trained:false, modelForward:false, newGames:false, phoneOperations:false, engineImported:false, replay:false, splitModified:false } });
console.log(JSON.stringify({deliveryPassed:receiptChecks.every(x=>x.actual===x.expected),stages:learning.map(({stage,updates,samples,policyLossSampleWeighted,valueLossSampleWeighted,clipFraction,nextLrLast,duplicateGlobalSteps})=>({stage,updates,samples,policyLossSampleWeighted,valueLossSampleWeighted,clipFraction,nextLrLast,duplicateGlobalSteps})),buckets:Object.fromEntries(Object.entries(arenas).map(([k,v])=>[k,v.buckets])),paired},null,2));
