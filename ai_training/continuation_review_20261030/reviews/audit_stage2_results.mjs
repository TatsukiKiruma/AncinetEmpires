import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// 协调者独立静态复核：不训练、不前向、不回放、不读取封存测试预测。
const root = 'C:/code/AncinetEmpires/ai_training/continuation_review_20261030/';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const rows = p => fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
async function hash(p) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(p)) h.update(chunk);
  return h.digest('hex');
}
const request = read(root + 'stage2/REVIEW_REQUEST.json');
assert.equal(request.revision, 6);
for (const [p, h] of [[request.report, request.reportSha256], [request.evidenceManifest, request.evidenceManifestSha256], [request.comparison, request.comparisonSha256]]) assert.equal(await hash(root + p), h);
const manifest = read(root + request.evidenceManifest);
let bytes = 0;
for (const entry of manifest.entries) {
  assert.equal(fs.statSync(entry.path).size, entry.bytes, entry.path);
  assert.equal(await hash(entry.path), entry.sha256, entry.path);
  bytes += entry.bytes;
}
const baseline = read(root + 'stage1/arena-baseline-r2/SUMMARY.json');
const baselineById = new Map(baseline.games.map(g => [g.id, g]));
const baselineRows = rows(root + 'stage1/offline-baseline/samples.jsonl');
const identity = r => JSON.stringify([r.parentId,r.corpus,r.split,r.macro,r.subAction,r.before,r.code]);
function metrics(rs, corpus) {
  const parents = new Map();
  for (const r of rs.filter(r => r.split === 'dev' && r.corpus === corpus)) {
    if (!parents.has(r.parentId)) parents.set(r.parentId, []);
    parents.get(r.parentId).push(r);
  }
  assert.ok(parents.size > 0);
  const mean = field => [...parents.values()].reduce((s, rr) => s + rr.reduce((a,r)=>a+r[field],0)/rr.length,0)/parents.size;
  return {parents:parents.size, nll:mean('policyNll'), brier:mean('brier')};
}
const output = {createdAt:new Date().toISOString(), manifestFiles:manifest.entries.length, manifestBytes:bytes, scope:'完整清单哈希、120局结果文件配对重计、29999条LR复算、终点离线父局等权重算；未执行模型或规则回放', arms:[]};
for (const requested of request.realExecution) {
  const a = read(root + 'stage2/FINAL_AUDIT-' + requested.arm + '.json');
  assert.equal(await hash(a.checkpoint), requested.checkpointSha256);
  const ledger = read(a.closure.budgetLedger);
  assert.equal(ledger.status, 'complete');
  assert.equal(ledger.latestCheckpointSha256, requested.checkpointSha256);
  assert.ok(ledger.consumedWallSeconds <= 14400);
  const mr = a.metricsSegments.flatMap(s => rows(s.path));
  const peak = Number(requested.arm.slice(3));
  const seen = new Set();
  for (const m of mr) {
    assert.ok(!seen.has(m.stageUpdates)); seen.add(m.stageUpdates);
    assert.ok(Number.isFinite(m.loss) && Number.isFinite(m.gradientNorm));
    const i = m.stageUpdates - 1;
    const lr = i < 200 ? peak * (i + 1) / 200 : peak * (0.1 + 0.9 * (1 + Math.cos(Math.PI * (i - 200) / 9800)) / 2);
    assert.ok(Math.abs(m.learningRateUsed-lr) < 1e-12);
  }
  assert.deepEqual(Array.from({length:10000},(_,i)=>i+1).filter(i=>!seen.has(i)),requested.missingMetricUpdates);
  const arena = read(root + 'stage2/ARENA-' + requested.arm + '.json');
  const summary = read(arena.source + '/SUMMARY.json');
  assert.equal(summary.games.length, 40);
  assert.equal(new Set(summary.games.map(g=>g.id)).size,40);
  const wins={hard:0,simple:0}, counts={hard:0,simple:0}, changes=[];
  for (const listed of summary.games) {
    const g=read(arena.source + '/' + listed.id + '/result.json');
    const old=baselineById.get(g.id); assert.ok(old);
    for (const k of ['id','opponent','slot','seat','seed','map','initialSha256','modelPlayer']) assert.equal(g[k],old[k],k);
    assert.equal(g.classification,listed.classification);
    assert.equal(g.natural,true); assert.equal(g.error,null); assert.equal(g.timeForfeit,null);
    counts[g.opponent]++; wins[g.opponent]+=g.classification==='natural_win'?1:g.classification==='natural_draw'?0.5:0;
    if(g.classification!==old.classification) changes.push({id:g.id,map:g.map,category:g.category,from:old.classification,to:g.classification});
  }
  assert.deepEqual(counts,{hard:20,simple:20}); assert.deepEqual(wins,requested.score);
  const rs=rows(a.terminalOffline+'/samples.jsonl');
  assert.deepEqual(rs.map(identity),baselineRows.map(identity));
  const offline={};
  for(const corpus of ['old','new']) offline[corpus]={baseline:metrics(baselineRows,corpus),candidate:metrics(rs,corpus)};
  const o=offline.old,n=offline.new;
  const oldPass=o.candidate.nll<=o.baseline.nll*1.05 && o.candidate.brier<=o.baseline.brier+0.02;
  const newPass=(n.candidate.nll<=n.baseline.nll*0.98 || n.candidate.brier<=n.baseline.brier-0.01) && n.candidate.nll<=n.baseline.nll*1.05 && n.candidate.brier<=n.baseline.brier+0.02;
  assert.equal(oldPass,requested.gates.oldRetention);assert.equal(newPass,requested.gates.newAdaptation);
  const arenaPass=wins.hard>=10 && wins.simple>=15 && wins.hard+wins.simple>=26;
  assert.equal(arenaPass,requested.gates.arena);
  output.arms.push({arm:requested.arm,checkpointSha256:requested.checkpointSha256,wallSeconds:ledger.consumedWallSeconds,metricRows:mr.length,wins,changes,offline,oldPass,newPass,arenaPass});
}
output.passed=true;
fs.writeFileSync(root+'reviews/stage2-results-audit6.json',JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(output,null,2));
